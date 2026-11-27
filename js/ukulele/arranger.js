/**
 * Ukulele Song Arranger & 2nd-Order Viterbi DP Fretboard Solver
 *
 * Converts ANY Piano Song JSON (from SONG_LIBRARY, songs_data/*.json, MIDI, MusicXML,
 * Sheet Music Scanner, or QuickComposer) into a complete, playable 4-string High-G Ukulele Song:
 *
 *   - Melody Track (`lane: "melody"`, `hand: "right"`, `clef: "treble"`):
 *       Extracts the top singing melodic line, applies optimal global octave fitting into
 *       C4..A5 (MIDI 60..81, frets 0..12), and solves ergonomic `(string, fret, finger)` via
 *       a 2nd-order Viterbi Dynamic Programming solver honoring 1-finger-per-fret, open-string
 *       reposition memory, and minimal fretboard travel.
 *
 *   - Chords Track (`lane: "chords"`, `hand: "left"`, `clef: "bass"`):
 *       Uses explicit `song.chords` (supporting split bars like `"G → C"` and intentional `""`
 *       pickup/solo bars) or infers measure harmony automatically via `inferChordsFromNotes(song)`,
 *       generating meter- and style-appropriate 4-string strums via `chordToTabNotes()`.
 *
 *   - Zero Same-String Simultaneous Fret Collisions:
 *       Guarantees that when Melody (`right`) and Chords (`left`) are both active at the same beat,
 *       no two simultaneous notes (`|dt| <= 55ms`) ever demand different frets on the SAME string!
 */

import { BackingTrackEngine, inferChordsFromNotes } from "../audio/backing_track.js";
import {
    UKULELE_STRINGS,
    UKULELE_FINGER_PALETTE,
    UKULELE_MIN_MIDI,
    UKULELE_MAX_MIDI,
    UKULELE_MAX_FRET,
    getUkuleleFingerStyle,
    getPlayablePositionsForPitch,
    lookupUkuleleChord,
    parseUkuleleChordBar,
    chordToTabNotes
} from "./chords.js";

const CHORD_CLUSTER_SEC = 0.055;
const ARTICULATION_GAP_SEC = 0.025;
const MIN_DURATION_SEC = 0.15;

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

/**
 * Extracts a clean singing melody line from a piano song's notes.
 * Prefers treble / right-hand notes; collapses simultaneous clusters (`<= 55ms`) to the top voice.
 */
function extractMelodyFromPianoNotes(pianoNotes) {
    if (!Array.isArray(pianoNotes) || pianoNotes.length === 0) return [];

    const rightOrTreble = pianoNotes.filter(
        (n) => n.hand === "right" || n.clef === "treble" || (!n.hand && !n.clef && (n.pitch ?? n.midi ?? 60) >= 60)
    );
    const source = rightOrTreble.length > 0 ? rightOrTreble : pianoNotes;

    const sorted = source
        .map((n) => ({
            pitch: Math.round(Number(n.pitch !== undefined ? n.pitch : (n.midi !== undefined ? n.midi : 60))),
            time: Math.max(0, Number(n.time) || 0),
            duration: Math.max(MIN_DURATION_SEC, Number(n.duration) || 0.4)
        }))
        .sort((a, b) => (a.time - b.time) || (b.pitch - a.pitch));

    // Group simultaneous onsets within 55ms and select top singing voice
    const melody = [];
    for (let i = 0; i < sorted.length; i++) {
        const n = sorted[i];
        const prev = melody[melody.length - 1];
        if (prev && Math.abs(n.time - prev.time) <= CHORD_CLUSTER_SEC) {
            if (n.pitch > prev.pitch) {
                prev.pitch = n.pitch;
                prev.duration = Math.max(prev.duration, n.duration);
            }
        } else {
            melody.push({ ...n });
        }
    }

    // Ensure clean release articulation between consecutive melody notes
    for (let i = 0; i < melody.length - 1; i++) {
        const dt = melody[i + 1].time - melody[i].time;
        if (dt > 0.04 && melody[i].duration > dt - ARTICULATION_GAP_SEC) {
            melody[i].duration = Math.max(MIN_DURATION_SEC, round4(dt - ARTICULATION_GAP_SEC));
        }
    }

    return melody;
}

/**
 * Chooses optimal global octave shift (`-24, -12, 0, +12, +24`) and folds outliers
 * into the standard High-G 12-fret ukulele range (`C4 = 60 .. A5 = 81`).
 */
function fitMelodyToUkuleleRange(notes, options = {}) {
    if (!Array.isArray(notes) || notes.length === 0) {
        return { notes: [], octaveShift: 0 };
    }

    const autoShift = options.autoOctaveShift !== false;
    const minMidi = options.minMidi ?? UKULELE_MIN_MIDI;
    const maxMidi = options.maxMidi ?? UKULELE_MAX_MIDI;
    const sweetLow = 60;
    const sweetHigh = 76; // C4..E5 (frets 0..7)

    let bestShift = 0;
    if (autoShift) {
        let bestCost = Infinity;
        const candidates = [-24, -12, 0, 12, 24];
        for (const shift of candidates) {
            let cost = Math.abs(shift) * 0.22; // Mild preference for concert pitch
            for (let i = 0; i < notes.length; i++) {
                const p = notes[i].pitch + shift;
                if (p < minMidi) cost += 80 + (minMidi - p) * 6;
                else if (p > maxMidi) cost += 80 + (p - maxMidi) * 6;
                else if (p > sweetHigh) cost += (p - sweetHigh) * 1.4;
                else if (p < sweetLow) cost += (sweetLow - p) * 1.4;
            }
            if (cost < bestCost) {
                bestCost = cost;
                bestShift = shift;
            }
        }
    }

    const fitted = notes.map((n) => {
        let p = Math.round(n.pitch + bestShift);
        while (p < minMidi) p += 12;
        while (p > maxMidi) p -= 12;
        return { ...n, pitch: p };
    });

    return { notes: fitted, octaveShift: bestShift };
}

/**
 * Builds candidate `(string, fret, finger, anchor)` states for a single melody pitch `p`.
 */
function buildFretboardCandidates(pitch, options = {}) {
    const maxFret = options.maxFret ?? UKULELE_MAX_FRET;
    const minFretPref = options.minFret ?? 0;
    const positions = getPlayablePositionsForPitch(pitch, maxFret);

    if (positions.length === 0) {
        // Clamp safety fallback (should never happen once fitted to 60..81)
        const clamped = Math.max(UKULELE_MIN_MIDI, Math.min(UKULELE_MAX_MIDI, pitch));
        return buildFretboardCandidates(clamped, options);
    }

    const lowestFret = Math.min(...positions.map((pos) => pos.fret));
    const candidates = [];

    for (const pos of positions) {
        const { string, fret } = pos;
        if (fret === 0) {
            candidates.push({
                string,
                fret: 0,
                finger: 0,
                anchor: null
            });
            continue;
        }

        // Prune very high redundant positions when an open/low position exists (unless upper-neck requested)
        if (minFretPref === 0 && lowestFret <= 4 && fret > 8) {
            continue;
        }

        // Determine ergonomic fretting fingers for this fret (anchor = fret - finger + 1 >= 1)
        let allowedFingers;
        if (fret === 1) {
            allowedFingers = [1];
        } else if (fret === 2) {
            allowedFingers = [2, 1];
        } else if (fret === 3) {
            allowedFingers = [3, 2, 1];
        } else if (fret === 4) {
            allowedFingers = [4, 3, 2, 1];
        } else {
            // Higher positions: prefer full 4-finger span on lowest-fret string, compact set on secondary strings
            allowedFingers = (fret <= lowestFret + 2) ? [1, 2, 3, 4] : [1, 3];
        }

        for (const finger of allowedFingers) {
            const anchor = fret - (finger - 1);
            if (anchor < 1) continue;
            candidates.push({
                string,
                fret,
                finger,
                anchor
            });
        }
    }

    // Keep state count compact (<= 10) for blazing-fast 2nd-order Viterbi DP
    if (candidates.length > 10) {
        candidates.sort((a, b) => {
            const da = Math.abs(a.fret - minFretPref) + (a.fret === 0 ? -1 : 0);
            const db = Math.abs(b.fret - minFretPref) + (b.fret === 0 ? -1 : 0);
            return da - db;
        });
        return candidates.slice(0, 10);
    }

    return candidates;
}

function unaryFretCost(cand, options = {}) {
    const minFretPref = options.minFret ?? 0;
    let cost = 0;

    if (cand.fret === 0) {
        if (minFretPref >= 4) {
            // When explicitly targeting upper-neck position (e.g. Level 8), allow open strings only if campanella
            cost += options.campanella ? -1.4 : 4.5;
        } else {
            // Strong ergonomic preference for clear resonant open strings
            cost -= 1.45;
            // Mild tie-breaker preferring A/E/C over re-entrant G4 open string in linear low melodies
            if (cand.string === 3) cost += 0.25;
        }
        return cost;
    }

    if (minFretPref >= 4) {
        // Upper-neck position anchor preference around [minFretPref .. minFretPref + 4]
        if (cand.fret < minFretPref) {
            cost += (minFretPref - cand.fret) * 2.2;
        } else if (cand.fret > minFretPref + 4) {
            cost += (cand.fret - (minFretPref + 4)) * 1.1;
        } else {
            cost -= 0.8;
        }
        const idealAnchor = minFretPref;
        cost += Math.abs(cand.anchor - idealAnchor) * 0.45;
    } else {
        // Standard low-position preference (frets 0..5)
        cost += cand.fret * 0.46;
        if (cand.fret > 5) cost += (cand.fret - 5) * 0.72;
        if (cand.fret > 8) cost += (cand.fret - 8) * 1.1;

        // Golden 1-finger-per-fret bonus in 1st position (fret 1->f1, 2->f2, 3->f3, 4->f4)
        if (cand.fret <= 4 && cand.finger === cand.fret) {
            cost -= 1.25;
        }
    }

    // Mild finger agility weighting (index/middle strongest, pinky mild penalty)
    if (cand.finger === 4) cost += 0.28;
    else if (cand.finger === 3) cost += 0.08;

    return cost;
}

function transitionFretCost(prevNote, prevCand, curNote, curCand) {
    const dt = Math.max(0.01, curNote.time - prevNote.time);
    const restGap = curNote.time - (prevNote.time + prevNote.duration);

    let phraseWeight = 1.0;
    if (restGap >= 0.65 || dt >= 2.0) phraseWeight = 0.3;
    else if (restGap >= 0.3 || dt >= 1.2) phraseWeight = 0.6;
    else if (dt < 0.28) phraseWeight = 1.2;

    // Repeated exact pitch: strongly favor keeping the exact same string, fret & finger!
    if (prevNote.pitch === curNote.pitch) {
        if (prevCand.string === curCand.string && prevCand.fret === curCand.fret) {
            return prevCand.finger === curCand.finger ? -0.4 : 1.4;
        }
        return 4.6 * phraseWeight;
    }

    let cost = 0;

    // String crossing cost (adjacent strings smoother than wide string skips)
    const strDist = Math.abs(curCand.string - prevCand.string);
    if (strDist > 0) {
        cost += strDist * 0.42 * phraseWeight;
    }

    // Open-string transitions give a natural free hand-reposition breath
    if (prevCand.fret === 0 || curCand.fret === 0) {
        return cost;
    }

    // Both fretted: evaluate hand-position anchor jump & finger reuse
    const anchorShift = Math.abs(curCand.anchor - prevCand.anchor);
    cost += anchorShift * 1.42 * phraseWeight;

    // Same finger hopping to a different fret/string rapidly
    if (prevCand.finger === curCand.finger && (prevCand.fret !== curCand.fret || prevCand.string !== curCand.string)) {
        const fretDist = Math.abs(curCand.fret - prevCand.fret);
        const hopBase = restGap >= 0.35 ? 1.5 : 4.2;
        cost += (hopBase + fretDist * 0.55) * phraseWeight;
    } else if (anchorShift === 0 && prevCand.finger !== curCand.finger) {
        // Smooth 1-finger-per-fret sequence inside same hand box!
        cost -= 0.55;
    }

    // Same-string rapid articulation awareness
    if (prevCand.string === curCand.string && dt < 0.26) {
        cost += Math.abs(curCand.fret - prevCand.fret) * 0.22;
    }

    return cost;
}

function trigramFretCost(n0, c0, n1, c1, n2, c2) {
    const dt01 = n1.time - n0.time;
    const dt12 = n2.time - n1.time;
    if (dt01 > 1.5 || dt12 > 1.5) return 0;

    let cost = 0;

    // 1. Through-open-string anchor continuity: open string at n1 preserves hand box between n0 and n2!
    if (c1.fret === 0 && c0.fret > 0 && c2.fret > 0) {
        cost += Math.abs(c2.anchor - c0.anchor) * 0.95;
        if (c0.finger === c2.finger && (c0.fret !== c2.fret || c0.string !== c2.string)) {
            cost += 1.4;
        }
    }

    // 2. Unnecessary position-jitter penalty (jumping away on n1 and snapping right back on n2)
    if (c0.fret > 0 && c1.fret > 0 && c2.fret > 0) {
        const s01 = Math.abs(c1.anchor - c0.anchor);
        const s12 = Math.abs(c2.anchor - c1.anchor);
        const s02 = Math.abs(c2.anchor - c0.anchor);
        if (s01 >= 2 && s12 >= 2 && s02 <= 1) {
            cost += 2.2;
        }
    }

    // 3. Rapid string zig-zag penalty (e.g. A -> E -> A when staying on A is smoother)
    if (dt01 < 0.35 && dt12 < 0.35 && c0.string === c2.string && c1.string !== c0.string) {
        cost += 0.65;
    }

    return cost;
}

/**
 * Runs a 2nd-Order Viterbi Dynamic Programming Fretboard Solver over an array of melody notes.
 * Returns new ukulele note objects with verified `(string, fret, pitch, finger, fingerLabel, fingerColor, lane, hand)`.
 */
export function arrangeMelodyNotes(rawNotes, options = {}) {
    if (!Array.isArray(rawNotes) || rawNotes.length === 0) return [];

    const { notes: fitted } = fitMelodyToUkuleleRange(rawNotes, options);
    const lane = options.lane || "melody";
    const hand = options.hand || (lane === "chords" ? "left" : "right");
    const clef = hand === "left" ? "bass" : "treble";

    const N = fitted.length;
    const candLists = fitted.map((n) => {
        // Respect explicit locked `(string, fret)` when supplied (e.g. campanella / upper-neck exercises)
        if (
            options.respectLocked !== false &&
            Number.isInteger(n.string) && n.string >= 0 && n.string <= 3 &&
            Number.isInteger(n.fret) && n.fret >= 0 && n.fret <= UKULELE_MAX_FRET &&
            UKULELE_STRINGS[n.string].openMidi + n.fret === n.pitch
        ) {
            const explicitFinger = Number.isInteger(n.finger) && n.finger >= 0 && n.finger <= 4
                ? (n.fret === 0 ? 0 : Math.max(1, n.finger))
                : (n.fret === 0 ? 0 : Math.min(4, Math.max(1, n.fret)));
            return [{
                string: n.string,
                fret: n.fret,
                finger: explicitFinger,
                anchor: n.fret === 0 ? null : Math.max(1, n.fret - (explicitFinger - 1))
            }];
        }
        return buildFretboardCandidates(n.pitch, options);
    });

    const chosen = new Array(N);

    if (N === 1) {
        let bestIdx = 0;
        let bestCost = Infinity;
        for (let k = 0; k < candLists[0].length; k++) {
            const c = unaryFretCost(candLists[0][k], options);
            if (c < bestCost) {
                bestCost = c;
                bestIdx = k;
            }
        }
        chosen[0] = candLists[0][bestIdx];
    } else {
        // 2nd-Order Viterbi DP over pairs `(prevStateIdx, curStateIdx)`
        // dp[i] is a 2D array indexed by [j (state at i-1)][k (state at i)]
        const K0 = candLists[0].length;
        const K1 = candLists[1].length;
        let prevDp = Array.from({ length: K0 }, () => new Float64Array(K1).fill(Infinity));
        const backptr = new Array(N);

        for (let j = 0; j < K0; j++) {
            const u0 = unaryFretCost(candLists[0][j], options);
            for (let k = 0; k < K1; k++) {
                prevDp[j][k] =
                    u0 +
                    unaryFretCost(candLists[1][k], options) +
                    transitionFretCost(fitted[0], candLists[0][j], fitted[1], candLists[1][k]);
            }
        }

        for (let i = 2; i < N; i++) {
            const Km2 = candLists[i - 2].length;
            const Km1 = candLists[i - 1].length;
            const Ki = candLists[i].length;
            const curDp = Array.from({ length: Km1 }, () => new Float64Array(Ki).fill(Infinity));
            const curBp = Array.from({ length: Km1 }, () => new Int16Array(Ki).fill(0));

            for (let k = 0; k < Ki; k++) {
                const uCur = unaryFretCost(candLists[i][k], options);
                for (let j = 0; j < Km1; j++) {
                    const t12 = transitionFretCost(fitted[i - 1], candLists[i - 1][j], fitted[i], candLists[i][k]);
                    let bestVal = Infinity;
                    let bestP = 0;
                    for (let p = 0; p < Km2; p++) {
                        const base = prevDp[p][j];
                        if (!Number.isFinite(base)) continue;
                        const tri = trigramFretCost(
                            fitted[i - 2], candLists[i - 2][p],
                            fitted[i - 1], candLists[i - 1][j],
                            fitted[i], candLists[i][k]
                        );
                        const total = base + uCur + t12 + tri;
                        if (total < bestVal) {
                            bestVal = total;
                            bestP = p;
                        }
                    }
                    curDp[j][k] = bestVal;
                    curBp[j][k] = bestP;
                }
            }
            prevDp = curDp;
            backptr[i] = curBp;
        }

        // Backtrack optimal global path
        let bestLastPrev = 0;
        let bestLastCur = 0;
        let bestTotal = Infinity;
        for (let j = 0; j < prevDp.length; j++) {
            for (let k = 0; k < prevDp[j].length; k++) {
                if (prevDp[j][k] < bestTotal) {
                    bestTotal = prevDp[j][k];
                    bestLastPrev = j;
                    bestLastCur = k;
                }
            }
        }

        const stateIdx = new Int16Array(N);
        stateIdx[N - 1] = bestLastCur;
        stateIdx[N - 2] = bestLastPrev;
        for (let i = N - 1; i >= 2; i--) {
            stateIdx[i - 2] = backptr[i][stateIdx[i - 1]][stateIdx[i]];
        }
        for (let i = 0; i < N; i++) {
            chosen[i] = candLists[i][stateIdx[i]];
        }
    }

    // Build final normalized ukulele melody note objects
    const result = fitted.map((n, idx) => {
        const c = chosen[idx];
        const strMeta = UKULELE_STRINGS[c.string];
        const fStyle = getUkuleleFingerStyle(c.finger);
        return {
            pitch: strMeta.openMidi + c.fret,
            time: round4(n.time),
            duration: round4(Math.max(MIN_DURATION_SEC, n.duration)),
            string: c.string,
            stringName: strMeta.name,
            fret: c.fret,
            finger: c.finger,
            fingerLabel: fStyle.diagramLabel,
            fingerColor: fStyle.primary,
            lane,
            hand,
            clef,
            isChordNote: false
        };
    });

    // Guard against simultaneous intra-melody same-string collisions (e.g. double-stops)
    for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
            if (Math.abs(result[j].time - result[i].time) > CHORD_CLUSTER_SEC) break;
            if (result[j].string === result[i].string && result[j].fret !== result[i].fret) {
                const usedStrings = new Set([result[i].string]);
                const alts = getPlayablePositionsForPitch(result[j].pitch, UKULELE_MAX_FRET)
                    .filter((pos) => !usedStrings.has(pos.string))
                    .sort((a, b) => Math.abs(a.fret - result[i].fret) - Math.abs(b.fret - result[i].fret));
                if (alts.length > 0) {
                    const pick = alts[0];
                    const finger = pick.fret === 0 ? 0 : Math.min(4, Math.max(1, pick.fret));
                    const fStyle = getUkuleleFingerStyle(finger);
                    result[j].string = pick.string;
                    result[j].stringName = pick.stringName;
                    result[j].fret = pick.fret;
                    result[j].finger = finger;
                    result[j].fingerLabel = fStyle.diagramLabel;
                    result[j].fingerColor = fStyle.primary;
                }
            }
        }
    }

    return result;
}

/**
 * Selects an idiomatic ukulele strumming pulse schedule (in beat offsets within 1 measure)
 * based on time signature, tempo, and `backingStyle`.
 */
function selectStrumPatternForMeter(timeSignature, beatsPerMeasure, bpm, backingStyle) {
    const [tsNum, tsDen] = Array.isArray(timeSignature) && timeSignature.length === 2
        ? timeSignature
        : [beatsPerMeasure || 4, 4];

    // 6/8 compound ballad (e.g. Wise Men Say, beatsPerMeasure = 2 dotted quarters)
    if (tsDen === 8 && tsNum === 6 && beatsPerMeasure === 2) {
        return {
            name: "ballad_68",
            pulses: [
                { beat: 0, durBeats: 1, dir: "down" },
                { beat: 1, durBeats: 1, dir: "down" }
            ]
        };
    }

    // 3/8 classical compound bar (e.g. Für Elise)
    if (tsDen === 8 && tsNum === 3) {
        return {
            name: "waltz_38",
            pulses: [
                { beat: 0, durBeats: 3, dir: "down" }
            ]
        };
    }

    // 3/4 Waltz / Hymn (e.g. Amazing Grace, Happy Birthday, Minuet in G)
    if (beatsPerMeasure === 3) {
        if (backingStyle === "warm_pad") {
            return {
                name: "hymn_waltz",
                pulses: [
                    { beat: 0, durBeats: 2, dir: "down" },
                    { beat: 2, durBeats: 1, dir: "up" }
                ]
            };
        }
        return {
            name: "waltz_34",
            pulses: [
                { beat: 0, durBeats: 1, dir: "down" },
                { beat: 1, durBeats: 1, dir: "down" },
                { beat: 2, durBeats: 1, dir: "up" }
            ]
        };
    }

    // 2/4 March / Canon (e.g. Canon in D)
    if (beatsPerMeasure === 2) {
        if (backingStyle === "classical_strings" || backingStyle === "warm_pad") {
            return {
                name: "canon_24",
                pulses: [
                    { beat: 0, durBeats: 2, dir: "down" }
                ]
            };
        }
        return {
            name: "duple_24",
            pulses: [
                { beat: 0, durBeats: 1, dir: "down" },
                { beat: 1, durBeats: 1, dir: "up" }
            ]
        };
    }

    // 4/4 Standard Time
    if (backingStyle === "warm_pad" || backingStyle === "classical_strings") {
        return {
            name: "half_strum_44",
            pulses: [
                { beat: 0, durBeats: 2, dir: "down" },
                { beat: 2, durBeats: 2, dir: "down" }
            ]
        };
    }
    if (backingStyle === "jazz_brushes") {
        return {
            name: "jazz_four_44",
            pulses: [
                { beat: 0, durBeats: 1, dir: "down" },
                { beat: 1, durBeats: 1, dir: "down" },
                { beat: 2, durBeats: 1, dir: "down" },
                { beat: 3, durBeats: 1, dir: "down" }
            ]
        };
    }
    if (bpm <= 108) {
        return {
            name: "pop_groove_44",
            pulses: [
                { beat: 0, durBeats: 1, dir: "down" },
                { beat: 1, durBeats: 1, dir: "down" },
                { beat: 2, durBeats: 1, dir: "down" },
                { beat: 3, durBeats: 0.5, dir: "down" },
                { beat: 3.5, durBeats: 0.5, dir: "up" }
            ]
        };
    }
    return {
        name: "quarter_strum_44",
        pulses: [
            { beat: 0, durBeats: 1, dir: "down" },
            { beat: 1, durBeats: 1, dir: "down" },
            { beat: 2, durBeats: 1, dir: "down" },
            { beat: 3, durBeats: 1, dir: "down" }
        ]
    };
}

/**
 * Generates the 4-string Ukulele Chords accompaniment track (`lane: "chords"`, `hand: "left"`)
 * for any Piano Song, using explicit `song.chords` or automatic `inferChordsFromNotes(song)`.
 */
function generateChordTrack(pianoSong, melodyNotes, options = {}) {
    const bpm = pianoSong.bpm || 100;
    const beatsPerMeasure = pianoSong.beatsPerMeasure || 4;
    const timeSignature = Array.isArray(pianoSong.timeSignature) && pianoSong.timeSignature.length === 2
        ? [pianoSong.timeSignature[0], pianoSong.timeSignature[1]]
        : [beatsPerMeasure, 4];
    const beatSec = 60.0 / bpm;
    const measureSec = beatsPerMeasure * beatSec;
    const backingStyle = options.backingStyle || BackingTrackEngine.resolveBackingStyle(pianoSong);

    // Determine end of musical content so we don't generate trailing empty-bar strums
    let maxSongOnset = 0;
    let maxSongEnd = measureSec;
    const allSrcNotes = Array.isArray(pianoSong.notes) && pianoSong.notes.length > 0 ? pianoSong.notes : melodyNotes;
    for (let i = 0; i < allSrcNotes.length; i++) {
        const n = allSrcNotes[i];
        if (n.time > maxSongOnset) maxSongOnset = n.time;
        const e = n.time + (n.duration || 0.4);
        if (e > maxSongEnd) maxSongEnd = e;
    }

    const numMeasures = Math.max(
        1,
        Math.floor((maxSongOnset + 0.02) / measureSec) + 1,
        Array.isArray(pianoSong.chords) ? pianoSong.chords.length : 0
    );

    const hasExplicitChords = Array.isArray(pianoSong.chords) &&
        pianoSong.chords.some((c) => typeof c === "string" && c.trim().length > 0);
    const inferredChords = inferChordsFromNotes(pianoSong);

    const normalizedChords = [];
    let lastValidChord = pianoSong.keySignature || "C";
    for (let m = 0; m < numMeasures; m++) {
        if (hasExplicitChords && m < pianoSong.chords.length) {
            const raw = pianoSong.chords[m];
            normalizedChords.push(typeof raw === "string" ? raw : "");
            if (typeof raw === "string" && raw.trim()) {
                lastValidChord = raw.trim();
            }
        } else if (!hasExplicitChords) {
            const inf = inferredChords[m] || lastValidChord;
            normalizedChords.push(inf);
            lastValidChord = inf;
        } else {
            normalizedChords.push(lastValidChord);
        }
    }

    const pattern = selectStrumPatternForMeter(timeSignature, beatsPerMeasure, bpm, backingStyle);
    const chordNotes = [];

    for (let m = 0; m < numMeasures; m++) {
        const barEntry = normalizedChords[m];
        // Honor intentional empty pickup/solo bars (`""`) when explicit chords exist
        if (hasExplicitChords && (!barEntry || !barEntry.trim())) {
            continue;
        }

        const segments = parseUkuleleChordBar(barEntry || lastValidChord);
        if (segments.length === 0) continue;

        const mStart = m * measureSec;
        const pulses = pattern.pulses;

        for (let pIdx = 0; pIdx < pulses.length; pIdx++) {
            const pulse = pulses[pIdx];
            const frac = pulse.beat / beatsPerMeasure;
            const strumTime = mStart + pulse.beat * beatSec;

            // Stop cleanly on final measure if past final note's release
            if (m === numMeasures - 1 && strumTime > maxSongEnd - 0.08 && pIdx > 0) {
                break;
            }

            // Pick active split-bar chord segment at this beat fraction
            let seg = segments[0];
            for (let s = 0; s < segments.length; s++) {
                if (frac >= segments[s].startFraction - 1e-4 && frac < segments[s].endFraction - 1e-4) {
                    seg = segments[s];
                    break;
                }
            }

            const rawDur = pulse.durBeats * beatSec;
            const clippedDur = Math.max(MIN_DURATION_SEC, rawDur - ARTICULATION_GAP_SEC);
            const chordGroupId = `m${m}_p${pIdx}_${seg.symbol}`;

            const strumNotes = chordToTabNotes(seg.shape, strumTime, clippedDur, {
                strumDir: pulse.dir,
                lane: "chords",
                hand: "left",
                chordSymbol: seg.symbol,
                chordGroupId
            });
            for (let k = 0; k < strumNotes.length; k++) {
                chordNotes.push(strumNotes[k]);
            }
        }
    }

    return {
        chordNotes,
        chords: normalizedChords,
        strumPattern: pattern.name
    };
}

/**
 * Eliminates any simultaneous same-string different-fret collisions (`|dt| <= 55ms`)
 * between Melody (`right`) and Chords (`left`) tracks so full Chord-Melody play is 100% playable.
 */
export function resolveSimultaneousCollisions(melodyNotes, chordNotes) {
    const mel = melodyNotes.map((n) => ({ ...n }));
    const chd = chordNotes.map((n) => ({ ...n }));
    const droppedChordIndices = new Set();

    for (let i = 0; i < mel.length; i++) {
        const m = mel[i];

        // Track strings occupied by OTHER simultaneous melody notes (e.g. double-stops)
        const simOtherMel = [];
        for (let k = 0; k < mel.length; k++) {
            if (k !== i && Math.abs(mel[k].time - m.time) <= CHORD_CLUSTER_SEC) {
                simOtherMel.push(mel[k]);
            }
        }
        const conflictsWithOtherMel = (str, fret) =>
            simOtherMel.some((om) => om.string === str && om.fret !== fret);

        // Collect all non-dropped chord notes simultaneous with melody note `m`
        const simChordIndices = [];
        for (let j = 0; j < chd.length; j++) {
            if (droppedChordIndices.has(j)) continue;
            if (Math.abs(chd[j].time - m.time) <= CHORD_CLUSTER_SEC) {
                simChordIndices.push(j);
            }
        }
        if (simChordIndices.length === 0) continue;

        // 1. If the melody pitch already appears in the simultaneous chord voicing (and doesn't clash with a sibling double-stop),
        //    lock melody to that exact string & fret!
        const exactPitchIdx = simChordIndices.find(
            (j) => chd[j].pitch === m.pitch && !conflictsWithOtherMel(chd[j].string, chd[j].fret)
        );
        if (exactPitchIdx !== undefined) {
            const match = chd[exactPitchIdx];
            m.string = match.string;
            m.stringName = match.stringName;
            m.fret = match.fret;
            m.finger = match.finger;
            m.fingerLabel = match.fingerLabel;
            m.fingerColor = match.fingerColor;
            continue;
        }

        // 2. Check if any simultaneous chord note occupies `m.string` at a DIFFERENT fret
        const conflicting = simChordIndices.filter(
            (j) => chd[j].string === m.string && chd[j].fret !== m.fret
        );
        if (conflicting.length === 0) continue;

        // Try relocating `m` to an alternate playable `(string, fret)` free of BOTH chord and double-stop conflicts
        const alts = getPlayablePositionsForPitch(m.pitch, UKULELE_MAX_FRET);
        let relocated = false;
        for (const pos of alts) {
            if (conflictsWithOtherMel(pos.string, pos.fret)) continue;
            const hasConflict = simChordIndices.some(
                (j) => chd[j].string === pos.string && chd[j].fret !== pos.fret
            );
            if (!hasConflict) {
                const finger = pos.fret === 0 ? 0 : Math.min(4, Math.max(1, pos.fret));
                const fStyle = getUkuleleFingerStyle(finger);
                m.string = pos.string;
                m.stringName = pos.stringName;
                m.fret = pos.fret;
                m.finger = finger;
                m.fingerLabel = fStyle.diagramLabel;
                m.fingerColor = fStyle.primary;
                relocated = true;
                break;
            }
        }

        // Otherwise omit the colliding chord string so the beat forms a playable harmony + melody voice
        if (!relocated) {
            for (const j of conflicting) {
                droppedChordIndices.add(j);
            }
        }
    }

    const filteredChords = chd.filter((_, idx) => !droppedChordIndices.has(idx));

    // Recompute `isUnisonDouble` per chordGroupId after any omitted strings
    const seenByGroup = new Map();
    for (let i = 0; i < filteredChords.length; i++) {
        const c = filteredChords[i];
        const gid = c.chordGroupId || `t_${Math.round(c.time * 1000)}`;
        if (!seenByGroup.has(gid)) seenByGroup.set(gid, new Set());
        const set = seenByGroup.get(gid);
        c.isUnisonDouble = set.has(c.pitch);
        set.add(c.pitch);
    }

    const combined = [...mel, ...filteredChords].sort((a, b) => {
        if (Math.abs(a.time - b.time) > 1e-4) return a.time - b.time;
        if (a.lane !== b.lane) return a.lane === "melody" ? -1 : 1;
        return b.string - a.string;
    });

    return {
        melodyNotes: mel,
        chordNotes: filteredChords,
        notes: combined
    };
}

/**
 * Validates all structural, physical, and ergonomic invariants of a Ukulele Song JSON.
 */
export function verifyUkuleleSong(ukuSong) {
    const errors = [];
    if (!ukuSong || typeof ukuSong !== "object") {
        return { valid: false, errors: ["Song object is missing"], stats: null };
    }
    if (ukuSong.instrument !== "ukulele") {
        errors.push(`Expected instrument === "ukulele", got "${ukuSong.instrument}"`);
    }
    if (!Array.isArray(ukuSong.notes) || ukuSong.notes.length === 0) {
        errors.push("Song has no notes");
        return { valid: false, errors, stats: null };
    }

    const ALLOWED_FINGER_COLORS = new Set(
        Object.values(UKULELE_FINGER_PALETTE).map((p) => p.primary.toUpperCase())
    );
    let melodyNotes = 0;
    let chordNotes = 0;
    let minFret = Infinity;
    let maxFret = -Infinity;
    const uniqueChords = new Set();

    for (let i = 0; i < ukuSong.notes.length; i++) {
        const n = ukuSong.notes[i];
        if (!Number.isInteger(n.string) || n.string < 0 || n.string > 3) {
            errors.push(`Note[${i}] invalid string: ${n.string}`);
            continue;
        }
        if (!Number.isInteger(n.fret) || n.fret < 0 || n.fret > UKULELE_MAX_FRET) {
            errors.push(`Note[${i}] invalid fret: ${n.fret}`);
        }
        const expectedPitch = UKULELE_STRINGS[n.string].openMidi + n.fret;
        if (n.pitch !== expectedPitch) {
            errors.push(`Note[${i}] pitch mismatch: got ${n.pitch}, expected ${expectedPitch} (string ${n.string} fret ${n.fret})`);
        }
        if (!Number.isInteger(n.finger) || n.finger < 0 || n.finger > 4) {
            errors.push(`Note[${i}] invalid finger: ${n.finger}`);
        }
        if (n.fret === 0 && n.finger !== 0) {
            errors.push(`Note[${i}] open string fret 0 must use finger 0, got ${n.finger}`);
        }
        if (n.fret > 0 && n.finger === 0) {
            errors.push(`Note[${i}] fretted note fret ${n.fret} cannot use finger 0`);
        }
        if (typeof n.fingerColor !== "string" || !ALLOWED_FINGER_COLORS.has(n.fingerColor.toUpperCase())) {
            errors.push(`Note[${i}] invalid fingerColor: ${n.fingerColor}`);
        }
        if (n.lane !== "melody" && n.lane !== "chords") {
            errors.push(`Note[${i}] invalid lane: ${n.lane}`);
        }
        if (n.hand !== "right" && n.hand !== "left") {
            errors.push(`Note[${i}] invalid hand: ${n.hand}`);
        }
        if (typeof n.time !== "number" || n.time < -1e-4) {
            errors.push(`Note[${i}] invalid time: ${n.time}`);
        }
        if (typeof n.duration !== "number" || n.duration < 0.1) {
            errors.push(`Note[${i}] invalid duration: ${n.duration}`);
        }

        if (n.lane === "melody") melodyNotes++;
        if (n.lane === "chords") chordNotes++;
        if (n.fret < minFret) minFret = n.fret;
        if (n.fret > maxFret) maxFret = n.fret;
        if (n.chordSymbol) uniqueChords.add(n.chordSymbol);
    }

    // Check simultaneous same-string different-fret collisions across all notes
    let collisions = 0;
    const sorted = [...ukuSong.notes].sort((a, b) => a.time - b.time);
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            if (sorted[j].time - sorted[i].time > CHORD_CLUSTER_SEC) break;
            if (sorted[i].string === sorted[j].string && sorted[i].fret !== sorted[j].fret) {
                collisions++;
                errors.push(
                    `Simultaneous string ${sorted[i].string} collision at t=${sorted[i].time}: ` +
                    `fret ${sorted[i].fret} (${sorted[i].lane}) vs fret ${sorted[j].fret} (${sorted[j].lane})`
                );
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        stats: {
            totalNotes: ukuSong.notes.length,
            melodyNotes,
            chordNotes,
            collisions,
            minFret: Number.isFinite(minFret) ? minFret : 0,
            maxFret: Number.isFinite(maxFret) ? maxFret : 0,
            uniqueChords: Array.from(uniqueChords)
        }
    };
}

/**
 * Converts ANY Piano Song JSON (built-in, `songs_data/*.json`, MIDI, MusicXML, Sheet scan)
 * into a complete, playable dual-track Ukulele Song JSON (`lane: "melody"` + `lane: "chords"`).
 */
export function arrangeSongForUkulele(pianoSong, options = {}) {
    if (!pianoSong || typeof pianoSong !== "object") {
        return null;
    }

    // Idempotent passthrough for already-arranged ukulele songs unless forceRearrange is requested
    if (pianoSong.instrument === "ukulele" && !options.forceRearrange) {
        const clone = JSON.parse(JSON.stringify(pianoSong));
        if (Array.isArray(clone.notes)) {
            for (const n of clone.notes) {
                const fStyle = getUkuleleFingerStyle(n.finger);
                n.fingerLabel = fStyle.diagramLabel;
                n.fingerColor = fStyle.primary;
                if (!n.stringName && Number.isInteger(n.string) && UKULELE_STRINGS[n.string]) {
                    n.stringName = UKULELE_STRINGS[n.string].name;
                }
            }
        }
        return clone;
    }

    const bpm = pianoSong.bpm || 100;
    const beatsPerMeasure = pianoSong.beatsPerMeasure || 4;
    const timeSignature = Array.isArray(pianoSong.timeSignature) && pianoSong.timeSignature.length === 2
        ? [pianoSong.timeSignature[0], pianoSong.timeSignature[1]]
        : [beatsPerMeasure, 4];
    const keySignature = pianoSong.keySignature || "C";
    const backingStyle = BackingTrackEngine.resolveBackingStyle(pianoSong);

    // 1. Melody Track (Viterbi DP Fretboard Solver)
    const rawMelody = extractMelodyFromPianoNotes(pianoSong.notes || []);
    const { notes: fittedMelody, octaveShift } = fitMelodyToUkuleleRange(rawMelody, options);
    const melodyNotes = arrangeMelodyNotes(fittedMelody, {
        ...options,
        autoOctaveShift: false,
        lane: "melody",
        hand: "right"
    });

    // 2. Chords Track (Explicit chords or automatic harmonic inference)
    const { chordNotes, chords, strumPattern } = generateChordTrack(pianoSong, melodyNotes, {
        ...options,
        backingStyle
    });

    // 3. Zero-collision Chord-Melody synthesis
    const resolved = resolveSimultaneousCollisions(melodyNotes, chordNotes);

    // Ensure chords array length matches exact measure count of arranged notes
    const measureSec = beatsPerMeasure * (60.0 / bpm);
    let maxOnset = 0;
    for (let i = 0; i < resolved.notes.length; i++) {
        if (resolved.notes[i].time > maxOnset) maxOnset = resolved.notes[i].time;
    }
    const expectedBars = Math.max(1, Math.floor((maxOnset + 0.02) / measureSec) + 1);
    const finalChords = chords.slice(0, Math.max(chords.length, expectedBars));
    const fallbackSym = finalChords.slice().reverse().find((c) => typeof c === "string" && c.trim()) || keySignature;
    while (finalChords.length < expectedBars) {
        finalChords.push(fallbackSym);
    }

    return {
        id: pianoSong.id || "ukulele_song",
        title: pianoSong.title || "Untitled Ukulele Song",
        artist: pianoSong.artist || "Traditional",
        instrument: "ukulele",
        tuning: "G4-C4-E4-A4",
        maxFret: UKULELE_MAX_FRET,
        originalInstrument: pianoSong.instrument || "piano",
        bpm,
        beatsPerMeasure,
        timeSignature,
        keySignature,
        backingStyle,
        chords: finalChords,
        notes: resolved.notes,
        arrangerMeta: {
            octaveShift,
            strumPattern,
            melodyCount: resolved.melodyNotes.length,
            chordCount: resolved.chordNotes.length,
            uniqueChords: Array.from(new Set(resolved.chordNotes.map((n) => n.chordSymbol).filter(Boolean)))
        }
    };
}

export class UkuleleArranger {
    static arrangeSongForUkulele(pianoSong, options = {}) {
        return arrangeSongForUkulele(pianoSong, options);
    }

    static arrangeMelodyNotes(notes, options = {}) {
        return arrangeMelodyNotes(notes, options);
    }

    static generateChordTrack(pianoSong, melodyNotes = [], options = {}) {
        return generateChordTrack(pianoSong, melodyNotes, options);
    }

    static resolveSimultaneousCollisions(melodyNotes, chordNotes) {
        return resolveSimultaneousCollisions(melodyNotes, chordNotes);
    }

    static verifyUkuleleSong(ukuSong) {
        return verifyUkuleleSong(ukuSong);
    }
}
