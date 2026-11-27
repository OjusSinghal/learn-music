# 🎹 Acoustic Piano Note Detection & Polyphonic Accuracy Research

**Document Version**: 1.0  
**Target Application**: Yousician Piano Learner (`/Users/ojus/official/piano-app`)  
**Status**: Research & In-App Sound Collection Trainer Active (`js/trainer/`)

---

## Executive Summary

The Yousician Piano application currently implements an acoustic listener using the **YIN pitch tracking algorithm** in [pitch.js](file:///Users/ojus/official/piano-app/js/audio/pitch.js) coupled with short-time RMS energy onset detection. While YIN is an industry-standard algorithm for **monophonic** audio (such as singing, flute, or single-note guitar leads), it is mathematically constrained to detecting a **single dominant periodicity**. 

When applied to an acoustic piano playing multiple notes simultaneously (chords, intervals, or two-handed staves), the superposition of complex harmonic series destroys the single periodic dip in the autocorrelation difference function. As a result, the current implementation exhibits:
1. **Total failure on chords / polyphony**: Drops into unpitched mode, misses notes, or arbitrarily latches onto whichever harmonic happens to dominate the frame.
2. **Octave ambiguity in the bass**: Missing or weak fundamental frequencies ($A_0 - C_2$) cause octave doubling/jumping.
3. **Severe main-thread computational overhead**: The $O(N^2)$ time-domain difference function runs on the browser's UI thread 60 times per second, executing over 4 million floating-point operations per frame.
4. **Single-note evaluator coupling**: The game evaluator in [evaluator.js](file:///Users/ojus/official/piano-app/js/engine/evaluator.js) expects a single target MIDI note at a time, making simultaneous multi-note evaluation in Wait Mode impossible.

**Key Finding on User Audio**: Providing audio recordings of your specific piano **will dramatically improve detection accuracy**. Beyond providing an objective ground-truth benchmark suite to quantitatively measure precision and recall, your recordings allow profiling the unique **string inharmonicity coefficient ($B$)**, measuring your room's acoustic resonance and microphone frequency roll-off, and calibrating detection thresholds for neural or dictionary-based models.

---

## 1. Deep Dive into the Current Implementation

### 1.1 Audio Pipeline & Signal Flow
The application's acoustic capture pipeline is structured as follows:

```
Microphone (getUserMedia)
  │ Raw Float32 PCM (44.1kHz / 48kHz, voice DSP disabled)
  ▼
[BiquadFilterNode] (High-pass at 45Hz, Q=0.7)
  ▼
[AnalyserNode] (fftSize = 4096 samples, ~92.8ms window)
  ▼
requestAnimationFrame (Main Thread, ~60 FPS)
  │ getFloatTimeDomainData()
  ▼
[PianoPitchDetector.detect()] in pitch.js
  ├─ Step 1: O(N²) Difference Function (tau: 21 to 801 samples)
  ├─ Step 2: Cumulative Mean Normalized Difference Function (CMNDF)
  ├─ Step 3: Absolute thresholding (yinThreshold = 0.15)
  ├─ Step 4: Parabolic interpolation on local minimum
  ├─ Step 5: Frequency to MIDI mapping & cents deviation
  └─ Step 6: RMS energy derivative onset detection (ΔRMS > 0.015, holdoff 90ms)
  ▼
[NoteEvaluator.evaluatePlayedNote()] in evaluator.js
  └─ Checks single playedMidi against currentWaitNote (Wait) or candidateNotes (Flow)
```

### 1.2 Identified Architectural Bottlenecks

#### A. Monophonic Mathematical Limitation
The core of YIN in [`PianoPitchDetector.detect()`](file:///Users/ojus/official/piano-app/js/audio/pitch.js#L51-L175) is the difference function:
$$d_t(\tau) = \sum_{j=1}^{W} \big(x_j - x_{j+\tau}\big)^2$$
When a single note of period $\tau_0$ is played, $d_t(\tau_0) \approx 0$. When two notes are played simultaneously (e.g., $C_4$ at $261.6\text{ Hz}$, period $168$ samples, and $G_4$ at $392.0\text{ Hz}$, period $112$ samples), the signal only repeats at the least common multiple of their periods ($337\text{ samples} \approx 130.8\text{ Hz} = C_3$, a subharmonic!). The normalized difference function:
$$d'_t(\tau) = \frac{d_t(\tau)}{\frac{1}{\tau}\sum_{j=1}^\tau d_t(j)}$$
rarely drops below the threshold $\theta = 0.15$. The algorithm falls back to the global search ([pitch.js, lines 95–108](file:///Users/ojus/official/piano-app/js/audio/pitch.js#L95-L108)), which either flags the buffer as `unpitched: true` (ignored by the game) or outputs a spurious subharmonic.

#### B. Main-Thread Computational Complexity ($O(N^2)$)
In [`PianoPitchDetector.detect()`](file:///Users/ojus/official/piano-app/js/audio/pitch.js#L63-L70):
```javascript
for (let tau = 0; tau < halfBuffer; tau++) {
    let diff = 0;
    for (let i = 0; i < halfBuffer; i++) {
        const delta = buffer[i] - buffer[i + tau];
        diff += delta * delta;
    }
    yinBuffer[tau] = diff;
}
```
For `bufferSize = 4096`, `halfBuffer = 2048`. The inner loop executes $2048 \times 2048 \approx 4,194,304$ iterations **every animation frame**. Running ~4.2 million floating-point operations at 60 Hz in the main JavaScript thread consumes substantial CPU resources, competing directly with Canvas rendering in [`VisualizerRenderer.render()`](file:///Users/ojus/official/piano-app/js/engine/renderer.js). Standard YIN avoids this by using Fast Fourier Transforms (FFT) via the Wiener-Khinchin theorem:
$$d_t(\tau) = r_t(0) + r_{t+\tau}(0) - 2 r_t(\tau)$$
where the autocorrelation $r_t(\tau)$ is computed via $\text{IFFT}(|\text{FFT}(x)|^2)$ in $O(N \log N)$ time.

#### C. Fixed Window Size vs. Heisenberg-Gabor Uncertainty
A fixed buffer of $4096$ samples at $44.1\text{ kHz}$ represents a time window of $92.8\text{ ms}$:
* **For Bass Notes ($A_1 = 55\text{ Hz}$)**: The period is $18.2\text{ ms}$. A $92.8\text{ ms}$ window contains only $\approx 5$ cycles, which is minimal for stable autocorrelation. For $A_0 = 27.5\text{ Hz}$, it contains only $2.5$ cycles.
* **For Treble Notes ($C_6 = 1046.5\text{ Hz}$)**: The period is $0.95\text{ ms}$. A $92.8\text{ ms}$ window contains over 97 cycles, introducing unnecessary temporal smearing and onset latency.

#### D. Evaluator State Machine is Single-Note Only
In [`NoteEvaluator.evaluateWaitMode()`](file:///Users/ojus/official/piano-app/js/engine/evaluator.js#L104-L155):
```javascript
const target = this.currentWaitNote || this.notes.find(n => n.state === "pending");
if (playedMidi === target.pitch) {
    target.state = "correct";
    // ...
    this.currentWaitNote = this.notes.find(n => n.state === "pending") || null;
}
```
In the preloaded song `"Yousician Groove"` in [library.js](file:///Users/ojus/official/piano-app/js/songs/library.js#L23-L26), both $B_4$ (MIDI 71) and $B_2$ (MIDI 47) have `time: 0.0`. In Wait Mode, the engine only selects the first pending note ($B_4$). Even if a polyphonic detector detected both notes, the engine would only accept $B_4$, immediately freeze on $B_2$, and demand the user strike them sequentially rather than as a unified chord.

---

## 2. Physics & Acoustic Challenges of Real Pianos

Acoustic pianos are among the most difficult instruments for Automatic Music Transcription (AMT). Understanding these acoustic phenomena is essential for designing an accurate detector:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      ACOUSTIC PIANO CHALLENGES                         │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. String Inharmonicity        │ Overtones are sharp: fn ≈ n·f0·√(1+Bn²)│
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Missing Bass Fundamental    │ A0-C2 acoustic power is in 2nd-4th    │
│                                │ harmonics; speaker/mic cuts low end.  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Harmonic Collision / Chords │ Octaves & fifths share exact harmonic │
│                                │ frequencies (e.g. C3 partials in C4). │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. Attack Transient & Felt     │ Initial hammer strike produces wide-  │
│                                │ band percussive noise for 15-40ms.    │
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. Sympathetic Resonance       │ Undamped strings vibrate sympathetically│
│                                │ when nearby strings are struck.       │
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **String Inharmonicity ($B$ Parameter)**:
   Unlike ideal flexible strings, piano strings have physical stiffness, creating a shear restoring force. The frequencies of the partials deviate from exact harmonic integer multiples:
   $$f_n = n \cdot f_0 \cdot \sqrt{1 + B \cdot n^2}$$
   where $B$ is the inharmonicity coefficient (typically $10^{-4}$ in concert grands, but up to $10^{-3}$ or $3 \times 10^{-3}$ in short upright pianos). At the 8th partial, a note can be 30 to 60 cents sharp relative to ideal harmonic spacing. Generic comb filters or harmonic templates fail if they do not account for $B$.

2. **The "Phantom" Bass Fundamental**:
   On small upright pianos and consumer microphones, physical sound pressure at $A_0$ ($27.5\text{ Hz}$) or $C_1$ ($32.7\text{ Hz}$) is virtually non-existent. The human ear perceives the pitch because the auditory cortex reconstructs the fundamental from the difference between adjacent upper harmonics ($2f_0, 3f_0, 4f_0$). Monophonic pitch detectors that search for the lowest fundamental peak consistently misidentify bass notes as an octave or a twelfth higher ($2f_0$ or $3f_0$).

3. **Harmonic Overlap in Chords**:
   When playing a standard $C$ major triad ($C_4, E_4, G_4$):
   * The 3rd harmonic of $C_4$ ($3 \times 261.63 = 784.89\text{ Hz}$) aligns almost exactly with the 2nd harmonic of $G_4$ ($2 \times 392.00 = 784.00\text{ Hz}$).
   * In octaves ($C_3$ and $C_4$), **every single partial of $C_4$ directly collides with an even partial of $C_3$**. A simple peak detector cannot tell whether $C_4$ was struck or if $C_3$ is merely ringing loudly.

---

## 3. Best Ways to Improve Accuracy & Polyphonic Detection

To solve polyphony and improve accuracy, four viable algorithmic architectures exist for modern web browsers. Below is a comparative analysis:

### Approach 1: Lightweight Neural AMT — Spotify's Basic Pitch (Recommended for Unconstrained Transcription)

**How it Works**:  
Spotify's [Basic Pitch](https://github.com/spotify/basic-pitch) (Bittner et al., ICASSP 2022) is an open-source, multi-pitch estimation and note onset neural network designed specifically for lightweight client-side execution.
* **Front-end**: Computes a Constant-Q Transform (CQT) with harmonic stacking (evaluating fundamentals alongside their overtone channels).
* **Back-end**: Fully convolutional neural network with residual blocks and temporal convolutions.
* **Outputs**: Three synchronous output matrices across all 88 piano keys:
  1. `note_activations` ($T \times 88$): Frame-level probability of sustained notes.
  2. `onset_activations` ($T \times 88$): Exact strike attacks, separating re-struck notes from sustained ones.
  3. `contour_activations` ($T \times 88$): Microtonal pitch bend/cents deviation.
* **Web Deployment**: Available as `@spotify/basic-pitch` (TypeScript / TensorFlow.js) or exportable to **ONNX Runtime Web (`onnxruntime-web`)** executing via WebAssembly (WASM SIMD) or WebGPU.

**Performance & Latency**:
* Frame hop: 256 samples ($\approx 11.6\text{ ms}$ at $22.05\text{ kHz}$).
* Model size: ~15MB (quantized ONNX model: < 5MB).
* Inference time: 5–12ms per frame on modern Apple Silicon / WebGPU, easily running within a dedicated Web Worker without impacting the 60fps visualizer.

### Approach 2: Score-Informed Harmonic Hypothesis Testing (The "Yousician/Simply Piano" Method)

**How it Works**:  
Commercial applications like Yousician and Simply Piano (JoyTunes) do not perform unconstrained blind audio-to-sheet transcription during interactive play-along. Instead, **the application already knows the exact ground-truth score at timestamp $t$**.

Rather than asking the computationally hard question:
> *"Out of all $2^{88}$ possible key combinations, which subset is sounding right now?"*

The engine asks a simple, targeted hypothesis test:
> *"The score expects $\{B_2, B_4\}$. Does the incoming audio spectrum contain energy at the inharmonic partial frequencies of $B_2$ and $B_4$ with a sharp attack transient?"*

**Implementation Mechanics**:
1. At time $t$, obtain candidate note set $C = \{m_1, m_2, \dots, m_k\}$ from the active score.
2. Compute a fast 2048-point FFT using the Web Audio API or a small WASM FFT module.
3. For each candidate note $m_i$, evaluate the **Inharmonic Harmonic Energy Sum**:
   $$S(m_i) = \sum_{n=1}^{N_p} w_n \cdot |X(f_n(m_i, B))|^2$$
   where $f_n(m_i, B) = n \cdot f_0(m_i) \cdot \sqrt{1 + B \cdot n^2}$ and $w_n$ is a decaying harmonic weight (e.g., $1/\sqrt{n}$).
4. Compute an **Onset Contrast Metric**: Compare spectral energy at time $t$ against time $t - \Delta t$ specifically within the narrow frequency bands of candidate partials.
5. For "wrong note" detection, evaluate a small pool of adjacent distractor notes (e.g., semitones and fifths).

**Performance & Latency**:
* Extremely fast: < 0.5ms per frame.
* Zero external model dependencies (pure mathematical DSP in Web Audio / AudioWorklet).
* Virtually immune to octave confusion because upper harmonics are tested against the expected root.

### Approach 3: Real-Time Non-Negative Matrix Factorization (NMF) with Custom Spectral Dictionary

**How it Works**:  
NMF decomposes a magnitude spectrogram $V \in \mathbb{R}_{\ge 0}^{F \times T}$ into two low-rank non-negative matrices:
$$V \approx W \cdot H$$
* $W \in \mathbb{R}_{\ge 0}^{F \times 88}$: Pre-computed dictionary matrix where each column $k$ is the characteristic spectral template (fundamental + overtones + formant envelope) of piano key $k$.
* $H \in \mathbb{R}_{\ge 0}^{88 \times T}$: Activation matrix indicating the volume/presence of each key over time.

In real-time mode (Projective NMF or Non-Negative Least Squares), the dictionary $W$ is **fixed**, and the incoming spectral frame $v_t$ is projected onto $W$ to solve for $h_t$:
$$\min_{h_t \ge 0} D(v_t \,||\, W h_t) + \lambda \|h_t\|_1$$
where $D$ is the generalized Kullback-Leibler or Beta-divergence and $\|h_t\|_1$ enforces musical sparsity (preventing phantom notes).

### Approach 4: FFT-Accelerated Multi-Pitch Estimation (Iterative Spectral Subtraction / Klapuri's Sieve)

**How it Works**:
1. Compute the spectrum of the audio frame.
2. Identify the most prominent fundamental frequency using harmonic summation.
3. Subtract that note's estimated spectral footprint (fundamental + harmonics) from the spectrum.
4. Repeat the search on the residual spectrum to find the second note, third note, etc., until the residual falls below the noise floor.
* **Limitations**: Subtraction artifacts can either over-subtract (cancelling a real note that shares a harmonic) or under-subtract (leaving ghost notes).

---

### Comparison of Polyphonic Detection Methods

| Feature / Criteria | Current YIN (`pitch.js`) | Spotify Basic Pitch (ONNX) | Score-Informed Hypothesis Testing | Custom Dictionary NMF |
| :--- | :--- | :--- | :--- | :--- |
| **Polyphonic (Chords)** | ❌ No (Monophonic only) | ✅ Yes (Full 88 keys) | ✅ Yes (Targeted chord sets) | ✅ Yes (Polyphonic) |
| **Bass Accuracy ($A_0 - C_2$)** | ⚠️ Poor (Octave jumps) | ✅ High | ✅ Very High | ✅ High |
| **Inharmonicity Handling** | ❌ None | ✅ Learned by CNN | ✅ Exact formula ($B$ parameterized) | ✅ Exact (from templates) |
| **Latency** | ~90ms | ~25–35ms | **< 15ms** | ~20–30ms |
| **Browser CPU Footprint** | High ($O(N^2)$ main thread) | Moderate (WASM/WebGPU in Worker) | **Minimal (< 1% CPU)** | Low to Moderate |
| **Model / Asset Size** | 0 KB | ~5 MB (Quantized) | **0 KB** | ~200 KB (Templates) |
| **Works on Unseen Songs** | Monophonic only | ✅ Yes | Needs score metadata | ✅ Yes |
| **Wrong Note Catching** | Spurious on chords | ✅ High | ✅ Good (Distractor testing) | ✅ Good |

---

## 4. Would Providing Audio Data of Your Piano Help?

### Direct Answer: **YES, Substantially.**

Providing recorded audio of your piano playing individual notes and chords is one of the highest-leverage assets possible. Here is an in-depth breakdown of **why**, **how**, and **where** it creates a decisive advantage:

### 4.1 Custom Instrument Inharmonicity & Timbre Profiling ($B$ Coefficient)
Every physical piano is unique:
* A compact upright piano has short, stiff copper-wound and steel strings with a high inharmonicity coefficient ($B \approx 0.001 - 0.003$).
* A 7-foot or 9-foot grand piano has long strings with minimal inharmonicity ($B \approx 0.0003$).
* Hammer felt hardness varies: a worn or lacquered hammer produces sharp, bright high partials, while soft felt produces mellow, muted partials.

If we have clean recordings of your piano's individual notes, we can run high-resolution spectral peak estimation on each note to extract:
1. The **exact partial frequencies** $f_1, f_2, \dots, f_{10}$ for your specific strings.
2. The exact inharmonicity parameter $B$ per register.
3. The normalized spectral template dictionary $W$ for **Approach 2 (Score-Informed)** or **Approach 3 (NMF)**.

This eliminates the mismatch that occurs when a generic algorithm assumes ideal mathematical harmonics.

### 4.2 Room Acoustics & Microphone Equalization (Spectral Whitening)
When you practice, the sound does not travel directly into the algorithm—it travels through:
1. **Your room's acoustics**: Standing waves create room resonances (e.g., a strong peak at $110\text{ Hz}$ or a dead zone at $250\text{ Hz}$) and reverberant decay (RT60).
2. **Your microphone's frequency curve**: Built-in laptop microphones (such as on MacBooks) feature steep high-pass roll-offs below $80 - 100\text{ Hz}$ to reject desk vibrations, and aggressive presence boosts between $2\text{ kHz} - 5\text{ kHz}$ to optimize human speech intelligibility.

By analyzing a recording of your piano and ambient room silence, we can compute an **inverse calibration filter** (pre-emphasis / spectral whitening curve):
$$H_{\text{eq}}(f) = \frac{1}{\sqrt{|H_{\text{room+mic}}(f)|^2 + \epsilon}}$$
Applying this lightweight filter in the Web Audio graph immediately flattens the frequency response, preventing bass notes from disappearing and high notes from falsely triggering on key clicks.

### 4.3 Objective Ground-Truth Evaluation & Regression Test Suite
In signal processing and machine learning, **you cannot improve what you cannot measure**. 

Currently, evaluating pitch detection changes requires opening the browser, playing notes live on your piano, and subjectively seeing if notes turn green. This makes rapid iteration nearly impossible.

With recorded audio files accompanied by known MIDI timestamps:
* We can build an automated headless test runner (in Python or Node.js).
* We can benchmark candidate detectors against your real recordings and output quantitative metrics:
  * **Frame Precision & Recall**: $\text{F}_1 = \frac{2 \cdot P \cdot R}{P + R}$
  * **Polyphonic Chord Accuracy**: Percentage of multi-note chords where all constituents are detected simultaneously.
  * **Mean Cent Error**: Accuracy of microtonal pitch measurement.
  * **Onset Latency & Jitter**: Milliseconds between physical hammer strike and detected note-on.
  * **Octave Confusion Rate**: Percentage of $f_0$ detections mistaken for $2f_0$ or $f_0/2$.

### 4.4 Neural Model Threshold Calibration (Basic Pitch)
If we use a deep-learning model like Spotify's Basic Pitch, the model produces continuous probabilities ($0.0 - 1.0$) for note onset and frame presence. 

Default thresholds (`onset_threshold = 0.5`, `frame_threshold = 0.3`) are trained on academic datasets (like MAESTRO and MAPS) recorded on high-end Disklavier grand pianos in studio settings. On a real acoustic piano in a domestic room:
* Sustain resonance often causes notes to remain above `frame_threshold` long after release (creating sticky visual notes).
* Soft attacks ($p$) on heavy upright actions can fail to cross `onset_threshold = 0.5`.

Your audio data allows computing the **Receiver Operating Characteristic (ROC)** curve to find the exact optimal decision thresholds for your piano.

---

## 5. Recommended Audio Recording Protocol

If you choose to record your piano, following this standardized format will provide the highest possible data utility:

### Recording Setup
* **Microphone Position**: Place your laptop / microphone in the **exact location** where you normally keep it when practicing (e.g., on the piano music stand or desk next to you).
* **Audio Format**: Uncompressed WAV (`.wav`), $44.1\text{ kHz}$ or $48\text{ kHz}$, 16-bit or 24-bit, Mono or Stereo.
* **Recording Level**: Set input gain so that the loudest fortissimo notes peak around $-6\text{ dB}$ (avoid digital clipping / redlining).

### Data Collection Checklist

| Recording Item | Performance Instructions | Purpose |
| :--- | :--- | :--- |
| **1. Room Ambient Noise** | Record 10 seconds of complete silence in the room (no playing). | Profiles room noise floor, AC/fan hum, and mic hiss for the noise gate. |
| **2. 61-Key Register Survey (Single Notes)** | Play representative keys across all 5 octaves of the 61-key keyboard from leftmost key $C_2$ (Key #1, MIDI 36, $65.41\text{ Hz}$) through Middle $C_4$ (Key #25, MIDI 60) up to rightmost key $C_7$ (Key #61, MIDI 96, $2093\text{ Hz}$). Hold each note for ~2 seconds. | Generates individual spectral templates, inharmonicity coefficients, and fundamental frequencies across the full 61-key range. |
| **3. Dynamic Variations** | Strike Middle $C_4$ (Key #25) and representative keys ($C_2, C_3, C_4, C_5, C_6$) at Soft ($p$), Medium ($mf$), and Loud ($f$) dynamic levels. | Calibrates the RMS onset attack derivative across dynamic ranges. |
| **4. Two-Note Intervals (Dyads)** | Play common intervals around Middle C ($C_4$):<br>• Octave: $C_3 + C_4$<br>• Fifth: $C_4 + G_4$<br>• Major Third: $C_4 + E_4$ | Tests harmonic separation and verifies that octave partial collisions do not suppress root detection. |
| **5. Standard Chords (Triads & 4-Note)** | Play clean block chords:<br>• $C$ Major ($C_4 - E_4 - G_4$)<br>• $G$ Major ($G_3 - B_3 - D_4$)<br>• $A$ Minor ($A_3 - C_4 - E_4$)<br>• $F$ Major ($F_3 - A_3 - C_4$) | Serves as the primary benchmark dataset for polyphonic chord transcription. |
| **6. The Yousician Groove Motif** | Play the first 4 measures of the preloaded app song (Treble $B_4/D_5$ with Bass $B_2/G_2/D_3$). | Direct end-to-end regression test for the existing song library. |

---

## 6. Proposed Architectural Roadmap for Implementation

When ready to implement, the optimal architecture combines the low latency of DSP with the robustness of modern web standards:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TARGET DUAL-ENGINE ARCHITECTURE                      │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                     Audio Input (getUserMedia)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [AudioWorklet Thread]            [Web Worker Thread]
    Score-Informed Fast Verifier        Polyphonic AMT Engine
     (Inharmonic Harmonic Sum)          (Spotify Basic Pitch ONNX)
                 │                               │
                 │ Low Latency (<10ms)           │ General Polyphony (~30ms)
                 │ Target Note / Chord Check     │ Full Keyboard Transcription
                 │                               │ & Wrong-Note Discovery
                 └───────────────┬───────────────┘
                                 │ Dispatched Note Events
                                 ▼
                    [Main UI / Game Thread]
                 ┌───────────────────────────────┐
                 │ • NoteEvaluator (Multi-Note)  │
                 │ • VisualizerRenderer (60 FPS) │
                 │ • 3D Piano Keyboard           │
                 └───────────────────────────────┘
```

### Phase 1: Evaluator & Game Engine Multi-Note Refactoring
* Update [`NoteEvaluator`](file:///Users/ojus/official/piano-app/js/engine/evaluator.js) to support **Chord Targets** in Wait Mode:
  * Instead of `currentWaitNote` holding a single note, it holds a `currentWaitChord` set (e.g. `{47, 71}`).
  * The engine unfreezes only when all notes in the active chord cluster are confirmed struck within a brief coincidence window (~100ms).
* Update Flow Mode evaluation to accept an array of simultaneous played notes `playedMidiArray` rather than a single integer.

### Phase 2: Audio Thread Offloading (AudioWorklet)
* Move audio capture and spectral processing off the browser main thread into an **`AudioWorkletProcessor`**.
* This eliminates audio dropouts and guarantees that heavy DSP will never drop frames on the 60 FPS Canvas visualizer.

### Phase 3: The Hybrid Polyphonic Pitch Engine
* **Primary Fast Path (Score-Informed Harmonic Verifier)**:
  * In Flow and Wait modes, test the expected score notes using inharmonic harmonic summation. Delivers instantaneous (<10ms) feedback for correct notes and chords.
* **Secondary Path (Basic Pitch ONNX Web / Web Worker)**:
  * Runs asynchronously in a background Web Worker.
  * Periodically verifies full-keyboard activity, accurately catching wrong notes, unexpected chord voicings, or free-play improvisation without sheet music.

### Phase 4: Custom Calibration Suite Integration
* Add an in-app "Calibrate Piano" modal:
  * Prompts the user to play 5 notes across the keyboard and 5 seconds of silence.
  * Automatically calculates local noise threshold, microphone EQ curve, and string inharmonicity factor.

---

## 7. Summary & Recommendations

1. **Polyphony requires departing from pure YIN**: YIN is fundamentally a monophonic algorithm. For chords and two-handed piano playing, it must be augmented with score-informed harmonic analysis or replaced with a polyphonic engine like Basic Pitch.
2. **Score-Informed Hypothesis Testing is the secret weapon**: Because the app knows the sheet music in advance, testing for expected notes is thousands of times faster and more accurate than unconstrained transcription.
3. **Your audio data is highly valuable**: If you provide audio recordings (even just an ambient noise sample, a chromatic scale, and a few chords), we can benchmark existing vs. new algorithms quantitatively, tune detection thresholds specifically to your instrument and room, and eliminate octave errors in the bass.

*(No changes have been made to the application codebase; all existing files remain intact).*
