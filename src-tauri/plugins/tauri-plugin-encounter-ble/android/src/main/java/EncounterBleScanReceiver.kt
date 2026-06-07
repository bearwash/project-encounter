package com.projectencounter.encounterble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private val RECEIVER_SERVICE_UUID: UUID = UUID.fromString("4a985948-3bc6-450b-80d2-04a8f98f83cb")
private val RECEIVER_USER_ID_CHARACTERISTIC_UUID: UUID = UUID.fromString("4a985948-3bc6-450b-80d2-04a8f98f83cc")
private const val RECEIVER_DEDUP_WINDOW_MS = 5 * 60 * 1000L
private const val RECEIVER_GATT_TIMEOUT_MS = 10 * 1000L
private const val RECEIVER_TAG = "EncounterBle"

class EncounterBleScanReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SCAN_RESULT || !EncounterBleStore.isActive(context)) return
        val results = scanResults(intent)
        if (results.isEmpty()) return
        Log.i(RECEIVER_TAG, "pending-intent scan delivered results=${results.size}")
        val pendingResult = goAsync()
        BackgroundGattReader.readFirst(context.applicationContext, results) {
            pendingResult.finish()
        }
    }

    private fun scanResults(intent: Intent): List<ScanResult> {
        val callbackType = intent.getIntExtra(BluetoothLeScanner.EXTRA_CALLBACK_TYPE, -1)
        if (callbackType == ScanCallback.SCAN_FAILED_INTERNAL_ERROR) return emptyList()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(
                BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT,
                ScanResult::class.java
            ).orEmpty()
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra<ScanResult>(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT).orEmpty()
        }
    }

    companion object {
        const val ACTION_SCAN_RESULT = "com.projectencounter.encounterble.SCAN_RESULT"
    }
}

private object BackgroundGattReader {
    private val pendingDevices = ConcurrentHashMap<String, BluetoothGatt>()
    private val handler = Handler(Looper.getMainLooper())

    @SuppressLint("MissingPermission")
    fun readFirst(context: Context, results: List<ScanResult>, done: () -> Unit) {
        if (!hasConnectPermission(context)) {
            done()
            return
        }

        for (result in results) {
            val serviceData = result.scanRecord?.getServiceData(ParcelUuid(RECEIVER_SERVICE_UUID))
            if (serviceData != null && handleUserId(context, serviceData)) {
                done()
                return
            }

            val address = result.device.address
            if (pendingDevices.containsKey(address)) continue
            Log.i(RECEIVER_TAG, "pending-intent GATT connecting address=$address")
            val reader = Reader(context, result.device, done)
            val gatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                result.device.connectGatt(context, false, reader, BluetoothDevice.TRANSPORT_LE)
            } else {
                result.device.connectGatt(context, false, reader)
            }
            pendingDevices[address] = gatt
            reader.attach(gatt)
            return
        }
        done()
    }

    private fun handleUserId(context: Context, data: ByteArray): Boolean {
        if (data.size != 16) return true
        val ownUserId = EncounterBleStore.ownUserIdBytes(context)
        if (ownUserId?.contentEquals(data) == true) return true
        val userId = bytesToUuid(data).toString().lowercase()
        val seenAt = System.currentTimeMillis() / 1000L
        val inserted = EncounterBleStore.enqueueIfNew(
            context,
            userId,
            seenAt,
            RECEIVER_DEDUP_WINDOW_MS
        )
        if (inserted) {
            EncounterBleForegroundService.notifyEncounter(context, userId)
            Log.i(RECEIVER_TAG, "pending-intent encounter stored user=$userId")
        }
        return true
    }

    private fun hasConnectPermission(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private fun bytesToUuid(bytes: ByteArray): UUID {
        val buffer = ByteBuffer.wrap(bytes)
        return UUID(buffer.long, buffer.long)
    }

    private class Reader(
        private val context: Context,
        private val device: BluetoothDevice,
        private val done: () -> Unit
    ) : BluetoothGattCallback() {
        private var gatt: BluetoothGatt? = null
        private var finished = false

        fun attach(gatt: BluetoothGatt) {
            this.gatt = gatt
            handler.postDelayed({
                finish("pending-intent GATT timeout address=${device.address}")
            }, RECEIVER_GATT_TIMEOUT_MS)
        }

        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (finished) return
            if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                Log.i(RECEIVER_TAG, "pending-intent GATT connected address=${device.address}")
                gatt.discoverServices()
            } else {
                finish("pending-intent GATT disconnected address=${device.address} status=$status state=$newState")
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (finished) return
            val characteristic = gatt.getService(RECEIVER_SERVICE_UUID)
                ?.getCharacteristic(RECEIVER_USER_ID_CHARACTERISTIC_UUID)
            if (characteristic == null) {
                finish("pending-intent GATT characteristic missing address=${device.address} status=$status")
                return
            }
            Log.i(RECEIVER_TAG, "pending-intent GATT reading user id address=${device.address}")
            gatt.readCharacteristic(characteristic)
        }

        @SuppressLint("MissingPermission")
        @Suppress("DEPRECATION")
        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (finished) return
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == RECEIVER_USER_ID_CHARACTERISTIC_UUID) {
                handleUserId(context, characteristic.value)
            } else {
                Log.w(RECEIVER_TAG, "pending-intent GATT read failed address=${device.address} status=$status")
            }
            finish(null)
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            if (finished) return
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == RECEIVER_USER_ID_CHARACTERISTIC_UUID) {
                handleUserId(context, value)
            } else {
                Log.w(RECEIVER_TAG, "pending-intent GATT read failed address=${device.address} status=$status")
            }
            finish(null)
        }

        @SuppressLint("MissingPermission")
        private fun finish(message: String?) {
            if (finished) return
            finished = true
            if (message != null) Log.i(RECEIVER_TAG, message)
            pendingDevices.remove(device.address)
            try {
                gatt?.close()
            } catch (_: Exception) {
            }
            done()
        }
    }
}
