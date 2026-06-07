package com.projectencounter.encounterble

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "EncounterBle"
private const val SERVICE_CHANNEL_ID = "encounter_ble_service"
private const val SERVICE_CHANNEL_NAME = "Project Encounter BLE"
private const val ENCOUNTER_CHANNEL_ID = "encounter_ble_events"
private const val ENCOUNTER_CHANNEL_NAME = "すれ違い通知"
private const val NOTIFICATION_ID = 48195
private const val ENCOUNTER_NOTIFICATION_BASE_ID = 48200
// 通知 ID は単調増加で割り当てる。userId.hashCode() ベースだと衝突して
// バースト時に通知が上書きされ取りこぼす。
private val encounterNotificationCounter = AtomicInteger(0)

class EncounterBleForegroundService : Service() {
    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val foregroundServiceType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        } else {
            0
        }
        // Android 14+ では connectedDevice 型 FGS の起動に BLUETOOTH 権限が必須。
        // START_STICKY による OS 再起動時に権限が剥奪されていると startForeground が
        // 例外を投げてプロセスが落ちるため、catch して安全に自停止する。
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), foregroundServiceType)
        } catch (ex: Exception) {
            Log.w(TAG, "startForeground failed; stopping service", ex)
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureChannel() {
        ensureChannel(this)
    }

    private fun buildNotification(): Notification {
        val icon = applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.stat_sys_data_bluetooth
        return NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
            .setSmallIcon(icon)
            .setContentTitle("Project Encounter")
            .setContentText("すれ違い検出を待機しています")
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java)
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                SERVICE_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            )
            serviceChannel.description = "すれ違い検出のためにBLEを待機しています"
            manager.createNotificationChannel(serviceChannel)

            val encounterChannel = NotificationChannel(
                ENCOUNTER_CHANNEL_ID,
                ENCOUNTER_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            )
            encounterChannel.description = "新しいすれ違いを検出したときに通知します"
            manager.createNotificationChannel(encounterChannel)
        }

        fun start(context: Context) {
            val intent = Intent(context, EncounterBleForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, EncounterBleForegroundService::class.java))
        }

        fun notifyEncounter(context: Context, userId: String) {
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
            ensureChannel(context)
            val manager = context.getSystemService(NotificationManager::class.java)
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pendingIntent = launchIntent?.let {
                PendingIntent.getActivity(
                    context,
                    0,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }
            val icon = context.applicationInfo.icon
                .takeIf { it != 0 }
                ?: android.R.drawable.stat_sys_data_bluetooth
            val notification = NotificationCompat.Builder(context, ENCOUNTER_CHANNEL_ID)
                .setSmallIcon(icon)
                .setContentTitle("すれ違いました")
                .setContentText("Project Encounterで新しいすれ違いを検出しました")
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .build()
            val notificationId =
                ENCOUNTER_NOTIFICATION_BASE_ID + encounterNotificationCounter.getAndIncrement().mod(1000)
            manager.notify(notificationId, notification)
        }
    }
}
