/**
 * Yousician Piano App — Main Application Controller
 * Coordinates Minimal Conservatory Home, Structured Curriculum (Levels 1–9),
 * Repertoire Song Play-Alongs, 60 FPS Studio Staves, Stereo Headphone Backing Band,
 * Gamified Mastery Progress, and Sheet/MIDI/MusicXML Ingestion.
 */

import { SONG_LIBRARY } from "./songs/library.js";
import { PianoSynthesizer } from "./audio/synth.js";
import { PianoMicrophone } from "./audio/mic.js";
import { MidiInputManager } from "./audio/midi.js";
import { YousicianRenderer } from "./engine/renderer.js";
import { PianoKeyboard } from "./engine/keyboard.js";
import { GameEngine } from "./engine/game.js";
import { PianoFingeringEngine } from "./engine/fingering.js";
import { MidiFileParser } from "./parser/midi.js";
import { MusicXmlParser } from "./parser/musicxml.js";
import { SheetMusicScanner } from "./parser/sheet.js";
import { SongStorage } from "./songs/storage.js";
import { SoundCollectionTrainer } from "./trainer/trainer.js";
import { ProgressManager } from "./gamification/progress.js";
import {
    PIANO_CURRICULUM,
    getPartById,
    getNextPart,
    getAllCurriculumParts
} from "./curriculum/index.js";

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderStarsInlineHtml(earnedStars = 0) {
    const safeStars = Math.max(0, Math.min(3, Math.floor(Number(earnedStars) || 0)));
    let html = `<span class="stars-inline" aria-label="${safeStars} of 3 stars">`;
    for (let i = 1; i <= 3; i++) {
        html += `<span class="star-glyph${i <= safeStars ? " earned" : ""}">★</span>`;
    }
    html += `</span>`;
    return html;
}

function renderCompletionStarsSvgHtml(earnedStars = 0) {
    const safeStars = Math.max(0, Math.min(3, Math.floor(Number(earnedStars) || 0)));
    let html = "";
    for (let i = 1; i <= 3; i++) {
        const earned = i <= safeStars;
        html += `
            <svg class="comp-star-svg${earned ? " earned" : ""}" viewBox="0 0 24 24" fill="${earned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5"></polygon>
            </svg>
        `;
    }
    return html;
}

export class PianoApp {
    constructor() {
        this.synth = new PianoSynthesizer();
        this.canvas = document.getElementById("yousicianCanvas");
        this.renderer = new YousicianRenderer(this.canvas, {
            onToggleHand: (hand) => this.toggleHandPractice(hand)
        });

        // Deduplicated repertoire & custom song list
        this.songs = this._mergeUniqueSongs(SONG_LIBRARY, SongStorage.getLocalSongs());

        // Multi-view & curriculum state
        this.currentView = "home"; // "home" | "learn" | "songs" | "studio"
        this.selectedLevelNumber = 1;
        this.activeCurriculumPartId = null;
        this.collapsedLessonIds = new Set();
        this.songsFilter = "all"; // "all" | "completed" | "in_progress"
        this.songsSearchQuery = "";

        // Gamification & Progress Manager
        this.progress = new ProgressManager({
            curriculum: PIANO_CURRICULUM
        });

        // Initialize selected level to active Continue Learning level if available
        const initialContinue = this.progress.getContinueLearning();
        if (initialContinue && initialContinue.level) {
            const lvNum = typeof initialContinue.level === "object"
                ? initialContinue.level.level
                : Number(initialContinue.level);
            if (lvNum >= 1 && lvNum <= 9) {
                this.selectedLevelNumber = lvNum;
            }
        }

        // Setup bottom 61-key keyboard: C2 (MIDI 36, Key #1) to C7 (MIDI 96, Key #61)
        this.keyboardContainer = document.getElementById("pianoKeyboard");
        this.keyboard = new PianoKeyboard(this.keyboardContainer, {
            startMidi: 36,
            endMidi: 96,
            onKeyPress: (midi) => {
                this.synth.init();
                this.synth.playNote(midi, 0.5);
                this.game.handleUserInputNote(midi, true);
            }
        });

        // Setup Game Engine (with stereo headphone backing + end-of-piece completion callback)
        this.game = new GameEngine(this.renderer, this.keyboard, this.synth, {
            onTimeUpdate: (current, total) => this.updateTimelineUI(current, total),
            onHandChange: (hands) => this.updateHandToggleUI(hands),
            onSongComplete: (summary) => this.handleSongComplete(summary)
        });

        // Setup Microphone Listener for Acoustic Piano (Calibrated 61-Key Polyphonic + Score-Informed)
        this.mic = new PianoMicrophone(this.synth.ctx, {
            onVolume: (vol) => this.updateVuMeter(vol),
            onPitch: (pitchResult) => this.handleDetectedPitch(pitchResult),
            onStatusChange: (status) => this.updateMicStatusUI(status),
            onError: (err) => this.showToast("Microphone access error: " + err.message, "error"),
            getExpectedMidis: () => this.game.getExpectedMidisAtPlayhead()
        });

        // Setup Acoustic Sound Collection & Calibration Trainer
        this.trainer = new SoundCollectionTrainer(this.synth, this.keyboard, this.mic, {
            onProgressUpdate: (done, total) => {
                const text = `${done}/${total}`;
                const badge = document.getElementById("trainerProgressBadge");
                if (badge) badge.textContent = text;
                const homeBadge = document.getElementById("homeTrainerBadge");
                if (homeBadge) homeBadge.textContent = text;
            }
        });

        // Setup MIDI Manager
        this.midi = new MidiInputManager({
            onNoteOn: (midi, vel) => {
                this.updateTunerUI(midi, 0, Math.round(vel * 100));
                this.game.handleUserInputNote(midi, true);
            }
        });
        this.midi.init();

        // Staged parsed files waiting for import
        this.stagedMidiSong = null;
        this.stagedMxmlSong = null;
        this.stagedSheetDataUrl = null;

        // UI DOM references (100% consistent with index.html)
        this.dom = {
            // Top Navigation & Views
            btnBrandHome: document.getElementById("btnBrandHome"),
            navBtnHome: document.getElementById("navBtnHome"),
            navBtnLearn: document.getElementById("navBtnLearn"),
            navBtnSongs: document.getElementById("navBtnSongs"),
            navBtnStudio: document.getElementById("navBtnStudio"),
            viewHome: document.getElementById("viewHome"),
            viewLearn: document.getElementById("viewLearn"),
            viewSongs: document.getElementById("viewSongs"),
            viewStudio: document.getElementById("viewStudio"),
            studioHeaderControls: document.getElementById("studioHeaderControls"),
            studioRightHints: document.getElementById("studioRightHints"),

            // Studio Curriculum Breadcrumb & Mutually Exclusive Piece Controls
            studioCurriculumBar: document.getElementById("studioCurriculumBar"),
            btnBackToLearn: document.getElementById("btnBackToLearn"),
            studioContextLabel: document.getElementById("studioContextLabel"),
            btnStudioNextPart: document.getElementById("btnStudioNextPart"),
            btnStudioFreeMode: document.getElementById("btnStudioFreeMode"),
            studioSongSelectWrap: document.getElementById("studioSongSelectWrap"),

            // Header Gamification Pill
            headerGamificationPill: document.getElementById("headerGamificationPill"),
            headerStreakCount: document.getElementById("headerStreakCount"),
            headerRankBadge: document.getElementById("headerRankBadge"),
            headerXpCount: document.getElementById("headerXpCount"),
            headerXpFill: document.getElementById("headerXpFill"),

            // Home View Elements
            homeRankTitle: document.getElementById("homeRankTitle"),
            homeXpLabel: document.getElementById("homeXpLabel"),
            homeXpBarFill: document.getElementById("homeXpBarFill"),
            homeStreakValue: document.getElementById("homeStreakValue"),
            homeCurriculumPct: document.getElementById("homeCurriculumPct"),
            homeCurriculumSub: document.getElementById("homeCurriculumSub"),
            homeTotalStars: document.getElementById("homeTotalStars"),
            btnContinueLesson: document.getElementById("btnContinueLesson"),
            continueLessonMeta: document.getElementById("continueLessonMeta"),
            heroCardLearn: document.getElementById("heroCardLearn"),
            homeLearnBarFill: document.getElementById("homeLearnBarFill"),
            homeLearnStats: document.getElementById("homeLearnStats"),
            heroCardSongs: document.getElementById("heroCardSongs"),
            homeSongsBarFill: document.getElementById("homeSongsBarFill"),
            homeSongsStats: document.getElementById("homeSongsStats"),
            btnHomeOpenStudio: document.getElementById("btnHomeOpenStudio"),
            btnHomeOpenImport: document.getElementById("btnHomeOpenImport"),
            btnHomeOpenTrainer: document.getElementById("btnHomeOpenTrainer"),
            homeTrainerBadge: document.getElementById("homeTrainerBadge"),
            homeAchievementsRow: document.getElementById("homeAchievementsRow"),

            // Learn View Elements
            learnOverallSummary: document.getElementById("learnOverallSummary"),
            btnLearnContinue: document.getElementById("btnLearnContinue"),
            levelTabsRail: document.getElementById("levelTabsRail"),
            selectedLevelNumberBadge: document.getElementById("selectedLevelNumberBadge"),
            selectedLevelTitle: document.getElementById("selectedLevelTitle"),
            selectedLevelSubtitle: document.getElementById("selectedLevelSubtitle"),
            selectedLevelTags: document.getElementById("selectedLevelTags"),
            selectedLevelStats: document.getElementById("selectedLevelStats"),
            selectedLevelProgressFill: document.getElementById("selectedLevelProgressFill"),
            lessonsListContainer: document.getElementById("lessonsListContainer"),

            // Songs View Elements
            songsOverallSummary: document.getElementById("songsOverallSummary"),
            btnSongsImport: document.getElementById("btnSongsImport"),
            songsFilterAll: document.getElementById("songsFilterAll"),
            songsFilterCompleted: document.getElementById("songsFilterCompleted"),
            songsFilterInProgress: document.getElementById("songsFilterInProgress"),
            songsSearchInput: document.getElementById("songsSearchInput"),
            songsGridContainer: document.getElementById("songsGridContainer"),

            // Studio Controls
            songSelect: document.getElementById("songSelect"),
            btnPlayPause: document.getElementById("btnPlayPause"),
            playIcon: document.getElementById("playIcon"),
            btnRestart: document.getElementById("btnRestart"),
            btnModeFlow: document.getElementById("btnModeFlow"),
            btnModeWait: document.getElementById("btnModeWait"),
            btnHandLeft: document.getElementById("btnHandLeft"),
            btnHandRight: document.getElementById("btnHandRight"),
            handLeftBadge: document.getElementById("handLeftBadge"),
            handRightBadge: document.getElementById("handRightBadge"),
            timelineSlider: document.getElementById("timelineSlider"),
            timeCurrent: document.getElementById("timeCurrent"),
            timeTotal: document.getElementById("timeTotal"),
            tempoSlider: document.getElementById("tempoSlider"),
            tempoReadout: document.getElementById("tempoReadout"),
            btnTempoDown: document.getElementById("btnTempoDown"),
            btnTempoUp: document.getElementById("btnTempoUp"),
            presetPills: document.querySelectorAll(".preset-pills .btn-pill"),
            btnMetronome: document.getElementById("btnMetronome"),
            btnPlayAlongToggle: document.getElementById("btnPlayAlongToggle"),
            playAlongBadge: document.getElementById("playAlongBadge"),
            btnBackingToggle: document.getElementById("btnBackingToggle"),
            backingBadge: document.getElementById("backingBadge"),
            backingVolumeSlider: document.getElementById("backingVolumeSlider"),
            volumeSlider: document.getElementById("volumeSlider"),
            btnMicToggle: document.getElementById("btnMicToggle"),
            micStatusText: document.getElementById("micStatusText"),
            tunerDisplay: document.getElementById("tunerDisplay"),
            tunerNote: document.getElementById("tunerNote"),
            vuBar: document.getElementById("vuBar"),
            tunerCents: document.getElementById("tunerCents"),
            micSensSlider: document.getElementById("micSensSlider"),

            // Completion Modal Elements
            completionModal: document.getElementById("completionModal"),
            btnCloseCompletion: document.getElementById("btnCloseCompletion"),
            compEyebrow: document.getElementById("compEyebrow"),
            compPieceTitle: document.getElementById("compPieceTitle"),
            compStarsRow: document.getElementById("compStarsRow"),
            compUnlockBanner: document.getElementById("compUnlockBanner"),
            compAccuracyVal: document.getElementById("compAccuracyVal"),
            compXpVal: document.getElementById("compXpVal"),
            compTimingVal: document.getElementById("compTimingVal"),
            compScoreVal: document.getElementById("compScoreVal"),
            compRankLabel: document.getElementById("compRankLabel"),
            compRankXpText: document.getElementById("compRankXpText"),
            compRankBarFill: document.getElementById("compRankBarFill"),
            btnCompBack: document.getElementById("btnCompBack"),
            btnCompReplay: document.getElementById("btnCompReplay"),
            btnCompNextPart: document.getElementById("btnCompNextPart"),

            // Import Modal Elements
            btnOpenImport: document.getElementById("btnOpenImport"),
            btnOpenTrainer: document.getElementById("btnOpenTrainer"),
            importModal: document.getElementById("importModal"),
            btnCloseModal: document.getElementById("btnCloseModal"),
            tabBtns: document.querySelectorAll(".tab-btn"),
            tabPanes: document.querySelectorAll(".tab-pane"),
            modalStatus: document.getElementById("modalStatus"),
            modalStatusText: document.getElementById("modalStatusText"),

            // Sheet Tab
            sheetDropzone: document.getElementById("sheetDropzone"),
            sheetFileInput: document.getElementById("sheetFileInput"),
            sheetPreviewContainer: document.getElementById("sheetPreviewContainer"),
            sheetImagePreview: document.getElementById("sheetImagePreview"),
            sheetFileInfo: document.getElementById("sheetFileInfo"),
            btnRemoveSheet: document.getElementById("btnRemoveSheet"),
            geminiApiKeyInput: document.getElementById("geminiApiKeyInput"),
            btnSaveApiKey: document.getElementById("btnSaveApiKey"),
            btnTranscribeSheet: document.getElementById("btnTranscribeSheet"),

            // MIDI Tab
            midiDropzone: document.getElementById("midiDropzone"),
            midiFileInput: document.getElementById("midiFileInput"),
            midiInfoBox: document.getElementById("midiInfoBox"),
            midiSongTitle: document.getElementById("midiSongTitle"),
            midiNoteCount: document.getElementById("midiNoteCount"),
            midiBpm: document.getElementById("midiBpm"),
            btnImportMidi: document.getElementById("btnImportMidi"),

            // MusicXML Tab
            mxmlDropzone: document.getElementById("mxmlDropzone"),
            mxmlFileInput: document.getElementById("mxmlFileInput"),
            mxmlInfoBox: document.getElementById("mxmlInfoBox"),
            mxmlSongTitle: document.getElementById("mxmlSongTitle"),
            mxmlNoteCount: document.getElementById("mxmlNoteCount"),
            mxmlBpm: document.getElementById("mxmlBpm"),
            btnImportMxml: document.getElementById("btnImportMxml"),

            // Composer Tab
            compTitle: document.getElementById("compTitle"),
            compBpm: document.getElementById("compBpm"),
            compTextarea: document.getElementById("compTextarea"),
            btnBuildFromComposer: document.getElementById("btnBuildFromComposer"),
            toastContainer: document.getElementById("appToastContainer")
        };

        if (typeof window !== "undefined") {
            window.showAppToast = (msg, tone) => this.showToast(msg, tone);
        }

        this.init();
    }

    _mergeUniqueSongs(...lists) {
        const byId = new Map();
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            for (const song of list) {
                if (!song || !song.id) continue;
                byId.set(song.id, song);
            }
        }
        return Array.from(byId.values());
    }

    async init() {
        this.populateSongSelector();
        this.bindEvents();
        this.bindNavigationAndCatalogEvents();
        this.bindKeyboardShortcuts();
        this.bindImportModalEvents();

        // Restore saved Gemini API key if present
        try {
            const savedApiKey = typeof localStorage !== "undefined"
                ? localStorage.getItem("yousician_gemini_key")
                : null;
            if (savedApiKey && this.dom.geminiApiKeyInput) {
                this.dom.geminiApiKeyInput.value = savedApiKey;
            }
        } catch (_err) {}

        // Initial render of Minimal Home, Learn, Songs, and Header Gamification Pill
        this.switchView("home");
        this.refreshAllGamificationUI();

        // Fetch server-persisted songs from songs_data/ and deduplicate cleanly
        await this.loadServerSongs();

        // Preload first song into Studio so Free Studio is immediately ready
        if (this.songs.length > 0) {
            this.loadSongById(this.songs[0].id);
        }
    }

    async loadServerSongs() {
        try {
            const serverSongs = await SongStorage.fetchServerSongs();
            if (serverSongs && serverSongs.length > 0) {
                this.songs = this._mergeUniqueSongs(this.songs, serverSongs);
                this.populateSongSelector();
                this.refreshAllGamificationUI();
            }
        } catch (e) {
            console.warn("Could not load server songs:", e);
        }
    }

    populateSongSelector() {
        if (!this.dom.songSelect) return;
        this.dom.songSelect.innerHTML = "";
        this.songs.forEach((song) => {
            const opt = document.createElement("option");
            opt.value = song.id;
            opt.textContent = `${song.title}${song.artist ? " — " + song.artist : ""}`;
            this.dom.songSelect.appendChild(opt);
        });
    }

    /* ======================================================================
       Multi-View Routing & Curriculum / Repertoire Launchers
       ====================================================================== */

    switchView(viewName) {
        const target = ["home", "learn", "songs", "studio"].includes(viewName) ? viewName : "home";

        if (this.currentView !== target) {
            this.clearToasts();
        }

        if (this.currentView === "studio" && target !== "studio" && this.game && this.game.isPlaying) {
            this.game.pause();
            if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
        }

        this.currentView = target;
        if (typeof document !== "undefined" && document.body) {
            document.body.dataset.activeView = target;
        }

        // Toggle view containers (#viewHome and #viewStudio use flex layout)
        if (this.dom.viewHome) this.dom.viewHome.style.display = target === "home" ? "flex" : "none";
        if (this.dom.viewLearn) this.dom.viewLearn.style.display = target === "learn" ? "block" : "none";
        if (this.dom.viewSongs) this.dom.viewSongs.style.display = target === "songs" ? "block" : "none";
        if (this.dom.viewStudio) this.dom.viewStudio.style.display = target === "studio" ? "flex" : "none";

        // Toggle nav pill active states
        const navMap = {
            home: this.dom.navBtnHome,
            learn: this.dom.navBtnLearn,
            songs: this.dom.navBtnSongs,
            studio: this.dom.navBtnStudio
        };
        for (const [k, btn] of Object.entries(navMap)) {
            if (btn) btn.classList.toggle("active", k === target);
        }

        // Show Studio-specific header tools only inside Studio view
        const inStudio = target === "studio";
        if (this.dom.studioHeaderControls) {
            this.dom.studioHeaderControls.style.display = inStudio ? "flex" : "none";
        }
        if (this.dom.studioRightHints) {
            this.dom.studioRightHints.style.display = inStudio ? "inline-flex" : "none";
        }

        if (target === "home") {
            this.refreshHomeView();
        } else if (target === "learn") {
            this.renderLearnView();
        } else if (target === "songs") {
            this.renderSongsView();
        } else if (target === "studio") {
            this.updateStudioCurriculumBar();
            this.renderer.resize();
            this.game.renderCurrentFrame();
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(() => {
                    this.renderer.resize();
                    this.game.renderCurrentFrame();
                });
            }
        }
    }

    _resolvePartEntry(partId) {
        if (!partId) return null;
        const found = getPartById(partId);
        if (!found || !found.part) return null;

        let levelObj = null;
        let levelNum = 1;
        if (typeof found.level === "object" && found.level !== null) {
            levelObj = found.level;
            levelNum = found.level.level || 1;
        } else {
            levelNum = Number(found.level) || found.part.level || 1;
            levelObj = PIANO_CURRICULUM.find((l) => l.level === levelNum) || { level: levelNum, title: `Level ${levelNum}` };
        }
        return {
            levelObj,
            levelNum,
            lesson: found.lesson,
            part: found.part
        };
    }

    startCurriculumPart(partId) {
        const entry = this._resolvePartEntry(partId);
        if (!entry || !entry.part || !entry.part.song) {
            this.showToast("Curriculum part could not be found.", "error");
            return;
        }

        this.closeCompletionModal();
        if (this.game.isPlaying) {
            this.game.pause();
        }

        this.activeCurriculumPartId = entry.part.id;
        this.selectedLevelNumber = entry.levelNum;
        this.progress.setLastPlayedPart(entry.part.id);

        const partSong = entry.part.song;
        PianoFingeringEngine.ensureSongFingering(partSong);

        const targetHands = entry.part.targetHands || { left: true, right: true };
        this.game.setTempoMultiplier(1.0);
        this.game.loadSong(partSong, { activeHands: targetHands });
        this.updateHandToggleUI(this.game.getActiveHands());

        if (this.dom.tempoSlider) {
            this.dom.tempoSlider.value = Math.round(partSong.bpm || 100);
        }
        if (this.dom.presetPills) {
            this.dom.presetPills.forEach((p) => {
                p.classList.toggle("active", p.dataset.mult === "1.0");
            });
        }
        this.updateTempoUI();
        if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";

        this.refreshHeaderGamification();
        this.clearToasts();
        this.switchView("studio");
    }

    startSongPlayAlong(songId) {
        this.clearToasts();
        this.closeCompletionModal();
        if (this.game.isPlaying) {
            this.game.pause();
        }

        this.activeCurriculumPartId = null;
        if (this.dom.songSelect) {
            this.dom.songSelect.value = songId;
        }
        this.loadSongById(songId, { activeHands: { left: true, right: true } });
        this.switchView("studio");
    }

    updateStudioCurriculumBar() {
        const entry = this.activeCurriculumPartId
            ? this._resolvePartEntry(this.activeCurriculumPartId)
            : null;
        const inCurriculumMode = Boolean(entry);

        if (this.dom.studioCurriculumBar) {
            this.dom.studioCurriculumBar.style.display = inCurriculumMode ? "inline-flex" : "none";
        }
        if (this.dom.studioSongSelectWrap) {
            this.dom.studioSongSelectWrap.style.display = inCurriculumMode ? "none" : "flex";
        }
        if (this.dom.btnOpenImport) {
            this.dom.btnOpenImport.style.display = inCurriculumMode ? "none" : "inline-flex";
        }

        if (!inCurriculumMode) {
            return;
        }

        const totalPartsInLesson = entry.lesson?.parts?.length || 3;
        const lessonOrder = entry.lesson?.order || 1;
        const cleanPartTitle = String(entry.part.title || "")
            .replace(/\s*\(Level\s+\d+[^)]*\)\s*$/i, "")
            .trim();
        if (this.dom.studioContextLabel) {
            this.dom.studioContextLabel.textContent = cleanPartTitle
                ? `Lv ${entry.levelNum} · Lesson ${lessonOrder} · Part ${entry.part.partNumber}/${totalPartsInLesson} — ${cleanPartTitle}`
                : `Lv ${entry.levelNum} · Lesson ${lessonOrder} · Part ${entry.part.partNumber}/${totalPartsInLesson}`;
            this.dom.studioContextLabel.title = `${entry.lesson?.title || ""} — ${entry.part.title}`;
        }

        const nextEntry = getNextPart(entry.part.id);
        if (this.dom.btnStudioNextPart) {
            this.dom.btnStudioNextPart.disabled = !nextEntry;
            this.dom.btnStudioNextPart.title = nextEntry
                ? `Next: ${nextEntry.part.title}`
                : "Final part of Level 9 reached";
        }
    }

    /* ======================================================================
       Gamification Views Rendering (Header, Home, Learn, Songs, Completion)
       ====================================================================== */

    refreshAllGamificationUI() {
        this.refreshHeaderGamification();
        this.refreshHomeView();
        if (this.currentView === "learn") {
            this.renderLearnView();
        } else if (this.currentView === "songs") {
            this.renderSongsView();
        }
        this.updateStudioCurriculumBar();
    }

    refreshHeaderGamification() {
        const summary = this.progress.getSummary(this.songs);
        const streakDays = summary.streak.streakDays;

        if (this.dom.headerStreakCount) {
            this.dom.headerStreakCount.textContent = `${streakDays}d`;
        }
        if (this.dom.headerRankBadge) {
            this.dom.headerRankBadge.textContent = summary.rank.title;
        }
        if (this.dom.headerXpCount) {
            this.dom.headerXpCount.textContent = `${summary.totalXp.toLocaleString()} XP`;
        }
        if (this.dom.headerXpFill) {
            this.dom.headerXpFill.style.width = `${summary.rank.progressPercent}%`;
        }
    }

    refreshHomeView() {
        const summary = this.progress.getSummary(this.songs);
        const { rank, streak, curriculum, songs, continueLearning, achievements } = summary;

        if (this.dom.homeRankTitle) {
            this.dom.homeRankTitle.textContent = rank.title;
        }
        if (this.dom.homeXpLabel) {
            this.dom.homeXpLabel.textContent = rank.isMaxRank
                ? `${summary.totalXp.toLocaleString()} XP · Max Conservatory Rank`
                : `${summary.totalXp.toLocaleString()} / ${rank.nextXp.toLocaleString()} XP to ${rank.nextTitle}`;
        }
        if (this.dom.homeXpBarFill) {
            this.dom.homeXpBarFill.style.width = `${rank.progressPercent}%`;
        }

        const sDays = streak.streakDays;
        if (this.dom.homeStreakValue) {
            this.dom.homeStreakValue.textContent = sDays === 1 ? "1 day" : `${sDays} days`;
        }
        if (this.dom.homeCurriculumPct) {
            this.dom.homeCurriculumPct.textContent = `${curriculum.completionPercent}%`;
        }
        if (this.dom.homeCurriculumSub) {
            this.dom.homeCurriculumSub.textContent = `${curriculum.completedParts}/${curriculum.totalParts} parts`;
        }
        if (this.dom.homeTotalStars) {
            this.dom.homeTotalStars.textContent = `${summary.totalStars} ★`;
        }

        if (this.dom.continueLessonMeta) {
            if (continueLearning && continueLearning.part) {
                const lvNum = continueLearning.level?.level || continueLearning.part.level || 1;
                const lOrd = continueLearning.lesson?.order || 1;
                this.dom.continueLessonMeta.textContent =
                    `Lv ${lvNum} · Lesson ${lOrd} · ${continueLearning.part.title}`;
            } else {
                this.dom.continueLessonMeta.textContent = "Start Level 1 Foundations";
            }
        }

        if (this.dom.homeLearnBarFill) {
            this.dom.homeLearnBarFill.style.width = `${curriculum.completionPercent}%`;
        }
        if (this.dom.homeLearnStats) {
            this.dom.homeLearnStats.textContent =
                `Level ${curriculum.activeLevel} Active · ${curriculum.completedParts} / ${curriculum.totalParts} Parts Completed`;
        }

        if (this.dom.homeSongsBarFill) {
            this.dom.homeSongsBarFill.style.width = `${songs.completionPercent}%`;
        }
        if (this.dom.homeSongsStats) {
            this.dom.homeSongsStats.textContent =
                `${songs.completedSongs} / ${songs.totalSongs} Songs Mastered · ${songs.earnedStars} ★ Earned`;
        }

        if (this.dom.homeAchievementsRow) {
            this.dom.homeAchievementsRow.innerHTML = achievements.map((ach) => `
                <span class="achievement-chip${ach.unlocked ? " unlocked" : ""}" title="${escapeHtml(ach.title)} — ${escapeHtml(ach.description)}">
                    <span class="achievement-dot" aria-hidden="true"></span>
                    <span>${escapeHtml(ach.title)}</span>
                </span>
            `).join("");
        }
    }

    renderLearnView() {
        if (!this.dom.levelTabsRail || !this.dom.lessonsListContainer) return;

        const currSummary = this.progress.getCurriculumSummary();
        if (this.dom.learnOverallSummary) {
            this.dom.learnOverallSummary.textContent =
                `${currSummary.completedLevels}/${currSummary.totalLevels} Levels · ${currSummary.completedParts}/${currSummary.totalParts} Parts · ${currSummary.earnedStars} ★`;
        }

        // 1. Render Level 1–9 Tabs Rail
        this.dom.levelTabsRail.innerHTML = PIANO_CURRICULUM.map((lv) => {
            const lvProg = this.progress.getLevelProgress(lv.level);
            const isSelected = lv.level === this.selectedLevelNumber;
            const ringLabel = lvProg.completed ? "✓" : `${lvProg.progressPercent}%`;
            const shortTabTitle = String(lv.title || "")
                .replace(/\s*\([^)]*\)/g, "")
                .split(/\s*(?:&|,|:|—|–)\s*/)[0]
                .trim() || lv.title;
            return `
                <button
                    type="button"
                    role="tab"
                    aria-selected="${isSelected ? "true" : "false"}"
                    title="Level ${lv.level}: ${escapeHtml(lv.title)}"
                    class="level-tab-btn${isSelected ? " active" : ""}${lvProg.completed ? " completed" : ""}"
                    data-level-num="${lv.level}">
                    <span class="level-tab-top">
                        <span class="level-tab-num">Lv ${lv.level}</span>
                        <span class="level-tab-ring">${ringLabel}</span>
                    </span>
                    <span class="level-tab-name">${escapeHtml(shortTabTitle)}</span>
                    <span class="level-tab-count">${lvProg.completedParts}/${lvProg.totalParts} parts</span>
                </button>
            `;
        }).join("");

        // 2. Render Selected Level Banner
        const activeLevelObj = PIANO_CURRICULUM.find((l) => l.level === this.selectedLevelNumber) || PIANO_CURRICULUM[0];
        if (!activeLevelObj) return;

        const lvProg = this.progress.getLevelProgress(activeLevelObj.level);
        if (this.dom.selectedLevelNumberBadge) {
            this.dom.selectedLevelNumberBadge.textContent = lvProg.completed
                ? `Level ${activeLevelObj.level} · Complete ✓`
                : `Level ${activeLevelObj.level}`;
        }
        if (this.dom.selectedLevelTitle) {
            this.dom.selectedLevelTitle.textContent = activeLevelObj.title || `Level ${activeLevelObj.level}`;
        }
        if (this.dom.selectedLevelSubtitle) {
            this.dom.selectedLevelSubtitle.textContent = activeLevelObj.subtitle || "";
        }
        if (this.dom.selectedLevelTags) {
            const tags = Array.isArray(activeLevelObj.focusTags) ? activeLevelObj.focusTags : [];
            this.dom.selectedLevelTags.innerHTML = tags
                .map((t) => `<span class="focus-tag-chip">${escapeHtml(t)}</span>`)
                .join("");
        }
        if (this.dom.selectedLevelStats) {
            this.dom.selectedLevelStats.textContent =
                `${lvProg.completedLessons} / ${lvProg.totalLessons} Lessons · ${lvProg.stars} / ${lvProg.maxStars} ★`;
        }
        if (this.dom.selectedLevelProgressFill) {
            this.dom.selectedLevelProgressFill.style.width = `${lvProg.progressPercent}%`;
        }

        // 3. Render Lessons & Multi-Part Rows
        const lessons = Array.isArray(activeLevelObj.lessons) ? activeLevelObj.lessons : [];
        this.dom.lessonsListContainer.innerHTML = lessons.map((lesson, idx) => {
            const lProg = this.progress.getLessonProgress(lesson.id);
            const isCollapsed = this.collapsedLessonIds.has(lesson.id);
            const orderStr = String(lesson.order || idx + 1).padStart(2, "0");
            const focusLabel = lesson.modeFocus === "solo"
                ? "Solo"
                : (lesson.modeFocus === "chords" ? "Chords" : "Chords & Solo");
            const focusClass = lesson.modeFocus === "solo"
                ? "type-solo"
                : (lesson.modeFocus === "chords" ? "type-chords" : "type-combined");

            const statusText = lProg.completed
                ? `✓ Lesson Complete · ★ ${lProg.stars}/${lProg.maxStars}`
                : `${lProg.completedParts}/${lProg.totalParts} Parts · ★ ${lProg.stars}/${lProg.maxStars}`;

            const partsHtml = (lesson.parts || []).map((part) => {
                const pProg = this.progress.getPartProgress(part.id);
                const pTypeLabel = part.partType === "solo"
                    ? "Solo"
                    : (part.partType === "chords" ? "Chords" : "Combined");
                const pTypeClass = part.partType === "solo"
                    ? "type-solo"
                    : (part.partType === "chords" ? "type-chords" : "type-combined");

                const hands = part.targetHands || { left: true, right: true };
                const handTag = hands.left && hands.right ? "LH+RH" : (hands.left ? "LH" : "RH");
                const keySig = part.song?.keySignature || "C";
                const bpm = Math.round(part.song?.bpm || 90);
                const accDisplay = pProg.bestAccuracy > 0
                    ? `${Math.round(pProg.bestAccuracy)}%`
                    : (pProg.completed ? "Done" : "—");

                return `
                    <div class="part-row" data-part-id="${escapeHtml(part.id)}">
                        <div class="part-row-left">
                            <button
                                type="button"
                                class="btn-complete-check${pProg.completed ? " checked" : ""}"
                                data-toggle-part="${escapeHtml(part.id)}"
                                aria-label="Mark ${escapeHtml(part.title)} complete"
                                title="${pProg.completed ? "Completed (Click to unmark)" : "Mark part as completed"}">✓</button>
                            <div class="part-text-group">
                                <div class="part-title-row">
                                    <span class="part-index-label">Part ${part.partNumber}</span>
                                    <span class="part-title-text">${escapeHtml(part.title)}</span>
                                    <span class="part-type-pill ${pTypeClass}">${pTypeLabel}</span>
                                    <span class="meta-micro-pill">${handTag} · Key ${escapeHtml(keySig)} · ${bpm} BPM</span>
                                </div>
                                ${part.subtitle ? `<span class="part-sub-text">${escapeHtml(part.subtitle)}</span>` : ""}
                            </div>
                        </div>
                        <div class="part-row-right">
                            ${renderStarsInlineHtml(pProg.stars)}
                            <span class="accuracy-tag${pProg.bestAccuracy >= 90 ? " high" : ""}">${accDisplay}</span>
                            <button
                                type="button"
                                class="btn-practice-part"
                                data-practice-part="${escapeHtml(part.id)}">${pProg.completed ? "Replay" : "Practice"}</button>
                        </div>
                    </div>
                `;
            }).join("");

            return `
                <article class="lesson-card${lProg.completed ? " lesson-complete" : ""}${isCollapsed ? " collapsed" : ""}" data-lesson-card="${escapeHtml(lesson.id)}">
                    <div class="lesson-card-header" data-toggle-lesson-collapse="${escapeHtml(lesson.id)}">
                        <div class="lesson-header-left">
                            <span class="lesson-order-badge">${lProg.completed ? "✓" : orderStr}</span>
                            <div class="lesson-title-wrap">
                                <div class="lesson-title-line">
                                    <h3 class="lesson-title">${escapeHtml(lesson.title)}</h3>
                                    <span class="part-type-pill ${focusClass}">${focusLabel}</span>
                                </div>
                                <p class="lesson-desc">${escapeHtml(lesson.description || "")}</p>
                            </div>
                        </div>
                        <div class="lesson-header-right">
                            <span class="lesson-status-pill${lProg.completed ? " complete" : ""}">${statusText}</span>
                            <span class="lesson-chevron" aria-hidden="true">▾</span>
                        </div>
                    </div>
                    <div class="lesson-parts-list">
                        ${partsHtml}
                    </div>
                </article>
            `;
        }).join("");
    }

    _describeSongTexture(song) {
        const notes = Array.isArray(song?.notes) ? song.notes : [];
        let hasLeft = false;
        let hasRight = false;
        let hasSimultaneousChord = false;

        const sorted = [...notes].sort((a, b) => a.time - b.time);
        for (let i = 0; i < sorted.length; i++) {
            const n = sorted[i];
            if (n.hand === "left" || n.clef === "bass") hasLeft = true;
            else hasRight = true;
            if (i > 0 && Math.abs(sorted[i].time - sorted[i - 1].time) <= 0.055) {
                hasSimultaneousChord = true;
            }
        }

        if (hasLeft && hasRight && hasSimultaneousChord) return "Two-Hand & Chords";
        if (hasLeft && hasRight) return "Two-Hand";
        if (hasSimultaneousChord) return "Chords";
        return "Solo Melody";
    }

    renderSongsView() {
        if (!this.dom.songsGridContainer) return;

        const songsSummary = this.progress.getSongsSummary(this.songs);
        if (this.dom.songsOverallSummary) {
            this.dom.songsOverallSummary.textContent =
                `${this.songs.length} Pieces · ${songsSummary.completedSongs} Completed · ${songsSummary.earnedStars} ★`;
        }

        const q = this.songsSearchQuery.trim().toLowerCase();
        const filtered = this.songs.filter((song) => {
            const prog = this.progress.getSongProgress(song.id);
            if (this.songsFilter === "completed" && !prog.completed) return false;
            if (this.songsFilter === "in_progress" && (prog.completed || prog.attempts === 0)) return false;

            if (q) {
                const hay = `${song.title || ""} ${song.artist || ""} ${song.keySignature || ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            this.dom.songsGridContainer.innerHTML = `
                <div class="songs-empty-state">
                    No pieces match this filter yet. Try switching filters or importing a new score.
                </div>
            `;
            return;
        }

        this.dom.songsGridContainer.innerHTML = filtered.map((song) => {
            const prog = this.progress.getSongProgress(song.id);
            const ts = Array.isArray(song.timeSignature) && song.timeSignature.length === 2
                ? `${song.timeSignature[0]}/${song.timeSignature[1]}`
                : `${song.beatsPerMeasure || 4}/4`;
            const keySig = song.keySignature || "C";
            const bpm = Math.round(song.bpm || 100);
            const noteCount = Array.isArray(song.notes) ? song.notes.length : 0;
            const texture = this._describeSongTexture(song);

            const bestText = prog.bestAccuracy > 0
                ? `Best Accuracy: <strong>${Math.round(prog.bestAccuracy)}%</strong>`
                : (prog.completed ? `Status: <strong>Completed</strong>` : "Ready for play-along");

            return `
                <article class="song-card${prog.completed ? " song-completed" : ""}" data-song-card="${escapeHtml(song.id)}">
                    <div class="song-card-top">
                        <div class="song-card-heading">
                            <button
                                type="button"
                                class="btn-complete-check${prog.completed ? " checked" : ""}"
                                data-toggle-song="${escapeHtml(song.id)}"
                                aria-label="Mark ${escapeHtml(song.title)} complete"
                                title="${prog.completed ? "Completed (Click to unmark)" : "Mark song as completed"}">✓</button>
                            <div class="song-card-titles">
                                <h3 class="song-card-title">${escapeHtml(song.title)}</h3>
                                <span class="song-card-artist">${escapeHtml(song.artist || "Conservatory Arrangement")}</span>
                            </div>
                        </div>
                        ${renderStarsInlineHtml(prog.stars)}
                    </div>

                    <div class="song-card-badges">
                        <span class="song-meta-chip">Key ${escapeHtml(keySig)}</span>
                        <span class="song-meta-chip">${ts}</span>
                        <span class="song-meta-chip">${bpm} BPM</span>
                        <span class="song-meta-chip">${noteCount} notes</span>
                        <span class="song-meta-chip">${texture}</span>
                        <span class="song-meta-chip chip-backing">Headphone Band</span>
                    </div>

                    <div class="song-card-footer">
                        <span class="song-best-label">${bestText}</span>
                        <button
                            type="button"
                            class="btn-practice-part"
                            data-play-song="${escapeHtml(song.id)}">Play Along</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    handleSongComplete(summary) {
        if (!summary) return;
        if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";

        const isCurriculum = Boolean(this.activeCurriculumPartId);
        let result = null;
        let eyebrowText = "Song Play-Along Complete";
        let titleText = summary.song?.title || "Piece Complete";
        let nextPartEntry = null;

        if (isCurriculum) {
            const entry = this._resolvePartEntry(this.activeCurriculumPartId);
            result = this.progress.recordPartCompletion(this.activeCurriculumPartId, summary);
            if (entry) {
                const lessonOrd = entry.lesson?.order || 1;
                eyebrowText = `Level ${entry.levelNum} · Lesson ${lessonOrd} · Part ${entry.part.partNumber} Complete`;
                titleText = entry.part.title;
                nextPartEntry = getNextPart(entry.part.id);
            }
        } else {
            const songId = summary.song?.id || "custom_piece";
            result = this.progress.recordSongCompletion(songId, summary);
        }

        this.refreshAllGamificationUI();
        if (!result || !this.dom.completionModal) return;

        if (this.dom.compEyebrow) this.dom.compEyebrow.textContent = eyebrowText;
        if (this.dom.compPieceTitle) this.dom.compPieceTitle.textContent = titleText;
        if (this.dom.compStarsRow) {
            this.dom.compStarsRow.innerHTML = renderCompletionStarsSvgHtml(result.earnedStars);
        }

        // Celebration unlock banner
        const unlockMessages = [];
        if (result.newlyCompletedLevel) {
            unlockMessages.push(`Level ${result.newlyCompletedLevel.level} Mastered — All Lessons Complete`);
        } else if (result.newlyCompletedLesson) {
            unlockMessages.push(`Lesson Complete: ${result.newlyCompletedLesson.lesson.title}`);
        }
        if (result.rankUp) {
            unlockMessages.push(`Rank Achieved: ${result.rankUp.currentRank.title}`);
        }
        if (Array.isArray(result.newAchievements) && result.newAchievements.length > 0) {
            unlockMessages.push(`Milestone: ${result.newAchievements[0].title}`);
        }

        if (this.dom.compUnlockBanner) {
            if (unlockMessages.length > 0) {
                this.dom.compUnlockBanner.textContent = unlockMessages.join(" · ");
                this.dom.compUnlockBanner.style.display = "block";
            } else {
                this.dom.compUnlockBanner.style.display = "none";
            }
        }

        if (this.dom.compAccuracyVal) {
            this.dom.compAccuracyVal.textContent = `${Math.round(summary.accuracy || 0)}%`;
        }
        if (this.dom.compXpVal) {
            this.dom.compXpVal.textContent = `+${result.xpEarned} XP`;
        }
        if (this.dom.compTimingVal) {
            this.dom.compTimingVal.textContent = `${summary.perfectCount || 0} Perfect · ${summary.goodCount || 0} Early/Late`;
        }
        if (this.dom.compScoreVal) {
            this.dom.compScoreVal.textContent = (summary.score || 0).toLocaleString();
        }

        const rk = result.rankInfo;
        if (this.dom.compRankLabel) {
            this.dom.compRankLabel.textContent = rk.title;
        }
        if (this.dom.compRankXpText) {
            this.dom.compRankXpText.textContent = rk.isMaxRank
                ? `${result.totalXp.toLocaleString()} XP · Max Rank`
                : `${result.totalXp.toLocaleString()} / ${rk.nextXp.toLocaleString()} XP`;
        }
        if (this.dom.compRankBarFill) {
            this.dom.compRankBarFill.style.width = `${rk.progressPercent}%`;
        }

        if (this.dom.btnCompBack) {
            this.dom.btnCompBack.textContent = isCurriculum ? "Back to Learn" : "Back to Songs";
        }
        if (this.dom.btnCompNextPart) {
            if (isCurriculum && nextPartEntry && nextPartEntry.part) {
                this.dom.btnCompNextPart.style.display = "inline-flex";
                this.dom.btnCompNextPart.dataset.nextPartId = nextPartEntry.part.id;
            } else {
                this.dom.btnCompNextPart.style.display = "none";
                this.dom.btnCompNextPart.dataset.nextPartId = "";
            }
        }

        this.clearToasts();
        this.dom.completionModal.style.display = "flex";
    }

    closeCompletionModal() {
        if (this.dom && this.dom.completionModal) {
            this.dom.completionModal.style.display = "none";
        }
    }

    bindNavigationAndCatalogEvents() {
        // Header Brand & Primary View Switcher
        this.dom.btnBrandHome?.addEventListener("click", () => this.switchView("home"));
        this.dom.navBtnHome?.addEventListener("click", () => this.switchView("home"));
        this.dom.navBtnLearn?.addEventListener("click", () => this.switchView("learn"));
        this.dom.navBtnSongs?.addEventListener("click", () => this.switchView("songs"));
        this.dom.navBtnStudio?.addEventListener("click", () => this.switchView("studio"));
        this.dom.headerGamificationPill?.addEventListener("click", () => {
            this.switchView(this.currentView === "home" ? "learn" : "home");
        });

        // Studio Curriculum Breadcrumb Controls
        this.dom.btnBackToLearn?.addEventListener("click", () => this.switchView("learn"));
        this.dom.btnStudioNextPart?.addEventListener("click", () => {
            if (!this.activeCurriculumPartId) return;
            const next = getNextPart(this.activeCurriculumPartId);
            if (next && next.part) {
                this.startCurriculumPart(next.part.id);
            }
        });
        this.dom.btnStudioFreeMode?.addEventListener("click", () => {
            if (this.game.isPlaying) {
                this.game.pause();
                if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
            }
            this.activeCurriculumPartId = null;
            const fallbackSongId = this.dom.songSelect?.value || this.songs[0]?.id;
            if (fallbackSongId) {
                this.loadSongById(fallbackSongId, { activeHands: { left: true, right: true } });
            }
            this.updateStudioCurriculumBar();
            this.renderer.resize();
            this.game.renderCurrentFrame();
        });

        // Home View Hero & Quick-Utility Actions
        const launchContinueLesson = () => {
            const target = this.progress.getContinueLearning();
            if (target && target.part) {
                this.startCurriculumPart(target.part.id);
            } else {
                const allParts = getAllCurriculumParts();
                if (allParts.length > 0) {
                    this.startCurriculumPart(allParts[0].part.id);
                } else {
                    this.switchView("learn");
                }
            }
        };

        this.dom.btnContinueLesson?.addEventListener("click", launchContinueLesson);
        this.dom.btnLearnContinue?.addEventListener("click", launchContinueLesson);
        this.dom.heroCardLearn?.addEventListener("click", () => this.switchView("learn"));
        this.dom.heroCardSongs?.addEventListener("click", () => this.switchView("songs"));
        this.dom.btnHomeOpenStudio?.addEventListener("click", () => {
            if (this.activeCurriculumPartId) {
                this.activeCurriculumPartId = null;
                const songId = this.dom.songSelect?.value || this.songs[0]?.id;
                if (songId) {
                    this.loadSongById(songId, { activeHands: { left: true, right: true } });
                }
            }
            this.switchView("studio");
        });
        this.dom.btnHomeOpenImport?.addEventListener("click", () => this.openModal());
        this.dom.btnHomeOpenTrainer?.addEventListener("click", () => {
            if (this.game.isPlaying) {
                this.game.pause();
                if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
            }
            this.clearToasts();
            this.trainer.open();
        });

        // Learn View Event Delegation (Level Tabs + Lesson Collapse + Part Checkmarks + Part Practice)
        this.dom.levelTabsRail?.addEventListener("click", (e) => {
            const tabBtn = e.target.closest("[data-level-num]");
            if (!tabBtn) return;
            this.selectedLevelNumber = Number(tabBtn.dataset.levelNum) || 1;
            this.renderLearnView();
        });

        this.dom.lessonsListContainer?.addEventListener("click", (e) => {
            const togglePartBtn = e.target.closest("[data-toggle-part]");
            if (togglePartBtn) {
                e.stopPropagation();
                const partId = togglePartBtn.dataset.togglePart;
                const res = this.progress.toggleManualComplete(partId, "part");
                this.refreshAllGamificationUI();
                if (res) {
                    this.showToast(
                        res.completed ? "Marked lesson part complete." : "Unmarked lesson part.",
                        "success"
                    );
                }
                return;
            }

            const practiceBtn = e.target.closest("[data-practice-part]");
            if (practiceBtn) {
                e.stopPropagation();
                this.startCurriculumPart(practiceBtn.dataset.practicePart);
                return;
            }

            const collapseHeader = e.target.closest("[data-toggle-lesson-collapse]");
            if (collapseHeader) {
                const lessonId = collapseHeader.dataset.toggleLessonCollapse;
                if (this.collapsedLessonIds.has(lessonId)) {
                    this.collapsedLessonIds.delete(lessonId);
                } else {
                    this.collapsedLessonIds.add(lessonId);
                }
                this.renderLearnView();
            }
        });

        // Songs View Filter, Search, Import & Card Delegation
        const filterButtons = [
            this.dom.songsFilterAll,
            this.dom.songsFilterCompleted,
            this.dom.songsFilterInProgress
        ].filter(Boolean);

        filterButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                this.songsFilter = btn.dataset.filter || "all";
                filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
                this.renderSongsView();
            });
        });

        this.dom.songsSearchInput?.addEventListener("input", (e) => {
            this.songsSearchQuery = e.target.value || "";
            this.renderSongsView();
        });

        this.dom.btnSongsImport?.addEventListener("click", () => this.openModal());

        this.dom.songsGridContainer?.addEventListener("click", (e) => {
            const toggleSongBtn = e.target.closest("[data-toggle-song]");
            if (toggleSongBtn) {
                e.stopPropagation();
                const songId = toggleSongBtn.dataset.toggleSong;
                const res = this.progress.toggleManualComplete(songId, "song");
                this.refreshAllGamificationUI();
                if (res) {
                    this.showToast(
                        res.completed ? "Marked piece complete." : "Unmarked piece.",
                        "success"
                    );
                }
                return;
            }

            const playSongBtn = e.target.closest("[data-play-song]");
            if (playSongBtn) {
                this.startSongPlayAlong(playSongBtn.dataset.playSong);
            }
        });

        // Completion Modal Actions
        this.dom.btnCloseCompletion?.addEventListener("click", () => this.closeCompletionModal());
        this.dom.completionModal?.addEventListener("click", (e) => {
            if (e.target === this.dom.completionModal) this.closeCompletionModal();
        });
        this.dom.btnCompBack?.addEventListener("click", () => {
            const dest = this.activeCurriculumPartId ? "learn" : "songs";
            this.closeCompletionModal();
            this.switchView(dest);
        });
        this.dom.btnCompReplay?.addEventListener("click", () => {
            this.closeCompletionModal();
            this.game.restart();
            this.updateTimelineUI(this.game.currentTime, this.game.songDuration);
            this.synth.init();
            this.game.play();
            if (this.dom.playIcon) this.dom.playIcon.textContent = "⏸";
        });
        this.dom.btnCompNextPart?.addEventListener("click", () => {
            const nextId = this.dom.btnCompNextPart?.dataset.nextPartId;
            if (nextId) {
                this.startCurriculumPart(nextId);
            }
        });
    }

    /* ======================================================================
       Studio Playback, Audio Split & Score Loading
       ====================================================================== */

    loadSongById(songId, options = {}) {
        const song = this.songs.find((s) => s.id === songId) || this.songs[0];
        if (!song) return;

        PianoFingeringEngine.ensureSongFingering(song);
        if (this.dom.songSelect) {
            this.dom.songSelect.title = song.artist ? `${song.title} — ${song.artist}` : song.title;
        }
        this.game.setTempoMultiplier(1.0);
        this.game.loadSong(song, options);
        this.updateHandToggleUI(this.game.getActiveHands());

        if (this.dom.tempoSlider) {
            this.dom.tempoSlider.value = Math.round(song.bpm || 100);
        }
        if (this.dom.presetPills) {
            this.dom.presetPills.forEach((p) => {
                p.classList.toggle("active", p.dataset.mult === "1.0");
            });
        }
        this.updateTempoUI();
        if (this.dom.playIcon) {
            this.dom.playIcon.textContent = "▶";
        }
    }

    formatTime(seconds) {
        if (seconds < -0.02) {
            const absSec = Math.ceil(Math.abs(seconds));
            const m = Math.floor(absSec / 60);
            const s = absSec % 60;
            return `-${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }
        const safeSec = Math.max(0, seconds);
        const m = Math.floor(safeSec / 60);
        const s = Math.floor(safeSec % 60);
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    updateTimelineUI(current, total) {
        if (this.dom.timeCurrent) this.dom.timeCurrent.textContent = this.formatTime(current);
        if (this.dom.timeTotal) this.dom.timeTotal.textContent = this.formatTime(total);
        const startTime = (this.game && typeof this.game.startTime === "number") ? this.game.startTime : 0;
        const span = total - startTime;
        if (span > 0 && this.dom.timelineSlider) {
            const progress = Math.max(0, Math.min(1, (current - startTime) / span));
            this.dom.timelineSlider.value = progress * 100;
        }
    }

    updateTempoUI() {
        const bpm = this.game.getCurrentBpm();
        if (this.dom.tempoReadout) {
            this.dom.tempoReadout.textContent = `${bpm} BPM`;
        }
    }

    updateVuMeter(volumePercent) {
        if (this.dom.vuBar) {
            this.dom.vuBar.style.width = `${volumePercent}%`;
        }
    }

    updateTunerUI(midi, cents = 0, conf = 0, activeNotes = null) {
        if (!this.dom.tunerNote || !this.dom.tunerCents) return;
        if (Array.isArray(activeNotes) && activeNotes.length > 1) {
            const label = activeNotes.slice(0, 4).map((n) => n.noteName).join("+");
            this.dom.tunerNote.textContent = activeNotes.length > 4 ? `${label}…` : label;
            const keyList = activeNotes.slice(0, 3).map((n) => `#${n.key61Number}`).join(",");
            this.dom.tunerCents.textContent = `K${keyList}`;
            return;
        }
        if (!midi) {
            this.dom.tunerNote.textContent = "--";
            this.dom.tunerCents.textContent = "Calibrated";
            return;
        }
        const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const name = noteNames[((midi % 12) + 12) % 12];
        const oct = Math.floor(midi / 12) - 1;
        const key61 = midi - 35;
        this.dom.tunerNote.textContent = `${name}${oct}`;
        const sign = cents >= 0 ? "+" : "";
        this.dom.tunerCents.textContent = `K#${key61} ${sign}${cents}¢`;
    }

    handleDetectedPitch(result) {
        const activeNotes = result.activeNotes || [];
        if (result.silence || (!result.midi && activeNotes.length === 0)) {
            if (this.dom.tunerNote && this.dom.tunerNote.textContent !== "--") {
                this.updateTunerUI(null);
            }
            return;
        }

        this.updateTunerUI(result.midi, result.cents, result.confidence, activeNotes);

        if (Array.isArray(result.onsetNotes) && result.onsetNotes.length > 0) {
            const onsetMidis = result.onsetNotes.map((n) => n.midi);
            this.game.handleUserInputNotes(onsetMidis, true);
        } else if (result.isNewNoteOn && result.midi) {
            this.game.handleUserInputNote(result.midi, true);
        }
    }

    updateMicStatusUI(status) {
        if (!this.dom.btnMicToggle || !this.dom.micStatusText) return;
        if (status === "listening") {
            this.dom.btnMicToggle.classList.add("listening");
            this.dom.micStatusText.textContent = "Listening";
        } else {
            this.dom.btnMicToggle.classList.remove("listening");
            this.dom.micStatusText.textContent = "Enable Mic";
            this.updateVuMeter(0);
            this.updateTunerUI(null);
        }
    }

    clearToasts() {
        const container = (this.dom && this.dom.toastContainer)
            || (typeof document !== "undefined" ? document.getElementById("appToastContainer") : null);
        if (!container || !container.children) return;
        while (container.children.length > 0 && container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }

    showToast(message, tone = "info") {
        const container = (this.dom && this.dom.toastContainer)
            || (typeof document !== "undefined" ? document.getElementById("appToastContainer") : null);
        if (!container || typeof document === "undefined") {
            if (tone === "error") console.warn(message);
            else console.info(message);
            return;
        }

        // Replace prior routine info toasts so switching pieces never stacks stale banners
        if (tone === "info" && container.children && container.children.length > 0) {
            for (let i = container.children.length - 1; i >= 0; i--) {
                const existing = container.children[i];
                const isInfo = (existing?.classList && existing.classList.contains("toast-info"))
                    || String(existing?.className || "").includes("toast-info");
                if (isInfo) {
                    container.removeChild(existing);
                }
            }
        }

        while (container.children && container.children.length >= 2) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement("div");
        toast.className = "app-toast"
            + (tone === "success" ? " toast-success" : (tone === "error" ? " toast-error" : " toast-info"));
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            if (toast.classList) toast.classList.add("toast-leaving");
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 240);
        }, 2800);
    }

    async toggleMicrophone() {
        this.synth.init();
        this.mic.setAudioContext(this.synth.ctx);

        if (this.mic.isListening) {
            this.mic.stop();
        } else {
            await this.mic.start();
        }
    }

    async addAndSelectSong(newSong) {
        PianoFingeringEngine.ensureSongFingering(newSong);
        await SongStorage.saveSong(newSong);

        const existingIdx = this.songs.findIndex((s) => s.id === newSong.id);
        if (existingIdx >= 0) {
            this.songs[existingIdx] = newSong;
        } else {
            this.songs.unshift(newSong);
        }

        this.activeCurriculumPartId = null;
        this.populateSongSelector();
        if (this.dom.songSelect) {
            this.dom.songSelect.value = newSong.id;
        }
        this.loadSongById(newSong.id, { activeHands: { left: true, right: true } });
        this.closeModal();
        this.refreshAllGamificationUI();
        this.switchView("studio");
    }

    closeModal() {
        if (this.dom.importModal) this.dom.importModal.style.display = "none";
        if (this.dom.modalStatus) this.dom.modalStatus.style.display = "none";
    }

    openModal() {
        this.clearToasts();
        if (this.dom.importModal) this.dom.importModal.style.display = "flex";
    }

    _handleStudioResize() {
        if (this.currentView !== "studio" || !this.renderer) return;
        this.renderer.resize();
        if (this.game && !this.game.isPlaying) {
            this.game.renderCurrentFrame();
        }
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
                if (this.currentView !== "studio" || !this.renderer) return;
                this.renderer.resize();
                if (this.game && !this.game.isPlaying) {
                    this.game.renderCurrentFrame();
                }
            });
        }
    }

    bindEvents() {
        // Song dropdown (switching piece exits curriculum part mode into repertoire Studio)
        this.dom.songSelect?.addEventListener("change", (e) => {
            this.game.pause();
            if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
            this.activeCurriculumPartId = null;
            this.updateStudioCurriculumBar();
            this.loadSongById(e.target.value, { activeHands: { left: true, right: true } });
            this.renderer.resize();
            this.game.renderCurrentFrame();
        });

        // Play / Pause
        this.dom.btnPlayPause?.addEventListener("click", () => {
            this.togglePlayPause();
        });

        // Restart
        this.dom.btnRestart?.addEventListener("click", () => {
            this.closeCompletionModal();
            this.game.restart();
            this.updateTimelineUI(this.game.currentTime, this.game.songDuration);
        });

        // Mode Switcher
        this.dom.btnModeFlow?.addEventListener("click", () => {
            this.dom.btnModeFlow.classList.add("active");
            this.dom.btnModeWait?.classList.remove("active");
            this.game.setMode("flow");
        });

        this.dom.btnModeWait?.addEventListener("click", () => {
            this.dom.btnModeWait.classList.add("active");
            this.dom.btnModeFlow?.classList.remove("active");
            this.game.setMode("wait");
        });

        // Left / Right Hand Practice Toggles
        this.dom.btnHandLeft?.addEventListener("click", () => {
            this.toggleHandPractice("left");
        });

        this.dom.btnHandRight?.addEventListener("click", () => {
            this.toggleHandPractice("right");
        });

        // Microphone Toggle & Noise Gate
        this.dom.btnMicToggle?.addEventListener("click", () => {
            this.toggleMicrophone();
        });

        this.dom.micSensSlider?.addEventListener("input", (e) => {
            const val = parseInt(e.target.value, 10) / 100;
            this.mic.setSensitivity(val);
        });

        // Timeline scrubber
        this.dom.timelineSlider?.addEventListener("input", (e) => {
            const percent = parseFloat(e.target.value) / 100;
            const startTime = this.game.startTime || 0;
            const totalSpan = (this.game.songDuration || 10) - startTime;
            const targetSec = startTime + percent * totalSpan;
            this.game.seek(targetSec);
        });

        // Tempo controls
        this.dom.tempoSlider?.addEventListener("input", (e) => {
            const targetBpm = parseInt(e.target.value, 10);
            const mult = targetBpm / (this.game.song?.bpm || 100);
            this.game.setTempoMultiplier(mult);
            this.updateTempoUI();
            this.dom.presetPills.forEach((p) => p.classList.remove("active"));
        });

        this.dom.btnTempoDown?.addEventListener("click", () => {
            const newBpm = Math.max(25, this.game.getCurrentBpm() - 5);
            if (this.dom.tempoSlider) this.dom.tempoSlider.value = newBpm;
            const mult = newBpm / (this.game.song?.bpm || 100);
            this.game.setTempoMultiplier(mult);
            this.updateTempoUI();
            this.dom.presetPills.forEach((p) => p.classList.remove("active"));
        });

        this.dom.btnTempoUp?.addEventListener("click", () => {
            const newBpm = Math.min(220, this.game.getCurrentBpm() + 5);
            if (this.dom.tempoSlider) this.dom.tempoSlider.value = newBpm;
            const mult = newBpm / (this.game.song?.bpm || 100);
            this.game.setTempoMultiplier(mult);
            this.updateTempoUI();
            this.dom.presetPills.forEach((p) => p.classList.remove("active"));
        });

        this.dom.presetPills.forEach((pill) => {
            pill.addEventListener("click", () => {
                this.dom.presetPills.forEach((p) => p.classList.remove("active"));
                pill.classList.add("active");
                const mult = parseFloat(pill.dataset.mult);
                this.game.setTempoMultiplier(mult);
                if (this.dom.tempoSlider) this.dom.tempoSlider.value = this.game.getCurrentBpm();
                this.updateTempoUI();
            });
        });

        // Metronome Toggle
        this.dom.btnMetronome?.addEventListener("click", () => {
            const active = this.dom.btnMetronome.classList.toggle("active");
            this.game.setMetronome(active);
        });

        // Play-Along Piano Guide Notes Toggle (Song Backing Music continues playing in headphones!)
        this.dom.btnPlayAlongToggle?.addEventListener("click", () => {
            this.synth.init();
            const isActive = this.dom.btnPlayAlongToggle.classList.toggle("active");
            this.game.setReferenceAudio(isActive);
            if (this.dom.playAlongBadge) {
                this.dom.playAlongBadge.textContent = isActive ? "ON" : "OFF";
            }
            this.showToast(
                isActive
                    ? "Play-Along piano notes ON."
                    : "Play-Along piano notes OFF — headphone backing music stays active.",
                "info"
            );
        });

        // Headphone Song Backing Accompaniment Toggle & Volume Slider
        this.dom.btnBackingToggle?.addEventListener("click", () => {
            this.synth.init();
            const isActive = this.dom.btnBackingToggle.classList.toggle("active");
            this.dom.btnBackingToggle.setAttribute("aria-pressed", isActive ? "true" : "false");
            this.game.setBackingAudio(isActive);
            if (this.dom.backingBadge) {
                this.dom.backingBadge.textContent = isActive ? "ON" : "OFF";
            }
        });

        this.dom.backingVolumeSlider?.addEventListener("input", (e) => {
            const vol = parseInt(e.target.value, 10) / 100;
            this.game.setBackingVolume(vol);
            if (vol > 0 && !this.game.backingAudioEnabled) {
                this.game.setBackingAudio(true);
                this.dom.btnBackingToggle?.classList.add("active");
                this.dom.btnBackingToggle?.setAttribute("aria-pressed", "true");
                if (this.dom.backingBadge) this.dom.backingBadge.textContent = "ON";
            }
        });

        // Piano Synth Volume slider
        this.dom.volumeSlider?.addEventListener("input", (e) => {
            const vol = parseInt(e.target.value, 10) / 100;
            this.synth.setVolume(vol);
        });

        // Acoustic Sound & Data Collection Trainer
        this.dom.btnOpenTrainer?.addEventListener("click", () => {
            if (this.game.isPlaying) {
                this.game.pause();
                if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
            }
            this.clearToasts();
            this.trainer.open();
        });

        // Keep paused Studio score canvas crisp across window & flex-stage resizes
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", () => this._handleStudioResize());
        }
        if (typeof ResizeObserver === "function" && this.dom.canvas?.parentElement) {
            this._stageResizeObserver = new ResizeObserver(() => this._handleStudioResize());
            this._stageResizeObserver.observe(this.dom.canvas.parentElement);
        }
    }

    bindImportModalEvents() {
        this.dom.btnOpenImport?.addEventListener("click", () => this.openModal());
        this.dom.btnCloseModal?.addEventListener("click", () => this.closeModal());
        this.dom.importModal?.addEventListener("click", (e) => {
            if (e.target === this.dom.importModal) this.closeModal();
        });

        this.dom.tabBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                this.dom.tabBtns.forEach((b) => b.classList.remove("active"));
                this.dom.tabPanes.forEach((p) => p.classList.remove("active"));
                btn.classList.add("active");
                const targetId = btn.dataset.tab;
                document.getElementById(targetId)?.classList.add("active");
            });
        });

        // 1. Sheet Music Tab
        if (this.dom.sheetDropzone) {
            this.dom.sheetDropzone.addEventListener("click", () => this.dom.sheetFileInput?.click());
            this.setupDropzone(this.dom.sheetDropzone, (file) => this.handleSheetFile(file));
        }
        this.dom.sheetFileInput?.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this.handleSheetFile(e.target.files[0]);
        });
        this.dom.btnRemoveSheet?.addEventListener("click", () => {
            this.stagedSheetDataUrl = null;
            if (this.dom.sheetPreviewContainer) this.dom.sheetPreviewContainer.style.display = "none";
            if (this.dom.sheetDropzone) this.dom.sheetDropzone.style.display = "flex";
            if (this.dom.btnTranscribeSheet) this.dom.btnTranscribeSheet.disabled = true;
        });
        this.dom.btnSaveApiKey?.addEventListener("click", () => {
            const key = this.dom.geminiApiKeyInput?.value.trim() || "";
            try {
                localStorage.setItem("yousician_gemini_key", key);
            } catch (_err) {}
            this.showToast("API key saved locally.", "success");
        });
        this.dom.btnTranscribeSheet?.addEventListener("click", async () => {
            if (!this.stagedSheetDataUrl) return;
            let savedKey = null;
            try {
                savedKey = localStorage.getItem("yousician_gemini_key");
            } catch (_err) {}
            const key = this.dom.geminiApiKeyInput?.value.trim() || savedKey;
            if (!key) {
                this.showToast("Enter a Gemini API key to transcribe sheet music images.", "error");
                return;
            }

            this.showModalStatus("Transcribing sheet music via Gemini Vision AI... Analyzing staves, notes, and measures...");
            try {
                const song = await SheetMusicScanner.transcribeWithGemini(key, this.stagedSheetDataUrl);
                song.id = "sheet_" + Date.now().toString(36);
                await this.addAndSelectSong(song);
                this.showToast(`Loaded "${song.title}"`, "success");
            } catch (err) {
                this.showToast("Sheet transcription error: " + err.message, "error");
                if (this.dom.modalStatus) this.dom.modalStatus.style.display = "none";
            }
        });

        // 2. MIDI Tab
        if (this.dom.midiDropzone) {
            this.dom.midiDropzone.addEventListener("click", () => this.dom.midiFileInput?.click());
            this.setupDropzone(this.dom.midiDropzone, (file) => this.handleMidiFile(file));
        }
        this.dom.midiFileInput?.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this.handleMidiFile(e.target.files[0]);
        });
        this.dom.btnImportMidi?.addEventListener("click", async () => {
            if (this.stagedMidiSong) {
                await this.addAndSelectSong(this.stagedMidiSong);
            }
        });

        // 3. MusicXML Tab
        if (this.dom.mxmlDropzone) {
            this.dom.mxmlDropzone.addEventListener("click", () => this.dom.mxmlFileInput?.click());
            this.setupDropzone(this.dom.mxmlDropzone, (file) => this.handleMxmlFile(file));
        }
        this.dom.mxmlFileInput?.addEventListener("change", (e) => {
            if (e.target.files?.[0]) this.handleMxmlFile(e.target.files[0]);
        });
        this.dom.btnImportMxml?.addEventListener("click", async () => {
            if (this.stagedMxmlSong) {
                await this.addAndSelectSong(this.stagedMxmlSong);
            }
        });

        // 4. Composer Tab
        this.dom.btnBuildFromComposer?.addEventListener("click", async () => {
            const title = this.dom.compTitle?.value.trim() || "Custom Practice Drill";
            const bpm = parseInt(this.dom.compBpm?.value || "100", 10) || 100;
            const text = this.dom.compTextarea?.value || "";
            try {
                const song = SheetMusicScanner.parseQuickNotation(text, bpm);
                song.title = title;
                song.id = "comp_" + Date.now().toString(36);
                await this.addAndSelectSong(song);
                this.showToast(`Loaded "${song.title}"`, "success");
            } catch (err) {
                this.showToast("Composer parsing error: " + err.message, "error");
            }
        });
    }

    setupDropzone(element, onFile) {
        element.addEventListener("dragover", (e) => {
            e.preventDefault();
            element.classList.add("dragover");
        });
        element.addEventListener("dragleave", () => {
            element.classList.remove("dragover");
        });
        element.addEventListener("drop", (e) => {
            e.preventDefault();
            element.classList.remove("dragover");
            if (e.dataTransfer.files?.[0]) {
                onFile(e.dataTransfer.files[0]);
            }
        });
    }

    async handleSheetFile(file) {
        try {
            const dataUrl = await SheetMusicScanner.readFileAsDataURL(file);
            this.stagedSheetDataUrl = dataUrl;
            if (this.dom.sheetImagePreview) this.dom.sheetImagePreview.src = dataUrl;
            if (this.dom.sheetFileInfo) this.dom.sheetFileInfo.textContent = file.name;
            if (this.dom.sheetPreviewContainer) this.dom.sheetPreviewContainer.style.display = "flex";
            if (this.dom.sheetDropzone) this.dom.sheetDropzone.style.display = "none";
            if (this.dom.btnTranscribeSheet) this.dom.btnTranscribeSheet.disabled = false;
        } catch (e) {
            this.showToast("Error reading sheet music image: " + e.message, "error");
        }
    }

    async handleMidiFile(file) {
        try {
            const buffer = await file.arrayBuffer();
            const song = MidiFileParser.parse(buffer);
            song.id = "midi_" + Date.now().toString(36);
            song.title = file.name.replace(/\.[^/.]+$/, "");
            this.stagedMidiSong = song;

            if (this.dom.midiSongTitle) this.dom.midiSongTitle.textContent = `Song: ${song.title}`;
            if (this.dom.midiNoteCount) this.dom.midiNoteCount.textContent = `Notes: ${song.notes.length}`;
            if (this.dom.midiBpm) this.dom.midiBpm.textContent = `BPM: ${song.bpm}`;
            if (this.dom.midiInfoBox) this.dom.midiInfoBox.style.display = "flex";
            if (this.dom.btnImportMidi) this.dom.btnImportMidi.disabled = false;
        } catch (e) {
            this.showToast("MIDI parsing error: " + e.message, "error");
        }
    }

    async handleMxmlFile(file) {
        try {
            const text = await file.text();
            const song = MusicXmlParser.parse(text);
            song.id = "mxml_" + Date.now().toString(36);
            if (!song.title || song.title === "Imported MusicXML Song") {
                song.title = file.name.replace(/\.[^/.]+$/, "");
            }
            this.stagedMxmlSong = song;

            if (this.dom.mxmlSongTitle) this.dom.mxmlSongTitle.textContent = `Song: ${song.title}`;
            if (this.dom.mxmlNoteCount) this.dom.mxmlNoteCount.textContent = `Notes: ${song.notes.length}`;
            if (this.dom.mxmlBpm) this.dom.mxmlBpm.textContent = `BPM: ${song.bpm}`;
            if (this.dom.mxmlInfoBox) this.dom.mxmlInfoBox.style.display = "flex";
            if (this.dom.btnImportMxml) this.dom.btnImportMxml.disabled = false;
        } catch (e) {
            this.showToast("MusicXML parsing error: " + e.message, "error");
        }
    }

    showModalStatus(text) {
        if (this.dom.modalStatus) this.dom.modalStatus.style.display = "flex";
        if (this.dom.modalStatusText) this.dom.modalStatusText.textContent = text;
    }

    toggleHandPractice(hand) {
        if (!this.game) return;
        const updatedHands = this.game.toggleHand(hand);
        this.updateHandToggleUI(updatedHands);
    }

    updateHandToggleUI(hands) {
        if (!hands) return;
        if (this.dom && this.dom.btnHandLeft) {
            this.dom.btnHandLeft.classList.toggle("active", Boolean(hands.left));
            this.dom.btnHandLeft.setAttribute("aria-pressed", hands.left ? "true" : "false");
            if (this.dom.handLeftBadge) {
                this.dom.handLeftBadge.textContent = hands.left ? "ON" : "OFF";
            }
        }
        if (this.dom && this.dom.btnHandRight) {
            this.dom.btnHandRight.classList.toggle("active", Boolean(hands.right));
            this.dom.btnHandRight.setAttribute("aria-pressed", hands.right ? "true" : "false");
            if (this.dom.handRightBadge) {
                this.dom.handRightBadge.textContent = hands.right ? "ON" : "OFF";
            }
        }
    }

    togglePlayPause() {
        this.closeCompletionModal();
        this.synth.init();
        if (this.game.isPlaying) {
            this.game.pause();
            if (this.dom.playIcon) this.dom.playIcon.textContent = "▶";
        } else {
            this.game.play();
            if (this.dom.playIcon) this.dom.playIcon.textContent = "⏸";
        }
    }

    bindKeyboardShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (e.code === "Escape") {
                if (this.dom.completionModal && this.dom.completionModal.style.display !== "none") {
                    this.closeCompletionModal();
                    return;
                }
                if (this.dom.importModal && this.dom.importModal.style.display !== "none") {
                    this.closeModal();
                    return;
                }
            }

            const tag = e.target && e.target.tagName ? e.target.tagName : "";
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            if (this.trainer && this.trainer.isOpen) return;
            if (this.dom.importModal && this.dom.importModal.style.display !== "none") return;
            if (this.dom.completionModal && this.dom.completionModal.style.display !== "none") return;
            if (this.currentView !== "studio") return;

            if (e.code === "Space") {
                e.preventDefault();
                this.togglePlayPause();
            } else if (e.code === "ArrowLeft") {
                e.preventDefault();
                this.game.seek(this.game.currentTime - 3);
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                this.game.seek(this.game.currentTime + 3);
            } else if (e.code === "KeyL") {
                e.preventDefault();
                this.toggleHandPractice("left");
            } else if (e.code === "KeyR") {
                e.preventDefault();
                this.toggleHandPractice("right");
            }
        });
    }
}

// Bootstrap once DOM is ready
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("DOMContentLoaded", () => {
        window.pianoApp = new PianoApp();
    });
}
