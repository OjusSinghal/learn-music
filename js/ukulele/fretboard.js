/**
 * Interactive 4-String × 12-Fret Horizontal Ukulele Neck Component
 * Designed in the Studio Obsidian & Warm Satin Ivory/Rosewood conservatory aesthetic
 * to dock seamlessly in Studio's `.keyboard-section` (height: 142px) when Ukulele mode is active.
 *
 * Standard Re-Entrant High-G Tuning (tab order top-to-bottom):
 *   string 0 = A4 (MIDI 69)
 *   string 1 = E4 (MIDI 64)
 *   string 2 = C4 (MIDI 60)
 *   string 3 = G4 (MIDI 67)
 *
 * Fully compatible with BOTH Ukulele-native APIs (`render`, `setActiveNote`, `setTargetNotes`,
 * `highlightExpected`, `flashHit`, `flashWrong`, `clearTargetHighlights`, `clearAll`, `destroy`)
 * AND `PianoKeyboard` / `GameEngine` hooks (`activeKeys`, `pressKey`, `releaseKey`,
 * `getFingerStyleForMidi`). Zero harsh red hexes anywhere.
 */

export const UKULELE_STRINGS = [
    { index: 0, name: "A", octave: 4, fullName: "A4", openMidi: 69 },
    { index: 1, name: "E", octave: 4, fullName: "E4", openMidi: 64 },
    { index: 2, name: "C", octave: 4, fullName: "C4", openMidi: 60 },
    { index: 3, name: "G", octave: 4, fullName: "G4", openMidi: 67 }
];

export const UKULELE_FINGER_PALETTE = {
    0: { finger: 0, label: "O", name: "Open",   primary: "#48A870", light: "#74C695", dark: "#2F8554" },
    1: { finger: 1, label: "1", name: "Index",  primary: "#F0C830", light: "#F8E080", dark: "#C89D14" },
    2: { finger: 2, label: "2", name: "Middle", primary: "#6848F8", light: "#B0A0F8", dark: "#4C2FD9" },
    3: { finger: 3, label: "3", name: "Ring",   primary: "#4090F8", light: "#98D8F8", dark: "#256EE0" },
    4: { finger: 4, label: "4", name: "Pinky",  primary: "#E86078", light: "#F0A8B8", dark: "#C93B56" }
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 10]);
const DOUBLE_INLAY_FRETS = new Set([12]);

const FALLBACK_STYLE_ID = "uku-fretboard-default-styles";
const FALLBACK_CSS = `
.uku-fretboard {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #10141E 0%, #0A0D14 100%);
    color: #EEF2F6;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    user-select: none;
    -webkit-user-select: none;
    overflow: hidden;
}
.uku-fretboard-header {
    height: 22px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: rgba(12, 15, 22, 0.92);
    border-bottom: 1px solid rgba(226, 201, 138, 0.14);
}
.uku-header-left {
    width: 78px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border-right: 3px solid rgba(214, 204, 184, 0.35);
    height: 100%;
}
.uku-chord-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    max-width: 66px;
    height: 16px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: #94A3B8;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.uku-chord-badge.has-chord {
    color: #F2E2B8;
    background: rgba(226, 201, 138, 0.14);
    border-color: rgba(226, 201, 138, 0.38);
}
.uku-fret-numbers {
    flex: 1;
    display: flex;
    align-items: center;
    height: 100%;
}
.uku-fret-num {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9.5px;
    font-weight: 500;
    color: #64748B;
    font-variant-numeric: tabular-nums;
}
.uku-fret-num.is-marker-fret {
    color: rgba(226, 201, 138, 0.78);
    font-weight: 600;
}
.uku-board-body {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
}
.uku-nut-column {
    width: 78px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: linear-gradient(90deg, #0D1018 0%, #141926 100%);
    border-right: 3px solid #C9BCA1;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.42);
    z-index: 3;
}
.uku-open-cell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 9px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    cursor: pointer;
    position: relative;
    transition: background 0.12s ease;
}
.uku-open-cell:last-child {
    border-bottom: none;
}
.uku-open-cell:hover {
    background: rgba(255, 255, 255, 0.045);
}
.uku-open-info {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.uku-tuner-dot {
    width: 5.5px;
    height: 5.5px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.35);
    transition: background 0.16s ease, box-shadow 0.16s ease;
}
.uku-tuner-dot.in-tune {
    background: #6EE7B7;
    box-shadow: 0 0 6px rgba(110, 231, 183, 0.65);
}
.uku-tuner-dot.off-tune {
    background: #E2C98A;
    box-shadow: 0 0 5px rgba(226, 201, 138, 0.45);
}
.uku-open-label {
    font-size: 11px;
    font-weight: 600;
    color: #CBD5E1;
    letter-spacing: 0.01em;
}
.uku-neck {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #19161D 0%, #141219 52%, #110F16 100%);
    overflow: hidden;
}
.uku-inlay-layer {
    position: absolute;
    inset: 0;
    display: flex;
    pointer-events: none;
    z-index: 1;
}
.uku-fret-slot {
    height: 100%;
    position: relative;
    border-right: 1.5px solid rgba(216, 210, 198, 0.22);
    box-shadow: inset -1px 0 0 rgba(5, 8, 14, 0.55);
}
.uku-inlay-dot {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(242, 238, 228, 0.42), rgba(186, 178, 164, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.10);
}
.uku-inlay-double {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(242, 238, 228, 0.42), rgba(186, 178, 164, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.10);
}
.uku-inlay-double.dot-top { top: 26%; }
.uku-inlay-double.dot-bot { bottom: 26%; }
.uku-string-row {
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
    z-index: 2;
}
.uku-string-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: linear-gradient(180deg, rgba(235, 230, 218, 0.46) 0%, rgba(192, 186, 174, 0.28) 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    transition: background 0.12s ease, box-shadow 0.12s ease;
}
.uku-string-line.gauge-0 { height: 1.25px; }
.uku-string-line.gauge-1 { height: 1.55px; }
.uku-string-line.gauge-2 { height: 2.15px; }
.uku-string-line.gauge-3 { height: 1.4px; }
.uku-string-row.string-active .uku-string-line {
    background: linear-gradient(180deg, rgba(167, 243, 208, 0.85) 0%, rgba(110, 231, 183, 0.55) 100%);
    box-shadow: 0 0 6px rgba(110, 231, 183, 0.35);
}
.uku-fret-cell {
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 3;
    transition: background 0.1s ease;
}
.uku-fret-cell:hover {
    background: rgba(255, 255, 255, 0.04);
}
.uku-fret-marker {
    width: 21px;
    height: 21px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 700;
    color: #FFFFFF;
    text-shadow: 0 1px 2px rgba(10, 14, 24, 0.65);
    opacity: 0;
    transform: scale(0.76);
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
    border: 1px solid rgba(255, 255, 255, 0.32);
}
.uku-fret-cell:hover .uku-fret-marker:not(.visible) {
    opacity: 0.36;
    transform: scale(0.86);
    background: rgba(148, 163, 184, 0.28);
    border-color: rgba(226, 232, 240, 0.32);
    font-size: 8.5px;
    font-weight: 600;
}
.uku-fret-marker.visible,
.uku-open-cell.is-target .uku-fret-marker,
.uku-open-cell.is-active .uku-fret-marker,
.uku-open-cell.hit-correct .uku-fret-marker,
.uku-open-cell.hit-wrong .uku-fret-marker {
    opacity: 1;
    transform: scale(1);
    background: linear-gradient(
        180deg,
        var(--uku-marker-light, #74C695) 0%,
        var(--uku-marker-color, #48A870) 56%,
        var(--uku-marker-dark, #2F8554) 100%
    );
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.42), inset 0 1px 2px rgba(255, 255, 255, 0.28);
}
.uku-fret-cell.is-target .uku-fret-marker,
.uku-open-cell.is-target .uku-fret-marker {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.24), 0 2px 10px rgba(0, 0, 0, 0.45);
}
.uku-fret-cell.hit-correct .uku-fret-marker,
.uku-open-cell.hit-correct .uku-fret-marker {
    background: linear-gradient(180deg, #84D9AE 0%, #52B788 56%, #358762 100%) !important;
    box-shadow: 0 0 10px rgba(110, 231, 183, 0.38) !important;
}
.uku-fret-cell.hit-good .uku-fret-marker,
.uku-open-cell.hit-good .uku-fret-marker {
    background: linear-gradient(180deg, #F2E2B8 0%, #E2C98A 56%, #B89D58 100%) !important;
    box-shadow: 0 0 10px rgba(226, 201, 138, 0.34) !important;
}
.uku-fret-cell.hit-wrong .uku-fret-marker,
.uku-open-cell.hit-wrong .uku-fret-marker {
    background: linear-gradient(180deg, #A6B0BF 0%, #8B95A5 58%, #647082 100%) !important;
    border-color: rgba(203, 213, 225, 0.38) !important;
    box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.26) !important;
    color: #F1F5F9 !important;
}
`;

function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function _formatNoteName(midi) {
    const rounded = Math.round(Number(midi) || 60);
    const pc = ((rounded % 12) + 12) % 12;
    const oct = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[pc]}${oct}`;
}

function _computeFretWidths(numFrets) {
    const weights = [];
    let total = 0;
    for (let i = 0; i < numFrets; i++) {
        // Blend 55% acoustic 12-TET spacing with 45% linear spacing for realistic yet easy-to-click upper frets
        const w = 0.55 * Math.pow(2, -i / 12) + 0.45 * 0.72;
        weights.push(w);
        total += w;
    }
    return weights.map((w) => (w / total) * 100);
}

function _resolveFingerStyle(finger, fret, customColor = null) {
    if (fret === 0) {
        return UKULELE_FINGER_PALETTE[0];
    }
    let idx = Number.isInteger(finger) && finger >= 1 && finger <= 4
        ? finger
        : (finger === 5 ? 4 : _clamp(((Math.round(fret || 1) - 1) % 4) + 1, 1, 4));
    const base = UKULELE_FINGER_PALETTE[idx] || UKULELE_FINGER_PALETTE[1];
    if (typeof customColor === "string" && customColor.startsWith("#")) {
        const up = customColor.toUpperCase();
        for (let f = 0; f <= 4; f++) {
            if (UKULELE_FINGER_PALETTE[f].primary.toUpperCase() === up) {
                return UKULELE_FINGER_PALETTE[f];
            }
        }
        return { ...base, primary: customColor };
    }
    return base;
}

export class UkuleleFretboard {
    constructor(containerElement, options = {}) {
        this.container = containerElement || null;
        this.numFrets = Number.isInteger(options.numFrets) && options.numFrets >= 4 ? options.numFrets : 12;
        this.tuning = Array.isArray(options.tuning) && options.tuning.length === 4
            ? options.tuning
            : UKULELE_STRINGS;

        // Support both Ukulele-native and PianoKeyboard callback option names
        this.onNotePlay = options.onNotePlay || options.onKeyPress || null;
        this.onNoteRelease = options.onNoteRelease || options.onKeyRelease || null;
        this.onKeyPress = options.onKeyPress || null;
        this.onKeyRelease = options.onKeyRelease || null;
        this.getFingerStyleForMidi = options.getFingerStyleForMidi || null;
        this.getTabPositionForMidi = options.getTabPositionForMidi || null;

        this.fingerPalette = UKULELE_FINGER_PALETTE;
        this.fretWidths = _computeFretWidths(this.numFrets);

        // State maps
        this.activeKeys = new Map();       // midi -> { color, status, meta, string, fret } (GameEngine compatibility)
        this.activeCells = new Map();      // "s:f" -> { midi, status, style, fingerLabel }
        this.targetCells = new Map();      // "s:f" -> { midi, string, fret, finger, style, chordSymbol }
        this.cellElements = new Map();     // "s:f" -> DOM element
        this.markerElements = new Map();   // "s:f" -> DOM marker span
        this.stringRowElements = [];       // [0..3] DOM row
        this.tunerDotElements = [];        // [0..3] DOM tuner dot
        this.chordBadgeEl = null;

        this._pointerPressedCells = new Set();
        this._flashTimers = new Map();     // "s:f" -> timeoutId
        this._boundWindowPointerUp = () => this._releaseAllPointerPresses();
        this._isDestroyed = false;

        this._ensureDefaultStyles();
        if (this.container && options.autoRender !== false) {
            this.render();
        }
    }

    _ensureDefaultStyles() {
        if (typeof document === "undefined" || !document.head || typeof document.createElement !== "function") {
            return;
        }
        if (typeof document.getElementById === "function" && document.getElementById(FALLBACK_STYLE_ID)) {
            return;
        }
        const styleEl = document.createElement("style");
        styleEl.id = FALLBACK_STYLE_ID;
        styleEl.textContent = FALLBACK_CSS;
        if (typeof document.head.appendChild === "function") {
            document.head.appendChild(styleEl);
        }
    }

    _cellKey(stringIdx, fret) {
        return `${stringIdx}:${fret}`;
    }

    /**
     * PianoKeyboard-compatible note metadata helper (used by SoundCollectionTrainer & UI helpers).
     */
    getNoteInfo(midi) {
        const rounded = Math.round(Number(midi) || 60);
        const pc = ((rounded % 12) + 12) % 12;
        const name = NOTE_NAMES[pc];
        const octave = Math.floor(rounded / 12) - 1;
        const isBlack = [1, 3, 6, 8, 10].includes(pc);
        const pos = this.resolveTabPosition(rounded, null);
        const fingerStyle = _resolveFingerStyle(null, pos.fret);
        const stringSpec = this.tuning[pos.string] || UKULELE_STRINGS[0];
        return {
            name,
            octave,
            fullName: `${name}${octave}`,
            isBlack,
            color: { bg: fingerStyle.primary, light: fingerStyle.light, dark: fingerStyle.dark, text: "#FFFFFF" },
            fingerStyle,
            string: pos.string,
            fret: pos.fret,
            stringName: stringSpec.fullName
        };
    }

    /**
     * Resolves all target cells matching `midi` (supports unison-string chords such as F [2,0,1,0] with dual A4).
     */
    _resolveTargetCellsForMidi(midi) {
        const targetMidi = Math.round(Number(midi));
        const matches = [];
        for (const t of this.targetCells.values()) {
            if (t.midi === targetMidi) {
                matches.push({ string: t.string, fret: t.fret });
            }
        }
        return matches;
    }

    /**
     * Maps any MIDI pitch onto the best playable (string, fret) on this ukulele neck.
     */
    resolveTabPosition(midi, meta = null) {
        if (
            meta &&
            Number.isInteger(meta.string) && meta.string >= 0 && meta.string <= 3 &&
            Number.isInteger(meta.fret) && meta.fret >= 0 && meta.fret <= this.numFrets
        ) {
            return { string: meta.string, fret: meta.fret };
        }

        const targetMidi = Math.round(Number(midi));

        // 1. Prefer an active target cell matching this exact MIDI pitch
        for (const t of this.targetCells.values()) {
            if (t.midi === targetMidi) {
                return { string: t.string, fret: t.fret };
            }
        }

        // 2. Ask optional external resolver hook
        if (typeof this.getTabPositionForMidi === "function") {
            const custom = this.getTabPositionForMidi(targetMidi);
            if (
                custom &&
                Number.isInteger(custom.string) && custom.string >= 0 && custom.string <= 3 &&
                Number.isInteger(custom.fret) && custom.fret >= 0 && custom.fret <= this.numFrets
            ) {
                return { string: custom.string, fret: custom.fret };
            }
        }

        // 3. Lowest-fret standard ukulele mapping (octave-folding out-of-range pitches cleanly)
        let minOpen = Infinity;
        let maxOpen = -Infinity;
        for (let i = 0; i < this.tuning.length; i++) {
            if (this.tuning[i].openMidi < minOpen) minOpen = this.tuning[i].openMidi;
            if (this.tuning[i].openMidi > maxOpen) maxOpen = this.tuning[i].openMidi;
        }
        let p = Number.isFinite(targetMidi) ? targetMidi : 60;
        const maxPlayable = maxOpen + this.numFrets;
        while (p < minOpen) p += 12;
        while (p > maxPlayable) p -= 12;

        const tieOrder = [2, 1, 0, 3];
        let best = null;
        for (let i = 0; i < tieOrder.length; i++) {
            const sIdx = tieOrder[i];
            const fret = p - this.tuning[sIdx].openMidi;
            if (fret >= 0 && fret <= this.numFrets) {
                if (!best || fret < best.fret) {
                    best = { string: sIdx, fret };
                }
            }
        }
        return best || { string: 0, fret: 0 };
    }

    render() {
        if (!this.container || typeof document === "undefined" || typeof document.createElement !== "function") {
            return;
        }

        this.clearAll();
        this.cellElements.clear();
        this.markerElements.clear();
        this.stringRowElements = [];
        this.tunerDotElements = [];

        this.container.innerHTML = "";
        this.container.className = "uku-fretboard";

        // 1. Top Header Strip: Chord Badge (Left) + Proportional Fret Numbers 1..12 (Right)
        const headerEl = document.createElement("div");
        headerEl.className = "uku-fretboard-header";

        const headerLeft = document.createElement("div");
        headerLeft.className = "uku-header-left";
        const chordBadge = document.createElement("span");
        chordBadge.className = "uku-chord-badge";
        chordBadge.textContent = "G·C·E·A";
        chordBadge.title = "Active Target Chord / Standard High-G Tuning";
        headerLeft.appendChild(chordBadge);
        this.chordBadgeEl = chordBadge;
        headerEl.appendChild(headerLeft);

        const fretNumbersEl = document.createElement("div");
        fretNumbersEl.className = "uku-fret-numbers";
        for (let f = 1; f <= this.numFrets; f++) {
            const numEl = document.createElement("span");
            const isMarker = SINGLE_INLAY_FRETS.has(f) || DOUBLE_INLAY_FRETS.has(f);
            numEl.className = `uku-fret-num${isMarker ? " is-marker-fret" : ""}`;
            numEl.style.width = `${this.fretWidths[f - 1].toFixed(4)}%`;
            numEl.textContent = String(f);
            fretNumbersEl.appendChild(numEl);
        }
        headerEl.appendChild(fretNumbersEl);
        this.container.appendChild(headerEl);

        // 2. Main Interactive Neck Body: Nut Open-String Column + 12-Fret Rosewood Neck
        const bodyEl = document.createElement("div");
        bodyEl.className = "uku-board-body";

        // 2a. Left Nut Column (Open Strings 0: A4, E4, C4, G4)
        const nutCol = document.createElement("div");
        nutCol.className = "uku-nut-column";

        for (let s = 0; s < 4; s++) {
            const spec = this.tuning[s] || UKULELE_STRINGS[s];
            const midi = spec.openMidi;
            const noteName = _formatNoteName(midi);
            const openCell = document.createElement("div");
            openCell.className = "uku-open-cell";
            openCell.dataset.string = String(s);
            openCell.dataset.fret = "0";
            openCell.dataset.midi = String(midi);
            openCell.dataset.note = noteName;
            openCell.title = `Open String ${spec.fullName} · Fret 0 · MIDI ${midi}`;

            const infoWrap = document.createElement("span");
            infoWrap.className = "uku-open-info";

            const tunerDot = document.createElement("span");
            tunerDot.className = "uku-tuner-dot";
            this.tunerDotElements[s] = tunerDot;

            const labelEl = document.createElement("span");
            labelEl.className = "uku-open-label";
            labelEl.textContent = spec.fullName;

            infoWrap.appendChild(tunerDot);
            infoWrap.appendChild(labelEl);
            openCell.appendChild(infoWrap);

            const marker = document.createElement("span");
            marker.className = "uku-fret-marker";
            marker.textContent = "O";
            openCell.appendChild(marker);

            this._bindCellInteraction(openCell, s, 0, midi, noteName);

            const key = this._cellKey(s, 0);
            this.cellElements.set(key, openCell);
            this.markerElements.set(key, marker);
            nutCol.appendChild(openCell);
        }
        bodyEl.appendChild(nutCol);

        // 2b. 12-Fret Proportional Ukulele Neck
        const neckEl = document.createElement("div");
        neckEl.className = "uku-neck";

        // Background fret wire + pearl position inlay layer
        const inlayLayer = document.createElement("div");
        inlayLayer.className = "uku-inlay-layer";
        for (let f = 1; f <= this.numFrets; f++) {
            const slot = document.createElement("div");
            slot.className = "uku-fret-slot";
            slot.style.width = `${this.fretWidths[f - 1].toFixed(4)}%`;

            if (SINGLE_INLAY_FRETS.has(f)) {
                const dot = document.createElement("span");
                dot.className = "uku-inlay-dot";
                slot.appendChild(dot);
            } else if (DOUBLE_INLAY_FRETS.has(f)) {
                const dotTop = document.createElement("span");
                dotTop.className = "uku-inlay-double dot-top";
                const dotBot = document.createElement("span");
                dotBot.className = "uku-inlay-double dot-bot";
                slot.appendChild(dotTop);
                slot.appendChild(dotBot);
            }
            inlayLayer.appendChild(slot);
        }
        neckEl.appendChild(inlayLayer);

        // 4 Interactive String Rows × 12 Frets
        for (let s = 0; s < 4; s++) {
            const spec = this.tuning[s] || UKULELE_STRINGS[s];
            const rowEl = document.createElement("div");
            rowEl.className = "uku-string-row";
            rowEl.dataset.string = String(s);
            this.stringRowElements[s] = rowEl;

            const stringLine = document.createElement("div");
            stringLine.className = `uku-string-line gauge-${s}`;
            rowEl.appendChild(stringLine);

            for (let f = 1; f <= this.numFrets; f++) {
                const midi = spec.openMidi + f;
                const noteName = _formatNoteName(midi);
                const cell = document.createElement("div");
                cell.className = "uku-fret-cell";
                cell.style.width = `${this.fretWidths[f - 1].toFixed(4)}%`;
                cell.dataset.string = String(s);
                cell.dataset.fret = String(f);
                cell.dataset.midi = String(midi);
                cell.dataset.note = noteName;
                cell.title = `String ${spec.fullName} · Fret ${f} · ${noteName} · MIDI ${midi}`;

                const marker = document.createElement("span");
                marker.className = "uku-fret-marker";
                marker.textContent = noteName;
                cell.appendChild(marker);

                this._bindCellInteraction(cell, s, f, midi, noteName);

                const key = this._cellKey(s, f);
                this.cellElements.set(key, cell);
                this.markerElements.set(key, marker);
                rowEl.appendChild(cell);
            }

            neckEl.appendChild(rowEl);
        }

        bodyEl.appendChild(neckEl);
        this.container.appendChild(bodyEl);

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.removeEventListener("pointerup", this._boundWindowPointerUp);
            window.removeEventListener("mouseup", this._boundWindowPointerUp);
            window.addEventListener("pointerup", this._boundWindowPointerUp);
            window.addEventListener("mouseup", this._boundWindowPointerUp);
        }
    }

    _bindCellInteraction(cellEl, stringIdx, fret, midi, noteName) {
        if (!cellEl || typeof cellEl.addEventListener !== "function") return;

        const handleDown = (e) => {
            if (e && typeof e.preventDefault === "function") e.preventDefault();
            const key = this._cellKey(stringIdx, fret);
            if (this._pointerPressedCells.has(key)) return;
            this._pointerPressedCells.add(key);

            const style = _resolveFingerStyle(null, fret);
            this.setActiveNote(midi, true, {
                string: stringIdx,
                fret,
                finger: style.finger,
                fingerLabel: style.label,
                color: style.primary,
                lightColor: style.light,
                darkColor: style.dark,
                status: "playing"
            });

            const payload = { string: stringIdx, fret, finger: style.finger, noteName };
            if (typeof this.onNotePlay === "function") {
                this.onNotePlay(midi, payload);
            }
            if (typeof this.onKeyPress === "function" && this.onKeyPress !== this.onNotePlay) {
                this.onKeyPress(midi, payload);
            }
        };

        cellEl.addEventListener("pointerdown", handleDown);
        // Fallback for environments dispatching bare mouse events without pointer events
        cellEl.addEventListener("mousedown", (e) => {
            if (typeof PointerEvent !== "undefined") return;
            handleDown(e);
        });
    }

    _releaseAllPointerPresses() {
        if (this._pointerPressedCells.size === 0) return;
        const pressed = Array.from(this._pointerPressedCells);
        this._pointerPressedCells.clear();

        for (let i = 0; i < pressed.length; i++) {
            const key = pressed[i];
            const [sStr, fStr] = key.split(":");
            const stringIdx = Number(sStr);
            const fret = Number(fStr);
            const midi = this.tuning[stringIdx].openMidi + fret;

            this.setActiveNote(midi, false, { string: stringIdx, fret });

            const payload = { string: stringIdx, fret };
            if (typeof this.onNoteRelease === "function") {
                this.onNoteRelease(midi, payload);
            }
            if (typeof this.onKeyRelease === "function" && this.onKeyRelease !== this.onNoteRelease) {
                this.onKeyRelease(midi, payload);
            }
        }
    }

    _applyCellVisual(stringIdx, fret) {
        const key = this._cellKey(stringIdx, fret);
        const cellEl = this.cellElements.get(key);
        const markerEl = this.markerElements.get(key);
        if (!cellEl || !markerEl) return;

        const active = this.activeCells.get(key) || null;
        const target = this.targetCells.get(key) || null;
        const spec = this.tuning[stringIdx] || UKULELE_STRINGS[0];
        const defaultNoteName = _formatNoteName(spec.openMidi + fret);

        cellEl.classList.remove("is-active", "is-target", "hit-correct", "hit-good", "hit-wrong");
        markerEl.classList.remove("visible");

        if (active) {
            const st = active.style || _resolveFingerStyle(active.finger, fret, active.color);
            cellEl.style.setProperty("--uku-marker-color", active.color || st.primary);
            cellEl.style.setProperty("--uku-marker-light", active.lightColor || st.light);
            cellEl.style.setProperty("--uku-marker-dark", active.darkColor || st.dark);

            if (active.status === "preview") {
                cellEl.classList.add("is-target");
            } else {
                cellEl.classList.add("is-active");
            }
            if (active.status === "correct" || active.status === "perfect") {
                cellEl.classList.add("hit-correct");
            } else if (active.status === "good") {
                cellEl.classList.add("hit-good");
            } else if (active.status === "wrong") {
                cellEl.classList.add("hit-wrong");
            }

            markerEl.textContent = active.fingerLabel || (fret === 0 ? "O" : st.label);
            markerEl.classList.add("visible");
        } else if (target) {
            const st = target.style || _resolveFingerStyle(target.finger, fret);
            cellEl.style.setProperty("--uku-marker-color", st.primary);
            cellEl.style.setProperty("--uku-marker-light", st.light);
            cellEl.style.setProperty("--uku-marker-dark", st.dark);
            cellEl.classList.add("is-target");
            markerEl.textContent = fret === 0 ? "O" : st.label;
            markerEl.classList.add("visible");
        } else {
            cellEl.style.removeProperty("--uku-marker-color");
            cellEl.style.removeProperty("--uku-marker-light");
            cellEl.style.removeProperty("--uku-marker-dark");
            markerEl.textContent = fret === 0 ? "O" : defaultNoteName;
        }

        this._refreshStringRowState(stringIdx);
    }

    _refreshStringRowState(stringIdx) {
        const rowEl = this.stringRowElements[stringIdx];
        if (!rowEl || !rowEl.classList) return;
        let hasActive = false;
        for (const key of this.activeCells.keys()) {
            const entry = this.activeCells.get(key);
            if (key.startsWith(`${stringIdx}:`) && entry && entry.status !== "preview") {
                hasActive = true;
                break;
            }
        }
        rowEl.classList.toggle("string-active", hasActive);
    }

    _updateChordBadge(chordSymbol = null) {
        if (!this.chordBadgeEl) return;
        const clean = chordSymbol ? String(chordSymbol).trim() : "";
        if (clean) {
            this.chordBadgeEl.textContent = clean;
            if (this.chordBadgeEl.classList) this.chordBadgeEl.classList.add("has-chord");
        } else {
            this.chordBadgeEl.textContent = "G·C·E·A";
            if (this.chordBadgeEl.classList) this.chordBadgeEl.classList.remove("has-chord");
        }
    }

    /* ======================================================================
       Public Ukulele Fretboard API
       ====================================================================== */

    setActiveNote(midi, isActive = true, meta = null) {
        const pos = this.resolveTabPosition(midi, meta);
        const key = this._cellKey(pos.string, pos.fret);
        const roundedMidi = Math.round(Number(midi));

        if (!isActive) {
            this.activeCells.delete(key);
            const cur = this.activeKeys.get(roundedMidi);
            if (cur && cur.string === pos.string && cur.fret === pos.fret) {
                this.activeKeys.delete(roundedMidi);
            }
            this._applyCellVisual(pos.string, pos.fret);
            return;
        }

        const status = (meta && meta.status) ? meta.status : "playing";
        const finger = (meta && Number.isInteger(meta.finger)) ? meta.finger : null;
        const customColor = (meta && meta.color) ? meta.color : null;
        const style = _resolveFingerStyle(finger, pos.fret, customColor);
        const fingerLabel = (meta && meta.fingerLabel)
            ? meta.fingerLabel
            : (pos.fret === 0 ? "O" : style.label);

        this.activeCells.set(key, {
            midi: roundedMidi,
            status,
            finger: style.finger,
            fingerLabel,
            color: customColor || style.primary,
            lightColor: (meta && meta.lightColor) || style.light,
            darkColor: (meta && meta.darkColor) || style.dark,
            style
        });

        this.activeKeys.set(roundedMidi, {
            color: customColor || style.primary,
            status,
            meta,
            string: pos.string,
            fret: pos.fret
        });

        this._applyCellVisual(pos.string, pos.fret);
    }

    /**
     * PianoKeyboard-compatible press hook (used directly by GameEngine).
     * Respects explicit `meta.string`/`meta.fret`; when omitted on unison chords (e.g. F chord dual A4),
     * lights all matching target cells cleanly.
     */
    pressKey(midi, customColor = null, status = "playing", meta = null) {
        const hasExplicitPos = Boolean(
            meta &&
            Number.isInteger(meta.string) && meta.string >= 0 && meta.string <= 3 &&
            Number.isInteger(meta.fret) && meta.fret >= 0 && meta.fret <= this.numFrets
        );
        const positions = hasExplicitPos
            ? [{ string: meta.string, fret: meta.fret }]
            : (this._resolveTargetCellsForMidi(midi).length > 0
                ? this._resolveTargetCellsForMidi(midi)
                : [this.resolveTabPosition(midi, meta)]);

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const finger = (meta && Number.isInteger(meta.finger))
                ? (pos.fret === 0 ? 0 : _clamp(meta.finger, 1, 4))
                : null;
            const style = _resolveFingerStyle(finger, pos.fret, customColor);

            this.setActiveNote(midi, true, {
                ...(meta || {}),
                string: pos.string,
                fret: pos.fret,
                finger: style.finger,
                fingerLabel: pos.fret === 0 ? "O" : style.label,
                color: customColor || style.primary,
                lightColor: (meta && meta.lightColor) || style.light,
                darkColor: (meta && meta.darkColor) || style.dark,
                status
            });
        }

        if (meta && meta.chordSymbol) {
            this._updateChordBadge(meta.chordSymbol);
        }
    }

    /**
     * PianoKeyboard-compatible release hook (used directly by GameEngine).
     * Releases all active cells bound to `midi` (including unison strings).
     */
    releaseKey(midi) {
        const roundedMidi = Math.round(Number(midi));
        this.activeKeys.delete(roundedMidi);
        for (const [key, state] of Array.from(this.activeCells.entries())) {
            if (state.midi === roundedMidi) {
                const [sStr, fStr] = key.split(":");
                this.activeCells.delete(key);
                this._applyCellVisual(Number(sStr), Number(fStr));
            }
        }
    }

    setTargetNotes(notes = []) {
        this.clearTargetHighlights();
        if (!Array.isArray(notes) || notes.length === 0) {
            return;
        }

        let chordSymbol = null;
        for (let i = 0; i < notes.length; i++) {
            const raw = notes[i];
            if (raw === null || raw === undefined) continue;

            const noteObj = typeof raw === "number" ? { pitch: raw } : raw;
            const pos = this.resolveTabPosition(noteObj.pitch, noteObj);
            const midi = Number.isFinite(noteObj.pitch)
                ? Math.round(noteObj.pitch)
                : (this.tuning[pos.string].openMidi + pos.fret);
            const style = _resolveFingerStyle(noteObj.finger, pos.fret, noteObj.fingerColor || null);
            const key = this._cellKey(pos.string, pos.fret);

            if (!chordSymbol && noteObj.chordSymbol) {
                chordSymbol = noteObj.chordSymbol;
            }

            this.targetCells.set(key, {
                midi,
                string: pos.string,
                fret: pos.fret,
                finger: style.finger,
                style,
                chordSymbol: noteObj.chordSymbol || null
            });

            this._applyCellVisual(pos.string, pos.fret);
        }

        this._updateChordBadge(chordSymbol);
    }

    highlightExpected(notes = []) {
        this.setTargetNotes(notes);
    }

    flashHit(midi, status = "perfect", meta = null) {
        const hasExplicitPos = Boolean(
            meta &&
            Number.isInteger(meta.string) && meta.string >= 0 && meta.string <= 3 &&
            Number.isInteger(meta.fret) && meta.fret >= 0 && meta.fret <= this.numFrets
        );
        const positions = hasExplicitPos
            ? [{ string: meta.string, fret: meta.fret }]
            : (this._resolveTargetCellsForMidi(midi).length > 0
                ? this._resolveTargetCellsForMidi(midi)
                : [this.resolveTabPosition(midi, meta)]);

        const upper = String(status || "perfect").toUpperCase();
        const isPerfect = upper === "PERFECT" || upper === "CORRECT";

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const key = this._cellKey(pos.string, pos.fret);

            this._clearFlashTimer(key);
            this.setActiveNote(midi, true, {
                ...(meta || {}),
                string: pos.string,
                fret: pos.fret,
                status: isPerfect ? "correct" : "good",
                color: isPerfect ? "#52B788" : "#E2C98A",
                lightColor: isPerfect ? "#84D9AE" : "#F2E2B8",
                darkColor: isPerfect ? "#358762" : "#B89D58"
            });

            if (typeof setTimeout === "function") {
                const tid = setTimeout(() => {
                    this._flashTimers.delete(key);
                    if (!this._isDestroyed) {
                        this.setActiveNote(midi, false, { string: pos.string, fret: pos.fret });
                    }
                }, 240);
                this._flashTimers.set(key, tid);
            }
        }
    }

    /**
     * Calm muted-slate off-target highlight (#8B95A5), zero harsh red!
     */
    flashWrong(midi, meta = null) {
        const pos = this.resolveTabPosition(midi, meta);
        const key = this._cellKey(pos.string, pos.fret);

        this._clearFlashTimer(key);
        this.setActiveNote(midi, true, {
            ...(meta || {}),
            string: pos.string,
            fret: pos.fret,
            status: "wrong",
            color: "#8B95A5",
            lightColor: "#A6B0BF",
            darkColor: "#647082"
        });

        if (typeof setTimeout === "function") {
            const tid = setTimeout(() => {
                this._flashTimers.delete(key);
                if (!this._isDestroyed) {
                    this.setActiveNote(midi, false, { string: pos.string, fret: pos.fret });
                }
            }, 210);
            this._flashTimers.set(key, tid);
        }
    }

    setTunerState(tunerData) {
        for (let s = 0; s < 4; s++) {
            const dot = this.tunerDotElements[s];
            if (dot && dot.classList) {
                dot.classList.remove("in-tune", "off-tune");
            }
        }
        if (!tunerData || tunerData.active === false) return;

        let stringIdx = Number.isInteger(tunerData.stringIdx) && tunerData.stringIdx >= 0 && tunerData.stringIdx <= 3
            ? tunerData.stringIdx
            : null;
        if (stringIdx === null && Number.isFinite(tunerData.midi)) {
            const rounded = Math.round(tunerData.midi);
            for (let s = 0; s < 4; s++) {
                if (this.tuning[s].openMidi === rounded) {
                    stringIdx = s;
                    break;
                }
            }
        }
        if (stringIdx === null) return;

        const dot = this.tunerDotElements[stringIdx];
        if (!dot || !dot.classList) return;
        const cents = Math.abs(Number(tunerData.cents) || 0);
        dot.classList.add(cents <= 12 ? "in-tune" : "off-tune");
    }

    clearTargetHighlights() {
        const prevKeys = Array.from(this.targetCells.keys());
        this.targetCells.clear();
        for (let i = 0; i < prevKeys.length; i++) {
            const [sStr, fStr] = prevKeys[i].split(":");
            this._applyCellVisual(Number(sStr), Number(fStr));
        }
        this._updateChordBadge(null);
    }

    _clearFlashTimer(key) {
        if (this._flashTimers.has(key)) {
            if (typeof clearTimeout === "function") {
                clearTimeout(this._flashTimers.get(key));
            }
            this._flashTimers.delete(key);
        }
    }

    clearAll() {
        for (const tid of this._flashTimers.values()) {
            if (typeof clearTimeout === "function") clearTimeout(tid);
        }
        this._flashTimers.clear();
        this._pointerPressedCells.clear();

        const touched = new Set([
            ...this.activeCells.keys(),
            ...this.targetCells.keys()
        ]);
        this.activeCells.clear();
        this.targetCells.clear();
        this.activeKeys.clear();

        for (const key of touched) {
            const [sStr, fStr] = key.split(":");
            this._applyCellVisual(Number(sStr), Number(fStr));
        }
        for (let s = 0; s < 4; s++) {
            this._refreshStringRowState(s);
        }
        this._updateChordBadge(null);
    }

    destroy() {
        this._isDestroyed = true;
        this.clearAll();
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("pointerup", this._boundWindowPointerUp);
            window.removeEventListener("mouseup", this._boundWindowPointerUp);
        }
        this.cellElements.clear();
        this.markerElements.clear();
        this.stringRowElements = [];
        this.tunerDotElements = [];
        this.chordBadgeEl = null;
        if (this.container) {
            this.container.innerHTML = "";
        }
    }
}
