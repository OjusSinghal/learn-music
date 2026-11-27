package com.ojussinghal.learnmusic

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Persistent On-Device Storage Manager for Songs and Strictly Isolated Acoustic Datasets.
 * Mirrors server.py's directory layout inside Android internal filesDir:
 *   - songs_data/ JSON files (seeded from bundled APK assets/www/songs_data/)
 *   - audio_dataset/ (Piano 61-key samples, manifest.json, calibrated_profile.json)
 *   - audio_dataset/ukulele/ (Ukulele G-C-E-A samples, manifest.json, calibrated_profile.json)
 */
class AppDataStore(
    private val baseDir: File,
    private val assetReader: (String) -> InputStream? = { null },
    private val assetLister: (String) -> List<String> = { emptyList() }
) {
    val songsDir = File(baseDir, "songs_data")
    val pianoDatasetDir = File(baseDir, "audio_dataset")
    val pianoSamplesDir = File(pianoDatasetDir, "samples")
    val pianoManifestFile = File(pianoDatasetDir, "manifest.json")
    val pianoProfileFile = File(pianoDatasetDir, "calibrated_profile.json")

    val ukuleleDatasetDir = File(pianoDatasetDir, "ukulele")
    val ukuleleSamplesDir = File(ukuleleDatasetDir, "samples")
    val ukuleleManifestFile = File(ukuleleDatasetDir, "manifest.json")
    val ukuleleProfileFile = File(ukuleleDatasetDir, "calibrated_profile.json")

    private val lock = Any()

    init {
        songsDir.mkdirs()
        pianoSamplesDir.mkdirs()
        ukuleleSamplesDir.mkdirs()
        seedBundledSongs()
    }

    private fun seedBundledSongs() {
        val bundled = assetLister("songs_data")
        for (name in bundled) {
            if (!name.endsWith(".json")) continue
            val safeName = File(name).name
            val target = File(songsDir, safeName)
            if (!target.exists()) {
                assetReader("songs_data/$safeName")?.use { input ->
                    target.writeBytes(input.readBytes())
                }
            }
        }
    }

    private fun isUkulele(instrument: String): Boolean = instrument.equals("ukulele", ignoreCase = true)

    private fun datasetDir(instrument: String): File =
        if (isUkulele(instrument)) ukuleleDatasetDir else pianoDatasetDir

    private fun samplesDir(instrument: String): File =
        if (isUkulele(instrument)) ukuleleSamplesDir else pianoSamplesDir

    private fun manifestFile(instrument: String): File =
        if (isUkulele(instrument)) ukuleleManifestFile else pianoManifestFile

    private fun profileFile(instrument: String): File =
        if (isUkulele(instrument)) ukuleleProfileFile else pianoProfileFile

    fun listSongs(): JSONArray = synchronized(lock) {
        val arr = JSONArray()
        val files = songsDir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
            ?.sortedBy { it.name }
            .orEmpty()
        for (file in files) {
            try {
                arr.put(JSONObject(file.readText(Charsets.UTF_8)))
            } catch (_: Exception) {
                // Skip corrupt song file
            }
        }
        arr
    }

    fun saveSong(songJson: JSONObject): String = synchronized(lock) {
        val rawId = songJson.optString("id", "").trim()
        val songId = if (rawId.isNotEmpty()) {
            sanitizeFileStem(rawId)
        } else {
            "song_${UUID.randomUUID().toString().replace("-", "").take(8)}"
        }
        songJson.put("id", songId)
        val outFile = File(songsDir, "$songId.json")
        outFile.writeText(songJson.toString(2), Charsets.UTF_8)
        songId
    }

    fun getDatasetSummary(instrument: String): JSONObject = synchronized(lock) {
        val uku = isUkulele(instrument)
        val mFile = manifestFile(instrument)
        val sDir = samplesDir(instrument)
        val manifest = readManifestOrEmpty(mFile, uku)
        val wavCount = sDir.listFiles { f -> f.isFile && f.name.endsWith(".wav") }?.size ?: 0
        val totalSamples = manifest.optJSONArray("samples")?.length() ?: 0

        val res = JSONObject()
            .put("total_samples", totalSamples)
            .put("wav_file_count", wavCount)
            .put("manifest", manifest)
            .put("dataset_dir", datasetDir(instrument).absolutePath)
        if (uku) {
            res.put("instrument", "ukulele")
        }
        res
    }

    fun saveDatasetSample(instrument: String, metadata: JSONObject, audioBase64: String): JSONObject =
        synchronized(lock) {
            val uku = isUkulele(instrument)
            val sDir = samplesDir(instrument).apply { mkdirs() }
            val mFile = manifestFile(instrument)

            val stepId = metadata.optString("id", "").ifEmpty {
                "${if (uku) "uku_" else ""}sample_${System.currentTimeMillis() / 1000}"
            }
            val rawFilename = metadata.optString("filename", "$stepId.wav")
            var filename = File(rawFilename).name
            if (!filename.endsWith(".wav")) filename += ".wav"

            val wavFile = File(sDir, filename)
            if (audioBase64.isNotEmpty()) {
                val cleaned = audioBase64.substringAfter("base64,", audioBase64)
                    .replace("\n", "")
                    .replace("\r", "")
                    .trim()
                val wavBytes = Base64.getDecoder().decode(cleaned)
                wavFile.writeBytes(wavBytes)
                metadata.put("file_size_bytes", wavBytes.size)
            }

            val nowIso = Instant.now().toString()
            metadata.put("id", stepId)
            metadata.put("filename", filename)
            metadata.put("saved_at", nowIso)
            metadata.put(
                "audio_url",
                if (uku) "/audio_dataset/ukulele/samples/$filename" else "/audio_dataset/samples/$filename"
            )
            if (uku) metadata.put("instrument", "ukulele")

            val manifest = readManifestOrEmpty(mFile, uku)
            val samples = manifest.optJSONArray("samples") ?: JSONArray()
            var replaced = false
            for (i in 0 until samples.length()) {
                val existing = samples.optJSONObject(i)
                if (existing != null && existing.optString("id") == stepId) {
                    samples.put(i, metadata)
                    replaced = true
                    break
                }
            }
            if (!replaced) {
                samples.put(metadata)
            }
            manifest.put("samples", samples)
            manifest.put("updated_at", nowIso)
            if (uku) manifest.put("instrument", "ukulele")
            mFile.writeText(manifest.toString(2), Charsets.UTF_8)

            val resp = JSONObject()
                .put("success", true)
                .put("filename", filename)
                .put("total_samples", samples.length())
                .put("sample", metadata)
            if (uku) resp.put("instrument", "ukulele")
            resp
        }

    fun getSampleWavFile(instrument: String, filename: String): File? {
        val safeName = File(filename).name
        if (safeName.isEmpty() || safeName.contains("..")) return null
        val file = File(samplesDir(instrument), safeName)
        return if (file.exists() && file.isFile) file else null
    }

    fun buildDatasetZipBytes(instrument: String): ByteArray = synchronized(lock) {
        val mFile = manifestFile(instrument)
        val sDir = samplesDir(instrument)
        val baos = ByteArrayOutputStream()
        ZipOutputStream(baos).use { zos ->
            if (mFile.exists()) {
                zos.putNextEntry(ZipEntry("manifest.json"))
                zos.write(mFile.readBytes())
                zos.closeEntry()
            }
            val wavs = sDir.listFiles { f -> f.isFile && f.name.endsWith(".wav") }
                ?.sortedBy { it.name }
                .orEmpty()
            for (wav in wavs) {
                zos.putNextEntry(ZipEntry("samples/${wav.name}"))
                zos.write(wav.readBytes())
                zos.closeEntry()
            }
        }
        baos.toByteArray()
    }

    fun recalibrate(instrument: String): JSONObject = synchronized(lock) {
        val uku = isUkulele(instrument)
        val sDir = samplesDir(instrument)
        val mFile = manifestFile(instrument)
        val manifest = readManifestOrEmpty(mFile, uku)
        val profile = if (uku) {
            AcousticCalibrator.calibrateUkulele(sDir, manifest)
        } else {
            AcousticCalibrator.calibratePiano(sDir, manifest)
        }
        profileFile(instrument).writeText(profile.toString(2), Charsets.UTF_8)
        val resp = JSONObject()
            .put("success", true)
            .put("profile", profile)
        if (uku) resp.put("instrument", "ukulele")
        resp
    }

    fun getCustomCalibratedProfile(instrument: String): JSONObject? = synchronized(lock) {
        val pFile = profileFile(instrument)
        if (!pFile.exists() || !pFile.isFile) return@synchronized null
        try {
            JSONObject(pFile.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            null
        }
    }

    fun resetDataset(instrument: String): JSONObject = synchronized(lock) {
        val uku = isUkulele(instrument)
        val sDir = samplesDir(instrument).apply { mkdirs() }
        sDir.listFiles()?.forEach { f ->
            if (f.isFile) f.delete()
        }
        val pFile = profileFile(instrument)
        if (pFile.exists()) pFile.delete()

        val emptyManifest = JSONObject()
            .put("samples", JSONArray())
            .put("updated_at", Instant.now().toString())
        if (uku) emptyManifest.put("instrument", "ukulele")
        manifestFile(instrument).writeText(emptyManifest.toString(2), Charsets.UTF_8)

        val resp = JSONObject()
            .put("success", true)
            .put(
                "message",
                if (uku) "Ukulele dataset reset successfully." else "Dataset reset successfully."
            )
        if (uku) resp.put("instrument", "ukulele")
        resp
    }

    private fun readManifestOrEmpty(file: File, isUkulele: Boolean): JSONObject {
        if (file.exists() && file.isFile) {
            try {
                return JSONObject(file.readText(Charsets.UTF_8))
            } catch (_: Exception) {
                // Fall through to empty manifest
            }
        }
        val obj = JSONObject().put("samples", JSONArray())
        if (isUkulele) obj.put("instrument", "ukulele")
        return obj
    }

    private fun sanitizeFileStem(raw: String): String {
        val cleaned = raw.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        return cleaned.trimStart('.').ifEmpty { "song_${System.currentTimeMillis()}" }
    }
}
