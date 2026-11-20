package io.github.muhakmal.kuereader.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A CEPAS purse as a fake card: the commands it answers and what it sent back. */
class TapCashParserTest {

    private class FakeCard(private val answers: Map<String, String>) : ApduChannel {
        val sent = mutableListOf<String>()
        override fun transceive(command: ByteArray): ByteArray {
            val c = command.toHexString()
            sent.add(c)
            val a = answers[c] ?: "6A82"
            return a.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }
    }

    // Version 01, status 00, balance 87.500 (0x0155CC), then the rest of a purse with the CAN at bytes 8..15.
    private val purse = "01 00 0155CC 000000 6013500012345678 " + "00".repeat(24)

    // Payment of 4.000 on 20/11/2026 07:42:11 WIB, top up of 50.000 on 18/11/2026 12:05:00 WIB.
    private val log = "30 FFF060 3BFA0953 4255532031323300" + "76 00C350 3BF7A3EC 0102030405060708"

    @Test
    fun readsBalanceAndLogWithoutASelect() {
        val card = FakeCard(mapOf(
            "9032030000" to purse.replace(" ", "") + "9000",
            "90320300010000" to log.replace(" ", "") + "9000",
        ))
        val r = TapCashParser().parseChannel(card, "04A1B2C3", StringBuilder())!!

        assertEquals("BNI TapCash", r.cardName)
        assertTrue(r.balanceKnown)
        assertEquals(87_500.0, r.balance, 0.0)

        val (pay, top) = r.transactionHistory
        assertEquals("Payment", pay.type)
        assertEquals(4_000.0, pay.amount, 0.0)
        assertEquals("20/11/2026 07:42:11", pay.date)
        assertEquals("BUS 123", pay.location)

        assertEquals("Top Up", top.type)
        assertEquals(50_000.0, top.amount, 0.0)
        assertEquals("18/11/2026 12:05:00", top.date)
        assertEquals("0102030405060708", top.terminalId)
    }

    @Test
    fun retriesWithTheLengthTheCardAsksFor() {
        val card = FakeCard(mapOf(
            "9032030000" to "6C20",
            "9032030020" to purse.replace(" ", "") + "9000",
        ))
        val r = TapCashParser().parseChannel(card, "", StringBuilder())!!
        assertEquals(87_500.0, r.balance, 0.0)
        assertEquals(emptyList<Any>(), r.transactionHistory)
    }

    @Test
    fun ignoresALogReadThatReturnsThePurseAgain() {
        val p = purse.replace(" ", "") + "9000"
        val card = FakeCard(mapOf("9032030000" to p, "90320300010000" to p))
        val r = TapCashParser().parseChannel(card, "", StringBuilder())!!
        assertEquals(emptyList<Any>(), r.transactionHistory)
    }

    @Test
    fun leavesOtherCardsAlone() {
        val card = FakeCard(emptyMap())
        assertNull(TapCashParser().parseChannel(card, "", StringBuilder()))
        // Only selects and reads were sent.
        assertTrue(card.sent.all { it.startsWith("00A40400") || it.startsWith("903203") })
    }
}
