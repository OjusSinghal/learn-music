/**
 * MusicXML (.musicxml / .xml / .mxl) Parser
 * Parses standard notation files exported from MuseScore, Flat.io, Sibelius, and Finale.
 * Extracts parts, staves, measures, notes, chords, explicit <fingering> markings,
 * and computes full ergonomic finger color coding via PianoFingeringEngine.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";

export class MusicXmlParser {
    static parse(xmlString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");

            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                throw new Error("XML syntax error: " + parserError.textContent);
            }

            // Extract Song Title & Composer
            let title = "Imported MusicXML Song";
            const workTitle = xmlDoc.querySelector("work-title, movement-title");
            if (workTitle && workTitle.textContent.trim()) {
                title = workTitle.textContent.trim();
            }
            let artist = "";
            const creatorEl = xmlDoc.querySelector('identification > creator[type="composer"], identification > creator');
            if (creatorEl && creatorEl.textContent.trim()) {
                artist = creatorEl.textContent.trim();
            }

            // Step to Semitone mapping
            const stepMap = { "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11 };
            const kindSuffixMap = {
                "major": "",
                "minor": "m",
                "dominant": "7",
                "major-seventh": "maj7",
                "minor-seventh": "m7",
                "diminished": "dim",
                "diminished-seventh": "dim7",
                "half-diminished": "m7b5",
                "augmented": "aug",
                "suspended-fourth": "sus4",
                "suspended-second": "sus2",
                "none": ""
            };

            // Default score parameters
            let tempo = 100;
            let divisions = 4;
            let beatsPerMeasure = 4;
            let beatType = 4;
            let keySignature = "C";

            // Check sound tempo
            const soundEl = xmlDoc.querySelector("sound[tempo]");
            if (soundEl && soundEl.getAttribute("tempo")) {
                tempo = parseFloat(soundEl.getAttribute("tempo")) || 100;
            }

            const measures = xmlDoc.querySelectorAll("part > measure");
            const allNotes = [];
            const measureChords = [];
            let hasExplicitHarmony = false;
            let currentGlobalTime = 0.0; // Exact barline origin (GameEngine.computeLeadIn adds negative count-in)

            measures.forEach((measureEl, measureIdx) => {
                // Update attributes if defined in this measure
                const divisionsEl = measureEl.querySelector("attributes > divisions");
                if (divisionsEl) {
                    divisions = parseInt(divisionsEl.textContent, 10) || divisions;
                }

                const beatsEl = measureEl.querySelector("attributes > time > beats");
                if (beatsEl) {
                    beatsPerMeasure = parseInt(beatsEl.textContent, 10) || beatsPerMeasure;
                }

                const beatTypeEl = measureEl.querySelector("attributes > time > beat-type");
                if (beatTypeEl) {
                    beatType = parseInt(beatTypeEl.textContent, 10) || beatType;
                }

                const fifthsEl = measureEl.querySelector("attributes > key > fifths");
                if (fifthsEl) {
                    const modeText = measureEl.querySelector("attributes > key > mode")?.textContent.trim().toLowerCase() || "major";
                    const fifthsMajorMap = {
                        "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
                        "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#"
                    };
                    const fifthsMinorMap = {
                        "-7": "Abm", "-6": "Ebm", "-5": "Bbm", "-4": "Fm", "-3": "Cm", "-2": "Gm", "-1": "Dm",
                        "0": "Am", "1": "Em", "2": "Bm", "3": "F#m", "4": "C#m", "5": "G#m", "6": "D#m", "7": "A#m"
                    };
                    const fKey = fifthsEl.textContent.trim();
                    const mapToUse = modeText === "minor" ? fifthsMinorMap : fifthsMajorMap;
                    if (mapToUse[fKey]) keySignature = mapToUse[fKey];
                }

                const soundInMeasure = measureEl.querySelector("sound[tempo]");
                if (soundInMeasure) {
                    tempo = parseFloat(soundInMeasure.getAttribute("tempo")) || tempo;
                }

                // Extract first <harmony> chord symbol in this measure if present
                let measureChord = "";
                const harmonyEl = measureEl.querySelector("harmony");
                if (harmonyEl) {
                    const rootStep = harmonyEl.querySelector("root > root-step")?.textContent.trim() || "";
                    const rootAlter = parseInt(harmonyEl.querySelector("root > root-alter")?.textContent || "0", 10);
                    const alterStr = rootAlter === 1 ? "#" : (rootAlter === -1 ? "b" : "");
                    const kindText = harmonyEl.querySelector("kind")?.textContent.trim().toLowerCase() || "major";
                    const kindAttrText = harmonyEl.querySelector("kind")?.getAttribute("text");
                    if (kindText === "none") {
                        measureChord = "";
                    } else if (rootStep) {
                        const suffix = kindAttrText !== null && kindAttrText !== undefined
                            ? kindAttrText
                            : (kindSuffixMap[kindText] !== undefined ? kindSuffixMap[kindText] : "");
                        const bassStep = harmonyEl.querySelector("bass > bass-step")?.textContent.trim() || "";
                        const bassAlter = parseInt(harmonyEl.querySelector("bass > bass-alter")?.textContent || "0", 10);
                        const bassAlterStr = bassAlter === 1 ? "#" : (bassAlter === -1 ? "b" : "");
                        measureChord = `${rootStep}${alterStr}${suffix}${bassStep ? `/${bassStep}${bassAlterStr}` : ""}`;
                        hasExplicitHarmony = true;
                    }
                }
                measureChords.push(measureChord);

                const secondsPerDivision = (60 / tempo) / divisions;
                const measureStartNoteIdx = allNotes.length;

                let measureLocalTime = 0;
                let lastNoteTime = 0;

                const children = Array.from(measureEl.children);
                children.forEach(el => {
                    const tagName = el.tagName.toLowerCase();

                    // Backup (rewind local measure time, typically for multi-staff / left hand)
                    if (tagName === "backup") {
                        const durEl = el.querySelector("duration");
                        if (durEl) {
                            const dur = parseInt(durEl.textContent, 10) || 0;
                            measureLocalTime = Math.max(0, measureLocalTime - (dur * secondsPerDivision));
                        }
                    }
                    // Forward
                    else if (tagName === "forward") {
                        const durEl = el.querySelector("duration");
                        if (durEl) {
                            const dur = parseInt(durEl.textContent, 10) || 0;
                            measureLocalTime += (dur * secondsPerDivision);
                        }
                    }
                    // Note
                    else if (tagName === "note") {
                        const isRest = el.querySelector("rest") !== null;
                        const isChord = el.querySelector("chord") !== null;
                        const durationEl = el.querySelector("duration");
                        const durUnits = durationEl ? parseInt(durationEl.textContent, 10) || divisions : divisions;
                        const rawDurationSec = durUnits * secondsPerDivision;
                        const articulatedDurSec = Math.max(0.15, rawDurationSec - 0.025);

                        const staffEl = el.querySelector("staff");
                        const staffNum = staffEl ? parseInt(staffEl.textContent, 10) : 1;

                        const noteStartTime = isChord ? lastNoteTime : measureLocalTime;

                        if (!isRest) {
                            const pitchEl = el.querySelector("pitch");
                            if (pitchEl) {
                                const step = pitchEl.querySelector("step")?.textContent.trim().toUpperCase() || "C";
                                const alter = parseInt(pitchEl.querySelector("alter")?.textContent || "0", 10);
                                const octave = parseInt(pitchEl.querySelector("octave")?.textContent || "4", 10);

                                let midi = ((octave + 1) * 12) + (stepMap[step] || 0) + alter;
                                midi = PianoFingeringEngine.clamp61(midi);
                                const clef = staffNum === 2 ? "bass" : (midi >= 60 ? "treble" : "bass");
                                const hand = clef === "bass" ? "left" : "right";

                                const fingeringEl = el.querySelector("notations > technical > fingering");
                                const explicitFinger = fingeringEl
                                    ? PianoFingeringEngine.parseExplicitFinger(fingeringEl.textContent)
                                    : null;

                                const noteObj = {
                                    pitch: midi,
                                    time: Math.round((currentGlobalTime + noteStartTime) * 10000) / 10000,
                                    duration: Math.round(articulatedDurSec * 10000) / 10000,
                                    clef,
                                    hand
                                };
                                if (explicitFinger) {
                                    noteObj.lockedFinger = explicitFinger;
                                }
                                allNotes.push(noteObj);
                            }
                        }

                        if (!isChord) {
                            lastNoteTime = measureLocalTime;
                            measureLocalTime += rawDurationSec;
                        }
                    }
                });

                // Advance global time by exact measure duration; right-align implicit short pickup Measure 0
                const measureDuration = beatsPerMeasure * (4 / beatType) * (60 / tempo);
                if (measureIdx === 0 && measureLocalTime > 1e-6 && measureLocalTime < measureDuration - 1e-4) {
                    const pickupShift = measureDuration - measureLocalTime;
                    for (let i = measureStartNoteIdx; i < allNotes.length; i++) {
                        allNotes[i].time = Math.round((allNotes[i].time + pickupShift) * 10000) / 10000;
                    }
                    currentGlobalTime += measureDuration;
                } else {
                    currentGlobalTime += Math.max(measureLocalTime, measureDuration);
                }
            });

            // Sort chronologically
            allNotes.sort((a, b) => (a.time - b.time) || (a.pitch - b.pitch));

            const effectiveBpm = Math.round((tempo * (beatType / 4)) * 10000) / 10000;
            const song = {
                title,
                ...(artist ? { artist } : {}),
                bpm: effectiveBpm,
                beatsPerMeasure,
                timeSignature: [beatsPerMeasure, beatType],
                keySignature,
                ...(hasExplicitHarmony ? { chords: measureChords } : {}),
                notes: allNotes
            };
            PianoFingeringEngine.assignSongFingering(song, { preserveLocked: true });
            song.notes.forEach((n) => {
                delete n.lockedFinger;
            });
            return song;
        } catch (err) {
            console.error("MusicXML parse error:", err);
            throw new Error(`Failed to parse MusicXML: ${err.message}`);
        }
    }
}
