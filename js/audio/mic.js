/**
 * Microphone Audio Stream & Multi-Instrument Polyphonic Listener (Piano & Ukulele)
 * ==============================================================================
 * Manages Web Audio MediaStream, instrument-adaptive high-pass rumble filter
 * (52 Hz Piano / 180 Hz High-G Ukulele / 135 Hz Low-G Ukulele), off-main-thread
 * AudioWorklet frame capture (with seamless AnalyserNode fallback), and dispatches
 * polyphonic chord/note/tuner detections from CalibratedPolyphonicDetector or
 * UkulelePolyphonicDetector.
 */

import { CalibratedPolyphonicDetector } from "./polyphonic_detector.js";
import { UkulelePolyphonicDetector } from "./ukulele_detector.js";

export class PianoMicrophone {
    constructor(audioContext = null, options = {}) {
        this.ctx = audioContext;
        this.stream = null;
        this.source = null;
        this.filter = null;
        this.workletNode = null;
        this.silentGain = null;
        this.analyser = null;

        this.bufferSize = 4096;
        this.hopSize = 1024;
        this.timeDomainBuffer = new Float32Array(this.bufferSize);

        this.isListening = false;
        this.usingWorklet = false;
        this.workletModuleLoaded = false;
        this.animationId = null;

        const sr = this.ctx ? this.ctx.sampleRate : (options.sampleRate || 48000);
        this.instrument = options.instrument === "ukulele" ? "ukulele" : "piano";
        this.ukuleleTuning = options.tuning === "low-g" ? "low-g" : "high-g";
        this._sensitivity = typeof options.sensitivity === "number" ? options.sensitivity : 0.75;

        // Dual instrument polyphonic detectors (shared audio pipeline, instant hot-swap)
        this.pianoDetector = new CalibratedPolyphonicDetector({ sampleRate: sr });
        this.ukuleleDetector = new UkulelePolyphonicDetector({
            sampleRate: sr,
            tuning: this.ukuleleTuning
        });
        this.pianoDetector.setSensitivity(this._sensitivity);
        this.ukuleleDetector.setSensitivity(this._sensitivity);

        this.polyDetector = this.instrument === "ukulele" ? this.ukuleleDetector : this.pianoDetector;

        // Callbacks (supports both onPitch and onPitchUpdate aliases)
        this.onPitch = options.onPitch || options.onPitchUpdate || null;
        this.onPitchUpdate = options.onPitchUpdate || null;
        this.onVolume = options.onVolume || null;
        this.onStatusChange = options.onStatusChange || null;
        this.onError = options.onError || null;
        this.getExpectedMidis = options.getExpectedMidis || null;
    }

    _getTargetHpfHz() {
        if (this.instrument === "ukulele") {
            return this.ukuleleTuning === "low-g" ? 135 : 180;
        }
        return 52;
    }

    _applyLiveHpf() {
        if (this.filter && this.ctx) {
            try {
                this.filter.frequency.setValueAtTime(this._getTargetHpfHz(), this.ctx.currentTime);
            } catch (e) {}
        }
    }

    getInstrument() {
        return this.instrument;
    }

    setInstrument(instrument, { tuning } = {}) {
        const nextInst = instrument === "ukulele" ? "ukulele" : "piano";
        if (tuning === "low-g" || tuning === "high-g") {
            this.ukuleleTuning = tuning;
            this.ukuleleDetector.setTuning(tuning);
        }
        this.instrument = nextInst;
        this.polyDetector = this.instrument === "ukulele" ? this.ukuleleDetector : this.pianoDetector;
        if (this.ctx && this.ctx.sampleRate) {
            this.polyDetector.setSampleRate(this.ctx.sampleRate);
        }
        this.polyDetector.setSensitivity(this._sensitivity);
        this.polyDetector.resetState();
        this._applyLiveHpf();
        return this.instrument;
    }

    setUkuleleTuning(tuning) {
        const nextTuning = tuning === "low-g" ? "low-g" : "high-g";
        this.ukuleleTuning = this.ukuleleDetector.setTuning(nextTuning);
        if (this.instrument === "ukulele") {
            this._applyLiveHpf();
        }
        return this.ukuleleTuning;
    }

    setAudioContext(ctx) {
        if (this.ctx !== ctx) {
            this.ctx = ctx;
            this.workletModuleLoaded = false;
        }
        if (ctx && ctx.sampleRate) {
            if (this.pianoDetector) this.pianoDetector.setSampleRate(ctx.sampleRate);
            if (this.ukuleleDetector) this.ukuleleDetector.setSampleRate(ctx.sampleRate);
        }
    }

    setSensitivity(level) {
        // level: 0 to 1 (default 0.75)
        this._sensitivity = level;
        if (this.pianoDetector) this.pianoDetector.setSensitivity(level);
        if (this.ukuleleDetector) this.ukuleleDetector.setSensitivity(level);
    }

    reloadCalibrationProfile(newProfile, instrument = this.instrument) {
        const target = instrument === "ukulele" ? this.ukuleleDetector : this.pianoDetector;
        if (target && typeof target.reloadProfile === "function") {
            target.reloadProfile(newProfile);
        }
    }

    _emitPitchResult(payload) {
        if (this.onPitch) {
            this.onPitch(payload);
        }
        if (this.onPitchUpdate && this.onPitchUpdate !== this.onPitch) {
            this.onPitchUpdate(payload);
        }
    }

    async start() {
        if (this.isListening) return true;

        try {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
            }

            if (this.ctx.state === "suspended") {
                await this.ctx.resume();
            }

            this.pianoDetector.setSampleRate(this.ctx.sampleRate);
            this.ukuleleDetector.setSampleRate(this.ctx.sampleRate);
            this.polyDetector.resetState();

            // Request raw acoustic audio without voice DSP (no echo cancellation, no speech gating, no AGC)
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0
                }
            });

            this.source = this.ctx.createMediaStreamSource(this.stream);

            // Instrument-adaptive highpass filter (52 Hz Piano / 180 Hz High-G Ukulele / 135 Hz Low-G Ukulele)
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = "highpass";
            this.filter.frequency.setValueAtTime(this._getTargetHpfHz(), this.ctx.currentTime);
            this.filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

            this.source.connect(this.filter);

            // Attempt off-main-thread AudioWorklet pipeline first
            let workletReady = false;
            if (this.ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
                try {
                    if (!this.workletModuleLoaded) {
                        const workletUrl = new URL("./piano_worklet.js", import.meta.url);
                        await this.ctx.audioWorklet.addModule(workletUrl.href);
                        this.workletModuleLoaded = true;
                    }

                    this.workletNode = new AudioWorkletNode(this.ctx, "piano-capture-worklet", {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        outputChannelCount: [1],
                        processorOptions: {
                            windowSize: this.bufferSize,
                            hopSize: this.hopSize
                        }
                    });

                    // Connect through a zero-gain sink so Web Audio pulls quanta reliably across Safari/Chrome
                    this.silentGain = this.ctx.createGain();
                    this.silentGain.gain.setValueAtTime(0, this.ctx.currentTime);

                    this.workletNode.port.onmessage = (event) => {
                        if (!this.isListening) return;
                        const msg = event.data;
                        if (msg && msg.type === "audio_frame") {
                            if (msg.sampleRate) {
                                this.polyDetector.setSampleRate(msg.sampleRate);
                            }
                            this._processFrame(msg.frame, msg.rms);
                        }
                    };

                    this.filter.connect(this.workletNode);
                    this.workletNode.connect(this.silentGain);
                    this.silentGain.connect(this.ctx.destination);

                    this.usingWorklet = true;
                    workletReady = true;
                } catch (workletErr) {
                    console.warn("AudioWorklet unavailable, falling back to AnalyserNode loop:", workletErr);
                    workletReady = false;
                }
            }

            // Fallback: AnalyserNode + requestAnimationFrame loop
            if (!workletReady) {
                this.usingWorklet = false;
                this.analyser = this.ctx.createAnalyser();
                this.analyser.fftSize = this.bufferSize;
                this.analyser.smoothingTimeConstant = 0.05;
                this.filter.connect(this.analyser);
                this.startFallbackLoop();
            }

            this.isListening = true;
            if (this.onStatusChange) this.onStatusChange("listening");
            return true;
        } catch (err) {
            console.error("Microphone access error:", err);
            this.isListening = false;
            if (this.onError) this.onError(err);
            if (this.onStatusChange) this.onStatusChange("error");
            return false;
        }
    }

    _processFrame(frame, precomputedRms = undefined) {
        const expectedMidis = this.getExpectedMidis ? this.getExpectedMidis() : null;
        const detectContext = {
            rms: precomputedRms,
            expectedMidis
        };
        if (this.instrument === "ukulele") {
            detectContext.isChordExpected = Array.isArray(expectedMidis) && expectedMidis.length > 1;
        }

        const result = this.polyDetector.detect(frame, detectContext);

        const rms = result.rms || 0;
        const volumePercent = Math.min(100, Math.round(rms * 450));
        if (this.onVolume) {
            this.onVolume(volumePercent);
        }

        if (!result.silence && result.activeNotes && result.activeNotes.length > 0) {
            this._emitPitchResult({
                ...result,
                instrument: this.instrument,
                volumePercent
            });
        } else {
            this._emitPitchResult({
                silence: true,
                instrument: this.instrument,
                rms,
                volumePercent,
                activeNotes: [],
                onsetNotes: [],
                activeMidis: [],
                onsetMidis: [],
                detectedChord: result.detectedChord || null,
                dominantFreq: result.dominantFreq || null,
                dominantMidi: result.dominantMidi ?? null,
                centsOff: result.centsOff ?? null,
                tunerNote: result.tunerNote || null,
                strumPending: Boolean(result.strumPending)
            });
        }
    }

    stop() {
        this.isListening = false;
        if (this.animationId && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.workletNode) {
            try {
                this.workletNode.port.postMessage({ type: "stop" });
                this.workletNode.disconnect();
            } catch (e) {}
            this.workletNode = null;
        }

        if (this.silentGain) {
            try { this.silentGain.disconnect(); } catch (e) {}
            this.silentGain = null;
        }

        if (this.analyser) {
            try { this.analyser.disconnect(); } catch (e) {}
            this.analyser = null;
        }

        if (this.filter) {
            try { this.filter.disconnect(); } catch (e) {}
            this.filter = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }

        if (this.source) {
            try { this.source.disconnect(); } catch (e) {}
            this.source = null;
        }

        if (this.onStatusChange) this.onStatusChange("stopped");
    }

    startFallbackLoop() {
        if (typeof requestAnimationFrame !== "function") return;
        let lastRunMs = 0;
        const analyze = (now) => {
            if (!this.isListening || !this.analyser) return;

            // Throttle fallback loop to ~21ms hop interval matching AudioWorklet
            if (now - lastRunMs >= 20) {
                lastRunMs = now;
                this.analyser.getFloatTimeDomainData(this.timeDomainBuffer);
                this._processFrame(this.timeDomainBuffer);
            }

            this.animationId = requestAnimationFrame(analyze);
        };

        this.animationId = requestAnimationFrame(analyze);
    }
}
