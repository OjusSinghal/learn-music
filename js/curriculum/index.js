/**
 * Structured Piano Curriculum Index (Levels 1–9)
 *
 * Combines Levels 1–4 (`./levels_1_to_4.js`) and Levels 5–9 (`./levels_5_to_9.js`)
 * into a unified, sorted 9-level conservatory curriculum (`PIANO_CURRICULUM`) and
 * provides fast O(1) lookup helpers for levels, lessons, parts, sequential part
 * progression, and curriculum songs.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";
import { LEVELS_1_TO_4 } from "./levels_1_to_4.js";
import { LEVELS_5_TO_9 } from "./levels_5_to_9.js";

function normalizeCurriculumLevels(rawLevels) {
    if (!Array.isArray(rawLevels)) return [];

    return [...rawLevels]
        .filter((lvl) => lvl && typeof lvl.level === "number")
        .sort((a, b) => a.level - b.level)
        .map((lvl) => {
            const sortedLessons = Array.isArray(lvl.lessons)
                ? [...lvl.lessons].sort((a, b) => (a.order || 0) - (b.order || 0))
                : [];

            return {
                ...lvl,
                lessons: sortedLessons.map((lesson, lIdx) => {
                    const sortedParts = Array.isArray(lesson.parts)
                        ? [...lesson.parts].sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0))
                        : [];

                    return {
                        ...lesson,
                        order: lesson.order || lIdx + 1,
                        parts: sortedParts.map((part, pIdx) => ({
                            ...part,
                            partNumber: part.partNumber || pIdx + 1,
                            song: part.song ? PianoFingeringEngine.ensureSongFingering(part.song) : null
                        }))
                    };
                })
            };
        });
}

export const PIANO_CURRICULUM = normalizeCurriculumLevels([
    ...(Array.isArray(LEVELS_1_TO_4) ? LEVELS_1_TO_4 : []),
    ...(Array.isArray(LEVELS_5_TO_9) ? LEVELS_5_TO_9 : [])
]);

// Pre-build lookup indices for O(1) queries
const LEVEL_BY_NUMBER = new Map();
const LESSON_BY_ID = new Map();
const PART_ENTRY_BY_ID = new Map();
const SONG_ENTRY_BY_ID = new Map();
const PART_INDEX_BY_ID = new Map();
const ALL_CURRICULUM_PARTS = [];

for (const level of PIANO_CURRICULUM) {
    LEVEL_BY_NUMBER.set(level.level, level);

    for (const lesson of level.lessons) {
        if (lesson && lesson.id) {
            LESSON_BY_ID.set(lesson.id, lesson);
        }

        for (const part of lesson.parts) {
            if (!part || !part.id) continue;
            const entry = { level, lesson, part };
            const flatIdx = ALL_CURRICULUM_PARTS.length;
            ALL_CURRICULUM_PARTS.push(entry);
            PART_ENTRY_BY_ID.set(part.id, entry);
            PART_INDEX_BY_ID.set(part.id, flatIdx);

            if (part.song && part.song.id) {
                const songEntry = { level, lesson, part, song: part.song };
                SONG_ENTRY_BY_ID.set(part.song.id, songEntry);
                if (!SONG_ENTRY_BY_ID.has(part.id)) {
                    SONG_ENTRY_BY_ID.set(part.id, songEntry);
                }
            }
        }
    }
}

/**
 * Returns the sorted array of all curriculum levels (1..9).
 */
export function getCurriculumLevels() {
    return PIANO_CURRICULUM;
}

/**
 * Returns a Level object by its numeric level (1..9), or null if not found.
 */
export function getLevelByNumber(levelNum) {
    const num = Number(levelNum);
    if (!Number.isFinite(num)) return null;
    return LEVEL_BY_NUMBER.get(num) || null;
}

/**
 * Returns a Lesson object by its lesson ID (e.g. "l1_lesson_1"), or null if not found.
 */
export function getLessonById(lessonId) {
    if (!lessonId) return null;
    return LESSON_BY_ID.get(String(lessonId)) || null;
}

/**
 * Returns `{ level, lesson, part }` for a given part ID (e.g. "l1_1_p1"), or null if not found.
 */
export function getPartById(partId) {
    if (!partId) return null;
    const key = String(partId);
    if (PART_ENTRY_BY_ID.has(key)) {
        return PART_ENTRY_BY_ID.get(key);
    }
    if (SONG_ENTRY_BY_ID.has(key)) {
        const found = SONG_ENTRY_BY_ID.get(key);
        return { level: found.level, lesson: found.lesson, part: found.part };
    }
    return null;
}

/**
 * Returns `{ level, lesson, part }` for the chronological next curriculum part after `partId`,
 * advancing seamlessly across lessons and levels, or null when `partId` is the final part.
 */
export function getNextPart(partId) {
    if (!partId) return null;
    const key = String(partId);
    let idx = PART_INDEX_BY_ID.get(key);
    if (idx === undefined && SONG_ENTRY_BY_ID.has(key)) {
        idx = PART_INDEX_BY_ID.get(SONG_ENTRY_BY_ID.get(key).part.id);
    }
    if (idx === undefined || idx + 1 >= ALL_CURRICULUM_PARTS.length) {
        return null;
    }
    return ALL_CURRICULUM_PARTS[idx + 1];
}

/**
 * Returns a shallow copy of the flat chronological list of `{ level, lesson, part }` across Levels 1–9.
 */
export function getAllCurriculumParts() {
    return [...ALL_CURRICULUM_PARTS];
}

/**
 * Returns `{ level, lesson, part, song }` for a curriculum song ID (or part ID), or null if not found.
 */
export function getCurriculumSongById(songId) {
    if (!songId) return null;
    return SONG_ENTRY_BY_ID.get(String(songId)) || null;
}
