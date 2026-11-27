/**
 * Ukulele 4-String Tab Canvas Visualizer Engine
 * 60 FPS High-DPI Retina Canvas renderer crafted in the Studio Obsidian & Acoustic Ivory
 * conservatory palette (zero neon glow, zero harsh red flashes, non-punitive feedback).
 *
 * Standard Re-Entrant High-G Ukulele Tablature Layout (top-to-bottom):
 *   string = 0 (Top line)    : A4 (MIDI 69, thinnest string)
 *   string = 1 (2nd line)    : E4 (MIDI 64)
 *   string = 2 (3rd line)    : C4 (MIDI 60, thickest string)
 *   string = 3 (Bottom line) : G4 (MIDI 67, re-entrant high-G string)
 *
 * Canonical 5-Color Fretting Finger Palette (harmonized with Piano FINGER_PALETTE):
 *   0 = Open   (#48A870 calm conservatory sage)
 *   1 = Index  (#F0C830 warm gold)
 *   2 = Middle (#6848F8 indigo)
 *   3 = Ring   (#4090F8 azure)
 *   4 = Pinky  (#E86078 muted rose)
 */

export const UKULELE_STRINGS = [
    { index: 0, name: "A", octave: 4, fullName: "A4", openMidi: 69, gauge: 1.15, alpha: 0.30 },
    { index: 1, name: "E", octave: 4, fullName: "E4", openMidi: 64, gauge: 1.38, alpha: 0.35 },
    { index: 2, name: "C", octave: 4, fullName: "C4", openMidi: 60, gauge: 1.85, alpha: 0.42 },
    { index: 3, name: "G", octave: 4, fullName: "G4", openMidi: 67, gauge: 1.28, alpha: 0.32 }
];

export const UKULELE_FINGER_PALETTE = {
    0: {
        finger: 0,
        diagramLabel: "0",
        shortLabel: "O",
        name: "Open",
        primary: "#48A870",
        light: "#74C695",
        dark: "#2F8554",
        text: "#FFFFFF"
    },
    1: {
        finger: 1,
        diagramLabel: "1",
        shortLabel: "1",
        name: "Index",
        primary: "#F0C830",
        light: "#F8E080",
        dark: "#C89D14",
        text: "#FFFFFF"
    },
    2: {
        finger: 2,
        diagramLabel: "2",
        shortLabel: "2",
        name: "Middle",
        primary: "#6848F8",
        light: "#B0A0F8",
        dark: "#4C2FD9",
        text: "#FFFFFF"
    },
    3: {
        finger: 3,
        diagramLabel: "3",
        shortLabel: "3",
        name: "Ring",
        primary: "#4090F8",
        light: "#98D8F8",
        dark: "#256EE0",
        text: "#FFFFFF"
    },
    4: {
        finger: 4,
        diagramLabel: "4",
        shortLabel: "4",
        name: "Pinky",
        primary: "#E86078",
        light: "#F0A8B8",
        dark: "#C93B56",
        text: "#FFFFFF"
    }
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHORD_WINDOW_SEC = 0.055;
const MAX_FRET = 12;

function _nowMs() {
    return (typeof performance !== "undefined" && typeof performance.now === "function")
        ? performance.now()
        : Date.now();
}

function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function _formatPitchName(midi) {
    if (!Number.isFinite(midi)) return "";
    const rounded = Math.round(midi);
    const pc = ((rounded % 12) + 12) % 12;
    const oct = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[pc].replace("#", "♯")}${oct}`;
}

function _hexToRgba(hex, alpha) {
    if (typeof hex !== "string" || !hex.startsWith("#")) {
        return `rgba(148, 163, 184, ${alpha})`;
    }
    const clean = hex.slice(1);
    const full = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean;
    if (full.length !== 6) {
        return `rgba(148, 163, 184, ${alpha})`;
    }
    const num = parseInt(full, 16);
    if (!Number.isFinite(num)) {
        return `rgba(148, 163, 184, ${alpha})`;
    }
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Maps any MIDI pitch onto the lowest playable (string, fret) on a 4-string ukulele
 * (octave-folding pitches outside [minOpenMidi, maxOpenMidi + maxFret] cleanly).
 */
export function mapPitchToUkuleleTab(midi, tuning = UKULELE_STRINGS, maxFret = MAX_FRET) {
    const strings = Array.isArray(tuning) && tuning.length === 4 ? tuning : UKULELE_STRINGS;
    let minOpen = Infinity;
    let maxOpen = -Infinity;
    for (let i = 0; i < strings.length; i++) {
        if (strings[i].openMidi < minOpen) minOpen = strings[i].openMidi;
        if (strings[i].openMidi > maxOpen) maxOpen = strings[i].openMidi;
    }

    let p = Math.round(Number(midi));
    if (!Number.isFinite(p)) p = 60;
    const maxPlayable = maxOpen + maxFret;
    while (p < minOpen) p += 12;
    while (p > maxPlayable) p -= 12;

    // Prefer lowest fret across all 4 strings; on ties prefer C/E/A over re-entrant G for melodies
    const tieOrder = [2, 1, 0, 3];
    let best = null;
    for (let k = 0; k < tieOrder.length; k++) {
        const sIdx = tieOrder[k];
        const s = strings[sIdx];
        const fret = p - s.openMidi;
        if (fret >= 0 && fret <= maxFret) {
            if (!best || fret < best.fret) {
                best = { string: sIdx, fret, pitch: p };
            }
        }
    }

    if (!best) {
        const fallbackFret = _clamp(p - strings[0].openMidi, 0, maxFret);
        best = { string: 0, fret: fallbackFret, pitch: strings[0].openMidi + fallbackFret };
    }
    return best;
}

/**
 * Resolves a ukulele fretting finger style (0=Open, 1=Index..4=Pinky) for a note or fret.
 */
function _resolveUkuleleFingerStyle(note, fret) {
    if (fret === 0) {
        return UKULELE_FINGER_PALETTE[0];
    }

    let finger = null;
    if (note && Number.isInteger(note.finger) && note.finger >= 1 && note.finger <= 4) {
        finger = note.finger;
    } else if (note && Number.isInteger(note.finger) && note.finger === 5) {
        finger = 4;
    } else if (Number.isFinite(fret) && fret > 0) {
        finger = _clamp(((Math.round(fret) - 1) % 4) + 1, 1, 4);
    } else {
        finger = 1;
    }

    const base = UKULELE_FINGER_PALETTE[finger] || UKULELE_FINGER_PALETTE[1];
    if (note && typeof note.fingerColor === "string" && note.fingerColor.startsWith("#")) {
        const upperHex = note.fingerColor.toUpperCase();
        for (let f = 0; f <= 4; f++) {
            if (UKULELE_FINGER_PALETTE[f].primary.toUpperCase() === upperHex) {
                return UKULELE_FINGER_PALETTE[f];
            }
        }
        return {
            ...base,
            primary: note.fingerColor
        };
    }
    return base;
}

export class UkuleleTabRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas || null;
        this.ctx = (canvas && typeof canvas.getContext === "function") ? canvas.getContext("2d") : null;
        this.pixelsPerSecond = options.pixelsPerSecond || 180;
        this.playheadRatio = Number.isFinite(options.playheadRatio) ? options.playheadRatio : 0.26;
        this.tuning = Array.isArray(options.tuning) && options.tuning.length === 4
            ? options.tuning
            : UKULELE_STRINGS;
        this.fingerPalette = UKULELE_FINGER_PALETTE;
        this.noteNames = NOTE_NAMES;

        // Lane toggles: right = Melody lane, left = Chords lane (matches NoteEvaluator activeHands)
        this.activeHands = { left: true, right: true };
        this.onToggleHand = options.onToggleHand || null;
        this._disabledBadgeRects = [];

        // Non-punitive visual feedback buffers
        this.ripples = [];
        this.particles = [];
        this.hitTexts = [];
        this.ghostMarks = [];
        this._stringGlowUntil = [0, 0, 0, 0];
        this._lastLayout = null;

        // Live acoustic pitch/tuner overlay state
        this.tunerState = null;

        // Cached chronological onset events for O(log N) parabolic ball physics
        this._eventsCache = new WeakMap();

        this.width = 0;
        this.height = 0;

        this._boundResize = () => this.resize();
        this._boundMouseMove = null;
        this._boundClick = null;

        this.resize();
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", this._boundResize);
        }
        this._bindCanvasLaneBadgeEvents();
    }

    _bindCanvasLaneBadgeEvents() {
        if (!this.canvas || typeof this.canvas.addEventListener !== "function") return;

        const getCanvasCoords = (e) => {
            if (typeof this.canvas.getBoundingClientRect !== "function") return null;
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        this._boundMouseMove = (e) => {
            if (!this._disabledBadgeRects || this._disabledBadgeRects.length === 0) {
                if (this.canvas.style && this.canvas.style.cursor === "pointer") {
                    this.canvas.style.cursor = "default";
                }
                return;
            }
            const pt = getCanvasCoords(e);
            if (!pt) return;
            const hit = this._disabledBadgeRects.some(
                (b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h
            );
            if (this.canvas.style) {
                this.canvas.style.cursor = hit ? "pointer" : "default";
            }
        };

        this._boundClick = (e) => {
            if (!this.onToggleHand || !this._disabledBadgeRects || this._disabledBadgeRects.length === 0) return;
            const pt = getCanvasCoords(e);
            if (!pt) return;
            const hit = this._disabledBadgeRects.find(
                (b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h
            );
            if (hit) {
                this.onToggleHand(hit.hand);
            }
        };

        this.canvas.addEventListener("mousemove", this._boundMouseMove);
        this.canvas.addEventListener("click", this._boundClick);
    }

    destroy() {
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function" && this._boundResize) {
            window.removeEventListener("resize", this._boundResize);
        }
        if (this.canvas && typeof this.canvas.removeEventListener === "function") {
            if (this._boundMouseMove) this.canvas.removeEventListener("mousemove", this._boundMouseMove);
            if (this._boundClick) this.canvas.removeEventListener("click", this._boundClick);
        }
        this.resetEffects();
    }

    resize() {
        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        const rect = (this.canvas && typeof this.canvas.getBoundingClientRect === "function")
            ? this.canvas.getBoundingClientRect()
            : { width: 960, height: 360 };
        const fallbackW = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : 960;
        const w = rect.width || this.canvas?.parentElement?.clientWidth || fallbackW;
        const h = rect.height || this.canvas?.parentElement?.clientHeight || 360;
        if (w === 0 || h === 0) return;
        this.width = w;
        this.height = h;
        if (this.canvas) {
            this.canvas.width = Math.floor(w * dpr);
            this.canvas.height = Math.floor(h * dpr);
        }
        if (this.ctx && typeof this.ctx.setTransform === "function") {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    getPlayheadX() {
        const w = this.width || 960;
        const railWidth = _clamp(w * 0.075, 58, 76);
        return Math.max(railWidth + 44, w * this.playheadRatio);
    }

    setActiveHands(hands = {}) {
        if (hands.left !== undefined) this.activeHands.left = Boolean(hands.left);
        if (hands.right !== undefined) this.activeHands.right = Boolean(hands.right);

        const keepLane = (item) => {
            if (item.hand === "left") return this.activeHands.left;
            if (item.hand === "right") return this.activeHands.right;
            return this.activeHands.left || this.activeHands.right;
        };
        this.ripples = this.ripples.filter(keepLane);
        this.particles = this.particles.filter(keepLane);
        this.hitTexts = this.hitTexts.filter(keepLane);
        this.ghostMarks = this.ghostMarks.filter(keepLane);
    }

    setTunerState(tunerData) {
        if (!tunerData) {
            this.tunerState = null;
            return;
        }
        const midi = Number.isFinite(tunerData.midi) ? Math.round(tunerData.midi) : null;
        let stringIdx = Number.isInteger(tunerData.stringIdx) && tunerData.stringIdx >= 0 && tunerData.stringIdx <= 3
            ? tunerData.stringIdx
            : null;

        // Automatically match open string when pitch aligns within a semitone of G4/C4/E4/A4
        if (stringIdx === null && midi !== null) {
            for (let i = 0; i < this.tuning.length; i++) {
                if (this.tuning[i].openMidi === midi) {
                    stringIdx = i;
                    break;
                }
            }
        }

        this.tunerState = {
            active: tunerData.active !== false,
            midi,
            noteName: tunerData.noteName || (midi !== null ? _formatPitchName(midi) : "--"),
            cents: Number.isFinite(tunerData.cents) ? Math.round(tunerData.cents) : 0,
            confidence: Number.isFinite(tunerData.confidence) ? tunerData.confidence : 0,
            volume: Number.isFinite(tunerData.volume) ? tunerData.volume : 0,
            stringIdx,
            activeNotes: Array.isArray(tunerData.activeNotes) ? tunerData.activeNotes : null,
            updatedAt: _nowMs()
        };
    }

    getNoteHand(note) {
        if (!note) return "right";
        if (note.lane === "chords") return "left";
        if (note.lane === "melody") return "right";
        if (note.hand === "left" || note.hand === "right") return note.hand;
        if (note.isChordNote) return "left";
        if (note.clef === "bass") return "left";
        return "right";
    }

    isNoteLaneEnabled(note) {
        const hand = this.getNoteHand(note);
        return hand === "left" ? Boolean(this.activeHands.left) : Boolean(this.activeHands.right);
    }

    resolveNoteTabPosition(note) {
        if (!note) {
            return {
                string: 0,
                fret: 0,
                pitch: this.tuning[0].openMidi,
                finger: 0,
                style: UKULELE_FINGER_PALETTE[0]
            };
        }

        const hasValidString = Number.isInteger(note.string) && note.string >= 0 && note.string <= 3;
        const hasValidFret = Number.isInteger(note.fret) && note.fret >= 0 && note.fret <= MAX_FRET;

        let stringIdx;
        let fret;
        let pitch;

        if (hasValidString && hasValidFret) {
            stringIdx = note.string;
            fret = note.fret;
            pitch = Number.isFinite(note.pitch) ? Math.round(note.pitch) : (this.tuning[stringIdx].openMidi + fret);
        } else if (hasValidString && Number.isFinite(note.pitch)) {
            stringIdx = note.string;
            fret = _clamp(Math.round(note.pitch) - this.tuning[stringIdx].openMidi, 0, MAX_FRET);
            pitch = this.tuning[stringIdx].openMidi + fret;
        } else {
            const mapped = mapPitchToUkuleleTab(note.pitch, this.tuning, MAX_FRET);
            stringIdx = mapped.string;
            fret = mapped.fret;
            pitch = mapped.pitch;
        }

        const style = _resolveUkuleleFingerStyle(note, fret);
        return {
            string: stringIdx,
            fret,
            pitch,
            finger: style.finger,
            style
        };
    }

    _computeLayout(w, h) {
        const safeW = Math.max(320, w || 960);
        const safeH = Math.max(200, h || 360);
        const topBarHeight = 40;
        const stageHeight = safeH - topBarHeight;

        const chordRailHeight = _clamp(stageHeight * 0.17, 34, 52);
        const maxBoardSpan = Math.max(96, stageHeight - chordRailHeight - 44);
        const stringSpacing = _clamp((maxBoardSpan * 0.68) / 3, 22, 48);
        const boardPaddingY = _clamp(stringSpacing * 0.58, 15, 28);
        const boardHeight = stringSpacing * 3 + boardPaddingY * 2;

        const idealTop = topBarHeight + chordRailHeight + Math.max(12, (stageHeight - chordRailHeight - boardHeight) * 0.44);
        const boardTop = _clamp(idealTop, topBarHeight + 42, Math.max(topBarHeight + 42, safeH - boardHeight - 24));
        const boardBottom = boardTop + boardHeight;
        const boardCenterY = (boardTop + boardBottom) * 0.5;

        const stringYs = [
            boardTop + boardPaddingY,
            boardTop + boardPaddingY + stringSpacing,
            boardTop + boardPaddingY + stringSpacing * 2,
            boardTop + boardPaddingY + stringSpacing * 3
        ];

        const railWidth = _clamp(safeW * 0.075, 58, 76);
        const playheadX = Math.max(railWidth + 44, safeW * this.playheadRatio);
        const pillRadius = _clamp(stringSpacing * 0.37, 10.5, 16.5);
        const ballRadius = _clamp(pillRadius * 0.62, 7.8, 10.5);

        return {
            w: safeW,
            h: safeH,
            topBarHeight,
            chordRailHeight,
            boardTop,
            boardBottom,
            boardHeight,
            boardCenterY,
            boardPaddingY,
            stringSpacing,
            stringYs,
            railWidth,
            playheadX,
            pillRadius,
            ballRadius,
            minApexY: topBarHeight + ballRadius + 8,
            minContactY: topBarHeight + ballRadius + 14,
            maxContactY: boardBottom - ballRadius - 4
        };
    }

    getStringY(stringIdx, layout = null) {
        const lay = layout || this._lastLayout || this._computeLayout(this.width || 960, this.height || 360);
        const idx = _clamp(Math.round(Number(stringIdx) || 0), 0, 3);
        return lay.stringYs[idx];
    }

    /* ======================================================================
       Non-Punitive Feedback & Effect APIs (YousicianRenderer compatible + Ukulele native)
       ====================================================================== */

    resetEffects() {
        this.ripples = [];
        this.particles = [];
        this.hitTexts = [];
        this.ghostMarks = [];
        this._stringGlowUntil = [0, 0, 0, 0];
    }

    clearWrongHints() {
        this.ghostMarks = [];
    }

    triggerHitEffect(note, status = "PERFECT", label = null) {
        const hand = this.getNoteHand(note);
        const upper = String(status || "PERFECT").toUpperCase();
        const kind = upper === "PERFECT" ? "perfect" : (upper.includes("MISS") ? "missed" : "good");
        const color = kind === "perfect" ? "#6EE7B7" : "#E2C98A";
        this.addHitFeedback(label || status || "Perfect", color, hand === "right", {
            kind,
            note,
            pitch: note && Number.isFinite(note.pitch) ? note.pitch : null,
            string: note && Number.isInteger(note.string) ? note.string : null,
            hand
        });
    }

    triggerWrongNote(midi, stringIdx = null) {
        const resolved = (Number.isInteger(stringIdx) && stringIdx >= 0 && stringIdx <= 3)
            ? { string: stringIdx, pitch: Number.isFinite(midi) ? midi : this.tuning[stringIdx].openMidi }
            : mapPitchToUkuleleTab(midi, this.tuning, MAX_FRET);

        this.addHitFeedback("OFF", "#94A3B8", true, {
            kind: "wrong",
            pitch: resolved.pitch,
            string: resolved.string
        });
    }

    addHitFeedback(text, color, isTreble = true, meta = null) {
        const hand = (meta && (meta.hand === "left" || meta.hand === "right"))
            ? meta.hand
            : (meta && meta.note ? this.getNoteHand(meta.note) : (isTreble ? "right" : "left"));

        if (!this.activeHands.left && !this.activeHands.right) return;
        if (meta && meta.note && !this.isNoteLaneEnabled(meta.note)) return;

        const now = _nowMs();
        const upper = String(text || "").toUpperCase();
        const kind = (meta && meta.kind)
            ? meta.kind
            : (upper.includes("MISS") ? "missed" : (upper.includes("WRONG") ? "wrong" : (upper === "PERFECT" ? "perfect" : "good")));

        // 1. Missed notes: zero banners/particles — note pill quietly dims into desaturated ghost capsule
        if (kind === "missed") {
            return;
        }

        const layout = this._lastLayout || this._computeLayout(this.width || 960, this.height || 360);
        const playheadX = layout.playheadX;

        let stringIdx = null;
        if (meta && Number.isInteger(meta.string) && meta.string >= 0 && meta.string <= 3) {
            stringIdx = meta.string;
        } else if (meta && meta.note) {
            stringIdx = this.resolveNoteTabPosition(meta.note).string;
        } else if (meta && Number.isFinite(meta.pitch)) {
            stringIdx = mapPitchToUkuleleTab(meta.pitch, this.tuning, MAX_FRET).string;
        } else {
            stringIdx = 0;
        }

        // 2. Off-target pluck: 380ms calm hollow ghost ring on the played string height, ZERO red!
        if (kind === "wrong") {
            this.ghostMarks.push({
                stringIdx,
                pitch: (meta && Number.isFinite(meta.pitch)) ? meta.pitch : null,
                hand,
                createdAt: now,
                duration: 380
            });
            if (this.ghostMarks.length > 12) {
                this.ghostMarks.shift();
            }
            return;
        }

        // 3. Positive hit ("perfect" | "good"): calm concentric water ripples + deduplicated whisper micro-label
        const rippleY = layout.stringYs[stringIdx];
        const isPerfect = kind === "perfect";
        const subtleColor = isPerfect ? "#6EE7B7" : "#E2C98A";

        this._stringGlowUntil[stringIdx] = now + 260;

        this.ripples.push({
            x: playheadX,
            y: rippleY,
            stringIdx,
            hand,
            color: subtleColor,
            createdAt: now,
            duration: 460
        });
        if (this.ripples.length > 18) {
            this.ripples.shift();
        }

        // At most 2–3 fine luminous dust motes drifting softly (never noisy bursts)
        for (let i = 0; i < 3; i++) {
            const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.1;
            const speed = 0.30 + Math.random() * 0.55;
            this.particles.push({
                x: playheadX + (Math.random() - 0.5) * 6,
                y: rippleY + (Math.random() - 0.5) * 4,
                hand,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 0.14,
                color: subtleColor,
                size: 1.0 + Math.random() * 0.9,
                alpha: 0.42,
                decay: 0.02 + Math.random() * 0.012
            });
        }

        // Deduplicate per-beat chord micro-labels so 4-string strums show ONE poised whisper
        const formattedLabel = upper === "PERFECT"
            ? "Perfect"
            : (upper === "EARLY" ? "Early" : (upper === "LATE" ? "Late" : (upper === "GOOD" ? "Good" : String(text || "Good"))));

        const recentWhisper = this.hitTexts.find((ht) => (now - ht.createdAt) < 95);
        if (recentWhisper) {
            if (!isPerfect && recentWhisper.text === "Perfect") {
                recentWhisper.text = formattedLabel;
                recentWhisper.color = subtleColor;
            }
            return;
        }

        const labelY = Math.max(layout.topBarHeight + 18, layout.boardTop - 38);
        this.hitTexts.push({
            text: formattedLabel,
            color: subtleColor,
            x: playheadX,
            y: labelY,
            hand,
            createdAt: now,
            duration: 540
        });
    }

    /* ======================================================================
       Exact Uniform-Gravity Parabolic Ball Physics (O(log N) per frame)
       ====================================================================== */

    _normalizeOnsetEvents(inputList, laneFilter = "all") {
        if (!Array.isArray(inputList) || inputList.length === 0) return [];

        // Check if caller already supplied pre-clustered onset events [{ time, endTime, notes }]
        const firstItem = inputList[0];
        if (firstItem && Array.isArray(firstItem.notes) && Number.isFinite(firstItem.time)) {
            return inputList;
        }

        const filterKey = typeof laneFilter === "string"
            ? laneFilter
            : `${laneFilter.left ? "L" : "_"}${laneFilter.right ? "R" : "_"}`;

        const lastRef = inputList[inputList.length - 1];
        let cached = this._eventsCache.get(inputList);
        if (
            cached &&
            cached._len === inputList.length &&
            cached._first === firstItem &&
            cached._last === lastRef &&
            cached[filterKey]
        ) {
            return cached[filterKey];
        }

        const filtered = inputList
            .filter((n) => {
                if (!n || !Number.isFinite(n.time)) return false;
                if (laneFilter === "all") return true;
                const h = this.getNoteHand(n);
                if (laneFilter === "right" || laneFilter === "melody") return h === "right";
                if (laneFilter === "left" || laneFilter === "chords") return h === "left";
                if (typeof laneFilter === "object" && laneFilter !== null) {
                    return h === "left" ? Boolean(laneFilter.left) : Boolean(laneFilter.right);
                }
                return true;
            })
            .sort((a, b) => a.time - b.time || ((a.string ?? 0) - (b.string ?? 0)));

        const events = [];
        for (let i = 0; i < filtered.length; i++) {
            const n = filtered[i];
            const dur = Math.max(0.15, Number.isFinite(n.duration) ? n.duration : 0.4);
            const prev = events.length > 0 ? events[events.length - 1] : null;
            if (prev && (n.time - prev.time) <= CHORD_WINDOW_SEC) {
                prev.notes.push(n);
                if (n.time + dur > prev.endTime) {
                    prev.endTime = n.time + dur;
                }
            } else {
                events.push({
                    time: n.time,
                    endTime: n.time + dur,
                    notes: [n]
                });
            }
        }

        if (!cached || cached._len !== inputList.length || cached._first !== firstItem || cached._last !== lastRef) {
            cached = { _len: inputList.length, _first: firstItem, _last: lastRef };
            this._eventsCache.set(inputList, cached);
        }
        cached[filterKey] = events;
        return events;
    }

    _resolveEventContactY(event, layout) {
        let topNoteY = Infinity;
        for (let i = 0; i < event.notes.length; i++) {
            const tab = this.resolveNoteTabPosition(event.notes[i]);
            const ny = layout.stringYs[tab.string];
            if (ny < topNoteY) topNoteY = ny;
        }
        if (!Number.isFinite(topNoteY)) {
            topNoteY = layout.stringYs[0];
        }
        const rawContactY = topNoteY - layout.pillRadius - layout.ballRadius + 0.5;
        return _clamp(rawContactY, layout.minContactY, layout.maxContactY);
    }

    /**
     * Exact uniform-gravity parabolic trajectory between contact heights (y0 -> y1)
     * for normalized flight fraction u in [0, 1].
     * Strictly guarantees:
     *   - Exact contact at u=0 (y=y0) and u=1 (y=y1)
     *   - Smooth apex clearance c above min(y0, y1) scaling with horizontal distancePx
     *   - Bounded above minApexY so the sphere never clips into the top HUD bar
     */
    _parabolicArcY(y0, y1, u, distancePx, minApexY) {
        const clampedU = _clamp(u, 0, 1);
        const d = Math.abs(y1 - y0);
        const yHigh = Math.min(y0, y1);
        const cRaw = 8 + 78 * (1 - Math.exp(-Math.max(0, distancePx) / 310));
        const maxHeadroom = Math.max(4, yHigh - minApexY);
        const c = Math.min(cRaw, maxHeadroom);
        const arcH = 0.25 * d + 0.5 * (c + Math.sqrt(c * (d + c)));
        const linearY = (1 - clampedU) * y0 + clampedU * y1;
        const arcLift = 4 * arcH * clampedU * (1 - clampedU);
        return {
            y: linearY - arcLift,
            arcHeight: arcH,
            apexClearance: c,
            u: clampedU
        };
    }

    /**
     * Computes the physical 2D state of the jumping acoustic-ivory sphere at `currentTime`.
     * Supports BOTH calling signatures:
     *   1. `computeBallPosition(eventsOrNotes, currentTime, layout = {})`
     *   2. `computeBallPosition(hand, notes, currentTime, layout = {})` (YousicianRenderer parity)
     */
    computeBallPosition(arg0, arg1, arg2, arg3) {
        let eventsInput;
        let currentTime;
        let layoutArg;
        let laneFilter = "all";

        if (Array.isArray(arg0)) {
            eventsInput = arg0;
            currentTime = Number(arg1) || 0;
            layoutArg = arg2 || {};
        } else {
            laneFilter = arg0 || "all";
            eventsInput = Array.isArray(arg1) ? arg1 : [];
            currentTime = Number(arg2) || 0;
            layoutArg = arg3 || {};
        }

        const baseLayout = this._lastLayout || this._computeLayout(this.width || 960, this.height || 360);
        const layout = {
            ...baseLayout,
            ...layoutArg,
            playheadX: Number.isFinite(layoutArg.playheadX) ? layoutArg.playheadX : baseLayout.playheadX,
            stringYs: Array.isArray(layoutArg.stringYs) && layoutArg.stringYs.length === 4
                ? layoutArg.stringYs
                : baseLayout.stringYs,
            pillRadius: Number.isFinite(layoutArg.pillRadius) ? layoutArg.pillRadius : baseLayout.pillRadius,
            ballRadius: Number.isFinite(layoutArg.ballRadius) ? layoutArg.ballRadius : baseLayout.ballRadius,
            minApexY: Number.isFinite(layoutArg.minApexY) ? layoutArg.minApexY : baseLayout.minApexY,
            minContactY: Number.isFinite(layoutArg.minContactY) ? layoutArg.minContactY : baseLayout.minContactY,
            maxContactY: Number.isFinite(layoutArg.maxContactY) ? layoutArg.maxContactY : baseLayout.maxContactY
        };

        const events = this._normalizeOnsetEvents(eventsInput, laneFilter);
        const { playheadX, ballRadius, minApexY } = layout;

        // 1. No active events: rest calmly above string 0
        if (events.length === 0) {
            const idleY = _clamp(
                layout.stringYs[0] - layout.pillRadius - ballRadius - 4,
                layout.minContactY,
                layout.maxContactY
            );
            return {
                x: playheadX,
                y: idleY,
                radius: ballRadius,
                inFlight: false,
                jumpDuration: 0,
                jumpDistancePx: 0,
                arcHeight: 0,
                contactProximity: 0
            };
        }

        // 2. Pre-roll / count-in arc before first event
        const firstEvent = events[0];
        if (currentTime <= firstEvent.time) {
            const firstY = this._resolveEventContactY(firstEvent, layout);
            const defaultLeadStart = Math.min(0, firstEvent.time - 2.2);
            const launchTime = Math.min(
                firstEvent.time,
                Number.isFinite(layoutArg.startTime) ? layoutArg.startTime : defaultLeadStart
            );
            const dt = firstEvent.time - launchTime;
            if (dt <= 1e-4 || currentTime <= launchTime) {
                return {
                    x: playheadX,
                    y: firstY,
                    radius: ballRadius,
                    inFlight: false,
                    jumpDuration: 0,
                    jumpDistancePx: 0,
                    arcHeight: 0,
                    contactProximity: Math.abs(currentTime - firstEvent.time) <= 0.03 ? 1 : 0
                };
            }
            const u = (currentTime - launchTime) / dt;
            const distPx = dt * this.pixelsPerSecond;
            const arc = this._parabolicArcY(firstY, firstY, u, distPx, minApexY);
            const timeToImpact = firstEvent.time - currentTime;
            return {
                x: playheadX,
                y: arc.y,
                radius: ballRadius,
                inFlight: u > 0 && u < 1,
                jumpDuration: dt,
                jumpDistancePx: distPx,
                arcHeight: arc.arcHeight,
                contactProximity: Math.max(0, 1 - timeToImpact / 0.08)
            };
        }

        // 3. Gentle settle hop after the final note/chord, then serene rest
        const lastEvent = events[events.length - 1];
        if (currentTime >= lastEvent.time) {
            const lastY = this._resolveEventContactY(lastEvent, layout);
            const settleEnd = Math.max(lastEvent.time + 0.25, lastEvent.endTime);
            const dtSettle = settleEnd - lastEvent.time;
            if (currentTime < settleEnd && dtSettle > 1e-4) {
                const u = (currentTime - lastEvent.time) / dtSettle;
                const cSettle = Math.min(9, Math.max(2, lastY - minApexY));
                const y = lastY - 4 * cSettle * u * (1 - u);
                const timeSinceImpact = currentTime - lastEvent.time;
                return {
                    x: playheadX,
                    y,
                    radius: ballRadius,
                    inFlight: true,
                    jumpDuration: dtSettle,
                    jumpDistancePx: dtSettle * this.pixelsPerSecond,
                    arcHeight: cSettle,
                    contactProximity: Math.max(0, 1 - timeSinceImpact / 0.08)
                };
            }
            return {
                x: playheadX,
                y: lastY,
                radius: ballRadius,
                inFlight: false,
                jumpDuration: 0,
                jumpDistancePx: 0,
                arcHeight: 0,
                contactProximity: 0
            };
        }

        // 4. Active jump between consecutive events[idx] -> events[idx + 1] via O(log N) binary search
        let lo = 0;
        let hi = events.length - 2;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (events[mid + 1].time < currentTime) {
                lo = mid + 1;
            } else if (events[mid].time > currentTime) {
                hi = mid - 1;
            } else {
                lo = mid;
                break;
            }
        }
        const idx = _clamp(lo, 0, events.length - 2);
        const e0 = events[idx];
        const e1 = events[idx + 1];
        const y0 = this._resolveEventContactY(e0, layout);
        const y1 = this._resolveEventContactY(e1, layout);

        const dt = Math.max(1e-4, e1.time - e0.time);
        const u = (currentTime - e0.time) / dt;
        const distPx = dt * this.pixelsPerSecond;
        const arc = this._parabolicArcY(y0, y1, u, distPx, minApexY);
        const nearestHeadSec = Math.min(currentTime - e0.time, e1.time - currentTime);

        return {
            x: playheadX,
            y: arc.y,
            radius: ballRadius,
            inFlight: u > 0 && u < 1,
            jumpDuration: dt,
            jumpDistancePx: distPx,
            arcHeight: arc.arcHeight,
            contactProximity: Math.max(0, 1 - nearestHeadSec / 0.08)
        };
    }

    /* ======================================================================
       Main 60 FPS Render Entry Point (Dual-Signature Compatible)
       ====================================================================== */

    /**
     * Renders a complete frame. Supports BOTH:
     *   1. `render(gameState)` — exact `YousicianRenderer` / `GameEngine` interface
     *   2. `render(currentTime, isPlaying, song, mode, evaluator, activeHands, opts)`
     */
    render(arg0, isPlayingArg, songArg, modeArg, evaluatorArg, activeHandsArg, optsArg) {
        if (!this.width || this.width === 0) {
            this.resize();
        }

        let gameState;
        if (arg0 && typeof arg0 === "object") {
            gameState = arg0;
        } else {
            const evalObj = evaluatorArg || {};
            const opts = optsArg || {};
            const mergedSong = songArg
                ? {
                    ...songArg,
                    notes: Array.isArray(evalObj.notes) && evalObj.notes.length > 0 ? evalObj.notes : (songArg.notes || [])
                }
                : null;
            gameState = {
                currentTime: Number(arg0) || 0,
                startTime: Number.isFinite(opts.startTime) ? opts.startTime : 0,
                leadInBeats: Number.isFinite(opts.leadInBeats) ? opts.leadInBeats : 0,
                firstNoteTime: Number.isFinite(opts.firstNoteTime) ? opts.firstNoteTime : 0,
                isPlaying: Boolean(isPlayingArg),
                currentBpm: opts.currentBpm || (mergedSong && mergedSong.bpm) || 100,
                song: mergedSong,
                score: Number.isFinite(evalObj.score) ? evalObj.score : (opts.score || 0),
                streak: Number.isFinite(evalObj.streak) ? evalObj.streak : (opts.streak || 0),
                multiplier: Number.isFinite(evalObj.multiplier) ? evalObj.multiplier : (opts.multiplier || 1),
                isWaiting: Boolean(opts.isWaiting),
                waitTargetNote: opts.waitTargetNote || evalObj.currentWaitNote || null,
                waitTargetChord: opts.waitTargetChord || evalObj.currentWaitChord || [],
                mode: modeArg || opts.mode || "flow",
                activeHands: activeHandsArg || opts.activeHands || this.activeHands
            };
        }

        const {
            currentTime = 0,
            startTime = 0,
            leadInBeats = 0,
            firstNoteTime = 0,
            isPlaying = false,
            currentBpm,
            song = null,
            score = 0,
            streak = 0,
            multiplier = 1,
            isWaiting = false,
            waitTargetNote = null,
            waitTargetChord = [],
            activeHands
        } = gameState;

        if (activeHands) {
            this.activeHands = {
                left: activeHands.left !== false,
                right: activeHands.right !== false
            };
        }
        this._disabledBadgeRects = [];

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        if (!w || !h || !ctx) return;

        const layout = this._computeLayout(w, h);
        this._lastLayout = layout;

        const baseBpm = (song && song.bpm) ? song.bpm : (currentBpm || 100);
        const secondsPerBeat = 60 / baseBpm;
        const beatsPerMeasure = (song && song.beatsPerMeasure) ? song.beatsPerMeasure : 4;
        const measureDuration = secondsPerBeat * beatsPerMeasure;
        const allNotes = (song && Array.isArray(song.notes)) ? song.notes : [];

        // 1. Deep Studio Obsidian Backdrop + Warm Ambient Studio Glow
        this._drawStageBackground(ctx, layout);

        // 2. Refined Ebony/Rosewood 4-String Fretboard Lane, Measure Lines, Beat Ticks & Strings
        this._drawFretboardLane(ctx, layout, {
            currentTime,
            leadInBeats,
            secondsPerBeat,
            beatsPerMeasure,
            measureDuration
        });

        // 3. Chord Symbol Headers & Count-In Beat Numbers above the 4-string lane
        this._drawChordAndCountInRail(ctx, layout, {
            song,
            allNotes,
            currentTime,
            leadInBeats,
            secondsPerBeat,
            beatsPerMeasure,
            measureDuration
        });

        // 4. Dotted Parabolic Trajectory Trail (past trail fade + subtle upcoming jump preview)
        const activeEvents = this._normalizeOnsetEvents(allNotes, this.activeHands);
        if (this.activeHands.left || this.activeHands.right) {
            this._drawParabolicTrail(ctx, layout, activeEvents, currentTime, startTime);
        }

        // 5. Scrolling Tab Notes (disabled-lane dimmed/blurred first, active-lane crisp on top)
        this._drawTabNotes(ctx, layout, allNotes, {
            currentTime,
            isWaiting,
            waitTargetNote,
            waitTargetChord
        });

        // 6. Left Tuning Rail (A / E / C / G nut badges + soft edge mask)
        this._drawLeftTuningRail(ctx, layout);

        // 7. Playhead Beam & Jumping 3D Acoustic-Ivory Sphere
        this._drawPlayheadAndBall(ctx, layout, activeEvents, currentTime, startTime);

        // 8. Clickable Disabled-Lane Indicator Pill (if Melody or Chords toggled OFF)
        this._drawDisabledLaneBadges(ctx, layout);

        // 9. Top Conservatory HUD Bar (Multiplier, Lane Status, Wait/Count-In, Mini Tuner, Score)
        this._drawTopBar(ctx, layout, {
            score,
            streak,
            multiplier,
            isWaiting,
            waitTargetNote,
            waitTargetChord,
            currentTime,
            startTime,
            firstNoteTime,
            secondsPerBeat,
            isPlaying
        });

        // 10. Calm Non-Punitive Hit Ripples, Whisper Micro-Labels & Off-Target Ghost Rings
        this._renderEffects(ctx, layout);
    }

    /* ======================================================================
       Stage, Fretboard Lane, Strings & Measure Grid Drawing
       ====================================================================== */

    _drawStageBackground(ctx, layout) {
        const { w, h, playheadX, boardCenterY } = layout;

        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, "#0C0E14");
        bgGrad.addColorStop(0.52, "#10131C");
        bgGrad.addColorStop(1, "#0A0D12");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Whisper-soft ambient studio glow centered on the playhead
        const ambientGrad = ctx.createRadialGradient(
            playheadX,
            boardCenterY,
            18,
            playheadX,
            boardCenterY,
            Math.max(w * 0.44, 300)
        );
        ambientGrad.addColorStop(0, "rgba(226, 201, 138, 0.036)");
        ambientGrad.addColorStop(0.55, "rgba(203, 213, 225, 0.014)");
        ambientGrad.addColorStop(1, "rgba(12, 14, 20, 0)");
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, w, h);
    }

    _drawFretboardLane(ctx, layout, timing) {
        const { w, boardTop, boardBottom, boardHeight, stringYs, playheadX, railWidth } = layout;
        const { currentTime, leadInBeats, secondsPerBeat, beatsPerMeasure, measureDuration } = timing;
        const now = _nowMs();

        ctx.save();

        // Subtle recessed elevation shadow behind the ebony/rosewood fretboard strip
        ctx.fillStyle = "rgba(4, 6, 10, 0.45)";
        ctx.fillRect(0, boardBottom, w, 6);

        // Ebony / warm-slate fretboard body gradient
        const deckGrad = ctx.createLinearGradient(0, boardTop, 0, boardBottom);
        deckGrad.addColorStop(0, "#141824");
        deckGrad.addColorStop(0.5, "#111520");
        deckGrad.addColorStop(1, "#141824");
        ctx.fillStyle = deckGrad;
        ctx.fillRect(0, boardTop, w, boardHeight);

        // Subtle warm-rosewood interior sheen band
        const sheenGrad = ctx.createLinearGradient(0, boardTop, 0, boardBottom);
        sheenGrad.addColorStop(0, "rgba(226, 201, 138, 0.035)");
        sheenGrad.addColorStop(0.25, "rgba(255, 255, 255, 0.008)");
        sheenGrad.addColorStop(0.75, "rgba(0, 0, 0, 0.06)");
        sheenGrad.addColorStop(1, "rgba(226, 201, 138, 0.025)");
        ctx.fillStyle = sheenGrad;
        ctx.fillRect(0, boardTop, w, boardHeight);

        // Clip scrolling grid cleanly inside the fretboard deck
        ctx.save();
        ctx.beginPath();
        ctx.rect(railWidth, boardTop, w - railWidth, boardHeight);
        ctx.clip();

        const startMeasure = Math.floor((currentTime - (playheadX / this.pixelsPerSecond)) / measureDuration);
        const endMeasure = Math.ceil((currentTime + ((w - playheadX) / this.pixelsPerSecond)) / measureDuration);

        // Alternating ultra-subtle measure shading + measure barlines + beat grid ticks
        for (let m = Math.max(0, startMeasure); m <= endMeasure; m++) {
            const measureTime = m * measureDuration;
            const barX = playheadX + (measureTime - currentTime) * this.pixelsPerSecond;
            const nextBarX = barX + measureDuration * this.pixelsPerSecond;

            if (m % 2 === 1) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.012)";
                ctx.fillRect(barX, boardTop, Math.max(0, nextBarX - barX), boardHeight);
            }

            // Inner beat ticks (subtle fret-like rhythmic cadence grid)
            for (let b = 1; b < beatsPerMeasure; b++) {
                const beatX = barX + b * secondsPerBeat * this.pixelsPerSecond;
                if (beatX < railWidth || beatX > w) continue;

                ctx.strokeStyle = "rgba(228, 224, 214, 0.052)";
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                ctx.moveTo(beatX, boardTop + 2);
                ctx.lineTo(beatX, boardBottom - 2);
                ctx.stroke();

                // Tiny satin beat tick at top rim
                ctx.fillStyle = "rgba(226, 201, 138, 0.20)";
                ctx.fillRect(beatX - 0.5, boardTop, 1, 5);
            }

            // Primary measure barline
            if (barX >= railWidth && barX <= w) {
                ctx.strokeStyle = m === 0
                    ? "rgba(110, 231, 183, 0.34)"
                    : "rgba(226, 201, 138, 0.16)";
                ctx.lineWidth = m === 0 ? 1.5 : 1.05;
                ctx.beginPath();
                ctx.moveTo(barX, boardTop);
                ctx.lineTo(barX, boardBottom);
                ctx.stroke();
            }
        }

        // Pre-roll count-in vertical dashed lines (t < 0)
        if (leadInBeats > 0) {
            ctx.save();
            ctx.setLineDash([3, 5]);
            for (let b = 0; b < leadInBeats; b++) {
                const beatTime = (b - leadInBeats) * secondsPerBeat;
                const beatX = playheadX + (beatTime - currentTime) * this.pixelsPerSecond;
                if (beatX < railWidth || beatX > w) continue;
                const isDownbeat = (b % beatsPerMeasure) === 0;
                ctx.strokeStyle = isDownbeat
                    ? "rgba(110, 231, 183, 0.26)"
                    : "rgba(226, 232, 240, 0.09)";
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                ctx.moveTo(beatX, boardTop);
                ctx.lineTo(beatX, boardBottom);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.restore();

        // Subtle measure numbers placed cleanly below the fretboard deck border (clear of G4 pills & strum arrows)
        ctx.save();
        ctx.fillStyle = "rgba(148, 163, 184, 0.44)";
        ctx.font = "500 9.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        for (let m = Math.max(0, startMeasure); m <= endMeasure; m++) {
            const barX = playheadX + (m * measureDuration - currentTime) * this.pixelsPerSecond;
            if (barX >= railWidth + 4 && barX <= w - 20) {
                ctx.fillText(String(m + 1), barX + 13, boardBottom + 12);
            }
        }
        ctx.restore();

        // Top & bottom refined champagne hairline borders on the fretboard deck
        ctx.fillStyle = "rgba(226, 201, 138, 0.14)";
        ctx.fillRect(0, boardTop, w, 1);
        ctx.fillRect(0, boardBottom - 1, w, 1);

        // 4 Horizontal Ukulele Strings (0=A4 thinnest, 1=E4, 2=C4 thickest, 3=G4 re-entrant)
        for (let s = 0; s < 4; s++) {
            const spec = this.tuning[s] || UKULELE_STRINGS[s];
            const sy = stringYs[s];
            const glowFrac = Math.max(0, (this._stringGlowUntil[s] - now) / 260);
            const tunerMatch = Boolean(
                this.tunerState &&
                this.tunerState.active &&
                this.tunerState.stringIdx === s &&
                (now - this.tunerState.updatedAt) < 1200
            );

            // Delicate dark underside shadow for tactile 3D relief
            ctx.strokeStyle = "rgba(4, 6, 10, 0.58)";
            ctx.lineWidth = spec.gauge + 0.6;
            ctx.beginPath();
            ctx.moveTo(railWidth, sy + 1.0);
            ctx.lineTo(w, sy + 1.0);
            ctx.stroke();

            // Main satin silver-champagne nylon string
            const baseAlpha = spec.alpha || 0.34;
            ctx.strokeStyle = glowFrac > 0.02
                ? `rgba(110, 231, 183, ${(baseAlpha + glowFrac * 0.42).toFixed(3)})`
                : (tunerMatch
                    ? "rgba(226, 201, 138, 0.54)"
                    : `rgba(228, 224, 214, ${baseAlpha.toFixed(3)})`);
            ctx.lineWidth = spec.gauge;
            ctx.beginPath();
            ctx.moveTo(railWidth, sy);
            ctx.lineTo(w, sy);
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawChordAndCountInRail(ctx, layout, state) {
        const { w, boardTop, playheadX, railWidth } = layout;
        const { song, allNotes, currentTime, leadInBeats, secondsPerBeat, beatsPerMeasure, measureDuration } = state;

        ctx.save();
        const labelY = Math.max(layout.topBarHeight + 16, boardTop - 20);

        // 1. Count-in beat numbers (t < 0)
        if (leadInBeats > 0) {
            for (let b = 0; b < leadInBeats; b++) {
                const beatTime = (b - leadInBeats) * secondsPerBeat;
                const beatX = playheadX + (beatTime - currentTime) * this.pixelsPerSecond;
                if (beatX < railWidth || beatX > w - 16) continue;
                const isDownbeat = (b % beatsPerMeasure) === 0;
                const beatNum = (b % beatsPerMeasure) + 1;
                const text = b === 0 ? `Count-in ${beatNum}` : String(beatNum);
                ctx.fillStyle = isDownbeat ? "rgba(110, 231, 183, 0.78)" : "rgba(148, 163, 184, 0.56)";
                ctx.font = "500 11px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(text, beatX + 6, labelY);
            }
        }

        // 2. Build chronological chord markers (prefer explicit note.chordSymbol changes; fallback to song.chords per measure)
        const chordMarkers = [];
        let lastChordSym = null;
        let lastChordTime = -Infinity;
        for (let i = 0; i < allNotes.length; i++) {
            const n = allNotes[i];
            if (!n || !n.chordSymbol) continue;
            const sym = String(n.chordSymbol).trim();
            if (!sym) continue;
            // Emit badge when chord changes OR at the start of a new measure
            const isNewMeasure = Math.abs(n.time - lastChordTime) >= measureDuration * 0.85;
            if (sym !== lastChordSym || isNewMeasure) {
                chordMarkers.push({ time: n.time, symbol: sym });
                lastChordSym = sym;
                lastChordTime = n.time;
            }
        }

        if (chordMarkers.length === 0 && song && Array.isArray(song.chords) && song.chords.length > 0) {
            const startM = Math.max(0, Math.floor((currentTime - (playheadX / this.pixelsPerSecond)) / measureDuration));
            const endM = Math.ceil((currentTime + ((w - playheadX) / this.pixelsPerSecond)) / measureDuration);
            for (let m = startM; m <= endM; m++) {
                const sym = song.chords[m % song.chords.length];
                if (sym) {
                    chordMarkers.push({ time: m * measureDuration, symbol: String(sym) });
                }
            }
        }

        // Determine currently sounding chord index
        let activeIdx = -1;
        for (let i = 0; i < chordMarkers.length; i++) {
            if (chordMarkers[i].time <= currentTime + 0.08) {
                activeIdx = i;
            } else {
                break;
            }
        }

        let lastDrawnRight = -Infinity;
        for (let i = 0; i < chordMarkers.length; i++) {
            const cm = chordMarkers[i];
            const cx = playheadX + (cm.time - currentTime) * this.pixelsPerSecond;
            if (cx < railWidth - 20 || cx > w + 20) continue;

            const isCurrent = i === activeIdx && currentTime >= cm.time - 0.12;
            ctx.font = "600 12.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            const textW = ctx.measureText ? ctx.measureText(cm.symbol).width : cm.symbol.length * 8;
            const pillW = Math.max(28, textW + 16);
            const pillH = 22;
            const pillX = Math.max(railWidth + 4, cx - pillW * 0.35);

            if (pillX < lastDrawnRight + 6) continue;
            lastDrawnRight = pillX + pillW;

            const pillY = labelY - pillH / 2;

            ctx.fillStyle = isCurrent ? "rgba(226, 201, 138, 0.14)" : "rgba(22, 28, 40, 0.72)";
            ctx.beginPath();
            this.drawPill(ctx, pillX, pillY, pillW, pillH, 11);
            ctx.fill();

            ctx.strokeStyle = isCurrent ? "rgba(226, 201, 138, 0.42)" : "rgba(255, 255, 255, 0.10)";
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = isCurrent ? "#F2E2B8" : "rgba(226, 232, 240, 0.76)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cm.symbol, pillX + pillW / 2, labelY + 0.5);
        }

        ctx.restore();
    }

    /* ======================================================================
       Dotted Parabolic Trajectory Trail (Past Fade + Upcoming Arc Preview)
       ====================================================================== */

    _drawParabolicTrail(ctx, layout, events, currentTime, startTime) {
        if (!Array.isArray(events) || events.length === 0) return;

        const { playheadX, railWidth, w } = layout;
        const stepPx = 9.5;
        const stepSec = stepPx / this.pixelsPerSecond;
        const pastSpanPx = Math.min(240, Math.max(60, playheadX - railWidth - 8));
        const futureSpanPx = Math.min(260, Math.max(80, w - playheadX - 36));
        const layoutWithStart = { ...layout, startTime };

        ctx.save();

        // 1. Past Dotted Parabolic Trail (behind playhead, fading gracefully leftward)
        const pastSteps = Math.floor(pastSpanPx / stepPx);
        for (let i = 1; i <= pastSteps; i++) {
            const sampleTime = currentTime - i * stepSec;
            if (sampleTime < startTime - 0.05) break;
            const sx = playheadX - i * stepPx;
            if (sx <= railWidth + 4) break;

            const pt = this.computeBallPosition(events, sampleTime, layoutWithStart);
            const frac = 1 - (i / pastSteps);
            const alpha = 0.54 * frac * frac;
            if (alpha < 0.025) continue;

            const dotR = 1.15 + 1.25 * frac;
            ctx.fillStyle = `rgba(238, 242, 246, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, pt.y, dotR, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Subtle Upcoming Parabolic Arc Preview (ahead of playhead onto next target pill)
        const futureSteps = Math.floor(futureSpanPx / stepPx);
        const lastEventEnd = events[events.length - 1].time + 0.25;
        for (let i = 1; i <= futureSteps; i++) {
            const sampleTime = currentTime + i * stepSec;
            if (sampleTime > lastEventEnd) break;
            const sx = playheadX + i * stepPx;
            if (sx >= w - 12) break;

            const pt = this.computeBallPosition(events, sampleTime, layoutWithStart);
            const frac = 1 - (i / futureSteps);
            const alpha = 0.34 * Math.pow(frac, 1.35);
            if (alpha < 0.025) continue;

            const dotR = 1.1 + 0.85 * frac;
            ctx.fillStyle = `rgba(226, 201, 138, ${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, pt.y, dotR, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    /* ======================================================================
       4-String Fret Pills, Duration Tails & Strum Brackets
       ====================================================================== */

    _drawTabNotes(ctx, layout, allNotes, state) {
        if (!Array.isArray(allNotes) || allNotes.length === 0) return;

        const { w, railWidth, playheadX, pillRadius, stringYs, boardBottom } = layout;
        const { currentTime, isWaiting, waitTargetNote, waitTargetChord } = state;
        const now = _nowMs();

        // Separate visible notes into disabled-lane (drawn dimmed/blurred behind) and active-lane (crisp on top)
        const disabledNotes = [];
        const activeNotes = [];

        for (let i = 0; i < allNotes.length; i++) {
            const note = allNotes[i];
            if (!note || !Number.isFinite(note.time)) continue;
            const dur = Math.max(0.15, Number.isFinite(note.duration) ? note.duration : 0.4);
            const x = playheadX + (note.time - currentTime) * this.pixelsPerSecond;
            const tailW = Math.max(pillRadius * 2, dur * this.pixelsPerSecond);

            if (x + tailW < railWidth - 36 || x - pillRadius > w + 40) continue;

            const tab = this.resolveNoteTabPosition(note);
            const item = { note, x, y: stringYs[tab.string], tab, dur, tailW };
            if (this.isNoteLaneEnabled(note)) {
                activeNotes.push(item);
            } else {
                disabledNotes.push(item);
            }
        }

        // Pass 1: Disabled-lane notes (soft muted frosted dim/blur so active lane stands out cleanly)
        if (disabledNotes.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            if ("filter" in ctx) {
                ctx.filter = "blur(1.2px)";
            }
            for (let i = 0; i < disabledNotes.length; i++) {
                this._drawSingleTabNote(ctx, disabledNotes[i], layout, false, false, now);
            }
            if ("filter" in ctx) {
                ctx.filter = "none";
            }
            ctx.restore();
        }

        // Pass 2: Active-lane simultaneous chord strum brackets + down/up arrows
        if (activeNotes.length > 1) {
            this._drawStrumBrackets(ctx, activeNotes, layout);
        }

        // Pass 3: Active-lane fret pills (tails first, then crisp fret circles)
        for (let i = 0; i < activeNotes.length; i++) {
            const item = activeNotes[i];
            const note = item.note;
            const isWaitTarget = isWaiting && note.state === "pending" && (
                (Array.isArray(waitTargetChord) && waitTargetChord.some((wn) => wn.index === note.index)) ||
                (waitTargetNote && Math.abs(waitTargetNote.time - note.time) <= CHORD_WINDOW_SEC)
            );
            this._drawSingleTabNote(ctx, item, layout, true, isWaitTarget, now);
        }
    }

    _drawStrumBrackets(ctx, activeItems, layout) {
        const { pillRadius, boardBottom } = layout;

        // Group visible active notes by onset timestamp (within 55ms)
        const sorted = [...activeItems].sort((a, b) => a.note.time - b.note.time || a.tab.string - b.tab.string);
        const groups = [];
        for (let i = 0; i < sorted.length; i++) {
            const it = sorted[i];
            const prev = groups.length > 0 ? groups[groups.length - 1] : null;
            if (prev && Math.abs(it.note.time - prev.time) <= CHORD_WINDOW_SEC) {
                prev.items.push(it);
            } else {
                groups.push({ time: it.note.time, x: it.x, items: [it] });
            }
        }

        ctx.save();
        for (let g = 0; g < groups.length; g++) {
            const grp = groups[g];
            if (grp.items.length < 2) continue;

            let minY = Infinity;
            let maxY = -Infinity;
            let strumDir = null;
            let allCorrect = true;
            let allMissed = true;

            for (let j = 0; j < grp.items.length; j++) {
                const it = grp.items[j];
                if (it.y < minY) minY = it.y;
                if (it.y > maxY) maxY = it.y;
                if (!strumDir && it.note.strumDir) strumDir = it.note.strumDir;
                if (it.note.state !== "correct") allCorrect = false;
                if (it.note.state !== "wrong") allMissed = false;
            }

            if (maxY - minY < 4) continue;

            // Refined vertical strum connector spine behind the simultaneous fret pills
            const spineColor = allCorrect
                ? "rgba(110, 231, 183, 0.36)"
                : (allMissed ? "rgba(100, 116, 139, 0.22)" : "rgba(226, 201, 138, 0.30)");

            ctx.strokeStyle = spineColor;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(grp.x, minY);
            ctx.lineTo(grp.x, maxY);
            ctx.stroke();

            // Subtle strum direction indicator (↓ down-strum / ↑ up-strum) neatly beneath the fretboard
            const dir = strumDir === "up" ? "up" : "down";
            const arrowGlyph = dir === "up" ? "↑" : "↓";
            const badgeY = boardBottom + 12;

            ctx.fillStyle = allCorrect
                ? "rgba(110, 231, 183, 0.72)"
                : (allMissed ? "rgba(100, 116, 139, 0.42)" : "rgba(226, 201, 138, 0.72)");
            ctx.font = "600 12px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(arrowGlyph, grp.x, badgeY);

            // Subtle hairline tick connecting bottom pill to arrow
            ctx.strokeStyle = "rgba(226, 201, 138, 0.16)";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(grp.x, maxY + pillRadius + 1);
            ctx.lineTo(grp.x, boardBottom + 4);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawSingleTabNote(ctx, item, layout, showAccuracy, isWaitTarget, now) {
        const { note, x, y, tab, tailW } = item;
        const { pillRadius } = layout;
        const style = tab.style;

        let gradTop = style.light;
        let gradMid = style.primary;
        let gradBot = style.dark;
        let pillAlpha = 0.95;
        let strokeColor = "rgba(255, 255, 255, 0.32)";
        let textColor = "#FFFFFF";
        let tailTint = style.primary;
        let isGhostMissed = false;

        if (!showAccuracy) {
            gradTop = "#64748B";
            gradMid = "#475569";
            gradBot = "#334155";
            strokeColor = "rgba(203, 213, 225, 0.24)";
            textColor = "rgba(226, 232, 240, 0.76)";
            tailTint = "#475569";
        } else if (note.state === "correct") {
            gradTop = "#84D9AE";
            gradMid = "#52B788";
            gradBot = "#358762";
            pillAlpha = 0.94;
            strokeColor = "rgba(209, 250, 229, 0.50)";
            tailTint = "#52B788";
        } else if (note.state === "wrong") {
            // Calm desaturated slate ghost capsule — ZERO red!
            gradTop = "rgba(100, 116, 139, 0.38)";
            gradMid = "rgba(71, 85, 105, 0.34)";
            gradBot = "rgba(30, 41, 59, 0.40)";
            pillAlpha = 0.78;
            strokeColor = "rgba(148, 163, 184, 0.24)";
            textColor = "rgba(203, 213, 225, 0.52)";
            tailTint = "#64748B";
            isGhostMissed = true;
        }

        // 1. Horizontal Sustain Duration Tail Bar (extends rightward behind the circular fret head)
        const sustainTailLen = tailW - pillRadius * 2;
        if (sustainTailLen > 6) {
            const tailH = Math.max(10, pillRadius * 0.94);
            const tailX = x;
            const tailY = y - tailH / 2;
            const drawTailW = tailW - pillRadius * 0.45;

            ctx.save();
            ctx.globalAlpha = isGhostMissed ? 0.40 : (showAccuracy ? 0.92 : 0.65);

            const tailGrad = ctx.createLinearGradient(tailX, tailY, tailX + drawTailW, tailY);
            tailGrad.addColorStop(0, _hexToRgba(tailTint, isGhostMissed ? 0.22 : 0.40));
            tailGrad.addColorStop(0.75, _hexToRgba(tailTint, isGhostMissed ? 0.14 : 0.26));
            tailGrad.addColorStop(1, _hexToRgba(tailTint, isGhostMissed ? 0.08 : 0.14));

            ctx.fillStyle = tailGrad;
            ctx.beginPath();
            this.drawPill(ctx, tailX, tailY, drawTailW, tailH, tailH / 2);
            ctx.fill();

            ctx.strokeStyle = _hexToRgba(tailTint, isGhostMissed ? 0.18 : 0.42);
            ctx.lineWidth = 0.9;
            ctx.stroke();

            // Subtle pitch whisper inside long sustain tails (only when uncluttered)
            if (showAccuracy && !isGhostMissed && sustainTailLen >= 34) {
                const pitchTxt = _formatPitchName(tab.pitch);
                ctx.fillStyle = "rgba(241, 245, 249, 0.58)";
                ctx.font = "500 9.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(pitchTxt, x + pillRadius + 6, y + 0.5);
            }
            ctx.restore();
        }

        // 2. Serene Breathing Wait-Mode Target Halo
        if (isWaitTarget) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.0044);
            const haloR = pillRadius + 3.2 + pulse * 3.8;
            ctx.save();
            ctx.globalAlpha = 0.34 + pulse * 0.34;
            ctx.strokeStyle = style.light;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, haloR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Circular / Capsule Fret Pill Head
        const fretText = String(tab.fret);
        const isTwoDigit = fretText.length >= 2;
        const headHalfW = isTwoDigit ? pillRadius + 2.5 : pillRadius;
        const headH = pillRadius * 2;

        ctx.save();
        ctx.globalAlpha = showAccuracy ? pillAlpha : 1.0;

        if (showAccuracy && !isGhostMissed) {
            ctx.shadowColor = "rgba(5, 9, 16, 0.44)";
            ctx.shadowBlur = 7;
            ctx.shadowOffsetY = 2;
        }

        ctx.beginPath();
        if (isTwoDigit) {
            this.drawPill(ctx, x - headHalfW, y - pillRadius, headHalfW * 2, headH, pillRadius);
        } else {
            ctx.arc(x, y, pillRadius, 0, Math.PI * 2);
        }

        const pillGrad = ctx.createLinearGradient(0, y - pillRadius, 0, y + pillRadius);
        pillGrad.addColorStop(0, gradTop);
        pillGrad.addColorStop(0.52, gradMid);
        pillGrad.addColorStop(1, gradBot);
        ctx.fillStyle = pillGrad;
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Crisp hairline rim
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Subtle concentric inner open-string ring for fret === 0
        if (tab.fret === 0 && !isGhostMissed) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(4, pillRadius - 2.8), 0, Math.PI * 2);
            ctx.stroke();
        }

        // Bold crisp fret number typography
        ctx.fillStyle = textColor;
        if (showAccuracy && !isGhostMissed) {
            ctx.shadowColor = "rgba(10, 14, 24, 0.68)";
            ctx.shadowBlur = 2.4;
            ctx.shadowOffsetY = 0.8;
        }
        const fontSize = isTwoDigit ? Math.max(10.5, pillRadius * 0.78) : Math.max(11.5, pillRadius * 0.88);
        ctx.font = `700 ${fontSize.toFixed(1)}px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fretText, x, y + 0.5);

        ctx.restore();
    }

    /* ======================================================================
       Left Tuning Rail (A4 / E4 / C4 / G4) + Smooth Scroll Fade Mask
       ====================================================================== */

    _drawLeftTuningRail(ctx, layout) {
        const { boardTop, boardBottom, boardHeight, stringYs, railWidth } = layout;
        const now = _nowMs();

        ctx.save();

        // Solid obsidian backing behind left tuning rail
        const railGrad = ctx.createLinearGradient(0, 0, railWidth, 0);
        railGrad.addColorStop(0, "#0C0E15");
        railGrad.addColorStop(0.85, "#111520");
        railGrad.addColorStop(1, "#151A27");
        ctx.fillStyle = railGrad;
        ctx.fillRect(0, boardTop - 4, railWidth, boardHeight + 8);

        // Soft dissolve fade to the right of the nut so passed pills vanish gracefully
        const fadeGrad = ctx.createLinearGradient(railWidth, 0, railWidth + 24, 0);
        fadeGrad.addColorStop(0, "rgba(17, 21, 32, 0.92)");
        fadeGrad.addColorStop(1, "rgba(17, 21, 32, 0)");
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(railWidth, boardTop + 1, 24, boardHeight - 2);

        // Refined warm acoustic-ivory nut bar
        const nutGrad = ctx.createLinearGradient(railWidth - 3, boardTop, railWidth, boardBottom);
        nutGrad.addColorStop(0, "rgba(226, 201, 138, 0.42)");
        nutGrad.addColorStop(0.5, "rgba(214, 204, 184, 0.56)");
        nutGrad.addColorStop(1, "rgba(226, 201, 138, 0.34)");
        ctx.fillStyle = nutGrad;
        ctx.fillRect(railWidth - 2.5, boardTop, 2.5, boardHeight);

        // 4 Minimal Tuning Badges (A, E, C, G) with open-string indicators
        const badgeW = Math.min(44, railWidth - 16);
        const badgeH = 22;
        const badgeX = (railWidth - 3 - badgeW) / 2;

        for (let s = 0; s < 4; s++) {
            const spec = this.tuning[s] || UKULELE_STRINGS[s];
            const sy = stringYs[s];
            const by = sy - badgeH / 2;
            const glowFrac = Math.max(0, (this._stringGlowUntil[s] - now) / 260);
            const tunerActive = Boolean(
                this.tunerState &&
                this.tunerState.active &&
                this.tunerState.stringIdx === s &&
                (now - this.tunerState.updatedAt) < 1200
            );
            const tunerInTune = tunerActive && Math.abs(this.tunerState.cents) <= 12;

            ctx.fillStyle = tunerInTune
                ? "rgba(110, 231, 183, 0.14)"
                : (glowFrac > 0.05 ? "rgba(110, 231, 183, 0.10)" : "rgba(255, 255, 255, 0.04)");
            ctx.beginPath();
            this.drawPill(ctx, badgeX, by, badgeW, badgeH, 7);
            ctx.fill();

            ctx.strokeStyle = tunerInTune
                ? "rgba(110, 231, 183, 0.46)"
                : (tunerActive
                    ? "rgba(226, 201, 138, 0.38)"
                    : "rgba(226, 201, 138, 0.14)");
            ctx.lineWidth = 1.0;
            ctx.stroke();

            // Open-string indicator dot on left edge of badge
            ctx.beginPath();
            ctx.arc(badgeX + 8.5, sy, 2.3, 0, Math.PI * 2);
            ctx.fillStyle = tunerInTune
                ? "#6EE7B7"
                : (tunerActive ? "#E2C98A" : (glowFrac > 0.05 ? "#6EE7B7" : "rgba(148, 163, 184, 0.45)"));
            ctx.fill();

            // String name (A, E, C, G) + tiny octave superscript
            ctx.fillStyle = tunerActive || glowFrac > 0.05 ? "#F8FAFC" : "#E2E8F0";
            ctx.font = "600 11.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(spec.name, badgeX + 15.5, sy + 0.3);

            ctx.fillStyle = "rgba(148, 163, 184, 0.68)";
            ctx.font = "500 8.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.fillText(String(spec.octave), badgeX + 25.5, sy + 2.2);
        }

        ctx.restore();
    }

    /* ======================================================================
       Playhead Vertical Beam & Bouncing 3D Acoustic-Ivory Sphere
       ====================================================================== */

    _drawPlayheadAndBall(ctx, layout, activeEvents, currentTime, startTime) {
        const { playheadX, boardTop, boardBottom } = layout;
        const anyLaneActive = this.activeHands.left || this.activeHands.right;

        ctx.save();

        // 1. Whisper-soft pearl playhead veil
        const glowW = 24;
        const veilGrad = ctx.createLinearGradient(playheadX - glowW, 0, playheadX + glowW, 0);
        veilGrad.addColorStop(0, "rgba(238, 242, 246, 0)");
        veilGrad.addColorStop(0.5, anyLaneActive ? "rgba(238, 242, 246, 0.052)" : "rgba(148, 163, 184, 0.025)");
        veilGrad.addColorStop(1, "rgba(238, 242, 246, 0)");
        ctx.fillStyle = veilGrad;
        ctx.fillRect(playheadX - glowW, boardTop - 8, glowW * 2, (boardBottom - boardTop) + 16);

        // 2. Slender Alabaster Vertical Playhead Line
        const beamGrad = ctx.createLinearGradient(0, boardTop - 8, 0, boardBottom + 8);
        beamGrad.addColorStop(0, "rgba(241, 245, 249, 0.10)");
        beamGrad.addColorStop(0.18, anyLaneActive ? "rgba(241, 245, 249, 0.56)" : "rgba(148, 163, 184, 0.22)");
        beamGrad.addColorStop(0.82, anyLaneActive ? "rgba(241, 245, 249, 0.56)" : "rgba(148, 163, 184, 0.22)");
        beamGrad.addColorStop(1, "rgba(241, 245, 249, 0.10)");
        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, boardTop - 8);
        ctx.lineTo(playheadX, boardBottom + 8);
        ctx.stroke();

        // Subtle champagne diamond markers at fretboard top & bottom edges
        ctx.fillStyle = anyLaneActive ? "rgba(226, 201, 138, 0.65)" : "rgba(148, 163, 184, 0.30)";
        for (const cy of [boardTop, boardBottom]) {
            ctx.beginPath();
            ctx.moveTo(playheadX, cy - 3.5);
            ctx.lineTo(playheadX + 3.2, cy);
            ctx.lineTo(playheadX, cy + 3.5);
            ctx.lineTo(playheadX - 3.2, cy);
            ctx.closePath();
            ctx.fill();
        }

        // 3. Bouncing 3D Luminous Acoustic-Ivory Sphere
        if (anyLaneActive) {
            const ball = this.computeBallPosition(activeEvents, currentTime, {
                ...layout,
                startTime
            });
            this.draw3DSphere(ctx, ball.x, ball.y, ball.radius, ball.contactProximity);
        }

        ctx.restore();
    }

    draw3DSphere(ctx, x, y, radius, contactProximity = 0) {
        ctx.save();

        // Delicate pearl-sage aura right as the sphere kisses a fret pill
        if (contactProximity > 0.01) {
            const haloR = radius + 2.5 + contactProximity * 4.0;
            const haloGrad = ctx.createRadialGradient(x, y, radius * 0.4, x, y, haloR);
            haloGrad.addColorStop(0, `rgba(186, 230, 211, ${(0.30 * contactProximity).toFixed(3)})`);
            haloGrad.addColorStop(1, "rgba(186, 230, 211, 0)");
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(x, y, haloR, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowColor = "rgba(5, 10, 18, 0.52)";
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;

        // 3D Shaded Acoustic-Ivory Orb
        const sphereGrad = ctx.createRadialGradient(
            x - radius * 0.32, y - radius * 0.32, radius * 0.08,
            x, y, radius
        );
        sphereGrad.addColorStop(0, "#FFFFFF");
        sphereGrad.addColorStop(0.52, "#F3F1EA");
        sphereGrad.addColorStop(0.88, "#D4D2C9");
        sphereGrad.addColorStop(1, "#9BA3B0");

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = sphereGrad;
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = contactProximity > 0.25
            ? `rgba(209, 250, 229, ${(0.65 + 0.28 * contactProximity).toFixed(3)})`
            : "rgba(255, 255, 255, 0.80)";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.restore();
    }

    _drawDisabledLaneBadges(ctx, layout) {
        const { w, boardTop } = layout;
        const badges = [];
        if (!this.activeHands.right) {
            badges.push({ hand: "right", label: "Melody Muted · Press R to enable" });
        }
        if (!this.activeHands.left) {
            badges.push({ hand: "left", label: "Chords Muted · Press L to enable" });
        }
        if (badges.length === 0) return;

        ctx.save();
        let cursorRight = w - 16;
        const badgeH = 22;
        const badgeY = Math.max(layout.topBarHeight + 8, boardTop - 30);

        for (let i = badges.length - 1; i >= 0; i--) {
            const b = badges[i];
            ctx.font = "500 10.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            const textW = ctx.measureText ? ctx.measureText(b.label).width : b.label.length * 6.2;
            const badgeW = Math.max(180, textW + 22);
            const badgeX = Math.max(12, cursorRight - badgeW);
            cursorRight = badgeX - 8;

            ctx.fillStyle = "rgba(15, 20, 29, 0.84)";
            ctx.beginPath();
            this.drawPill(ctx, badgeX, badgeY, badgeW, badgeH, 11);
            ctx.fill();

            ctx.strokeStyle = "rgba(148, 163, 184, 0.24)";
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = "rgba(203, 213, 225, 0.82)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(b.label, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.3);

            this._disabledBadgeRects.push({
                hand: b.hand,
                x: badgeX,
                y: badgeY,
                w: badgeW,
                h: badgeH
            });
        }
        ctx.restore();
    }

    /* ======================================================================
       Top Conservatory HUD Bar (Multiplier, Lane Pill, Wait/Count-In, Mini Tuner, Score)
       ====================================================================== */

    _drawTopBar(ctx, layout, state) {
        const { w, topBarHeight: h } = layout;
        const {
            score,
            streak,
            multiplier,
            isWaiting,
            waitTargetNote,
            waitTargetChord,
            currentTime,
            startTime,
            firstNoteTime,
            secondsPerBeat,
            isPlaying
        } = state;

        ctx.save();

        // Translucent conservatory HUD bar
        ctx.fillStyle = "rgba(10, 13, 20, 0.82)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
        ctx.fillRect(0, h - 1, w, 1);

        // 1. Minimal Multiplier Capsule on Left (e.g. "2×" + 4 sage streak dots)
        const badgeX = 18;
        const badgeY = (h - 26) / 2;
        const badgeW = 68;
        const badgeH = 26;

        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        this.drawPill(ctx, badgeX, badgeY, badgeW, badgeH, 13);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 12.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${multiplier}×`, badgeX + 10, badgeY + badgeH / 2 + 0.5);

        const maxDots = 4;
        const filledDots = streak > 0 ? ((streak - 1) % maxDots) + 1 : 0;
        for (let i = 0; i < maxDots; i++) {
            ctx.beginPath();
            ctx.arc(badgeX + 36 + i * 6.5, badgeY + badgeH / 2, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = i < filledDots ? "#6EE7B7" : "rgba(255, 255, 255, 0.16)";
            ctx.fill();
        }

        // Active Track Indicator Pill when Melody or Chords is toggled OFF
        if (!this.activeHands.left || !this.activeHands.right) {
            const laneText = this.activeHands.right && !this.activeHands.left
                ? "Melody Only"
                : (this.activeHands.left && !this.activeHands.right ? "Chords Only" : "Tracks Muted");
            const laneAccent = this.activeHands.right && !this.activeHands.left
                ? "rgba(110, 231, 183, 0.88)"
                : (this.activeHands.left && !this.activeHands.right ? "rgba(226, 201, 138, 0.88)" : "rgba(148, 163, 184, 0.78)");
            const laneBorder = this.activeHands.right && !this.activeHands.left
                ? "rgba(110, 231, 183, 0.28)"
                : (this.activeHands.left && !this.activeHands.right ? "rgba(226, 201, 138, 0.28)" : "rgba(148, 163, 184, 0.22)");

            const pillX = badgeX + badgeW + 10;
            const pillY = (h - 24) / 2;
            const pillW = 104;
            const pillH = 24;

            ctx.fillStyle = "rgba(15, 21, 32, 0.62)";
            ctx.beginPath();
            this.drawPill(ctx, pillX, pillY, pillW, pillH, 12);
            ctx.fill();
            ctx.strokeStyle = laneBorder;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = laneAccent;
            ctx.font = "500 11px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(laneText, pillX + pillW / 2, pillY + pillH / 2 + 0.3);
        }

        // 2. Center: Wait Mode Target Pill OR Lead-In Count-In Pill
        if (isWaiting && waitTargetNote) {
            const activeChord = Array.isArray(waitTargetChord) && waitTargetChord.length > 0
                ? waitTargetChord
                : [waitTargetNote];
            const chordName = activeChord.find((n) => n && n.chordSymbol)?.chordSymbol || null;

            const segments = [];
            if (chordName && activeChord.length >= 2) {
                segments.push({ label: `${chordName} chord`, color: "#E9D5A1" });
            } else {
                const seen = new Set();
                for (let i = 0; i < activeChord.length; i++) {
                    const n = activeChord[i];
                    if (!n) continue;
                    const tab = this.resolveNoteTabPosition(n);
                    const key = `${tab.string}:${tab.fret}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const sName = (this.tuning[tab.string] || UKULELE_STRINGS[0]).name;
                    segments.push({
                        label: `${sName}·${tab.fret}`,
                        color: tab.style.light
                    });
                }
            }

            const plain = segments.map((s) => s.label).join(" + ");
            const bannerW = Math.max(158, 98 + plain.length * 7.6);
            const bannerH = 26;
            const bannerX = (w - bannerW) / 2;
            const bannerY = (h - bannerH) / 2;

            ctx.fillStyle = "rgba(15, 20, 30, 0.86)";
            ctx.beginPath();
            this.drawPill(ctx, bannerX, bannerY, bannerW, bannerH, 13);
            ctx.fill();
            ctx.strokeStyle = "rgba(226, 201, 138, 0.24)";
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = "#94A3B8";
            ctx.font = "500 11.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("Wait · Play", bannerX + 14, bannerY + bannerH / 2 + 0.3);

            let cursorX = bannerX + 82;
            ctx.font = "600 12px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            for (let i = 0; i < segments.length; i++) {
                if (i > 0) {
                    ctx.fillStyle = "#64748B";
                    ctx.fillText(" + ", cursorX, bannerY + bannerH / 2 + 0.3);
                    cursorX += ctx.measureText ? ctx.measureText(" + ").width : 16;
                }
                ctx.fillStyle = segments[i].color;
                ctx.fillText(segments[i].label, cursorX, bannerY + bannerH / 2 + 0.3);
                cursorX += ctx.measureText ? ctx.measureText(segments[i].label).width : segments[i].label.length * 7.2;
            }
        } else if (secondsPerBeat > 0 && currentTime < firstNoteTime - 0.02) {
            const totalLeadInSec = Math.max(0, firstNoteTime - startTime);
            const totalBeats = Math.max(1, Math.round(totalLeadInSec / secondsPerBeat));
            const beatsRemaining = _clamp(
                Math.ceil((firstNoteTime - currentTime) / secondsPerBeat),
                1,
                totalBeats
            );
            const borderTint = isPlaying
                ? (beatsRemaining === 1 ? "rgba(226, 201, 138, 0.36)" : "rgba(110, 231, 183, 0.28)")
                : "rgba(255, 255, 255, 0.12)";
            const textTint = isPlaying
                ? (beatsRemaining === 1 ? "#E9D5A1" : "#A7F3D0")
                : "#CBD5E1";

            const bannerW = isPlaying ? 150 : 188;
            const bannerH = 26;
            const bannerX = (w - bannerW) / 2;
            const bannerY = (h - bannerH) / 2;

            ctx.fillStyle = "rgba(15, 20, 30, 0.80)";
            ctx.beginPath();
            this.drawPill(ctx, bannerX, bannerY, bannerW, bannerH, 13);
            ctx.fill();
            ctx.strokeStyle = borderTint;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = textTint;
            ctx.font = "500 11.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.fillText(
                isPlaying ? `Count-in · ${beatsRemaining}` : `Ready · ${totalBeats}-beat lead-in`,
                bannerX + bannerW / 2,
                bannerY + bannerH / 2 + 0.3
            );
        }

        // 3. Optional Ultra-Clean Mini Live Pitch / Tuning Indicator (when Mic is active)
        if (this.tunerState && this.tunerState.active && w >= 600) {
            this._drawMiniTunerCapsule(ctx, w - 102, h);
        }

        // 4. Poised Tabular Ivory Score & Streak on Far Right
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 15.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        const formattedScore = (score || 0).toLocaleString("en-US");
        ctx.fillText(formattedScore, w - 20, 18);

        ctx.fillStyle = "rgba(148, 163, 184, 0.74)";
        ctx.font = "500 10.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.fillText(`Streak ${streak || 0}`, w - 20, 32);

        ctx.restore();
    }

    _drawMiniTunerCapsule(ctx, rightEdgeX, barH) {
        const t = this.tunerState;
        const capW = 122;
        const capH = 24;
        const capX = rightEdgeX - capW;
        const capY = (barH - capH) / 2;

        const hasPitch = t.midi !== null;
        const cents = _clamp(t.cents || 0, -50, 50);
        const inTune = hasPitch && Math.abs(cents) <= 12;

        ctx.save();
        ctx.fillStyle = "rgba(15, 21, 31, 0.78)";
        ctx.beginPath();
        this.drawPill(ctx, capX, capY, capW, capH, 12);
        ctx.fill();
        ctx.strokeStyle = inTune
            ? "rgba(110, 231, 183, 0.34)"
            : "rgba(255, 255, 255, 0.10)";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Live mic pulse dot
        ctx.beginPath();
        ctx.arc(capX + 10, capY + capH / 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = inTune ? "#6EE7B7" : (hasPitch ? "#E2C98A" : "#64748B");
        ctx.fill();

        // Detected note label (e.g. A4 or C4)
        ctx.fillStyle = hasPitch ? "#EEF2F6" : "#64748B";
        ctx.font = "600 10.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(hasPitch ? t.noteName : "--", capX + 18, capY + capH / 2 + 0.3);

        // Mini cent-deviation track (-50¢ .. 0 .. +50¢)
        const trackX = capX + 52;
        const trackW = 58;
        const trackY = capY + capH / 2;

        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(trackX, trackY);
        ctx.lineTo(trackX + trackW, trackY);
        ctx.stroke();

        // Center 0¢ reference tick
        const centerTickX = trackX + trackW / 2;
        ctx.strokeStyle = "rgba(226, 232, 240, 0.45)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(centerTickX, trackY - 4);
        ctx.lineTo(centerTickX, trackY + 4);
        ctx.stroke();

        if (hasPitch) {
            const pipX = centerTickX + (cents / 50) * (trackW * 0.46);
            ctx.beginPath();
            ctx.arc(pipX, trackY, 3.0, 0, Math.PI * 2);
            ctx.fillStyle = inTune ? "#6EE7B7" : "#E2C98A";
            ctx.fill();
        }

        ctx.restore();
    }

    /* ======================================================================
       Non-Punitive Feedback Layer (Ripples, Whisper Labels & Off-Target Rings)
       ====================================================================== */

    _renderEffects(ctx, layout) {
        const now = _nowMs();
        const { playheadX, stringYs, pillRadius } = layout;

        // 1. Off-Target Pluck Hollow Ghost Rings (380ms, calm slate #94A3B8, zero red!)
        for (let i = this.ghostMarks.length - 1; i >= 0; i--) {
            const gm = this.ghostMarks[i];
            const elapsed = now - gm.createdAt;
            const dur = gm.duration || 380;
            if (elapsed > dur) {
                this.ghostMarks.splice(i, 1);
                continue;
            }
            const t = elapsed / dur;
            const alpha = 0.48 * (1 - t) * (1 - t);
            const gy = stringYs[_clamp(gm.stringIdx || 0, 0, 3)];
            const ringR = pillRadius * (0.85 + 0.18 * t);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#94A3B8";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(playheadX, gy, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 2. Concentric Calm Water Ripples on Hit (#6EE7B7 Perfect / #E2C98A Good)
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const rp = this.ripples[i];
            const elapsed = now - rp.createdAt;
            const dur = rp.duration || 460;
            if (elapsed > dur) {
                this.ripples.splice(i, 1);
                continue;
            }
            const t = elapsed / dur;
            const easeOut = 1 - Math.pow(1 - t, 2.3);
            const r1 = pillRadius + 3 + easeOut * 18;
            const r2 = pillRadius + easeOut * 10;
            const alpha = 0.44 * (1 - t);

            ctx.save();
            ctx.strokeStyle = rp.color;

            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, r1, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.55;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, r2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Delicate Ascending Dust Motes (max 3 per hit)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 4. Deduplicated Whisper Micro-Typography Labels (10.5px, never Wrong/Missed)
        for (let i = this.hitTexts.length - 1; i >= 0; i--) {
            const hit = this.hitTexts[i];
            const elapsed = now - hit.createdAt;
            const dur = hit.duration || 540;
            if (elapsed > dur) {
                this.hitTexts.splice(i, 1);
                continue;
            }
            const t = elapsed / dur;
            const fadeIn = Math.min(1, t / 0.18);
            const fadeOut = 1 - Math.pow(t, 1.6);
            const alpha = 0.78 * fadeIn * fadeOut;
            const liftY = hit.y - t * 6;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = hit.color;
            ctx.font = "600 10.5px Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(hit.text).toUpperCase(), hit.x, liftY);
            ctx.restore();
        }
    }

    drawPill(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        if (ctx.roundRect) {
            ctx.roundRect(x, y, width, height, r);
        } else {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + width - r, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
            ctx.lineTo(x + width, y + height - r);
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        }
    }
}
