package com.ojussinghal.learnmusic

import android.content.Context
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import java.util.concurrent.ConcurrentHashMap

/**
 * Native Android USB-C / OTG & Bluetooth MIDI Keyboard Bridge.
 * Uses `android.media.midi.MidiManager` to auto-connect physical MIDI keyboards and stream
 * zero-latency Note On / Note Off messages directly into `MidiInputManager` in the WebView.
 */
class AndroidMidiBridge(
    context: Context,
    private val onNoteOn: (note: Int, velocity: Int) -> Unit,
    private val onNoteOff: (note: Int) -> Unit,
    private val onDevicesChanged: (deviceNames: List<String>) -> Unit
) {
    private val midiManager: MidiManager? =
        context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private val openDevices = ConcurrentHashMap<Int, MidiDevice>()
    private val openPorts = ConcurrentHashMap<Int, MutableList<MidiOutputPort>>()
    private val deviceNames = ConcurrentHashMap<Int, String>()

    private var deviceCallback: MidiManager.DeviceCallback? = null

    fun start() {
        val mgr = midiManager ?: return
        val cb = object : MidiManager.DeviceCallback() {
            override fun onDeviceAdded(device: MidiDeviceInfo) {
                connectDeviceIfSource(mgr, device)
            }

            override fun onDeviceRemoved(device: MidiDeviceInfo) {
                disconnectDevice(device.id)
            }
        }
        deviceCallback = cb

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                mgr.registerDeviceCallback(
                    MidiManager.TRANSPORT_MIDI_BYTE_STREAM,
                    { r -> mainHandler.post(r) },
                    cb
                )
                mgr.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).forEach { info ->
                    connectDeviceIfSource(mgr, info)
                }
            } else {
                @Suppress("DEPRECATION")
                mgr.registerDeviceCallback(cb, mainHandler)
                @Suppress("DEPRECATION")
                mgr.devices.forEach { info ->
                    connectDeviceIfSource(mgr, info)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "MIDI initialization skipped: ${e.message}")
        }
    }

    fun getConnectedDeviceNames(): List<String> = deviceNames.values.distinct().sorted()

    fun getConnectedDevicesJson(): String {
        val arr = JSONArray()
        getConnectedDeviceNames().forEach { arr.put(it) }
        return arr.toString()
    }

    private fun connectDeviceIfSource(mgr: MidiManager, info: MidiDeviceInfo) {
        // An external MIDI keyboard exposes OUTPUT ports (sending MIDI out from keyboard into Android)
        if (info.outputPortCount <= 0) return
        if (openDevices.containsKey(info.id)) return

        val props = info.properties
        val label = props.getString(MidiDeviceInfo.PROPERTY_NAME)
            ?: props.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
            ?: "MIDI Device #${info.id}"

        try {
            mgr.openDevice(
                info,
                { device ->
                    if (device == null) return@openDevice
                    openDevices[info.id] = device
                    deviceNames[info.id] = label
                    val ports = mutableListOf<MidiOutputPort>()
                    val parser = MidiStreamParser(onNoteOn, onNoteOff)

                    for (portIdx in 0 until info.outputPortCount) {
                        val port = device.openOutputPort(portIdx)
                        if (port != null) {
                            port.connect(object : MidiReceiver() {
                                override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
                                    parser.feed(msg, offset, count)
                                }
                            })
                            ports.add(port)
                        }
                    }
                    openPorts[info.id] = ports
                    notifyDevicesChanged()
                },
                mainHandler
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed opening MIDI device $label: ${e.message}")
        }
    }

    private fun disconnectDevice(deviceId: Int) {
        openPorts.remove(deviceId)?.forEach { port ->
            try {
                port.close()
            } catch (_: Exception) {
            }
        }
        openDevices.remove(deviceId)?.let { dev ->
            try {
                dev.close()
            } catch (_: Exception) {
            }
        }
        deviceNames.remove(deviceId)
        notifyDevicesChanged()
    }

    private fun notifyDevicesChanged() {
        val list = getConnectedDeviceNames()
        mainHandler.post { onDevicesChanged(list) }
    }

    fun stop() {
        val mgr = midiManager
        val cb = deviceCallback
        if (mgr != null && cb != null) {
            try {
                mgr.unregisterDeviceCallback(cb)
            } catch (_: Exception) {
            }
        }
        deviceCallback = null

        for (id in openDevices.keys.toList()) {
            disconnectDevice(id)
        }
    }

    /**
     * Stateful MIDI 1.0 byte-stream parser handling running status, 2/3-byte channel messages,
     * system realtime bytes, and SysEx framing cleanly.
     */
    internal class MidiStreamParser(
        private val onNoteOn: (note: Int, velocity: Int) -> Unit,
        private val onNoteOff: (note: Int) -> Unit
    ) {
        private var runningStatus = 0
        private var inSysEx = false
        private val dataBuf = IntArray(2)
        private var dataLen = 0
        private var expectedDataLen = 0

        fun feed(bytes: ByteArray, offset: Int, count: Int) {
            val end = (offset + count).coerceAtMost(bytes.size)
            for (i in offset until end) {
                val b = bytes[i].toInt() and 0xFF
                // System Realtime (0xF8..0xFF) can appear anywhere without disturbing running status
                if (b >= 0xF8) continue

                if (b == 0xF0) {
                    inSysEx = true
                    runningStatus = 0
                    dataLen = 0
                    continue
                }
                if (b == 0xF7) {
                    inSysEx = false
                    dataLen = 0
                    continue
                }
                if (inSysEx) continue

                if (b >= 0x80) {
                    if (b < 0xF0) {
                        runningStatus = b
                        dataLen = 0
                        expectedDataLen = expectedBytesForStatus(b)
                    } else {
                        // System common messages clear running status
                        runningStatus = 0
                        dataLen = 0
                        expectedDataLen = when (b) {
                            0xF1, 0xF3 -> 1
                            0xF2 -> 2
                            else -> 0
                        }
                    }
                    continue
                }

                if (expectedDataLen == 0) continue
                if (dataLen < dataBuf.size) {
                    dataBuf[dataLen] = b
                }
                dataLen++
                if (dataLen >= expectedDataLen) {
                    if (runningStatus != 0) {
                        dispatchChannelMessage(runningStatus, dataBuf[0], if (expectedDataLen >= 2) dataBuf[1] else 0)
                    }
                    dataLen = 0
                }
            }
        }

        private fun expectedBytesForStatus(status: Int): Int = when (status and 0xF0) {
            0xC0, 0xD0 -> 1
            0x80, 0x90, 0xA0, 0xB0, 0xE0 -> 2
            else -> 0
        }

        private fun dispatchChannelMessage(status: Int, d1: Int, d2: Int) {
            when (status and 0xF0) {
                0x90 -> {
                    if (d2 > 0) onNoteOn(d1, d2) else onNoteOff(d1)
                }
                0x80 -> onNoteOff(d1)
            }
        }
    }

    companion object {
        private const val TAG = "LearnMusicMidi"
    }
}
