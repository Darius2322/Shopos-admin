package com.dmn.shopos.mpesa

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Holds ONLY messages already recognised as M-Pesa payment confirmations, so a payment that
 * arrives while the app is closed is not lost. App-private storage, capped, drained by the JS side.
 * Unrelated messages never reach this class.
 */
object MpesaQueue {
    private const val PREFS = "shopos_mpesa_queue"
    private const val KEY = "messages"
    private const val MAX = 200

    @Synchronized
    fun add(ctx: Context, address: String, body: String, receivedAt: Long) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(KEY, "[]"))
        val obj = JSONObject().put("address", address).put("body", body).put("receivedAt", receivedAt)
        arr.put(obj)
        val trimmed = JSONArray()
        for (i in maxOf(0, arr.length() - MAX) until arr.length()) trimmed.put(arr.get(i))
        prefs.edit().putString(KEY, trimmed.toString()).apply()
    }

    @Synchronized
    fun drain(ctx: Context): JSONArray {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(KEY, "[]"))
        prefs.edit().remove(KEY).apply()
        return arr
    }
}
