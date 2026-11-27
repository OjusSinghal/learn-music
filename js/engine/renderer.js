/**
 * Yousician Canvas Visualizer Engine
 * 60 FPS Canvas renderer matching Yousician Piano UI:
 * - Dual staves (Treble & Bass) with clefs, key signatures, and measure lines
 * - Horizontal scrolling note pills color-coded by Finger Color Scheme (T=Green, 1=Yellow, 2=Purple, 3=Blue, 4=Red)
 * - Top chords row (G, A, Bm, etc.) and multiplier badge
 * - Playhead with two independent 3D spheres jumping parabolically from note head to note head
 * - Hit feedback bursts & scoring
 */

import { FINGER_PALETTE, PianoFingeringEngine } from "./fingering.js";

export class YousicianRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.pixelsPerSecond = options.pixelsPerSecond || 180; // horizontal scroll speed scale

        // Canonical 5-Finger Color Scheme (Thumb=Green, Index=Yellow, Middle=Purple, Ring=Blue, Pinky=Coral-Red)
        this.fingerPalette = FINGER_PALETTE;
        this.noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        
        // Subtle hit ripples, transient off-target ghost marks, dust motes, and micro-labels
        this.particles = [];
        this.hitTexts = [];
        this.ripples = [];
        this.ghostMarks = [];
        this._lastLayout = null;

        // Independent hand state ("left" = lower/bass, "right" = upper/treble)
        this.activeHands = { left: true, right: true };
        this.onToggleHand = options.onToggleHand || null;
        this._disabledBadgeRects = [];

        // Offscreen buffers for 60 FPS cross-browser staff blur
        this._offCanvas = null;
        this._offCtx = null;
        this._blurCanvasA = null;
        this._blurCtxA = null;
        this._blurCanvasB = null;
        this._blurCtxB = null;

        // Playhead location (26% from left edge)
        this.playheadRatio = 0.26;

        // Cached chronological onset clusters per hand for O(log N) ballistic ball trajectories
        this._handEventsCache = new WeakMap();

        this.resize();
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", () => this.resize());
        }
        this._bindCanvasHandBadgeEvents();
    }

    _bindCanvasHandBadgeEvents() {
        if (!this.canvas || typeof this.canvas.addEventListener !== "function") return;

        const getCanvasCoords = (e) => {
            if (typeof this.canvas.getBoundingClientRect !== "function") return null;
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        this.canvas.addEventListener("mousemove", (e) => {
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
        });

        this.canvas.addEventListener("click", (e) => {
            if (!this.onToggleHand || !this._disabledBadgeRects || this._disabledBadgeRects.length === 0) return;
            const pt = getCanvasCoords(e);
            if (!pt) return;
            const hit = this._disabledBadgeRects.find(
                (b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h
            );
            if (hit) {
                this.onToggleHand(hit.hand);
            }
        });
    }

    setActiveHands(hands = {}) {
        if (hands.left !== undefined) this.activeHands.left = Boolean(hands.left);
        if (hands.right !== undefined) this.activeHands.right = Boolean(hands.right);

        // Immediately clear any floating feedback on a newly disabled hand's staff
        const keepHand = (item) => (item.isTreble ? this.activeHands.right : this.activeHands.left);
        this.hitTexts = this.hitTexts.filter(keepHand);
        this.particles = this.particles.filter(keepHand);
        this.ripples = this.ripples.filter(keepHand);
        this.ghostMarks = this.ghostMarks.filter(keepHand);
    }

    getNoteHand(note) {
        if (!note) return "right";
        if (note.hand === "left" || note.hand === "right") return note.hand;
        if (note.clef === "bass") return "left";
        if (note.clef === "treble") return "right";
        return note.pitch >= 60 ? "right" : "left";
    }

    _ensureBlurBuffers(w, h) {
        if (typeof document === "undefined" || typeof document.createElement !== "function") {
            return false;
        }
        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        const cw = Math.max(1, Math.floor(w * dpr));
        const ch = Math.max(1, Math.floor(h * dpr));

        if (!this._offCanvas) {
            const c = document.createElement("canvas");
            if (!c || typeof c.getContext !== "function") return false;
            this._offCanvas = c;
            this._offCtx = c.getContext("2d");
            this._blurCanvasA = document.createElement("canvas");
            this._blurCtxA = this._blurCanvasA.getContext("2d");
            this._blurCanvasB = document.createElement("canvas");
            this._blurCtxB = this._blurCanvasB.getContext("2d");
        }

        if (!this._offCtx || !this._blurCtxA || !this._blurCtxB) {
            return false;
        }

        if (this._offCanvas.width !== cw || this._offCanvas.height !== ch) {
            this._offCanvas.width = cw;
            this._offCanvas.height = ch;
        }
        this._offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
    }

    resize() {
        const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        const rect = (this.canvas && typeof this.canvas.getBoundingClientRect === "function")
            ? this.canvas.getBoundingClientRect()
            : { width: 800, height: 400 };
        const fallbackW = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : 800;
        const w = rect.width || this.canvas?.parentElement?.clientWidth || fallbackW;
        const h = rect.height || this.canvas?.parentElement?.clientHeight || 400;
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
        return this.width * this.playheadRatio;
    }

    /**
     * Map MIDI pitch to vertical Y coordinate on Treble or Bass staff
     */
    getNoteY(midi, clef, trebleCenterY, bassCenterY, staffSpacing) {
        // Staff lines are spaced by staffSpacing (e.g. 14px)
        // Each diatonic step is half a staff space
        const diatonicMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C=0, D=1, E=2, F=3, G=4, A=5, B=6
        const pitchClass = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;
        const absoluteDiatonic = octave * 7 + diatonicMap[pitchClass];

        const step = staffSpacing / 2;

        if (clef === "treble" || (clef === "auto" && midi >= 60)) {
            // Treble: B4 (MIDI 71, octave 4, diatonic 4*7 + 6 = 34) is middle line
            const refDiatonic = 4 * 7 + 6; // B4
            const offset = (absoluteDiatonic - refDiatonic) * step;
            return trebleCenterY - offset;
        } else {
            // Bass: D3 (MIDI 50, octave 3, diatonic 3*7 + 1 = 22) is middle line
            const refDiatonic = 3 * 7 + 1; // D3
            const offset = (absoluteDiatonic - refDiatonic) * step;
            return bassCenterY - offset;
        }
    }

    addHitFeedback(text, color, isTreble = true, meta = null) {
        if (isTreble && !this.activeHands.right) return;
        if (!isTreble && !this.activeHands.left) return;

        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const upper = String(text || "").toUpperCase();
        const kind = (meta && meta.kind)
            ? meta.kind
            : (upper.includes("MISS") ? "missed" : (upper.includes("WRONG") ? "wrong" : (upper === "PERFECT" ? "perfect" : "good")));

        // 1. Missed notes: zero red popups and zero particles — the note pill quietly dims into a ghost capsule
        if (kind === "missed") {
            return;
        }

        // 2. Off-target key press: zero red popups/particles — place a quiet translucent ghost ring at the played pitch height
        if (kind === "wrong") {
            const playedPitch = (meta && Number.isFinite(meta.pitch))
                ? meta.pitch
                : (isTreble ? 69 : 50);
            this.ghostMarks.push({
                pitch: playedPitch,
                clef: isTreble ? "treble" : "bass",
                isTreble,
                createdAt: now,
                duration: 380
            });
            if (this.ghostMarks.length > 12) {
                this.ghostMarks.shift();
            }
            return;
        }

        // 3. Positive hit ("perfect" | "good"): delicate concentric ripple at note head + whisper micro-label
        const x = this.getPlayheadX();
        const layout = this._lastLayout;
        const pitch = (meta && Number.isFinite(meta.pitch))
            ? meta.pitch
            : (meta && meta.note && Number.isFinite(meta.note.pitch) ? meta.note.pitch : null);
        const clef = (meta && meta.note && meta.note.clef)
            ? meta.note.clef
            : (isTreble ? "treble" : "bass");

        let rippleY = isTreble ? (this.height || 400) * 0.30 : (this.height || 400) * 0.70;
        if (layout && Number.isFinite(pitch)) {
            rippleY = this.getNoteY(pitch, clef, layout.trebleCenterY, layout.bassCenterY, layout.staffSpacing);
        }

        const isPerfect = kind === "perfect";
        const subtleColor = isPerfect ? "#86EFAC" : "#E9D5A1";

        this.ripples.push({
            x,
            y: rippleY,
            pitch,
            clef,
            isTreble,
            color: subtleColor,
            createdAt: now,
            duration: 440
        });
        if (this.ripples.length > 16) {
            this.ripples.shift();
        }

        // At most 3 fine luminous dust motes drifting softly (never noisy bursts)
        for (let i = 0; i < 3; i++) {
            const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.2;
            const speed = 0.35 + Math.random() * 0.65;
            this.particles.push({
                x: x + (Math.random() - 0.5) * 6,
                y: rippleY + (Math.random() - 0.5) * 4,
                isTreble,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 0.15,
                color: subtleColor,
                size: 1.1 + Math.random() * 0.9,
                alpha: 0.46,
                decay: 0.02 + Math.random() * 0.012
            });
        }

        // Deduplicate per-beat chord micro-labels so multi-note chords show a single poised whisper
        const formattedLabel = upper === "PERFECT"
            ? "Perfect"
            : (upper === "EARLY" ? "Early" : (upper === "LATE" ? "Late" : text));
        const recentSameStaff = this.hitTexts.find(
            (ht) => ht.isTreble === isTreble && (now - ht.createdAt) < 90
        );
        if (recentSameStaff) {
            if (!isPerfect && recentSameStaff.text === "Perfect") {
                recentSameStaff.text = formattedLabel;
                recentSameStaff.color = subtleColor;
            }
            return;
        }

        const labelY = layout
            ? (isTreble ? layout.trebleBandY + 22 : layout.bassBandY + 22)
            : (isTreble ? (this.height || 400) * 0.17 : (this.height || 400) * 0.56);

        this.hitTexts.push({
            text: formattedLabel,
            color: subtleColor,
            x,
            y: labelY,
            isTreble,
            alpha: 0.72,
            createdAt: now,
            duration: 540
        });
    }

    render(gameState) {
        if (!this.width || this.width === 0) {
            this.resize();
        }
        const {
            currentTime,
            startTime = 0,
            leadInBeats = 0,
            firstNoteTime = 0,
            isPlaying = false,
            currentBpm,
            song,
            score,
            streak,
            multiplier,
            isWaiting,
            waitTargetNote,
            waitTargetChord,
            activeHands
        } = gameState;

        if (activeHands) {
            this.activeHands = {
                left: activeHands.left !== false,
                right: activeHands.right !== false
            };
        }
        const rightEnabled = this.activeHands.right;
        const leftEnabled = this.activeHands.left;
        this._disabledBadgeRects = [];

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        if (!w || !h || !ctx) return;

        // 1. Background Fill (Deep nocturnal conservatory obsidian gradient)
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, "#0E131B");
        bgGrad.addColorStop(0.5, "#111722");
        bgGrad.addColorStop(1, "#0B0F16");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const playheadX = this.getPlayheadX();
        const staffSpacing = Math.min(16, Math.max(11, Math.floor(h / 32)));

        // Subtle ambient radial studio glow centered at the playhead
        const ambientGrad = ctx.createRadialGradient(playheadX, h * 0.5, 16, playheadX, h * 0.5, Math.max(w * 0.45, 320));
        ambientGrad.addColorStop(0, "rgba(203, 213, 225, 0.034)");
        ambientGrad.addColorStop(1, "rgba(14, 19, 27, 0)");
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, w, h);

        // Layout zones
        const topBarHeight = 40;
        const availableHeight = h - topBarHeight;
        const trebleBandY = topBarHeight;
        const trebleBandH = availableHeight * 0.475;
        const dividerY = topBarHeight + availableHeight * 0.475;
        const bassBandY = topBarHeight + availableHeight * 0.485;
        const bassBandH = availableHeight * 0.515;
        const trebleCenterY = topBarHeight + availableHeight * 0.255;
        const bassCenterY = topBarHeight + availableHeight * 0.725;

        this._lastLayout = {
            topBarHeight,
            trebleBandY,
            bassBandY,
            trebleCenterY,
            bassCenterY,
            staffSpacing
        };

        // Score beat & measure parameters
        const baseBpm = (song && song.bpm) ? song.bpm : (currentBpm || 100);
        const secondsPerBeat = 60 / baseBpm;
        const beatsPerMeasure = (song && song.beatsPerMeasure) ? song.beatsPerMeasure : 4;
        const measureDuration = secondsPerBeat * beatsPerMeasure;
        const songTimeOffset = currentTime;
        const startMeasure = Math.floor((songTimeOffset - (playheadX / this.pixelsPerSecond)) / measureDuration);
        const endMeasure = Math.ceil((songTimeOffset + ((w - playheadX) / this.pixelsPerSecond)) / measureDuration);

        const bandShared = {
            w,
            h,
            playheadX,
            staffSpacing,
            trebleCenterY,
            bassCenterY,
            songTimeOffset,
            currentTime,
            startTime,
            baseBpm,
            leadInBeats,
            secondsPerBeat,
            beatsPerMeasure,
            measureDuration,
            startMeasure,
            endMeasure,
            song,
            isWaiting,
            waitTargetNote,
            waitTargetChord
        };

        // 2. Render Upper Staff Band (Right Hand / Treble) — Crisp when ON, Blurred when OFF
        if (rightEnabled) {
            this._drawStaffBand(ctx, "right", true, trebleBandY, trebleBandH, trebleCenterY, bandShared);
        } else {
            this._drawBlurredStaffBand(ctx, "right", trebleBandY, trebleBandH, trebleCenterY, bandShared);
        }

        // 3. Delicate hairline divider between treble and bass staves
        ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
        ctx.fillRect(0, dividerY, w, 1);

        // 4. Render Lower Staff Band (Left Hand / Bass) — Crisp when ON, Blurred when OFF
        if (leftEnabled) {
            this._drawStaffBand(ctx, "left", true, bassBandY, bassBandH, bassCenterY, bandShared);
        } else {
            this._drawBlurredStaffBand(ctx, "left", bassBandY, bassBandH, bassCenterY, bandShared);
        }

        // 5. Render Crisp Count-In Beat Numbers & Chord Symbols above the active staff
        if (rightEnabled || leftEnabled) {
            const labelTopY = rightEnabled ? trebleBandY : bassBandY;
            this._drawBeatAndChordLabels(ctx, labelTopY, bandShared);
        }

        // 6. Draw Top In-Game Bar (Multiplier, Hand Mode, Count-In / Wait Status, Score, Streak)
        this.drawTopBar(ctx, w, topBarHeight, score, streak, multiplier, isWaiting, waitTargetNote, waitTargetChord, {
            currentTime,
            startTime,
            firstNoteTime,
            secondsPerBeat,
            isPlaying,
            activeHands: this.activeHands
        });

        // 7. Render Particles & Floating Hit Feedback (active hands only)
        this.renderEffects(ctx);
    }

    _drawStaffBand(targetCtx, hand, isEnabled, bandY, bandH, staffCenterY, state) {
        const {
            w,
            playheadX,
            staffSpacing,
            trebleCenterY,
            bassCenterY,
            songTimeOffset,
            currentTime,
            startTime,
            baseBpm,
            leadInBeats,
            secondsPerBeat,
            beatsPerMeasure,
            measureDuration,
            startMeasure,
            endMeasure,
            song,
            isWaiting,
            waitTargetNote,
            waitTargetChord
        } = state;

        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.rect(0, bandY, w, bandH);
        targetCtx.clip();

        // 1. Subtle Tonal Staff Region Wash
        targetCtx.fillStyle = hand === "right"
            ? "rgba(248, 250, 252, 0.018)"
            : "rgba(148, 163, 184, 0.015)";
        targetCtx.fillRect(0, bandY, w, bandH);

        // 2. 5 Delicate Engraved Horizontal Staff Lines
        targetCtx.lineWidth = 1.0;
        targetCtx.strokeStyle = "rgba(226, 232, 240, 0.14)";
        for (let i = -2; i <= 2; i++) {
            const y = staffCenterY + i * staffSpacing;
            targetCtx.beginPath();
            targetCtx.moveTo(0, y);
            targetCtx.lineTo(w, y);
            targetCtx.stroke();
        }

        // 3. Clef, Key Signature & Time Signature for this staff
        this.drawStaffClef(targetCtx, hand, staffCenterY, staffSpacing, song);

        // 4. Pre-roll count-in vertical dotted beat lines within this band
        if (leadInBeats > 0) {
            targetCtx.save();
            for (let b = 0; b < leadInBeats; b++) {
                const beatTime = (b - leadInBeats) * secondsPerBeat;
                const beatX = playheadX + (beatTime - songTimeOffset) * this.pixelsPerSecond;
                if (beatX < 0 || beatX > w) continue;

                const isCountInDownbeat = (b % beatsPerMeasure) === 0;
                targetCtx.setLineDash([3, 6]);
                targetCtx.strokeStyle = isCountInDownbeat
                    ? "rgba(134, 239, 172, 0.22)"
                    : "rgba(226, 232, 240, 0.08)";
                targetCtx.lineWidth = 1.0;
                targetCtx.beginPath();
                targetCtx.moveTo(beatX, bandY);
                targetCtx.lineTo(beatX, bandY + bandH);
                targetCtx.stroke();
            }
            targetCtx.restore();
        }

        // 5. Measure bar lines within this band
        for (let m = Math.max(0, startMeasure); m <= endMeasure; m++) {
            const measureTime = m * measureDuration;
            const barX = playheadX + (measureTime - songTimeOffset) * this.pixelsPerSecond;
            if (barX >= 0 && barX <= w) {
                targetCtx.strokeStyle = m === 0 ? "rgba(134, 239, 172, 0.28)" : "rgba(226, 232, 240, 0.13)";
                targetCtx.lineWidth = m === 0 ? 1.35 : 1.0;
                targetCtx.beginPath();
                targetCtx.moveTo(barX, bandY);
                targetCtx.lineTo(barX, bandY + bandH);
                targetCtx.stroke();
            }
        }

        // 6. Note Pills belonging to this hand
        const allNotes = (song && Array.isArray(song.notes)) ? song.notes : [];
        if (allNotes.length > 0) {
            const handNotes = allNotes.filter((n) => this.getNoteHand(n) === hand);
            this.drawNotePills(
                targetCtx,
                handNotes,
                songTimeOffset,
                playheadX,
                trebleCenterY,
                bassCenterY,
                staffSpacing,
                w,
                isEnabled ? isWaiting : false,
                isEnabled ? waitTargetNote : null,
                isEnabled ? waitTargetChord : [],
                isEnabled
            );
        }

        // 7. Playhead & Independent Note-to-Note Jumping Sphere within this band
        this.drawBandPlayhead(targetCtx, playheadX, bandY, bandY + bandH, staffCenterY, currentTime, baseBpm, isEnabled, {
            hand,
            notes: allNotes,
            startTime: state.startTime,
            trebleCenterY,
            bassCenterY,
            staffSpacing
        });

        targetCtx.restore();
    }

    _drawBlurredStaffBand(mainCtx, hand, bandY, bandH, staffCenterY, state) {
        const { w, h } = state;
        const canOffscreen = this._ensureBlurBuffers(w, h);

        if (canOffscreen) {
            const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
            this._offCtx.save();
            this._offCtx.clearRect(0, bandY, w, bandH);
            // Solid dark backing inside offscreen band so downsample alpha never fringes
            this._offCtx.fillStyle = hand === "right" ? "#101620" : "#0D121B";
            this._offCtx.fillRect(0, bandY, w, bandH);
            this._drawStaffBand(this._offCtx, hand, false, bandY, bandH, staffCenterY, state);
            this._offCtx.restore();

            // Multi-pass bilinear downsample pyramid (works in ALL browsers including WebKit/Safari)
            const sy = Math.max(0, Math.floor(bandY * dpr));
            const sh = Math.max(1, Math.min(this._offCanvas.height - sy, Math.ceil(bandH * dpr)));
            const sw = this._offCanvas.width;

            const w1 = Math.max(16, Math.round(w / 3.5));
            const h1 = Math.max(8, Math.round(bandH / 3.5));
            if (this._blurCanvasA.width !== w1 || this._blurCanvasA.height !== h1) {
                this._blurCanvasA.width = w1;
                this._blurCanvasA.height = h1;
            }
            this._blurCtxA.imageSmoothingEnabled = true;
            this._blurCtxA.clearRect(0, 0, w1, h1);
            this._blurCtxA.drawImage(this._offCanvas, 0, sy, sw, sh, 0, 0, w1, h1);

            const w2 = Math.max(12, Math.round(w / 8.5));
            const h2 = Math.max(6, Math.round(bandH / 8.5));
            if (this._blurCanvasB.width !== w2 || this._blurCanvasB.height !== h2) {
                this._blurCanvasB.width = w2;
                this._blurCanvasB.height = h2;
            }
            this._blurCtxB.imageSmoothingEnabled = true;
            this._blurCtxB.clearRect(0, 0, w2, h2);
            this._blurCtxB.drawImage(this._blurCanvasA, 0, 0, w1, h1, 0, 0, w2, h2);

            // Upsample blurred band onto main canvas + optional hardware CSS filter smoothing
            mainCtx.save();
            mainCtx.beginPath();
            mainCtx.rect(0, bandY, w, bandH);
            mainCtx.clip();

            mainCtx.imageSmoothingEnabled = true;
            if ("filter" in mainCtx) {
                mainCtx.filter = "blur(4px)";
            }
            mainCtx.globalAlpha = 0.65;
            mainCtx.drawImage(this._blurCanvasB, 0, 0, w2, h2, 0, bandY, w, bandH);
            if ("filter" in mainCtx) {
                mainCtx.filter = "none";
            }
            mainCtx.globalAlpha = 1.0;

            // Frosted dark veil to de-emphasize the toggled-off hand
            mainCtx.fillStyle = "rgba(10, 14, 20, 0.52)";
            mainCtx.fillRect(0, bandY, w, bandH);
            mainCtx.restore();
        } else {
            // Fallback for headless test environments without offscreen canvas
            this._drawStaffBand(mainCtx, hand, false, bandY, bandH, staffCenterY, state);
            mainCtx.save();
            mainCtx.fillStyle = "rgba(10, 14, 20, 0.72)";
            mainCtx.fillRect(0, bandY, w, bandH);
            mainCtx.restore();
        }

        // Crisp clickable pill badge in the top-right corner of the blurred staff
        this._drawDisabledHandBadge(mainCtx, hand, w, bandY);
    }

    _drawDisabledHandBadge(ctx, hand, screenWidth, bandY) {
        const isRight = hand === "right";
        const shortcut = isRight ? "R" : "L";
        const label = isRight
            ? `Right Hand Muted  ·  Press ${shortcut} to enable`
            : `Left Hand Muted  ·  Press ${shortcut} to enable`;

        const badgeW = 248;
        const badgeH = 24;
        const badgeX = Math.max(12, screenWidth - badgeW - 18);
        const badgeY = bandY + 10;

        ctx.save();
        ctx.fillStyle = "rgba(15, 20, 29, 0.78)";
        ctx.beginPath();
        this.drawPill(ctx, badgeX, badgeY, badgeW, badgeH, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.fillStyle = "rgba(203, 213, 225, 0.78)";
        ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2);
        ctx.restore();

        this._disabledBadgeRects.push({
            hand,
            x: badgeX,
            y: badgeY,
            w: badgeW,
            h: badgeH
        });
    }

    _drawBeatAndChordLabels(ctx, labelBandTopY, state) {
        const {
            w,
            playheadX,
            songTimeOffset,
            leadInBeats,
            secondsPerBeat,
            beatsPerMeasure,
            measureDuration,
            startMeasure,
            endMeasure,
            song
        } = state;

        ctx.save();

        // Count-in beat numbers (t < 0)
        if (leadInBeats > 0) {
            for (let b = 0; b < leadInBeats; b++) {
                const beatTime = (b - leadInBeats) * secondsPerBeat;
                const beatX = playheadX + (beatTime - songTimeOffset) * this.pixelsPerSecond;
                if (beatX < 0 || beatX > w) continue;

                const isCountInDownbeat = (b % beatsPerMeasure) === 0;
                const beatNumInBar = (b % beatsPerMeasure) + 1;
                const label = b === 0 ? `Count-in ${beatNumInBar}` : `${beatNumInBar}`;
                ctx.fillStyle = isCountInDownbeat
                    ? "rgba(167, 243, 208, 0.72)"
                    : "rgba(148, 163, 184, 0.55)";
                ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(label, beatX + 8, labelBandTopY + 15);
            }
        }

        // Measure Chord Symbols (m >= 0)
        const chords = (song && song.chords) ? song.chords : ["G", "A", "Bm", "G"];
        for (let m = Math.max(0, startMeasure); m <= endMeasure; m++) {
            const measureTime = m * measureDuration;
            const barX = playheadX + (measureTime - songTimeOffset) * this.pixelsPerSecond;
            if (barX >= 0 && barX <= w) {
                const chordName = chords[m % chords.length];
                if (chordName) {
                    ctx.fillStyle = "rgba(226, 232, 240, 0.74)";
                    ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(chordName, barX + 9, labelBandTopY + 15);
                }
            }
        }

        ctx.restore();
    }

    drawStaffClef(ctx, hand, staffCenterY, staffSpacing, song = null) {
        ctx.save();
        ctx.fillStyle = "rgba(226, 232, 240, 0.16)";
        ctx.font = "54px Georgia, 'Times New Roman', serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const keySig = (song && typeof song.keySignature === "string") ? song.keySignature.trim() : "D";
        const sharpCountByKey = {
            C: 0, Am: 0,
            G: 1, Em: 1,
            D: 2, Bm: 2,
            A: 3, "F#m": 3,
            E: 4, "C#m": 4
        };
        const flatCountByKey = {
            F: 1, Dm: 1,
            Bb: 2, Gm: 2,
            Eb: 3, Cm: 3
        };
        const sharpOffsetsTreble = [-2.0, -0.5, -2.5, -1.0];
        const sharpOffsetsBass = [-1.0, 0.5, -1.5, 0.0];
        const flatOffsetsTreble = [0.0, -1.5, 0.5];
        const flatOffsetsBass = [1.0, -0.5, 1.5];

        const sharps = Object.prototype.hasOwnProperty.call(sharpCountByKey, keySig) ? sharpCountByKey[keySig] : 2;
        const flats = Object.prototype.hasOwnProperty.call(flatCountByKey, keySig) ? flatCountByKey[keySig] : 0;

        if (hand === "right") {
            ctx.fillText("𝄞", 16, staffCenterY - staffSpacing * 0.18);
        } else {
            ctx.fillText("𝄢", 16, staffCenterY - staffSpacing * 0.36);
        }

        let nextX = 52;
        if (sharps > 0) {
            const offsets = hand === "right" ? sharpOffsetsTreble : sharpOffsetsBass;
            ctx.font = "20px Georgia, 'Times New Roman', serif";
            ctx.fillStyle = "rgba(226, 232, 240, 0.18)";
            for (let i = 0; i < sharps; i++) {
                ctx.fillText("♯", nextX, staffCenterY + staffSpacing * offsets[i]);
                nextX += 9;
            }
            nextX += 6;
        } else if (flats > 0) {
            const offsets = hand === "right" ? flatOffsetsTreble : flatOffsetsBass;
            ctx.font = "20px Georgia, 'Times New Roman', serif";
            ctx.fillStyle = "rgba(226, 232, 240, 0.18)";
            for (let i = 0; i < flats; i++) {
                ctx.fillText("♭", nextX, staffCenterY + staffSpacing * offsets[i]);
                nextX += 9;
            }
            nextX += 6;
        } else {
            nextX = 56;
        }

        const timeSig = (song && Array.isArray(song.timeSignature) && song.timeSignature.length === 2)
            ? song.timeSignature
            : [(song && song.beatsPerMeasure) ? song.beatsPerMeasure : 4, 4];

        ctx.font = "600 21px Georgia, 'Times New Roman', serif";
        ctx.fillStyle = "rgba(226, 232, 240, 0.17)";
        ctx.fillText(String(timeSig[0]), nextX, staffCenterY - staffSpacing * 0.95);
        ctx.fillText(String(timeSig[1]), nextX, staffCenterY + staffSpacing * 0.98);
        ctx.restore();
    }

    drawClefs(ctx, trebleCenterY, bassCenterY, staffSpacing) {
        this.drawStaffClef(ctx, "right", trebleCenterY, staffSpacing);
        this.drawStaffClef(ctx, "left", bassCenterY, staffSpacing);
    }

    drawNotePills(ctx, notes, currentTime, playheadX, trebleCenterY, bassCenterY, staffSpacing, screenWidth, isWaiting = false, waitTargetNote = null, waitTargetChord = [], showAccuracy = true) {
        const pillHeight = staffSpacing * 1.32;
        const radius = pillHeight / 2;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();

        notes.forEach(note => {
            const noteStartSec = note.time;
            const noteDurSec = note.duration || 0.4;

            // Compute horizontal X position
            const x = playheadX + (noteStartSec - currentTime) * this.pixelsPerSecond;
            const width = Math.max(pillHeight + 8, noteDurSec * this.pixelsPerSecond);

            // Skip offscreen notes
            if (x + width < -50 || x > screenWidth + 50) return;

            const clef = note.clef || (note.pitch >= 60 ? "treble" : "bass");
            const staffCenter = (clef === "treble" || (clef === "auto" && note.pitch >= 60)) ? trebleCenterY : bassCenterY;
            const y = this.getNoteY(note.pitch, clef, trebleCenterY, bassCenterY, staffSpacing);

            // Draw subtle classical ledger lines when a note sits >= 1 staff space outside the 5 staff lines (e.g. Middle C4)
            const distFromCenter = y - staffCenter;
            if (Math.abs(distFromCenter) >= staffSpacing * 2.9) {
                const dir = distFromCenter > 0 ? 1 : -1;
                const maxLineIdx = Math.floor((Math.abs(distFromCenter) + 0.5) / staffSpacing);
                ctx.save();
                ctx.strokeStyle = "rgba(226, 232, 240, 0.22)";
                ctx.lineWidth = 1.0;
                for (let lineIdx = 3; lineIdx <= maxLineIdx; lineIdx++) {
                    const ly = staffCenter + dir * lineIdx * staffSpacing;
                    ctx.beginPath();
                    ctx.moveTo(x - 4, ly);
                    ctx.lineTo(x + Math.min(width, pillHeight + 8) + 4, ly);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Pitch & Finger Color Info (strictly preserving canonical 5-finger palette)
            const pitchIndex = ((note.pitch % 12) + 12) % 12;
            const noteLetter = this.noteNames[pitchIndex].replace("#", "♯");
            const fingerStyle = PianoFingeringEngine.getNoteFingerStyle(note);

            let gradTop = fingerStyle.light;
            let gradMid = fingerStyle.primary;
            let gradBot = fingerStyle.dark;
            let pillAlpha = 0.94;
            let strokeColor = "rgba(255, 255, 255, 0.28)";
            let textColor = "#FFFFFF";
            let isGhostMissed = false;

            // Subtle, non-punitive hit/miss styling when hand accuracy is active
            if (showAccuracy) {
                if (note.state === "correct") {
                    gradTop = "#84D9AE";
                    gradMid = "#52B788";
                    gradBot = "#358762";
                    pillAlpha = 0.92;
                    strokeColor = "rgba(209, 250, 229, 0.42)";
                } else if (note.state === "wrong") {
                    // Calm desaturated slate ghost capsule instead of harsh red
                    gradTop = "rgba(100, 116, 139, 0.34)";
                    gradMid = "rgba(71, 85, 105, 0.30)";
                    gradBot = "rgba(30, 41, 59, 0.36)";
                    pillAlpha = 0.76;
                    strokeColor = "rgba(148, 163, 184, 0.20)";
                    textColor = "rgba(203, 213, 225, 0.48)";
                    isGhostMissed = true;
                }
            }

            // Check if this note is part of the active wait target chord in Wait Mode
            const isWaitTarget = showAccuracy && isWaiting && note.state === "pending" && (
                (Array.isArray(waitTargetChord) && waitTargetChord.some((wn) => wn.index === note.index)) ||
                (waitTargetNote && Math.abs(waitTargetNote.time - note.time) <= 0.055)
            );

            // Draw Serene Breathing Wait Mode Halo
            if (isWaitTarget) {
                const pulse = 0.5 + 0.5 * Math.sin(now * 0.0042);
                const haloSpread = 3 + pulse * 3.5;
                ctx.save();
                ctx.globalAlpha = 0.36 + pulse * 0.32;
                ctx.strokeStyle = fingerStyle.light;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                this.drawPill(ctx, x - haloSpread / 2, y - (pillHeight + haloSpread) / 2, width + haloSpread, pillHeight + haloSpread, radius + haloSpread / 2);
                ctx.stroke();
                ctx.restore();
            }

            // Draw Satin Rounded Pill Capsule
            ctx.save();
            ctx.globalAlpha = pillAlpha;
            if (!isGhostMissed) {
                ctx.shadowColor = "rgba(5, 9, 16, 0.34)";
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 2;
            }
            ctx.beginPath();
            this.drawPill(ctx, x, y - pillHeight / 2, width, pillHeight, radius);

            const pillGrad = ctx.createLinearGradient(0, y - pillHeight / 2, 0, y + pillHeight / 2);
            pillGrad.addColorStop(0, gradTop);
            pillGrad.addColorStop(0.52, gradMid);
            pillGrad.addColorStop(1, gradBot);
            ctx.fillStyle = pillGrad;
            ctx.fill();

            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Delicate hairline outline
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            // Note Letter Text inside pill (crisp legibility across all 5 finger colors)
            ctx.save();
            ctx.fillStyle = textColor;
            if (!isGhostMissed) {
                ctx.shadowColor = "rgba(15, 23, 42, 0.62)";
                ctx.shadowBlur = 2.5;
                ctx.shadowOffsetY = 0.8;
            }
            ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(noteLetter, x + radius + 1, y + 0.3);
            ctx.restore();

            // Subtle Finger Badge (T, 1, 2, 3, 4) inside wider pills
            if (width >= pillHeight + 22) {
                const tagW = 15;
                const tagH = Math.max(12, pillHeight - 5);
                const tagX = x + radius * 2 + 2;
                const tagY = y - tagH / 2;
                ctx.save();
                ctx.fillStyle = isGhostMissed ? "rgba(15, 23, 42, 0.20)" : "rgba(15, 23, 42, 0.30)";
                ctx.beginPath();
                this.drawPill(ctx, tagX, tagY, tagW, tagH, tagH / 2);
                ctx.fill();
                ctx.fillStyle = textColor;
                ctx.font = "600 9.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(fingerStyle.diagramLabel, tagX + tagW / 2, y + 0.4);
                ctx.restore();
            }

            ctx.restore();
        });
    }

    /**
     * Groups a hand's notes into chronological onset clusters (simultaneous chord notes within 55 ms)
     * so each hand's 3D ball jumps cleanly from note-head to note-head in O(log N) per frame.
     */
    _getHandOnsetEvents(notes, hand) {
        if (!Array.isArray(notes) || notes.length === 0) return [];

        const firstRef = notes[0];
        const lastRef = notes[notes.length - 1];
        let cached = this._handEventsCache.get(notes);
        if (
            cached &&
            cached._sourceLen === notes.length &&
            cached._firstRef === firstRef &&
            cached._lastRef === lastRef &&
            cached[hand]
        ) {
            return cached[hand];
        }

        const handNotes = notes
            .filter((n) => n && Number.isFinite(n.time) && Number.isFinite(n.pitch) && this.getNoteHand(n) === hand)
            .sort((a, b) => a.time - b.time || a.pitch - b.pitch);

        const events = [];
        const chordWindowSec = 0.055;
        for (let i = 0; i < handNotes.length; i++) {
            const n = handNotes[i];
            const dur = Math.max(0.15, Number.isFinite(n.duration) ? n.duration : 0.4);
            const prev = events.length > 0 ? events[events.length - 1] : null;
            if (prev && (n.time - prev.time) <= chordWindowSec) {
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

        if (
            !cached ||
            cached._sourceLen !== notes.length ||
            cached._firstRef !== firstRef ||
            cached._lastRef !== lastRef
        ) {
            cached = {
                _sourceLen: notes.length,
                _firstRef: firstRef,
                _lastRef: lastRef
            };
            this._handEventsCache.set(notes, cached);
        }
        cached[hand] = events;
        return events;
    }

    /**
     * Resolves the vertical Y coordinate where the 3D sphere kisses the top of the note/chord head.
     */
    _resolveEventContactY(event, layout, ballRadius, minContactY, maxContactY) {
        const { trebleCenterY, bassCenterY, staffSpacing } = layout;
        const pillRadius = (staffSpacing * 1.35) / 2;
        let topNoteY = Infinity;
        for (let i = 0; i < event.notes.length; i++) {
            const n = event.notes[i];
            const clef = n.clef || (n.pitch >= 60 ? "treble" : "bass");
            const ny = this.getNoteY(n.pitch, clef, trebleCenterY, bassCenterY, staffSpacing);
            if (ny < topNoteY) {
                topNoteY = ny;
            }
        }
        const rawContactY = topNoteY - pillRadius - ballRadius + 0.5;
        return Math.max(minContactY, Math.min(maxContactY, rawContactY));
    }

    /**
     * Exact uniform-gravity parabolic trajectory between two note-head contact points (y0 -> y1)
     * at normalized horizontal/time fraction u in [0, 1].
     * Longer horizontal distance (distancePx) produces a longer, higher jump while respecting minApexY.
     */
    _parabolicArcY(y0, y1, u, distancePx, minApexY) {
        const clampedU = Math.max(0, Math.min(1, u));
        const d = Math.abs(y1 - y0);
        const yHigh = Math.min(y0, y1);
        const cRaw = 6 + 95 * (1 - Math.exp(-Math.max(0, distancePx) / 340));
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
     * Computes the physical 2D state of a staff's bouncing ball at `currentTime`.
     * - Horizontal speed in score space is strictly constant (`this.pixelsPerSecond`), keeping screen X at `playheadX`.
     * - Each hand's ball jumps smoothly and independently along a single parabolic arc from the head of its
     *   current note (`event[i].time`) to the head of its next note (`event[i+1].time`).
     * - The farther away the next note is, the longer the flight time (`dt`) and the higher the parabolic arc.
     */
    computeBallPosition(hand, notes, currentTime, layout = {}) {
        const staffSpacing = layout.staffSpacing || 14;
        const playheadX = Number.isFinite(layout.playheadX) ? layout.playheadX : this.getPlayheadX();
        const staffCenterY = Number.isFinite(layout.staffCenterY) ? layout.staffCenterY : 160;
        const bandY = Number.isFinite(layout.bandY) ? layout.bandY : (staffCenterY - staffSpacing * 6);
        const bandBottomY = Number.isFinite(layout.bandBottomY) ? layout.bandBottomY : (staffCenterY + staffSpacing * 6);
        const trebleCenterY = Number.isFinite(layout.trebleCenterY) ? layout.trebleCenterY : staffCenterY;
        const bassCenterY = Number.isFinite(layout.bassCenterY) ? layout.bassCenterY : staffCenterY;

        const ballRadius = Math.max(8.5, Math.min(11, staffSpacing * 0.68));
        const minApexY = bandY + ballRadius + 3;
        const minContactY = Math.min(bandBottomY - ballRadius - 4, bandY + ballRadius + 9);
        const maxContactY = Math.max(minContactY, bandBottomY - ballRadius - 4);

        const resolvedLayout = { trebleCenterY, bassCenterY, staffSpacing };
        const events = this._getHandOnsetEvents(notes, hand);

        // 1. No notes on this hand's staff: rest calmly without vibrating
        if (events.length === 0) {
            const idleY = Math.max(minContactY, Math.min(maxContactY, staffCenterY - staffSpacing * 2.2));
            return {
                x: playheadX,
                y: idleY,
                radius: ballRadius,
                inFlight: false,
                jumpDuration: 0,
                jumpDistancePx: 0,
                contactProximity: 0
            };
        }

        // 2. Pre-roll / count-in or delayed hand entrance before this hand's first note
        const firstEvent = events[0];
        if (currentTime <= firstEvent.time) {
            const firstY = this._resolveEventContactY(firstEvent, resolvedLayout, ballRadius, minContactY, maxContactY);
            const defaultLeadStart = Math.min(0, firstEvent.time - 2.4);
            const launchTime = Math.min(
                firstEvent.time,
                Number.isFinite(layout.startTime) ? layout.startTime : defaultLeadStart
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

        // 3. After the final note head on this hand's staff: gentle single settle onto final note, then calm rest
        const lastEvent = events[events.length - 1];
        if (currentTime >= lastEvent.time) {
            const lastY = this._resolveEventContactY(lastEvent, resolvedLayout, ballRadius, minContactY, maxContactY);
            const settleEnd = Math.max(lastEvent.time + 0.25, lastEvent.endTime);
            const dtSettle = settleEnd - lastEvent.time;
            if (currentTime < settleEnd && dtSettle > 1e-4) {
                const u = (currentTime - lastEvent.time) / dtSettle;
                const cSettle = Math.min(8, Math.max(2, lastY - minApexY));
                const y = lastY - 4 * cSettle * u * (1 - u);
                const timeSinceImpact = currentTime - lastEvent.time;
                return {
                    x: playheadX,
                    y,
                    radius: ballRadius,
                    inFlight: true,
                    jumpDuration: dtSettle,
                    jumpDistancePx: dtSettle * this.pixelsPerSecond,
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
                contactProximity: 0
            };
        }

        // 4. Active jump between consecutive note heads (events[i] -> events[i + 1]) via O(log N) binary search
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
        const idx = Math.max(0, Math.min(events.length - 2, lo));
        const e0 = events[idx];
        const e1 = events[idx + 1];
        const y0 = this._resolveEventContactY(e0, resolvedLayout, ballRadius, minContactY, maxContactY);
        const y1 = this._resolveEventContactY(e1, resolvedLayout, ballRadius, minContactY, maxContactY);

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

    drawBandPlayhead(ctx, playheadX, topY, bottomY, staffCenterY, currentTime, currentBpm, isEnabled = true, jumpContext = null) {
        ctx.save();

        if (!isEnabled) {
            ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(playheadX, topY);
            ctx.lineTo(playheadX, bottomY);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // 1. Whisper-soft pearl playhead light veil
        const glowWidth = 24;
        const glowGrad = ctx.createLinearGradient(playheadX - glowWidth, 0, playheadX + glowWidth, 0);
        glowGrad.addColorStop(0, "rgba(226, 232, 240, 0)");
        glowGrad.addColorStop(0.5, "rgba(226, 232, 240, 0.048)");
        glowGrad.addColorStop(1, "rgba(226, 232, 240, 0)");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(playheadX - glowWidth, topY, glowWidth * 2, bottomY - topY);

        // 2. Slender Alabaster Playhead Vertical Beam
        const lineGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
        lineGrad.addColorStop(0, "rgba(241, 245, 249, 0.12)");
        lineGrad.addColorStop(0.2, "rgba(241, 245, 249, 0.52)");
        lineGrad.addColorStop(0.8, "rgba(241, 245, 249, 0.52)");
        lineGrad.addColorStop(1, "rgba(241, 245, 249, 0.12)");
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, topY);
        ctx.lineTo(playheadX, bottomY);
        ctx.stroke();

        // 3. Independent 3D Alabaster Sphere jumping smoothly from note head to note head
        if (jumpContext && jumpContext.hand) {
            const ball = this.computeBallPosition(jumpContext.hand, jumpContext.notes || [], currentTime, {
                playheadX,
                bandY: topY,
                bandBottomY: bottomY,
                staffCenterY,
                trebleCenterY: jumpContext.trebleCenterY,
                bassCenterY: jumpContext.bassCenterY,
                staffSpacing: jumpContext.staffSpacing,
                startTime: jumpContext.startTime
            });
            this.draw3DSphere(ctx, ball.x, ball.y, ball.radius, ball.contactProximity);
        } else {
            this.draw3DSphere(ctx, playheadX, staffCenterY - 28, 10.0, 0);
        }

        ctx.restore();
    }

    drawPlayhead(ctx, playheadX, topY, bottomY, trebleCenterY, bassCenterY, currentTime, currentBpm, notes = []) {
        const midY = (topY + bottomY) / 2;
        this.drawBandPlayhead(ctx, playheadX, topY, midY, trebleCenterY, currentTime, currentBpm, this.activeHands.right, {
            hand: "right",
            notes,
            trebleCenterY,
            bassCenterY,
            staffSpacing: 14
        });
        this.drawBandPlayhead(ctx, playheadX, midY, bottomY, bassCenterY, currentTime, currentBpm, this.activeHands.left, {
            hand: "left",
            notes,
            trebleCenterY,
            bassCenterY,
            staffSpacing: 14
        });
    }

    draw3DSphere(ctx, x, y, radius, contactProximity = 0) {
        ctx.save();

        // Delicate pearl-sage aura right as the sphere touches a note head
        if (contactProximity > 0.01) {
            const haloRadius = radius + 2.5 + contactProximity * 3.5;
            const haloGrad = ctx.createRadialGradient(x, y, radius * 0.45, x, y, haloRadius);
            haloGrad.addColorStop(0, `rgba(186, 230, 211, ${(0.28 * contactProximity).toFixed(3)})`);
            haloGrad.addColorStop(1, "rgba(186, 230, 211, 0)");
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(x, y, haloRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Crisp ambient depth shadow on the 3D sphere itself
        ctx.shadowColor = "rgba(5, 10, 18, 0.48)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        // 3D Shaded Alabaster Pearl Orb
        const sphereGrad = ctx.createRadialGradient(
            x - radius * 0.32, y - radius * 0.32, radius * 0.1,
            x, y, radius
        );
        sphereGrad.addColorStop(0, "#FFFFFF");
        sphereGrad.addColorStop(0.55, "#E8EDF3");
        sphereGrad.addColorStop(0.9, "#CBD5E1");
        sphereGrad.addColorStop(1, "#94A3B8");

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = sphereGrad;
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = contactProximity > 0.25
            ? `rgba(209, 250, 229, ${(0.65 + 0.25 * contactProximity).toFixed(3)})`
            : "rgba(255, 255, 255, 0.78)";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.restore();
    }

    drawPill(ctx, x, y, width, height, radius) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, width, height, radius);
        } else {
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        }
    }

    drawTopBar(ctx, w, h, score, streak, multiplier, isWaiting = false, waitTargetNote = null, waitTargetChord = [], leadInState = null) {
        ctx.save();

        // Sleek translucent conservatory HUD header
        ctx.fillStyle = "rgba(10, 14, 21, 0.76)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
        ctx.fillRect(0, h - 1, w, 1);

        // 1. Minimal Multiplier Capsule on Left (e.g. "2×" with 4 delicate streak dots)
        const badgeX = 18;
        const badgeY = (h - 26) / 2;
        const badgeW = 68;
        const badgeH = 26;

        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        this.drawPill(ctx, badgeX, badgeY, badgeW, badgeH, 13);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.11)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 12.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
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

        // Single-Hand Practice Indicator Pill next to Multiplier when one or both hands are toggled off
        const hands = (leadInState && leadInState.activeHands) ? leadInState.activeHands : this.activeHands;
        if (hands && (!hands.left || !hands.right)) {
            ctx.save();
            const handText = hands.left && !hands.right
                ? "Left Hand Only"
                : (!hands.left && hands.right ? "Right Hand Only" : "Hands Muted");
            const handAccent = hands.left && !hands.right
                ? "rgba(125, 211, 252, 0.85)"
                : (!hands.left && hands.right ? "rgba(134, 239, 172, 0.85)" : "rgba(148, 163, 184, 0.78)");
            const handBorder = hands.left && !hands.right
                ? "rgba(125, 211, 252, 0.28)"
                : (!hands.left && hands.right ? "rgba(134, 239, 172, 0.28)" : "rgba(148, 163, 184, 0.22)");
            const pillX = badgeX + badgeW + 10;
            const pillY = (h - 24) / 2;
            const pillW = 114;
            const pillH = 24;

            ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
            ctx.beginPath();
            this.drawPill(ctx, pillX, pillY, pillW, pillH, 12);
            ctx.fill();
            ctx.strokeStyle = handBorder;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = handAccent;
            ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(handText, pillX + pillW / 2, pillY + pillH / 2);
            ctx.restore();
        }

        // Center: Understated Wait Mode Target Pill OR Empty-Beat Count-In Pill
        if (isWaiting && waitTargetNote) {
            const activeChord = Array.isArray(waitTargetChord) && waitTargetChord.length > 0
                ? [...waitTargetChord].sort((a, b) => a.pitch - b.pitch)
                : [waitTargetNote];

            const seenPitches = new Set();
            const chordSegments = [];
            for (const n of activeChord) {
                if (seenPitches.has(n.pitch)) continue;
                seenPitches.add(n.pitch);
                const pi = ((n.pitch % 12) + 12) % 12;
                const oct = Math.floor(n.pitch / 12) - 1;
                const fStyle = PianoFingeringEngine.getNoteFingerStyle(n);
                chordSegments.push({
                    label: `${this.noteNames[pi]}${oct}(${fStyle.diagramLabel})`.replace("#", "♯"),
                    color: fStyle.light
                });
            }

            const targetNamePlain = chordSegments.map((s) => s.label).join(" + ");
            const extraW = Math.max(0, (targetNamePlain.length - 5) * 7.2);
            const bannerW = 196 + extraW;
            const bannerH = 26;
            const bannerX = (w - bannerW) / 2;
            const bannerY = (h - bannerH) / 2;

            ctx.fillStyle = "rgba(15, 21, 31, 0.85)";
            ctx.beginPath();
            this.drawPill(ctx, bannerX, bannerY, bannerW, bannerH, 13);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = "#94A3B8";
            ctx.font = "500 11.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("Wait · Play", bannerX + 14, bannerY + bannerH / 2);

            let cursorX = bannerX + 82;
            ctx.font = "600 12.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            chordSegments.forEach((seg, idx) => {
                if (idx > 0) {
                    ctx.fillStyle = "#64748B";
                    ctx.fillText(" + ", cursorX, bannerY + bannerH / 2);
                    cursorX += ctx.measureText ? ctx.measureText(" + ").width : 18;
                }
                ctx.fillStyle = seg.color;
                ctx.fillText(seg.label, cursorX, bannerY + bannerH / 2);
                cursorX += ctx.measureText ? ctx.measureText(seg.label).width : seg.label.length * 7.8;
            });
        } else if (
            leadInState &&
            leadInState.secondsPerBeat > 0 &&
            leadInState.currentTime < leadInState.firstNoteTime - 0.02
        ) {
            const totalLeadInSec = Math.max(0, leadInState.firstNoteTime - leadInState.startTime);
            const totalBeats = Math.max(1, Math.round(totalLeadInSec / leadInState.secondsPerBeat));
            const beatsRemaining = Math.max(
                1,
                Math.min(totalBeats, Math.ceil((leadInState.firstNoteTime - leadInState.currentTime) / leadInState.secondsPerBeat))
            );
            const borderTint = leadInState.isPlaying
                ? (beatsRemaining === 1 ? "rgba(233, 213, 161, 0.35)" : "rgba(134, 239, 172, 0.28)")
                : "rgba(255, 255, 255, 0.12)";
            const textTint = leadInState.isPlaying
                ? (beatsRemaining === 1 ? "#E9D5A1" : "#A7F3D0")
                : "#CBD5E1";

            const bannerW = leadInState.isPlaying ? 160 : 196;
            const bannerH = 26;
            const bannerX = (w - bannerW) / 2;
            const bannerY = (h - bannerH) / 2;

            ctx.fillStyle = "rgba(15, 21, 31, 0.78)";
            ctx.beginPath();
            this.drawPill(ctx, bannerX, bannerY, bannerW, bannerH, 13);
            ctx.fill();
            ctx.strokeStyle = borderTint;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = textTint;
            ctx.font = "500 11.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            if (leadInState.isPlaying) {
                ctx.fillText(`Count-in  ·  ${beatsRemaining}`, bannerX + bannerW / 2, bannerY + bannerH / 2);
            } else {
                ctx.fillText(`Ready  ·  ${totalBeats}-beat lead-in`, bannerX + bannerW / 2, bannerY + bannerH / 2);
            }
        }

        // 2. Poised Tabular Ivory Score & Subtle Streak on Top Right
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 15.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        const formattedScore = (score || 0).toLocaleString("en-US");
        ctx.fillText(formattedScore, w - 22, 18);

        ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
        ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
        ctx.fillText(`Streak ${streak || 0}`, w - 22, 32);

        ctx.restore();
    }

    renderEffects(ctx) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const layout = this._lastLayout;
        const playheadX = this.getPlayheadX();

        // 1. Render Subtle Off-Target Pitch Ghost Marks (calm sight-reading cue, zero red!)
        for (let i = this.ghostMarks.length - 1; i >= 0; i--) {
            const gm = this.ghostMarks[i];
            const elapsed = now - gm.createdAt;
            const dur = gm.duration || 380;
            if (elapsed > dur) {
                this.ghostMarks.splice(i, 1);
                continue;
            }
            const progress = elapsed / dur;
            const alpha = 0.36 * (1 - progress) * (1 - progress);
            const gy = layout
                ? this.getNoteY(gm.pitch, gm.clef, layout.trebleCenterY, layout.bassCenterY, layout.staffSpacing)
                : (gm.isTreble ? (this.height || 400) * 0.30 : (this.height || 400) * 0.70);
            const gw = 18;
            const gh = layout ? Math.max(10, layout.staffSpacing * 0.92) : 12;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
            ctx.strokeStyle = "rgba(214, 204, 194, 0.72)";
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            this.drawPill(ctx, playheadX - gw / 2, gy - gh / 2, gw, gh, gh / 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 2. Render Delicate Concentric Note-Hit Ripples
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const rp = this.ripples[i];
            const elapsed = now - rp.createdAt;
            const dur = rp.duration || 440;
            if (elapsed > dur) {
                this.ripples.splice(i, 1);
                continue;
            }
            const t = elapsed / dur;
            const easeOut = 1 - Math.pow(1 - t, 2.4);
            const radius = 8 + easeOut * 14;
            const alpha = 0.38 * (1 - t);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = rp.color;
            ctx.lineWidth = 1.15;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. Render Fine Luminous Dust Motes
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

        // 4. Render Whisper Micro-Typography Labels (Perfect / Early / Late — never Wrong/Missed)
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
            const alpha = 0.74 * fadeIn * fadeOut;
            const liftY = hit.y - t * 6;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = hit.color;
            ctx.font = "600 10.5px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(hit.text).toUpperCase(), hit.x, liftY);
            ctx.restore();
        }
    }

    lightenColor(hex, percent) {
        return hex; // Browser canvas handles solid colors smoothly
    }

    darkenColor(hex, percent) {
        return hex;
    }
}
