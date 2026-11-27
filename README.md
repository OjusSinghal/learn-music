# 🎹🎸 Yousician Piano & Ukulele (Personal Conservatory & Studio Edition) — Architecture & Developer Guide

A zero-dependency, real-time interactive **Piano & Ukulele** conservatory and play-along web application engineered to replicate and extend **Yousician** — supporting both a **5-octave, 61-key Piano (`C2` to `C7`, MIDI `36..96`)** and a **Standard High-G Re-Entrant Ukulele (`G4–C4–E4–A4`, frets `0..12`, MIDI `60..81`, with Low-G `G3` DSP extensibility)** with seamless global `Piano | Ukulele` switching, **stereo headphone backing accompaniment**, **Levels 1–9 Structured Curricula for both instruments (`72` lessons · `216` playable Solo/Chords/Combined parts · `17,013` curriculum notes)**, **Universal Song Play-Alongs (`8` built-in/server songs + MIDI/MusicXML/Gemini OMR/QuickComposer imports automatically arranged for both instruments)**, **Isolated Gamified Mastery Progression**, and **Calibrated Polyphonic Acoustic DSP + 28-Step Data Trainers** for both Piano and Ukulele.

---

## 📑 Table of Contents
1. [System Overview & Multi-Instrument Architecture](#1-system-overview--multi-instrument-architecture)
2. [Minimal Conservatory Home, `Piano | Ukulele` Switch & Gamification](#2-minimal-conservatory-home-piano--ukulele-switch--gamification)
3. [Structured Curricula (Levels 1–9 Piano & Levels 1–9 Ukulele)](#3-structured-curricula-levels-19-piano--levels-19-ukulele)
4. [Ukulele 4-String Tab Canvas, Interactive Fretboard & Universal Song Arranger](#4-ukulele-4-string-tab-canvas-interactive-fretboard--universal-song-arranger)
5. [Stereo Headphone Backing Band vs. Play-Along Guide Toggle](#5-stereo-headphone-backing-band-vs-play-along-guide-toggle)
6. [61-Key Piano & High-G Ukulele Pitch / Coordinate Mapping](#6-61-key-piano--high-g-ukulele-pitch--coordinate-mapping)
7. [Calibrated Polyphonic Audio DSP & Quantitative Benchmarks (Piano + Ukulele)](#7-calibrated-polyphonic-audio-dsp--quantitative-benchmarks-piano--ukulele)
8. [28-Step Acoustic Data Trainers & Live Recalibration (Piano + Ukulele)](#8-28-step-acoustic-data-trainers--live-recalibration-piano--ukulele)
9. [Practice Modes, Polyphonic Scoring, Finger Colors & Visual Engine](#9-practice-modes-polyphonic-scoring-finger-colors--visual-engine)
10. [Score Ingestion & OMR Pipeline](#10-score-ingestion--omr-pipeline)
11. [Project Structure & HTTP API Reference](#11-project-structure--http-api-reference)
12. [Running, Calibrating & Operating the App](#12-running-calibrating--operating-the-app)
13. [Antigravity Global Skill & Living Documentation Policy](#13-antigravity-global-skill--living-documentation-policy)
14. [Current Boundaries & Future Roadmap](#14-current-boundaries--future-roadmap)

---

## 1. System Overview & Multi-Instrument Architecture

The application runs as a zero-dependency **36-module vanilla ES-module Single Page Application (SPA)** backed by a multi-threaded pure-stdlib Python 3 HTTP/API server (`server.py`, `ThreadingTCPServer`, `request_queue_size = 128`). It combines **HTML5 High-DPI 2D Canvas (60 FPS)**, **Web Audio API (`AudioWorklet` + Stereo Headphone Synthesis + Acoustic Piano & Nylon Ukulele Synthesizers)**, **MediaStream API**, and **Web MIDI API**.

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│            MULTI-VIEW CONSERVATORY NAVIGATION + INSTRUMENT SWITCHER              │
│  [Piano | Ukulele]  │  Home (#viewHome) │ Learn (Lv 1–9) │ Songs │ Studio        │
└──────────────────┬──┴───────────────────┴────────────────┴───┬───┴──────────┬────┘
                   │                                           │              │
┌──────────────────▼───────────────────────────────────────────▼──────────────▼────┐
│                               USER INPUT SOURCES                                 │
│  Acoustic Piano / Ukulele (Mic)   │   Digital Piano (Web MIDI)   │ Mouse / Keys  │
└──────────────────┬────────────────┴──────────────┬───────────────┴──────────┬────┘
                   │ Raw Float32 PCM (48 kHz)      │ MIDI Note-On             │
                   ▼                               │                          │
┌──────────────────────────────────────────────────┐                          │
│      OFF-MAIN-THREAD CAPTURE (AudioWorklet)      │                          │
│ • Instrument-Adaptive Biquad HPF:                │                          │
│   Piano: 52 Hz | Ukulele High-G: 180 Hz (Low-G: 135 Hz)                     │
│ • PianoCaptureWorkletProcessor (4096 / 1024 hop) │                          │
└──────────────────┬───────────────────────────────┘                          │
                   │ Transferable Float32Array + Expected Score Hints         │
                   ▼                                                          │
┌─────────────────────────────────────────────────────────────────────────────┐
│          DUAL CALIBRATED POLYPHONIC + SCORE-INFORMED DSP ENGINES            │
│ • Piano (`polyphonic_detector.js`): 8192-FFT + 61-Key KL-NMF + Odd-Harmonic │
│   Bass Gate + Major-Triad Root Filter + Overtone Excess (`100%` Chord F1)   │
│ • Ukulele (`ukulele_detector.js`): 8192-FFT + `180/135 Hz` HPF + Flatness   │
│   Pluck-Click Gate + Nylon KL-NMF + Unison-Resilient Scaling + `98 ms`      │
│   Strum-Aggregation Window + Sub-Cent `G-C-E-A` Tuner (`100%` Hybrid F1)    │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ activeNotes[], onsetNotes[], detectedChord, tunerNote
                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│             POLYPHONIC EVALUATOR, GAME ENGINE & ISOLATED GAMIFICATION            │
│ • `GameEngine.setInstrumentContext()` hot-swaps Renderer, Fretboard/Keys & Synth │
│ • Flow (±140/±280 ms + 95 ms ukulele strum stagger) & Wait Mode (unison-aware)   │
│ • Lane/Hand Toggles: `L Left / R Right` (Piano) ↔ `L Chords / R Melody` (Ukulele)│
│ • Dual `ProgressManager`: `yousician_piano_progress_v1` & `..._ukulele_progress_v1`
└──────────────┬───────────────────────────────────────────┬───────────────────────┘
               │ Render State & Highlights                 │ Shared AudioContext Buses
               ▼                                           ▼
┌──────────────────────────────────────────┐ ┌─────────────────────────────────────┐
│   STUDIO OBSIDIAN & IVORY PRESENTATION   │ │     HEADPHONE AUDIO ARCHITECTURE    │
│ • Piano: Dual Grand Staves + 61-Key 3D   │ │ • BackingTrackEngine (ALWAYS ON     │
│ • Ukulele: 4-String Tab Lane, Parabolic  │ │   stereo pad, bass & groove)        │
│   Orb + Dotted Trail, 4×12 Fretboard     │ │ • Play-Along Toggle: Mutes/plays    │
│ • Calm Non-Punitive Feedback (Zero Red)  │ │   ONLY guide Piano or Ukulele notes │
│ • `UkuleleArranger`: Converts ANY song   │ │ • `PianoSynthesizer` + Nylon        │
│   automatically into 4-string tab+chords │ │   `UkuleleSynthesizer` + Metronome  │
└──────────────────────────────────────────┘ └─────────────────────────────────────┘
```

---

## 2. Minimal Conservatory Home, `Piano | Ukulele` Switch & Gamification

### 2.1 Global Instrument Switch & Collision-Free 4-View Layout (`index.html`, `style.css`, `js/app.js`)
A dedicated `50px` global `.app-header` holds strictly the brand (`#btnBrandHome` with dynamic `61-Key` / `G-C-E-A` badge), primary view pills (`Home | Learn | Songs | Studio`), the sleek obsidian/champagne **`Piano | Ukulele` segmented switcher (`#instrumentSwitcher`: `#btnInstrumentPiano`, `#btnInstrumentUkulele`)** persisted in `localStorage` (`"yousician_active_instrument"`), and the live gamification pill (`#headerGamificationPill`). Studio-specific controls live strictly inside `#viewStudio > .studio-toolbar` and the 2-row `footer.control-dock` (`163/163` matched DOM IDs):
1. **Minimal Home Page (`#viewHome`)**: Above-the-fold `margin: auto` flex centering with instrument-aware eyebrow (`61-KEY PERSONAL CONSERVATORY · C2–C7` vs `HIGH-G UKULELE CONSERVATORY · G4–C4–E4–A4`), Rank/XP/Streak/Curriculum/Stars mastery strip, 1-click **`Continue Lesson →`**, **Learn** & **Songs** hero cards, quick utilities (*Open Free Studio*, *Import Sheet / MIDI / MusicXML*, *61-Key / Ukulele Acoustic Data Trainer*), and milestone chips.
2. **Learn View (`#viewLearn`)**: Zero-overflow `repeat(9, minmax(0, 1fr))` Level `1` → Level `9` rail (`#levelTabsRail`), level banner, and expandable 4-lesson × 3-part cards (`Solo`, `Chords`, `Combined`) dynamically bound to either `PIANO_CURRICULUM` (`108` parts) or `UKULELE_CURRICULUM` (`108` parts).
3. **Songs View (`#viewSongs`)**: Unified deduplicated grid of all **8** built-in & server-persisted songs plus custom imports, with *All* / *Completed* / *In Progress* filters, search, manual checkmarks, and 1-click **`Play Along`**. In Ukulele mode, every song displays `4-String Tab + Chords` + `Headphone Band` and automatically arranges via `UkuleleArranger` on launch.
4. **Studio View (`#viewStudio`)**:
   - **Contextual `.studio-toolbar`**: Mutually exclusive `#studioCurriculumBar` (`← Learn` · context · `Next Part →` · `Free Mode`) vs `#studioSongSelectWrap` + `#btnOpenImport`, alongside `Data Trainer`, `.mic-control-bar` (live chromatic/chord tuner + noise gate), and `#studioRightHints` (`Fingers T 1 2 3 4` in Piano ↔ `0 1 2 3 4` in Ukulele).
   - **Instrument Stage & Bottom Dock**: Reuses `#yousicianCanvas` for `YousicianRenderer` (Piano) vs `UkuleleTabRenderer` (Ukulele) and toggles `.keyboard-section` (`142px`) cleanly between `#pianoKeyboard` (`61` keys) and `#ukuleleFretboard` (`4` strings × `12` frets). `footer.control-dock` keeps the full-width `.dock-scrubber-row` above `.dock-main-row`, relabeling `#btnHandLeft`/`#btnHandRight` dynamically (`Left`/`Right` ↔ `Chords`/`Melody`).

### 2.2 Isolated Multi-Instrument Gamification (`js/gamification/progress.js`)
Piano and Ukulele maintain completely isolated `ProgressManager` stores so Level `1..9` mastery, Song stars (e.g., playing *Wise Men Say* on Piano vs Ukulele), Ranks, Achievements, and `Continue Lesson` pointers never collide:
- **Piano Store**: `localStorage["yousician_piano_progress_v1"]` · `PIANIST_RANKS` (*Initiate → Apprentice → Lyricist → Harmonist → Virtuoso → Concert Master*) · `ACHIEVEMENT_DEFINITIONS`.
- **Ukulele Store**: `localStorage["yousician_ukulele_progress_v1"]` · `UKULELE_RANKS` (*Open-String Novice → Strum Apprentice → Island Groover → Fretboard Voyager → Chord-Melody Virtuoso → Conservatory Ukulelist*) · `UKULELE_ACHIEVEMENT_DEFINITIONS`.
- **Shared Mechanics**: Star thresholds (`>=92%` = `3 ★`, `>=75%` = `2 ★`, `>=50%` or Wait completion = `1 ★`), cascading Part → Lesson (`+40 XP`) → Level (`+120 XP`) completion, manual completion toggles, UTC daily streaks, and `#completionModal` triggered by `GameEngine.onSongComplete`.

---

## 3. Structured Curricula (Levels 1–9 Piano & Levels 1–9 Ukulele)

Both instruments follow the identical **9 Levels × 4 Lessons × 3 Parts (`Part 1: Solo`, `Part 2: Chords`, `Part 3: Combined`) = 108 Playable Parts** conservatory triad with curated headphone `backingStyle` accompaniment.

### 3.1 Piano Curriculum (`js/curriculum/{index,levels_1_to_4,levels_5_to_9}.js`, `docs/CURRICULUM_RESEARCH.md` — `7,923` Notes, `1,192` Same-Hand Chords)

| Level | Title & Grade Tier | Register (`MIDI`) | Keys & Meters | Solo & Chords Skills (`12 Parts/Level`) |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Piano Foundations & RH C Position** | `B3..G4` (`59..67`) | `C` · `4/4` (`72–84 BPM`) | RH `C4–G4` steps, skips & first 2-note harmonic dyads (`1-3`, `1-5`) |
| **2** | **Left-Hand Bass & Two-Hand Entry** | `C3..G4` (`48..67`) | `C`, `Am` · `4/4`, `3/4` | LH `C3–G3` bass walks, open 5ths, alternating → Beat-1 two-hand entry |
| **3** | **Primary Chords & Comping Grooves** | `A2..C5` (`45..72`) | `C`, `Am` · `4/4`, `3/4` | Root `C, F, G, Am` triads (`1-3-5` / `5-3-1`), broken chords & comping |
| **4** | **New Keys (`G`, `F`, `Am`), 8ths & Shifts** | `G2..E5` (`43..76`) | `G`, `F`, `Am`, `C` | Straight 8ths, `F#`/`Bb` black keys, `1-2-3-1-2-3-4-5` thumb-under shifts |
| **5** | **Inversions, Slash Chords & Ballads** | `F#2..G5` (`42..79`) | `D`, `Em`, `C`, `G` · `4/4`, `6/8` | 1st/2nd triad inversions, stepwise slash basslines (`C/B`, `D/F#`), ballads |
| **6** | **16th-Note Agility & Classical Alberti Bass** | `E2..A5` (`40..81`) | `C`, `Am`, `G`, `D` · `4/4`, `3/4`, `3/8` | 16th-note runs, Alberti bass (`5-1-3-1`), salon waltz, Baroque imitation |
| **7** | **Minor Scales, 7th Chords & Soul/Blues** | `D2..C6` (`38..84`) | `Am`, `Dm`, `Em`, `F`, `G` | 4-note `maj7`/`m7`/`dom7` voicings, harmonic minor, 12-bar blues & Neo-Soul |
| **8** | **Expressive Polyphony & Modulations** | `C2..E6` (`36..88`) | `Bm`, `Bb`, `Eb`, modulations | Romantic `6/8` nocturne, wide broken tenths/octaves, secondary dominants |
| **9** | **Virtuoso 61-Key Mastery & Capstones** | `C2..C7` (`36..96`) | `C`, `F`, `A`, `D`, `Dm` | Rootless `9th`/`13th` jazz voicings, full `C2..C7` cascades, concert finale |

### 3.2 Ukulele Curriculum (`js/ukulele/curriculum.js`, `docs/UKULELE_CURRICULUM.md` — `9,090` Notes, `108` Parts, `uku_*` IDs)

| Level | Theme | Keys & Meters | Core Fret Range & Chords | Signature Skills (`Part 1: Solo`, `Part 2: Chords`, `Part 3: Combined`) |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Open Strings & First Single-Finger Chords** | `C`, `Am` · `4/4` (`68–80 BPM`) | Frets `0–3` · `C6`, `C`, `Am`, `C7` | `G–C–E–A` open-string pulse, single-finger pivots, whole/half down-strums |
| **2** | **C Major Scale & Primary Strumming** | `C`, `Am` · `4/4`, `3/4` | Frets `0–3` · `C`, `F`, `G7`, `Am` | Full octave `C4–C5` scale, `F → G7` index pivot, quarter & `D–D–DU` strum |
| **3** | **Full G Major, Island Strum & Folk Melodies** | `C`, `G` · `4/4`, `3/4` | Frets `0–5` · `G`, `C`, `Am`, `F`, `D7` | Full `G [0232]`, syncopated Island Strum (`D–DU–UDU`), `F#` in G Major |
| **4** | **Minor Keys, Syncopated Picking & Pop Grooves** | `Am`, `Dm`, `Em`, `G` | Frets `0–5` · `Dm`, `Em`, `Am`, `C`, `G`, `D` | `Em` staircase (`0432`), natural minor phrasing, dotted-quarter syncopation |
| **5** | **G & D Major Positions & Arpeggio Fingerpicking** | `D`, `G`, `Em` · `4/4`, `6/8` | Frets `0–5` · `D`, `A`, `A7`, `Bm`, `Em`, `G` | `Bm` partial barre (`4222`), `T–I–M–A` rolling arpeggios, `6/8` ballad sway |
| **6** | **Movable Shapes, Bb Barre & 8th-Note Leads** | `F`, `Dm`, `D`, `C` | Frets `1–7` · `Bb`, `Gm`, `Cm`, `F#m`, `E7` | `Bb [3211]` partial barre, movable neck shapes, agile 8th-note scalar runs |
| **7** | **7th Chords, Blues & Jazzy Voicings** | `C`, `Am`, `A`, `G` | Frets `0–7` · `Cmaj7`, `Am7`, `Dm7`, `Fmaj7`, `G7`, `E7` | `ii7–V7–Imaj7` jazz comping, 12-bar ukulele blues, pentatonic blue notes |
| **8** | **Up-the-Neck Melody, Double-Stops & Campanella** | `C`, `G`, `D`, `F` | **Frets `5–12`** (`C5–A5`) | 5th–12th position clarity, 3rd/6th double-stops, harp-like campanella |
| **9** | **Chord-Melody Mastery, Modulations & Capstones** | `C`, `D`, `G`, `Eb` | Full `0–12` neck · `Cadd9`, `Gmaj7`, `B7`, slash chords | Top-string chord-melody arranging, secondary dominants, bossa & capstones |

---

## 4. Ukulele 4-String Tab Canvas, Interactive Fretboard & Universal Song Arranger

### 4.1 60 FPS Retina 4-String Tab Renderer (`js/ukulele/renderer.js`)
- Renders a calm **Studio Obsidian & Acoustic Ivory** 4-string horizontal scrolling fretboard deck (`playheadRatio = 0.26`, `pixelsPerSecond = 180 px/s`) with realistic gauge-differentiated strings (`0=A4` thinnest through `2=C4` thickest and `3=G4` re-entrant), left nut tuning badges with live tuning indicator dots, chord symbol headers, vertical strum brackets + `↓`/`↑` direction arrows, below-deck measure indices, finger-colored circular fret pills + duration tails, **bouncing 3D acoustic-ivory sphere + dotted parabolic trajectory trail** (`computeBallPosition`, both past fade & upcoming arc preview), Wait-mode breathing halos, dimmed/blurred muted-lane overlays (`onToggleHand`), and an optional compact top-right **mini live pitch/tuning capsule**.
- Maintains identical non-punitive feedback to Piano: concentric calm ripples (`#6EE7B7` Perfect, `#E2C98A` Early/Late), deduplicated `10.5px` whisper labels, desaturated missed ghost capsules (`#64748B`), and `380 ms` off-target hollow ghost rings (`#94A3B8`) — **zero harsh reds or banners**.

### 4.2 Interactive 4-String × 12-Fret Horizontal Neck (`js/ukulele/fretboard.js`)
- Slots cleanly into `.keyboard-section` (`142px`) beside `#pianoKeyboard` as `#ukuleleFretboard` when Ukulele mode is active.
- Features an active chord badge (`.uku-chord-badge`), proportional 12-TET-blended frets `1..12` with pearl position inlays on frets `3, 5, 7, 10` and double dot on `12`, clickable left nut open-string pills (`A4, E4, C4, G4` with live tuning dots), all `52` pointer/touch-clickable `(string, fret)` cells triggering `UkuleleSynthesizer` + `GameEngine.handleUserInputNotes`, and unison-chord-aware target highlighting (e.g., lighting both `A4` strings simultaneously on `F [2,0,1,0]`).

### 4.3 Universal Song Arranger & 229-Shape Chord Engine (`js/ukulele/chords.js`, `js/ukulele/arranger.js`)
- **`UKULELE_CHORD_SHAPES`**: `229` curated + enharmonic chord voicings across all 12 roots (major, minor, 7, maj7, m7, sus2/4, dim, aug, add9, slash chords, split bars like `"G → C"`) plus an algorithmic fallback voicer (`voiceUkuleleChord`) and explicit `[G, C, E, A] ↔ tab(0=A..3=G)` coordinate converters.
- **`UkuleleArranger.arrangeSongForUkulele(pianoSong)`**: Automatically converts **every** built-in `SONG_LIBRARY` track, `songs_data/*.json` track, and imported MIDI / MusicXML / Gemini OMR / QuickComposer piece into a dual-track Ukulele score (`instrument: "ukulele"`):
  - **Melody (`lane: "melody"`, `hand: "right"`)**: Extracts the top vocal/melody voice, finds optimal octave transposition into `C4..A5` (`MIDI 60..81`), and runs a **2nd-Order Viterbi DP Fretboard Solver** minimizing hand-box shifts while favoring open strings and frets `0..5`.
  - **Chords (`lane: "chords"`, `hand: "left"`)**: Generates meter- & `backingStyle`-matched 4-string strums from `song.chords` (or `inferChordsFromNotes` when absent), resolves simultaneous same-string fret collisions (`0` collisions across all 8 repertoire songs + all 108 curriculum parts), and tags High-G unison doubles (`chordGroupId`, `isUnisonDouble: true`).

---

## 5. Stereo Headphone Backing Band vs. Play-Along Guide Toggle

Engineered for **headphone play-along** on both Piano and Ukulele, `BackingTrackEngine` (`js/audio/backing_track.js`), `PianoSynthesizer` (`js/audio/synth.js`), `UkuleleSynthesizer` (`js/audio/ukulele_synth.js`), and `GameEngine` (`js/engine/game.js`) share **one `AudioContext`** with a strict two-bus split:

| Audio Control | Engine Property & UI Control | Default | Exact Headphone Behavior |
| :--- | :--- | :---: | :--- |
| **Song Backing Music** | `game.backingAudioEnabled` (`#btnBackingToggle` + `#backingVolumeSlider`) | **`ON` (`65%`)** | **ALWAYS plays** while advancing (`isPlaying && !isWaiting`), synthesizing stereo pads, slash-aware bass, and studio grooves (`warm_pad`, `acoustic_pop`, `classical_strings`, `waltz_chamber`, `jazz_brushes`, `cinematic_pulse`) — **even when `Play-Along` is `OFF`!** |
| **Play-Along Guide Notes** | `game.referenceAudioEnabled` (`#btnPlayAlongToggle`) | **`ON`** | **Exclusively plays or mutes guide score notes** (`PianoSynthesizer.playNote` in Piano; `UkuleleSynthesizer.playStrum` / `playNote` in Ukulele). Turning it `OFF` mutes only the guide instrument while the backing band and wooden metronome play on. |

- **`UkuleleSynthesizer` (`js/audio/ukulele_synth.js`)**: Warm nylon-string synthesis with `14 ms` bandpassed pink-noise pluck transient, damped 1–4 harmonics + `+6¢` attack bloom, `300 Hz` Helmholtz & `520 Hz` top-plate peaking resonators, `3800 Hz` warm LPF, and `14 ms` staggered G→C→E→A / A→E→C→G `playStrum()`.
- **Zero Hanging Voices**: Pause, Wait-mode chord freeze (`isWaiting === true`), seek, restart, instrument switch, or view switch releases all voices cleanly in `30 ms` (`stopAll()` / `stopAllNotes()`).

---

## 6. 61-Key Piano & High-G Ukulele Pitch / Coordinate Mapping

### 6.1 61-Key Piano Span (`MIDI 36..96`, `C2–C7`, `key61 = midi - 35`)
| Landmark Key | Scientific Note | MIDI | $f_0$ | 61-Key `#` | White Key `#` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Leftmost Key | `C2` | `36` | `65.41 Hz` | `#1` | `#1` |
| 2nd C / Tenor A | `C3` / `A3` | `48` / `57` | `130.81` / `220.00 Hz` | `#13` / `#22` | `#8` / `#13` |
| **Middle C** / **A440** | `C4` / `A4` | `60` / `69` | `261.63` / `440.00 Hz` | `#25` / `#34` | `#15` / `#20` |
| 4th C / 5th C / Rightmost | `C5` / `C6` / `C7` | `72` / `84` / `96` | `523.25` / `1046.50` / `2093.00 Hz` | `#37` / `#49` / `#61` | `#22` / `#29` / `#36` |

### 6.2 Standard Re-Entrant High-G Ukulele (`G4–C4–E4–A4`, Frets `0..12`, `MIDI 60..81`)
| Tab String Index (`renderer` / `fretboard` / `notes`) | Visual Line | String | Open MIDI | $f_0$ (Hz) | Chord Diagram `[G,C,E,A]` Index |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **`0`** | Top line (1st string) | **A4** | `69` | `440.00` | `3` |
| **`1`** | 2nd line | **E4** | `64` | `329.63` | `2` |
| **`2`** | 3rd line | **C4** | `60` | `261.63` | `1` |
| **`3`** | Bottom line (4th string, re-entrant) | **G4** | `67` | `392.00` | `0` |

---

## 7. Calibrated Polyphonic Audio DSP & Quantitative Benchmarks (Piano + Ukulele)

### 7.1 61-Key Piano Polyphonic DSP (`js/audio/polyphonic_detector.js`, [`NOTE_DETECTION_RESEARCH.md`](./NOTE_DETECTION_RESEARCH.md), [`CALIBRATION_BENCHMARK_REPORT.md`](./CALIBRATION_BENCHMARK_REPORT.md))
Calibrated from the user's **28 lossless `48 kHz` WAV recordings** in `audio_dataset/samples/` (`python3 scripts/calibrate_and_benchmark.py`):
- **6-Stage Pipeline**: `52 Hz` HPF + off-main-thread `AudioWorklet` (`4096/1024`) → `8192`-pt Blackman-Harris FFT + `25 Hz`-band noise subtraction → Local peak extraction + Tenor/Treble $h_1$ gate (`MIDI >= 52`) & Deep Bass odd-harmonic gate (`MIDI <= 51`, where `C2` has `0%` $h_1$) + Major-Triad phantom sub-octave filter → 20-iter KL-NMF over 61-key 10-harmonic templates → Overtone excess verifier + spectral flux onset + sustain bridge → Score-Informed priors.

| Piano Detection Model (`28` Real WAVs — Strict LOOCV + Zero-Shot Chords) | Overall F1 | Recall | Polyphonic Chord F1 (Steps 23–28) | Exact Chords |
| :--- | :---: | :---: | :---: | :---: |
| Baseline Monophonic YIN (`js/audio/pitch.js`) | `71.87%` | `63.89%` | `19.05%` | `0 / 6` (`0.0%`) |
| Uncalibrated Generic KL-NMF ($1/h$) | `84.62%` | `91.67%` | `93.33%` | `5 / 6` (`83.3%`) |
| **Calibrated 61-Key Polyphonic & Score-Informed Engine** | **`94.74%`** | **`100.00%`** | **`100.00%`** | **`6 / 6` (`100.0%`)** |

### 7.2 Nylon-String Ukulele Polyphonic DSP (`js/audio/ukulele_detector.js`, [`docs/UKULELE_ACOUSTIC_RESEARCH.md`](./docs/UKULELE_ACOUSTIC_RESEARCH.md))
Purpose-built for nylon/fluorocarbon ukulele acoustics (Helmholtz $A_0 \approx 260\text{–}310\text{ Hz}$, top-plate $T(1,1) \approx 450\text{–}550\text{ Hz}$, `10–25 ms` pluck click, `+5..22¢` tension bend, `20–85 ms` staggered strums, and unison string beating in 6 of 8 core chords `Am, F, G, Dm, Em, D`) with Low-G (`G3 = 55`) extensibility:
- **7-Stage Pipeline**: Tuning-adaptive HPF (`180 Hz` High-G / `135 Hz` Low-G) + RMS gate → `8192`-pt Blackman-Harris FFT + room noise subtraction (`<= 8.5 kHz`) → Spectral Flatness (`SFM`) / HNR pluck-click gate → Asymmetric `[-30¢, +40¢]` peak gate + parabolic sub-cent `G-C-E-A` tuner → 22-iter nylon KL-NMF (`MIDI 60..84` / `55..84`) + **unison-resilient reference scaling** + template-residual octave excess verifier + 4-string voice cap → **Adaptive `98 ms` Strum-Aggregation Window** (bypassed for fast single-note melody picking; early-flushes on complete chords) → Score-Informed priors + `identifyUkuleleChord()`.

Evaluated via `python3 scripts/calibrate_ukulele.py --synthetic-benchmark` (out-of-distribution nylon modal synth, strict LOOCV on 14 single-note anchors, zero-shot on silence, dynamics, dyads, unisons & 8 strummed chords):

| Ukulele Detection Model (`28` Steps — Strict LOOCV + Zero-Shot Strums) | Overall F1 | Recall | Single-Note LOOCV F1 | Chords & Dyads F1 | Exact Steps |
| :--- | :---: | :---: | :---: | :---: | :---: |
| 1. Single-Frame Monophonic YIN | `51.95%` | `40.00%` | `100.00%` | `19.05%` | `17/28` (`60.7%`) |
| 2. Raw FFT Peak Picking | `75.19%` | `100.00%` | `73.68%` | `75.61%` | `6/28` (`21.4%`) |
| 3. Naive Uncalibrated NMF (No Strum Agg) | `71.79%` | `56.00%` | `100.00%` | `55.81%` | `18/28` (`64.3%`) |
| **4. Proposed Ukulele KL-NMF + Strum-Agg (Blind LOOCV)** | **`97.09%`** | **`100.00%`** | **`96.55%`** | **`96.88%`** | **`25/28` (`89.3%`)** |
| **5. Score-Informed Hybrid Ukulele Engine** | **`100.00%`** | **`100.00%`** | **`100.00%`** | **`100.00%`** | **`28/28` (`100.0%`)** |

- **Ukulele Telemetry**: Silence FP **`0`**, Chord Symbol Accuracy **`8/8 (100.0%)`**, Unified 1-Burst Strums **`8/8 (100.0%)`**, Tuner MAE **`0.82¢`**, Mean Latency **`26.5 ms`** (single note) / **`142.7 ms`** (4-string strum including physical sweep).

---

## 8. 28-Step Acoustic Data Trainers & Live Recalibration (Piano + Ukulele)

`SoundCollectionTrainer` (`js/trainer/trainer.js`) and `DatasetStorage` (`js/trainer/storage.js`) dynamically adapt to the active instrument while keeping Piano and Ukulele datasets **100% isolated**:
- **Piano 28-Step Trainer (`js/trainer/curriculum.js` → `audio_dataset/samples/`)**: Room silence, 7 bass + 12 treble anchors (`C2–C7`), soft/loud dynamics, octave & fifth dyads, C/G/Am triads, and Yousician Groove `B2+B4`; renders mini 61-key preview and recalibrates via `POST /api/dataset/recalibrate` (`scripts/calibrate_and_benchmark.py`).
- **Ukulele 28-Step Trainer (`js/trainer/ukulele_curriculum.js` → `audio_dataset/ukulele/samples/`)**: Room silence (`3s`), 4 open strings (`G4, C4, E4, A4`), 10 fretboard anchors up to fret 12 (`D4..A5`), soft pluck vs hard forte strum dynamics, 3 dyads + `A4+A4` unison beating check, and 8 essential chords (`C, Am, F, G, G7` up-strum, `Dm, Em` slow arpeggio, `D`); renders a clickable **mini 4-string chord/tab diagram** (sliding 5-fret window up to fret 12), plays staggered `playStrum` references, and recalibrates via `POST /api/dataset/ukulele/recalibrate` (`scripts/calibrate_ukulele.py --real-wavs`), hot-reloading `js/audio/ukulele_profile.js` (`calibrated: true`) directly into `PianoMicrophone`.

---

## 9. Practice Modes, Polyphonic Scoring, Finger Colors & Visual Engine

- **Count-In Lead-In**: Automatic 1–2 bar empty count-in (`startTime < 0`) with metronome ticks, gentle preparatory backing harmony, opening target previews on keys/fretboard, and free-play immunity.
- **Flow Mode & Wait Mode (`js/engine/evaluator.js`)**:
  - Flow: `±140 ms` Perfect (`#6EE7B7`), `±280 ms` Early/Late (`#E2C98A`), plus **`95 ms` strum-stagger tolerance** for multi-string ukulele chords.
  - Wait: Pauses on each enabled-hand chord cluster (`<= 55 ms`), cleanly releases backing voices, and in Ukulele mode **auto-credits simultaneous High-G unison sibling strings** (e.g., dual `A4=69` in `F [2,0,1,0]`, `Am`, `G`, `D`) on a single detected strike so chords never stall.
- **Independent Lane / Hand Toggles (`L` / `R`)**:
  - **Piano**: `L Left` (Bass) / `R Right` (Treble) with optical frosted staff blur and register-safe single-hand filtering.
  - **Ukulele**: `L Chords` / `R Melody` dimming the inactive lane while disabling piano's pitch-register split heuristic (since ukulele melody & chords share `C4–A5`).
- **Canonical 5-Color Ergonomic Palette (Zero Harsh Reds `#EF4444`/`#F87171`/`#B91C1C`, Zero `alert`/`window.confirm`)**:
  - `#48A870` (Piano Thumb `T` / Ukulele Open `0`), `#F0C830` (Index `1`), `#6848F8` (Middle `2`), `#4090F8` (Ring `3`), `#E86078` (Pinky `4`).
- **Built-In & Server 8-Song Repertoire** (all playable on BOTH Piano [`602` notes] and Ukulele via `UkuleleArranger`): *Wise Men Say (Can't Help Falling in Love)* (`860` uku notes), *Yousician Groove* (`168`), *Für Elise* (`58`), *Ode to Joy* (`87`), *Canon in D* (`78`), *Amazing Grace* (`151`), *Happy Birthday* (`111`), and *Minuet in G (BWV Anh. 114)* (`116`).

---

## 10. Score Ingestion & OMR Pipeline

Click **Import** on Home, Songs, or Studio to ingest external music — every imported piece is normalized, barline-aligned (`t = 0.0s`, `gridDur - 0.025s`), given ergonomic piano fingerings + automatic headphone chords (`inferChordsFromNotes`), saved to `songs_data/`, and **instantly playable on both Piano AND Ukulele** (auto-arranged via `UkuleleArranger` in Ukulele mode):
1. **Sheet Music Image (Gemini Vision AI OMR)** (`js/parser/sheet.js` — `gemini-2.5-flash`).
2. **Standard MIDI (`.mid` / `.midi`)** (`js/parser/midi.js` & `server.py`).
3. **MusicXML (`.musicxml` / `.xml`)** (`js/parser/musicxml.js`).
4. **Quick Score Shorthand Composer** (`js/parser/sheet.js`).

---

## 11. Project Structure & HTTP API Reference

```text
piano-app/
├── index.html                        # Multi-view SPA shell (163 DOM IDs, Piano|Ukulele switch)
├── style.css                         # Studio Obsidian & Acoustic Ivory UI, 61-key & 4×12 ukulele styles
├── server.py                         # Pure-Python 3 ThreadingTCPServer(q=128) HTTP & REST API server
├── README.md                         # Living architecture, curriculum, DSP & developer guide
├── NOTE_DETECTION_RESEARCH.md        # Piano polyphonic DSP research
├── PIANO_FINGERING_RESEARCH.md       # Piano ergonomic Viterbi DP fingering research
├── CALIBRATION_BENCHMARK_REPORT.md   # 28-sample Piano calibration & benchmark tables
│
├── docs/
│   ├── CURRICULUM_RESEARCH.md        # Piano Levels 1–9 pedagogy & syllabus
│   ├── UKULELE_CURRICULUM.md         # Ukulele Levels 1–9 syllabus & arranger reference
│   └── UKULELE_ACOUSTIC_RESEARCH.md  # Ukulele nylon physics, 7-stage DSP & 28-step protocol
│
├── agent-skills/
│   └── yousician-piano-app/          # Repo mirror of ~/.gemini/config/skills/yousician-piano-app/
│       ├── SKILL.md                  # Antigravity/Jetski development & calibration skill
│       ├── references/               # Architecture, schemas, DSP & calibration deep dives
│       └── scripts/verify_piano_app.sh # Permanent 5-stage Piano + Ukulele verification suite
│
├── scripts/
│   ├── calibrate_and_benchmark.py    # Pure-Python 61-key Piano calibration & LOOCV benchmark
│   └── calibrate_ukulele.py          # Pure-Python Ukulele synthetic ablation & real-WAV calibrator
│
├── js/                               # 36 Zero-Dependency Vanilla ES Modules
│   ├── app.js                        # Multi-instrument PianoApp router, Studio & Gamification controller
│   ├── audio/
│   │   ├── backing_track.js          # Stereo headphone accompaniment engine & chord analyzer
│   │   ├── calibrated_profile.js     # Calibrated 61-key Piano acoustic dictionary
│   │   ├── polyphonic_detector.js    # 61-key Piano 8192-FFT + KL-NMF polyphonic detector
│   │   ├── ukulele_profile.js        # Ukulele nylon acoustic profile (MIDI 55..84, High-G & Low-G)
│   │   ├── ukulele_detector.js       # 7-stage Ukulele KL-NMF + 98ms Strum-Agg + G-C-E-A tuner
│   │   ├── piano_worklet.js          # Off-main-thread AudioWorkletProcessor (4096/1024 hop)
│   │   ├── mic.js                    # Instrument-aware Mic + 52/180/135Hz HPF + dual detector bridge
│   │   ├── pitch.js                  # Legacy monophonic YIN baseline detector
│   │   ├── synth.js                  # Multi-harmonic Web Audio Piano synth & wooden metronome
│   │   ├── ukulele_synth.js          # Warm nylon-string Ukulele synth & 14ms staggered strum engine
│   │   └── midi.js                   # Web MIDI API input manager
│   ├── curriculum/
│   │   ├── index.js                  # Piano Levels 1–9 index (108 parts, 7,923 notes)
│   │   ├── levels_1_to_4.js          # Piano Levels 1–4
│   │   └── levels_5_to_9.js          # Piano Levels 5–9
│   ├── ukulele/
│   │   ├── chords.js                 # 229 Ukulele chord shapes, fallback voicer & GCEA↔Tab helpers
│   │   ├── arranger.js               # Universal Piano-to-Ukulele Viterbi DP + Strum Arranger
│   │   ├── curriculum.js             # Ukulele Levels 1–9 curriculum (36 lessons, 108 parts, 9,090 notes)
│   │   ├── renderer.js               # 60 FPS Retina 4-string Tab Canvas, parabolic orb & mini tuner
│   │   └── fretboard.js              # Interactive 4-string × 12-fret horizontal Ukulele neck
│   ├── engine/
│   │   ├── fingering.js              # 2nd-Order Viterbi DP piano fingering & 5-finger palette
│   │   ├── evaluator.js              # Polyphonic Flow/Wait scorer (Piano + Ukulele unison/strum)
│   │   ├── game.js                   # Multi-instrument timeline, backing split & completion lifecycle
│   │   ├── renderer.js               # 60 FPS Retina Piano dual-staff renderer
│   │   └── keyboard.js               # Interactive 61-key (`C2–C7`) 3D piano keyboard
│   ├── gamification/
│   │   └── progress.js               # Multi-instrument ProgressManager (Piano & Ukulele ranks/badges)
│   ├── parser/{midi,musicxml,sheet}.js
│   ├── songs/{library,storage}.js
│   └── trainer/
│       ├── curriculum.js             # Piano 28-step calibration steps
│       ├── ukulele_curriculum.js     # Ukulele 28-step calibration steps (open/frets/unison/chords)
│       ├── recorder.js               # 16-bit PCM WAV recorder & peak analyzer
│       ├── storage.js                # Instrument-isolated DatasetStorage (Piano vs Ukulele)
│       └── trainer.js                # Multi-instrument Data Trainer modal (61-key & 4-string diagrams)
│
├── audio_dataset/
│   ├── samples/                      # 28 Piano WAV recordings (NEVER delete or overwrite)
│   ├── manifest.json & calibrated_profile.json
│   └── ukulele/                      # Isolated Ukulele WAV dataset, manifest & calibrated_profile.json
├── samples/                          # Sample `.mid` and `.musicxml` import fixtures
└── songs_data/                       # Server-persisted repertoire & imported Song JSON files
```

### Local Server Endpoints (`server.py` — `ThreadingTCPServer`, `request_queue_size = 128`)
- **Songs & MIDI**: `GET /api/songs`, `POST /api/songs/save`, `POST /api/parse-midi`.
- **Piano Acoustic Dataset (`audio_dataset/`)**: `GET /api/dataset/summary`, `POST /api/dataset/sample`, `GET /api/dataset/zip`, `POST /api/dataset/recalibrate`, `POST /api/dataset/reset`.
- **Ukulele Acoustic Dataset (`audio_dataset/ukulele/`, 100% isolated from Piano)**:
  - `GET  /api/dataset/ukulele/summary`
  - `POST /api/dataset/ukulele/sample`
  - `GET  /api/dataset/ukulele/zip` (`ukulele_acoustic_dataset.zip`)
  - `POST /api/dataset/ukulele/recalibrate` (executes `scripts/calibrate_ukulele.py --real-wavs`; returns HTTP `400` if 0 WAVs recorded)
  - `POST /api/dataset/ukulele/reset` (clears ONLY `audio_dataset/ukulele/`)

---

## 12. Running, Calibrating & Operating the App

- **GitHub Repository**: [`https://github.com/OjusSinghal/learn-music`](https://github.com/OjusSinghal/learn-music) (`git@github.com:OjusSinghal/learn-music.git`)

### 12.1 Start the Local Server
```bash
cd /Users/ojus/official/piano-app
python3 server.py 8080
```
Open **`http://localhost:8080`**, plug in **headphones**, and switch seamlessly between **Piano** and **Ukulele** in the top bar.

### 12.2 Offline Calibration & Benchmark Suites
```bash
# Piano 61-key calibration & LOOCV benchmark (real 28 WAVs in audio_dataset/samples/)
python3 /Users/ojus/official/piano-app/scripts/calibrate_and_benchmark.py

# Ukulele synthetic 5-model ablation benchmark (when no ukulele WAVs exist yet)
python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py --synthetic-benchmark

# Ukulele real-instrument calibration (after recording WAVs in audio_dataset/ukulele/samples/)
python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py
```

### 12.3 Studio Controls & Keyboard Shortcuts
- **`Piano | Ukulele`** *(top header)*: Hot-swaps instrument across Home, Learn, Songs, Studio, Microphone DSP, and Data Trainer.
- **`Space` / `←` `→` / `Escape`**: Play/Pause, Seek `±3s`, Close Modals.
- **`L` / `R`**: Toggle `Left`/`Right` Hands (Piano) or `Chords`/`Melody` lanes (Ukulele).
- **Ukulele Studio Computer Keys**: `1–4` pluck open strings (`G4, C4, E4, A4`); `Z–N`, `A–K`, `Q–P` trigger playable fretboard notes.
- **`Play-Along ON/OFF` (`#btnPlayAlongToggle`)**: Mutes/plays only guide notes while **`Backing`** (`#btnBackingToggle`, default `65%`) continues playing stereo accompaniment in headphones.

---

## 13. Antigravity Global Skill & Living Documentation Policy

A dedicated Antigravity/Jetski development skill for maintaining, calibrating, and extending this application is maintained in **two byte-identical synchronized locations**:
- **Global Jetski Skill**: `~/.gemini/config/skills/yousician-piano-app/`
- **Repository Mirror (committed & pushed alongside all app changes)**: [`agent-skills/yousician-piano-app/`](./agent-skills/yousician-piano-app/) (`SKILL.md`, `references/architecture-and-formats.md`, `references/dsp-and-calibration.md`, `scripts/verify_piano_app.sh`).

Sync the repo mirror after any skill update with:
```bash
rsync -a --delete --exclude='.DS_Store' --exclude='__pycache__' \
  ~/.gemini/config/skills/yousician-piano-app/ \
  /Users/ojus/official/piano-app/agent-skills/yousician-piano-app/
```

### Automated 5-Stage Verification Suite (`verify_piano_app.sh`)
Validates Python compilation (`server.py`, `calibrate_and_benchmark.py`, `calibrate_ukulele.py`), `ThreadingTCPServer(q=128)`, zero harsh red/alert invariants across all `38` files, `163/163` DOM ID bindings, `.app-header`/`.studio-toolbar`/2-row `.control-dock` layout, all **`36` ES modules** + Studio sub-bar mutual exclusion in JavaScriptCore, `6/6` Piano WAV fixtures, all **`116` Piano pieces (`8,525` notes)**, all **`8` Ukulele-arranged songs + `108` Ukulele curriculum parts (`9,090` notes)**, `UkulelePolyphonicDetector` single-note/tuner/strum DSP, Piano↔Ukulele hot-swap + unison `F` chord + headphone split, dual `ProgressManager` isolation, concurrent `:8080` HTTP routes (incl. `/api/dataset/ukulele/summary`), and **`README.md` + Global Skill + Repo `agent-skills/` byte-for-byte mirror sync**:
```bash
bash ~/.gemini/config/skills/yousician-piano-app/scripts/verify_piano_app.sh
# Or directly from the repo mirror:
bash /Users/ojus/official/piano-app/agent-skills/yousician-piano-app/scripts/verify_piano_app.sh
```

---

## 14. Current Boundaries & Future Roadmap

| Area | Current State | Next-Step Enhancement |
| :--- | :--- | :--- |
| **Ukulele Real-Instrument Profile** | Ships with physically modeled High-G/Low-G nylon profile (`97.09%` blind / `100%` hybrid synthetic F1) + full 28-step WAV Trainer & `calibrate_ukulele.py`. | Record 28 real WAVs on the user's ukulele via the Ukulele Data Trainer and click **Recalibrate Ukulele Detector** for personalized `calibrated: true` templates. |
| **Low-G Toggle in UI** | `UkulelePolyphonicDetector` and `PianoMicrophone` support `'high-g'` (`180 Hz`) and `'low-g'` (`135 Hz`, `MIDI 55..84`). | Add a `High-G | Low-G` tuning selector pill inside Ukulele Studio toolbar & fretboard nut. |
| **Headphone vs. Open-Speaker Mode** | Optimized for headphones (`Backing` always ON + `Play-Along` guide toggle). | Feed Web Audio synth/backing buses as reference loopback channels into an adaptive echo subtractor inside `piano_worklet.js`. |
| **Practice Analytics & Offline OMR** | Isolated Stars, XP, 6 Ranks, Daily Streak, 8 Achievements, and Gemini Vision OMR (`gemini-2.5-flash`). | Add `A–B` measure-looping brackets on Canvas and an offline WASM/ONNX sheet OMR model. |
