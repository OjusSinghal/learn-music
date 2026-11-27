# DSP & Acoustic Calibration Reference (61-Key Piano & High-G Ukulele)

---

## PART A — 61-Key Piano Acoustic Profile & 6-Stage DSP (`js/audio/polyphonic_detector.js`)

### 1. Empirical Acoustic Characteristics of the User's 61-Key Keyboard
Measured from the 28 lossless `48,000 Hz` 16-bit mono WAV files in `/Users/ojus/official/piano-app/audio_dataset/samples/`:

1. **Ambient Room Floor (`step_01_silence.wav`)**:
   - Median frame RMS: `0.001007`, 90th-percentile RMS: `0.005095`, default `recommendedRmsGate`: `0.00841`.
2. **Missing Fundamental in Deep Bass (`C2–C3`, `MIDI 36..48`)**:
   - `C2 (36)`: `[h1..h6] = [0.00, 0.00, 0.32, 0.41, 0.19, 0.81]` (`0%` energy at `65.41 Hz`).
   - `G2 (43)`: `[0.00, 0.36, 0.39, 0.40, 0.15, 0.73]`; `B2 (47)`: `[0.00, 0.83, 0.46, 0.10, 0.28, 0.06]`; `C3 (48)`: `[0.00, 0.91, 0.27, 0.15, 0.14, 0.10]` (plus strong $h_7$ at `915.7 Hz`).
3. **Sample-Layer Boundary (`D4 [62]` → `E4 [64]`)**:
   - `E3 (52)–D4 (62)` carry strong $h_1$ (`0.20–0.73`) and $h_2$ (`0.66–0.89`); `E4 (64)–C7 (96)` carry `90%–100%` of energy in $h_1$.
4. **Tuning & Inharmonicity ($B$)**: Concert `A4 = 440.0 Hz`, $f_h = h f_0 \sqrt{1 + B h^2}$ (`B ≈ 0.00010–0.00060`).

### 2. Piano 6-Stage Polyphonic Pipeline
1. **Off-Main-Thread Capture (`piano_worklet.js`, `mic.js`)**: Raw PCM (no echo cancellation/noise suppression/AGC), `52 Hz` Butterworth HPF (`Q=0.7`), `4096`-sample ring buffer dispatched every `1024` samples (`21.3 ms` @ `48 kHz`) via zero-gain sink; automatic `AnalyserNode` fallback.
2. **8192-Point Blackman-Harris FFT & Noise Subtraction**: `-92 dB` sidelobe window, `5.86 Hz/bin`, `overSub ≈ 1.8` subtraction against calibrated `25 Hz` room noise bands.
3. **Local Peak Extraction & Physical Acoustic Gate**:
   - `MIDI >= 52`: `hasH1Peak == true` AND `completeness >= 0.55`.
   - `MIDI <= 51`: `completeness >= 0.52` AND `>= 2` odd harmonics in `{h1, h3, h5, h7}` (`> 0.030 * maxClean`).
   - **Major Triad Sub-Octave Trap**: Suppresses bass `m <= 51` when `(m+12, m+16, m+19)` are all candidates unless `hasH1` or `hasH7` (or score-expected).
4. **Multiplicative KL-NMF (20 iters)** over sparse L1-normalized calibrated columns (`1.55×` prior for `expectedMidis`).
5. **Overtone Excess & Temporal Stability**: `h2/h3 >= 2.35` (`1.95` expected) on bass octaves, upper-harmonic suppression (`+19,+24,+28,+31,+34,+36`), 2-frame blind confirmation (1-frame expected+attack), `95 ms` cooldown, 3-frame sustain bridge.
6. **Anti-Leakage Benchmark (`scripts/calibrate_and_benchmark.py`)**: Strict LOOCV on single-note anchors (`steps 02–20`) + zero-shot chords (`steps 23–28`): **`94.74%` Overall F1**, **`100.0%` Recall**, **`100.0%` Polyphonic Chord F1 (`6/6` exact)**.

---

## PART B — Nylon-String Ukulele Acoustic Profile & 7-Stage DSP (`js/audio/ukulele_detector.js`)

*(Full physics study & literature comparison in `/Users/ojus/official/piano-app/docs/UKULELE_ACOUSTIC_RESEARCH.md`.)*

### 3. Acoustic Physics of Standard High-G Ukulele (`G4–C4–E4–A4`, MIDI `67, 60, 64, 69`, Frets `0..12`)
1. **Coupled Wooden Soundbox Resonances**:
   - Helmholtz soundhole air mode **$A_0 \approx 260\text{–}310\text{ Hz}$** (`C4–D#4`) + Main top-plate mode **$T(1,1) \approx 450\text{–}550\text{ Hz}$** (`A4–C#5`), strongly shaping `C4–D4` fundamentals and their $h_2$.
2. **Nylon/Fluorocarbon String Dynamics**:
   - **`10–25 ms` broadband pluck click** (`1.2–6.5 kHz`), steep viscoelastic harmonic damping (`85–95%` of energy in $h_1..h_5$), short high-fret decay (`0.35–0.65 s`), **`+5..+22 cents` initial sharp tension bend** on hard plucks, and fret-dependent inharmonicity $B \propto L_{\text{eff}}^{-2}$ (quadrupling by fret 12).
3. **Re-Entrant Tuning & Unison String Beating**:
   - High-G has **no playable notes below `C4 (261.63 Hz)`** — a **`180 Hz` HPF** (`mic.js` + `ukulele_detector.js`) strips room rumble, speech fundamentals, and sub-C4 phantom roots cleanly (`135 Hz` in `tuning: "low-g"` for `G3 = 196 Hz`, which also enables an odd-harmonic guard on `MIDI 55..59`).
   - **6 of 8 essential chords (`Am, F, G, Dm, Em, D`) double one pitch across two separate strings** (`A4+A4` or `G4+G4`). The doubled note produces `~1.7×–2.0×` NMF activation plus `2–8¢` beating dips, which causes naive `maxAct` thresholds to drop single-string chord voices (`C4`, `D4`, `F4`, `B4`).
4. **Staggered Strum Sweeps (`20–85 ms`)**: Down-strums (`G→C→E→A`), up-strums (`A→E→C→G`), and thumb arpeggios sweep across 4 strings sequentially; without aggregation, chords fragment into 3–4 separate blips.

### 4. Ukulele 7-Stage Polyphonic Pipeline (`js/audio/ukulele_detector.js`)
1. **Stage 1 — Tuning-Adaptive HPF & RMS Gate**: `180 Hz` High-G (`MIDI 60..84`) or `135 Hz` Low-G (`MIDI 55..84`), dynamically scaled by sensitivity (`0.05..1.0`).
2. **Stage 2 — 8192-Point Blackman-Harris FFT & Noise Subtraction**: `4096` win / `1024` hop (`21.3 ms`), `-92 dB` sidelobes, `1.75×` room noise subtraction, `8.5 kHz` upper cutoff.
3. **Stage 3 — Spectral Flatness (SFM) & HNR Pluck-Click Gate**: Rejects percussive broadband pluck transients / muted chucks (`SFM > 0.44 && peakEnergyRatio < 0.24`).
4. **Stage 4 — Asymmetric `[-30¢, +40¢]` Peak Gate & Sub-Cent Chromatic Tuner**: Absorbs hard-pluck sharp bends and computes parabolic sub-bin pitch across `180..1150 Hz` (`135..1150 Hz` Low-G), returning `{ dominantFreq, dominantMidi, centsOff, tunerNote: { name, midi, targetFreq, measuredFreq, centsOff, inTune, nearestOpenString } }`.
5. **Stage 5 — Nylon KL-NMF (22 iters), Unison-Resilient Scaling & Template-Residual Octave Verifier**:
   - Caps normalization reference at `refAct = min(maxAct, secondAct * 1.45)` when polyphonic so unison strings (`A4+A4`, `G4+G4`) never suppress single-string tones.
   - Compares measured `h2/h1` against calibrated single-string template ratios (`>= 1.42×` excess required for genuine octaves like `C4+C5` in `C Major`).
   - Enforces physical 4-string voice cap (`maxVoices = 4`).
6. **Stage 6 — Adaptive `98 ms` Strum-Aggregation Window & 4-Frame Sustain Bridge**:
   - **Melody Bypass (`0 ms` buffer)**: Emits immediately (`~26.5 ms` mean latency) when single-note picking (`expectedMidis.length === 1` or `isChordExpected === false`).
   - **Chord Unification (`98 ms`)**: Accumulates staggered string confirmations and early-flushes as soon as all `expectedMidis` or 4 distinct voices arrive, emitting ONE unified `onsetNotes` / `onsetMidis` chord event!
7. **Stage 7 — Score-Informed Priors & Chord Symbol Classifier**: `1.55×` NMF prior + 1-frame attack confirmation + `identifyUkuleleChord(activeMidis)`.

### 5. Ukulele Synthetic 5-Model Ablation & Real-WAV Calibration (`scripts/calibrate_ukulele.py`)
Run `python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py --synthetic-benchmark` (strict LOOCV on 14 single-note anchors `steps 02–15`, zero-shot on silence, dynamics, dyads, unisons & 8 strummed chords):
- **Single-Frame Monophonic YIN**: Overall `F1=51.95%`, Chords/Dyads `F1=19.05%` (`1/11` exact).
- **Raw FFT Peak Picking**: Overall `F1=75.19%`, `Prec=60.24%`, `OctErr=33` (`6/28` exact).
- **Naive Uncalibrated NMF (No Strum Agg)**: Overall `F1=71.79%`, Chords/Dyads `Rec=38.71%` (`F1=55.81%`).
- **Proposed Ukulele KL-NMF + Strum-Agg (Blind LOOCV)**: **Overall `F1=97.09%`, `Prec=94.34%`, `Rec=100.00%`** (`25/28` exact) | Single-Note LOOCV `F1=96.55%` (`13/14`) | Strummed Chords & Dyads `F1=96.88%`, `Rec=100.00%` | Silence FP `0` | Chord Symbols `8/8 (100%)` | Unified 1-Burst Strums `8/8` | Tuner MAE `0.82¢` | Latency: Single `26.5 ms`, Strum `142.7 ms`.
- **Score-Informed Hybrid Ukulele Engine**: **Overall `F1=100.00%`, `Prec=100.00%`, `Rec=100.00%`, Exact `28/28 (100.0%)`, `OctErr=0`**.

### 6. 28-Step Ukulele WAV Data Collection (`js/trainer/ukulele_curriculum.js` → `audio_dataset/ukulele/samples/`)
- Step 1: Room Silence (`3.0s`) · Steps 2–5: Open `G4, C4, E4, A4` · Steps 6–15: 10 fret anchors up to fret 12 (`D4..A5`) · Steps 16–17: Soft pluck vs hard forte strum · Steps 18–20: `C4+E4`, `E4+G4`, Unison `A4+A4` · Steps 21–28: `C, Am, F, G, G7` (up-strum), `Dm, Em` (slow arpeggio), `D`.
- Clicking **`Recalibrate Ukulele Detector`** (or running `python3 scripts/calibrate_ukulele.py`) extracts real templates, inharmonicity $B$, and room noise floor from `audio_dataset/ukulele/samples/`, runs zero-leakage LOOCV, writes `audio_dataset/ukulele/calibrated_profile.json`, and updates `js/audio/ukulele_profile.js` (`calibrated: true`) for live hot-reload.
