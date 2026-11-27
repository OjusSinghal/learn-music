/**
 * Instrument-Scoped Dataset Storage & Synchronization Manager
 * ===========================================================
 * Manages acoustic sample metadata, local caching (localStorage), and server syncing:
 * - `"piano"`   -> key `"yousician_piano_dataset_manifest_v1"` (with legacy read fallback
 *                  `"yousician_dataset_manifest_v1"`), routes `/api/dataset/*`,
 *                  audio URL `/audio_dataset/samples/<file>`
 * - `"ukulele"` -> key `"yousician_ukulele_dataset_manifest_v1"`, routes `/api/dataset/ukulele/*`,
 *                  audio URL `/audio_dataset/ukulele/samples/<file>`
 *
 * Preserves full backward compatibility with legacy static `DatasetStorage.*` calls.
 * Headless-safe for macOS JavaScriptCore (`jsc -m`).
 */

const LEGACY_PIANO_STORAGE_KEY = "yousician_dataset_manifest_v1";

function _hasLocalStorage() {
    try {
        return typeof localStorage !== "undefined" && localStorage !== null;
    } catch (e) {
        return false;
    }
}

export class DatasetStorage {
    static STORAGE_KEY = "yousician_piano_dataset_manifest_v1";

    constructor(instrument = "piano") {
        this.instrument = "piano";
        this.storageKey = "yousician_piano_dataset_manifest_v1";
        this.apiBase = "/api/dataset";
        this.samplesUrlPrefix = "/audio_dataset/samples";
        this.zipFilename = "piano_acoustic_dataset.zip";
        this.setInstrument(instrument);
    }

    setInstrument(instrument = "piano") {
        const mode = instrument === "ukulele" ? "ukulele" : "piano";
        this.instrument = mode;
        if (mode === "ukulele") {
            this.storageKey = "yousician_ukulele_dataset_manifest_v1";
            this.apiBase = "/api/dataset/ukulele";
            this.samplesUrlPrefix = "/audio_dataset/ukulele/samples";
            this.zipFilename = "ukulele_acoustic_dataset.zip";
        } else {
            this.storageKey = "yousician_piano_dataset_manifest_v1";
            this.apiBase = "/api/dataset";
            this.samplesUrlPrefix = "/audio_dataset/samples";
            this.zipFilename = "piano_acoustic_dataset.zip";
        }
        return this.instrument;
    }

    getInstrument() {
        return this.instrument;
    }

    getSampleAudioUrl(filename) {
        if (!filename) return "";
        return `${this.samplesUrlPrefix}/${filename}`;
    }

    async fetchServerSummary() {
        if (typeof fetch !== "function") return null;
        try {
            const resp = await fetch(`${this.apiBase}/summary`);
            if (resp.ok) {
                const data = await resp.json();
                // Hydrate local cache from server manifest so recorded steps reflect disk state
                if (data && data.manifest && Array.isArray(data.manifest.samples)) {
                    const local = this.getLocalManifest();
                    let changed = false;
                    for (const s of data.manifest.samples) {
                        if (s && s.id && !local.samples[s.id]) {
                            local.samples[s.id] = s;
                            changed = true;
                        }
                    }
                    if (changed) {
                        local.updatedAt = data.manifest.updated_at || new Date().toISOString();
                        this.saveLocalManifest(local);
                    }
                }
                return data;
            }
        } catch (e) {
            console.warn(`Server ${this.instrument} dataset summary not reachable:`, e.message);
        }
        return null;
    }

    getLocalManifest() {
        if (!_hasLocalStorage()) {
            return { samples: {}, updatedAt: null };
        }
        try {
            let raw = localStorage.getItem(this.storageKey);
            if (!raw && this.instrument === "piano") {
                raw = localStorage.getItem(LEGACY_PIANO_STORAGE_KEY);
            }
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object" && parsed.samples) {
                    return parsed;
                }
            }
        } catch (e) {}
        return { samples: {}, updatedAt: null };
    }

    saveLocalManifest(manifest) {
        if (!_hasLocalStorage()) return;
        try {
            const payload = JSON.stringify(manifest);
            localStorage.setItem(this.storageKey, payload);
            if (this.instrument === "piano") {
                localStorage.setItem(LEGACY_PIANO_STORAGE_KEY, payload);
            }
        } catch (e) {}
    }

    async saveSample(metadata, audioBase64) {
        const local = this.getLocalManifest();
        const nowIso = new Date().toISOString();
        local.samples[metadata.id] = {
            ...metadata,
            instrument: this.instrument,
            savedAt: nowIso
        };
        local.updatedAt = nowIso;
        this.saveLocalManifest(local);

        let serverSuccess = false;
        if (typeof fetch === "function") {
            try {
                const payload = {
                    metadata: {
                        ...metadata,
                        instrument: this.instrument,
                        savedAt: nowIso
                    },
                    audioBase64
                };

                const resp = await fetch(`${this.apiBase}/sample`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (resp.ok) {
                    const result = await resp.json();
                    serverSuccess = true;
                    return { success: true, serverSynced: true, data: result };
                }
            } catch (e) {
                console.warn(`Failed to sync ${this.instrument} sample to server:`, e);
            }
        }

        return { success: true, serverSynced: serverSuccess, data: local.samples[metadata.id] };
    }

    isStepRecorded(stepId) {
        const local = this.getLocalManifest();
        return Boolean(local.samples && local.samples[stepId]);
    }

    getStepRecord(stepId) {
        const local = this.getLocalManifest();
        return (local.samples && local.samples[stepId]) || null;
    }

    async recalibrate() {
        if (typeof fetch !== "function") {
            throw new Error("Fetch API unavailable in headless runtime");
        }
        const resp = await fetch(`${this.apiBase}/recalibrate`, { method: "POST" });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            throw new Error(data.error || "Calibration endpoint returned an error");
        }
        return data;
    }

    async resetDataset() {
        if (_hasLocalStorage()) {
            try {
                localStorage.removeItem(this.storageKey);
                if (this.instrument === "piano") {
                    localStorage.removeItem(LEGACY_PIANO_STORAGE_KEY);
                }
            } catch (e) {}
        }

        if (typeof fetch === "function") {
            try {
                await fetch(`${this.apiBase}/reset`, { method: "POST" });
            } catch (e) {}
        }

        return true;
    }

    downloadDatasetZip() {
        if (typeof window !== "undefined" && typeof window.open === "function") {
            window.open(`${this.apiBase}/zip`, "_blank");
        }
    }

    exportManifestJson() {
        if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
            return;
        }
        const local = this.getLocalManifest();
        const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${this.instrument}_acoustic_manifest_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // -------------------------------------------------------------------------
    // Backward-compatible static delegates (default to Piano dataset)
    // -------------------------------------------------------------------------
    static _defaultInstance = null;

    static _getDefault() {
        if (!DatasetStorage._defaultInstance) {
            DatasetStorage._defaultInstance = new DatasetStorage("piano");
        }
        return DatasetStorage._defaultInstance;
    }

    static fetchServerSummary() {
        return DatasetStorage._getDefault().fetchServerSummary();
    }

    static getLocalManifest() {
        return DatasetStorage._getDefault().getLocalManifest();
    }

    static saveLocalManifest(manifest) {
        return DatasetStorage._getDefault().saveLocalManifest(manifest);
    }

    static saveSample(metadata, audioBase64) {
        return DatasetStorage._getDefault().saveSample(metadata, audioBase64);
    }

    static isStepRecorded(stepId) {
        return DatasetStorage._getDefault().isStepRecorded(stepId);
    }

    static getStepRecord(stepId) {
        return DatasetStorage._getDefault().getStepRecord(stepId);
    }

    static recalibrate() {
        return DatasetStorage._getDefault().recalibrate();
    }

    static resetDataset() {
        return DatasetStorage._getDefault().resetDataset();
    }

    static downloadDatasetZip() {
        return DatasetStorage._getDefault().downloadDatasetZip();
    }

    static exportManifestJson() {
        return DatasetStorage._getDefault().exportManifestJson();
    }
}
