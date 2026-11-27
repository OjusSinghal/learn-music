# Architecture, Data Schemas & HTTP API Reference

## 1. Module Responsibilities (`/Users/ojus/official/piano-app/js/` — 36 ES Modules)

| Module | Primary Class / Export | Responsibility |
| :--- | :--- | :--- |
| `js/app.js` | `PianoApp` | Multi-instrument (`"piano" \| "ukulele"`, persisted in `"yousician_active_instrument"`) & multi-view SPA controller (`"home"`, `"learn"`, `"songs"`, `"studio"`, `163` matched `getElementById` bindings). Separates `50px` `.app-header` (brand, `.view-nav`, `#instrumentSwitcher`, `#headerGamificationPill`) from `#viewStudio > .studio-toolbar` (`updateStudioCurriculumBar()`), `.keyboard-section` (`#pianoKeyboard` ↔ `#ukuleleFretboard`), and 2-row `footer.control-dock`. Orchestrates dual renderers, synths, `ProgressManager`s, cached `UkuleleArranger` conversion for all songs/imports, `_handleStudioResize()`, `#completionModal`, `#importModal`, and `showToast`/`clearToasts`. |
| `js/curriculum/index.js` | `PIANO_CURRICULUM`, `getCurriculumLevels`, `getLevelByNumber`, `getLessonById`, `getPartById`, `getNextPart`, `getAllCurriculumParts`, `getCurriculumSongById` | Normalizes, finger-verifies, and indexes Piano Levels 1–9 (`36` lessons, `108` playable parts, `7,923` notes) with `O(1)` lookup maps and sequential traversal. |
| `js/curriculum/levels_1_to_4.js` | `LEVELS_1_TO_4` | Early Piano curriculum (Levels 1–4 · `16` lessons · `48` parts · `2,300` notes). |
| `js/curriculum/levels_5_to_9.js` | `LEVELS_5_TO_9` | Intermediate-to-virtuoso Piano curriculum (Levels 5–9 · `20` lessons · `60` parts · `5,623` notes). |
| `js/ukulele/chords.js` | `UKULELE_STRINGS`, `UKULELE_FINGER_PALETTE`, `UKULELE_CHORD_SHAPES`, `lookupUkuleleChord`, `voiceUkuleleChord`, `chordToTabNotes`, `gceaToTabOrder`, `tabOrderToGcea`, `parseUkuleleChordBar` | Standard High-G (`0=A4[69], 1=E4[64], 2=C4[60], 3=G4[67]`, frets `0..12`) chord dictionary (`229` curated/enharmonic shapes across all 12 roots + slash chords + split bars), algorithmic fallback voicer, and explicit `[G,C,E,A] ↔ tab` coordinate helpers. |
| `js/ukulele/arranger.js` | `UkuleleArranger`, `arrangeSongForUkulele`, `arrangeMelodyNotes`, `resolveSimultaneousCollisions`, `verifyUkuleleSong` | Universal Piano-to-Ukulele song arranger: extracts top melody + optimal octave shift + 2nd-Order Viterbi DP fretboard solver (`lane: "melody"`, `hand: "right"`), generates meter/style-matched 4-string chord strums (`lane: "chords"`, `hand: "left"` via `song.chords` or `inferChordsFromNotes`), eliminates same-string simultaneous collisions, and marks High-G unison doubles (`chordGroupId`, `isUnisonDouble`). |
| `js/ukulele/curriculum.js` | `UKULELE_CURRICULUM`, `getUkuleleCurriculumLevels`, `getUkuleleLevelByNumber`, `getUkuleleLessonById`, `getUkulelePartById`, `getNextUkulelePart`, `getAllUkuleleCurriculumParts`, `getUkuleleCurriculumSongById` | Structured Ukulele Levels 1–9 curriculum (`36` lessons, `108` parts, `9,090` verified notes, `uku_*` IDs) with `Part 1: solo`, `Part 2: chords`, `Part 3: combined` in every lesson. |
| `js/ukulele/renderer.js` | `UkuleleTabRenderer`, `mapPitchToUkuleleTab` | 60 FPS High-DPI 2D Canvas 4-string horizontal scrolling tab renderer (`A4/E4/C4/G4`, finger-colored fret pills, duration tails, chord headers, strum brackets + `↓`/`↑` arrows, below-deck measure numbers, bouncing 3D sphere + dotted parabolic trail `computeBallPosition`, Wait halos, muted-lane blur/badges, non-punitive ripples/ghostMarks, optional top-right mini tuner capsule). Full `YousicianRenderer` API parity (`render(gameState)`, `addHitFeedback`, `setActiveHands`, `setTunerState`, `resize`). |
| `js/ukulele/fretboard.js` | `UkuleleFretboard` | Interactive 4-string × 12-fret horizontal Ukulele neck (`52` clickable cells, proportional 12-TET spacing, pearl inlays on `3,5,7,10,12`, chord badge, live open-string tuner dots, unison-chord-aware target dots). Full `PianoKeyboard` parity (`activeKeys` Map, `pressKey`, `releaseKey`, `clearAll`, `getNoteInfo`) + `setTargetNotes`, `setTunerState`. |
| `js/audio/backing_track.js` | `BackingTrackEngine`, `VALID_BACKING_STYLES`, `parseKeySignature`, `parseChordSymbol`, `inferChordsFromNotes` | Stereo headphone accompaniment engine (`warm_pad`, `acoustic_pop`, `classical_strings`, `waltz_chamber`, `jazz_brushes`, `cinematic_pulse`), slash-chord bass, harmonic analyzer for chordless imports, and `30 ms` voice release. |
| `js/audio/synth.js` | `PianoSynthesizer` | Multi-harmonic Web Audio piano synth (`playNote`, `stopAllNotes`, `playNoteCount`), wooden metronome (`playMetronomeClick`), and shared `AudioContext` host whose mute never silences `BackingTrackEngine`. |
| `js/audio/ukulele_synth.js` | `UkuleleSynthesizer` | Nylon-string acoustic ukulele Web Audio synth sharing Piano's `AudioContext` + `BackingTrackEngine`: `14 ms` pink-noise pluck transient, damped 1–4 harmonics + `+6¢` bloom, `300 Hz`/`520 Hz` body resonators, `3800 Hz` LPF, `playStrum(notes, dur, dir)` (`14 ms` stagger + stereo pan), `playNote`, `stopAllNotes`, `playMetronomeClick`. |
| `js/audio/calibrated_profile.js` | `CALIBRATED_61KEY_PROFILE` | Calibrated 61-key Piano acoustic dictionary (`templates`, `inharmonicity`, `silenceProfile`, `benchmarkSummary`). |
| `js/audio/polyphonic_detector.js` | `CalibratedPolyphonicDetector` | Real-time 61-key Piano 8192-FFT + KL-NMF + odd-harmonic + score-informed detector. |
| `js/audio/ukulele_profile.js` | `CALIBRATED_UKULELE_PROFILE` | Ukulele nylon acoustic profile (`MIDI 55..84` for High-G & Low-G, `calibrated: false` default, updated to `calibrated: true` by `scripts/calibrate_ukulele.py`). |
| `js/audio/ukulele_detector.js` | `UkulelePolyphonicDetector`, `identifyUkuleleChord` | 7-stage Ukulele DSP engine: `180/135 Hz` HPF, 8192-FFT + noise sub, SFM/HNR pluck-click gate, `-30..+40¢` peak gate + sub-cent `G-C-E-A` tuner, nylon KL-NMF + unison-resilient scaling + octave excess verifier + 4-string cap, adaptive `98 ms` Strum-Aggregation Window, and score-informed priors. |
| `js/audio/piano_worklet.js` | `PianoCaptureWorkletProcessor` | Off-main-thread `AudioWorkletProcessor` (`"piano-capture-worklet"`) streaming `4096`-sample windows every `1024` samples. |
| `js/audio/mic.js` | `PianoMicrophone` | Instrument-aware MediaStream + dynamic Biquad HPF (`52 Hz` piano / `180 Hz` High-G / `135 Hz` Low-G) + Worklet/Analyser bridge holding both `pianoDetector` & `ukuleleDetector` (`setInstrument`, `setUkuleleTuning`, `reloadCalibrationProfile`). |
| `js/audio/pitch.js` | `PitchDetector` | Legacy monophonic YIN baseline pitch tracker. |
| `js/audio/midi.js` | `MidiInputManager` | Web MIDI API USB/Bluetooth controller listener. |
| `js/engine/fingering.js` | `PianoFingeringEngine`, `FINGER_PALETTE` | Ergonomic 2nd-Order Viterbi DP piano fingering solver + bimanual MIDI partitioner (`1..5` → `T,1..4` → canonical 5 colors). |
| `js/engine/evaluator.js` | `NoteEvaluator` | Multi-note Flow/Wait scoring engine supporting Piano hands AND Ukulele lanes (`chords`=`left`, `melody`=`right`), skipping piano's pitch-register split in Ukulele mode, honoring `95 ms` strum stagger in Flow, and auto-crediting simultaneous High-G unison sibling strings (`isUnisonDouble` / `chordGroupId`). |
| `js/engine/game.js` | `GameEngine` | Multi-instrument timeline loop (`gameLoop` + deterministic `step(deltaSec)`), `setInstrumentContext({ instrument, renderer, keyboard, synth })`, `setTunerState(tunerData)`, strict headphone backing split, Ukulele `playStrum` batching, skipping `PianoFingeringEngine` on ukulele songs, and `onSongComplete`. |
| `js/engine/renderer.js` | `YousicianRenderer` | 60 FPS Retina 2D Canvas Piano grand-staff renderer with independent parabolic 3D spheres (`computeBallPosition`), frosted hand blur, ripples, and ghostMarks. |
| `js/engine/keyboard.js` | `PianoKeyboard` | Interactive 61-key (`MIDI 36..96`) 3D piano keyboard (`clampTo61KeyRange`). |
| `js/gamification/progress.js` | `ProgressManager`, `PIANIST_RANKS`, `ACHIEVEMENT_DEFINITIONS`, `UKULELE_RANKS`, `UKULELE_ACHIEVEMENT_DEFINITIONS` | Multi-instrument progress manager (`{ storageKey, curriculum, ranks, achievements, instrument }`), persisting isolated Piano (`"yousician_piano_progress_v1"`) and Ukulele (`"yousician_ukulele_progress_v1"`) stars, XP, 6 ranks, streaks, 8 achievements, and cascading Part → Lesson → Level completion. |
| `js/songs/library.js` | `SONG_LIBRARY` | Preloaded 5 Piano songs (`wise_men_say`, `yousician_groove`, `fur_elise`, `ode_to_joy`, `canon_in_d`) + 3 server songs in `songs_data/*.json` = `8` repertoire songs (`602` piano notes), all auto-arranged for Ukulele on demand. |
| `js/songs/storage.js` | `SongStorage` | LocalStorage + server `/api/songs` persistence for custom/imported songs. |
| `js/trainer/curriculum.js` | `DATASET_STEPS`, `CATEGORIES`, `KEYBOARD_61_SPEC` | 28-step 61-key Piano acoustic calibration protocol. |
| `js/trainer/ukulele_curriculum.js` | `UKULELE_TRAINING_CURRICULUM`, `UKULELE_DATASET_CATEGORIES`, `UKULELE_SPEC` | 28-step High-G Ukulele calibration protocol (silence, 4 open strings, 10 fret anchors `0..12`, dynamics, dyads + `A4+A4` unison, 8 essential chords). |
| `js/trainer/recorder.js` | `AudioDatasetRecorder` | 16-bit PCM WAV recorder & peak-window analyzer. |
| `js/trainer/storage.js` | `DatasetStorage` | Instrument-isolated dataset storage (`new DatasetStorage("piano" \| "ukulele")`, routing `/api/dataset/*` vs `/api/dataset/ukulele/*` and separate `localStorage` manifests). |
| `js/trainer/trainer.js` | `SoundCollectionTrainer` | Multi-instrument 28-step Data Trainer modal (`setInstrument`, `syncWithServer`, `onProfileUpdated`, mini 61-key keyboard OR clickable mini 4-string chord/tab diagram, `playStrum` reference, live recalibration). |
| `js/parser/{midi,musicxml,sheet}.js` | `MidiFileParser`, `MusicXmlParser`, `SheetMusicScanner` | Converts `.mid`, `.musicxml`, Gemini Vision sheet scans, and QuickComposer shorthand into barline-aligned Song JSON playable on both Piano and Ukulele. |

*(Reference docs: `docs/CURRICULUM_RESEARCH.md`, `docs/UKULELE_CURRICULUM.md`, `docs/UKULELE_ACOUSTIC_RESEARCH.md`.)*

---

## 2. Internal Song JSON & Curriculum Schemas

### 2.1 Piano Song JSON Schema
- `pitch`: Integer MIDI in `[36, 96]`, `time >= 0`, `duration >= 0.14s`, `clef: "treble"|"bass"`, `hand: "right"|"left"`, `finger: 1..5`, `fingerLabel: "T"|"1".."4"`, `fingerColor: "#48A870"|"#F0C830"|"#6848F8"|"#4090F8"|"#E86078"`, `chords` (`length === expectedBars`), `backingStyle` in `VALID_BACKING_STYLES`.
- **Anatomical Piano Chord Invariant**: Same-hand simultaneous notes (`<= 55 ms`): `<= 5` notes, `0` duplicate fingers, RH strictly increasing fingers (`1<2<3<4<5`), LH strictly decreasing (`5>4>3>2>1`).

### 2.2 Ukulele Song JSON Schema (`instrument: "ukulele"`)
```js
{
  id: "wise_men_say", // or "uku_curr_l3_1_p3" for curriculum parts
  instrument: "ukulele",
  tuning: "G4-C4-E4-A4",
  maxFret: 12,
  title: "...",
  bpm: 86,
  beatsPerMeasure: 4,
  timeSignature: [4, 4],
  keySignature: "C",
  backingStyle: "acoustic_pop",
  chords: ["C", "G", "Am", "F"],
  notes: [
    {
      pitch: 72,           // exact integer MIDI === UKULELE_STRINGS[string].openMidi + fret
      time: 0.0,
      duration: 0.6727,
      string: 0,           // 0=A4(69), 1=E4(64), 2=C4(60), 3=G4(67)
      stringName: "A",
      fret: 3,             // 0..12
      finger: 3,           // 0=Open, 1=Index, 2=Middle, 3=Ring, 4=Pinky
      fingerLabel: "3",    // "O" | "1" | "2" | "3" | "4"
      fingerColor: "#4090F8",
      lane: "chords",      // "melody" | "chords"
      hand: "left",        // "right" (melody) | "left" (chords)
      clef: "bass",        // "treble" (melody) | "bass" (chords)
      isChordNote: true,
      chordSymbol: "C",
      strumDir: "down",    // "down" | "up"
      chordGroupId: "grp_0",
      isUnisonDouble: false
    }
  ]
}
```

### 2.3 Levels 1–9 Curriculum Schema (`PIANO_CURRICULUM` & `UKULELE_CURRICULUM`)
Both curricula expose identical Level (`1..9`) → Lesson (`4/level`, `36` total) → Part (`3/lesson`: `"solo"`, `"chords"`, `"combined"`, `108` total) structures. Piano IDs use `level_*`, `l1_lesson_1`, `l1_1_p1`; Ukulele IDs use `uku_level_*`, `uku_l1_lesson_1`, `uku_l1_1_p1`, `uku_curr_*` for zero collision.

---

## 3. Multi-Instrument `GameEngine`, Headphone Split & `ProgressManager`

- **`GameEngine.setInstrumentContext({ instrument, renderer, keyboard, synth })`**: Cleanly pauses & releases voices, swaps active renderer (`YousicianRenderer` ↔ `UkuleleTabRenderer`), instrument view (`PianoKeyboard` ↔ `UkuleleFretboard`), and synth (`PianoSynthesizer` ↔ `UkuleleSynthesizer`) while keeping ONE shared `BackingTrackEngine` + `AudioContext`, tempo, mode, metronome, and `onSongComplete` intact.
- **`GameEngine.setTunerState(tunerData)`**: Forwards `{ active, midi, noteName, cents, confidence, detectedChord, activeNotes }` to `UkuleleTabRenderer` & `UkuleleFretboard` for live canvas mini-tuner & nut indicator dots.
- **Headphone Split**: `backingAudioEnabled` (default `true`, vol `0.65`) always plays `BackingTrackEngine` when `isPlaying && !isWaiting`; `referenceAudioEnabled` (`#btnPlayAlongToggle`) gates ONLY guide notes (`PianoSynthesizer.playNote` or `UkuleleSynthesizer.playStrum`/`playNote`).
- **`ProgressManager`**: `new ProgressManager({ storageKey, storage, curriculum, ranks, achievements, instrument, onChange })` preserves 0-arg Piano defaults while cleanly isolating Ukulele progression under `"yousician_ukulele_progress_v1"`.

---

## 4. Polyphonic Evaluator & Canvas Ballistic Math

- **Piano**: `perfectWindowSec = 0.14`, `goodWindowSec = 0.28`, `55 ms` Wait chord cluster, `activeHands` (`left`/`right`) with register guard in single-hand mode.
- **Ukulele**: `strumStaggerToleranceSec = 0.095` in Flow mode, skips piano pitch-register split guard in `_shouldIgnoreDisabledHandInput`, and auto-credits simultaneous (`<= 55 ms` or matching `chordGroupId`) unison sibling strings (`F [2,0,1,0]`, `Am`, `G`, `D`, `Dm`, `Em`) on a single detected strike.
- **Parabolic Jumping Orbs**: Both `YousicianRenderer.computeBallPosition` and `UkuleleTabRenderer.computeBallPosition` compute `C0`-continuous uniform-gravity parabolas `y(u) = (1 - u)*y0 + u*y1 - 4*H*u*(1 - u)` along `playheadRatio = 0.26` (`180 px/s`).

---

## 5. Backend Server Endpoints (`server.py` — `ThreadingTCPServer`, `request_queue_size = 128`)

- `GET /api/songs`, `POST /api/songs/save`, `POST /api/parse-midi`
- **Piano Dataset (`audio_dataset/`)**:
  - `GET /api/dataset/summary`, `POST /api/dataset/sample`, `GET /api/dataset/zip`, `POST /api/dataset/recalibrate` (`scripts/calibrate_and_benchmark.py`), `POST /api/dataset/reset`
- **Ukulele Dataset (`audio_dataset/ukulele/`)**:
  - `GET /api/dataset/ukulele/summary` — Returns `{ instrument: "ukulele", total_samples, wav_file_count, manifest, dataset_dir }`.
  - `POST /api/dataset/ukulele/sample` — Writes sanitized `.wav` to `audio_dataset/ukulele/samples/` and updates `audio_dataset/ukulele/manifest.json`.
  - `GET /api/dataset/ukulele/zip` — Streams `ukulele_acoustic_dataset.zip` in memory.
  - `POST /api/dataset/ukulele/recalibrate` — Returns HTTP `400` if 0 WAVs recorded; otherwise runs `scripts/calibrate_ukulele.py --real-wavs` (`timeout=60s`) and returns `{ success: true, instrument: "ukulele", profile }`.
  - `POST /api/dataset/ukulele/reset` — Clears ONLY `audio_dataset/ukulele/samples/` and `audio_dataset/ukulele/manifest.json` (never touches Piano WAVs!).
