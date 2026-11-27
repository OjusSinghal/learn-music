/**
 * Structured Ukulele Conservatory Curriculum (Levels 1–9)
 *
 * Mirrors the exact conservatory schema & O(1) lookup API of `js/curriculum/index.js`:
 *   - 9 Progressive Levels (`uku_level_1` .. `uku_level_9`)
 *   - 4 Structured Lessons per Level (`36` lessons: `uku_l1_lesson_1` .. `uku_l9_lesson_4`)
 *   - 3 Playable Parts per Lesson (`108` parts: `uku_l1_1_p1` .. `uku_l9_4_p3`):
 *       Part 1: "solo"     — Single-note picking, scales, arpeggios, riffs & campanella (`right` / Melody)
 *       Part 2: "chords"   — Authentic strumming grooves & chord transitions (`left` / Chords)
 *       Part 3: "combined" — Zero-collision Chord-Melody & full groove capstones (`left + right`)
 *
 * Standard Re-Entrant High-G Tuning (`G4-C4-E4-A4`, frets `0..12`, MIDI `60..81`).
 * All IDs are prefixed `uku_` so they NEVER collide with Piano curriculum IDs.
 */

import { VALID_BACKING_STYLES } from "../audio/backing_track.js";
import {
    UKULELE_STRINGS,
    UKULELE_MAX_FRET,
    getUkuleleFingerStyle,
    parseUkuleleChordBar,
    chordToTabNotes
} from "./chords.js";
import {
    arrangeMelodyNotes,
    resolveSimultaneousCollisions
} from "./arranger.js";

const ARTICULATION_GAP = 0.025;
const MIN_DUR = 0.15;

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

/**
 * Curated ukulele strum & fingerpicking patterns per meter (beat offsets within 1 measure).
 */
const STRUM_PATTERNS = {
    whole_44: [
        { beat: 0, dur: 4, dir: "down" }
    ],
    half_44: [
        { beat: 0, dur: 2, dir: "down" },
        { beat: 2, dur: 2, dir: "down" }
    ],
    quarter_44: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 1, dir: "down" },
        { beat: 2, dur: 1, dir: "down" },
        { beat: 3, dur: 1, dir: "down" }
    ],
    folk_du_44: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 1, dir: "down" },
        { beat: 2, dur: 1, dir: "down" },
        { beat: 3, dur: 0.5, dir: "down" },
        { beat: 3.5, dur: 0.5, dir: "up" }
    ],
    // Iconic Hawaiian Island Strum: D - D U - U D U
    island_44: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 0.5, dir: "down" },
        { beat: 1.5, dur: 1, dir: "up" },
        { beat: 2.5, dur: 0.5, dir: "up" },
        { beat: 3, dur: 0.5, dir: "down" },
        { beat: 3.5, dur: 0.5, dir: "up" }
    ],
    pop_sync_44: [
        { beat: 0, dur: 1.5, dir: "down" },
        { beat: 1.5, dur: 1, dir: "up" },
        { beat: 2.5, dur: 0.5, dir: "up" },
        { beat: 3, dur: 1, dir: "down" }
    ],
    driving_rock_44: [
        { beat: 0, dur: 0.5, dir: "down" },
        { beat: 0.5, dur: 0.5, dir: "up" },
        { beat: 1, dur: 1, dir: "down" },
        { beat: 2, dur: 0.5, dir: "down" },
        { beat: 2.5, dur: 0.5, dir: "up" },
        { beat: 3, dur: 1, dir: "down" }
    ],
    jazz_four_44: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 1, dir: "down" },
        { beat: 2, dur: 1, dir: "down" },
        { beat: 3, dur: 1, dir: "down" }
    ],
    blues_shuffle_44: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 0.67, dir: "down" },
        { beat: 1.67, dur: 0.33, dir: "up" },
        { beat: 2, dur: 1, dir: "down" },
        { beat: 3, dur: 0.67, dir: "down" },
        { beat: 3.67, dur: 0.33, dir: "up" }
    ],
    bossa_44: [
        { beat: 0, dur: 1.5, dir: "down" },
        { beat: 1.5, dur: 1.5, dir: "up" },
        { beat: 3, dur: 1, dir: "down" }
    ],
    waltz_gentle_34: [
        { beat: 0, dur: 2, dir: "down" },
        { beat: 2, dur: 1, dir: "up" }
    ],
    waltz_34: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 1, dir: "down" },
        { beat: 2, dur: 1, dir: "up" }
    ],
    duple_24: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 0.5, dir: "down" },
        { beat: 1.5, dur: 0.5, dir: "up" }
    ],
    ballad_68: [
        { beat: 0, dur: 1, dir: "down" },
        { beat: 1, dur: 1, dir: "down" }
    ],
    ballad_68_lilt: [
        { beat: 0, dur: 0.67, dir: "down" },
        { beat: 0.67, dur: 0.33, dir: "up" },
        { beat: 1, dur: 0.67, dir: "down" },
        { beat: 1.67, dur: 0.33, dir: "up" }
    ]
};

/**
 * Generates strumming chord notes (`lane: "chords"`, `hand: "left"`) for `chords[]`.
 */
function buildStrumNotes(chords, bpm, beatsPerMeasure, patternName, options = {}) {
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const pulses = STRUM_PATTERNS[patternName] || STRUM_PATTERNS.half_44;
    const notes = [];

    for (let m = 0; m < chords.length; m++) {
        const segs = parseUkuleleChordBar(chords[m]);
        if (segs.length === 0) continue;
        const mStart = m * measureSec;
        const isFinalBar = m === chords.length - 1;

        if (isFinalBar && options.cadenceWholeLastBar) {
            const seg = segs[segs.length - 1];
            const dur = Math.max(MIN_DUR, measureSec - ARTICULATION_GAP);
            const strum = chordToTabNotes(seg.shape, mStart, dur, {
                strumDir: "down",
                lane: "chords",
                hand: "left",
                chordSymbol: seg.symbol,
                chordGroupId: `m${m}_cadence_${seg.symbol}`
            });
            notes.push(...strum);
            continue;
        }

        for (let p = 0; p < pulses.length; p++) {
            const pulse = pulses[p];
            if (pulse.beat >= beatsPerMeasure - 1e-4) continue;
            const frac = pulse.beat / beatsPerMeasure;
            let seg = segs[0];
            for (let s = 0; s < segs.length; s++) {
                if (frac >= segs[s].startFraction - 1e-4 && frac < segs[s].endFraction - 1e-4) {
                    seg = segs[s];
                    break;
                }
            }
            const t = mStart + pulse.beat * beatSec;
            const dur = Math.max(MIN_DUR, pulse.dur * beatSec - ARTICULATION_GAP);
            const strum = chordToTabNotes(seg.shape, t, dur, {
                strumDir: pulse.dir,
                lane: "chords",
                hand: "left",
                chordSymbol: seg.symbol,
                chordGroupId: `m${m}_p${p}_${seg.symbol}`
            });
            notes.push(...strum);
        }
    }

    return notes;
}

/**
 * Generates broken-chord arpeggio picking notes directly from each bar's chord shape
 * (e.g. T-I-M-A rolling patterns across strings `G(3)-C(2)-E(1)-A(0)`).
 */
function buildChordArpeggioNotes(chords, bpm, beatsPerMeasure, stringSeq, stepBeats, lane = "melody") {
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const hand = lane === "chords" ? "left" : "right";
    const clef = hand === "left" ? "bass" : "treble";
    const notes = [];

    for (let m = 0; m < chords.length; m++) {
        const segs = parseUkuleleChordBar(chords[m]);
        if (segs.length === 0) continue;
        const mStart = m * measureSec;
        const isLast = m === chords.length - 1;
        const count = isLast ? Math.min(stringSeq.length, Math.max(1, Math.floor(beatsPerMeasure / stepBeats) - 1)) : stringSeq.length;

        for (let k = 0; k < count; k++) {
            const beatOffset = k * stepBeats;
            if (beatOffset >= beatsPerMeasure - 1e-4) break;
            const frac = beatOffset / beatsPerMeasure;
            let seg = segs[0];
            for (let s = 0; s < segs.length; s++) {
                if (frac >= segs[s].startFraction - 1e-4 && frac < segs[s].endFraction - 1e-4) {
                    seg = segs[s];
                    break;
                }
            }
            const sIdx = stringSeq[k];
            const fret = seg.shape.fretsTab[sIdx];
            const finger = fret === 0 ? 0 : Math.max(1, Math.min(4, seg.shape.fingersTab[sIdx] || 1));
            const strMeta = UKULELE_STRINGS[sIdx];
            const fStyle = getUkuleleFingerStyle(finger);
            const durBeats = (isLast && k === count - 1) ? (beatsPerMeasure - beatOffset) : stepBeats;

            notes.push({
                pitch: strMeta.openMidi + fret,
                time: round4(mStart + beatOffset * beatSec),
                duration: round4(Math.max(MIN_DUR, durBeats * beatSec - ARTICULATION_GAP)),
                string: sIdx,
                stringName: strMeta.name,
                fret,
                finger,
                fingerLabel: fStyle.diagramLabel,
                fingerColor: fStyle.primary,
                lane,
                hand,
                clef,
                chordSymbol: seg.symbol,
                isChordNote: lane === "chords"
            });
        }
    }
    return notes;
}

/**
 * Converts compact explicit tab events `[[bar, beat, durBeats, string, fret, finger?], ...]`
 * into verified ukulele notes.
 */
function buildExplicitTabNotes(events, bpm, beatsPerMeasure, lane = "melody") {
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const hand = lane === "chords" ? "left" : "right";
    const clef = hand === "left" ? "bass" : "treble";

    return events.map(([bar, beat, durBeats, sIdx, fret, explicitFinger]) => {
        const strMeta = UKULELE_STRINGS[sIdx];
        const clampedFret = Math.max(0, Math.min(UKULELE_MAX_FRET, fret));
        let finger;
        if (clampedFret === 0) {
            finger = 0;
        } else if (Number.isInteger(explicitFinger) && explicitFinger >= 1 && explicitFinger <= 4) {
            finger = explicitFinger;
        } else if (clampedFret <= 4) {
            finger = clampedFret;
        } else {
            finger = Math.min(4, Math.max(1, ((clampedFret - 5) % 4) + 1));
        }
        const fStyle = getUkuleleFingerStyle(finger);
        return {
            pitch: strMeta.openMidi + clampedFret,
            time: round4(bar * measureSec + beat * beatSec),
            duration: round4(Math.max(MIN_DUR, durBeats * beatSec - ARTICULATION_GAP)),
            string: sIdx,
            stringName: strMeta.name,
            fret: clampedFret,
            finger,
            fingerLabel: fStyle.diagramLabel,
            fingerColor: fStyle.primary,
            lane,
            hand,
            clef,
            isChordNote: false
        };
    });
}

/**
 * Converts compact pitch events `[[bar, beat, durBeats, midi], ...]` into Viterbi-solved ukulele notes.
 */
function buildPitchMelodyNotes(events, bpm, beatsPerMeasure, solverOpts = {}) {
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const raw = events.map(([bar, beat, durBeats, pitch]) => ({
        pitch,
        time: round4(bar * measureSec + beat * beatSec),
        duration: round4(Math.max(MIN_DUR, durBeats * beatSec - ARTICULATION_GAP))
    }));
    return arrangeMelodyNotes(raw, {
        autoOctaveShift: false,
        lane: "melody",
        hand: "right",
        ...solverOpts
    });
}

/**
 * Helper to lay a bar-by-bar array of `[beat, dur, midi]` motifs across `bars` measures.
 */
function barMap(perBarEvents) {
    const out = [];
    for (let bar = 0; bar < perBarEvents.length; bar++) {
        const list = perBarEvents[bar];
        for (let i = 0; i < list.length; i++) {
            out.push([bar, ...list[i]]);
        }
    }
    return out;
}

/**
 * Builds one complete 3-part Ukulele Lesson (`Part 1: solo`, `Part 2: chords`, `Part 3: combined`).
 */
function createUkuleleLesson(cfg) {
    const {
        level,
        order,
        title,
        description,
        modeFocus = "both",
        skills,
        keySignature,
        bpm,
        beatsPerMeasure = 4,
        timeSignature = [4, 4],
        backingStyle,
        chords,
        p1Title,
        p1Subtitle,
        p2Title,
        p2Subtitle,
        p3Title,
        p3Subtitle,
        strumPattern,
        combinedStrumPattern,
        buildSoloNotes,
        buildCombinedMelodyNotes,
        xpBase
    } = cfg;

    if (!VALID_BACKING_STYLES.has(backingStyle)) {
        throw new Error(`Invalid backingStyle "${backingStyle}" in uku_l${level}_lesson_${order}`);
    }

    const lessonId = `uku_l${level}_lesson_${order}`;
    const artist = `Ukulele Conservatory Level ${level} · Lesson ${order}`;
    const p1Bpm = bpm;
    const p2Bpm = bpm;
    const p3Bpm = Math.min(124, bpm + 2);

    const p1Notes = buildSoloNotes(p1Bpm, beatsPerMeasure, chords);
    const p2Notes = buildStrumNotes(chords, p2Bpm, beatsPerMeasure, strumPattern, { cadenceWholeLastBar: true });

    const p3Mel = (buildCombinedMelodyNotes || buildSoloNotes)(p3Bpm, beatsPerMeasure, chords);
    const p3Chd = buildStrumNotes(
        chords,
        p3Bpm,
        beatsPerMeasure,
        combinedStrumPattern || strumPattern,
        { cadenceWholeLastBar: true }
    );
    const p3Resolved = resolveSimultaneousCollisions(p3Mel, p3Chd);

    const p1Id = `uku_l${level}_${order}_p1`;
    const p2Id = `uku_l${level}_${order}_p2`;
    const p3Id = `uku_l${level}_${order}_p3`;

    const makeSong = (songId, songTitle, songBpm, notes) => ({
        id: songId,
        title: songTitle,
        artist,
        instrument: "ukulele",
        tuning: "G4-C4-E4-A4",
        maxFret: UKULELE_MAX_FRET,
        bpm: songBpm,
        beatsPerMeasure,
        timeSignature: [...timeSignature],
        keySignature,
        backingStyle,
        chords: [...chords],
        notes
    });

    return {
        id: lessonId,
        level,
        order,
        instrument: "ukulele",
        title,
        description,
        modeFocus,
        skills,
        parts: [
            {
                id: p1Id,
                lessonId,
                level,
                partNumber: 1,
                instrument: "ukulele",
                title: p1Title,
                subtitle: p1Subtitle,
                partType: "solo",
                targetHands: { left: false, right: true },
                xpReward: Math.min(200, xpBase),
                song: makeSong(`uku_curr_l${level}_${order}_p1`, p1Title, p1Bpm, p1Notes)
            },
            {
                id: p2Id,
                lessonId,
                level,
                partNumber: 2,
                instrument: "ukulele",
                title: p2Title,
                subtitle: p2Subtitle,
                partType: "chords",
                targetHands: { left: true, right: false },
                xpReward: Math.min(200, xpBase + 5),
                song: makeSong(`uku_curr_l${level}_${order}_p2`, p2Title, p2Bpm, p2Notes)
            },
            {
                id: p3Id,
                lessonId,
                level,
                partNumber: 3,
                instrument: "ukulele",
                title: p3Title,
                subtitle: p3Subtitle,
                partType: "combined",
                targetHands: { left: true, right: true },
                xpReward: Math.min(200, xpBase + 15),
                song: makeSong(`uku_curr_l${level}_${order}_p3`, p3Title, p3Bpm, p3Resolved.notes)
            }
        ]
    };
}

// ============================================================================
// LEVELS 1–9 CONSERVATORY SYLLABUS (36 LESSONS · 108 PLAYABLE UKULELE PARTS)
// ============================================================================

const RAW_UKULELE_CURRICULUM = [
    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 1: Open Strings (G-C-E-A) & First Single-Finger Chords (C, Am, C7)
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 1,
        id: "uku_level_1",
        instrument: "ukulele",
        title: "Open Strings & First Single-Finger Chords",
        subtitle: "Master G–C–E–A open string geography, steady 4/4 pulse, and your first one-finger C, Am, and C7 chords",
        focusTags: ["Open G–C–E–A", "Single-Finger Chords", "C · Am · C7", "Steady Pulse"],
        lessons: [
            createUkuleleLesson({
                level: 1, order: 1, xpBase: 50,
                title: "Open Strings Geography (G–C–E–A)",
                description: "Pluck each open ukulele string cleanly in rhythm and feel the sunlit resonance of open C6 strumming.",
                modeFocus: "solo",
                skills: ["G–C–E–A String Names", "Open-String Plucking", "Whole & Half Down-Strums"],
                keySignature: "C", bpm: 68, backingStyle: "warm_pad",
                chords: ["C6", "C6", "C6", "C6", "C6", "C6", "C6", "C6"],
                strumPattern: "whole_44", combinedStrumPattern: "whole_44",
                p1Title: "Four Strings Awake", p1Subtitle: "Open G4, C4, E4, and A4 quarter & half plucks",
                p2Title: "Open C6 Breeze", p2Subtitle: "Relaxed whole-note open down-strums across all 4 strings",
                p3Title: "Sunlit Open Harbor", p3Subtitle: "Combine open-string melody with open C6 whole strums",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    [[0, 1, 3, 0], [1, 1, 2, 0], [2, 1, 1, 0], [3, 1, 0, 0]],
                    [[0, 2, 0, 0], [2, 2, 1, 0]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 3, 0], [3, 1, 0, 0]],
                    [[0, 2, 1, 0], [2, 2, 2, 0]],
                    [[0, 1, 3, 0], [1, 1, 1, 0], [2, 1, 2, 0], [3, 1, 0, 0]],
                    [[0, 1, 0, 0], [1, 1, 1, 0], [2, 2, 3, 0]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 0, 0], [3, 1, 1, 0]],
                    [[0, 2, 2, 0], [2, 2, 0, 0]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 1, order: 2, xpBase: 55,
                title: "Your First Chord: C Major (0003)",
                description: "Anchor your Ring finger (3) on A-string fret 3 for a bright C Major chord and pair it with C-pentatonic picking.",
                modeFocus: "both",
                skills: ["C Major (0003) Ring Anchor", "Half-Note Down Strums", "Open Strings + Fret 3"],
                keySignature: "C", bpm: 72, backingStyle: "warm_pad",
                chords: ["C", "C", "C6", "C", "C", "C", "C6", "C"],
                strumPattern: "half_44", combinedStrumPattern: "whole_44",
                p1Title: "Ring Finger Bell (C5)", p1Subtitle: "Open C–E–G–A plus Ring finger fret 3 on A-string",
                p2Title: "C Major Steady Pulse", p2Subtitle: "Clean half-note down-strums alternating C and C6",
                p3Title: "Lagoon Morning in C", p3Subtitle: "Sing fret-3 C5 melodies over warm C Major strums",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 3, 0], [3, 1, 0, 3, 3]],
                    [[0, 2, 0, 3, 3], [2, 2, 1, 0]],
                    [[0, 1, 0, 0], [1, 1, 3, 0], [2, 1, 1, 0], [3, 1, 2, 0]],
                    [[0, 2, 1, 0], [2, 2, 0, 3, 3]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 0, 3, 3], [3, 1, 0, 3, 3]],
                    [[0, 1, 0, 0], [1, 1, 3, 0], [2, 2, 1, 0]],
                    [[0, 1, 1, 0], [1, 1, 0, 0], [2, 1, 0, 3, 3], [3, 1, 0, 0]],
                    [[0, 4, 0, 3, 3]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 1, order: 3, xpBase: 60,
                title: "Am (2000) & C7 (0001) One-Finger Trio",
                description: "Move effortlessly between three iconic single-finger chords: C (Ring), Am (Middle), and C7 (Index).",
                modeFocus: "chords",
                skills: ["Am (2000) Middle Finger", "C7 (0001) Index Finger", "One-Finger Transitions"],
                keySignature: "C", bpm: 76, backingStyle: "acoustic_pop",
                chords: ["C", "Am", "C", "C7", "C", "Am", "C7", "C"],
                strumPattern: "half_44", combinedStrumPattern: "half_44",
                p1Title: "Three-Finger Colors", p1Subtitle: "Single-note phrases highlighting A4, Bb4 (fret 1), and C5 (fret 3)",
                p2Title: "One-Finger Chord Switch", p2Subtitle: "Smooth half-note C → Am → C7 chord transitions",
                p3Title: "Sunset Pier Trio", p3Subtitle: "Play melody and C / Am / C7 strums together",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 2, 0, 3, 3]],
                    [[0, 1, 0, 0], [1, 1, 1, 0], [2, 2, 3, 2, 2]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 3, 0], [3, 1, 0, 3, 3]],
                    [[0, 1, 0, 1, 1], [1, 1, 1, 0], [2, 2, 0, 1, 1]],
                    [[0, 1, 1, 0], [1, 1, 3, 0], [2, 2, 0, 3, 3]],
                    [[0, 1, 0, 0], [1, 1, 3, 2, 2], [2, 2, 1, 0]],
                    [[0, 1, 0, 1, 1], [1, 1, 0, 0], [2, 1, 3, 0], [3, 1, 1, 0]],
                    [[0, 4, 0, 3, 3]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 1, order: 4, xpBase: 65,
                title: "Level 1 Showcase: Island Breeze",
                description: "Unite open strings, fret 1–3 picking, and steady quarter-note strums across C, Am, and C7.",
                modeFocus: "both",
                skills: ["Quarter-Note Strumming", "C · Am · C7 Mastery", "First Chord-Melody Groove"],
                keySignature: "C", bpm: 80, backingStyle: "acoustic_pop",
                chords: ["C", "Am", "C", "Am", "C", "C7", "Am", "C"],
                strumPattern: "quarter_44", combinedStrumPattern: "half_44",
                p1Title: "Palm Shade Melody", p1Subtitle: "Lyrical open-to-fret-3 melody in C Major",
                p2Title: "Four-Beat Island Pulse", p2Subtitle: "Even quarter-note down-strums on C, Am, and C7",
                p3Title: "Level 1 Capstone: Coral Cove", p3Subtitle: "Full Level 1 chord-melody performance",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    [[0, 1, 1, 0], [1, 1, 3, 0], [2, 1, 0, 3, 3], [3, 1, 3, 0]],
                    [[0, 1, 0, 0], [1, 1, 1, 0], [2, 2, 2, 0]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 1, 0, 0], [3, 1, 0, 3, 3]],
                    [[0, 2, 0, 0], [2, 2, 1, 0]],
                    [[0, 1, 0, 3, 3], [1, 1, 0, 0], [2, 1, 3, 0], [3, 1, 1, 0]],
                    [[0, 1, 0, 1, 1], [1, 1, 3, 0], [2, 2, 1, 0]],
                    [[0, 1, 0, 0], [1, 1, 3, 0], [2, 1, 1, 0], [3, 1, 0, 0]],
                    [[0, 2, 0, 3, 3], [2, 2, 2, 0]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 2: C Major Scale (C4–C5) & Primary Strumming (C, F, G7)
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 2,
        id: "uku_level_2",
        instrument: "ukulele",
        title: "C Major Scale & Primary Strumming",
        subtitle: "Play the complete C4–C5 octave scale in 1st position and lock in primary C, F, and G7 progressions",
        focusTags: ["C4–C5 Scale", "F (2010) & G7 (0212)", "Index Pivot", "D–D–DU Strum"],
        lessons: [
            createUkuleleLesson({
                level: 2, order: 1, xpBase: 65,
                title: "C–D–E–F Stepping & F Major (2010)",
                description: "Add D4 (C-string fret 2) and F4 (E-string fret 1), and add your Index finger to Am to unlock F Major!",
                modeFocus: "both",
                skills: ["C4–G4 Pentascale", "Am → F One-Finger Add", "F Major (2010)"],
                keySignature: "C", bpm: 76, backingStyle: "warm_pad",
                chords: ["C", "F", "C", "F", "Am", "F", "C", "C"],
                strumPattern: "half_44", combinedStrumPattern: "half_44",
                p1Title: "Lower Neck Steps (C–G)", p1Subtitle: "C4, D4, E4, F4, G4 stepwise picking in 1st position",
                p2Title: "C to F Smooth Pivot", p2Subtitle: "Warm half-note strums linking C, Am, and F Major",
                p3Title: "Meadow Walk in C & F", p3Subtitle: "Pentascale melody over C, Am, and F chord changes",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 67]],
                    [[0, 1, 65], [1, 1, 65], [2, 2, 69]],
                    [[0, 1, 67], [1, 1, 64], [2, 1, 62], [3, 1, 60]],
                    [[0, 2, 65], [2, 2, 64]],
                    [[0, 1, 69], [1, 1, 67], [2, 1, 64], [3, 1, 60]],
                    [[0, 1, 65], [1, 1, 69], [2, 2, 65]],
                    [[0, 1, 64], [1, 1, 62], [2, 1, 64], [3, 1, 67]],
                    [[0, 4, 60]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 2, order: 2, xpBase: 70,
                title: "Full C Major Scale & G7 Triangle (0212)",
                description: "Complete the full octave up to C5 (with B4 on A-string fret 2) and keep Index anchored on E-fret 1 from F to G7.",
                modeFocus: "both",
                skills: ["Full Octave C4–C5 Scale", "G7 (0212) Triangle", "F → G7 Index Anchor"],
                keySignature: "C", bpm: 80, backingStyle: "acoustic_pop",
                chords: ["C", "F", "G7", "C", "C", "F", "G7", "C"],
                strumPattern: "quarter_44", combinedStrumPattern: "half_44",
                p1Title: "Octave Climb (C4–C5)", p1Subtitle: "Ascending & descending C Major scale across C, E, and A strings",
                p2Title: "F to G7 Pivot Drill", p2Subtitle: "Primary I–IV–V7–I strums anchoring Index on E-string fret 1",
                p3Title: "Harbor Bells in C", p3Subtitle: "Full-octave C Major melody over C–F–G7–C harmony",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65]],
                    [[0, 1, 69], [1, 1, 65], [2, 2, 69]],
                    [[0, 1, 71], [1, 1, 69], [2, 1, 67], [3, 1, 65]],
                    [[0, 2, 64], [2, 2, 72]],
                    [[0, 1, 72], [1, 1, 71], [2, 1, 69], [3, 1, 67]],
                    [[0, 1, 65], [1, 1, 69], [2, 2, 72]],
                    [[0, 1, 71], [1, 1, 67], [2, 1, 65], [3, 1, 62]],
                    [[0, 4, 60]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 2, order: 3, xpBase: 75,
                title: "Down-Up Strumming (D–D–D–DU)",
                description: "Add light, crisp up-strums on the '&' of beat 4 to bring folk energy to C–F–G7–Am progressions.",
                modeFocus: "chords",
                skills: ["Relaxed Wrist Up-Strums", "D–D–D–DU Folk Pattern", "C–Am–F–G7 Turnaround"],
                keySignature: "C", bpm: 84, backingStyle: "acoustic_pop",
                chords: ["C", "Am", "F", "G7", "C", "Am", "F", "G7 → C"],
                strumPattern: "folk_du_44", combinedStrumPattern: "folk_du_44",
                p1Title: "Skipping Stones Melody", p1Subtitle: "Bouncy folk melody with 3rd skips & stepwise answers",
                p2Title: "Folk Down-Up Engine", p2Subtitle: "Crisp D–D–D–DU groove on the classic 50s turnaround",
                p3Title: "Boardwalk Singalong", p3Subtitle: "Combine singing folk melody with D–D–D–DU strums",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 64], [1, 1, 67], [2, 1, 72], [3, 1, 67]],
                    [[0, 1, 69], [1, 1, 64], [2, 2, 60]],
                    [[0, 1, 65], [1, 1, 69], [2, 1, 72], [3, 1, 69]],
                    [[0, 1, 71], [1, 1, 67], [2, 2, 62]],
                    [[0, 1, 64], [1, 1, 67], [2, 1, 72], [3, 1, 71]],
                    [[0, 1, 69], [1, 1, 67], [2, 2, 64]],
                    [[0, 1, 65], [1, 1, 69], [2, 1, 67], [3, 1, 65]],
                    [[0, 2, 62], [2, 2, 60]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 2, order: 4, xpBase: 80,
                title: "Level 2 Showcase: Campfire Waltz",
                description: "Step into graceful 3/4 waltz time combining C–F–G7–Am chords with a warm campfire melody.",
                modeFocus: "both",
                skills: ["3/4 Waltz Pulse", "D–D–U Waltz Strum", "Level 2 C–F–G7–Am Fluency"],
                keySignature: "C", bpm: 90, beatsPerMeasure: 3, timeSignature: [3, 4],
                backingStyle: "waltz_chamber",
                chords: ["C", "F", "G7", "C", "Am", "F", "G7", "C"],
                strumPattern: "waltz_34", combinedStrumPattern: "waltz_gentle_34",
                p1Title: "Lantern Light Waltz", p1Subtitle: "Flowing 3/4 melody spanning C4–C5",
                p2Title: "Campfire 3/4 Sway", p2Subtitle: "Lifted D–D–U waltz strumming on primary chords",
                p3Title: "Level 2 Capstone: Starlight Waltz", p3Subtitle: "Full 3/4 chord-melody campfire waltz",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 64], [1, 1, 67], [2, 1, 72]],
                    [[0, 2, 69], [2, 1, 65]],
                    [[0, 1, 67], [1, 1, 65], [2, 1, 62]],
                    [[0, 2, 64], [2, 1, 60]],
                    [[0, 1, 69], [1, 1, 72], [2, 1, 69]],
                    [[0, 2, 65], [2, 1, 69]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 62]],
                    [[0, 3, 60]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 3: Full G Major Chord, Island Strum (D-DU-UDU) & Folk Melodies
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 3,
        id: "uku_level_3",
        instrument: "ukulele",
        title: "Full G Major, Island Strum & Folk Melodies",
        subtitle: "Conquer the essential G Major (0232) shape, master the syncopated Island Strum (D–DU–UDU), and play in G Major",
        focusTags: ["G Major (0232)", "Island Strum", "C–G–Am–F Axis", "G Major Folk"],
        lessons: [
            createUkuleleLesson({
                level: 3, order: 1, xpBase: 80,
                title: "Mastering G Major (0232) & The 4-Chord Axis",
                description: "Build clean finger placement for G Major (0232) and chain the iconic C – G – Am – F progression effortlessly.",
                modeFocus: "chords",
                skills: ["G Major (0232) Shape", "C → G Ring-Finger Slide", "4-Chord Pop Axis"],
                keySignature: "C", bpm: 84, backingStyle: "acoustic_pop",
                chords: ["C", "G", "Am", "F", "C", "G", "F", "C"],
                strumPattern: "folk_du_44", combinedStrumPattern: "half_44",
                p1Title: "Four-Chord Anthem Lead", p1Subtitle: "Memorable pop-folk melody across C, G, Am, and F",
                p2Title: "C–G–Am–F Axis Builder", p2Subtitle: "Clean C → G transitions with zero pause on beat 1",
                p3Title: "Pacific Coast Anthem", p3Subtitle: "Unite the singing pop melody with the 4-chord axis",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 64], [1, 1, 67], [2, 1, 72], [3, 1, 71]],
                    [[0, 1, 71], [1, 1, 67], [2, 2, 62]],
                    [[0, 1, 64], [1, 1, 69], [2, 1, 72], [3, 1, 69]],
                    [[0, 2, 65], [2, 2, 69]],
                    [[0, 1, 67], [1, 1, 72], [2, 1, 74], [3, 1, 72]],
                    [[0, 1, 71], [1, 1, 69], [2, 2, 67]],
                    [[0, 1, 65], [1, 1, 64], [2, 1, 62], [3, 1, 65]],
                    [[0, 4, 64]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 3, order: 2, xpBase: 85,
                title: "The Iconic Island Strum (D – D U – U D U)",
                description: "Unlock the most famous ukulele groove in the world: keep your strumming hand swinging steadily while skipping beat 3's down-stroke!",
                modeFocus: "chords",
                skills: ["Syncopated Air-Strum", "D–DU–UDU Island Groove", "Steady Pendulum Arm"],
                keySignature: "C", bpm: 88, backingStyle: "acoustic_pop",
                chords: ["C", "G", "Am", "F", "C", "G", "Am", "C"],
                strumPattern: "island_44", combinedStrumPattern: "island_44",
                p1Title: "Syncopated Wave Line", p1Subtitle: "Off-beat melody phrasing matching the Island Strum lilt",
                p2Title: "Island Strum Mastery", p2Subtitle: "Authentic D–DU–UDU syncopation across C–G–Am–F",
                p3Title: "Waikiki Afternoon", p3Subtitle: "Full Island Strum groove paired with sunlit top-line melody",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1.5, 67], [1.5, 1, 72], [2.5, 0.5, 72], [3, 1, 67]],
                    [[0, 1.5, 71], [1.5, 1, 74], [2.5, 0.5, 71], [3, 1, 67]],
                    [[0, 1.5, 69], [1.5, 1, 72], [2.5, 0.5, 69], [3, 1, 64]],
                    [[0, 1.5, 65], [1.5, 1, 69], [2.5, 0.5, 65], [3, 1, 64]],
                    [[0, 1, 67], [1, 1, 72], [2, 1, 74], [3, 1, 72]],
                    [[0, 1.5, 71], [1.5, 1, 67], [2.5, 1.5, 62]],
                    [[0, 1, 69], [1, 1, 72], [2, 1, 71], [3, 1, 69]],
                    [[0, 4, 72]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 3, order: 3, xpBase: 90,
                title: "Key of G Major (F#4) & Folk Picking",
                description: "Explore the bright Key of G Major introducing F#4 (E-string fret 2) and D7 (2223) over classic folk changes.",
                modeFocus: "solo",
                skills: ["G Major Scale (F#4)", "D7 (2223) Dominant", "G–C–D7 Folk Picking"],
                keySignature: "G", bpm: 92, backingStyle: "acoustic_pop",
                chords: ["G", "C", "G", "D7", "G", "C", "D7", "G"],
                strumPattern: "folk_du_44", combinedStrumPattern: "half_44",
                p1Title: "Highland Folk Air", p1Subtitle: "Crisp G Major melody highlighting F#4 and D5",
                p2Title: "G–C–D7 Folk Drive", p2Subtitle: "Lively folk strumming in the Key of G Major",
                p3Title: "Emerald Valley Reel", p3Subtitle: "Combine F#4 folk picking with G–C–D7 strums",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 67], [1, 0.5, 69], [1.5, 0.5, 71], [2, 1, 74], [3, 1, 71]],
                    [[0, 1, 72], [1, 1, 71], [2, 2, 67]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 74], [3, 1, 71]],
                    [[0, 1, 69], [1, 1, 66], [2, 2, 62]],
                    [[0, 1, 67], [1, 0.5, 69], [1.5, 0.5, 71], [2, 1, 74], [3, 1, 76]],
                    [[0, 1, 72], [1, 1, 71], [2, 2, 69]],
                    [[0, 1, 74], [1, 1, 72], [2, 1, 71], [3, 1, 66]],
                    [[0, 4, 67]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 3, order: 4, xpBase: 95,
                title: "Level 3 Showcase: Tradewind Folk Suite",
                description: "Bring together G Major, Island Strum syncopation, and lyrical 8th-note folk runs in one complete piece.",
                modeFocus: "both",
                skills: ["Island Strum in G Major", "8th-Note Passing Tones", "Level 3 Folk Performance"],
                keySignature: "G", bpm: 96, backingStyle: "acoustic_pop",
                chords: ["G", "D7", "Em", "C", "G", "C", "D7", "G"],
                strumPattern: "island_44", combinedStrumPattern: "island_44",
                p1Title: "Tradewind Songbird", p1Subtitle: "Soaring folk melody from D4 to E5",
                p2Title: "G-Major Island Groove", p2Subtitle: "Confident Island Strum across G, D7, Em, and C",
                p3Title: "Level 3 Capstone: Harbor Song", p3Subtitle: "Complete Level 3 folk chord-melody capstone",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 71], [1, 0.5, 74], [1.5, 1, 74], [2.5, 0.5, 71], [3, 1, 67]],
                    [[0, 1, 69], [1, 0.5, 72], [1.5, 1, 69], [2.5, 1.5, 66]],
                    [[0, 1, 67], [1, 0.5, 71], [1.5, 1, 76], [2.5, 0.5, 74], [3, 1, 71]],
                    [[0, 1.5, 72], [1.5, 1, 67], [2.5, 1.5, 64]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 74], [3, 1, 71]],
                    [[0, 1, 72], [1, 1, 76], [2, 2, 72]],
                    [[0, 1, 74], [1, 1, 71], [2, 1, 69], [3, 1, 66]],
                    [[0, 4, 67]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 4: Minor Keys (Am, Dm, Em), Syncopated Picking & Pop Progressions
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 4,
        id: "uku_level_4",
        instrument: "ukulele",
        title: "Minor Keys, Syncopated Picking & Pop Grooves",
        subtitle: "Add soulful Dm (2210) and Em (0432) shapes, expressive minor melodies, and syncopated pop strumming",
        focusTags: ["Dm (2210) & Em (0432)", "Natural Minor", "Syncopated Picking", "Pop Progressions"],
        lessons: [
            createUkuleleLesson({
                level: 4, order: 1, xpBase: 95,
                title: "D Minor (2210) & Natural A Minor",
                description: "Stack Ring beneath Middle from F (2010) to form Dm (2210) and craft expressive A Minor melodies.",
                modeFocus: "both",
                skills: ["F → Dm Ring Tuck", "Dm (2210) Shape", "A Natural Minor Scale"],
                keySignature: "Am", bpm: 84, backingStyle: "warm_pad",
                chords: ["Am", "Dm", "G", "C", "Am", "Dm", "E7", "Am"],
                strumPattern: "folk_du_44", combinedStrumPattern: "half_44",
                p1Title: "Twilight in A Minor", p1Subtitle: "Cantabile A Minor phrases with expressive G#4 leading tone",
                p2Title: "Am–Dm–E7 Minor Cadence", p2Subtitle: "Fluid minor-key strumming with F-to-Dm finger economy",
                p3Title: "Autumn Cove Ballad", p3Subtitle: "Expressive minor melody over Am–Dm–G–C–E7 harmony",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 69], [1, 1, 72], [2, 1, 71], [3, 1, 69]],
                    [[0, 1, 65], [1, 1, 69], [2, 2, 74]],
                    [[0, 1, 71], [1, 1, 67], [2, 1, 69], [3, 1, 71]],
                    [[0, 2, 72], [2, 2, 67]],
                    [[0, 1, 69], [1, 1, 72], [2, 1, 76], [3, 1, 72]],
                    [[0, 1, 74], [1, 1, 69], [2, 2, 65]],
                    [[0, 1, 64], [1, 1, 68], [2, 1, 71], [3, 1, 68]],
                    [[0, 4, 69]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 4, order: 2, xpBase: 100,
                title: "The Em Staircase (0432) & G–Em–C–D",
                description: "Master the diagonal Em staircase (Index A-2, Middle E-3, Ring C-4) and play modern pop progressions smoothly.",
                modeFocus: "chords",
                skills: ["Em (0432) Diagonal Grip", "G → Em Pivot", "G–Em–C–D Pop Loop"],
                keySignature: "G", bpm: 90, backingStyle: "acoustic_pop",
                chords: ["G", "Em", "C", "D", "G", "Em", "C", "D → G"],
                strumPattern: "island_44", combinedStrumPattern: "pop_sync_44",
                p1Title: "Staircase Echoes", p1Subtitle: "Modern acoustic-pop hook dancing across G and Em",
                p2Title: "G–Em–C–D Pop Changes", p2Subtitle: "Zero-hesitation transitions into the Em (0432) staircase",
                p3Title: "City Lights in G", p3Subtitle: "Full pop chord-melody over G–Em–C–D",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1.5, 71], [1.5, 1, 74], [2.5, 0.5, 71], [3, 1, 67]],
                    [[0, 1.5, 71], [1.5, 1, 76], [2.5, 0.5, 74], [3, 1, 71]],
                    [[0, 1.5, 72], [1.5, 1, 76], [2.5, 0.5, 72], [3, 1, 67]],
                    [[0, 1, 69], [1, 1, 74], [2, 2, 66]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 74], [3, 1, 76]],
                    [[0, 1, 76], [1, 1, 74], [2, 2, 71]],
                    [[0, 1, 72], [1, 1, 71], [2, 1, 69], [3, 1, 67]],
                    [[0, 2, 66], [2, 2, 67]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 4, order: 3, xpBase: 105,
                title: "Syncopated 8th-Note Picking & Dotted Grooves",
                description: "Anticipate the beat with crisp dotted-quarter + 8th picking and syncopated pop strumming in E Minor.",
                modeFocus: "solo",
                skills: ["Dotted-Quarter + 8th", "Upbeat Anticipation", "E Minor Phrasing"],
                keySignature: "Em", bpm: 96, backingStyle: "cinematic_pulse",
                chords: ["Em", "C", "G", "D", "Em", "C", "Am", "Em"],
                strumPattern: "pop_sync_44", combinedStrumPattern: "pop_sync_44",
                p1Title: "Midnight Runner Riff", p1Subtitle: "Syncopated 8th-note lead line in E Minor",
                p2Title: "Anticipated Pop Groove", p2Subtitle: "Syncopated D – U – U D comping on Em–C–G–D",
                p3Title: "Neon Horizon", p3Subtitle: "Interlock syncopated Em lead lines with driving strums",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1.5, 64], [1.5, 0.5, 67], [2, 1, 71], [3, 0.5, 69], [3.5, 0.5, 67]],
                    [[0, 1.5, 64], [1.5, 0.5, 67], [2, 2, 72]],
                    [[0, 1.5, 74], [1.5, 0.5, 71], [2, 1, 67], [3, 1, 71]],
                    [[0, 1.5, 69], [1.5, 0.5, 66], [2, 2, 62]],
                    [[0, 0.5, 64], [0.5, 0.5, 67], [1, 0.5, 71], [1.5, 1, 76], [2.5, 0.5, 74], [3, 1, 71]],
                    [[0, 1.5, 72], [1.5, 0.5, 71], [2, 2, 67]],
                    [[0, 1.5, 69], [1.5, 0.5, 72], [2, 1, 71], [3, 1, 69]],
                    [[0, 4, 64]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 4, order: 4, xpBase: 110,
                title: "Level 4 Showcase: Minor Pop Anthem",
                description: "Command Am–F–C–G and Dm–Em color shifts with confident syncopation and crisp right-hand articulation.",
                modeFocus: "both",
                skills: ["Am–F–C–G Pop Axis", "Syncopated Melodic Hooks", "Level 4 Minor Mastery"],
                keySignature: "Am", bpm: 100, backingStyle: "acoustic_pop",
                chords: ["Am", "F", "C", "G", "Dm", "Am", "Em", "Am"],
                strumPattern: "island_44", combinedStrumPattern: "pop_sync_44",
                p1Title: "Driftwood Ballad Lead", p1Subtitle: "Expressive minor pop melody across frets 0–5",
                p2Title: "Dynamic Pop Strumming", p2Subtitle: "Energetic Island Strum across all 6 primary diatonic chords",
                p3Title: "Level 4 Capstone: Sea Glass", p3Subtitle: "Full minor pop chord-melody performance",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 69], [1, 0.5, 72], [1.5, 1, 76], [2.5, 0.5, 72], [3, 1, 69]],
                    [[0, 1.5, 69], [1.5, 0.5, 65], [2, 2, 72]],
                    [[0, 1, 72], [1, 0.5, 74], [1.5, 1, 76], [2.5, 0.5, 74], [3, 1, 72]],
                    [[0, 1.5, 71], [1.5, 0.5, 67], [2, 2, 74]],
                    [[0, 1, 74], [1, 0.5, 72], [1.5, 1, 69], [2.5, 0.5, 65], [3, 1, 69]],
                    [[0, 1.5, 72], [1.5, 0.5, 69], [2, 2, 64]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 74], [3, 1, 71]],
                    [[0, 4, 69]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 5: G & D Major Positions (D, Bm, Em, A7) & Arpeggio Fingerpicking
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 5,
        id: "uku_level_5",
        instrument: "ukulele",
        title: "D Major Position, Bm Barre & Fingerpicking",
        subtitle: "Unlock D Major (2220), A7 (0100), your first partial barre Bm (4222), and T–I–M–A rolling arpeggios",
        focusTags: ["D (2220) & A7", "Bm (4222) Barre", "T–I–M–A Arpeggios", "6/8 Ballads"],
        lessons: [
            createUkuleleLesson({
                level: 5, order: 1, xpBase: 110,
                title: "Key of D Major: D (2220), A7 & G",
                description: "Stack three fingers neatly on fret 2 for D Major, read F# & C# cleanly, and groove in bright D Major.",
                modeFocus: "both",
                skills: ["D Major (2220) Stack", "A7 (0100) Dominant", "D Major Scale (F#, C#)"],
                keySignature: "D", bpm: 92, backingStyle: "acoustic_pop",
                chords: ["D", "G", "A7", "D", "D", "G", "A", "D"],
                strumPattern: "folk_du_44", combinedStrumPattern: "half_44",
                p1Title: "Sunbeam in D Major", p1Subtitle: "Bright D Major melody using F#4 and C#5",
                p2Title: "D–G–A7 Bright Strums", p2Subtitle: "Effortless switches among D, G, A, and A7",
                p3Title: "Golden Meadow in D", p3Subtitle: "Combine D Major picking with bright chord strums",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 62], [1, 1, 66], [2, 1, 69], [3, 1, 74]],
                    [[0, 1, 71], [1, 1, 74], [2, 2, 67]],
                    [[0, 1, 69], [1, 1, 73], [2, 1, 76], [3, 1, 73]],
                    [[0, 2, 74], [2, 2, 69]],
                    [[0, 1, 74], [1, 0.5, 76], [1.5, 0.5, 74], [2, 1, 73], [3, 1, 69]],
                    [[0, 1, 71], [1, 1, 67], [2, 2, 74]],
                    [[0, 1, 73], [1, 1, 76], [2, 1, 73], [3, 1, 69]],
                    [[0, 4, 74]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 5, order: 2, xpBase: 115,
                title: "First Partial Barre: Bm (4222) & Canon Progression",
                description: "Lay your Index finger flat across C–E–A at fret 2 with Ring on G-fret 4 to nail Bm (4222) cleanly.",
                modeFocus: "chords",
                skills: ["Bm (4222) Partial Barre", "D–A–Bm–G Canon Loop", "Clean Barre Pressure"],
                keySignature: "D", bpm: 88, backingStyle: "classical_strings",
                chords: ["D", "A", "Bm", "F#m", "G", "D", "G", "A → D"],
                strumPattern: "half_44", combinedStrumPattern: "half_44",
                p1Title: "Canon Countermelody", p1Subtitle: "Descending baroque line in D Major over Bm & F#m",
                p2Title: "Bm Barre Fluency", p2Subtitle: "Resonant half-note strums mastering Bm and F#m",
                p3Title: "Pachelbel Ukulele Suite", p3Subtitle: "Baroque melody paired with full D–A–Bm–F#m–G chords",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 2, 78], [2, 2, 74]],
                    [[0, 2, 76], [2, 2, 73]],
                    [[0, 2, 74], [2, 2, 71]],
                    [[0, 2, 73], [2, 2, 69]],
                    [[0, 1, 71], [1, 1, 74], [2, 2, 71]],
                    [[0, 1, 69], [1, 1, 74], [2, 2, 66]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 74], [3, 1, 71]],
                    [[0, 2, 73], [2, 2, 74]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 5, order: 3, xpBase: 120,
                title: "T–I–M–A Fingerpicking Arpeggios",
                description: "Assign one right-hand finger per string (Thumb=G, Index=C, Middle=E, Ring=A) for flowing harp-like arpeggios!",
                modeFocus: "solo",
                skills: ["4-Finger PIMA Picking", "Rolling G–C–E–A Arpeggios", "Sustain & Let-Ring Control"],
                keySignature: "G", bpm: 92, backingStyle: "classical_strings",
                chords: ["G", "Em", "C", "D", "G", "Em", "Am", "D → G"],
                strumPattern: "half_44", combinedStrumPattern: "whole_44",
                p1Title: "Rolling Glass Arpeggios", p1Subtitle: "8th-note G–C–E–A–E–C–E–A rolling fingerpicking",
                p2Title: "Warm Chord Cushion", p2Subtitle: "Sustained half-note strums outlining the arpeggio harmony",
                p3Title: "Harp of the Islands", p3Subtitle: "Arpeggiated picking layered over resonant whole-note strums",
                buildSoloNotes: (bpm, bpmM, ch) =>
                    buildChordArpeggioNotes(ch, bpm, bpmM, [3, 2, 1, 0, 1, 2, 1, 0], 0.5, "melody")
            }),
            createUkuleleLesson({
                level: 5, order: 4, xpBase: 125,
                title: "Level 5 Showcase: 6/8 Falling-in-Love Ballad",
                description: "Sway in lyrical 6/8 compound time combining D, F#m, Bm, Em, G, and A7 with tender arpeggio phrasing.",
                modeFocus: "both",
                skills: ["6/8 Compound Ballad Sway", "D–F#m–Bm–G–A7 Flow", "Level 5 Fingerpicking"],
                keySignature: "D", bpm: 66, beatsPerMeasure: 2, timeSignature: [6, 8],
                backingStyle: "warm_pad",
                chords: ["D", "F#m", "Bm", "G", "D", "A7", "G", "D"],
                strumPattern: "ballad_68_lilt", combinedStrumPattern: "ballad_68",
                p1Title: "Moonlit Pier 6/8 Air", p1Subtitle: "Singing 6/8 romantic melody across D Major",
                p2Title: "6/8 Ballad Sway", p2Subtitle: "Gentle compound down-up strumming across D–F#m–Bm–G",
                p3Title: "Level 5 Capstone: Harbor Romance", p3Subtitle: "Complete 6/8 chord-melody ballad in D Major",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 62], [1, 1, 69]],
                    [[0, 1, 66], [1, 1, 73]],
                    [[0, 1, 74], [1, 0.67, 71], [1.67, 0.33, 69]],
                    [[0, 1, 67], [1, 1, 71]],
                    [[0, 1, 66], [1, 0.67, 69], [1.67, 0.33, 74]],
                    [[0, 1, 73], [1, 1, 69]],
                    [[0, 0.67, 71], [0.67, 0.33, 74], [1, 1, 71]],
                    [[0, 2, 74]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 6: Movable Shapes, Bb / Partial Barres & 8th-Note Lead Lines
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 6,
        id: "uku_level_6",
        instrument: "ukulele",
        title: "Movable Shapes, Bb Barre & 8th-Note Leads",
        subtitle: "Master the essential Bb (3211) barre, movable neck shapes (Gm, Cm, E7), and agile 8th-note scalar lead lines",
        focusTags: ["Bb (3211) Barre", "Key of F Major", "Movable Shapes", "8th-Note Leads"],
        lessons: [
            createUkuleleLesson({
                level: 6, order: 1, xpBase: 125,
                title: "Key of F Major & the Bb Partial Barre (3211)",
                description: "Lock your Index tip across E & A fret 1 for crisp Bb (3211) tone and breeze through F–Bb–C7–Dm songs.",
                modeFocus: "chords",
                skills: ["Bb (3211) Two-String Barre", "Key of F Major (Bb4)", "F–Bb–C7–Dm Fluency"],
                keySignature: "F", bpm: 92, backingStyle: "acoustic_pop",
                chords: ["F", "Bb", "C7", "F", "Dm", "Bb", "C7", "F"],
                strumPattern: "island_44", combinedStrumPattern: "half_44",
                p1Title: "F-Major Sunlit Line", p1Subtitle: "Fluid melody in F Major introducing Bb4 cleanly",
                p2Title: "Bb Partial Barre Groove", p2Subtitle: "Confident Island Strum through F, Bb, Dm, and C7",
                p3Title: "Orchard Breeze in F", p3Subtitle: "Full F-Major chord-melody with clean Bb barres",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 65], [1, 0.5, 67], [1.5, 0.5, 69], [2, 1, 72], [3, 1, 69]],
                    [[0, 1, 70], [1, 1, 74], [2, 2, 70]],
                    [[0, 1, 72], [1, 0.5, 70], [1.5, 0.5, 69], [2, 2, 67]],
                    [[0, 2, 65], [2, 2, 69]],
                    [[0, 1, 74], [1, 1, 72], [2, 1, 69], [3, 1, 65]],
                    [[0, 1, 70], [1, 1, 74], [2, 2, 77]],
                    [[0, 1, 76], [1, 1, 72], [2, 1, 70], [3, 1, 67]],
                    [[0, 4, 65]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 6, order: 2, xpBase: 130,
                title: "Movable Neck Shapes: Gm, Cm & Eb",
                description: "See how familiar open shapes become movable chord families up the neck across Gm (0231), Cm (0333), and Eb (0331).",
                modeFocus: "chords",
                skills: ["Gm (0231) & Cm (0333)", "Eb (0331) Movable Shape", "Minor-Key Modulations"],
                keySignature: "Dm", bpm: 94, backingStyle: "cinematic_pulse",
                chords: ["Dm", "Gm", "C", "F", "Bb", "Gm", "A7", "Dm"],
                strumPattern: "pop_sync_44", combinedStrumPattern: "half_44",
                p1Title: "Circle of Fifths Line", p1Subtitle: "Expressive D Minor melody gliding across Bb and C#",
                p2Title: "Movable Shape Workout", p2Subtitle: "Fluid transitions through Dm, Gm, Bb, F, and A7",
                p3Title: "Compass Rose in Dm", p3Subtitle: "Combine melodic lines with movable minor & flat chords",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 69], [1, 0.5, 70], [1.5, 0.5, 69], [2, 1, 65], [3, 1, 62]],
                    [[0, 1, 67], [1, 1, 70], [2, 2, 74]],
                    [[0, 1, 72], [1, 0.5, 74], [1.5, 0.5, 72], [2, 2, 67]],
                    [[0, 1, 69], [1, 1, 72], [2, 2, 65]],
                    [[0, 1, 70], [1, 1, 74], [2, 1, 77], [3, 1, 74]],
                    [[0, 1, 70], [1, 1, 67], [2, 2, 74]],
                    [[0, 1, 73], [1, 1, 69], [2, 1, 67], [3, 1, 64]],
                    [[0, 4, 62]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 6, order: 3, xpBase: 135,
                title: "Agile 8th-Note Scalar Lead Lines (Frets 1–7)",
                description: "Shift cleanly from 1st position into 5th position with fluid 8th-note scalar runs and crisp picking alternate flow.",
                modeFocus: "solo",
                skills: ["Continuous 8th-Note Runs", "1st → 5th Position Shift", "Pinky Fret-7 Reach"],
                keySignature: "C", bpm: 102, backingStyle: "acoustic_pop",
                chords: ["C", "G", "Am", "Em", "F", "C", "Dm", "G → C"],
                strumPattern: "driving_rock_44", combinedStrumPattern: "half_44",
                p1Title: "Cascade 8th-Note Etude", p1Subtitle: "Flowing 8th-note scalar runs rising cleanly up to E5 (fret 7)",
                p2Title: "Driving Pop-Rock Comp", p2Subtitle: "Energetic 8th-note down-up strumming groove",
                p3Title: "Coastal Highway Lead", p3Subtitle: "8th-note lead lines soaring over driving chord changes",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 0.5, 60], [0.5, 0.5, 62], [1, 0.5, 64], [1.5, 0.5, 65], [2, 0.5, 67], [2.5, 0.5, 69], [3, 1, 72]],
                    [[0, 0.5, 71], [0.5, 0.5, 74], [1, 0.5, 71], [1.5, 0.5, 67], [2, 1, 74], [3, 1, 71]],
                    [[0, 0.5, 69], [0.5, 0.5, 71], [1, 0.5, 72], [1.5, 0.5, 74], [2, 1, 76], [3, 1, 72]],
                    [[0, 0.5, 76], [0.5, 0.5, 74], [1, 0.5, 71], [1.5, 0.5, 67], [2, 2, 71]],
                    [[0, 0.5, 69], [0.5, 0.5, 72], [1, 0.5, 74], [1.5, 0.5, 77], [2, 1, 76], [3, 1, 72]],
                    [[0, 0.5, 72], [0.5, 0.5, 71], [1, 0.5, 69], [1.5, 0.5, 67], [2, 2, 64]],
                    [[0, 0.5, 62], [0.5, 0.5, 65], [1, 0.5, 69], [1.5, 0.5, 74], [2, 1, 72], [3, 1, 69]],
                    [[0, 1, 71], [1, 1, 74], [2, 2, 72]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 6, order: 4, xpBase: 140,
                title: "Level 6 Showcase: Pacific Pop-Rock",
                description: "Fuse Bb barres, movable Gm shapes, and energetic 8th-note scalar solos in a bright F-Major showcase.",
                modeFocus: "both",
                skills: ["F–Gm–Bb–C7 Fluency", "8th-Note Lead & Riffing", "Level 6 Barre Mastery"],
                keySignature: "F", bpm: 104, backingStyle: "acoustic_pop",
                chords: ["F", "Gm", "Bb", "C", "Dm", "Bb", "C7", "F"],
                strumPattern: "driving_rock_44", combinedStrumPattern: "pop_sync_44",
                p1Title: "Breakwater Solo", p1Subtitle: "Driving 8th-note F-Major lead ascending to F5 (fret 8)",
                p2Title: "Pacific Pop-Rock Strum", p2Subtitle: "Tight 8th-note down-up groove through F, Gm, and Bb",
                p3Title: "Level 6 Capstone: Golden Gate", p3Subtitle: "Complete Level 6 chord-melody showcase",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 0.5, 65], [0.5, 0.5, 69], [1, 0.5, 72], [1.5, 0.5, 74], [2, 1, 72], [3, 1, 69]],
                    [[0, 0.5, 67], [0.5, 0.5, 70], [1, 0.5, 74], [1.5, 0.5, 72], [2, 2, 70]],
                    [[0, 0.5, 70], [0.5, 0.5, 74], [1, 0.5, 77], [1.5, 0.5, 74], [2, 1, 70], [3, 1, 74]],
                    [[0, 1, 76], [1, 0.5, 74], [1.5, 0.5, 72], [2, 2, 67]],
                    [[0, 0.5, 69], [0.5, 0.5, 72], [1, 0.5, 74], [1.5, 0.5, 77], [2, 1, 74], [3, 1, 72]],
                    [[0, 1, 70], [1, 1, 74], [2, 1, 77], [3, 1, 74]],
                    [[0, 0.5, 76], [0.5, 0.5, 74], [1, 0.5, 72], [1.5, 0.5, 70], [2, 1, 69], [3, 1, 67]],
                    [[0, 4, 65]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 7: 7th Chords, Blues & Jazzy Voicings (Cmaj7, Am7, Dm7, G7, E7)
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 7,
        id: "uku_level_7",
        instrument: "ukulele",
        title: "7th Chords, Blues & Jazzy Voicings",
        subtitle: "Add lush Cmaj7, Am7, Dm7, Fmaj7, and E7 colors, swing ii7–V7–Imaj7 jazz comping, and play 12-Bar Ukulele Blues",
        focusTags: ["Cmaj7 · Am7 · Dm7", "ii7–V7–Imaj7 Jazz", "12-Bar Blues", "Blue-Note Soloing"],
        lessons: [
            createUkuleleLesson({
                level: 7, order: 1, xpBase: 140,
                title: "Lush Major & Minor 7ths (Cmaj7 · Am7 · Dm7)",
                description: "Discover how effortlessly open-string 7th voicings bloom on ukulele: Cmaj7 (0002), Am7 (0000), Dm7 (2213), and Fmaj7 (2413).",
                modeFocus: "chords",
                skills: ["Cmaj7 & Am7 Open Colors", "Dm7 (2213) & Fmaj7", "Jazz Four-to-the-Bar Comp"],
                keySignature: "C", bpm: 88, backingStyle: "jazz_brushes",
                chords: ["Cmaj7", "Am7", "Dm7", "G7", "Cmaj7", "Fmaj7", "Dm7", "G7 → Cmaj7"],
                strumPattern: "jazz_four_44", combinedStrumPattern: "half_44",
                p1Title: "Velvet 7th Guide-Tones", p1Subtitle: "Silky jazz melody weaving through 3rds and 7ths",
                p2Title: "Lounge 7th Comping", p2Subtitle: "Warm four-to-the-bar jazz comping on Cmaj7–Am7–Dm7–G7",
                p3Title: "Espresso Café in Cmaj7", p3Subtitle: "Full jazz chord-melody over lush 7th voicings",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 71], [1, 1, 72], [2, 1, 76], [3, 1, 71]],
                    [[0, 1, 72], [1, 1, 69], [2, 2, 67]],
                    [[0, 1, 65], [1, 1, 69], [2, 1, 72], [3, 1, 74]],
                    [[0, 1, 71], [1, 1, 69], [2, 2, 65]],
                    [[0, 1, 64], [1, 1, 67], [2, 1, 71], [3, 1, 76]],
                    [[0, 1, 76], [1, 1, 72], [2, 2, 69]],
                    [[0, 1, 72], [1, 1, 69], [2, 1, 65], [3, 1, 62]],
                    [[0, 2, 65], [2, 2, 64]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 7, order: 2, xpBase: 145,
                title: "Dominant 7th Turnarounds (E7 · A7 · D7 · G7)",
                description: "Drive classic Tin Pan Alley & Hawaiian swing turnarounds around the circle of 7th chords: C6 – E7 – A7 – D7 – G7!",
                modeFocus: "chords",
                skills: ["E7 (1202) & D7 (2223)", "Circle-of-5ths Swing", "Chromatic Approach Tones"],
                keySignature: "C", bpm: 96, backingStyle: "jazz_brushes",
                chords: ["Cmaj7", "E7", "A7", "D7", "Dm7", "G7", "C6", "G7 → Cmaj7"],
                strumPattern: "jazz_four_44", combinedStrumPattern: "jazz_four_44",
                p1Title: "Tin Pan Alley Line", p1Subtitle: "Chromatic guide-tone melody tracing G# → G → F# → F → E",
                p2Title: "Ragtime 7th Turnaround", p2Subtitle: "Crisp swing comping through E7, A7, D7, and G7",
                p3Title: "Honolulu Swing Street", p3Subtitle: "Combine swinging guide-tones with circle-of-5ths chords",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 76], [1, 1, 72], [2, 1, 71], [3, 1, 67]],
                    [[0, 1, 68], [1, 1, 71], [2, 2, 74]],
                    [[0, 1, 73], [1, 1, 69], [2, 2, 67]],
                    [[0, 1, 66], [1, 1, 69], [2, 1, 72], [3, 1, 74]],
                    [[0, 1, 72], [1, 1, 69], [2, 2, 65]],
                    [[0, 1, 71], [1, 1, 67], [2, 2, 65]],
                    [[0, 1, 64], [1, 1, 67], [2, 1, 69], [3, 1, 72]],
                    [[0, 2, 71], [2, 2, 72]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 7, order: 3, xpBase: 150,
                title: "12-Bar Ukulele Blues & Minor Pentatonic Solo",
                description: "Dig into an authentic 12-bar ukulele blues in C (`C7 – F7 – G7`) with gritty minor-pentatonic blue notes (`Eb`, `Gb`, `Bb`)!",
                modeFocus: "solo",
                skills: ["12-Bar Blues Form", "C7 · F7 (2313) · G7", "Blue-Note Pentatonic Licks"],
                keySignature: "C", bpm: 94, backingStyle: "jazz_brushes",
                chords: ["C7", "C7", "C7", "C7", "F7", "F7", "C7", "C7", "G7", "F7", "C7", "G7"],
                strumPattern: "blues_shuffle_44", combinedStrumPattern: "half_44",
                p1Title: "Blue-Note Ukulele Lick", p1Subtitle: "12-bar C minor pentatonic & b5 blues solo",
                p2Title: "12-Bar Shuffle Comp", p2Subtitle: "Swinging blues shuffle strumming across C7, F7, and G7",
                p3Title: "Delta Porch 12-Bar", p3Subtitle: "Full 12-bar blues solo paired with C7–F7–G7 harmony",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 60], [1, 0.5, 63], [1.5, 0.5, 65], [2, 1, 67], [3, 1, 70]],
                    [[0, 1, 72], [1, 0.5, 70], [1.5, 0.5, 67], [2, 2, 63]],
                    [[0, 1, 65], [1, 0.5, 66], [1.5, 0.5, 67], [2, 1, 70], [3, 1, 72]],
                    [[0, 1, 70], [1, 1, 67], [2, 2, 60]],
                    [[0, 1, 65], [1, 0.5, 69], [1.5, 0.5, 72], [2, 1, 75], [3, 1, 72]],
                    [[0, 1, 70], [1, 1, 69], [2, 2, 65]],
                    [[0, 1, 67], [1, 0.5, 66], [1.5, 0.5, 65], [2, 1, 63], [3, 1, 60]],
                    [[0, 1, 67], [1, 1, 70], [2, 2, 72]],
                    [[0, 1, 74], [1, 1, 71], [2, 1, 67], [3, 1, 65]],
                    [[0, 1, 72], [1, 1, 69], [2, 1, 65], [3, 1, 63]],
                    [[0, 1, 60], [1, 0.5, 63], [1.5, 0.5, 65], [2, 1, 67], [3, 1, 72]],
                    [[0, 1, 70], [1, 1, 67], [2, 2, 71]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 7, order: 4, xpBase: 155,
                title: "Level 7 Showcase: Midnight Jazz Lounge",
                description: "Perform a smooth ii7–V7–Imaj7 jazz ballad blending Am7, Dm7, G7, Em7, A7, and expressive 7th-chord improvisation.",
                modeFocus: "both",
                skills: ["Extended Jazz Turnarounds", "7th-Chord Voice Leading", "Level 7 Jazz Mastery"],
                keySignature: "C", bpm: 92, backingStyle: "jazz_brushes",
                chords: ["Dm7", "G7", "Cmaj7", "Am7", "Dm7", "G7", "Em7 → A7", "Dm7 → Cmaj7"],
                strumPattern: "jazz_four_44", combinedStrumPattern: "bossa_44",
                p1Title: "Velvet Moon Solo", p1Subtitle: "Lyrical jazz line outlining Dm7–G7–Cmaj7–Em7–A7",
                p2Title: "Jazz Brush Quartet", p2Subtitle: "Polished 4-beat comping across all Level 7 jazz voicings",
                p3Title: "Level 7 Capstone: Blue Note Terrace", p3Subtitle: "Full jazz chord-melody club showcase",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 65], [1, 0.5, 69], [1.5, 0.5, 72], [2, 1, 74], [3, 1, 72]],
                    [[0, 1, 71], [1, 0.5, 74], [1.5, 0.5, 77], [2, 1, 74], [3, 1, 71]],
                    [[0, 1.5, 76], [1.5, 0.5, 74], [2, 2, 71]],
                    [[0, 1, 72], [1, 0.5, 71], [1.5, 0.5, 69], [2, 2, 67]],
                    [[0, 1, 65], [1, 1, 69], [2, 1, 72], [3, 1, 76]],
                    [[0, 1, 74], [1, 1, 71], [2, 1, 69], [3, 1, 65]],
                    [[0, 1, 67], [1, 1, 71], [2, 1, 73], [3, 1, 76]],
                    [[0, 1, 74], [1, 1, 72], [2, 2, 76]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 8: Up-the-Neck Melody (Frets 5–12), Double-Stops & Campanella
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 8,
        id: "uku_level_8",
        instrument: "ukulele",
        title: "Up-the-Neck Melody, Double-Stops & Campanella",
        subtitle: "Explore the singing upper register (frets 5–12 up to A5), parallel 3rd/6th double-stops, and harp-like campanella",
        focusTags: ["Frets 5–12", "Double-Stops (3rds/6ths)", "Campanella Harp", "Upper Neck Clarity"],
        lessons: [
            createUkuleleLesson({
                level: 8, order: 1, xpBase: 160,
                title: "5th–7th Position Singing Melodies",
                description: "Break free of open position! Anchor your hand at fret 5 to unlock bell-like C5–G5 clarity on the E & A strings.",
                modeFocus: "solo",
                skills: ["5th-Position Box (Frets 5–8)", "Bell-Tone Upper Register", "Clean Position Anchor"],
                keySignature: "C", bpm: 92, backingStyle: "classical_strings",
                chords: ["C", "G", "Am", "F", "C", "Dm", "G7", "C"],
                strumPattern: "half_44", combinedStrumPattern: "whole_44",
                p1Title: "Fifth-Position Aria", p1Subtitle: "Singing C5–G5 melody anchored strictly in frets 5–10",
                p2Title: "Warm Chamber Support", p2Subtitle: "Sustained harmonic foundation beneath upper-neck solos",
                p3Title: "Cathedral Strings in C", p3Subtitle: "High-register melody floating over warm lower chords",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 72], [1, 1, 74], [2, 1, 76], [3, 1, 79]],
                    [[0, 1, 79], [1, 1, 76], [2, 2, 74]],
                    [[0, 1, 76], [1, 1, 72], [2, 1, 74], [3, 1, 76]],
                    [[0, 2, 77], [2, 2, 72]],
                    [[0, 1, 76], [1, 1, 79], [2, 1, 77], [3, 1, 76]],
                    [[0, 1, 74], [1, 1, 77], [2, 2, 74]],
                    [[0, 1, 76], [1, 1, 74], [2, 1, 71], [3, 1, 74]],
                    [[0, 4, 72]]
                ]), bpm, bpmM, { minFret: 5 })
            }),
            createUkuleleLesson({
                level: 8, order: 2, xpBase: 165,
                title: "Upper-Neck Mastery (Frets 7–12 to A5!)",
                description: "Climb all the way to the 12th-fret harmonic octave (A5 = MIDI 81) with crystal intonation in D Major.",
                modeFocus: "solo",
                skills: ["Frets 7–12 Navigation", "12th-Fret A5 Climax", "Compact Upper Fret Spacing"],
                keySignature: "D", bpm: 96, backingStyle: "cinematic_pulse",
                chords: ["D", "A", "Bm", "G", "D", "G", "A7", "D"],
                strumPattern: "pop_sync_44", combinedStrumPattern: "whole_44",
                p1Title: "Summit at Fret 12", p1Subtitle: "Soaring D Major solo peaking at A5 (A-string fret 12)",
                p2Title: "Cinematic D-Major Pulse", p2Subtitle: "Wide resonant chord groove supporting high leads",
                p3Title: "Volcano Ridge", p3Subtitle: "High-neck lead soaring over D–A–Bm–G harmony",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 74], [1, 1, 76], [2, 1, 78], [3, 1, 81]],
                    [[0, 1, 81], [1, 1, 79], [2, 2, 76]],
                    [[0, 1, 78], [1, 1, 74], [2, 1, 76], [3, 1, 78]],
                    [[0, 2, 79], [2, 2, 74]],
                    [[0, 1, 78], [1, 1, 81], [2, 1, 79], [3, 1, 78]],
                    [[0, 1, 79], [1, 1, 81], [2, 2, 79]],
                    [[0, 1, 78], [1, 1, 76], [2, 1, 73], [3, 1, 76]],
                    [[0, 4, 74]]
                ]), bpm, bpmM, { minFret: 5 })
            }),
            createUkuleleLesson({
                level: 8, order: 3, xpBase: 170,
                title: "Double-Stops: Hawaiian Parallel 3rds & 6ths",
                description: "Pinch two adjacent strings simultaneously (E & A strings) in luminous parallel 3rds and 6ths for lush Hawaiian harmony!",
                modeFocus: "both",
                skills: ["E & A Double-Stops", "Parallel 3rds & 6ths", "Two-Finger Simultaneous Pinch"],
                keySignature: "C", bpm: 90, backingStyle: "warm_pad",
                chords: ["C", "F", "G", "C", "Am", "F", "G7", "C"],
                strumPattern: "island_44", combinedStrumPattern: "half_44",
                p1Title: "Twin-String Luau Harmony", p1Subtitle: "Luminous E & A string parallel 3rd double-stops",
                p2Title: "Island Rhythm Cushion", p2Subtitle: "Relaxed Island Strum in C Major",
                p3Title: "Kona Coast Duet", p3Subtitle: "Double-stop harmony blended with supporting chord voices",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    // Parallel 3rds on E(1) & A(0) strings: (E:0,A:0)->(E:3,A:3)->(E:5,A:5)->(E:3,A:3)
                    [[0, 1, 1, 0], [0, 1, 0, 0], [1, 1, 1, 3, 2], [1, 1, 0, 3, 3], [2, 2, 1, 5, 1], [2, 2, 0, 5, 2]],
                    [[0, 1, 1, 5, 1], [0, 1, 0, 5, 2], [1, 1, 1, 1, 1], [1, 1, 0, 0], [2, 2, 1, 5, 1], [2, 2, 0, 5, 2]],
                    [[0, 1, 1, 3, 2], [0, 1, 0, 2, 1], [1, 1, 1, 7, 2], [1, 1, 0, 5, 1], [2, 2, 1, 3, 2], [2, 2, 0, 2, 1]],
                    [[0, 2, 1, 0], [0, 2, 0, 3, 3], [2, 2, 1, 3, 2], [2, 2, 0, 3, 3]],
                    [[0, 1, 1, 5, 1], [0, 1, 0, 3, 1], [1, 1, 1, 8, 2], [1, 1, 0, 7, 1], [2, 2, 1, 5, 2], [2, 2, 0, 3, 1]],
                    [[0, 1, 1, 5, 1], [0, 1, 0, 5, 2], [1, 1, 1, 8, 2], [1, 1, 0, 8, 3], [2, 2, 1, 5, 1], [2, 2, 0, 5, 2]],
                    [[0, 1, 1, 7, 2], [0, 1, 0, 5, 1], [1, 1, 1, 3, 2], [1, 1, 0, 2, 1], [2, 2, 1, 1, 1], [2, 2, 0, 2, 2]],
                    [[0, 4, 1, 0], [0, 4, 0, 3, 3]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 8, order: 4, xpBase: 175,
                title: "Level 8 Showcase: Campanella Fingerstyle",
                description: "Exploit High-G re-entrant tuning's superpower: play consecutive scale notes on DIFFERENT strings so every note rings into the next like a harp!",
                modeFocus: "solo",
                skills: ["Campanella Overlapping Ring", "High-G Re-Entrant Exploits", "Level 8 Fingerstyle"],
                keySignature: "C", bpm: 92, backingStyle: "classical_strings",
                chords: ["C", "G", "Am", "Em", "F", "C", "G7", "C"],
                strumPattern: "half_44", combinedStrumPattern: "whole_44",
                p1Title: "Campanella Bell Cascade", p1Subtitle: "Harp-like overlapping scale cascading across all 4 strings",
                p2Title: "Resonant Pedal Harmony", p2Subtitle: "Warm half-note chords anchoring the campanella bells",
                p3Title: "Level 8 Capstone: Glass Harp", p3Subtitle: "Full campanella fingerstyle showcase",
                buildSoloNotes: (bpm, bpmM) => buildExplicitTabNotes(barMap([
                    // True campanella C major cascade: C(2,0)-D(2,2)-E(1,0)-F(1,1)-G(3,0!)-A(0,0)-B(1,7)-C(0,3)
                    [[0, 0.5, 2, 0], [0.5, 0.5, 2, 2, 2], [1, 0.5, 1, 0], [1.5, 0.5, 1, 1, 1], [2, 0.5, 3, 0], [2.5, 0.5, 0, 0], [3, 1, 0, 3, 3]],
                    [[0, 0.5, 3, 0], [0.5, 0.5, 0, 2, 2], [1, 0.5, 1, 3, 3], [1.5, 0.5, 0, 5, 4], [2, 1, 0, 2, 1], [3, 1, 3, 0]],
                    [[0, 0.5, 0, 0], [0.5, 0.5, 1, 8, 3], [1, 0.5, 0, 3, 1], [1.5, 0.5, 3, 2, 1], [2, 1, 1, 0], [3, 1, 0, 0]],
                    [[0, 0.5, 1, 0], [0.5, 0.5, 3, 0], [1, 0.5, 0, 2, 2], [1.5, 0.5, 1, 3, 3], [2, 2, 0, 2, 2]],
                    [[0, 0.5, 1, 1, 1], [0.5, 0.5, 0, 0], [1, 0.5, 2, 5, 3], [1.5, 0.5, 0, 3, 1], [2, 1, 1, 1, 1], [3, 1, 0, 0]],
                    [[0, 0.5, 2, 0], [0.5, 0.5, 1, 0], [1, 0.5, 3, 0], [1.5, 0.5, 0, 3, 3], [2, 2, 1, 0]],
                    [[0, 0.5, 3, 0], [0.5, 0.5, 1, 1, 1], [1, 0.5, 0, 2, 2], [1.5, 0.5, 2, 2, 1], [2, 1, 3, 0], [3, 1, 1, 1, 1]],
                    [[0, 1, 2, 0], [1, 1, 1, 0], [2, 2, 0, 3, 3]]
                ]), bpm, bpmM)
            })
        ]
    },

    // ────────────────────────────────────────────────────────────────────────
    // LEVEL 9: Chord-Melody Mastery, Expressive Modulations & Concert Capstones
    // ────────────────────────────────────────────────────────────────────────
    {
        level: 9,
        id: "uku_level_9",
        instrument: "ukulele",
        title: "Chord-Melody Mastery & Concert Capstones",
        subtitle: "Arrange top-string chord-melody solo pieces, navigate secondary dominants & modulations, and command full concert repertoire",
        focusTags: ["Chord-Melody", "Modulations", "Bossa & Jazz Waltz", "Frets 0–12 Virtuoso"],
        lessons: [
            createUkuleleLesson({
                level: 9, order: 1, xpBase: 175,
                title: "Chord-Melody Arranging: Top-String Singing",
                description: "Carry a rich melody on the A-string while the G, C, and E strings bloom underneath in seamless chord-melody style.",
                modeFocus: "both",
                skills: ["Top-String Melody Voicing", "Cadd9 · Gmaj7 · Fmaj7", "Thumb-Sweep Chord-Melody"],
                keySignature: "C", bpm: 88, backingStyle: "warm_pad",
                chords: ["Cadd9", "Gmaj7", "Am7", "Fmaj7", "C", "G/B", "Dm7", "G7 → Cmaj7"],
                strumPattern: "half_44", combinedStrumPattern: "half_44",
                p1Title: "Singing Top-Line Theme", p1Subtitle: "Expressive A-string chord-melody top voice",
                p2Title: "Color Voicing Palette", p2Subtitle: "Shimmering Cadd9, Gmaj7, Fmaj7, and G/B voicings",
                p3Title: "Soloist's Lullaby", p3Subtitle: "True chord-melody weaving top-string lyricism over lush chords",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1, 74], [1, 1, 72], [2, 1, 76], [3, 1, 72]],
                    [[0, 1, 71], [1, 1, 74], [2, 2, 78]],
                    [[0, 1, 76], [1, 1, 72], [2, 1, 69], [3, 1, 72]],
                    [[0, 1, 76], [1, 1, 74], [2, 2, 72]],
                    [[0, 1, 72], [1, 1, 76], [2, 1, 79], [3, 1, 76]],
                    [[0, 1, 74], [1, 1, 71], [2, 2, 74]],
                    [[0, 1, 72], [1, 1, 69], [2, 1, 74], [3, 1, 72]],
                    [[0, 2, 71], [2, 2, 76]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 9, order: 2, xpBase: 180,
                title: "Secondary Dominants & Modulating Bridges",
                description: "Command expressive harmonic twists using C#7 → F#m and B7 → Em secondary dominants inspired by classic ballads.",
                modeFocus: "both",
                skills: ["C#7 (1112) & B7 (2322)", "Secondary Dominants", "Key-Center Modulation"],
                keySignature: "D", bpm: 72, beatsPerMeasure: 2, timeSignature: [6, 8],
                backingStyle: "classical_strings",
                chords: ["D", "F#m", "C#7", "F#m", "B7", "Em", "A7", "D"],
                strumPattern: "ballad_68_lilt", combinedStrumPattern: "ballad_68",
                p1Title: "River Bridge Modulation", p1Subtitle: "Chromatic lyric melody weaving through C#7 and B7",
                p2Title: "Modulating Bridge Chords", p2Subtitle: "Seamless 6/8 transitions across F#m, C#7, B7, and Em",
                p3Title: "Twilight Modulation", p3Subtitle: "Full modulating chord-melody bridge in 6/8",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 0.67, 66], [0.67, 0.33, 69], [1, 1, 74]],
                    [[0, 0.67, 73], [0.67, 0.33, 76], [1, 1, 78]],
                    [[0, 0.67, 77], [0.67, 0.33, 73], [1, 1, 71]],
                    [[0, 0.67, 69], [0.67, 0.33, 73], [1, 1, 78]],
                    [[0, 0.67, 75], [0.67, 0.33, 78], [1, 1, 75]],
                    [[0, 0.67, 76], [0.67, 0.33, 71], [1, 1, 67]],
                    [[0, 0.67, 69], [0.67, 0.33, 73], [1, 1, 76]],
                    [[0, 2, 74]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 9, order: 3, xpBase: 185,
                title: "Virtuoso Bossa Nova & Jazz Fusion",
                description: "Lock into hypnotic Brazilian bossa-nova clave syncopation over Bbmaj7, Gm7, Cm7, F7, and Dm7b5 jazz voicings.",
                modeFocus: "both",
                skills: ["Bossa Nova Clave", "Bbmaj7 · Dm7b5 · G7", "Syncopated Jazz Phrasing"],
                keySignature: "Bb", bpm: 108, backingStyle: "jazz_brushes",
                chords: ["Bbmaj7", "Gm7", "Cm7", "F7", "Dm7b5", "G7", "Cm7 → F7", "Bbmaj7"],
                strumPattern: "bossa_44", combinedStrumPattern: "bossa_44",
                p1Title: "Ipanema Breeze Lead", p1Subtitle: "Syncopated bossa melody spanning frets 1–10 in Bb Major",
                p2Title: "Bossa Clave Comping", p2Subtitle: "Silky syncopated bossa strums across extended flat-key jazz chords",
                p3Title: "Copacabana Sunset", p3Subtitle: "Full bossa-nova jazz chord-melody performance",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 1.5, 74], [1.5, 1, 77], [2.5, 0.5, 74], [3, 1, 70]],
                    [[0, 1.5, 70], [1.5, 1, 74], [2.5, 0.5, 72], [3, 1, 69]],
                    [[0, 1.5, 70], [1.5, 1, 75], [2.5, 0.5, 72], [3, 1, 70]],
                    [[0, 1.5, 69], [1.5, 1, 72], [2.5, 1.5, 75]],
                    [[0, 1.5, 74], [1.5, 1, 77], [2.5, 0.5, 75], [3, 1, 72]],
                    [[0, 1.5, 71], [1.5, 1, 74], [2.5, 0.5, 77], [3, 1, 74]],
                    [[0, 1, 75], [1, 1, 72], [2, 1, 74], [3, 1, 69]],
                    [[0, 4, 70]]
                ]), bpm, bpmM)
            }),
            createUkuleleLesson({
                level: 9, order: 4, xpBase: 185,
                title: "Level 9 Concert Capstone: Symphony of Four Strings",
                description: "Celebrate ukulele mastery with an exhilarating full-neck concert finale spanning frets 0–12, rich modulations, and driving grooves!",
                modeFocus: "both",
                skills: ["Full 0–12 Neck Command", "Concert Chord-Melody", "Virtuoso Articulation"],
                keySignature: "G", bpm: 112, backingStyle: "cinematic_pulse",
                chords: ["Gmaj7", "Em7", "Cmaj7", "D", "Bm", "Em7", "Am7 → D7", "G"],
                strumPattern: "driving_rock_44", combinedStrumPattern: "island_44",
                p1Title: "Virtuoso Four-String Aria", p1Subtitle: "Full-neck concert solo climbing from D4 to A5 (fret 12)",
                p2Title: "Symphonic Groove Finale", p2Subtitle: "Dynamic concert strumming across Gmaj7, Bm, Em7, and Cmaj7",
                p3Title: "Level 9 Grand Finale: Isle of Light", p3Subtitle: "Complete conservatory concert chord-melody capstone",
                buildSoloNotes: (bpm, bpmM) => buildPitchMelodyNotes(barMap([
                    [[0, 0.5, 67], [0.5, 0.5, 71], [1, 0.5, 74], [1.5, 0.5, 78], [2, 1, 79], [3, 1, 74]],
                    [[0, 0.5, 76], [0.5, 0.5, 74], [1, 0.5, 71], [1.5, 0.5, 67], [2, 1, 71], [3, 1, 76]],
                    [[0, 0.5, 72], [0.5, 0.5, 76], [1, 0.5, 79], [1.5, 0.5, 78], [2, 1, 76], [3, 1, 72]],
                    [[0, 1, 74], [1, 0.5, 78], [1.5, 0.5, 81], [2, 2, 78]],
                    [[0, 0.5, 74], [0.5, 0.5, 78], [1, 0.5, 81], [1.5, 0.5, 78], [2, 1, 74], [3, 1, 71]],
                    [[0, 0.5, 76], [0.5, 0.5, 79], [1, 0.5, 76], [1.5, 0.5, 74], [2, 2, 71]],
                    [[0, 0.5, 72], [0.5, 0.5, 76], [1, 0.5, 79], [1.5, 0.5, 76], [2, 1, 78], [3, 1, 81]],
                    [[0, 4, 79]]
                ]), bpm, bpmM)
            })
        ]
    }
];

export const UKULELE_CURRICULUM = [...RAW_UKULELE_CURRICULUM].sort((a, b) => a.level - b.level);

// Pre-build O(1) lookup indices matching `js/curriculum/index.js`
const UKU_LEVEL_BY_NUMBER = new Map();
const UKU_LESSON_BY_ID = new Map();
const UKU_PART_ENTRY_BY_ID = new Map();
const UKU_SONG_ENTRY_BY_ID = new Map();
const UKU_PART_INDEX_BY_ID = new Map();
const ALL_UKU_CURRICULUM_PARTS = [];

for (const level of UKULELE_CURRICULUM) {
    UKU_LEVEL_BY_NUMBER.set(level.level, level);

    for (const lesson of level.lessons) {
        if (lesson && lesson.id) {
            UKU_LESSON_BY_ID.set(lesson.id, lesson);
        }

        for (const part of lesson.parts) {
            if (!part || !part.id) continue;
            const entry = { level, lesson, part };
            const flatIdx = ALL_UKU_CURRICULUM_PARTS.length;
            ALL_UKU_CURRICULUM_PARTS.push(entry);
            UKU_PART_ENTRY_BY_ID.set(part.id, entry);
            UKU_PART_INDEX_BY_ID.set(part.id, flatIdx);

            if (part.song && part.song.id) {
                const songEntry = { level, lesson, part, song: part.song };
                UKU_SONG_ENTRY_BY_ID.set(part.song.id, songEntry);
                if (!UKU_SONG_ENTRY_BY_ID.has(part.id)) {
                    UKU_SONG_ENTRY_BY_ID.set(part.id, songEntry);
                }
            }
        }
    }
}

/** Returns sorted array of all Ukulele curriculum levels (1..9). */
export function getUkuleleCurriculumLevels() {
    return UKULELE_CURRICULUM;
}

/** Returns a Ukulele Level object by numeric level (1..9), or null. */
export function getUkuleleLevelByNumber(levelNum) {
    const num = Number(levelNum);
    if (!Number.isFinite(num)) return null;
    return UKU_LEVEL_BY_NUMBER.get(num) || null;
}

/** Returns a Ukulele Lesson object by ID (e.g. `"uku_l1_lesson_1"`), or null. */
export function getUkuleleLessonById(lessonId) {
    if (!lessonId) return null;
    return UKU_LESSON_BY_ID.get(String(lessonId)) || null;
}

/** Returns `{ level, lesson, part }` for a Ukulele part ID (e.g. `"uku_l1_1_p1"`), or null. */
export function getUkulelePartById(partId) {
    if (!partId) return null;
    const key = String(partId);
    if (UKU_PART_ENTRY_BY_ID.has(key)) {
        return UKU_PART_ENTRY_BY_ID.get(key);
    }
    if (UKU_SONG_ENTRY_BY_ID.has(key)) {
        const found = UKU_SONG_ENTRY_BY_ID.get(key);
        return { level: found.level, lesson: found.lesson, part: found.part };
    }
    return null;
}

/** Returns `{ level, lesson, part }` for the next chronological Ukulele part, or null at end. */
export function getNextUkulelePart(partId) {
    if (!partId) return null;
    const key = String(partId);
    let idx = UKU_PART_INDEX_BY_ID.get(key);
    if (idx === undefined && UKU_SONG_ENTRY_BY_ID.has(key)) {
        idx = UKU_PART_INDEX_BY_ID.get(UKU_SONG_ENTRY_BY_ID.get(key).part.id);
    }
    if (idx === undefined || idx + 1 >= ALL_UKU_CURRICULUM_PARTS.length) {
        return null;
    }
    return ALL_UKU_CURRICULUM_PARTS[idx + 1];
}

/** Returns shallow copy of all 108 `{ level, lesson, part }` entries across Levels 1–9. */
export function getAllUkuleleCurriculumParts() {
    return [...ALL_UKU_CURRICULUM_PARTS];
}

/** Returns `{ level, lesson, part, song }` for a Ukulele curriculum song ID (or part ID), or null. */
export function getUkuleleCurriculumSongById(songId) {
    if (!songId) return null;
    return UKU_SONG_ENTRY_BY_ID.get(String(songId)) || null;
}
