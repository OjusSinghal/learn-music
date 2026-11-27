package com.ojussinghal.learnmusic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MidiFileParserTest {

    private fun repoRoot(): File {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(4) {
            if (File(dir, "samples/amazing_grace.mid").exists()) return dir
            dir = dir.parentFile ?: dir
        }
        error("Could not locate repository root from ${System.getProperty("user.dir")}")
    }

    @Test
    fun parsesAmazingGraceMidiInto61KeySong() {
        val midiFile = File(repoRoot(), "samples/amazing_grace.mid")
        assertTrue("Expected samples/amazing_grace.mid to exist", midiFile.exists())

        val parsed = MidiFileParser.parse(midiFile.readBytes())
        assertFalse("Unexpected error: ${parsed.optString("error")}", parsed.has("error"))

        val notes = parsed.getJSONArray("notes")
        assertTrue("Expected parsed notes > 40, got ${notes.length()}", notes.length() > 40)
        assertEquals(notes.length(), parsed.getInt("total_notes"))
        assertTrue("Expected positive BPM", parsed.getDouble("bpm") > 40.0)

        for (i in 0 until notes.length()) {
            val n = notes.getJSONObject(i)
            val pitch = n.getInt("pitch")
            assertTrue("Pitch $pitch outside 61-key [36..96]", pitch in 36..96)
            assertTrue("Duration < 0.14s", n.getDouble("duration") >= 0.14)
            assertTrue("Negative onset time", n.getDouble("time") >= 0.0)
        }
    }

    @Test
    fun rejectsCorruptMidiHeader() {
        val parsed = MidiFileParser.parse("NOT_A_MIDI".toByteArray())
        assertTrue(parsed.has("error"))
    }

    @Test
    fun midiStreamParserHandlesRunningStatusSysExAndRealtime() {
        val noteOns = mutableListOf<Pair<Int, Int>>()
        val noteOffs = mutableListOf<Int>()
        val parser = AndroidMidiBridge.MidiStreamParser(
            onNoteOn = { n, v -> noteOns.add(n to v) },
            onNoteOff = { n -> noteOffs.add(n) }
        )

        // Note On C4 vel=100, running status E4 vel=90, realtime clock 0xF8 interleaved,
        // running status C4 vel=0 (note off), SysEx ignored, explicit Note Off E4
        val packet = byteArrayOf(
            0x90.toByte(), 60, 100,
            64, 0xF8.toByte(), 90,
            60, 0,
            0xF0.toByte(), 0x7E, 0x7F, 0x06, 0x01, 0xF7.toByte(),
            0x80.toByte(), 64, 0
        )
        parser.feed(packet, 0, packet.size)

        assertEquals(listOf(60 to 100, 64 to 90), noteOns)
        assertEquals(listOf(60, 64), noteOffs)
    }
}
