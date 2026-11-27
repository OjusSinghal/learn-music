/**
 * Ergonomic & Pedagogical Automatic Piano Fingering (APF) Engine
 *
 * Implements a hybrid Parncutt (1997) / Jacobs (2001) / Nakamura (2014) biomechanical
 * 2nd-Order Viterbi Dynamic Programming solver + Bimanual MIDI Hand Partitioner.
 *
 * Assigns every score note:
 *   - hand:        "left" | "right"
 *   - clef:        "bass" | "treble"
 *   - finger:      1..5 (1 = Thumb, 2 = Index, 3 = Middle, 4 = Ring, 5 = Pinky)
 *   - fingerLabel: "T" | "1" | "2" | "3" | "4" (matching the hand color diagram)
 *   - fingerColor: Hex primary color from the canonical 5-finger color scheme
 */

export const FINGER_PALETTE = {
    1: {
        finger: 1,
        diagramLabel: "T",
        name: "Thumb",
        primary: "#48A870",
        light: "#74C695",
        dark: "#2F8554",
        text: "#FFFFFF"
    },
    2: {
        finger: 2,
        diagramLabel: "1",
        name: "Index",
        primary: "#F0C830",
        light: "#F8E080",
        dark: "#C89D14",
        text: "#FFFFFF"
    },
    3: {
        finger: 3,
        diagramLabel: "2",
        name: "Middle",
        primary: "#6848F8",
        light: "#B0A0F8",
        dark: "#4C2FD9",
        text: "#FFFFFF"
    },
    4: {
        finger: 4,
        diagramLabel: "3",
        name: "Ring",
        primary: "#4090F8",
        light: "#98D8F8",
        dark: "#256EE0",
        text: "#FFFFFF"
    },
    5: {
        finger: 5,
        diagramLabel: "4",
        name: "Pinky",
        primary: "#E86078",
        light: "#F0A8B8",
        dark: "#C93B56",
        text: "#FFFFFF"
    }
};

// Physical horizontal key coordinate within one octave in white-key width units (0..7)
const OCTAVE_WHITE_POS = [0.0, 0.58, 1.0, 1.62, 2.0, 3.0, 3.55, 4.0, 4.58, 5.0, 5.62, 6.0];
const IS_BLACK_PITCH_CLASS = [false, true, false, true, false, false, true, false, true, false, true, false];

// Parncutt (1997) / Jacobs (2001) pairwise directed semitone reach table for ordered finger pairs (fa < fb)
// [minPrac, minComf, minRel, maxRel, maxComf, maxPrac]
const PAIR_SPAN_TABLE = {
    "1_2": [-5, -3, 1, 5, 8, 10],
    "1_3": [-4, -2, 3, 7, 10, 12],
    "1_4": [-3, -1, 5, 9, 12, 14],
    "1_5": [-1,  1, 7, 10, 12, 15],
    "2_3": [ 1,  1, 1, 2, 5, 7],
    "2_4": [ 1,  2, 3, 4, 6, 8],
    "2_5": [ 2,  4, 5, 6, 8, 10],
    "3_4": [ 1,  1, 1, 2, 4, 5],
    "3_5": [ 1,  2, 3, 4, 7, 8],
    "4_5": [ 1,  1, 1, 2, 4, 5]
};

// Precomputed spatially ordered finger subsets of size k (1..5) in ascending finger order
const ORDERED_FINGER_SUBSETS = {
    1: [[1], [2], [3], [4], [5]],
    2: [
        [1, 2], [1, 3], [1, 4], [1, 5],
        [2, 3], [2, 4], [2, 5],
        [3, 4], [3, 5],
        [4, 5]
    ],
    3: [
        [1, 2, 3], [1, 2, 4], [1, 2, 5],
        [1, 3, 4], [1, 3, 5], [1, 4, 5],
        [2, 3, 4], [2, 3, 5], [2, 4, 5],
        [3, 4, 5]
    ],
    4: [
        [1, 2, 3, 4], [1, 2, 3, 5], [1, 2, 4, 5], [1, 3, 4, 5], [2, 3, 4, 5]
    ],
    5: [[1, 2, 3, 4, 5]]
};

const CHORD_CLUSTER_SEC = 0.050;

export class PianoFingeringEngine {
    static clamp61(midi) {
        let p = Math.round(Number(midi) || 60);
        while (p < 36) p += 12;
        while (p > 96) p -= 12;
        return p;
    }

    static isBlackKey(midi) {
        const pc = ((midi % 12) + 12) % 12;
        return IS_BLACK_PITCH_CLASS[pc];
    }

    /**
     * Physical horizontal coordinate in white-key widths (C2 = 0.0, D2 = 1.0, ..., C7 = 35.0)
     */
    static whiteKeyCoord(midi) {
        const pc = ((midi % 12) + 12) % 12;
        const oct = Math.floor(midi / 12) - 1; // C2 -> oct 2
        return (oct - 2) * 7.0 + OCTAVE_WHITE_POS[pc];
    }

    /**
     * Implied thumb-knuckle horizontal anchor on the keyboard for a given (midi, finger, hand).
     * In a relaxed 5-finger white-key position, anchorX is identical across fingers 1..5!
     */
    static handAnchorX(midi, finger, hand) {
        const x = this.whiteKeyCoord(midi);
        const dir = hand === "right" ? 1.0 : -1.0;
        return x - dir * (finger - 1);
    }

    static getFingerStyle(finger) {
        const f = Number(finger);
        if (f >= 1 && f <= 5) {
            return FINGER_PALETTE[f];
        }
        return FINGER_PALETTE[1];
    }

    static getNoteFingerStyle(note) {
        if (note && note.finger >= 1 && note.finger <= 5) {
            return FINGER_PALETTE[note.finger];
        }
        return FINGER_PALETTE[1];
    }

    static getNoteFingerColor(note) {
        if (note && typeof note.fingerColor === "string" && note.fingerColor.startsWith("#")) {
            return note.fingerColor;
        }
        return this.getNoteFingerStyle(note).primary;
    }

    /**
     * Parses explicit finger markings ("T", "1".."5") when supplied by MusicXML or Composer shorthand.
     * Standard piano notation uses 1..5 (1=Thumb..5=Pinky); "T" maps to 1 (Thumb).
     */
    static parseExplicitFinger(raw, notationScheme = "piano") {
        if (raw === null || raw === undefined || raw === "") return null;
        const s = String(raw).trim().toUpperCase();
        if (s === "T") return 1;
        const n = parseInt(s, 10);
        if (!Number.isFinite(n)) return null;
        if (notationScheme === "diagram") {
            if (n >= 1 && n <= 4) return n + 1;
            return null;
        }
        if (n >= 1 && n <= 5) return n;
        return null;
    }

    /**
     * Smart Bimanual MIDI Hand Partitioner (for Type-0 / unsplit or multi-track MIDI imports).
     * Separates notes into Right Hand ("treble") and Left Hand ("bass") using track statistics
     * when cleanly separated, or span-and-continuity dynamic programming when merged.
     */
    static partitionMidiHands(rawNotes) {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) return [];

        // Check if multi-track MIDI already cleanly separates treble and bass tracks
        const byTrack = new Map();
        for (const n of rawNotes) {
            const tr = n.track ?? 0;
            if (!byTrack.has(tr)) byTrack.set(tr, []);
            byTrack.get(tr).push(n);
        }

        if (byTrack.size === 2) {
            const entries = Array.from(byTrack.entries()).map(([tr, arr]) => {
                const meanPitch = arr.reduce((acc, x) => acc + x.pitch, 0) / arr.length;
                return { tr, arr, meanPitch };
            });
            entries.sort((a, b) => a.meanPitch - b.meanPitch);
            if (entries[1].meanPitch - entries[0].meanPitch >= 6.0) {
                for (const n of entries[0].arr) {
                    n.hand = "left";
                    n.clef = "bass";
                }
                for (const n of entries[1].arr) {
                    n.hand = "right";
                    n.clef = "treble";
                }
                return rawNotes;
            }
        }

        // Group simultaneous onsets into clusters and split each cluster into (LH, RH)
        const sorted = [...rawNotes].sort((a, b) => (a.time - b.time) || (a.pitch - b.pitch));
        const clusters = [];
        for (const n of sorted) {
            const last = clusters[clusters.length - 1];
            if (last && Math.abs(n.time - last.time) <= CHORD_CLUSTER_SEC) {
                last.notes.push(n);
            } else {
                clusters.push({ time: n.time, notes: [n] });
            }
        }

        let prevLeftCenter = 48;  // C3
        let prevRightCenter = 67; // G4

        for (const cluster of clusters) {
            cluster.notes.sort((a, b) => a.pitch - b.pitch);
            const m = cluster.notes.length;

            // Evaluate split index s in [0..m]: notes[0..s-1] -> left, notes[s..m-1] -> right
            let bestSplit = 0;
            let bestCost = Infinity;

            for (let s = 0; s <= m; s++) {
                const leftSlice = cluster.notes.slice(0, s);
                const rightSlice = cluster.notes.slice(s);

                if (leftSlice.length > 5 && rightSlice.length === 0) continue;
                if (rightSlice.length > 5 && leftSlice.length === 0) continue;

                let cost = 0;

                if (leftSlice.length > 0) {
                    const lMin = leftSlice[0].pitch;
                    const lMax = leftSlice[leftSlice.length - 1].pitch;
                    const lSpan = lMax - lMin;
                    if (lSpan > 15) cost += 50 + (lSpan - 15) * 12;
                    else if (lSpan > 12) cost += (lSpan - 12) * 4;
                    if (lMax > 64) cost += (lMax - 64) * 2.2;
                    const lCenter = (lMin + lMax) * 0.5;
                    cost += Math.abs(lCenter - prevLeftCenter) * 0.35;
                }

                if (rightSlice.length > 0) {
                    const rMin = rightSlice[0].pitch;
                    const rMax = rightSlice[rightSlice.length - 1].pitch;
                    const rSpan = rMax - rMin;
                    if (rSpan > 15) cost += 50 + (rSpan - 15) * 12;
                    else if (rSpan > 12) cost += (rSpan - 12) * 4;
                    if (rMin < 55) cost += (55 - rMin) * 2.2;
                    const rCenter = (rMin + rMax) * 0.5;
                    cost += Math.abs(rCenter - prevRightCenter) * 0.35;
                }

                // Soft preference near Middle C (60) when melodies have no extreme leap
                for (const ln of leftSlice) {
                    if (ln.pitch >= 62) cost += (ln.pitch - 61) * 1.4;
                }
                for (const rn of rightSlice) {
                    if (rn.pitch <= 57) cost += (58 - rn.pitch) * 1.4;
                }

                if (cost < bestCost) {
                    bestCost = cost;
                    bestSplit = s;
                }
            }

            for (let i = 0; i < m; i++) {
                const isLeft = i < bestSplit;
                cluster.notes[i].hand = isLeft ? "left" : "right";
                cluster.notes[i].clef = isLeft ? "bass" : "treble";
            }

            if (bestSplit > 0) {
                const lNotes = cluster.notes.slice(0, bestSplit);
                prevLeftCenter = lNotes.reduce((a, x) => a + x.pitch, 0) / lNotes.length;
            }
            if (bestSplit < m) {
                const rNotes = cluster.notes.slice(bestSplit);
                prevRightCenter = rNotes.reduce((a, x) => a + x.pitch, 0) / rNotes.length;
            }
        }

        return rawNotes;
    }

    /**
     * Ensures every note in `song` has ergonomic `hand`, `clef`, `finger`, `fingerLabel`, and `fingerColor`.
     * If all notes already carry valid `finger` (1..5) and `forceRecompute` is false, refreshes palette colors in O(N).
     */
    static ensureSongFingering(song, options = {}) {
        if (!song || !Array.isArray(song.notes) || song.notes.length === 0) {
            return song;
        }
        const allValid = !options.forceRecompute && song.notes.every(
            (n) => Number.isInteger(n.finger) && n.finger >= 1 && n.finger <= 5 && (n.hand === "left" || n.hand === "right")
        );
        if (allValid) {
            for (const n of song.notes) {
                n.pitch = this.clamp61(n.pitch !== undefined ? n.pitch : n.midi);
                const style = this.getFingerStyle(n.finger);
                n.fingerLabel = style.diagramLabel;
                n.fingerColor = style.primary;
                if (!n.clef) n.clef = n.hand === "left" ? "bass" : "treble";
            }
            return song;
        }
        return this.assignSongFingering(song, options);
    }

    /**
     * Full Pedagogical & Ergonomic Fingering Assignment for a Song JSON object.
     * Mutates `song.notes` in-place and returns `song`.
     */
    static assignSongFingering(song, options = {}) {
        if (!song || !Array.isArray(song.notes) || song.notes.length === 0) {
            return song;
        }

        const preserveLocked = options.preserveLocked !== false;

        // 1. Clamp all pitches to 61-key [36, 96] and normalize hand/clef
        for (const n of song.notes) {
            n.pitch = this.clamp61(n.pitch !== undefined ? n.pitch : n.midi);
            if (n.hand !== "left" && n.hand !== "right") {
                if (n.clef === "bass") n.hand = "left";
                else if (n.clef === "treble") n.hand = "right";
                else n.hand = n.pitch >= 60 ? "right" : "left";
            }
            if (!n.clef || (n.clef !== "bass" && n.clef !== "treble")) {
                n.clef = n.hand === "left" ? "bass" : "treble";
            }
        }

        // 2. Solve Right Hand and Left Hand independently via 2nd-Order Viterbi DP
        const rightNotes = song.notes.filter((n) => n.hand === "right");
        const leftNotes = song.notes.filter((n) => n.hand === "left");

        if (rightNotes.length > 0) {
            this._solveHandViterbi(rightNotes, "right", preserveLocked);
        }
        if (leftNotes.length > 0) {
            this._solveHandViterbi(leftNotes, "left", preserveLocked);
        }

        return song;
    }

    /**
     * Directed semitone interval for ordered finger pair (fa < fb):
     * Positive when fingers sit in their natural uncrossed keyboard order.
     */
    static _directedSpan(hand, fa, fb, pitchForFa, pitchForFb) {
        if (fa === fb) return Math.abs(pitchForFb - pitchForFa);
        if (fa < fb) {
            return hand === "right" ? (pitchForFb - pitchForFa) : (pitchForFa - pitchForFb);
        }
        return hand === "right" ? (pitchForFa - pitchForFb) : (pitchForFb - pitchForFa);
    }

    /**
     * Pairwise simultaneous or legato span cost between two distinct fingers (f1 != f2)
     */
    static _pairChordSpanCost(hand, f1, f2, p1, p2) {
        const fa = Math.min(f1, f2);
        const fb = Math.max(f1, f2);
        const pa = f1 < f2 ? p1 : p2;
        const pb = f1 < f2 ? p2 : p1;

        const d = this._directedSpan(hand, fa, fb, pa, pb);
        const limits = PAIR_SPAN_TABLE[`${fa}_${fb}`];
        if (!limits) return 0;

        const [minPrac, minComf, minRel, maxRel, maxComf, maxPrac] = limits;

        // Inside simultaneous chords, finger crossings (d <= 0) are physically awkward/impossible
        if (d <= 0) {
            return 80.0 + Math.abs(d) * 20.0;
        }

        let cost = 0;
        if (d < minRel) {
            cost += (minRel - d) * 0.85;
        } else if (d > maxRel) {
            cost += (d - maxRel) * 0.75;
        }

        if (d < minComf) {
            cost += (minComf - d) * 3.8;
        } else if (d > maxComf) {
            cost += (d - maxComf) * 3.6;
        }

        if (d < minPrac) {
            cost += (minPrac - d) * 16.0;
        } else if (d > maxPrac) {
            cost += (d - maxPrac) * 16.0;
        }

        // Physical white-key geometry refinement (e.g. E-F = 1 semitone but full 1.0 white-key width)
        const dx = Math.abs(this.whiteKeyCoord(pb) - this.whiteKeyCoord(pa));
        const naturalSteps = fb - fa;
        if (naturalSteps === 1 && fa >= 2 && dx >= 1.85) {
            // Adjacent non-thumb fingers (2-3, 3-4, 4-5) spanning a 3rd or wider inside a block chord
            cost += (dx - 1.0) * 1.65;
        } else if (dx > naturalSteps + 2.2) {
            cost += (dx - (naturalSteps + 2.2)) * 1.6;
        }

        return cost;
    }

    /**
     * Enumerates candidate finger assignments for an event's sorted unique pitches `pitches[0..k-1]` (ascending MIDI).
     * For Right Hand, ascending pitches receive ascending fingers [f0 < f1 < ...].
     * For Left Hand, ascending pitches receive descending fingers [f0 > f1 > ...] (Pinky on bass, Thumb on top).
     */
    static _generateCandidatesForEvent(uniquePitches, hand, lockedMap) {
        const k = uniquePitches.length;
        let rawCandidates = [];

        if (k <= 5) {
            const subsets = ORDERED_FINGER_SUBSETS[k];
            for (const sub of subsets) {
                const fingers = hand === "right" ? [...sub] : [...sub].reverse();
                rawCandidates.push(fingers);
            }
        } else {
            // Dense >5-note single-hand cluster fallback: map outer & inner voices cleanly onto 5 fingers
            const base = hand === "right" ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
            const mapped = uniquePitches.map((_, idx) => {
                const pos = Math.min(4, Math.floor((idx * 5) / k));
                return base[pos];
            });
            rawCandidates.push(mapped);
        }

        // Filter by any explicit locked fingers (e.g. from MusicXML <fingering>)
        if (lockedMap && lockedMap.size > 0) {
            const filtered = rawCandidates.filter((cand) => {
                for (let i = 0; i < k; i++) {
                    const locked = lockedMap.get(uniquePitches[i]);
                    if (locked !== undefined && cand[i] !== locked) return false;
                }
                return true;
            });
            if (filtered.length > 0) {
                rawCandidates = filtered;
            }
        }

        return rawCandidates.map((fingers) => {
            let anchorSum = 0;
            for (let i = 0; i < k; i++) {
                anchorSum += this.handAnchorX(uniquePitches[i], fingers[i], hand);
            }
            return {
                fingers,
                meanAnchorX: anchorSum / k
            };
        });
    }

    /**
     * Unary ergonomic cost of playing simultaneous event `ev` with candidate `cand`
     */
    static _computeEventUnaryCost(ev, cand, hand, prevEv, nextEv) {
        const pitches = ev.uniquePitches;
        const fingers = cand.fingers;
        const k = pitches.length;
        let cost = 0;

        const allBlack = pitches.every((p) => this.isBlackKey(p));

        for (let i = 0; i < k; i++) {
            const p = pitches[i];
            const f = fingers[i];
            const isBlack = this.isBlackKey(p);

            // 1. Black/White Topography (Chopin's Terrain Rule)
            if (isBlack) {
                if (f === 1) {
                    // Thumb on black key: costly in scalar runs unless entire chord/octave requires black keys
                    cost += (k >= 2 && (allBlack || (pitches[k - 1] - pitches[0] >= 11))) ? 1.1 : 3.1;
                } else if (f === 5) {
                    // Pinky on black key: slightly awkward in scales, natural on chord tops/peaks
                    cost += k >= 2 ? 0.35 : 1.15;
                } else {
                    // Long fingers (2, 3, 4) naturally fit elevated black keys
                    cost -= 0.32;
                }
            }

            // 2. Mild anatomical agility bias on single notes
            if (k === 1) {
                if (f === 4) cost += 0.24;
                else if (f === 5) {
                    // Do not penalize pinky at local melodic turning points (top for RH, bottom for LH)
                    const isTurningPeak =
                        (hand === "right" &&
                            (!prevEv || p >= prevEv.maxPitch) &&
                            (!nextEv || p >= nextEv.maxPitch)) ||
                        (hand === "left" &&
                            (!prevEv || p <= prevEv.minPitch) &&
                            (!nextEv || p <= nextEv.minPitch));
                    cost += isTurningPeak ? 0.02 : 0.34;
                } else if (f === 1) {
                    cost += 0.10;
                }
            }
        }

        // 3. Simultaneous Intra-Chord Pairwise Ergonomics
        if (k >= 2) {
            for (let i = 0; i < k; i++) {
                for (let j = i + 1; j < k; j++) {
                    cost += this._pairChordSpanCost(hand, fingers[i], fingers[j], pitches[i], pitches[j]);
                }
            }

            // Full hand-arch stability: block chords spanning >= 6 semitones (5th, 6th, 7th, octave)
            // naturally anchor between Thumb (1) and Pinky (5)
            const totalChordSpan = pitches[k - 1] - pitches[0];
            if (k >= 3 && totalChordSpan >= 6 && fingers.includes(1) && fingers.includes(5)) {
                cost -= 0.75;
            }

            // Penalize wrist-twisting configuration: Thumb on black key while an inner finger (2,3,4) is on white
            const thumbIdx = fingers.indexOf(1);
            if (thumbIdx >= 0 && this.isBlackKey(pitches[thumbIdx])) {
                const hasWhiteInner = pitches.some((p, idx) => idx !== thumbIdx && fingers[idx] <= 4 && !this.isBlackKey(p));
                if (hasWhiteInner) {
                    cost += 2.4;
                }
            }
        }

        return cost;
    }

    /**
     * Sequential pairwise transition cost between single voice `(p1, f1)` at `t-1` and `(p2, f2)` at `t`
     */
    static _singleVoiceTransitionCost(hand, p1, f1, p2, f2, dt, restGap, isStillHeld = false) {
        // Case 1: Exact repeated pitch
        if (p1 === p2) {
            if (dt < 0.13) {
                // Ultra-fast trill/tremolo: alternating neighbor fingers is slightly cleaner
                return f1 === f2 ? 1.1 : Math.abs(f1 - f2) * 0.45;
            }
            // Normal repeated notes (quarter/eighth notes): keep the SAME finger for clean muscle memory!
            return f1 === f2 ? 0.0 : (2.1 + Math.abs(f1 - f2) * 0.35);
        }

        // Case 2: Different pitch played with the SAME finger
        if (f1 === f2) {
            if (isStillHeld) return 18.0; // Physically impossible without releasing sustained note
            const semiDist = Math.abs(p2 - p1);
            const hopBase = restGap >= 0.35 ? 1.6 : 6.2;
            return hopBase + semiDist * 0.55;
        }

        // Case 3: Distinct fingers (f1 != f2) on distinct pitches (p1 != p2)
        const fa = Math.min(f1, f2);
        const fb = Math.max(f1, f2);
        const pa = f1 < f2 ? p1 : p2;
        const pb = f1 < f2 ? p2 : p1;
        const d = this._directedSpan(hand, fa, fb, pa, pb);
        const limits = PAIR_SPAN_TABLE[`${fa}_${fb}`];
        const [minPrac, minComf, minRel, maxRel, maxComf, maxPrac] = limits;

        let cost = 0;

        if (d < 0) {
            // Finger crossing!
            if (isStillHeld) {
                // Crossing while holding the other note down is severely constrained
                cost += 12.0 + Math.abs(d) * 4.0;
            } else if (fa === 1 && fb <= 4) {
                // Legitimate Thumb-Under or Finger-Over-Thumb scale/arpeggio crossing
                cost += 1.65 + Math.abs(d) * 0.58;
                if (d < minComf) cost += (minComf - d) * 2.8;
                if (d < minPrac) cost += (minPrac - d) * 10.0;

                const thumbPitch = pa;
                const otherPitch = pb;
                const thumbBlack = this.isBlackKey(thumbPitch);
                const otherBlack = this.isBlackKey(otherPitch);

                if (!thumbBlack && otherBlack) {
                    // Chopin black-key elevation advantage: thumb on white passing under black key (2/3/4)
                    cost -= 0.55;
                } else if (thumbBlack && !otherBlack) {
                    // Biomechanically awkward: tucking short thumb onto black key from white key
                    cost += 7.8;
                } else if (thumbBlack && otherBlack) {
                    cost += 3.5;
                }
            } else if (fa === 1 && fb === 5) {
                // Thumb-Pinky crossing is unpianistic
                cost += 11.5 + Math.abs(d) * 3.5;
            } else {
                // Non-thumb finger crossing (e.g. 3 over 4 or 2 over 3 in reversed order)
                cost += 12.5 + Math.abs(d) * 3.8;
            }
        } else {
            // Uncrossed transition (d > 0)
            if (d < minRel) cost += (minRel - d) * 0.55;
            else if (d > maxRel) cost += (d - maxRel) * 0.52;

            if (d < minComf) cost += (minComf - d) * 2.4;
            else if (d > maxComf) cost += (d - maxComf) * 2.5;

            if (d < minPrac) cost += (minPrac - d) * 9.5;
            else if (d > maxPrac) cost += (d - maxPrac) * 9.5;
        }

        // Consecutive 4-5 weak-finger step penalty in fast passages (Parncutt Rule 5/11)
        if ((fa === 4 && fb === 5) && dt < 0.35 && d > 3) {
            cost += (d - 3) * 1.4;
        }

        return cost;
    }

    /**
     * Full event-to-event transition cost between `(evPrev, candPrev)` and `(evCur, candCur)`
     */
    static _computeTransitionCost(evPrev, candPrev, evCur, candCur, hand) {
        const dt = Math.max(0.001, evCur.time - evPrev.time);
        const restGap = evCur.time - evPrev.endTime;

        // Phrase-breath attenuation: after a clear rest, the hand can lift and reposition comfortably
        let phraseWeight = 1.0;
        if (restGap >= 0.75 || dt >= 2.4) {
            phraseWeight = 0.28;
        } else if (restGap >= 0.35 || dt >= 1.5) {
            phraseWeight = 0.58;
        } else if (dt < 0.28) {
            phraseWeight = 1.18;
        }

        // 1. Hand-knuckle lateral shift economy (anchorX displacement)
        const anchorShift = Math.abs(candCur.meanAnchorX - candPrev.meanAnchorX);
        let cost = anchorShift * 0.72 * phraseWeight;

        const pPrev = evPrev.uniquePitches;
        const fPrev = candPrev.fingers;
        const pCur = evCur.uniquePitches;
        const fCur = candCur.fingers;

        // 2. Sustained-note overlap constraint (if previous notes are still physically held past evCur.time)
        const prevStillHeld = evPrev.endTime > evCur.time + 0.055;

        if (pPrev.length === 1 && pCur.length === 1) {
            cost += phraseWeight * this._singleVoiceTransitionCost(
                hand, pPrev[0], fPrev[0], pCur[0], fCur[0], dt, restGap, prevStillHeld
            );
            return cost;
        }

        // 3. Polyphonic / Chord transitions:
        //    Evaluate lead voice (top voice for RH, bass voice for LH) + inner/shared voices
        const leadPrevIdx = hand === "right" ? pPrev.length - 1 : 0;
        const leadCurIdx = hand === "right" ? pCur.length - 1 : 0;

        let leadTrans = this._singleVoiceTransitionCost(
            hand,
            pPrev[leadPrevIdx],
            fPrev[leadPrevIdx],
            pCur[leadCurIdx],
            fCur[leadCurIdx],
            dt,
            restGap,
            false
        );

        // Allow parallel chord/octave planing (e.g., 1-3-5 -> 1-2-5 -> 1-3-5 or 1-5 -> 1-5 across chords)
        if (pPrev.length >= 2 && pCur.length >= 2 && fPrev[leadPrevIdx] === fCur[leadCurIdx] && pPrev[leadPrevIdx] !== pCur[leadCurIdx]) {
            leadTrans *= (pPrev.length >= 3 && pCur.length >= 3) ? 0.16 : 0.35;
        }
        cost += phraseWeight * leadTrans * 0.75;

        // Outer opposite voice (thumb side) continuity
        if (pPrev.length >= 2 && pCur.length >= 2) {
            const innerPrevIdx = hand === "right" ? 0 : pPrev.length - 1;
            const innerCurIdx = hand === "right" ? 0 : pCur.length - 1;
            let baseTrans = this._singleVoiceTransitionCost(
                hand,
                pPrev[innerPrevIdx],
                fPrev[innerPrevIdx],
                pCur[innerCurIdx],
                fCur[innerCurIdx],
                dt,
                restGap,
                false
            );
            if (fPrev[innerCurIdx] !== undefined && fPrev[innerPrevIdx] === fCur[innerCurIdx] && pPrev[innerPrevIdx] !== pCur[innerCurIdx]) {
                baseTrans *= (pPrev.length >= 3 && pCur.length >= 3) ? 0.16 : 0.35;
            }
            cost += phraseWeight * baseTrans * 0.45;
        }

        // Common-tone finger consistency between adjacent chords/dyads
        for (let i = 0; i < pPrev.length; i++) {
            const sharedIdx = pCur.indexOf(pPrev[i]);
            if (sharedIdx >= 0) {
                if (fPrev[i] === fCur[sharedIdx]) {
                    cost -= 0.25; // Mild stability bonus when shared tone remains ergonomic
                } else if (prevStillHeld) {
                    cost += 4.0;
                }
            } else if (prevStillHeld) {
                // Previous pitch `pPrev[i]` is still held while `evCur` strikes new note(s): forbid reusing `fPrev[i]`
                if (fCur.includes(fPrev[i])) {
                    cost += 14.0;
                }
            }
        }

        return cost;
    }

    /**
     * 3-Event Trigram Cost `(t-2, t-1, t)` for scale group alternation, position-change minimization, and 3-4-5 strain
     */
    static _computeTrigramCost(ev0, cand0, ev1, cand1, ev2, cand2, hand) {
        let cost = 0;
        const dt01 = ev1.time - ev0.time;
        const dt12 = ev2.time - ev1.time;

        // Only apply tight melodic trigram rules within connected phrases
        if (dt01 > 1.4 || dt12 > 1.4) return 0;

        // 1. Parncutt Rule 6 (Unnecessary Position Jitter):
        //    Penalize shifting away from anchor0 at t-1 only to immediately snap back to anchor0 at t
        const shift01 = Math.abs(cand1.meanAnchorX - cand0.meanAnchorX);
        const shift12 = Math.abs(cand2.meanAnchorX - cand1.meanAnchorX);
        const shift02 = Math.abs(cand2.meanAnchorX - cand0.meanAnchorX);
        if (shift01 > 0.75 && shift12 > 0.75 && shift02 < 0.5) {
            cost += 1.65;
        }

        if (ev0.uniquePitches.length === 1 && ev1.uniquePitches.length === 1 && ev2.uniquePitches.length === 1) {
            const p0 = ev0.uniquePitches[0];
            const p1 = ev1.uniquePitches[0];
            const p2 = ev2.uniquePitches[0];
            const f0 = cand0.fingers[0];
            const f1 = cand1.fingers[0];
            const f2 = cand2.fingers[0];

            const monotonicAsc = p0 < p1 && p1 < p2;
            const monotonicDesc = p0 > p1 && p1 > p2;

            // 2. Scale Group Alternation Rule:
            //    Avoid awkward `1-2-1-2` two-finger scuttling in unidirectional scales; favor `1-2-3-1-2-3-4`!
            if ((monotonicAsc || monotonicDesc) && f0 === 1 && f2 === 1 && f1 === 2) {
                cost += 4.2;
            }
            if ((monotonicAsc || monotonicDesc) && f0 === f2 && Math.abs(p2 - p0) <= 4) {
                // Same finger reused two steps apart in a unidirectional scale (`3-2-3` on `C-D-E`)
                cost += 2.6;
            }

            // 3. Parncutt Rule 12 (`3-4-3` / `4-5-4` weak-finger rapid alternation when `2-3-2` or `3-4-3` on white keys is available)
            if (p0 === p2 && p0 !== p1 && dt01 < 0.35 && dt12 < 0.35) {
                if ((f0 === 4 && f1 === 5) || (f0 === 5 && f1 === 4)) {
                    // Allow 5-4-5 when the inner note is an elevated black key (e.g., Für Elise E5-D#5-E5!)
                    if (!this.isBlackKey(p1)) {
                        cost += 1.4;
                    }
                }
            }
        }

        return cost;
    }

    /**
     * Exact Global 2nd-Order Viterbi Dynamic Programming Solver for one hand ("right" or "left")
     */
    static _solveHandViterbi(handNotes, hand, preserveLocked = true) {
        // 1. Group simultaneous notes into ordered time-slice events
        const sorted = [...handNotes].sort((a, b) => (a.time - b.time) || (a.pitch - b.pitch));
        const events = [];

        for (const note of sorted) {
            const last = events[events.length - 1];
            if (last && Math.abs(note.time - last.time) <= CHORD_CLUSTER_SEC) {
                last.notes.push(note);
                last.endTime = Math.max(last.endTime, note.time + (note.duration || 0.4));
            } else {
                events.push({
                    time: note.time,
                    endTime: note.time + (note.duration || 0.4),
                    notes: [note]
                });
            }
        }

        // Prepare unique ascending pitches & locked constraints per event
        for (const ev of events) {
            ev.notes.sort((a, b) => a.pitch - b.pitch);
            const pitchSet = [];
            const lockedMap = new Map();
            for (const n of ev.notes) {
                if (pitchSet.length === 0 || pitchSet[pitchSet.length - 1] !== n.pitch) {
                    pitchSet.push(n.pitch);
                }
                if (preserveLocked && Number.isInteger(n.lockedFinger) && n.lockedFinger >= 1 && n.lockedFinger <= 5) {
                    lockedMap.set(n.pitch, n.lockedFinger);
                }
            }
            ev.uniquePitches = pitchSet;
            ev.minPitch = pitchSet[0];
            ev.maxPitch = pitchSet[pitchSet.length - 1];
            ev.candidates = this._generateCandidatesForEvent(pitchSet, hand, lockedMap);
        }

        const T = events.length;
        if (T === 0) return;

        // Precompute unary event costs
        for (let t = 0; t < T; t++) {
            const ev = events[t];
            const prevEv = t > 0 ? events[t - 1] : null;
            const nextEv = t + 1 < T ? events[t + 1] : null;
            ev.unaryCosts = ev.candidates.map((cand) =>
                this._computeEventUnaryCost(ev, cand, hand, prevEv, nextEv)
            );
        }

        // Single-event trivial case
        if (T === 1) {
            let bestIdx = 0;
            for (let c = 1; c < events[0].candidates.length; c++) {
                if (events[0].unaryCosts[c] < events[0].unaryCosts[bestIdx]) {
                    bestIdx = c;
                }
            }
            this._applyEventSolution(events[0], events[0].candidates[bestIdx]);
            return;
        }

        // t = 1 initialization: dpPrev[c0][c1] = cost of (cand c0 at t=0, cand c1 at t=1)
        const C0 = events[0].candidates.length;
        const C1 = events[1].candidates.length;
        let dpPrev = Array.from({ length: C0 }, () => new Float64Array(C1));
        const backpointers = []; // backpointers[t] (for t >= 2) has shape [C_{t-1}][C_t] -> best c_{t-2}

        for (let c0 = 0; c0 < C0; c0++) {
            for (let c1 = 0; c1 < C1; c1++) {
                const trans = this._computeTransitionCost(
                    events[0], events[0].candidates[c0],
                    events[1], events[1].candidates[c1],
                    hand
                );
                dpPrev[c0][c1] = events[0].unaryCosts[c0] + events[1].unaryCosts[c1] + trans;
            }
        }

        // Forward 2nd-Order Viterbi recursion for t = 2 .. T-1
        for (let t = 2; t < T; t++) {
            const ev0 = events[t - 2];
            const ev1 = events[t - 1];
            const ev2 = events[t];
            const n0 = ev0.candidates.length;
            const n1 = ev1.candidates.length;
            const n2 = ev2.candidates.length;

            const dpCur = Array.from({ length: n1 }, () => new Float64Array(n2));
            const bpCur = Array.from({ length: n1 }, () => new Int16Array(n2));

            for (let c1 = 0; c1 < n1; c1++) {
                const cand1 = ev1.candidates[c1];
                for (let c2 = 0; c2 < n2; c2++) {
                    const cand2 = ev2.candidates[c2];
                    const baseTrans = ev2.unaryCosts[c2] + this._computeTransitionCost(ev1, cand1, ev2, cand2, hand);

                    let bestTotal = Infinity;
                    let bestC0 = 0;

                    for (let c0 = 0; c0 < n0; c0++) {
                        const prevScore = dpPrev[c0][c1];
                        const trigram = this._computeTrigramCost(
                            ev0, ev0.candidates[c0],
                            ev1, cand1,
                            ev2, cand2,
                            hand
                        );
                        const total = prevScore + baseTrans + trigram;
                        if (total < bestTotal) {
                            bestTotal = total;
                            bestC0 = c0;
                        }
                    }

                    dpCur[c1][c2] = bestTotal;
                    bpCur[c1][c2] = bestC0;
                }
            }

            dpPrev = dpCur;
            backpointers.push(bpCur);
        }

        // Backtrack globally optimal path
        const chosenIndices = new Array(T);
        let bestFinalCost = Infinity;
        let bestSecondLast = 0;
        let bestLast = 0;

        const nSecondLast = events[T - 2].candidates.length;
        const nLast = events[T - 1].candidates.length;
        for (let c1 = 0; c1 < nSecondLast; c1++) {
            for (let c2 = 0; c2 < nLast; c2++) {
                if (dpPrev[c1][c2] < bestFinalCost) {
                    bestFinalCost = dpPrev[c1][c2];
                    bestSecondLast = c1;
                    bestLast = c2;
                }
            }
        }

        chosenIndices[T - 2] = bestSecondLast;
        chosenIndices[T - 1] = bestLast;

        for (let t = T - 1; t >= 2; t--) {
            const bp = backpointers[t - 2];
            chosenIndices[t - 2] = bp[chosenIndices[t - 1]][chosenIndices[t]];
        }

        // Write optimal fingerings & colors onto every note in each event
        for (let t = 0; t < T; t++) {
            this._applyEventSolution(events[t], events[t].candidates[chosenIndices[t]]);
        }
    }

    static _applyEventSolution(ev, chosenCandidate) {
        const pitchToFinger = new Map();
        for (let i = 0; i < ev.uniquePitches.length; i++) {
            pitchToFinger.set(ev.uniquePitches[i], chosenCandidate.fingers[i]);
        }

        for (const note of ev.notes) {
            const finger = pitchToFinger.get(note.pitch) || 1;
            const style = this.getFingerStyle(finger);
            note.finger = finger;
            note.fingerLabel = style.diagramLabel;
            note.fingerColor = style.primary;
        }
    }
}
