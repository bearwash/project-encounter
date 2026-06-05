import CoreBluetooth
import Foundation
import SwiftRs
import Tauri

private let encounterServiceUuid = CBUUID(string: "4A985948-3BC6-450B-80D2-04A8F98F83CB")
private let encounterUserIdCharacteristicUuid = CBUUID(string: "4A985948-3BC6-450B-80D2-04A8F98F83CC")
private let encounterEvent = "encounter-found"
private let dedupWindowSeconds: TimeInterval = 5 * 60
private let gattTimeoutSeconds: TimeInterval = 10
private let maxPendingPeripherals = 4
private let maxPendingEvents = 256

private func bleLog(_ message: String) {
  NSLog("[EncounterBle] %@", message)
}

struct StartArgs: Decodable {
  let user_id: String
  let mode: String?
}

struct EncounterPayload: Encodable {
  let user_id: String
  let seen_at: Int64
}

struct PendingEncounter {
  let userId: String
  let seenAt: Int64
}

class EncounterBlePlugin: Plugin, CBCentralManagerDelegate, CBPeripheralManagerDelegate, CBPeripheralDelegate {
  private var central: CBCentralManager?
  private var peripheralManager: CBPeripheralManager?
  private var userIdData: Data?
  private var active = false
  private var advertiseActive = false
  private var scanActive = false
  private var lastError: String?
  private var lastSeenAt: Int64?
  private var lastSeenUserId: String?
  private var discoveredUserIds = [String: Date]()
  private var pendingPeripherals = [UUID: CBPeripheral]()
  private var pendingEvents = [PendingEncounter]()

  @objc public func start(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    guard let data = uuidStringToData(args.user_id) else {
      bleLog("start rejected: invalid user_id")
      invoke.reject("invalid user_id")
      return
    }

    userIdData = data
    active = true
    lastError = nil
    bleLog("start requested mode=\(args.mode ?? "normal") user=\(args.user_id.lowercased())")

    DispatchQueue.main.async {
      self.stopBle(resetError: false)
      self.active = true
      self.lastError = nil
      if self.central == nil {
        self.central = CBCentralManager(delegate: self, queue: nil)
      } else {
        self.startScanIfReady()
      }

      if self.peripheralManager == nil {
        self.peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
      } else {
        self.startAdvertisingIfReady()
      }
      bleLog("start completed")
      invoke.resolve()
    }
  }

  @objc public func stop(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      bleLog("stop requested")
      self.stopBle()
      bleLog("stopped")
      invoke.resolve()
    }
  }

  @objc public func status(_ invoke: Invoke) throws {
    let centralOn = central?.state == .poweredOn
    let peripheralOn = peripheralManager?.state == .poweredOn
    let permissionGranted: Bool
    if #available(iOS 13.1, *) {
      permissionGranted = CBManager.authorization == .allowedAlways
    } else {
      permissionGranted = true
    }
    invoke.resolve([
      "bluetoothOn": centralOn || peripheralOn,
      "permissionGranted": permissionGranted,
      "advertiseActive": advertiseActive,
      "scanActive": scanActive,
      "seenCount": discoveredUserIds.count,
      "pendingCount": pendingEvents.count,
      "pendingGattCount": pendingPeripherals.count,
      "lastSeenAt": lastSeenAt.map { $0 as Any } ?? NSNull(),
      "lastSeenUserId": lastSeenUserId.map { $0 as Any } ?? NSNull(),
      "lastError": lastError.map { $0 as Any } ?? NSNull(),
    ])
  }

  @objc public func drainPending(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      let events = self.pendingEvents.map {
        ["userId": $0.userId, "seenAt": $0.seenAt] as [String: Any]
      }
      self.pendingEvents.removeAll()
      invoke.resolve(["encounters": events])
    }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      bleLog("central powered on")
      startScanIfReady()
    } else {
      scanActive = false
      if active {
        lastError = "central state: \(central.state.rawValue)"
        bleLog("central unavailable state=\(central.state.rawValue)")
      }
    }
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn {
      bleLog("peripheral powered on")
      startAdvertisingIfReady()
    } else {
      advertiseActive = false
      if active {
        lastError = "peripheral state: \(peripheral.state.rawValue)"
        bleLog("peripheral unavailable state=\(peripheral.state.rawValue)")
      }
    }
  }

  private func startScanIfReady() {
    guard active, central?.state == .poweredOn else { return }
    central?.stopScan()
    central?.scanForPeripherals(
      withServices: [encounterServiceUuid],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    scanActive = true
    bleLog("scan started")
  }

  private func startAdvertisingIfReady() {
    guard active, peripheralManager?.state == .poweredOn, let data = userIdData else { return }

    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    let characteristic = CBMutableCharacteristic(
      type: encounterUserIdCharacteristicUuid,
      properties: [.read],
      value: data,
      permissions: [.readable])
    let service = CBMutableService(type: encounterServiceUuid, primary: true)
    service.characteristics = [characteristic]
    peripheralManager?.add(service)
    bleLog("GATT service published")

    peripheralManager?.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [encounterServiceUuid]
    ])
    bleLog("advertise start requested")
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    advertiseActive = error == nil
    if let error {
      lastError = error.localizedDescription
      bleLog("advertise failed error=\(error.localizedDescription)")
    } else {
      bleLog("advertise started")
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard request.characteristic.uuid == encounterUserIdCharacteristicUuid, let data = userIdData else {
      bleLog("unsupported GATT read characteristic=\(request.characteristic.uuid.uuidString)")
      peripheral.respond(to: request, withResult: .requestNotSupported)
      return
    }
    bleLog("GATT read request offset=\(request.offset)")
    guard request.offset <= data.count else {
      peripheral.respond(to: request, withResult: .invalidOffset)
      return
    }
    request.value = data.subdata(in: request.offset..<data.count)
    peripheral.respond(to: request, withResult: .success)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard active else { return }
    if let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
       let data = serviceData[encounterServiceUuid],
       emitIfValid(data) {
      bleLog("scan result handled from service data peripheral=\(peripheral.identifier)")
      return
    }

    if pendingPeripherals[peripheral.identifier] != nil {
      return
    }
    if pendingPeripherals.count >= maxPendingPeripherals {
      bleLog("GATT fallback skipped; pending limit reached")
      return
    }
    bleLog("scan result has no service data; connecting GATT peripheral=\(peripheral.identifier)")
    pendingPeripherals[peripheral.identifier] = peripheral
    peripheral.delegate = self
    central.connect(peripheral, options: nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + gattTimeoutSeconds) { [weak self, weak peripheral] in
      guard let self, let peripheral else { return }
      if self.pendingPeripherals[peripheral.identifier] != nil {
        bleLog("GATT timeout peripheral=\(peripheral.identifier)")
        self.pendingPeripherals.removeValue(forKey: peripheral.identifier)
        self.central?.cancelPeripheralConnection(peripheral)
      }
    }
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    bleLog("GATT connected peripheral=\(peripheral.identifier)")
    peripheral.discoverServices([encounterServiceUuid])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    if let error {
      lastError = error.localizedDescription
      bleLog("GATT connect failed peripheral=\(peripheral.identifier) error=\(error.localizedDescription)")
    }
    pendingPeripherals.removeValue(forKey: peripheral.identifier)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil else {
      lastError = error?.localizedDescription
      bleLog("GATT discover services failed peripheral=\(peripheral.identifier) error=\(error?.localizedDescription ?? "unknown")")
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    bleLog("GATT services discovered peripheral=\(peripheral.identifier)")
    peripheral.services?
      .filter { $0.uuid == encounterServiceUuid }
      .forEach { peripheral.discoverCharacteristics([encounterUserIdCharacteristicUuid], for: $0) }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard error == nil else {
      lastError = error?.localizedDescription
      bleLog("GATT discover characteristics failed peripheral=\(peripheral.identifier) error=\(error?.localizedDescription ?? "unknown")")
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    bleLog("GATT characteristic discovered peripheral=\(peripheral.identifier); reading user id")
    service.characteristics?
      .filter { $0.uuid == encounterUserIdCharacteristicUuid }
      .forEach { peripheral.readValue(for: $0) }
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if error == nil, characteristic.uuid == encounterUserIdCharacteristicUuid, let data = characteristic.value {
      bleLog("GATT read completed peripheral=\(peripheral.identifier)")
      _ = emitIfValid(data)
    } else if let error {
      lastError = error.localizedDescription
      bleLog("GATT read failed peripheral=\(peripheral.identifier) error=\(error.localizedDescription)")
    }
    central?.cancelPeripheralConnection(peripheral)
    pendingPeripherals.removeValue(forKey: peripheral.identifier)
  }

  private func emitIfValid(_ data: Data) -> Bool {
    guard data.count == 16, let userId = dataToUuidString(data) else {
      lastError = "invalid BLE payload size: \(data.count)"
      return true
    }
    guard data != userIdData else { return true }
    let now = Date()
    pruneDiscovered(now: now)
    if let lastSeen = discoveredUserIds[userId], now.timeIntervalSince(lastSeen) < dedupWindowSeconds {
      return true
    }
    discoveredUserIds[userId] = now
    let seenAt = Int64(now.timeIntervalSince1970)
    enqueuePending(userId: userId, seenAt: seenAt)
    try? trigger(encounterEvent, data: EncounterPayload(user_id: userId, seen_at: seenAt))
    bleLog("encounter emitted user=\(userId)")
    return true
  }

  private func enqueuePending(userId: String, seenAt: Int64) {
    lastSeenAt = seenAt
    lastSeenUserId = userId
    while pendingEvents.count >= maxPendingEvents {
      pendingEvents.removeFirst()
    }
    pendingEvents.append(PendingEncounter(userId: userId, seenAt: seenAt))
  }

  private func stopBle(resetError: Bool = true) {
    active = false
    scanActive = false
    advertiseActive = false
    central?.stopScan()
    for peripheral in pendingPeripherals.values {
      central?.cancelPeripheralConnection(peripheral)
    }
    pendingPeripherals.removeAll()
    peripheralManager?.stopAdvertising()
    peripheralManager?.removeAllServices()
    if resetError {
      lastError = nil
    }
  }

  private func pruneDiscovered(now: Date) {
    discoveredUserIds = discoveredUserIds.filter {
      now.timeIntervalSince($0.value) < dedupWindowSeconds
    }
  }

  private func uuidStringToData(_ value: String) -> Data? {
    guard let uuid = UUID(uuidString: value.lowercased()) else { return nil }
    var bytes = uuid.uuid
    return Data(bytes: &bytes, count: 16)
  }

  private func dataToUuidString(_ data: Data) -> String? {
    guard data.count == 16 else { return nil }
    let bytes = [UInt8](data)
    let uuid = UUID(uuid: (
      bytes[0], bytes[1], bytes[2], bytes[3],
      bytes[4], bytes[5],
      bytes[6], bytes[7],
      bytes[8], bytes[9],
      bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    ))
    return uuid.uuidString.lowercased()
  }
}

@_cdecl("init_plugin_encounter_ble")
func initPlugin() -> Plugin {
  return EncounterBlePlugin()
}
