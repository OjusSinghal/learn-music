package com.ojussinghal.learnmusic

import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

/**
 * Multi-Threaded Embedded Loopback HTTP/1.1 Server (`127.0.0.1`) for Android.
 * Serves the exact 36-module vanilla ES-module web application in a secure context
 * (enabling ES Modules, AudioWorklet, MediaStream getUserMedia, and persistent localStorage)
 * while providing 100% API parity with `server.py` offline on-device.
 */
class LocalAppServer(
    private val dataStore: AppDataStore,
    private val staticAssetReader: (String) -> ByteArray?,
    private val preferredPort: Int = 18080
) {
    private val running = AtomicBoolean(false)
    private var serverSocket: ServerSocket? = null
    private var acceptThread: Thread? = null
    private var workerPool: ExecutorService? = null

    @Volatile
    var port: Int = 0
        private set

    val baseUrl: String
        get() = "http://127.0.0.1:$port"

    fun start(): Int {
        if (running.get()) return port
        val loopback = InetAddress.getByName("127.0.0.1")
        val socket = try {
            ServerSocket(preferredPort, 128, loopback)
        } catch (_: Exception) {
            ServerSocket(0, 128, loopback)
        }
        serverSocket = socket
        port = socket.localPort
        running.set(true)
        workerPool = Executors.newCachedThreadPool()

        acceptThread = Thread({
            while (running.get()) {
                try {
                    val client = socket.accept()
                    workerPool?.execute { handleClient(client) }
                } catch (_: Exception) {
                    if (!running.get()) break
                }
            }
        }, "LearnMusicHttpAccept").apply {
            isDaemon = true
            start()
        }
        return port
    }

    fun stop() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
        workerPool?.shutdownNow()
        workerPool = null
        acceptThread?.interrupt()
        acceptThread = null
    }

    private fun handleClient(socket: Socket) {
        socket.use { client ->
            try {
                client.soTimeout = 15_000
                val input = BufferedInputStream(client.getInputStream())
                val output = BufferedOutputStream(client.getOutputStream())

                val requestLine = readLine(input) ?: return
                val parts = requestLine.trim().split(" ")
                if (parts.size < 2) return
                val method = parts[0].uppercase()
                val rawTarget = parts[1]

                val headers = HashMap<String, String>()
                while (true) {
                    val line = readLine(input) ?: break
                    if (line.isEmpty()) break
                    val sep = line.indexOf(':')
                    if (sep > 0) {
                        headers[line.substring(0, sep).trim().lowercase()] =
                            line.substring(sep + 1).trim()
                    }
                }

                val pathOnly = rawTarget.substringBefore('?')
                val decodedPath = try {
                    URLDecoder.decode(pathOnly, "UTF-8")
                } catch (_: Exception) {
                    pathOnly
                }

                if (method == "OPTIONS") {
                    writeResponse(output, 200, "OK", "text/plain; charset=utf-8", ByteArray(0))
                    return
                }

                when (method) {
                    "GET", "HEAD" -> handleGet(decodedPath, headers, output, headOnly = method == "HEAD")
                    "POST" -> {
                        val contentLength = headers["content-length"]?.toIntOrNull()?.coerceIn(0, MAX_BODY_BYTES) ?: 0
                        val body = readExactBytes(input, contentLength)
                        handlePost(decodedPath, body, output)
                    }
                    else -> writeJson(output, 405, JSONObject().put("error", "Method not allowed"))
                }
            } catch (_: Exception) {
                // Client disconnected or malformed request
            }
        }
    }

    private fun handleGet(
        path: String,
        headers: Map<String, String>,
        output: BufferedOutputStream,
        headOnly: Boolean
    ) {
        when {
            path == "/api/songs" -> {
                val resp = JSONObject().put("custom_songs", dataStore.listSongs())
                writeJson(output, 200, resp, headOnly)
                return
            }
            path == "/api/dataset/summary" -> {
                writeJson(output, 200, dataStore.getDatasetSummary("piano"), headOnly)
                return
            }
            path == "/api/dataset/ukulele/summary" -> {
                writeJson(output, 200, dataStore.getDatasetSummary("ukulele"), headOnly)
                return
            }
            path == "/api/dataset/profile" -> {
                val prof = dataStore.getCustomCalibratedProfile("piano")
                if (prof != null) {
                    writeJson(output, 200, prof, headOnly)
                } else {
                    writeJson(output, 404, JSONObject().put("error", "No custom piano profile"), headOnly)
                }
                return
            }
            path == "/api/dataset/ukulele/profile" -> {
                val prof = dataStore.getCustomCalibratedProfile("ukulele")
                if (prof != null) {
                    writeJson(output, 200, prof, headOnly)
                } else {
                    writeJson(output, 404, JSONObject().put("error", "No custom ukulele profile"), headOnly)
                }
                return
            }
            path == "/api/dataset/zip" -> {
                val zipBytes = dataStore.buildDatasetZipBytes("piano")
                writeResponse(
                    output,
                    200,
                    "OK",
                    "application/zip",
                    if (headOnly) ByteArray(0) else zipBytes,
                    extraHeaders = mapOf(
                        "Content-Disposition" to "attachment; filename=\"piano_acoustic_dataset.zip\"",
                        "Content-Length" to zipBytes.size.toString()
                    )
                )
                return
            }
            path == "/api/dataset/ukulele/zip" -> {
                val zipBytes = dataStore.buildDatasetZipBytes("ukulele")
                writeResponse(
                    output,
                    200,
                    "OK",
                    "application/zip",
                    if (headOnly) ByteArray(0) else zipBytes,
                    extraHeaders = mapOf(
                        "Content-Disposition" to "attachment; filename=\"ukulele_acoustic_dataset.zip\"",
                        "Content-Length" to zipBytes.size.toString()
                    )
                )
                return
            }
            path.startsWith("/audio_dataset/ukulele/samples/") -> {
                val fname = path.removePrefix("/audio_dataset/ukulele/samples/")
                val wav = dataStore.getSampleWavFile("ukulele", fname)
                if (wav != null) {
                    serveFileWithRange(wav, "audio/wav", headers, output, headOnly)
                } else {
                    writeJson(output, 404, JSONObject().put("error", "Ukulele sample not found"), headOnly)
                }
                return
            }
            path.startsWith("/audio_dataset/samples/") -> {
                val fname = path.removePrefix("/audio_dataset/samples/")
                val wav = dataStore.getSampleWavFile("piano", fname)
                if (wav != null) {
                    serveFileWithRange(wav, "audio/wav", headers, output, headOnly)
                } else {
                    writeJson(output, 404, JSONObject().put("error", "Piano sample not found"), headOnly)
                }
                return
            }
        }

        // Static web assets from APK assets/www/
        val normalized = normalizeAssetPath(path)
        if (normalized == null) {
            writeJson(output, 403, JSONObject().put("error", "Forbidden"), headOnly)
            return
        }
        val bytes = staticAssetReader(normalized)
        if (bytes == null) {
            writeJson(output, 404, JSONObject().put("error", "Not found: $normalized"), headOnly)
            return
        }
        val mime = guessMimeType(normalized)
        writeResponse(
            output,
            200,
            "OK",
            mime,
            if (headOnly) ByteArray(0) else bytes,
            extraHeaders = mapOf("Content-Length" to bytes.size.toString())
        )
    }

    private fun handlePost(path: String, body: ByteArray, output: BufferedOutputStream) {
        try {
            when (path) {
                "/api/parse-midi" -> {
                    val result = MidiFileParser.parse(body)
                    writeJson(output, 200, result)
                }
                "/api/songs/save" -> {
                    val data = JSONObject(body.toString(Charsets.UTF_8))
                    val id = dataStore.saveSong(data)
                    writeJson(output, 200, JSONObject().put("success", true).put("id", id))
                }
                "/api/dataset/sample" -> {
                    val data = JSONObject(body.toString(Charsets.UTF_8))
                    val meta = data.optJSONObject("metadata") ?: JSONObject()
                    val b64 = data.optString("audioBase64", "")
                    writeJson(output, 200, dataStore.saveDatasetSample("piano", meta, b64))
                }
                "/api/dataset/recalibrate" -> {
                    try {
                        writeJson(output, 200, dataStore.recalibrate("piano"))
                    } catch (e: IllegalStateException) {
                        writeJson(output, 400, JSONObject().put("success", false).put("error", e.message))
                    }
                }
                "/api/dataset/reset" -> {
                    writeJson(output, 200, dataStore.resetDataset("piano"))
                }
                "/api/dataset/ukulele/sample" -> {
                    val data = JSONObject(body.toString(Charsets.UTF_8))
                    val meta = data.optJSONObject("metadata") ?: JSONObject()
                    val b64 = data.optString("audioBase64", "")
                    writeJson(output, 200, dataStore.saveDatasetSample("ukulele", meta, b64))
                }
                "/api/dataset/ukulele/recalibrate" -> {
                    try {
                        writeJson(output, 200, dataStore.recalibrate("ukulele"))
                    } catch (e: IllegalStateException) {
                        writeJson(output, 400, JSONObject().put("success", false).put("error", e.message))
                    }
                }
                "/api/dataset/ukulele/reset" -> {
                    writeJson(output, 200, dataStore.resetDataset("ukulele"))
                }
                else -> writeJson(output, 404, JSONObject().put("error", "Unknown endpoint: $path"))
            }
        } catch (e: Exception) {
            writeJson(output, 400, JSONObject().put("error", e.message ?: "Bad request"))
        }
    }

    private fun serveFileWithRange(
        file: File,
        mimeType: String,
        headers: Map<String, String>,
        output: BufferedOutputStream,
        headOnly: Boolean
    ) {
        val fullBytes = file.readBytes()
        val totalLen = fullBytes.size
        val rangeHeader = headers["range"]
        if (rangeHeader != null && rangeHeader.startsWith("bytes=") && totalLen > 0) {
            val spec = rangeHeader.removePrefix("bytes=").substringBefore(',').trim()
            val dash = spec.indexOf('-')
            if (dash >= 0) {
                val startStr = spec.substring(0, dash).trim()
                val endStr = spec.substring(dash + 1).trim()
                val start = startStr.toIntOrNull()?.coerceIn(0, totalLen - 1) ?: 0
                val end = endStr.toIntOrNull()?.coerceIn(start, totalLen - 1) ?: (totalLen - 1)
                val slice = fullBytes.copyOfRange(start, end + 1)
                writeResponse(
                    output,
                    206,
                    "Partial Content",
                    mimeType,
                    if (headOnly) ByteArray(0) else slice,
                    extraHeaders = mapOf(
                        "Accept-Ranges" to "bytes",
                        "Content-Range" to "bytes $start-$end/$totalLen",
                        "Content-Length" to slice.size.toString()
                    )
                )
                return
            }
        }
        writeResponse(
            output,
            200,
            "OK",
            mimeType,
            if (headOnly) ByteArray(0) else fullBytes,
            extraHeaders = mapOf(
                "Accept-Ranges" to "bytes",
                "Content-Length" to totalLen.toString()
            )
        )
    }

    private fun writeJson(
        output: BufferedOutputStream,
        status: Int,
        json: JSONObject,
        headOnly: Boolean = false
    ) {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        val reason = when (status) {
            200 -> "OK"
            400 -> "Bad Request"
            403 -> "Forbidden"
            404 -> "Not Found"
            405 -> "Method Not Allowed"
            else -> "Error"
        }
        writeResponse(
            output,
            status,
            reason,
            "application/json; charset=utf-8",
            if (headOnly) ByteArray(0) else bytes,
            extraHeaders = mapOf("Content-Length" to bytes.size.toString())
        )
    }

    private fun writeResponse(
        output: BufferedOutputStream,
        statusCode: Int,
        statusText: String,
        contentType: String,
        body: ByteArray,
        extraHeaders: Map<String, String> = emptyMap()
    ) {
        val sb = StringBuilder()
        sb.append("HTTP/1.1 ").append(statusCode).append(' ').append(statusText).append("\r\n")
        sb.append("Content-Type: ").append(contentType).append("\r\n")
        sb.append("Access-Control-Allow-Origin: *\r\n")
        sb.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
        sb.append("Access-Control-Allow-Headers: Content-Type\r\n")
        sb.append("Cache-Control: no-cache, no-store, must-revalidate\r\n")
        sb.append("Connection: close\r\n")
        if (!extraHeaders.containsKey("Content-Length")) {
            sb.append("Content-Length: ").append(body.size).append("\r\n")
        }
        for ((k, v) in extraHeaders) {
            sb.append(k).append(": ").append(v).append("\r\n")
        }
        sb.append("\r\n")
        output.write(sb.toString().toByteArray(Charsets.US_ASCII))
        if (body.isNotEmpty()) {
            output.write(body)
        }
        output.flush()
    }

    private fun normalizeAssetPath(rawPath: String): String? {
        val trimmed = rawPath.trimStart('/')
        val resolved = if (trimmed.isEmpty()) "index.html" else trimmed
        if (resolved.contains("..") || resolved.contains('\\')) return null
        return resolved
    }

    private fun readLine(input: InputStream): String? {
        val baos = ByteArrayOutputStream()
        var prev = -1
        while (true) {
            val b = input.read()
            if (b == -1) {
                return if (baos.size() == 0) null else baos.toString("UTF-8")
            }
            if (b == '\n'.code) {
                val bytes = baos.toByteArray()
                val len = if (prev == '\r'.code && bytes.isNotEmpty()) bytes.size - 1 else bytes.size
                return String(bytes, 0, len, Charsets.UTF_8)
            }
            baos.write(b)
            prev = b
        }
    }

    private fun readExactBytes(input: InputStream, length: Int): ByteArray {
        if (length <= 0) return ByteArray(0)
        val out = ByteArray(length)
        var offset = 0
        while (offset < length) {
            val read = input.read(out, offset, min(8192, length - offset))
            if (read <= 0) break
            offset += read
        }
        return if (offset == length) out else out.copyOf(offset)
    }

    companion object {
        private const val MAX_BODY_BYTES = 25 * 1024 * 1024 // 25 MB

        fun guessMimeType(path: String): String {
            val lower = path.lowercase()
            return when {
                lower.endsWith(".html") || lower.endsWith(".htm") -> "text/html; charset=utf-8"
                lower.endsWith(".js") || lower.endsWith(".mjs") -> "application/javascript; charset=utf-8"
                lower.endsWith(".css") -> "text/css; charset=utf-8"
                lower.endsWith(".json") -> "application/json; charset=utf-8"
                lower.endsWith(".svg") -> "image/svg+xml"
                lower.endsWith(".png") -> "image/png"
                lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
                lower.endsWith(".webp") -> "image/webp"
                lower.endsWith(".mid") || lower.endsWith(".midi") -> "audio/midi"
                lower.endsWith(".musicxml") || lower.endsWith(".xml") -> "application/xml; charset=utf-8"
                lower.endsWith(".wav") -> "audio/wav"
                lower.endsWith(".woff2") -> "font/woff2"
                else -> "application/octet-stream"
            }
        }
    }
}
