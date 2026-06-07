package com.projectencounter.encounterble

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

private val PENDING_SCAN_SERVICE_UUID: UUID = UUID.fromString("4a985948-3bc6-450b-80d2-04a8f98f83cb")
private const val PENDING_SCAN_REQUEST_CODE = 48196
private const val PENDING_SCAN_TAG = "EncounterBle"

object EncounterBlePendingIntentScan {
    @SuppressLint("MissingPermission")
    fun start(context: Context): Boolean {
        if (!hasScanPermission(context)) return false
        val scanner = scanner(context) ?: return false
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(PENDING_SCAN_SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
            .build()
        scanner.startScan(listOf(filter), settings, pendingIntent(context))
        Log.i(PENDING_SCAN_TAG, "pending-intent scan started")
        return true
    }

    @SuppressLint("MissingPermission")
    fun stop(context: Context) {
        if (!hasScanPermission(context)) return
        scanner(context)?.stopScan(pendingIntent(context))
        Log.i(PENDING_SCAN_TAG, "pending-intent scan stopped")
    }

    private fun scanner(context: Context): BluetoothLeScanner? {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter: BluetoothAdapter = manager.adapter ?: return null
        if (!adapter.isEnabled) return null
        return adapter.bluetoothLeScanner
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, EncounterBleScanReceiver::class.java)
            .setAction(EncounterBleScanReceiver.ACTION_SCAN_RESULT)
        return PendingIntent.getBroadcast(
            context.applicationContext,
            PENDING_SCAN_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }

    private fun hasScanPermission(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
    }
}
