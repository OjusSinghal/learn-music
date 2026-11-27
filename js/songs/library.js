/**
 * Preloaded Song Library
 * Includes:
 * 1. "Wise Men Say (Can't Help Falling in Love)" (Elvis Presley — Exact PHianonize YouTube Tutorial Arrangement)
 * 2. "Yousician D-Major Groove" (Exact song from screenshot: G - A - Bm - G)
 * 3. "Für Elise" (Ludwig van Beethoven)
 * 4. "Ode to Joy" (Ludwig van Beethoven)
 * 5. "Canon in D" (Johann Pachelbel)
 *
 * All catalog tracks are automatically processed by PianoFingeringEngine so every note
 * carries ergonomic hand ("left"|"right"), finger (1..5), fingerLabel ("T"|"1".."4"), and fingerColor.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";

const RAW_SONG_LIBRARY = [
    {
        id: "wise_men_say",
        title: "Wise Men Say (Can't Help Falling in Love)",
        artist: "Elvis Presley",
        bpm: 63.3333, // Exact 190/3 dotted-quarter BPM (quarter = 95.000 BPM, eighth = 190.000 BPM)
        beatsPerMeasure: 2,
        timeSignature: [6, 8],
        keySignature: "D",
        chords: [
            "D", "F#m", "Bm", "D/A", "G", "D/F#", "A", "A",
            "G", "A", "Bm", "Em/G", "D/A", "A", "D", "D",
            "D", "F#m", "Bm", "D/A", "G", "D/F#", "A", "A",
            "G", "A", "Bm", "Em/G", "D/A", "A", "D", "D",
            "F#m", "C#7", "F#m", "C#7", "F#m", "C#7", "F#m", "B7",
            "Em", "A", "D", "F#m", "Bm", "D/A", "G", "D/F#",
            "A", "A", "G", "A", "Bm", "Em/G", "D/A", "A",
            "D", "D", "F#m", "C#7", "F#m", "C#7", "F#m", "C#7",
            "F#m", "B7", "Em", "A", "D", "F#m", "Bm", "D/A",
            "G", "D/F#", "A", "A", "G", "A", "Bm", "Em/G",
            "D/A", "A", "D", "D", "G", "A", "Bm", "Em/G",
            "D/A", "A", "D", "D"
        ],
        notes: [
            // Verse 1 (Measures 1-16): "Wise men say, only fools rush in..."
            { pitch: 50, time: 0.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M01 @0 LH D3 (3e, f5:4)
            { pitch: 62, time: 0.0000, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M01 @0 RH D4 (6e, f1:T)
            { pitch: 57, time: 0.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M01 @3 LH A3 (3e, f1:T)
            { pitch: 54, time: 1.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M02 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 1.8947, duration: 1.8697, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M02 @0 RH A4 (6e, f5:4)
            { pitch: 57, time: 2.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M02 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 3.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M03 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 3.7895, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M03 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 4.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M03 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 5.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M04 @0 LH A2 (3e, f5:4)
            { pitch: 54, time: 6.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M04 @3 LH F#3 (3e, f1:T)
            { pitch: 64, time: 6.9474, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M04 @4 RH E4 (1e, f2:1)
            { pitch: 66, time: 7.2632, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M04 @5 RH F#4 (1e, f3:2)
            { pitch: 43, time: 7.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M05 @0 LH G2 (3e, f5:4)
            { pitch: 67, time: 7.5789, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M05 @0 RH G4 (6e, f4:3)
            { pitch: 50, time: 8.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M05 @3 LH D3 (3e, f1:T)
            { pitch: 42, time: 9.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M06 @0 LH F#2 (3e, f5:4)
            { pitch: 66, time: 9.4737, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M06 @0 RH F#4 (6e, f3:2)
            { pitch: 50, time: 10.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M06 @3 LH D3 (3e, f2:1)
            { pitch: 45, time: 11.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M07 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 11.3684, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M07 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 12.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M07 @3 LH E3 (3e, f1:T)
            { pitch: 45, time: 13.2632, duration: 1.8697, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M08 @0 LH A2 (6e, f5:4)
            { pitch: 57, time: 14.8421, duration: 0.2908, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M08 @5 RH A3 (1e, f1:T)
            { pitch: 43, time: 15.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M09 @0 LH G2 (3e, f5:4)
            { pitch: 59, time: 15.1579, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M09 @0 RH B3 (6e, f2:1)
            { pitch: 50, time: 16.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M09 @3 LH D3 (3e, f1:T)
            { pitch: 45, time: 17.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M10 @0 LH A2 (3e, f5:4)
            { pitch: 61, time: 17.0526, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M10 @0 RH C#4 (6e, f3:2)
            { pitch: 52, time: 18.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M10 @3 LH E3 (3e, f1:T)
            { pitch: 47, time: 18.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M11 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 18.9474, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M11 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 19.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M11 @3 LH F#3 (3e, f1:T)
            { pitch: 43, time: 20.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M12 @0 LH G2 (3e, f5:4)
            { pitch: 64, time: 20.8421, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M12 @0 RH E4 (2e, f2:1)
            { pitch: 66, time: 21.4737, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M12 @2 RH F#4 (2e, f3:2)
            { pitch: 52, time: 21.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M12 @3 LH E3 (3e, f1:T)
            { pitch: 67, time: 22.1053, duration: 0.6066, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M12 @4 RH G4 (2e, f4:3)
            { pitch: 45, time: 22.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M13 @0 LH A2 (3e, f5:4)
            { pitch: 66, time: 22.7368, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M13 @0 RH F#4 (6e, f3:2)
            { pitch: 54, time: 23.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M13 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 24.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M14 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 24.6316, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M14 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 25.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M14 @3 LH E3 (3e, f1:T)
            { pitch: 50, time: 26.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M15 @0 LH D3 (3e, f4:3)
            { pitch: 62, time: 26.5263, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M15 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 27.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M15 @3 LH F#3 (3e, f2:1)
            { pitch: 50, time: 28.4211, duration: 1.8697, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M16 @0 LH D3 (6e, f4:3)

            // Verse 2 (Measures 17-32): "Shall I stay? Would it be a sin..."
            { pitch: 50, time: 30.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M17 @0 LH D3 (3e, f5:4)
            { pitch: 62, time: 30.3158, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M17 @0 RH D4 (6e, f1:T)
            { pitch: 57, time: 31.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M17 @3 LH A3 (3e, f1:T)
            { pitch: 54, time: 32.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M18 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 32.2105, duration: 1.8697, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M18 @0 RH A4 (6e, f5:4)
            { pitch: 57, time: 33.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M18 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 34.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M19 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 34.1053, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M19 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 35.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M19 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 36.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M20 @0 LH A2 (3e, f5:4)
            { pitch: 54, time: 36.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M20 @3 LH F#3 (3e, f1:T)
            { pitch: 64, time: 37.2632, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M20 @4 RH E4 (1e, f2:1)
            { pitch: 66, time: 37.5789, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M20 @5 RH F#4 (1e, f3:2)
            { pitch: 43, time: 37.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M21 @0 LH G2 (3e, f5:4)
            { pitch: 67, time: 37.8947, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M21 @0 RH G4 (6e, f4:3)
            { pitch: 50, time: 38.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M21 @3 LH D3 (3e, f1:T)
            { pitch: 42, time: 39.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M22 @0 LH F#2 (3e, f5:4)
            { pitch: 66, time: 39.7895, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M22 @0 RH F#4 (6e, f3:2)
            { pitch: 50, time: 40.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M22 @3 LH D3 (3e, f2:1)
            { pitch: 45, time: 41.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M23 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 41.6842, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M23 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 42.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M23 @3 LH E3 (3e, f1:T)
            { pitch: 45, time: 43.5789, duration: 1.8697, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M24 @0 LH A2 (6e, f5:4)
            { pitch: 57, time: 45.1579, duration: 0.2908, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M24 @5 RH A3 (1e, f1:T)
            { pitch: 43, time: 45.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M25 @0 LH G2 (3e, f5:4)
            { pitch: 59, time: 45.4737, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M25 @0 RH B3 (6e, f2:1)
            { pitch: 50, time: 46.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M25 @3 LH D3 (3e, f1:T)
            { pitch: 45, time: 47.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M26 @0 LH A2 (3e, f5:4)
            { pitch: 61, time: 47.3684, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M26 @0 RH C#4 (6e, f3:2)
            { pitch: 52, time: 48.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M26 @3 LH E3 (3e, f1:T)
            { pitch: 47, time: 49.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M27 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 49.2632, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M27 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 50.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M27 @3 LH F#3 (3e, f1:T)
            { pitch: 43, time: 51.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M28 @0 LH G2 (3e, f5:4)
            { pitch: 64, time: 51.1579, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M28 @0 RH E4 (2e, f2:1)
            { pitch: 66, time: 51.7895, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M28 @2 RH F#4 (2e, f3:2)
            { pitch: 52, time: 52.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M28 @3 LH E3 (3e, f1:T)
            { pitch: 67, time: 52.4211, duration: 0.6066, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M28 @4 RH G4 (2e, f4:3)
            { pitch: 45, time: 53.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M29 @0 LH A2 (3e, f5:4)
            { pitch: 66, time: 53.0526, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M29 @0 RH F#4 (6e, f3:2)
            { pitch: 54, time: 54.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M29 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 54.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M30 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 54.9474, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M30 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 55.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M30 @3 LH E3 (3e, f1:T)
            { pitch: 50, time: 56.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M31 @0 LH D3 (3e, f4:3)
            { pitch: 62, time: 56.8421, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M31 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 57.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M31 @3 LH F#3 (3e, f2:1)
            { pitch: 50, time: 58.7368, duration: 1.8697, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M32 @0 LH D3 (6e, f4:3)

            // Bridge 1 (Measures 33-42): "Like a river flows, surely to the sea..."
            { pitch: 54, time: 60.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M33 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 60.6316, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M33 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 61.2632, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M33 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 61.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M33 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 61.8947, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M33 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 62.2105, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M33 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 62.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M34 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 62.5263, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M34 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 63.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M34 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 64.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M35 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 64.4211, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M35 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 65.0526, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M35 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 65.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M35 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 65.6842, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M35 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 66.0000, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M35 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 66.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M36 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 66.3158, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M36 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 67.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M36 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 68.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M37 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 68.2105, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M37 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 68.8421, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M37 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 69.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M37 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 69.4737, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M37 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 69.7895, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M37 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 70.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M38 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 70.1053, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M38 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 71.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M38 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 72.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M39 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 72.0000, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M39 @0 RH A4 (2e, f3:2)
            { pitch: 69, time: 72.6316, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M39 @2 RH A4 (6e, f3:2)
            { pitch: 57, time: 72.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M39 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 73.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M40 @0 LH B2 (3e, f5:4)
            { pitch: 66, time: 74.5263, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M40 @2 RH F#4 (2e, f2:1)
            { pitch: 51, time: 74.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M40 @3 LH D#3 (3e, f3:2)
            { pitch: 69, time: 75.1579, duration: 0.2908, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M40 @4 RH A4 (1e, f4:3)
            { pitch: 66, time: 75.4737, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M40 @5 RH F#4 (1e, f2:1)
            { pitch: 52, time: 75.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M41 @0 LH E3 (3e, f2:1)
            { pitch: 67, time: 75.7895, duration: 3.7645, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M41 @0 RH G4 (12e, f3:2)
            { pitch: 55, time: 76.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M41 @3 LH G3 (3e, f1:T)
            { pitch: 45, time: 77.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M42 @0 LH A2 (3e, f5:4)
            { pitch: 57, time: 78.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M42 @3 LH A3 (3e, f1:T)

            // Verse 3 (Measures 43-58): "Take my hand, take my whole life too..."
            { pitch: 50, time: 79.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M43 @0 LH D3 (3e, f5:4)
            { pitch: 62, time: 79.5789, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M43 @0 RH D4 (6e, f1:T)
            { pitch: 57, time: 80.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M43 @3 LH A3 (3e, f1:T)
            { pitch: 54, time: 81.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M44 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 81.4737, duration: 1.8697, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M44 @0 RH A4 (6e, f5:4)
            { pitch: 57, time: 82.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M44 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 83.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M45 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 83.3684, duration: 2.8171, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M45 @0 RH D4 (9e, f1:T)
            { pitch: 54, time: 84.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M45 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 85.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M46 @0 LH A2 (3e, f5:4)
            { pitch: 54, time: 86.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M46 @3 LH F#3 (3e, f1:T)
            { pitch: 64, time: 86.5263, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M46 @4 RH E4 (1e, f2:1)
            { pitch: 66, time: 86.8421, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M46 @5 RH F#4 (1e, f3:2)
            { pitch: 43, time: 87.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M47 @0 LH G2 (3e, f5:4)
            { pitch: 67, time: 87.1579, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M47 @0 RH G4 (6e, f4:3)
            { pitch: 50, time: 88.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M47 @3 LH D3 (3e, f1:T)
            { pitch: 42, time: 89.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M48 @0 LH F#2 (3e, f5:4)
            { pitch: 66, time: 89.0526, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M48 @0 RH F#4 (6e, f3:2)
            { pitch: 50, time: 90.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M48 @3 LH D3 (3e, f2:1)
            { pitch: 45, time: 90.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M49 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 90.9474, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M49 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 91.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M49 @3 LH E3 (3e, f1:T)
            { pitch: 45, time: 92.8421, duration: 1.8697, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M50 @0 LH A2 (6e, f5:4)
            { pitch: 57, time: 94.4211, duration: 0.2908, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M50 @5 RH A3 (1e, f1:T)
            { pitch: 43, time: 94.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M51 @0 LH G2 (3e, f5:4)
            { pitch: 59, time: 94.7368, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M51 @0 RH B3 (6e, f2:1)
            { pitch: 50, time: 95.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M51 @3 LH D3 (3e, f1:T)
            { pitch: 45, time: 96.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M52 @0 LH A2 (3e, f5:4)
            { pitch: 61, time: 96.6316, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M52 @0 RH C#4 (6e, f3:2)
            { pitch: 52, time: 97.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M52 @3 LH E3 (3e, f1:T)
            { pitch: 47, time: 98.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M53 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 98.5263, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M53 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 99.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M53 @3 LH F#3 (3e, f1:T)
            { pitch: 43, time: 100.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M54 @0 LH G2 (3e, f5:4)
            { pitch: 64, time: 100.4211, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M54 @0 RH E4 (2e, f2:1)
            { pitch: 66, time: 101.0526, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M54 @2 RH F#4 (2e, f3:2)
            { pitch: 52, time: 101.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M54 @3 LH E3 (3e, f1:T)
            { pitch: 67, time: 101.6842, duration: 0.6066, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M54 @4 RH G4 (2e, f4:3)
            { pitch: 45, time: 102.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M55 @0 LH A2 (3e, f5:4)
            { pitch: 66, time: 102.3158, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M55 @0 RH F#4 (6e, f3:2)
            { pitch: 54, time: 103.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M55 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 104.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M56 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 104.2105, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M56 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 105.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M56 @3 LH E3 (3e, f1:T)
            { pitch: 50, time: 106.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M57 @0 LH D3 (3e, f4:3)
            { pitch: 62, time: 106.1053, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M57 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 107.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M57 @3 LH F#3 (3e, f2:1)
            { pitch: 50, time: 108.0000, duration: 1.8697, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M58 @0 LH D3 (6e, f4:3)

            // Bridge 2 (Measures 59-68): "Like a river flows, surely to the sea..."
            { pitch: 54, time: 109.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M59 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 109.8947, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M59 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 110.5263, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M59 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 110.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M59 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 111.1579, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M59 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 111.4737, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M59 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 111.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M60 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 111.7895, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M60 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 112.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M60 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 113.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M61 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 113.6842, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M61 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 114.3158, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M61 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 114.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M61 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 114.9474, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M61 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 115.2632, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M61 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 115.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M62 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 115.5789, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M62 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 116.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M62 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 117.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M63 @0 LH F#3 (3e, f3:2)
            { pitch: 61, time: 117.4737, duration: 0.6066, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M63 @0 RH C#4 (2e, f1:T)
            { pitch: 66, time: 118.1053, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M63 @2 RH F#4 (2e, f2:1)
            { pitch: 57, time: 118.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M63 @3 LH A3 (3e, f1:T)
            { pitch: 69, time: 118.7368, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M63 @4 RH A4 (1e, f3:2)
            { pitch: 73, time: 119.0526, duration: 0.2908, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M63 @5 RH C#5 (1e, f5:4)
            { pitch: 49, time: 119.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M64 @0 LH C#3 (3e, f5:4)
            { pitch: 71, time: 119.3684, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M64 @0 RH B4 (6e, f4:3)
            { pitch: 56, time: 120.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M64 @3 LH G#3 (3e, f2:1)
            { pitch: 54, time: 121.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M65 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 121.2632, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M65 @0 RH A4 (2e, f3:2)
            { pitch: 69, time: 121.8947, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M65 @2 RH A4 (6e, f3:2)
            { pitch: 57, time: 122.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M65 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 123.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M66 @0 LH B2 (3e, f5:4)
            { pitch: 66, time: 123.7895, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M66 @2 RH F#4 (2e, f2:1)
            { pitch: 51, time: 124.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M66 @3 LH D#3 (3e, f3:2)
            { pitch: 69, time: 124.4211, duration: 0.2908, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M66 @4 RH A4 (1e, f4:3)
            { pitch: 66, time: 124.7368, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M66 @5 RH F#4 (1e, f2:1)
            { pitch: 52, time: 125.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M67 @0 LH E3 (3e, f2:1)
            { pitch: 67, time: 125.0526, duration: 3.7645, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M67 @0 RH G4 (12e, f3:2)
            { pitch: 55, time: 126.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M67 @3 LH G3 (3e, f1:T)
            { pitch: 45, time: 126.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M68 @0 LH A2 (3e, f5:4)
            { pitch: 57, time: 127.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M68 @3 LH A3 (3e, f1:T)

            // Verse 4 (Measures 69-84): "Take my hand, take my whole life too..."
            { pitch: 50, time: 128.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M69 @0 LH D3 (3e, f5:4)
            { pitch: 62, time: 128.8421, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M69 @0 RH D4 (6e, f1:T)
            { pitch: 57, time: 129.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M69 @3 LH A3 (3e, f1:T)
            { pitch: 54, time: 130.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 3, lockedFinger: 3 }, // M70 @0 LH F#3 (3e, f3:2)
            { pitch: 69, time: 130.7368, duration: 1.8697, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M70 @0 RH A4 (6e, f5:4)
            { pitch: 57, time: 131.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M70 @3 LH A3 (3e, f1:T)
            { pitch: 47, time: 132.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M71 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 132.6316, duration: 2.8171, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M71 @0 RH D4 (9e, f1:T)
            { pitch: 54, time: 133.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M71 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 134.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M72 @0 LH A2 (3e, f5:4)
            { pitch: 54, time: 135.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M72 @3 LH F#3 (3e, f1:T)
            { pitch: 64, time: 135.7895, duration: 0.2908, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M72 @4 RH E4 (1e, f2:1)
            { pitch: 66, time: 136.1053, duration: 0.2908, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M72 @5 RH F#4 (1e, f3:2)
            { pitch: 43, time: 136.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M73 @0 LH G2 (3e, f5:4)
            { pitch: 67, time: 136.4211, duration: 1.8697, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M73 @0 RH G4 (6e, f4:3)
            { pitch: 50, time: 137.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M73 @3 LH D3 (3e, f1:T)
            { pitch: 42, time: 138.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M74 @0 LH F#2 (3e, f5:4)
            { pitch: 66, time: 138.3158, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M74 @0 RH F#4 (6e, f3:2)
            { pitch: 50, time: 139.2632, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M74 @3 LH D3 (3e, f2:1)
            { pitch: 45, time: 140.2105, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M75 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 140.2105, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M75 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 141.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M75 @3 LH E3 (3e, f1:T)
            { pitch: 45, time: 142.1053, duration: 1.8697, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M76 @0 LH A2 (6e, f5:4)
            { pitch: 57, time: 143.6842, duration: 0.2908, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M76 @5 RH A3 (1e, f1:T)
            { pitch: 43, time: 144.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M77 @0 LH G2 (3e, f5:4)
            { pitch: 59, time: 144.0000, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M77 @0 RH B3 (6e, f2:1)
            { pitch: 50, time: 144.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M77 @3 LH D3 (3e, f1:T)
            { pitch: 45, time: 145.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M78 @0 LH A2 (3e, f5:4)
            { pitch: 61, time: 145.8947, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M78 @0 RH C#4 (6e, f3:2)
            { pitch: 52, time: 146.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M78 @3 LH E3 (3e, f1:T)
            { pitch: 47, time: 147.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M79 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 147.7895, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M79 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 148.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M79 @3 LH F#3 (3e, f1:T)
            { pitch: 43, time: 149.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M80 @0 LH G2 (3e, f5:4)
            { pitch: 64, time: 149.6842, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M80 @0 RH E4 (2e, f2:1)
            { pitch: 66, time: 150.3158, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M80 @2 RH F#4 (2e, f3:2)
            { pitch: 52, time: 150.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M80 @3 LH E3 (3e, f1:T)
            { pitch: 67, time: 150.9474, duration: 0.6066, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M80 @4 RH G4 (2e, f4:3)
            { pitch: 45, time: 151.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M81 @0 LH A2 (3e, f5:4)
            { pitch: 66, time: 151.5789, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M81 @0 RH F#4 (6e, f3:2)
            { pitch: 54, time: 152.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M81 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 153.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M82 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 153.4737, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M82 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 154.4211, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M82 @3 LH E3 (3e, f1:T)
            { pitch: 50, time: 155.3684, duration: 0.9224, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M83 @0 LH D3 (3e, f4:3)
            { pitch: 62, time: 155.3684, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M83 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 156.3158, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M83 @3 LH F#3 (3e, f2:1)
            { pitch: 50, time: 157.2632, duration: 1.8697, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M84 @0 LH D3 (6e, f4:3)
            { pitch: 57, time: 158.8421, duration: 0.2908, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M84 @5 RH A3 (1e, f1:T)

            // Outro Tag (Measures 85-92): "For I can't help falling in love with you"
            { pitch: 43, time: 159.1579, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M85 @0 LH G2 (3e, f5:4)
            { pitch: 59, time: 159.1579, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M85 @0 RH B3 (6e, f2:1)
            { pitch: 50, time: 160.1053, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M85 @3 LH D3 (3e, f1:T)
            { pitch: 45, time: 161.0526, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M86 @0 LH A2 (3e, f5:4)
            { pitch: 61, time: 161.0526, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M86 @0 RH C#4 (6e, f3:2)
            { pitch: 52, time: 162.0000, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M86 @3 LH E3 (3e, f1:T)
            { pitch: 47, time: 162.9474, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M87 @0 LH B2 (3e, f5:4)
            { pitch: 62, time: 162.9474, duration: 1.8697, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M87 @0 RH D4 (6e, f1:T)
            { pitch: 54, time: 163.8947, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M87 @3 LH F#3 (3e, f1:T)
            { pitch: 43, time: 164.8421, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M88 @0 LH G2 (3e, f5:4)
            { pitch: 64, time: 164.8421, duration: 0.6066, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M88 @0 RH E4 (2e, f2:1)
            { pitch: 66, time: 165.4737, duration: 0.6066, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M88 @2 RH F#4 (2e, f3:2)
            { pitch: 52, time: 165.7895, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M88 @3 LH E3 (3e, f1:T)
            { pitch: 67, time: 166.1053, duration: 0.6066, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M88 @4 RH G4 (2e, f4:3)
            { pitch: 45, time: 166.7368, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M89 @0 LH A2 (3e, f5:4)
            { pitch: 66, time: 166.7368, duration: 1.8697, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M89 @0 RH F#4 (6e, f3:2)
            { pitch: 54, time: 167.6842, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M89 @3 LH F#3 (3e, f1:T)
            { pitch: 45, time: 168.6316, duration: 0.9224, clef: "bass", hand: "left", finger: 5, lockedFinger: 5 }, // M90 @0 LH A2 (3e, f5:4)
            { pitch: 64, time: 168.6316, duration: 1.8697, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M90 @0 RH E4 (6e, f2:1)
            { pitch: 52, time: 169.5789, duration: 0.9224, clef: "bass", hand: "left", finger: 1, lockedFinger: 1 }, // M90 @3 LH E3 (3e, f1:T)
            { pitch: 50, time: 170.5263, duration: 0.9224, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 }, // M91 @0 LH D3 (3e, f4:3)
            { pitch: 62, time: 170.5263, duration: 3.7645, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M91 @0 RH D4 (12e, f1:T)
            { pitch: 54, time: 171.4737, duration: 0.9224, clef: "bass", hand: "left", finger: 2, lockedFinger: 2 }, // M91 @3 LH F#3 (3e, f2:1)
            { pitch: 50, time: 172.4211, duration: 3.7645, clef: "bass", hand: "left", finger: 4, lockedFinger: 4 } // M92 @0 LH D3 (12e, f4:3)
        ]
    },
    {
        id: "yousician_groove",
        title: "Yousician Groove (Screenshot)",
        artist: "Yousician Exercise",
        bpm: 100,
        beatsPerMeasure: 4,
        timeSignature: [4, 4],
        keySignature: "D",
        chords: ["G", "A", "Bm", "G", "G", "A", "Bm", "G"],
        notes: [
            // Measure 1 — G (0.0000s – 2.4000s)
            { pitch: 71, time: 0.0000, duration: 1.1750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M01 @0 RH B4 (2b, f1:T)
            { pitch: 47, time: 0.0000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M01 @0 LH B2 (1b, f3:2)
            { pitch: 43, time: 0.6000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // M01 @1 LH G2 (1b, f5:4)
            { pitch: 74, time: 1.2000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M01 @2 RH D5 (2b, f3:2)
            { pitch: 47, time: 1.2000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M01 @2 LH B2 (1b, f3:2)
            { pitch: 50, time: 1.8000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M01 @3 LH D3 (1b, f1:T)

            // Measure 2 — A (2.4000s – 4.8000s)
            { pitch: 71, time: 2.4000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M02 @0 RH B4 (1b, f1:T)
            { pitch: 45, time: 2.4000, duration: 1.7750, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 }, // M02 @0 LH A2 (3b, f4:3)
            { pitch: 71, time: 3.0000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M02 @1 RH B4 (1b, f1:T)
            { pitch: 74, time: 3.6000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M02 @2 RH D5 (2b, f3:2)
            { pitch: 47, time: 4.2000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M02 @3 LH B2 (1b, f3:2)

            // Measure 3 — Bm (4.8000s – 7.2000s)
            { pitch: 71, time: 4.8000, duration: 1.1750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M03 @0 RH B4 (2b, f1:T)
            { pitch: 47, time: 4.8000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M03 @0 LH B2 (2b, f3:2)
            { pitch: 74, time: 6.0000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M03 @2 RH D5 (2b, f3:2)
            { pitch: 43, time: 6.0000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // M03 @2 LH G2 (1b, f5:4)
            { pitch: 47, time: 6.6000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M03 @3 LH B2 (1b, f3:2)

            // Measure 4 — G (7.2000s – 9.6000s)
            { pitch: 71, time: 7.2000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M04 @0 RH B4 (1b, f1:T)
            { pitch: 50, time: 7.2000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M04 @0 LH D3 (2b, f1:T)
            { pitch: 71, time: 7.8000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M04 @1 RH B4 (1b, f1:T)
            { pitch: 74, time: 8.4000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M04 @2 RH D5 (2b, f3:2)
            { pitch: 47, time: 8.4000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M04 @2 LH B2 (2b, f3:2)

            // Measure 5 — G (9.6000s – 12.0000s, exact repeat of M01)
            { pitch: 71, time: 9.6000,  duration: 1.1750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 47, time: 9.6000,  duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },
            { pitch: 43, time: 10.2000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 74, time: 10.8000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 47, time: 10.8000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },
            { pitch: 50, time: 11.4000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },

            // Measure 6 — A (12.0000s – 14.4000s, exact repeat of M02)
            { pitch: 71, time: 12.0000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 45, time: 12.0000, duration: 1.7750, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 },
            { pitch: 71, time: 12.6000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 74, time: 13.2000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 47, time: 13.8000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },

            // Measure 7 — Bm (14.4000s – 16.8000s, exact repeat of M03)
            { pitch: 71, time: 14.4000, duration: 1.1750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 47, time: 14.4000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },
            { pitch: 74, time: 15.6000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 43, time: 15.6000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 47, time: 16.2000, duration: 0.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },

            // Measure 8 — G (16.8000s – 19.2000s, exact repeat of M04)
            { pitch: 71, time: 16.8000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 50, time: 16.8000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 71, time: 17.4000, duration: 0.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 74, time: 18.0000, duration: 1.1750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 47, time: 18.0000, duration: 1.1750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }
        ]
    },
    {
        id: "fur_elise",
        title: "Für Elise",
        artist: "Ludwig van Beethoven",
        bpm: 120, // Exact 3/8 eighth-note pulse (eighth = 0.5000s, sixteenth = 0.2500s, measure = 1.5000s)
        beatsPerMeasure: 3,
        timeSignature: [3, 8],
        keySignature: "Am",
        chords: ["", "", "Am", "E7", "Am", "", "Am", "E7", "Am"],
        notes: [
            // Measure 0 — Beat 3 Anacrusis Pickup (1.0000s – 1.5000s)
            { pitch: 76, time: 1.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 75, time: 1.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D#5

            // Measure 1 — Solo Chromatic Turn (1.5000s – 3.0000s)
            { pitch: 76, time: 1.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 75, time: 1.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D#5
            { pitch: 76, time: 2.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 71, time: 2.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // B4
            { pitch: 74, time: 2.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D5
            { pitch: 72, time: 2.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // C5

            // Measure 2 — Am (3.0000s – 4.5000s)
            { pitch: 69, time: 3.0000, duration: 0.4750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // A4 (eighth)
            { pitch: 45, time: 3.0000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // A2
            { pitch: 52, time: 3.2500, duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // E3
            { pitch: 57, time: 3.5000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // A3
            { pitch: 60, time: 3.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // C4
            { pitch: 64, time: 4.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // E4
            { pitch: 69, time: 4.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // A4

            // Measure 3 — E7 (4.5000s – 6.0000s)
            { pitch: 71, time: 4.5000, duration: 0.4750, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // B4 (eighth)
            { pitch: 40, time: 4.5000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // E2
            { pitch: 52, time: 4.7500, duration: 0.2250, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // E3
            { pitch: 56, time: 5.0000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // G#3
            { pitch: 64, time: 5.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // E4
            { pitch: 68, time: 5.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // G#4
            { pitch: 71, time: 5.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // B4

            // Measure 4 — Am Re-Transition (6.0000s – 7.5000s)
            { pitch: 72, time: 6.0000, duration: 0.4750, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // C5 (eighth)
            { pitch: 45, time: 6.0000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // A2
            { pitch: 52, time: 6.2500, duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // E3
            { pitch: 57, time: 6.5000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // A3
            { pitch: 64, time: 6.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // E4
            { pitch: 76, time: 7.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 75, time: 7.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D#5

            // Measure 5 — Consequent Chromatic Turn (7.5000s – 9.0000s, exact repeat of M01)
            { pitch: 76, time: 7.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 75, time: 7.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D#5
            { pitch: 76, time: 8.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // E5
            { pitch: 71, time: 8.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // B4
            { pitch: 74, time: 8.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // D5
            { pitch: 72, time: 8.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // C5

            // Measure 6 — Am (9.0000s – 10.5000s, exact repeat of M02)
            { pitch: 69, time: 9.0000,  duration: 0.4750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // A4
            { pitch: 45, time: 9.0000,  duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // A2
            { pitch: 52, time: 9.2500,  duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // E3
            { pitch: 57, time: 9.5000,  duration: 0.2250, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // A3
            { pitch: 60, time: 9.7500,  duration: 0.2250, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // C4
            { pitch: 64, time: 10.0000, duration: 0.2250, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // E4
            { pitch: 69, time: 10.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // A4

            // Measure 7 — E7 Cadence Preparation (10.5000s – 12.0000s)
            { pitch: 71, time: 10.5000, duration: 0.4750, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // B4
            { pitch: 40, time: 10.5000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // E2
            { pitch: 52, time: 10.7500, duration: 0.2250, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // E3
            { pitch: 56, time: 11.0000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // G#3
            { pitch: 64, time: 11.2500, duration: 0.2250, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // E4
            { pitch: 72, time: 11.5000, duration: 0.2250, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // C5
            { pitch: 71, time: 11.7500, duration: 0.2250, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // B4

            // Measure 8 — Am Tonic Resolution (12.0000s – 13.5000s)
            { pitch: 69, time: 12.0000, duration: 1.4750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // A4 (dotted quarter)
            { pitch: 45, time: 12.0000, duration: 0.2250, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // A2
            { pitch: 52, time: 12.2500, duration: 0.2250, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // E3
            { pitch: 57, time: 12.5000, duration: 0.9750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }  // A3 (quarter)
        ]
    },
    {
        id: "ode_to_joy",
        title: "Ode to Joy",
        artist: "Ludwig van Beethoven",
        bpm: 110,
        beatsPerMeasure: 4,
        timeSignature: [4, 4],
        keySignature: "C",
        chords: ["C", "G", "C", "G", "C", "G", "C", "G → C"],
        notes: [
            // Measure 1 — C (0.0000s – 2.1818s): E4 E4 F4 G4 over C3 – G3
            { pitch: 64, time: 0.0000, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 48, time: 0.0000, duration: 1.0659, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 64, time: 0.5455, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 65, time: 1.0909, duration: 0.5205, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 },
            { pitch: 55, time: 1.0909, duration: 1.0659, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 67, time: 1.6364, duration: 0.5205, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 },

            // Measure 2 — G (2.1818s – 4.3636s): G4 F4 E4 D4 over G3 – D3
            { pitch: 67, time: 2.1818, duration: 0.5205, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 },
            { pitch: 55, time: 2.1818, duration: 1.0659, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 65, time: 2.7273, duration: 0.5205, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 },
            { pitch: 64, time: 3.2727, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 50, time: 3.2727, duration: 1.0659, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 },
            { pitch: 62, time: 3.8182, duration: 0.5205, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },

            // Measure 3 — C (4.3636s – 6.5455s): C4 C4 D4 E4 over C3 – E3
            { pitch: 60, time: 4.3636, duration: 0.5205, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 48, time: 4.3636, duration: 1.0659, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 60, time: 4.9091, duration: 0.5205, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 62, time: 5.4545, duration: 0.5205, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },
            { pitch: 52, time: 5.4545, duration: 1.0659, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },
            { pitch: 64, time: 6.0000, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },

            // Measure 4 — G Half-Cadence (6.5455s – 8.7273s): E4. D4 D4– over G3
            { pitch: 64, time: 6.5455, duration: 0.7932, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 55, time: 6.5455, duration: 2.1568, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 62, time: 7.3636, duration: 0.2477, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },
            { pitch: 62, time: 7.6364, duration: 1.0659, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },

            // Measure 5 — C (8.7273s – 10.9091s, exact repeat of M01)
            { pitch: 64, time: 8.7273,  duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 48, time: 8.7273,  duration: 1.0659, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 64, time: 9.2727,  duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 65, time: 9.8182,  duration: 0.5205, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 },
            { pitch: 55, time: 9.8182,  duration: 1.0659, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 67, time: 10.3636, duration: 0.5205, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 },

            // Measure 6 — G (10.9091s – 13.0909s, exact repeat of M02)
            { pitch: 67, time: 10.9091, duration: 0.5205, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 },
            { pitch: 55, time: 10.9091, duration: 1.0659, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 65, time: 11.4545, duration: 0.5205, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 },
            { pitch: 64, time: 12.0000, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },
            { pitch: 50, time: 12.0000, duration: 1.0659, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 },
            { pitch: 62, time: 12.5455, duration: 0.5205, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },

            // Measure 7 — C (13.0909s – 15.2727s, exact repeat of M03)
            { pitch: 60, time: 13.0909, duration: 0.5205, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 48, time: 13.0909, duration: 1.0659, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 },
            { pitch: 60, time: 13.6364, duration: 0.5205, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 62, time: 14.1818, duration: 0.5205, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },
            { pitch: 52, time: 14.1818, duration: 1.0659, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 },
            { pitch: 64, time: 14.7273, duration: 0.5205, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 },

            // Measure 8 — G → C Authentic Cadence (15.2727s – 17.4545s): D4. C4 C4– over G3 – C3
            { pitch: 62, time: 15.2727, duration: 0.7932, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 },
            { pitch: 55, time: 15.2727, duration: 1.0659, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 },
            { pitch: 60, time: 16.0909, duration: 0.2477, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 60, time: 16.3636, duration: 1.0659, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 },
            { pitch: 48, time: 16.3636, duration: 1.0659, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }
        ]
    },
    {
        id: "canon_in_d",
        title: "Canon in D",
        artist: "Johann Pachelbel",
        bpm: 75,
        beatsPerMeasure: 2,
        timeSignature: [2, 4],
        keySignature: "D",
        chords: [
            "D", "A", "Bm", "F#m", "G", "D", "G", "A",
            "D", "A", "Bm", "F#m", "G", "D", "G", "A",
            "D"
        ],
        notes: [
            // Cycle 1 (M01–M08): Ground Bass + Violin I Statement 1 (F#5 – E5 – D5 – C#5 – B4 – A4 – B4 – C#5)
            { pitch: 50, time: 0.0000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M01 D:   LH D3
            { pitch: 78, time: 0.0000,  duration: 1.5750, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M01 D:   RH F#5
            { pitch: 45, time: 1.6000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M02 A:   LH A2
            { pitch: 76, time: 1.6000,  duration: 1.5750, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M02 A:   RH E5
            { pitch: 47, time: 3.2000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // M03 Bm:  LH B2
            { pitch: 74, time: 3.2000,  duration: 1.5750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M03 Bm:  RH D5
            { pitch: 42, time: 4.8000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 }, // M04 F#m: LH F#2
            { pitch: 73, time: 4.8000,  duration: 1.5750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M04 F#m: RH C#5
            { pitch: 43, time: 6.4000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M05 G:   LH G2
            { pitch: 71, time: 6.4000,  duration: 1.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M05 G:   RH B4
            { pitch: 38, time: 8.0000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // M06 D:   LH D2
            { pitch: 69, time: 8.0000,  duration: 1.5750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M06 D:   RH A4
            { pitch: 43, time: 9.6000,  duration: 1.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M07 G:   LH G2
            { pitch: 71, time: 9.6000,  duration: 1.5750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M07 G:   RH B4
            { pitch: 45, time: 11.2000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // M08 A:   LH A2
            { pitch: 73, time: 11.2000, duration: 1.5750, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M08 A:   RH C#5

            // Cycle 2 (M09–M16): Ground Bass + Violin I Statement 2 (D5 – C#5 – B4 – A4 – G4 – F#4 – G4 – E4)
            { pitch: 50, time: 12.8000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M09 D:   LH D3
            { pitch: 74, time: 12.8000, duration: 1.5750, clef: "treble", hand: "right", finger: 5, lockedFinger: 5 }, // M09 D:   RH D5
            { pitch: 45, time: 14.4000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M10 A:   LH A2
            { pitch: 73, time: 14.4000, duration: 1.5750, clef: "treble", hand: "right", finger: 4, lockedFinger: 4 }, // M10 A:   RH C#5
            { pitch: 47, time: 16.0000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // M11 Bm:  LH B2
            { pitch: 71, time: 16.0000, duration: 1.5750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M11 Bm:  RH B4
            { pitch: 42, time: 17.6000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 4, lockedFinger: 4 }, // M12 F#m: LH F#2
            { pitch: 69, time: 17.6000, duration: 1.5750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M12 F#m: RH A4
            { pitch: 43, time: 19.2000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M13 G:   LH G2
            { pitch: 67, time: 19.2000, duration: 1.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M13 G:   RH G4
            { pitch: 38, time: 20.8000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 5, lockedFinger: 5 }, // M14 D:   LH D2
            { pitch: 66, time: 20.8000, duration: 1.5750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }, // M14 D:   RH F#4
            { pitch: 43, time: 22.4000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 3, lockedFinger: 3 }, // M15 G:   LH G2
            { pitch: 67, time: 22.4000, duration: 1.5750, clef: "treble", hand: "right", finger: 3, lockedFinger: 3 }, // M15 G:   RH G4
            { pitch: 45, time: 24.0000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 2, lockedFinger: 2 }, // M16 A:   LH A2
            { pitch: 64, time: 24.0000, duration: 1.5750, clef: "treble", hand: "right", finger: 1, lockedFinger: 1 }, // M16 A:   RH E4

            // Final Tonic Resolution (M17 — D Major)
            { pitch: 50, time: 25.6000, duration: 1.5750, clef: "bass",   hand: "left",  finger: 1, lockedFinger: 1 }, // M17 D:   LH D3
            { pitch: 66, time: 25.6000, duration: 1.5750, clef: "treble", hand: "right", finger: 2, lockedFinger: 2 }  // M17 D:   RH F#4
        ]
    }
];

export const SONG_LIBRARY = RAW_SONG_LIBRARY.map((song) =>
    PianoFingeringEngine.assignSongFingering(song)
);
