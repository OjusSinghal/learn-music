/**
 * Yousician Style Interactive 61-Key Piano Keyboard (C2 to C7)
 * Renders all 61 keys (5 full octaves: MIDI 36 to MIDI 96, 36 white keys + 25 black keys)
 * with octave markers, Middle C indicator, and Finger Color Scheme highlights:
 *   Thumb (T / 1)  = Green  (#48A870)
 *   Index (1 / 2)  = Yellow (#F0C830)
 *   Middle (2 / 3) = Purple (#6848F8)
 *   Ring (3 / 4)   = Blue   (#4090F8)
 *   Pinky (4 / 5)  = Red    (#E86078)
 */

import { FINGER_PALETTE, PianoFingeringEngine } from "./fingering.js";

export class PianoKeyboard {
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.startMidi = options.startMidi || 36; // C2 (65.41 Hz) - Key #1 of 61-key keyboard
        this.endMidi = options.endMidi || 96;     // C7 (2093.00 Hz) - Key #61 of 61-key keyboard (5 octaves)
        this.onKeyPress = options.onKeyPress || null;
        this.onKeyRelease = options.onKeyRelease || null;
        this.getFingerStyleForMidi = options.getFingerStyleForMidi || null;

        this.fingerPalette = FINGER_PALETTE;
        this.noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        this.isBlackKey = [false, true, false, true, false, false, true, false, true, false, true, false];

        this.activeKeys = new Map(); // midi -> { color, status: 'playing'|'preview'|'correct'|'wrong', meta }
        this.keyElements = new Map(); // midi -> DOM element
        this.fingerBadgeElements = new Map(); // midi -> DOM badge element

        this.init();
    }

    /**
     * Fold any out-of-range MIDI pitch by octaves into the 61-key range [36 (C2), 96 (C7)]
     */
    static clampTo61KeyRange(midi) {
        return PianoFingeringEngine.clamp61(midi);
    }

    /**
     * Default ergonomic finger style when a key is pressed in free-play outside an active score target
     */
    getDefaultFingerStyle(midi) {
        if (typeof this.getFingerStyleForMidi === "function") {
            const custom = this.getFingerStyleForMidi(midi);
            if (custom) return custom;
        }
        const pitchIndex = ((midi % 12) + 12) % 12;
        const isRight = midi >= 60;
        // Ergonomic white/black terrain default within the 5-finger color scheme
        const rhDefaultFinger = [1, 2, 2, 3, 3, 1, 2, 3, 4, 4, 4, 5][pitchIndex];
        const lhDefaultFinger = [5, 4, 4, 3, 3, 2, 3, 1, 2, 2, 2, 1][pitchIndex];
        return PianoFingeringEngine.getFingerStyle(isRight ? rhDefaultFinger : lhDefaultFinger);
    }

    getNoteInfo(midi) {
        const pitchIndex = ((midi % 12) + 12) % 12;
        const name = this.noteNames[pitchIndex];
        const octave = Math.floor(midi / 12) - 1;
        const isBlack = this.isBlackKey[pitchIndex];
        const fingerStyle = this.getDefaultFingerStyle(midi);
        const color = { bg: fingerStyle.primary, light: fingerStyle.light, dark: fingerStyle.dark, text: "#FFFFFF" };
        // 61-key keyboard numbering: C2 (36) = Key #1, C4 (60) = Key #25, C7 (96) = Key #61
        const key61Number = midi - 35;
        const octave61Number = Math.min(5, Math.max(1, octave - 1));
        // White key index within octave (0..6 for C,D,E,F,G,A,B) -> 1..36 across 61 keys
        const whiteInOctaveMap = [0, -1, 1, -1, 2, 3, -1, 4, -1, 5, -1, 6];
        const whiteKeyNumber = !isBlack ? ((octave - 2) * 7 + whiteInOctaveMap[pitchIndex] + 1) : null;
        return {
            name,
            octave,
            fullName: `${name}${octave}`,
            isBlack,
            color,
            fingerStyle,
            key61Number,
            whiteKeyNumber,
            octave61Number
        };
    }

    init() {
        this.container.innerHTML = "";
        this.container.className = "piano-keyboard-wrapper";

        // Count white keys to calculate widths (36 white keys on a 61-key keyboard)
        let whiteKeyCount = 0;
        for (let m = this.startMidi; m <= this.endMidi; m++) {
            if (!this.getNoteInfo(m).isBlack) {
                whiteKeyCount++;
            }
        }

        const keyboardEl = document.createElement("div");
        keyboardEl.className = "piano-keyboard";
        
        this._activePointers = new Map(); // pointerId -> midi
        this._pointerCountByMidi = new Map(); // midi -> active pointer count

        const releasePointer = (e) => {
            const pid = e && e.pointerId !== undefined ? e.pointerId : "mouse";
            if (!this._activePointers.has(pid)) return;
            const pressedMidi = this._activePointers.get(pid);
            this._activePointers.delete(pid);
            const remaining = Math.max(0, (this._pointerCountByMidi.get(pressedMidi) || 1) - 1);
            if (remaining > 0) {
                this._pointerCountByMidi.set(pressedMidi, remaining);
                return;
            }
            this._pointerCountByMidi.delete(pressedMidi);
            if (this.activeKeys.has(pressedMidi) && this.activeKeys.get(pressedMidi).status === "playing") {
                this.releaseKey(pressedMidi);
                if (this.onKeyRelease) this.onKeyRelease(pressedMidi);
            }
        };

        this._boundReleasePointer = releasePointer;
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("pointerup", releasePointer);
            window.addEventListener("pointercancel", releasePointer);
            window.addEventListener("mouseup", releasePointer);
        }

        let whiteIndex = 0;
        for (let midi = this.startMidi; midi <= this.endMidi; midi++) {
            const info = this.getNoteInfo(midi);
            const keyEl = document.createElement("div");
            keyEl.dataset.midi = midi;
            keyEl.dataset.note = info.fullName;
            keyEl.dataset.key61 = info.key61Number;
            if (info.whiteKeyNumber) {
                keyEl.dataset.whiteKey = info.whiteKeyNumber;
            }
            const whiteDesc = info.whiteKeyNumber ? ` • White Key #${info.whiteKeyNumber}/36` : " • Black Key";
            keyEl.title = `${info.fullName}${midi === 60 ? " (Middle C)" : ""} • Key #${info.key61Number}/61${whiteDesc} • MIDI ${midi}`;

            if (info.isBlack) {
                keyEl.className = "piano-key black-key";
                // Black key position is anchored to previous white key
                const leftPercent = ((whiteIndex - 0.32) / whiteKeyCount) * 100;
                const widthPercent = (0.64 / whiteKeyCount) * 100;
                keyEl.style.left = `${leftPercent}%`;
                keyEl.style.width = `${widthPercent}%`;

                const fingerBadge = document.createElement("span");
                fingerBadge.className = "key-finger-badge black-finger-badge";
                keyEl.appendChild(fingerBadge);
                this.fingerBadgeElements.set(midi, fingerBadge);
                
                // Black key label matching screenshot (e.g. F#, G#, A#, C#, D#)
                const label = document.createElement("span");
                label.className = "key-label black-label";
                label.textContent = info.name;
                keyEl.appendChild(label);
            } else {
                const isMiddleC = midi === 60;
                const isOctaveStart = info.name === "C";
                keyEl.className = `piano-key white-key${isOctaveStart ? " octave-start" : ""}${isMiddleC ? " middle-c" : ""}`;
                const leftPercent = (whiteIndex / whiteKeyCount) * 100;
                const widthPercent = (1.0 / whiteKeyCount) * 100;
                keyEl.style.left = `${leftPercent}%`;
                keyEl.style.width = `${widthPercent}%`;

                const fingerBadge = document.createElement("span");
                fingerBadge.className = "key-finger-badge white-finger-badge";
                keyEl.appendChild(fingerBadge);
                this.fingerBadgeElements.set(midi, fingerBadge);
                
                // Show note name on every white key (bold on C keys, subtle on D-B so A3 vs A4 is unmistakable)
                const label = document.createElement("span");
                label.className = `key-label white-label${isOctaveStart ? " c-key-label" : " sub-key-label"}${isMiddleC ? " middle-c-label" : ""}`;
                label.textContent = info.fullName;
                keyEl.appendChild(label);

                const numTag = document.createElement("span");
                numTag.className = "key-num-tag";
                numTag.textContent = `#${info.key61Number}`;
                keyEl.appendChild(numTag);

                whiteIndex++;
            }

            // Multi-touch Pointer & Mouse interaction
            const handlePress = (e) => {
                if (e && typeof e.preventDefault === "function") e.preventDefault();
                const pid = e && e.pointerId !== undefined ? e.pointerId : "mouse";
                if (this._activePointers.has(pid)) return;
                this._activePointers.set(pid, midi);
                this._pointerCountByMidi.set(midi, (this._pointerCountByMidi.get(midi) || 0) + 1);

                const currentStyle = this.getDefaultFingerStyle(midi);
                this.pressKey(midi, currentStyle.primary, "playing", {
                    lightColor: currentStyle.light,
                    darkColor: currentStyle.dark,
                    fingerLabel: currentStyle.diagramLabel,
                    fingerName: currentStyle.name
                });
                if (this.onKeyPress) this.onKeyPress(midi);
            };

            keyEl.addEventListener("pointerdown", handlePress);
            keyEl.addEventListener("mousedown", (e) => {
                if (typeof PointerEvent !== "undefined") return;
                handlePress(e);
            });

            this.keyElements.set(midi, keyEl);
            keyboardEl.appendChild(keyEl);
        }

        this.container.appendChild(keyboardEl);
    }

    /**
     * Centers Middle C (C4, MIDI 60) inside horizontally scrollable mobile viewports
     */
    scrollToMiddleC() {
        if (!this.container || typeof this.container.scrollLeft !== "number") return;
        const maxScroll = (this.container.scrollWidth || 0) - (this.container.clientWidth || 0);
        if (maxScroll <= 4) return;
        const middleCEl = this.keyElements.get(60);
        if (middleCEl && typeof middleCEl.offsetLeft === "number") {
            const targetLeft = middleCEl.offsetLeft + (middleCEl.offsetWidth || 0) / 2 - this.container.clientWidth / 2;
            this.container.scrollLeft = Math.max(0, Math.min(maxScroll, targetLeft));
        } else {
            this.container.scrollLeft = Math.round(maxScroll * 0.42);
        }
    }

    /**
     * Light up key when active
     * @param {number} midi - MIDI note number
     * @param {string} customColor - Optional hex color
     * @param {string} status - 'playing' | 'preview' | 'correct' | 'wrong'
     * @param {Object|null} meta - Optional finger style metadata { lightColor, darkColor, fingerLabel, fingerName }
     */
    pressKey(midi, customColor = null, status = "playing", meta = null) {
        const keyEl = this.keyElements.get(midi);
        if (!keyEl) return;

        const defaultStyle = this.getDefaultFingerStyle(midi);
        const color = customColor || defaultStyle.primary;
        const lightColor = (meta && meta.lightColor) ? meta.lightColor : (customColor ? color : defaultStyle.light);
        const darkColor = (meta && meta.darkColor) ? meta.darkColor : (customColor ? color : defaultStyle.dark);

        keyEl.classList.add("active");
        keyEl.style.setProperty("--active-color", color);
        keyEl.style.setProperty("--active-color-light", lightColor);
        keyEl.style.setProperty("--active-color-dark", darkColor);

        const badgeEl = this.fingerBadgeElements.get(midi);
        if (badgeEl) {
            if (meta && meta.fingerLabel) {
                badgeEl.textContent = meta.fingerLabel;
                badgeEl.classList.add("visible");
            } else if (!customColor && status === "playing") {
                badgeEl.textContent = defaultStyle.diagramLabel;
                badgeEl.classList.add("visible");
            } else {
                badgeEl.textContent = "";
                badgeEl.classList.remove("visible");
            }
        }
        
        if (status === "correct") {
            keyEl.classList.add("hit-correct");
            keyEl.classList.remove("hit-wrong");
        } else if (status === "wrong") {
            keyEl.classList.add("hit-wrong");
            keyEl.classList.remove("hit-correct");
        } else {
            keyEl.classList.remove("hit-correct", "hit-wrong");
        }

        this.activeKeys.set(midi, { color, status, meta });
    }

    /**
     * Release active key
     */
    releaseKey(midi) {
        const keyEl = this.keyElements.get(midi);
        if (!keyEl) return;

        keyEl.classList.remove("active", "hit-correct", "hit-wrong");
        keyEl.style.removeProperty("--active-color");
        keyEl.style.removeProperty("--active-color-light");
        keyEl.style.removeProperty("--active-color-dark");

        const badgeEl = this.fingerBadgeElements.get(midi);
        if (badgeEl) {
            badgeEl.textContent = "";
            badgeEl.classList.remove("visible");
        }

        this.activeKeys.delete(midi);
    }

    /**
     * Clear all pressed keys
     */
    clearAll() {
        for (const [midi] of this.activeKeys) {
            this.releaseKey(midi);
        }
    }
}
