package io.github.muhakmal.kuereader.parser

import android.nfc.Tag
import android.nfc.tech.IsoDep
import io.github.muhakmal.kuereader.CardParser
import io.github.muhakmal.kuereader.model.CardData
import io.github.muhakmal.kuereader.model.Transaction
import io.github.muhakmal.kuereader.util.TxDates
import java.util.Calendar
import java.util.Date

/**
 * BNI TapCash, a CEPAS (SS 518) purse.
 *
 * Changed for Jatahin: upstream gated everything on selecting AID 11 22 33 44 55 66, a placeholder that real
 * cards reject, so the purse was never read. A CEPAS purse answers READ PURSE (90 32 <purse> 00) without a
 * select, so the selects are only tried and the purse read decides. All commands here are reads.
 */
class TapCashParser : EmoneyParser {

    override fun canHandle(tag: Tag): Boolean = tag.techList.contains(IsoDep::class.java.name)

    override fun parse(tag: Tag, logBuilder: StringBuilder): CardData? {
        val isoDep = CardParser.getSharedIsoDep(tag) ?: return null
        return parseChannel(isoDep.asChannel(), tag.id.toHexString(), logBuilder)
    }

    internal fun parseChannel(channel: ApduChannel, rawId: String, log: StringBuilder): CardData? {
        try {
            // Some applets need a select first; neither result is required.
            for (aid in AIDS) if (selectApplet(channel, aid)) break

            val purse = readPurse(channel) ?: return null
            log.append("Detected: BNI TapCash (CEPAS purse ${"%02X".format(PURSE)})\n")

            // Purse layout: version, status, balance (signed 24-bit), ...
            val balance = int24(purse, 2)
            val history = readHistory(channel, purse, log)

            return CardData(
                cardName = "BNI TapCash",
                balance = balance.toDouble(),
                transactionHistory = history,
                rawId = rawId,
                debugLog = log.toString(),
                balanceKnown = true
            )
        } catch (e: Exception) {
            log.append("TapCash Error: ${e.message}\n")
        }
        return null
    }

    /** READ PURSE; the payload, or null when this is not a CEPAS purse. */
    private fun readPurse(channel: ApduChannel): ByteArray? {
        val resp = transceiveLe(channel, byteArrayOf(0x90.toByte(), 0x32, PURSE, 0x00), null)
        return if (resp != null && resp.isSuccess() && resp.size >= 7) resp.payload() else null
    }

    /** READ PURSE with a record offset returns the transaction log, 16 bytes per record. */
    private fun readHistory(channel: ApduChannel, purse: ByteArray, log: StringBuilder): List<Transaction> {
        val records = mutableListOf<ByteArray>()
        try {
            var offset = 0
            while (offset < MAX_LOG_RECORDS) {
                val resp = transceiveLe(channel, byteArrayOf(0x90.toByte(), 0x32, PURSE, 0x00), byteArrayOf(offset.toByte()))
                if (resp == null || !resp.isSuccess()) break
                val data = resp.payload()
                // A card that ignores the offset answers with the purse again; that is not a log.
                if (data.contentEquals(purse)) break
                val page = (0 until data.size / RECORD).map { data.copyOfRange(it * RECORD, (it + 1) * RECORD) }
                // Stop at the end of the log: nothing back, an empty slot, or a record already read (the card
                // ignored the offset). TapCash answers one record per read, so the offset steps by what came back.
                if (page.isEmpty() || page[0].all { it.toInt() == 0 } || records.any { it.contentEquals(page[0]) }) break
                records.addAll(page.takeWhile { r -> !r.all { it.toInt() == 0 } })
                offset += page.size
            }
        } catch (e: Exception) {
            log.append("TapCash Hist Err: ${e.message}\n")
        }
        return records.mapNotNull { decodeLogRecord(it) }.distinctBy { "${it.date}_${it.amount}_${it.type}" }
    }

    /**
     * Sends a case 2 or 4 command with Le 00. When the card answers 6C xx (wrong length) it is sent again with
     * Le xx; when it rejects Le altogether (67 00) it is sent without one.
     */
    private fun transceiveLe(channel: ApduChannel, header: ByteArray, data: ByteArray?): ByteArray? {
        val body = if (data == null) header else header + byteArrayOf(data.size.toByte()) + data
        var resp = channel.transceive(body + byteArrayOf(0x00))
        if (resp.hasSw1(0x6C)) resp = channel.transceive(body + byteArrayOf(resp[resp.size - 1]))
        else if (resp.hasStatus(0x67, 0x00)) resp = channel.transceive(body)
        return resp
    }

    private fun ByteArray.hasSw1(sw1: Int): Boolean = size >= 2 && this[size - 2] == sw1.toByte()

    companion object {
        const val MAX_LOG_RECORDS = 30
        private const val PURSE: Byte = 0x03
        private const val RECORD = 16

        private val AIDS = listOf(
            byteArrayOf(0xA0.toByte(), 0x00, 0x42, 0x4E, 0x49, 0x10, 0x00, 0x01), // "BNI"
            byteArrayOf(0x11, 0x22, 0x33, 0x44, 0x55, 0x66) // upstream's value, kept for older cards
        )

        private fun int24(b: ByteArray, at: Int): Int {
            val v = ((b[at].toInt() and 0xFF) shl 16) or ((b[at + 1].toInt() and 0xFF) shl 8) or (b[at + 2].toInt() and 0xFF)
            return if (v and 0x800000 != 0) v or -0x1000000 else v
        }

        /**
         * CEPAS log record: type (1), amount (signed 24-bit, negative for a debit), seconds since
         * 1995-01-01 00:00 WIB (4), user data (8, often ASCII). The sign decides top up or payment.
         */
        internal fun decodeLogRecord(record: ByteArray): Transaction? {
            if (record.size < 8) return null
            val amount = int24(record, 1)
            val seconds = ((record[4].toLong() and 0xFF) shl 24) or ((record[5].toLong() and 0xFF) shl 16) or
                ((record[6].toLong() and 0xFF) shl 8) or (record[7].toLong() and 0xFF)
            if (amount == 0 && seconds == 0L) return null

            val epoch = Calendar.getInstance(TxDates.JAKARTA).apply {
                set(1995, 0, 1, 0, 0, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val user = if (record.size >= 16) record.copyOfRange(8, 16) else null
            val text = user?.takeIf { u -> u.all { (it.toInt() and 0xFF) in 0x20..0x7E || it.toInt() == 0 } }
                ?.toString(Charsets.US_ASCII)?.trim('\u0000', ' ')?.takeIf { it.isNotEmpty() }

            return Transaction(
                date = TxDates.format(Date(epoch.timeInMillis + seconds * 1000L)),
                amount = kotlin.math.abs(amount).toDouble(),
                type = if (amount > 0) "Top Up" else "Payment",
                location = text,
                terminalId = if (text == null) user?.toHexString() else null
            )
        }
    }
}
