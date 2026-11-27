/**
 * Yousician Game & Play-Along Controller
 * Manages song timeline, precision audio scheduling, stereo headphone backing accompaniment,
 * keyboard synchronization, tempo scaling, scoring, and end-of-piece completion lifecycle.
 *
 * Audio Architecture (Headphone Play-Along Split):
 * - `backingAudioEnabled` (default `true`): Controls `BackingTrackEngine` (warm stereo pads,
 *   strings, bass, and subtle groove). ALWAYS plays when `isPlaying && !isWaiting` by default!
 * - `referenceAudioEnabled` (default `true`, `#btnPlayAlongToggle`): Controls ONLY whether
 *   the piano score guide notes (`synth.playNote`) are played as they cross the playhead.
 */

import { NoteEvaluator } from "./evaluator.js";
import { PianoFingeringEngine } from "./fingering.js";
import { BackingTrackEngine } from "../audio/backing_track.js";

const UKULELE_FINGER_STYLES = {
    0: { finger: 0, diagramLabel: "O", name: "Open",   primary: "#48A870", light: "#74C695", dark: "#2F8554", text: "#FFFFFF" },
    1: { finger: 1, diagramLabel: "1", name: "Index",  primary: "#F0C830", light: "#F8E080", dark: "#C89D14", text: "#FFFFFF" },
    2: { finger: 2, diagramLabel: "2", name: "Middle", primary: "#6848F8", light: "#B0A0F8", dark: "#4C2FD9", text: "#FFFFFF" },
    3: { finger: 3, diagramLabel: "3", name: "Ring",   primary: "#4090F8", light: "#98D8F8", dark: "#256EE0", text: "#FFFFFF" },
    4: { finger: 4, diagramLabel: "4", name: "Pinky",  primary: "#E86078", light: "#F0A8B8", dark: "#C93B56", text: "#FFFFFF" }
};

function _nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}

function _requestFrame(cb) {
    if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(cb);
    }
    return null;
}

function _cancelFrame(id) {
    if (id !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(id);
    }
}

export class GameEngine {
    constructor(renderer, keyboard, synth, options = {}) {
        this.instrument = options.instrument === "ukulele" ? "ukulele" : "piano";
        this.renderer = renderer || null;
        this.keyboard = keyboard || null;
        this.synth = synth || null;

        if (this.keyboard) {
            this.keyboard.getFingerStyleForMidi = (midi) => this._resolveFingerStyleForMidi(midi);
        }

        this.song = null;
        this.songDuration = 10;
        this.isPlaying = false;
        this.currentTime = 0;
        this.startTime = 0;
        this.leadInBeats = 0;
        this.firstNoteTime = 0;
        this.baseBpm = 100;
        this.tempoMultiplier = 1.0; // 0.25 to 2.0
        this.metronomeEnabled = options.metronomeEnabled !== undefined ? Boolean(options.metronomeEnabled) : true;

        // Strict split: Play-Along piano score notes vs Always-On Song Backing Music
        this.referenceAudioEnabled = options.referenceAudioEnabled !== undefined
            ? Boolean(options.referenceAudioEnabled)
            : true;
        this.backingAudioEnabled = options.backingAudioEnabled !== undefined
            ? Boolean(options.backingAudioEnabled)
            : true;
        this.backingVolume = typeof options.backingVolume === "number"
            ? Math.max(0, Math.min(1, options.backingVolume))
            : 0.65;

        this.backingTrack = options.backingTrack
            || (this.synth && this.synth.backingTrack)
            || new BackingTrackEngine(this.synth, {
                enabled: this.backingAudioEnabled,
                volume: this.backingVolume
            });
        if (this.synth && !this.synth.backingTrack) {
            this.synth.backingTrack = this.backingTrack;
        }
        this.backingTrack.setEnabled(this.backingAudioEnabled);
        this.backingTrack.setVolume(this.backingVolume);

        this.mode = options.mode || "flow"; // "flow" | "wait"
        this.isWaiting = false;
        this.activeHands = {
            left: options.activeHands && options.activeHands.left !== undefined ? Boolean(options.activeHands.left) : true,
            right: options.activeHands && options.activeHands.right !== undefined ? Boolean(options.activeHands.right) : true
        };

        // End-of-song completion & streak tracking
        this._songCompletedFired = false;
        this.maxStreak = 0;

        // Note Evaluator for real-time polyphonic scoring
        this.evaluator = new NoteEvaluator({
            mode: this.mode,
            leftHand: this.activeHands.left,
            rightHand: this.activeHands.right,
            onHit: (note, status, color, delta) => this.handleHit(note, status, color, delta),
            onMiss: (pitch, status, color, note) => this.handleMiss(pitch, status, color, note),
            onScoreUpdate: (score, streak, mult) => this.handleScoreUpdate(score, streak, mult),
            onWaitTargetChange: (target, chord) => this.handleWaitTarget(target, chord)
        });

        // Scheduled reference notes
        this.scheduledNoteIndices = new Set();
        this.lastBeatNumber = null;

        // Loop animation frame handle
        this.animFrameId = null;
        this.lastFrameTime = _nowMs();

        // Callback hooks
        this.onTimeUpdate = options.onTimeUpdate || null;
        this.onScoreChange = options.onScoreChange || null;
        this.onWaitStatusChange = options.onWaitStatusChange || null;
        this.onHandChange = options.onHandChange || null;
        this.onSongComplete = options.onSongComplete || null;
    }

    _isUkuleleMode() {
        return this.instrument === "ukulele" || Boolean(this.song && this.song.instrument === "ukulele");
    }

    _resolveNoteFingerStyle(note) {
        if (!note) {
            return this._isUkuleleMode()
                ? UKULELE_FINGER_STYLES[0]
                : PianoFingeringEngine.getFingerStyle(1);
        }
        if (this._isUkuleleMode() || Number.isInteger(note.string)) {
            let f = 0;
            if (note.fret === 0 || note.finger === 0) {
                f = 0;
            } else if (Number.isInteger(note.finger) && note.finger >= 1 && note.finger <= 4) {
                f = note.finger;
            } else if (Number.isInteger(note.fret) && note.fret > 0) {
                f = ((note.fret - 1) % 4) + 1;
            }
            const base = UKULELE_FINGER_STYLES[f] || UKULELE_FINGER_STYLES[0];
            if (typeof note.fingerColor === "string" && note.fingerColor.startsWith("#")) {
                return {
                    ...base,
                    primary: note.fingerColor,
                    diagramLabel: note.fingerLabel || base.diagramLabel
                };
            }
            return base;
        }
        return PianoFingeringEngine.getNoteFingerStyle(note);
    }

    /**
     * Hot-swaps the active instrument context (Piano <-> Ukulele) while preserving
     * the single shared BackingTrackEngine, headphone audio split, tempo, mode,
     * metronome, and `onSongComplete` lifecycle.
     */
    setInstrumentContext({ instrument, renderer, keyboard, synth } = {}) {
        if (this.isPlaying) {
            this.pause();
        } else {
            if (this.backingTrack) {
                this.backingTrack.stopAll();
            }
            if (this.synth && typeof this.synth.stopAllNotes === "function") {
                this.synth.stopAllNotes();
            }
        }

        if (this.keyboard) {
            if (typeof this.keyboard.clearAll === "function") this.keyboard.clearAll();
            if (typeof this.keyboard.clearTargetHighlights === "function") this.keyboard.clearTargetHighlights();
        }
        if (this.renderer && typeof this.renderer.resetEffects === "function") {
            this.renderer.resetEffects();
        }

        if (instrument === "piano" || instrument === "ukulele") {
            this.instrument = instrument;
        }
        if (renderer !== undefined) {
            this.renderer = renderer || null;
        }
        if (keyboard !== undefined) {
            this.keyboard = keyboard || null;
        }
        if (synth !== undefined) {
            this.synth = synth || null;
        }

        if (this.keyboard) {
            this.keyboard.getFingerStyleForMidi = (midi) => this._resolveFingerStyleForMidi(midi);
            if (typeof this.keyboard.clearAll === "function") this.keyboard.clearAll();
        }

        // Keep the single shared BackingTrackEngine bound to the active synth & AudioContext
        if (this.backingTrack) {
            this.backingTrack.synth = this.synth;
            if (this.synth) {
                if (this.synth.ctx) {
                    this.backingTrack.attachContext(this.synth.ctx);
                } else if (this.backingTrack.ctx && typeof this.synth.attachContext === "function") {
                    this.synth.attachContext(this.backingTrack.ctx);
                }
                this.synth.backingTrack = this.backingTrack;
            }
            this.backingTrack.setEnabled(this.backingAudioEnabled);
            this.backingTrack.setVolume(this.backingVolume);
        }

        if (this.renderer) {
            if (typeof this.renderer.setActiveHands === "function") {
                this.renderer.setActiveHands(this.activeHands);
            }
            if (typeof this.renderer.resetEffects === "function") {
                this.renderer.resetEffects();
            }
        }

        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();

        return {
            instrument: this.instrument,
            renderer: this.renderer,
            keyboard: this.keyboard,
            synth: this.synth
        };
    }

    /**
     * Forwards live chromatic/string tuner readout to active renderer & fretboard view.
     */
    setTunerState(tunerData) {
        if (this.renderer && typeof this.renderer.setTunerState === "function") {
            this.renderer.setTunerState(tunerData);
        }
        if (this.keyboard && typeof this.keyboard.setTunerState === "function") {
            this.keyboard.setTunerState(tunerData);
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.evaluator.setMode(mode);
        if (this.isWaiting && mode !== "wait") {
            this.isWaiting = false;
        }
        if (mode === "wait" && this.isWaiting && this.backingTrack) {
            this.backingTrack.stopAll();
        }
        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();
    }

    /**
     * Enables or disables Left Hand ("left" = lower/bass) or Right Hand ("right" = upper/treble).
     * Disabled hands blur on the canvas and suppress all note accuracy reporting.
     */
    setHandEnabled(hand, enabled) {
        if (hand !== "left" && hand !== "right") {
            return this.getActiveHands();
        }
        return this.setActiveHands({
            ...this.activeHands,
            [hand]: Boolean(enabled)
        });
    }

    toggleHand(hand) {
        if (hand !== "left" && hand !== "right") {
            return this.getActiveHands();
        }
        return this.setHandEnabled(hand, !this.activeHands[hand]);
    }

    setActiveHands(hands = {}) {
        if (hands.left !== undefined) {
            this.activeHands.left = Boolean(hands.left);
        }
        if (hands.right !== undefined) {
            this.activeHands.right = Boolean(hands.right);
        }

        this.evaluator.setActiveHands(this.activeHands, this.currentTime);
        if (this.renderer && typeof this.renderer.setActiveHands === "function") {
            this.renderer.setActiveHands(this.activeHands);
        }

        // Unfreeze Wait Mode immediately if disabling a hand satisfied the current chord beat
        if (this.mode === "wait" && this.isWaiting) {
            const stillWaiting = this.evaluator.shouldWaitAtTime(this.currentTime);
            if (!stillWaiting) {
                this.isWaiting = false;
            }
        }

        if (this.keyboard) {
            this.keyboard.clearAll();
        }
        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();

        if (this.onHandChange) {
            this.onHandChange(this.getActiveHands());
        }
        return this.getActiveHands();
    }

    getActiveHands() {
        return { ...this.activeHands };
    }

    _getActiveFirstNoteTime() {
        if (!this.evaluator || !Array.isArray(this.evaluator.notes) || this.evaluator.notes.length === 0) {
            return this.firstNoteTime || 0;
        }
        let earliest = Infinity;
        for (let i = 0; i < this.evaluator.notes.length; i++) {
            const n = this.evaluator.notes[i];
            if (this.evaluator.isNoteHandEnabled(n) && n.time < earliest) {
                earliest = n.time;
            }
        }
        return Number.isFinite(earliest) ? earliest : (this.firstNoteTime || 0);
    }

    _getLastActiveNoteEnd() {
        if (!this.evaluator || !Array.isArray(this.evaluator.notes) || this.evaluator.notes.length === 0) {
            return 0;
        }
        let maxActiveEnd = -Infinity;
        let maxAnyEnd = 0;
        for (let i = 0; i < this.evaluator.notes.length; i++) {
            const n = this.evaluator.notes[i];
            const end = n.time + (n.duration || 0.4);
            if (end > maxAnyEnd) maxAnyEnd = end;
            if (this.evaluator.isNoteHandEnabled(n) && end > maxActiveEnd) {
                maxActiveEnd = end;
            }
        }
        return Number.isFinite(maxActiveEnd) ? maxActiveEnd : maxAnyEnd;
    }

    /**
     * Computes empty count-in beats before the song's first note so the player
     * always has a comfortable lead-in (~2-3 seconds, aligned to measure beats)
     * when starting from the beginning.
     */
    computeLeadIn(song) {
        const bpm = (song && song.bpm) ? song.bpm : 100;
        const beatsPerMeasure = (song && song.beatsPerMeasure) ? song.beatsPerMeasure : 4;
        const secPerBeat = 60 / bpm;

        // 1 full count-in measure by default; double if a single measure is very short (< 1.6s)
        let beats = Math.max(2, beatsPerMeasure);
        if (beats * secPerBeat < 1.6) {
            beats *= 2;
        }
        const targetLeadInSec = beats * secPerBeat;

        let firstNoteTime = 0;
        if (song && Array.isArray(song.notes) && song.notes.length > 0) {
            firstNoteTime = Math.min(...song.notes.map((n) => n.time));
        }

        if (firstNoteTime >= targetLeadInSec) {
            return {
                leadInBeats: 0,
                startTime: 0,
                firstNoteTime
            };
        }

        const neededSec = targetLeadInSec - Math.max(0, firstNoteTime);
        const neededBeats = Math.ceil((neededSec - 1e-6) / secPerBeat);
        return {
            leadInBeats: neededBeats,
            startTime: -neededBeats * secPerBeat,
            firstNoteTime
        };
    }

    loadSong(song, options = {}) {
        if (this.backingTrack) {
            this.backingTrack.stopAll();
        }
        if (this.synth && typeof this.synth.stopAllNotes === "function") {
            this.synth.stopAllNotes();
        }
        if (this.renderer && typeof this.renderer.resetEffects === "function") {
            this.renderer.resetEffects();
        }

        if (options && (options.instrument === "piano" || options.instrument === "ukulele")) {
            this.instrument = options.instrument;
        }

        const handsUpdated = Boolean(options && options.activeHands);
        if (handsUpdated) {
            if (options.activeHands.left !== undefined) {
                this.activeHands.left = Boolean(options.activeHands.left);
            }
            if (options.activeHands.right !== undefined) {
                this.activeHands.right = Boolean(options.activeHands.right);
            }
        }

        const clonedSong = JSON.parse(JSON.stringify(song));
        if (clonedSong && clonedSong.instrument === "ukulele") {
            // Preserve exact ukulele tab/fret/finger/chord metadata without piano fingering rewrite
            this.song = clonedSong;
        } else {
            this.song = PianoFingeringEngine.ensureSongFingering(clonedSong);
        }
        this.baseBpm = this.song.bpm || 100;

        const leadIn = this.computeLeadIn(this.song);
        this.leadInBeats = leadIn.leadInBeats;
        this.startTime = leadIn.startTime;
        this.firstNoteTime = leadIn.firstNoteTime;
        this.currentTime = this.startTime;

        this.scheduledNoteIndices.clear();
        this.lastBeatNumber = null;
        this.isWaiting = false;
        this._songCompletedFired = false;
        this.maxStreak = 0;

        this.evaluator.loadSong(this.song);
        this.evaluator.setActiveHands(this.activeHands);
        if (this.renderer && typeof this.renderer.setActiveHands === "function") {
            this.renderer.setActiveHands(this.activeHands);
        }

        if (this.backingTrack) {
            this.backingTrack.prepareSong(this.song);
        }

        if (this.keyboard) {
            if (typeof this.keyboard.clearAll === "function") this.keyboard.clearAll();
            if (typeof this.keyboard.clearTargetHighlights === "function") this.keyboard.clearTargetHighlights();
        }

        // Calculate total song duration
        let maxTime = 0;
        this.song.notes.forEach((n) => {
            const end = n.time + (n.duration || 0.4);
            if (end > maxTime) maxTime = end;
        });
        this.songDuration = maxTime + 2.5;

        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();

        if (handsUpdated && this.onHandChange) {
            this.onHandChange(this.getActiveHands());
        }
        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime, this.songDuration);
        }
    }

    getCurrentBpm() {
        return Math.round(this.baseBpm * this.tempoMultiplier);
    }

    setTempoMultiplier(mult) {
        this.tempoMultiplier = Math.max(0.25, Math.min(2.0, mult));
    }

    setMetronome(enabled) {
        this.metronomeEnabled = Boolean(enabled);
    }

    /**
     * Toggles ONLY the Play-Along piano guide notes (`synth.playNote`) crossing the playhead.
     * Background song accompaniment (`BackingTrackEngine`) continues playing in headphones!
     */
    setReferenceAudio(enabled) {
        this.referenceAudioEnabled = Boolean(enabled);
        if (!this.referenceAudioEnabled && this.synth && typeof this.synth.stopAllNotes === "function") {
            this.synth.stopAllNotes();
        }
        return this.referenceAudioEnabled;
    }

    /**
     * Enables or disables the headphone background song accompaniment (`BackingTrackEngine`).
     */
    setBackingAudio(enabled) {
        this.backingAudioEnabled = Boolean(enabled);
        if (this.backingTrack) {
            this.backingTrack.setEnabled(this.backingAudioEnabled);
        }
        return this.backingAudioEnabled;
    }

    /**
     * Adjusts headphone background song accompaniment volume (`0..1`, default `0.65`).
     */
    setBackingVolume(vol) {
        const clamped = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.65));
        this.backingVolume = clamped;
        if (this.backingTrack) {
            this.backingTrack.setVolume(clamped);
        }
        return this.backingVolume;
    }

    /**
     * Returns current BackingTrackEngine configuration & live chord/style state for UI controls.
     */
    getBackingState() {
        const btState = this.backingTrack ? this.backingTrack.getState() : null;
        return {
            enabled: this.backingAudioEnabled,
            volume: this.backingVolume,
            style: btState ? btState.style : null,
            currentChord: btState ? btState.currentChord : null,
            inferredChords: btState ? btState.inferredChords : false,
            activeVoices: btState ? btState.activeVoices : 0
        };
    }

    /**
     * Builds the performance summary payload passed to `onSongComplete` (and queryable anytime).
     */
    getPerformanceSummary() {
        const stats = (this.evaluator && this.evaluator.noteStats)
            ? this.evaluator.noteStats
            : { perfect: 0, good: 0, missed: 0, wrong: 0 };

        const perfectCount = stats.perfect || 0;
        const goodCount = stats.good || 0;
        const missedCount = stats.missed || 0;
        const wrongCount = stats.wrong || 0;

        const allNotes = (this.evaluator && Array.isArray(this.evaluator.notes)) ? this.evaluator.notes : [];
        const totalActiveNotes = allNotes.filter(
            (n) => this.evaluator.isNoteHandEnabled(n) && n.state !== "skipped"
        ).length;

        let accuracy = 0;
        if (totalActiveNotes > 0) {
            const weightedHits = perfectCount + (goodCount * 0.85);
            const denom = Math.max(totalActiveNotes, perfectCount + goodCount + missedCount) + (wrongCount * 0.5);
            accuracy = denom > 0
                ? Math.round(Math.max(0, Math.min(100, (weightedHits / denom) * 100)) * 10) / 10
                : 0;
        }

        const maxStreak = Math.max(this.maxStreak || 0, (this.evaluator && this.evaluator.streak) || 0);

        return {
            song: this.song,
            score: this.evaluator ? this.evaluator.score : 0,
            accuracy,
            perfectCount,
            goodCount,
            missedCount,
            wrongCount,
            maxStreak,
            totalActiveNotes,
            mode: this.mode,
            activeHands: this.getActiveHands()
        };
    }

    /**
     * Supplies active score target MIDI notes to CalibratedPolyphonicDetector
     * for Score-Informed Harmonic Verification during Flow or Wait gameplay.
     */
    getExpectedMidisAtPlayhead() {
        if (!this.song || (!this.isPlaying && this.mode !== "wait")) {
            return null;
        }
        return this.evaluator.getExpectedMidisAtTime(this.currentTime);
    }

    play() {
        if (this.isPlaying) return;

        // If already parked at song completion, automatically restart from count-in on Play
        if (this.song && this._songCompletedFired && this.currentTime >= this._getLastActiveNoteEnd() + 0.45) {
            this.restart();
        }

        if (this.synth) {
            if (typeof this.synth.init === "function") this.synth.init();
            if (typeof this.synth.resume === "function") this.synth.resume();
            if (this.backingTrack && this.synth.ctx) {
                this.backingTrack.attachContext(this.synth.ctx);
            }
        }

        this.isPlaying = true;
        this.lastFrameTime = _nowMs();
        this.gameLoop();
    }

    pause() {
        this.isPlaying = false;
        if (this.animFrameId !== null) {
            _cancelFrame(this.animFrameId);
            this.animFrameId = null;
        }
        if (this.backingTrack) {
            this.backingTrack.stopAll();
        }
        if (this.synth && typeof this.synth.stopAllNotes === "function") {
            this.synth.stopAllNotes();
        }
        if (this.keyboard) {
            this.keyboard.clearAll();
        }
        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();
    }

    seek(timeSec) {
        const prevTime = this.currentTime;
        const minTime = this.startTime || 0;
        this.currentTime = Math.max(minTime, Math.min(this.songDuration || 10, timeSec));

        const completionThreshold = this._getLastActiveNoteEnd() + 0.45;
        if (this.currentTime < prevTime - 1e-4 || this.currentTime < completionThreshold) {
            this._songCompletedFired = false;
        }

        if (this.backingTrack) {
            this.backingTrack.stopAll();
            this.backingTrack._scheduledSubs.clear();
            this.backingTrack._lastTickTime = null;
        }
        if (this.synth && typeof this.synth.stopAllNotes === "function") {
            this.synth.stopAllNotes();
        }

        this.evaluator.reset();
        this.maxStreak = 0;

        // Fast-forward notes prior to seek time
        this.scheduledNoteIndices.clear();
        this.lastBeatNumber = null;
        this.evaluator.notes.forEach((n, idx) => {
            if (n.time < this.currentTime) {
                this.scheduledNoteIndices.add(idx);
                n.state = this.evaluator.isNoteHandEnabled(n) ? "correct" : "skipped";
            }
        });
        this.evaluator._refreshWaitTargets();

        this.isWaiting = false;
        if (this.renderer && typeof this.renderer.clearWrongHints === "function") {
            this.renderer.clearWrongHints();
        }
        if (this.keyboard) {
            this.keyboard.clearAll();
        }
        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();
        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime, this.songDuration);
        }
    }

    restart() {
        this._songCompletedFired = false;
        this.maxStreak = 0;
        this.scheduledNoteIndices.clear();
        if (this.renderer && typeof this.renderer.resetEffects === "function") {
            this.renderer.resetEffects();
        }
        this.seek(this.startTime || 0);
        this.evaluator.reset();
        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();
    }

    /**
     * Single-note input wrapper (mouse click / WebMIDI note-on)
     */
    handleUserInputNote(midi, isOnset = true) {
        this.handleUserInputNotes([midi], isOnset);
    }

    /**
     * Polyphonic Input Handler: Evaluates 1..N simultaneously detected MIDI notes
     * @param {number[]} midis - Array of MIDI pitches detected on this strike
     * @param {boolean} isOnset - True if new hammer attack
     */
    handleUserInputNotes(midis, isOnset = true) {
        if (!Array.isArray(midis) || midis.length === 0) return;

        // Free-play preview when paused (and not actively waiting at a note), during empty count-in beats,
        // or when both hands are toggled off
        const bothHandsDisabled = !this.activeHands.left && !this.activeHands.right;
        const inPreRoll = this.evaluator.isInLeadIn(this.currentTime);
        if (bothHandsDisabled || (!this.isPlaying && !(this.mode === "wait" && !inPreRoll)) || inPreRoll) {
            if (this.keyboard) {
                midis.forEach((midi) => {
                    this.keyboard.pressKey(midi);
                    setTimeout(() => {
                        if (this.keyboard) {
                            this.keyboard.releaseKey(midi);
                            this.updateKeyboardTargetHighlights();
                        }
                    }, 220);
                });
            }
            return;
        }

        if (!isOnset) return;

        const batchResult = this.evaluator.evaluatePlayedNotes(midis, this.currentTime);
        if (batchResult && batchResult.results.length > 0) {
            if (this.evaluator.streak > this.maxStreak) {
                this.maxStreak = this.evaluator.streak;
            }
            const evaluatedMidis = new Set();
            batchResult.results.forEach((res) => {
                const midi = res.playedMidi;
                evaluatedMidis.add(midi);
                if (!this.keyboard) return;

                if (res.isCorrect) {
                    const fStyle = res.note ? this._resolveNoteFingerStyle(res.note) : null;
                    const ukuMeta = res.note ? {
                        string: Number.isInteger(res.note.string) ? res.note.string : undefined,
                        fret: Number.isInteger(res.note.fret) ? res.note.fret : undefined,
                        finger: Number.isInteger(res.note.finger) ? res.note.finger : (fStyle ? fStyle.finger : undefined),
                        fingerColor: res.note.fingerColor || (fStyle ? fStyle.primary : undefined),
                        chordSymbol: res.note.chordSymbol || undefined,
                        strumDir: res.note.strumDir || undefined,
                        lane: res.note.lane || undefined
                    } : {};
                    this.keyboard.pressKey(midi, "#52B788", "correct", fStyle ? {
                        ...ukuMeta,
                        lightColor: "#84D9AE",
                        darkColor: "#358762",
                        fingerLabel: fStyle.diagramLabel,
                        fingerName: fStyle.name
                    } : {
                        ...ukuMeta,
                        lightColor: "#84D9AE",
                        darkColor: "#358762"
                    });
                    setTimeout(() => {
                        if (this.keyboard) {
                            this.keyboard.releaseKey(midi);
                            this.updateKeyboardTargetHighlights();
                        }
                    }, 240);
                } else {
                    this.keyboard.pressKey(midi, "#8B95A5", "wrong", {
                        lightColor: "#A6B0BF",
                        darkColor: "#647082"
                    });
                    setTimeout(() => {
                        if (this.keyboard) {
                            this.keyboard.releaseKey(midi);
                            this.updateKeyboardTargetHighlights();
                        }
                    }, 210);
                }
            });

            // Any ignored notes on a toggled-off hand show a neutral press without accuracy colors
            if (this.keyboard) {
                midis.forEach((midi) => {
                    if (!evaluatedMidis.has(midi)) {
                        this.keyboard.pressKey(midi);
                        setTimeout(() => {
                            if (this.keyboard) this.keyboard.releaseKey(midi);
                        }, 200);
                    }
                });
            }

            if (this.mode === "wait" && batchResult.chordCompleted) {
                const wasWaiting = this.isWaiting;
                this.isWaiting = false;
                if (wasWaiting && this.onWaitStatusChange) {
                    this.onWaitStatusChange(false, null);
                }
            }
        } else if (this.keyboard) {
            midis.forEach((midi) => {
                this.keyboard.pressKey(midi);
                setTimeout(() => {
                    if (this.keyboard) this.keyboard.releaseKey(midi);
                }, 200);
            });
        }

        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();
    }

    _resolveFeedbackStaff(pitch, note = null) {
        if (this.activeHands.right && !this.activeHands.left) return true;
        if (this.activeHands.left && !this.activeHands.right) return false;
        if (note) {
            return NoteEvaluator.getNoteHand(note) === "right";
        }
        return pitch >= 60;
    }

    handleHit(note, status, color, delta) {
        if (this.evaluator && this.evaluator.streak > this.maxStreak) {
            this.maxStreak = this.evaluator.streak;
        }
        if (!this.activeHands.left && !this.activeHands.right) return;
        if (!this.renderer || typeof this.renderer.addHitFeedback !== "function") return;
        const pitch = note ? note.pitch : 60;
        const isTreble = this._resolveFeedbackStaff(pitch, note);
        const hand = note ? NoteEvaluator.getNoteHand(note) : (isTreble ? "right" : "left");
        this.renderer.addHitFeedback(status, color, isTreble, {
            kind: status === "PERFECT" ? "perfect" : "good",
            note,
            pitch,
            string: note && Number.isInteger(note.string) ? note.string : null,
            hand,
            delta
        });
    }

    handleMiss(pitch, status, color, note = null) {
        if (!this.activeHands.left && !this.activeHands.right) return;
        if (!this.renderer || typeof this.renderer.addHitFeedback !== "function") return;
        const isTreble = this._resolveFeedbackStaff(pitch, note);
        const isUnplayedPass = note !== null && note.state === "wrong";
        const hand = note ? NoteEvaluator.getNoteHand(note) : (isTreble ? "right" : "left");
        this.renderer.addHitFeedback(status, color, isTreble, {
            kind: isUnplayedPass ? "missed" : "wrong",
            note,
            pitch,
            string: note && Number.isInteger(note.string) ? note.string : null,
            hand
        });
    }

    handleScoreUpdate(score, streak, mult) {
        if (streak > this.maxStreak) {
            this.maxStreak = streak;
        }
        if (this.onScoreChange) {
            this.onScoreChange(score, streak, mult);
        }
    }

    handleWaitTarget(target) {
        if (!target || !this.keyboard) return;
        if (this.mode === "wait") {
            this.updateKeyboardTargetHighlights();
        }
    }

    _resolveFingerStyleForMidi(midi) {
        if (!this.evaluator || !Array.isArray(this.evaluator.notes) || this.evaluator.notes.length === 0) {
            return null;
        }
        let bestNote = null;
        let bestDist = Infinity;
        for (const n of this.evaluator.notes) {
            if (n.pitch !== midi || !this.evaluator.isNoteHandEnabled(n)) continue;
            const d = Math.abs(n.time - this.currentTime);
            if (d < bestDist) {
                bestDist = d;
                bestNote = n;
            }
        }
        if (bestNote && bestDist <= 2.5) {
            return this._resolveNoteFingerStyle(bestNote);
        }
        return null;
    }

    _highlightTargetNoteOnKeyboard(note) {
        if (!this.keyboard || !note || this.keyboard.activeKeys.has(note.pitch)) return;
        const style = this._resolveNoteFingerStyle(note);
        this.keyboard.pressKey(note.pitch, style.primary, "preview", {
            lightColor: style.light,
            darkColor: style.dark,
            finger: style.finger,
            fingerLabel: style.diagramLabel,
            fingerName: style.name,
            fingerColor: note.fingerColor || style.primary,
            hand: NoteEvaluator.getNoteHand(note),
            string: Number.isInteger(note.string) ? note.string : undefined,
            fret: Number.isInteger(note.fret) ? note.fret : undefined,
            chordSymbol: note.chordSymbol || undefined,
            strumDir: note.strumDir || undefined,
            lane: note.lane || undefined
        });
    }

    updateKeyboardTargetHighlights() {
        if (!this.keyboard || !this.evaluator || !this.evaluator.notes) return;

        const supportsTargetNotes = typeof this.keyboard.setTargetNotes === "function";

        for (const [midi, state] of this.keyboard.activeKeys.entries()) {
            if (state.status === "preview") {
                this.keyboard.releaseKey(midi);
            }
        }

        if (!this.activeHands.left && !this.activeHands.right) {
            if (supportsTargetNotes) {
                this.keyboard.setTargetNotes([]);
            }
            return;
        }

        const targetNotes = [];

        // During empty count-in beats before the active hand's entrance, preview the opening active note/chord
        // in each note's exact Finger Color so the player can position their fingers.
        const activeFirstTime = this._getActiveFirstNoteTime();
        if (this.currentTime < activeFirstTime) {
            this.evaluator.notes.forEach((n) => {
                if (
                    n.state === "pending" &&
                    this.evaluator.isNoteHandEnabled(n) &&
                    Math.abs(n.time - activeFirstTime) <= 0.055
                ) {
                    targetNotes.push(n);
                }
            });
        } else if (this.mode === "wait" && this.evaluator.currentWaitChord && this.evaluator.currentWaitChord.length > 0) {
            this.evaluator.currentWaitChord.forEach((n) => {
                if (n.state === "pending" && this.evaluator.isNoteHandEnabled(n)) {
                    targetNotes.push(n);
                }
            });
        } else {
            this.evaluator.notes.forEach((n) => {
                if (
                    this.evaluator.isNoteHandEnabled(n) &&
                    this.currentTime >= n.time - 0.10 &&
                    this.currentTime <= n.time + (n.duration || 0.35)
                ) {
                    if (this.isPlaying || n.state === "pending") {
                        targetNotes.push(n);
                    }
                }
            });

            // For fretboard views, smoothly preview the next upcoming onset group when between notes/strums
            if (supportsTargetNotes && targetNotes.length === 0) {
                const nextPending = this.evaluator.notes.find(
                    (n) => n.state === "pending" && this.evaluator.isNoteHandEnabled(n) && n.time >= this.currentTime - 0.05
                );
                if (nextPending) {
                    this.evaluator.notes.forEach((n) => {
                        if (
                            n.state === "pending" &&
                            this.evaluator.isNoteHandEnabled(n) &&
                            Math.abs(n.time - nextPending.time) <= 0.055
                        ) {
                            targetNotes.push(n);
                        }
                    });
                }
            }
        }

        if (supportsTargetNotes) {
            this.keyboard.setTargetNotes(targetNotes);
        } else {
            for (let i = 0; i < targetNotes.length; i++) {
                this._highlightTargetNoteOnKeyboard(targetNotes[i]);
            }
        }
    }

    /**
     * Deterministic single-frame timeline advance (used by `gameLoop` and headless simulation tests).
     */
    step(deltaSec) {
        if (!this.isPlaying || !this.song) return;

        const safeDelta = Math.max(0, deltaSec);
        const prevWaiting = this.isWaiting;

        if (this.mode === "wait") {
            const shouldWait = this.evaluator.shouldWaitAtTime(this.currentTime);
            if (shouldWait) {
                this.isWaiting = true;
                if (this.evaluator.currentWaitNote) {
                    this.currentTime = this.evaluator.currentWaitNote.time;
                }
            } else {
                this.isWaiting = false;
                const nextTime = this.currentTime + safeDelta * this.tempoMultiplier;
                const willWait = this.evaluator.shouldWaitAtTime(nextTime);
                if (willWait && this.evaluator.currentWaitNote) {
                    this.isWaiting = true;
                    this.currentTime = this.evaluator.currentWaitNote.time;
                } else {
                    this.currentTime = nextTime;
                }
            }
        } else {
            this.isWaiting = false;
            this.currentTime += safeDelta * this.tempoMultiplier;
            this.evaluator.checkMissedNotes(this.currentTime);
        }

        if (this.isWaiting !== prevWaiting && this.onWaitStatusChange) {
            this.onWaitStatusChange(this.isWaiting, this.evaluator.currentWaitChord || []);
        }

        this.processAudioAndEvents();

        // Check end-of-song completion once playhead clears the final active note + 0.45s tail
        const completionTime = this._getLastActiveNoteEnd() + 0.45;
        if (
            !this.isWaiting &&
            !this._songCompletedFired &&
            this.evaluator.notes.length > 0 &&
            this.currentTime >= completionTime
        ) {
            if (this.mode !== "wait") {
                this.evaluator.checkMissedNotes(this.currentTime);
            }
            this._songCompletedFired = true;
            this.currentTime = Math.min(this.currentTime, this.songDuration);
            this.pause();

            if (this.onTimeUpdate) {
                this.onTimeUpdate(this.currentTime, this.songDuration);
            }
            if (typeof this.onSongComplete === "function") {
                this.onSongComplete(this.getPerformanceSummary());
            }
            return;
        }

        if (this.currentTime >= this.songDuration) {
            this.pause();
            return;
        }

        this.updateKeyboardTargetHighlights();
        this.renderCurrentFrame();

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime, this.songDuration);
        }
    }

    gameLoop() {
        if (!this.isPlaying) return;

        const now = _nowMs();
        const deltaSec = Math.min(0.12, Math.max(0, (now - this.lastFrameTime) / 1000.0));
        this.lastFrameTime = now;

        this.step(deltaSec);

        if (this.isPlaying) {
            this.animFrameId = _requestFrame(() => this.gameLoop());
        }
    }

    /**
     * Dispatches Play-Along guide notes for Piano or Ukulele.
     * In Ukulele mode, simultaneous chord notes (`chordGroupId` or onset within 15ms) are batched into
     * an authentic arpeggiated `synth.playStrum()` call; single notes pass `{ string, fret }`.
     */
    _playGuideNotesBatch(notesToPlay, isWaitPreview = false) {
        if (!Array.isArray(notesToPlay) || notesToPlay.length === 0 || !this.synth) return;

        if (!this._isUkuleleMode()) {
            if (typeof this.synth.playNote !== "function") return;
            for (let i = 0; i < notesToPlay.length; i++) {
                const note = notesToPlay[i];
                this.synth.playNote(note.pitch, isWaitPreview ? 0.6 : note.duration, 0.85);
            }
            return;
        }

        // Group simultaneous ukulele chord notes by chordGroupId or <= 15ms onset proximity
        const groups = [];
        const byGroupId = new Map();

        for (let i = 0; i < notesToPlay.length; i++) {
            const note = notesToPlay[i];
            if (note.chordGroupId) {
                let grp = byGroupId.get(note.chordGroupId);
                if (!grp) {
                    grp = [];
                    byGroupId.set(note.chordGroupId, grp);
                    groups.push(grp);
                }
                grp.push(note);
            } else {
                const matchGrp = groups.find(
                    (g) => g.length > 0 && !g[0].chordGroupId && Math.abs(g[0].time - note.time) <= 0.015
                );
                if (matchGrp) {
                    matchGrp.push(note);
                } else {
                    groups.push([note]);
                }
            }
        }

        const hasStrum = typeof this.synth.playStrum === "function";
        const hasNote = typeof this.synth.playNote === "function";

        for (let g = 0; g < groups.length; g++) {
            const grp = groups[g];
            if (grp.length > 1 && hasStrum) {
                let maxDur = isWaitPreview ? 0.65 : 0.45;
                let strumDir = "down";
                for (let j = 0; j < grp.length; j++) {
                    if (!isWaitPreview && typeof grp[j].duration === "number" && grp[j].duration > maxDur) {
                        maxDur = grp[j].duration;
                    }
                    if (grp[j].strumDir === "up" || grp[j].strumDir === "down") {
                        strumDir = grp[j].strumDir;
                    }
                }
                this.synth.playStrum(grp, maxDur, strumDir, { velocity: 0.85 });
            } else if (hasNote) {
                for (let j = 0; j < grp.length; j++) {
                    const note = grp[j];
                    const dur = isWaitPreview ? 0.6 : note.duration;
                    this.synth.playNote(note.pitch, dur, 0.85, {
                        string: Number.isInteger(note.string) ? note.string : undefined,
                        fret: Number.isInteger(note.fret) ? note.fret : undefined
                    });
                }
            }
        }
    }

    processAudioAndEvents() {
        if (!this.song) return;

        // `currentTime` advances in score-seconds (`deltaSec * tempoMultiplier`),
        // so 1 score beat equals `60 / baseBpm` at any tempo multiplier.
        const baseBpm = this.song.bpm || this.baseBpm || 100;
        const secondsPerBeat = 60 / baseBpm;
        const currentBeat = Math.floor((this.currentTime / secondsPerBeat) + 1e-6);
        const minBeat = -(this.leadInBeats || 0);

        // 1. Headphone Song Background Accompaniment (ALWAYS plays when isPlaying && !isWaiting && backingAudioEnabled,
        //    completely independent of whether Play-Along guide notes are ON or OFF!)
        if (this.backingTrack) {
            if (this.isPlaying && !this.isWaiting && this.backingAudioEnabled) {
                if (!this.backingTrack.ctx && this.synth) {
                    if (!this.synth.ctx && typeof this.synth.init === "function") {
                        this.synth.init();
                    }
                    if (this.synth.ctx) {
                        this.backingTrack.attachContext(this.synth.ctx);
                    }
                }
                this.backingTrack.onTick(
                    this.currentTime,
                    this.isPlaying,
                    this.isWaiting,
                    this.tempoMultiplier
                );
            } else {
                this.backingTrack.stopAll();
            }
        }

        // 2. Metronome Click (counts in empty lead-in beats as well as song measures)
        if (
            this.metronomeEnabled &&
            this.isPlaying &&
            !this.isWaiting &&
            currentBeat !== this.lastBeatNumber &&
            currentBeat >= minBeat
        ) {
            this.lastBeatNumber = currentBeat;
            const beatsPerMeasure = this.song.beatsPerMeasure || 4;
            const isDownbeat = (((currentBeat % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure) === 0;
            if (this.synth && typeof this.synth.playMetronomeClick === "function") {
                this.synth.playMetronomeClick(isDownbeat);
            }
        }

        // 3. Play-Along Guide Notes ONLY (`referenceAudioEnabled` / #btnPlayAlongToggle)
        if (this.referenceAudioEnabled && this.synth && (typeof this.synth.playNote === "function" || typeof this.synth.playStrum === "function")) {
            if (this.mode === "wait" && this.isWaiting) {
                // Preview pending enabled-hand notes in the frozen chord once
                const waitChord = this.evaluator.currentWaitChord || [];
                const previewBatch = [];
                waitChord.forEach((note) => {
                    if (!this.scheduledNoteIndices.has(note.index)) {
                        this.scheduledNoteIndices.add(note.index);
                        if (this.evaluator.isNoteHandEnabled(note)) {
                            previewBatch.push(note);
                        }
                    }
                });
                if (previewBatch.length > 0) {
                    this._playGuideNotesBatch(previewBatch, true);
                }
            } else if (this.isPlaying && !this.isWaiting) {
                const dueBatch = [];
                this.evaluator.notes.forEach((note, index) => {
                    if (!this.scheduledNoteIndices.has(index)) {
                        if (this.currentTime >= note.time) {
                            this.scheduledNoteIndices.add(index);
                            if (this.evaluator.isNoteHandEnabled(note)) {
                                dueBatch.push(note);
                            }
                        }
                    }
                });
                if (dueBatch.length > 0) {
                    this._playGuideNotesBatch(dueBatch, false);
                }
            }
        }
    }

    renderCurrentFrame() {
        if (!this.renderer || typeof this.renderer.render !== "function") return;
        this.renderer.render({
            currentTime: this.currentTime,
            startTime: this.startTime || 0,
            leadInBeats: this.leadInBeats || 0,
            firstNoteTime: this.firstNoteTime || 0,
            isPlaying: this.isPlaying,
            currentBpm: this.getCurrentBpm(),
            song: this.song ? {
                ...this.song,
                notes: this.evaluator.notes
            } : null,
            score: this.evaluator.score,
            streak: this.evaluator.streak,
            multiplier: this.evaluator.multiplier,
            isWaiting: this.isWaiting,
            waitTargetNote: this.evaluator.currentWaitNote,
            waitTargetChord: this.evaluator.currentWaitChord || [],
            mode: this.mode,
            activeHands: { ...this.activeHands }
        });
    }
}
