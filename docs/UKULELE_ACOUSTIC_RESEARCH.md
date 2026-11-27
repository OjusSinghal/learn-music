# Ukulele Acoustic Physics, Polyphonic DSP Research & Calibration Protocol

This research document establishes the acoustic foundations, polyphonic detection architecture, comparative ablation benchmarks, and 28-step WAV data collection protocol for the **Ukulele learning section** of the Yousician Piano & Ukulele app. It targets **Standard Re-Entrant High-G Ukulele (`G4–C4–E4–A4`, MIDI `67, 60, 64, 69`, frets `0..12` spanning `C4 [60]` to `A5 [81]` / `C6 [84]`)** with built-in extensibility for **Linear Low-G (`G3 = 55`)**.

---

## 1. Acoustic Physics: Nylon-String Ukulele vs. 61-Key Piano

Directly reusing a piano pitch/chord detector on an acoustic ukulele degrades accuracy because the two instruments live in fundamentally different physical regimes:

| Acoustic Property | 61-Key Piano (`C2–C7`) | Standard High-G Ukulele (`G4–C4–E4–A4`) | DSP Design Implication |
| :--- | :--- | :--- | :--- |
| **String Material & Tension** | High-tension steel (`~700–900 N`), felt hammer strike | Low-tension nylon / Nylgut / fluorocarbon (`~30–55 N`), finger/thumb/pick pluck | Lower open-string stiffness ($B$), higher initial pluck pitch-bend, much shorter sustain |
| **Pitch Span & Lowest Fundamental** | `C2 (65.41 Hz)` – `C7 (2093 Hz)`; deep bass `C2–C3` has **0% $h_1$ energy** | **High-G**: `C4 (261.63 Hz)` – `A5 (880 Hz)` / `C6 (1046.5 Hz)`. **Low-G**: `G3 (196 Hz)` | In High-G, **every note sits at/above body resonance $A_0$** and has a strong $h_1$ peak; `180 Hz` HPF strips room rumble & sub-C4 ghosts (`135 Hz` for Low-G) |
| **Pluck / Attack Transient** | `5–15 ms` felt hammer thump | **`10–25 ms` broadband nail/flesh scrape (`1.2–6.5 kHz`)** + fret buzz | Requires **Spectral Flatness (Wiener Entropy) & HNR Pluck-Transient Gate** to prevent click frames from triggering high-fret false positives |
| **Harmonic Spectrum & Decay** | Long sustain (`3–8 s`), bright steel partials up to $h_{10}$ | **Steep viscoelastic damping** ($\tau_h \approx \tau_1 / h^{1.4..1.8}$); 85–95% of energy in **$h_1..h_5$**; fast high-fret decay (`0.35–0.65 s`) | Use **8-harmonic** nylon templates (`MIDI 55..84`), upper FFT cap `8.5 kHz`, and `21.3 ms` hop cadence |
| **Soundbox Resonances** | Speaker / soundboard broad radiation | **Coupled two-resonator wooden body**: Helmholtz soundhole **$A_0 \approx 260\text{–}310\text{ Hz}$** (`C4–D#4`) + Main top-plate **$T(1,1) \approx 450\text{–}550\text{ Hz}$** (`A4–C#5`) | Strongly boosts `C4–D4` fundamentals and `C4–D4`'s $h_2$ (`523–587 Hz`)! Per-note acoustic calibration captures each instrument's exact $A_0$ and $T(1,1)$ signature |
| **Initial Tension Pitch-Bend** | Negligible (`< 2 cents`) | **`+5 to +22 cents` sharp bend** on hard plucks/strums, relaxing over `~30–65 ms` | Harmonic peak windows must be **asymmetric (`-30 cents` to `+40 cents`)** so hard plucks never clip out of bin windows |
| **Chord Onset Synchrony** | Simultaneous (`5–18 ms` key depression) | **Staggered sweep (`20–85 ms`)** across 4 strings (down-strum `G→C→E→A`, up-strum `A→E→C→G`, slow thumb roll) | Without a **Strum-Aggregation Window (`~85–110 ms`)**, chords fragment into 3–4 separate single-note blips! |
| **Unison String Beating** | 1 key = 1 pitch (piano unisons are inside one key) | **6 of 8 core chords (`Am, F, G, Dm, Em, D`) double one pitch across TWO separate strings** (`A4+A4` or `G4+G4`)! | Fretted vs. open unison strings differ by `2–8 cents` (`~0.5–2 Hz` beat), causing ~2× energy on the doubled note + periodic $h_1/h_2$ phase dips |

### 1.1 Deep Dive: Re-Entrant Tuning (`G4–C4–E4–A4`) & Unison String Beating

Because the physically topmost string (`G4 = 67`, `392.00 Hz`) is tuned **above** the inner `C4 (60)` and `E4 (64)` strings:

1. **Zero Sub-C4 Phantom Roots**: Unlike piano (where `C4+E4+G4` can falsely imply a phantom `C3` sub-octave), High-G ukulele has **zero playable notes below `C4 (261.63 Hz)`**. Applying a **`180 Hz` high-pass cutoff** (in both the Web Audio `BiquadFilterNode` and the FFT bin floor `minBin`) eliminates 50/60 Hz mains hum, HVAC rumble, vocal fundamentals (`85–165 Hz`), and sub-octave hallucinations in one stroke.
2. **Low-G Extensibility (`G3 = 55`, `196.00 Hz`)**: When a player switches to `tuning: 'low-g'`, `G3` drops below the Helmholtz $A_0$ (`~260–310 Hz`) resonance, where soundbox radiation efficiency rolls off at `~12 dB/oct`. Accordingly, `UkulelePolyphonicDetector` automatically lowers the HPF floor to `135 Hz`, widens the pitch dictionary to `MIDI 55..84`, and enables an odd-harmonic + major-triad sub-octave guard specifically for `MIDI 55..59`.
3. **Why Unison Beating Breaks Naive Chord Detectors**:
   Look at the sounding pitches of the 8 foundational beginner ukulele chords on High-G:
   - **`C [0,0,0,3]`**: `G4, C4, E4, C5` → 4 distinct pitches (`C4 + C5` octave pair!).
   - **`G7 [0,2,1,2]`**: `G4, D4, F4, B4` → 4 distinct pitches.
   - **`Am [2,0,0,0]`**: `A4, C4, E4, A4` → **Unison `A4 + A4`** (G-string fret 2 + open A-string).
   - **`F [2,0,1,0]`**: `A4, C4, F4, A4` → **Unison `A4 + A4`**.
   - **`Dm [2,2,1,0]`**: `A4, D4, F4, A4` → **Unison `A4 + A4`**.
   - **`D [2,2,2,0]`**: `A4, D4, F#4, A4` → **Unison `A4 + A4`**.
   - **`G [0,2,3,2]`**: `G4, D4, G4, B4` → **Unison `G4 + G4`** (open G-string + E-string fret 3).
   - **`Em [0,4,3,2]`**: `G4, E4, G4, B4` → **Unison `G4 + G4`**.

   When a fretted string (`G-string fret 2 = A4`) rings simultaneously with an open string (`open A4`), fret-pressure intonation typically separates them by `2–8 cents`. That produces two critical DSP effects:
   - The doubled note carries **~1.7×–2.0× the NMF activation** of single-string chord voices (`C4`, `D4`, `F4`, `B4`). Normalizing thresholds purely against `maxAct` causes single-string notes to be dropped!
   - Beating at $\Delta f$ on $h_1$ vs. $2\Delta f$ on $h_2$ causes momentary destructive dips in $h_1$ while $h_2$ sums constructively, briefly elevating $h_2 / h_1$ and risking false `+12` octave ghosts (`A5` or `G5`) unless guarded by **2-frame temporal stability** and **template-residual octave excess verification**.

### 1.2 Fret-Dependent Inharmonicity ($B$)

Inharmonic partial frequencies follow $f_h = h f_0 \sqrt{1 + B h^2}$ where $B = \frac{\pi^3 E d^4}{64 T L_{\text{eff}}^2}$. While nylon's low Young's modulus ($E \approx 2\text{–}4\text{ GPa}$) keeps open-string inharmonicity small ($B \approx 0.00006\text{–}0.00014$), fretting at fret $n$ shortens the vibrating length $L_{\text{eff}} = L \cdot 2^{-n/12}$, so **$B$ quadruples by fret 12** ($B \propto 2^{n/6}$, reaching `~0.00035–0.00062` at `F5–C6`). Our calibration extractor (`scripts/calibrate_ukulele.py`) grid-searches $B \in [0, 0.00070]$ per anchor step and interpolates across frets `0..12`.

---

## 2. Comparative Research of Ukulele Detection Methods

We evaluated five candidate DSP architectures against the full 28-step ukulele protocol:

| Method | Mechanism | Single Notes | Strummed Chords & Unisons | Octave / Fret Specificity | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **(A) Single-Frame YIN / Autocorrelation** | Time-domain CMNDF lag picker (`pitch.js` style) | Excellent (`100%` solo on clean high-G) | **Fails completely** (`Rec = 12.9%`, `Exact = 9.1%`) — emits max 1 note, jumps to interference lags on chords | Good solo, unusable polyphonic | Rejected for gameplay; poor chord support |
| **(B) Raw FFT Peak Picking** | Local magnitude maxima mapped to MIDI `60..84` | Poor precision (`58.3%`) — $h_2$ triggers `+12` octave ghosts on every low/mid note (`33` octave errors!) | `100%` recall, `60.8%` precision, `9.1%` exact match | Suffers severe harmonic ghosting | Rejected — unacceptable false positives |
| **(C) Chromagram / Pitch-Class Profile (PCP)** | Folds spectrum into 12 pitch classes (`C..B`) and matches chord templates | **Cannot verify exact octave or fret** (confuses `C4` vs `C5`, open `A4` vs fret 12 `A5`) | Strong for chord *symbol* classification (`C, Am, F, G`) | **None** (octave-blind) | **Adopted ONLY as auxiliary chord-symbol classifier (`identifyUkuleleChord`)**, never primary note verifier |
| **(D) Naive Uncalibrated KL-NMF** | Generic $1/h$ rolloff, no pluck gate, no overtone excess check, no strum aggregation | Strong (`100%` solo) | **Fragments staggered strums** (`Rec = 38.7%`, `Exact = 18.2%` on first onset — emits only 1st swept string!) | Loses quiet single strings beside unison pairs | Insufficient without ukulele acoustics + strum aggregation |
| **(E) Proposed 7-Stage Ukulele Pipeline** | 8192-pt BH FFT + `180 Hz` HPF + Noise Sub + Pluck-Flatness Gate + Nylon KL-NMF + Unison Scaling + Template-Excess Verifier + **`98 ms` Strum-Aggregation Window** + Score-Informed Priors | **`96.55%` F1** blind LOOCV / **`100.0%` F1** hybrid (`0.82¢` tuner MAE, `26.5 ms` latency) | **`96.88%` F1** blind zero-shot / **`100.0%` F1** hybrid; **`8/8 (100%)` unified single-burst strums & chord symbols** | Exact pitch, octave & sub-cent tuner readout | **Selected Production Architecture** (`js/audio/ukulele_detector.js`) |

---

## 3. Production 7-Stage Ukulele DSP Architecture (`js/audio/ukulele_detector.js`)

1. **Stage 1 — Tuning-Adaptive HPF & RMS Gate**:
   - High-G (`60..84`): `180 Hz` spectral bin floor (`minBin`) + calibrated RMS gate (scaled dynamically by UI sensitivity `0.05..1.0`).
   - Low-G (`55..84`): `135 Hz` floor + sub-$A_0$ odd-harmonic/triad guard for `MIDI 55..59`.
2. **Stage 2 — Zero-Allocation 8192-Point Blackman-Harris FFT & Room Noise Subtraction**:
   - `4096`-sample sliding window (`85.3 ms` @ `48 kHz`), `1024`-sample hop (`21.3 ms`), `-92 dB` 4-term Blackman-Harris window, zero-padded to `8192` (`5.86 Hz/bin`).
   - Subtracts `1.75 × noisePerBin[k]` calibrated from `uku_step_01_silence.wav`; truncates above `8.5 kHz` to strip nail hiss.
3. **Stage 3 — Pluck-Transient / Spectral Flatness (Wiener Entropy) & HNR Gate**:
   - Computes Spectral Flatness Measure (`SFM`) over `220–4500 Hz` and Peak Energy Ratio (`HNR` proxy).
   - Frames with `SFM > 0.44 && peakEnergyRatio < 0.24` are classified as broadband percussive pluck clicks, muted "chucks", or body taps and gated cleanly without triggering phantom high-fret notes.
4. **Stage 4 — Asymmetric Pluck-Bend Local Peak Gate & Sub-Cent Tuner**:
   - Extracts true local spectral maxima (`peakOnlySpec`) and searches **`[-30 cents, +40 cents]`** around each harmonic $f_h$ to absorb `+5..22 cent` hard-pluck sharp bends.
   - Dedicated chromatic/open-string tuner estimator (`_estimateTuner`) applies parabolic sub-bin interpolation across `180..1150 Hz` (`135..1150 Hz` Low-G), returning `{ dominantFreq, dominantMidi, centsOff, tunerNote: { name, midi, targetFreq, measuredFreq, centsOff, inTune, nearestOpenString } }` even when a string is up to `±48 cents` out of tune.
5. **Stage 5 — Nylon-Calibrated KL-NMF, Unison Scaling & Template-Residual Overtone Verifier**:
   - 22 multiplicative KL-divergence iterations over sparse `L1`-normalized Gaussian-lobe (`sigma = 1.25` bins) basis columns (`MIDI 60..84` or `55..84`).
   - **Unison-Resilient Reference Scaling**: When polyphony is detected (`secondAct >= 0.24 * maxAct`), caps the normalization reference at `refAct = min(maxAct, secondAct * 1.45)` so a 2× unison string (`A4+A4` in `F/Am/Dm/D`, `G4+G4` in `G/Em`) never suppresses single-string chord tones (`C4`, `D4`, `F4`, `B4`).
   - **Template-Residual Octave Excess Verifier**: Compares measured $h_2/h_1$ against the calibrated single-string template ratio $w_{\text{low}}[1]/w_{\text{low}}[0]$. Genuine octave pairs (`C4+C5` in `C Major [0,0,0,3]`) exhibit large excess (`>= 1.42×`) and strong activation, whereas solo `C4` or unison-beating overtones are rejected.
   - **Physical 4-String Cap**: Caps active/onset voices at `maxVoices = 4` (physical string limit of the ukulele).
6. **Stage 6 — Adaptive Strum-Aggregation Window (`98 ms`) & Sustain Bridge**:
   - **Single-Note Melody Bypass (`0 ms` buffer delay)**: When `expectedMidis.length === 1` or `isChordExpected === false`, emits confirmed notes immediately (`~26.5 ms` mean latency).
   - **Unified Chord Buffering (`98 ms` window)**: During strums, accumulates staggered string confirmations (`20–85 ms` down-strums, up-strums, and slow thumb rolls) and **early-flushes** the moment either (a) all `expectedMidis` are captured or (b) 4 distinct strings arrive, emitting ONE unified `onsetMidis` chord event!
   - **4-Frame (`~85 ms`) Sustain Bridge**: Smooths unison-beating amplitude dips so held chords remain rock-steady.
7. **Stage 7 — Score-Informed Hybrid Priors & Auxiliary Chord Symbol Classifier**:
   - Expected score pitches receive a mild `1.55×` NMF initialization prior, 1-frame attack confirmation, and targeted post-NMF threshold (`0.12` expected vs. `0.36` unexpected distractor), while `identifyUkuleleChord(activeMidis)` reports real-time chord labels (`C`, `Am`, `F`, `G`, `G7`, `Dm`, `Em`, `D`, etc.).

---

## 4. Quantitative Benchmark & Ablation Results (`scripts/calibrate_ukulele.py`)

Evaluated via `python3 scripts/calibrate_ukulele.py --synthetic-benchmark` using an **out-of-distribution nylon-ukulele physical synthesizer** ($A_0 = 298\text{ Hz}$, $T(1,1) = 518\text{ Hz}$, viscoelastic harmonic decay, `16 ms` pluck click, `+3..+18¢` dynamic pitch-bend, `39–69 ms` down/up/arpeggio strum stagger, `+4.5¢` unison string detuning, pink room noise + 60 Hz rumble):

- **Zero-Leakage Protocol**: All 14 single-note anchors (`steps 02–15`) are tested under strict **Leave-One-Out Cross-Validation (LOOCV)** (each pitch's own template is excluded and interpolated from neighboring anchors). Silence (`step 01`), Touch Dynamics (`steps 16–17`), Dyads & Unison (`steps 18–20`), and all 8 Strummed Chords (`steps 21–28`) are **100% unseen zero-shot test clips**.
- **Strict Streaming Metric**: For every chord clip, models are scored strictly on their **first emitted onset event** (verifying that staggered 4-string strums unify into a single complete chord rather than fragmented notes).

### 4.1 Overall Benchmark (All 28 Curriculum Steps)

| Detection Model | Note F1 (%) | Precision (%) | Recall (%) | Exact Step Match | Octave Errors |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Single-Frame Monophonic YIN** | `51.95%` | `74.07%` | `40.00%` | `17/28` (`60.7%`) | `0` |
| **2. Raw FFT Peak Picking** | `75.19%` | `60.24%` | `100.00%` | `6/28` (`21.4%`) | `33` |
| **3. Naive Uncalibrated NMF (No Strum Agg)** | `71.79%` | `100.00%` | `56.00%` | `18/28` (`64.3%`) | `0` |
| **4. Proposed Ukulele KL-NMF + Strum-Agg (Blind LOOCV)** | **`97.09%`** | **`94.34%`** | **`100.00%`** | **`25/28` (`89.3%`)** | `2` |
| **5. Score-Informed Hybrid Ukulele Engine** | **`100.00%`** | **`100.00%`** | **`100.00%`** | **`28/28` (`100.0%`)** | **`0`** |

### 4.2 Slice Breakdown: Single-Note Anchors (LOOCV) vs. Strummed Chords & Dyads (Zero-Shot)

| Detection Model | Single-Note LOOCV F1 (`steps 02–15`) | Single-Note Exact | Strummed Chords & Dyads F1 (`steps 18–28`) | Chords & Dyads Exact |
| :--- | :---: | :---: | :---: | :---: |
| **1. Single-Frame Monophonic YIN** | `100.00%` | `14/14` (`100.0%`) | `19.05%` | `1/11` (`9.1%`) |
| **2. Raw FFT Peak Picking** | `73.68%` | `4/14` (`28.6%`) | `75.61%` | `1/11` (`9.1%`) |
| **3. Naive Uncalibrated NMF (No Strum Agg)** | `100.00%` | `14/14` (`100.0%`) | `55.81%` | `2/11` (`18.2%`) |
| **4. Proposed Ukulele KL-NMF + Strum-Agg** | **`96.55%`** | **`13/14` (`92.9%`)** | **`96.88%`** | **`9/11` (`81.8%`)** |
| **5. Score-Informed Hybrid Ukulele Engine** | **`100.00%`** | **`14/14` (`100.0%`)** | **`100.00%`** | **`11/11` (`100.0%`)** |

### 4.3 Ukulele-Specific Telemetry & Error Analysis

- **Silence False Positives (`uku_step_01_silence`)**: **`0`** (both Blind and Hybrid).
- **Chord Symbol Accuracy (`C, Am, F, G, G7, Dm, Em, D`)**: **`8/8 (100.0%)`** even in blind mode.
- **Unified Single-Event Strums**: **`8/8 (100.0%)`** — every down-strum (`C, Am, F, G, Dm, D`), up-strum (`G7`), and `69 ms` slow arpeggio roll (`Em`) emitted as ONE unified chord event.
- **Tuner Precision (14 single-note anchors)**: **`0.82 cents` MAE** (and verified `0.1 cent` accuracy in macOS `jsc` test: `+6.4¢` measured vs. `+6.5¢` ground truth on open `A4`).
- **Mean Onset Latency**: Single-note melody **`26.5 ms`** | Unified 4-string strum **`142.7 ms`** (includes physical `40–70 ms` hand sweep across 4 strings).
- **Transparent Blind-Mode Edge Cases**:
  1. `uku_step_03_open_c4` (Blind LOOCV only): When `C4` is held out during LOOCV, extrapolating downward from `D4` (which sits squarely on $A_0$) slightly shifts expected `h1/h2`, causing one brief `F4` leak; once `C4` is in the calibrated dictionary (verified on `uku_step_16_dyn_soft`), `C4` achieves `100%` exact accuracy.
  2. `uku_step_22_chord_am` & `uku_step_27_chord_em` (Blind only): Unison beating (`A4+A4`, `G4+G4`) occasionally boosts `h2/h1` during destructive $h_1$ phase, adding one `+12` octave residual (`A5`/`G5`), though pitch-class chord ID still scores `100%` (`Am`, `Em`) and Score-Informed Hybrid scores **`100.0%`** exact (`28/28`).

---

## 5. 28-Step WAV Data Collection & Calibration Protocol (`audio_dataset/ukulele/samples/`)

The default `CALIBRATED_UKULELE_PROFILE` (`js/audio/ukulele_profile.js`, `calibrated: false`) works out of the box using our coupled physical nylon-body model. Because every ukulele's wood, size (soprano/concert/tenor), strings (Aquila Nylgut vs. fluorocarbon), and room microphone differ significantly, the **28-step guided protocol** (`js/trainer/ukulele_curriculum.js`) personalizes the detector directly to the user's instrument:

### 5.1 Recording Setup Best Practices
1. **Tune first** using the live G-C-E-A tuner readout (`dominantFreq` / `tunerNote`, aim within `±5 cents` of `G4=392.00 Hz`, `C4=261.63 Hz`, `E4=329.63 Hz`, `A4=440.00 Hz`).
2. **Mic placement**: Position the ukulele `30–50 cm` from the laptop/phone microphone, angled slightly toward the **12th-fret / soundhole junction** (pointing straight into the soundhole exaggerates boomy $A_0$ bass).
3. **Disable browser speech DSP**: `PianoMicrophone` already requests `echoCancellation: false, noiseSuppression: false, autoGainControl: false`. Record in a reasonably quiet room (`48 kHz`, 16-bit mono PCM WAV).

### 5.2 The 28-Step Recording Curriculum (`UKULELE_TRAINING_CURRICULUM`)

| Steps | Category | Targets Covered | Acoustic Purpose |
| :--- | :--- | :--- | :--- |
| **Step 1** | `silence` | Room silence (`3.0 s`) | Measures room RMS distribution (`median`, `p90`) and `400 × 25 Hz` noise floor curve |
| **Steps 2–5** | `open_strings` | Open `G4`, `C4`, `E4`, `A4` | Captures individual open-string harmonic profiles, tuning offsets & Helmholtz $A_0$ anchor (`C4`) |
| **Steps 6–15** | `fretboard_anchors` | `D4` (C-F2), `F4` (E-F1), `F#4` (E-F2), `Bb4` (G-F3), `B4` (A-F2), `C5` (A-F3), `D5` (A-F5), `E5` (A-F7), `G5` (A-F10), `A5` (A-F12) | Samples all 4 strings up to fret 12 (`<= 2–3` semitone interpolation gaps), mapping $A_0$, $T(1,1)$, and fret-dependent inharmonicity $B$ |
| **Steps 16–17** | `dynamics` | Soft flesh pluck (`C4`) vs. Hard forte strum (`C [0,0,0,3]`) | Sets soft-touch sensitivity floor and profiles loud pluck click + `+10..20¢` tension bend |
| **Steps 18–20** | `intervals` | `C4+E4`, `E4+G4`, Unison `A4+A4` (`[2,-,-,0]`) | Validates 2-voice separation, re-entrant voicing, and unison beating stability |
| **Steps 21–28** | `chords` | `C [0,0,0,3]`, `Am [2,0,0,0]`, `F [2,0,1,0]`, `G [0,2,3,2]`, `G7 [0,2,1,2]` (up-strum), `Dm [2,2,1,0]`, `Em [0,4,3,2]` (slow arpeggio), `D [2,2,2,0]` | Zero-shot polyphonic validation across down-strums, up-strums, rolled arpeggios, octaves (`C4+C5`), and doubled unisons |

### 5.3 Running Real-Instrument Calibration

Once WAVs and `manifest.json` are recorded into `/Users/ojus/official/piano-app/audio_dataset/ukulele/samples/` (via the app's Ukulele Data Trainer or `/api/dataset/ukulele/recalibrate`):

```bash
python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py
```

When real WAVs are present, `calibrate_ukulele.py` automatically:
1. Calibrates the user's exact room noise floor & `recommendedRmsGate`.
2. Extracts real 8-harmonic templates, inharmonicity $B$, and tuning offsets across all recorded anchor WAVs and interpolates `MIDI 55..84`.
3. Runs zero-leakage LOOCV + zero-shot chord benchmarks on the user's actual recordings.
4. Writes `audio_dataset/ukulele/calibrated_profile.json` and overwrites `js/audio/ukulele_profile.js` with `calibrated: true` for instant live reload via `detector.reloadProfile(profile)`.
