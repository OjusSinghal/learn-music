/**
 * Web MIDI API Manager
 * Auto-detects USB/Bluetooth MIDI keyboards for zero-latency, 100% accurate note input.
 */

export class MidiInputManager {
    constructor(options = {}) {
        this.midiAccess = null;
        this.activeInputs = new Map();
        this.onNoteOn = options.onNoteOn || null;
        this.onNoteOff = options.onNoteOff || null;
        this.onDeviceChange = options.onDeviceChange || null;
        this.isSupported = Boolean(navigator.requestMIDIAccess);
    }

    async init() {
        if (!this.isSupported) {
            console.warn("Web MIDI API not supported in this browser.");
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e);
            
            // Connect existing inputs
            this.connectAllInputs();
            return true;
        } catch (err) {
            console.warn("MIDI access request rejected or failed:", err);
            return false;
        }
    }

    connectAllInputs() {
        if (!this.midiAccess) return;
        this.activeInputs.clear();

        for (const input of this.midiAccess.inputs.values()) {
            this.activeInputs.set(input.id, input.name);
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
        }

        if (this.onDeviceChange) {
            this.onDeviceChange(Array.from(this.activeInputs.values()));
        }
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
