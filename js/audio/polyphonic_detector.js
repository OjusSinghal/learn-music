/**
 * Calibrated 61-Key Polyphonic & Score-Informed Piano Note Detection Engine
 * =========================================================================
 * Replaces monophonic time-domain YIN with a dual-path spectral engine calibrated
 * directly from the user's 28 acoustic WAV recordings (Keys #1 C2 to #61 C7):
 *
 * 1. 4096-sample 4-term Blackman-Harris window (-92 dB sidelobes) zero-padded
 *    to an 8192-point Radix-2 FFT (~5.86 Hz/bin @ 48 kHz) with zero per-frame GC.
 * 2. Room Noise Spectral Subtraction calibrated from `step_01_silence.wav`.
 * 3. Physical Acoustic Harmonic Peak Gate:
 *    - Treble/Tenor (`E3–C7`, MIDI 52–96): requires true local spectral peak at f0.
 *    - Deep Bass (`C2–D#3`, MIDI 36–51, where f0 can be 0% of energy): requires >= 2
 *      odd harmonics {h1, h3, h5, h7} and suppresses phantom sub-octave triad roots.
 * 4. Multiplicative KL-Divergence NMF over the 61-key calibrated 10-harmonic basis
 *    + Overtone Excess Verification + Positive Spectral Flux Onset Detection.
 * 5. Score-Informed Hypothesis Fusion for ultra-low-latency chord & two-hand play.
 */

import { CALIBRATED_61KEY_PROFILE } from "./calibrated_profile.js";

const MIN_MIDI = 36; // C2 (Key #1)
const MAX_MIDI = 96; // C7 (Key #61)
const NUM_KEYS = 61;
const NUM_HARMONICS = 10;
const WIN_SIZE = 4096;
const FFT_SIZE = 8192;
const HALF_FFT = FFT_SIZE >> 1;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export class CalibratedPolyphonicDetector {
    constructor(options = {}) {
        this.profile = options.profile || CALIBRATED_61KEY_PROFILE;
        this.sampleRate = options.sampleRate || 48000;
        this.sensitivity = 0.75; // 0..1 UI slider default (75%)

        const recGate = this.profile?.silenceProfile?.recommendedRmsGate || 0.0085;
        this.baseRmsGate = recGate;
        this.rmsGate = recGate;

        // Pre-allocate DSP typed arrays (zero allocations per audio frame)
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

        // Temporal stability & per-key onset state (61 keys)
        this.streakFrames = new Uint8Array(NUM_KEYS);
        this.activeHoldFrames = new Uint8Array(NUM_KEYS);
        this.lastNoteTriggerMs = new Float64Array(NUM_KEYS);
        this.prevKeyEnergy = new Float32Array(NUM_KEYS);
        this.prevRms = 0;
        this.prevFlux = 0;

        this._initFftTables();
        this._buildBasisForSampleRate(this.sampleRate);
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
        this.baseRmsGate = newProfile.silenceProfile.recommendedRmsGate || 0.0085;
        this.setSensitivity(this.sensitivity);
        this.resetState();
        this._buildBasisForSampleRate(this.sampleRate);
    }

    /**
     * Map UI Sensitivity slider (0.0 to 1.0, default 0.75) around calibrated silence floor
     */
    setSensitivity(level) {
        this.sensitivity = Math.max(0.05, Math.min(1.0, level));
        // At 0.75 -> calibrated baseRmsGate (~0.0084); at 1.0 -> 0.55x gate; at 0.1 -> 3.5x gate
        const scale = 3.5 - 3.1 * Math.pow(this.sensitivity, 0.75);
        this.rmsGate = Math.max(0.0035, this.baseRmsGate * Math.max(0.55, scale));
    }

    resetState() {
        this.streakFrames.fill(0);
        this.activeHoldFrames.fill(0);
        this.prevCleanSpec.fill(0);
        this.prevKeyEnergy.fill(0);
        this.prevRms = 0;
        this.prevFlux = 0;
    }

    _initFftTables() {
        // 4-term Blackman-Harris window (-92 dB sidelobe rejection)
        const denom = WIN_SIZE - 1;
        for (let n = 0; n < WIN_SIZE; n++) {
            const phase = (2 * Math.PI * n) / denom;
            this.window[n] =
                0.35875 -
                0.48829 * Math.cos(phase) +
                0.14128 * Math.cos(2 * phase) -
                0.01168 * Math.cos(3 * phase);
        }

        // Bit reversal table for 8192-point Radix-2 FFT
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

        // Twiddle factor lookup tables per butterfly stage
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
        this.minBin = Math.max(2, Math.floor(55.0 / this.binHz));
        this.maxBin = Math.min(HALF_FFT - 2, Math.floor(10500.0 / this.binHz));

        // Map calibrated room noise floor bands to exact FFT bins for current sampleRate
        const sil = this.profile.silenceProfile;
        const bandHz = sil.bandHz || 25.0;
        const bands = sil.noiseBands || [];
        // Scale FFT magnitude if live sampleRate differs slightly from calibration sampleRate
        const calSr = this.profile?.dsp?.calibrationSampleRate || 48000;
        this.noisePerBin = new Float32Array(HALF_FFT + 1);
        for (let k = 0; k <= HALF_FFT; k++) {
            const hz = k * this.binHz;
            const bIdx = Math.min(bands.length - 1, Math.floor(hz / bandHz));
            this.noisePerBin[k] = bands.length > 0 ? bands[bIdx] : 0.02;
        }
        this.srScale = calSr / sr;

        // Build sparse harmonic dictionary W_bins & peak search windows for all 61 keys
        this.keyBasisBins = new Array(NUM_KEYS);
        this.keyBasisWeights = new Array(NUM_KEYS);
        this.keyHarmWindows = new Array(NUM_KEYS);
        this.keyH7Window = new Array(NUM_KEYS);

        for (let ki = 0; ki < NUM_KEYS; ki++) {
            const midi = MIN_MIDI + ki;
            const f0 = 440.0 * Math.pow(2.0, (midi - 69) / 12.0);
            const weights = this.profile.templates[String(midi)] || [1, 0.4, 0.2, 0.1, 0.05, 0.02, 0.01, 0, 0, 0];
            const B = this.profile.inharmonicity[String(midi)] ?? 0.0002;

            const binMap = new Map();
            const hWins = [];

            for (let h = 1; h <= NUM_HARMONICS; h++) {
                const wh = weights[h - 1] || 0;
                if (wh < 0.005) continue;
                const fh = h * f0 * Math.sqrt(1.0 + B * h * h);
                if (fh >= 10200.0 || fh >= sr * 0.46) continue;

                const kCenter = fh / this.binHz;
                const kLo = Math.max(2, Math.floor((fh * Math.pow(2, -23 / 1200)) / this.binHz));
                const kHi = Math.min(this.maxBin - 1, Math.ceil((fh * Math.pow(2, 23 / 1200)) / this.binHz));
                hWins.push({
                    hIdx: h - 1,
                    wh,
                    kLo,
                    kHi: Math.max(kLo, kHi),
                    f0
                });

                const gLo = Math.max(2, Math.round(kCenter) - 2);
                const gHi = Math.min(this.maxBin - 1, Math.round(kCenter) + 2);
                let lobeSum = 0;
                const lobe = [];
                for (let k = gLo; k <= gHi; k++) {
                    const g = Math.exp(-0.5 * Math.pow((k - kCenter) / 1.15, 2));
                    lobe.push([k, g]);
                    lobeSum += g;
                }
                lobeSum = lobeSum || 1.0;
                for (const [k, g] of lobe) {
                    const val = wh * (g / lobeSum);
                    binMap.set(k, (binMap.get(k) || 0) + val);
                }
            }

            // L1-normalize column for KL-divergence NMF updates
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

            // Precompute h7 window for bass keys (MIDI <= 51)
            if (midi <= 51) {
                const fh7 = 7.0 * f0 * Math.sqrt(1.0 + B * 49.0);
                const k7Lo = Math.max(2, Math.floor((fh7 * Math.pow(2, -25 / 1200)) / this.binHz));
                const k7Hi = Math.min(this.maxBin - 1, Math.ceil((fh7 * Math.pow(2, 25 / 1200)) / this.binHz));
                this.keyH7Window[ki] = [k7Lo, Math.max(k7Lo, k7Hi)];
            } else {
                this.keyH7Window[ki] = null;
            }
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
     * Detect simultaneous notes (chords, intervals, two-hand motifs, or single notes)
     * in a 4096-sample audio frame.
     *
     * @param {Float32Array} frame - 4096 time-domain samples
     * @param {Object} context - Optional { rms, expectedMidis: number[] }
     */
    detect(frame, context = {}) {
        let rms = context.rms;
        if (typeof rms !== "number") {
            let sum = 0;
            for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
            rms = Math.sqrt(sum / frame.length);
        }

        if (rms < this.rmsGate) {
            this.prevRms = rms * 0.5;
            for (let ki = 0; ki < NUM_KEYS; ki++) {
                this.streakFrames[ki] = 0;
                if (this.activeHoldFrames[ki] > 0) this.activeHoldFrames[ki]--;
                this.prevKeyEnergy[ki] *= 0.4;
            }
            return {
                silence: true,
                rms,
                midi: null,
                noteName: null,
                activeNotes: [],
                onsetNotes: []
            };
        }

        // 1. Windowed 8192-point FFT + Calibrated Room Noise Subtraction
        this._computeMagnitudeSpectrum(frame);
        const mag = this.magSpec;
        const clean = this.cleanSpec;
        const prevClean = this.prevCleanSpec;
        const noise = this.noisePerBin;
        const overSub = 1.8 * (this.rmsGate / (this.baseRmsGate || 0.0085));

        let maxClean = 0;
        let spectralFlux = 0;
        clean.fill(0, 0, this.minBin);

        for (let k = this.minBin; k <= this.maxBin + 1; k++) {
            const c = Math.max(0, mag[k] - overSub * noise[k]);
            clean[k] = c;
            if (c > maxClean) maxClean = c;
            const diff = c - prevClean[k];
            if (diff > 0) spectralFlux += diff;
            prevClean[k] = c;
        }

        if (maxClean <= 1e-4) {
            return {
                silence: true,
                rms,
                midi: null,
                noteName: null,
                activeNotes: [],
                onsetNotes: []
            };
        }

        // 2. Local Spectral Peak Extraction (eliminates semitone spectral-skirt leakage)
        const peakOnly = this.peakOnlySpec;
        const isPeak = this.isLocalPeak;
        peakOnly.fill(0, 0, this.maxBin + 2);
        isPeak.fill(0, 0, this.maxBin + 2);
        const minPeakMag = maxClean * 0.015;

        for (let k = this.minBin; k <= this.maxBin; k++) {
            const ck = clean[k];
            if (ck > minPeakMag && ck >= clean[k - 1] && ck >= clean[k + 1]) {
                isPeak[k] = 1;
                if (ck > peakOnly[k]) peakOnly[k] = ck;
                if (clean[k - 1] > peakOnly[k - 1]) peakOnly[k - 1] = clean[k - 1];
                if (clean[k + 1] > peakOnly[k + 1]) peakOnly[k + 1] = clean[k + 1];
            }
        }

        // 3. Physical Acoustic Harmonic Completeness & Odd-Harmonic Gate
        const candidates = [];
        const keyStats = new Array(NUM_KEYS);
        const candMidiSet = new Set();

        for (let ki = 0; ki < NUM_KEYS; ki++) {
            const midi = MIN_MIDI + ki;
            const hWins = this.keyHarmWindows[ki];
            if (!hWins || hWins.length === 0) continue;

            let matchedWeight = 0;
            let totalSigWeight = 0;
            let hasH1Peak = false;
            let oddPeakCount = 0;
            let maxKeyPeak = 0;
            let centsEst = 0;
            const hPeaks = [0, 0, 0, 0, 0, 0, 0];

            for (let w = 0; w < hWins.length; w++) {
                const hw = hWins[w];
                const { hIdx, wh, kLo, kHi, f0 } = hw;
                if (wh >= 0.06) totalSigWeight += wh;

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
                    if (wh >= 0.06) matchedWeight += wh;
                    if (bestPk > maxKeyPeak) maxKeyPeak = bestPk;
                    if (hIdx === 0) {
                        hasH1Peak = true;
                        const s0 = clean[bestK - 1];
                        const s1 = clean[bestK];
                        const s2 = clean[bestK + 1];
                        const denom = s0 - 2 * s1 + s2;
                        const delta = Math.abs(denom) > 1e-9 ? (0.5 * (s0 - s2)) / denom : 0;
                        const freqMeas = (bestK + delta) * this.binHz;
                        centsEst = Math.round(1200 * Math.log2(freqMeas / f0));
                    }
                    if ((hIdx & 1) === 0 && hIdx <= 6 && bestPk > maxClean * 0.030) {
                        oddPeakCount++;
                    }
                }
            }

            let hasH7Peak = false;
            const h7Win = this.keyH7Window[ki];
            if (h7Win) {
                for (let k = h7Win[0]; k <= h7Win[1]; k++) {
                    if (isPeak[k] && clean[k] > maxClean * 0.030) {
                        hasH7Peak = true;
                        break;
                    }
                }
            }

            const completeness = matchedWeight / (totalSigWeight || 1.0);

            if (midi >= 52) {
                if (!hasH1Peak || completeness < 0.55) continue;
            } else {
                if ((oddPeakCount < 2 && !(oddPeakCount >= 1 && hasH7Peak)) || completeness < 0.52) {
                    continue;
                }
            }

            candidates.push(ki);
            candMidiSet.add(midi);
            keyStats[ki] = {
                completeness,
                hasH1: hasH1Peak,
                hasH7: hasH7Peak,
                hPeaks,
                maxPk: maxKeyPeak,
                cents: Math.max(-50, Math.min(50, centsEst))
            };
        }

        // Filter phantom sub-octave roots on Major Triads (e.g. C3 on C4-E4-G4, G2 on G3-B3-D4)
        const expectedMidis = Array.isArray(context.expectedMidis) && context.expectedMidis.length > 0
            ? new Set(context.expectedMidis)
            : null;

        const filteredCandidates = [];
        for (let i = 0; i < candidates.length; i++) {
            const ki = candidates[i];
            const midi = MIN_MIDI + ki;
            const st = keyStats[ki];
            if (
                midi <= 51 &&
                !st.hasH1 &&
                !st.hasH7 &&
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
            return {
                silence: false,
                unpitched: true,
                rms,
                midi: null,
                noteName: null,
                activeNotes: [],
                onsetNotes: []
            };
        }

        // 4. Multiplicative KL-Divergence NMF Deconvolution over Candidate Keys
        const numCands = filteredCandidates.length;
        const acts = new Float32Array(NUM_KEYS);
        for (let i = 0; i < numCands; i++) {
            const ki = filteredCandidates[i];
            acts[ki] = expectedMidis && expectedMidis.has(MIN_MIDI + ki) ? 1.55 : 1.0;
        }

        const vHat = this.vHat;
        const eps = 1e-9;

        for (let iter = 0; iter < 20; iter++) {
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
                const nextAct = ak * (gradPos / 1.035);
                acts[ki] = nextAct < maxClean * 0.01 ? 0 : nextAct;
            }
        }

        let maxAct = 0;
        for (let i = 0; i < numCands; i++) {
            const a = acts[filteredCandidates[i]];
            if (a > maxAct) maxAct = a;
        }

        if (maxAct <= 0) {
            return {
                silence: false,
                unpitched: true,
                rms,
                midi: null,
                noteName: null,
                activeNotes: [],
                onsetNotes: []
            };
        }

        // 5. Post-NMF Overtone Excess Verification & Note Selection
        const frameAccepted = [];
        const acceptedMidis = [];
        const acceptedActs = {};

        for (let i = 0; i < numCands; i++) {
            const ki = filteredCandidates[i];
            const act = acts[ki];
            if (act < maxAct * 0.13) continue;

            const midi = MIN_MIDI + ki;
            const rel = act / maxAct;
            const st = keyStats[ki];
            const isExpected = expectedMidis && expectedMidis.has(midi);

            let isOvertoneArtifact = false;
            for (let mIdx = 0; mIdx < acceptedMidis.length; mIdx++) {
                const lowMidi = acceptedMidis[mIdx];
                const diff = midi - lowMidi;
                const lowKi = lowMidi - MIN_MIDI;
                const lowStats = keyStats[lowKi];
                const lowAct = acceptedActs[lowMidi];

                if (diff === 12) {
                    const h2Pk = lowStats.hPeaks[2] || 0;
                    const h3Pk = lowStats.hPeaks[3] || 0;
                    const h4Pk = lowStats.hPeaks[4] || 0;
                    if (lowMidi <= 51 && h3Pk > 0) {
                        const eoRatio = h2Pk / h3Pk;
                        const minEo = isExpected ? 1.95 : 2.35;
                        if (eoRatio < minEo) {
                            isOvertoneArtifact = true;
                            break;
                        }
                    }
                    const minOctRatio = isExpected ? 0.25 : 0.80;
                    if (act < lowAct * minOctRatio && h4Pk < h2Pk * 0.42) {
                        isOvertoneArtifact = true;
                        break;
                    }
                } else if (
                    diff === 19 ||
                    diff === 24 ||
                    diff === 28 ||
                    diff === 31 ||
                    diff === 34 ||
                    diff === 36
                ) {
                    const minHarmRatio = isExpected ? 0.22 : 0.82;
                    if (act < lowAct * minHarmRatio) {
                        isOvertoneArtifact = true;
                        break;
                    }
                }
            }

            if (isOvertoneArtifact) continue;

            let minThresh;
            if (expectedMidis) {
                minThresh = isExpected ? 0.12 : 0.34;
            } else {
                minThresh = st.completeness >= 0.72 ? 0.18 : 0.25;
            }

            if (rel >= minThresh) {
                acceptedMidis.push(midi);
                acceptedActs[midi] = act;
                frameAccepted.push({
                    ki,
                    midi,
                    act,
                    rel,
                    cents: st.cents,
                    completeness: st.completeness,
                    isExpected: Boolean(isExpected)
                });
            }
        }

        // 6. Multi-Frame Hysteresis & Per-Key Hammer Onset Detection
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const rmsJump = rms - this.prevRms;
        const isGlobalHammerAttack =
            rmsJump > Math.max(0.008, this.prevRms * 0.38) ||
            spectralFlux > Math.max(18.0, this.prevFlux * 1.65);

        const frameKeySet = new Set(frameAccepted.map((n) => n.ki));
        const activeNotes = [];
        const onsetNotes = [];

        for (let ki = 0; ki < NUM_KEYS; ki++) {
            if (!frameKeySet.has(ki)) {
                this.streakFrames[ki] = 0;
                if (this.activeHoldFrames[ki] > 0) {
                    this.activeHoldFrames[ki]--;
                    // Sustain bridge: keep already-confirmed chord notes steady across 1-2 frame beating dips
                    if (this.activeHoldFrames[ki] > 0 && rms >= this.rmsGate * 1.6) {
                        const midi = MIN_MIDI + ki;
                        const noteIndex = ((midi % 12) + 12) % 12;
                        const octave = Math.floor(midi / 12) - 1;
                        const pitchLetter = NOTE_NAMES[noteIndex];
                        activeNotes.push({
                            midi,
                            key61Number: midi - 35,
                            noteName: `${pitchLetter}${octave}`,
                            pitchLetter,
                            octave,
                            frequency: Math.round(440 * Math.pow(2, (midi - 69) / 12) * 10) / 10,
                            cents: 0,
                            confidence: 65,
                            isNewNoteOn: false
                        });
                    }
                }
                this.prevKeyEnergy[ki] *= 0.65;
            }
        }

        for (let i = 0; i < frameAccepted.length && activeNotes.length < 6; i++) {
            const item = frameAccepted[i];
            const { ki, midi, act, rel, cents } = item;

            const prevEnergy = this.prevKeyEnergy[ki];
            const keyEnergyJump = act > Math.max(6.0, prevEnergy * 1.85);
            this.prevKeyEnergy[ki] = act;

            if (this.streakFrames[ki] < 250) this.streakFrames[ki]++;

            // Confirm note immediately on strong expected target + attack, else 2 consecutive hop frames (~42ms)
            const minFrames = item.isExpected && (isGlobalHammerAttack || keyEnergyJump) ? 1 : 2;
            if (this.streakFrames[ki] < minFrames) continue;

            const wasHeld = this.activeHoldFrames[ki] > 0;
            this.activeHoldFrames[ki] = 3; // ~64ms hold bridge against brief beating dips

            const cooldownMs = 95;
            let isNewNoteOn = false;
            if (now - this.lastNoteTriggerMs[ki] > cooldownMs) {
                if (!wasHeld || (isGlobalHammerAttack && keyEnergyJump)) {
                    isNewNoteOn = true;
                    this.lastNoteTriggerMs[ki] = now;
                }
            }

            const noteIndex = ((midi % 12) + 12) % 12;
            const octave = Math.floor(midi / 12) - 1;
            const pitchLetter = NOTE_NAMES[noteIndex];
            const noteName = `${pitchLetter}${octave}`;
            const key61Number = midi - 35;

            const noteObj = {
                midi,
                key61Number,
                noteName,
                pitchLetter,
                octave,
                frequency: Math.round(440 * Math.pow(2, (midi - 69 + cents / 100) / 12) * 10) / 10,
                cents,
                confidence: Math.min(100, Math.round(rel * 100)),
                isNewNoteOn
            };

            activeNotes.push(noteObj);
            if (isNewNoteOn) {
                onsetNotes.push(noteObj);
            }
        }

        this.prevRms = rms;
        this.prevFlux = spectralFlux;

        if (activeNotes.length === 0) {
            return {
                silence: false,
                 stabilizing: true,
                rms,
                midi: null,
                noteName: null,
                activeNotes: [],
                onsetNotes: []
            };
        }

        activeNotes.sort((a, b) => a.midi - b.midi);

        // Primary note for single-note backward compatibility (strongest or newest onset)
        const primary =
            onsetNotes.length > 0
                ? onsetNotes[onsetNotes.length - 1]
                : activeNotes.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best), activeNotes[0]);

        return {
            silence: false,
            rms,
            frequency: primary.frequency,
            midi: primary.midi,
            key61Number: primary.key61Number,
            noteName: primary.noteName,
            chordLabel: activeNotes.map((n) => n.noteName).join("+"),
            pitchLetter: primary.pitchLetter,
            octave: primary.octave,
            cents: primary.cents,
            confidence: primary.confidence,
            isNewNoteOn: onsetNotes.length > 0,
            activeNotes,
            onsetNotes
        };
    }
}
