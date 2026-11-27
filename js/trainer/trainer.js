/**
 * Acoustic Sound & Data Trainer Controller (61-Key Piano & G-C-E-A Ukulele)
 * =========================================================================
 * Guides the user step-by-step through acoustic WAV data collection with play-along
 * reference tones/strums, synchronized countdown metronome, instrument-aware mini
 * visualizer (61-key keyboard OR 4-string ukulele fretboard diagram), live audio
 * level meter, instant playback review, and live server recalibration.
 */

import { DATASET_STEPS, CATEGORIES } from "./curriculum.js";
import { UKULELE_TRAINING_CURRICULUM, UKULELE_DATASET_CATEGORIES } from "./ukulele_curriculum.js";
import { AudioDatasetRecorder } from "./recorder.js";
import { DatasetStorage } from "./storage.js";

const UKULELE_FINGER_COLORS = {
    0: "#48A870", // Open — Calm Sage
    1: "#F0C830", // Index — Warm Gold
    2: "#6848F8", // Middle — Indigo
    3: "#4090F8", // Ring — Azure
    4: "#E86078"  // Pinky — Muted Rose
};

const UKULELE_TAB_STRINGS = [
    { tabIndex: 0, chordIndex: 3, name: "A4", letter: "A", openMidi: 69 },
    { tabIndex: 1, chordIndex: 2, name: "E4", letter: "E", openMidi: 64 },
    { tabIndex: 2, chordIndex: 1, name: "C4", letter: "C", openMidi: 60 },
    { tabIndex: 3, chordIndex: 0, name: "G4", letter: "G", openMidi: 67 }
];

function _injectUkuleleDiagramFallbackStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById("uku-trainer-diagram-styles")) return;
    const style = document.createElement("style");
    style.id = "uku-trainer-diagram-styles";
    style.textContent = `
        .uku-trainer-diagram {
            width: 100%;
            background: #0F131C;
            border: 1px solid rgba(226, 201, 138, 0.16);
            border-radius: 10px;
            padding: 10px 12px 12px;
            box-sizing: border-box;
            color: #F1F5F9;
        }
        .uku-trainer-diagram-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 11px;
            color: #94A3B8;
        }
        .uku-trainer-diagram-badge {
            font-weight: 600;
            color: #E2C98A;
            letter-spacing: 0.02em;
        }
        .uku-trainer-diagram-strum {
            font-size: 10.5px;
            padding: 2px 8px;
            border-radius: 999px;
            background: rgba(226, 201, 138, 0.10);
            border: 1px solid rgba(226, 201, 138, 0.22);
            color: #E9D5A1;
        }
        .uku-trainer-fret-header {
            display: grid;
            align-items: center;
            margin-bottom: 4px;
            padding-left: 34px;
            font-size: 10px;
            color: #64748B;
            text-align: center;
        }
        .uku-trainer-grid {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .uku-trainer-string-row {
            display: grid;
            align-items: center;
            position: relative;
            height: 22px;
        }
        .uku-trainer-string-label {
            font-size: 10.5px;
            font-weight: 600;
            color: #CBD5E1;
            width: 34px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .uku-trainer-nut-status {
            font-size: 10px;
            width: 14px;
            text-align: center;
            color: #64748B;
        }
        .uku-trainer-nut-status.is-open {
            color: #48A870;
            font-weight: 700;
        }
        .uku-trainer-cells {
            display: grid;
            flex: 1;
            position: relative;
            height: 22px;
            border-left: 3px solid rgba(226, 201, 138, 0.48);
            background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.005));
            border-radius: 0 4px 4px 0;
        }
        .uku-trainer-string-wire {
            position: absolute;
            left: 0;
            right: 0;
            top: 50%;
            height: 1.5px;
            transform: translateY(-50%);
            background: rgba(228, 224, 214, 0.28);
            pointer-events: none;
        }
        .uku-trainer-cell {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid rgba(228, 224, 214, 0.14);
            cursor: pointer;
            z-index: 1;
        }
        .uku-trainer-dot {
            width: 17px;
            height: 17px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 700;
            color: #0B0E14;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
        }
        .uku-trainer-silence-note {
            text-align: center;
            padding: 14px 8px;
            font-size: 12px;
            color: #94A3B8;
        }
    `;
    document.head.appendChild(style);
}

export class SoundCollectionTrainer {
    constructor(synth, keyboard, mic, options = {}) {
        this.synth = synth;
        this.keyboard = keyboard;
        this.mic = mic;
        this.onProgressUpdate = options.onProgressUpdate || null;
        this.onProfileUpdated = options.onProfileUpdated || null;

        this.instrument = options.instrument === "ukulele" ? "ukulele" : "piano";
        this.storage = new DatasetStorage(this.instrument);
        this.recorder = new AudioDatasetRecorder(this.synth ? this.synth.ctx : null);

        // Instrument-specific curricula
        this.pianoSteps = [...DATASET_STEPS];
        this.pianoCategories = [...CATEGORIES];
        this.ukuleleSteps = [...UKULELE_TRAINING_CURRICULUM];
        this.ukuleleCategories = [...UKULELE_DATASET_CATEGORIES];

        // Active curriculum state
        this.steps = this.instrument === "ukulele" ? [...this.ukuleleSteps] : [...this.pianoSteps];
        this.categories = this.instrument === "ukulele" ? [...this.ukuleleCategories] : [...this.pianoCategories];
        this.activeCategory = "all";
        this.filteredSteps = [...this.steps];
        this.currentStepIdx = 0; // Index in filteredSteps

        // Workflow state
        this.isOpen = false;
        this.isCountingDown = false;
        this.isRecording = false;
        this.autoAdvance = true;
        this.playReferenceOnBeat = false;
        this.autoAdvanceTimeout = null;
        this.countdownInterval = null;
        this.recordingTimeout = null;

        // UI references
        this.dom = {};

        this.init();
    }

    init() {
        this.bindRecorderEvents();
        this.updateTotalProgressBadge();
    }

    /**
     * Hot-swap between `"piano"` (61-key 28 steps) and `"ukulele"` (G-C-E-A 28 steps).
     */
    setInstrument(instrument, { synth, keyboard, steps, categories } = {}) {
        const nextMode = instrument === "ukulele" ? "ukulele" : "piano";

        this.stopAutoAdvanceTimer();
        this.abortRecording();
        this.clearActiveHighlights();

        this.instrument = nextMode;
        if (synth !== undefined) {
            this.synth = synth;
            if (synth && synth.ctx) {
                this.recorder.setAudioContext(synth.ctx);
            }
        }
        if (keyboard !== undefined) {
            this.keyboard = keyboard;
        }

        this.storage.setInstrument(nextMode);

        if (Array.isArray(steps) && steps.length > 0) {
            this.steps = [...steps];
        } else {
            this.steps = nextMode === "ukulele" ? [...this.ukuleleSteps] : [...this.pianoSteps];
        }

        if (Array.isArray(categories) && categories.length > 0) {
            this.categories = [...categories];
        } else {
            this.categories = nextMode === "ukulele" ? [...this.ukuleleCategories] : [...this.pianoCategories];
        }

        this.activeCategory = "all";
        this.filteredSteps = [...this.steps];
        this.currentStepIdx = 0;

        if (this.dom.modal) {
            this._refreshModalInstrumentChrome();
            if (this.isOpen) {
                this.renderActiveStep();
                this.renderStepGrid();
            }
        }

        this.updateTotalProgressBadge();
        this.syncWithServer();
        return this.instrument;
    }

    async syncWithServer() {
        const summary = await this.storage.fetchServerSummary();
        if (summary) {
            this.updateTotalProgressBadge();
            if (this.isOpen && this.dom.modal) {
                this.renderActiveStep();
                this.renderStepGrid();
            }
        }
        return summary;
    }

    _getInstrumentHeaderCopy() {
        if (this.instrument === "ukulele") {
            return {
                title: "Ukulele Acoustic Data Trainer (G-C-E-A)",
                subtitle: "Standard High-G 4-String Calibration (Open G4-C4-E4-A4 · Frets 0–12 · Chords & Unisons)",
                recalBtn: "Recalibrate Ukulele Detector",
                recalBusy: "Calibrating Ukulele…"
            };
        }
        return {
            title: "61-Key Piano Sound & Data Trainer",
            subtitle: "Aligned for 61-key keyboard (5 octaves: Key #1 C2 to Key #61 C7 · Middle C = Key #25)",
            recalBtn: "Recalibrate Detector",
            recalBusy: "Calibrating 61 Keys…"
        };
    }

    _refreshModalInstrumentChrome() {
        const copy = this._getInstrumentHeaderCopy();
        if (this.dom.mainTitle) this.dom.mainTitle.textContent = copy.title;
        if (this.dom.mainSubtitle) this.dom.mainSubtitle.textContent = copy.subtitle;
        if (this.dom.btnRecalibrateDetector && !this.dom.btnRecalibrateDetector.disabled) {
            this.dom.btnRecalibrateDetector.innerHTML = `<span>${copy.recalBtn}</span>`;
        }
        if (this.dom.categoryBar) {
            this.dom.categoryBar.innerHTML = this.categories
                .map(
                    (c) => `
                <button class="cat-pill ${c.id === this.activeCategory ? "active" : ""}" data-cat="${c.id}">${c.label}</button>
            `
                )
                .join("");
        }
    }

    bindRecorderEvents() {
        this.recorder.onAudioLevel = (rms) => {
            if (this.dom.ringWave) {
                const scale = 1 + Math.min(0.6, rms * 3.5);
                this.dom.ringWave.style.transform = `scale(${scale})`;
                this.dom.ringWave.style.opacity = Math.min(1, 0.3 + rms * 3);
            }
            if (this.dom.liveLevelBar) {
                const pct = Math.min(100, Math.round(rms * 400));
                this.dom.liveLevelBar.style.width = `${pct}%`;
            }
        };

        this.recorder.onPlaybackEnd = () => {
            if (this.dom.btnPlayRecording) {
                this.dom.btnPlayRecording.innerHTML = "<span>▶ Listen to Recording</span>";
                this.dom.btnPlayRecording.classList.remove("playing");
            }
        };
    }

    /**
     * Build and inject the Trainer Modal DOM
     */
    mountModal() {
        if (typeof document === "undefined") return;
        if (document.getElementById("trainerModal")) return;

        const copy = this._getInstrumentHeaderCopy();
        const modalOverlay = document.createElement("div");
        modalOverlay.id = "trainerModal";
        modalOverlay.className = "trainer-modal-overlay";
        modalOverlay.style.display = "none";

        modalOverlay.innerHTML = `
            <div class="trainer-modal-card">
                <!-- Header -->
                <div class="trainer-header">
                    <div class="trainer-header-left">
                        <span class="trainer-badge-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M2 12h3l2.5-6 4 12 3.5-9 2.5 3H22"></path>
                            </svg>
                        </span>
                        <div>
                            <div class="trainer-title-row">
                                <h2 id="trainerMainTitle" class="trainer-main-title">${copy.title}</h2>
                                <span id="trainerStepPill" class="trainer-step-pill">Step 1 of ${this.steps.length}</span>
                            </div>
                            <p id="trainerMainSubtitle" class="trainer-subtitle">${copy.subtitle}</p>
                        </div>
                    </div>
                    <div class="trainer-header-right">
                        <div class="trainer-global-progress">
                            <span id="trainerProgressText" class="progress-label">0 / ${this.steps.length} (0%)</span>
                            <div class="progress-track">
                                <div id="trainerProgressBar" class="progress-fill" style="width: 0%;"></div>
                            </div>
                        </div>
                        <button id="btnTrainerClose" class="btn-trainer-close" title="Close Trainer (Esc)">✕</button>
                    </div>
                </div>

                <!-- Category Filters Bar -->
                <div class="trainer-cat-bar" id="trainerCategoryBar">
                    ${this.categories
                        .map(
                            (c) => `
                        <button class="cat-pill ${c.id === "all" ? "active" : ""}" data-cat="${c.id}">${c.label}</button>
                    `
                        )
                        .join("")}
                </div>

                <!-- Main Active Step Arena -->
                <div class="trainer-arena">
                    <!-- Left: Target Visualizer & Card -->
                    <div class="trainer-target-card">
                        <div class="target-card-header">
                            <span id="targetCatTag" class="target-cat-tag">Single Notes</span>
                            <span id="targetStatusBadge" class="target-status-badge pending">Not Recorded</span>
                        </div>

                        <div class="target-hero">
                            <div id="targetNotesContainer" class="target-notes-row">
                                <!-- Populated with note capsules -->
                            </div>
                            <h3 id="targetStepTitle" class="target-step-title">Middle C (C4)</h3>
                            <p id="targetStepSub" class="target-step-sub">MIDI 60 · 261.63 Hz</p>
                        </div>

                        <div class="target-instruction-box">
                            <span class="instruction-icon" aria-hidden="true">›</span>
                            <p id="targetInstruction" class="instruction-text">Play the target cleanly and let it ring.</p>
                        </div>

                        <div id="targetTipBox" class="target-tip-box">
                            <span class="tip-label">Acoustic Note:</span>
                            <span id="targetTipText" class="tip-text">Calibrates acoustic response and concert pitch reference.</span>
                        </div>

                        <!-- Mini Instrument Preview (61-Key Keyboard OR 4-String Ukulele Diagram) -->
                        <div class="mini-keys-preview" id="miniKeysPreview">
                            <!-- Rendered dynamically per instrument -->
                        </div>
                    </div>

                    <!-- Right: Interactive Play-Along Recording Console -->
                    <div class="trainer-console">
                        <!-- Playback & Audio Controls -->
                        <div class="console-action-zone">
                            <!-- Circular Visualizer & Countdown Ring -->
                            <div class="countdown-stage" id="countdownStage">
                                <div class="ring-wave" id="ringWave"></div>
                                <svg class="countdown-svg" viewBox="0 0 120 120">
                                    <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
                                    <circle id="countdownRingCircle" class="ring-fg" cx="60" cy="60" r="52"></circle>
                                </svg>
                                <div class="countdown-center">
                                    <span id="countdownNumber" class="countdown-num">3</span>
                                    <span id="countdownStatus" class="countdown-label">READY</span>
                                </div>
                            </div>

                            <!-- Big Trigger Action Button -->
                            <div class="console-buttons-row">
                                <button id="btnPlayRefTone" class="btn-console-secondary" title="Play audible reference tone (P)">
                                    <span>Hear Reference</span>
                                </button>
                                <button id="btnStartPlayAlong" class="btn-console-primary" title="Start play-along countdown &amp; record (Space)">
                                    <span id="btnPlayAlongIcon">▶</span>
                                    <span id="btnPlayAlongText">Start Step (Play-Along)</span>
                                </button>
                            </div>

                            <!-- Live Audio Level Meter -->
                            <div class="live-level-wrap" id="liveLevelWrap" style="opacity: 0;">
                                <span class="level-label">Mic Input Level</span>
                                <div class="level-meter-track">
                                    <div id="liveLevelBar" class="level-meter-fill"></div>
                                </div>
                            </div>

                            <!-- Post-Recording Review Card -->
                            <div id="recordReviewCard" class="review-card" style="display: none;">
                                <div class="review-header">
                                    <span class="review-check" aria-hidden="true">✓</span>
                                    <div class="review-details">
                                        <h4 id="reviewTitle" class="review-title">Sample Captured</h4>
                                        <p id="reviewStats" class="review-stats">WAV 16-bit · 2.2s · RMS: 0.12</p>
                                    </div>
                                    <button id="btnReRecord" class="btn-small-re-record" title="Record this step again">
                                        <span>↻ Re-record</span>
                                    </button>
                                </div>

                                <div class="review-player-row">
                                    <button id="btnPlayRecording" class="btn-pill-play" title="Listen to your recording">
                                        <span>▶ Listen to Recording</span>
                                    </button>
                                </div>
                            </div>

                            <!-- Options Checkboxes -->
                            <div class="console-options-row">
                                <label class="checkbox-label" title="Automatically advance to the next step after a successful recording">
                                    <input type="checkbox" id="chkAutoAdvance" checked>
                                    <span>Auto-advance after recording</span>
                                </label>
                                <label class="checkbox-label" title="Play the synthetic reference tone simultaneously during recording (keep unchecked for clean acoustic recordings)">
                                    <input type="checkbox" id="chkPlayRefOnBeat">
                                    <span>Play reference with beat</span>
                                </label>
                            </div>
                        </div>

                        <!-- Step Navigation Bar -->
                        <div class="step-nav-bar">
                            <button id="btnPrevStep" class="btn-step-nav" title="Previous Step (←)">
                                <span>← Previous</span>
                            </button>
                            <span id="stepCounterText" class="step-counter-text">Step 1 / ${this.steps.length}</span>
                            <button id="btnNextStep" class="btn-step-nav" title="Next Step (→)">
                                <span>Next Step →</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Bottom Step Drawer / Grid -->
                <div class="trainer-drawer">
                    <div class="drawer-header">
                        <div class="drawer-header-left">
                            <span class="drawer-toggle-icon" aria-hidden="true">≡</span>
                            <span class="drawer-title">Step Navigator &amp; Dataset Checklist</span>
                            <span id="drawerRecordedCount" class="drawer-recorded-count">0 Recorded</span>
                        </div>
                        <div class="drawer-header-actions">
                            <button id="btnRecalibrateDetector" class="btn-drawer-action" title="Re-build calibrated acoustic profile from your recorded WAV samples">
                                <span>${copy.recalBtn}</span>
                            </button>
                            <button id="btnDownloadDataset" class="btn-drawer-action" title="Download all recorded WAV files as a ZIP package">
                                <span>Download Dataset (.zip)</span>
                            </button>
                            <button id="btnExportManifest" class="btn-drawer-action" title="Download metadata manifest JSON">
                                <span>Export Manifest</span>
                            </button>
                            <button id="btnResetDataset" class="btn-drawer-danger" title="Clear all recorded samples for the current instrument">
                                <span>Reset</span>
                            </button>
                        </div>
                    </div>

                    <!-- Step Grid Pills -->
                    <div class="step-grid" id="stepGrid">
                        <!-- Populated dynamically -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        this.cacheDomElements();
        this.bindEvents();
    }

    cacheDomElements() {
        this.dom = {
            modal: document.getElementById("trainerModal"),
            mainTitle: document.getElementById("trainerMainTitle"),
            mainSubtitle: document.getElementById("trainerMainSubtitle"),
            btnClose: document.getElementById("btnTrainerClose"),
            categoryBar: document.getElementById("trainerCategoryBar"),
            stepPill: document.getElementById("trainerStepPill"),
            progressText: document.getElementById("trainerProgressText"),
            progressBar: document.getElementById("trainerProgressBar"),
            targetCatTag: document.getElementById("targetCatTag"),
            targetStatusBadge: document.getElementById("targetStatusBadge"),
            targetNotesContainer: document.getElementById("targetNotesContainer"),
            targetStepTitle: document.getElementById("targetStepTitle"),
            targetStepSub: document.getElementById("targetStepSub"),
            targetInstruction: document.getElementById("targetInstruction"),
            targetTipBox: document.getElementById("targetTipBox"),
            targetTipText: document.getElementById("targetTipText"),
            miniKeysPreview: document.getElementById("miniKeysPreview"),
            countdownStage: document.getElementById("countdownStage"),
            ringWave: document.getElementById("ringWave"),
            countdownRingCircle: document.getElementById("countdownRingCircle"),
            countdownNumber: document.getElementById("countdownNumber"),
            countdownStatus: document.getElementById("countdownStatus"),
            btnPlayRefTone: document.getElementById("btnPlayRefTone"),
            btnStartPlayAlong: document.getElementById("btnStartPlayAlong"),
            btnPlayAlongIcon: document.getElementById("btnPlayAlongIcon"),
            btnPlayAlongText: document.getElementById("btnPlayAlongText"),
            liveLevelWrap: document.getElementById("liveLevelWrap"),
            liveLevelBar: document.getElementById("liveLevelBar"),
            recordReviewCard: document.getElementById("recordReviewCard"),
            reviewTitle: document.getElementById("reviewTitle"),
            reviewStats: document.getElementById("reviewStats"),
            btnReRecord: document.getElementById("btnReRecord"),
            btnPlayRecording: document.getElementById("btnPlayRecording"),
            chkAutoAdvance: document.getElementById("chkAutoAdvance"),
            chkPlayRefOnBeat: document.getElementById("chkPlayRefOnBeat"),
            btnPrevStep: document.getElementById("btnPrevStep"),
            btnNextStep: document.getElementById("btnNextStep"),
            stepCounterText: document.getElementById("stepCounterText"),
            drawerRecordedCount: document.getElementById("drawerRecordedCount"),
            btnRecalibrateDetector: document.getElementById("btnRecalibrateDetector"),
            btnDownloadDataset: document.getElementById("btnDownloadDataset"),
            btnExportManifest: document.getElementById("btnExportManifest"),
            btnResetDataset: document.getElementById("btnResetDataset"),
            stepGrid: document.getElementById("stepGrid")
        };
    }

    bindEvents() {
        this.dom.btnClose.addEventListener("click", () => this.close());
        this.dom.btnPrevStep.addEventListener("click", () => this.prevStep());
        this.dom.btnNextStep.addEventListener("click", () => this.nextStep());
        this.dom.btnPlayRefTone.addEventListener("click", () => this.playReferenceTone());
        this.dom.btnStartPlayAlong.addEventListener("click", () => this.togglePlayAlong());
        this.dom.btnReRecord.addEventListener("click", () => this.startPlayAlong());

        this.dom.btnPlayRecording.addEventListener("click", () => {
            if (this.dom.btnPlayRecording.classList.contains("playing")) {
                this.recorder.stopAudioPreview();
                this.dom.btnPlayRecording.classList.remove("playing");
                this.dom.btnPlayRecording.innerHTML = "<span>▶ Listen to Recording</span>";
            } else {
                const started = this.recorder.playAudioPreview();
                if (started) {
                    this.dom.btnPlayRecording.classList.add("playing");
                    this.dom.btnPlayRecording.innerHTML = "<span>⏹ Stop Audio</span>";
                }
            }
        });

        this.dom.chkAutoAdvance.addEventListener("change", (e) => {
            this.autoAdvance = e.target.checked;
        });

        this.dom.chkPlayRefOnBeat.addEventListener("change", (e) => {
            this.playReferenceOnBeat = e.target.checked;
        });

        if (this.dom.btnRecalibrateDetector) {
            this.dom.btnRecalibrateDetector.addEventListener("click", async () => {
                const copy = this._getInstrumentHeaderCopy();
                const activeInst = this.instrument;
                this.dom.btnRecalibrateDetector.disabled = true;
                this.dom.btnRecalibrateDetector.innerHTML = `<span>${copy.recalBusy}</span>`;
                try {
                    const data = await this.storage.recalibrate();
                    if (this.mic && typeof this.mic.reloadCalibrationProfile === "function") {
                        this.mic.reloadCalibrationProfile(data.profile, activeInst);
                    }
                    if (typeof this.onProfileUpdated === "function") {
                        this.onProfileUpdated(data.profile, activeInst);
                    }
                    const polyF1 =
                        activeInst === "ukulele"
                            ? data.profile?.benchmarkSummary?.strummedChordsZeroShot?.f1
                            : data.profile?.benchmarkSummary?.polyphonicSubset?.calibratedPolyZeroShot?.f1;
                    const metricLabel = activeInst === "ukulele" ? "Chord F1" : "Poly F1";
                    this.dom.btnRecalibrateDetector.innerHTML = `<span>✓ Calibrated (${polyF1 ?? 100}% ${metricLabel})</span>`;
                    if (typeof window !== "undefined" && typeof window.showAppToast === "function") {
                        window.showAppToast(
                            `${activeInst === "ukulele" ? "Ukulele" : "Piano"} detector calibrated (${polyF1 ?? 100}% ${metricLabel})`,
                            "success"
                        );
                    }
                    setTimeout(() => {
                        const latestCopy = this._getInstrumentHeaderCopy();
                        this.dom.btnRecalibrateDetector.innerHTML = `<span>${latestCopy.recalBtn}</span>`;
                        this.dom.btnRecalibrateDetector.disabled = false;
                    }, 3200);
                } catch (err) {
                    if (typeof window !== "undefined" && typeof window.showAppToast === "function") {
                        window.showAppToast("Recalibration error: " + err.message, "error");
                    } else {
                        console.error("Recalibration error:", err);
                    }
                    const latestCopy = this._getInstrumentHeaderCopy();
                    this.dom.btnRecalibrateDetector.innerHTML = `<span>${latestCopy.recalBtn}</span>`;
                    this.dom.btnRecalibrateDetector.disabled = false;
                }
            });
        }

        this.dom.btnDownloadDataset.addEventListener("click", () => {
            this.storage.downloadDatasetZip();
        });

        this.dom.btnExportManifest.addEventListener("click", () => {
            this.storage.exportManifestJson();
        });

        this.dom.btnResetDataset.addEventListener("click", async () => {
            const label = this.instrument === "ukulele" ? "ukulele" : "piano";
            if (confirm(`Reset and clear all collected ${label} acoustic recordings? This cannot be undone.`)) {
                await this.storage.resetDataset();
                this.renderActiveStep();
                this.renderStepGrid();
                this.updateTotalProgressBadge();
            }
        });

        // Category filter buttons
        this.dom.categoryBar.addEventListener("click", (e) => {
            const btn = e.target.closest(".cat-pill");
            if (!btn) return;
            const catId = btn.dataset.cat;
            this.setCategory(catId);
        });

        // Global hotkeys when modal is open
        if (typeof window !== "undefined") {
            window.addEventListener("keydown", (e) => {
                if (!this.isOpen) return;

                if (e.code === "Space") {
                    e.preventDefault();
                    this.togglePlayAlong();
                } else if (e.code === "ArrowRight") {
                    e.preventDefault();
                    this.nextStep();
                } else if (e.code === "ArrowLeft") {
                    e.preventDefault();
                    this.prevStep();
                } else if (e.key === "p" || e.key === "P") {
                    e.preventDefault();
                    this.playReferenceTone();
                } else if (e.key === "r" || e.key === "R") {
                    e.preventDefault();
                    this.startPlayAlong();
                } else if (e.code === "Escape") {
                    this.close();
                }
            });
        }
    }

    /**
     * Open the Trainer Modal
     */
    open(stepId = null) {
        this.mountModal();
        if (!this.dom.modal) return;
        this.isOpen = true;
        this.dom.modal.style.display = "flex";
        this._refreshModalInstrumentChrome();

        if (stepId) {
            const idx = this.filteredSteps.findIndex((s) => s.id === stepId);
            if (idx !== -1) this.currentStepIdx = idx;
        }

        // Initialize audio context
        if (this.synth) {
            if (typeof this.synth.init === "function") this.synth.init();
            if (typeof this.synth.resume === "function") this.synth.resume();
            if (this.synth.ctx) this.recorder.setAudioContext(this.synth.ctx);
        }

        // Attach existing mic stream if present
        if (this.mic && this.mic.stream) {
            this.recorder.ensureMicrophone(this.mic.stream);
        }

        this.renderActiveStep();
        this.renderStepGrid();
        this.updateTotalProgressBadge();
        this.syncWithServer();
    }

    /**
     * Close the Trainer Modal
     */
    close() {
        this.isOpen = false;
        if (this.dom.modal) {
            this.dom.modal.style.display = "none";
        }
        this.stopAutoAdvanceTimer();
        this.abortRecording();
        this.clearActiveHighlights();
    }

    /**
     * Set active category filter
     */
    setCategory(catId) {
        this.activeCategory = catId;

        if (this.dom.categoryBar) {
            const pills = this.dom.categoryBar.querySelectorAll(".cat-pill");
            pills.forEach((p) => {
                p.classList.toggle("active", p.dataset.cat === catId);
            });
        }

        if (catId === "all") {
            this.filteredSteps = [...this.steps];
        } else if (catId === "quick") {
            this.filteredSteps = this.steps.filter((s) => s.quickEssential);
        } else {
            this.filteredSteps = this.steps.filter((s) => s.category === catId);
        }

        this.currentStepIdx = 0;
        this.renderActiveStep();
        this.renderStepGrid();
    }

    /**
     * Render the active training step
     */
    renderActiveStep() {
        this.stopAutoAdvanceTimer();
        const step = this.filteredSteps[this.currentStepIdx];
        if (!step || !this.dom.stepPill) return;

        // Update titles and labels
        this.dom.stepPill.textContent = `Step ${this.currentStepIdx + 1} of ${this.filteredSteps.length}`;
        this.dom.targetCatTag.textContent = step.categoryLabel;
        this.dom.targetStepTitle.textContent = step.title;
        this.dom.targetStepSub.textContent = step.subtitle;
        this.dom.targetInstruction.textContent = step.instruction || step.instructions || "";
        this.dom.stepCounterText.textContent = `${this.currentStepIdx + 1} / ${this.filteredSteps.length}`;

        // Tip
        if (step.tip) {
            this.dom.targetTipBox.style.display = "flex";
            this.dom.targetTipText.textContent = step.tip;
        } else {
            this.dom.targetTipBox.style.display = "none";
        }

        // Render target note capsule pills
        this.dom.targetNotesContainer.innerHTML = "";
        if (!step.targetNotes || step.targetNotes.length === 0) {
            const capsule = document.createElement("div");
            capsule.className = "target-note-capsule silence";
            capsule.innerHTML = `<span class="capsule-clef">𝄽</span><span class="capsule-name">ROOM SILENCE</span>`;
            this.dom.targetNotesContainer.appendChild(capsule);
        } else if (this.instrument === "ukulele") {
            step.targetNotes.forEach((n) => {
                const finger = typeof n.finger === "number" ? n.finger : (n.fret === 0 ? 0 : Math.min(4, n.fret || 1));
                const bg = UKULELE_FINGER_COLORS[finger] || "#48A870";
                const strMeta = UKULELE_TAB_STRINGS[n.string] || { letter: "?" };
                const fretLabel = n.fret === 0 ? "Open" : `Fret ${n.fret}`;
                const capsule = document.createElement("div");
                capsule.className = "target-note-capsule";
                capsule.style.background = bg;
                capsule.innerHTML = `
                    <span class="capsule-clef">${strMeta.letter}</span>
                    <span class="capsule-name">${n.name}</span>
                    <span class="capsule-freq">${strMeta.letter}-Str · ${fretLabel} · ${Math.round(n.freq)} Hz</span>
                `;
                this.dom.targetNotesContainer.appendChild(capsule);
            });
        } else {
            step.targetNotes.forEach((n) => {
                const noteInfo =
                    this.keyboard && typeof this.keyboard.getNoteInfo === "function"
                        ? this.keyboard.getNoteInfo(n.midi)
                        : { color: { bg: "#48A870" }, whiteKeyNumber: n.whiteKey };
                const key61 = n.key61 || n.midi - 35;
                const whiteNum = n.whiteKey || noteInfo.whiteKeyNumber;
                const whiteTag = whiteNum ? ` (White #${whiteNum})` : "";
                const capsule = document.createElement("div");
                capsule.className = "target-note-capsule";
                capsule.style.background = noteInfo.color ? noteInfo.color.bg : "#48A870";
                const clefIcon = n.clef === "bass" ? "𝄢" : "𝄞";
                capsule.innerHTML = `
                    <span class="capsule-clef">${clefIcon}</span>
                    <span class="capsule-name">${n.name}</span>
                    <span class="capsule-freq">Key #${key61}${whiteTag} · ${Math.round(n.freq)} Hz</span>
                `;
                this.dom.targetNotesContainer.appendChild(capsule);
            });
        }

        // Render mini visual preview (61-key piano OR 4-string ukulele fretboard diagram)
        if (this.instrument === "ukulele") {
            this.renderMiniUkuleleDiagram(step);
        } else {
            this.renderMiniKeyboard(step);
        }

        // Update status badge & check if already recorded
        const isRecorded = this.storage.isStepRecorded(step.id);
        const record = this.storage.getStepRecord(step.id);

        if (isRecorded && record) {
            this.dom.targetStatusBadge.className = "target-status-badge recorded";
            this.dom.targetStatusBadge.textContent = "✓ Recorded";

            this.dom.recordReviewCard.style.display = "block";
            this.dom.reviewTitle.textContent = "Recorded Sample";
            const stats = record.stats || record;
            let detNote = "";
            if (stats.detectedNote) {
                detNote =
                    this.instrument === "ukulele"
                        ? ` · Detected: ${stats.detectedNote} (${stats.dominantFreq} Hz)`
                        : ` · Detected: ${stats.detectedNote} (Key #${stats.detectedKey61} · ${stats.dominantFreq} Hz)`;
            } else if (stats.dominantFreq) {
                detNote = ` · Peak: ${stats.dominantFreq} Hz`;
            }
            this.dom.reviewStats.textContent = `WAV · ${stats.durationSec || stats.duration || 2.2}s · RMS: ${stats.rms || "OK"}${detNote}`;
            this.dom.btnPlayRecording.style.display = record.filename ? "inline-flex" : "none";
            this.dom.btnPlayRecording.onclick = () => {
                const audioUrl = record.audio_url || this.storage.getSampleAudioUrl(record.filename);
                if (typeof Audio !== "undefined" && audioUrl) {
                    const audio = new Audio(audioUrl);
                    audio.play().catch((e) => console.warn(e));
                }
            };
        } else {
            this.dom.targetStatusBadge.className = "target-status-badge pending";
            this.dom.targetStatusBadge.textContent = "Not Recorded";
            this.dom.recordReviewCard.style.display = "none";
        }

        // Reset countdown UI
        this.resetCountdownStage("READY", "3");

        // Highlight keys/frets on main studio instrument
        this.highlightActiveKeys(step);

        // Auto-play reference tone on initial step entry
        this.playReferenceTone();

        // Update step grid highlights
        this.updateStepGridActive();
    }

    /**
     * Render a calm Obsidian & Acoustic Ivory mini 4-string Ukulele chord/tab diagram
     */
    renderMiniUkuleleDiagram(step) {
        _injectUkuleleDiagramFallbackStyles();
        const container = this.dom.miniKeysPreview;
        if (!container) return;
        container.innerHTML = "";

        const root = document.createElement("div");
        root.className = "uku-trainer-diagram";

        const strumLabels = {
            silence: "Silence Floor",
            pluck: "Single Pluck",
            double_stop: "Double-Stop Pinch",
            unison: "Unison Dual-String",
            down_strum: "↓ Down-Strum (G → A)",
            up_strum: "↑ Up-Strum (A → G)",
            arpeggio: "↓ Slow Roll (~70 ms)"
        };

        const fretsGcea = Array.isArray(step.targetFrets) ? step.targetFrets : [-1, -1, -1, -1];
        const shapeStr = fretsGcea.map((f) => (f < 0 ? "x" : String(f))).join("-");
        const headerBadge = step.chordSymbol
            ? `${step.chordSymbol} · Shape [${shapeStr}]`
            : step.category === "silence"
                ? "Ambient Calibration · 4-String Quiet"
                : `Tab Shape [${shapeStr}]`;

        const head = document.createElement("div");
        head.className = "uku-trainer-diagram-head";
        head.innerHTML = `
            <span class="uku-trainer-diagram-badge">${headerBadge}</span>
            <span class="uku-trainer-diagram-strum">${strumLabels[step.strumType] || "Pluck"}</span>
        `;
        root.appendChild(head);

        if (step.category === "silence" || (!step.targetNotes || step.targetNotes.length === 0)) {
            const msg = document.createElement("div");
            msg.className = "uku-trainer-silence-note";
            msg.textContent = "Keep all 4 strings (A · E · C · G) silent while the room floor is captured.";
            root.appendChild(msg);
            container.appendChild(root);
            return;
        }

        // Determine visible 5-fret window (1..5 for open/low position, sliding window for higher frets)
        const positiveFrets = fretsGcea.filter((f) => f > 0);
        const maxF = positiveFrets.length > 0 ? Math.max(...positiveFrets) : 4;
        const minF = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 1;
        let startFret = 1;
        let endFret = 5;
        if (maxF > 5) {
            startFret = Math.max(1, minF - 1);
            endFret = Math.min(12, Math.max(maxF + 1, startFret + 4));
            startFret = Math.max(1, endFret - 4);
        }
        const numCols = endFret - startFret + 1;

        // Build lookup from tabString -> note metadata
        const noteByTabString = new Map();
        (step.targetNotes || []).forEach((n) => {
            if (typeof n.string === "number") {
                noteByTabString.set(n.string, n);
            }
        });

        // Fret number header
        const fretHead = document.createElement("div");
        fretHead.className = "uku-trainer-fret-header";
        fretHead.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
        for (let f = startFret; f <= endFret; f++) {
            const span = document.createElement("span");
            span.textContent = `F${f}`;
            fretHead.appendChild(span);
        }
        root.appendChild(fretHead);

        const grid = document.createElement("div");
        grid.className = "uku-trainer-grid";

        UKULELE_TAB_STRINGS.forEach((strInfo) => {
            const fretVal = fretsGcea[strInfo.chordIndex];
            const noteMeta = noteByTabString.get(strInfo.tabIndex) || null;

            const row = document.createElement("div");
            row.className = "uku-trainer-string-row";
            row.style.gridTemplateColumns = "34px 1fr";

            const label = document.createElement("div");
            label.className = "uku-trainer-string-label";
            const nutChar = fretVal === 0 ? "O" : fretVal < 0 ? "×" : "·";
            const nutClass = fretVal === 0 ? "is-open" : "";
            label.innerHTML = `<span>${strInfo.letter}</span><span class="uku-trainer-nut-status ${nutClass}">${nutChar}</span>`;
            if (fretVal === 0) {
                label.style.cursor = "pointer";
                label.title = `Hear open ${strInfo.name}`;
                label.addEventListener("click", () => {
                    if (this.synth) {
                        if (typeof this.synth.init === "function") this.synth.init();
                        this.synth.playNote(strInfo.openMidi, 0.9, 0.8, { string: strInfo.tabIndex, fret: 0 });
                    }
                });
            }
            row.appendChild(label);

            const cellsWrap = document.createElement("div");
            cellsWrap.className = "uku-trainer-cells";
            cellsWrap.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;

            const wire = document.createElement("div");
            wire.className = "uku-trainer-string-wire";
            cellsWrap.appendChild(wire);

            for (let f = startFret; f <= endFret; f++) {
                const cell = document.createElement("div");
                cell.className = "uku-trainer-cell";
                if (fretVal === f) {
                    const finger =
                        noteMeta && typeof noteMeta.finger === "number"
                            ? noteMeta.finger
                            : Math.min(4, Math.max(1, f - startFret + 1));
                    const dot = document.createElement("span");
                    dot.className = "uku-trainer-dot";
                    dot.style.background = UKULELE_FINGER_COLORS[finger] || "#F0C830";
                    dot.textContent = String(finger);
                    dot.title = `${strInfo.letter}-string Fret ${f} (${noteMeta ? noteMeta.name : ""})`;
                    cell.appendChild(dot);
                }
                cell.addEventListener("click", () => {
                    if (this.synth) {
                        if (typeof this.synth.init === "function") this.synth.init();
                        this.synth.playNote(strInfo.openMidi + f, 0.9, 0.8, { string: strInfo.tabIndex, fret: f });
                    }
                });
                cellsWrap.appendChild(cell);
            }

            row.appendChild(cellsWrap);
            grid.appendChild(row);
        });

        root.appendChild(grid);
        container.appendChild(root);
    }

    /**
     * Render a full 61-key visual keyboard (C2 to C7, Keys #1 to #61) in the target card
     */
    renderMiniKeyboard(step) {
        const container = this.dom.miniKeysPreview;
        if (!container) return;
        container.innerHTML = "";

        const start = 36; // C2 (Key #1)
        const end = 96;   // C7 (Key #61)
        const targetMidis = new Set((step.targetNotes || []).map((n) => n.midi));

        const legendBar = document.createElement("div");
        legendBar.className = "mini-keys-legend";
        legendBar.innerHTML = `
            <span><strong>#1 C2</strong> (W#1)</span>
            <span><strong>#13 C3</strong> (W#8)</span>
            <span><strong>#22 A3</strong> (W#13)</span>
            <span><strong>#25 Middle C4★</strong> (W#15)</span>
            <span><strong>#34 A4</strong> (W#20)</span>
            <span><strong>#61 C7</strong> (W#36)</span>
        `;
        container.appendChild(legendBar);

        const keysWrap = document.createElement("div");
        keysWrap.className = "mini-keys-track";

        for (let m = start; m <= end; m++) {
            const info =
                this.keyboard && typeof this.keyboard.getNoteInfo === "function"
                    ? this.keyboard.getNoteInfo(m)
                    : { isBlack: false, fullName: `Key${m}`, name: "C", key61Number: m - 35, whiteKeyNumber: null };
            const isTarget = targetMidis.has(m);
            const isMiddleC = m === 60;
            const keyEl = document.createElement("div");
            keyEl.className = `mini-key ${info.isBlack ? "black" : "white"}${isMiddleC ? " middle-c" : ""}${isTarget ? " target-active" : ""}`;
            const wDesc = info.whiteKeyNumber ? ` (White Key #${info.whiteKeyNumber}/36)` : "";
            keyEl.title = `${info.fullName}${isMiddleC ? " (Middle C)" : ""} • Key #${info.key61Number}/61${wDesc} • MIDI ${m}`;
            if (isTarget) {
                keyEl.style.setProperty("--target-color", info.color ? info.color.bg : "#48A870");
            }
            if (isTarget || (!info.isBlack && info.name === "C")) {
                const cTag = document.createElement("span");
                cTag.className = "mini-c-label";
                cTag.textContent = isTarget ? `${info.fullName}#${info.key61Number}` : isMiddleC ? "C4★" : info.fullName;
                keyEl.appendChild(cTag);
            }
            keyEl.addEventListener("click", () => {
                if (this.synth) {
                    if (typeof this.synth.init === "function") this.synth.init();
                    this.synth.playNote(m, 0.7, 0.8);
                }
            });
            keysWrap.appendChild(keyEl);
        }

        container.appendChild(keysWrap);
    }

    /**
     * Highlight target keys/frets on the main bottom studio keyboard or fretboard
     */
    highlightActiveKeys(step) {
        this.clearActiveHighlights();
        if (!this.keyboard || !step || !step.targetNotes || step.targetNotes.length === 0) return;

        if (this.instrument === "ukulele" && typeof this.keyboard.setTargetNotes === "function") {
            const targets = step.targetNotes.map((n) => ({
                pitch: n.midi,
                midi: n.midi,
                string: n.string,
                fret: n.fret,
                finger: typeof n.finger === "number" ? n.finger : (n.fret === 0 ? 0 : 1),
                fingerColor: UKULELE_FINGER_COLORS[typeof n.finger === "number" ? n.finger : 0] || "#48A870",
                chordSymbol: step.chordSymbol || null
            }));
            this.keyboard.setTargetNotes(targets);
            return;
        }

        step.targetNotes.forEach((n) => {
            const noteInfo =
                typeof this.keyboard.getNoteInfo === "function"
                    ? this.keyboard.getNoteInfo(n.midi)
                    : { color: { bg: "#48A870" } };
            if (typeof this.keyboard.pressKey === "function") {
                this.keyboard.pressKey(n.midi, noteInfo.color ? noteInfo.color.bg : "#48A870", "preview", {
                    string: n.string,
                    fret: n.fret,
                    finger: n.finger
                });
            }
        });
    }

    clearActiveHighlights() {
        if (!this.keyboard) return;
        if (typeof this.keyboard.clearTargetHighlights === "function") {
            this.keyboard.clearTargetHighlights();
        }
        if (typeof this.keyboard.clearAll === "function") {
            this.keyboard.clearAll();
        }
    }

    /**
     * Play synthesized reference note(s) or ukulele strum
     */
    playReferenceTone() {
        if (!this.synth) return;
        if (typeof this.synth.init === "function") this.synth.init();
        if (typeof this.synth.resume === "function") this.synth.resume();

        const step = this.filteredSteps[this.currentStepIdx];
        if (!step || !step.targetNotes || step.targetNotes.length === 0) return;

        const velocity = step.expectedDynamic === "soft" ? 0.45 : step.expectedDynamic === "loud" ? 1.0 : 0.8;

        if (
            this.instrument === "ukulele" &&
            step.targetNotes.length > 1 &&
            typeof this.synth.playStrum === "function"
        ) {
            const dir = step.strumType === "up_strum" ? "up" : "down";
            const strumNotes = step.targetNotes.map((n) => ({
                pitch: n.midi,
                midi: n.midi,
                string: n.string,
                fret: n.fret,
                velocity
            }));
            this.synth.playStrum(strumNotes, 1.5, dir, { velocity });
            return;
        }

        step.targetNotes.forEach((n) => {
            if (this.instrument === "ukulele") {
                this.synth.playNote(n.midi, 1.4, velocity, { string: n.string, fret: n.fret });
            } else {
                this.synth.playNote(n.midi, 1.4, velocity);
            }
        });
    }

    /**
     * Toggle Play-Along Action
     */
    togglePlayAlong() {
        if (this.isCountingDown || this.isRecording) {
            this.abortRecording();
        } else {
            this.startPlayAlong();
        }
    }

    /**
     * Execute step play-along with count-in, metronome, recording, and review
     */
    async startPlayAlong() {
        this.stopAutoAdvanceTimer();
        this.abortRecording();

        const step = this.filteredSteps[this.currentStepIdx];
        if (!step) return;

        await this.recorder.ensureMicrophone();

        this.isCountingDown = true;
        this.dom.btnPlayAlongIcon.textContent = "⏹";
        this.dom.btnPlayAlongText.textContent = "Cancel";
        this.dom.btnStartPlayAlong.classList.add("cancel-mode");
        this.dom.recordReviewCard.style.display = "none";
        this.dom.liveLevelWrap.style.opacity = "1";

        let countdown = 3;
        this.dom.countdownNumber.textContent = countdown;
        this.dom.countdownStatus.textContent = "COUNT-IN";
        this.dom.countdownRingCircle.style.strokeDashoffset = "0";

        if (this.synth && typeof this.synth.playMetronomeClick === "function") {
            this.synth.playMetronomeClick(false);
        }

        this.countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                this.dom.countdownNumber.textContent = countdown;
                if (this.synth && typeof this.synth.playMetronomeClick === "function") {
                    this.synth.playMetronomeClick(false);
                }
            } else {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                this.executeRecordingWindow(step);
            }
        }, 1000);
    }

    /**
     * The capture window: PLAY & HOLD NOW!
     */
    async executeRecordingWindow(step) {
        this.isCountingDown = false;
        this.isRecording = true;

        this.dom.countdownNumber.textContent = "●";
        this.dom.countdownStatus.textContent = this.instrument === "ukulele" && step.category === "chords"
            ? "STRUM & LET RING"
            : "PLAY & HOLD";
        this.dom.countdownStage.classList.add("recording");

        if (this.synth) {
            if (typeof this.synth.playMetronomeClick === "function") {
                this.synth.playMetronomeClick(true);
            }

            if (this.playReferenceOnBeat && step.targetNotes && step.targetNotes.length > 0) {
                const dur = (step.recordDurationSec || step.durationSec || 2.2) * 0.9;
                if (
                    this.instrument === "ukulele" &&
                    step.targetNotes.length > 1 &&
                    typeof this.synth.playStrum === "function"
                ) {
                    const dir = step.strumType === "up_strum" ? "up" : "down";
                    this.synth.playStrum(
                        step.targetNotes.map((n) => ({ pitch: n.midi, midi: n.midi, string: n.string, fret: n.fret })),
                        dur,
                        dir
                    );
                } else {
                    step.targetNotes.forEach((n) => {
                        this.synth.playNote(n.midi, dur, 0.75);
                    });
                }
            }
        }

        // Wait 45ms so the wooden metronome downbeat click does not bleed into the start of the WAV recording
        await new Promise((resolve) => setTimeout(resolve, 45));
        if (!this.isRecording) return;

        await this.recorder.startRecording();

        const durationMs = (step.recordDurationSec || step.durationSec || 2.2) * 1000;
        const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
        const circumference = 2 * Math.PI * 52;

        const animateRing = () => {
            if (!this.isRecording) return;
            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const offset = circumference * (1 - progress);
            this.dom.countdownRingCircle.style.strokeDashoffset = `${offset}`;

            if (progress < 1 && typeof requestAnimationFrame === "function") {
                requestAnimationFrame(animateRing);
            }
        };
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(animateRing);
        }

        this.recordingTimeout = setTimeout(async () => {
            await this.finishRecording(step);
        }, durationMs);
    }

    /**
     * Complete recording, analyze, save, and present review
     */
    async finishRecording(step) {
        this.isRecording = false;
        this.dom.countdownStage.classList.remove("recording");
        this.dom.btnPlayAlongIcon.textContent = "▶";
        this.dom.btnPlayAlongText.textContent = "Start Step (Play-Along)";
        this.dom.btnStartPlayAlong.classList.remove("cancel-mode");
        this.dom.liveLevelWrap.style.opacity = "0";

        const result = await this.recorder.stopRecording();
        const stats = result.stats;

        let isQuiet = stats.rms < (this.instrument === "ukulele" ? 0.006 : 0.008);
        if (step.category === "silence") {
            isQuiet = false;
        }

        const metadata = {
            id: step.id,
            instrument: this.instrument,
            stepIndex: this.currentStepIdx,
            category: step.category,
            categoryLabel: step.categoryLabel,
            title: step.title,
            targetNotes: step.targetNotes,
            targetFrets: step.targetFrets || null,
            expectedMidis: step.expectedMidis || (step.targetNotes || []).map((n) => n.midi),
            strumType: step.strumType || null,
            expectedDynamic: step.expectedDynamic || "normal",
            duration: stats.durationSec,
            sampleRate: stats.sampleRate,
            rms: stats.rms,
            dominantFreq: stats.dominantFreq,
            detectedMidi: stats.detectedMidi,
            detectedNote: stats.detectedNote,
            detectedKey61: stats.detectedKey61,
            filename: `${step.id}.wav`,
            timestamp: new Date().toISOString()
        };

        await this.storage.saveSample(metadata, result.base64);

        this.dom.recordReviewCard.style.display = "block";
        this.dom.reviewTitle.textContent = isQuiet ? "Recorded (Low Signal Level)" : "Sample Captured & Saved";
        const detSummary = stats.detectedNote
            ? this.instrument === "ukulele"
                ? `Detected: ${stats.detectedNote} (${stats.dominantFreq} Hz)`
                : `Detected: ${stats.detectedNote} (Key #${stats.detectedKey61} · ${stats.dominantFreq} Hz)`
            : `Peak: ${stats.dominantFreq} Hz`;
        this.dom.reviewStats.textContent = `WAV 16-bit · ${stats.durationSec}s · RMS: ${stats.rms} · ${detSummary}`;
        this.dom.targetStatusBadge.className = "target-status-badge recorded";
        this.dom.targetStatusBadge.textContent = "✓ Recorded";
        this.dom.btnPlayRecording.style.display = "inline-flex";

        this.resetCountdownStage("SAVED", "✓");
        this.updateTotalProgressBadge();
        this.renderStepGrid();

        if (this.onProgressUpdate) {
            this.onProgressUpdate(this.getRecordedCount(), this.steps.length);
        }

        if (this.autoAdvance && !isQuiet && this.currentStepIdx < this.filteredSteps.length - 1) {
            const delaySec = 1.6;
            this.dom.countdownStatus.textContent = `NEXT IN ${delaySec}s...`;
            this.autoAdvanceTimeout = setTimeout(() => {
                this.nextStep();
            }, delaySec * 1000);
        }
    }

    abortRecording() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
        if (this.isRecording) {
            this.recorder.stopRecording();
            this.isRecording = false;
        }
        this.isCountingDown = false;
        if (this.dom.countdownStage) {
            this.dom.countdownStage.classList.remove("recording");
        }
        if (this.dom.btnStartPlayAlong) {
            this.dom.btnPlayAlongIcon.textContent = "▶";
            this.dom.btnPlayAlongText.textContent = "Start Step (Play-Along)";
            this.dom.btnStartPlayAlong.classList.remove("cancel-mode");
        }
        if (this.dom.liveLevelWrap) {
            this.dom.liveLevelWrap.style.opacity = "0";
        }
    }

    stopAutoAdvanceTimer() {
        if (this.autoAdvanceTimeout) {
            clearTimeout(this.autoAdvanceTimeout);
            this.autoAdvanceTimeout = null;
        }
    }

    resetCountdownStage(statusText = "READY", numText = "3") {
        if (!this.dom.countdownNumber) return;
        this.dom.countdownNumber.textContent = numText;
        this.dom.countdownStatus.textContent = statusText;
        this.dom.countdownRingCircle.style.strokeDashoffset = "0";
    }

    nextStep() {
        this.abortRecording();
        if (this.currentStepIdx < this.filteredSteps.length - 1) {
            this.currentStepIdx++;
            this.renderActiveStep();
        }
    }

    prevStep() {
        this.abortRecording();
        if (this.currentStepIdx > 0) {
            this.currentStepIdx--;
            this.renderActiveStep();
        }
    }

    jumpToStep(stepId) {
        this.abortRecording();
        const idx = this.filteredSteps.findIndex((s) => s.id === stepId);
        if (idx !== -1) {
            this.currentStepIdx = idx;
            this.renderActiveStep();
        }
    }

    /**
     * Render the bottom drawer checklist grid
     */
    renderStepGrid() {
        const grid = this.dom.stepGrid;
        if (!grid) return;
        grid.innerHTML = "";

        this.filteredSteps.forEach((step, idx) => {
            const isRecorded = this.storage.isStepRecorded(step.id);
            const isActive = idx === this.currentStepIdx;

            const pill = document.createElement("button");
            pill.className = `grid-step-pill ${isRecorded ? "recorded" : ""} ${isActive ? "active" : ""}`;
            pill.dataset.stepId = step.id;

            const checkIcon = isRecorded ? "✓" : idx + 1;
            pill.innerHTML = `
                <span class="step-mini-num">${checkIcon}</span>
                <span class="step-mini-title">${step.title}</span>
            `;

            pill.addEventListener("click", () => {
                this.jumpToStep(step.id);
            });

            grid.appendChild(pill);
        });

        const recordedCount = this.getRecordedCount();
        this.dom.drawerRecordedCount.textContent = `${recordedCount} / ${this.steps.length} Samples Recorded`;
    }

    updateStepGridActive() {
        if (!this.dom.stepGrid) return;
        const pills = this.dom.stepGrid.querySelectorAll(".grid-step-pill");
        pills.forEach((p, idx) => {
            p.classList.toggle("active", idx === this.currentStepIdx);
        });
    }

    getRecordedCount() {
        let count = 0;
        this.steps.forEach((s) => {
            if (this.storage.isStepRecorded(s.id)) count++;
        });
        return count;
    }

    updateTotalProgressBadge() {
        const count = this.getRecordedCount();
        const total = this.steps.length || 1;
        const pct = Math.round((count / total) * 100);

        if (this.dom.progressText) {
            this.dom.progressText.textContent = `${count} / ${total} (${pct}%)`;
        }
        if (this.dom.progressBar) {
            this.dom.progressBar.style.width = `${pct}%`;
        }

        if (typeof document !== "undefined") {
            const badge = document.getElementById("trainerProgressBadge");
            if (badge) {
                badge.textContent = `${count}/${total}`;
                badge.classList.toggle("has-progress", count > 0);
                badge.classList.toggle("complete", count === total);
            }
        }
    }
}
