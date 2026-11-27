/**
 * Audio Dataset PCM WAV Recorder & Level Analyzer
 * Captures lossless 16-bit PCM WAV audio from acoustic piano microphone.
 * Includes live level monitoring, RMS calculation, frequency peak estimation, and instant playback.
 */

export class AudioDatasetRecorder {
    constructor(audioContext = null) {
        this.ctx = audioContext;
        this.stream = null;
        this.source = null;
        this.processor = null;
        this.dummyGain = null;
        this.analyser = null;

        this.isRecording = false;
        this.recordedChunks = [];
        this.totalSamples = 0;
        this.sampleRate = 44100;

        // Active recorded sample data
        this.lastBlob = null;
        this.lastAudioUrl = null;
        this.lastBase64 = null;
        this.lastStats = null;

        // Playback audio element
        this.playbackAudio = new Audio();
        this.playbackAudio.addEventListener("ended", () => {
            if (this.onPlaybackEnd) this.onPlaybackEnd();
        });

        // Callbacks
        this.onAudioLevel = null;   // (rms: 0..1)
        this.onPlaybackEnd = null;  // ()
    }

    setAudioContext(ctx) {
        this.ctx = ctx;
        if (ctx) this.sampleRate = ctx.sampleRate;
    }

    /**
     * Ensure microphone is connected and stream source is active
     */
    async ensureMicrophone(existingStream = null) {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === "suspended") {
            await this.ctx.resume();
        }
        this.sampleRate = this.ctx.sampleRate;

        if (existingStream) {
            this.stream = existingStream;
        } else if (!this.stream || !this.stream.active) {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    latency: 0
                }
            });
        }

        if (!this.source && this.stream) {
            this.source = this.ctx.createMediaStreamSource(this.stream);
        }

        return true;
    }

    /**
     * Start capturing audio frames
     */
    async startRecording() {
        await this.ensureMicrophone();

        this.recordedChunks = [];
        this.totalSamples = 0;
        this.isRecording = true;

        // Clean up any previous playback URL
        if (this.lastAudioUrl) {
            URL.revokeObjectURL(this.lastAudioUrl);
            this.lastAudioUrl = null;
        }

        // Setup real-time FFT analyser for visual feedback
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;

        // Setup ScriptProcessor for uncompressed PCM collection
        const bufferSize = 4096;
        this.processor = this.ctx.createScriptProcessor(bufferSize, 1, 1);
        
        this.processor.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const channelData = e.inputBuffer.getChannelData(0);
            
            // Clone buffer data
            const chunk = new Float32Array(channelData.length);
            chunk.set(channelData);
            this.recordedChunks.push(chunk);
            this.totalSamples += chunk.length;

            // Compute instant RMS level for live VU meter
            let sumSq = 0;
            for (let i = 0; i < channelData.length; i++) {
                sumSq += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sumSq / channelData.length);
            if (this.onAudioLevel) {
                this.onAudioLevel(rms);
            }
        };

        // Create silent dummy gain so browser keeps running audio process callback
        this.dummyGain = this.ctx.createGain();
        this.dummyGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.source.connect(this.analyser);
        this.source.connect(this.processor);
        this.processor.connect(this.dummyGain);
        this.dummyGain.connect(this.ctx.destination);
    }

    /**
     * Stop capturing and compile WAV buffer
     * @returns {Promise<Object>} Result with blob, audioUrl, base64, stats
     */
    async stopRecording() {
        this.isRecording = false;

        // Disconnect recording nodes
        if (this.processor) {
            try {
                this.processor.disconnect();
                if (this.source) this.source.disconnect(this.processor);
            } catch (e) {}
            this.processor = null;
        }

        if (this.dummyGain) {
            try { this.dummyGain.disconnect(); } catch (e) {}
            this.dummyGain = null;
        }

        // Concatenate all chunks into a single Float32Array
        const fullBuffer = new Float32Array(this.totalSamples);
        let offset = 0;
        for (const chunk of this.recordedChunks) {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        // Compute signal analytics (RMS, Peak Amplitude, Estimated Dominant Frequency)
        let sumSq = 0;
        let peakAmp = 0;
        for (let i = 0; i < fullBuffer.length; i++) {
            const abs = Math.abs(fullBuffer[i]);
            if (abs > peakAmp) peakAmp = abs;
            sumSq += fullBuffer[i] * fullBuffer[i];
        }
        const rms = fullBuffer.length > 0 ? Math.sqrt(sumSq / fullBuffer.length) : 0;
        const durationSec = fullBuffer.length / this.sampleRate;

        // Estimate fundamental frequency & note on the loudest sustained window via YIN
        const pitchEst = this.estimateDominantPitch(fullBuffer);
        const dominantFreq = pitchEst.frequency;

        // Encode to standard 16-bit PCM WAV Blob
        const wavBlob = this.encodeWav16(fullBuffer, this.sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        const base64 = await this.blobToBase64(wavBlob);

        this.lastBlob = wavBlob;
        this.lastAudioUrl = audioUrl;
        this.lastBase64 = base64;
        this.lastStats = {
            durationSec: Math.round(durationSec * 100) / 100,
            sampleRate: this.sampleRate,
            numSamples: fullBuffer.length,
            rms: Math.round(rms * 1000) / 1000,
            peakAmp: Math.round(peakAmp * 1000) / 1000,
            dominantFreq: Math.round(dominantFreq * 10) / 10,
            detectedMidi: pitchEst.midi,
            detectedNote: pitchEst.noteName,
            detectedKey61: pitchEst.key61,
            fileSizeBytes: wavBlob.size
        };

        this.playbackAudio.src = audioUrl;

        return {
            blob: wavBlob,
            audioUrl,
            base64,
            stats: this.lastStats
        };
    }

    /**
     * YIN fundamental frequency estimator on the highest-energy sustained window of the recording
     */
    estimateDominantPitch(buffer) {
        const empty = { frequency: 0, midi: null, noteName: null, key61: null };
        if (!buffer || buffer.length < 4096) return empty;

        const W = 2048;
        const startOffset = Math.min(Math.floor(this.sampleRate * 0.1), Math.floor(buffer.length * 0.1));
        let bestStart = startOffset;
        let bestEnergy = 0;

        for (let s = startOffset; s + 2 * W < buffer.length; s += W) {
            let energy = 0;
            for (let i = 0; i < W; i += 2) {
                const v = buffer[s + i];
                energy += v * v;
            }
            if (energy > bestEnergy) {
                bestEnergy = energy;
                bestStart = s;
            }
        }

        const winRms = Math.sqrt(bestEnergy / (W / 2));
        if (winRms < 0.005) return empty;

        const minLag = Math.max(2, Math.floor(this.sampleRate / 2150)); // C7 = 2093 Hz
        const maxLag = Math.min(W - 1, Math.floor(this.sampleRate / 60)); // C2 = 65.41 Hz
        const yin = new Float32Array(maxLag + 1);
        yin[0] = 1.0;

        let runningSum = 0;
        for (let tau = 1; tau <= maxLag; tau++) {
            let diffSum = 0;
            for (let i = 0; i < W; i++) {
                const d = buffer[bestStart + i] - buffer[bestStart + i + tau];
                diffSum += d * d;
            }
            runningSum += diffSum;
            yin[tau] = runningSum > 0 ? (diffSum * tau) / runningSum : 1.0;
        }

        let bestTau = -1;
        const threshold = 0.18;
        for (let tau = minLag; tau < maxLag; tau++) {
            if (yin[tau] < threshold) {
                while (tau + 1 < maxLag && yin[tau + 1] < yin[tau]) {
                    tau++;
                }
                bestTau = tau;
                break;
            }
        }

        if (bestTau === -1) {
            let minVal = 999;
            for (let tau = minLag; tau < maxLag; tau++) {
                if (yin[tau] < minVal) {
                    minVal = yin[tau];
                    bestTau = tau;
                }
            }
            if (minVal > 0.55) return empty;
        }

        // Sub-octave / 2nd-harmonic check for bass/tenor notes (<400 Hz, bestTau > 110):
        // Only prefer 2*bestTau if bestTau had a shallow dip (>0.08) and 2*bestTau is significantly deeper (<0.6*yin[bestTau])
        const doubleTau = bestTau * 2;
        if (bestTau > 110 && yin[bestTau] > 0.08 && doubleTau + 2 <= maxLag) {
            let localMinTau = doubleTau;
            for (let t = Math.max(minLag, doubleTau - 4); t <= Math.min(maxLag, doubleTau + 4); t++) {
                if (yin[t] < yin[localMinTau]) localMinTau = t;
            }
            if (yin[localMinTau] < yin[bestTau] * 0.6) {
                bestTau = localMinTau;
            }
        }

        // Parabolic interpolation
        let refinedTau = bestTau;
        if (bestTau > 1 && bestTau < maxLag) {
            const s0 = yin[bestTau - 1];
            const s1 = yin[bestTau];
            const s2 = yin[bestTau + 1];
            const denom = 2 * (2 * s1 - s0 - s2);
            if (Math.abs(denom) > 0.0001) {
                refinedTau = bestTau + (s2 - s0) / denom;
            }
        }

        const frequency = refinedTau > 0 ? this.sampleRate / refinedTau : 0;
        if (frequency < 60 || frequency > 2150) return empty;

        const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
        const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const pitchIdx = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;
        const noteName = `${noteNames[pitchIdx]}${octave}`;
        const key61 = midi - 35;

        return { frequency, midi, noteName, key61 };
    }

    estimateDominantFrequency(buffer) {
        return this.estimateDominantPitch(buffer).frequency;
    }

    /**
     * Play recorded audio preview
     */
    playAudioPreview() {
        if (this.lastAudioUrl) {
            this.playbackAudio.currentTime = 0;
            this.playbackAudio.play().catch(e => console.warn("Playback error:", e));
            return true;
        }
        return false;
    }

    /**
     * Stop playback
     */
    stopAudioPreview() {
        if (!this.playbackAudio.paused) {
            this.playbackAudio.pause();
            this.playbackAudio.currentTime = 0;
        }
    }

    /**
     * Pure JS 16-bit PCM Mono WAV Encoder
     */
    encodeWav16(samples, sampleRate) {
        const numSamples = samples.length;
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);

        const writeStr = (pos, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(pos + i, str.charCodeAt(i));
            }
        };

        // RIFF header
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');

        // 'fmt ' subchunk
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
        view.setUint16(22, 1, true);              // NumChannels (1 = Mono)
        view.setUint32(24, sampleRate, true);     // SampleRate
        view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 1 channel * 2 bytes/sample)
        view.setUint16(32, 2, true);              // BlockAlign (1 channel * 2 bytes/sample)
        view.setUint16(34, 16, true);             // BitsPerSample (16 bits)

        // 'data' subchunk
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        // Convert Float32 to 16-bit signed PCM
        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            let int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, Math.floor(int16), true);
            offset += 2;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    /**
     * Convert Blob to Base64 data string (raw base64 payload without data prefix)
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}
