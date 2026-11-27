/**
 * Ukulele Music Theory, Standard High-G Tuning & Chord Voicing Library
 *
 * Standard Re-Entrant High-G Tuning (Soprano / Concert / Tenor):
 *   - Tab string index 0 (top tab line):    A4 (MIDI 69, 440.00 Hz)
 *   - Tab string index 1 (2nd tab line):    E4 (MIDI 64, 329.63 Hz)
 *   - Tab string index 2 (3rd tab line):    C4 (MIDI 60, 261.63 Hz)
 *   - Tab string index 3 (bottom tab line): G4 (MIDI 67, 392.00 Hz)
 *
 * Chord Diagram Order Convention:
 *   - Traditional chord shapes are written in G-C-E-A order: `[gFret, cFret, eFret, aFret]`
 *   - Explicit conversion helpers (`gceaToTabOrder`, `tabOrderToGcea`, `gceaIndexToTabString`,
 *     `tabStringToGceaIndex`) eliminate any off-by-one or string-inversion ambiguity.
 *
 * Fretting Finger Color Mapping (harmonized with canonical FINGER_PALETTE, zero harsh red):
 *   - 0 (Open):  "O" -> #48A870 (Conservatory Sage)
 *   - 1 (Index): "1" -> #F0C830 (Warm Gold)
 *   - 2 (Middle):"2" -> #6848F8 (Royal Indigo)
 *   - 3 (Ring):  "3" -> #4090F8 (Cerulean Azure)
 *   - 4 (Pinky): "4" -> #E86078 (Muted Rose)
 */

import { parseChordSymbol } from "../audio/backing_track.js";

export const UKULELE_MAX_FRET = 12;
export const UKULELE_MIN_MIDI = 60; // C4 (open C string)
export const UKULELE_MAX_MIDI = 81; // A5 (A string fret 12)

/**
 * Tab-order string metadata (index 0 = top tab line A4 .. index 3 = bottom tab line G4).
 */
export const UKULELE_STRINGS = [
    { index: 0, name: "A", octave: 4, openMidi: 69, label: "A4", freq: 440.0 },
    { index: 1, name: "E", octave: 4, openMidi: 64, label: "E4", freq: 329.6276 },
    { index: 2, name: "C", octave: 4, openMidi: 60, label: "C4", freq: 261.6256 },
    { index: 3, name: "G", octave: 4, openMidi: 67, label: "G4", freq: 391.9954 }
];

// Open MIDI pitches in G-C-E-A diagram order: [G4=67, C4=60, E4=64, A4=69]
export const GCEA_OPEN_MIDIS = [67, 60, 64, 69];
export const GCEA_STRING_NAMES = ["G", "C", "E", "A"];

/**
 * Canonical 5-color fretting finger palette aligned with `FINGER_PALETTE` in `js/engine/fingering.js`.
 */
export const UKULELE_FINGER_PALETTE = {
    0: {
        finger: 0,
        label: "O",
        diagramLabel: "O",
        name: "Open",
        primary: "#48A870",
        light: "#74C695",
        dark: "#2F8554",
        text: "#FFFFFF"
    },
    1: {
        finger: 1,
        label: "1",
        diagramLabel: "1",
        name: "Index",
        primary: "#F0C830",
        light: "#F8E080",
        dark: "#C89D14",
        text: "#FFFFFF"
    },
    2: {
        finger: 2,
        label: "2",
        diagramLabel: "2",
        name: "Middle",
        primary: "#6848F8",
        light: "#B0A0F8",
        dark: "#4C2FD9",
        text: "#FFFFFF"
    },
    3: {
        finger: 3,
        label: "3",
        diagramLabel: "3",
        name: "Ring",
        primary: "#4090F8",
        light: "#98D8F8",
        dark: "#256EE0",
        text: "#FFFFFF"
    },
    4: {
        finger: 4,
        label: "4",
        diagramLabel: "4",
        name: "Pinky",
        primary: "#E86078",
        light: "#F0A8B8",
        dark: "#C93B56",
        text: "#FFFFFF"
    }
};

export function getUkuleleFingerStyle(finger) {
    const f = Number(finger);
    if (Number.isInteger(f) && f >= 0 && f <= 4) {
        return UKULELE_FINGER_PALETTE[f];
    }
    return UKULELE_FINGER_PALETTE[0];
}

export function getUkuleleFingerColor(finger) {
    return getUkuleleFingerStyle(finger).primary;
}

/**
 * Converts a 4-element `[G, C, E, A]` chord-diagram array into tab-coordinate order `[A, E, C, G]`
 * (`stringIndex 0=A, 1=E, 2=C, 3=G`).
 */
export function gceaToTabOrder(gceaArr) {
    if (!Array.isArray(gceaArr) || gceaArr.length < 4) return [0, 0, 0, 0];
    return [gceaArr[3], gceaArr[2], gceaArr[1], gceaArr[0]];
}

/**
 * Converts a 4-element tab-order array `[A, E, C, G]` into traditional `[G, C, E, A]` chord-diagram order.
 */
export function tabOrderToGcea(tabArr) {
    if (!Array.isArray(tabArr) || tabArr.length < 4) return [0, 0, 0, 0];
    return [tabArr[3], tabArr[2], tabArr[1], tabArr[0]];
}

/** Maps G-C-E-A index (`0=G, 1=C, 2=E, 3=A`) to tab string index (`3=G, 2=C, 1=E, 0=A`). */
export function gceaIndexToTabString(gceaIdx) {
    return 3 - gceaIdx;
}

/** Maps tab string index (`0=A, 1=E, 2=C, 3=G`) to G-C-E-A index (`3=A, 2=E, 1=C, 0=G`). */
export function tabStringToGceaIndex(stringIndex) {
    return 3 - stringIndex;
}

/** Returns exact MIDI pitch (`openMidi + fret`) for a tab string index (`0..3`) and fret (`0..12`). */
export function getMidiForStringFret(stringIndex, fret) {
    const s = UKULELE_STRINGS[stringIndex];
    if (!s || fret < 0) return null;
    return s.openMidi + fret;
}

/**
 * Returns all playable `{ string, stringName, fret, pitch }` locations on the 12-fret ukulele
 * for a given MIDI pitch (`60..81`).
 */
export function getPlayablePositionsForPitch(midi, maxFret = UKULELE_MAX_FRET) {
    const p = Math.round(Number(midi));
    const positions = [];
    for (let s = 0; s < UKULELE_STRINGS.length; s++) {
        const fret = p - UKULELE_STRINGS[s].openMidi;
        if (fret >= 0 && fret <= maxFret) {
            positions.push({
                string: s,
                stringName: UKULELE_STRINGS[s].name,
                fret,
                pitch: p
            });
        }
    }
    return positions;
}

const ENHARMONIC_ROOT_MAP = {
    "C": "C", "B#": "C",
    "C#": "C#", "Db": "C#",
    "D": "D",
    "D#": "Eb", "Eb": "Eb",
    "E": "E", "Fb": "E",
    "F": "F", "E#": "F",
    "F#": "F#", "Gb": "F#",
    "G": "G",
    "G#": "Ab", "Ab": "Ab",
    "A": "A",
    "A#": "Bb", "Bb": "Bb",
    "B": "B", "Cb": "B"
};

const PC_TO_CANONICAL_ROOT = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * Curated ergonomic Ukulele Chord Shapes in standard `[G, C, E, A]` diagram order.
 * Every shape is verified for playability (frets `0..12`, ergonomic fingerings `0..4`,
 * authentic chord tones in High-G tuning).
 */
const RAW_CHORD_SHAPES = {
    // ── C family ──
    "C":      { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3], difficulty: 1 },
    "Cm":     { frets: [0, 3, 3, 3], fingers: [0, 1, 2, 3], difficulty: 2 },
    "C7":     { frets: [0, 0, 0, 1], fingers: [0, 0, 0, 1], difficulty: 1 },
    "Cmaj7":  { frets: [0, 0, 0, 2], fingers: [0, 0, 0, 2], difficulty: 1 },
    "Cm7":    { frets: [3, 3, 3, 3], fingers: [1, 1, 1, 1], barre: { fret: 3, finger: 1 }, difficulty: 2 },
    "Csus4":  { frets: [0, 0, 1, 3], fingers: [0, 0, 1, 3], difficulty: 1 },
    "Csus2":  { frets: [0, 2, 3, 3], fingers: [0, 1, 2, 3], difficulty: 2 },
    "Cdim":   { frets: [5, 3, 2, 3], fingers: [4, 2, 1, 3], difficulty: 3 },
    "Cdim7":  { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4], difficulty: 3 },
    "Caug":   { frets: [1, 0, 0, 3], fingers: [1, 0, 0, 4], difficulty: 2 },
    "Cadd9":  { frets: [0, 2, 0, 3], fingers: [0, 1, 0, 3], difficulty: 1 },
    "C6":     { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], difficulty: 1 },
    "Cm6":    { frets: [2, 3, 3, 3], fingers: [1, 2, 3, 4], difficulty: 3 },
    "Cm7b5":  { frets: [3, 3, 2, 3], fingers: [2, 3, 1, 4], difficulty: 3 },
    "C9":     { frets: [5, 4, 6, 5], fingers: [2, 1, 4, 3], difficulty: 3 },

    // ── C# / Db family ──
    "C#":     { frets: [1, 1, 1, 4], fingers: [1, 1, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "C#m":    { frets: [1, 4, 4, 4], fingers: [1, 2, 3, 4], difficulty: 3 },
    "C#7":    { frets: [1, 1, 1, 2], fingers: [1, 1, 1, 2], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "C#maj7": { frets: [1, 1, 1, 3], fingers: [1, 1, 1, 3], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "C#m7":   { frets: [4, 4, 4, 4], fingers: [1, 1, 1, 1], barre: { fret: 4, finger: 1 }, difficulty: 2 },
    "C#sus4": { frets: [1, 1, 2, 4], fingers: [1, 1, 2, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "C#sus2": { frets: [1, 3, 4, 4], fingers: [1, 2, 3, 4], difficulty: 3 },
    "C#dim":  { frets: [6, 4, 3, 4], fingers: [4, 2, 1, 3], difficulty: 3 },
    "C#dim7": { frets: [0, 1, 0, 1], fingers: [0, 1, 0, 2], difficulty: 2 },
    "C#aug":  { frets: [2, 1, 1, 4], fingers: [2, 1, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "C#add9": { frets: [1, 3, 1, 4], fingers: [1, 3, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "C#6":    { frets: [1, 1, 1, 1], fingers: [1, 1, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },

    // ── D family ──
    "D":      { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0], difficulty: 2 },
    "Dm":     { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0], difficulty: 2 },
    "D7":     { frets: [2, 2, 2, 3], fingers: [1, 1, 1, 2], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Dmaj7":  { frets: [2, 2, 2, 4], fingers: [1, 1, 1, 3], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Dm7":    { frets: [2, 2, 1, 3], fingers: [2, 3, 1, 4], difficulty: 2 },
    "Dsus4":  { frets: [2, 2, 3, 0], fingers: [1, 2, 3, 0], difficulty: 2 },
    "Dsus2":  { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0], difficulty: 1 },
    "Ddim":   { frets: [1, 2, 1, 5], fingers: [1, 2, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "Ddim7":  { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4], difficulty: 2 },
    "Daug":   { frets: [3, 2, 2, 1], fingers: [4, 2, 3, 1], difficulty: 3 },
    "Dadd9":  { frets: [2, 2, 2, 7], fingers: [1, 1, 1, 4], difficulty: 4 },
    "D6":     { frets: [2, 2, 2, 2], fingers: [1, 1, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Dm6":    { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4], difficulty: 2 },
    "Dm7b5":  { frets: [1, 2, 1, 3], fingers: [1, 2, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "D9":     { frets: [2, 4, 2, 3], fingers: [1, 4, 1, 2], barre: { fret: 2, finger: 1 }, difficulty: 3 },

    // ── Eb / D# family ──
    "Eb":     { frets: [0, 3, 3, 1], fingers: [0, 2, 3, 1], difficulty: 2 },
    "Ebm":    { frets: [3, 3, 2, 1], fingers: [3, 4, 2, 1], difficulty: 3 },
    "Eb7":    { frets: [3, 3, 3, 4], fingers: [1, 1, 1, 2], barre: { fret: 3, finger: 1 }, difficulty: 3 },
    "Ebmaj7": { frets: [3, 3, 3, 5], fingers: [1, 1, 1, 3], barre: { fret: 3, finger: 1 }, difficulty: 3 },
    "Ebm7":   { frets: [3, 3, 2, 4], fingers: [2, 3, 1, 4], difficulty: 3 },
    "Ebsus4": { frets: [1, 3, 4, 1], fingers: [1, 3, 4, 1], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "Ebsus2": { frets: [3, 3, 1, 1], fingers: [3, 4, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "Ebdim":  { frets: [2, 3, 2, 6], fingers: [1, 2, 1, 4], difficulty: 4 },
    "Ebdim7": { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4], difficulty: 3 },
    "Ebaug":  { frets: [0, 3, 3, 2], fingers: [0, 2, 3, 1], difficulty: 2 },
    "Ebadd9": { frets: [0, 3, 1, 1], fingers: [0, 3, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Eb6":    { frets: [3, 3, 3, 3], fingers: [1, 1, 1, 1], barre: { fret: 3, finger: 1 }, difficulty: 2 },

    // ── E family ──
    "E":      { frets: [4, 4, 4, 2], fingers: [2, 3, 4, 1], difficulty: 3 },
    "Em":     { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1], difficulty: 2 },
    "E7":     { frets: [1, 2, 0, 2], fingers: [1, 2, 0, 3], difficulty: 2 },
    "Emaj7":  { frets: [1, 3, 0, 2], fingers: [1, 3, 0, 2], difficulty: 2 },
    "Em7":    { frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2], difficulty: 1 },
    "Esus4":  { frets: [2, 4, 0, 2], fingers: [1, 4, 0, 2], difficulty: 3 },
    "Esus2":  { frets: [4, 4, 2, 2], fingers: [3, 4, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "Edim":   { frets: [0, 4, 3, 1], fingers: [0, 4, 3, 1], difficulty: 3 },
    "Edim7":  { frets: [0, 1, 0, 1], fingers: [0, 1, 0, 2], difficulty: 2 },
    "Eaug":   { frets: [1, 0, 0, 3], fingers: [1, 0, 0, 4], difficulty: 2 },
    "Eadd9":  { frets: [1, 4, 2, 2], fingers: [1, 4, 2, 3], difficulty: 3 },
    "E6":     { frets: [4, 4, 4, 4], fingers: [1, 1, 1, 1], barre: { fret: 4, finger: 1 }, difficulty: 2 },
    "Em7b5":  { frets: [0, 2, 0, 1], fingers: [0, 2, 0, 1], difficulty: 1 },

    // ── F family ──
    "F":      { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0], difficulty: 1 },
    "Fm":     { frets: [1, 0, 1, 3], fingers: [1, 0, 2, 4], difficulty: 2 },
    "F7":     { frets: [2, 3, 1, 3], fingers: [2, 3, 1, 4], difficulty: 3 },
    "Fmaj7":  { frets: [2, 4, 1, 3], fingers: [2, 4, 1, 3], difficulty: 3 },
    "Fm7":    { frets: [1, 3, 1, 3], fingers: [1, 3, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Fsus4":  { frets: [3, 0, 1, 1], fingers: [3, 0, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Fsus2":  { frets: [0, 0, 1, 3], fingers: [0, 0, 1, 3], difficulty: 1 },
    "Fdim":   { frets: [1, 5, 4, 2], fingers: [1, 4, 3, 2], difficulty: 4 },
    "Fdim7":  { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4], difficulty: 2 },
    "Faug":   { frets: [2, 1, 1, 0], fingers: [3, 1, 2, 0], difficulty: 2 },
    "Fadd9":  { frets: [0, 0, 1, 0], fingers: [0, 0, 1, 0], difficulty: 1 },
    "F6":     { frets: [2, 2, 1, 3], fingers: [2, 3, 1, 4], difficulty: 2 },
    "Fm6":    { frets: [1, 2, 1, 3], fingers: [1, 2, 1, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "F9":     { frets: [0, 3, 1, 0], fingers: [0, 3, 1, 0], difficulty: 2 },

    // ── F# / Gb family ──
    "F#":     { frets: [3, 1, 2, 1], fingers: [3, 1, 2, 1], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "F#m":    { frets: [2, 1, 2, 0], fingers: [2, 1, 3, 0], difficulty: 2 },
    "F#7":    { frets: [3, 4, 2, 4], fingers: [2, 3, 1, 4], difficulty: 3 },
    "F#maj7": { frets: [3, 5, 2, 4], fingers: [2, 4, 1, 3], difficulty: 3 },
    "F#m7":   { frets: [2, 4, 2, 4], fingers: [1, 3, 1, 4], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "F#sus4": { frets: [4, 1, 2, 2], fingers: [4, 1, 2, 3], difficulty: 3 },
    "F#sus2": { frets: [1, 1, 2, 4], fingers: [1, 1, 2, 4], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "F#dim":  { frets: [2, 0, 2, 3], fingers: [1, 0, 2, 3], difficulty: 2 },
    "F#dim7": { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4], difficulty: 3 },
    "F#aug":  { frets: [3, 2, 2, 1], fingers: [4, 2, 3, 1], difficulty: 3 },
    "F#add9": { frets: [1, 1, 2, 1], fingers: [1, 1, 2, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "F#m7b5": { frets: [2, 4, 2, 3], fingers: [1, 4, 1, 2], barre: { fret: 2, finger: 1 }, difficulty: 3 },

    // ── G family ──
    "G":      { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2], difficulty: 2 },
    "Gm":     { frets: [0, 2, 3, 1], fingers: [0, 2, 3, 1], difficulty: 2 },
    "G7":     { frets: [0, 2, 1, 2], fingers: [0, 2, 1, 3], difficulty: 2 },
    "Gmaj7":  { frets: [0, 2, 2, 2], fingers: [0, 1, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Gm7":    { frets: [0, 2, 1, 1], fingers: [0, 2, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Gsus4":  { frets: [0, 2, 3, 3], fingers: [0, 1, 2, 3], difficulty: 2 },
    "Gsus2":  { frets: [0, 2, 3, 0], fingers: [0, 1, 2, 0], difficulty: 1 },
    "Gdim":   { frets: [0, 1, 3, 1], fingers: [0, 1, 3, 2], difficulty: 2 },
    "Gdim7":  { frets: [0, 1, 0, 1], fingers: [0, 1, 0, 2], difficulty: 2 },
    "Gaug":   { frets: [0, 3, 3, 2], fingers: [0, 2, 3, 1], difficulty: 2 },
    "Gadd9":  { frets: [2, 2, 3, 2], fingers: [1, 1, 2, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "G6":     { frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2], difficulty: 1 },
    "Gm6":    { frets: [0, 2, 0, 1], fingers: [0, 2, 0, 1], difficulty: 1 },
    "G9":     { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4], difficulty: 2 },

    // ── Ab / G# family ──
    "Ab":     { frets: [5, 3, 4, 3], fingers: [3, 1, 2, 1], barre: { fret: 3, finger: 1 }, difficulty: 3 },
    "Abm":    { frets: [4, 3, 4, 2], fingers: [3, 2, 4, 1], difficulty: 3 },
    "Ab7":    { frets: [1, 3, 2, 3], fingers: [1, 3, 2, 4], difficulty: 3 },
    "Abmaj7": { frets: [1, 3, 3, 3], fingers: [1, 2, 3, 4], difficulty: 3 },
    "Abm7":   { frets: [1, 3, 2, 2], fingers: [1, 4, 2, 3], difficulty: 3 },
    "Absus4": { frets: [1, 3, 4, 4], fingers: [1, 2, 3, 4], difficulty: 3 },
    "Absus2": { frets: [1, 3, 4, 1], fingers: [1, 3, 4, 1], barre: { fret: 1, finger: 1 }, difficulty: 3 },
    "Abdim":  { frets: [1, 2, 4, 2], fingers: [1, 2, 4, 3], difficulty: 3 },
    "Abdim7": { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4], difficulty: 2 },
    "Abaug":  { frets: [1, 0, 0, 3], fingers: [1, 0, 0, 4], difficulty: 2 },
    "Abadd9": { frets: [3, 3, 4, 3], fingers: [1, 1, 2, 1], barre: { fret: 3, finger: 1 }, difficulty: 3 },

    // ── A family ──
    "A":      { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0], difficulty: 1 },
    "Am":     { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0], difficulty: 1 },
    "A7":     { frets: [0, 1, 0, 0], fingers: [0, 1, 0, 0], difficulty: 1 },
    "Amaj7":  { frets: [1, 1, 0, 0], fingers: [1, 2, 0, 0], difficulty: 1 },
    "Am7":    { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], difficulty: 1 },
    "Asus4":  { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0], difficulty: 1 },
    "Asus2":  { frets: [2, 4, 0, 0], fingers: [1, 3, 0, 0], difficulty: 2 },
    "Adim":   { frets: [2, 3, 5, 3], fingers: [1, 2, 4, 3], difficulty: 3 },
    "Adim7":  { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4], difficulty: 3 },
    "Aaug":   { frets: [2, 1, 1, 0], fingers: [3, 1, 2, 0], difficulty: 2 },
    "Aadd9":  { frets: [2, 1, 0, 2], fingers: [2, 1, 0, 3], difficulty: 2 },
    "A6":     { frets: [2, 4, 2, 4], fingers: [1, 3, 1, 4], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "Am6":    { frets: [2, 4, 2, 3], fingers: [1, 4, 1, 2], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "Am7b5":  { frets: [2, 3, 3, 3], fingers: [1, 2, 3, 4], difficulty: 3 },
    "A9":     { frets: [0, 1, 0, 2], fingers: [0, 1, 0, 2], difficulty: 1 },

    // ── Bb / A# family ──
    "Bb":     { frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bbm":    { frets: [3, 1, 1, 1], fingers: [3, 1, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bb7":    { frets: [1, 2, 1, 1], fingers: [1, 2, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bbmaj7": { frets: [3, 2, 1, 0], fingers: [3, 2, 1, 0], difficulty: 2 },
    "Bbm7":   { frets: [1, 1, 1, 1], fingers: [1, 1, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bbsus4": { frets: [3, 3, 1, 1], fingers: [3, 4, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bbsus2": { frets: [3, 0, 1, 1], fingers: [3, 0, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },
    "Bbdim":  { frets: [3, 1, 0, 1], fingers: [3, 1, 0, 2], difficulty: 2 },
    "Bbdim7": { frets: [0, 1, 0, 1], fingers: [0, 1, 0, 2], difficulty: 2 },
    "Bbaug":  { frets: [3, 2, 2, 1], fingers: [4, 2, 3, 1], difficulty: 3 },
    "Bbadd9": { frets: [3, 2, 1, 3], fingers: [3, 2, 1, 4], difficulty: 3 },
    "Bb6":    { frets: [0, 2, 1, 1], fingers: [0, 2, 1, 1], barre: { fret: 1, finger: 1 }, difficulty: 2 },

    // ── B family ──
    "B":      { frets: [4, 3, 2, 2], fingers: [3, 2, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "Bm":     { frets: [4, 2, 2, 2], fingers: [3, 1, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "B7":     { frets: [2, 3, 2, 2], fingers: [1, 2, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Bmaj7":  { frets: [4, 3, 2, 1], fingers: [4, 3, 2, 1], difficulty: 3 },
    "Bm7":    { frets: [2, 2, 2, 2], fingers: [1, 1, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 2 },
    "Bsus4":  { frets: [4, 4, 2, 2], fingers: [3, 4, 1, 1], barre: { fret: 2, finger: 1 }, difficulty: 3 },
    "Bsus2":  { frets: [4, 1, 2, 2], fingers: [4, 1, 2, 3], difficulty: 3 },
    "Bdim":   { frets: [4, 2, 1, 2], fingers: [4, 2, 1, 3], difficulty: 3 },
    "Bdim7":  { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4], difficulty: 2 },
    "Baug":   { frets: [0, 3, 3, 2], fingers: [0, 2, 3, 1], difficulty: 2 },
    "Badd9":  { frets: [4, 3, 2, 4], fingers: [3, 2, 1, 4], difficulty: 3 },
    "Bm7b5":  { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4], difficulty: 2 },

    // ── Common Slash Chords (preserving lowest-C-string bass tone where idiomatic!) ──
    "C/E":    { frets: [0, 4, 0, 3], fingers: [0, 3, 0, 2], difficulty: 2 },
    "C/G":    { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3], difficulty: 1 },
    "D/F#":   { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0], difficulty: 2 },
    "D/A":    { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0], difficulty: 2 },
    "G/B":    { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2], difficulty: 2 },
    "G/D":    { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2], difficulty: 2 },
    "Em/G":   { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1], difficulty: 2 },
    "Am/G":   { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], difficulty: 1 },
    "Am/E":   { frets: [2, 4, 0, 0], fingers: [1, 3, 0, 0], difficulty: 2 },
    "F/A":    { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0], difficulty: 1 },
    "F/C":    { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0], difficulty: 1 },
    "Dm/F":   { frets: [2, 5, 5, 5], fingers: [1, 2, 3, 4], difficulty: 3 },
    "A/C#":   { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0], difficulty: 1 }
};

function _buildChordRecord(symbol, canonicalSymbol, raw, parsed) {
    const fretsGCEA = raw.frets.slice(0, 4);
    const fingersGCEA = raw.fingers.slice(0, 4);
    const fretsTab = gceaToTabOrder(fretsGCEA);
    const fingersTab = gceaToTabOrder(fingersGCEA);
    const pitchesGCEA = fretsGCEA.map((f, idx) => (f >= 0 ? GCEA_OPEN_MIDIS[idx] + f : null));
    const pitchesTab = gceaToTabOrder(pitchesGCEA);

    const posFrets = fretsGCEA.filter((f) => f > 0);
    const minPos = posFrets.length > 0 ? Math.min(...posFrets) : 0;
    const maxPos = posFrets.length > 0 ? Math.max(...posFrets) : 0;
    const baseFret = maxPos > 4 ? minPos : 1;

    return {
        symbol,
        canonicalSymbol,
        rootPc: parsed ? parsed.rootPc : 0,
        quality: parsed ? parsed.quality : "maj",
        fretsGCEA,
        fingersGCEA,
        fretsTab,
        fingersTab,
        pitchesGCEA,
        pitchesTab,
        barre: raw.barre || null,
        baseFret,
        difficulty: raw.difficulty || 2
    };
}

/**
 * Assigns ergonomic fretting fingers (`0..4`) to any 4-string `[G, C, E, A]` fret array.
 */
export function assignChordFingers(fretsGCEA) {
    const fingers = [0, 0, 0, 0];
    const fretted = [];
    for (let i = 0; i < 4; i++) {
        if (fretsGCEA[i] > 0) {
            fretted.push({ idx: i, fret: fretsGCEA[i] });
        }
    }
    if (fretted.length === 0) {
        return { fingers, barre: null };
    }

    const minFret = Math.min(...fretted.map((x) => x.fret));
    const minCount = fretted.filter((x) => x.fret === minFret).length;
    const distinctFrets = new Set(fretted.map((x) => x.fret)).size;

    // Detect index-finger barre when >= 2 strings share the lowest fret and > 4 fingers would be needed or >= 3 share minFret
    const useBarre = minCount >= 3 || (minCount >= 2 && fretted.length === 4 && distinctFrets <= 3);
    let barre = null;

    if (useBarre) {
        barre = { fret: minFret, finger: 1 };
        const remaining = [];
        for (const item of fretted) {
            if (item.fret === minFret) {
                fingers[item.idx] = 1;
            } else {
                remaining.push(item);
            }
        }
        remaining.sort((a, b) => (a.fret - b.fret) || (a.idx - b.idx));
        let nextFinger = 2;
        for (const item of remaining) {
            const rel = Math.min(4, Math.max(nextFinger, 1 + (item.fret - minFret)));
            fingers[item.idx] = Math.min(4, rel);
            nextFinger = Math.min(4, fingers[item.idx] + 1);
        }
        return { fingers, barre };
    }

    // Standard non-barre ergonomic assignment ordered by fret then string index
    fretted.sort((a, b) => (a.fret - b.fret) || (a.idx - b.idx));
    const maxFret = fretted[fretted.length - 1].fret;
    const openPos = maxFret <= 4 && minFret <= 2;

    if (openPos && fretted.length <= 3) {
        const used = new Set();
        for (const item of fretted) {
            let f = Math.min(4, Math.max(1, item.fret));
            while (used.has(f) && f < 4) f++;
            while (used.has(f) && f > 1) f--;
            fingers[item.idx] = f;
            used.add(f);
        }
    } else {
        for (let k = 0; k < fretted.length; k++) {
            const item = fretted[k];
            const offset = item.fret - minFret;
            fingers[item.idx] = Math.min(4, Math.max(k + 1, 1 + offset));
        }
    }
    return { fingers, barre };
}

/**
 * Algorithmic Fallback Voicer: generates an ergonomic, musically verified `[G, C, E, A]`
 * voicing for ANY arbitrary chord symbol (e.g. `Dbmaj9`, `F#m7b5`, `G#7sus4`, `Eb/G`).
 */
export function voiceUkuleleChord(symbol) {
    const parsed = parseChordSymbol(symbol, 0);
    const rootPc = parsed.rootPc;
    const targetPcs = new Set(parsed.intervals.map((iv) => (rootPc + iv) % 12));
    const requiredPcs = new Set([rootPc]);

    // Identify primary color tones (3rd/sus + 7th/6th/9th)
    for (const iv of parsed.intervals) {
        const m = iv % 12;
        if (m === 3 || m === 4 || m === 2 || m === 5 || m === 6 || m === 8 || m === 9 || m === 10 || m === 11) {
            requiredPcs.add((rootPc + m) % 12);
        }
    }

    // Precompute allowed frets (0..12) on each G-C-E-A string that belong strictly to `targetPcs`
    const allowed = GCEA_OPEN_MIDIS.map((openMidi) => {
        const list = [];
        for (let f = 0; f <= UKULELE_MAX_FRET; f++) {
            const pc = (openMidi + f) % 12;
            if (targetPcs.has(pc)) {
                list.push({ fret: f, pc });
            }
        }
        return list.length > 0 ? list : [{ fret: 0, pc: openMidi % 12 }];
    });

    let bestScore = Infinity;
    let bestFrets = [0, 0, 0, 0];

    for (let i0 = 0; i0 < allowed[0].length; i0++) {
        const a0 = allowed[0][i0];
        for (let i1 = 0; i1 < allowed[1].length; i1++) {
            const a1 = allowed[1][i1];
            for (let i2 = 0; i2 < allowed[2].length; i2++) {
                const a2 = allowed[2][i2];
                for (let i3 = 0; i3 < allowed[3].length; i3++) {
                    const a3 = allowed[3][i3];
                    const frets = [a0.fret, a1.fret, a2.fret, a3.fret];
                    let minPos = 99;
                    let maxPos = 0;
                    let posCount = 0;
                    for (let k = 0; k < 4; k++) {
                        if (frets[k] > 0) {
                            posCount++;
                            if (frets[k] < minPos) minPos = frets[k];
                            if (frets[k] > maxPos) maxPos = frets[k];
                        }
                    }
                    const span = posCount > 0 ? (maxPos - minPos) : 0;
                    if (span > 3) continue; // Keep ergonomic 4-fret reach!

                    const present = new Set([a0.pc, a1.pc, a2.pc, a3.pc]);
                    let missingRequired = 0;
                    for (const rpc of requiredPcs) {
                        if (!present.has(rpc)) missingRequired++;
                    }
                    let missingTarget = 0;
                    for (const tpc of targetPcs) {
                        if (!present.has(tpc)) missingTarget++;
                    }

                    // Favor complete chord coverage, low frets, open strings, compact span, and slash bass on C string
                    let score = missingRequired * 40 + missingTarget * 12;
                    score += (posCount > 0 ? minPos * 2.2 + maxPos * 0.9 : 0);
                    score += span * 2.5 + posCount * 0.6;
                    if (parsed.bassPc !== rootPc && a1.pc === parsed.bassPc) {
                        score -= 3.5;
                    }
                    // Mild bonus for unique pitches (avoid excessive unisons when a richer voicing exists)
                    const uniquePitches = new Set([
                        GCEA_OPEN_MIDIS[0] + frets[0],
                        GCEA_OPEN_MIDIS[1] + frets[1],
                        GCEA_OPEN_MIDIS[2] + frets[2],
                        GCEA_OPEN_MIDIS[3] + frets[3]
                    ]).size;
                    score -= uniquePitches * 0.8;

                    if (score < bestScore) {
                        bestScore = score;
                        bestFrets = frets;
                    }
                }
            }
        }
    }

    const { fingers, barre } = assignChordFingers(bestFrets);
    const maxF = Math.max(...bestFrets);
    const difficulty = maxF <= 2 && !barre ? 1 : (maxF <= 4 ? 2 : (maxF <= 7 ? 3 : 4));
    return _buildChordRecord(
        parsed.symbol || symbol,
        parsed.symbol || symbol,
        { frets: bestFrets, fingers, barre, difficulty },
        parsed
    );
}

// Build normalized chord dictionary with enharmonic aliases (Db->C#, Gb->F#, G#->Ab, D#->Eb, A#->Bb)
export const UKULELE_CHORD_SHAPES = {};

const ENHARMONIC_SYNONYMS = {
    "C#": ["Db"],
    "Eb": ["D#"],
    "F#": ["Gb"],
    "Ab": ["G#"],
    "Bb": ["A#"]
};

for (const [sym, raw] of Object.entries(RAW_CHORD_SHAPES)) {
    const parsed = parseChordSymbol(sym, 0);
    const rec = _buildChordRecord(sym, sym, raw, parsed);
    UKULELE_CHORD_SHAPES[sym] = rec;

    // Register enharmonic synonyms so `Db`, `Gb`, `G#m`, `D#m`, `A#7`, etc. hit O(1) dictionary lookup
    const m = sym.match(/^([A-G][#b]?)(.*)$/);
    if (m && ENHARMONIC_SYNONYMS[m[1]]) {
        for (const altRoot of ENHARMONIC_SYNONYMS[m[1]]) {
            const altSym = `${altRoot}${m[2]}`;
            if (!UKULELE_CHORD_SHAPES[altSym]) {
                UKULELE_CHORD_SHAPES[altSym] = _buildChordRecord(altSym, sym, raw, parseChordSymbol(altSym, 0));
            }
        }
    }
}

const FALLBACK_CACHE = new Map();

/**
 * Splits a measure chord string (e.g. `"G → C"`, `"G -> D"`, `"Dm7 | G7"`) into timed segments
 * `[{ startFraction, endFraction, symbol, shape }]`.
 */
export function parseUkuleleChordBar(entry) {
    if (!entry || typeof entry !== "string" || !entry.trim()) {
        return [];
    }
    const parts = entry
        .split(/\s*(?:→|->|\||(?:\s+-\s+))\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0) return [];
    const step = 1.0 / parts.length;
    return parts.map((sym, idx) => ({
        startFraction: idx * step,
        endFraction: (idx + 1) * step,
        symbol: sym,
        shape: lookupUkuleleChord(sym)
    }));
}

/**
 * Looks up any chord symbol in `UKULELE_CHORD_SHAPES` (handling split-bar entries, enharmonics,
 * slash chords, and quality aliases), falling back to `voiceUkuleleChord()` for exotic chords.
 */
export function lookupUkuleleChord(symbol) {
    if (!symbol || typeof symbol !== "string" || !symbol.trim()) {
        return UKULELE_CHORD_SHAPES["C"];
    }
    let cleaned = symbol.trim().replace(/♯/g, "#").replace(/♭/g, "b");
    if (/(?:→|->|\|)/.test(cleaned)) {
        const first = cleaned.split(/\s*(?:→|->|\|)\s*/)[0].trim();
        if (first) cleaned = first;
    }

    if (UKULELE_CHORD_SHAPES[cleaned]) {
        return UKULELE_CHORD_SHAPES[cleaned];
    }

    // Normalize root & quality via parseChordSymbol
    const parsed = parseChordSymbol(cleaned, 0);
    const rootName = PC_TO_CANONICAL_ROOT[parsed.rootPc];
    const qualitySuffixMap = {
        "maj": "",
        "min": "m",
        "7": "7",
        "maj7": "maj7",
        "m7": "m7",
        "sus4": "sus4",
        "sus2": "sus2",
        "dim": "dim",
        "dim7": "dim7",
        "aug": "aug",
        "add9": "add9",
        "6": "6",
        "m6": "m6",
        "m7b5": "m7b5",
        "9": "9"
    };

    const suffix = qualitySuffixMap[parsed.quality];
    if (suffix !== undefined) {
        // First check slash chord with canonical root
        if (parsed.bassPc !== parsed.rootPc) {
            const slashKey = `${rootName}${suffix}/${PC_TO_CANONICAL_ROOT[parsed.bassPc]}`;
            if (UKULELE_CHORD_SHAPES[slashKey]) {
                return { ...UKULELE_CHORD_SHAPES[slashKey], symbol: cleaned };
            }
        }
        const baseKey = `${rootName}${suffix}`;
        if (UKULELE_CHORD_SHAPES[baseKey]) {
            return { ...UKULELE_CHORD_SHAPES[baseKey], symbol: cleaned };
        }
    }

    if (FALLBACK_CACHE.has(cleaned)) {
        return FALLBACK_CACHE.get(cleaned);
    }
    const voiced = voiceUkuleleChord(cleaned);
    FALLBACK_CACHE.set(cleaned, voiced);
    return voiced;
}

/**
 * Converts a chord symbol into playable 4-string Ukulele tab note objects at `(time, duration)`.
 *
 * Returns notes ordered in physical strum sequence:
 *   - `"down"` strum: G -> C -> E -> A (string indices `3, 2, 1, 0`)
 *   - `"up"`   strum: A -> E -> C -> G (string indices `0, 1, 2, 3`)
 *
 * High-G re-entrant chords (e.g. Am `[2,0,0,0]`, F `[2,0,1,0]`, G `[0,2,3,2]`) naturally contain
 * two strings sounding the same unison MIDI pitch; the second occurrence is marked `isUnisonDouble: true`
 * while sharing `chordGroupId` so `NoteEvaluator` can credit unison strings cleanly on a single strum.
 */
export function chordToTabNotes(symbol, time, duration, options = {}) {
    const shape = typeof symbol === "string" ? lookupUkuleleChord(symbol) : symbol;
    if (!shape) return [];

    const strumDir = options.strumDir === "up" ? "up" : "down";
    const lane = options.lane || "chords";
    const hand = options.hand || (lane === "melody" ? "right" : "left");
    const clef = hand === "left" ? "bass" : "treble";
    const safeTime = Math.max(0, Number(time) || 0);
    const safeDur = Math.max(0.15, Number(duration) || 0.45);
    const chordSymbol = options.chordSymbol || shape.symbol || "C";
    const chordGroupId = options.chordGroupId || `strum_${Math.round(safeTime * 1000)}_${chordSymbol}`;

    // Down strum sweeps G(3)->C(2)->E(1)->A(0); Up strum sweeps A(0)->E(1)->C(2)->G(3)
    const stringOrder = strumDir === "down" ? [3, 2, 1, 0] : [0, 1, 2, 3];
    const allowedStrings = Array.isArray(options.strings) ? new Set(options.strings) : null;
    const seenPitches = new Set();
    const notes = [];

    for (const sIdx of stringOrder) {
        if (allowedStrings && !allowedStrings.has(sIdx)) continue;
        const fret = shape.fretsTab[sIdx];
        if (fret === null || fret === undefined || fret < 0 || fret > UKULELE_MAX_FRET) continue;

        const strMeta = UKULELE_STRINGS[sIdx];
        const pitch = strMeta.openMidi + fret;
        const finger = fret === 0 ? 0 : Math.max(1, Math.min(4, shape.fingersTab[sIdx] || 1));
        const fStyle = getUkuleleFingerStyle(finger);
        const isUnisonDouble = seenPitches.has(pitch);
        seenPitches.add(pitch);

        notes.push({
            pitch,
            time: Math.round(safeTime * 10000) / 10000,
            duration: Math.round(safeDur * 10000) / 10000,
            string: sIdx,
            stringName: strMeta.name,
            fret,
            finger,
            fingerLabel: fStyle.diagramLabel,
            fingerColor: fStyle.primary,
            lane,
            hand,
            clef,
            chordSymbol,
            strumDir,
            isChordNote: true,
            chordGroupId,
            isUnisonDouble
        });
    }

    return notes;
}
