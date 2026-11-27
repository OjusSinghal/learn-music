package com.ojussinghal.learnmusic

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pure-Kotlin Standard MIDI File (SMF 0 & 1) parser mirroring server.py's MidiParser.
 * Produces barline-aligned Song JSON clamped to the 61-key piano range [36 (C2), 96 (C7)].
 */
object MidiFileParser {
    private data class RawMidiNote(
        val pitch: Int,
        val tick: Int,
        val durationTicks: Int,
        val track: Int
    )

    private val MAJOR_KEY_MAP = mapOf(
        -7 to "Cb", -6 to "Gb", -5 to "Db", -4 to "Ab", -3 to "Eb", -2 to "Bb", -1 to "F",
        0 to "C", 1 to "G", 2 to "D", 3 to "A", 4 to "E", 5 to "B", 6 to "F#", 7 to "C#"
    )

    private val MINOR_KEY_MAP = mapOf(
        -7 to "Abm", -6 to "Ebm", -5 to "Bbm", -4 to "Fm", -3 to "Cm", -2 to "Gm", -1 to "Dm",
        0 to "Am", 1 to "Em", 2 to "Bm", 3 to "F#m", 4 to "C#m", 5 to "G#m", 6 to "D#m", 7 to "A#m"
    )

    fun clamp61(midi: Int): Int {
        var p = midi
        while (p < 36) p += 12
        while (p > 96) p -= 12
        return p
    }

    fun parse(midiBytes: ByteArray): JSONObject {
        return try {
            val stream = ByteArrayInputStream(midiBytes)
            val headerChunk = readBytes(stream, 4)
            if (headerChunk.decodeToString() != "MThd") {
                return JSONObject().put("error", "Invalid MIDI file (header mismatch)")
            }

            val headerLength = readUInt32(stream)
            readUInt16(stream) // format
            val numTracks = readUInt16(stream)
            val division = readUInt16(stream)
            if (headerLength > 6) {
                stream.skip((headerLength - 6).toLong())
            }

            val ticksPerBeat = if ((division and 0x8000) == 0) max(1, division) else 480
            val allNotes = mutableListOf<RawMidiNote>()
            var tempo = 500000 // default 120 BPM
            var beatsPerMeasure = 4
            var beatType = 4
            var keySignature = "C"
            var songTitle = "Imported MIDI Song"

            for (trackIdx in 0 until numTracks) {
                val trackChunk = readBytes(stream, 4)
                if (trackChunk.size < 4 || trackChunk.decodeToString() != "MTrk") break
                val trackLen = readUInt32(stream)
                val trackData = readBytes(stream, trackLen)
                var pos = 0
                var currentTick = 0
                var runningStatus = 0
                val activeNotes = HashMap<Int, Int>()

                while (pos < trackData.size) {
                    var delta = 0
                    while (pos < trackData.size) {
                        val b = trackData[pos++].toInt() and 0xFF
                        delta = (delta shl 7) or (b and 0x7F)
                        if ((b and 0x80) == 0) break
                    }
                    currentTick += delta
                    if (pos >= trackData.size) break

                    val firstByte = trackData[pos].toInt() and 0xFF
                    val status = if (firstByte >= 0x80) {
                        pos++
                        if (firstByte < 0xF0) runningStatus = firstByte
                        firstByte
                    } else {
                        runningStatus
                    }

                    if (status == 0xFF) {
                        if (pos >= trackData.size) break
                        val metaType = trackData[pos++].toInt() and 0xFF
                        var mLen = 0
                        while (pos < trackData.size) {
                            val b = trackData[pos++].toInt() and 0xFF
                            mLen = (mLen shl 7) or (b and 0x7F)
                            if ((b and 0x80) == 0) break
                        }
                        val endPos = (pos + mLen).coerceAtMost(trackData.size)
                        val mData = trackData.copyOfRange(pos, endPos)
                        pos = endPos

                        when {
                            metaType == 0x51 && mData.size == 3 -> {
                                tempo = ((mData[0].toInt() and 0xFF) shl 16) or
                                    ((mData[1].toInt() and 0xFF) shl 8) or
                                    (mData[2].toInt() and 0xFF)
                            }
                            metaType == 0x58 && mData.size >= 2 -> {
                                val num = mData[0].toInt() and 0xFF
                                val denPow = mData[1].toInt() and 0xFF
                                if (num > 0) {
                                    beatsPerMeasure = num
                                    beatType = 1 shl denPow
                                }
                            }
                            metaType == 0x59 && mData.size >= 2 -> {
                                val rawSf = mData[0].toInt() and 0xFF
                                val sf = if (rawSf > 127) rawSf - 256 else rawSf
                                val mi = mData[1].toInt() and 0xFF
                                val kMap = if (mi == 1) MINOR_KEY_MAP else MAJOR_KEY_MAP
                                kMap[sf]?.let { keySignature = it }
                            }
                            metaType == 0x03 -> {
                                val txt = mData.toString(Charsets.UTF_8).trim()
                                if (txt.isNotEmpty() && songTitle == "Imported MIDI Song") {
                                    songTitle = txt
                                }
                            }
                        }
                    } else if (status == 0xF0 || status == 0xF7) {
                        var sLen = 0
                        while (pos < trackData.size) {
                            val b = trackData[pos++].toInt() and 0xFF
                            sLen = (sLen shl 7) or (b and 0x7F)
                            if ((b and 0x80) == 0) break
                        }
                        pos = (pos + sLen).coerceAtMost(trackData.size)
                    } else {
                        when (status and 0xF0) {
                            0x90 -> {
                                if (pos + 1 >= trackData.size) break
                                val noteNum = trackData[pos++].toInt() and 0xFF
                                val vel = trackData[pos++].toInt() and 0xFF
                                if (vel > 0) {
                                    activeNotes[noteNum] = currentTick
                                } else {
                                    activeNotes.remove(noteNum)?.let { startTick ->
                                        val dur = max(currentTick - startTick, ticksPerBeat / 8)
                                        allNotes.add(RawMidiNote(noteNum, startTick, dur, trackIdx))
                                    }
                                }
                            }
                            0x80 -> {
                                if (pos + 1 >= trackData.size) break
                                val noteNum = trackData[pos++].toInt() and 0xFF
                                pos++ // release vel
                                activeNotes.remove(noteNum)?.let { startTick ->
                                    val dur = max(currentTick - startTick, ticksPerBeat / 8)
                                    allNotes.add(RawMidiNote(noteNum, startTick, dur, trackIdx))
                                }
                            }
                            0xA0, 0xB0, 0xE0 -> pos = (pos + 2).coerceAtMost(trackData.size)
                            0xC0, 0xD0 -> pos = (pos + 1).coerceAtMost(trackData.size)
                        }
                    }
                }
            }

            val quarterBpm = 60_000_000.0 / max(1, tempo)
            val effectiveBpm = ((quarterBpm * (beatType / 4.0)) * 10000.0).roundToInt() / 10000.0
            val secPerTick = (tempo / 1_000_000.0) / ticksPerBeat
            val ordered = allNotes.sortedWith(compareBy<RawMidiNote> { it.tick }.thenBy { it.pitch })
            val ticksPerMeasure = max(1, (ticksPerBeat * beatsPerMeasure * (4.0 / beatType)).roundToInt())
            val firstTick = ordered.firstOrNull()?.tick ?: 0
            val baseTick = (firstTick / ticksPerMeasure) * ticksPerMeasure
            val sixteenthTicks = max(1.0, ticksPerBeat / 4.0)

            val trackMeans = ordered.groupBy { it.track }.mapValues { (_, list) ->
                list.map { clamp61(it.pitch) }.average()
            }
            val splitTrackHands = trackMeans.size == 2 &&
                abs(trackMeans.values.max() - trackMeans.values.min()) >= 6.0
            val lowTrack = if (splitTrackHands) trackMeans.minByOrNull { it.value }?.key else null

            val notesArray = JSONArray()
            for (n in ordered) {
                val timeSec = ((n.tick - baseTick) * secPerTick * 10000.0).roundToInt() / 10000.0
                val rawDurSec = n.durationTicks * secPerTick
                val quantizedNearest = (n.durationTicks / sixteenthTicks).roundToInt() * sixteenthTicks
                val isQuantized = abs(n.durationTicks - quantizedNearest) <= 2.0
                val artDur = if (isQuantized) max(0.15, rawDurSec - 0.025) else max(0.15, rawDurSec)
                val roundedDur = (artDur * 10000.0).roundToInt() / 10000.0
                val clampedPitch = clamp61(n.pitch)
                val hand = when {
                    splitTrackHands -> if (n.track == lowTrack) "left" else "right"
                    clampedPitch < 60 -> "left"
                    else -> "right"
                }
                val clef = if (hand == "left") "bass" else "treble"
                notesArray.put(
                    JSONObject()
                        .put("pitch", clampedPitch)
                        .put("time", timeSec)
                        .put("duration", roundedDur)
                        .put("hand", hand)
                        .put("clef", clef)
                )
            }

            JSONObject()
                .put("title", songTitle)
                .put("bpm", effectiveBpm)
                .put("beatsPerMeasure", beatsPerMeasure)
                .put("timeSignature", JSONArray().put(beatsPerMeasure).put(beatType))
                .put("keySignature", keySignature)
                .put("ticks_per_beat", ticksPerBeat)
                .put("total_notes", notesArray.length())
                .put("notes", notesArray)
        } catch (e: Exception) {
            JSONObject().put("error", "Error parsing MIDI: ${e.message}")
        }
    }

    private fun readBytes(stream: ByteArrayInputStream, count: Int): ByteArray {
        if (count <= 0) return ByteArray(0)
        val out = ByteArray(count)
        var read = 0
        while (read < count) {
            val n = stream.read(out, read, count - read)
            if (n <= 0) return out.copyOf(read)
            read += n
        }
        return out
    }

    private fun readUInt16(stream: ByteArrayInputStream): Int {
        val b0 = stream.read()
        val b1 = stream.read()
        if (b0 < 0 || b1 < 0) return 0
        return (b0 shl 8) or b1
    }

    private fun readUInt32(stream: ByteArrayInputStream): Int {
        val b0 = stream.read()
        val b1 = stream.read()
        val b2 = stream.read()
        val b3 = stream.read()
        if (b0 < 0 || b1 < 0 || b2 < 0 || b3 < 0) return 0
        return (b0 shl 24) or (b1 shl 16) or (b2 shl 8) or b3
    }
}
