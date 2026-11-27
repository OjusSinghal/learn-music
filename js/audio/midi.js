/**
 * Web MIDI & Native Android USB/BLE MIDI Manager
 * Auto-detects USB/Bluetooth MIDI keyboards via Web MIDI API or the Android MidiManager bridge
 * for zero-latency, 100% accurate note input across desktop and Android.
 */

export class MidiInputManager {
    constructor(options = {}) {
        this.midiAccess = null;
        this.activeInputs = new Map();
        this.androidDevices = [];
        this.onNoteOn = options.onNoteOn || null;
        this.onNoteOff = options.onNoteOff || null;
        this.onDeviceChange = options.onDeviceChange || null;
        const hasWebMidi = typeof navigator !== "undefined" && Boolean(navigator.requestMIDIAccess);
        const hasAndroidMidi = typeof window !== "undefined" && Boolean(window.LearnMusicAndroid);
        this.isSupported = hasWebMidi || hasAndroidMidi;
    }

    async init() {
        let initialized = false;

        // 1. Register native Android USB/BLE MidiManager bridge receiver if running in Android APK
        if (typeof window !== "undefined") {
            window.__learnMusicAndroidMidi = {
                onNoteOn: (note, velocity) => {
                    const velNorm = typeof velocity === "number"
                        ? (velocity > 1 ? velocity / 127.0 : velocity)
                        : 0.85;
                    if (this.onNoteOn) this.onNoteOn(note, velNorm);
                },
                onNoteOff: (note) => {
                    if (this.onNoteOff) this.onNoteOff(note);
                },
                onDevicesChanged: (deviceNames) => {
                    this.androidDevices = Array.isArray(deviceNames) ? deviceNames : [];
                    this._emitDeviceList();
                }
            };

            if (window.LearnMusicAndroid && typeof window.LearnMusicAndroid.getConnectedMidiDevices === "function") {
                try {
                    const raw = window.LearnMusicAndroid.getConnectedMidiDevices();
                    const parsed = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(parsed)) {
                        this.androidDevices = parsed;
                        this._emitDeviceList();
                    }
                    initialized = true;
                } catch (err) {
                    console.warn("Android MIDI bridge query failed:", err);
                }
            }
        }

        // 2. Initialize browser Web MIDI API when available
        if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
            if (!initialized) {
                console.warn("Web MIDI API not supported in this browser.");
            }
            return initialized;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e);

            // Connect existing inputs
            this.connectAllInputs();
            return true;
        } catch (err) {
            console.warn("MIDI access request rejected or failed:", err);
            return initialized;
        }
    }

    _emitDeviceList() {
        if (!this.onDeviceChange) return;
        const merged = Array.from(new Set([...this.activeInputs.values(), ...this.androidDevices]));
        this.onDeviceChange(merged);
    }

    connectAllInputs() {
        if (!this.midiAccess) return;
        this.activeInputs.clear();

        for (const input of this.midiAccess.inputs.values()) {
            this.activeInputs.set(input.id, input.name);
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
        }

        this._emitDeviceList();
    }

    handleStateChange(e) {
        this.connectAllInputs();
    }

    handleMidiMessage(event) {
        const [status, note, velocity] = event.data;
        const command = status >> 4;

        // Note On (0x9)
        if (command === 9) {
            if (velocity > 0) {
                if (this.onNoteOn) this.onNoteOn(note, velocity / 127.0);
            } else {
                if (this.onNoteOff) this.onNoteOff(note);
            }
        }
        // Note Off (0x8)
        else if (command === 8) {
            if (this.onNoteOff) this.onNoteOff(note);
        }
    }
}
