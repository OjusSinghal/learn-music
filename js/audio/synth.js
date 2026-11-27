/**
 * Web Audio Piano Synthesizer & Metronome
 * Provides realistic piano harmonic synthesis, resonance filtering, precision metronome scheduling,
 * and shared AudioContext coordination with BackingTrackEngine.
 */

import { BackingTrackEngine } from "./backing_track.js";

export class PianoSynthesizer {
    constructor(options = {}) {
        this.ctx = options.ctx || null;
        this.masterGain = null;
        this.bodyFilter = null;
        this.muted = false;
        this.volume = 0.8;
        this.activeVoices = new Map();

        // Diagnostic counters for automated audio verification
        this.playNoteCount = 0;
        this.metronomeClickCount = 0;

        // Equal temperament note frequency table
        this.midiFreqTable = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            this.midiFreqTable[i] = 440 * Math.pow(2, (i - 69) / 12);
        }

        // Dedicated stereo headphone accompaniment bus (independent of Piano play-along mute)
        this.backingTrack = options.backingTrack || new BackingTrackEngine(this, {
            enabled: true,
            volume: 0.65
        });

        if (this.ctx) {
            this._setupPianoBus();
            this.backingTrack.attachContext(this.ctx);
        }
    }

    _setParam(param, val, t) {
        if (!param) return;
        if (typeof param.setValueAtTime === "function") {
            param.setValueAtTime(val, t);
        } else {
            param.value = val;
        }
    }

    _linRamp(param, val, t) {
        if (!param) return;
        if (typeof param.linearRampToValueAtTime === "function") {
            param.linearRampToValueAtTime(val, t);
        } else {
            this._setParam(param, val, t);
        }
    }

    _expRamp(param, val, t) {
        if (!param) return;
        const safeVal = Math.max(0.0001, val);
        if (typeof param.exponentialRampToValueAtTime === "function") {
            param.exponentialRampToValueAtTime(safeVal, t);
        } else {
            this._linRamp(param, safeVal, t);
        }
    }

    _setupPianoBus() {
        if (!this.ctx || this.masterGain) return;
        const now = this.ctx.currentTime || 0;

        this.masterGain = this.ctx.createGain();
        this._setParam(this.masterGain.gain, this.muted ? 0 : this.volume, now);

        if (typeof this.ctx.createBiquadFilter === "function") {
            // Lowpass filter for warm acoustic piano resonance
            this.bodyFilter = this.ctx.createBiquadFilter();
            this.bodyFilter.type = "lowpass";
            this._setParam(this.bodyFilter.frequency, 4500, now);
            this._setParam(this.bodyFilter.Q, 1.0, now);

            this.masterGain.connect(this.bodyFilter);
            if (this.ctx.destination) {
                this.bodyFilter.connect(this.ctx.destination);
            }
        } else if (this.ctx.destination) {
            this.masterGain.connect(this.ctx.destination);
        }
    }

    /**
     * Initialize audio context on first user gesture (safe no-op in headless jsc if WebAudio is absent)
     */
    init() {
        if (!this.ctx) {
            const g = typeof window !== "undefined" ? window : globalThis;
            const AudioCtx = g.AudioContext || g.webkitAudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioCtx) return null;
            this.ctx = new AudioCtx();
        }

        this._setupPianoBus();
        if (this.backingTrack) {
            this.backingTrack.attachContext(this.ctx);
        }
        return this.ctx;
    }

    resume() {
        if (this.ctx && this.ctx.state === "suspended" && typeof this.ctx.resume === "function") {
            this.ctx.resume();
        }
    }

    /**
     * Mutes/unmutes ONLY the PianoSynthesizer voice bus (never mutes BackingTrackEngine).
     */
    setMuted(muted) {
        this.muted = Boolean(muted);
        if (this.masterGain && this.ctx) {
            this._setParam(this.masterGain.gain, this.muted ? 0 : this.volume, this.ctx.currentTime || 0);
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.8));
        if (this.masterGain && this.ctx && !this.muted) {
            this._setParam(this.masterGain.gain, this.volume, this.ctx.currentTime || 0);
        }
    }

    getFrequency(midi) {
        if (midi >= 0 && midi < 128) {
            return this.midiFreqTable[midi];
        }
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    _pruneFinishedVoices(now) {
        if (this.activeVoices.size === 0) return;
        for (const [pitch, rec] of this.activeVoices.entries()) {
            if (now >= rec.endTime + 0.05) {
                this.activeVoices.delete(pitch);
            }
        }
    }

    /**
     * Clean 30ms fade-out release of all active piano notes (used on pause, seek, or Play-Along mute).
     */
    stopAllNotes() {
        if (this.activeVoices.size === 0) return;
        const now = this.ctx ? (this.ctx.currentTime || 0) : 0;

        for (const voice of this.activeVoices.values()) {
            try {
                if (voice.gain && voice.gain.gain) {
                    if (typeof voice.gain.gain.cancelScheduledValues === "function") {
                        voice.gain.gain.cancelScheduledValues(now);
                    }
                    const cur = typeof voice.gain.gain.value === "number"
                        ? Math.max(0.0001, voice.gain.gain.value)
                        : 0.1;
                    this._setParam(voice.gain.gain, cur, now);
                    this._expRamp(voice.gain.gain, 0.0001, now + 0.03);
                }
                if (Array.isArray(voice.oscillators)) {
                    voice.oscillators.forEach((osc) => {
                        try { osc.stop(now + 0.035); } catch (_) {}
                    });
                }
            } catch (_) {}
        }
        this.activeVoices.clear();
    }

    /**
     * Synthesize a realistic piano note with multiple harmonic overtones and natural decay
     */
    playNote(midi, duration = 0.5, velocity = 0.8, startTime = null) {
        if (!this.ctx || this.muted) return;
        if (!this.masterGain) this._setupPianoBus();

        const now = this.ctx.currentTime || 0;
        const t0 = startTime !== null ? startTime : now;
        this._pruneFinishedVoices(now);

        const freq = this.getFrequency(midi);

        // Stop any currently ringing note on same pitch
        if (this.activeVoices.has(midi)) {
            const oldVoice = this.activeVoices.get(midi);
            try {
                if (oldVoice.gain && oldVoice.gain.gain) {
                    if (typeof oldVoice.gain.gain.cancelScheduledValues === "function") {
                        oldVoice.gain.gain.cancelScheduledValues(t0);
                    }
                    const cur = typeof oldVoice.gain.gain.value === "number"
                        ? Math.max(0.0001, oldVoice.gain.gain.value)
                        : 0.1;
                    this._setParam(oldVoice.gain.gain, cur, t0);
                    this._expRamp(oldVoice.gain.gain, 0.0001, t0 + 0.04);
                }
                if (Array.isArray(oldVoice.oscillators)) {
                    oldVoice.oscillators.forEach((osc) => {
                        try { osc.stop(t0 + 0.045); } catch (_) {}
                    });
                }
            } catch (_) {}
            this.activeVoices.delete(midi);
        }

        const voiceGain = this.ctx.createGain();
        voiceGain.connect(this.masterGain);

        // Acoustic Piano Harmonics (Fundamental + Overtones with natural acoustic decay)
        const harmonics = [
            { mult: 1, gain: 1.0 * velocity, decay: duration * 1.2 },
            { mult: 2, gain: 0.5 * velocity, decay: duration * 0.9 },
            { mult: 3, gain: 0.25 * velocity, decay: duration * 0.7 },
            { mult: 4, gain: 0.12 * velocity, decay: duration * 0.5 }
        ];

        const oscillators = [];
        let maxEndTime = t0 + 0.3;

        harmonics.forEach((h) => {
            const osc = this.ctx.createOscillator();
            const hGain = this.ctx.createGain();

            // Subtle piano string inharmonicity (strings are slightly sharp on higher harmonics)
            const inharmonicity = 1 + (h.mult * h.mult * 0.0004);
            this._setParam(osc.frequency, freq * h.mult * inharmonicity, t0);

            // Triangle/sine mix produces acoustic warmth
            osc.type = h.mult === 1 ? "sine" : (h.mult % 2 === 0 ? "triangle" : "sine");

            const decayEnd = t0 + Math.max(0.2, h.decay);
            const stopAt = decayEnd + 0.1;
            if (stopAt > maxEndTime) maxEndTime = stopAt;

            // Percussive hammer attack & exponential piano decay
            this._setParam(hGain.gain, 0.0001, t0);
            this._linRamp(hGain.gain, h.gain, t0 + 0.008); // 8ms hammer attack
            this._expRamp(hGain.gain, Math.max(0.0001, h.gain * 0.4), t0 + 0.08); // Initial bite
            this._expRamp(hGain.gain, 0.0001, decayEnd); // Sustained ring

            osc.connect(hGain);
            hGain.connect(voiceGain);

            osc.start(t0);
            osc.stop(stopAt);
            oscillators.push(osc);
        });

        const voiceRecord = { gain: voiceGain, oscillators, endTime: maxEndTime };
        this.activeVoices.set(midi, voiceRecord);
        this.playNoteCount++;

        if (oscillators[0] && "onended" in oscillators[0]) {
            oscillators[0].onended = () => {
                if (this.activeVoices.get(midi) === voiceRecord) {
                    this.activeVoices.delete(midi);
                }
            };
        }
    }

    /**
     * Precision metronome wooden tick (independent of Play-Along piano note mute)
     * @param {boolean} isDownbeat - True for beat 1 of measure
     */
    playMetronomeClick(isDownbeat = false, time = null) {
        if (!this.ctx || this.volume <= 0.001) return;
        const t0 = time !== null ? time : (this.ctx.currentTime || 0);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Downbeat is higher pitch wooden click
        this._setParam(osc.frequency, isDownbeat ? 1400 : 900, t0);
        this._expRamp(osc.frequency, 200, t0 + 0.03);
        osc.type = "sine";

        const level = (isDownbeat ? 0.55 : 0.32) * this.volume;
        this._setParam(gain.gain, Math.max(0.0001, level), t0);
        this._expRamp(gain.gain, 0.0001, t0 + 0.04);

        osc.connect(gain);
        if (this.ctx.destination) {
            gain.connect(this.ctx.destination);
        }

        osc.start(t0);
        osc.stop(t0 + 0.05);
        this.metronomeClickCount++;
    }
}
