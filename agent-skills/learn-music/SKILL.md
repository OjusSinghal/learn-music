---
name: learn-music
description: >-
  Develops, calibrates, debugs, and extends the Learn Music (Yousician Piano &
  Ukulele conservatory & play-along) web application at /Users/ojus/official/piano-app.
  Activate this skill whenever the user asks to work on Learn Music, the piano or
  ukulele app, Piano | Ukulele switching, Minimal Home / Learn / Songs / Studio views,
  the Levels 1-9 structured Piano & Ukulele curricula (chords & solo play), universal
  UkuleleArranger, 4-string scrolling tab canvas & 4x12 interactive fretboard,
  stereo headphone backing music vs Play-Along toggle, gamification/progress
  tracking, acoustic pitch/chord/strum detection, 61-key piano or 28-step ukulele
  audio dataset calibration, Flow/Wait/Hand/Lane practice modes, 60 FPS Canvas,
  3D 61-key keyboard, Data Trainer, or MIDI, MusicXML, and Gemini OMR sheet music.
---

# Learn Music — Piano & Ukulele Conservatory Skill

## Project Location & Runtime Constraints

- **Workspace Root**: `/Users/ojus/official/piano-app`
- **GitHub Repository**: https://github.com/OjusSinghal/learn-music (`git@github.com:OjusSinghal/learn-music.git`)
- **Frontend Stack**: Zero-dependency vanilla ES modules (**`36`** modules under `js/**`, plus `index.html` with **`163/163`** matched DOM IDs and `style.css`), HTML5 2D Retina Canvas, Web Audio API (`AudioWorklet` + `BackingTrackEngine` + `PianoSynthesizer` + `UkuleleSynthesizer`), MediaStream API, and Web MIDI API. Do **not** introduce npm bundlers or external CDN dependencies unless explicitly requested.
- **Backend & Scripts Stack**: Pure Python 3 standard library (`server.py` running `socketserver.ThreadingTCPServer` with `request_queue_size = 128` and `daemon_threads = True` for concurrent 36-module browser loads, plus `scripts/calibrate_and_benchmark.py` and `scripts/calibrate_ukulele.py`).
- **Host Environment Gotchas (Critical)**:
  - `numpy` / `scipy` are **not** installed in `/usr/bin/python3` (Python 3.9). Keep Python DSP scripts pure-stdlib (`wave`, `struct`, `math`, `cmath`, `json`). Avoid backslashes inside `{...}` in Python 3.9 f-strings.
  - `node` and `curl` are **not** on default `PATH`.
    - Validate ES modules and run headless JS tests with macOS JavaScriptCore:
      `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m <script.js>`
    - Check HTTP endpoints using `python3 -c "import urllib.request; ..."` instead of `curl`.
  - **Never delete or overwrite** the user's recorded acoustic WAV files in `/Users/ojus/official/piano-app/audio_dataset/samples/` (28 piano WAVs) or `/Users/ojus/official/piano-app/audio_dataset/ukulele/samples/` unless explicitly instructed by the user.

---

## Non-Negotiable Domain Invariants (Piano, Ukulele, Headphone Split, Curricula & Aesthetic)

1. **61-Key Piano Span (`MIDI 36..96`, `C2` to `C7`)**:
   - Key `#1` (`White #1`) = `C2 (36, 65.41 Hz)`; Key `#13` (`W#8`) = `C3 (48)`; Key `#22` (`W#13`) = `A3 (57, 220 Hz)`; Key `#25` (`W#15`) = **Middle `C4 (60, 261.63 Hz)`**; Key `#34` (`W#20`) = **Concert `A4 (69, 440 Hz)`**; Key `#61` (`W#36`) = `C7 (96, 2093 Hz)`. Formula: `key61 = midi - 35`.
   - Octave folding into `[36, 96]` applies across all parsers (`js/parser/{midi,musicxml,sheet}.js`, `server.py`) and `PianoKeyboard.clampTo61KeyRange`.
2. **Standard High-G Ukulele Conventions (`G4–C4–E4–A4`, Frets `0..12`, `MIDI 60..81`, Low-G `G3=55` DSP Extensible)**:
   - **Tab String Indexing**: `string: 0` = Top line **A4 (`69`)**, `1` = **E4 (`64`)**, `2` = **C4 (`60`)**, `3` = Bottom line **G4 (`67`)**. Always convert chord diagram arrays `[gFret, cFret, eFret, aFret]` via `gceaToTabOrder` / `tabOrderToGcea` in `js/ukulele/chords.js` so there are zero inversion bugs.
   - **Fretting Finger Palette (`UKULELE_FINGER_PALETTE`)**: Harmonized identically with Piano's 5 colors: `0` (Open `"O"`): `#48A870`, `1` (Index): `#F0C830`, `2` (Middle): `#6848F8`, `3` (Ring): `#4090F8`, `4` (Pinky): `#E86078`.
   - **Dual-Lane Arrangement (`UkuleleArranger`)**: Every built-in, server-saved, and imported song converts automatically into dual-track Ukulele JSON (`instrument: "ukulele"`, `lane: "melody"` → `hand: "right"`, `lane: "chords"` → `hand: "left"`), with `0` same-string simultaneous collisions (`|dt| <= 55 ms`) and `pitch === openMidi + fret`. `GameEngine.loadSong()` **must skip** `PianoFingeringEngine.ensureSongFingering()` when `song.instrument === "ukulele"`.
   - **High-G Unison Chords & Strum Stagger (`NoteEvaluator`)**: In Ukulele mode, `NoteEvaluator` skips Piano's pitch-register split heuristic (since melody & chords overlap in `C4–A5`), honors `95 ms` strum-stagger tolerance in Flow mode, and auto-credits simultaneous (`<= 55 ms` or same `chordGroupId`) unison sibling strings (e.g., dual `A4=69` on `F [2,0,1,0]`, `Am`, `G`, `D`) on a single detected strike.
3. **Isolated Multi-Instrument Datasets & Progress**:
   - **Audio Datasets**: Piano stays strictly at `audio_dataset/` (`/api/dataset/*`); Ukulele stays strictly isolated at `audio_dataset/ukulele/` (`/api/dataset/ukulele/*`, `scripts/calibrate_ukulele.py`).
   - **Progress Stores**: Piano uses `localStorage["yousician_piano_progress_v1"]` (`PIANO_CURRICULUM`, `PIANIST_RANKS`); Ukulele uses `localStorage["yousician_ukulele_progress_v1"]` (`UKULELE_CURRICULUM` with `uku_*` IDs, `UKULELE_RANKS`, `UKULELE_ACHIEVEMENT_DEFINITIONS`).
4. **Headphone-Safe JS & Headless Guards**: All `36` ES modules under `js/**` are dynamically imported in headless `jsc` (`verify_piano_app.sh` Stage 2); guard `window`, `document`, `performance.now()`, `requestAnimationFrame`, `AudioContext`, and `localStorage`.
5. **Strict Headphone Backing Music vs. Play-Along Guide Split (`backing_track.js`, `synth.js`, `ukulele_synth.js`, `game.js`, `app.js`)**:
   - `BackingTrackEngine` (`game.backingAudioEnabled`, default `true` at `0.65`) **ALWAYS plays** when `game.isPlaying && !game.isWaiting` — regardless of whether `Play-Along` is ON or OFF, for **both** Piano and Ukulele!
   - `#btnPlayAlongToggle` (`game.setReferenceAudio(bool)`) **exclusively plays/mutes guide notes** (`PianoSynthesizer.playNote` or `UkuleleSynthesizer.playStrum`/`playNote`). Both synths and `BackingTrackEngine` share ONE `AudioContext`; pause, Wait freeze, seek, restart, and instrument switch release all voices cleanly in `30 ms`.
6. **Canonical 5-Finger Piano Colors & Dual Levels 1–9 Curricula**:
   - Piano Levels 1–9 (`js/curriculum/index.js`, `36` lessons, `108` parts, `7,923` notes, `1,192` same-hand chords): RH ascending pitches strictly map to increasing fingers (`1 < 2 < 3 < 4 < 5`), LH ascending to decreasing (`5 > 4 > 3 > 2 > 1`), zero duplicate fingers, close-position 3-note LH triads `>= A2/C3`.
   - Ukulele Levels 1–9 (`js/ukulele/curriculum.js`, `36` lessons, `108` parts, `9,090` notes): every lesson follows the 3-part triad (`Part 1: solo`, `Part 2: chords`, `Part 3: combined`) with valid `backingStyle` and `0` collisions.
7. **Subtle Conservatory Aesthetic, Collision-Free Layout & Non-Punitive Feedback (`index.html`, `style.css`, `js/**`)**:
   - Calm **Studio Obsidian & Acoustic Ivory** across all views and both instruments — **ZERO neon green**, **ZERO harsh red hexes (`#EF4444`, `#F87171`, `#B91C1C`)**, **ZERO `"WRONG NOTE"` / `"MISSED"` floating banners or particle bursts**, and **ZERO `window.alert()` / `window.confirm()`** calls.
   - Global `.app-header` (`50px`) holds ONLY brand/nav + `#instrumentSwitcher` (`Piano | Ukulele`) + `#headerGamificationPill` (NEVER Studio controls).
   - `#viewStudio > .studio-toolbar` holds mutually exclusive `#studioCurriculumBar` vs `#studioSongSelectWrap` + `#btnOpenImport`, `.mic-control-bar`, and `#studioRightHints`; `footer.control-dock` keeps 2-row `.dock-scrubber-row` + `.dock-main-row`; `.keyboard-section` (`142px`) hosts sibling `#pianoKeyboard` and `#ukuleleFretboard`.
8. **Mandatory `README.md`, Global Jetski Skill & Repo `agent-skills/` Mirror Synchronization (ALWAYS ENFORCE)**:
   - Every time you make ANY change to `/Users/ojus/official/piano-app` (or to the skill itself), you **MUST** keep **all three** synchronized in the same turn and commit/push them together:
     1. `/Users/ojus/official/piano-app/README.md`
     2. **Global Jetski Skill**: `~/.gemini/config/skills/learn-music/` (`SKILL.md`, `references/*`, `scripts/verify_piano_app.sh`)
     3. **Repo Skill Mirror**: `/Users/ojus/official/piano-app/agent-skills/learn-music/` — MUST remain **100% byte-for-byte identical** to `~/.gemini/config/skills/learn-music/` (excluding `.DS_Store` / `__pycache__`, preserving `+x` on `scripts/verify_piano_app.sh`) and **MUST always be committed and pushed alongside any other app commits** to `git@github.com:OjusSinghal/learn-music.git`.
   - Mirror cleanly with:
     ```bash
     rsync -a --delete --exclude='.DS_Store' --exclude='__pycache__' \
       ~/.gemini/config/skills/learn-music/ \
       /Users/ojus/official/piano-app/agent-skills/learn-music/
     ```

---

## Core Workflows

### 1. Validating Changes (Always Run After Edits)
Run the permanent 5-stage verification suite covering Python syntax (`server.py`, `calibrate_and_benchmark.py`, `calibrate_ukulele.py`), `ThreadingTCPServer(q=128)`, static aesthetic/DOM/layout invariants (`163/163` DOM IDs, zero harsh reds/alerts across `38` files), all `36` ES modules in `jsc`, `6/6` Piano WAV fixtures, all `116` Piano pieces (`8,525` notes), all `8` Ukulele-arranged songs + `108` Ukulele curriculum parts (`9,090` notes), `UkulelePolyphonicDetector` DSP/tuner/strum test, Piano↔Ukulele hot-swap + unison `F` chord + headphone split, dual `ProgressManager` isolation, concurrent `:8080` HTTP routes, and doc freshness:

```bash
bash ~/.gemini/config/skills/learn-music/scripts/verify_piano_app.sh
```

### 2. Calibrating & Benchmarking Polyphonic Note Detection (Piano & Ukulele)
Read [DSP & Calibration Reference](./references/dsp-and-calibration.md) before modifying DSP code.
- **Piano** (`js/audio/polyphonic_detector.js` ↔ `scripts/calibrate_and_benchmark.py`):
  ```bash
  python3 /Users/ojus/official/piano-app/scripts/calibrate_and_benchmark.py
  ```
  Targets: Recall `100.0%`, Polyphonic F1 (`steps 23–28`) `>= 96%` (`100.0%`, `6/6`), Overall LOOCV F1 `>= 94%` (`94.74%`).
- **Ukulele** (`js/audio/ukulele_detector.js` ↔ `scripts/calibrate_ukulele.py`):
  ```bash
  python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py --synthetic-benchmark
  # Or on recorded WAVs in audio_dataset/ukulele/samples/:
  python3 /Users/ojus/official/piano-app/scripts/calibrate_ukulele.py
  ```
  Targets: Recall `>= 95%` (`100.0%`), Blind LOOCV F1 `>= 95%` (`97.09%`), Chords/Dyads F1 `>= 92%` (`96.88%`), Hybrid F1 `100.0%`, Silence FP `0`, Tuner MAE `< 2¢` (`0.82¢`).

### 3. Modifying Curricula, Arranger, UI, Headphone Backing, or Gameplay
Read [Architecture, Schemas & API Reference](./references/architecture-and-formats.md) (and `docs/CURRICULUM_RESEARCH.md` / `docs/UKULELE_CURRICULUM.md`) before editing schemas, `GameEngine`, `NoteEvaluator`, `YousicianRenderer`, `UkuleleTabRenderer`, `UkuleleFretboard`, `ProgressManager`, or `PianoApp`.

### 4. Starting / Restarting the Local Server (`port 8080`)
1. Check `lsof -i :8080`.
2. Start as daemon: `cd /Users/ojus/official/piano-app && python3 server.py 8080`.
3. Verify HTTP `200` via Python `urllib.request` on `http://127.0.0.1:8080/`.

---

## Mandatory Definition of Done (Run Before Completing Any Task)
1. **Update `README.md`**: Keep `/Users/ojus/official/piano-app/README.md` fully synchronized with every architectural, UI, curriculum, DSP, or API change.
2. **Update Global Jetski Skill**: Keep `~/.gemini/config/skills/learn-music/` (`SKILL.md`, `references/*.md`, and `scripts/verify_piano_app.sh`) synchronized.
3. **Sync Repo `agent-skills/` Mirror**: Mirror the global skill byte-for-byte into `/Users/ojus/official/piano-app/agent-skills/learn-music/`:
   ```bash
   rsync -a --delete --exclude='.DS_Store' --exclude='__pycache__' \
     ~/.gemini/config/skills/learn-music/ \
     /Users/ojus/official/piano-app/agent-skills/learn-music/
   ```
   Verify zero diff (`diff -rq ~/.gemini/config/skills/learn-music /Users/ojus/official/piano-app/agent-skills/learn-music`).
4. **Code, Mirror & Regression Check**: Run `bash ~/.gemini/config/skills/learn-music/scripts/verify_piano_app.sh` (or `bash /Users/ojus/official/piano-app/agent-skills/learn-music/scripts/verify_piano_app.sh`) and ensure **100% (5/5 stages)** pass.
5. **Commit & Push Together**: Whenever committing and pushing changes in `/Users/ojus/official/piano-app` to `git@github.com:OjusSinghal/learn-music.git`, **always include `agent-skills/learn-music/`** (and `README.md`) alongside the app changes so the repository's skill copy never drifts from the global Jetski skill.

---

## Progressive Disclosure References
- **[DSP & Calibration Deep Dive](./references/dsp-and-calibration.md)**: Piano 61-key acoustic profile & 6-stage KL-NMF pipeline PLUS Ukulele nylon physics, 7-stage Strum-Aggregated KL-NMF pipeline, 5-model ablation benchmarks, and 28-step calibration guide.
- **[Architecture, Schemas & API Reference](./references/architecture-and-formats.md)**: Full 36-module map, Piano & Ukulele Song/Curriculum schemas, `GameEngine.setInstrumentContext`, `UkuleleTabRenderer`/`UkuleleFretboard`, dual `ProgressManager`, and Piano + Ukulele `server.py` REST routes.
- **[Verification Script](./scripts/verify_piano_app.sh)**: Permanent 5-stage automated regression suite covering Piano + Ukulele end-to-end.
