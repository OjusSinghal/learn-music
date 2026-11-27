/**
 * Yousician Piano — Gamification & Curriculum Progress Manager
 * Tracks mastery across Lesson Parts, Lessons, Levels (1–9), and Repertoire Songs.
 * Persists in localStorage ("yousician_piano_progress_v1") with an automatic
 * in-memory fallback for headless JavaScriptCore (jsc) verification.
 */

import { PIANO_CURRICULUM } from "../curriculum/index.js";

const DEFAULT_STORAGE_KEY = "yousician_piano_progress_v1";
const UKULELE_STORAGE_KEY = "yousician_ukulele_progress_v1";
const IN_MEMORY_FALLBACK_STORE = new Map();

export const PIANIST_RANKS = [
    { rank: 1, id: "initiate", title: "Initiate", minXp: 0 },
    { rank: 2, id: "apprentice", title: "Apprentice", minXp: 250 },
    { rank: 3, id: "lyricist", title: "Lyricist", minXp: 650 },
    { rank: 4, id: "harmonist", title: "Harmonist", minXp: 1300 },
    { rank: 5, id: "virtuoso", title: "Virtuoso", minXp: 2400 },
    { rank: 6, id: "concert_master", title: "Concert Master", minXp: 4000 }
];

export const UKULELE_RANKS = [
    { rank: 1, id: "open_string_novice", title: "Open-String Novice", minXp: 0 },
    { rank: 2, id: "strum_apprentice", title: "Strum Apprentice", minXp: 250 },
    { rank: 3, id: "island_groover", title: "Island Groover", minXp: 650 },
    { rank: 4, id: "fretboard_stylist", title: "Fretboard Stylist", minXp: 1300 },
    { rank: 5, id: "chord_melody_artist", title: "Chord-Melody Artist", minXp: 2400 },
    { rank: 6, id: "conservatory_ukulelist", title: "Conservatory Ukulelist", minXp: 4000 }
];

export const ACHIEVEMENT_DEFINITIONS = [
    {
        id: "first_steps",
        title: "First Steps",
        description: "Complete your first curriculum part or song play-along."
    },
    {
        id: "chord_explorer",
        title: "Chord Explorer",
        description: "Complete a Chords & Harmony study part or chordal piece."
    },
    {
        id: "two_hand_harmony",
        title: "Two-Hand Harmony",
        description: "Complete a combined two-hand piece with both hands active."
    },
    {
        id: "precision_95",
        title: "95%+ Precision",
        description: "Finish any lesson part or song with 95% or higher accuracy."
    },
    {
        id: "golden_touch",
        title: "Golden Touch",
        description: "Earn 3 stars on 5 different curriculum parts or songs."
    },
    {
        id: "streak_3",
        title: "Dedicated Pianist",
        description: "Practice on 3 consecutive days."
    },
    {
        id: "level_complete",
        title: "Level Complete",
        description: "Complete every lesson and part in a full curriculum level."
    },
    {
        id: "concert_repertoire",
        title: "Concert Repertoire",
        description: "Complete 3 full song play-along arrangements."
    }
];

export const UKULELE_ACHIEVEMENT_DEFINITIONS = [
    {
        id: "first_steps",
        title: "First Steps",
        description: "Complete your first ukulele lesson part or song play-along."
    },
    {
        id: "chord_explorer",
        title: "Chord Strummer",
        description: "Complete a Chords & Strumming study part or chordal piece."
    },
    {
        id: "two_hand_harmony",
        title: "Chord-Melody Flow",
        description: "Complete a combined chord-melody piece with both lanes active."
    },
    {
        id: "precision_95",
        title: "95%+ Precision",
        description: "Finish any ukulele lesson part or song with 95% or higher accuracy."
    },
    {
        id: "golden_touch",
        title: "Golden Touch",
        description: "Earn 3 stars on 5 different ukulele parts or songs."
    },
    {
        id: "streak_3",
        title: "Dedicated Ukulelist",
        description: "Practice on 3 consecutive days."
    },
    {
        id: "level_complete",
        title: "Level Complete",
        description: "Complete every lesson and part in a full ukulele curriculum level."
    },
    {
        id: "concert_repertoire",
        title: "Island Repertoire",
        description: "Complete 3 full ukulele song play-along arrangements."
    }
];

function createEmptyItemRecord() {
    return {
        completed: false,
        stars: 0,
        bestAccuracy: 0,
        bestScore: 0,
        attempts: 0,
        lastPlayedAt: null,
        manualComplete: false
    };
}

function normalizeAccuracy(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function toDateKey(dateInput = null) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
    const year = safeDate.getUTCFullYear();
    const month = String(safeDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(safeDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function dayDiffUtc(dateKeyA, dateKeyB) {
    if (!dateKeyA || !dateKeyB) return null;
    const [y1, m1, d1] = dateKeyA.split("-").map(Number);
    const [y2, m2, d2] = dateKeyB.split("-").map(Number);
    if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((utc2 - utc1) / 86400000);
}

function resolveStorageBackend(customStorage = null) {
    if (customStorage && typeof customStorage.getItem === "function" && typeof customStorage.setItem === "function") {
        return customStorage;
    }
    try {
        if (
            typeof localStorage !== "undefined" &&
            localStorage &&
            typeof localStorage.getItem === "function" &&
            typeof localStorage.setItem === "function"
        ) {
            const probeKey = "__yousician_progress_probe__";
            localStorage.setItem(probeKey, "1");
            const works = localStorage.getItem(probeKey) === "1";
            if (typeof localStorage.removeItem === "function") {
                localStorage.removeItem(probeKey);
            }
            if (works) {
                return localStorage;
            }
        }
    } catch (_err) {
        // Fall through to in-memory store (e.g. headless jsc or restricted storage)
    }
    return {
        getItem: (k) => (IN_MEMORY_FALLBACK_STORE.has(k) ? IN_MEMORY_FALLBACK_STORE.get(k) : null),
        setItem: (k, v) => { IN_MEMORY_FALLBACK_STORE.set(k, String(v)); },
        removeItem: (k) => { IN_MEMORY_FALLBACK_STORE.delete(k); }
    };
}

export class ProgressManager {
    static STORAGE_KEY = DEFAULT_STORAGE_KEY;

    constructor(options = {}) {
        this.instrument = options.instrument === "ukulele" ? "ukulele" : "piano";
        this.storageKey = options.storageKey || (this.instrument === "ukulele" ? UKULELE_STORAGE_KEY : DEFAULT_STORAGE_KEY);
        this.storage = resolveStorageBackend(options.storage || null);
        this.curriculum = Array.isArray(options.curriculum) ? options.curriculum : PIANO_CURRICULUM;
        this.ranks = Array.isArray(options.ranks) && options.ranks.length > 0
            ? options.ranks
            : (this.instrument === "ukulele" ? UKULELE_RANKS : PIANIST_RANKS);
        this.achievementDefinitions = Array.isArray(options.achievements) && options.achievements.length > 0
            ? options.achievements
            : (this.instrument === "ukulele" ? UKULELE_ACHIEVEMENT_DEFINITIONS : ACHIEVEMENT_DEFINITIONS);
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;

        this._partIndex = new Map();
        this._lessonIndex = new Map();
        this._levelIndex = new Map();
        this._orderedPartEntries = [];

        this._indexCurriculum();
        this.state = this._loadState();
        this._recomputeHierarchy(false);
    }

    /**
     * Star thresholds:
     *   accuracy >= 92 -> 3 stars
     *   accuracy >= 75 -> 2 stars
     *   accuracy >= 50 (or Wait-mode full completion) -> 1 star
     *   otherwise -> 0 stars
     */
    static computeStars(accuracy, options = {}) {
        const acc = normalizeAccuracy(accuracy);
        const mode = options && options.mode ? options.mode : "flow";
        const waitCompleted = mode === "wait" && options.completedFull !== false;

        if (acc >= 92) return 3;
        if (acc >= 75) return 2;
        if (acc >= 50 || waitCompleted) return 1;
        return 0;
    }

    computeStars(accuracy, options = {}) {
        return ProgressManager.computeStars(accuracy, options);
    }

    setCurriculum(curriculum) {
        this.curriculum = Array.isArray(curriculum) ? curriculum : [];
        this._indexCurriculum();
        this._recomputeHierarchy(false);
        return this;
    }

    _indexCurriculum() {
        this._partIndex.clear();
        this._lessonIndex.clear();
        this._levelIndex.clear();
        this._orderedPartEntries = [];

        if (!Array.isArray(this.curriculum)) return;

        const sortedLevels = [...this.curriculum].sort((a, b) => (a.level || 0) - (b.level || 0));
        for (const levelObj of sortedLevels) {
            if (!levelObj || typeof levelObj.level !== "number") continue;
            this._levelIndex.set(levelObj.level, levelObj);

            const lessons = Array.isArray(levelObj.lessons) ? levelObj.lessons : [];
            for (const lessonObj of lessons) {
                if (!lessonObj || !lessonObj.id) continue;
                this._lessonIndex.set(lessonObj.id, { level: levelObj, lesson: lessonObj });

                const parts = Array.isArray(lessonObj.parts) ? lessonObj.parts : [];
                for (const partObj of parts) {
                    if (!partObj || !partObj.id) continue;
                    const entry = { level: levelObj, lesson: lessonObj, part: partObj };
                    this._partIndex.set(partObj.id, entry);
                    this._orderedPartEntries.push(entry);
                }
            }
        }
    }

    _createDefaultState() {
        return {
            version: 1,
            totalXp: 0,
            parts: {},
            lessons: {},
            levels: {},
            songs: {},
            xpLedger: {},
            manualCreditLedger: {},
            lessonBonusGranted: {},
            levelBonusGranted: {},
            streak: {
                current: 0,
                best: 0,
                lastPracticeDate: null
            },
            achievements: {},
            lastPartId: null,
            lastSongId: null,
            updatedAt: null
        };
    }

    _sanitizeItemRecord(raw) {
        if (!raw || typeof raw !== "object") return createEmptyItemRecord();
        return {
            completed: Boolean(raw.completed),
            stars: Math.max(0, Math.min(3, Math.floor(Number(raw.stars) || 0))),
            bestAccuracy: normalizeAccuracy(raw.bestAccuracy ?? 0),
            bestScore: Math.max(0, Math.round(Number(raw.bestScore) || 0)),
            attempts: Math.max(0, Math.floor(Number(raw.attempts) || 0)),
            lastPlayedAt: typeof raw.lastPlayedAt === "string" ? raw.lastPlayedAt : null,
            manualComplete: Boolean(raw.manualComplete)
        };
    }

    _loadState() {
        const defaults = this._createDefaultState();
        try {
            const raw = this.storage.getItem(this.storageKey);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return defaults;

            const parts = {};
            if (parsed.parts && typeof parsed.parts === "object") {
                for (const [k, v] of Object.entries(parsed.parts)) {
                    parts[k] = this._sanitizeItemRecord(v);
                }
            }

            const songs = {};
            if (parsed.songs && typeof parsed.songs === "object") {
                for (const [k, v] of Object.entries(parsed.songs)) {
                    songs[k] = this._sanitizeItemRecord(v);
                }
            }

            return {
                ...defaults,
                totalXp: Math.max(0, Math.round(Number(parsed.totalXp) || 0)),
                parts,
                lessons: (parsed.lessons && typeof parsed.lessons === "object") ? { ...parsed.lessons } : {},
                levels: (parsed.levels && typeof parsed.levels === "object") ? { ...parsed.levels } : {},
                songs,
                xpLedger: (parsed.xpLedger && typeof parsed.xpLedger === "object") ? { ...parsed.xpLedger } : {},
                manualCreditLedger: (parsed.manualCreditLedger && typeof parsed.manualCreditLedger === "object")
                    ? { ...parsed.manualCreditLedger }
                    : {},
                lessonBonusGranted: (parsed.lessonBonusGranted && typeof parsed.lessonBonusGranted === "object")
                    ? { ...parsed.lessonBonusGranted }
                    : {},
                levelBonusGranted: (parsed.levelBonusGranted && typeof parsed.levelBonusGranted === "object")
                    ? { ...parsed.levelBonusGranted }
                    : {},
                streak: {
                    current: Math.max(0, Math.floor(Number(parsed.streak?.current) || 0)),
                    best: Math.max(0, Math.floor(Number(parsed.streak?.best) || 0)),
                    lastPracticeDate: typeof parsed.streak?.lastPracticeDate === "string"
                        ? parsed.streak.lastPracticeDate
                        : null
                },
                achievements: (parsed.achievements && typeof parsed.achievements === "object")
                    ? { ...parsed.achievements }
                    : {},
                lastPartId: typeof parsed.lastPartId === "string" ? parsed.lastPartId : null,
                lastSongId: typeof parsed.lastSongId === "string" ? parsed.lastSongId : null,
                updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null
            };
        } catch (_err) {
            return defaults;
        }
    }

    _saveState() {
        this.state.updatedAt = new Date().toISOString();
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (_err) {
            // Safe ignore if storage quota exceeded
        }
        if (this.onChange) {
            this.onChange(this.getSummary());
        }
    }

    resetProgress() {
        this.state = this._createDefaultState();
        this._recomputeHierarchy(false);
        try {
            if (typeof this.storage.removeItem === "function") {
                this.storage.removeItem(this.storageKey);
            } else {
                this.storage.setItem(this.storageKey, JSON.stringify(this.state));
            }
        } catch (_err) {}
        if (this.onChange) {
            this.onChange(this.getSummary());
        }
        return this.getSummary();
    }

    _touchDailyStreak(playedAtIso = null) {
        const dateKey = toDateKey(playedAtIso);
        const lastKey = this.state.streak.lastPracticeDate;

        if (!lastKey) {
            this.state.streak.current = 1;
            this.state.streak.best = Math.max(1, this.state.streak.best);
            this.state.streak.lastPracticeDate = dateKey;
            return this.state.streak.current;
        }

        const diff = dayDiffUtc(lastKey, dateKey);
        if (diff === 0) {
            // Already practiced on this calendar day
            return this.state.streak.current;
        }
        if (diff === 1) {
            this.state.streak.current += 1;
        } else if (diff !== null && diff > 1) {
            this.state.streak.current = 1;
        }
        if (diff === null || diff >= 0) {
            this.state.streak.lastPracticeDate = dateKey;
        }
        if (this.state.streak.current > this.state.streak.best) {
            this.state.streak.best = this.state.streak.current;
        }
        return this.state.streak.current;
    }

    /**
     * Recomputes Lesson and Level completion across all curriculum levels (1..9).
     * Returns newly completed lesson & level objects if `grantMilestoneBonuses` is true.
     */
    _recomputeHierarchy(grantMilestoneBonuses = true, timestampIso = null) {
        const nowIso = timestampIso || new Date().toISOString();
        const newlyCompletedLessons = [];
        const newlyCompletedLevels = [];
        let milestoneXp = 0;

        for (const [lessonId, { level, lesson }] of this._lessonIndex.entries()) {
            const parts = Array.isArray(lesson.parts) ? lesson.parts : [];
            const prevLessonState = this.state.lessons[lessonId] || null;
            const wasCompleted = Boolean(prevLessonState && prevLessonState.completed);

            let completedParts = 0;
            let stars = 0;
            let accSum = 0;
            let accCount = 0;

            for (const p of parts) {
                const rec = this.state.parts[p.id];
                if (rec && rec.completed) {
                    completedParts += 1;
                }
                if (rec) {
                    stars += rec.stars || 0;
                    if (rec.bestAccuracy > 0) {
                        accSum += rec.bestAccuracy;
                        accCount += 1;
                    }
                }
            }

            const totalParts = parts.length;
            const isCompleted = totalParts > 0 && completedParts === totalParts;

            this.state.lessons[lessonId] = {
                completed: isCompleted,
                completedParts,
                totalParts,
                stars,
                maxStars: totalParts * 3,
                bestAccuracy: accCount > 0 ? normalizeAccuracy(accSum / accCount) : 0,
                completedAt: isCompleted
                    ? (prevLessonState?.completedAt || nowIso)
                    : null
            };

            if (isCompleted && !wasCompleted) {
                newlyCompletedLessons.push({ level, lesson });
                if (grantMilestoneBonuses && !this.state.lessonBonusGranted[lessonId]) {
                    this.state.lessonBonusGranted[lessonId] = true;
                    milestoneXp += 40;
                }
            }
        }

        for (const [levelNum, levelObj] of this._levelIndex.entries()) {
            const lessons = Array.isArray(levelObj.lessons) ? levelObj.lessons : [];
            const prevLevelState = this.state.levels[levelNum] || null;
            const wasCompleted = Boolean(prevLevelState && prevLevelState.completed);

            let completedLessons = 0;
            let completedParts = 0;
            let totalParts = 0;
            let stars = 0;

            for (const lesson of lessons) {
                const lState = this.state.lessons[lesson.id];
                if (lState && lState.completed) {
                    completedLessons += 1;
                }
                if (lState) {
                    completedParts += lState.completedParts;
                    totalParts += lState.totalParts;
                    stars += lState.stars;
                } else {
                    const pLen = Array.isArray(lesson.parts) ? lesson.parts.length : 0;
                    totalParts += pLen;
                }
            }

            const totalLessons = lessons.length;
            const isCompleted = totalLessons > 0 && completedLessons === totalLessons;

            this.state.levels[levelNum] = {
                level: levelNum,
                completed: isCompleted,
                completedLessons,
                totalLessons,
                completedParts,
                totalParts,
                stars,
                maxStars: totalParts * 3,
                completedAt: isCompleted
                    ? (prevLevelState?.completedAt || nowIso)
                    : null
            };

            if (isCompleted && !wasCompleted) {
                newlyCompletedLevels.push(levelObj);
                if (grantMilestoneBonuses && !this.state.levelBonusGranted[levelNum]) {
                    this.state.levelBonusGranted[levelNum] = true;
                    milestoneXp += 120;
                }
            }
        }

        if (milestoneXp > 0) {
            this.state.totalXp += milestoneXp;
        }

        return {
            newlyCompletedLessons,
            newlyCompletedLevels,
            milestoneXp
        };
    }

    _evaluateAchievements(context = {}, timestampIso = null) {
        const nowIso = timestampIso || new Date().toISOString();
        const newlyUnlocked = [];

        const unlock = (id) => {
            if (!this.state.achievements[id]) {
                this.state.achievements[id] = { unlocked: true, unlockedAt: nowIso };
                const def = this.achievementDefinitions.find((a) => a.id === id);
                if (def) newlyUnlocked.push({ ...def, unlocked: true, unlockedAt: nowIso });
            }
        };

        const completedPartIds = Object.keys(this.state.parts).filter((id) => this.state.parts[id]?.completed);
        const completedSongIds = Object.keys(this.state.songs).filter((id) => this.state.songs[id]?.completed);
        const totalCompletedItems = completedPartIds.length + completedSongIds.length;

        if (totalCompletedItems >= 1) {
            unlock("first_steps");
        }

        // Chord Explorer: completed a "chords" curriculum part or explicit chord context
        const hasCompletedChordPart = completedPartIds.some((pid) => {
            const entry = this._partIndex.get(pid);
            return entry && entry.part && entry.part.partType === "chords";
        });
        if (hasCompletedChordPart || (context.completed && context.hasChords)) {
            unlock("chord_explorer");
        }

        // Two-Hand Harmony: completed a "combined" part or two-hand piece with both hands active
        const hasCompletedCombined = completedPartIds.some((pid) => {
            const entry = this._partIndex.get(pid);
            return entry && entry.part && (
                entry.part.partType === "combined" ||
                (entry.part.targetHands?.left && entry.part.targetHands?.right)
            );
        });
        if (hasCompletedCombined || (context.completed && context.bothHandsActive)) {
            unlock("two_hand_harmony");
        }

        // 95%+ Precision
        const any95Part = Object.values(this.state.parts).some((r) => r && r.bestAccuracy >= 95);
        const any95Song = Object.values(this.state.songs).some((r) => r && r.bestAccuracy >= 95);
        if (any95Part || any95Song || (typeof context.accuracy === "number" && context.accuracy >= 95)) {
            unlock("precision_95");
        }

        // 3 stars on 5 items
        const threeStarCount =
            Object.values(this.state.parts).filter((r) => r && r.stars >= 3).length +
            Object.values(this.state.songs).filter((r) => r && r.stars >= 3).length;
        if (threeStarCount >= 5) {
            unlock("golden_touch");
        }

        // 3-day streak
        if (this.state.streak.best >= 3 || this.state.streak.current >= 3) {
            unlock("streak_3");
        }

        // Any curriculum level completed
        const anyLevelDone = Object.values(this.state.levels).some((lv) => lv && lv.completed);
        if (anyLevelDone) {
            unlock("level_complete");
        }

        // 3 songs completed
        if (completedSongIds.length >= 3) {
            unlock("concert_repertoire");
        }

        return newlyUnlocked;
    }

    _computePlayXp(ledgerKey, baseXp, prevStars, earnedStars, accuracy, perfectCount = 0) {
        const safeBase = Math.max(40, Number(baseXp) || 80);
        const starMultiplier = earnedStars >= 3 ? 1.5 : (earnedStars === 2 ? 1.2 : (earnedStars === 1 ? 1.0 : 0.25));
        const targetTierXp = Math.round(safeBase * starMultiplier);
        const prevBestTierXp = Number(this.state.xpLedger[ledgerKey] || 0);

        let xpEarned = 0;
        if (earnedStars > prevStars && targetTierXp > prevBestTierXp) {
            xpEarned += (targetTierXp - prevBestTierXp);
            this.state.xpLedger[ledgerKey] = targetTierXp;
        } else if (prevBestTierXp === 0 && earnedStars >= 1) {
            xpEarned += targetTierXp;
            this.state.xpLedger[ledgerKey] = targetTierXp;
        }

        // Practice & precision bonus on every genuine playthrough
        const practiceBonus = earnedStars >= 1
            ? Math.max(12, Math.round(safeBase * 0.20) + (accuracy >= 95 ? 10 : 0) + Math.min(8, Math.floor(perfectCount / 15)))
            : Math.max(8, Math.round(safeBase * 0.12));

        xpEarned += practiceBonus;
        this.state.totalXp += xpEarned;
        return xpEarned;
    }

    /**
     * Records completion / attempt of a Curriculum Lesson Part.
     */
    recordPartCompletion(partId, stats = {}) {
        if (!partId) return null;

        const prevRank = this.getRankInfo(this.state.totalXp);
        const entry = this._partIndex.get(partId) || null;
        const partMeta = entry ? entry.part : null;
        const playedAt = stats.playedAt || new Date().toISOString();

        const prev = this._sanitizeItemRecord(this.state.parts[partId]);
        const wasPartCompleted = prev.completed;

        const accuracy = normalizeAccuracy(stats.accuracy ?? 0);
        const score = Math.max(0, Math.round(Number(stats.score) || 0));
        const mode = stats.mode || "flow";
        const earnedStars = ProgressManager.computeStars(accuracy, {
            mode,
            completedFull: stats.completedFull !== false
        });
        const nowCompleted = prev.completed || prev.manualComplete || earnedStars >= 1;

        const updated = {
            completed: nowCompleted,
            stars: Math.max(prev.stars, earnedStars),
            bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
            bestScore: Math.max(prev.bestScore, score),
            attempts: prev.attempts + 1,
            lastPlayedAt: playedAt,
            manualComplete: prev.manualComplete
        };

        this.state.parts[partId] = updated;
        this.state.lastPartId = partId;

        const streakDays = this._touchDailyStreak(playedAt);
        const baseXp = partMeta?.xpReward || stats.xpReward || 75;
        const playXp = this._computePlayXp(
            `part:${partId}`,
            baseXp,
            prev.stars,
            earnedStars,
            accuracy,
            Number(stats.perfectCount) || 0
        );

        const hierarchyDelta = this._recomputeHierarchy(true, playedAt);
        const totalXpEarned = playXp + hierarchyDelta.milestoneXp;

        const bothHandsActive = Boolean(
            (stats.activeHands?.left && stats.activeHands?.right) ||
            (partMeta?.targetHands?.left && partMeta?.targetHands?.right)
        );
        const newAchievements = this._evaluateAchievements({
            completed: nowCompleted,
            accuracy,
            hasChords: partMeta?.partType === "chords" || partMeta?.partType === "combined",
            bothHandsActive
        }, playedAt);

        const currentRank = this.getRankInfo(this.state.totalXp);
        const rankUp = currentRank.rank > prevRank.rank
            ? { previousRank: prevRank, currentRank }
            : null;

        this._saveState();

        return {
            kind: "part",
            partId,
            item: { ...updated },
            earnedStars,
            xpEarned: totalXpEarned,
            totalXp: this.state.totalXp,
            rankInfo: currentRank,
            rankUp,
            streakDays,
            newlyCompletedPart: !wasPartCompleted && nowCompleted,
            newlyCompletedLesson: hierarchyDelta.newlyCompletedLessons[0] || null,
            newlyCompletedLevel: hierarchyDelta.newlyCompletedLevels[0] || null,
            newAchievements
        };
    }

    /**
     * Records completion / attempt of a Repertoire or Custom Song Play-Along.
     */
    recordSongCompletion(songId, stats = {}) {
        if (!songId) return null;

        const prevRank = this.getRankInfo(this.state.totalXp);
        const playedAt = stats.playedAt || new Date().toISOString();

        const prev = this._sanitizeItemRecord(this.state.songs[songId]);
        const wasSongCompleted = prev.completed;

        const accuracy = normalizeAccuracy(stats.accuracy ?? 0);
        const score = Math.max(0, Math.round(Number(stats.score) || 0));
        const mode = stats.mode || "flow";
        const earnedStars = ProgressManager.computeStars(accuracy, {
            mode,
            completedFull: stats.completedFull !== false
        });
        const nowCompleted = prev.completed || prev.manualComplete || earnedStars >= 1;

        const updated = {
            completed: nowCompleted,
            stars: Math.max(prev.stars, earnedStars),
            bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
            bestScore: Math.max(prev.bestScore, score),
            attempts: prev.attempts + 1,
            lastPlayedAt: playedAt,
            manualComplete: prev.manualComplete
        };

        this.state.songs[songId] = updated;
        this.state.lastSongId = songId;

        const streakDays = this._touchDailyStreak(playedAt);
        const noteCount = Number(stats.totalActiveNotes) || Number(stats.song?.notes?.length) || 48;
        const baseXp = stats.xpReward || Math.min(160, Math.max(85, Math.round(noteCount * 1.15)));
        const xpEarned = this._computePlayXp(
            `song:${songId}`,
            baseXp,
            prev.stars,
            earnedStars,
            accuracy,
            Number(stats.perfectCount) || 0
        );

        const bothHandsActive = Boolean(stats.activeHands?.left && stats.activeHands?.right);
        const hasChords = Array.isArray(stats.song?.chords) && stats.song.chords.length > 0;
        const newAchievements = this._evaluateAchievements({
            completed: nowCompleted,
            accuracy,
            hasChords,
            bothHandsActive
        }, playedAt);

        const currentRank = this.getRankInfo(this.state.totalXp);
        const rankUp = currentRank.rank > prevRank.rank
            ? { previousRank: prevRank, currentRank }
            : null;

        this._saveState();

        return {
            kind: "song",
            songId,
            item: { ...updated },
            earnedStars,
            xpEarned,
            totalXp: this.state.totalXp,
            rankInfo: currentRank,
            rankUp,
            streakDays,
            newlyCompletedSong: !wasSongCompleted && nowCompleted,
            newlyCompletedLesson: null,
            newlyCompletedLevel: null,
            newAchievements
        };
    }

    /**
     * Toggles manual completion state on a curriculum part, lesson, or song.
     */
    toggleManualComplete(id, kind = "auto") {
        if (!id) return null;

        const resolvedKind = kind === "auto"
            ? (this._partIndex.has(id) ? "part" : (this._lessonIndex.has(id) ? "lesson" : "song"))
            : kind;

        if (resolvedKind === "lesson") {
            const lessonEntry = this._lessonIndex.get(id);
            if (!lessonEntry) return null;
            const currentlyDone = this.isLessonCompleted(id);
            const targetDone = !currentlyDone;
            for (const p of lessonEntry.lesson.parts || []) {
                this._applyManualStateToItem("part", p.id, targetDone, false);
            }
            this._recomputeHierarchy(true);
            this._evaluateAchievements({});
            this._saveState();
            return { kind: "lesson", id, completed: targetDone, progress: this.getLessonProgress(id) };
        }

        const currentItem = resolvedKind === "part"
            ? this.getPartProgress(id)
            : this.getSongProgress(id);
        const targetDone = !currentItem.completed;
        return this.setManualComplete(id, targetDone, resolvedKind);
    }

    setManualComplete(id, completed, kind = "auto") {
        if (!id) return null;
        const resolvedKind = kind === "auto"
            ? (this._partIndex.has(id) ? "part" : "song")
            : kind;

        const updated = this._applyManualStateToItem(resolvedKind, id, Boolean(completed), true);
        if (resolvedKind === "part") {
            if (completed) {
                this.state.lastPartId = id;
            }
            this._recomputeHierarchy(true);
        }
        this._evaluateAchievements({ completed: Boolean(completed) });
        this._saveState();
        return {
            kind: resolvedKind,
            id,
            completed: updated.completed,
            item: { ...updated }
        };
    }

    _applyManualStateToItem(kind, id, targetCompleted, adjustManualCredit = true) {
        const table = kind === "part" ? this.state.parts : this.state.songs;
        const prev = this._sanitizeItemRecord(table[id]);
        const creditKey = `${kind}:${id}`;
        const manualXpAmount = 30;

        let nextStars = prev.stars;
        if (targetCompleted && nextStars === 0) {
            nextStars = 1;
        } else if (!targetCompleted && prev.attempts === 0) {
            nextStars = 0;
        }

        const updated = {
            ...prev,
            completed: Boolean(targetCompleted),
            manualComplete: Boolean(targetCompleted),
            stars: nextStars,
            lastPlayedAt: prev.lastPlayedAt || (targetCompleted ? new Date().toISOString() : null)
        };
        table[id] = updated;

        if (adjustManualCredit) {
            if (targetCompleted && !this.state.manualCreditLedger[creditKey] && prev.attempts === 0) {
                this.state.manualCreditLedger[creditKey] = manualXpAmount;
                this.state.totalXp += manualXpAmount;
            } else if (!targetCompleted && this.state.manualCreditLedger[creditKey] && prev.attempts === 0) {
                this.state.totalXp = Math.max(0, this.state.totalXp - this.state.manualCreditLedger[creditKey]);
                delete this.state.manualCreditLedger[creditKey];
            }
        }

        return updated;
    }

    setLastPlayedPart(partId) {
        if (!partId) return;
        this.state.lastPartId = partId;
        this._saveState();
    }

    getPartProgress(partId) {
        return this._sanitizeItemRecord(this.state.parts[partId]);
    }

    getSongProgress(songId) {
        return this._sanitizeItemRecord(this.state.songs[songId]);
    }

    isPartCompleted(partId) {
        return Boolean(this.state.parts[partId]?.completed);
    }

    isSongCompleted(songId) {
        return Boolean(this.state.songs[songId]?.completed);
    }

    isLessonCompleted(lessonId) {
        return Boolean(this.state.lessons[lessonId]?.completed);
    }

    isLevelCompleted(levelNum) {
        const n = typeof levelNum === "object" && levelNum ? levelNum.level : Number(levelNum);
        return Boolean(this.state.levels[n]?.completed);
    }

    getLessonProgress(lessonId) {
        const lState = this.state.lessons[lessonId];
        if (lState) {
            const pct = lState.totalParts > 0
                ? Math.round((lState.completedParts / lState.totalParts) * 100)
                : 0;
            return { ...lState, progressPercent: pct };
        }
        const entry = this._lessonIndex.get(lessonId);
        const totalParts = entry?.lesson?.parts?.length || 0;
        return {
            completed: false,
            completedParts: 0,
            totalParts,
            progressPercent: 0,
            stars: 0,
            maxStars: totalParts * 3,
            bestAccuracy: 0,
            completedAt: null
        };
    }

    getLevelProgress(levelNum) {
        const n = typeof levelNum === "object" && levelNum ? levelNum.level : Number(levelNum);
        const lvState = this.state.levels[n];
        if (lvState) {
            const pct = lvState.totalParts > 0
                ? Math.round((lvState.completedParts / lvState.totalParts) * 100)
                : 0;
            return { ...lvState, progressPercent: pct };
        }
        const lvObj = this._levelIndex.get(n);
        const totalLessons = lvObj?.lessons?.length || 0;
        const totalParts = (lvObj?.lessons || []).reduce((acc, l) => acc + (l.parts?.length || 0), 0);
        return {
            level: n,
            completed: false,
            completedLessons: 0,
            totalLessons,
            completedParts: 0,
            totalParts,
            progressPercent: 0,
            stars: 0,
            maxStars: totalParts * 3,
            completedAt: null
        };
    }

    getRankInfo(xp = this.state.totalXp) {
        const safeXp = Math.max(0, Math.round(Number(xp) || 0));
        const rankList = Array.isArray(this.ranks) && this.ranks.length > 0 ? this.ranks : PIANIST_RANKS;
        let currentIdx = 0;
        for (let i = 0; i < rankList.length; i++) {
            if (safeXp >= rankList[i].minXp) {
                currentIdx = i;
            }
        }
        const current = rankList[currentIdx];
        const next = rankList[currentIdx + 1] || null;

        if (!next) {
            return {
                rank: current.rank,
                id: current.id,
                title: current.title,
                totalXp: safeXp,
                minXp: current.minXp,
                nextXp: current.minXp,
                xpIntoRank: safeXp - current.minXp,
                xpNeededForNext: 0,
                progressPercent: 100,
                nextTitle: null,
                isMaxRank: true
            };
        }

        const span = Math.max(1, next.minXp - current.minXp);
        const into = Math.max(0, safeXp - current.minXp);
        return {
            rank: current.rank,
            id: current.id,
            title: current.title,
            totalXp: safeXp,
            minXp: current.minXp,
            nextXp: next.minXp,
            xpIntoRank: into,
            xpNeededForNext: Math.max(0, next.minXp - safeXp),
            progressPercent: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
            nextTitle: next.title,
            isMaxRank: false
        };
    }

    getStreakInfo(nowIso = null) {
        const todayKey = toDateKey(nowIso);
        const lastKey = this.state.streak.lastPracticeDate;
        const diff = lastKey ? dayDiffUtc(lastKey, todayKey) : null;
        const activeCurrent = (diff === 0 || diff === 1) ? this.state.streak.current : 0;

        return {
            streakDays: activeCurrent,
            storedStreakDays: this.state.streak.current,
            bestStreakDays: this.state.streak.best,
            lastPracticeDate: lastKey,
            practicedToday: diff === 0
        };
    }

    getAchievements() {
        return this.achievementDefinitions.map((def) => {
            const unlockedRec = this.state.achievements[def.id];
            return {
                ...def,
                unlocked: Boolean(unlockedRec && unlockedRec.unlocked),
                unlockedAt: unlockedRec?.unlockedAt || null
            };
        });
    }

    /**
     * Resolves the "Continue Learning" pointer:
     * 1. If `lastPartId` is in-progress (uncompleted), resume `lastPartId`.
     * 2. If `lastPartId` is completed, point to the next uncompleted part after `lastPartId`.
     * 3. Otherwise return the first uncompleted part across Levels 1–9 (or Level 1 Lesson 1 Part 1).
     */
    getContinueLearning() {
        if (this._orderedPartEntries.length === 0) return null;

        if (this.state.lastPartId && this._partIndex.has(this.state.lastPartId)) {
            const lastEntry = this._partIndex.get(this.state.lastPartId);
            if (!this.isPartCompleted(this.state.lastPartId)) {
                return { ...lastEntry, reason: "resume" };
            }
            const lastIdx = this._orderedPartEntries.findIndex((e) => e.part.id === this.state.lastPartId);
            if (lastIdx >= 0) {
                for (let i = lastIdx + 1; i < this._orderedPartEntries.length; i++) {
                    const cand = this._orderedPartEntries[i];
                    if (!this.isPartCompleted(cand.part.id)) {
                        return { ...cand, reason: "next_part" };
                    }
                }
            }
        }

        const firstUncompleted = this._orderedPartEntries.find((e) => !this.isPartCompleted(e.part.id));
        if (firstUncompleted) {
            return { ...firstUncompleted, reason: "up_next" };
        }

        const finalEntry = this._orderedPartEntries[this._orderedPartEntries.length - 1];
        return { ...finalEntry, reason: "curriculum_complete" };
    }

    getCurriculumSummary() {
        const totalLevels = this._levelIndex.size;
        const totalLessons = this._lessonIndex.size;
        const totalParts = this._orderedPartEntries.length;

        let completedLevels = 0;
        for (const lvNum of this._levelIndex.keys()) {
            if (this.isLevelCompleted(lvNum)) completedLevels += 1;
        }

        let completedLessons = 0;
        for (const lessonId of this._lessonIndex.keys()) {
            if (this.isLessonCompleted(lessonId)) completedLessons += 1;
        }

        let completedParts = 0;
        let earnedStars = 0;
        for (const entry of this._orderedPartEntries) {
            const pRec = this.state.parts[entry.part.id];
            if (pRec?.completed) completedParts += 1;
            if (pRec?.stars) earnedStars += pRec.stars;
        }

        const completionPercent = totalParts > 0
            ? Math.round((completedParts / totalParts) * 100)
            : 0;

        const nextTarget = this.getContinueLearning();
        const activeLevel = nextTarget?.level?.level || 1;

        return {
            completedParts,
            totalParts,
            completedLessons,
            totalLessons,
            completedLevels,
            totalLevels,
            earnedStars,
            maxStars: totalParts * 3,
            completionPercent,
            activeLevel
        };
    }

    getSongsSummary(songsList = []) {
        const ids = Array.isArray(songsList) && songsList.length > 0
            ? songsList.map((s) => (typeof s === "string" ? s : s.id)).filter(Boolean)
            : Object.keys(this.state.songs);

        const uniqueIds = Array.from(new Set(ids));
        let completedSongs = 0;
        let inProgressSongs = 0;
        let earnedStars = 0;

        for (const id of uniqueIds) {
            const rec = this.state.songs[id];
            if (!rec) continue;
            if (rec.completed) {
                completedSongs += 1;
            } else if (rec.attempts > 0) {
                inProgressSongs += 1;
            }
            earnedStars += rec.stars || 0;
        }

        // Also include stars from any previously played songs not in songsList
        if (uniqueIds.length === 0) {
            for (const rec of Object.values(this.state.songs)) {
                if (rec?.completed) completedSongs += 1;
                else if (rec?.attempts > 0) inProgressSongs += 1;
                earnedStars += rec?.stars || 0;
            }
        }

        const totalSongs = uniqueIds.length;
        return {
            completedSongs,
            inProgressSongs,
            totalSongs,
            earnedStars,
            maxStars: totalSongs * 3,
            completionPercent: totalSongs > 0 ? Math.round((completedSongs / totalSongs) * 100) : 0
        };
    }

    getSummary(songsList = []) {
        const curriculum = this.getCurriculumSummary();
        const songs = this.getSongsSummary(songsList);
        const rank = this.getRankInfo(this.state.totalXp);
        const streak = this.getStreakInfo();
        const achievements = this.getAchievements();
        const continueLearning = this.getContinueLearning();

        return {
            instrument: this.instrument,
            totalXp: this.state.totalXp,
            rank,
            streak,
            curriculum,
            songs,
            totalStars: curriculum.earnedStars + songs.earnedStars,
            unlockedAchievementsCount: achievements.filter((a) => a.unlocked).length,
            totalAchievementsCount: achievements.length,
            achievements,
            continueLearning,
            lastPartId: this.state.lastPartId,
            lastSongId: this.state.lastSongId
        };
    }
}
