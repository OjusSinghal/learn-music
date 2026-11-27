/**
 * Ukulele (Standard Re-Entrant High-G: G4-C4-E4-A4) Acoustic Data Collection Curriculum
 * ====================================================================================
 * 28-step ergonomic recording protocol aligned with `js/trainer/curriculum.js` so
 * `SoundCollectionTrainer` can reuse it directly for ukulele microphone calibration.
 *
 * String Index & Fret Array Conventions:
 * - Tab string order (`targetStrings` & `string` index):
 *     0 = String 1 (A4, MIDI 69, 440.00 Hz — bottom-most physical string, top tab line)
 *     1 = String 2 (E4, MIDI 64, 329.63 Hz)
 *     2 = String 3 (C4, MIDI 60, 261.63 Hz — lowest sounding pitch on High-G)
 *     3 = String 4 (G4, MIDI 67, 392.00 Hz — re-entrant High-G, top physical string, bottom tab line)
 * - Chord diagram fret array (`targetFrets`): standard `[G, C, E, A]` order (`-1` = unplayed/muted, `0..12` = fret).
 * - Finger numbers (`finger`): `0 = Open`, `1 = Index`, `2 = Middle`, `3 = Ring`, `4 = Pinky`.
 */

export const UKULELE_SPEC = {
    instrument: "ukulele",
    tuningName: "Standard High-G (Re-entrant)",
    tuningShort: "G4-C4-E4-A4",
    numStrings: 4,
    maxFrets: 12,
    startMidi: 60, // C4 (open C-string)
    endMidi: 81,   // A5 (A-string fret 12)
    extendedMaxMidi: 84, // C6 (upper concert/tenor reach)
    lowGMidi: 55,  // G3 (optional Low-G tuning)
    minFreqHz: 261.63,
    maxFreqHz: 880.00,
    strings: [
        { tabIndex: 0, chordIndex: 3, number: 1, name: "A4", letter: "A", midi: 69, freq: 440.00 },
        { tabIndex: 1, chordIndex: 2, number: 2, name: "E4", letter: "E", midi: 64, freq: 329.63 },
        { tabIndex: 2, chordIndex: 1, number: 3, name: "C4", letter: "C", midi: 60, freq: 261.63 },
        { tabIndex: 3, chordIndex: 0, number: 4, name: "G4", letter: "G", midi: 67, freq: 392.00 }
    ]
};

export const UKULELE_TRAINING_CURRICULUM = [
    // =========================================================================
    // 1. AMBIENT SILENCE & ROOM NOISE FLOOR (Step 1)
    // =========================================================================
    {
        id: "uku_step_01_silence",
        order: 1,
        category: "silence",
        categoryLabel: "Ambient Noise",
        title: "Ambient Room Silence",
        subtitle: "Ukulele Baseline · Background Noise Floor Calibration",
        targetStrings: [],
        targetFrets: [-1, -1, -1, -1],
        expectedMidis: [],
        strumType: "silence",
        durationSec: 3.0,
        recordDurationSec: 3.0,
        instructions: "Hold your ukulele still and keep the room completely quiet for 3 seconds. Do not touch the strings.",
        instruction: "Hold your ukulele still and keep the room completely quiet for 3 seconds. Do not touch the strings.",
        targetNotes: [],
        tip: "Profiles room acoustics, AC/fan hum, and microphone floor above the 180 Hz High-G highpass cutoff.",
        quickEssential: true
    },

    // =========================================================================
    // 2. OPEN STRINGS — G4, C4, E4, A4 (Steps 2–5)
    // =========================================================================
    {
        id: "uku_step_02_open_g4",
        order: 2,
        category: "open_strings",
        categoryLabel: "Open Strings (G-C-E-A)",
        title: "Open String 4 — High G (G4)",
        subtitle: "String 4 (Top physical string) · Fret 0 · MIDI 67 · 392.00 Hz",
        targetStrings: [3],
        targetFrets: [0, -1, -1, -1],
        expectedMidis: [67],
        strumType: "pluck",
        durationSec: 2.2,
        recordDurationSec: 2.2,
        instructions: "Pluck the open G4 string (closest to your chin) cleanly with your thumb and let it ring naturally.",
        instruction: "Pluck the open G4 string (closest to your chin) cleanly with your thumb and let it ring naturally.",
        targetNotes: [{ midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" }],
        tip: "Calibrates the re-entrant High-G string timbre, exact tuning cents, and open-string decay.",
        quickEssential: true
    },
    {
        id: "uku_step_03_open_c4",
        order: 3,
        category: "open_strings",
        categoryLabel: "Open Strings (G-C-E-A)",
        title: "Open String 3 — Middle C (C4)",
        subtitle: "String 3 (Thickest string) · Fret 0 · MIDI 60 · 261.63 Hz",
        targetStrings: [2],
        targetFrets: [-1, 0, -1, -1],
        expectedMidis: [60],
        strumType: "pluck",
        durationSec: 2.2,
        recordDurationSec: 2.2,
        instructions: "Pluck the open C4 string cleanly with medium force and let it ring without touching other strings.",
        instruction: "Pluck the open C4 string cleanly with medium force and let it ring without touching other strings.",
        targetNotes: [{ midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" }],
        tip: "Lowest pitch on High-G ukulele (261.63 Hz); anchors the Helmholtz soundhole resonance (A0).",
        quickEssential: true
    },
    {
        id: "uku_step_04_open_e4",
        order: 4,
        category: "open_strings",
        categoryLabel: "Open Strings (G-C-E-A)",
        title: "Open String 2 — E4",
        subtitle: "String 2 · Fret 0 · MIDI 64 · 329.63 Hz",
        targetStrings: [1],
        targetFrets: [-1, -1, 0, -1],
        expectedMidis: [64],
        strumType: "pluck",
        durationSec: 2.2,
        recordDurationSec: 2.2,
        instructions: "Pluck the open E4 string cleanly and let it sustain until the recording ring completes.",
        instruction: "Pluck the open E4 string cleanly and let it sustain until the recording ring completes.",
        targetNotes: [{ midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" }],
        tip: "Calibrates the middle-register body response between soundhole A0 and top-plate T(1,1).",
        quickEssential: true
    },
    {
        id: "uku_step_05_open_a4",
        order: 5,
        category: "open_strings",
        categoryLabel: "Open Strings (G-C-E-A)",
        title: "Open String 1 — Concert A (A4)",
        subtitle: "String 1 (Bottom physical string) · Fret 0 · MIDI 69 · 440.00 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 0],
        expectedMidis: [69],
        strumType: "pluck",
        durationSec: 2.2,
        recordDurationSec: 2.2,
        instructions: "Pluck the open A4 string (closest to the floor) cleanly and let it ring.",
        instruction: "Pluck the open A4 string (closest to the floor) cleanly and let it ring.",
        targetNotes: [{ midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }],
        tip: "440 Hz concert tuning anchor and lower edge of the main top-plate resonance T(1,1).",
        quickEssential: true
    },

    // =========================================================================
    // 3. FRETBOARD ANCHORS ACROSS ALL 4 STRINGS UP TO FRET 12 (Steps 6–15)
    // =========================================================================
    {
        id: "uku_step_06_fret_d4",
        order: 6,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: D4 (C-String, Fret 2)",
        subtitle: "String 3 · Fret 2 · MIDI 62 · 293.66 Hz",
        targetStrings: [2],
        targetFrets: [-1, 2, -1, -1],
        expectedMidis: [62],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the C-string at Fret 2 (D4) firmly right behind the fret wire, pluck once, and hold.",
        instruction: "Fret the C-string at Fret 2 (D4) firmly right behind the fret wire, pluck once, and hold.",
        targetNotes: [{ midi: 62, name: "D4", freq: 293.66, string: 2, fret: 2, finger: 2, clef: "treble" }],
        tip: "Sits directly inside the Helmholtz cavity resonance (~275–305 Hz) on most soprano/concert ukuleles.",
        quickEssential: true
    },
    {
        id: "uku_step_07_fret_f4",
        order: 7,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: F4 (E-String, Fret 1)",
        subtitle: "String 2 · Fret 1 · MIDI 65 · 349.23 Hz",
        targetStrings: [1],
        targetFrets: [-1, -1, 1, -1],
        expectedMidis: [65],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the E-string at Fret 1 (F4) with your index finger, pluck cleanly, and hold.",
        instruction: "Fret the E-string at Fret 1 (F4) with your index finger, pluck cleanly, and hold.",
        targetNotes: [{ midi: 65, name: "F4", freq: 349.23, string: 1, fret: 1, finger: 1, clef: "treble" }],
        tip: "Profiles 1st-fret nut-tension intonation and the core voice of F, Dm, and G7 chords.",
        quickEssential: false
    },
    {
        id: "uku_step_08_fret_fs4",
        order: 8,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: F#4 (E-String, Fret 2)",
        subtitle: "String 2 · Fret 2 · MIDI 66 · 369.99 Hz",
        targetStrings: [1],
        targetFrets: [-1, -1, 2, -1],
        expectedMidis: [66],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the E-string at Fret 2 (F#4), pluck cleanly, and let it ring.",
        instruction: "Fret the E-string at Fret 2 (F#4), pluck cleanly, and let it ring.",
        targetNotes: [{ midi: 66, name: "F#4", freq: 369.99, string: 1, fret: 2, finger: 2, clef: "treble" }],
        tip: "Bridges F4–G4 and calibrates the major third of D Major.",
        quickEssential: false
    },
    {
        id: "uku_step_09_fret_bb4",
        order: 9,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: Bb4 (G-String, Fret 3)",
        subtitle: "String 4 (High-G) · Fret 3 · MIDI 70 · 466.16 Hz",
        targetStrings: [3],
        targetFrets: [3, -1, -1, -1],
        expectedMidis: [70],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the top G-string at Fret 3 (Bb4, inlay dot), pluck cleanly, and hold.",
        instruction: "Fret the top G-string at Fret 3 (Bb4, inlay dot), pluck cleanly, and hold.",
        targetNotes: [{ midi: 70, name: "A#4", freq: 466.16, string: 3, fret: 3, finger: 3, clef: "treble" }],
        tip: "Samples fretted G-string timbre and upper-mid top-plate resonance around 466 Hz.",
        quickEssential: false
    },
    {
        id: "uku_step_10_fret_b4",
        order: 10,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: B4 (A-String, Fret 2)",
        subtitle: "String 1 · Fret 2 · MIDI 71 · 493.88 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 2],
        expectedMidis: [71],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the A-string at Fret 2 (B4), pluck cleanly, and hold.",
        instruction: "Fret the A-string at Fret 2 (B4), pluck cleanly, and hold.",
        targetNotes: [{ midi: 71, name: "B4", freq: 493.88, string: 0, fret: 2, finger: 2, clef: "treble" }],
        tip: "Sits directly on the main top-plate T(1,1) resonance (~480–520 Hz); vital for G, G7, and Em chords.",
        quickEssential: true
    },
    {
        id: "uku_step_11_fret_c5",
        order: 11,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: C5 (A-String, Fret 3)",
        subtitle: "String 1 · Fret 3 · MIDI 72 · 523.25 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 3],
        expectedMidis: [72],
        strumType: "pluck",
        durationSec: 2.0,
        recordDurationSec: 2.0,
        instructions: "Fret the A-string at Fret 3 (C5, same fret as C Major chord), pluck cleanly, and hold.",
        instruction: "Fret the A-string at Fret 3 (C5, same fret as C Major chord), pluck cleanly, and hold.",
        targetNotes: [{ midi: 72, name: "C5", freq: 523.25, string: 0, fret: 3, finger: 3, clef: "treble" }],
        tip: "Key octave partner of C4; calibrates h1/h2 ratios used to verify C4+C5 in C Major.",
        quickEssential: true
    },
    {
        id: "uku_step_12_fret_d5",
        order: 12,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: D5 (A-String, Fret 5)",
        subtitle: "String 1 · Fret 5 (Dot) · MIDI 74 · 587.33 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 5],
        expectedMidis: [74],
        strumType: "pluck",
        durationSec: 1.8,
        recordDurationSec: 1.8,
        instructions: "Fret the A-string at Fret 5 (D5, 5th-fret dot marker), pluck firmly, and hold.",
        instruction: "Fret the A-string at Fret 5 (D5, 5th-fret dot marker), pluck firmly, and hold.",
        targetNotes: [{ midi: 74, name: "D5", freq: 587.33, string: 0, fret: 5, finger: 1, clef: "treble" }],
        tip: "Mid-neck melodic anchor; measures rising nylon string stiffness above fret 5.",
        quickEssential: false
    },
    {
        id: "uku_step_13_fret_e5",
        order: 13,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: E5 (A-String, Fret 7)",
        subtitle: "String 1 · Fret 7 (Dot) · MIDI 76 · 659.25 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 7],
        expectedMidis: [76],
        strumType: "pluck",
        durationSec: 1.8,
        recordDurationSec: 1.8,
        instructions: "Fret the A-string at Fret 7 (E5, 7th-fret dot marker), pluck firmly, and hold.",
        instruction: "Fret the A-string at Fret 7 (E5, 7th-fret dot marker), pluck firmly, and hold.",
        targetNotes: [{ midi: 76, name: "E5", freq: 659.25, string: 0, fret: 7, finger: 3, clef: "treble" }],
        tip: "One octave above open E4; calibrates upper-neck overtone rolloff.",
        quickEssential: false
    },
    {
        id: "uku_step_14_fret_g5",
        order: 14,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: G5 (A-String, Fret 10)",
        subtitle: "String 1 · Fret 10 (Dot) · MIDI 79 · 783.99 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 10],
        expectedMidis: [79],
        strumType: "pluck",
        durationSec: 1.8,
        recordDurationSec: 1.8,
        instructions: "Fret the A-string at Fret 10 (G5, 10th-fret dot marker), pluck clearly, and hold.",
        instruction: "Fret the A-string at Fret 10 (G5, 10th-fret dot marker), pluck clearly, and hold.",
        targetNotes: [{ midi: 79, name: "G5", freq: 783.99, string: 0, fret: 10, finger: 1, clef: "treble" }],
        tip: "High treble anchor; profiles shorter sustain and near-pure fundamental energy above 750 Hz.",
        quickEssential: false
    },
    {
        id: "uku_step_15_fret_a5",
        order: 15,
        category: "fretboard_anchors",
        categoryLabel: "Fretboard Anchors (Frets 1–12)",
        title: "Fret Anchor: High A5 (A-String, Fret 12)",
        subtitle: "String 1 · Fret 12 (Octave Dot) · MIDI 81 · 880.00 Hz",
        targetStrings: [0],
        targetFrets: [-1, -1, -1, 12],
        expectedMidis: [81],
        strumType: "pluck",
        durationSec: 1.8,
        recordDurationSec: 1.8,
        instructions: "Fret the A-string at Fret 12 (double dot, octave A5), pluck cleanly, and hold.",
        instruction: "Fret the A-string at Fret 12 (double dot, octave A5), pluck cleanly, and hold.",
        targetNotes: [{ midi: 81, name: "A5", freq: 880.00, string: 0, fret: 12, finger: 3, clef: "treble" }],
        tip: "Calibrates the 12th-fret top boundary, shortened string inharmonicity (4x open B), and fast decay.",
        quickEssential: true
    },

    // =========================================================================
    // 4. TOUCH DYNAMICS — SOFT PLUCK VS HARD STRUM (Steps 16–17)
    // =========================================================================
    {
        id: "uku_step_16_dyn_soft",
        order: 16,
        category: "dynamics",
        categoryLabel: "Touch Dynamics",
        title: "Soft Finger Pluck (Piano p — C4)",
        subtitle: "Open C-String · Gentle Flesh Pluck · MIDI 60",
        targetStrings: [2],
        targetFrets: [-1, 0, -1, -1],
        expectedMidis: [60],
        strumType: "pluck",
        expectedDynamic: "soft",
        durationSec: 2.2,
        recordDurationSec: 2.2,
        instructions: "Pluck the open C4 string very softly with the pad of your thumb or fingertip (gentle dynamic).",
        instruction: "Pluck the open C4 string very softly with the pad of your thumb or fingertip (gentle dynamic).",
        targetNotes: [{ midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" }],
        tip: "Sets the minimum onset RMS threshold so delicate fingerstyle picking is never dropped.",
        quickEssential: true
    },
    {
        id: "uku_step_17_dyn_hard",
        order: 17,
        category: "dynamics",
        categoryLabel: "Touch Dynamics",
        title: "Hard Strum (Forte f — C Major)",
        subtitle: "Frets [0,0,0,3] · Energetic Down-Strum · MIDI 60, 64, 67, 72",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [0, 0, 0, 3],
        expectedMidis: [60, 64, 67, 72],
        chordSymbol: "C",
        strumType: "down_strum",
        expectedDynamic: "loud",
        durationSec: 2.4,
        recordDurationSec: 2.4,
        instructions: "Hold C Major [0,0,0,3] and give one strong, energetic down-strum across all 4 strings; let it ring.",
        instruction: "Hold C Major [0,0,0,3] and give one strong, energetic down-strum across all 4 strings; let it ring.",
        targetNotes: [
            { midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" },
            { midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" },
            { midi: 72, name: "C5", freq: 523.25, string: 0, fret: 3, finger: 3, clef: "treble" }
        ],
        tip: "Profiles broadband pluck click transient and +10..20 cent initial string tension sharp-bend.",
        quickEssential: true
    },

    // =========================================================================
    // 5. DYADS, DOUBLE-STOPS & UNISON BEATING (Steps 18–20)
    // =========================================================================
    {
        id: "uku_step_18_dyad_c4_e4",
        order: 18,
        category: "intervals",
        categoryLabel: "Dyads & Unison Check",
        title: "Double-Stop Major 3rd: C4 + E4",
        subtitle: "Open C & E Strings [-, 0, 0, -] · MIDI 60 & 64",
        targetStrings: [2, 1],
        targetFrets: [-1, 0, 0, -1],
        expectedMidis: [60, 64],
        strumType: "double_stop",
        durationSec: 2.3,
        recordDurationSec: 2.3,
        instructions: "Pinch the open C4 and E4 strings together simultaneously with thumb and index finger, and let ring.",
        instruction: "Pinch the open C4 and E4 strings together simultaneously with thumb and index finger, and let ring.",
        targetNotes: [
            { midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" },
            { midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Verifies clean 2-voice polyphonic separation on adjacent lower nylon strings.",
        quickEssential: false
    },
    {
        id: "uku_step_19_dyad_e4_g4",
        order: 19,
        category: "intervals",
        categoryLabel: "Dyads & Unison Check",
        title: "Double-Stop Minor 3rd: E4 + G4",
        subtitle: "Open G & E Strings [0, -, 0, -] · MIDI 64 & 67",
        targetStrings: [3, 1],
        targetFrets: [0, -1, 0, -1],
        expectedMidis: [64, 67],
        strumType: "double_stop",
        durationSec: 2.3,
        recordDurationSec: 2.3,
        instructions: "Pluck the open G4 string and open E4 string simultaneously (skipping C4) and let them ring.",
        instruction: "Pluck the open G4 string and open E4 string simultaneously (skipping C4) and let them ring.",
        targetNotes: [
            { midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Verifies re-entrant interval separation where physical top string G4 sounds above inner E4.",
        quickEssential: false
    },
    {
        id: "uku_step_20_unison_a4",
        order: 20,
        category: "intervals",
        categoryLabel: "Dyads & Unison Check",
        title: "Unison Beating Check: A4 + A4",
        subtitle: "G-String Fret 2 + Open A-String [2, -, -, 0] · Dual MIDI 69",
        targetStrings: [3, 0],
        targetFrets: [2, -1, -1, 0],
        expectedMidis: [69],
        unisonCount: 2,
        strumType: "unison",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Fret G-string at Fret 2 (as in F/Am chords) and pluck BOTH the G-string and open A-string together.",
        instruction: "Fret G-string at Fret 2 (as in F/Am chords) and pluck BOTH the G-string and open A-string together.",
        targetNotes: [
            { midi: 69, name: "A4", freq: 440.00, string: 3, fret: 2, finger: 2, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Critical ukulele test: F, Am, Dm, and D all double A4 across two strings. Verifies zero false semitone splitting under unison beating.",
        quickEssential: true
    },

    // =========================================================================
    // 6. ESSENTIAL UKULELE CHORDS — DOWN, UP & ARPEGGIO STRUMS (Steps 21–28)
    // =========================================================================
    {
        id: "uku_step_21_chord_c",
        order: 21,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "C Major Chord — Down-Strum",
        subtitle: "Shape [0, 0, 0, 3] · G4-C4-E4-C5 · MIDI 60, 64, 67, 72",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [0, 0, 0, 3],
        expectedMidis: [60, 64, 67, 72],
        chordSymbol: "C",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold C Major (A-string Fret 3, other strings open) and play one relaxed down-strum from G to A; let it ring.",
        instruction: "Hold C Major (A-string Fret 3, other strings open) and play one relaxed down-strum from G to A; let it ring.",
        targetNotes: [
            { midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" },
            { midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" },
            { midi: 72, name: "C5", freq: 523.25, string: 0, fret: 3, finger: 3, clef: "treble" }
        ],
        tip: "Tests 4-distinct-voice chord detection including the C4 + C5 octave pair.",
        quickEssential: true
    },
    {
        id: "uku_step_22_chord_am",
        order: 22,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "A Minor Chord — Down-Strum",
        subtitle: "Shape [2, 0, 0, 0] · A4-C4-E4-A4 · MIDI 60, 64, 69",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [2, 0, 0, 0],
        expectedMidis: [60, 64, 69],
        chordSymbol: "Am",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold Am (G-string Fret 2, all other strings open) and play one smooth down-strum; let it ring.",
        instruction: "Hold Am (G-string Fret 2, all other strings open) and play one smooth down-strum; let it ring.",
        targetNotes: [
            { midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" },
            { midi: 64, name: "E4", freq: 329.63, string: 1, fret: 0, finger: 0, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 3, fret: 2, finger: 2, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Doubles A4 on strings 4 and 1; verifies C4 and E4 remain cleanly detected beside unison A4.",
        quickEssential: true
    },
    {
        id: "uku_step_23_chord_f",
        order: 23,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "F Major Chord — Down-Strum",
        subtitle: "Shape [2, 0, 1, 0] · A4-C4-F4-A4 · MIDI 60, 65, 69",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [2, 0, 1, 0],
        expectedMidis: [60, 65, 69],
        chordSymbol: "F",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold F Major (G Fret 2, E Fret 1; C and A open) and play one clean down-strum; let it ring.",
        instruction: "Hold F Major (G Fret 2, E Fret 1; C and A open) and play one clean down-strum; let it ring.",
        targetNotes: [
            { midi: 60, name: "C4", freq: 261.63, string: 2, fret: 0, finger: 0, clef: "treble" },
            { midi: 65, name: "F4", freq: 349.23, string: 1, fret: 1, finger: 1, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 3, fret: 2, finger: 2, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Core pop chord with unison A4+A4 strings; verifies F4 vs E4 semitone precision against Am.",
        quickEssential: true
    },
    {
        id: "uku_step_24_chord_g",
        order: 24,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "G Major Chord — Down-Strum",
        subtitle: "Shape [0, 2, 3, 2] · G4-D4-G4-B4 · MIDI 62, 67, 71",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [0, 2, 3, 2],
        expectedMidis: [62, 67, 71],
        chordSymbol: "G",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold G Major (C Fret 2, E Fret 3, A Fret 2; G open) and play one crisp down-strum; let it ring.",
        instruction: "Hold G Major (C Fret 2, E Fret 3, A Fret 2; G open) and play one crisp down-strum; let it ring.",
        targetNotes: [
            { midi: 62, name: "D4", freq: 293.66, string: 2, fret: 2, finger: 1, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 1, fret: 3, finger: 3, clef: "treble" },
            { midi: 71, name: "B4", freq: 493.88, string: 0, fret: 2, finger: 2, clef: "treble" }
        ],
        tip: "Doubles G4 (open G + E-string fret 3); verifies D4 and B4 survive cleanly beside doubled G4.",
        quickEssential: true
    },
    {
        id: "uku_step_25_chord_g7",
        order: 25,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "G7 Chord — Up-Strum (A → G)",
        subtitle: "Shape [0, 2, 1, 2] · G4-D4-F4-B4 · MIDI 62, 65, 67, 71",
        targetStrings: [0, 1, 2, 3],
        targetFrets: [0, 2, 1, 2],
        expectedMidis: [62, 65, 67, 71],
        chordSymbol: "G7",
        strumType: "up_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold G7 (C Fret 2, E Fret 1, A Fret 2; G open) and sweep an UP-strum from the A-string up to G; let it ring.",
        instruction: "Hold G7 (C Fret 2, E Fret 1, A Fret 2; G open) and sweep an UP-strum from the A-string up to G; let it ring.",
        targetNotes: [
            { midi: 62, name: "D4", freq: 293.66, string: 2, fret: 2, finger: 2, clef: "treble" },
            { midi: 65, name: "F4", freq: 349.23, string: 1, fret: 1, finger: 1, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" },
            { midi: 71, name: "B4", freq: 493.88, string: 0, fret: 2, finger: 3, clef: "treble" }
        ],
        tip: "Tests reversed up-strum stagger order (high B4 arriving first, G4 arriving last) across 4 distinct pitches.",
        quickEssential: false
    },
    {
        id: "uku_step_26_chord_dm",
        order: 26,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "D Minor Chord — Down-Strum",
        subtitle: "Shape [2, 2, 1, 0] · A4-D4-F4-A4 · MIDI 62, 65, 69",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [2, 2, 1, 0],
        expectedMidis: [62, 65, 69],
        chordSymbol: "Dm",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold Dm (G Fret 2, C Fret 2, E Fret 1; A open) and play one clean down-strum; let it ring.",
        instruction: "Hold Dm (G Fret 2, C Fret 2, E Fret 1; A open) and play one clean down-strum; let it ring.",
        targetNotes: [
            { midi: 62, name: "D4", freq: 293.66, string: 2, fret: 2, finger: 3, clef: "treble" },
            { midi: 65, name: "F4", freq: 349.23, string: 1, fret: 1, finger: 1, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 3, fret: 2, finger: 2, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Tests minor-triad discrimination (Dm vs F differs by only C4 -> D4).",
        quickEssential: false
    },
    {
        id: "uku_step_27_chord_em",
        order: 27,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "E Minor Chord — Slow Arpeggio Roll",
        subtitle: "Shape [0, 4, 3, 2] · G4-E4-G4-B4 · MIDI 64, 67, 71",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [0, 4, 3, 2],
        expectedMidis: [64, 67, 71],
        chordSymbol: "Em",
        strumType: "arpeggio",
        durationSec: 2.6,
        recordDurationSec: 2.6,
        instructions: "Hold Em (C Fret 4, E Fret 3, A Fret 2; G open) and roll your thumb slowly across all 4 strings (~70ms roll).",
        instruction: "Hold Em (C Fret 4, E Fret 3, A Fret 2; G open) and roll your thumb slowly across all 4 strings (~70ms roll).",
        targetNotes: [
            { midi: 64, name: "E4", freq: 329.63, string: 2, fret: 4, finger: 3, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 3, fret: 0, finger: 0, clef: "treble" },
            { midi: 67, name: "G4", freq: 392.00, string: 1, fret: 3, finger: 2, clef: "treble" },
            { midi: 71, name: "B4", freq: 493.88, string: 0, fret: 2, finger: 1, clef: "treble" }
        ],
        tip: "Directly stress-tests the Strum-Aggregation Window on a wide, rolled chord sweep.",
        quickEssential: false
    },
    {
        id: "uku_step_28_chord_d",
        order: 28,
        category: "chords",
        categoryLabel: "Essential Chords (Strums)",
        title: "D Major Chord — Down-Strum",
        subtitle: "Shape [2, 2, 2, 0] · A4-D4-F#4-A4 · MIDI 62, 66, 69",
        targetStrings: [3, 2, 1, 0],
        targetFrets: [2, 2, 2, 0],
        expectedMidis: [62, 66, 69],
        chordSymbol: "D",
        strumType: "down_strum",
        durationSec: 2.5,
        recordDurationSec: 2.5,
        instructions: "Hold D Major (G, C, E all at Fret 2; A open) and play one clean down-strum; let it ring.",
        instruction: "Hold D Major (G, C, E all at Fret 2; A open) and play one clean down-strum; let it ring.",
        targetNotes: [
            { midi: 62, name: "D4", freq: 293.66, string: 2, fret: 2, finger: 2, clef: "treble" },
            { midi: 66, name: "F#4", freq: 369.99, string: 1, fret: 2, finger: 3, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 3, fret: 2, finger: 1, clef: "treble" },
            { midi: 69, name: "A4", freq: 440.00, string: 0, fret: 0, finger: 0, clef: "treble" }
        ],
        tip: "Verifies tight 3-finger fretting clarity and major/minor F#4 vs F4 discrimination against Dm.",
        quickEssential: false
    }
];

export const UKULELE_CATEGORIES = [
    { id: "all", label: "All Ukulele Steps (28)" },
    { id: "quick", label: "Quick 13 Essential" },
    { id: "silence", label: "Silence (1)" },
    { id: "open_strings", label: "Open Strings (4)" },
    { id: "fretboard_anchors", label: "Fretboard Anchors (10)" },
    { id: "dynamics", label: "Dynamics (2)" },
    { id: "intervals", label: "Dyads & Unison (3)" },
    { id: "chords", label: "Essential Chords (8)" }
];

// Backward-compatible aliases matching js/trainer/curriculum.js & trainer contract
export const UKULELE_DATASET_CATEGORIES = UKULELE_CATEGORIES;
export const DATASET_STEPS = UKULELE_TRAINING_CURRICULUM;
export const CATEGORIES = UKULELE_CATEGORIES;
