package com.ojussinghal.learnmusic

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

class LocalAppServerTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private lateinit var repoDir: File
    private lateinit var dataStore: AppDataStore
    private lateinit var server: LocalAppServer

    private fun locateRepoRoot(): File {
        var dir = File(System.getProperty("user.dir") ?: ".").absoluteFile
        repeat(4) {
            if (File(dir, "index.html").exists() && File(dir, "js/app.js").exists()) return dir
            dir = dir.parentFile ?: dir
        }
        error("Could not locate repository root from ${System.getProperty("user.dir")}")
    }

    @Before
    fun setUp() {
        repoDir = locateRepoRoot()
        val appFilesDir = tempFolder.newFolder("app_files")
        dataStore = AppDataStore(
            baseDir = appFilesDir,
            assetReader = { rel ->
                val f = File(repoDir, rel)
                if (f.exists() && f.isFile) f.inputStream() else null
            },
            assetLister = { relDir ->
                File(repoDir, relDir).list()?.toList().orEmpty()
            }
        )
        server = LocalAppServer(
            dataStore = dataStore,
            staticAssetReader = { rel ->
                val f = File(repoDir, rel)
                if (f.exists() && f.isFile) f.readBytes() else null
            },
            preferredPort = 0 // Ephemeral port for parallel-safe tests
        )
        server.start()
    }

    @After
    fun tearDown() {
        server.stop()
    }

    private fun httpGet(path: String, rangeHeader: String? = null): Triple<Int, String, ByteArray> {
        val conn = (URL("${server.baseUrl}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5000
            readTimeout = 5000
            if (rangeHeader != null) setRequestProperty("Range", rangeHeader)
        }
        val code = conn.responseCode
        val contentType = conn.contentType ?: ""
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { it.readBytes() } ?: ByteArray(0)
        conn.disconnect()
        return Triple(code, contentType, body)
    }

    private fun httpPost(path: String, payload: ByteArray, contentType: String = "application/json"): Pair<Int, ByteArray> {
        val conn = (URL("${server.baseUrl}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Content-Type", contentType)
        }
        conn.outputStream.use { it.write(payload) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.use { it.readBytes() } ?: ByteArray(0)
        conn.disconnect()
        return code to body
    }

    @Test
    fun servesAllCoreWebAssetsConcurrentlyWithProperMimeTypes() {
        val routes = listOf(
            "/" to "text/html",
            "/style.css" to "text/css",
            "/js/app.js" to "application/javascript",
            "/js/audio/piano_worklet.js" to "application/javascript",
            "/js/audio/backing_track.js" to "application/javascript",
            "/js/audio/polyphonic_detector.js" to "application/javascript",
            "/js/audio/ukulele_detector.js" to "application/javascript",
            "/js/curriculum/index.js" to "application/javascript",
            "/js/curriculum/levels_1_to_4.js" to "application/javascript",
            "/js/curriculum/levels_5_to_9.js" to "application/javascript",
            "/js/ukulele/curriculum.js" to "application/javascript",
            "/js/ukulele/arranger.js" to "application/javascript",
            "/js/ukulele/renderer.js" to "application/javascript",
            "/js/ukulele/fretboard.js" to "application/javascript",
            "/api/songs" to "application/json",
            "/api/dataset/summary" to "application/json",
            "/api/dataset/ukulele/summary" to "application/json"
        )

        val pool = Executors.newFixedThreadPool(12)
        try {
            val futures = routes.map { (route, expectedMime) ->
                pool.submit(Callable {
                    val (code, mime, body) = httpGet(route)
                    assertEquals("HTTP code mismatch on $route", 200, code)
                    assertTrue("MIME mismatch on $route: $mime", mime.contains(expectedMime))
                    assertTrue("Empty body on $route", body.isNotEmpty())
                })
            }
            futures.forEach { it.get() }
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun seedsSongsAndPersistsSavedCustomSongAndParsesMidi() {
        val (getCode, _, getBody) = httpGet("/api/songs")
        assertEquals(200, getCode)
        val initialSongs = JSONObject(getBody.decodeToString()).getJSONArray("custom_songs")
        assertEquals(3, initialSongs.length())

        val newSong = JSONObject()
            .put("id", "android_custom_drill")
            .put("title", "Android Custom Drill")
            .put("bpm", 96)
            .put("notes", JSONArray().put(JSONObject().put("pitch", 60).put("time", 0.0).put("duration", 0.5)))

        val (saveCode, saveBody) = httpPost("/api/songs/save", newSong.toString().toByteArray())
        assertEquals(200, saveCode)
        assertTrue(JSONObject(saveBody.decodeToString()).getBoolean("success"))

        val (_, _, afterBody) = httpGet("/api/songs")
        val updatedSongs = JSONObject(afterBody.decodeToString()).getJSONArray("custom_songs")
        assertEquals(4, updatedSongs.length())

        val midiBytes = File(repoDir, "samples/amazing_grace.mid").readBytes()
        val (midiCode, midiBody) = httpPost("/api/parse-midi", midiBytes, "audio/midi")
        assertEquals(200, midiCode)
        val parsedMidi = JSONObject(midiBody.decodeToString())
        assertFalse(parsedMidi.has("error"))
        assertTrue(parsedMidi.getInt("total_notes") > 40)
    }

    @Test
    fun enforcesFullPianoAndUkuleleDatasetLifecycleAndIsolation() {
        val silenceWav = File(repoDir, "audio_dataset/samples/step_01_silence.wav").readBytes()
        val c4Wav = File(repoDir, "audio_dataset/samples/step_09_c4.wav").readBytes()
        val silB64 = Base64.getEncoder().encodeToString(silenceWav)
        val c4B64 = Base64.getEncoder().encodeToString(c4Wav)

        // 1. Save Piano samples
        val pianoSilReq = JSONObject()
            .put("metadata", JSONObject().put("id", "step_01_silence").put("category", "silence").put("filename", "step_01_silence.wav"))
            .put("audioBase64", silB64)
        val pianoC4Req = JSONObject()
            .put("metadata", JSONObject().put("id", "step_09_c4").put("category", "anchor").put("filename", "step_09_c4.wav").put("expectedMidis", JSONArray(listOf(60))))
            .put("audioBase64", c4B64)

        assertEquals(200, httpPost("/api/dataset/sample", pianoSilReq.toString().toByteArray()).first)
        assertEquals(200, httpPost("/api/dataset/sample", pianoC4Req.toString().toByteArray()).first)

        // 2. Verify HTTP Range playback of saved WAV (206 Partial Content)
        val (rangeCode, rangeMime, rangeBytes) = httpGet("/audio_dataset/samples/step_09_c4.wav", rangeHeader = "bytes=0-43")
        assertEquals(206, rangeCode)
        assertTrue(rangeMime.contains("audio/wav"))
        assertEquals(44, rangeBytes.size)
        assertEquals("RIFF", String(rangeBytes, 0, 4, Charsets.US_ASCII))

        // 3. Verify Piano ZIP export contains manifest.json & both WAVs
        val (zipCode, _, zipBytes) = httpGet("/api/dataset/zip")
        assertEquals(200, zipCode)
        val zipEntries = mutableSetOf<String>()
        ZipInputStream(ByteArrayInputStream(zipBytes)).use { zis ->
            while (true) {
                val entry = zis.nextEntry ?: break
                zipEntries.add(entry.name)
            }
        }
        assertTrue(zipEntries.contains("manifest.json"))
        assertTrue(zipEntries.contains("samples/step_01_silence.wav"))
        assertTrue(zipEntries.contains("samples/step_09_c4.wav"))

        // 4. Verify Piano on-device recalibration & profile endpoint
        val (recalCode, recalBody) = httpPost("/api/dataset/recalibrate", ByteArray(0))
        assertEquals(200, recalCode)
        val recalJson = JSONObject(recalBody.decodeToString())
        assertTrue(recalJson.getBoolean("success"))
        assertEquals(61, recalJson.getJSONObject("profile").getJSONObject("templates").length())

        val (profCode, _, profBody) = httpGet("/api/dataset/profile")
        assertEquals(200, profCode)
        assertTrue(JSONObject(profBody.decodeToString()).getBoolean("calibrated"))

        // 5. Verify Ukulele recalibrate returns 400 when 0 Ukulele WAVs exist
        val (ukuEmptyRecal, _) = httpPost("/api/dataset/ukulele/recalibrate", ByteArray(0))
        assertEquals(400, ukuEmptyRecal)

        // 6. Save Ukulele sample, recalibrate Ukulele, then reset Ukulele -> Piano MUST remain untouched!
        val ukuReq = JSONObject()
            .put("metadata", JSONObject().put("id", "uku_step_03_open_c4").put("category", "open_strings").put("filename", "uku_step_03_open_c4.wav").put("expectedMidis", JSONArray(listOf(60))))
            .put("audioBase64", c4B64)
        assertEquals(200, httpPost("/api/dataset/ukulele/sample", ukuReq.toString().toByteArray()).first)

        val (ukuRecalCode, ukuRecalBody) = httpPost("/api/dataset/ukulele/recalibrate", ByteArray(0))
        assertEquals(200, ukuRecalCode)
        assertEquals("ukulele", JSONObject(ukuRecalBody.decodeToString()).getString("instrument"))

        assertEquals(200, httpPost("/api/dataset/ukulele/reset", ByteArray(0)).first)

        // Confirm Ukulele is empty while Piano still has 2 samples!
        val (_, _, ukuSumBody) = httpGet("/api/dataset/ukulele/summary")
        assertEquals(0, JSONObject(ukuSumBody.decodeToString()).getInt("wav_file_count"))

        val (_, _, pianoSumBody) = httpGet("/api/dataset/summary")
        assertEquals(2, JSONObject(pianoSumBody.decodeToString()).getInt("wav_file_count"))
    }

    @Test
    fun blocksPathTraversal() {
        val (code, _, _) = httpGet("/../server.py")
        assertTrue("Expected 403 or 404, got $code", code == 403 || code == 404)
    }
}
