/**
 * Acoustic Piano Pitch & Note Detection Engine
 * Uses YIN algorithm + Cumulative Mean Normalized Difference + Parabolic Interpolation
 * Optimized for piano acoustic harmonics and transient onset detection.
 */

export class PianoPitchDetector {
    constructor(options = {}) {
        this.sampleRate = options.sampleRate || 44100;
        this.bufferSize = options.bufferSize || 4096; // 4096 gives high resolution down to C2 (65.41 Hz)
        this.yinThreshold = options.yinThreshold || 0.15;
        // Aligned for a 61-key keyboard: C2 (MIDI 36, 65.41Hz) to C7 (MIDI 96, 2093.00Hz)
        this.minMidi = options.minMidi || 36;             // C2 (Key #1 of 61-key keyboard)
        this.maxMidi = options.maxMidi || 96;             // C7 (Key #61 of 61-key keyboard)
        this.minFrequency = options.minFrequency || 60;   // Just below C2 (65.41Hz)
        this.maxFrequency = options.maxFrequency || 2150; // Just above C7 (2093Hz)
        this.noiseThreshold = options.noiseThreshold || 0.015; // RMS noise gate
        
        // Note naming lookup
        this.noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        
        // Attack onset detection state
        this.previousRms = 0;
        this.lastDetectedMidi = null;
        this.lastNoteTime = 0;
        this.stablePitchCount = 0;
        this.candidateMidi = null;
    }

    /**
     * Set noise gate sensitivity threshold (0.001 - 0.1)
     */
    setSensitivity(level) {
        // level: 0 to 1 -> threshold from 0.05 (low sensitivity) to 0.003 (high sensitivity)
        this.noiseThreshold = 0.05 - (level * 0.045);
    }

    /**
     * Compute Root-Mean-Square (RMS) amplitude of audio buffer
     */
    computeRms(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * YIN algorithm implementation
     * @param {Float32Array} buffer - Raw audio time-domain samples
     * @returns {Object|null} - { frequency, midi, noteName, octave, cents, confidence, rms, isOnset }
     */
    detect(buffer) {
        const rms = this.computeRms(buffer);
        if (rms < this.noiseThreshold) {
            this.lastDetectedMidi = null;
            this.stablePitchCount = 0;
            return { silence: true, rms, noteName: null, midi: null };
        }

        const halfBuffer = Math.floor(this.bufferSize / 2);
        const yinBuffer = new Float32Array(halfBuffer);
        
        // Step 1: Difference function
        for (let tau = 0; tau < halfBuffer; tau++) {
            let diff = 0;
            for (let i = 0; i < halfBuffer; i++) {
                const delta = buffer[i] - buffer[i + tau];
                diff += delta * delta;
            }
            yinBuffer[tau] = diff;
        }

        // Step 2: Cumulative Mean Normalized Difference Function
        yinBuffer[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < halfBuffer; tau++) {
            runningSum += yinBuffer[tau];
            yinBuffer[tau] = (yinBuffer[tau] * tau) / runningSum;
        }

        // Step 3: Absolute threshold & local minimum
        let minTau = -1;
        const minPeriod = Math.floor(this.sampleRate / this.maxFrequency);
        const maxPeriod = Math.floor(this.sampleRate / this.minFrequency);

        for (let tau = minPeriod; tau < Math.min(maxPeriod, halfBuffer); tau++) {
            if (yinBuffer[tau] < this.yinThreshold) {
                while (tau + 1 < halfBuffer && yinBuffer[tau + 1] < yinBuffer[tau]) {
                    tau++;
                }
                minTau = tau;
                break;
            }
        }

        // Fallback: global minimum in search window if not below threshold
        if (minTau === -1) {
            let bestVal = 100;
            for (let tau = minPeriod; tau < Math.min(maxPeriod, halfBuffer); tau++) {
                if (yinBuffer[tau] < bestVal) {
                    bestVal = yinBuffer[tau];
                    minTau = tau;
                }
            }
            if (bestVal > 0.55) {
                // Not a periodic musical tone (noise/percussion)
                return { silence: false, unpitched: true, rms };
            }
        }

        // Sub-octave / 2nd-harmonic verification for bass/tenor notes (<400 Hz, minTau > 110):
        // On 61-key keyboards, bass notes (C2–B3) can have a stronger 2nd harmonic (2*f0) than f0.
        // Only prefer 2 * minTau if minTau had a shallow dip (>0.08) and 2 * minTau is much deeper (<0.6 * yinBuffer[minTau]).
        const doubleTau = minTau * 2;
        const maxSearchTau = Math.min(maxPeriod, halfBuffer - 1);
        if (minTau > 110 && yinBuffer[minTau] > 0.08 && doubleTau + 2 <= maxSearchTau) {
            let localMinTau = doubleTau;
            for (let t = Math.max(minPeriod, doubleTau - 4); t <= Math.min(maxSearchTau, doubleTau + 4); t++) {
                if (yinBuffer[t] < yinBuffer[localMinTau]) {
                    localMinTau = t;
                }
            }
            if (yinBuffer[localMinTau] < yinBuffer[minTau] * 0.6) {
                minTau = localMinTau;
            }
        }

        // Step 4: Parabolic interpolation for sub-sample accuracy
        let refinedTau = minTau;
        if (minTau > 0 && minTau < halfBuffer - 1) {
            const s0 = yinBuffer[minTau - 1];
            const s1 = yinBuffer[minTau];
            const s2 = yinBuffer[minTau + 1];
            const bottom = 2 * (2 * s1 - s0 - s2);
            if (Math.abs(bottom) > 0.0001) {
                const delta = (s2 - s0) / bottom;
                refinedTau = minTau + delta;
            }
        }

        const frequency = this.sampleRate / refinedTau;
        if (frequency < this.minFrequency || frequency > this.maxFrequency) {
            return { silence: false, outOfRange: true, frequency, rms };
        }

        // Step 5: Convert frequency to MIDI note
        const rawMidi = 69 + 12 * Math.log2(frequency / 440);
        const midi = Math.round(rawMidi);
        if (midi < this.minMidi || midi > this.maxMidi) {
            return { silence: false, outOfRange: true, frequency, midi, rms };
        }
        const cents = Math.round((rawMidi - midi) * 100);
        const noteIndex = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;
        const noteName = `${this.noteNames[noteIndex]}${octave}`;
        const pitchLetter = this.noteNames[noteIndex];
        const key61Number = midi - 35; // Key #1 (C2) to Key #61 (C7)
        const confidence = Math.max(0, 1 - yinBuffer[minTau]);

        // Step 6: Piano attack / onset detection
        const now = performance.now();
        const energyRise = rms - this.previousRms;
        const isSharpAttack = energyRise > 0.015 && (now - this.lastNoteTime > 120);

        // Hysteresis & pitch stability verification
        if (this.candidateMidi === midi) {
            this.stablePitchCount++;
        } else {
            this.candidateMidi = midi;
            this.stablePitchCount = 1;
        }

        let isNewNoteOn = false;
        // Trigger note-on if sharp hammer attack occurred, or pitch has been stable for 2 frames
        if (isSharpAttack || (this.stablePitchCount >= 2 && this.lastDetectedMidi !== midi)) {
            if (now - this.lastNoteTime > 90) { // avoid duplicate triggers within 90ms
                isNewNoteOn = true;
                this.lastNoteTime = now;
                this.lastDetectedMidi = midi;
            }
        }

        this.previousRms = rms;

        return {
            silence: false,
            frequency: Math.round(frequency * 10) / 10,
            midi,
            key61Number,
            noteName,
            pitchLetter,
            octave,
            cents,
            confidence: Math.round(confidence * 100),
            rms,
            isNewNoteOn
        };
    }
}
