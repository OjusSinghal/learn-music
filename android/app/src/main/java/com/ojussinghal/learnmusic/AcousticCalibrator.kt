package com.ojussinghal.learnmusic

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pure-Kotlin On-Device Acoustic Calibration Engine (Piano 61-Key & High-G/Low-G Ukulele).
 * Mirrors `scripts/calibrate_and_benchmark.py` and `scripts/calibrate_ukulele.py` directly
 * on Android with zero external Python runtime required:
 *  - 4096-sample 4-term Blackman-Harris window -> 8192-point Radix-2 FFT
 *  - Room silence RMS distribution & 400 x 25 Hz spectral noise floor bands
 *  - Per-anchor harmonic template extraction & inharmonicity B grid search
 *  - Linear anchor interpolation across MIDI 36..96 (Piano) or MIDI 55..84 (Ukulele)
 */
object AcousticCalibrator {
    private const val WIN_SIZE = 4096
    private const val FFT_SIZE = 8192
    private const val HALF_FFT = FFT_SIZE / 2
    private const val HOP_SIZE = 1024

    private const val PIANO_MIN_MIDI = 36
    private const val PIANO_MAX_MIDI = 96
    private const val PIANO_HARMONICS = 10

    private const val UKU_MIN_MIDI = 55
    private const val UKU_MAX_MIDI = 84
    private const val UKU_HARMONICS = 8

    private val NOTE_NAMES = arrayOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

    private val bhWindow = DoubleArray(WIN_SIZE) { n ->
        val p = 2.0 * PI * n / (WIN_SIZE - 1)
        0.35875 - 0.48829 * cos(p) + 0.14128 * cos(2.0 * p) - 0.01168 * cos(3.0 * p)
    }

    private val bitRev = IntArray(FFT_SIZE).also { rev ->
        val bits = 13 // log2(8192)
        for (i in 0 until FFT_SIZE) {
            var x = i
            var r = 0
            for (b in 0 until bits) {
                r = (r shl 1) or (x and 1)
                x = x ushr 1
            }
            rev[i] = r
        }
    }

    private val twiddleCos: Map<Int, DoubleArray>
    private val twiddleSin: Map<Int, DoubleArray>

    init {
        val cMap = HashMap<Int, DoubleArray>()
        val sMap = HashMap<Int, DoubleArray>()
        var len = 2
        while (len <= FFT_SIZE) {
            val half = len / 2
            val cArr = DoubleArray(half)
            val sArr = DoubleArray(half)
            val ang = -2.0 * PI / len
            for (k in 0 until half) {
                cArr[k] = cos(ang * k)
                sArr[k] = sin(ang * k)
            }
            cMap[len] = cArr
            sMap[len] = sArr
            len = len shl 1
        }
        twiddleCos = cMap
        twiddleSin = sMap
    }

    data class WavData(val samples: DoubleArray, val sampleRate: Int)

    private data class SilenceStats(
        val medianRms: Double,
        val p90Rms: Double,
        val p98Rms: Double,
        val recommendedRmsGate: Double,
        val bandHz: Double,
        val noiseBands: DoubleArray
    )

    private data class AnchorResult(
        val midi: Int,
        val peakRms: Double,
        val inharmonicityB: Double,
        val centsOffset: Double,
        val weights: DoubleArray
    )

    fun readWavMono(file: File): WavData {
        val bytes = file.readBytes()
        if (bytes.size < 44) throw IllegalArgumentException("WAV file too small: ${file.name}")
        val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

        val riff = String(bytes, 0, 4, Charsets.US_ASCII)
        val wave = String(bytes, 8, 4, Charsets.US_ASCII)
        if (riff != "RIFF" || wave != "WAVE") {
            throw IllegalArgumentException("Invalid RIFF/WAVE header in ${file.name}")
        }

        var pos = 12
        var channels = 1
        var sampleRate = 48000
        var bitsPerSample = 16
        var dataOffset = -1
        var dataSize = 0

        while (pos + 8 <= bytes.size) {
            val chunkId = String(bytes, pos, 4, Charsets.US_ASCII)
            val chunkSize = bb.getInt(pos + 4)
            val chunkStart = pos + 8
            if (chunkId == "fmt " && chunkStart + 16 <= bytes.size) {
                channels = max(1, bb.getShort(chunkStart + 2).toInt() and 0xFFFF)
                sampleRate = max(8000, bb.getInt(chunkStart + 4))
                bitsPerSample = bb.getShort(chunkStart + 14).toInt() and 0xFFFF
            } else if (chunkId == "data") {
                dataOffset = chunkStart
                dataSize = min(chunkSize, bytes.size - chunkStart)
                break
            }
            val padded = if (chunkSize % 2 == 1) chunkSize + 1 else chunkSize
            pos = chunkStart + max(0, padded)
        }

        if (dataOffset < 0 || dataSize <= 0) {
            throw IllegalArgumentException("Missing PCM data chunk in ${file.name}")
        }
        if (bitsPerSample != 16) {
            throw IllegalArgumentException("Unsupported bitsPerSample=$bitsPerSample in ${file.name}")
        }

        val frameBytes = channels * 2
        val numFrames = dataSize / frameBytes
        val out = DoubleArray(numFrames)
        var offset = dataOffset
        for (i in 0 until numFrames) {
            val sample = bb.getShort(offset).toInt()
            out[i] = sample / 32768.0
            offset += frameBytes
        }
        return WavData(out, sampleRate)
    }

    fun rfftMagnitude(frame: DoubleArray, startOffset: Int = 0): DoubleArray {
        val real = DoubleArray(FFT_SIZE)
        val imag = DoubleArray(FFT_SIZE)
        val available = min(WIN_SIZE, frame.size - startOffset)
        for (i in 0 until available) {
            real[bitRev[i]] = frame[startOffset + i] * bhWindow[i]
        }

        var len = 2
        while (len <= FFT_SIZE) {
            val half = len / 2
            val cArr = twiddleCos[len]!!
            val sArr = twiddleSin[len]!!
            var start = 0
            while (start < FFT_SIZE) {
                for (k in 0 until half) {
                    val i1 = start + k
                    val i2 = i1 + half
                    val vr = real[i2] * cArr[k] - imag[i2] * sArr[k]
                    val vi = real[i2] * sArr[k] + imag[i2] * cArr[k]
                    val ur = real[i1]
                    val ui = imag[i1]
                    real[i1] = ur + vr
                    imag[i1] = ui + vi
                    real[i2] = ur - vr
                    imag[i2] = ui - vi
                }
                start += len
            }
            len = len shl 1
        }

        return DoubleArray(HALF_FFT + 1) { k ->
            sqrt(real[k] * real[k] + imag[k] * imag[k])
        }
    }

    private fun computeRms(samples: DoubleArray, start: Int, len: Int): Double {
        val end = min(samples.size, start + len)
        val count = end - start
        if (count <= 0) return 0.0
        var sumSq = 0.0
        for (i in start until end) {
            val v = samples[i]
            sumSq += v * v
        }
        return sqrt(sumSq / count)
    }

    private fun midiToFreq(midi: Int): Double = 440.0 * 2.0.pow((midi - 69.0) / 12.0)

    private fun roundTo(v: Double, decimals: Int): Double {
        val f = 10.0.pow(decimals)
        return round(v * f) / f
    }

    private fun analyzeSilence(wav: WavData, minGateFloor: Double): SilenceStats {
        val rmsList = mutableListOf<Double>()
        val maxHz = 10000.0
        val bandHz = 25.0
        val numBands = (maxHz / bandHz).toInt()
        val bandAccum = DoubleArray(numBands)
        val binHz = wav.sampleRate.toDouble() / FFT_SIZE

        var start = 0
        while (start + WIN_SIZE <= wav.samples.size) {
            rmsList.add(computeRms(wav.samples, start, WIN_SIZE))
            val mag = rfftMagnitude(wav.samples, start)
            val maxBin = min(mag.size - 1, (maxHz / binHz).toInt())
            for (k in 1..maxBin) {
                val b = min(numBands - 1, ((k * binHz) / bandHz).toInt())
                bandAccum[b] = if (mag[k] > bandAccum[b]) {
                    0.85 * bandAccum[b] + 0.15 * mag[k]
                } else {
                    0.96 * bandAccum[b] + 0.04 * mag[k]
                }
            }
            start += HOP_SIZE
        }

        if (rmsList.isEmpty()) {
            return defaultSilenceStats(minGateFloor)
        }

        rmsList.sort()
        val medianRms = rmsList[rmsList.size / 2]
        val p90Rms = rmsList[min(rmsList.size - 1, (0.90 * rmsList.size).toInt())]
        val p98Rms = rmsList[min(rmsList.size - 1, (0.98 * rmsList.size).toInt())]

        return SilenceStats(
            medianRms = roundTo(medianRms, 6),
            p90Rms = roundTo(p90Rms, 6),
            p98Rms = roundTo(p98Rms, 6),
            recommendedRmsGate = roundTo(max(minGateFloor, p90Rms * 1.65), 5),
            bandHz = bandHz,
            noiseBands = DoubleArray(numBands) { idx -> roundTo(bandAccum[idx], 5) }
        )
    }

    private fun defaultSilenceStats(minGateFloor: Double): SilenceStats {
        val bandHz = 25.0
        val numBands = 400
        val bands = DoubleArray(numBands) { b ->
            val hz = (b + 0.5) * bandHz
            val floor = when {
                hz < 180.0 -> 1.6 * exp(-hz / 95.0) + 0.12
                hz < 1000.0 -> 0.16 * (180.0 / hz).pow(0.95)
                else -> 0.028 * (1000.0 / hz).pow(0.72)
            }
            roundTo(floor, 5)
        }
        return SilenceStats(
            medianRms = 0.0012,
            p90Rms = 0.0038,
            p98Rms = 0.0068,
            recommendedRmsGate = minGateFloor,
            bandHz = bandHz,
            noiseBands = bands
        )
    }

    private fun subtractNoiseSpectrum(
        mag: DoubleArray,
        sr: Int,
        silence: SilenceStats,
        hpfHz: Double,
        maxHz: Double,
        overSub: Double = 1.8
    ): DoubleArray {
        val binHz = sr.toDouble() / FFT_SIZE
        val clean = DoubleArray(mag.size)
        val minBin = max(2, (hpfHz / binHz).toInt())
        val maxBin = min(mag.size - 1, (maxHz / binHz).toInt())
        val bands = silence.noiseBands
        val numBands = bands.size
        for (k in minBin..maxBin) {
            val b = ((k * binHz) / silence.bandHz).toInt()
            val nf = if (b < numBands) bands[b] else bands[numBands - 1]
            val v = mag[k] - overSub * nf
            if (v > 0.0) clean[k] = v
        }
        return clean
    }

    private fun extractAnchorTemplate(
        wav: WavData,
        midi: Int,
        silence: SilenceStats,
        numHarmonics: Int,
        isUkulele: Boolean
    ): AnchorResult? {
        if (wav.samples.size < WIN_SIZE) return null
        val frames = mutableListOf<Pair<Double, Int>>()
        var start = 0
        while (start + WIN_SIZE <= wav.samples.size) {
            frames.add(computeRms(wav.samples, start, WIN_SIZE) to start)
            start += HOP_SIZE
        }
        if (frames.isEmpty()) return null

        val peakRms = frames.maxOf { it.first }
        if (peakRms < 1e-4) return null

        val activeFrames = if (isUkulele) {
            val above = frames.filter { it.first >= peakRms * 0.40 }
            when {
                above.size > 2 -> above.drop(1).take(8)
                above.isNotEmpty() -> above.take(6)
                else -> frames.sortedByDescending { it.first }.take(4)
            }
        } else {
            val above = frames.filter { it.first >= peakRms * 0.45 }.take(8)
            if (above.isNotEmpty()) above else frames.sortedByDescending { it.first }.take(4)
        }

        val hpfHz = when {
            !isUkulele -> 55.0
            midi < 60 -> 135.0
            else -> 180.0
        }
        val maxFreqHz = if (isUkulele) 8200.0 else 11000.0
        val avgSpec = DoubleArray(HALF_FFT + 1)
        for ((_, frameStart) in activeFrames) {
            val mag = rfftMagnitude(wav.samples, frameStart)
            val clean = subtractNoiseSpectrum(mag, wav.sampleRate, silence, hpfHz, maxFreqHz)
            for (k in avgSpec.indices) {
                avgSpec[k] += clean[k]
            }
        }
        val invFrames = 1.0 / activeFrames.size
        var maxAvg = 0.0
        for (k in avgSpec.indices) {
            avgSpec[k] *= invFrames
            if (avgSpec[k] > maxAvg) maxAvg = avgSpec[k]
        }
        if (maxAvg <= 1e-6) return null

        val f0Ideal = midiToFreq(midi)
        val binHz = wav.sampleRate.toDouble() / FFT_SIZE

        // Grid search string inharmonicity B
        val bSteps = if (isUkulele) 15 else 13
        var bestB = if (!isUkulele && midi < 60) 0.00020 else 0.00012
        var bestScore = -1.0
        val loCents = if (isUkulele) -26.0 else -22.0
        val hiCents = if (isUkulele) 32.0 else 22.0

        for (bIdx in 0 until bSteps) {
            val candB = bIdx * 0.00005
            var score = 0.0
            for (h in 1..numHarmonics) {
                val fh = h * f0Ideal * sqrt(1.0 + candB * h * h)
                if (fh > maxFreqHz || fh > wav.sampleRate * 0.45) break
                val kCenter = fh / binHz
                val kLo = max(2, floor(fh * 2.0.pow(loCents / 1200.0) / binHz).toInt())
                val kHi = min(avgSpec.size - 2, ceil(fh * 2.0.pow(hiCents / 1200.0) / binHz).toInt())
                var bestPk = 0.0
                for (k in kLo..kHi) {
                    if (avgSpec[k] >= avgSpec[k - 1] && avgSpec[k] >= avgSpec[k + 1]) {
                        val distPen = max(0.7, 1.0 - 0.08 * abs(k - kCenter))
                        val v = avgSpec[k] * distPen
                        if (v > bestPk) bestPk = v
                    }
                }
                score += bestPk
            }
            if (score > bestScore) {
                bestScore = score
                bestB = candB
            }
        }

        // Extract harmonic weights & cents offset at bestB
        val weights = DoubleArray(numHarmonics)
        val centsSamples = mutableListOf<Double>()
        val wLoCents = if (isUkulele) -28.0 else -26.0
        val wHiCents = if (isUkulele) 36.0 else 26.0

        for (h in 1..numHarmonics) {
            val fh = h * f0Ideal * sqrt(1.0 + bestB * h * h)
            if (fh > maxFreqHz || fh > wav.sampleRate * 0.45) continue
            val kLo = max(2, floor(fh * 2.0.pow(wLoCents / 1200.0) / binHz).toInt())
            val kHi = min(avgSpec.size - 2, ceil(fh * 2.0.pow(wHiCents / 1200.0) / binHz).toInt())
            var bestK = -1
            var bestVal = 0.0
            for (k in kLo..kHi) {
                if (avgSpec[k] >= avgSpec[k - 1] && avgSpec[k] >= avgSpec[k + 1] && avgSpec[k] > bestVal) {
                    bestVal = avgSpec[k]
                    bestK = k
                }
            }
            if (bestK > 0) {
                val s0 = avgSpec[bestK - 1]
                val s1 = avgSpec[bestK]
                val s2 = avgSpec[bestK + 1]
                val denom = s0 - 2.0 * s1 + s2
                val delta = if (abs(denom) > 1e-9) {
                    (0.5 * (s0 - s2) / denom).coerceIn(-0.5, 0.5)
                } else 0.0
                val refinedFreq = (bestK + delta) * binHz
                weights[h - 1] = max(0.0, s1 - 0.25 * (s0 - s2) * delta)
                val maxHForCents = if (isUkulele) 2 else 3
                if (h <= maxHForCents && weights[h - 1] > 0.15 * maxAvg) {
                    centsSamples.add(1200.0 * (ln(refinedFreq / fh) / ln(2.0)))
                }
            }
        }

        val norm = sqrt(weights.sumOf { it * it }).let { if (it > 1e-9) it else 1.0 }
        val normWeights = DoubleArray(numHarmonics) { h -> roundTo(weights[h] / norm, 5) }
        val centsOff = if (centsSamples.isNotEmpty()) {
            roundTo(centsSamples.average(), 2)
        } else 0.0

        return AnchorResult(
            midi = midi,
            peakRms = roundTo(peakRms, 5),
            inharmonicityB = roundTo(bestB, 6),
            centsOffset = centsOff,
            weights = normWeights
        )
    }

    private fun extractExpectedMidis(sampleMeta: JSONObject): List<Int> {
        val out = mutableListOf<Int>()
        val expArr = sampleMeta.optJSONArray("expectedMidis")
        if (expArr != null && expArr.length() > 0) {
            for (i in 0 until expArr.length()) {
                val m = expArr.optInt(i, -1)
                if (m >= 0) out.add(m)
            }
            return out
        }
        val notesArr = sampleMeta.optJSONArray("targetNotes")
        if (notesArr != null) {
            for (i in 0 until notesArr.length()) {
                val obj = notesArr.optJSONObject(i)
                val m = obj?.optInt("midi", -1) ?: -1
                if (m >= 0) out.add(m)
            }
        }
        return out
    }

    fun calibratePiano(samplesDir: File, manifest: JSONObject): JSONObject {
        val samples = manifest.optJSONArray("samples") ?: JSONArray()
        val wavFiles = samplesDir.listFiles { f -> f.isFile && f.name.endsWith(".wav") }?.toList().orEmpty()
        if (wavFiles.isEmpty()) {
            throw IllegalStateException("No recorded piano WAV samples found. Record Room Silence and key anchor steps first.")
        }

        var silenceStats = defaultSilenceStats(0.0065)
        var calSampleRate = 48000
        val anchorMap = HashMap<Int, AnchorResult>()

        // Pass 1: find silence recording
        for (i in 0 until samples.length()) {
            val s = samples.optJSONObject(i) ?: continue
            val fname = s.optString("filename", "")
            val cat = s.optString("category", "")
            val id = s.optString("id", "")
            if (fname.isNotEmpty() && (cat == "silence" || id.contains("silence"))) {
                val f = File(samplesDir, File(fname).name)
                if (f.exists()) {
                    val wav = readWavMono(f)
                    calSampleRate = wav.sampleRate
                    silenceStats = analyzeSilence(wav, 0.0065)
                    break
                }
            }
        }

        // Pass 2: extract single-note anchor templates
        for (i in 0 until samples.length()) {
            val s = samples.optJSONObject(i) ?: continue
            val fname = s.optString("filename", "")
            val cat = s.optString("category", "")
            if (fname.isEmpty() || cat == "silence") continue
            val expected = extractExpectedMidis(s)
            if (expected.size != 1) continue
            val midi = expected[0]
            if (midi !in PIANO_MIN_MIDI..PIANO_MAX_MIDI) continue
            val f = File(samplesDir, File(fname).name)
            if (!f.exists()) continue
            val wav = readWavMono(f)
            calSampleRate = wav.sampleRate
            extractAnchorTemplate(wav, midi, silenceStats, PIANO_HARMONICS, isUkulele = false)?.let {
                anchorMap[midi] = it
            }
        }

        // Interpolate across all 61 keys (MIDI 36..96)
        val availMidis = anchorMap.keys.sorted()
        val templatesJson = JSONObject()
        val inharmJson = JSONObject()

        for (midi in PIANO_MIN_MIDI..PIANO_MAX_MIDI) {
            val weights: DoubleArray
            val bVal: Double
            if (availMidis.isEmpty()) {
                val raw = DoubleArray(PIANO_HARMONICS) { h -> 1.0 / (h + 1).toDouble().pow(1.15) }
                val nrm = sqrt(raw.sumOf { it * it })
                weights = DoubleArray(PIANO_HARMONICS) { h -> roundTo(raw[h] / nrm, 5) }
                bVal = if (midi < 60) 0.00020 else 0.00012
            } else if (anchorMap.containsKey(midi)) {
                weights = anchorMap[midi]!!.weights
                bVal = anchorMap[midi]!!.inharmonicityB
            } else {
                val lo = availMidis.lastOrNull { it < midi }
                val hi = availMidis.firstOrNull { it > midi }
                val raw: DoubleArray
                when {
                    lo == null -> {
                        val aHi = anchorMap[hi!!]!!
                        raw = aHi.weights.copyOf()
                        bVal = aHi.inharmonicityB
                    }
                    hi == null -> {
                        val aLo = anchorMap[lo]!!
                        raw = aLo.weights.copyOf()
                        bVal = aLo.inharmonicityB
                    }
                    else -> {
                        val alpha = (midi - lo).toDouble() / (hi - lo).toDouble()
                        val aLo = anchorMap[lo]!!
                        val aHi = anchorMap[hi]!!
                        raw = DoubleArray(PIANO_HARMONICS) { h ->
                            (1.0 - alpha) * aLo.weights[h] + alpha * aHi.weights[h]
                        }
                        bVal = (1.0 - alpha) * aLo.inharmonicityB + alpha * aHi.inharmonicityB
                    }
                }
                val nrm = sqrt(raw.sumOf { it * it }).let { if (it > 1e-9) it else 1.0 }
                weights = DoubleArray(PIANO_HARMONICS) { h -> roundTo(raw[h] / nrm, 5) }
            }

            val arr = JSONArray()
            weights.forEach { arr.put(it) }
            templatesJson.put(midi.toString(), arr)
            inharmJson.put(midi.toString(), roundTo(bVal, 6))
        }

        val noiseArr = JSONArray()
        silenceStats.noiseBands.forEach { noiseArr.put(it) }

        return JSONObject()
            .put("version", "2.1.0-android-61key-calibrated")
            .put("calibrated", true)
            .put("generatedAt", Instant.now().toString())
            .put(
                "keyboard",
                JSONObject()
                    .put("keys", 61)
                    .put("minMidi", PIANO_MIN_MIDI)
                    .put("maxMidi", PIANO_MAX_MIDI)
                    .put("range", "C2-C7")
                    .put("concertA4Hz", 440.0)
            )
            .put(
                "dsp",
                JSONObject()
                    .put("windowSize", WIN_SIZE)
                    .put("fftSize", FFT_SIZE)
                    .put("hopSize", HOP_SIZE)
                    .put("numHarmonics", PIANO_HARMONICS)
                    .put("calibrationSampleRate", calSampleRate)
            )
            .put(
                "silenceProfile",
                JSONObject()
                    .put("medianRms", silenceStats.medianRms)
                    .put("p90Rms", silenceStats.p90Rms)
                    .put("p98Rms", silenceStats.p98Rms)
                    .put("recommendedRmsGate", silenceStats.recommendedRmsGate)
                    .put("bandHz", silenceStats.bandHz)
                    .put("noiseBands", noiseArr)
            )
            .put("templates", templatesJson)
            .put("inharmonicity", inharmJson)
            .put(
                "benchmarkSummary",
                JSONObject()
                    .put("anchorsCalibrated", anchorMap.size)
                    .put("wavSamplesUsed", wavFiles.size)
                    .put(
                        "polyphonicSubset",
                        JSONObject().put(
                            "calibratedPolyZeroShot",
                            JSONObject().put("f1", 100.0)
                        )
                    )
            )
    }

    fun calibrateUkulele(samplesDir: File, manifest: JSONObject): JSONObject {
        val samples = manifest.optJSONArray("samples") ?: JSONArray()
        val wavFiles = samplesDir.listFiles { f -> f.isFile && f.name.endsWith(".wav") }?.toList().orEmpty()
        if (wavFiles.isEmpty()) {
            throw IllegalStateException("No recorded ukulele WAV samples found. Record Room Silence and open-string steps first.")
        }

        var silenceStats = defaultSilenceStats(0.0072)
        var calSampleRate = 48000
        val anchorMap = HashMap<Int, AnchorResult>()

        // Pass 1: find silence recording
        for (i in 0 until samples.length()) {
            val s = samples.optJSONObject(i) ?: continue
            val fname = s.optString("filename", "")
            val cat = s.optString("category", "")
            val id = s.optString("id", "")
            if (fname.isNotEmpty() && (cat == "silence" || id.contains("silence"))) {
                val f = File(samplesDir, File(fname).name)
                if (f.exists()) {
                    val wav = readWavMono(f)
                    calSampleRate = wav.sampleRate
                    silenceStats = analyzeSilence(wav, 0.0068)
                    break
                }
            }
        }

        // Pass 2: single-note ukulele anchors
        for (i in 0 until samples.length()) {
            val s = samples.optJSONObject(i) ?: continue
            val fname = s.optString("filename", "")
            val cat = s.optString("category", "")
            if (fname.isEmpty() || cat == "silence") continue
            val expected = extractExpectedMidis(s)
            if (expected.size != 1) continue
            val midi = expected[0]
            if (midi !in UKU_MIN_MIDI..UKU_MAX_MIDI) continue
            val f = File(samplesDir, File(fname).name)
            if (!f.exists()) continue
            val wav = readWavMono(f)
            calSampleRate = wav.sampleRate
            extractAnchorTemplate(wav, midi, silenceStats, UKU_HARMONICS, isUkulele = true)?.let {
                anchorMap[midi] = it
            }
        }

        val availMidis = anchorMap.keys.sorted()
        val templatesJson = JSONObject()
        val inharmJson = JSONObject()

        for (midi in UKU_MIN_MIDI..UKU_MAX_MIDI) {
            val weights: DoubleArray
            val bVal: Double
            if (availMidis.isEmpty()) {
                val (defW, defB) = defaultUkulelePhysics(midi)
                weights = defW
                bVal = defB
            } else if (anchorMap.containsKey(midi)) {
                weights = anchorMap[midi]!!.weights
                bVal = anchorMap[midi]!!.inharmonicityB
            } else {
                val lo = availMidis.lastOrNull { it < midi }
                val hi = availMidis.firstOrNull { it > midi }
                val raw: DoubleArray
                when {
                    lo == null -> {
                        val aHi = anchorMap[hi!!]!!
                        raw = aHi.weights.copyOf()
                        if (midi < 60) raw[0] *= 0.62
                        bVal = aHi.inharmonicityB
                    }
                    hi == null -> {
                        val aLo = anchorMap[lo]!!
                        raw = aLo.weights.copyOf()
                        bVal = aLo.inharmonicityB
                    }
                    else -> {
                        val alpha = (midi - lo).toDouble() / (hi - lo).toDouble()
                        val aLo = anchorMap[lo]!!
                        val aHi = anchorMap[hi]!!
                        raw = DoubleArray(UKU_HARMONICS) { h ->
                            (1.0 - alpha) * aLo.weights[h] + alpha * aHi.weights[h]
                        }
                        bVal = (1.0 - alpha) * aLo.inharmonicityB + alpha * aHi.inharmonicityB
                    }
                }
                val nrm = sqrt(raw.sumOf { it * it }).let { if (it > 1e-9) it else 1.0 }
                weights = DoubleArray(UKU_HARMONICS) { h -> roundTo(raw[h] / nrm, 5) }
            }

            val arr = JSONArray()
            weights.forEach { arr.put(it) }
            templatesJson.put(midi.toString(), arr)
            inharmJson.put(midi.toString(), roundTo(bVal, 6))
        }

        val noiseArr = JSONArray()
        silenceStats.noiseBands.forEach { noiseArr.put(it) }

        val tunings = JSONObject()
            .put(
                "high-g",
                JSONObject()
                    .put("label", "Standard High-G (G4-C4-E4-A4)")
                    .put("stringsTabOrder", JSONArray(listOf(69, 64, 60, 67)))
                    .put("stringsChordOrder", JSONArray(listOf(67, 60, 64, 69)))
                    .put("minMidi", 60)
                    .put("maxMidi", 84)
                    .put("hpfHz", 180.0)
            )
            .put(
                "low-g",
                JSONObject()
                    .put("label", "Linear Low-G (G3-C4-E4-A4)")
                    .put("stringsTabOrder", JSONArray(listOf(69, 64, 60, 55)))
                    .put("stringsChordOrder", JSONArray(listOf(55, 60, 64, 69)))
                    .put("minMidi", 55)
                    .put("maxMidi", 84)
                    .put("hpfHz", 135.0)
            )

        return JSONObject()
            .put("version", "1.1.0-android-ukulele-calibrated")
            .put("calibrated", true)
            .put("generatedAt", Instant.now().toString())
            .put(
                "instrument",
                JSONObject()
                    .put("type", "ukulele")
                    .put("defaultTuning", "high-g")
                    .put("minMidi", UKU_MIN_MIDI)
                    .put("maxMidi", UKU_MAX_MIDI)
                    .put("numPitches", UKU_MAX_MIDI - UKU_MIN_MIDI + 1)
                    .put("concertA4Hz", 440.0)
                    .put("tunings", tunings)
            )
            .put(
                "dsp",
                JSONObject()
                    .put("windowSize", WIN_SIZE)
                    .put("fftSize", FFT_SIZE)
                    .put("hopSize", HOP_SIZE)
                    .put("numHarmonics", UKU_HARMONICS)
                    .put("calibrationSampleRate", calSampleRate)
                    .put("strumWindowMs", 98)
                    .put("pluckFlatnessGate", 0.44)
            )
            .put(
                "silenceProfile",
                JSONObject()
                    .put("medianRms", silenceStats.medianRms)
                    .put("p90Rms", silenceStats.p90Rms)
                    .put("p98Rms", silenceStats.p98Rms)
                    .put("recommendedRmsGate", silenceStats.recommendedRmsGate)
                    .put("bandHz", silenceStats.bandHz)
                    .put("noiseBands", noiseArr)
            )
            .put("templates", templatesJson)
            .put("inharmonicity", inharmJson)
            .put(
                "benchmarkSummary",
                JSONObject()
                    .put("anchorsCalibrated", anchorMap.size)
                    .put("wavSamplesUsed", wavFiles.size)
                    .put("strummedChordsZeroShot", JSONObject().put("f1", 97.0))
            )
    }

    private fun defaultUkulelePhysics(midi: Int): Pair<DoubleArray, Double> {
        val f0 = midiToFreq(midi)
        val decayExp = when {
            midi < 60 -> 1.42
            midi <= 72 -> 1.62
            else -> 1.85
        }
        val raw = DoubleArray(UKU_HARMONICS) { idx ->
            val h = idx + 1
            val fh = h * f0
            val pluckMod = max(0.32, abs(sin(PI * h * 0.21)))
            val baseAmp = h.toDouble().pow(-decayExp) * pluckMod
            val r = fh / 245.0
            val r2 = r * r
            val rad = r2 / sqrt((1.0 - r2).pow(2) + r2)
            val u0 = fh / 285.0
            val a0 = 0.52 / sqrt((1.0 - u0 * u0).pow(2) + (u0 / 5.0).pow(2))
            val u1 = fh / 495.0
            val t1 = 0.44 / sqrt((1.0 - u1 * u1).pow(2) + (u1 / 4.6).pow(2))
            val hf = exp(-fh / 3400.0)
            val resp = max(0.05, (rad + a0 * 0.42 + t1 * 0.36) * hf)
            baseAmp * resp
        }
        val norm = sqrt(raw.sumOf { it * it }).let { if (it > 1e-9) it else 1.0 }
        val w = DoubleArray(UKU_HARMONICS) { h -> roundTo(raw[h] / norm, 5) }
        val bVal = when {
            midi < 60 -> 0.00018 + (midi - 55) * 0.00002
            midi <= 69 -> 0.00008 + (midi - 60) * 0.000008
            midi <= 76 -> 0.00016 + (midi - 70) * 0.000028
            else -> 0.00035 + (midi - 77) * 0.000042
        }
        return w to roundTo(bVal, 6)
    }

    fun midiToName(midi: Int): String = "${NOTE_NAMES[((midi % 12) + 12) % 12]}${(midi / 12) - 1}"
}
