package com.ojussinghal.learnmusic

import android.webkit.JavascriptInterface

/**
 * JavaScript Bridge exposed on `window.LearnMusicAndroid`.
 * Provides native Android integrations for screen wake lock during Studio practice,
 * native dataset ZIP & manifest JSON sharing/saving, and USB/BLE MIDI device status.
 */
class AndroidJsBridge(
    private val onSetKeepScreenOn: (Boolean) -> Unit,
    private val onDownloadDatasetZip: (instrument: String) -> Unit,
    private val onExportManifestJson: (filename: String, jsonText: String) -> Unit,
    private val onGetConnectedMidiDevices: () -> String
) {
    @JavascriptInterface
    fun isAndroidApp(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun setKeepScreenOn(keepOn: Boolean) {
        onSetKeepScreenOn(keepOn)
    }

    @JavascriptInterface
    fun downloadDatasetZip(instrument: String) {
        val inst = if (instrument.equals("ukulele", ignoreCase = true)) "ukulele" else "piano"
        onDownloadDatasetZip(inst)
    }

    @JavascriptInterface
    fun exportManifestJson(filename: String, jsonText: String) {
        onExportManifestJson(filename, jsonText)
    }

    @JavascriptInterface
    fun getConnectedMidiDevices(): String = onGetConnectedMidiDevices()
}
