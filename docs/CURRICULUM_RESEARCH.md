# 61-Key Piano Pedagogy & Levels 1–9 Curriculum Research

> **Scope & Purpose**: Reference pedagogical architecture, ergonomic 61-key (`MIDI 36..96`, `C2..C7`) register map, bimanual skill matrix, headphone backing-band mix specification, and complete **Levels 1–9 Syllabus Blueprint** (`lessons` × `3 parts`: `solo`, `chords`, `combined`) for the Yousician Piano App (`/Users/ojus/official/piano-app`).

---

## 1. Comparative Pedagogy Synthesis

Modern structured piano education converges from four complementary traditions. Our Levels 1–9 curriculum synthesizes their strongest mechanisms while eliminating common adult-learner bottlenecks:

| Curriculum System | Core Strength | Known Limitation on 61-Key / Self-Guided App | How Our Levels 1–9 Syllabus Adapts It |
| :--- | :--- | :--- | :--- |
| **Yousician Piano (Levels 1–9)** | Splits learning into **Classical/Solo** (melody, notation, bimanual independence) and **Pop/Chords** (groove comping, inversions, band play-alongs) over studio backing tracks. | Learners who stay exclusively in one track either struggle to comp chords by ear or struggle to play independent melodies. | **Unified 3-Part Lesson Triad**: Every single lesson across Levels 1–9 pairs **Part 1 (`solo`)** + **Part 2 (`chords`)** + **Part 3 (`combined` capstone)** over synchronized headphone backing music. |
| **Alfred's Basic Adult All-In-One (Books 1–3)** | Rapid harmonic gratification: anchors early lessons in clear C/G/F hand positions and introduces primary chords (`I`, `IV`, `V7`) early so beginners sound musical immediately. | Staying locked in fixed 5-finger positions too long creates a "finger-number = pitch" crutch (`1` always means `C4`). | Anchor **Levels 1–2** in tactile C5 pentascales (`C4–G4` & `C3–G3`) with canonical 5-finger colors, introduce `C–F–G–Am` comping in **Level 3**, then break fixed-position habits in **Level 4** via thumb-under shifts and `G`/`F`/`Am` anchors. |
| **Faber Adult Piano Adventures (Books 1–2 → Lv 3B/4)** | Strong **intervallic reading** (2nds, 3rds, 4ths, 5ths), dedicated rhythm/upbeat phrasing clinics, and gradual progression from 2-note dyads/shells to broken chords and full triads. | Slower initial pop-accompaniment density if not paired with groove backing tracks. | Use **harmonic dyads (3rds/5ths/6ths)** in Levels 1–2 and **3rd+7th shell voicings** in Level 7 as ergonomic bridges before dense 3- and 4-note voicings; support sparse early textures with lush headphone backing bands. |
| **ABRSM / RCM Practical Grades (Grades 1–6)** | Rigorous tonal progression across circle-of-fifths keys (`0` to `3+` sharps/flats), diverse meters (`4/4`, `3/4`, `2/4`, `6/8`, `3/8`), articulation contrast, and polyphonic voice balance. | Grades 4–6 assume an 88-key grand (`A0..C8`) with 4-octave scales and contra-octave (`A0–B1`) Romantic bass octaves that clip on 61-key keyboards. | Cap scalar/arpeggio spans at **2–3 octaves** within `C2..C7` (`MIDI 36..96`), voice bass roots/octaves in `C2–B2` (`36–47`), and keep close-position LH chords at or above `C3` (`MIDI 48`) to respect acoustic low-interval limits. |

### Grade Equivalency Mapping
- **Levels 1–2**: Yousician Basics–Lv 2 · Faber Adult Book 1 (Units 1–6) · Pre-Grade 1
- **Levels 3–4**: Yousician Lv 3–4 · Alfred Adult Book 1 / Faber Adult Book 2 · ABRSM/RCM **Grade 1**
- **Levels 5–6**: Yousician Lv 5–6 · Alfred Adult Book 2–3 · ABRSM/RCM **Grades 2–3**
- **Levels 7–8**: Yousician Lv 7–8 · Intermediate Repertoire · ABRSM/RCM **Grades 4–5** (61-key adapted)
- **Level 9**: Yousician Lv 9 Mastery · Early-Advanced Concert & Jazz Etudes · ABRSM/RCM **Grade 5–6** (5-octave voiced)

---

## 2. Ergonomic Progression on a 61-Key Keyboard (`MIDI 36..96`, `C2..C7`)

Our target instrument spans **61 keys** (`5 full octaves`), calibrated across keys `#1` (`C2`, `MIDI 36`, `65.41 Hz`) through `#61` (`C7`, `MIDI 96`, `2093.00 Hz`) with **Middle `C4` (`MIDI 60`)** at Key `#25` (White Key `#15`).

### 2.1 Register Expansion Envelope Across Levels 1–9

```
61-Key Keyboard Span: C2 (36) ──────────────────────── Middle C4 (60) ──────────────────────── C7 (96)
Lv 1 (RH Foundation):                                  [C4 ── G4] (60..67)
Lv 2 (Bimanual C5):                    [C3 ── G3]      [C4 ── G4] (48..67)
Lv 3 (Primary Comping):             [A2 ─── G3]        [C4 ──── C5] (45..72)
Lv 4 (Shifts & 1-#/1-b):          [G2 ───── A3]       [B3 ────── E5] (43..76)
Lv 5 (Inversions/Slash):        [F#2 ────── B3]      [A3 ──────── G5] (42..79)
Lv 6 (Alberti & Agility):      [E2 ──────── C4]      [A3 ────────── A5] (40..81)
Lv 7 (7ths & Blues/Soul):     [D2 ───────── C4]     [G3 ──────────── C6] (38..84)
Lv 8 (Romantic/Modulation):  [C2 ────────── D4]     [G3 ────────────── E6] (36..88)
Lv 9 (Virtuoso 61-Key Span): [C2 ────────── E4]     [G3 ────────────────── C7] (36..96)
```

### 2.2 Acoustic Low-Interval Limit (LIL) & 61-Key Voicing Rules
1. **Never place close-position 3-note triads below `A2` (`MIDI 45`)** (ideally keep LH block triads in `C3..C4`, `MIDI 48..60`): Below `C3` (`130.81 Hz`), major/minor thirds (`3–4 semitones`) generate strong acoustic beating and clash with the headphone backing bass.
2. **Low Bass Octave (`C2..B2`, `MIDI 36..47`) Usage**:
   - **Levels 1–2**: Unused (keeps beginners centered in the visual sweet spot around Middle `C4` without extreme ledger lines).
   - **Levels 3–5**: Single bass root notes (`F2=41`, `F#2=42`, `G2=43`, `A2=45`, `B2=47`) or root–fifth open dyads (`G2–D3`, `A2–E3`), matching `wise_men_say` and `yousician_groove` in `js/songs/library.js`.
   - **Levels 6–9**: Single roots (`C2=36..B2=47`), broken octave–fifth–octave arpeggios (`C2–G2–C3` with `5-2-1` fingering), or broken Romantic tenths (`C2 -> G2 -> E3`).
3. **Upper Treble Octave (`C6..C7`, `MIDI 84..96`) Usage**:
   - Reserved for **Levels 7–9** climax bell tones, cascading arpeggio peaks, and concert endings so standard Levels 1–6 pieces read cleanly on the treble staff with minimal ledger lines (`A3..A5`, `MIDI 57..81`).

### 2.3 Biomechanical & `PianoFingeringEngine` Invariants
All curriculum parts pass through `PianoFingeringEngine` (`js/engine/fingering.js`) and MUST satisfy these strict pedagogical invariants:
- **Canonical 5-Finger Color & Label Scheme**:
  - `1` (`"T"` Thumb): `#48A870` (Emerald Sage)
  - `2` (`"1"` Index): `#F0C830` (Warm Amber-Gold)
  - `3` (`"2"` Middle): `#6848F8` (Royal Violet)
  - `4` (`"3"` Ring): `#4090F8` (Cerulean Blue)
  - `5` (`"4"` Pinky): `#E86078` (Coral Rose)
- **Simultaneous Intra-Hand Chord Ordering (Non-Negotiable)**:
  - Never assign the same finger to two distinct simultaneous pitches in the same hand.
  - **Right Hand** ascending pitches (`p0 < p1 < ...`) strictly map to **increasing** fingers (`f0 < f1 < ...`):
    - Dyads: `3rd` = `1-3` (or `2-4` / `3-5`); `5th` = `1-5`; `6th` = `1-5` (or `1-4`).
    - Root Triad (`C4-E4-G4`): `1-3-5`
    - 1st Inversion Triad (`E4-G4-C5`): `1-2-5`
    - 2nd Inversion Triad (`G4-C5-E5`): `1-3-5`
    - 4-Note 7th Chord (`C4-E4-G4-B4`): `1-2-3-5` (or `1-2-4-5` depending on black/white geometry).
  - **Left Hand** ascending pitches (`p0 < p1 < ...`) strictly map to **decreasing** fingers (`f0 > f1 > ...`):
    - Dyads: `5th` (`C3-G3`) = `5-1`; `3rd` (`C3-E3`) = `5-3` or `3-1`; `6th` (`B2-G3`) = `5-1`.
    - Root Triad (`C3-E3-G3`): `5-3-1`
    - 1st Inversion Triad (`E3-G3-C4`): `5-3-1`
    - 2nd Inversion Triad (`G2-C3-E3` / `G3-C4-E4`): `5-2-1`
    - 4-Note 7th Chord (`C3-E3-G3-B3`): `5-3-2-1` (or `5-4-2-1`).
- **Chopin's Terrain Rule (Black-Key Ergonomics)**:
  - Avoid placing Thumb (`1`) on black keys (`F#`, `C#`, `G#`, `Bb`, `Eb`) during scalar melodies; favor passing `1` onto an adjacent white key (`E4 -> F#4 -> G4` or `A4 -> Bb4 -> C5` using `1-2-3` or `1-2-3-1-2-3-4`).
- **Grid & Articulation Precision**:
  - Every `time >= 0.0` aligns exact beat/subdivision multiples from `t = 0.0s` (Measure `0`, Beat `1`).
  - Every `duration = gridDurationSec - 0.025` (`>= 0.15s`), creating a clean `25 ms` articulation release between repeated notes so visual pills and `NoteEvaluator` hit windows never merge.

---

## 3. Progression Matrix: Solo, Chords, Coordination, Keys, Rhythms & Backing

| Level | Pedagogical Theme | Keys | Meters & Tempo (BPM) | Rhythmic Vocabulary | Solo Melody Skills (`Part 1`) | Chords & Comping (`Part 2`) | Bimanual Coordination (`Part 3`) | Ideal Headphone `backingStyle` |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Piano Foundations & RH C Position** | `C` | `4/4` · `68–84 BPM` | Whole, half, quarter notes & quarter rests | RH `C4–G4` (`1..5`) steps, repeated-note articulation, first skips (`3rds`) | First harmonic 2-note dyads in RH (`C4+E4` `1-3`, `C4+G4` `1-5`, `B3+G4` `1-5` or `D4+G4` `2-5`) | Single-hand RH mastery (`targetHands: {left:false, right:true}`) locking pulse to headphone pad/click | `warm_pad`, `acoustic_pop` |
| **2** | **Left-Hand Bass & Two-Hand Entry** | `C`, `Am` (white-key) | `4/4`, `3/4` · `72–92 BPM` | Dotted half (`3 beats`), ties across beats, half + quarter patterns | LH `C3–G3` (`5..1`) bass walks + RH `C4–G4` lyrical phrases | LH open 5th (`C3+G3` `5-1`) & 3rd dyads; basic `C`–`G`–`Am`–`F` bass roots | Alternating LH/RH call-and-response → synchronized Beat-1 two-hand attacks (`Ode to Joy` tier) | `warm_pad`, `waltz_chamber`, `acoustic_pop` |
| **3** | **Primary Triads & Comping Grooves** | `C`, `Am` | `4/4`, `3/4` · `80–100 BPM` | Quarter-note comping pulses, half-note bass against quarter chords, broken triad quarters | Expressive `C4–A4` melodies with 4th/5th intervals and phrase breaths | Root-position triads (`C`, `F`, `G`, `Am`), broken-chord patterns, pop four-on-the-floor comping | **Dual Role**: (a) LH block/broken triad + RH melody; (b) LH bass root + RH rhythmic chord comping | `acoustic_pop`, `warm_pad`, `waltz_chamber` |
| **4** | **New Keys (`G`, `F`, `Am`), 8th Notes & Shifts** | `G`, `F`, `Am`, `C` | `4/4`, `3/4`, `2/4` · `84–108 BPM` | Straight eighth notes (`1 & 2 &`), dotted quarter + eighth (`1.. &`), pickup anacrusis | First black keys (`F#4`, `Bb4`), `1-2-3-1-2-3-4-5` thumb-under scale crossings & smooth position shifts | `G`–`C`–`D`–`Em` and `F`–`Bb`–`C`–`Dm` progressions, eighth-note broken chords | Independent RH eighth-note melody over LH half/quarter harmonic accompaniment (*Minuet in G* / *Amazing Grace* tier) | `acoustic_pop`, `classical_strings`, `waltz_chamber` |
| **5** | **Chord Inversions, Slash Chords & Ballads** | `D`, `Em`, `C`, `G` | `4/4`, `6/8` · `66–104 BPM` | Syncopated anticipation (`& of 2` / `dotted-quarter + quarter`), `6/8` compound lilt | Cantabile `D Major` & `E Minor` melodies spanning `A3–G5` (`F#`, `C#`) with wide interval leaps | **1st & 2nd Triad Inversions** (`C -> E-G-C`, `C-E-G -> C-F-A -> B-D-G`) + **Slash Chords** (`D/F#`, `G/B`, `C/E`, `Am/G`) | Stepwise LH basslines under RH syncopated comping & melodic fills (*Yousician Groove* / *Canon in D* tier) | `acoustic_pop`, `warm_pad`, `cinematic_pulse` |
| **6** | **16th-Note Agility & Classical Alberti Bass** | `C`, `G`, `D`, `Am` | `4/4`, `3/4`, `3/8` · `76–116 BPM` | Sixteenth-note groups (`1 e & a`), eighth + two sixteenths, `3/8` classical flow | Classical scalar runs, neighbor-tone turns (`E5-D#5-E5`), crisp staccato vs. legato phrasing | **Alberti Bass** (`low–high–mid–high`, e.g. `C3-G3-E3-G3` `5-1-3-1`) & waltz `bass–chord–chord` | Continuous LH Alberti/arpeggio accompaniment supporting independent RH classical themes (*Für Elise* tier) | `classical_strings`, `waltz_chamber` |
| **7** | **Minor Scales, 7th Chords & Soul/Blues** | `Am`, `Dm`, `Em`, `F`, `G` | `4/4`, `12/8` (or `6/8`) · `78–112 BPM` | Charleston syncopation (dotted quarter + eighth rest/tie), blues triplet/compound groove | Harmonic minor (`G#`, `C#`), natural minor arpeggios, & minor-pentatonic/blues solo riffs (`Bb`/`Eb` blue notes) | **4-Note & Shell 7th Chords** (`Cmaj7`, `Dm7`, `G7`, `Am7`, `Fmaj7`, `E7`), `ii7–V7–Imaj7` guide-tone voice leading (`3rd` & `7th`) | LH groove basslines (root–5th–b7th) against RH syncopated 7th shell chords & blues solo responses | `jazz_brushes`, `acoustic_pop`, `cinematic_pulse` |
| **8** | **Expressive Polyphony, Modulations & Romanticism** | `Bb`, `Eb`, `Bm`, `D`, `Gm` | `6/8`, `3/4`, `4/4` · `63–108 BPM` | Sweeping `6/8` arpeggios, two-voice counterpoint rhythms, expressive phrase cadences | Lyric melodies in 2-flat/2-sharp keys (`Bb`, `Eb`, `F#`, `C#`), inner-voice harmony below top melody | Wide **Octave/Fifth/Tenth LH Arpeggios** (`D3-A3-F#4` / `G2-D3-B3`), secondary dominants (`C#7 -> F#m`, `B7 -> Em`), pivot modulations | Sweeping LH multi-octave arpeggios + expressive RH chord-melody voicing (*Wise Men Say* full arrangement tier) | `classical_strings`, `waltz_chamber`, `cinematic_pulse` |
| **9** | **Virtuoso Mastery: Extended Jazz & Concert Capstones** | `C`, `Db`/`Fm`, `A`, `Eb`, `Dm` | `4/4`, `3/4`, `6/8` · `88–126 BPM` | Rapid 16th-note scalar/arpeggio cascades, syncopated cross-accents, dramatic concert cadences | 2-to-3 octave scalar & broken-chord runs across `C2..C7`, octave melody reinforcement, concert dynamics | **Extended & Rootless Voicings** (`maj9`, `m9`, `13`, `sus4`, `7b9`, `dim7`, cinematic quartal/add9 stacks) | Full bimanual independence: contrapuntal bass + inner harmonic comping + soaring upper-register lead across the full 61-key span | `cinematic_pulse`, `jazz_brushes`, `classical_strings` |

---

## 4. Headphone Backing-Band Acoustic & Mix Architecture

Because `/Users/ojus/official/piano-app` is engineered for **headphone practice** where:
1. **Song Backing Music (`BackingTrackEngine`) ALWAYS plays** by default during gameplay (`backingAudioEnabled = true`), and
2. **Play-Along Toggle (`#btnPlayAlongToggle` / `referenceAudioEnabled`)** exclusively toggles the **reference piano score notes** ON/OFF,

the Web Audio backing synthesizer and curriculum score voicings must cooperate acoustically so the live piano (played via MIDI or acoustic keyboard + closed-back headphones) sits effortlessly in the center of the mix without muddiness or ear fatigue.

### 4.1 Frequency & Stereo Pocket Rules
1. **Sub & Bass Pocket (`55 Hz – 190 Hz`, Dead Center Pan `0.0`)**:
   - Backing bass plays warm low-passed triangle/sine-fundamental notes on chord roots, fifths, and **explicit slash-chord bass notes** (`D/F#` → `F#2`, `G/B` → `B2`, `C/E` → `E2`).
   - *Curriculum Rule*: Keep beginner/intermediate piano LH triads at `>= C3` (`130.8 Hz`) so piano thirds never collide with the backing bass fundamental.
2. **Piano Clarity Pocket (`220 Hz – 1.4 kHz`) & Wide Stereo Pad (`Pan ±0.45..0.65`)**:
   - Sustained synth/string pads easily mask Middle `C4–C5` (`261–523 Hz`). Keep pad oscillators high-passed above `150 Hz`, gently low-pass filtered (`900–1400 Hz` warm roll-off), and stereo-spread left/right so the center image belongs strictly to the user's piano.
3. **Fatigue-Free Studio Percussion (`Felt Kick` + `Soft Brush/Shaker`)**:
   - Avoid sharp `1.5–3.5 kHz` snare transients that compete with piano hammer attacks or bleed out of headphones into the acoustic microphone (`52 Hz` HPF + `CalibratedPolyphonicDetector`). Use soft felt low-end thumps (`65–95 Hz`) and gentle filtered noise brushes (`3.5–7 kHz` at low gain).
4. **Count-In & Wait-Mode Continuity**:
   - During pre-roll count-in measures (`currentTime < 0`), provide a subtle preparatory harmonic breath/pulse so the player feels the tempo and key before Measure `0` Beat `1`.
   - When `Wait` mode freezes at an unplayed chord (`isWaiting === true`), release active backing oscillators cleanly (`~30 ms` ramp) so zero hanging drones persist while the student studies finger placement.

### 4.2 Backing Style Catalog (`song.backingStyle`)

| `backingStyle` ID | Sonic Palette & Groove | Ideal Meter & Tempo | Primary Curriculum Levels |
| :--- | :--- | :--- | :--- |
| `"warm_pad"` | Lush analog-warm detuned stereo pad + gentle root/fifth sub-bass breath, minimal percussion | `4/4`, `3/4`, `6/8` · `64–88 BPM` | **Levels 1, 2, 3, 5** (calm foundational focus & lyrical ballads) |
| `"acoustic_pop"` | Warm studio bass + soft felt kick on beats `1`/`3` + light brush shaker on `8ths` + airy triad pad | `4/4`, `6/8` · `76–108 BPM` | **Levels 1, 2, 3, 4, 5, 7** (chord comping, pop progressions, slash chords) |
| `"classical_strings"` | Chamber cello/contrabass pizzicato-arco bass + warm legato string ensemble pad (no drum kit) | `4/4`, `2/4`, `3/8`, `6/8` · `70–120 BPM` | **Levels 4, 6, 8, 9** (Alberti bass, classical etudes, Romantic polyphony) |
| `"waltz_chamber"` | Triple-meter `1 - 2 - 3` warm bass on Beat `1` + gentle chamber string/harp swells on Beats `2–3` | `3/4`, `3/8` · `78–116 BPM` | **Levels 2, 3, 4, 6, 8** (minuets, waltzes, romantic triple-meter pieces) |
| `"jazz_brushes"` | Walking/two-feel upright bass + warm Rhodes/velvet pad + swung ride/brush hi-hat on `2 & 4` | `4/4`, `6/8`/`12/8` · `76–112 BPM` | **Levels 7, 9** (`ii7–V7–Imaj7` shells, blues/soul grooves, extended 9ths/13ths) |
| `"cinematic_pulse"` | Deep evolving sub-bass pedal + rhythmic muted arpeggio pulse + wide orchestral/synth horizon | `4/4`, `6/8`, `3/4` · `80–126 BPM` | **Levels 5, 7, 8, 9** (epic modulations, capstone performances, modern scores) |

---

## 5. Exact Levels 1–9 Syllabus Blueprint

Every lesson follows the **3-Part Pedagogical Triad** (`8–16 measures` per part, `20–95` barline-aligned notes):
1. **Part 1 (`partType: "solo"`)**: Melodic reading, scale/interval dexterity, phrasing, or classical/blues solo technique.
2. **Part 2 (`partType: "chords"`)**: Harmonic intervals, triads, inversions, slash basslines, Alberti patterns, or 7th/9th groove comping.
3. **Part 3 (`partType: "combined"`)**: Full musical performance piece uniting Part 1's melodic vocabulary with Part 2's harmonic accompaniment over headphone backing music.

---

### LEVEL 1 — Piano Foundations & Right-Hand C Position
- **ID**: `level_1` · **Lessons**: `4` (`12` parts) · **Register**: `B3..G4` (`MIDI 59..67`) · **XP/Part**: `50–70`
- **Pedagogical Goal**: Establish relaxed 5-finger posture on Middle C (`C4–G4`, fingers `T,1,2,3,4`), steady quarter/half/whole pulse, stepwise reading, skips (`3rds`), and first 2-note harmonic dyads (`C` & `G`) with `targetHands: { left: false, right: true }`.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l1_lesson_1`** | **Middle C & Steady Pulse** (`solo`) | `C` · `4/4` · `72 BPM` · `warm_pad` | *First Steps on C–D–E* (`C4–E4` steps, quarters & halves) | *Open Fifth Resonance* (`C4+G4` `1-5` harmonic dyad whole/half pulses) | *Morning Bell Walk* (`C4–G4` stepwise melody ending phrases on `C4+G4` dyads) |
| **`l1_lesson_2`** | **Five-Finger Arch (`C4–G4`)** (`both`) | `C` · `4/4` · `76 BPM` · `warm_pad` | *Pentascale Sunrise* (ascending/descending `C4–D4–E4–F4–G4` with `1-2-3-4-5`) | *Warm Thirds (`C–E` & `D–F`)* (`1-3` & `2-4` dyad pulse over `C`–`Dm`–`G`–`C`) | *Lantern on the River* (flowing 5-finger melody punctuated by half-note `1-3` / `1-5` dyads) |
| **`l1_lesson_3`** | **Skips, Thirds & Quarter Rests** (`both`) | `C` · `4/4` · `80 BPM` · `acoustic_pop` | *Stepping & Skipping* (`C4–E4–G4` skips + breath rests on beat 4) | *Tonic & Dominant Shells* (`C4+E4` `1-3` ↔ `D4+G4` `2-5` / `B3+G4` `1-5` comping) | *Sidewalk Stroll* (playful skip melody alternating with rhythmic 2-note `C` & `G` hits) |
| **`l1_lesson_4`** | **Level 1 Capstone: First Songbook** (`both`) | `C` · `4/4` · `84 BPM` · `acoustic_pop` | *Hymn of Joy (RH Theme)* (lyrical 12-bar `C4–G4` anthem melody) | *Pop Pulse Dyads* (`C`–`G`–`Am`–`F` 2-note RH harmonic rhythm) | *Starlight Promenade* (12-bar RH solo + dyad capstone uniting steps, skips, and chords) |

---

### LEVEL 2 — Left-Hand Bass & Two-Hand Coordination
- **ID**: `level_2` · **Lessons**: `4` (`12` parts) · **Register**: `C3..G4` (`MIDI 48..67`) · **XP/Part**: `65–85`
- **Pedagogical Goal**: Introduce Bass Clef C Position (`C3–G3`, Pinky `5` on `C3` to Thumb `1` on `G3`), transition from alternating hands to synchronized Beat-1 two-hand attacks, and introduce `3/4` meter.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l2_lesson_1`** | **Bass Clef Foundations (`C3–G3`)** (`solo`) | `C` · `4/4` · `76 BPM` · `warm_pad` | *Deep C Bass Walk* (LH solo `C3–D3–E3–F3–G3` using `5-4-3-2-1`, `left:true, right:false`) | *Bass Fifth Anchors* (LH `C3+G3` `5-1` & `F3+G3` / `D3+G3` harmonic bass intervals) | *Echoes Across Middle C* (alternating 2-bar LH bass calls & RH treble responses) |
| **`l2_lesson_2`** | **Hands Together on the Downbeat** (`both`) | `C` · `4/4` · `82 BPM` · `acoustic_pop` | *Contrary Mirror Warmup* (symmetric `C4`+`E3` / `C3`–`G3` & `C4`–`G4` motion) | *Four-Chord Bass Roots* (LH `C3–G3–A3/F3` whole/half roots + RH dyad answers) | *Harbor Lights* (synchronized Beat-1 LH bass + RH quarter/half melody, *Ode to Joy* tier) |
| **`l2_lesson_3`** | **Graceful `3/4` Waltz & Dotted Halves** (`both`) | `C` · `3/4` · `88 BPM` · `waltz_chamber` | *Carousel Melody* (RH `3/4` flowing steps & dotted-half sustains) | *Waltz Bass & Fifths* (LH Beat-1 root + Beat-2/3 fifth or RH `1-3` dyad pulse) | *Moonlit Waltz* (12-bar `3/4` duet: LH dotted-half bass supporting RH lyrical waltz) |
| **`l2_lesson_4`** | **Minor Color (`A Minor`) & Bimanual Flow** (`both`) | `Am` · `4/4` · `88 BPM` · `warm_pad` | *Autumn in A Position* (RH `A3/A4–E4/E5` natural minor lyrical line) | *Am–F–C–G Bass & Dyads* (bimanual open-harmony groove across `Am–F–C–G`) | *Northern Dusk* (expressive 12-bar `A minor` bimanual capstone with moving bass) |

---

### LEVEL 3 — Primary Chords (`C`, `F`, `G`, `Am`) & Comping Grooves
- **ID**: `level_3` · **Lessons**: `4` (`12` parts) · **Register**: `A2..C5` (`MIDI 45..72`) · **XP/Part**: `75–100`
- **Pedagogical Goal**: Master 3-note root-position triads (`1-3-5` in RH, `5-3-1` in LH), broken-chord arpeggiations, LH chord + RH melody textures, and modern band-style RH chord comping over LH bass roots.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l3_lesson_1`** | **C & G Major Root Triads** (`chords`) | `C` · `4/4` · `84 BPM` · `acoustic_pop` | *Triad Arpeggio Etude* (RH & LH broken `C–E–G` & `G–B–D` melodic outlines) | *Block Triad Lock (`C` & `G`)* (clean 3-note `1-3-5` / `5-3-1` half-note chord strikes) | *Sunlight Boulevard* (LH `C` & `G` triads/broken fifths under bright RH `C4–A4` melody) |
| **`l3_lesson_2`** | **Subdominant `F` & Relative `Am`** (`chords`) | `C` · `4/4` · `88 BPM` · `warm_pad` | *Lyrical Sixths & Steps* (RH `C4–A4` expressive melody over `F` and `Am` harmony) | *Axis Progression (`C–G–Am–F`)* (4-chord pop progression in steady root triads) | *Golden Hour Anthem* (classic `I–V–vi–IV` song combining LH harmony + RH hook) |
| **`l3_lesson_3`** | **Broken Chords & Flowing Accompaniment** (`both`) | `C` · `3/4` · `94 BPM` · `waltz_chamber` | *Cantabile Over Arpeggios* (RH lyrical `3/4` theme with expressive leaps) | *Broken Triad Flow* (LH `C3–E3–G3` → `F3–A3–C4` → `G3–B3–D4` quarter-note waves) | *Glass Conservatory* (16-bar `3/4` piece pairing LH broken triads with RH solo melody) |
| **`l3_lesson_4`** | **Band Comping: RH Chords + LH Bass** (`chords`) | `Am` / `C` · `4/4` · `98 BPM` · `acoustic_pop` | *Pop Hook Riff* (catchy RH melodic riff spanning `C4–C5`) | *Studio Comping Groove* (LH `A2–F2–C3–G2` bass roots + RH quarter-note `Am–F–C–G` triads) | *City Rooftops* (full band-style arrangement alternating RH chord comping & solo chorus) |

---

### LEVEL 4 — New Keys (`G`, `F`, `Am`), Eighth Notes & Thumb-Under Shifts
- **ID**: `level_4` · **Lessons**: `4` (`12` parts) · **Register**: `G2..E5` (`MIDI 43..76`) · **XP/Part**: `85–120`
- **Pedagogical Goal**: Unlock `1-sharp` (`G Major`, `F#`) and `1-flat` (`F Major`, `Bb`) tonalities, subdivide the beat into straight eighth notes (`1 & 2 &`) and dotted-quarter + eighth rhythms, and master smooth `1-2-3-1-2-3-4-5` thumb-under scale crossings.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l4_lesson_1`** | **G Major (`F#`) & Eighth-Note Pulse** (`both`) | `G` · `4/4` · `92 BPM` · `acoustic_pop` | *Highland Stream (`G4–G5`)* (eighth-note scalar runs hitting `F#4`/`F#5` with finger `4`) | *`G–C–D–Em` Groove* (root & broken chords in `G Major` with `F#` in `D` triad) | *Meadowlark Morning* (sparkling `G Major` eighth-note melody over LH `G–Em–C–D` bass/chords) |
| **`l4_lesson_2`** | **Thumb-Under Crossing & Full-Octave Scales** (`solo`) | `C` · `4/4` · `96 BPM` · `classical_strings` | *Octave Scale Etude* (smooth RH `1-2-3-1-2-3-4-5` & LH `5-4-3-2-1-3-2-1` across `C4–C5`) | *Scale-Degree Harmony* (`C–Dm–Em–F–G–C` harmonic accompaniment walk) | *Promenade in C* (full-octave melodic travel seamlessly shifting between `C4` and `C5` registers) |
| **`l4_lesson_3`** | **F Major (`Bb`) & Dotted Quarter Rhythms** (`both`) | `F` · `4/4` · `90 BPM` · `warm_pad` | *Warm Horizon in F* (`F4–G4–A4–Bb4–C5–D5` with `1-2-3-4-1-2`, dotted-quarter + 8th phrasing) | *`F–Bb–Dm–C` Ballad Chords* (warm `Bb` major & `F` major triad comping) | *Amber Twilight* (expressive `F Major` dotted-rhythm song with LH broken fifths & triads) |
| **`l4_lesson_4`** | **Baroque & Folk Dance (`3/4` Minuet Style)** (`both`) | `G` / `Am` · `3/4` · `104 BPM` · `waltz_chamber` | *Courtly Minuet Solo* (crisp `3/4` eighth-note melody inspired by Petzold/Bach *Minuet in G*) | *Counter-Bass & Chords* (classical `3/4` bass line + 2- and 3-note cadence voicings) | *Festival in G* (16-bar Level 4 capstone combining thumb-under runs, `F#`, and 2-hand dance pulse) |

---

### LEVEL 5 — Chord Inversions, Slash Chords & Pop Ballad Comping
- **ID**: `level_5` · **Lessons**: `3–4` (`9–12` parts) · **Register**: `F#2..G5` (`MIDI 42..79`) · **XP/Part**: `95–135`
- **Pedagogical Goal**: Eliminate clunky root-position hand jumps via **1st & 2nd triad inversions** (`1-2-5` & `1-3-5` in RH; `5-3-1` & `5-2-1` in LH), introduce `D Major` (`F#`, `C#`) & `E Minor`, and pair **slash chords** (`D/F#`, `G/B`, `C/E`, `Am/G`) with syncopated pop ballad comping.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l5_lesson_1`** | **Smooth Voice Leading: 1st & 2nd Inversions** (`chords`) | `C` · `4/4` · `88 BPM` · `acoustic_pop` | *Inversion Arpeggio Flight* (RH `C-E-G` → `E-G-C` (`1-2-5`) → `G-C-E` (`1-3-5`) melodic waves) | *Common-Tone Comping* (`C` `[C-E-G]` → `Am/C` `[C-E-A]` → `F/C` `[C-F-A]` → `G/B` `[B-D-G]`) | *Paper Boats* (zero-jump RH inverted chord-melody over warm LH bass roots) |
| **`l5_lesson_2`** | **D Major (`F#`, `C#`) & Descending Slash Bass** (`both`) | `D` · `4/4` · `80 BPM` · `warm_pad` | *Lyric Aria in D* (expressive `D4–F#5` melody with `F#4` and `C#5` long-finger placement) | *Canon & Slash Walk (`D – D/C# – Bm – Bm/A – G – D/F# – Em – A`)* (stepwise LH bass + RH triads) | *Cathedral Echoes* (lush `D Major` pop-classical ballad uniting stepwise slash bass & soaring melody) |
| **`l5_lesson_3`** | **Syncopated Pop Grooves & E Minor** (`both`) | `Em` / `G` · `4/4` · `98 BPM` · `cinematic_pulse` | *Midnight Hook in Em* (syncopated `& of 2` / `& of 4` melodic anticipations across `E4–G5`) | *Anticipated Groove Comping* (`Em – C/E – G/D – D` syncopated RH inversions over driving LH 8th bass) | *Neon Rain* (full syncopated pop-ballad capstone blending inverted chords & lyrical solo chorus) |

---

### LEVEL 6 — Sixteenth-Note Agility, Alberti Bass & Classical Solo Etudes
- **ID**: `level_6` · **Lessons**: `3–4` (`9–12` parts) · **Register**: `E2..A5` (`MIDI 40..81`) · **XP/Part**: `110–150`
- **Pedagogical Goal**: Develop crisp **sixteenth-note (`1 e & a`)** finger independence, classical **Alberti Bass** (`low–high–mid–high`, `5-1-3-1` / `5-1-2-1`), chromatic neighbor ornaments (`E5–D#5–E5`), and dynamic two-hand articulation in `4/4`, `3/4`, and `3/8`.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l6_lesson_1`** | **Classical Alberti Bass (`C` & `G`)** (`both`) | `C` · `4/4` · `84 BPM` · `classical_strings` | *Sonatina Scale Study* (crisp RH 16th-note scalar bursts & classical cadential turns) | *Alberti Engine* (LH continuous `C3-G3-E3-G3` / `B2-G3-D3-G3` / `C3-A3-F3-A3` pattern) | *Vienna Courtyard* (Mozart/Clementi-style Sonatina miniature: LH Alberti bass + singing RH theme) |
| **`l6_lesson_2`** | **Sixteenth-Note Dexterity & Chromatic Turns** (`solo`) | `Am` · `3/8` or `3/4` · `108 BPM` · `waltz_chamber` | *Bagatelle Filigree* (RH neighbor-tone turns `E5–D#5–E5` & descending `Am`/`E7` arpeggio figures) | *Broken Minor & `E7` Harmony* (LH `A2-E3-A3` & `E2-E3-G#3` classical broken-octave accompaniment) | *Candlelight Bagatelle* (*Für Elise*-inspired `Am`/`E7` chamber piece with seamless hand handoffs) |
| **`l6_lesson_3`** | **Baroque Two-Voice Invention Etude** (`both`) | `D` / `G` · `4/4` · `88 BPM` · `classical_strings` | *Perpetual Motion in D* (even 16th-note diatonic sequences across `D4–A5`) | *Harmonic Sequence Cadences* (`D – G/B – A7/C# – D – Bm – Em – A7 – D` active counterpoint) | *Clockwork Gavotte* (energetic bimanual classical capstone with conversational LH/RH motifs) |

---

### LEVEL 7 — Minor Scales, Arpeggios, 7th Chords & Soul/Blues Grooves
- **ID**: `level_7` · **Lessons**: `3–4` (`9–12` parts) · **Register**: `D2..C6` (`MIDI 38..84`) · **XP/Part**: `125–165`
- **Pedagogical Goal**: Master harmonic minor (`#7` leading tone), multi-octave arpeggios, **4-note & guide-tone shell 7th chords** (`maj7`, `m7`, `dom7`), smooth `ii7–V7–Imaj7` voice leading (`F+C` → `F+B` → `E+B`), and soulful blues/jazz syncopation.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l7_lesson_1`** | **`maj7`, `m7` & `dom7` Voicings (`ii–V–I`)** (`chords`) | `C` / `F` · `4/4` · `86 BPM` · `jazz_brushes` | *Dorian & Lydian Bebop Line* (smooth eighth-note jazz phrasing outlining chord 3rds & 7ths) | *Velvet `ii7–V7–Imaj7` Shells & 4-Note Chords* (`Dm7 [D-F-A-C]` → `G7 [B-D-F-G]` → `Cmaj7 [C-E-G-B]`) | *Late Night Espresso* (lounge jazz-soul piece combining LH walking roots, RH 7th shells & melody) |
| **`l7_lesson_2`** | **Harmonic Minor & Sweeping Arpeggios** (`solo`) | `Am` / `Dm` · `4/4` · `94 BPM` · `cinematic_pulse` | *Harmonic Minor Surge* (`D4–C#5–D5` & `A3–G#4–A4` scales + 2-octave `Am`/`Dm`/`E7` arpeggios) | *Minor Seventh Progression (`Dm7 – Gm7 – A7 – Dm7`)* (rich 4-voice minor-key comping) | *Obsidian Mirage* (dramatic minor-key etude pairing sweeping arpeggios with `m7`/`dom7` harmony) |
| **`l7_lesson_3`** | **Soul & Blues Groove Comping** (`both`) | `G` / `C` · `4/4` or `6/8` · `92 BPM` · `jazz_brushes` | *Blue Note Riff* (`C` / `G` blues scale solo featuring `Eb`/`Bb` grace-like turns & Charleston rhythm) | *Gospel-Soul Sevenths (`C7 – F7 – C7 – G7`)* (LH root-5th-b7th groove + RH syncopated 7th stabs) | *Bourbon Street Stroll* (infectious blues-soul capstone trading RH blues licks with 7th-chord comping) |

---

### LEVEL 8 — Expressive Polyphony, Octave/Tenth Bass & Key Modulations
- **ID**: `level_8` · **Lessons**: `3–4` (`9–12` parts) · **Register**: `C2..E6` (`MIDI 36..88`) · **XP/Part**: `140–180`
- **Pedagogical Goal**: Command flat/sharp keys (`Bb Major`, `Eb Major`, `B Minor`), wide LH broken octaves/tenths (`C2–G2–E3`, `G2–D3–B3`), secondary dominants (`C#7 -> F#m`, `B7 -> Em`), key modulations, and Romantic two-voice RH cantabile voicing (`6/8` & `3/4`).

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l8_lesson_1`** | **`6/8` Romantic Nocturne & Wide Bass Arpeggios** (`both`) | `D` / `Bm` · `6/8` · `66 BPM` · `classical_strings` | *Nocturne Cantabile* (soaring `B3–D6` melody with inner harmony sixths/thirds in RH) | *Sweeping `1–5–8` & `1–5–10` Bass* (LH `B2-F#3-B3`, `G2-D3-B3`, `F#2-C#3-A#3` arpeggio waves) | *Starlight Serenade* (lush `6/8` Romantic ballad on par with *Wise Men Say* bridge/verse intricacy) |
| **`l8_lesson_2`** | **Warm Flat Keys (`Bb` & `Eb` Major)** (`both`) | `Bb` / `Eb` · `3/4` · `92 BPM` · `waltz_chamber` | *Velvet Flat-Key Lyrical Etude* (`Bb` & `Eb` black-key topography using long fingers `2-3-4` naturally) | *Romantic Secondary Dominants* (`Bb – D7/A – Gm – Cm7 – F7 – Bb` rich 4-voice progression) | *Autumn Conservatory Waltz* (expressive `Bb Major` concert waltz with chromatic inner voice leading) |
| **`l8_lesson_3`** | **Dramatic Pivot Modulation (`Am → C → D`)** (`both`) | `Am` → `D` · `4/4` · `96 BPM` · `cinematic_pulse` | *Modulating Theme & Variation* (thematic motif transforming from `A minor` up to radiant `D major`) | *Pivot Cadence Architecture* (`Am – F – Dm7 – G7 – C – A7/C# – D – G – A – D` octave bass + triads) | *Horizon Ascent* (16-bar modulating cinematic-romantic piece spanning `D2` to `E6`) |

---

### LEVEL 9 — Virtuoso Mastery: Extended Voicings, Scalar Runs & Concert Capstones
- **ID**: `level_9` · **Lessons**: `3–4` (`9–12` parts) · **Register**: Full 61-Key Span `C2..C7` (`MIDI 36..96`) · **XP/Part**: `160–200`
- **Pedagogical Goal**: Synthesize every technical & harmonic pillar across the entire 5-octave (`C2..C7`) range: extended jazz/neo-soul harmony (`maj9`, `m9`, `13`, `sus4`, `dim7`), sparkling multi-octave scalar/arpeggio cascades, and concert-grade bimanual independence.

| Lesson | Title & Mode Focus | Key · Meter · BPM · Backing | Part 1 (`solo`) | Part 2 (`chords`) | Part 3 (`combined`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`l9_lesson_1`** | **Extended Jazz & Neo-Soul Harmony (`9ths` & `13ths`)** (`chords`) | `C` / `F` · `4/4` · `92 BPM` · `jazz_brushes` | *Chromatic Enclosure & Run Solo* (virtuosic jazz-fusion solo spanning `G3–G6`) | *Rootless & Lush `9th`/`13th` Voicings* (`Dm9 [F-A-C-E]` → `G13 [F-A-B-E]` → `Cmaj9 [E-G-B-D]` over `D2-G2-C2`) | *Skyline Penthouse* (sophisticated neo-soul/jazz concert piece uniting rootless `9ths` & fluid solo runs) |
| **`l9_lesson_2`** | **Virtuoso Classical Concert Etude** (`solo`) | `C` / `Am` · `4/4` · `116 BPM` · `classical_strings` | *Cascade across Five Octaves* (brilliant 16th-note scalar & broken-chord runs reaching `A6`/`C7`) | *Octave Bass & Diminished Tension* (`Am – Bdim7/F – E7/G# – Am – Dm/F – G#dim7 – Am` concert chords) | *Tempest Etude* (high-velocity classical showpiece balancing thunderous `E2/A2` bass & crystalline treble runs) |
| **`l9_lesson_3`** | **Grand 61-Key Cinematic Finale** (`both`) | `D` / `Bm` / `A` · `6/8` or `4/4` · `104 BPM` · `cinematic_pulse` | *Soaring Octave & Arpeggio Theme* (heroic upper-register theme climbing from `D4` to `A6`) | *Orchestral `add9` & `sus4` Stacks* (`Bm9 – Gmaj7 – D/F# – Asus4 – A` wide 2-hand voicings) | *Odyssey Finale (Level 9 Masterpiece)* (16-bar concert capstone celebrating full 61-key mastery from `D2` to `A6`) |

---

## 6. Catalog Repertoire Cross-Reference (`SONG_LIBRARY` & `songs_data/`)

Players can seamlessly cross over between the **Learn** path (`Levels 1–9`) and the **Songs** catalog (`js/songs/library.js` + `songs_data/*.json`) at these exact skill milestones:

| Catalog Song | Key & Meter | BPM | Recommended Readiness Level | Key Overlapping Skills |
| :--- | :--- | :---: | :---: | :--- |
| **Ode to Joy** (`ode_to_joy`) | `C` · `4/4` | `110` | **After Level 2** | `C4–G4` RH melody + `C3–G3` LH half-note bass roots & dotted-quarter cadence |
| **Happy Birthday** (`happy_birthday`) | `F` / `C` · `3/4` | `100` | **After Level 3–4** | `3/4` pickup anacrusis, octave leap, primary triad accompaniment |
| **Amazing Grace** (`amazing_grace`) | `G` / `F` · `3/4` | `84` | **After Level 4** | Lyrical triple-meter phrasing, pentatonic melody + primary/secondary triads |
| **Yousician Groove** (`yousician_groove`) | `D` · `4/4` | `100` | **After Level 4–5** | `G–A–Bm–G` pop groove, `B4–D5` hook over active `G2–A2–B2–D3` bassline |
| **Minuet in G** (`minuet_in_g`) | `G` · `3/4` | `108` | **After Level 4–5** | `G Major` (`F#`), eighth-note runs, independent classical counter-bass |
| **Canon in D** (`canon_in_d`) | `D` · `2/4` | `75` | **After Level 5** | `D–A–Bm–F#m–G–D–G–A` ground bass (`D2..D3`) + lyrical `D` major descant |
| **Für Elise** (`fur_elise`) | `Am` · `3/8` | `120` | **After Level 6** | `E5–D#5–E5` chromatic turn, broken `Am` & `E7` (`E2-E3-G#3`) cross-staff arpeggios |
| **Wise Men Say** (`wise_men_say`) | `D` · `6/8` | `63.3` | **After Level 7–8** | Compound `6/8` ballad, slash chords (`D/A`, `D/F#`, `Em/G`), secondary dominants (`C#7`, `B7`), `F#2..C#5` span |
