package com.dmn.shopos.mpesa

import android.Manifest
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/** Capacitor bridge used by src/lib/payments/smsChannel.ts. RECEIVE_SMS only. */
@CapacitorPlugin(
    name = "ShopOsMpesa",
    permissions = [Permission(strings = [Manifest.permission.RECEIVE_SMS], alias = "receiveSms")]
)
class ShopOsMpesaPlugin : Plugin() {

    override fun load() { instance = this }

    @PluginMethod
    fun start(call: PluginCall) { active = true; call.resolve() }

    @PluginMethod
    fun stop(call: PluginCall) { active = false; call.resolve() }

    @PluginMethod
    fun drainQueue(call: PluginCall) {
        val out = JSObject()
        out.put("messages", JSArray(MpesaQueue.drain(context).toString()))
        call.resolve(out)
    }

    companion object {
        @Volatile private var instance: ShopOsMpesaPlugin? = null
        @Volatile private var active = false

        /** Live delivery. If the app is closed the message simply stays in MpesaQueue until next launch. */
        fun deliver(address: String, body: String, ts: Long) {
            val p = instance ?: return
            if (!active) return
            val o = JSObject().put("address", address).put("body", body).put("receivedAt", ts)
            p.notifyListeners("mpesaMessage", o)
            MpesaQueue.drain(p.context) // delivered live, so remove from the offline queue
        }
    }
}
