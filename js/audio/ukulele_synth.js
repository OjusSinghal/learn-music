/**
 * Web Audio Acoustic Nylon-String Ukulele Synthesizer & Metronome
 *
 * Synthesizes a warm, woody concert/soprano nylon-string ukulele voice:
 *   - 8–15ms filtered noise pluck transient simulating thumb/finger attack
 *   - Warm fundamental + exponentially damped nylon upper harmonics (2nd, 3rd, 4th)
 *   - Subtle plucked-string initial pitch-tension bloom (+6 cents settling over 18ms)
 *   - Wooden soundbox Helmholtz & top-plate body resonances (~300 Hz & ~520 Hz)
 *   - Subtle per-string stereo panning & 14ms arpeggiated brush stagger on `playStrum()`
 *   - Shares an existing AudioContext (e.g. from PianoSynthesizer) so the app maintains
 *     a single AudioContext across Piano, Ukulele, and BackingTrackEngine.
 *   - Strict headphone split: `setMuted(true)` silences ONLY ukulele guide notes,
 *     NEVER `BackingTrackEngine` or metronome clicks.
 */

import { BackingTrackEngine } from "./backing_track.js";
import { UKULELE_STRINGS } from "../ukulele/chords.js";

// Subtle stereo panning per tab string index (0=A, 1=E, 2=C, 3=G)
const STRING_PAN_MAP = [0.14, 0.05, -0.05, -0.14];

export class UkuleleSynthesizer {
    /**
     * Supports:
     *   - `new UkuleleSynthesizer()`
     *   - `new UkuleleSynthesizer(existingAudioContext)`
     *   - `new UkuleleSynthesizer(pianoSynthInstance)` (shares ctx + backingTrack)
     *   - `new UkuleleSynthesizer({ ctx, backingTrack, volume })`
     */
    constructor(ctxOrOptions = {}) {
        let ctx = null;
        let backingTrack = null;
        let volume = 0.85;

        if (ctxOrOptions && typeof ctxOrOptions.createOscillator === "function") {
            ctx = ctxOrOptions;
        } else if (ctxOrOptions && typeof ctxOrOptions === "object") {
            if (ctxOrOptions.ctx && typeof ctxOrOptions.ctx.createOscillator === "function") {
                ctx = ctxOrOptions.ctx;
            }
            if (ctxOrOptions.backingTrack) {
                backingTrack = ctxOrOptions.backingTrack;
            }
            if (typeof ctxOrOptions.volume === "number" && Number.isFinite(ctxOrOptions.volume)) {
                volume = Math.max(0, Math.min(1, ctxOrOptions.volume));
            }
            if (typeof ctxOrOptions.init === "function" && "playNoteCount" in ctxOrOptions) {
                // Reference parent synth so we can lazily share its AudioContext when initialized later
                this._parentSynth = ctxOrOptions;
            }
        }

        this.ctx = ctx;
        this.masterGain = null;
        this.bodyResonatorA = null;
        this.bodyResonatorB = null;
        this.nylonLowpass = null;
        this._pluckNoiseBuffer = null;

        this.muted = false;
        this.volume = volume;
        this.activeVoices = new Map();

        // Diagnostic counters matching PianoSynthesizer
        this.playNoteCount = 0;
        this.playStrumCount = 0;
        this.metronomeClickCount = 0;

        // Equal temperament frequency lookup table (MIDI 0..127)
        this.midiFreqTable = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            this.midiFreqTable[i] = 440 * Math.pow(2, (i - 69) / 12);
        }

        // Reuse shared BackingTrackEngine or instantiate one independently
        this.backingTrack = backingTrack || new BackingTrackEngine(this, {
            enabled: true,
            volume: 0.65
        });

        if (this.ctx) {
            this._setupUkuleleBus();
            if (this.backingTrack) {
                this.backingTrack.attachContext(this.ctx);
            }
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

    _cancelParam(param, t) {
        if (param && typeof param.cancelScheduledValues === "function") {
            try {
                param.cancelScheduledValues(t);
            } catch (_) {}
        }
    }

    _setupUkuleleBus() {
        if (!this.ctx || this.masterGain) return;
        const now = this.ctx.currentTime || 0;

        this.masterGain = this.ctx.createGain();
        this._setParam(this.masterGain.gain, this.muted ? 0 : this.volume, now);

        if (typeof this.ctx.createBiquadFilter === "function") {
            // Soundbox Helmholtz cavity warmth (~300 Hz)
            this.bodyResonatorA = this.ctx.createBiquadFilter();
            this.bodyResonatorA.type = "peaking";
            this._setParam(this.bodyResonatorA.frequency, 300, now);
            this._setParam(this.bodyResonatorA.Q, 2.2, now);
            this._setParam(this.bodyResonatorA.gain, 3.4, now);

            // Koa/spruce top-plate wood resonance (~520 Hz)
            this.bodyResonatorB = this.ctx.createBiquadFilter();
            this.bodyResonatorB.type = "peaking";
            this._setParam(this.bodyResonatorB.frequency, 520, now);
            this._setParam(this.bodyResonatorB.Q, 2.4, now);
            this._setParam(this.bodyResonatorB.gain, 2.6, now);

            // Smooth nylon treble roll-off
            this.nylonLowpass = this.ctx.createBiquadFilter();
            this.nylonLowpass.type = "lowpass";
            this._setParam(this.nylonLowpass.frequency, 3800, now);
            this._setParam(this.nylonLowpass.Q, 0.75, now);

            this.masterGain.connect(this.bodyResonatorA);
            this.bodyResonatorA.connect(this.bodyResonatorB);
            this.bodyResonatorB.connect(this.nylonLowpass);
            if (this.ctx.destination) {
                this.nylonLowpass.connect(this.ctx.destination);
            }
        } else if (this.ctx.destination) {
            this.masterGain.connect(this.ctx.destination);
        }
    }

    _getPluckNoiseBuffer() {
        if (this._pluckNoiseBuffer) return this._pluckNoiseBuffer;
        if (!this.ctx || typeof this.ctx.createBuffer !== "function") return null;
        try {
            const sr = this.ctx.sampleRate || 44100;
            const len = Math.max(64, Math.floor(sr * 0.025)); // 25ms noise burst
            const buf = this.ctx.createBuffer(1, len, sr);
            const data = buf.getChannelData(0);
            // Deterministic LCG PRNG for reproducible warm pluck transient
            let seed = 0x51a7c3d1;
            let last = 0;
            for (let i = 0; i < len; i++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const white = (seed / 0xffffffff) * 2 - 1;
                // Gentle pink-tinted smoothing
                last = 0.62 * last + 0.38 * white;
                const env = Math.exp(-i / (sr * 0.0045));
                data[i] = last * env;
            }
            this._pluckNoiseBuffer = buf;
            return buf;
        } catch (_) {
            return null;
        }
    }

    /**
     * Attaches an externally created AudioContext (e.g. shared from PianoSynthesizer).
     */
    attachContext(ctx) {
        if (!ctx || typeof ctx.createOscillator !== "function") return;
        if (this.ctx === ctx && this.masterGain) return;
        this.ctx = ctx;
        this.masterGain = null;
        this._pluckNoiseBuffer = null;
        this._setupUkuleleBus();
        if (this.backingTrack) {
            this.backingTrack.attachContext(this.ctx);
        }
    }

    /**
     * Initializes (or lazily shares) AudioContext on first user gesture.
     * Safe no-op in headless jsc when Web Audio is absent.
     */
    init() {
        if (!this.ctx && this._parentSynth) {
            if (!this._parentSynth.ctx && typeof this._parentSynth.init === "function") {
                this._parentSynth.init();
            }
            if (this._parentSynth.ctx) {
                this.attachContext(this._parentSynth.ctx);
                return this.ctx;
            }
        }

        if (!this.ctx) {
            const g = typeof window !== "undefined" ? window : globalThis;
            const AudioCtx = g.AudioContext || g.webkitAudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!AudioCtx) return null;
            this.ctx = new AudioCtx();
        }

        this._setupUkuleleBus();
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
     * Mutes/unmutes ONLY the Ukulele guide voice bus (never mutes BackingTrackEngine or metronome).
     */
    setMuted(muted) {
        this.muted = Boolean(muted);
        if (this.masterGain && this.ctx) {
            this._setParam(this.masterGain.gain, this.muted ? 0 : this.volume, this.ctx.currentTime || 0);
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.85));
        if (this.masterGain && this.ctx && !this.muted) {
            this._setParam(this.masterGain.gain, this.volume, this.ctx.currentTime || 0);
        }
    }

    getFrequency(midi) {
        const m = Math.round(Number(midi));
        if (m >= 0 && m < 128) {
            return this.midiFreqTable[m];
        }
        return 440 * Math.pow(2, ((Number(midi) || 69) - 69) / 12);
    }

    _pruneFinishedVoices(now) {
        if (this.activeVoices.size === 0) return;
        for (const [key, rec] of this.activeVoices.entries()) {
            if (now >= rec.endTime + 0.06) {
                this.activeVoices.delete(key);
            }
        }
    }

    _fadeOutVoice(voice, t0, fadeSec = 0.03) {
        try {
            if (voice.gain && voice.gain.gain) {
                this._cancelParam(voice.gain.gain, t0);
                const cur = typeof voice.gain.gain.value === "number"
                    ? Math.max(0.0001, voice.gain.gain.value)
                    : 0.1;
                this._setParam(voice.gain.gain, cur, t0);
                this._expRamp(voice.gain.gain, 0.0001, t0 + fadeSec);
            }
            if (Array.isArray(voice.sources)) {
                for (let i = 0; i < voice.sources.length; i++) {
                    try { voice.sources[i].stop(t0 + fadeSec + 0.01); } catch (_) {}
                }
            }
        } catch (_) {}
    }

    /**
     * Clean 30ms release of all ringing ukulele voices (pause, seek, Wait-freeze, or Play-Along mute).
     */
    stopAllNotes() {
        if (this.activeVoices.size === 0) return;
        const now = this.ctx ? (this.ctx.currentTime || 0) : 0;
        for (const voice of this.activeVoices.values()) {
            this._fadeOutVoice(voice, now, 0.03);
        }
        this.activeVoices.clear();
    }

    /**
     * Synthesizes a single plucked nylon-string ukulele note.
     * Compatible with both `PianoSynthesizer.playNote(midi, dur, vel, startTime)`
     * and extended `playNote(midi, dur, vel, { startTime, string, fret, pan })`.
     */
    playNote(midi, durationSec = 0.65, velocity = 0.8, opts = null) {
        if (!this.ctx || this.muted) return;
        if (!this.masterGain) this._setupUkuleleBus();

        const now = this.ctx.currentTime || 0;
        const options = (opts && typeof opts === "object")
            ? opts
            : { startTime: typeof opts === "number" ? opts : null };
        const t0 = typeof options.startTime === "number" && Number.isFinite(options.startTime)
            ? Math.max(now, options.startTime)
            : now;
        const dur = Math.max(0.18, Number(durationSec) || 0.65);
        const vel = Math.max(0.05, Math.min(1.0, Number(velocity) || 0.8));
        const stringIdx = Number.isInteger(options.string) && options.string >= 0 && options.string <= 3
            ? options.string
            : null;

        this._pruneFinishedVoices(now);

        const freq = this.getFrequency(midi);
        const voiceKey = stringIdx !== null ? `s${stringIdx}` : `m${Math.round(midi)}`;

        // Gently damp any ringing note on the same physical string (or same pitch)
        if (this.activeVoices.has(voiceKey)) {
            this._fadeOutVoice(this.activeVoices.get(voiceKey), t0, 0.025);
            this.activeVoices.delete(voiceKey);
        }

        const voiceGain = this.ctx.createGain();
        this._setParam(voiceGain.gain, 1.0, t0);

        // Subtle per-string stereo placement
        const panVal = typeof options.pan === "number"
            ? options.pan
            : (stringIdx !== null ? STRING_PAN_MAP[stringIdx] : 0);
        if (Math.abs(panVal) > 0.005 && typeof this.ctx.createStereoPanner === "function") {
            try {
                const panner = this.ctx.createStereoPanner();
                this._setParam(panner.pan, Math.max(-1, Math.min(1, panVal)), t0);
                voiceGain.connect(panner);
                panner.connect(this.masterGain);
            } catch (_) {
                voiceGain.connect(this.masterGain);
            }
        } else {
            voiceGain.connect(this.masterGain);
        }

        const sources = [];
        let maxEndTime = t0 + 0.35;

        // 1. Filtered noise pluck transient (8–15ms fleshy nylon finger attack)
        const noiseBuf = this._getPluckNoiseBuffer();
        if (noiseBuf && typeof this.ctx.createBufferSource === "function") {
            try {
                const noiseSrc = this.ctx.createBufferSource();
                noiseSrc.buffer = noiseBuf;
                const nGain = this.ctx.createGain();
                const pluckLevel = 0.22 * vel;
                this._setParam(nGain.gain, Math.max(0.0001, pluckLevel), t0);
                this._expRamp(nGain.gain, 0.0001, t0 + 0.014);

                if (typeof this.ctx.createBiquadFilter === "function") {
                    const bp = this.ctx.createBiquadFilter();
                    bp.type = "bandpass";
                    this._setParam(bp.frequency, Math.min(3200, Math.max(1200, freq * 3.8)), t0);
                    this._setParam(bp.Q, 1.4, t0);
                    noiseSrc.connect(bp);
                    bp.connect(nGain);
                } else {
                    noiseSrc.connect(nGain);
                }
                nGain.connect(voiceGain);
                noiseSrc.start(t0);
                noiseSrc.stop(t0 + 0.022);
                sources.push(noiseSrc);
            } catch (_) {}
        }

        // 2. Warm nylon harmonics with rapid upper-partial damping
        const ringScale = Math.min(1.85, Math.max(0.45, dur * 1.35));
        const harmonics = [
            { mult: 1, type: "sine",     gain: 0.72 * vel, decay: Math.max(0.35, ringScale * 1.05) },
            { mult: 2, type: "triangle", gain: 0.31 * vel, decay: Math.max(0.22, ringScale * 0.58) },
            { mult: 3, type: "sine",     gain: 0.13 * vel, decay: Math.max(0.14, ringScale * 0.32) },
            { mult: 4, type: "sine",     gain: 0.05 * vel, decay: Math.max(0.09, ringScale * 0.19) }
        ];

        for (let i = 0; i < harmonics.length; i++) {
            const h = harmonics[i];
            const osc = this.ctx.createOscillator();
            const hGain = this.ctx.createGain();
            osc.type = h.type;

            // Gentle plucked-string tension pitch-drop (~+6 cents settling in 18ms)
            const targetFreq = freq * h.mult;
            this._setParam(osc.frequency, targetFreq * 1.0035, t0);
            this._expRamp(osc.frequency, targetFreq, t0 + 0.018);

            const decayEnd = t0 + h.decay;
            const stopAt = decayEnd + 0.06;
            if (stopAt > maxEndTime) maxEndTime = stopAt;

            this._setParam(hGain.gain, 0.0001, t0);
            this._linRamp(hGain.gain, Math.max(0.0002, h.gain), t0 + 0.005); // 5ms crisp nylon pluck
            this._expRamp(hGain.gain, Math.max(0.0001, h.gain * 0.48), t0 + 0.065);
            this._expRamp(hGain.gain, 0.0001, decayEnd);

            osc.connect(hGain);
            hGain.connect(voiceGain);
            osc.start(t0);
            osc.stop(stopAt);
            sources.push(osc);
        }

        const voiceRecord = { gain: voiceGain, sources, endTime: maxEndTime };
        this.activeVoices.set(voiceKey, voiceRecord);
        this.playNoteCount++;

        const leadOsc = sources[sources.length - harmonics.length];
        if (leadOsc && "onended" in leadOsc) {
            leadOsc.onended = () => {
                if (this.activeVoices.get(voiceKey) === voiceRecord) {
                    this.activeVoices.delete(voiceKey);
                }
            };
        }
    }

    /**
     * Strums an array of ukulele notes (`[{ pitch, string, fret }]` or `[midi, ...]`)
     * with authentic 14ms arpeggiated brush stagger in `"down"` (G->C->E->A) or `"up"` (A->E->C->G) order.
     */
    playStrum(notesArray, durationSec = 0.75, strumDir = "down", options = {}) {
        if (!this.ctx || this.muted || !Array.isArray(notesArray) || notesArray.length === 0) return;

        const dir = strumDir === "up" ? "up" : "down";
        const staggerSec = typeof options.staggerSec === "number" ? Math.max(0, options.staggerSec) : 0.014;
        const baseVel = typeof options.velocity === "number" ? options.velocity : 0.72;
        const now = this.ctx.currentTime || 0;
        const baseTime = typeof options.startTime === "number" ? Math.max(now, options.startTime) : now;

        const normalized = notesArray.map((item, idx) => {
            if (typeof item === "number") {
                return { pitch: item, string: idx < 4 ? (3 - idx) : null };
            }
            const sIdx = Number.isInteger(item.string) ? item.string : null;
            const pitch = typeof item.pitch === "number"
                ? item.pitch
                : (sIdx !== null && typeof item.fret === "number" ? UKULELE_STRINGS[sIdx].openMidi + item.fret : 69);
            return {
                pitch,
                string: sIdx,
                fret: item.fret,
                duration: item.duration || durationSec
            };
        });

        // Sort into physical brush order: down = G(3)->C(2)->E(1)->A(0); up = A(0)->E(1)->C(2)->G(3)
        normalized.sort((a, b) => {
            const sa = a.string !== null ? a.string : 1.5;
            const sb = b.string !== null ? b.string : 1.5;
            return dir === "down" ? (sb - sa) : (sa - sb);
        });

        // Natural strum dynamics: slight gain scaling so 4 simultaneous strings stay balanced
        const perStringGainScale = normalized.length >= 3 ? 0.82 : 0.92;
        for (let i = 0; i < normalized.length; i++) {
            const n = normalized[i];
            const velShade = baseVel * perStringGainScale * (dir === "down" ? (1.0 - i * 0.04) : (0.9 + i * 0.03));
            this.playNote(n.pitch, n.duration || durationSec, Math.min(1.0, velShade), {
                startTime: baseTime + i * staggerSec,
                string: n.string,
                fret: n.fret
            });
        }
        this.playStrumCount++;
    }

    /**
     * Warm wooden metronome click (independent of Play-Along ukulele mute).
     */
    playMetronomeClick(isAccent = false, time = null) {
        if (!this.ctx || this.volume <= 0.001) return;
        const t0 = time !== null ? time : (this.ctx.currentTime || 0);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        this._setParam(osc.frequency, isAccent ? 1400 : 900, t0);
        this._expRamp(osc.frequency, 220, t0 + 0.03);
        osc.type = "sine";

        const level = (isAccent ? 0.55 : 0.32) * this.volume;
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
