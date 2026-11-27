/**
 * Song Storage & Persistence Manager
 * Manages custom songs across browser LocalStorage and the backend songs_data directory.
 * Guarantees every saved or loaded catalog song is finger-assigned and color-coded.
 */

import { PianoFingeringEngine } from "../engine/fingering.js";

export class SongStorage {
    static STORAGE_KEY = "yousician_custom_songs";

    static getLocalSongs() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list.map((s) => PianoFingeringEngine.ensureSongFingering(s)) : [];
        } catch (e) {
            console.warn("Error reading local songs:", e);
            return [];
        }
    }

    static async saveSong(song) {
        if (!song.id) {
            song.id = "custom_" + Date.now().toString(36);
        }

        // Guarantee ergonomic finger & color assignment whenever a song is added to the catalog
        PianoFingeringEngine.ensureSongFingering(song);

        // 1. Save to LocalStorage
        const localSongs = this.getLocalSongs().filter(s => s.id !== song.id);
        localSongs.unshift(song);
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(localSongs));
        } catch (e) {
            console.warn("LocalStorage quota or error:", e);
        }

        // 2. Persist to Backend server (/api/songs/save)
        try {
            const resp = await fetch("/api/songs/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(song)
            });
            if (resp.ok) {
                console.log("Song successfully persisted to backend server:", song.id);
            }
        } catch (err) {
            console.warn("Backend save skipped (running offline or standalone):", err);
        }

        return song;
    }

    static async fetchServerSongs() {
        try {
            const resp = await fetch("/api/songs");
            if (resp.ok) {
                const data = await resp.json();
                const list = data.custom_songs || [];
                return Array.isArray(list) ? list.map((s) => PianoFingeringEngine.ensureSongFingering(s)) : [];
            }
        } catch (e) {
            // Server offline or standard mode
        }
        return [];
    }
}
