package com.projectencounter.encounterble

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.core.app.ActivityCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private val SERVICE_UUID: UUID = UUID.fromString("4a985948-3bc6-450b-80d2-04a8f98f83cb")
private val USER_ID_CHARACTERISTIC_UUID: UUID = UUID.fromString("4a985948-3bc6-450b-80d2-04a8f98f83cc")
private const val ENCOUNTER_EVENT = "encounter-found"
private const val PERMISSION_REQUEST_CODE = 48194
private const val DEDUP_WINDOW_MS = 5 * 60 * 1000L
private const val GATT_TIMEOUT_MS = 10 * 1000L
private const val TAG = "EncounterBle"

@InvokeArg
class StartArgs {
    lateinit var user_id: String
    var mode: String? = null
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            ],
            alias = "ble"
        )
    ]
)
class EncounterBlePlugin(private val activity: Activity) : Plugin(activity) {
    private val bluetoothManager: BluetoothManager =
        activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null
    private var gattServer: BluetoothGattServer? = null
    private var userIdBytes: ByteArray? = null
    private var active = false
    private var advertiseActive = false
    private var scanActive = false
    private var lastError: String? = null
    private val seenUserIds = ConcurrentHashMap<String, Long>()
    private val pendingGatts = ConcurrentHashMap<String, BluetoothGatt>()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        val uuid = try {
            UUID.fromString(args.user_id)
        } catch (ex: Exception) {
            Log.w(TAG, "start rejected: invalid user_id")
            invoke.reject("invalid user_id")
            return
        }
        userIdBytes = uuidToBytes(uuid)
        Log.i(TAG, "start requested mode=${args.mode ?: "normal"} user=${uuid.toString().lowercase()}")

        if (!hasBlePermissions()) {
            requestBlePermissions()
            Log.w(TAG, "start waiting for BLE permissions")
            invoke.reject("BLE permissions are required; retry after granting them")
            return
        }
        val adapter = adapter
        if (adapter == null || !adapter.isEnabled) {
            Log.w(TAG, "start rejected: Bluetooth off or unavailable")
            invoke.reject("Bluetooth is off or unavailable")
            return
        }
        if (adapter.bluetoothLeScanner == null) {
            Log.w(TAG, "start rejected: scanner unavailable")
            invoke.reject("BLE scanner is unavailable")
            return
        }
        if (adapter.bluetoothLeAdvertiser == null) {
            Log.w(TAG, "start rejected: advertiser unavailable")
            invoke.reject("BLE advertiser is unavailable")
            return
        }

        try {
            active = true
            lastError = null
            startGattServer()
            startAdvertising()
            startScanning()
            Log.i(TAG, "start completed")
            invoke.resolve()
        } catch (ex: Exception) {
            lastError = ex.message ?: "failed to start BLE"
            Log.e(TAG, "start failed", ex)
            invoke.reject(ex.message ?: "failed to start BLE")
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        Log.i(TAG, "stop requested")
        stopBle()
        invoke.resolve()
    }

    @Command
    fun status(invoke: Invoke) {
        val res = JSObject()
        res.put("bluetoothOn", adapter?.isEnabled == true)
        res.put("permissionGranted", hasBlePermissions())
        res.put("advertiseActive", advertiseActive)
        res.put("scanActive", scanActive)
        res.put("seenCount", seenUserIds.size)
        res.put("lastError", lastError)
        invoke.resolve(res)
    }

    @Deprecated("use onDestroy(activity: AppCompatActivity) when appcompat is on the plugin classpath")
    @Suppress("DEPRECATION")
    override fun onDestroy() {
        stopBle()
        super.onDestroy()
    }

    @SuppressLint("MissingPermission")
    private fun stopBle() {
        active = false
        try {
            scanner?.stopScan(scanCallback)
        } catch (_: Exception) {
        }
        try {
            advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: Exception) {
        }
        pendingGatts.values.forEach {
            try {
                it.close()
            } catch (_: Exception) {
            }
        }
        pendingGatts.clear()
        try {
            gattServer?.close()
        } catch (_: Exception) {
        }
        scanActive = false
        advertiseActive = false
        lastError = null
        gattServer = null
        Log.i(TAG, "stopped")
    }

    @Suppress("DEPRECATION")
    @SuppressLint("MissingPermission")
    private fun startGattServer() {
        val data = userIdBytes ?: return
        val characteristic = BluetoothGattCharacteristic(
            USER_ID_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        characteristic.value = data
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(characteristic)

        gattServer?.close()
        gattServer = bluetoothManager.openGattServer(activity, gattServerCallback)
        if (gattServer == null) {
            lastError = "GATT server is unavailable"
            Log.w(TAG, "GATT server unavailable")
        }
        gattServer?.addService(service)
        Log.i(TAG, "GATT service published")
    }

    @SuppressLint("MissingPermission")
    private fun startAdvertising() {
        advertiser = adapter?.bluetoothLeAdvertiser
        if (advertiser == null) {
            advertiseActive = false
            lastError = "BLE advertiser is unavailable"
            Log.w(TAG, "advertiser unavailable")
            return
        }
        val data = userIdBytes ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .build()
        val advertiseData = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .addServiceData(ParcelUuid(SERVICE_UUID), data)
            .build()
        advertiser?.startAdvertising(settings, advertiseData, advertiseCallback)
        Log.i(TAG, "advertise start requested")
    }

    @SuppressLint("MissingPermission")
    private fun startScanning() {
        scanner = adapter?.bluetoothLeScanner
        if (scanner == null) {
            scanActive = false
            lastError = "BLE scanner is unavailable"
            Log.w(TAG, "scanner unavailable")
            return
        }
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner?.startScan(listOf(filter), settings, scanCallback)
        scanActive = true
        Log.i(TAG, "scan started")
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertiseActive = true
            Log.i(TAG, "advertise started")
        }

        override fun onStartFailure(errorCode: Int) {
            advertiseActive = false
            lastError = "BLE advertise failed: $errorCode"
            Log.w(TAG, "advertise failed code=$errorCode")
        }
    }

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val data = result.scanRecord?.getServiceData(ParcelUuid(SERVICE_UUID))
            if (data != null && emitIfValid(data)) {
                Log.i(TAG, "scan result handled from service data address=${result.device.address}")
                return
            }
            if (!pendingGatts.containsKey(result.device.address)) {
                Log.i(TAG, "scan result has no service data; connecting GATT address=${result.device.address}")
                val gatt = result.device.connectGatt(activity, false, gattCallback)
                pendingGatts[result.device.address] = gatt
                mainHandler.postDelayed({
                    pendingGatts.remove(result.device.address)?.let {
                        Log.w(TAG, "GATT timeout address=${result.device.address}")
                        try {
                            it.close()
                        } catch (_: Exception) {
                        }
                    }
                }, GATT_TIMEOUT_MS)
            }
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        @SuppressLint("MissingPermission")
        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid == USER_ID_CHARACTERISTIC_UUID) {
                val value = userIdBytes ?: ByteArray(0)
                Log.i(TAG, "GATT read request address=${device.address} offset=$offset")
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
            } else {
                Log.w(TAG, "unsupported GATT read characteristic=${characteristic.uuid}")
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null)
            }
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "GATT connected address=${gatt.device.address}")
                gatt.discoverServices()
            } else {
                Log.i(TAG, "GATT disconnected address=${gatt.device.address} status=$status state=$newState")
                pendingGatts.remove(gatt.device.address)
                gatt.close()
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val characteristic = gatt.getService(SERVICE_UUID)
                ?.getCharacteristic(USER_ID_CHARACTERISTIC_UUID)
            if (characteristic != null) {
                Log.i(TAG, "GATT service discovered address=${gatt.device.address}; reading user id")
                gatt.readCharacteristic(characteristic)
            } else {
                Log.w(TAG, "GATT characteristic missing address=${gatt.device.address} status=$status")
                pendingGatts.remove(gatt.device.address)
                gatt.close()
            }
        }

        @SuppressLint("MissingPermission")
        @Suppress("DEPRECATION")
        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == USER_ID_CHARACTERISTIC_UUID) {
                Log.i(TAG, "GATT read completed address=${gatt.device.address}")
                emitIfValid(characteristic.value)
            } else {
                Log.w(TAG, "GATT read failed address=${gatt.device.address} status=$status")
            }
            pendingGatts.remove(gatt.device.address)
            gatt.close()
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == USER_ID_CHARACTERISTIC_UUID) {
                Log.i(TAG, "GATT read completed address=${gatt.device.address}")
                emitIfValid(value)
            } else {
                Log.w(TAG, "GATT read failed address=${gatt.device.address} status=$status")
            }
            pendingGatts.remove(gatt.device.address)
            gatt.close()
        }
    }

    private fun emitIfValid(data: ByteArray): Boolean {
        if (data.size != 16) return false
        if (userIdBytes?.contentEquals(data) == true) return true
        val userId = bytesToUuid(data).toString().lowercase()
        val now = System.currentTimeMillis()
        val lastSeen = seenUserIds[userId]
        if (lastSeen != null && now - lastSeen < DEDUP_WINDOW_MS) return true
        seenUserIds[userId] = now

        val payload = JSObject()
        payload.put("user_id", userId)
        trigger(ENCOUNTER_EVENT, payload)
        Log.i(TAG, "encounter emitted user=$userId")
        return true
    }

    private fun hasBlePermissions(): Boolean {
        return requiredPermissions().all {
            ActivityCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestBlePermissions() {
        val missing = requiredPermissions()
            .filter { ActivityCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED }
            .toTypedArray()
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(activity, missing, PERMISSION_REQUEST_CODE)
        }
    }

    private fun requiredPermissions(): Array<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            emptyArray()
        }
    }

    private fun uuidToBytes(uuid: UUID): ByteArray {
        val buffer = ByteBuffer.allocate(16)
        buffer.putLong(uuid.mostSignificantBits)
        buffer.putLong(uuid.leastSignificantBits)
        return buffer.array()
    }

    private fun bytesToUuid(bytes: ByteArray): UUID {
        val buffer = ByteBuffer.wrap(bytes)
        return UUID(buffer.long, buffer.long)
    }
}
