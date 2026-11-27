/**
 * Dataset Storage & Synchronization Manager
 * Manages sample metadata, local caching (LocalStorage + IndexedDB), and server syncing (/api/dataset/*).
 */

export class DatasetStorage {
    static STORAGE_KEY = "yousician_dataset_manifest_v1";

    /**
     * Fetch dataset summary from local Python server
     */
    static async fetchServerSummary() {
        try {
            const resp = await fetch("/api/dataset/summary");
            if (resp.ok) {
                const data = await resp.json();
                return data;
            }
        } catch (e) {
            console.warn("Server dataset summary not reachable:", e.message);
        }
        return null;
    }

    /**
     * Get locally cached manifest
     */
    static getLocalManifest() {
        try {
            const raw = localStorage.getItem(DatasetStorage.STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return { samples: {}, updatedAt: null };
    }

    /**
     * Save local manifest cache
     */
    static saveLocalManifest(manifest) {
        try {
            localStorage.setItem(DatasetStorage.STORAGE_KEY, JSON.stringify(manifest));
        } catch (e) {}
    }

    /**
     * Save a recorded sample to both server and local cache
     * @param {Object} metadata - Sample metadata
     * @param {string} audioBase64 - Raw base64-encoded WAV data
     */
    static async saveSample(metadata, audioBase64) {
        // 1. Update local manifest
        const local = DatasetStorage.getLocalManifest();
        local.samples[metadata.id] = {
            ...metadata,
            savedAt: new Date().toISOString()
        };
        local.updatedAt = new Date().toISOString();
        DatasetStorage.saveLocalManifest(local);

        // 2. Transmit to server
        let serverSuccess = false;
        try {
            const payload = {
                metadata: {
                    ...metadata,
                    savedAt: local.updatedAt
                },
                audioBase64
            };

            const resp = await fetch("/api/dataset/sample", {
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
            console.warn("Failed to sync sample to server:", e);
        }

        return { success: true, serverSynced: serverSuccess, data: local.samples[metadata.id] };
    }

    /**
     * Check if a specific step has been recorded
     */
    static isStepRecorded(stepId) {
        const local = DatasetStorage.getLocalManifest();
        return !!local.samples[stepId];
    }

    /**
     * Get metadata for a specific recorded step
     */
    static getStepRecord(stepId) {
        const local = DatasetStorage.getLocalManifest();
        return local.samples[stepId] || null;
    }

    /**
     * Reset/Clear the entire dataset
     */
    static async resetDataset() {
        // 1. Clear local cache
        localStorage.removeItem(DatasetStorage.STORAGE_KEY);

        // 2. Request server reset
        try {
            await fetch("/api/dataset/reset", { method: "POST" });
        } catch (e) {}

        return true;
    }

    /**
     * Trigger browser download of complete dataset ZIP from server
     */
    static downloadDatasetZip() {
        window.open("/api/dataset/zip", "_blank");
    }

    /**
     * Export manifest as downloadable JSON file
     */
    static exportManifestJson() {
        const local = DatasetStorage.getLocalManifest();
        const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `piano_acoustic_manifest_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
