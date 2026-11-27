package com.ojussinghal.learnmusic

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.DownloadListener
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray
import java.io.File
import java.util.concurrent.Executors

/**
 * MainActivity hosting the Learn Music Conservatory (Piano 61-Key & High-G Ukulele)
 * inside a hardware-accelerated Chromium WebView backed by an embedded loopback HTTP/1.1 server
 * (`LocalAppServer`), on-device Kotlin acoustic calibrator, native USB/BLE MIDI bridge,
 * runtime microphone permission handling, and native file/camera/share sheet integration.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var dataStore: AppDataStore
    private lateinit var localServer: LocalAppServer
    private lateinit var midiBridge: AndroidMidiBridge

    private val ioExecutor = Executors.newSingleThreadExecutor()

    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCameraImageUri: Uri? = null

    private val audioPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val req = pendingWebPermissionRequest
            pendingWebPermissionRequest = null
            if (req != null) {
                if (granted) {
                    req.grant(req.resources)
                } else {
                    req.deny()
                    Toast.makeText(
                        this,
                        "Microphone permission is required for acoustic note detection & Data Trainer.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            val camUri = pendingCameraImageUri
            pendingCameraImageUri = null

            if (callback == null) return@registerForActivityResult

            if (result.resultCode != Activity.RESULT_OK) {
                callback.onReceiveValue(null)
                return@registerForActivityResult
            }

            val data = result.data
            val uris = mutableListOf<Uri>()
            if (data != null) {
                val clip = data.clipData
                if (clip != null && clip.itemCount > 0) {
                    for (i in 0 until clip.itemCount) {
                        clip.getItemAt(i)?.uri?.let { uris.add(it) }
                    }
                } else {
                    data.data?.let { uris.add(it) }
                }
            }
            if (uris.isEmpty() && camUri != null) {
                uris.add(camUri)
            }
            callback.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        volumeControlStream = AudioManager.STREAM_MUSIC
        configureSystemBars()

        // 1. Initialize persistent app data store & start embedded 127.0.0.1 HTTP server
        dataStore = AppDataStore(
            baseDir = filesDir,
            assetReader = { relPath ->
                try {
                    assets.open("www/$relPath")
                } catch (_: Exception) {
                    null
                }
            },
            assetLister = { relDir ->
                try {
                    assets.list("www/$relDir")?.toList().orEmpty()
                } catch (_: Exception) {
                    emptyList()
                }
            }
        )

        localServer = LocalAppServer(
            dataStore = dataStore,
            staticAssetReader = { relPath ->
                try {
                    assets.open("www/$relPath").use { it.readBytes() }
                } catch (_: Exception) {
                    null
                }
            },
            preferredPort = 18080
        )
        localServer.start()

        // 2. Build root container with safe-area padding for status & gesture bars
        val rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#0B0E14"))
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0E14"))
            overScrollMode = View.OVER_SCROLL_NEVER
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
        }
        rootLayout.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(rootLayout)

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            windowInsets
        }

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        // 3. Configure WebView for 60 FPS Canvas, Web Audio, AudioWorklet, getUserMedia & localStorage
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        // 4. Native USB/BLE MIDI Keyboard Bridge
        midiBridge = AndroidMidiBridge(
            context = this,
            onNoteOn = { note, velocity ->
                runOnUiThread {
                    if (::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.__learnMusicAndroidMidi && window.__learnMusicAndroidMidi.onNoteOn($note, $velocity);",
                            null
                        )
                    }
                }
            },
            onNoteOff = { note ->
                runOnUiThread {
                    if (::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.__learnMusicAndroidMidi && window.__learnMusicAndroidMidi.onNoteOff($note);",
                            null
                        )
                    }
                }
            },
            onDevicesChanged = { names ->
                val json = JSONArray(names).toString()
                runOnUiThread {
                    if (::webView.isInitialized) {
                        webView.evaluateJavascript(
                            "window.__learnMusicAndroidMidi && window.__learnMusicAndroidMidi.onDevicesChanged($json);",
                            null
                        )
                    }
                }
            }
        )
        midiBridge.start()

        // 5. Register JS Bridge (`window.LearnMusicAndroid`)
        val jsBridge = AndroidJsBridge(
            onSetKeepScreenOn = { keepOn ->
                runOnUiThread {
                    if (keepOn) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                }
            },
            onDownloadDatasetZip = { instrument -> exportDatasetZip(instrument) },
            onExportManifestJson = { filename, jsonText -> exportManifestJsonFile(filename, jsonText) },
            onGetConnectedMidiDevices = { midiBridge.getConnectedDevicesJson() }
        )
        webView.addJavascriptInterface(jsBridge, "LearnMusicAndroid")

        // 6. Clients for permissions, file/camera pickers, dialogs & downloads
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url ?: return false
                val host = uri.host ?: ""
                if (host == "127.0.0.1" || host == "localhost") {
                    val path = uri.path ?: ""
                    if (path == "/api/dataset/zip") {
                        exportDatasetZip("piano")
                        return true
                    }
                    if (path == "/api/dataset/ukulele/zip") {
                        exportDatasetZip("ukulele")
                        return true
                    }
                    return false
                }
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: Exception) {
                    false
                }
            }
        }

        webView.setDownloadListener(DownloadListener { url, _, _, _, _ ->
            when {
                url.contains("/api/dataset/ukulele/zip") -> exportDatasetZip("ukulele")
                url.contains("/api/dataset/zip") -> exportDatasetZip("piano")
            }
        })

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantsAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!wantsAudio) {
                        request.deny()
                        return@runOnUiThread
                    }
                    val hasMic = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                    if (hasMic) {
                        request.grant(request.resources)
                    } else {
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingFilePathCallback?.onReceiveValue(null)
                pendingFilePathCallback = filePathCallback
                pendingCameraImageUri = null

                val acceptTypes = fileChooserParams.acceptTypes
                    .map { it.trim().lowercase() }
                    .filter { it.isNotEmpty() }
                val isImagePicker = acceptTypes.any { it.startsWith("image/") }

                val contentIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (isImagePicker) "image/*" else "*/*"
                    if (isImagePicker) {
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/png", "image/jpeg", "image/webp"))
                    }
                }

                val chooser = Intent.createChooser(contentIntent, getString(R.string.file_chooser_title))

                // For sheet music images, also include live camera capture
                if (isImagePicker) {
                    val cameraIntent = createCameraCaptureIntent()
                    if (cameraIntent != null) {
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                    }
                }

                return try {
                    fileChooserLauncher.launch(chooser)
                    true
                } catch (e: Exception) {
                    Log.e(TAG, "File chooser launch failed: ${e.message}")
                    pendingFilePathCallback?.onReceiveValue(null)
                    pendingFilePathCallback = null
                    false
                }
            }

            override fun onJsConfirm(
                view: WebView,
                url: String,
                message: String,
                result: JsResult
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                    .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }
                    .show()
                return true
            }

            override fun onJsAlert(
                view: WebView,
                url: String,
                message: String,
                result: JsResult
            ): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(R.string.app_name)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                    .setOnCancelListener { result.cancel() }
                    .show()
                return true
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                Log.d(
                    "LearnMusicWeb",
                    "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} " +
                        "(${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                )
                return true
            }
        }

        // 7. System Back Button & Gesture Navigation
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    webView.evaluateJavascript(
                        "(function(){ return window.__learnMusicHandleBack ? window.__learnMusicHandleBack() : false; })();"
                    ) { result ->
                        if (result != "true") {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        }
                    }
                }
            }
        )

        // 8. Load the Conservatory SPA from embedded loopback secure context
        webView.loadUrl("${localServer.baseUrl}/")
    }

    @Suppress("DEPRECATION")
    private fun configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#0B0E14")
        window.navigationBarColor = Color.parseColor("#0B0E14")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
    }

    private fun createCameraCaptureIntent(): Intent? {
        return try {
            val camDir = File(cacheDir, "camera").apply { mkdirs() }
            val photoFile = File(camDir, "sheet_${System.currentTimeMillis()}.jpg")
            val photoUri = FileProvider.getUriForFile(
                this,
                "${applicationContext.packageName}.fileprovider",
                photoFile
            )
            pendingCameraImageUri = photoUri
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Camera capture unavailable: ${e.message}")
            null
        }
    }

    private fun exportDatasetZip(instrument: String) {
        ioExecutor.execute {
            try {
                val zipBytes = dataStore.buildDatasetZipBytes(instrument)
                val filename = if (instrument == "ukulele") {
                    "ukulele_acoustic_dataset.zip"
                } else {
                    "piano_acoustic_dataset.zip"
                }
                val outFile = File(File(cacheDir, "exports").apply { mkdirs() }, filename)
                outFile.writeBytes(zipBytes)
                shareExportedFile(outFile, "application/zip")
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Export ZIP failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun exportManifestJsonFile(filename: String, jsonText: String) {
        ioExecutor.execute {
            try {
                val safeName = File(filename).name.ifEmpty { "acoustic_manifest.json" }
                val outFile = File(File(cacheDir, "exports").apply { mkdirs() }, safeName)
                outFile.writeText(jsonText, Charsets.UTF_8)
                shareExportedFile(outFile, "application/json")
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Export manifest failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun shareExportedFile(file: File, mimeType: String) {
        runOnUiThread {
            try {
                val uri = FileProvider.getUriForFile(
                    this,
                    "${applicationContext.packageName}.fileprovider",
                    file
                )
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, file.name)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(shareIntent, getString(R.string.export_share_title)))
            } catch (e: Exception) {
                Toast.makeText(this, "Saved to ${file.name}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        if (::webView.isInitialized) {
            webView.evaluateJavascript(
                "window.__learnMusicOnAppPause && window.__learnMusicOnAppPause();",
                null
            )
            webView.onPause()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            webView.onResume()
        }
    }

    override fun onDestroy() {
        pendingWebPermissionRequest?.deny()
        pendingWebPermissionRequest = null
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null

        if (::midiBridge.isInitialized) midiBridge.stop()
        if (::localServer.isInitialized) localServer.stop()
        ioExecutor.shutdownNow()

        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "LearnMusicMain"
    }
}
