package com.ojussinghal.learnmusic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

class AcousticCalibratorTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private fun repoRoot(): File {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(4) {
            if (File(dir, "audio_dataset/samples/step_01_silence.wav").exists()) return dir
            dir = dir.parentFile ?: dir
        }
        error("Could not locate repository root from ${System.getProperty("user.dir")}")
    }

    private fun synthesizeWavFile(file: File, sampleRate: Int, durationSec: Double, midi: Int?) {
        val numSamples = (sampleRate * durationSec).toInt()
        val pcm = ShortArray(numSamples)
        if (midi == null) {
            // Very low room floor noise
            var seed = 42L
            for (i in 0 until numSamples) {
                seed = (seed * 1103515245L + 12345L) and 0x7FFFFFFFL
                val noise = ((seed.toDouble() / 0x7FFFFFFFL) * 2.0 - 1.0) * 0.0015
                pcm[i] = (noise * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
            }
        } else {
            val f0 = 440.0 * 2.0.pow((midi - 69.0) / 12.0)
            for (i in 0 until numSamples) {
                val t = i.toDouble() / sampleRate
                val env = (t / 0.008).coerceAtMost(1.0) * exp(-t * 1.4)
                val v = env * (
                    0.35 * sin(2.0 * PI * f0 * t) +
                        0.15 * sin(2.0 * PI * 2.0 * f0 * t) +
                        0.06 * sin(2.0 * PI * 3.0 * f0 * t) +
                        0.025 * sin(2.0 * PI * 4.0 * f0 * t)
                    )
                pcm[i] = (v * 32767.0).toInt().coerceIn(-32768, 32767).toShort()
            }
        }

        val dataBytes = numSamples * 2
        val baos = ByteArrayOutputStream(44 + dataBytes)
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray(Charsets.US_ASCII))
        header.putInt(36 + dataBytes)
        header.put("WAVE".toByteArray(Charsets.US_ASCII))
        header.put("fmt ".toByteArray(Charsets.US_ASCII))
        header.putInt(16)
        header.putShort(1) // PCM
        header.putShort(1) // Mono
        header.putInt(sampleRate)
        header.putInt(sampleRate * 2)
        header.putShort(2)
        header.putShort(16)
        header.put("data".toByteArray(Charsets.US_ASCII))
        header.putInt(dataBytes)
        baos.write(header.array())

        val sampleBuf = ByteBuffer.allocate(dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        for (s in pcm) sampleBuf.putShort(s)
        baos.write(sampleBuf.array())
        file.writeBytes(baos.toByteArray())
    }

    @Test
    fun calibrates61KeyPianoFromRealRepoWavs() {
        val repoSamples = File(repoRoot(), "audio_dataset/samples")
        val workDir = tempFolder.newFolder("piano_samples")

        val sampleSpecs = listOf(
            Triple("step_01_silence.wav", "silence", emptyList<Int>()),
            Triple("step_02_c2.wav", "anchor", listOf(36)),
            Triple("step_09_c4.wav", "anchor", listOf(60)),
            Triple("step_14_a4.wav", "anchor", listOf(69)),
            Triple("step_20_c7.wav", "anchor", listOf(96))
        )

        val manifestSamples = JSONArray()
        for ((fname, cat, midis) in sampleSpecs) {
            val src = File(repoSamples, fname)
            assertTrue("Expected real repo sample $fname", src.exists())
            src.copyTo(File(workDir, fname), overwrite = true)
            manifestSamples.put(
                JSONObject()
                    .put("id", fname.removeSuffix(".wav"))
                    .put("filename", fname)
                    .put("category", cat)
                    .put("expectedMidis", JSONArray(midis))
            )
        }

        val manifest = JSONObject().put("samples", manifestSamples)
        val profile = AcousticCalibrator.calibratePiano(workDir, manifest)

        assertTrue(profile.getBoolean("calibrated"))
        val silence = profile.getJSONObject("silenceProfile")
        assertEquals(400, silence.getJSONArray("noiseBands").length())
        assertTrue(silence.getDouble("recommendedRmsGate") >= 0.0065)

        val templates = profile.getJSONObject("templates")
        val inharm = profile.getJSONObject("inharmonicity")
        assertEquals(61, templates.length())
        assertEquals(61, inharm.length())

        for (midi in 36..96) {
            val tArr = templates.getJSONArray(midi.toString())
            assertEquals(10, tArr.length())
            var normSq = 0.0
            for (h in 0 until 10) {
                val w = tArr.getDouble(h)
                normSq += w * w
            }
            assertEquals("Expected unit L2 norm for MIDI $midi", 1.0, sqrt(normSq), 0.02)
        }
        assertEquals(4, profile.getJSONObject("benchmarkSummary").getInt("anchorsCalibrated"))
    }

    @Test
    fun calibratesUkuleleFromRecordedWavs() {
        val workDir = tempFolder.newFolder("uku_samples")
        val specs = listOf(
            Triple("uku_step_01_silence.wav", "silence", null),
            Triple("uku_step_02_open_g4.wav", "open_strings", 67),
            Triple("uku_step_03_open_c4.wav", "open_strings", 60),
            Triple("uku_step_04_open_e4.wav", "open_strings", 64),
            Triple("uku_step_05_open_a4.wav", "open_strings", 69),
            Triple("uku_step_15_fret_a5.wav", "fretboard_anchors", 81)
        )

        val manifestSamples = JSONArray()
        for ((fname, cat, midi) in specs) {
            synthesizeWavFile(File(workDir, fname), 48000, 1.0, midi)
            val exp = if (midi != null) listOf(midi) else emptyList()
            manifestSamples.put(
                JSONObject()
                    .put("id", fname.removeSuffix(".wav"))
                    .put("filename", fname)
                    .put("category", cat)
                    .put("expectedMidis", JSONArray(exp))
            )
        }

        val profile = AcousticCalibrator.calibrateUkulele(workDir, JSONObject().put("samples", manifestSamples))
        assertTrue(profile.getBoolean("calibrated"))
        assertEquals("ukulele", profile.getJSONObject("instrument").getString("type"))
        assertEquals(30, profile.getJSONObject("templates").length())
        assertEquals(30, profile.getJSONObject("inharmonicity").length())
        assertEquals(8, profile.getJSONObject("templates").getJSONArray("69").length())
        assertEquals(5, profile.getJSONObject("benchmarkSummary").getInt("anchorsCalibrated"))
    }

    @Test(expected = IllegalStateException::class)
    fun ukuleleCalibrationFailsCleanlyWithZeroWavs() {
        val emptyDir = tempFolder.newFolder("empty_uku")
        AcousticCalibrator.calibrateUkulele(emptyDir, JSONObject().put("samples", JSONArray()))
    }
}
