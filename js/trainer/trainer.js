/**
 * Acoustic Piano Sound & Data Trainer Controller
 * Guides the user step-by-step through acoustic piano data collection with play-along reference tones,
 * synchronized countdown metronome, 3D keyboard visualizer, live audio waveform, and instant playback review.
 */

import { DATASET_STEPS, CATEGORIES } from "./curriculum.js";
import { AudioDatasetRecorder } from "./recorder.js";
import { DatasetStorage } from "./storage.js";

export class SoundCollectionTrainer {
    constructor(synth, keyboard, mic, options = {}) {
        this.synth = synth;
        this.keyboard = keyboard;
        this.mic = mic;
        this.onProgressUpdate = options.onProgressUpdate || null;

        this.recorder = new AudioDatasetRecorder(this.synth ? this.synth.ctx : null);
        
        // Curriculum state
        this.steps = [...DATASET_STEPS];
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
        if (document.getElementById("trainerModal")) return;

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
                                <h2 class="trainer-main-title">61-Key Piano Sound &amp; Data Trainer</h2>
                                <span id="trainerStepPill" class="trainer-step-pill">Step 1 of 28</span>
                            </div>
                            <p class="trainer-subtitle">Aligned for 61-key keyboard (5 octaves: Key #1 C2 to Key #61 C7 · Middle C = Key #25)</p>
                        </div>
                    </div>
                    <div class="trainer-header-right">
                        <div class="trainer-global-progress">
                            <span id="trainerProgressText" class="progress-label">0 / 28 (0%)</span>
                            <div class="progress-track">
                                <div id="trainerProgressBar" class="progress-fill" style="width: 0%;"></div>
                            </div>
                        </div>
                        <button id="btnTrainerClose" class="btn-trainer-close" title="Close Trainer (Esc)">✕</button>
                    </div>
                </div>

                <!-- Category Filters Bar -->
                <div class="trainer-cat-bar" id="trainerCategoryBar">
                    ${CATEGORIES.map(c => `
                        <button class="cat-pill ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>
                    `).join('')}
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
                            <p id="targetStepSub" class="target-step-sub">Piano Key 40 · MIDI 60 · 261.63 Hz</p>
                        </div>

                        <div class="target-instruction-box">
                            <span class="instruction-icon" aria-hidden="true">›</span>
                            <p id="targetInstruction" class="instruction-text">Strike Middle C firmly and hold it cleanly.</p>
                        </div>

                        <div id="targetTipBox" class="target-tip-box">
                            <span class="tip-label">Acoustic Note:</span>
                            <span id="targetTipText" class="tip-text">Calibrates middle register and concert reference.</span>
                        </div>

                        <!-- Mini Keyboard Preview of Target Note(s) -->
                        <div class="mini-keys-preview" id="miniKeysPreview">
                            <!-- Visual mini-keyboard rendering -->
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
                                    <button id="btnReRecord" class="btn-small-re-record" title="Record this note again">
                                        <span>↻ Re-record</span>
                                    </button>
                                </div>

                                <div class="review-player-row">
                                    <button id="btnPlayRecording" class="btn-pill-play" title="Listen to your piano recording">
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
                            <span id="stepCounterText" class="step-counter-text">Step 1 / 28</span>
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
                            <button id="btnRecalibrateDetector" class="btn-drawer-action" title="Re-build calibrated 61-key polyphonic profile from your recorded WAV samples">
                                <span>Recalibrate Detector</span>
                            </button>
                            <button id="btnDownloadDataset" class="btn-drawer-action" title="Download all recorded WAV files as a ZIP package">
                                <span>Download Dataset (.zip)</span>
                            </button>
                            <button id="btnExportManifest" class="btn-drawer-action" title="Download metadata manifest JSON">
                                <span>Export Manifest</span>
                            </button>
                            <button id="btnResetDataset" class="btn-drawer-danger" title="Clear all recorded samples">
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
                const origHtml = this.dom.btnRecalibrateDetector.innerHTML;
                this.dom.btnRecalibrateDetector.disabled = true;
                this.dom.btnRecalibrateDetector.innerHTML = "<span>Calibrating 61 Keys…</span>";
                try {
                    const resp = await fetch("/api/dataset/recalibrate", { method: "POST" });
                    const data = await resp.json();
                    if (!resp.ok || !data.success) {
                        throw new Error(data.error || "Calibration endpoint returned an error");
                    }
                    if (this.mic && typeof this.mic.reloadCalibrationProfile === "function") {
                        this.mic.reloadCalibrationProfile(data.profile);
                    }
                    const polyF1 = data.profile?.benchmarkSummary?.polyphonicSubset?.calibratedPolyZeroShot?.f1;
                    this.dom.btnRecalibrateDetector.innerHTML = `<span>✓ Calibrated (${polyF1 ?? 100}% Poly F1)</span>`;
                    if (typeof window !== "undefined" && typeof window.showAppToast === "function") {
                        window.showAppToast(`Detector calibrated (${polyF1 ?? 100}% Poly F1)`, "success");
                    }
                    setTimeout(() => {
                        this.dom.btnRecalibrateDetector.innerHTML = origHtml;
                        this.dom.btnRecalibrateDetector.disabled = false;
                    }, 3200);
                } catch (err) {
                    if (typeof window !== "undefined" && typeof window.showAppToast === "function") {
                        window.showAppToast("Recalibration error: " + err.message, "error");
                    } else {
                        console.error("Recalibration error:", err);
                    }
                    this.dom.btnRecalibrateDetector.innerHTML = origHtml;
                    this.dom.btnRecalibrateDetector.disabled = false;
                }
            });
        }

        this.dom.btnDownloadDataset.addEventListener("click", () => {
            DatasetStorage.downloadDatasetZip();
        });

        this.dom.btnExportManifest.addEventListener("click", () => {
            DatasetStorage.exportManifestJson();
        });

        this.dom.btnResetDataset.addEventListener("click", async () => {
            if (confirm("Reset and clear all collected acoustic recordings? This cannot be undone.")) {
                await DatasetStorage.resetDataset();
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

    /**
     * Open the Trainer Modal
     */
    open(stepId = null) {
        this.mountModal();
        this.isOpen = true;
        this.dom.modal.style.display = "flex";

        if (stepId) {
            const idx = this.filteredSteps.findIndex(s => s.id === stepId);
            if (idx !== -1) this.currentStepIdx = idx;
        }

        // Initialize audio context
        if (this.synth) {
            this.synth.init();
            this.synth.resume();
            this.recorder.setAudioContext(this.synth.ctx);
        }

        // Attach existing mic stream if present
        if (this.mic && this.mic.stream) {
            this.recorder.ensureMicrophone(this.mic.stream);
        }

        this.renderActiveStep();
        this.renderStepGrid();
        this.updateTotalProgressBadge();
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
        
        // Update category pills
        const pills = this.dom.categoryBar.querySelectorAll(".cat-pill");
        pills.forEach(p => {
            p.classList.toggle("active", p.dataset.cat === catId);
        });

        // Filter steps
        if (catId === "all") {
            this.filteredSteps = [...this.steps];
        } else if (catId === "quick") {
            this.filteredSteps = this.steps.filter(s => s.quickEssential);
        } else {
            this.filteredSteps = this.steps.filter(s => s.category === catId);
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
        if (!step) return;

        // Update titles and labels
        this.dom.stepPill.textContent = `Step ${this.currentStepIdx + 1} of ${this.filteredSteps.length}`;
        this.dom.targetCatTag.textContent = step.categoryLabel;
        this.dom.targetStepTitle.textContent = step.title;
        this.dom.targetStepSub.textContent = step.subtitle;
        this.dom.targetInstruction.textContent = step.instruction;
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
        if (step.targetNotes.length === 0) {
            // Silence step
            const capsule = document.createElement("div");
            capsule.className = "target-note-capsule silence";
            capsule.innerHTML = `<span class="capsule-clef">𝄽</span><span class="capsule-name">ROOM SILENCE</span>`;
            this.dom.targetNotesContainer.appendChild(capsule);
        } else {
            step.targetNotes.forEach(n => {
                const noteInfo = this.keyboard ? this.keyboard.getNoteInfo(n.midi) : { color: { bg: "#48A870" }, whiteKeyNumber: n.whiteKey };
                const key61 = n.key61 || (n.midi - 35);
                const whiteNum = n.whiteKey || noteInfo.whiteKeyNumber;
                const whiteTag = whiteNum ? ` (White #${whiteNum})` : "";
                const capsule = document.createElement("div");
                capsule.className = "target-note-capsule";
                capsule.style.background = noteInfo.color.bg;
                const clefIcon = n.clef === "bass" ? "𝄢" : "𝄞";
                capsule.innerHTML = `
                    <span class="capsule-clef">${clefIcon}</span>
                    <span class="capsule-name">${n.name}</span>
                    <span class="capsule-freq">Key #${key61}${whiteTag} · ${Math.round(n.freq)} Hz</span>
                `;
                this.dom.targetNotesContainer.appendChild(capsule);
            });
        }

        // Render mini keyboard representation (full 61-key overview)
        this.renderMiniKeyboard(step);

        // Update status badge & check if already recorded
        const isRecorded = DatasetStorage.isStepRecorded(step.id);
        const record = DatasetStorage.getStepRecord(step.id);

        if (isRecorded && record) {
            this.dom.targetStatusBadge.className = "target-status-badge recorded";
            this.dom.targetStatusBadge.textContent = "✓ Recorded";
            
            // Show review card with saved stats
            this.dom.recordReviewCard.style.display = "block";
            this.dom.reviewTitle.textContent = "Recorded Sample";
            const stats = record.stats || record;
            const detNote = stats.detectedNote ? ` · Detected: ${stats.detectedNote} (Key #${stats.detectedKey61} · ${stats.dominantFreq} Hz)` : (stats.dominantFreq ? ` · Peak: ${stats.dominantFreq} Hz` : "");
            this.dom.reviewStats.textContent = `WAV · ${stats.durationSec || stats.duration || 2.2}s · RMS: ${stats.rms || 'OK'}${detNote}`;
            this.dom.btnPlayRecording.style.display = record.filename ? "inline-flex" : "none";
            this.dom.btnPlayRecording.onclick = () => {
                const audio = new Audio(`/audio_dataset/samples/${record.filename}`);
                audio.play().catch(e => console.warn(e));
            };
        } else {
            this.dom.targetStatusBadge.className = "target-status-badge pending";
            this.dom.targetStatusBadge.textContent = "Not Recorded";
            this.dom.recordReviewCard.style.display = "none";
        }

        // Reset countdown UI
        this.resetCountdownStage("READY", "3");

        // Highlight keys on the bottom 3D keyboard
        this.highlightActiveKeys(step);

        // Auto-play reference tone on initial step entry
        this.playReferenceTone();

        // Update step grid highlights
        this.updateStepGridActive();
    }

    /**
     * Render a full 61-key visual keyboard (C2 to C7, Keys #1 to #61) in the target card
     */
    renderMiniKeyboard(step) {
        const container = this.dom.miniKeysPreview;
        container.innerHTML = "";

        const start = 36; // C2 (Key #1)
        const end = 96;   // C7 (Key #61)
        const targetMidis = new Set(step.targetNotes.map(n => n.midi));

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
            const info = this.keyboard ? this.keyboard.getNoteInfo(m) : { isBlack: false, fullName: `Key${m}`, name: "C", key61Number: m - 35, whiteKeyNumber: null };
            const isTarget = targetMidis.has(m);
            const isMiddleC = m === 60;
            const keyEl = document.createElement("div");
            keyEl.className = `mini-key ${info.isBlack ? 'black' : 'white'}${isMiddleC ? ' middle-c' : ''}${isTarget ? ' target-active' : ''}`;
            const wDesc = info.whiteKeyNumber ? ` (White Key #${info.whiteKeyNumber}/36)` : "";
            keyEl.title = `${info.fullName}${isMiddleC ? ' (Middle C)' : ''} • Key #${info.key61Number}/61${wDesc} • MIDI ${m}`;
            if (isTarget) {
                keyEl.style.setProperty("--target-color", info.color ? info.color.bg : "#22C55E");
            }
            if (isTarget || (!info.isBlack && info.name === "C")) {
                const cTag = document.createElement("span");
                cTag.className = "mini-c-label";
                cTag.textContent = isTarget ? `${info.fullName}#${info.key61Number}` : (isMiddleC ? "C4★" : info.fullName);
                keyEl.appendChild(cTag);
            }
            keyEl.addEventListener("click", () => {
                if (this.synth) {
                    this.synth.init();
                    this.synth.playNote(m, 0.7, 0.8);
                }
            });
            keysWrap.appendChild(keyEl);
        }

        container.appendChild(keysWrap);
    }

    /**
     * Highlight target keys on the main bottom 3D keyboard
     */
    highlightActiveKeys(step) {
        this.clearActiveHighlights();
        if (!this.keyboard) return;

        step.targetNotes.forEach(n => {
            const noteInfo = this.keyboard.getNoteInfo(n.midi);
            this.keyboard.pressKey(n.midi, noteInfo.color.bg, "preview");
        });
    }

    clearActiveHighlights() {
        if (!this.keyboard) return;
        this.keyboard.clearAll();
    }

    /**
     * Play synthesized reference note(s)
     */
    playReferenceTone() {
        if (!this.synth) return;
        this.synth.init();
        this.synth.resume();

        const step = this.filteredSteps[this.currentStepIdx];
        if (!step || step.targetNotes.length === 0) return;

        step.targetNotes.forEach(n => {
            const velocity = step.expectedDynamic === "soft" ? 0.45 : (step.expectedDynamic === "loud" ? 1.0 : 0.8);
            this.synth.playNote(n.midi, 1.4, velocity);
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

        // Make sure mic is ready
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

        // Wooden tick beat 3
        if (this.synth) this.synth.playMetronomeClick(false);

        this.countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                this.dom.countdownNumber.textContent = countdown;
                if (this.synth) this.synth.playMetronomeClick(false);
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
        this.dom.countdownStatus.textContent = "PLAY & HOLD";
        this.dom.countdownStage.classList.add("recording");

        // High downbeat click on beat 1
        if (this.synth) {
            this.synth.playMetronomeClick(true);
            
            // Play reference tone simultaneously on the beat ONLY if explicitly enabled
            if (this.playReferenceOnBeat && step.targetNotes.length > 0) {
                step.targetNotes.forEach(n => {
                    this.synth.playNote(n.midi, step.recordDurationSec * 0.9, 0.75);
                });
            }
        }

        // Wait 45ms so the wooden metronome downbeat click does not bleed into the start of the WAV recording
        await new Promise(resolve => setTimeout(resolve, 45));
        if (!this.isRecording) return;

        // Start PCM recording
        await this.recorder.startRecording();

        // Animate circular countdown ring over duration
        const durationMs = (step.recordDurationSec || 2.2) * 1000;
        const startTime = performance.now();
        const circumference = 2 * Math.PI * 52; // ~326.7

        const animateRing = () => {
            if (!this.isRecording) return;
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const offset = circumference * (1 - progress);
            this.dom.countdownRingCircle.style.strokeDashoffset = `${offset}`;

            if (progress < 1) {
                requestAnimationFrame(animateRing);
            }
        };
        requestAnimationFrame(animateRing);

        // Timer for duration end
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

        // Stop recorder and fetch result
        const result = await this.recorder.stopRecording();
        const stats = result.stats;

        // Check audio quality
        let isQuiet = stats.rms < 0.008;
        if (step.category === "silence") {
            isQuiet = false; // Silence is meant to be quiet!
        }

        // Prepare metadata payload
        const metadata = {
            id: step.id,
            stepIndex: this.currentStepIdx,
            category: step.category,
            categoryLabel: step.categoryLabel,
            title: step.title,
            targetNotes: step.targetNotes,
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

        // Save to Server and LocalStorage
        await DatasetStorage.saveSample(metadata, result.base64);

        // Update Review UI with detected note & key verification
        this.dom.recordReviewCard.style.display = "block";
        this.dom.reviewTitle.textContent = isQuiet ? "Recorded (Low Signal Level)" : "Sample Captured & Saved";
        const detSummary = stats.detectedNote
            ? `Detected: ${stats.detectedNote} (Key #${stats.detectedKey61} · ${stats.dominantFreq} Hz)`
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

        // Auto-advance logic
        if (this.autoAdvance && !isQuiet && this.currentStepIdx < this.filteredSteps.length - 1) {
            let delaySec = 1.6;
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
        const idx = this.filteredSteps.findIndex(s => s.id === stepId);
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
            const isRecorded = DatasetStorage.isStepRecorded(step.id);
            const isActive = idx === this.currentStepIdx;

            const pill = document.createElement("button");
            pill.className = `grid-step-pill ${isRecorded ? 'recorded' : ''} ${isActive ? 'active' : ''}`;
            pill.dataset.stepId = step.id;
            
            const checkIcon = isRecorded ? "✓" : (idx + 1);
            pill.innerHTML = `
                <span class="step-mini-num">${checkIcon}</span>
                <span class="step-mini-title">${step.title}</span>
            `;

            pill.addEventListener("click", () => {
                this.jumpToStep(step.id);
            });

            grid.appendChild(pill);
        });

        // Update counts
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
        this.steps.forEach(s => {
            if (DatasetStorage.isStepRecorded(s.id)) count++;
        });
        return count;
    }

    updateTotalProgressBadge() {
        const count = this.getRecordedCount();
        const total = this.steps.length;
        const pct = Math.round((count / total) * 100);

        if (this.dom.progressText) {
            this.dom.progressText.textContent = `${count} / ${total} (${pct}%)`;
        }
        if (this.dom.progressBar) {
            this.dom.progressBar.style.width = `${pct}%`;
        }

        // Header button pill if present
        const badge = document.getElementById("trainerProgressBadge");
        if (badge) {
            badge.textContent = `${count}/${total}`;
            if (count > 0) badge.classList.add("has-progress");
            if (count === total) badge.classList.add("complete");
        }
    }
}
