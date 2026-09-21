package com.dmn.shopos.mpesa

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Receives incoming SMS and keeps ONLY M-Pesa payment confirmations.
 * Filter order matters for privacy: sender first (cheap, before the body is even looked at),
 * then a coarse wording check. Everything else is dropped right here — never queued, logged,
 * shown, or sent to JavaScript. The strict parse happens again on the JS side.
 */
class MpesaSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val first = parts.firstOrNull() ?: return
        val address = first.originatingAddress ?: return
        if (!SENDER.matches(address)) return                       // not M-Pesa: stop, do not read the body

        val body = parts.joinToString("") { it.messageBody ?: "" }
        if (!CONFIRMED.containsMatchIn(body) || !RECEIVED.containsMatchIn(body)) return  // not an incoming payment

        val ts = first.timestampMillis
        MpesaQueue.add(context, address, body, ts)
        ShopOsMpesaPlugin.deliver(address, body, ts)               // live delivery if the app is open
    }

    private companion object {
        val SENDER = Regex("^\\s*m[-\\s]?pesa\\s*$", RegexOption.IGNORE_CASE)
        val CONFIRMED = Regex("confirmed", RegexOption.IGNORE_CASE)
        val RECEIVED = Regex("received", RegexOption.IGNORE_CASE)
    }
}
