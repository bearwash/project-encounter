package com.projectencounter.encounterble

import android.content.Context
import android.content.SharedPreferences
import java.nio.ByteBuffer
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

private const val STORE_NAME = "encounter_ble"
private const val KEY_ACTIVE = "active"
private const val KEY_USER_ID = "user_id"
private const val KEY_PENDING = "pending_events"
private const val KEY_LAST_SEEN_PREFIX = "last_seen_"
private const val MAX_PENDING_EVENTS = 256

data class StoredEncounter(val userId: String, val seenAt: Long)

object EncounterBleStore {
    fun setSession(context: Context, userId: String) {
        prefs(context).edit()
            .putBoolean(KEY_ACTIVE, true)
            .putString(KEY_USER_ID, userId.lowercase())
            .apply()
    }

    fun clearSession(context: Context) {
        prefs(context).edit()
            .putBoolean(KEY_ACTIVE, false)
            .apply()
    }

    fun isActive(context: Context): Boolean = prefs(context).getBoolean(KEY_ACTIVE, false)

    fun ownUserIdBytes(context: Context): ByteArray? {
        val userId = prefs(context).getString(KEY_USER_ID, null) ?: return null
        return try {
            uuidToBytes(UUID.fromString(userId))
        } catch (_: Exception) {
            null
        }
    }

    fun enqueueIfNew(context: Context, userId: String, seenAt: Long, dedupWindowMs: Long): Boolean {
        val key = KEY_LAST_SEEN_PREFIX + userId
        val nowMs = seenAt * 1000L
        val preferences = prefs(context)
        val lastSeen = preferences.getLong(key, 0L)
        if (lastSeen > 0L && nowMs - lastSeen < dedupWindowMs) return false

        val pending = JSONArray(preferences.getString(KEY_PENDING, "[]"))
        while (pending.length() >= MAX_PENDING_EVENTS) {
            pending.remove(0)
        }
        pending.put(
            JSONObject()
                .put("userId", userId)
                .put("seenAt", seenAt)
        )
        preferences.edit()
            .putLong(key, nowMs)
            .putString(KEY_PENDING, pending.toString())
            .apply()
        return true
    }

    fun pendingCount(context: Context): Int =
        JSONArray(prefs(context).getString(KEY_PENDING, "[]")).length()

    fun drainPending(context: Context): List<StoredEncounter> {
        val preferences = prefs(context)
        val pending = JSONArray(preferences.getString(KEY_PENDING, "[]"))
        val encounters = mutableListOf<StoredEncounter>()
        for (index in 0 until pending.length()) {
            val item = pending.optJSONObject(index) ?: continue
            val userId = item.optString("userId")
            val seenAt = item.optLong("seenAt", 0L)
            if (userId.isNotBlank() && seenAt > 0L) {
                encounters.add(StoredEncounter(userId, seenAt))
            }
        }
        preferences.edit().putString(KEY_PENDING, "[]").apply()
        return encounters
    }

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE)

    private fun uuidToBytes(uuid: UUID): ByteArray {
        val buffer = ByteBuffer.allocate(16)
        buffer.putLong(uuid.mostSignificantBits)
        buffer.putLong(uuid.leastSignificantBits)
        return buffer.array()
    }
}
