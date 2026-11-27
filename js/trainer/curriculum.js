/**
 * 61-Key Keyboard (C2 to C7) Data Collection & Calibration Curriculum
 * Aligned specifically for a 5-octave, 61-key keyboard (36 white keys + 25 black keys):
 * - Key #1  (White Key #1,  Leftmost):  C2 (MIDI 36,   65.41 Hz) — C2–B2 Register
 * - Key #13 (White Key #8,  2nd C):     C3 (MIDI 48,  130.81 Hz) — C3–B3 Register (A3 is Key #22 / White Key #13)
 * - Key #25 (White Key #15, Middle C):  C4 (MIDI 60,  261.63 Hz) — C4–B4 Register (A4 is Key #34 / White Key #20)
 * - Key #37 (White Key #22, 4th C):     C5 (MIDI 72,  523.25 Hz) — C5–B5 Register
 * - Key #49 (White Key #29, 5th C):     C6 (MIDI 84, 1046.50 Hz) — C6–B6 Register
 * - Key #61 (White Key #36, Rightmost): C7 (MIDI 96, 2093.00 Hz) — Top C7
 *
 * NOTE ON PIANO OCTAVE NUMBERING:
 * In Scientific Pitch Notation, the octave number ALWAYS changes on C (not A):
 *   C3 (#13) → D3 (#15) → E3 (#17) → F3 (#18) → G3 (#20) → A3 (#22) → B3 (#24) → C4 (Middle C, #25)
 * Therefore, the A just two white keys left of Middle C4 is A3 (Key #22 / 13th White Key, 220 Hz),
 * while A4 (440 Hz) is five white keys right of Middle C4 (Key #34 / 20th White Key).
 */

export const KEYBOARD_61_SPEC = {
    totalKeys: 61,
    whiteKeys: 36,
    blackKeys: 25,
    octaves: 5,
    startMidi: 36,   // C2 (Key #1 / White Key #1)
    endMidi: 96,     // C7 (Key #61 / White Key #36)
    middleCMidi: 60, // C4 (Key #25 / White Key #15)
    minFreqHz: 65.41,
    maxFreqHz: 2093.00
};

export const DATASET_STEPS = [
    // 🎧 Category: Ambient Silence
    {
        id: "step_01_silence",
        category: "silence",
        categoryLabel: "Ambient Noise",
        title: "Ambient Room Silence",
        subtitle: "61-Key Baseline • Background Noise Floor Calibration",
        instruction: "Keep your room completely silent for 3 seconds. Do not touch any of the 61 keys.",
        targetNotes: [],
        recordDurationSec: 3.0,
        tip: "Profiles room acoustics, background fan/AC hum, and microphone noise floor.",
        quickEssential: true
    },

    // 🎹 Category: Single Notes — Bass Register (C2–B3: Keys #1 to #24, White Keys #1 to #14)
    {
        id: "step_02_c2",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Lowest Key C2 (Leftmost Key)",
        subtitle: "Key #1 of 61 • 1st White Key from Left (1st C) • MIDI 36 • 65.41 Hz",
        instruction: "Strike the very first (leftmost) white key on your 61-key keyboard (C2) firmly and hold.",
        targetNotes: [{ midi: 36, key61: 1, whiteKey: 1, name: "C2", freq: 65.41, clef: "bass" }],
        recordDurationSec: 2.2,
        tip: "Calibrates the lowest fundamental (C2 = 65.41 Hz) and bass harmonics of your 61-key keyboard.",
        quickEssential: true
    },
    {
        id: "step_03_g2",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Low Bass G2",
        subtitle: "Key #8 of 61 • 5th White Key from Left (C2–B2 Register) • MIDI 43 • 98.00 Hz",
        instruction: "Strike G2 (the 5th white key from the left, in the C2–B2 octave) firmly and let it ring.",
        targetNotes: [{ midi: 43, key61: 8, whiteKey: 5, name: "G2", freq: 98.00, clef: "bass" }],
        recordDurationSec: 2.2,
        tip: "Primary bass root used in Yousician Groove and Canon in D.",
        quickEssential: false
    },
    {
        id: "step_04_b2",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Low Bass B2",
        subtitle: "Key #12 of 61 • 7th White Key from Left (Just Left of C3) • MIDI 47 • 123.47 Hz",
        instruction: "Strike B2 (the 7th white key from the left, immediately left of the 2nd C) firmly and let it ring.",
        targetNotes: [{ midi: 47, key61: 12, whiteKey: 7, name: "B2", freq: 123.47, clef: "bass" }],
        recordDurationSec: 2.2,
        tip: "Opening bass note for Yousician Groove measure 1. (Octave changes from 2 to 3 on the next key, C3).",
        quickEssential: false
    },
    {
        id: "step_05_c3",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Tenor Bass C3 (2nd C from Left)",
        subtitle: "Key #13 of 61 • 8th White Key from Left (2nd C) • MIDI 48 • 130.81 Hz",
        instruction: "Strike C3 (the 2nd C from the left, one octave below Middle C4) and hold.",
        targetNotes: [{ midi: 48, key61: 13, whiteKey: 8, name: "C3", freq: 130.81, clef: "bass" }],
        recordDurationSec: 2.2,
        tip: "Starts the C3–B3 octave (Keys #13–#24, White Keys #8–#14).",
        quickEssential: true
    },
    {
        id: "step_06_e3",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Tenor E3",
        subtitle: "Key #17 of 61 • 10th White Key from Left (C3–B3 Register) • MIDI 52 • 164.81 Hz",
        instruction: "Strike E3 (two white keys right of C3; 10th white key from left) and hold.",
        targetNotes: [{ midi: 52, key61: 17, whiteKey: 10, name: "E3", freq: 164.81, clef: "bass" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_07_g3",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Tenor G3",
        subtitle: "Key #20 of 61 • 12th White Key from Left (C3–B3 Register) • MIDI 55 • 196.00 Hz",
        instruction: "Strike G3 (four white keys right of C3; 12th white key from left) and hold.",
        targetNotes: [{ midi: 55, key61: 20, whiteKey: 12, name: "G3", freq: 196.00, clef: "bass" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_08_a3",
        category: "single_bass",
        categoryLabel: "Bass (C2–B3)",
        title: "Tenor A3 (2 White Keys Left of Middle C4)",
        subtitle: "Key #22 of 61 (incl. black keys) • 13th White Key from Left • MIDI 57 • 220.00 Hz",
        instruction: "Strike A3 (just two white keys left of Middle C4; the 13th white key / 22nd total key from left) and hold.",
        targetNotes: [{ midi: 57, key61: 22, whiteKey: 13, name: "A3", freq: 220.00, clef: "bass" }],
        recordDurationSec: 2.2,
        tip: "Why A3 and not A4? In piano notation, octave numbers always increment on C (C3→D3→E3→F3→G3→A3→B3 → C4). A3 is Key #22 (13th white key); A4 is Key #34 (20th white key).",
        quickEssential: false
    },

    // 🎼 Category: Single Notes — Middle & Treble Register (C4–C7: Keys #25 to #61, White Keys #15 to #36)
    {
        id: "step_09_c4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Middle C (C4 — 3rd C from Left)",
        subtitle: "Key #25 of 61 • 15th White Key from Left (Center of Keyboard) • MIDI 60 • 261.63 Hz",
        instruction: "Strike Middle C (C4, the 3rd C from the left / 15th white key) cleanly with a medium touch and hold.",
        targetNotes: [{ midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" }],
        recordDurationSec: 2.2,
        tip: "Home base of your 61-key keyboard (Key #25 / White Key #15, where Octave 4 C4–B4 begins).",
        quickEssential: true
    },
    {
        id: "step_10_d4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble D4",
        subtitle: "Key #27 of 61 • 16th White Key from Left (C4–B4 Register) • MIDI 62 • 293.66 Hz",
        instruction: "Strike D4 (one white key right of Middle C4; 16th white key from left) and hold.",
        targetNotes: [{ midi: 62, key61: 27, whiteKey: 16, name: "D4", freq: 293.66, clef: "treble" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_11_e4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble E4",
        subtitle: "Key #29 of 61 • 17th White Key from Left (C4–B4 Register) • MIDI 64 • 329.63 Hz",
        instruction: "Strike E4 (two white keys right of Middle C4; 17th white key from left) and hold.",
        targetNotes: [{ midi: 64, key61: 29, whiteKey: 17, name: "E4", freq: 329.63, clef: "treble" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_12_f4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble F4",
        subtitle: "Key #30 of 61 • 18th White Key from Left (C4–B4 Register) • MIDI 65 • 349.23 Hz",
        instruction: "Strike F4 (three white keys right of Middle C4; 18th white key from left) and hold.",
        targetNotes: [{ midi: 65, key61: 30, whiteKey: 18, name: "F4", freq: 349.23, clef: "treble" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_13_g4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble G4",
        subtitle: "Key #32 of 61 • 19th White Key from Left (C4–B4 Register) • MIDI 67 • 392.00 Hz",
        instruction: "Strike G4 (four white keys right of Middle C4; 19th white key from left) and hold.",
        targetNotes: [{ midi: 67, key61: 32, whiteKey: 19, name: "G4", freq: 392.00, clef: "treble" }],
        recordDurationSec: 2.2,
        quickEssential: false
    },
    {
        id: "step_14_a4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Concert Pitch A4 (A440 — Above Middle C4)",
        subtitle: "Key #34 of 61 • 20th White Key from Left (C4–B4 Register) • MIDI 69 • 440.00 Hz",
        instruction: "Strike A4 (five white keys right of Middle C4; 20th white key / 34th total key from left) and hold.",
        targetNotes: [{ midi: 69, key61: 34, whiteKey: 20, name: "A4", freq: 440.00, clef: "treble" }],
        recordDurationSec: 2.2,
        tip: "Standard 440 Hz tuning reference (one octave above A3 Key #22).",
        quickEssential: true
    },
    {
        id: "step_15_b4",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble B4",
        subtitle: "Key #36 of 61 • 21st White Key from Left (Just Left of C5) • MIDI 71 • 493.88 Hz",
        instruction: "Strike B4 (six white keys right of Middle C4; 21st white key from left) firmly and hold.",
        targetNotes: [{ midi: 71, key61: 36, whiteKey: 21, name: "B4", freq: 493.88, clef: "treble" }],
        recordDurationSec: 2.2,
        tip: "Opening treble note for Yousician Groove measure 1.",
        quickEssential: false
    },
    {
        id: "step_16_c5",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble C5 (4th C from Left)",
        subtitle: "Key #37 of 61 • 22nd White Key from Left (4th C) • MIDI 72 • 523.25 Hz",
        instruction: "Strike C5 (the 4th C from the left / 22nd white key, one octave above Middle C4) and hold.",
        targetNotes: [{ midi: 72, key61: 37, whiteKey: 22, name: "C5", freq: 523.25, clef: "treble" }],
        recordDurationSec: 2.0,
        tip: "Starts the C5–B5 octave (Key #37 / 22nd White Key).",
        quickEssential: true
    },
    {
        id: "step_17_d5",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Treble D5",
        subtitle: "Key #39 of 61 • 23rd White Key from Left (C5–B5 Register) • MIDI 74 • 587.33 Hz",
        instruction: "Strike D5 (one white key right of C5; 23rd white key from left) firmly and hold.",
        targetNotes: [{ midi: 74, key61: 39, whiteKey: 23, name: "D5", freq: 587.33, clef: "treble" }],
        recordDurationSec: 2.0,
        tip: "High melodic note in Yousician Groove measure 1.",
        quickEssential: false
    },
    {
        id: "step_18_g5",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "High Treble G5",
        subtitle: "Key #44 of 61 • 26th White Key from Left (C5–B5 Register) • MIDI 79 • 783.99 Hz",
        instruction: "Strike G5 (four white keys right of C5; 26th white key from left) and hold.",
        targetNotes: [{ midi: 79, key61: 44, whiteKey: 26, name: "G5", freq: 783.99, clef: "treble" }],
        recordDurationSec: 2.0,
        quickEssential: false
    },
    {
        id: "step_19_c6",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "High C6 (5th C from Left)",
        subtitle: "Key #49 of 61 • 29th White Key from Left (5th C) • MIDI 84 • 1046.50 Hz",
        instruction: "Strike C6 (the 5th C from the left / 29th white key, start of the top octave) and hold.",
        targetNotes: [{ midi: 84, key61: 49, whiteKey: 29, name: "C6", freq: 1046.50, clef: "treble" }],
        recordDurationSec: 1.8,
        tip: "Starts the C6–C7 top octave on your 61-key keyboard.",
        quickEssential: false
    },
    {
        id: "step_20_c7",
        category: "single_treble",
        categoryLabel: "Treble (C4–C7)",
        title: "Highest Key C7 (Rightmost Key)",
        subtitle: "Key #61 of 61 • 36th White Key from Left (6th C • Rightmost Key) • MIDI 96 • 2093.00 Hz",
        instruction: "Strike the very last (rightmost) white key on your 61-key keyboard (C7) and hold.",
        targetNotes: [{ midi: 96, key61: 61, whiteKey: 36, name: "C7", freq: 2093.00, clef: "treble" }],
        recordDurationSec: 1.8,
        tip: "Calibrates the top boundary (Key #61 / White Key #36) and fast upper-register decay.",
        quickEssential: true
    },

    // 🔊 Category: Touch Dynamics on Middle C (Key #25 / White Key #15)
    {
        id: "step_21_dyn_soft",
        category: "dynamics",
        categoryLabel: "Touch Dynamics",
        title: "Piano (p) — Soft Touch",
        subtitle: "Key #25 of 61 • 15th White Key (Middle C4) • Gentle Strike",
        instruction: "Strike Middle C4 (Key #25 / 15th white key) gently and softly (piano dynamic).",
        targetNotes: [{ midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" }],
        recordDurationSec: 2.2,
        expectedDynamic: "soft",
        tip: "Calibrates minimum onset sensitivity for soft key strikes.",
        quickEssential: true
    },
    {
        id: "step_22_dyn_loud",
        category: "dynamics",
        categoryLabel: "Touch Dynamics",
        title: "Fortissimo (f) — Hard Touch",
        subtitle: "Key #25 of 61 • 15th White Key (Middle C4) • Accented Strike",
        instruction: "Strike Middle C4 (Key #25 / 15th white key) with strong, energetic force (forte dynamic).",
        targetNotes: [{ midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" }],
        recordDurationSec: 2.2,
        expectedDynamic: "loud",
        tip: "Profiles peak dynamic output and speaker/hammer attack transient.",
        quickEssential: true
    },

    // 🎼 Category: Harmonic Intervals / Dyads (Two Simultaneous Notes)
    {
        id: "step_23_dyad_octave",
        category: "intervals",
        categoryLabel: "Intervals & Dyads",
        title: "Octave Dyad: C3 + C4",
        subtitle: "Keys #13 & #25 (White Keys #8 & #15 • 2nd C + 3rd C) • MIDI 48 & 60",
        instruction: "Play C3 (2nd C, Key #13) and Middle C4 (3rd C, Key #25) together at the exact same moment and hold.",
        targetNotes: [
            { midi: 48, key61: 13, whiteKey: 8, name: "C3", freq: 130.81, clef: "bass" },
            { midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" }
        ],
        recordDurationSec: 2.5,
        tip: "Critical test: Overcoming harmonic collision between C3's 2nd harmonic and C4.",
        quickEssential: true
    },
    {
        id: "step_24_dyad_fifth",
        category: "intervals",
        categoryLabel: "Intervals & Dyads",
        title: "Perfect Fifth: C4 + G4",
        subtitle: "Keys #25 & #32 (White Keys #15 & #19) • MIDI 60 & 67",
        instruction: "Play Middle C4 (Key #25 / White #15) and G4 (Key #32 / White #19) simultaneously and hold.",
        targetNotes: [
            { midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" },
            { midi: 67, key61: 32, whiteKey: 19, name: "G4", freq: 392.00, clef: "treble" }
        ],
        recordDurationSec: 2.5,
        tip: "Tests separation of 3:2 harmonic overtone ratio.",
        quickEssential: false
    },

    // 🎶 Category: Polyphonic Chords (Triads)
    {
        id: "step_25_chord_c_maj",
        category: "chords",
        categoryLabel: "Chords (Polyphony)",
        title: "C Major Triad (C4 - E4 - G4)",
        subtitle: "Keys #25, #29, #32 (White Keys #15, #17, #19) • MIDI 60, 64, 67",
        instruction: "Play the C Major triad (C4 + E4 + G4) with your right hand simultaneously and hold.",
        targetNotes: [
            { midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" },
            { midi: 64, key61: 29, whiteKey: 17, name: "E4", freq: 329.63, clef: "treble" },
            { midi: 67, key61: 32, whiteKey: 19, name: "G4", freq: 392.00, clef: "treble" }
        ],
        recordDurationSec: 2.5,
        tip: "Foundational polyphonic benchmark chord starting on Middle C4 (Key #25).",
        quickEssential: true
    },
    {
        id: "step_26_chord_g_maj",
        category: "chords",
        categoryLabel: "Chords (Polyphony)",
        title: "G Major Triad (G3 - B3 - D4)",
        subtitle: "Keys #20, #24, #27 (White Keys #12, #14, #16) • MIDI 55, 59, 62",
        instruction: "Play the G Major triad (G3 + B3 + D4) simultaneously across Middle C4 and hold.",
        targetNotes: [
            { midi: 55, key61: 20, whiteKey: 12, name: "G3", freq: 196.00, clef: "bass" },
            { midi: 59, key61: 24, whiteKey: 14, name: "B3", freq: 246.94, clef: "bass" },
            { midi: 62, key61: 27, whiteKey: 16, name: "D4", freq: 293.66, clef: "treble" }
        ],
        recordDurationSec: 2.5,
        tip: "Harmonic foundation for Measure 1 of Yousician Groove (G3 and B3 are just below C4; D4 is just above C4).",
        quickEssential: false
    },
    {
        id: "step_27_chord_a_min",
        category: "chords",
        categoryLabel: "Chords (Polyphony)",
        title: "A Minor Triad (A3 - C4 - E4)",
        subtitle: "Keys #22, #25, #29 (White Keys #13, #15, #17) • MIDI 57, 60, 64",
        instruction: "Play A3 (2 white keys left of C4), Middle C4, and E4 (2 white keys right of C4) together and hold.",
        targetNotes: [
            { midi: 57, key61: 22, whiteKey: 13, name: "A3", freq: 220.00, clef: "bass" },
            { midi: 60, key61: 25, whiteKey: 15, name: "C4", freq: 261.63, clef: "treble" },
            { midi: 64, key61: 29, whiteKey: 17, name: "E4", freq: 329.63, clef: "treble" }
        ],
        recordDurationSec: 2.5,
        tip: "Note: The root A is called A3 (Key #22 / White #13) because piano octave numbers step from 3 to 4 on Middle C4 (Key #25 / White #15).",
        quickEssential: false
    },

    // ⚡ Category: Real-World Play-Along Phrase
    {
        id: "step_28_playalong_yousician",
        category: "playalong",
        categoryLabel: "Play-Along Motif",
        title: "Yousician Groove Measure 1",
        subtitle: "Key #12 (B2 • White #7, Left Hand) + Key #36 (B4 • White #21, Right Hand)",
        instruction: "Strike B2 (Key #12 / White #7) with your left hand and B4 (Key #36 / White #21) with your right hand together.",
        targetNotes: [
            { midi: 47, key61: 12, whiteKey: 7, name: "B2", freq: 123.47, clef: "bass" },
            { midi: 71, key61: 36, whiteKey: 21, name: "B4", freq: 493.88, clef: "treble" }
        ],
        recordDurationSec: 3.0,
        tip: "Directly verifies the two-handed opening strike of the app's default song.",
        quickEssential: false
    }
];

export const CATEGORIES = [
    { id: "all", label: "All 61-Key Steps (28)" },
    { id: "quick", label: "⚡ Quick 11 Essential" },
    { id: "silence", label: "🎧 Silence (1)" },
    { id: "single_bass", label: "🎹 Bass C2–B3 (7)" },
    { id: "single_treble", label: "🎼 Treble C4–C7 (12)" },
    { id: "dynamics", label: "🔊 Touch Dynamics (2)" },
    { id: "intervals", label: "🎼 Intervals / Dyads (2)" },
    { id: "chords", label: "🎶 Chords (3)" },
    { id: "playalong", label: "⚡ Play-Along Motif (1)" }
];
