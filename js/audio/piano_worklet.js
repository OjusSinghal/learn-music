/**
 * Off-Main-Thread Piano AudioWorkletProcessor
 * Buffers 128-sample Web Audio render quanta into a lock-free 4096-sample sliding window
 * and dispatches overlapping frames every 1024 samples (~21.3 ms @ 48 kHz) without blocking
 * the 60 FPS Canvas UI thread.
 */

class PianoCaptureWorkletProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const opts = (options && options.processorOptions) || {};
        this.windowSize = opts.windowSize || 4096;
        this.hopSize = opts.hopSize || 1024;

        // Pre-allocated circular buffer (zero GC allocations during audio callback)
        this.ringBuffer = new Float32Array(this.windowSize);
        this.writeIndex = 0;
        this.samplesSinceHop = 0;
        this.totalSamples = 0;
        this.isActive = true;

        this.port.onmessage = (event) => {
            if (event.data && event.data.type === "stop") {
                this.isActive = false;
            }
        };
    }

    process(inputs) {
        if (!this.isActive) return false;

        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        const len = channelData.length;
        const winSize = this.windowSize;

        for (let i = 0; i < len; i++) {
            this.ringBuffer[this.writeIndex] = channelData[i];
            this.writeIndex = (this.writeIndex + 1) % winSize;
        }

        this.totalSamples += len;
        this.samplesSinceHop += len;

        if (this.totalSamples >= winSize && this.samplesSinceHop >= this.hopSize) {
            this.samplesSinceHop %= this.hopSize;

            // Unwrap circular buffer in chronological order into transferable Float32Array
            const frame = new Float32Array(winSize);
            const tailLen = winSize - this.writeIndex;
            frame.set(this.ringBuffer.subarray(this.writeIndex, winSize), 0);
            if (this.writeIndex > 0) {
                frame.set(this.ringBuffer.subarray(0, this.writeIndex), tailLen);
            }

            // Compute fast RMS in worklet
            let sumSq = 0;
            for (let i = 0; i < winSize; i++) {
                const s = frame[i];
                sumSq += s * s;
            }
            const rms = Math.sqrt(sumSq / winSize);

            this.port.postMessage(
                {
                    type: "audio_frame",
                    frame,
                    rms,
                    sampleRate
                },
                [frame.buffer]
            );
        }

        return true;
    }
}

registerProcessor("piano-capture-worklet", PianoCaptureWorkletProcessor);
