/**
 * Calibrated Polyphonic Ukulele Note, Chord & Tuner Detection Engine
 * ==================================================================
 * Designed specifically for nylon/fluorocarbon acoustic ukuleles in Standard
 * Re-Entrant High-G (G4-C4-E4-A4, MIDI 60..84) and Low-G (G3-C4-E4-A4, MIDI 55..84).
 *
 * Seven-Stage Real-Time DSP Pipeline:
 * 1. Tuning-Adaptive HPF Bin Floor (180 Hz High-G / 135 Hz Low-G) + RMS Noise Gate.
 * 2. 4096-Sample 4-Term Blackman-Harris Window (-92 dB sidelobes) -> 8192-pt Radix-2 FFT
 *    (~5.86 Hz/bin @ 48 kHz) with zero per-frame typed-array allocations + Room Noise Subtraction.
 * 3. Pluck-Transient / Spectral Flatness (Wiener Entropy) & HNR Gate to reject percussive
 *    10-25 ms nail clicks, muted "chucks", and body taps.
 * 4. Local Spectral Peak Extraction with Asymmetric Pluck-Bend Windows (-30..+40 cents)
 *    and Physical Acoustic Harmonic Completeness Gate.
 * 5. Nylon-Calibrated Multiplicative KL-Divergence NMF + Unison-Resilient Reference Scaling
 *    (handles doubled A4+A4 / G4+G4 strings in F, Am, G, Dm, Em, D) + Template-Residual
 *    Overtone Excess Verifier (cleanly distinguishes C4+C5 in C Major from solo C4) + 4-String Cap.
 * 6. Adaptive Strum-Aggregation Window (~88 ms) unifying 20-85 ms staggered down/up/arpeggio
 *    strums into a single chord onset while keeping single-note melody picking ultra-responsive.
 * 7. Auxiliary Chromagram/PC-Set Chord Identifier + Sub-Cent Parabolic Chromatic/G-C-E-A Tuner.
 *
 * Headless-safe for macOS JavaScriptCore (`jsc -m`) and AudioWorklet/browser runtimes.
 */

import { CALIBRATED_UKULELE_PROFILE } from "./ukulele_profile.js";

const ABS_MIN_MIDI = 55; // G3 (Low-G floor)
const ABS_MAX_MIDI = 84; // C6 (upper concert/tenor reach)
const TOTAL_PITCHES = ABS_MAX_MIDI - ABS_MIN_MIDI + 1; // 30 pitches
const NUM_HARMONICS = 8;
const WIN_SIZE = 4096;
const FFT_SIZE = 8192;
const HALF_FFT = FFT_SIZE >> 1;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Standard ukulele chord pitch-class templates ordered by specificity & common usage
const CHORD_TEMPLATES = [
    // 4-note 7th chords (checked with slight preference when all 4 PCs present)
    { suffix: "7", intervals: [0, 4, 7, 10], priority: 1 },
    { suffix: "maj7", intervals: [0, 4, 7, 11], priority: 2 },
    { suffix: "m7", intervals: [0, 3, 7, 10], priority: 2 },
    { suffix: "dim7", intervals: [0, 3, 6, 9], priority: 3 },
    { suffix: "add9", intervals: [0, 2, 4, 7], priority: 3 },
    // 3-note triads (highest preference for exact 3-PC matches)
    { suffix: "", intervals: [0, 4, 7], priority: 0 },
    { suffix: "m", intervals: [0, 3, 7], priority: 0 },
    { suffix: "sus4", intervals: [0, 5, 7], priority: 2 },
    { suffix: "sus2", intervals: [0, 2, 7], priority: 3 },
    { suffix: "dim", intervals: [0, 3, 6], priority: 3 },
    { suffix: "aug", intervals: [0, 4, 8], priority: 3 }
];

const CHORD_ROOT_DISPLAY = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function _nowMsFallback() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

function _midiToFreq(midi) {
    return 440.0 * Math.pow(2.0, (midi - 69) / 12.0);
}

function _midiToInfo(midi) {
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const pitchLetter = NOTE_NAMES[noteIndex];
    return {
        pitchLetter,
        octave,
        noteName: `${pitchLetter}${octave}`
    };
}

/**
 * Identify a standard ukulele chord symbol from a set of active MIDI pitches.
 * Returns null if fewer than 3 distinct pitch classes (or 2-note dyad without clear triad).
 */
export function identifyUkuleleChord(midis) {
    if (!Array.isArray(midis) || midis.length < 3) return null;
    const pcSet = new Set();
    for (let i = 0; i < midis.length; i++) {
        pcSet.add(((midis[i] % 12) + 12) % 12);
    }
    if (pcSet.size < 3) return null;

    let bestLabel = null;
    let bestScore = -1e9;

    for (let root = 0; root < 12; root++) {
        if (!pcSet.has(root)) continue;
        for (let t = 0; t < CHORD_TEMPLATES.length; t++) {
            const tmpl = CHORD_TEMPLATES[t];
            const tmplPcs = tmpl.intervals.map((iv) => (root + iv) % 12);

            let matched = 0;
            for (let i = 0; i < tmplPcs.length; i++) {
                if (pcSet.has(tmplPcs[i])) matched++;
            }
            const missing = tmplPcs.length - matched;
            let extra = 0;
            for (const pc of pcSet) {
                if (tmplPcs.indexOf(pc) === -1) extra++;
            }

            // Require exact or near-exact match (all template notes present and no more than 0 extra for triads/7ths)
            if (missing > 0 || extra > 0) continue;

            // Favor canonical ukulele shapes (e.g. C, Am, F, G, G7, Dm, Em, D) over rare enharmonic inversions
            let score = matched * 10 - tmpl.priority * 1.5;
            // Mild preference for lowest sounding note matching chord root or 5th
            const lowestPc = ((midis[0] % 12) + 12) % 12;
            if (lowestPc === root) score += 1.2;
            if (tmpl.suffix === "" || tmpl.suffix === "m" || tmpl.suffix === "7") score += 0.6;

            if (score > bestScore) {
                bestScore = score;
                bestLabel = `${CHORD_ROOT_DISPLAY[root]}${tmpl.suffix}`;
            }
        }
    }

    return bestLabel;
}

export class UkulelePolyphonicDetector {
    /**
     * Supports BOTH calling conventions:
     *   new UkulelePolyphonicDetector(48000, { tuning: 'high-g', profile })
     *   new UkulelePolyphonicDetector({ sampleRate: 48000, tuning: 'high-g', profile })
     */
    constructor(sampleRateOrOptions = 48000, options = {}) {
        let sr = 48000;
        let opts = options || {};
        if (typeof sampleRateOrOptions === "object" && sampleRateOrOptions !== null) {
            opts = sampleRateOrOptions;
            sr = opts.sampleRate || 48000;
        } else if (typeof sampleRateOrOptions === "number" && Number.isFinite(sampleRateOrOptions)) {
            sr = sampleRateOrOptions;
        }

        this.profile = opts.profile || CALIBRATED_UKULELE_PROFILE;
        this.sampleRate = sr;
        this.tuning = opts.tuning === "low-g" ? "low-g" : "high-g";
        this.sensitivity = typeof opts.sensitivity === "number" ? opts.sensitivity : 0.75;

        const recGate = this.profile?.silenceProfile?.recommendedRmsGate || 0.0072;
        this.baseRmsGate = recGate;
        this.rmsGate = recGate;

        this.strumWindowMs = opts.strumWindowMs || this.profile?.dsp?.strumWindowMs || 98;
        this.pluckFlatnessGate = opts.pluckFlatnessGate || this.profile?.dsp?.pluckFlatnessGate || 0.44;
        this.maxVoices = 4; // Physical 4-string ukulele limit

        // Pre-allocate DSP typed arrays (zero per-frame heap allocations)
        this.window = new Float32Array(WIN_SIZE);
        this.bitRev = new Int32Array(FFT_SIZE);
        this.fftReal = new Float32Array(FFT_SIZE);
        this.fftImag = new Float32Array(FFT_SIZE);
        this.magSpec = new Float32Array(HALF_FFT + 1);
        this.cleanSpec = new Float32Array(HALF_FFT + 1);
        this.prevCleanSpec = new Float32Array(HALF_FFT + 1);
        this.peakOnlySpec = new Float32Array(HALF_FFT + 1);
        this.isLocalPeak = new Uint8Array(HALF_FFT + 1);
        this.vHat = new Float32Array(HALF_FFT + 1);

        // Temporal stability, sustain bridge, and per-pitch onset state (MIDI 55..84)
        this.streakFrames = new Uint8Array(TOTAL_PITCHES);
        this.activeHoldFrames = new Uint8Array(TOTAL_PITCHES);
        this.lastNoteTriggerMs = new Float64Array(TOTAL_PITCHES);
        this.lastNoteTriggerMs.fill(-1e9);
        this.prevKeyEnergy = new Float32Array(TOTAL_PITCHES);
        this.prevRms = 0;
        this.prevFlux = 0;

        // Adaptive Strum-Aggregation state
        this.strumBuffer = new Map(); // midi -> noteObj
        this.strumStartMs = 0;
        this.strumActive = false;
        this.strumLastAddedMs = 0;

        // Smoothed tuner state
        this._tunerSmoothFreq = 0;

        this._initFftTables();
        this._applyTuningBounds();
        this.setSensitivity(this.sensitivity);
        this._buildBasisForSampleRate(this.sampleRate);
    }

    _applyTuningBounds() {
        const tCfg = this.profile?.instrument?.tunings?.[this.tuning];
        if (this.tuning === "low-g") {
            this.minMidi = tCfg?.minMidi ?? 55; // G3
            this.maxMidi = tCfg?.maxMidi ?? 84; // C6
            this.hpfHz = tCfg?.hpfHz ?? 135.0;
            this.openStrings = [
                { tabIndex: 0, name: "A4", openMidi: 69 },
                { tabIndex: 1, name: "E4", openMidi: 64 },
                { tabIndex: 2, name: "C4", openMidi: 60 },
                { tabIndex: 3, name: "G3", openMidi: 55 }
            ];
        } else {
            this.minMidi = tCfg?.minMidi ?? 60; // C4
            this.maxMidi = tCfg?.maxMidi ?? 84; // C6
            this.hpfHz = tCfg?.hpfHz ?? 180.0;
            this.openStrings = [
                { tabIndex: 0, name: "A4", openMidi: 69 },
                { tabIndex: 1, name: "E4", openMidi: 64 },
                { tabIndex: 2, name: "C4", openMidi: 60 },
                { tabIndex: 3, name: "G4", openMidi: 67 }
            ];
        }
    }

    setTuning(tuning) {
        const normalized = tuning === "low-g" ? "low-g" : "high-g";
        if (normalized !== this.tuning) {
            this.tuning = normalized;
            this._applyTuningBounds();
            this.reset();
            this._buildBasisForSampleRate(this.sampleRate);
        }
        return this.tuning;
    }

    setSampleRate(sr) {
        if (sr && Math.abs(sr - this.sampleRate) > 1) {
            this.sampleRate = sr;
            this._buildBasisForSampleRate(sr);
        }
    }

    reloadProfile(newProfile) {
        if (!newProfile || !newProfile.templates || !newProfile.silenceProfile) return;
        this.profile = newProfile;
        this.baseRmsGate = newProfile.silenceProfile.recommendedRmsGate || 0.0072;
        this.strumWindowMs = newProfile.dsp?.strumWindowMs || this.strumWindowMs;
        this.pluckFlatnessGate = newProfile.dsp?.pluckFlatnessGate || this.pluckFlatnessGate;
        this._applyTuningBounds();
        this.setSensitivity(this.sensitivity);
        this.reset();
        this._buildBasisForSampleRate(this.sampleRate);
    }

    setSensitivity(level) {
        this.sensitivity = Math.max(0.05, Math.min(1.0, level));
        // At 0.75 -> calibrated baseRmsGate; at 1.0 -> 0.55x gate; at 0.1 -> 3.2x gate
        const scale = 3.2 - 2.8 * Math.pow(this.sensitivity, 0.75);
        this.rmsGate = Math.max(0.0028, this.baseRmsGate * Math.max(0.55, scale));
    }

    reset() {
        this.streakFrames.fill(0);
        this.activeHoldFrames.fill(0);
        this.lastNoteTriggerMs.fill(-1e9);
        this.prevCleanSpec.fill(0);
        this.prevKeyEnergy.fill(0);
        this.prevRms = 0;
        this.prevFlux = 0;
        this.strumBuffer.clear();
        this.strumActive = false;
        this.strumStartMs = 0;
        this.strumLastAddedMs = 0;
        this._tunerSmoothFreq = 0;
    }

    // Alias for CalibratedPolyphonicDetector compatibility
    resetState() {
        this.reset();
    }

    _initFftTables() {
        const denom = WIN_SIZE - 1;
        for (let n = 0; n < WIN_SIZE; n++) {
            const phase = (2 * Math.PI * n) / denom;
            this.window[n] =
                0.35875 -
                0.48829 * Math.cos(phase) +
                0.14128 * Math.cos(2 * phase) -
                0.01168 * Math.cos(3 * phase);
        }

        const bits = Math.round(Math.log2(FFT_SIZE));
        for (let i = 0; i < FFT_SIZE; i++) {
            let x = i;
            let r = 0;
            for (let b = 0; b < bits; b++) {
                r = (r << 1) | (x & 1);
                x >>= 1;
            }
            this.bitRev[i] = r;
        }

        this.twiddleCos = {};
        this.twiddleSin = {};
        for (let len = 2; len <= FFT_SIZE; len <<= 1) {
            const half = len >> 1;
            const cosArr = new Float32Array(half);
            const sinArr = new Float32Array(half);
            const ang = (-2 * Math.PI) / len;
            for (let k = 0; k < half; k++) {
                cosArr[k] = Math.cos(ang * k);
                sinArr[k] = Math.sin(ang * k);
            }
            this.twiddleCos[len] = cosArr;
            this.twiddleSin[len] = sinArr;
        }
    }

    _buildBasisForSampleRate(sr) {
        this.binHz = sr / FFT_SIZE;
        this.minBin = Math.max(2, Math.floor(this.hpfHz / this.binHz));
        this.maxBin = Math.min(HALF_FFT - 2, Math.floor(8500.0 / this.binHz));
        this.sfmMinBin = Math.max(this.minBin, Math.floor(220.0 / this.binHz));
        this.sfmMaxBin = Math.min(this.maxBin, Math.floor(4500.0 / this.binHz));

        // Map calibrated room noise bands to exact FFT bins
        const sil = this.profile.silenceProfile || {};
        const bandHz = sil.bandHz || 25.0;
        const bands = sil.noiseBands || [];
        this.noisePerBin = new Float32Array(HALF_FFT + 1);
        for (let k = 0; k <= HALF_FFT; k++) {
            const hz = k * this.binHz;
            const bIdx = bands.length > 0 ? Math.min(bands.length - 1, Math.floor(hz / bandHz)) : -1;
            this.noisePerBin[k] = bIdx >= 0 ? bands[bIdx] : 0.02;
        }

        // Build sparse L1-normalized KL-NMF basis and asymmetric pluck-bend search windows
        this.keyBasisBins = new Array(TOTAL_PITCHES);
        this.keyBasisWeights = new Array(TOTAL_PITCHES);
        this.keyHarmWindows = new Array(TOTAL_PITCHES);
        this.keyTemplates = new Array(TOTAL_PITCHES);

        for (let ki = 0; ki < TOTAL_PITCHES; ki++) {
            const midi = ABS_MIN_MIDI + ki;
            const f0 = _midiToFreq(midi);
            const weights = this.profile.templates[String(midi)] || [0.85, 0.42, 0.22, 0.12, 0.06, 0.03, 0.015, 0.008];
            const B = this.profile.inharmonicity?.[String(midi)] ?? 0.00014;
            this.keyTemplates[ki] = weights;

            const binMap = new Map();
            const hWins = [];

            for (let h = 1; h <= NUM_HARMONICS; h++) {
                const wh = weights[h - 1] || 0;
                if (wh < 0.008) continue;
                const fh = h * f0 * Math.sqrt(1.0 + B * h * h);
                if (fh >= 8200.0 || fh >= sr * 0.45) continue;

                const kCenter = fh / this.binHz;
                // Asymmetric pluck-bend window: -30 cents flat .. +40 cents sharp (absorbs hard nylon tension bend)
                const kLo = Math.max(this.minBin, Math.floor((fh * Math.pow(2, -30 / 1200)) / this.binHz));
                const kHi = Math.min(this.maxBin - 1, Math.ceil((fh * Math.pow(2, 40 / 1200)) / this.binHz));
                hWins.push({
                    hIdx: h - 1,
                    wh,
                    kLo,
                    kHi: Math.max(kLo, kHi),
                    kCenter,
                    f0,
                    fh
                });

                // Gaussian mainlobe width sigma=1.25 bins absorbs 2-8 cent unison beating smoothly
                const gLo = Math.max(this.minBin, Math.round(kCenter) - 2);
                const gHi = Math.min(this.maxBin - 1, Math.round(kCenter) + 2);
                let lobeSum = 0;
                const lobe = [];
                for (let k = gLo; k <= gHi; k++) {
                    const g = Math.exp(-0.5 * Math.pow((k - kCenter) / 1.25, 2));
                    lobe.push([k, g]);
                    lobeSum += g;
                }
                lobeSum = lobeSum || 1.0;
                for (const [k, g] of lobe) {
                    const val = wh * (g / lobeSum);
                    binMap.set(k, (binMap.get(k) || 0) + val);
                }
            }

            let colSum = 0;
            for (const v of binMap.values()) colSum += v;
            colSum = colSum || 1.0;

            const sortedEntries = Array.from(binMap.entries()).sort((a, b) => a[0] - b[0]);
            const bIdxArr = new Int32Array(sortedEntries.length);
            const bWgtArr = new Float32Array(sortedEntries.length);
            for (let i = 0; i < sortedEntries.length; i++) {
                bIdxArr[i] = sortedEntries[i][0];
                bWgtArr[i] = sortedEntries[i][1] / colSum;
            }

            this.keyBasisBins[ki] = bIdxArr;
            this.keyBasisWeights[ki] = bWgtArr;
            this.keyHarmWindows[ki] = hWins;
        }
    }

    _computeMagnitudeSpectrum(frame) {
        const real = this.fftReal;
        const imag = this.fftImag;
        const rev = this.bitRev;
        const win = this.window;

        real.fill(0);
        imag.fill(0);

        const nCopy = Math.min(WIN_SIZE, frame.length);
        for (let i = 0; i < nCopy; i++) {
            real[rev[i]] = frame[i] * win[i];
        }

        for (let len = 2; len <= FFT_SIZE; len <<= 1) {
            const half = len >> 1;
            const cosArr = this.twiddleCos[len];
            const sinArr = this.twiddleSin[len];

            for (let start = 0; start < FFT_SIZE; start += len) {
                for (let k = 0; k < half; k++) {
                    const idxA = start + k;
                    const idxB = idxA + half;
                    const br = real[idxB];
                    const bi = imag[idxB];
                    const wr = cosArr[k];
                    const wi = sinArr[k];

                    const tr = br * wr - bi * wi;
                    const ti = br * wi + bi * wr;

                    real[idxB] = real[idxA] - tr;
                    imag[idxB] = imag[idxA] - ti;
                    real[idxA] += tr;
                    imag[idxA] += ti;
                }
            }
        }

        const mag = this.magSpec;
        const maxB = this.maxBin + 2;
        for (let k = 0; k <= maxB; k++) {
            const r = real[k];
            const im = imag[k];
            mag[k] = Math.sqrt(r * r + im * im);
        }
    }

    /**
     * Chromatic & G-C-E-A Open-String Tuner estimator (works even if a string is +/- 48 cents out of tune).
     */
    _estimateTuner(clean, isPeak, maxClean, activeNotes) {
        // When a single strong pitch is confirmed, refine its exact h1 frequency
        let bestFreq = 0;

        if (activeNotes.length === 1 && activeNotes[0].rawFreq > 0) {
            bestFreq = activeNotes[0].rawFreq;
        } else {
            // Find strongest fundamental spectral peak in the ukulele fundamental band (minBin .. ~1150 Hz)
            const fundMaxBin = Math.min(this.maxBin, Math.ceil(1150.0 / this.binHz));
            let bestScore = 0;
            let bestK = -1;
            for (let k = this.minBin; k <= fundMaxBin; k++) {
                if (!isPeak[k] || clean[k] < maxClean * 0.18) continue;
                // Mildly reinforce fundamentals supported by their 2nd harmonic
                const k2 = Math.min(this.maxBin, k * 2);
                const h2Support = Math.max(clean[k2 - 1] || 0, clean[k2] || 0, clean[k2 + 1] || 0);
                const score = clean[k] + 0.35 * h2Support;
                if (score > bestScore) {
                    bestScore = score;
                    bestK = k;
                }
            }
            if (bestK > 1) {
                const s0 = clean[bestK - 1];
                const s1 = clean[bestK];
                const s2 = clean[bestK + 1];
                const denom = s0 - 2 * s1 + s2;
                const delta = Math.abs(denom) > 1e-9 ? (0.5 * (s0 - s2)) / denom : 0;
                const refinedK = bestK + Math.max(-0.5, Math.min(0.5, delta));
                bestFreq = refinedK * this.binHz;
            }
        }

        if (bestFreq < this.hpfHz || bestFreq > 1200.0) {
            this._tunerSmoothFreq = 0;
            return null;
        }

        // Gentle EMA smoothing if consecutive tuner readings are within 1 semitone
        if (this._tunerSmoothFreq > 0 && Math.abs(1200 * Math.log2(bestFreq / this._tunerSmoothFreq)) < 65) {
            bestFreq = this._tunerSmoothFreq * 0.35 + bestFreq * 0.65;
        }
        this._tunerSmoothFreq = bestFreq;

        const exactMidi = 69.0 + 12.0 * Math.log2(bestFreq / 440.0);
        const nearestMidi = Math.round(exactMidi);
        const targetFreq = _midiToFreq(nearestMidi);
        const centsOff = Math.round(1200.0 * Math.log2(bestFreq / targetFreq) * 10) / 10;
        const info = _midiToInfo(nearestMidi);

        // Find nearest open string (G-C-E-A) for quick ukulele tuning UI
        let nearestOpen = null;
        let minAbsCents = Infinity;
        for (let i = 0; i < this.openStrings.length; i++) {
            const os = this.openStrings[i];
            const cFromOpen = 1200.0 * Math.log2(bestFreq / _midiToFreq(os.openMidi));
            if (Math.abs(cFromOpen) < minAbsCents) {
                minAbsCents = Math.abs(cFromOpen);
                nearestOpen = {
                    tabIndex: os.tabIndex,
                    name: os.name,
                    openMidi: os.openMidi,
                    centsFromOpen: Math.round(cFromOpen * 10) / 10
                };
            }
        }

        return {
            name: info.noteName,
            pitchLetter: info.pitchLetter,
            octave: info.octave,
            midi: nearestMidi,
            targetFreq: Math.round(targetFreq * 100) / 100,
            measuredFreq: Math.round(bestFreq * 100) / 100,
            centsOff,
            inTune: Math.abs(centsOff) <= 6.0,
            nearestOpenString: nearestOpen
        };
    }

    _makeNoteObject(midi, rel, cents, rawFreq, isNewNoteOn) {
        const info = _midiToInfo(midi);
        const freq = rawFreq > 0
            ? Math.round(rawFreq * 10) / 10
            : Math.round(_midiToFreq(midi + cents / 100) * 10) / 10;
        return {
            midi,
            noteName: info.noteName,
            pitchLetter: info.pitchLetter,
            octave: info.octave,
            frequency: freq,
            rawFreq: rawFreq || freq,
            cents: Math.round(cents * 10) / 10,
            confidence: Math.min(100, Math.round(rel * 100)),
            isNewNoteOn
        };
    }

    _emptyResult(rms, opts = {}) {
        const flushedOnsets = opts.flushedOnsets || [];
        const onsetMidis = flushedOnsets.map((n) => n.midi);
        const activeNotes = flushedOnsets.length > 0 ? flushedOnsets : [];
        const activeMidis = activeNotes.map((n) => n.midi);
        const primary = activeNotes.length > 0 ? activeNotes[0] : null;
        return {
            silence: activeNotes.length === 0 && Boolean(opts.silence),
            unpitched: Boolean(opts.unpitched),
            stabilizing: Boolean(opts.stabilizing),
            rms,
            midi: primary ? primary.midi : null,
            noteName: primary ? primary.noteName : null,
            pitchLetter: primary ? primary.pitchLetter : null,
            octave: primary ? primary.octave : null,
            frequency: primary ? primary.frequency : null,
            cents: primary ? primary.cents : 0,
            confidence: primary ? primary.confidence : 0,
            chordLabel: activeNotes.length > 0 ? activeNotes.map((n) => n.noteName).join("+") : null,
            isNewNoteOn: flushedOnsets.length > 0,
            activeNotes,
            onsetNotes: flushedOnsets,
            activeMidis,
            onsetMidis,
            detectedChord: identifyUkuleleChord(activeMidis),
            dominantFreq: opts.tunerNote ? opts.tunerNote.measuredFreq : (primary ? primary.frequency : null),
            dominantMidi: opts.tunerNote ? opts.tunerNote.midi : (primary ? primary.midi : null),
            centsOff: opts.tunerNote ? opts.tunerNote.centsOff : null,
            tunerNote: opts.tunerNote || null,
            strumPending: Boolean(opts.strumPending),
            debug: opts.debug || { tuning: this.tuning }
        };
    }

    /**
     * Detect single notes, double-stops, staggered 4-string strums, and live tuner pitch
     * from a 4096-sample audio frame.
     *
     * @param {Float32Array|number[]} frame - 4096 time-domain audio samples
     * @param {Object} context - Optional { rms, expectedMidis, isChordExpected, sensitivity, nowMs }
     */
    detect(frame, context = {}) {
        if (typeof context.sensitivity === "number" && Math.abs(context.sensitivity - this.sensitivity) > 0.005) {
            this.setSensitivity(context.sensitivity);
        }

        const now = typeof context.nowMs === "number" ? context.nowMs : _nowMsFallback();

        let rms = context.rms;
        if (typeof rms !== "number") {
            let sum = 0;
            for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
            rms = frame.length > 0 ? Math.sqrt(sum / frame.length) : 0;
        }

        // Silence / noise floor gate
        if (rms < this.rmsGate) {
            this.prevRms = rms * 0.5;
            this._tunerSmoothFreq = 0;
            for (let ki = 0; ki < TOTAL_PITCHES; ki++) {
                this.streakFrames[ki] = 0;
                if (this.activeHoldFrames[ki] > 0) this.activeHoldFrames[ki]--;
                this.prevKeyEnergy[ki] *= 0.4;
            }
            // Flush any pending strum buffer immediately if audio drops to silence
            let flushedOnsets = [];
            if (this.strumActive && this.strumBuffer.size > 0) {
                flushedOnsets = Array.from(this.strumBuffer.values()).sort((a, b) => a.midi - b.midi);
                this.strumBuffer.clear();
                this.strumActive = false;
            }
            return this._emptyResult(rms, {
                silence: flushedOnsets.length === 0,
                flushedOnsets,
                debug: { tuning: this.tuning, gatedByRms: true }
            });
        }

        // Stage 2: Windowed 8192-pt FFT + Noise Subtraction
        this._computeMagnitudeSpectrum(frame);
        const mag = this.magSpec;
        const clean = this.cleanSpec;
        const prevClean = this.prevCleanSpec;
        const noise = this.noisePerBin;
        const overSub = 1.75 * (this.rmsGate / (this.baseRmsGate || 0.0072));

        let maxClean = 0;
        let spectralFlux = 0;
        let totalCleanEnergy = 0;
        clean.fill(0, 0, this.minBin);

        for (let k = this.minBin; k <= this.maxBin + 1; k++) {
            const c = Math.max(0, mag[k] - overSub * noise[k]);
            clean[k] = c;
            if (c > maxClean) maxClean = c;
            totalCleanEnergy += c * c;
            const diff = c - prevClean[k];
            if (diff > 0) spectralFlux += diff;
            prevClean[k] = c;
        }

        if (maxClean <= 1e-4) {
            return this._emptyResult(rms, { silence: true, debug: { tuning: this.tuning, maxClean } });
        }

        // Stage 3: Spectral Flatness (Wiener Entropy) & Local Peak Extraction for Pluck-Transient Gate
        let logSum = 0;
        let linSum = 0;
        const sfmCount = Math.max(1, this.sfmMaxBin - this.sfmMinBin + 1);
        for (let k = this.sfmMinBin; k <= this.sfmMaxBin; k++) {
            const val = clean[k] + 1e-6;
            logSum += Math.log(val);
            linSum += val;
        }
        const geoMean = Math.exp(logSum / sfmCount);
        const arithMean = linSum / sfmCount;
        const spectralFlatness = arithMean > 1e-6 ? geoMean / arithMean : 1.0;

        const peakOnly = this.peakOnlySpec;
        const isPeak = this.isLocalPeak;
        peakOnly.fill(0, 0, this.maxBin + 2);
        isPeak.fill(0, 0, this.maxBin + 2);
        const minPeakMag = maxClean * 0.014;

        let peakEnergy = 0;
        for (let k = this.minBin; k <= this.maxBin; k++) {
            const ck = clean[k];
            if (ck > minPeakMag && ck >= clean[k - 1] && ck >= clean[k + 1]) {
                isPeak[k] = 1;
                if (ck > peakOnly[k]) peakOnly[k] = ck;
                if (clean[k - 1] > peakOnly[k - 1]) peakOnly[k - 1] = clean[k - 1];
                if (clean[k + 1] > peakOnly[k + 1]) peakOnly[k + 1] = clean[k + 1];
            }
        }
        for (let k = this.minBin; k <= this.maxBin; k++) {
            const pk = peakOnly[k];
            if (pk > 0) peakEnergy += pk * pk;
        }

        const peakEnergyRatio = peakEnergy / (totalCleanEnergy + 1e-9);
        const hnrDb = 10.0 * Math.log10((peakEnergy + 1e-9) / Math.max(1e-9, totalCleanEnergy - peakEnergy + 1e-9));
        const isPluckTransient = spectralFlatness > this.pluckFlatnessGate && peakEnergyRatio < 0.24;

        if (isPluckTransient) {
            this.prevRms = rms;
            this.prevFlux = spectralFlux;
            return this._emptyResult(rms, {
                unpitched: true,
                strumPending: this.strumActive,
                debug: {
                    tuning: this.tuning,
                    spectralFlatness: Math.round(spectralFlatness * 1000) / 1000,
                    hnrDb: Math.round(hnrDb * 10) / 10,
                    peakEnergyRatio: Math.round(peakEnergyRatio * 1000) / 1000,
                    isPluckTransient: true
                }
            });
        }

        // Stage 4: Physical Acoustic Candidate Pitch Gating (MIDI minMidi..maxMidi)
        const expectedMidis =
            Array.isArray(context.expectedMidis) && context.expectedMidis.length > 0
                ? new Set(context.expectedMidis)
                : null;
        const isChordExpected =
            typeof context.isChordExpected === "boolean"
                ? context.isChordExpected
                : Boolean(expectedMidis && expectedMidis.size >= 2);

        const candidates = [];
        const keyStats = new Array(TOTAL_PITCHES);
        const candMidiSet = new Set();

        const startKi = this.minMidi - ABS_MIN_MIDI;
        const endKi = this.maxMidi - ABS_MIN_MIDI;

        for (let ki = startKi; ki <= endKi; ki++) {
            const midi = ABS_MIN_MIDI + ki;
            const hWins = this.keyHarmWindows[ki];
            if (!hWins || hWins.length === 0) continue;

            let matchedWeight = 0;
            let totalSigWeight = 0;
            let hasH1Peak = false;
            let oddPeakCount = 0;
            let maxKeyPeak = 0;
            let centsEst = 0;
            let rawFreq = 0;
            const hPeaks = [0, 0, 0, 0, 0, 0, 0];

            for (let w = 0; w < hWins.length; w++) {
                const hw = hWins[w];
                const { hIdx, wh, kLo, kHi, f0 } = hw;
                if (wh >= 0.07) totalSigWeight += wh;

                let bestPk = 0;
                let bestK = -1;
                for (let k = kLo; k <= kHi; k++) {
                    if (isPeak[k] && clean[k] > bestPk) {
                        bestPk = clean[k];
                        bestK = k;
                    }
                }

                if (hIdx < 6) hPeaks[hIdx + 1] = bestPk;

                if (bestPk > maxClean * 0.022) {
                    if (wh >= 0.07) matchedWeight += wh;
                    if (bestPk > maxKeyPeak) maxKeyPeak = bestPk;
                    if (hIdx === 0) {
                        hasH1Peak = true;
                        const s0 = clean[bestK - 1];
                        const s1 = clean[bestK];
                        const s2 = clean[bestK + 1];
                        const denom = s0 - 2 * s1 + s2;
                        const delta = Math.abs(denom) > 1e-9 ? (0.5 * (s0 - s2)) / denom : 0;
                        const refinedK = bestK + Math.max(-0.5, Math.min(0.5, delta));
                        rawFreq = refinedK * this.binHz;
                        centsEst = 1200.0 * Math.log2(rawFreq / f0);
                    }
                    if ((hIdx & 1) === 0 && hIdx <= 6 && bestPk > maxClean * 0.028) {
                        oddPeakCount++;
                    }
                }
            }

            const completeness = matchedWeight / (totalSigWeight || 1.0);

            if (midi >= 60) {
                // High-G & all C4..C6: sit at or above Helmholtz A0 -> fundamental h1 is ALWAYS physically present
                if (!hasH1Peak || hPeaks[1] < maxClean * 0.025) continue;
                const minComp = midi >= 76 ? 0.44 : 0.48;
                if (completeness < minComp) continue;
            } else {
                // Low-G G3..B3 (55..59) sits below Helmholtz A0 -> attenuated h1 allowed if >=2 odd harmonics + h2
                const lowGValid =
                    (hasH1Peak && completeness >= 0.44) ||
                    (oddPeakCount >= 2 && hPeaks[2] > maxClean * 0.04 && completeness >= 0.48);
                if (!lowGValid) continue;
            }

            candidates.push(ki);
            candMidiSet.add(midi);
            keyStats[ki] = {
                completeness,
                hasH1: hasH1Peak,
                oddPeaks: oddPeakCount,
                hPeaks,
                maxPk: maxKeyPeak,
                rawFreq,
                cents: Math.max(-50, Math.min(50, centsEst))
            };
        }

        // Low-G sub-octave major triad guard (suppresses phantom G3 under G4-B4-D5 when G3 has no h1)
        const filteredCandidates = [];
        for (let i = 0; i < candidates.length; i++) {
            const ki = candidates[i];
            const midi = ABS_MIN_MIDI + ki;
            const st = keyStats[ki];
            if (
                midi < 60 &&
                !st.hasH1 &&
                !(expectedMidis && expectedMidis.has(midi)) &&
                candMidiSet.has(midi + 12) &&
                candMidiSet.has(midi + 16) &&
                candMidiSet.has(midi + 19)
            ) {
                continue;
            }
            filteredCandidates.push(ki);
        }

        if (filteredCandidates.length === 0) {
            this.prevRms = rms;
            this.prevFlux = spectralFlux;
            const tunerNote = this._estimateTuner(clean, isPeak, maxClean, []);
            return this._emptyResult(rms, {
                unpitched: true,
                tunerNote,
                strumPending: this.strumActive,
                debug: {
                    tuning: this.tuning,
                    spectralFlatness: Math.round(spectralFlatness * 1000) / 1000,
                    hnrDb: Math.round(hnrDb * 10) / 10,
                    rawCandidateMidis: []
                }
            });
        }

        // Stage 5: Nylon-Calibrated Multiplicative KL-Divergence NMF
        const numCands = filteredCandidates.length;
        const acts = new Float32Array(TOTAL_PITCHES);
        for (let i = 0; i < numCands; i++) {
            const ki = filteredCandidates[i];
            const midi = ABS_MIN_MIDI + ki;
            acts[ki] = expectedMidis && expectedMidis.has(midi) ? 1.55 : 1.0;
        }

        const vHat = this.vHat;
        const eps = 1e-9;

        for (let iter = 0; iter < 22; iter++) {
            vHat.fill(0, this.minBin, this.maxBin + 2);

            for (let i = 0; i < numCands; i++) {
                const ki = filteredCandidates[i];
                const ak = acts[ki];
                if (ak < 1e-6) continue;
                const bins = this.keyBasisBins[ki];
                const wgts = this.keyBasisWeights[ki];
                for (let j = 0; j < bins.length; j++) {
                    vHat[bins[j]] += wgts[j] * ak;
                }
            }

            for (let i = 0; i < numCands; i++) {
                const ki = filteredCandidates[i];
                const ak = acts[ki];
                if (ak < 1e-6) continue;
                const bins = this.keyBasisBins[ki];
                const wgts = this.keyBasisWeights[ki];
                let gradPos = 0;
                for (let j = 0; j < bins.length; j++) {
                    const k = bins[j];
                    const vk = peakOnly[k];
                    if (vk > 0) {
                        gradPos += wgts[j] * (vk / (vHat[k] + eps));
                    }
                }
                const nextAct = ak * (gradPos / 1.032);
                acts[ki] = nextAct < maxClean * 0.01 ? 0 : nextAct;
            }
        }

        // Compute unison-resilient reference activation
        let maxAct = 0;
        let secondAct = 0;
        for (let i = 0; i < numCands; i++) {
            const a = acts[filteredCandidates[i]];
            if (a > maxAct) {
                secondAct = maxAct;
                maxAct = a;
            } else if (a > secondAct) {
                secondAct = a;
            }
        }

        if (maxAct <= 0) {
            this.prevRms = rms;
            this.prevFlux = spectralFlux;
            return this._emptyResult(rms, { unpitched: true, debug: { tuning: this.tuning } });
        }

        // In ukulele chords with unison pairs (Am, F, G, Dm, Em, D), the doubled string can have ~1.8x energy.
        // Only apply unison-capped reference when a genuine 2nd voice is present (secondAct >= 0.24 * maxAct).
        const refAct =
            secondAct >= maxAct * 0.24
                ? Math.min(maxAct, secondAct * 1.45)
                : maxAct;

        // Post-NMF Template-Residual Overtone Excess Verifier (low -> high pitch order)
        const frameAccepted = [];
        const acceptedMidis = [];
        const acceptedActs = {};

        for (let i = 0; i < numCands; i++) {
            const ki = filteredCandidates[i];
            const act = acts[ki];
            if (act < refAct * 0.11) continue;

            const midi = ABS_MIN_MIDI + ki;
            const rel = act / refAct;
            const st = keyStats[ki];
            const isExpected = Boolean(expectedMidis && expectedMidis.has(midi));

            let isOvertoneArtifact = false;
            for (let mIdx = 0; mIdx < acceptedMidis.length; mIdx++) {
                const lowMidi = acceptedMidis[mIdx];
                const diff = midi - lowMidi;
                const lowKi = lowMidi - ABS_MIN_MIDI;
                const lowStats = keyStats[lowKi];
                const lowAct = acceptedActs[lowMidi];
                const lowTmpl = this.keyTemplates[lowKi];

                if (diff === 12) {
                    // Octave (+12, e.g. C4 + C5 in C Major [0,0,0,3] vs solo C4 overtone)
                    const lowH1 = lowStats.hPeaks[1] || 1e-6;
                    const lowH2 = lowStats.hPeaks[2] || 0;
                    const lowH3 = lowStats.hPeaks[3] || 0;
                    const expectedH2Ratio = (lowTmpl[1] || 0.25) / Math.max(0.12, lowTmpl[0] || 0.75);
                    const actualH2Ratio = lowH2 / lowH1;
                    const octaveExcess = actualH2Ratio / Math.max(0.08, expectedH2Ratio);
                    const highH2Pk = st.hPeaks[2] || 0; // = h4 of lowMidi

                    if (isExpected) {
                        if (act < lowAct * 0.14 && octaveExcess < 1.15) {
                            isOvertoneArtifact = true;
                            break;
                        }
                    } else {
                        const strongIndependent = act >= lowAct * 0.62;
                        const clearExcess = act >= lowAct * 0.34 && octaveExcess >= 1.42;
                        const strongUpperHarm = act >= lowAct * 0.28 && highH2Pk > lowH3 * 0.72 && octaveExcess >= 1.25;
                        if (!strongIndependent && !clearExcess && !strongUpperHarm) {
                            isOvertoneArtifact = true;
                            break;
                        }
                    }
                } else if (diff === 19 || diff === 24) {
                    // 3rd harmonic (+19, twelfth) or 4th harmonic (+24, double octave)
                    const minRatio = isExpected ? 0.18 : 0.48;
                    if (act < lowAct * minRatio) {
                        isOvertoneArtifact = true;
                        break;
                    }
                }
            }

            if (isOvertoneArtifact) continue;

            // Semitone skirt guard: if an adjacent semitone (+/-1) already dominates (> 3.8x louder), reject skirt leak
            let isSkirtLeak = false;
            for (let mIdx = 0; mIdx < acceptedMidis.length; mIdx++) {
                const otherMidi = acceptedMidis[mIdx];
                if (Math.abs(midi - otherMidi) === 1 && !isExpected && act < acceptedActs[otherMidi] * 0.26) {
                    isSkirtLeak = true;
                    break;
                }
            }
            if (isSkirtLeak) continue;

            let minThresh;
            if (expectedMidis) {
                minThresh = isExpected ? 0.12 : 0.36;
            } else {
                minThresh = st.completeness >= 0.70 ? 0.18 : 0.25;
            }

            if (rel >= minThresh) {
                acceptedMidis.push(midi);
                acceptedActs[midi] = act;
                frameAccepted.push({
                    ki,
                    midi,
                    act,
                    rel: Math.min(1.0, rel),
                    cents: st.cents,
                    rawFreq: st.rawFreq,
                    completeness: st.completeness,
                    isExpected
                });
            }
        }

        // Physical 4-string polyphony cap
        if (frameAccepted.length > this.maxVoices) {
            frameAccepted.sort((a, b) => {
                const sa = a.act * (a.isExpected ? 1.5 : 1.0);
                const sb = b.act * (b.isExpected ? 1.5 : 1.0);
                return sb - sa;
            });
            frameAccepted.length = this.maxVoices;
            frameAccepted.sort((a, b) => a.midi - b.midi);
        }

        // Stage 6: Multi-Frame Hysteresis, Sustain Bridge & Adaptive Strum-Aggregation Window
        const rmsJump = rms - this.prevRms;
        const isPluckAttack =
            rmsJump > Math.max(0.006, this.prevRms * 0.32) ||
            spectralFlux > Math.max(12.0, this.prevFlux * 1.55);

        const frameKeySet = new Set(frameAccepted.map((n) => n.ki));
        const activeNotes = [];
        const rawOnsetNotes = [];

        // Sustain bridge for decaying/beating notes
        for (let ki = startKi; ki <= endKi; ki++) {
            if (!frameKeySet.has(ki)) {
                this.streakFrames[ki] = 0;
                if (this.activeHoldFrames[ki] > 0) {
                    this.activeHoldFrames[ki]--;
                    if (this.activeHoldFrames[ki] > 0 && rms >= this.rmsGate * 1.45) {
                        const midi = ABS_MIN_MIDI + ki;
                        activeNotes.push(this._makeNoteObject(midi, 0.62, 0, 0, false));
                    }
                }
                this.prevKeyEnergy[ki] *= 0.62;
            }
        }

        for (let i = 0; i < frameAccepted.length; i++) {
            const item = frameAccepted[i];
            const { ki, midi, act, rel, cents, rawFreq } = item;

            const prevEnergy = this.prevKeyEnergy[ki];
            const keyEnergyJump = act > Math.max(4.5, prevEnergy * 1.75);
            this.prevKeyEnergy[ki] = act;

            if (this.streakFrames[ki] < 250) this.streakFrames[ki]++;

            // Fast 1-frame confirmation ONLY for score-expected target attacks; require 2 stable frames (~42 ms) blind
            const minFrames = item.isExpected && (isPluckAttack || keyEnergyJump) ? 1 : 2;
            if (this.streakFrames[ki] < minFrames) continue;

            const wasHeld = this.activeHoldFrames[ki] > 0;
            this.activeHoldFrames[ki] = 4; // ~85 ms sustain bridge across unison beating dips

            const cooldownMs = 90;
            let isNewNoteOn = false;
            if (now - this.lastNoteTriggerMs[ki] > cooldownMs) {
                if (!wasHeld || (isPluckAttack && keyEnergyJump)) {
                    isNewNoteOn = true;
                    this.lastNoteTriggerMs[ki] = now;
                }
            }

            const noteObj = this._makeNoteObject(midi, rel, cents, rawFreq, isNewNoteOn);
            activeNotes.push(noteObj);
            if (isNewNoteOn) {
                rawOnsetNotes.push(noteObj);
            }
        }

        // Enforce 4-string physical cap on merged active notes too
        activeNotes.sort((a, b) => a.midi - b.midi);
        if (activeNotes.length > this.maxVoices) {
            activeNotes.sort((a, b) => b.confidence - a.confidence);
            activeNotes.length = this.maxVoices;
            activeNotes.sort((a, b) => a.midi - b.midi);
        }

        // Adaptive Strum-Aggregation State Machine
        const bypassStrumBuffer = Boolean(
            (expectedMidis && expectedMidis.size === 1 && !isChordExpected) ||
            context.isChordExpected === false
        );

        let emittedOnsets = [];
        if (bypassStrumBuffer) {
            // Single-note melody mode: 0 ms extra delay!
            if (this.strumActive && this.strumBuffer.size > 0) {
                emittedOnsets = Array.from(this.strumBuffer.values());
                this.strumBuffer.clear();
                this.strumActive = false;
            }
            for (let i = 0; i < rawOnsetNotes.length; i++) {
                emittedOnsets.push(rawOnsetNotes[i]);
            }
        } else {
            // Add any newly triggered notes into the strum aggregation buffer
            if (rawOnsetNotes.length > 0) {
                if (!this.strumActive) {
                    this.strumActive = true;
                    this.strumStartMs = now;
                    this.strumBuffer.clear();
                }
                for (let i = 0; i < rawOnsetNotes.length; i++) {
                    const n = rawOnsetNotes[i];
                    this.strumBuffer.set(n.midi, n);
                }
                this.strumLastAddedMs = now;
            }

            if (this.strumActive) {
                const elapsed = now - this.strumStartMs;
                const allExpectedCaptured =
                    expectedMidis !== null &&
                    expectedMidis.size >= 2 &&
                    Array.from(expectedMidis).every((m) => this.strumBuffer.has(m));
                const fullFourStringStrum = this.strumBuffer.size >= 4;
                // In blind single-note play (1 note captured, only 1 candidate in spectrum, no ongoing flux), flush early
                const blindSingleSettled =
                    !expectedMidis &&
                    !isChordExpected &&
                    this.strumBuffer.size === 1 &&
                    filteredCandidates.length <= 1 &&
                    !isPluckAttack &&
                    elapsed >= 22;
                const windowExpired = elapsed >= this.strumWindowMs;

                if (allExpectedCaptured || fullFourStringStrum || blindSingleSettled || windowExpired) {
                    emittedOnsets = Array.from(this.strumBuffer.values())
                        .sort((a, b) => a.midi - b.midi)
                        .slice(0, this.maxVoices);
                    this.strumBuffer.clear();
                    this.strumActive = false;
                }
            }
        }

        // Deduplicate & sort emittedOnsets
        if (emittedOnsets.length > 1) {
            const seen = new Map();
            for (let i = 0; i < emittedOnsets.length; i++) {
                seen.set(emittedOnsets[i].midi, emittedOnsets[i]);
            }
            emittedOnsets = Array.from(seen.values()).sort((a, b) => a.midi - b.midi);
        }

        this.prevRms = rms;
        this.prevFlux = spectralFlux;

        // Live chromatic / open-string tuner readout
        const tunerNote = this._estimateTuner(clean, isPeak, maxClean, activeNotes);

        const debugInfo = {
            tuning: this.tuning,
            spectralFlatness: Math.round(spectralFlatness * 1000) / 1000,
            hnrDb: Math.round(hnrDb * 10) / 10,
            peakEnergyRatio: Math.round(peakEnergyRatio * 1000) / 1000,
            spectralFlux: Math.round(spectralFlux * 10) / 10,
            isPluckTransient: false,
            rawCandidateMidis: filteredCandidates.map((ki) => ABS_MIN_MIDI + ki),
            postNmfMidis: frameAccepted.map((n) => n.midi)
        };

        if (activeNotes.length === 0 && emittedOnsets.length === 0) {
            return this._emptyResult(rms, {
                stabilizing: true,
                tunerNote,
                strumPending: this.strumActive,
                debug: debugInfo
            });
        }

        const effectiveActive = activeNotes.length > 0 ? activeNotes : emittedOnsets;
        const activeMidis = effectiveActive.map((n) => n.midi);
        const onsetMidis = emittedOnsets.map((n) => n.midi);
        const detectedChord = identifyUkuleleChord(activeMidis);

        const primary =
            emittedOnsets.length > 0
                ? emittedOnsets[emittedOnsets.length - 1]
                : effectiveActive.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best), effectiveActive[0]);

        return {
            silence: false,
            rms,
            // Piano-compatible fields (used by mic.js & app.js)
            frequency: primary.frequency,
            midi: primary.midi,
            noteName: primary.noteName,
            chordLabel: detectedChord || effectiveActive.map((n) => n.noteName).join("+"),
            pitchLetter: primary.pitchLetter,
            octave: primary.octave,
            cents: primary.cents,
            confidence: primary.confidence,
            isNewNoteOn: emittedOnsets.length > 0,
            activeNotes: effectiveActive,
            onsetNotes: emittedOnsets,
            // Ukulele-specific fields (polychord, strum aggregation & real-time G-C-E-A tuner)
            activeMidis,
            onsetMidis,
            detectedChord,
            dominantFreq: tunerNote ? tunerNote.measuredFreq : primary.frequency,
            dominantMidi: tunerNote ? tunerNote.midi : primary.midi,
            centsOff: tunerNote ? tunerNote.centsOff : primary.cents,
            tunerNote,
            strumPending: this.strumActive,
            debug: debugInfo
        };
    }
}
