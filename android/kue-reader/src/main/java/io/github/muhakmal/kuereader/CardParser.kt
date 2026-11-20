package io.github.muhakmal.kuereader

import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.util.Log
import io.github.muhakmal.kuereader.model.CardData
import io.github.muhakmal.kuereader.parser.*

object CardParser {

    private val defaultParsers: List<EmoneyParser> = listOf(
        FelicaParser(),
        MandiriParser(),
        TapCashParser(),
        BrizziParser(),
        FlazzParser(),
        JakCardParser(),
        MifareLegacyParser()
    )

    private val customParsers = mutableListOf<EmoneyParser>()

    /** Register a custom card parser at runtime. */
    fun registerParser(parser: EmoneyParser) {
        customParsers.add(parser)
    }

    private var sharedIsoDep: IsoDep? = null
    private var currentTag: Tag? = null

    fun getSharedIsoDep(tag: Tag): IsoDep? {
        if (currentTag != tag || sharedIsoDep?.isConnected != true) {
            sharedIsoDep = IsoDep.get(tag)
            try {
                if (sharedIsoDep?.isConnected == false) {
                    sharedIsoDep?.connect()
                }
            } catch (e: Exception) {
                Log.d("CardParser", "Shared IsoDep connect error: ${e.message}")
            }
            sharedIsoDep?.timeout = 5000
            currentTag = tag
        }
        return sharedIsoDep
    }

    private fun closeSharedIsoDep() {
        try { sharedIsoDep?.close() } catch (_: Exception) {}
        sharedIsoDep = null
        currentTag = null
    }

    /** Changed for Jatahin: the APDU trace of the read in progress, appended to the outcome's log. */
    private var traceLog: StringBuilder? = null

    internal fun trace(cmd: ByteArray, resp: ByteArray?, error: String?) {
        val t = traceLog ?: return
        t.append("> ").append(cmd.toHexString()).append('\n')
        if (resp == null) t.append("< error: ").append(error).append('\n')
        else t.append("< ").append(maskCan(cmd, resp)).append('\n')
    }

    /** A CEPAS purse carries the card number (CAN) in bytes 8..15; keep it out of the trace. */
    private fun maskCan(cmd: ByteArray, resp: ByteArray): String {
        val hex = resp.toHexString()
        val purseRead = cmd.size in 4..5 && cmd[0] == 0x90.toByte() && cmd[1] == 0x32.toByte()
        return if (purseRead && hex.length >= 32) hex.substring(0, 16) + "x".repeat(16) + hex.substring(32) else hex
    }

    private fun describe(tag: Tag): String = buildString {
        append("UID length: ${tag.id.size}\n")
        NfcA.get(tag)?.let { append("NfcA ATQA ${it.atqa.toHexString()} SAK ${"%02X".format(it.sak)}\n") }
        NfcB.get(tag)?.let { append("NfcB app ${it.applicationData.toHexString()} proto ${it.protocolInfo.toHexString()}\n") }
        IsoDep.get(tag)?.let {
            append("IsoDep hist ${it.historicalBytes?.toHexString() ?: "-"} hiLayer ${it.hiLayerResponse?.toHexString() ?: "-"}\n")
        }
    }

    internal const val MAX_PLAUSIBLE_BALANCE = 20_000_000.0

    /**
     * Detailed read outcome containing the card data (if recognized), detected tech list,
     * and APDU diagnostic log.
     */
    data class Outcome(val card: CardData?, val techList: List<String>, val log: String)

    /**
     * Reads card balance and transaction history.
     * Returns null if no parser recognizes the card.
     */
    fun parse(tag: Tag): CardData? = parseDetailed(tag).card

    @Synchronized
    fun parseDetailed(tag: Tag): Outcome {
        val techList = tag.techList.map { it.substringAfterLast(".") }
        val sb = StringBuilder()
        val trace = StringBuilder()
        traceLog = trace
        try {
            sb.append("Tech: ${techList.joinToString()}\n")
            sb.append(describe(tag))
            Log.d("CardParser", "Tag Discovered: ${techList.joinToString()}")

            val allParsers = customParsers + defaultParsers

            for (parser in allParsers) {
                if (parser is MifareLegacyParser && sharedIsoDep?.isConnected == true) {
                    try { sharedIsoDep?.close() } catch (_: Exception) {}
                }
                if (parser.canHandle(tag)) {
                    val result = parser.parse(tag, sb)
                    if (result != null) {
                        Log.d("CardParser", "Final Result: ${result.cardName}")
                        return Outcome(sanityCheck(result), techList, withTrace(sb, trace))
                    }
                }
            }

            Log.d("CardParser", "Final Result: Card unrecognized")
            return Outcome(null, techList, withTrace(sb, trace))
        } finally {
            traceLog = null
            closeSharedIsoDep()
        }
    }

    private fun withTrace(sb: StringBuilder, trace: StringBuilder): String =
        if (trace.isEmpty()) sb.toString() else sb.toString() + "\nAPDU:\n" + trace

    internal fun sanityCheck(card: CardData): CardData =
        if (card.balanceKnown && (card.balance < 0 || card.balance > MAX_PLAUSIBLE_BALANCE)) {
            card.copy(
                balanceKnown = false,
                debugLog = card.debugLog + "\nBalance outside plausible limits: ${card.balance}"
            )
        } else card
}
