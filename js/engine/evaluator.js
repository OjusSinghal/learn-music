/**
 * Real-Time Yousician Polyphonic Note & Chord Evaluator
 * Evaluates single notes, intervals, two-hand strikes, and full chords against the active song score.
 * Supports:
 * - Flow Mode: Simultaneous multi-note matching within timing windows (Soft Sage = Perfect, Warm Champagne = Early/Late, Subtle Slate/Ghost = Wrong/Missed)
 * - Wait Mode: Pauses at target note/chord, lighting up each constituent chord note as struck and advancing once the beat is complete
 */

export class NoteEvaluator {
    constructor(options = {}) {
        this.mode = options.mode || "flow"; // "flow" | "wait"
        this.perfectWindowSec = 0.14; // +/- 140ms
        this.goodWindowSec = 0.28;    // +/- 280ms
        // Ukulele multi-string strum arpeggio stagger tolerance (95ms across strings of one strum)
        this.strumStaggerToleranceSec = 0.095;

        // Independent Left Hand (lower / bass / ukulele chords) & Right Hand (upper / treble / ukulele melody) toggles
        this.activeHands = {
            left: options.leftHand !== undefined ? Boolean(options.leftHand) : true,
            right: options.rightHand !== undefined ? Boolean(options.rightHand) : true
        };
        this._maxLeftPitch = 59;
        this._minRightPitch = 60;

        this.song = null;
        this.notes = [];
        this.unhitNotes = [];
        this.currentWaitNote = null;
        this.currentWaitChord = [];

        // Callbacks
        this.onHit = options.onHit || null;
        this.onMiss = options.onMiss || null;
        this.onScoreUpdate = options.onScoreUpdate || null;
        this.onWaitTargetChange = options.onWaitTargetChange || null;

        // Scoring state
        this.score = 0;
        this.streak = 0;
        this.multiplier = 1;
        this.noteStats = { perfect: 0, good: 0, wrong: 0, missed: 0 };
    }

    /**
     * Resolves which hand ("left" = lower/bass staff or ukulele chords, "right" = upper/treble staff or ukulele melody) owns a score note.
     */
    static getNoteHand(note) {
        if (!note) return "right";
        if (note.hand === "left" || note.hand === "right") return note.hand;
        if (note.lane === "chords") return "left";
        if (note.lane === "melody") return "right";
        if (note.clef === "bass") return "left";
        if (note.clef === "treble") return "right";
        return note.pitch >= 60 ? "right" : "left";
    }

    /**
     * Returns true when the loaded piece is a Ukulele song/arrangement.
     */
    isUkuleleSong() {
        return Boolean(this.song && this.song.instrument === "ukulele");
    }

    /**
     * Returns true if `note` belongs to a multi-string ukulele strum/chord cluster.
     */
    _isUkuleleStrumNote(note) {
        if (!this.isUkuleleSong() || !note) return false;
        if (note.chordGroupId || note.isChordNote) return true;
        for (let i = 0; i < this.notes.length; i++) {
            const other = this.notes[i];
            if (other !== note && Math.abs(other.time - note.time) <= 0.055) {
                return true;
            }
        }
        return false;
    }

    /**
     * Finds simultaneous pending enabled-hand sibling notes sharing the exact same pitch
     * (e.g., High-G ukulele unison chords like F [2,0,1,0], Am [2,0,0,0], G [0,2,3,2], D [2,2,2,0]
     * where two physical strings ring the same MIDI pitch on one strum).
     */
    _findUkuleleUnisonSiblings(matchedNote) {
        if (!this.isUkuleleSong() || !matchedNote) return [];
        const siblings = [];
        for (let i = 0; i < this.notes.length; i++) {
            const sib = this.notes[i];
            if (
                sib === matchedNote ||
                sib.state !== "pending" ||
                sib.pitch !== matchedNote.pitch ||
                !this.isNoteHandEnabled(sib)
            ) {
                continue;
            }
            const sameGroup = Boolean(matchedNote.chordGroupId && sib.chordGroupId === matchedNote.chordGroupId);
            const simultaneous = Math.abs(sib.time - matchedNote.time) <= 0.055;
            if (sameGroup || simultaneous) {
                siblings.push(sib);
            }
        }
        return siblings;
    }

    /**
     * Returns the earliest hit timestamp of an already-hit sibling string in the same ukulele strum cluster.
     */
    _getStrumAnchorHitTime(cand) {
        if (!this.isUkuleleSong() || !cand) return null;
        const candHand = NoteEvaluator.getNoteHand(cand);
        let earliestHit = null;
        for (let i = 0; i < this.notes.length; i++) {
            const n = this.notes[i];
            if (n === cand || n.state !== "correct" || typeof n.hitTime !== "number") continue;
            const sameGroup = Boolean(cand.chordGroupId && n.chordGroupId === cand.chordGroupId);
            const simultaneousSameHand = Math.abs(n.time - cand.time) <= 0.055 && NoteEvaluator.getNoteHand(n) === candHand;
            if (sameGroup || simultaneousSameHand) {
                if (earliestHit === null || n.hitTime < earliestHit) {
                    earliestHit = n.hitTime;
                }
            }
        }
        return earliestHit;
    }

    /**
     * Returns true if the hand assigned to `note` is currently toggled ON.
     */
    isNoteHandEnabled(note) {
        const hand = NoteEvaluator.getNoteHand(note);
        return hand === "left" ? Boolean(this.activeHands.left) : Boolean(this.activeHands.right);
    }

    /**
     * Updates active hand toggles ({ left, right }).
     * When `currentTime` is supplied mid-song, any already-elapsed pending notes on newly enabled
     * hands are marked "skipped" so they never trigger retroactive MISSED penalties or Wait rewinds.
     */
    setActiveHands(hands = {}, currentTime = null) {
        if (hands.left !== undefined) {
            this.activeHands.left = Boolean(hands.left);
        }
        if (hands.right !== undefined) {
            this.activeHands.right = Boolean(hands.right);
        }

        if (typeof currentTime === "number" && Array.isArray(this.notes)) {
            const pastCutoff = this.mode === "wait" ? 0.055 : this.goodWindowSec;
            this.notes.forEach((n) => {
                if (n.state === "pending" && currentTime - n.time > pastCutoff) {
                    n.state = "skipped";
                }
            });
        }

        this._refreshWaitTargets();
        return { ...this.activeHands };
    }

    getActiveHands() {
        return { ...this.activeHands };
    }

    _computeHandPitchBounds() {
        let maxLeft = -Infinity;
        let minRight = Infinity;
        for (const n of this.notes) {
            const hand = NoteEvaluator.getNoteHand(n);
            if (hand === "left" && n.pitch > maxLeft) maxLeft = n.pitch;
            if (hand === "right" && n.pitch < minRight) minRight = n.pitch;
        }
        this._maxLeftPitch = Number.isFinite(maxLeft) ? maxLeft : 59;
        this._minRightPitch = Number.isFinite(minRight) ? minRight : 60;
    }

    setMode(mode) {
        this.mode = mode; // "flow" or "wait"
        this._refreshWaitTargets();
    }

    loadSong(song) {
        this.song = song;
        this.notes = song.notes.map((n, idx) => ({
            ...n,
            index: idx,
            state: "pending", // "pending" | "correct" | "wrong" | "skipped"
            hitTime: null,
            hitQuality: null
        }));
        this.unhitNotes = [...this.notes];
        this._computeHandPitchBounds();
        this.score = 0;
        this.streak = 0;
        this.multiplier = 1;
        this.noteStats = { perfect: 0, good: 0, wrong: 0, missed: 0 };

        this._refreshWaitTargets();
    }

    reset() {
        if (this.song) {
            this.loadSong(this.song);
        }
    }

    _refreshWaitTargets() {
        const nextPending = this.notes.find((n) => n.state === "pending" && this.isNoteHandEnabled(n)) || null;
        this.currentWaitNote = nextPending;
        if (nextPending) {
            this.currentWaitChord = this.notes.filter(
                (n) =>
                    n.state === "pending" &&
                    this.isNoteHandEnabled(n) &&
                    Math.abs(n.time - nextPending.time) <= 0.055
            );
        } else {
            this.currentWaitChord = [];
        }

        if (this.onWaitTargetChange && this.mode === "wait") {
            this.onWaitTargetChange(this.currentWaitNote, this.currentWaitChord);
        }
    }

    /**
     * Returns true if `currentTime` is still in the pre-song count-in lead-in
     * (before the timing window of the earliest enabled-hand note in the score).
     */
    isInLeadIn(currentTime) {
        if (!this.notes || this.notes.length === 0) return false;
        let firstTime = Infinity;
        for (let i = 0; i < this.notes.length; i++) {
            if (!this.isNoteHandEnabled(this.notes[i])) continue;
            if (this.notes[i].time < firstTime) firstTime = this.notes[i].time;
        }
        if (!Number.isFinite(firstTime)) return false;
        return currentTime < firstTime - this.goodWindowSec;
    }

    /**
     * Returns expected MIDI pitches near `currentTime` for Score-Informed Harmonic Verification
     * (restricted strictly to currently enabled hands).
     */
    getExpectedMidisAtTime(currentTime) {
        if (!this.notes || this.notes.length === 0) return null;
        if (!this.activeHands.left && !this.activeHands.right) return null;

        if (this.mode === "wait") {
            const nextPending = this.notes.find((n) => n.state === "pending" && this.isNoteHandEnabled(n));
            if (!nextPending) return null;
            if (currentTime < nextPending.time - 0.32) return null;
            const chord = this.notes.filter(
                (n) =>
                    n.state === "pending" &&
                    this.isNoteHandEnabled(n) &&
                    Math.abs(n.time - nextPending.time) <= 0.055
            );
            return Array.from(new Set(chord.map((n) => n.pitch)));
        }

        // Flow Mode: look within +/- 320ms of playhead on enabled hands
        const nearby = this.notes.filter(
            (n) =>
                n.state === "pending" &&
                this.isNoteHandEnabled(n) &&
                Math.abs(currentTime - n.time) <= 0.32
        );
        if (nearby.length === 0) return null;
        return Array.from(new Set(nearby.map((n) => n.pitch)));
    }

    /**
     * Check if playback should pause for Wait Mode
     * @param {number} currentTime - Current song time in seconds
     * @returns {boolean} - True if engine should pause/freeze at target note/chord
     */
    shouldWaitAtTime(currentTime) {
        if (this.mode !== "wait") return false;

        // Mark disabled-hand notes that have scrolled past as "skipped"
        for (let i = 0; i < this.notes.length; i++) {
            const n = this.notes[i];
            if (n.state === "pending" && !this.isNoteHandEnabled(n) && currentTime - n.time > 0.055) {
                n.state = "skipped";
            }
        }

        const nextPending = this.notes.find((n) => n.state === "pending" && this.isNoteHandEnabled(n));
        if (!nextPending) {
            this.currentWaitNote = null;
            this.currentWaitChord = [];
            return false;
        }

        this.currentWaitNote = nextPending;
        this.currentWaitChord = this.notes.filter(
            (n) =>
                n.state === "pending" &&
                this.isNoteHandEnabled(n) &&
                Math.abs(n.time - nextPending.time) <= 0.055
        );

        if (this.onWaitTargetChange) {
            this.onWaitTargetChange(this.currentWaitNote, this.currentWaitChord);
        }

        return currentTime >= nextPending.time;
    }

    /**
     * Backward-compatible single-note evaluation entry point
     */
    evaluatePlayedNote(playedMidi, currentTime) {
        const res = this.evaluatePlayedNotes([playedMidi], currentTime);
        return res && res.results && res.results.length > 0 ? res.results[0] : null;
    }

    /**
     * Polyphonic Multi-Note Evaluation: Evaluates an array of simultaneously detected MIDI pitches
     * @param {number[]} playedMidis - Array of MIDI note numbers detected on this onset/frame
     * @param {number} currentTime - Song timestamp in seconds
     * @returns {Object|null} - { results, hitMidis, wrongMidis, chordCompleted }
     */
    evaluatePlayedNotes(playedMidis, currentTime) {
        if (!this.notes || this.notes.length === 0 || !Array.isArray(playedMidis) || playedMidis.length === 0) {
            return null;
        }
        // When both hands are toggled off, suppress all note accuracy reporting
        if (!this.activeHands.left && !this.activeHands.right) {
            return null;
        }

        const uniqueMidis = Array.from(new Set(playedMidis));
        if (this.mode === "wait") {
            return this.evaluateWaitModeMulti(uniqueMidis, currentTime);
        }
        return this.evaluateFlowModeMulti(uniqueMidis, currentTime);
    }

    /**
     * Check if a pitch belongs to an already-hit sustained note still ringing across the playhead
     */
    _isSustainedPreviousHit(midi, currentTime) {
        return this.notes.some(
            (n) =>
                n.state === "correct" &&
                n.pitch === midi &&
                currentTime >= n.time - 0.08 &&
                currentTime <= n.time + (n.duration || 0.45) + 0.35
        );
    }

    /**
     * Checks whether an unmatched pitch belongs to a toggled-off hand (either matching a score note
     * on the disabled staff near `currentTime` or played clearly inside the disabled hand's register)
     * so the toggled-off hand never reports hits or wrong-note accuracy events.
     */
    _shouldIgnoreDisabledHandInput(midi, currentTime) {
        if (!this.activeHands.left && !this.activeHands.right) {
            return true;
        }

        // 1. Exact pitch match against any score note belonging to a disabled hand near currentTime
        const matchesDisabledScoreNote = this.notes.some(
            (n) =>
                !this.isNoteHandEnabled(n) &&
                n.pitch === midi &&
                currentTime >= n.time - (this.goodWindowSec + 0.12) &&
                currentTime <= n.time + (n.duration || 0.45) + 0.35
        );
        if (matchesDisabledScoreNote) {
            return true;
        }

        // 2. Register guard when practicing a single hand individually (Piano only — Ukulele melody & chords share C4–A5)
        if (!this.isUkuleleSong()) {
            if (this.activeHands.left && !this.activeHands.right) {
                const rightRegisterStart = Math.max(62, (this._maxLeftPitch ?? 59) + 5);
                if (midi >= rightRegisterStart) return true;
            } else if (this.activeHands.right && !this.activeHands.left) {
                const leftRegisterEnd = Math.min(57, (this._minRightPitch ?? 60) - 5);
                if (midi <= leftRegisterEnd) return true;
            }
        }

        return false;
    }

    /**
     * Polyphonic Wait Mode Evaluation:
     * Matches each detected pitch in `playedMidis` against the frozen chord/beat cluster
     * of currently enabled hands. Unfreezes playback once all enabled-hand notes in the beat are hit!
     */
    evaluateWaitModeMulti(playedMidis, currentTime) {
        const target =
            (this.currentWaitNote && this.isNoteHandEnabled(this.currentWaitNote) ? this.currentWaitNote : null) ||
            this.notes.find((n) => n.state === "pending" && this.isNoteHandEnabled(n));
        if (!target) return null;

        const targetTime = target.time;
        const simultaneousNotes = this.notes.filter(
            (n) => this.isNoteHandEnabled(n) && Math.abs(n.time - targetTime) <= 0.055
        );
        const results = [];
        const hitMidis = [];
        const wrongMidis = [];

        for (const playedMidi of playedMidis) {
            const pendingAtBeat = simultaneousNotes.filter((n) => n.state === "pending");
            const matchedNote = pendingAtBeat.find((n) => n.pitch === playedMidi);

            if (matchedNote) {
                const toCredit = [matchedNote];
                if (this.isUkuleleSong()) {
                    const unisonSiblings = this._findUkuleleUnisonSiblings(matchedNote);
                    for (let s = 0; s < unisonSiblings.length; s++) {
                        toCredit.push(unisonSiblings[s]);
                    }
                }

                for (let k = 0; k < toCredit.length; k++) {
                    const hitNote = toCredit[k];
                    hitNote.state = "correct";
                    hitNote.hitTime = currentTime;
                    hitNote.hitQuality = "PERFECT";

                    this.streak++;
                    this.multiplier = Math.min(4, Math.floor(this.streak / 4) + 1);
                    this.score += 100 * this.multiplier;
                    this.noteStats.perfect++;

                    const itemRes = {
                        status: "PERFECT",
                        color: "#6EE7B7",
                        note: hitNote,
                        playedMidi,
                        isCorrect: true
                    };
                    results.push(itemRes);
                    if (k === 0) hitMidis.push(playedMidi);

                    if (this.onHit) this.onHit(hitNote, "PERFECT", "#6EE7B7", 0);
                }
            } else {
                // Ignore if already hit at this chord beat, ringing from previous hit, or belonging to a disabled hand
                const alreadyHitAtBeat = simultaneousNotes.some((n) => n.pitch === playedMidi);
                if (
                    alreadyHitAtBeat ||
                    this._isSustainedPreviousHit(playedMidi, currentTime) ||
                    this._shouldIgnoreDisabledHandInput(playedMidi, currentTime)
                ) {
                    continue;
                }

                this.streak = 0;
                this.multiplier = 1;
                this.noteStats.wrong++;

                const itemRes = {
                    status: "WRONG NOTE",
                    color: "#94A3B8",
                    playedMidi,
                    targetMidi: target.pitch,
                    isCorrect: false
                };
                results.push(itemRes);
                wrongMidis.push(playedMidi);

                if (this.onMiss) this.onMiss(playedMidi, "WRONG NOTE", "#94A3B8", null);
            }
        }

        const remainingAtBeat = simultaneousNotes.filter((n) => n.state === "pending");
        const chordCompleted = remainingAtBeat.length === 0;

        if (chordCompleted) {
            // Mark any simultaneous disabled-hand notes at this beat as "skipped"
            this.notes.forEach((n) => {
                if (n.state === "pending" && !this.isNoteHandEnabled(n) && Math.abs(n.time - targetTime) <= 0.055) {
                    n.state = "skipped";
                }
            });
        }

        if (hitMidis.length > 0 || wrongMidis.length > 0) {
            if (this.onScoreUpdate) {
                this.onScoreUpdate(this.score, this.streak, this.multiplier);
            }
        }

        this._refreshWaitTargets();

        if (results.length === 0) return null;
        return {
            results,
            hitMidis,
            wrongMidis,
            chordCompleted
        };
    }

    /**
     * Polyphonic Flow Mode Evaluation:
     * Simultaneously scores played pitches against enabled-hand pending notes inside the timing window.
     */
    evaluateFlowModeMulti(playedMidis, currentTime) {
        const results = [];
        const hitMidis = [];
        const wrongMidis = [];
        const isUku = this.isUkuleleSong();

        for (const playedMidi of playedMidis) {
            const candidateNotes = this.notes.filter((n) => {
                if (n.state !== "pending") return false;
                if (!this.isNoteHandEnabled(n)) return false;
                const absDiff = Math.abs(currentTime - n.time);
                if (absDiff <= this.goodWindowSec) return true;

                // Ukulele strum stagger tolerance (<= 95ms across strings of a strummed chord cluster)
                if (isUku && this._isUkuleleStrumNote(n)) {
                    const anchorHit = this._getStrumAnchorHitTime(n);
                    if (
                        anchorHit !== null &&
                        Math.abs(currentTime - anchorHit) <= this.strumStaggerToleranceSec &&
                        absDiff <= this.goodWindowSec + this.strumStaggerToleranceSec
                    ) {
                        return true;
                    }
                    // Allow slight late strum-aggregation margin on trailing arpeggio strings
                    if (
                        anchorHit === null &&
                        currentTime >= n.time - this.goodWindowSec &&
                        currentTime <= n.time + this.goodWindowSec + 0.045
                    ) {
                        return true;
                    }
                }
                return false;
            });

            // Match closest pending note of this exact pitch
            let match = null;
            let bestAbsDiff = Infinity;
            for (const cand of candidateNotes) {
                if (cand.pitch === playedMidi) {
                    const d = Math.abs(currentTime - cand.time);
                    if (d < bestAbsDiff) {
                        bestAbsDiff = d;
                        match = cand;
                    }
                }
            }

            if (match) {
                const timeDiff = currentTime - match.time;
                let absDiff = Math.abs(timeDiff);
                if (isUku && this._isUkuleleStrumNote(match)) {
                    const anchorHit = this._getStrumAnchorHitTime(match);
                    if (anchorHit !== null && Math.abs(currentTime - anchorHit) <= this.strumStaggerToleranceSec) {
                        absDiff = Math.min(absDiff, Math.abs(anchorHit - match.time));
                    }
                }

                let hitStatus = "PERFECT";
                let hitColor = "#6EE7B7";
                let points = 100;

                if (absDiff > this.perfectWindowSec) {
                    hitStatus = timeDiff < 0 ? "EARLY" : "LATE";
                    hitColor = "#E2C98A";
                    points = 60;
                }

                const toCredit = [match];
                if (isUku) {
                    const unisonSiblings = this._findUkuleleUnisonSiblings(match);
                    for (let s = 0; s < unisonSiblings.length; s++) {
                        toCredit.push(unisonSiblings[s]);
                    }
                }

                for (let k = 0; k < toCredit.length; k++) {
                    const hitNote = toCredit[k];
                    hitNote.state = "correct";
                    hitNote.hitTime = currentTime;
                    hitNote.hitQuality = hitStatus;

                    if (hitStatus === "PERFECT") {
                        this.noteStats.perfect++;
                    } else {
                        this.noteStats.good++;
                    }

                    this.streak++;
                    this.multiplier = Math.min(4, Math.floor(this.streak / 4) + 1);
                    this.score += points * this.multiplier;

                    const itemRes = {
                        status: hitStatus,
                        color: hitColor,
                        note: hitNote,
                        playedMidi,
                        deltaMs: Math.round(timeDiff * 1000),
                        isCorrect: true
                    };
                    results.push(itemRes);
                    if (k === 0) hitMidis.push(playedMidi);

                    if (this.onHit) this.onHit(hitNote, hitStatus, hitColor, timeDiff);
                }
            } else {
                // Ignore sustained notes from earlier hits, duplicate chord detections, or disabled-hand notes
                if (
                    this._isSustainedPreviousHit(playedMidi, currentTime) ||
                    this._shouldIgnoreDisabledHandInput(playedMidi, currentTime)
                ) {
                    continue;
                }

                this.streak = 0;
                this.multiplier = 1;
                this.noteStats.wrong++;

                const itemRes = {
                    status: "WRONG NOTE",
                    color: "#94A3B8",
                    playedMidi,
                    isCorrect: false
                };
                results.push(itemRes);
                wrongMidis.push(playedMidi);

                if (this.onMiss) this.onMiss(playedMidi, "WRONG NOTE", "#94A3B8", null);
            }
        }

        if (hitMidis.length > 0 || wrongMidis.length > 0) {
            if (this.onScoreUpdate) {
                this.onScoreUpdate(this.score, this.streak, this.multiplier);
            }
        }

        if (results.length === 0) return null;
        return {
            results,
            hitMidis,
            wrongMidis,
            chordCompleted: hitMidis.length > 0
        };
    }

    /**
     * Check for notes that passed playhead without being hit (Flow Mode only).
     * Notes on a toggled-off hand silently transition to "skipped" without reporting accuracy.
     */
    checkMissedNotes(currentTime) {
        if (this.mode === "wait") return;
        const isUku = this.isUkuleleSong();

        this.notes.forEach((note) => {
            if (note.state === "pending") {
                const missWindow = (isUku && this._isUkuleleStrumNote(note))
                    ? (this.goodWindowSec + this.strumStaggerToleranceSec)
                    : this.goodWindowSec;
                if (currentTime - note.time > missWindow) {
                    if (!this.isNoteHandEnabled(note)) {
                        note.state = "skipped";
                        return;
                    }

                    note.state = "wrong";
                    note.hitQuality = "MISSED";
                    this.streak = 0;
                    this.multiplier = 1;
                    this.noteStats.missed++;

                    if (this.onMiss) {
                        this.onMiss(note.pitch, "MISSED", "#64748B", note);
                    }
                    if (this.onScoreUpdate) {
                        this.onScoreUpdate(this.score, this.streak, this.multiplier);
                    }
                }
            }
        });
    }
}
