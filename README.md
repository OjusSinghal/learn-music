# 🎹 Yousician Piano (Personal 61-Key Conservatory & Studio Edition) — Architecture & Developer Guide

A zero-dependency, real-time interactive piano conservatory and play-along web application engineered to replicate and extend **Yousician Piano** — custom-aligned and acoustically calibrated for a **5-octave, 61-key keyboard (`C2` to `C7`, MIDI `36..96`)** and **stereo headphone practice**, featuring a **Minimal Conservatory Home Page**, a complete **Levels 1–9 Structured Curriculum (`36` lessons · `108` playable solo/chord/combined parts · `7,923` notes)**, an **Always-On Stereo Headphone Backing Band**, **Gamified Mastery Progression**, and **8 Repertoire Play-Alongs (`602` notes — `116` total verified pieces / `8,525` total verified notes)**.

---

## 📑 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Minimal Conservatory Home, Multi-View Navigation & Gamification](#2-minimal-conservatory-home-multi-view-navigation--gamification)
3. [Structured Piano Curriculum (Levels 1–9 · Chords & Solo Play)](#3-structured-piano-curriculum-levels-19--chords--solo-play)
4. [Stereo Headphone Backing Band vs. Play-Along Piano Toggle](#4-stereo-headphone-backing-band-vs-play-along-piano-toggle)
5. [61-Key Keyboard Alignment & Pitch Mapping](#5-61-key-keyboard-alignment--pitch-mapping)
6. [Calibrated Polyphonic Audio DSP & Note Detection Engine](#6-calibrated-polyphonic-audio-dsp--note-detection-engine)
7. [Quantitative Benchmark Results (28 Acoustic Recordings)](#7-quantitative-benchmark-results-28-acoustic-recordings)
8. [28-Step Acoustic Sound Trainer & Live Recalibration](#8-28-step-acoustic-sound-trainer--live-recalibration)
9. [Practice Modes, Polyphonic Scoring, 5-Finger Colors & Visual Engine](#9-practice-modes-polyphonic-scoring-5-finger-colors--visual-engine)
10. [Score Ingestion & OMR Pipeline](#10-score-ingestion--omr-pipeline)
11. [Project Structure & HTTP API Reference](#11-project-structure--http-api-reference)
12. [Running, Calibrating & Operating the App](#12-running-calibrating--operating-the-app)
13. [Antigravity Global Skill & Living Documentation Policy](#13-antigravity-global-skill--living-documentation-policy)
14. [Current Boundaries & Future Roadmap](#14-current-boundaries--future-roadmap)

---

## 1. System Overview & Architecture

The application runs as a fast, zero-dependency **27-module vanilla ES-module Single Page Application (SPA)** backed by a lightweight pure-stdlib Python 3 HTTP/API server (`server.py`). It combines **HTML5 High-DPI 2D Canvas (60 FPS)**, **Web Audio API (`AudioWorklet` + Stereo Headphone Synthesis)**, **MediaStream API**, and **Web MIDI API**.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     MULTI-VIEW CONSERVATORY NAVIGATION                       │
│   Home (#viewHome)  │  Learn (Lv 1–9, 108 Parts)  │  Songs  │  Studio        │
└──────────────────┬──┴─────────────────────────────┴────┬────┴────────────┬───┘
                   │                                     │                 │
┌──────────────────▼─────────────────────────────────────▼─────────────────▼───┐
│                              USER INPUT SOURCES                              │
│   Acoustic Keyboard (Microphone)    │    Digital Piano (Web MIDI)    │ Mouse │
└──────────────────┬──────────────────┴────────────────┬───────────────┴───┬───┘
                   │ Raw Float32 PCM (48 kHz, No AGC)  │ MIDI Note-On      │
                   ▼                                   │                   │
┌──────────────────────────────────────────────────────┐                   │
│       OFF-MAIN-THREAD CAPTURE (AudioWorklet)         │                   │
│ • 52 Hz Butterworth High-Pass Filter (C2 = 65.41 Hz) │                   │
│ • PianoCaptureWorkletProcessor (4096 win / 1024 hop) │                   │
│ • Automatic AnalyserNode fallback (~21.3 ms cadence) │                   │
└──────────────────┬───────────────────────────────────┘                   │
                   │ Transferable Float32Array Frame + Expected Score Hints│
                   ▼                                                       │
┌──────────────────────────────────────────────────────────────────────────┐
│        CALIBRATED 61-KEY POLYPHONIC + SCORE-INFORMED DSP ENGINE          │
│ • 4096 Blackman-Harris Window (-92 dB) → 8192-Point Radix-2 FFT          │
│ • Calibrated Room Noise Spectral Subtraction (25 Hz bands)               │
│ • Local Spectral Peak Extraction & Physical Odd-Harmonic Gate            │
│ • Multiplicative KL-Divergence NMF over 61-Key 10-Harmonic Dictionary    │
│ • Overtone Excess Filter + Positive Spectral Flux Onset + Sustain Bridge │
│ • Score-Informed Hypothesis Fusion (Flow & Wait Target Verification)     │
└──────────────────┬───────────────────────────────────────────────────────┘
                   │ activeNotes[], onsetNotes[] (Single Notes, Dyads, Chords)
                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│             POLYPHONIC NOTE EVALUATOR, GAME ENGINE & GAMIFICATION            │
│ • Flow Mode: Simultaneous multi-note scoring (±140 ms Perfect / ±280 ms Good)│
│ • Wait Mode: Chord cluster freeze (`currentWaitChord`), per-note green hits  │
│ • Independent Hand Practice (`L Left` / `R Right` + Curriculum `targetHands`)│
│ • `onSongComplete` → `ProgressManager` (0–3 ★, XP, 6 Ranks, Streaks, Badges) │
└──────────────┬───────────────────────────────────────────┬───────────────────┘
               │ Render State & Key Highlights             │ Independent Audio Buses
               ▼                                           ▼
┌─────────────────────────────────────────┐ ┌──────────────────────────────────┐
│   STUDIO OBSIDIAN & IVORY PRESENTATION  │ │   HEADPHONE AUDIO ARCHITECTURE   │
│ • 60 FPS Retina Canvas & Ledger Lines   │ │ • BackingTrackEngine (ALWAYS ON  │
│ • Calm Non-Punitive Feedback (Zero Red) │ │   stereo pad, bass & brushes)    │
│ • Parabolic Note-to-Note 3D Spheres     │ │ • Play-Along Toggle: Mutes/plays │
│ • Canonical 5-Finger Color DP Engine    │ │   ONLY piano score guide notes!  │
│ • 61-Key 3D Keyboard + Completion Modal │ │ • Wooden Metronome + Key Synth   │
└─────────────────────────────────────────┘ └──────────────────────────────────┘
```

---

## 2. Minimal Conservatory Home, Multi-View Navigation & Gamification

### 2.1 Four Seamless Views (`Home` · `Learn` · `Songs` · `Studio`) & Collision-Free Layout
A dedicated `50px` global `.app-header` holds strictly the brand (`#btnBrandHome` + `61-Key` badge), primary view pills (`Home | Learn | Songs | Studio`), and the gamification status pill (`#headerGamificationPill`: Streak · Rank · XP) across all screens, while Studio-specific controls live inside `#viewStudio`'s own contextual sub-bar (`.studio-toolbar`) and 2-row transport deck (`footer.control-dock`) — guaranteeing zero element overlap across `900px`–`1920px+` viewports:
1. **Minimal Home Page (`#viewHome` — Default Landing View)**:
   - **Above-the-Fold Flex Layout**: Uses overflow-safe `margin: auto` flex centering (`200px` hero card min-height) so the entire conservatory landing screen fits cleanly without vertical clipping on `1280×800` and `1440×900` laptop displays.
   - **Welcome & Mastery Strip**: Displays single-line `61-KEY PERSONAL CONSERVATORY · C2–C7` eyebrow, current **Pianist Rank**, live XP progress bar to the next rank, **Daily Practice Streak**, **Curriculum Completion %** (`X/108 parts`), **Mastery Stars (`★`)**, and a 1-click **`Continue Lesson →`** button that resumes your exact next uncompleted curriculum part.
   - **Two Primary Hero Cards**:
     - **Learn (`#heroCardLearn`)** — *Structured Curriculum · Levels 1–9*: Step-by-step conservatory progression pairing Solo & Chords in every lesson.
     - **Songs (`#heroCardSongs`)** — *Repertoire & Headphone Accompaniment*: Full 61-key repertoire and imported arrangements backed by stereo headphone accompaniment.
   - **Quick-Utility & Milestones Strip**: Instant access to *Open Free Studio* (clears any active lesson into free repertoire mode), *Import Sheet / MIDI / MusicXML*, *61-Key Acoustic Data Trainer (`0/28`)*, and unlocked conservatory milestone pills.
2. **Learn View (`#viewLearn` — Levels 1–9 Syllabus)**:
   - **Zero-Overflow Level `1` → Level `9` Selector Rail (`#levelTabsRail`)**: Uses `repeat(9, minmax(0, 1fr))` on desktop (`repeat(3, minmax(0, 1fr))` at `≤960px`) so all 9 levels fit in one clean row with unclipped titles (*Piano Foundations* through *Virtuoso Mastery*), completion capsules, and star counts.
   - **Lesson Cards & Multi-Part Rows**: Each level displays 4 expandable lesson cards (`Solo`, `Chords`, `Chords & Solo` focus badges) containing **3 playable parts** (`Part 1: Solo`, `Part 2: Chords`, `Part 3: Combined`). Every part row includes a clickable completion checkmark, `★ ★ ★` rating, part-type badge, key & BPM, best accuracy %, and a **`Practice`** button that launches Studio with `part.targetHands` automatically configured.
3. **Songs View (`#viewSongs` — Repertoire Play-Alongs)**:
   - Deduplicated responsive grid (`minmax(min(100%, 310px), 1fr)`) combining `SONG_LIBRARY`, server-persisted `songs_data/*.json` (`/api/songs`), and `localStorage` custom imports, complete with *All* / *Completed* / *In Progress* filter pills, instant title/artist search, clickable manual completion toggles, `+ Import Piece`, and 1-click **`Play Along`**.
4. **Studio View (`#viewStudio` — Contextual `.studio-toolbar` + 60 FPS Staves + 61-Key Keyboard + 2-Row `.control-dock`)**:
   - **Contextual Studio Sub-Bar (`.studio-toolbar`)**: Positioned directly above `<main class="main-stage">`, pairing **mutually exclusive piece navigation** on the left (`#studioHeaderControls`, `updateStudioCurriculumBar()`) with acoustic microphone/tuner controls (`.mic-control-bar`) and the 5-finger color legend (`#studioRightHints`) on the right:
     - *Curriculum Lesson Part Mode (`activeCurriculumPartId` set)*: Shows `#studioCurriculumBar` (`← Learn` · `Lv X · Lesson Y · Part Z/3 — Part Title` · `Next Part →` · `Free Mode` `#btnStudioFreeMode`) while **hiding** `#studioSongSelectWrap` (`Piece` dropdown) and `#btnOpenImport` (`+ Import`).
     - *Song Play-Along / Free Studio Mode (`activeCurriculumPartId === null`)*: Hides `#studioCurriculumBar` and displays `#studioSongSelectWrap` (`#songSelect` with custom SVG chevron + clean ellipsis up to `410px` width), `+ Import` (`#btnOpenImport`), and `Data Trainer` (`#btnOpenTrainer`).
   - **Resize-Safe Retina Staves & Scoped Toasts**: `ResizeObserver` + `window` `resize` (`_handleStudioResize()`) automatically redraws `#yousicianCanvas` even while paused, all `61/61` keys (`C2–C7`) remain unclipped without vertical scrolling, and `#appToastContainer` anchors cleanly in the dark margin above `#pianoKeyboard` (`bottom: 216px`) while auto-clearing (`clearToasts()`) across view, piece, and modal transitions.
   - **2-Row Compact Studio Control Deck (`footer.control-dock`)**: Places the full-width song timeline scrubber (`#timeCurrent` ── `#timelineSlider` ── `#timeTotal`) in `.dock-scrubber-row` above a single-row `.dock-main-row` (`63px` total deck height across `1200px–1920px`, clean 2-row wrap on narrow screens) grouping transport/mode/`L`/`R` hands (`.dock-left`), tempo/presets (`.dock-center`), and `Play-Along` / `Backing` / metronome / piano volume (`.dock-right`).

### 2.2 Gamification & Mastery Progression (`js/gamification/progress.js`)
Persisted automatically in `localStorage` (`"yousician_piano_progress_v1"`, with probe-checked in-memory fallback for headless `jsc`):
- **Star Thresholds (`0–3 ★`)**:
  - **`3 ★`**: `accuracy >= 92%`
  - **`2 ★`**: `accuracy >= 75%`
  - **`1 ★`**: `accuracy >= 50%` (or completing a piece end-to-end in `Wait` mode)
- **Cascading & Manual Completion**: Completing a part (`>= 1 ★` or clicking its manual completion toggle) updates `parts[partId]`. Completing all 3 parts of a lesson automatically marks the **Lesson** complete (`+40 XP` milestone bonus), and completing all 4 lessons in a level automatically marks the **Level** complete (`+120 XP` milestone bonus). Players can also click the checkmark on any part, lesson, or song to manually mark/unmark completion.
- **XP Ledger & 6 Pianist Ranks**: Awards `xpReward × starMultiplier` (`1.0×`–`1.5×`) plus precision/practice bonuses across 6 conservatory ranks:
  1. **Initiate** (`0 XP`) → 2. **Apprentice** (`250 XP`) → 3. **Lyricist** (`650 XP`) → 4. **Harmonist** (`1,300 XP`) → 5. **Virtuoso** (`2,400 XP`) → 6. **Concert Master** (`4,000+ XP`).
- **Daily Practice Streak & 8 Achievements**: Tracks consecutive UTC practice days and unlocks 8 conservatory badges (*First Steps*, *Chord Explorer*, *Two-Hand Harmony*, *95%+ Precision*, *Golden Touch*, *Dedicated Pianist*, *Level Complete*, *Concert Repertoire*).
- **End-of-Piece Completion Modal (`#completionModal`)**: Automatically opens `0.45s` after the final active note finishes (`GameEngine.onSongComplete`), presenting animated SVG stars, accuracy %, `+XP` gained, Perfect/Good/Missed timing breakdown, rank progress bar, newly unlocked badges, and **`Next Part →`** / **`Replay`** / **`Back to Learn | Songs`** actions.

---

## 3. Structured Piano Curriculum (Levels 1–9 · Chords & Solo Play)

Grounded in comparative piano pedagogy research ([`docs/CURRICULUM_RESEARCH.md`](./docs/CURRICULUM_RESEARCH.md) — synthesizing Yousician Levels 1–9, Alfred's Basic Adult All-In-One, Faber Adult Piano Adventures, and ABRSM/RCM Grades 1–6 adapted specifically for a 61-key `C2..C7` keyboard), `js/curriculum/{levels_1_to_4,levels_5_to_9,index}.js` delivers **9 levels · 36 lessons · 108 playable pieces (`7,923` notes · `1,192` same-hand chords)**.

### 3.1 Unified 3-Part Lesson Triad
Every single lesson across Levels 1–9 contains **3 distinct 8-to-16 measure pieces** so learners develop melodic sight-reading and harmonic chord comping side-by-side:
1. **Part 1 (`partType: "solo"`)**: Melodic reading, scalar/interval dexterity, thumb-under crossings, phrasing, or classical/blues solo riffs (`36` solo parts).
2. **Part 2 (`partType: "chords"`)**: Harmonic dyads, root & inverted triads, slash-chord basslines, Alberti patterns, and 7th/9th groove comping (`36` chord parts).
3. **Part 3 (`partType: "combined"`)**: Full bimanual capstone piece uniting Part 1's melodic vocabulary with Part 2's harmonic accompaniment over stereo headphone backing music (`36` combined parts).

### 3.2 Levels 1–9 Syllabus Map (`7,923` Verified Curriculum Notes)

| Level | Title & Grade Tier | Register (`MIDI`) | Keys & Meters | Solo & Chords Skills (`4 Lessons × 3 Parts = 12 Parts/Level`) | Headphone Backing Styles |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **Piano Foundations & RH C Position** *(Pre-Grade 1)* | `B3..G4` (`59..67`) | `C` · `4/4` (`72–84 BPM`) | RH `C4–G4` (`T..4`) steps, skips, breath rests & first 2-note harmonic dyads (`C4+E4` `1-3`, `C4+G4` `1-5`); `targetHands: RH` | `warm_pad`, `acoustic_pop` |
| **2** | **Left-Hand Bass & Two-Hand Entry** *(Pre-Grade 1)* | `C3..G4` (`48..67`) | `C`, `Am` · `4/4`, `3/4` (`76–88 BPM`) | LH `C3–G3` (`5..1`) bass walks, open 5th dyads (`5-1`), alternating hands → synchronized Beat-1 two-hand coordination | `warm_pad`, `waltz_chamber`, `acoustic_pop` |
| **3** | **Primary Chords & Comping Grooves** *(Grade 1)* | `A2..C5` (`45..72`) | `C`, `Am` · `4/4`, `3/4` (`84–98 BPM`) | Root-position `C`, `F`, `G`, `Am` triads (`1-3-5` RH / `5-3-1` LH), broken-chord patterns, LH chord + RH melody & RH comping + LH bass | `acoustic_pop`, `warm_pad`, `waltz_chamber` |
| **4** | **New Keys (`G`, `F`, `Am`), 8ths & Shifts** *(Grade 1–2)* | `G2..E5` (`43..76`) | `G`, `F`, `Am`, `C` · `4/4`, `3/4`, `2/4` (`88–102 BPM`) | Straight 8th notes, dotted quarters, `F#` & `Bb` black-key topography (zero thumb-on-black-key scalar notes), `1-2-3-1-2-3-4-5` thumb-under shifts | `acoustic_pop`, `classical_strings`, `waltz_chamber` |
| **5** | **Inversions, Slash Chords & Ballads** *(Grade 2–3)* | `F#2..G5` (`42..79`) | `D`, `Em`, `C`, `G` · `4/4`, `6/8` (`68–100 BPM`) | 1st/2nd triad inversions (`1-2-5`, `5-2-1`) for smooth voice leading, stepwise slash basslines (`C/B–Am7–Am/G–F`, `D/F#`), pop ballad comping | `acoustic_pop`, `warm_pad`, `cinematic_pulse` |
| **6** | **16th-Note Agility & Classical Alberti Bass** *(Grade 3)* | `E2..A5` (`40..81`) | `C`, `Am`, `G`, `D` · `4/4`, `3/4`, `3/8` (`76–112 BPM`) | 16th-note scalar agility, `4/4` & `3/8` Alberti bass (`5-1-3-1`), `3/4` salon waltz, and two-voice Baroque imitation | `classical_strings`, `waltz_chamber` |
| **7** | **Minor Scales, 7th Chords & Soul/Blues** *(Grade 4)* | `D2..C6` (`38..84`) | `Am`, `Dm`, `Em`, `F`, `G` · `4/4`, `6/8` (`78–108 BPM`) | 4-note `maj7`/`m7`/`dom7` voicings (`1-2-3-5` / `5-3-2-1`) & guide-tone shells, harmonic minor arpeggios, 12-bar blues riffs & Neo-Soul grooves | `jazz_brushes`, `acoustic_pop`, `cinematic_pulse` |
| **8** | **Expressive Polyphony & Modulations** *(Grade 4–5)* | `C2..E6` (`36..88`) | `Bm`, `Bb`, `Eb`, `Am→C→D` · `6/8`, `3/4`, `4/4` (`64–104 BPM`) | Romantic `6/8` nocturne in B Minor, wide broken-tenth & octave bass in `Bb` & `Eb` Major, secondary dominants & pivot modulations | `classical_strings`, `waltz_chamber`, `cinematic_pulse` |
| **9** | **Virtuoso 61-Key Mastery & Capstones** *(Grade 5–6)* | `C2..C7` (`36..96`) | `C`, `F`, `A`, `D`, `Dm` · `4/4`, `6/8`, `3/4` (`88–124 BPM`) | Rootless `9th`/`13th` jazz voicings, full 5-octave `C2..C7` cascades, cinematic `add9`/`maj7` towers, and 16-bar D Major concert finale | `cinematic_pulse`, `jazz_brushes`, `classical_strings` |

> **Anatomical Chord & Acoustic Low-Interval Invariants**: Across all `1,192` same-hand curriculum chords, Right-Hand ascending pitches strictly map to increasing fingers (`1 < 2 < 3 < 4 < 5`), Left-Hand ascending pitches strictly map to decreasing fingers (`5 > 4 > 3 > 2 > 1`), zero duplicate fingers occur within any simultaneous chord, and close-position 3-note LH triads stay at or above `C3` (`MIDI 48`) so low piano thirds never muddy the headphone backing bass.

---

## 4. Stereo Headphone Backing Band vs. Play-Along Piano Toggle

Engineered specifically for **headphone piano play-along**, `js/audio/backing_track.js` (`BackingTrackEngine`), `js/audio/synth.js` (`PianoSynthesizer`), and `js/engine/game.js` (`GameEngine`) enforce a strict two-bus Web Audio split:

| Audio Control | Engine Property & UI Control | Default | Exact Headphone Behavior |
| :--- | :--- | :---: | :--- |
| **Song Backing Music** | `game.backingAudioEnabled` (`#btnBackingToggle` + `#backingVolumeSlider`) | **`ON` (`65%`)** | **ALWAYS plays** whenever the piece is advancing (`isPlaying && !isWaiting`), synthesizing stereo harmonic pads, bass, and studio rhythm synchronized to `bpm × tempoMultiplier`, `timeSignature`, and `chords` — **even when `Play-Along` is turned `OFF`!** |
| **Play-Along Piano Notes** | `game.referenceAudioEnabled` (`#btnPlayAlongToggle`) | **`ON`** | **Exclusively plays or mutes the piano score guide notes** (`synth.playNote`) crossing the playhead. Turn **`Play-Along OFF`** once you know the notes to play solo piano on your keyboard over the full headphone band! |

### Headphone Mix & Synthesis Architecture (`js/audio/backing_track.js`)
- **Center Piano Clarity Pocket (`220 Hz – 1.4 kHz`)**: Stereo-panned (`±0.46..0.60`) detuned analog/string pads pass through a `160 Hz` high-pass filter and `960–1320 Hz` warm low-pass roll-off (`2800 Hz` master warmth bus), leaving the center frequency image open for your live acoustic or MIDI piano.
- **Slash-Chord & Sub-Bass Precision (`55 Hz – 190 Hz`, Center Pan `0.0`)**: `parseChordSymbol` supports triads, 7ths, 9ths, `sus2`/`sus4`, `dim`/`m7b5`/`aug`, split-bar changes (`"G → C"`), and explicit **slash-chord bass notes** (`D/F#` → `F#2`, `G/B` → `B2`, `C/G` → `G2`).
- **Automatic Harmonic Analyzer (`inferChordsFromNotes`)**: Imported MIDI, MusicXML, or QuickComposer scores without explicit chord symbols are analyzed measure-by-measure with diatonic key priors so every custom import automatically receives musical backing accompaniment.
- **Six Musical Backing Styles**: `"warm_pad"`, `"acoustic_pop"`, `"classical_strings"`, `"waltz_chamber"`, `"jazz_brushes"`, and `"cinematic_pulse"` (with automatic genre/meter resolution for built-in repertoire, e.g., `6/8` ballad cradle on *Wise Men Say* and `3/8`–`3/4` chamber strings on *Für Elise* & *Minuet in G*, plus subtle preparatory harmony during negative count-in beats).
- **Zero Hanging Voices**: Pausing, freezing on a `Wait`-mode chord (`isWaiting === true`), seeking, restarting, or switching views triggers a click-free `30 ms` exponential release (`stopAll()`, `getActiveVoiceCount() === 0`).

---

## 5. 61-Key Keyboard Alignment & Pitch Mapping

Every subsystem — visual keyboard, pitch detector, curriculum levels, song library, MIDI/MusicXML/OMR parsers, and the 28-step calibration trainer — is aligned to a standard **5-octave, 61-key keyboard** (`36` white keys + `25` black keys):

| Landmark Key | Scientific Note | MIDI Note | Fundamental $f_0$ | 61-Key Index (`#1–#61`) | White Key Index (`#1–#36`) | Staff Default |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Leftmost Key** | `C2` | `36` | `65.41 Hz` | **Key #1** | **White Key #1** | Bass |
| **2nd C** | `C3` | `48` | `130.81 Hz` | **Key #13** | **White Key #8** | Bass |
| **Tenor A** | `A3` | `57` | `220.00 Hz` | **Key #22** | **White Key #13** | Bass |
| **Middle C (3rd C)** | `C4` | `60` | `261.63 Hz` | **Key #25** | **White Key #15** | Treble |
| **Concert Pitch A440** | `A4` | `69` | `440.00 Hz` | **Key #34** | **White Key #20** | Treble |
| **4th C** | `C5` | `72` | `523.25 Hz` | **Key #37** | **White Key #22** | Treble |
| **5th C** | `C6` | `84` | `1046.50 Hz` | **Key #49** | **White Key #29** | Treble |
| **Rightmost Key (6th C)** | `C7` | `96` | `2093.00 Hz` | **Key #61** | **White Key #36** | Treble |

> **Scientific Pitch Notation Note**: Octave numbers increment on **C** (not A). Therefore `C3..B3` all belong to octave 3 (`A3` = Key `#22`), and octave 4 begins at Middle `C4` (`Key #25`), making `A4` (`440 Hz`) Key `#34`. All imported MIDI, MusicXML, and OMR scores automatically octave-fold out-of-bounds notes into `[36, 96]` while preserving pitch class.

---

## 6. Calibrated Polyphonic Audio DSP & Note Detection Engine

### 6.1 Why Calibration & Polyphonic Deconvolution Were Needed
Acoustic profiling of the 28 recorded WAV samples (`audio_dataset/samples/`) revealed three physical characteristics of the 61-key keyboard + room microphone setup:
1. **Missing Fundamental in Deep Bass (`C2–C3`)**: On `C2` (`65.41 Hz`), the fundamental $h_1$ carries **`0.0%`** of the spectral energy (`[0.00, 0.00, 0.32, 0.41, 0.19, 0.81]`), while `B2` and `C3` concentrate over `80%` of their energy in $h_2$ (`2f_0`). Uncalibrated pitch trackers either miss bass notes or jump up `+1` to `+2` octaves.
2. **Sharp Sample-Layer Transition (`D4` → `E4`)**: Keys `C3–D4` exhibit strong 2nd-harmonic resonance ($h_2 \approx 0.66\text{–}0.91$), whereas from `E4` (`MIDI 64`) through `C7` (`MIDI 96`), $h_1$ carries **`90%–100%`** of total note energy.
3. **Polyphonic Harmonic Overlap**: Monophonic time-domain autocorrelation (YIN) can only emit a single pitch period per frame, failing completely (`0/6` exact chord matches) when playing octaves (`C3+C4`), fifths (`C4+G4`), triads (`C4+E4+G4`), or two-hand accompaniment (`B2+B4`).

### 6.2 Six-Stage Hybrid Detection Pipeline (`js/audio/polyphonic_detector.js`)
1. **Raw Stream + Off-Main-Thread `AudioWorklet` (`js/audio/piano_worklet.js`)**:
   - Captures raw `Float32` PCM (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`) filtered by a 2nd-order Butterworth high-pass filter at **$52\text{ Hz}$** ($Q = 0.7$).
   - `PianoCaptureWorkletProcessor` accumulates `128`-sample render quanta into a lock-free `4096`-sample circular buffer and posts overlapping frames every `1024` samples (`~21.3 ms` at `48 kHz`) via transferable `ArrayBuffer`s so DSP never blocks 60 FPS Canvas rendering.
2. **Blackman-Harris Windowed `8192`-Point FFT & Spectral Noise Subtraction**:
   - Applies a 4-term Blackman-Harris window (`-92 dB` sidelobe suppression, eliminating adjacent-semitone skirt leakage) zero-padded to an `8192`-point in-place Radix-2 FFT (`5.86 Hz/bin` at `48 kHz`).
   - Subtracts `1.8×` the calibrated `25 Hz`-band room noise floor extracted from `step_01_silence.wav`.
3. **Local Spectral Peak Extraction & Physical Acoustic Gate**:
   - Extracts true local maxima ($\text{clean}[k] \ge \text{clean}[k-1]$ and $\text{clean}[k] \ge \text{clean}[k+1]$) within $\pm 23\text{ cents}$ of each inharmonically stretched partial:
     $$f_h = h \cdot f_0 \sqrt{1 + B_m \cdot h^2}, \quad h \in \{1,\dots,10\}$$
   - **Tenor/Treble Gate (`MIDI 52..96`, `E3–C7`)**: Requires a true local spectral peak at $f_0$ ($h_1$) plus $\ge 55\%$ weighted harmonic completeness.
   - **Deep Bass Odd-Harmonic Gate (`MIDI 36..51`, `C2–D#3`)**: Requires local peaks at **$\ge 2$ odd harmonics** among $\{h_1, h_3, h_5, h_7\}$ (each $> 3\%$ of frame peak) and suppresses phantom sub-octave roots on upper major triads (`m+12, m+16, m+19` where $2 \times \text{Maj3rd} \approx 5 f_0$ within $+13.7\text{¢}$) unless $h_1$ or $h_7$ is independently present.
4. **Multiplicative KL-Divergence NMF Deconvolution**:
   - Solves $\mathbf{v}_{\text{peak}} \approx \mathbf{W}_{\text{cal}} \mathbf{a}$ over candidate keys in 20 fast multiplicative Kullback-Leibler updates using the calibrated 61-key dictionary (`js/audio/calibrated_profile.js`), executing in **`~0.4 ms` per frame** in JavaScript.
5. **Overtone Excess Verification, Spectral Flux Onsets & Sustain Bridge**:
   - Verifies candidate octaves (`+12` semitones via even-to-odd harmonic peak ratio $h_2/h_3$) and upper harmonics (`+19, +24, +28, +31, +34, +36` semitones) so harmonic overtones of single bass keys never trigger false upper notes while genuine octaves (`C3+C4`, `B2+B4`) pass cleanly.
   - Tracks positive spectral flux and per-key activation jumps to trigger crisp `onsetNotes` on repeated strikes, while a 2-frame hold bridge prevents chord readout flicker during acoustic beating dips.
6. **Score-Informed Hypothesis Fusion**:
   - During active **Flow** or **Wait** gameplay, `GameEngine.getExpectedMidisAtPlayhead()` passes upcoming score pitches as mild priors into NMF, lowering onset latency to a single hop frame (`~21 ms`) on expected notes while maintaining strict thresholds to catch genuine `WRONG NOTE` strikes.

---

## 7. Quantitative Benchmark Results (28 Acoustic Recordings)

Generated reproducibly via `python3 scripts/calibrate_and_benchmark.py` (full per-step breakdown in [`CALIBRATION_BENCHMARK_REPORT.md`](./CALIBRATION_BENCHMARK_REPORT.md), research rationale in [`NOTE_DETECTION_RESEARCH.md`](./NOTE_DETECTION_RESEARCH.md)).
- **Zero Data Leakage Protocol**: Single-note calibration anchors (`steps 02–20`) are evaluated under **Leave-One-Out Cross-Validation (LOOCV)** (each note's own template is excluded when testing that recording and interpolated solely from neighboring keys). Silence, Dynamics, Intervals, Chords, and Play-Along (`steps 01, 21–28`) are 100% unseen held-out test recordings.

| Detection Architecture | Overall F1 (All 28) | Overall Recall | Polyphonic Chord F1 (Steps 23–28) | Exact Chord Match (Steps 23–28) |
| :--- | :---: | :---: | :---: | :---: |
| **1. Baseline Monophonic YIN** (`js/audio/pitch.js`) | `71.87%` | `63.89%` | `19.05%` | `0 / 6` (`0.0%`) |
| **2. Uncalibrated Generic Polyphonic KL-NMF** ($1/h$) | `84.62%` | `91.67%` | `93.33%` | `5 / 6` (`83.3%`) |
| **3. Calibrated 61-Key Polyphonic (LOOCV + Zero-Shot)** | **`94.74%`** | **`100.00%`** | **`100.00%`** | **`6 / 6` (`100.0%`)** |
| **4. Hybrid Score-Informed + Calibrated Engine** | **`94.74%`** | **`100.00%`** | **`100.00%`** | **`6 / 6` (`100.0%`)** |

All 6 held-out polyphonic recordings — `C3+C4` (Octave), `C4+G4` (Fifth), `C4+E4+G4` (C Major), `G3+B3+D4` (G Major), `A3+C4+E4` (A Minor), and `B2+B4` (Yousician Groove Two-Hand Motif) — achieved **100% Precision and 100% Recall**.

---

## 8. 28-Step Acoustic Sound Trainer & Live Recalibration

Accessible from the **Home** utility bar (`61-Key Acoustic Data Trainer`) or the **Studio** header (`Data Trainer`, `js/trainer/`):
- **28 Guided Steps**:
  - `Step 1`: Ambient Room Silence (`3.0s` noise floor & spectral profile).
  - `Steps 2–8`: 7 Bass Anchors (`C2, G2, B2, C3, E3, G3, A3` — Keys `#1` to `#22`).
  - `Steps 9–20`: 12 Treble Anchors (`C4, D4, E4, F4, G4, A4, B4, C5, D5, G5, C6, C7` — Keys `#25` to `#61`).
  - `Steps 21–22`: Soft (`p`) and Loud (`f`) Touch Dynamics on Middle `C4` (`Key #25`).
  - `Steps 23–24`: Harmonic Intervals (`C3+C4` Octave, `C4+G4` Perfect Fifth).
  - `Steps 25–27`: 3-Note Triads (`C Major`, `G Major`, `A Minor`).
  - `Step 28`: Two-Hand Yousician Groove Play-Along (`B2 + B4`).
- **Clean Acoustic Capture**: Unchecks synthetic reference playback during recording by default and inserts a `45 ms` buffer after the downbeat metronome click so wooden click transients never bleed into WAV samples.
- **One-Click Live Recalibration (`Recalibrate Detector`)**: Runs `scripts/calibrate_and_benchmark.py` on the backend via `POST /api/dataset/recalibrate`, regenerates `js/audio/calibrated_profile.js` + `audio_dataset/calibrated_profile.json`, and hot-reloads the new 61-key dictionary directly into the active `PianoMicrophone` instance without restarting the browser or server.

---

## 9. Practice Modes, Polyphonic Scoring, 5-Finger Colors & Visual Engine

- **Automatic Empty-Beat Count-In (Lead-In)**:
  - Every curriculum part, built-in song, or imported score automatically starts with 1–2 measures of empty count-in beats (`~2.2s–3.2s`, `startTime = -leadInBeats * (60 / bpm)`) with dashed count-in beat lines, metronome clicks, gentle preparatory backing harmony, opening-chord key previews on the 61-key keyboard, and free-play immunity before Beat 1.
- **Flow Mode (Continuous Tempo & Subtle Non-Punitive Feedback)**:
  - Simultaneously scores all pitches in `onsetNotes[]` against pending notes within `±140 ms` (**PERFECT**, Soft Sage `#6EE7B7`, `+100 × mult`) or `±280 ms` (**EARLY / LATE**, Warm Champagne `#E2C98A`, `+60 × mult`), accompanied by a delicate concentric water-ripple ring at the note head, up to 3 fine luminous dust motes, and a deduplicated `10.5px` whisper micro-label (`Perfect` / `Early` / `Late`).
  - **Calm, Non-Punitive Error Cues (Zero Harsh Red Pops)**:
    - **Missed Notes**: Produce **zero** floating text banners and **zero** particle bursts; unhit score pills quietly settle into desaturated translucent ghost capsules on the staff (`#64748B`).
    - **Off-Target Key Strikes**: Produce **zero** harsh red flashes or `"WRONG NOTE"` popups; instead, a transient `380 ms` hollow translucent ghost capsule appears at `(playheadX, noteY)` on the staff (`#94A3B8`), paired with a calm muted-slate key press (`#8B95A5`) on the 61-key keyboard.
  - **Sustained-Note Immunity**: Ringing notes already hit on the current or previous beat are tracked so sustained chords never trigger false off-target resets.
- **Wait Mode (Auto-Pause Chord & Note Practice)**:
  - Groups all simultaneous notes within `55 ms` into `currentWaitChord`, cleanly releasing background backing oscillators while frozen at the beat, rendering gentle warm champagne halos around pending chord pills, lighting each constituent chord pill and 3D key in satin sage as soon as it is struck, and automatically resuming backing music and score motion once all active-hand notes in the beat cluster are satisfied.
- **Independent Left & Right Hand Practice Toggles (`L Left` / `R Right`)**:
  - Toggle either hand ON or OFF via the bottom dock buttons (`L Left` / `R Right`), keyboard shortcuts **`L`** / **`R`**, or clicking the subtle muted-staff pill directly on the Canvas (also auto-set per curriculum part via `part.targetHands`).
  - **Blurred Staff & Zero Accuracy Reporting on Disabled Hand**: Optically blurs and dims the disabled staff lane, suppresses all note accuracy evaluation for that hand, restricts `Wait` freezes, 61-key previews, DSP priors, and `Play-Along` piano synth guide notes strictly to enabled hand(s), and marks elapsed notes `"skipped"` on mid-song re-enable.
- **Pedagogical 5-Finger Color Scheme & Automatic Fingering Engine (`js/engine/fingering.js`, [`PIANO_FINGERING_RESEARCH.md`](./PIANO_FINGERING_RESEARCH.md))**:
  - Verified across **`8,525 / 8,525` (`100.0%`)** curriculum and repertoire notes:
    - **Thumb (`T` / Piano `1`)**: Green (`#48A870`, highlight `#74C695`)
    - **Index (`1` / Piano `2`)**: Golden Yellow (`#F0C830`, highlight `#F8E080`)
    - **Middle (`2` / Piano `3`)**: Indigo-Purple (`#6848F8`, highlight `#B0A0F8`)
    - **Ring (`3` / Piano `4`)**: Sky-Cobalt Blue (`#4090F8`, highlight `#98D8F8`)
    - **Pinky (`4` / Piano `5`)**: Coral-Red (`#E86078`, highlight `#F0A8B8`)
  - Uses a 2nd-Order Viterbi Dynamic Programming solver grounded in Parncutt (1997), Jacobs (2001), and Nakamura (2014) ergonomics.
- **Independent Parabolic Bouncing Balls (`YousicianRenderer.computeBallPosition`)**:
  - Each staff's alabaster 3D sphere jumps smoothly and independently from the head of its current note/chord (`event[i].time`) directly to the head of its next note (`event[i+1].time`) at constant horizontal speed (`pixelsPerSecond = 180 px/s`) along a uniform-gravity parabolic trajectory.
- **Built-In & Persisted 8-Song 61-Key Repertoire (`602` Verified Notes across `js/songs/library.js`, `songs_data/*.json`, and `samples/*`)**:
  1. *"Wise Men Say (Can't Help Falling in Love)"* — Elvis Presley (`D Major`, `6/8` at exact `♩. = 63.3333 BPM`, `92` measures, `299` notes: `175` LH + `124` RH).
  2. *"Yousician Groove"* — Yousician Exercise (`D Major`, `4/4` at `100 BPM`, `8` measures, `42` notes: `22` LH + `20` RH).
  3. *"Für Elise"* — Ludwig van Beethoven (`A Minor`, `3/8` at `♪ = 120 BPM`, `9` measures with Beat-3 pickup, `53` notes: `18` LH + `35` RH).
  4. *"Ode to Joy"* — Ludwig van Beethoven (`C Major`, `4/4` at `110 BPM`, `8` measures, `45` notes: `15` LH + `30` RH).
  5. *"Canon in D"* — Johann Pachelbel (`D Major`, `2/4` at `75 BPM`, `17` measures, `34` notes: `17` LH + `17` RH).
  6. *"Amazing Grace"* — Traditional Hymn (`songs_data/amazing_grace.json` & `samples/amazing_grace.mid`, `G Major`, `3/4` at `90 BPM`, `17` measures, `51` notes).
  7. *"Happy Birthday"* — Traditional (`songs_data/happy_birthday.json` & `samples/happy_birthday.musicxml`, `C Major`, `3/4` at `105 BPM`, `9` measures, `34` notes).
  8. *"Minuet in G (BWV Anh. 114)"* — J.S. Bach / C. Petzold (`songs_data/minuet_in_g.json` & `samples/minuet_in_g.musicxml`, `G Major`, `3/4` at `110 BPM`, `8` measures, `44` notes).

---

## 10. Score Ingestion & OMR Pipeline

Click **"Import"** on Home, Songs, or Studio to convert external music into playable 61-key Yousician tracks — every ingestion pathway aligns note timestamps to measure barlines starting at `t = 0.0000s`, applies `25 ms` visual/audio articulation separation (`gridDur - 0.025s`), assigns ergonomic 5-finger colors, and automatically receives measure-by-measure headphone backing accompaniment (`inferChordsFromNotes`):
1. **Sheet Music Image (Gemini Vision AI OMR)** (`js/parser/sheet.js`): Transcribes PNG/JPG/WebP sheet music photos into structured dual-staff notes, chords, time/key signatures, clefs, printed fingerings, and BPM via Gemini Multimodal Vision (`gemini-2.5-flash`).
2. **Standard MIDI (`.mid` / `.midi`)** (`js/parser/midi.js` & `server.py`): Binary SMF parser decoding `MThd`/`MTrk` chunks, tempo (`0xFF 0x51`), time signature (`0xFF 0x58`), and key signature (`0xFF 0x59`) meta events, whole-bar empty prefix stripping, bimanual hand partitioning, and `[36, 96]` octave folding.
3. **MusicXML (`.musicxml` / `.xml`)** (`js/parser/musicxml.js`): Parses `<part>`, `<measure>` (including pickup Measure `0`), `<pitch>`, `<chord>`, `<backup>`, `<beats>`/`<beat-type>`, `<fifths>`/`<mode>`, `<harmony>`, and `<fingering>`.
4. **Quick Score Shorthand Composer** (`js/parser/sheet.js`): Instant barline-aligned text-to-song compiler (`Treble: B4:1, D5:1 | ...` / `Bass: B2:0.5, G2:0.5 | ...`).

---

## 11. Project Structure & HTTP API Reference

```text
piano-app/
├── index.html                        # Multi-view SPA shell (Home, Learn, Songs, Studio & Modals)
├── style.css                         # Studio Obsidian & Acoustic Ivory UI, 3D 61-key & catalog styles
├── server.py                         # Zero-dependency Python 3 HTTP & REST API server
├── README.md                         # Architecture, curriculum, audio split & developer guide
├── NOTE_DETECTION_RESEARCH.md        # Polyphonic DSP research & literature review
├── PIANO_FINGERING_RESEARCH.md       # Ergonomic APF literature review & Viterbi DP math
├── CALIBRATION_BENCHMARK_REPORT.md   # Auto-generated 28-sample benchmark & harmonic tables
│
├── docs/
│   └── CURRICULUM_RESEARCH.md        # 61-key piano pedagogy & Levels 1–9 syllabus blueprint
│
├── scripts/
│   └── calibrate_and_benchmark.py    # Pure-Python 61-key calibration & LOOCV benchmark suite
│
├── js/                               # 27 Zero-Dependency Vanilla ES Modules
│   ├── app.js                        # Main PianoApp multi-view router, Studio & Gamification UI
│   ├── audio/
│   │   ├── backing_track.js          # Stereo headphone accompaniment synth & chord analyzer
│   │   ├── calibrated_profile.js     # Generated 61-key harmonic templates, B & noise profile
│   │   ├── polyphonic_detector.js    # 8192-FFT + KL-NMF + Odd-Harmonic + Score-Informed DSP
│   │   ├── piano_worklet.js          # Off-main-thread AudioWorkletProcessor (4096/1024 hop)
│   │   ├── mic.js                    # MediaStream + 52Hz HPF + Worklet/Analyser coordinator
│   │   ├── pitch.js                  # Legacy monophonic YIN baseline detector
│   │   ├── synth.js                  # Web Audio multi-harmonic piano synth & metronome
│   │   └── midi.js                   # Web MIDI API input manager
│   ├── curriculum/
│   │   ├── index.js                  # Unified 9-level curriculum index & O(1) lookup helpers
│   │   ├── levels_1_to_4.js          # Levels 1–4 (16 lessons · 48 parts · 2,300 notes)
│   │   └── levels_5_to_9.js          # Levels 5–9 (20 lessons · 60 parts · 5,623 notes)
│   ├── engine/
│   │   ├── fingering.js              # 2nd-Order Viterbi DP piano fingering & 5-finger palette
│   │   ├── evaluator.js              # Polyphonic Flow & Wait Mode chord/note scoring engine
│   │   ├── game.js                   # Timeline loop, Backing vs Play-Along split & completion hook
│   │   ├── renderer.js               # 60 FPS Retina 2D Canvas staves, parabolic balls & ripples
│   │   └── keyboard.js               # Interactive 61-key (`C2–C7`) 3D keyboard component
│   ├── gamification/
│   │   └── progress.js               # Stars, XP, 6 Pianist Ranks, streaks & cascading completion
│   ├── parser/
│   │   ├── midi.js                   # Client-side Standard MIDI File parser
│   │   ├── musicxml.js               # Client-side MusicXML parser
│   │   └── sheet.js                  # Gemini Vision OMR scanner & shorthand notation parser
│   ├── songs/
│   │   ├── library.js                # Built-in 61-key repertoire (Wise Men Say, Für Elise, etc.)
│   │   └── storage.js                # LocalStorage + server `/api/songs` persistence
│   └── trainer/
│       ├── curriculum.js             # 28-step 61-key calibration curriculum (`key61`/`whiteKey`)
│       ├── recorder.js               # 16-bit PCM WAV recorder & peak-window YIN verifier
│       ├── storage.js                # Dataset manifest & WAV upload/ZIP client
│       └── trainer.js                # Interactive play-along trainer & live recalibration UI
│
├── audio_dataset/
│   ├── manifest.json                 # Metadata for all 28 recorded WAV calibration samples
│   ├── calibrated_profile.json       # JSON export of calibrated 61-key acoustic parameters
│   └── samples/                      # 28 lossless 48 kHz 16-bit mono WAV recordings
├── samples/                          # Sample `.mid` and `.musicxml` files for import testing
├── songs_data/                       # Server-persisted custom & repertoire song JSON files
└── .gitignore                        # Ignores OS/editor artifacts (`.DS_Store`, `__pycache__/`, `.env*`, `.vscode/`) while preserving calibration WAVs
```

### Local Server Endpoints (`server.py` — Multi-Threaded `ThreadingTCPServer`, `request_queue_size = 128`)
`server.py` runs on `socketserver.ThreadingTCPServer` (`allow_reuse_address = True`, `daemon_threads = True`, `request_queue_size = 128`) so parallel browser loading of all 27 ES modules and assets completes concurrently without socket backlog resets:
- `GET  /api/songs` — Lists persisted songs from `songs_data/*.json`.
- `POST /api/songs/save` — Saves an imported song JSON to `songs_data/`.
- `POST /api/parse-midi` — Server-side SMF binary MIDI parser with 61-key octave folding.
- `GET  /api/dataset/summary` — Returns `manifest.json` and recorded `.wav` count.
- `POST /api/dataset/sample` — Writes a base64 16-bit PCM `.wav` file to `audio_dataset/samples/` and updates `manifest.json`.
- `GET  /api/dataset/zip` — Streams `piano_acoustic_dataset.zip` containing `manifest.json` + all `.wav` samples.
- `POST /api/dataset/recalibrate` — Executes `scripts/calibrate_and_benchmark.py` and returns the freshly generated `calibrated_profile.json` for live browser hot-reload.
- `POST /api/dataset/reset` — Clears recorded dataset samples and resets `manifest.json`.

---

## 12. Running, Calibrating & Operating the App

- **GitHub Repository**: [`https://github.com/OjusSinghal/learn-music`](https://github.com/OjusSinghal/learn-music) (`git@github.com:OjusSinghal/learn-music.git`)

### 12.1 Start the Local Server
```bash
cd /Users/ojus/official/piano-app
python3 server.py 8080
```
Open **`http://localhost:8080`** in Chrome, Safari, or Edge, plug in **headphones**, and choose **Learn** (Levels 1–9) or **Songs** from the Conservatory Home page.

### 12.2 Re-Run Offline Calibration & Benchmark Suite
Whenever new WAV recordings are added to `audio_dataset/samples/`, regenerate `js/audio/calibrated_profile.js` and `CALIBRATION_BENCHMARK_REPORT.md` either by clicking **`Recalibrate Detector`** inside **Data Trainer** or via CLI:
```bash
python3 /Users/ojus/official/piano-app/scripts/calibrate_and_benchmark.py
```

### 12.3 Keyboard Shortcuts & Studio Controls
- **`Home` / `Learn` / `Songs` / `Studio` Pills**: Switch views instantly (auto-pauses active playback when leaving Studio).
- **`Space`** *(in Studio)*: Play / Pause active piece (or start/cancel step when Data Trainer is open).
- **`←` / `→`** *(in Studio)*: Seek piece `-3s` / `+3s` (or navigate Previous / Next calibration step in Data Trainer).
- **`L` / `R`** *(in Studio, or `L Left` / `R Right` dock buttons)*: Toggle Left Hand (Bass) or Right Hand (Treble) ON/OFF for isolated single-hand practice.
- **`Escape`**: Close Completion Summary or Import Modal.
- **`Play-Along ON / OFF` (`#btnPlayAlongToggle`)**: Toggles **only** the synthetic piano guide notes ON or OFF — the song's stereo headphone backing accompaniment continues playing smoothly in the background!
- **`Backing ON / OFF` + `Backing` Slider (`#btnBackingToggle`, default `65%`)**: Adjusts or toggles the stereo headphone accompaniment band independently of piano synth volume.
- **`Flow` / `Wait`**: Switch between continuous rhythm scoring and auto-pause chord/note practice.
- **`Enable Mic` + `Gate` Slider**: Enables calibrated 61-key polyphonic microphone detection (`default = 75%`).

---

## 13. Antigravity Global Skill & Living Documentation Policy

A dedicated global Antigravity development skill for maintaining, calibrating, and extending this application is installed at:
- **`~/.gemini/config/skills/yousician-piano-app/SKILL.md`**
- **`~/.gemini/config/skills/yousician-piano-app/references/dsp-and-calibration.md`**
- **`~/.gemini/config/skills/yousician-piano-app/references/architecture-and-formats.md`**
- **`~/.gemini/config/skills/yousician-piano-app/scripts/verify_piano_app.sh`**

### Automated Regression & Verification Summary (`verify_piano_app.sh`)
Run the 5-stage verification suite to validate Python compilation, `ThreadingTCPServer(request_queue_size=128)` concurrency, zero-harsh-red/zero-alert invariants, `143/143` DOM ID bindings, `.app-header` / `.studio-toolbar` / 2-row `.control-dock` layout separation, all **`27` ES modules** + Studio sub-bar mutual exclusion in JavaScriptCore, `6/6` acoustic WAV fixtures, all **`116` musical pieces (`8,525` notes: `108` curriculum parts / `7,923` notes + `8` repertoire songs / `602` notes)** across 61-key bounds, anatomical chord fingerings, and `100%` Flow/Wait playthroughs, `BackingTrackEngine` headphone audio split, `ProgressManager` round-trips, concurrent `:8080` HTTP routes, and **`README.md` + Skill timestamp freshness**:
```bash
bash ~/.gemini/config/skills/yousician-piano-app/scripts/verify_piano_app.sh
```

---

## 14. Current Boundaries & Future Roadmap

| Area | Current State | Next-Step Enhancement |
| :--- | :--- | :--- |
| **Polyphony Density** | Calibrated KL-NMF + Physical Peak Gate achieves `100%` F1 on 2–3 note chords/octaves and supports up to 6 simultaneous voices. | Add sustain-pedal sympathetic resonance modeling or an optional WebGPU/WASM neural multi-f0 head for dense 8-voice romantic repertoire. |
| **Headphone vs. Open-Speaker Mode** | Optimized for headphones (`Backing` always ON + `Play-Along` piano guide toggle); open-speaker playback can bleed into an active microphone. | Feed the Web Audio `PianoSynthesizer` + `BackingTrackEngine` buses as reference loopback channels into an adaptive spectral echo subtractor inside `piano_worklet.js`. |
| **Practice Analytics & Looping** | Persistent Stars (`0–3 ★`), XP, 6 Pianist Ranks, Daily Streak, 8 Achievements, and cascading Part/Lesson/Level mastery in `ProgressManager`. | Add interactive measure-looping (`A–B` repeat brackets on Canvas) and per-finger/per-key historical accuracy heatmaps. |
| **Offline Sheet OMR** | Image sheet transcription calls the Gemini Vision API (`gemini-2.5-flash`). | Bundle an offline WASM/ONNX staff-and-symbol OMR pipeline for zero-network sheet scanning. |
