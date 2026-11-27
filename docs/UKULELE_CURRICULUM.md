# Ukulele Levels 1–9 Conservatory Curriculum & Arrangement Architecture

> **Scope & Purpose**: Concise reference for the standard High-G (`G4–C4–E4–A4`) Ukulele Levels 1–9 conservatory curriculum (`36` lessons · `108` playable parts), universal Piano-to-Ukulele song arranger (`js/ukulele/arranger.js`), chord voicing engine (`js/ukulele/chords.js`), and acoustic nylon-string synthesizer (`js/audio/ukulele_synth.js`).

---

## 1. Tuning, Coordinate & Finger Color Conventions

Standard re-entrant **High-G Soprano / Concert / Tenor** tuning spanning **12 frets** (`C4 [MIDI 60]` through `A5 [MIDI 81]`):

| Tab String Index | Position on 4-Line Tab | String Name | Open MIDI | Frequency (Hz) | G-C-E-A Chord Diagram Index |
| :---: | :--- | :---: | :---: | :---: | :---: |
| `0` | Top line (1st string) | **A4** | `69` | `440.00` | `3` |
| `1` | 2nd line (2nd string) | **E4** | `64` | `329.63` | `2` |
| `2` | 3rd line (3rd string) | **C4** | `60` | `261.63` | `1` |
| `3` | Bottom line (4th string) | **G4** | `67` | `392.00` | `0` |

- Explicit conversion helpers (`gceaToTabOrder`, `tabOrderToGcea`, `gceaIndexToTabString`, `tabStringToGceaIndex`) eliminate inversion bugs between chord shapes (`[G, C, E, A]`) and tab lanes (`0=A, 1=E, 2=C, 3=G`).
- **Fretting Finger Palette** (exact match to canonical `FINGER_PALETTE`, zero harsh red hexes):
  - `0` (`"O"` Open string): `#48A870` (Conservatory Sage)
  - `1` (`"1"` Index): `#F0C830` (Warm Gold)
  - `2` (`"2"` Middle): `#6848F8` (Royal Indigo)
  - `3` (`"3"` Ring): `#4090F8` (Cerulean Azure)
  - `4` (`"4"` Pinky): `#E86078` (Muted Rose)

---

## 2. Universal Song Arrangement (`js/ukulele/arranger.js`)

Every Piano song (built-in `SONG_LIBRARY`, `songs_data/*.json`, and any imported MIDI, MusicXML, Sheet Music scan, or QuickComposer piece) converts automatically via `UkuleleArranger.arrangeSongForUkulele(pianoSong)`:

1. **Dual-Track Lane & Hand Architecture**:
   - **Melody Track** (`lane: "melody"`, `hand: "right"`, `clef: "treble"`): Extracts the singing top melody line, selects optimal octave transposition into `C4..A5` (`MIDI 60..81`), and runs a **2nd-Order Viterbi DP Fretboard Solver** minimizing hand-box shifts, favoring open strings and 1-finger-per-fret ergonomics (`frets 0..5`), and preserving hand-anchor continuity across open strings.
   - **Chords Track** (`lane: "chords"`, `hand: "left"`, `clef: "bass"`): Uses `song.chords` (supporting split bars like `"G → C"` and intentional `""` pickup/solo bars) or automatic harmonic inference (`inferChordsFromNotes`), generating meter- and `backingStyle`-matched 4-string strum patterns (`4/4`, `3/4`, `2/4`, `6/8`, `3/8`).
2. **Play-Mode Reuse**: Because Melody maps to `hand: "right"` and Chords maps to `hand: "left"`, `NoteEvaluator`'s existing `activeHands` toggle seamlessly powers **Melody Only**, **Chords Only**, and **Full Chord-Melody** practice in Flow and Wait modes.
3. **Zero Same-String Collisions**: `resolveSimultaneousCollisions()` aligns shared chord-melody pitches onto the exact same `(string, fret)` or trims a colliding chord string on passing tones so no two simultaneous notes (`|dt| <= 55 ms`) ever require different frets on the same string.
4. **High-G Unison Doubling Metadata**: Because High-G re-entrant chords like `F [2,0,1,0]`, `Am [2,0,0,0]`, `G [0,2,3,2]`, and `D [2,2,2,0]` naturally sound two strings at the same MIDI pitch (`A4=69` or `G4=67`), chord notes carry `chordGroupId` and `isUnisonDouble` so polyphonic scoring credits unison strings cleanly on a single strum.

---

## 3. Levels 1–9 Ukulele Curriculum Syllabus (`36` Lessons · `108` Parts)

Every lesson follows the **3-Part Conservatory Triad** (`Part 1: solo` [Melody picking · `right`], `Part 2: chords` [Strumming · `left`], `Part 3: combined` [Chord-Melody / Full Groove · `left + right`]), using unique `uku_` IDs (`uku_level_1`..`uku_level_9`, `uku_l1_lesson_1`..`uku_l9_lesson_4`, `uku_l1_1_p1`..`uku_l9_4_p3`) and curated headphone `backingStyle` accompaniment.

| Level | Theme | Keys & Meters | Core Fret Range & Chords | Signature Techniques |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Open Strings & First Single-Finger Chords** | `C`, `Am` · `4/4` (`68–80 BPM`) | Frets `0–3` · `C6`, `C`, `Am`, `C7` | `G–C–E–A` open-string pulse, single-finger pivots, whole & half down-strums |
| **2** | **C Major Scale & Primary Strumming** | `C`, `Am` · `4/4`, `3/4` (`76–90 BPM`) | Frets `0–3` · `C`, `F`, `G7`, `Am` | Full octave `C4–C5` scale, `F → G7` index pivot, quarter & `D–D–DU` folk strum |
| **3** | **Full G Major, Island Strum & Folk Melodies** | `C`, `G` · `4/4`, `3/4` (`84–100 BPM`) | Frets `0–5` · `G`, `C`, `Am`, `F`, `D7` | Full `G [0232]`, syncopated Island Strum (`D–DU–UDU`), `F#` in G Major |
| **4** | **Minor Keys, Syncopated Picking & Pop Grooves** | `Am`, `Dm`, `Em`, `G` · `4/4`, `3/4` (`84–104 BPM`) | Frets `0–5` · `Dm`, `Em`, `Am`, `C`, `G`, `D` | `Em` staircase (`0432`), natural minor phrasing, dotted-quarter & 8th syncopation |
| **5** | **G & D Major Positions & Arpeggio Fingerpicking** | `D`, `G`, `Em` · `4/4`, `6/8` (`66–104 BPM`) | Frets `0–5` · `D`, `A`, `A7`, `Bm`, `Em`, `G` | `Bm` partial barre (`4222`), `T–I–M–A` rolling arpeggios, `6/8` ballad sway |
| **6** | **Movable Shapes, Bb Barre & 8th-Note Leads** | `F`, `Dm`, `D`, `C` · `4/4`, `2/4` (`88–110 BPM`) | Frets `1–7` · `Bb`, `Gm`, `Cm`, `F#m`, `E7` | `Bb [3211]` partial barre, movable neck shapes, agile 8th-note scalar runs |
| **7** | **7th Chords, Blues & Jazzy Voicings** | `C`, `Am`, `A`, `G` · `4/4`, `6/8` (`84–112 BPM`) | Frets `0–7` · `Cmaj7`, `Am7`, `Dm7`, `Fmaj7`, `G7`, `E7`, `C7`, `F7`, `D7` | `ii7–V7–Imaj7` jazz comping, 12-bar ukulele blues, minor pentatonic blue notes |
| **8** | **Up-the-Neck Melody, Double-Stops & Campanella** | `C`, `G`, `D`, `F` · `4/4`, `3/4` (`86–112 BPM`) | **Frets `5–12`** (`C5–A5`) · high voicings | 5th–12th position clarity, parallel 3rd/6th double-stops, harp-like campanella |
| **9** | **Chord-Melody Mastery, Modulations & Capstones** | `C`, `D`, `G`, `Eb` · `4/4`, `3/4`, `6/8` (`72–118 BPM`) | Full `0–12` neck · `Cadd9`, `Gmaj7`, `C#7`, `B7`, `Bbmaj7`, `Dm7b5`, slash chords | Top-string chord-melody arranging, secondary dominants, bossa & concert capstones |

---

## 4. Nylon-String Acoustic Synthesizer (`js/audio/ukulele_synth.js`)

`UkuleleSynthesizer` mirrors `PianoSynthesizer`'s public API and shares the single app `AudioContext` + `BackingTrackEngine`:
- **Pluck Transient**: `14 ms` bandpassed pink-noise attack burst simulating nylon finger pluck.
- **Harmonic Contour**: Warm fundamental + rapidly damped 2nd/3rd/4th nylon partials with `+6 cent` 18 ms tension bloom.
- **Soundbox Resonance**: Dual peaking biquads at `300 Hz` (Helmholtz cavity) and `520 Hz` (top-plate resonance) into a `3800 Hz` warm low-pass roll-off.
- **Strum Engine**: `playStrum(notes, dur, "down" | "up")` applies authentic `14 ms` G→C→E→A or A→E→C→G arpeggiated brush timing and subtle per-string stereo panning.
- **Headphone Split**: `setMuted(true)` silences only guide ukulele notes while leaving `BackingTrackEngine` and wooden metronome clicks unaffected.
