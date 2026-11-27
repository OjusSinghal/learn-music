/**
 * Sheet Music Image & Vision Transcription Engine
 * Converts sheet music images/PDFs into playable Yousician tracks via Gemini Vision API or quick score notation,
 * with automatic ergonomic finger & color assignment via PianoFingeringEngine.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";

export class SheetMusicScanner {
    /**
     * Convert an image File into Base64 and DataURL
     */
    static readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Transcribe Sheet Music Image via Gemini Multimodal Vision API
     */
    static async transcribeWithGemini(apiKey, base64DataUrl, options = {}) {
        if (!apiKey || !apiKey.trim()) {
            throw new Error("Gemini API Key is required for AI sheet transcription.");
        }

        const match = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (!match) {
            throw new Error("Invalid image format. Please upload PNG, JPG, or WebP.");
        }

        const mimeType = match[1];
        const base64Data = match[2];

        const prompt = `You are an expert Optical Music Recognition (OMR) system. 
Analyze this piano sheet music image carefully.
Transcribe all right-hand (treble clef) and left-hand (bass clef) notes, chords, time signature, and tempo into a structured JSON song format.

Rules:
1. "pitch" must be the standard MIDI note number (e.g., Middle C = 60, D4 = 62, E4 = 64, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74). For bass clef: C3 = 48, G2 = 43, B2 = 47.
2. "time" is the start time of the note in seconds aligned to measure barlines starting at 0.0s (or at its pickup beat in Measure 0 if there is an anacrusis).
3. "duration" is the length of the note in seconds with a ~0.025s articulation gap (e.g. quarter note at 100 BPM is 0.575s).
4. "clef" must be either "treble" or "bass".
5. If printed piano finger numbers (1=Thumb, 2=Index, 3=Middle, 4=Ring, 5=Pinky) appear on a note in the score, include optional integer "finger" (1..5) on that note.
6. Detect chord symbols above the staff if present.

Return ONLY a valid JSON object matching this exact schema, with no markdown code fences:
{
  "title": "Detected Title or Piece Name",
  "bpm": 100,
  "beatsPerMeasure": 4,
  "timeSignature": [4, 4],
  "keySignature": "C",
  "chords": ["G", "A", "Bm", "G"],
  "notes": [
    { "pitch": 71, "time": 0.0, "duration": 0.575, "clef": "treble" }
  ]
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error (${response.status}): ${errJson.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
            throw new Error("No transcription generated from Gemini Vision.");
        }

        const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
        const parsedSong = JSON.parse(cleanJson);

        if (!parsedSong.notes || !Array.isArray(parsedSong.notes)) {
            throw new Error("AI output missing 'notes' array.");
        }

        // Fold any out-of-range notes into 61-key range: C2 (36) to C7 (96) and assign ergonomic finger colors
        parsedSong.notes.forEach((n) => {
            n.pitch = PianoFingeringEngine.clamp61(n.pitch);
            const explicit = PianoFingeringEngine.parseExplicitFinger(n.finger);
            if (explicit) {
                n.lockedFinger = explicit;
            }
        });
        PianoFingeringEngine.assignSongFingering(parsedSong, { preserveLocked: true });
        parsedSong.notes.forEach((n) => {
            delete n.lockedFinger;
        });

        return parsedSong;
    }

    /**
     * Parse simple text notation (Quick Score notation)
     * Example input:
     * Treble: B4 1, D5 1 | B4 0.5, B4 0.5, D5 1
     * Bass: B2 0.5, G2 0.5, B2 0.5, D3 1 | A2 1.5, B2 0.5
     */
    static parseQuickNotation(text, bpm = 100) {
        const noteMap = { "C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11 };
        const secondsPerBeat = 60 / bpm;
        const notes = [];

        const lines = text.split("\n");
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return;

            let clef = "treble";
            let content = trimmed;

            if (trimmed.toLowerCase().startsWith("treble:")) {
                clef = "treble";
                content = trimmed.substring(7);
            } else if (trimmed.toLowerCase().startsWith("bass:")) {
                clef = "bass";
                content = trimmed.substring(5);
            }

            // Remove measure bars
            const tokens = content.replace(/\|/g, " ").trim().split(/[\s,]+/);
            let currentTime = 0.0; // Exact barline origin (GameEngine.computeLeadIn adds negative count-in)

            tokens.forEach(tok => {
                if (!tok) return;
                // e.g. "B4:1" or "B4:1@3" or "D5:0.5" or "R:2" (rest) or "G2"
                const [notePart, explicitFingerRaw] = tok.split("@");
                const parts = notePart.split(":");
                const pitchStr = parts[0].toUpperCase();
                const beats = parts[1] ? parseFloat(parts[1]) : 1.0;
                const durSec = beats * secondsPerBeat;
                const articulatedDurSec = Math.max(0.15, durSec - 0.025);

                // Match note and octave (skipping R / REST tokens which only advance currentTime)
                const m = pitchStr.match(/^([A-G][#B]?)(\d)$/);
                if (m) {
                    const step = m[1];
                    const octave = parseInt(m[2], 10);
                    const semitone = noteMap[step];
                    if (semitone !== undefined) {
                        const midi = PianoFingeringEngine.clamp61((octave + 1) * 12 + semitone);
                        const explicitFinger = explicitFingerRaw
                            ? PianoFingeringEngine.parseExplicitFinger(explicitFingerRaw)
                            : null;
                        const noteObj = {
                            pitch: midi,
                            time: Math.round(currentTime * 10000) / 10000,
                            duration: Math.round(articulatedDurSec * 10000) / 10000,
                            clef,
                            hand: clef === "bass" ? "left" : "right"
                        };
                        if (explicitFinger) {
                            noteObj.lockedFinger = explicitFinger;
                        }
                        notes.push(noteObj);
                    }
                }
                currentTime += durSec;
            });
        });

        notes.sort((a, b) => a.time - b.time);

        const song = {
            title: "Quick Notation Song",
            bpm,
            beatsPerMeasure: 4,
            notes
        };
        PianoFingeringEngine.assignSongFingering(song, { preserveLocked: true });
        song.notes.forEach((n) => {
            delete n.lockedFinger;
        });
        return song;
    }
}
