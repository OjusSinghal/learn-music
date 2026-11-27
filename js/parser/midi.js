/**
 * Client-Side Binary MIDI (.mid / .midi) Parser
 * Reads Standard MIDI Files (SMF 0 and 1) directly in the browser via ArrayBuffer.
 * Converts MIDI tracks into Yousician-compatible note events with Bimanual Hand Splitting
 * and Ergonomic Finger Color Coding.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";

export class MidiFileParser {
    static parse(arrayBuffer) {
        try {
            const data = new DataView(arrayBuffer);
            let offset = 0;

            // 1. Read Header Chunk "MThd"
            const headerId = String.fromCharCode(
                data.getUint8(offset++),
                data.getUint8(offset++),
                data.getUint8(offset++),
                data.getUint8(offset++)
            );

            if (headerId !== "MThd") {
                throw new Error("Invalid MIDI file: Missing 'MThd' header.");
            }

            const headerLength = data.getUint32(offset);
            offset += 4;
            const format = data.getUint16(offset);
            offset += 2;
            const numTracks = data.getUint16(offset);
            offset += 2;
            const timeDivision = data.getUint16(offset);
            offset += 2;

            // Skip any header padding
            if (headerLength > 6) {
                offset += (headerLength - 6);
            }

            const ticksPerBeat = (timeDivision & 0x8000) === 0 ? timeDivision : 480;
            const allNotes = [];
            let microsecondsPerBeat = 500000; // Default 120 BPM
            let beatsPerMeasure = 4;
            let beatType = 4;
            let keySignature = "C";
            let songTitle = "Imported MIDI Song";

            // 2. Parse Tracks
            for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
                if (offset >= data.byteLength) break;

                const trackId = String.fromCharCode(
                    data.getUint8(offset++),
                    data.getUint8(offset++),
                    data.getUint8(offset++),
                    data.getUint8(offset++)
                );

                if (trackId !== "MTrk") {
                    console.warn(`Unexpected chunk '${trackId}' at offset ${offset - 4}`);
                    break;
                }

                const trackLength = data.getUint32(offset);
                offset += 4;
                const trackEndOffset = offset + trackLength;

                let currentTick = 0;
                let runningStatus = 0;
                const activeNotes = new Map(); // noteNumber -> { startTick, velocity }

                while (offset < trackEndOffset && offset < data.byteLength) {
                    // Read Variable-Length Quantity (Delta Time)
                    let delta = 0;
                    while (true) {
                        const byte = data.getUint8(offset++);
                        delta = (delta << 7) | (byte & 0x7F);
                        if ((byte & 0x80) === 0) break;
                    }

                    currentTick += delta;

                    let statusByte = data.getUint8(offset);
                    if (statusByte >= 0x80) {
                        offset++;
                        runningStatus = statusByte;
                    } else {
                        statusByte = runningStatus;
                    }

                    const messageType = statusByte >> 4;
                    const channel = statusByte & 0x0F;

                    // Meta Event
                    if (statusByte === 0xFF) {
                        const metaType = data.getUint8(offset++);
                        let metaLength = 0;
                        while (true) {
                            const b = data.getUint8(offset++);
                            metaLength = (metaLength << 7) | (b & 0x7F);
                            if ((b & 0x80) === 0) break;
                        }

                        // Meta: Set Tempo (0x51)
                        if (metaType === 0x51 && metaLength === 3) {
                            microsecondsPerBeat = (data.getUint8(offset) << 16) |
                                                 (data.getUint8(offset + 1) << 8) |
                                                  data.getUint8(offset + 2);
                        }
                        // Meta: Time Signature (0x58)
                        else if (metaType === 0x58 && metaLength >= 2) {
                            const num = data.getUint8(offset);
                            const denomPow = data.getUint8(offset + 1);
                            if (num > 0) {
                                beatsPerMeasure = num;
                                beatType = 1 << denomPow;
                            }
                        }
                        // Meta: Key Signature (0x59)
                        else if (metaType === 0x59 && metaLength >= 2) {
                            const rawSf = data.getUint8(offset);
                            const sf = rawSf > 127 ? rawSf - 256 : rawSf;
                            const mi = data.getUint8(offset + 1);
                            const majorMap = {
                                "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
                                "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#"
                            };
                            const minorMap = {
                                "-7": "Abm", "-6": "Ebm", "-5": "Bbm", "-4": "Fm", "-3": "Cm", "-2": "Gm", "-1": "Dm",
                                "0": "Am", "1": "Em", "2": "Bm", "3": "F#m", "4": "C#m", "5": "G#m", "6": "D#m", "7": "A#m"
                            };
                            const mapToUse = mi === 1 ? minorMap : majorMap;
                            if (mapToUse[String(sf)]) {
                                keySignature = mapToUse[String(sf)];
                            }
                        }
                        // Meta: Track/Song Name (0x03)
                        else if (metaType === 0x03) {
                            let str = "";
                            for (let i = 0; i < metaLength; i++) {
                                str += String.fromCharCode(data.getUint8(offset + i));
                            }
                            if (str.trim().length > 0 && songTitle === "Imported MIDI Song") {
                                songTitle = str.trim();
                            }
                        }
                        offset += metaLength;
                    }
                    // Note Off (0x8) or Note On with 0 velocity
                    else if (messageType === 0x8 || (messageType === 0x9 && data.getUint8(offset + 1) === 0)) {
                        const noteNum = data.getUint8(offset++);
                        offset++; // skip velocity
                        if (activeNotes.has(noteNum)) {
                            const noteInfo = activeNotes.get(noteNum);
                            activeNotes.delete(noteNum);
                            const durTicks = currentTick - noteInfo.startTick;
                            allNotes.push({
                                pitch: noteNum,
                                startTick: noteInfo.startTick,
                                durationTicks: Math.max(durTicks, ticksPerBeat / 8),
                                track: trackIdx,
                                channel
                            });
                        }
                    }
                    // Note On (0x9) with velocity > 0
                    else if (messageType === 0x9) {
                        const noteNum = data.getUint8(offset++);
                        const velocity = data.getUint8(offset++);
                        if (velocity > 0) {
                            activeNotes.set(noteNum, { startTick: currentTick, velocity });
                        }
                    }
                    // 2-byte messages (Poly Pressure, Control Change, Pitch Bend)
                    else if (messageType === 0xA || messageType === 0xB || messageType === 0xE) {
                        offset += 2;
                    }
                    // 1-byte messages (Program Change, Channel Pressure)
                    else if (messageType === 0xC || messageType === 0xD) {
                        offset += 1;
                    }
                    // SysEx
                    else if (statusByte === 0xF0 || statusByte === 0xF7) {
                        let sysExLength = 0;
                        while (true) {
                            const b = data.getUint8(offset++);
                            sysExLength = (sysExLength << 7) | (b & 0x7F);
                            if ((b & 0x80) === 0) break;
                        }
                        offset += sysExLength;
                    }
                }
            }

            // Convert ticks to seconds aligned to barlines (preserving intra-measure anacrusis/pickup)
            const quarterBpm = 60000000 / microsecondsPerBeat;
            const effectiveBpm = Math.round((quarterBpm * (beatType / 4)) * 10000) / 10000;
            const secondsPerTick = (microsecondsPerBeat / 1000000) / ticksPerBeat;

            // Sort chronologically
            allNotes.sort((a, b) => (a.startTick - b.startTick) || (a.pitch - b.pitch));

            // Strip only whole leading empty measures so intra-measure pickups remain barline-aligned
            const ticksPerMeasure = Math.max(1, Math.round(ticksPerBeat * beatsPerMeasure * (4 / beatType)));
            const firstTick = allNotes.length > 0 ? allNotes[0].startTick : 0;
            const baseTick = Math.floor(firstTick / ticksPerMeasure) * ticksPerMeasure;
            const sixteenthTicks = Math.max(1, ticksPerBeat / 4);

            const parsedNotes = allNotes.map((n) => {
                const time = (n.startTick - baseTick) * secondsPerTick;
                const rawDur = n.durationTicks * secondsPerTick;
                const isGridQuantized = Math.abs(n.durationTicks - Math.round(n.durationTicks / sixteenthTicks) * sixteenthTicks) <= 2;
                const articulatedDur = isGridQuantized ? Math.max(0.15, rawDur - 0.025) : Math.max(0.15, rawDur);
                const pitch = PianoFingeringEngine.clamp61(n.pitch);

                return {
                    pitch,
                    time: Math.round(time * 10000) / 10000,
                    duration: Math.round(articulatedDur * 10000) / 10000,
                    track: n.track
                };
            });

            // Smart bimanual hand partitioning + global ergonomic finger color assignment
            PianoFingeringEngine.partitionMidiHands(parsedNotes);
            parsedNotes.forEach((n) => {
                delete n.track;
            });

            const song = {
                title: songTitle,
                bpm: Math.min(220, Math.max(25, effectiveBpm)),
                beatsPerMeasure,
                timeSignature: [beatsPerMeasure, beatType],
                keySignature,
                notes: parsedNotes
            };
            return PianoFingeringEngine.assignSongFingering(song);
        } catch (err) {
            console.error("MIDI parse error:", err);
            throw new Error(`Failed to parse MIDI file: ${err.message}`);
        }
    }
}
