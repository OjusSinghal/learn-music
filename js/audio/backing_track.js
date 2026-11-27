/**
 * Headphone-Optimized Web Audio Accompaniment & Backing Band Engine
 * Synthesizes warm stereo harmonic pads, voice-led strings, acoustic/sub bass,
 * and subtle studio rhythmic grooves synchronized to song tempo, meter, key, and chords.
 *
 * Designed specifically for headphone piano play-along:
 * - Sits smoothly behind the acoustic/synthesized piano (warm low-pass contoured spectrum, wide stereo field)
 * - Plays independently of the Play-Along piano guide-note toggle (`referenceAudioEnabled`)
 * - Instant 30ms click-free release on pause, Wait-mode freeze, seek, restart, or song switch
 */

const NOTE_TO_PC = {
    C: 0, "B#": 0,
    "C#": 1, Db: 1,
    D: 2,
    "D#": 3, Eb: 3,
    E: 4, Fb: 4,
    F: 5, "E#": 5,
    "F#": 6, Gb: 6,
    G: 7,
    "G#": 8, Ab: 8,
    A: 9,
    "A#": 10, Bb: 10,
    B: 11, Cb: 11
};

const PC_NAMES_SHARP = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const PC_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEY_ROOTS = new Set([5, 10, 3, 8, 1, 6]); // F, Bb, Eb, Ab, Db, Gb

export const VALID_BACKING_STYLES = new Set([
    "warm_pad",
    "acoustic_pop",
    "classical_strings",
    "waltz_chamber",
    "jazz_brushes",
    "cinematic_pulse"
]);

/**
 * Parses a key signature string (e.g. "D", "Am", "Bb", "F#m", "Eb") into { rootPc, mode, preferFlats }.
 */
export function parseKeySignature(keySig = "C") {
    const raw = typeof keySig === "string" ? keySig.trim() : "C";
    const m = raw.match(/^([A-Ga-g])([#b♯♭]?)(m|min|minor)?$/);
    if (!m) {
        return { rootPc: 0, mode: "major", preferFlats: false, symbol: "C" };
    }
    const letter = m[1].toUpperCase();
    const acc = m[2] === "♯" ? "#" : (m[2] === "♭" ? "b" : m[2]);
    const noteName = `${letter}${acc}`;
    const rootPc = NOTE_TO_PC[noteName] !== undefined ? NOTE_TO_PC[noteName] : 0;
    const mode = m[3] ? "minor" : "major";
    const relativeMajorPc = mode === "minor" ? (rootPc + 3) % 12 : rootPc;
    const preferFlats = acc === "b" || FLAT_KEY_ROOTS.has(relativeMajorPc);
    return {
        rootPc,
        mode,
        preferFlats,
        symbol: `${noteName}${mode === "minor" ? "m" : ""}`
    };
}

/**
 * Parses any musical chord symbol (e.g. "C", "Am", "F#m", "Bb", "G7", "Cmaj7",
 * "Dm7", "Bdim", "Gsus4", "G/B", "D/F#", "Em/G", "Cadd9") into pitch-class & interval metadata.
 */
export function parseChordSymbol(symbol, fallbackRootPc = 0) {
    if (!symbol || typeof symbol !== "string" || !symbol.trim()) {
        return {
            symbol: PC_NAMES_SHARP[((fallbackRootPc % 12) + 12) % 12],
            rootPc: ((fallbackRootPc % 12) + 12) % 12,
            bassPc: ((fallbackRootPc % 12) + 12) % 12,
            fifthPc: (((fallbackRootPc % 12) + 12) % 12 + 7) % 12,
            intervals: [0, 4, 7],
            quality: "maj",
            isEmpty: true
        };
    }

    const cleaned = symbol.trim().replace(/♯/g, "#").replace(/♭/g, "b");
    const slashParts = cleaned.split("/");
    const mainPart = slashParts[0].trim();
    const bassPart = slashParts.length > 1 ? slashParts[1].trim() : null;

    const rootMatch = mainPart.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!rootMatch) {
        const rpc = ((fallbackRootPc % 12) + 12) % 12;
        return {
            symbol: cleaned,
            rootPc: rpc,
            bassPc: rpc,
            fifthPc: (rpc + 7) % 12,
            intervals: [0, 4, 7],
            quality: "maj",
            isEmpty: false
        };
    }

    const rootName = `${rootMatch[1].toUpperCase()}${rootMatch[2] || ""}`;
    const rootPc = NOTE_TO_PC[rootName] !== undefined ? NOTE_TO_PC[rootName] : ((fallbackRootPc % 12) + 12) % 12;
    const qualRaw = (rootMatch[3] || "").trim();

    let intervals = [0, 4, 7];
    let quality = "maj";
    let fifthOffset = 7;

    if (/^(m7b5|min7b5|ø7?)$/i.test(qualRaw)) {
        intervals = [0, 3, 6, 10];
        quality = "m7b5";
        fifthOffset = 6;
    } else if (/^(dim7|o7|°7)$/i.test(qualRaw)) {
        intervals = [0, 3, 6, 9];
        quality = "dim7";
        fifthOffset = 6;
    } else if (/^(dim|o|°)$/i.test(qualRaw)) {
        intervals = [0, 3, 6];
        quality = "dim";
        fifthOffset = 6;
    } else if (/^(aug|\+)$/i.test(qualRaw)) {
        intervals = [0, 4, 8];
        quality = "aug";
        fifthOffset = 8;
    } else if (/^(maj9|M9|Δ9)$/.test(qualRaw) || /^maj9$/i.test(qualRaw)) {
        intervals = [0, 4, 7, 11, 14];
        quality = "maj9";
    } else if (/^(maj7|M7|Δ7?)$/.test(qualRaw) || /^maj7$/i.test(qualRaw)) {
        intervals = [0, 4, 7, 11];
        quality = "maj7";
    } else if (/^(m9|min9|-9)$/i.test(qualRaw) && !/^maj/i.test(qualRaw)) {
        intervals = [0, 3, 7, 10, 14];
        quality = "m9";
    } else if (/^(m7|min7|-7)$/i.test(qualRaw) && !/^maj/i.test(qualRaw)) {
        intervals = [0, 3, 7, 10];
        quality = "m7";
    } else if (/^(m6|min6)$/i.test(qualRaw) && !/^maj/i.test(qualRaw)) {
        intervals = [0, 3, 7, 9];
        quality = "m6";
    } else if (/^(madd9|minadd9)$/i.test(qualRaw)) {
        intervals = [0, 3, 7, 14];
        quality = "madd9";
    } else if ((/^(m|min|-)$/i.test(qualRaw) || (/^m/i.test(qualRaw) && !/^maj/i.test(qualRaw)))) {
        intervals = [0, 3, 7];
        quality = "min";
    } else if (/^7sus4$/i.test(qualRaw) || /^7sus$/i.test(qualRaw)) {
        intervals = [0, 5, 7, 10];
        quality = "7sus4";
    } else if (/^sus2$/i.test(qualRaw)) {
        intervals = [0, 2, 7];
        quality = "sus2";
    } else if (/^sus4?$/i.test(qualRaw)) {
        intervals = [0, 5, 7];
        quality = "sus4";
    } else if (/^9$/i.test(qualRaw)) {
        intervals = [0, 4, 7, 10, 14];
        quality = "9";
    } else if (/^add9$/i.test(qualRaw) || /^2$/i.test(qualRaw)) {
        intervals = [0, 4, 7, 14];
        quality = "add9";
    } else if (/^6$/i.test(qualRaw)) {
        intervals = [0, 4, 7, 9];
        quality = "6";
    } else if (/^5$/i.test(qualRaw)) {
        intervals = [0, 7];
        quality = "5";
    } else if (/^7/.test(qualRaw)) {
        intervals = [0, 4, 7, 10];
        quality = "7";
    }

    let bassPc = rootPc;
    if (bassPart) {
        const bassMatch = bassPart.match(/^([A-Ga-g])([#b]?)/);
        if (bassMatch) {
            const bName = `${bassMatch[1].toUpperCase()}${bassMatch[2] || ""}`;
            if (NOTE_TO_PC[bName] !== undefined) {
                bassPc = NOTE_TO_PC[bName];
            }
        }
    }

    return {
        symbol: cleaned,
        rootPc,
        bassPc,
        fifthPc: (rootPc + fifthOffset) % 12,
        intervals,
        quality,
        isEmpty: false
    };
}

/**
 * Splits a measure chord entry such as "G → C", "G -> D", or "Dm7 | G7" into timed sub-segments.
 */
function parseMeasureChordSegments(entry, fallbackRootPc = 0) {
    if (!entry || typeof entry !== "string" || !entry.trim()) {
        return null;
    }
    const parts = entry
        .split(/\s*(?:→|->|\||(?:\s+-\s+))\s*/)
        .map((s) => s.trim())
        .filter(Boolean);

    if (parts.length === 0) return null;
    const step = 1.0 / parts.length;
    return parts.map((sym, idx) => ({
        startFraction: idx * step,
        endFraction: (idx + 1) * step,
        chord: parseChordSymbol(sym, fallbackRootPc)
    }));
}

/**
 * Automatic Measure-by-Measure Harmonic Analyzer:
 * Infers musically accurate chord symbols from score notes & key signature whenever
 * a song or imported MIDI/MusicXML/QuickComposer piece lacks explicit chord symbols.
 */
export function inferChordsFromNotes(song) {
    if (!song || !Array.isArray(song.notes) || song.notes.length === 0) {
        const keyInfo = parseKeySignature(song && song.keySignature ? song.keySignature : "C");
        return [keyInfo.symbol];
    }

    const bpm = song.bpm || 100;
    const beatsPerMeasure = song.beatsPerMeasure || 4;
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const keyInfo = parseKeySignature(song.keySignature || "C");
    const pcNames = keyInfo.preferFlats ? PC_NAMES_FLAT : PC_NAMES_SHARP;

    // Diatonic chord templates in the song's key receive a natural musical prior bonus
    const diatonicPriors = new Map();
    if (keyInfo.mode === "major") {
        const degs = [
            { off: 0, q: "maj", bonus: 1.35 },
            { off: 2, q: "min", bonus: 1.15 },
            { off: 4, q: "min", bonus: 1.10 },
            { off: 5, q: "maj", bonus: 1.28 },
            { off: 7, q: "maj", bonus: 1.32 },
            { off: 7, q: "7", bonus: 1.24 },
            { off: 9, q: "min", bonus: 1.22 },
            { off: 11, q: "dim", bonus: 0.95 }
        ];
        for (const d of degs) {
            diatonicPriors.set(`${(keyInfo.rootPc + d.off) % 12}:${d.q}`, d.bonus);
        }
    } else {
        const degs = [
            { off: 0, q: "min", bonus: 1.38 },
            { off: 2, q: "dim", bonus: 0.98 },
            { off: 3, q: "maj", bonus: 1.22 },
            { off: 5, q: "min", bonus: 1.24 },
            { off: 7, q: "maj", bonus: 1.30 }, // Harmonic minor V
            { off: 7, q: "7", bonus: 1.28 },   // Harmonic minor V7
            { off: 7, q: "min", bonus: 1.12 },
            { off: 8, q: "maj", bonus: 1.20 },
            { off: 10, q: "maj", bonus: 1.18 }
        ];
        for (const d of degs) {
            diatonicPriors.set(`${(keyInfo.rootPc + d.off) % 12}:${d.q}`, d.bonus);
        }
    }

    const templates = [
        { q: "maj", suffix: "", intervals: [0, 4, 7], weights: [1.30, 1.10, 0.95], complexityPenalty: 0.0 },
        { q: "min", suffix: "m", intervals: [0, 3, 7], weights: [1.30, 1.10, 0.95], complexityPenalty: 0.0 },
        { q: "7", suffix: "7", intervals: [0, 4, 7, 10], weights: [1.22, 1.05, 0.85, 0.95], complexityPenalty: 0.35 },
        { q: "m7", suffix: "m7", intervals: [0, 3, 7, 10], weights: [1.22, 1.05, 0.85, 0.92], complexityPenalty: 0.42 },
        { q: "maj7", suffix: "maj7", intervals: [0, 4, 7, 11], weights: [1.22, 1.05, 0.85, 0.90], complexityPenalty: 0.45 },
        { q: "dim", suffix: "dim", intervals: [0, 3, 6], weights: [1.15, 1.0, 1.0], complexityPenalty: 0.40 }
    ];

    let maxOnset = 0;
    for (let i = 0; i < song.notes.length; i++) {
        if (song.notes[i].time > maxOnset) maxOnset = song.notes[i].time;
    }
    const numMeasures = Math.max(1, Math.floor((maxOnset + 0.02) / measureSec) + 1);
    const inferred = [];
    let prevSymbol = keyInfo.symbol;

    for (let m = 0; m < numMeasures; m++) {
        const mStart = m * measureSec;
        const mEnd = (m + 1) * measureSec;
        const pcWeights = new Float64Array(12);
        let totalWeight = 0;
        let lowestBassPitch = Infinity;
        let lowestBassPc = null;

        for (let i = 0; i < song.notes.length; i++) {
            const n = song.notes[i];
            const nStart = n.time;
            const nEnd = n.time + (n.duration || 0.35);
            const overlapStart = Math.max(mStart, nStart);
            const overlapEnd = Math.min(mEnd, nEnd);
            const overlap = overlapEnd - overlapStart;
            if (overlap <= 0.005) continue;

            const pc = ((n.pitch % 12) + 12) % 12;
            const isDownbeat = Math.abs(nStart - mStart) <= 0.075;
            const isMidStrong = Math.abs(nStart - (mStart + measureSec * 0.5)) <= 0.075;
            const isBass = n.hand === "left" || n.clef === "bass" || n.pitch < 58;

            let w = Math.max(0.12, overlap);
            if (isDownbeat) w *= 1.65;
            else if (isMidStrong) w *= 1.25;
            if (isBass) w *= 1.55;

            pcWeights[pc] += w;
            totalWeight += w;

            if (isBass && (isDownbeat || n.pitch < lowestBassPitch - 3) && n.pitch < lowestBassPitch) {
                lowestBassPitch = n.pitch;
                lowestBassPc = pc;
            }
        }

        if (totalWeight <= 1e-6) {
            inferred.push(prevSymbol);
            continue;
        }

        let bestScore = -Infinity;
        let bestRoot = keyInfo.rootPc;
        let bestTemplate = templates[keyInfo.mode === "minor" ? 1 : 0];

        for (let root = 0; root < 12; root++) {
            for (let tIdx = 0; tIdx < templates.length; tIdx++) {
                const tpl = templates[tIdx];
                let chordToneSum = 0;
                const chordSet = new Set();
                let presentTones = 0;

                for (let k = 0; k < tpl.intervals.length; k++) {
                    const cpc = (root + tpl.intervals[k]) % 12;
                    chordSet.add(cpc);
                    if (pcWeights[cpc] > 0.02 * totalWeight) {
                        presentTones++;
                    }
                    chordToneSum += pcWeights[cpc] * tpl.weights[k];
                }

                let nonChordPenalty = 0;
                for (let pc = 0; pc < 12; pc++) {
                    if (!chordSet.has(pc) && pcWeights[pc] > 0) {
                        nonChordPenalty += pcWeights[pc] * 0.55;
                    }
                }

                // Require at least 3 distinct chord tones before choosing 4-note 7th chords
                if (tpl.intervals.length >= 4 && presentTones < 3) {
                    nonChordPenalty += totalWeight * 0.65;
                }

                const prior = diatonicPriors.get(`${root}:${tpl.q}`) || 0.86;
                let score = (chordToneSum - nonChordPenalty - tpl.complexityPenalty * 0.25 * totalWeight) * prior;

                if (lowestBassPc !== null) {
                    if (lowestBassPc === root) {
                        score += totalWeight * 0.28;
                    } else if (chordSet.has(lowestBassPc)) {
                        score += totalWeight * 0.10;
                    }
                }

                // Tonic resolution preference on final measure
                if (m === numMeasures - 1 && root === keyInfo.rootPc && tpl.q === (keyInfo.mode === "minor" ? "min" : "maj")) {
                    score += totalWeight * 0.20;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestRoot = root;
                    bestTemplate = tpl;
                }
            }
        }

        let symbol = `${pcNames[bestRoot]}${bestTemplate.suffix}`;
        if (
            lowestBassPc !== null &&
            lowestBassPc !== bestRoot &&
            bestTemplate.intervals.some((iv) => (bestRoot + iv) % 12 === lowestBassPc) &&
            pcWeights[lowestBassPc] >= 0.28 * totalWeight
        ) {
            symbol = `${symbol}/${pcNames[lowestBassPc]}`;
        }

        inferred.push(symbol);
        prevSymbol = symbol;
    }

    return inferred;
}

export class BackingTrackEngine {
    constructor(synthOrCtx = null, options = {}) {
        this.synth = null;
        this.ctx = null;

        if (synthOrCtx && typeof synthOrCtx.createOscillator === "function") {
            this.ctx = synthOrCtx;
        } else if (synthOrCtx && typeof synthOrCtx === "object") {
            this.synth = synthOrCtx;
            if (synthOrCtx.ctx && typeof synthOrCtx.ctx.createOscillator === "function") {
                this.ctx = synthOrCtx.ctx;
            }
        }

        this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true;
        this.volume = typeof options.volume === "number"
            ? Math.max(0, Math.min(1, options.volume))
            : 0.65;

        this.masterGain = null;
        this.warmthFilter = null;
        this._noiseBuffer = null;

        // Prepared song state
        this.song = null;
        this.style = "warm_pad";
        this.bpm = 100;
        this.beatsPerMeasure = 4;
        this.timeSignature = [4, 4];
        this.keyInfo = parseKeySignature("C");
        this.measureScoreSec = 2.4;
        this.subCount = 8;
        this.subScoreSec = 0.3;
        this.isCompoundEighth = false;
        this.measureSegments = []; // Array per measure of [{ startFraction, endFraction, chord, isWhisper }]
        this.openingChord = parseChordSymbol("C");
        this.inferredChordsUsed = false;
        this.songEndScoreTime = 0;

        // Active playback & voice-leading state
        this._activeNodes = new Set();
        this._scheduledSubs = new Set();
        this._activePadKey = null;
        this._lastVoicedMidis = null;
        this._lastTickTime = null;
        this._currentChordSymbol = "C";

        // Observable telemetry for diagnostics & automated tests
        this.stats = {
            padTriggers: 0,
            bassTriggers: 0,
            rhythmTriggers: 0,
            arpTriggers: 0,
            totalScheduledNodes: 0,
            stopAllCalls: 0
        };

        if (this.ctx) {
            this._setupOutputBus();
        }
    }

    static parseChordSymbol(symbol, fallbackRootPc = 0) {
        return parseChordSymbol(symbol, fallbackRootPc);
    }

    static inferChordsFromNotes(song) {
        return inferChordsFromNotes(song);
    }

    parseChordSymbol(symbol, fallbackRootPc = 0) {
        return parseChordSymbol(symbol, fallbackRootPc);
    }

    inferChordsFromNotes(song) {
        return inferChordsFromNotes(song);
    }

    /**
     * Chooses the best headphone backing style for a song when `song.backingStyle` is omitted.
     */
    static resolveBackingStyle(song) {
        if (!song) return "warm_pad";
        if (song.backingStyle && VALID_BACKING_STYLES.has(song.backingStyle)) {
            return song.backingStyle;
        }

        const id = String(song.id || "").toLowerCase();
        const title = String(song.title || "").toLowerCase();
        const artist = String(song.artist || "").toLowerCase();
        const ts = Array.isArray(song.timeSignature) ? song.timeSignature : [song.beatsPerMeasure || 4, 4];
        const bpm = song.bpm || 100;

        if (id.includes("wise_men") || (ts[0] === 6 && ts[1] === 8)) {
            return "acoustic_pop";
        }
        if (id.includes("fur_elise") || title.includes("minuet") || (ts[0] === 3 && ts[1] === 8)) {
            return "waltz_chamber";
        }
        if (ts[0] === 3 && ts[1] === 4) {
            if (title.includes("amazing grace") || title.includes("hymn")) {
                return "warm_pad";
            }
            return "waltz_chamber";
        }
        if (
            id.includes("canon") ||
            id.includes("ode_to_joy") ||
            artist.includes("beethoven") ||
            artist.includes("bach") ||
            artist.includes("mozart") ||
            artist.includes("pachelbel") ||
            artist.includes("chopin")
        ) {
            return "classical_strings";
        }
        if (title.includes("jazz") || title.includes("blues") || title.includes("swing")) {
            return "jazz_brushes";
        }
        if (title.includes("cinematic") || title.includes("epic")) {
            return "cinematic_pulse";
        }
        if (bpm < 74 && !id.includes("groove")) {
            return "warm_pad";
        }
        return "acoustic_pop";
    }

    attachContext(ctx) {
        if (!ctx || typeof ctx.createOscillator !== "function") return;
        if (this.ctx === ctx && this.masterGain) return;
        this.ctx = ctx;
        this._noiseBuffer = null;
        this._setupOutputBus();
    }

    _ensureContext() {
        if (this.ctx && typeof this.ctx.createOscillator === "function") {
            if (!this.masterGain) this._setupOutputBus();
            return this.ctx;
        }
        if (this.synth) {
            if (!this.synth.ctx && typeof this.synth.init === "function") {
                this.synth.init();
            }
            if (this.synth.ctx && typeof this.synth.ctx.createOscillator === "function") {
                this.attachContext(this.synth.ctx);
                return this.ctx;
            }
        }
        const g = typeof window !== "undefined" ? window : globalThis;
        const AudioCtx = g.AudioContext || g.webkitAudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
        if (AudioCtx) {
            this.attachContext(new AudioCtx());
            return this.ctx;
        }
        return null;
    }

    _setupOutputBus() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime || 0;
        this.masterGain = this.ctx.createGain();
        this._setParam(this.masterGain.gain, this.enabled ? this.volume : 0, now);

        if (typeof this.ctx.createBiquadFilter === "function") {
            this.warmthFilter = this.ctx.createBiquadFilter();
            this.warmthFilter.type = "lowpass";
            this._setParam(this.warmthFilter.frequency, 2800, now);
            this._setParam(this.warmthFilter.Q, 0.65, now);
            this.warmthFilter.connect(this.masterGain);
        } else {
            this.warmthFilter = null;
        }

        if (this.ctx.destination) {
            this.masterGain.connect(this.ctx.destination);
        }
    }

    _getBusDestination() {
        return this.warmthFilter || this.masterGain;
    }

    _midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
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

    _connectWithPan(node, dest, pan = 0) {
        if (!this.ctx || !dest) return;
        if (Math.abs(pan) > 0.01 && typeof this.ctx.createStereoPanner === "function") {
            try {
                const panner = this.ctx.createStereoPanner();
                this._setParam(panner.pan, Math.max(-1, Math.min(1, pan)), this.ctx.currentTime || 0);
                node.connect(panner);
                panner.connect(dest);
                return;
            } catch (_) {}
        }
        node.connect(dest);
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.stopAll();
        }
        if (this.masterGain && this.ctx) {
            const now = this.ctx.currentTime || 0;
            this._cancelParam(this.masterGain.gain, now);
            this._setParam(this.masterGain.gain, this.enabled ? this.volume : 0, now);
        }
        return this.enabled;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.65));
        if (this.masterGain && this.ctx && this.enabled) {
            const now = this.ctx.currentTime || 0;
            this._cancelParam(this.masterGain.gain, now);
            this._setParam(this.masterGain.gain, this.volume, now);
        }
        return this.volume;
    }

    getActiveVoiceCount() {
        this._pruneFinishedNodes();
        return this._activeNodes.size;
    }

    getState() {
        return {
            enabled: this.enabled,
            volume: this.volume,
            style: this.style,
            currentChord: this._currentChordSymbol,
            inferredChords: this.inferredChordsUsed,
            activeVoices: this.getActiveVoiceCount()
        };
    }

    /**
     * Prepares harmonic timeline, time-signature subdivisions, and backing style for `song`.
     */
    prepareSong(song) {
        this.stopAll();
        this._scheduledSubs.clear();
        this._lastVoicedMidis = null;
        this._lastTickTime = null;

        if (!song) {
            this.song = null;
            return;
        }

        this.song = song;
        this.bpm = song.bpm || 100;
        this.beatsPerMeasure = song.beatsPerMeasure || 4;
        this.timeSignature = Array.isArray(song.timeSignature) && song.timeSignature.length === 2
            ? [song.timeSignature[0], song.timeSignature[1]]
            : [this.beatsPerMeasure, 4];
        this.keyInfo = parseKeySignature(song.keySignature || "C");
        this.style = BackingTrackEngine.resolveBackingStyle(song);

        const beatSec = 60.0 / this.bpm;
        this.measureScoreSec = this.beatsPerMeasure * beatSec;

        const [tsNum, tsDen] = this.timeSignature;
        this.isCompoundEighth = (
            tsDen === 8 &&
            tsNum >= 6 &&
            tsNum % 3 === 0 &&
            this.beatsPerMeasure === tsNum / 3
        );

        if (this.isCompoundEighth) {
            this.subCount = tsNum; // e.g. 6 eighth subdivisions per bar in 6/8
        } else if (tsDen === 8 && tsNum === this.beatsPerMeasure) {
            this.subCount = tsNum; // e.g. 3 eighth beats per bar in 3/8
        } else {
            this.subCount = Math.max(2, this.beatsPerMeasure * 2); // eighth-note grid in 2/4, 3/4, 4/4
        }
        this.subScoreSec = this.measureScoreSec / this.subCount;

        const notes = Array.isArray(song.notes) ? song.notes : [];
        let maxNoteEnd = this.measureScoreSec;
        let maxOnset = 0;
        for (let i = 0; i < notes.length; i++) {
            const end = notes[i].time + (notes[i].duration || 0.4);
            if (end > maxNoteEnd) maxNoteEnd = end;
            if (notes[i].time > maxOnset) maxOnset = notes[i].time;
        }
        this.songEndScoreTime = maxNoteEnd + 0.35;

        const numMeasures = Math.max(
            1,
            Math.floor((maxOnset + 0.02) / this.measureScoreSec) + 1,
            Array.isArray(song.chords) ? song.chords.length : 0
        );

        const inferred = inferChordsFromNotes(song);
        const hasExplicitChords = Array.isArray(song.chords) && song.chords.some((c) => typeof c === "string" && c.trim().length > 0);
        this.inferredChordsUsed = !hasExplicitChords;

        // Determine first non-empty chord for count-in & pickup preparation
        let firstExplicit = null;
        if (hasExplicitChords) {
            firstExplicit = song.chords.find((c) => typeof c === "string" && c.trim().length > 0) || null;
        }
        const defaultTonicSymbol = this.keyInfo.symbol;
        const firstSymbol = firstExplicit || inferred[0] || defaultTonicSymbol;
        this.openingChord = parseChordSymbol(firstSymbol, this.keyInfo.rootPc);
        this._currentChordSymbol = this.openingChord.symbol;

        this.measureSegments = [];
        for (let m = 0; m < numMeasures; m++) {
            const rawExplicit = hasExplicitChords && m < song.chords.length ? song.chords[m] : null;
            const parsedSegs = parseMeasureChordSegments(rawExplicit, this.keyInfo.rootPc);
            if (parsedSegs && parsedSegs.length > 0) {
                this.measureSegments.push(
                    parsedSegs.map((seg) => ({ ...seg, isWhisper: false }))
                );
            } else {
                // Empty "" measure (pickup or solo cadenza) or inferred measure
                const fallbackSym = inferred[m] || (m === 0 ? firstSymbol : defaultTonicSymbol);
                const parsedFallback = parseChordSymbol(fallbackSym, this.keyInfo.rootPc);
                this.measureSegments.push([
                    {
                        startFraction: 0,
                        endFraction: 1.0,
                        chord: parsedFallback,
                        isWhisper: hasExplicitChords // subtle dynamics on intentional "" pickup/solo bars
                    }
                ]);
            }
        }
    }

    /**
     * Instant 30ms click-free release of all active oscillators, noise sources, and envelopes.
     * Guarantees zero hanging voices on pause, Wait-mode freeze, seek, restart, or song switch.
     */
    stopAll() {
        this._activePadKey = null;
        if (this._activeNodes.size === 0) return;

        this.stats.stopAllCalls++;
        const now = this.ctx ? (this.ctx.currentTime || 0) : 0;

        for (const record of this._activeNodes) {
            if (record.gain && record.gain.gain) {
                try {
                    const curVal = typeof record.gain.gain.value === "number"
                        ? Math.max(0.0001, record.gain.gain.value)
                        : 0.05;
                    this._cancelParam(record.gain.gain, now);
                    this._setParam(record.gain.gain, curVal, now);
                    this._expRamp(record.gain.gain, 0.0001, now + 0.03);
                } catch (_) {}
            }
            if (Array.isArray(record.sources)) {
                for (let i = 0; i < record.sources.length; i++) {
                    try {
                        record.sources[i].stop(now + 0.035);
                    } catch (_) {}
                }
            }
        }
        this._activeNodes.clear();
    }

    _registerActiveRecord(gainNode, sources, endTime) {
        const record = { gain: gainNode, sources, endTime };
        this._activeNodes.add(record);
        this.stats.totalScheduledNodes += sources.length;
        return record;
    }

    _pruneFinishedNodes() {
        if (!this.ctx || this._activeNodes.size === 0) return;
        const now = this.ctx.currentTime || 0;
        for (const record of this._activeNodes) {
            if (now >= record.endTime + 0.05) {
                this._activeNodes.delete(record);
            }
        }
    }

    /**
     * Smoothly voice-leads chord tones into warm mid-register (`MIDI 55..69`, G3..A4)
     * minimizing pitch jumps between consecutive measures.
     */
    _voiceChordMidis(chord) {
        const targetCenter = 61; // C#4 — warm keyboard center below treble melody brilliance
        const rawMidis = chord.intervals.slice(0, 4).map((iv) => {
            const pc = (chord.rootPc + iv) % 12;
            let midi = 60 + pc;
            while (midi - targetCenter > 6) midi -= 12;
            while (targetCenter - midi > 6) midi += 12;
            return midi;
        });
        rawMidis.sort((a, b) => a - b);

        // Spread overly tight low intervals for clarity in headphones
        if (rawMidis.length >= 3 && rawMidis[1] - rawMidis[0] <= 2) {
            rawMidis[1] += 12;
            rawMidis.sort((a, b) => a - b);
        }

        if (this._lastVoicedMidis && this._lastVoicedMidis.length > 0) {
            const prevAvg = this._lastVoicedMidis.reduce((s, x) => s + x, 0) / this._lastVoicedMidis.length;
            const curAvg = rawMidis.reduce((s, x) => s + x, 0) / rawMidis.length;
            if (curAvg - prevAvg > 5.5 && rawMidis[0] - 12 >= 50) {
                rawMidis[rawMidis.length - 1] -= 12;
                rawMidis.sort((a, b) => a - b);
            } else if (prevAvg - curAvg > 5.5 && rawMidis[rawMidis.length - 1] + 12 <= 73) {
                rawMidis[0] += 12;
                rawMidis.sort((a, b) => a - b);
            }
        }

        this._lastVoicedMidis = rawMidis;
        return rawMidis;
    }

    _resolveBassMidi(pc, preferUpper = false) {
        // Place bass warmly inside 61-key low register [38..49] (D2..C#3)
        let midi = 36 + (((pc % 12) + 12) % 12);
        if (midi < 38) midi += 12;
        if (preferUpper && midi + 7 <= 53) {
            return midi;
        }
        if (midi > 49) midi -= 12;
        return Math.max(36, midi);
    }

    _resolveSegmentAtMeasure(measureIdx, fracInMeasure) {
        if (measureIdx < 0) {
            return {
                key: `lead:${measureIdx}`,
                chord: this.openingChord,
                startScore: measureIdx * this.measureScoreSec,
                endScore: (measureIdx + 1) * this.measureScoreSec,
                gainScale: 0.52,
                isLeadIn: true
            };
        }
        if (this.measureSegments.length === 0) {
            return {
                key: `m:${measureIdx}:0`,
                chord: this.openingChord,
                startScore: measureIdx * this.measureScoreSec,
                endScore: (measureIdx + 1) * this.measureScoreSec,
                gainScale: 1.0,
                isLeadIn: false
            };
        }

        const clampedIdx = Math.min(measureIdx, this.measureSegments.length - 1);
        const segs = this.measureSegments[clampedIdx];
        let chosenIdx = 0;
        for (let i = 0; i < segs.length; i++) {
            if (fracInMeasure >= segs[i].startFraction - 1e-6 && fracInMeasure < segs[i].endFraction + 1e-6) {
                chosenIdx = i;
                break;
            }
        }
        const seg = segs[chosenIdx];
        const mStart = measureIdx * this.measureScoreSec;
        return {
            key: `m:${measureIdx}:${chosenIdx}`,
            chord: seg.chord,
            startScore: mStart + seg.startFraction * this.measureScoreSec,
            endScore: mStart + seg.endFraction * this.measureScoreSec,
            gainScale: seg.isWhisper ? 0.44 : 1.0,
            isLeadIn: false
        };
    }

    /**
     * Main real-time scheduler hook called from `GameEngine.processAudioAndEvents()`.
     */
    onTick(currentTime, isPlaying, isWaiting, tempoMultiplier = 1.0) {
        if (!this.enabled || !isPlaying || isWaiting || !this.song) {
            if (this._activeNodes.size > 0) {
                this.stopAll();
            }
            this._lastTickTime = currentTime;
            return;
        }

        if (currentTime > this.songEndScoreTime) {
            this._lastTickTime = currentTime;
            return;
        }

        const ctx = this._ensureContext();
        if (!ctx) return;

        if (ctx.state === "suspended" && typeof ctx.resume === "function") {
            try { ctx.resume(); } catch (_) {}
        }

        this._pruneFinishedNodes();

        const safeMult = Math.max(0.25, Math.min(2.5, tempoMultiplier || 1.0));

        // Detect backward seek or large forward scrub -> cleanly reset active voices
        let prevTick = this._lastTickTime;
        if (
            prevTick !== null &&
            (currentTime < prevTick - 0.025 ||
                currentTime - prevTick > this.measureScoreSec * 0.9)
        ) {
            this.stopAll();
            this._scheduledSubs.clear();
            prevTick = null;
        }
        this._lastTickTime = currentTime;

        const nowAudio = ctx.currentTime || 0;
        const measureIdx = Math.floor((currentTime + 1e-5) / this.measureScoreSec);
        const mStart = measureIdx * this.measureScoreSec;
        const fracInMeasure = Math.max(0, Math.min(0.9999, (currentTime - mStart) / this.measureScoreSec));
        const seg = this._resolveSegmentAtMeasure(measureIdx, fracInMeasure);
        this._currentChordSymbol = seg.chord.symbol;

        // 1. Ensure continuous stereo harmonic pad for the active chord segment
        // (Starts on barline/chord change AND smoothly re-engages after pause, seek, or Wait-mode unfreeze)
        const remScoreSec = seg.endScore - currentTime;
        const remAudioSec = remScoreSec / safeMult;
        if (this._activePadKey !== seg.key && remAudioSec >= 0.16) {
            this._activePadKey = seg.key;
            this._triggerPadChord(seg.chord, nowAudio, remAudioSec, seg.gainScale);
        }

        // 2. Schedule bass, studio percussion & harmonic arpeggios across subdivisions
        //    Covers all subdivisions crossed since `prevTick` plus a tight 45ms lookahead (zero dropped beats!)
        const lookaheadScore = 0.045 * safeMult;
        const windowStart = prevTick !== null
            ? Math.max(currentTime - this.measureScoreSec * 0.5, prevTick - 0.005 * safeMult)
            : (currentTime - 0.025 * safeMult);
        const windowEnd = Math.min(this.songEndScoreTime, currentTime + lookaheadScore);

        const firstGlobalSub = Math.ceil((windowStart - 1e-6) / this.subScoreSec);
        const lastGlobalSub = Math.floor((windowEnd + 1e-6) / this.subScoreSec);

        for (let gSub = firstGlobalSub; gSub <= lastGlobalSub; gSub++) {
            if (this._scheduledSubs.has(gSub)) continue;
            const subScoreTime = gSub * this.subScoreSec;
            if (subScoreTime < windowStart - 1e-5 || subScoreTime > windowEnd + 1e-5) continue;

            const offsetAudioSec = Math.max(0, (subScoreTime - currentTime) / safeMult);
            if (offsetAudioSec > 0.065) continue;

            this._scheduledSubs.add(gSub);
            const t0 = nowAudio + offsetAudioSec;
            const subDurAudio = this.subScoreSec / safeMult;

            const barIdx = Math.floor((subScoreTime + 1e-5) / this.measureScoreSec);
            const subInBar = ((gSub % this.subCount) + this.subCount) % this.subCount;
            const barFrac = subInBar / this.subCount;
            const subSeg = this._resolveSegmentAtMeasure(barIdx, barFrac);

            this._scheduleSubdivisionGroove(subSeg, subInBar, t0, subDurAudio);
        }
    }

    _triggerPadChord(chord, t0, durAudio, gainScale = 1.0) {
        const dest = this._getBusDestination();
        if (!this.ctx || !dest) return;

        const midis = this._voiceChordMidis(chord);
        const styleCfg = this._getPadStyleConfig();
        const padGainVal = styleCfg.level * gainScale;
        if (padGainVal <= 0.002) return;

        const voiceGain = this.ctx.createGain();
        const attack = Math.min(styleCfg.attack, durAudio * 0.35);
        const release = styleCfg.release;

        this._setParam(voiceGain.gain, 0.0001, t0);
        this._linRamp(voiceGain.gain, padGainVal, t0 + Math.max(0.015, attack));
        this._linRamp(voiceGain.gain, padGainVal * styleCfg.sustainRatio, t0 + Math.max(attack + 0.02, durAudio * 0.85));
        this._expRamp(voiceGain.gain, 0.0001, t0 + durAudio + release);

        let targetNode = dest;
        if (typeof this.ctx.createBiquadFilter === "function") {
            const lpf = this.ctx.createBiquadFilter();
            lpf.type = "lowpass";
            this._setParam(lpf.frequency, styleCfg.cutoffHz, t0);
            this._setParam(lpf.Q, 0.7, t0);
            lpf.connect(dest);

            // High-pass pad above 160 Hz so center bass (55–190 Hz) stays crystal-clear in headphones
            const hpf = this.ctx.createBiquadFilter();
            hpf.type = "highpass";
            this._setParam(hpf.frequency, 160, t0);
            this._setParam(hpf.Q, 0.65, t0);
            hpf.connect(lpf);
            targetNode = hpf;
        }
        voiceGain.connect(targetNode);

        const sources = [];
        const endTime = t0 + durAudio + release + 0.04;

        for (let i = 0; i < midis.length; i++) {
            const baseFreq = this._midiToFreq(midis[i]);
            // Stereo detuned pair (-L / +R) keeps center wide open for piano clarity in headphones
            const pair = [
                { detuneCents: -styleCfg.detuneCents, pan: -styleCfg.stereoSpread, wave: styleCfg.waveL },
                { detuneCents: styleCfg.detuneCents, pan: styleCfg.stereoSpread, wave: styleCfg.waveR }
            ];

            for (let p = 0; p < pair.length; p++) {
                const osc = this.ctx.createOscillator();
                const oscGain = this.ctx.createGain();
                const freq = baseFreq * Math.pow(2, pair[p].detuneCents / 1200);

                osc.type = pair[p].wave;
                this._setParam(osc.frequency, freq, t0);
                this._setParam(oscGain.gain, 0.5 / Math.sqrt(midis.length), t0);

                osc.connect(oscGain);
                this._connectWithPan(oscGain, voiceGain, pair[p].pan);

                osc.start(t0);
                osc.stop(endTime);
                sources.push(osc);
            }
        }

        this.stats.padTriggers++;
        this._registerActiveRecord(voiceGain, sources, endTime);
    }

    _getPadStyleConfig() {
        switch (this.style) {
            case "classical_strings":
                return {
                    level: 0.24,
                    attack: 0.13,
                    release: 0.16,
                    sustainRatio: 0.88,
                    cutoffHz: 1180,
                    detuneCents: 5.5,
                    stereoSpread: 0.54,
                    waveL: "triangle",
                    waveR: "sawtooth"
                };
            case "waltz_chamber":
                return {
                    level: 0.17,
                    attack: 0.09,
                    release: 0.12,
                    sustainRatio: 0.78,
                    cutoffHz: 1060,
                    detuneCents: 4.0,
                    stereoSpread: 0.48,
                    waveL: "triangle",
                    waveR: "sine"
                };
            case "jazz_brushes":
                return {
                    level: 0.21,
                    attack: 0.03,
                    release: 0.14,
                    sustainRatio: 0.65,
                    cutoffHz: 1320,
                    detuneCents: 3.5,
                    stereoSpread: 0.46,
                    waveL: "sine",
                    waveR: "triangle"
                };
            case "cinematic_pulse":
                return {
                    level: 0.25,
                    attack: 0.12,
                    release: 0.18,
                    sustainRatio: 0.90,
                    cutoffHz: 1280,
                    detuneCents: 6.0,
                    stereoSpread: 0.60,
                    waveL: "triangle",
                    waveR: "sawtooth"
                };
            case "acoustic_pop":
                return {
                    level: 0.22,
                    attack: 0.075,
                    release: 0.14,
                    sustainRatio: 0.84,
                    cutoffHz: 1140,
                    detuneCents: 4.5,
                    stereoSpread: 0.50,
                    waveL: "triangle",
                    waveR: "sine"
                };
            case "warm_pad":
            default:
                return {
                    level: 0.23,
                    attack: 0.10,
                    release: 0.16,
                    sustainRatio: 0.86,
                    cutoffHz: 960,
                    detuneCents: 4.5,
                    stereoSpread: 0.48,
                    waveL: "sine",
                    waveR: "triangle"
                };
        }
    }

    _scheduleSubdivisionGroove(seg, sub, t0, subDurAudio) {
        const chord = seg.chord;
        const scale = seg.gainScale;
        const sc = this.subCount;

        if (seg.isLeadIn) {
            // Supportive preparatory count-in pulse & bass tonic
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * Math.min(sc, 3), 0.24 * scale);
                this._triggerFeltKick(t0, 0.13);
            }
            const isBeat = this.isCompoundEighth ? (sub === 0 || sub === 3) : (sc >= 6 && this.timeSignature[1] === 4 ? sub % 2 === 0 : true);
            if (isBeat) {
                this._triggerBrush(t0, 0.045, sub === 0 ? 0.065 : 0.042, 0.15);
            }
            return;
        }

        // Style-specific bass, percussion & harmonic motion
        if (this.style === "waltz_chamber") {
            // 3/8 (sc=3) or 3/4 (sc=6): graceful "oom - pah - pah" conservatory chamber pulse
            const beatStep = sc === 6 ? 2 : 1;
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * beatStep * 1.35, 0.28 * scale);
            } else if (sub === beatStep || sub === beatStep * 2) {
                const voiced = this._voiceChordMidis(chord);
                const upperMidi = voiced[sub === beatStep ? Math.min(1, voiced.length - 1) : voiced.length - 1] + 12;
                this._triggerArpPluck(Math.min(79, upperMidi), t0, subDurAudio * beatStep * 0.75, 0.085 * scale, sub === beatStep ? -0.24 : 0.24);
                this._triggerBrush(t0, 0.035, 0.028 * scale, 0.2);
            }
            return;
        }

        if (this.style === "classical_strings") {
            const halfSub = Math.floor(sc / 2);
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * Math.max(2, halfSub), 0.29 * scale);
            } else if (halfSub >= 2 && sub === halfSub) {
                this._triggerBassNote(this._resolveBassMidi(chord.fifthPc), t0, subDurAudio * Math.max(2, sc - halfSub), 0.22 * scale);
            }
            // Gentle inner-voice harp/pizzicato motion on even subdivisions
            if (sc >= 4 && sub % 2 === 0) {
                const voiced = this._voiceChordMidis(chord);
                const pick = voiced[(sub / 2) % voiced.length];
                this._triggerArpPluck(pick + 12, t0, subDurAudio * 1.6, 0.065 * scale, ((sub / 2) % 2 === 0) ? -0.22 : 0.22);
            }
            return;
        }

        if (this.style === "jazz_brushes") {
            // Walking / two-feel upright bass + swung brush kit
            const isQuarter = sc >= 4 ? (sub % 2 === 0) : true;
            if (isQuarter) {
                const beatIdx = sc >= 4 ? Math.floor(sub / 2) : sub;
                const walkPcs = [
                    chord.bassPc,
                    (chord.rootPc + (chord.intervals[1] || 4)) % 12,
                    chord.fifthPc,
                    (chord.rootPc + (chord.intervals[3] || 7)) % 12
                ];
                const bPc = walkPcs[beatIdx % walkPcs.length];
                this._triggerBassNote(this._resolveBassMidi(bPc), t0, subDurAudio * 1.75, (beatIdx === 0 ? 0.30 : 0.23) * scale);
                this._triggerBrush(t0, 0.065, (beatIdx % 2 === 1 ? 0.065 : 0.045) * scale, 0.22);
                if (beatIdx === 0) {
                    this._triggerFeltKick(t0, 0.14 * scale);
                }
            } else {
                // Subtle swung ride/brush pickup on "&" of 2 and 4
                const swingDelay = Math.min(0.035, subDurAudio * 0.22);
                if (sub === 3 || sub === 7) {
                    this._triggerBrush(t0 + swingDelay, 0.04, 0.042 * scale, 0.26);
                }
                if (sub === 3) {
                    const voiced = this._voiceChordMidis(chord);
                    this._triggerArpPluck(voiced[voiced.length - 1] + 12, t0 + swingDelay, subDurAudio * 1.2, 0.075 * scale, -0.2);
                }
            }
            return;
        }

        if (this.style === "cinematic_pulse") {
            const halfSub = Math.floor(sc / 2);
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * Math.max(2, halfSub), 0.32 * scale);
                this._triggerFeltKick(t0, 0.20 * scale);
            } else if (halfSub >= 2 && sub === halfSub) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * Math.max(2, sc - halfSub), 0.25 * scale);
                this._triggerFeltKick(t0, 0.14 * scale);
            }
            // Steady muted felt-mallet harmonic ostinato across every subdivision
            const voiced = this._voiceChordMidis(chord);
            const ostinatoMidi = voiced[sub % voiced.length] + (sub % 2 === 1 ? 12 : 0);
            this._triggerArpPluck(Math.min(78, ostinatoMidi), t0, subDurAudio * 0.9, (sub % 2 === 0 ? 0.09 : 0.065) * scale, (sub % 2 === 0) ? -0.28 : 0.28);
            return;
        }

        if (this.style === "warm_pad") {
            const halfSub = Math.floor(sc / 2);
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * Math.max(2, halfSub), 0.28 * scale);
                this._triggerFeltKick(t0, 0.14 * scale);
            } else if (sc >= 6 && sub === halfSub) {
                this._triggerBassNote(this._resolveBassMidi(chord.fifthPc), t0, subDurAudio * Math.max(2, sc - halfSub), 0.20 * scale);
            }
            if (sub % 2 === 0) {
                this._triggerBrush(t0, 0.04, 0.032 * scale, 0.18);
            }
            if (sub === 2 && sc >= 4) {
                const voiced = this._voiceChordMidis(chord);
                this._triggerArpPluck(voiced[voiced.length - 1] + 12, t0, subDurAudio * 2.0, 0.065 * scale, 0.22);
            }
            return;
        }

        // Default / "acoustic_pop" (handles both 6/8 lush ballad & 4/4 / 2/4 studio pop groove!)
        if (this.isCompoundEighth || (sc === 6 && this.timeSignature[1] === 8)) {
            // 6/8 Lush Headphone Ballad (e.g. Wise Men Say: 1 - 2 - 3 - 4 - 5 - 6)
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * 2.85, 0.31 * scale);
                this._triggerFeltKick(t0, 0.18 * scale);
            } else if (sub === 3) {
                this._triggerBassNote(this._resolveBassMidi(chord.fifthPc), t0, subDurAudio * 2.75, 0.22 * scale);
                this._triggerBrush(t0, 0.075, 0.068 * scale, -0.12); // soft warm cross-stick / brush backbeat
            }
            this._triggerBrush(t0, 0.038, (sub === 0 || sub === 3 ? 0.045 : 0.028) * scale, 0.22);

            // Tender 6/8 rolling stereo arpeggio cradle (0 -> 1 -> 2 -> 3 -> 2 -> 1)
            const voiced = this._voiceChordMidis(chord);
            const arpLadder = [
                voiced[0],
                voiced[Math.min(1, voiced.length - 1)],
                voiced[voiced.length - 1],
                Math.min(79, voiced[0] + 12),
                voiced[voiced.length - 1],
                voiced[Math.min(1, voiced.length - 1)]
            ];
            const arpMidi = arpLadder[sub % arpLadder.length];
            const pan = (sub % 2 === 0) ? -0.25 : 0.25;
            this._triggerArpPluck(arpMidi, t0, subDurAudio * 1.35, 0.078 * scale, pan);
        } else {
            // 4/4 & 2/4 Studio Pop Groove (e.g. Yousician Groove: G - A - Bm - G)
            const halfSub = Math.floor(sc / 2);
            if (sub === 0) {
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * 2.6, 0.31 * scale);
                this._triggerFeltKick(t0, 0.20 * scale);
            } else if (sc >= 8 && sub === 3) {
                // Subtle studio pop bass anticipation on 2&
                this._triggerBassNote(this._resolveBassMidi(chord.bassPc), t0, subDurAudio * 0.9, 0.18 * scale);
            } else if (sc >= 4 && sub === halfSub) {
                this._triggerBassNote(this._resolveBassMidi(chord.fifthPc), t0, subDurAudio * 1.8, 0.25 * scale);
                this._triggerFeltKick(t0, 0.17 * scale);
            } else if (sc >= 8 && sub === 6) {
                this._triggerBassNote(this._resolveBassMidi(chord.rootPc), t0, subDurAudio * 1.6, 0.20 * scale);
            }

            // Warm brushed snare/rim backbeat on Beats 2 & 4
            if ((sc >= 8 && (sub === 2 || sub === 6)) || (sc === 4 && sub === 2)) {
                this._triggerBrush(t0, 0.075, 0.072 * scale, -0.10);
            } else {
                this._triggerBrush(t0, 0.035, (sub % 2 === 0 ? 0.042 : 0.026) * scale, 0.22);
            }

            // Delicate stereo acoustic arpeggio shimmer
            if (sub % 2 === 1 || sub === 2) {
                const voiced = this._voiceChordMidis(chord);
                const pick = voiced[sub % voiced.length] + (sub >= halfSub ? 12 : 0);
                this._triggerArpPluck(Math.min(79, pick), t0, subDurAudio * 1.2, 0.072 * scale, (sub % 2 === 0) ? -0.26 : 0.26);
            }
        }
    }

    _triggerBassNote(midi, t0, durAudio, gainLevel = 0.28) {
        const dest = this._getBusDestination();
        if (!this.ctx || !dest || gainLevel <= 0.002) return;

        const freq = this._midiToFreq(midi);
        const safeDur = Math.max(0.14, durAudio);
        const endTime = t0 + safeDur + 0.06;

        const bassGain = this.ctx.createGain();
        this._setParam(bassGain.gain, 0.0001, t0);
        this._linRamp(bassGain.gain, gainLevel, t0 + 0.016);
        this._expRamp(bassGain.gain, gainLevel * 0.55, t0 + Math.min(0.14, safeDur * 0.4));
        this._expRamp(bassGain.gain, 0.0001, t0 + safeDur + 0.04);

        let targetNode = dest;
        if (typeof this.ctx.createBiquadFilter === "function") {
            const lpf = this.ctx.createBiquadFilter();
            lpf.type = "lowpass";
            this._setParam(lpf.frequency, 310, t0);
            this._setParam(lpf.Q, 0.8, t0);
            lpf.connect(dest);
            targetNode = lpf;
        }
        bassGain.connect(targetNode);

        // Fundamental sine + warm 2nd harmonic triangle for clear bass pitch definition on all headphones
        const oscSub = this.ctx.createOscillator();
        oscSub.type = "sine";
        this._setParam(oscSub.frequency, freq, t0);

        const oscWarm = this.ctx.createOscillator();
        const warmGain = this.ctx.createGain();
        oscWarm.type = "triangle";
        this._setParam(oscWarm.frequency, freq * 2, t0);
        this._setParam(warmGain.gain, 0.32, t0);

        oscSub.connect(bassGain);
        oscWarm.connect(warmGain);
        warmGain.connect(bassGain);

        oscSub.start(t0);
        oscSub.stop(endTime);
        oscWarm.start(t0);
        oscWarm.stop(endTime);

        this.stats.bassTriggers++;
        this._registerActiveRecord(bassGain, [oscSub, oscWarm], endTime);
    }

    _triggerFeltKick(t0, gainLevel = 0.18) {
        const dest = this._getBusDestination();
        if (!this.ctx || !dest || gainLevel <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const endTime = t0 + 0.16;

        osc.type = "sine";
        this._setParam(osc.frequency, 112, t0);
        this._expRamp(osc.frequency, 44, t0 + 0.075);

        this._setParam(gain.gain, 0.0001, t0);
        this._linRamp(gain.gain, gainLevel, t0 + 0.005);
        this._expRamp(gain.gain, 0.0001, t0 + 0.14);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(t0);
        osc.stop(endTime);

        this.stats.rhythmTriggers++;
        this._registerActiveRecord(gain, [osc], endTime);
    }

    _getNoiseBuffer() {
        if (this._noiseBuffer) return this._noiseBuffer;
        if (!this.ctx || typeof this.ctx.createBuffer !== "function") return null;

        try {
            const sr = this.ctx.sampleRate || 48000;
            const len = Math.floor(sr * 0.25);
            const buf = this.ctx.createBuffer(1, len, sr);
            const data = buf.getChannelData(0);
            // Deterministic warm pink-tinted noise (repeatable & velvety smooth)
            let seed = 0x5f3759df;
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < len; i++) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                const white = (seed / 0x80000000) - 1.0;
                b0 = 0.99765 * b0 + white * 0.0990460;
                b1 = 0.96300 * b1 + white * 0.2965164;
                b2 = 0.57000 * b2 + white * 1.0526913;
                data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
            }
            this._noiseBuffer = buf;
            return buf;
        } catch (_) {
            return null;
        }
    }

    _triggerBrush(t0, dur = 0.05, gainLevel = 0.05, pan = 0.2) {
        const dest = this._getBusDestination();
        if (!this.ctx || !dest || gainLevel <= 0.001) return;

        const safeDur = Math.max(0.025, dur);
        const endTime = t0 + safeDur + 0.02;
        const gain = this.ctx.createGain();

        this._setParam(gain.gain, 0.0001, t0);
        this._linRamp(gain.gain, gainLevel, t0 + 0.004);
        this._expRamp(gain.gain, 0.0001, t0 + safeDur);
        this._connectWithPan(gain, dest, pan);

        const noiseBuf = this._getNoiseBuffer();
        if (noiseBuf && typeof this.ctx.createBufferSource === "function") {
            const src = this.ctx.createBufferSource();
            src.buffer = noiseBuf;

            if (typeof this.ctx.createBiquadFilter === "function") {
                const bpf = this.ctx.createBiquadFilter();
                bpf.type = "bandpass";
                this._setParam(bpf.frequency, safeDur > 0.06 ? 1850 : 3200, t0);
                this._setParam(bpf.Q, 0.9, t0);
                src.connect(bpf);
                bpf.connect(gain);
            } else {
                src.connect(gain);
            }

            src.start(t0);
            src.stop(endTime);
            this.stats.rhythmTriggers++;
            this._registerActiveRecord(gain, [src], endTime);
        } else {
            // Fallback for headless mock AudioContexts without AudioBufferSourceNode
            const osc = this.ctx.createOscillator();
            osc.type = "triangle";
            this._setParam(osc.frequency, 2600, t0);
            this._expRamp(osc.frequency, 900, t0 + safeDur);
            osc.connect(gain);
            osc.start(t0);
            osc.stop(endTime);
            this.stats.rhythmTriggers++;
            this._registerActiveRecord(gain, [osc], endTime);
        }
    }

    _triggerArpPluck(midi, t0, durAudio, gainLevel = 0.075, pan = 0) {
        const dest = this._getBusDestination();
        if (!this.ctx || !dest || gainLevel <= 0.002) return;

        const freq = this._midiToFreq(midi);
        const safeDur = Math.max(0.12, durAudio);
        const endTime = t0 + safeDur + 0.04;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        this._setParam(osc.frequency, freq, t0);

        this._setParam(gain.gain, 0.0001, t0);
        this._linRamp(gain.gain, gainLevel, t0 + 0.012);
        this._expRamp(gain.gain, 0.0001, t0 + safeDur);

        osc.connect(gain);
        this._connectWithPan(gain, dest, pan);

        osc.start(t0);
        osc.stop(endTime);

        this.stats.arpTriggers++;
        this._registerActiveRecord(gain, [osc], endTime);
    }
}
