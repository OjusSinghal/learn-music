/**
 * Microphone Audio Stream & Calibrated 61-Key Polyphonic Piano Listener
 * =====================================================================
 * Manages Web Audio MediaStream, 52Hz high-pass rumble filter, off-main-thread
 * AudioWorklet frame capture (with seamless AnalyserNode fallback), and dispatches
 * polyphonic chord/note detections from CalibratedPolyphonicDetector.
 */

import { CalibratedPolyphonicDetector } from "./polyphonic_detector.js";

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

        // Calibrated 61-key polyphonic + score-informed detector
        this.polyDetector = new CalibratedPolyphonicDetector({
            sampleRate: this.ctx ? this.ctx.sampleRate : 48000
        });

        // Callbacks
        this.onPitch = options.onPitch || null;
        this.onVolume = options.onVolume || null;
        this.onStatusChange = options.onStatusChange || null;
        this.onError = options.onError || null;
        this.getExpectedMidis = options.getExpectedMidis || null;
    }

    setAudioContext(ctx) {
        if (this.ctx !== ctx) {
            this.ctx = ctx;
            this.workletModuleLoaded = false;
        }
        if (ctx && this.polyDetector) {
            this.polyDetector.setSampleRate(ctx.sampleRate);
        }
    }

    setSensitivity(level) {
        // level: 0 to 1 (default 0.75)
        this.polyDetector.setSensitivity(level);
    }

    reloadCalibrationProfile(newProfile) {
        if (this.polyDetector) {
            this.polyDetector.reloadProfile(newProfile);
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

            this.polyDetector.setSampleRate(this.ctx.sampleRate);
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

            // Highpass filter at 52Hz (just below 61-key lowest note C2 = 65.41Hz) to eliminate 50Hz hum & desk bumps
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = "highpass";
            this.filter.frequency.setValueAtTime(52, this.ctx.currentTime);
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
        const result = this.polyDetector.detect(frame, {
            rms: precomputedRms,
            expectedMidis
        });

        const rms = result.rms || 0;
        const volumePercent = Math.min(100, Math.round(rms * 450));
        if (this.onVolume) {
            this.onVolume(volumePercent);
        }

        if (!result.silence && result.activeNotes && result.activeNotes.length > 0) {
            if (this.onPitch) {
                this.onPitch(result);
            }
        } else if (this.onPitch) {
            this.onPitch({
                silence: true,
                rms,
                volumePercent,
                activeNotes: [],
                onsetNotes: []
            });
        }
    }

    stop() {
        this.isListening = false;
        if (this.animationId) {
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
