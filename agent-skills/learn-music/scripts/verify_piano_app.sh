#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/ojus/official/piano-app"
SKILL_DIR="${HOME}/.gemini/config/skills/learn-music"
REPO_SKILL_DIR="$APP_DIR/agent-skills/learn-music"
JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== [1/5] Compiling Python files & Auditing Static Aesthetic / DOM / Docs Invariants ==="
python3 -m py_compile "$APP_DIR/server.py" "$APP_DIR/scripts/calibrate_and_benchmark.py" "$APP_DIR/scripts/calibrate_ukulele.py"

python3 - "$APP_DIR" << 'PYEOF'
import re
import sys
from pathlib import Path

app_dir = Path(sys.argv[1])

# 1. Verify Piano & Ukulele research/curriculum docs exist and are complete
research_doc = app_dir / "docs" / "CURRICULUM_RESEARCH.md"
if not research_doc.exists():
    raise RuntimeError("Missing /Users/ojus/official/piano-app/docs/CURRICULUM_RESEARCH.md")
research_text = research_doc.read_text(encoding="utf-8")
if len(research_text) < 4000 or "LEVEL 1" not in research_text.upper() or "LEVEL 9" not in research_text.upper():
    raise RuntimeError("docs/CURRICULUM_RESEARCH.md is incomplete or missing Level 1-9 syllabus")

uku_acoustic_doc = app_dir / "docs" / "UKULELE_ACOUSTIC_RESEARCH.md"
if not uku_acoustic_doc.exists() or len(uku_acoustic_doc.read_text(encoding="utf-8")) < 3000:
    raise RuntimeError("Missing or incomplete docs/UKULELE_ACOUSTIC_RESEARCH.md")

uku_curr_doc = app_dir / "docs" / "UKULELE_CURRICULUM.md"
if not uku_curr_doc.exists() or len(uku_curr_doc.read_text(encoding="utf-8")) < 1500:
    raise RuntimeError("Missing or incomplete docs/UKULELE_CURRICULUM.md")

# 2. Scan index.html, style.css, and js/**/*.js for harsh red hexes & blocking alert/window.confirm
forbidden_hex = re.compile(r"#(?:ef4444|f87171|b91c1c)\b", re.IGNORECASE)
forbidden_alert = re.compile(r"\bwindow\.alert\s*\(|\balert\s*\(|\bwindow\.confirm\s*\(")

scan_files = [
    app_dir / "index.html",
    app_dir / "style.css",
    *sorted((app_dir / "js").rglob("*.js")),
]

for fpath in scan_files:
    text = fpath.read_text(encoding="utf-8")
    m_hex = forbidden_hex.search(text)
    if m_hex:
        raise RuntimeError(f"Forbidden harsh red hex '{m_hex.group(0)}' found in {fpath.relative_to(app_dir)}")
    # Strip single-line and block comments before checking alert/confirm calls
    stripped = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    stripped = re.sub(r"//[^\n]*", "", stripped)
    m_alert = forbidden_alert.search(stripped)
    if m_alert:
        raise RuntimeError(f"Forbidden blocking dialog '{m_alert.group(0)}' found in {fpath.relative_to(app_dir)}")

# 3. Verify 100% DOM ID consistency & Global Header / Studio Sub-Bar / 2-Row Dock Layout Invariants
from html.parser import HTMLParser

html_text = (app_dir / "index.html").read_text(encoding="utf-8")
css_text = (app_dir / "style.css").read_text(encoding="utf-8")
app_js_text = (app_dir / "js" / "app.js").read_text(encoding="utf-8")
html_ids = set(re.findall(r'\bid="([^"]+)"', html_text))
app_ids = set(re.findall(r'getElementById\(\s*"([^"]+)"\s*\)', app_js_text))
missing_ids = sorted(app_ids - html_ids)
if missing_ids:
    raise RuntimeError(f"js/app.js references missing DOM IDs in index.html: {missing_ids}")
if len(app_ids) < 163:
    raise RuntimeError(f"Expected at least 163 getElementById bindings in js/app.js, found {len(app_ids)}")

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "param", "source", "track", "wbr",
}

class LayoutAuditParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.id_ancestors = {}
        self.class_ancestors = {}

    def _record(self, attr_map):
        el_id = attr_map.get("id")
        classes = set((attr_map.get("class") or "").split())
        anc_ids = {n[1] for n in self.stack if n[1]}
        anc_classes = set()
        for n in self.stack:
            anc_classes.update(n[2])
        if el_id:
            self.id_ancestors[el_id] = (anc_ids, anc_classes)
        for cls in classes:
            self.class_ancestors.setdefault(cls, []).append((anc_ids, anc_classes))
        return el_id, classes

    def handle_starttag(self, tag, attrs):
        el_id, classes = self._record(dict(attrs))
        if tag.lower() not in VOID_TAGS:
            self.stack.append((tag.lower(), el_id, classes))

    def handle_startendtag(self, tag, attrs):
        self._record(dict(attrs))

    def handle_endtag(self, tag):
        t = tag.lower()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == t:
                del self.stack[i:]
                break

layout_parser = LayoutAuditParser()
layout_parser.feed(html_text)

# (a) Global .app-header must contain ONLY brand/nav + instrument switcher + gamification pill (never Studio controls)
for global_id in ("btnBrandHome", "navBtnHome", "navBtnLearn", "navBtnSongs", "navBtnStudio", "instrumentSwitcher", "btnInstrumentPiano", "btnInstrumentUkulele", "headerGamificationPill"):
    if "app-header" not in layout_parser.id_ancestors.get(global_id, (set(), set()))[1]:
        raise RuntimeError(f"Expected #{global_id} inside global .app-header")

for kb_host_id in ("pianoKeyboard", "ukuleleFretboard"):
    if "keyboard-section" not in layout_parser.id_ancestors.get(kb_host_id, (set(), set()))[1]:
        raise RuntimeError(f"Expected #{kb_host_id} inside #viewStudio .keyboard-section")

if "studio-toolbar" not in layout_parser.class_ancestors or not all(
    "viewStudio" in anc_ids and "app-header" not in anc_cls
    for anc_ids, anc_cls in layout_parser.class_ancestors["studio-toolbar"]
):
    raise RuntimeError("Expected .studio-toolbar inside #viewStudio and separated from .app-header")

for studio_bar_id in (
    "studioHeaderControls",
    "studioCurriculumBar",
    "btnStudioFreeMode",
    "studioSongSelectWrap",
    "btnOpenImport",
    "btnOpenTrainer",
    "btnMicToggle",
    "tunerDisplay",
    "micSensSlider",
    "studioRightHints",
):
    anc_ids, anc_cls = layout_parser.id_ancestors.get(studio_bar_id, (set(), set()))
    if "app-header" in anc_cls:
        raise RuntimeError(f"Studio element #{studio_bar_id} must NOT sit inside global .app-header")
    if "viewStudio" not in anc_ids or "studio-toolbar" not in anc_cls:
        raise RuntimeError(f"Expected #{studio_bar_id} inside #viewStudio > .studio-toolbar")

# (b) 2-Row footer.control-dock (.dock-scrubber-row + .dock-main-row)
for dock_row_cls in ("dock-scrubber-row", "dock-main-row"):
    entries = layout_parser.class_ancestors.get(dock_row_cls, [])
    if not entries or not all("viewStudio" in a_ids and "control-dock" in a_cls for a_ids, a_cls in entries):
        raise RuntimeError(f"Expected .{dock_row_cls} inside #viewStudio footer.control-dock")

for scrub_id in ("timeCurrent", "timelineSlider", "timeTotal"):
    if "dock-scrubber-row" not in layout_parser.id_ancestors.get(scrub_id, (set(), set()))[1]:
        raise RuntimeError(f"Expected #{scrub_id} inside .dock-scrubber-row")

for main_dock_id in ("btnPlayPause", "btnModeFlow", "btnHandLeft", "tempoSlider", "btnPlayAlongToggle", "btnBackingToggle", "backingVolumeSlider", "volumeSlider"):
    if "dock-main-row" not in layout_parser.id_ancestors.get(main_dock_id, (set(), set()))[1]:
        raise RuntimeError(f"Expected #{main_dock_id} inside .dock-main-row")

# (c) Key CSS & JS layout invariants
for required_css in (".studio-toolbar", ".dock-scrubber-row", ".dock-main-row", "repeat(9, minmax(0, 1fr))"):
    if required_css not in css_text:
        raise RuntimeError(f"Missing required layout rule '{required_css}' in style.css")

for required_js in ("updateStudioCurriculumBar", "_handleStudioResize", "clearToasts"):
    if required_js not in app_js_text:
        raise RuntimeError(f"Missing required UI lifecycle method '{required_js}' in js/app.js")

# (d) Threaded HTTP server concurrency invariants in server.py
server_py_text = (app_dir / "server.py").read_text(encoding="utf-8")
for required_srv in ("ThreadingTCPServer", "request_queue_size = 128", "daemon_threads = True"):
    if required_srv not in server_py_text:
        raise RuntimeError(f"Missing multi-socket concurrency setting '{required_srv}' in server.py")

print(
    f"Python syntax, ThreadingTCPServer(q=128), CURRICULUM_RESEARCH.md, zero-harsh-red/zero-alert invariants ({len(scan_files)} files), "
    f"DOM IDs ({len(app_ids)}/{len(app_ids)} matched), and .app-header/.studio-toolbar/2-row dock layout OK."
)
PYEOF

echo "=== [2/5] Loading & validating all ES modules in JavaScriptCore ==="
python3 - "$APP_DIR" "$TMP_DIR/module_list.json" << 'PYEOF'
import json
import sys
from pathlib import Path

app_dir = Path(sys.argv[1])
out_json = Path(sys.argv[2])

js_files = sorted(str(p) for p in (app_dir / "js").rglob("*.js"))
required = [
    str(app_dir / "js" / "curriculum" / "levels_1_to_4.js"),
    str(app_dir / "js" / "curriculum" / "levels_5_to_9.js"),
    str(app_dir / "js" / "curriculum" / "index.js"),
    str(app_dir / "js" / "audio" / "backing_track.js"),
    str(app_dir / "js" / "gamification" / "progress.js"),
    str(app_dir / "js" / "ukulele" / "chords.js"),
    str(app_dir / "js" / "ukulele" / "arranger.js"),
    str(app_dir / "js" / "ukulele" / "curriculum.js"),
    str(app_dir / "js" / "ukulele" / "renderer.js"),
    str(app_dir / "js" / "ukulele" / "fretboard.js"),
    str(app_dir / "js" / "audio" / "ukulele_synth.js"),
    str(app_dir / "js" / "audio" / "ukulele_detector.js"),
    str(app_dir / "js" / "audio" / "ukulele_profile.js"),
    str(app_dir / "js" / "trainer" / "ukulele_curriculum.js"),
]
for req in required:
    if req not in js_files:
        raise RuntimeError(f"Missing required ES module: {req}")
if len(js_files) < 36:
    raise RuntimeError(f"Expected at least 36 ES modules under js/, found {len(js_files)}")

out_json.write_text("export const ALL_JS_MODULES = " + json.dumps(js_files) + ";\n", encoding="utf-8")
PYEOF
mv "$TMP_DIR/module_list.json" "$TMP_DIR/module_list.mjs"

cat << 'EOF' > "$TMP_DIR/check_modules.mjs"
globalThis.window = {
    addEventListener: () => {},
    devicePixelRatio: 2,
    innerWidth: 1280,
    innerHeight: 800
};
globalThis.navigator = {};
globalThis.document = {
    body: { dataset: {}, appendChild: () => {} },
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() { return true; }, contains() { return false; } },
        appendChild() {},
        addEventListener() {},
        setAttribute() {}
    })
};
const _memStore = new Map();
globalThis.localStorage = {
    getItem: (k) => (_memStore.has(k) ? _memStore.get(k) : null),
    setItem: (k, v) => { _memStore.set(k, String(v)); },
    removeItem: (k) => { _memStore.delete(k); }
};
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.AudioWorkletProcessor = class { constructor() { this.port = {}; } };
globalThis.registerProcessor = () => {};
globalThis.sampleRate = 48000;

import { ALL_JS_MODULES } from "./module_list.mjs";

for (const m of ALL_JS_MODULES) {
    await import(m);
}

const { PianoApp } = await import("/Users/ojus/official/piano-app/js/app.js");
const mockApp = {
    activeCurriculumPartId: "l9_4_p3",
    _resolvePartEntry: PianoApp.prototype._resolvePartEntry,
    dom: {
        studioCurriculumBar: { style: {} },
        studioSongSelectWrap: { style: {} },
        btnOpenImport: { style: {} },
        studioContextLabel: { textContent: "", title: "" },
        btnStudioNextPart: { disabled: false, title: "" }
    }
};
PianoApp.prototype.updateStudioCurriculumBar.call(mockApp);
if (
    mockApp.dom.studioCurriculumBar.style.display !== "inline-flex" ||
    mockApp.dom.studioSongSelectWrap.style.display !== "none" ||
    mockApp.dom.btnOpenImport.style.display !== "none" ||
    !mockApp.dom.studioContextLabel.textContent.startsWith("Lv 9 · Lesson 4 · Part 3/3") ||
    mockApp.dom.btnStudioNextPart.disabled !== true
) {
    throw new Error(`Curriculum Studio sub-bar mutual exclusion failed: ${JSON.stringify(mockApp.dom)}`);
}
mockApp.activeCurriculumPartId = null;
PianoApp.prototype.updateStudioCurriculumBar.call(mockApp);
if (
    mockApp.dom.studioCurriculumBar.style.display !== "none" ||
    mockApp.dom.studioSongSelectWrap.style.display !== "flex" ||
    mockApp.dom.btnOpenImport.style.display !== "inline-flex"
) {
    throw new Error(`Free/Song Studio sub-bar restore failed: ${JSON.stringify(mockApp.dom)}`);
}

print(`Loaded all ${ALL_JS_MODULES.length} ES modules & verified Studio sub-bar mutual exclusion cleanly.`);
EOF
"$JSC" -m "$TMP_DIR/check_modules.mjs"

echo "=== [3/5] Running Polyphonic DSP, Evaluator, 8 Songs, Lv 1-9 Curriculum, Backing Split & Gamification Suite ==="
python3 - "$APP_DIR" "$TMP_DIR/test_data.mjs" << 'PYEOF'
import json, struct, sys, wave
from pathlib import Path

app_dir = Path(sys.argv[1])
out_file = Path(sys.argv[2])
samples_dir = app_dir / "audio_dataset" / "samples"

cases = [
    ("step_01_silence.wav", []),
    ("step_02_c2.wav", [36]),
    ("step_23_dyad_octave.wav", [48, 60]),
    ("step_25_chord_c_maj.wav", [60, 64, 67]),
    ("step_27_chord_a_min.wav", [57, 60, 64]),
    ("step_28_playalong_yousician.wav", [47, 71]),
]

fixtures = []
for fname, truth in cases:
    p = samples_dir / fname
    if not p.exists():
        continue
    with wave.open(str(p), "rb") as wf:
        sr = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
    pcm = [s[0] / 32768.0 for s in struct.iter_unpack("<h", raw)]
    best_i = max(range(0, len(pcm) - 4096, 1024), key=lambda i: sum(x * x for x in pcm[i : i + 4096]))
    start_i = max(0, best_i - 1024)
    frames = [[round(x, 6) for x in pcm[start_i + h * 1024 : start_i + h * 1024 + 4096]] for h in range(4)]
    fixtures.append({"fname": fname, "sr": sr, "truth": truth, "frames": frames})

custom_songs = [
    json.loads((app_dir / "songs_data" / "amazing_grace.json").read_text(encoding="utf-8")),
    json.loads((app_dir / "songs_data" / "happy_birthday.json").read_text(encoding="utf-8")),
    json.loads((app_dir / "songs_data" / "minuet_in_g.json").read_text(encoding="utf-8")),
]
ag_midi_bytes = list((app_dir / "samples" / "amazing_grace.mid").read_bytes())

# Verify Python server.MidiParser round-trip on samples/amazing_grace.mid
sys.path.insert(0, str(app_dir))
_saved_argv = sys.argv[:]
sys.argv = [sys.argv[0]]
import server as py_server
sys.argv = _saved_argv
py_ag = py_server.MidiParser.parse(bytes(ag_midi_bytes))
if py_ag.get("notes") != custom_songs[0]["notes"]:
    raise RuntimeError("server.MidiParser output on samples/amazing_grace.mid differs from songs_data/amazing_grace.json")

out_file.write_text(
    f"export const FIXTURES = {json.dumps(fixtures)};\n"
    f"export const CUSTOM_SONGS = {json.dumps(custom_songs)};\n"
    f"export const AG_MIDI_BYTES = {json.dumps(ag_midi_bytes)};\n",
    encoding="utf-8",
)
PYEOF

cat << 'EOF' > "$TMP_DIR/regression_suite.mjs"
import { FIXTURES, CUSTOM_SONGS, AG_MIDI_BYTES } from "./test_data.mjs";
import { CalibratedPolyphonicDetector } from "/Users/ojus/official/piano-app/js/audio/polyphonic_detector.js";
import { BackingTrackEngine, VALID_BACKING_STYLES } from "/Users/ojus/official/piano-app/js/audio/backing_track.js";
import { PianoSynthesizer } from "/Users/ojus/official/piano-app/js/audio/synth.js";
import { NoteEvaluator } from "/Users/ojus/official/piano-app/js/engine/evaluator.js";
import { FINGER_PALETTE, PianoFingeringEngine } from "/Users/ojus/official/piano-app/js/engine/fingering.js";
import { GameEngine } from "/Users/ojus/official/piano-app/js/engine/game.js";
import { YousicianRenderer } from "/Users/ojus/official/piano-app/js/engine/renderer.js";
import { SONG_LIBRARY } from "/Users/ojus/official/piano-app/js/songs/library.js";
import { MidiFileParser } from "/Users/ojus/official/piano-app/js/parser/midi.js";
import { SheetMusicScanner } from "/Users/ojus/official/piano-app/js/parser/sheet.js";
import {
    PIANO_CURRICULUM,
    getCurriculumLevels,
    getLevelByNumber,
    getLessonById,
    getPartById,
    getNextPart,
    getAllCurriculumParts,
    getCurriculumSongById
} from "/Users/ojus/official/piano-app/js/curriculum/index.js";
import {
    ProgressManager,
    PIANIST_RANKS,
    UKULELE_RANKS,
    UKULELE_ACHIEVEMENT_DEFINITIONS
} from "/Users/ojus/official/piano-app/js/gamification/progress.js";
import { UkuleleArranger, verifyUkuleleSong } from "/Users/ojus/official/piano-app/js/ukulele/arranger.js";
import { UKULELE_STRINGS, chordToTabNotes } from "/Users/ojus/official/piano-app/js/ukulele/chords.js";
import {
    UKULELE_CURRICULUM,
    getUkuleleCurriculumLevels,
    getUkuleleLevelByNumber,
    getUkuleleLessonById,
    getUkulelePartById,
    getNextUkulelePart,
    getAllUkuleleCurriculumParts,
    getUkuleleCurriculumSongById
} from "/Users/ojus/official/piano-app/js/ukulele/curriculum.js";
import { UkuleleTabRenderer } from "/Users/ojus/official/piano-app/js/ukulele/renderer.js";
import { UkuleleSynthesizer } from "/Users/ojus/official/piano-app/js/audio/ukulele_synth.js";
import { UkulelePolyphonicDetector } from "/Users/ojus/official/piano-app/js/audio/ukulele_detector.js";

// 1. Acoustic Polyphonic WAV Replay Smoke Test
const det = new CalibratedPolyphonicDetector({ sampleRate: 48000 });
for (const f of FIXTURES) {
    det.resetState();
    det.setSampleRate(f.sr);
    let active = [];
    for (const fr of f.frames) {
        const r = det.detect(new Float32Array(fr));
        if (r.activeNotes && r.activeNotes.length > 0) active = r.activeNotes.map((n) => n.midi);
    }
    if (JSON.stringify(active) !== JSON.stringify(f.truth)) {
        throw new Error(`Mismatch on ${f.fname}: expected ${JSON.stringify(f.truth)}, got ${JSON.stringify(active)}`);
    }
    print(`PASS WAV: ${f.fname} -> ${JSON.stringify(active)}`);
}

// 2. Multi-Note Wait Chord & Left/Right Hand Practice Toggles
const ev = new NoteEvaluator({ mode: "wait" });
ev.loadSong({ bpm: 100, notes: [{ pitch: 47, time: 0, duration: 0.5, clef: "bass" }, { pitch: 71, time: 0, duration: 0.5, clef: "treble" }] });
const res = ev.evaluatePlayedNotes([47, 71], 0);
if (!res.chordCompleted) throw new Error("Wait mode chord did not complete");
print("PASS NoteEvaluator multi-note chord verification.");

const evHandWait = new NoteEvaluator({ mode: "wait" });
evHandWait.loadSong({
    bpm: 100,
    notes: [
        { pitch: 47, time: 0.0, duration: 0.5, clef: "bass" },
        { pitch: 71, time: 0.0, duration: 0.5, clef: "treble" },
        { pitch: 74, time: 1.0, duration: 0.5, clef: "treble" },
        { pitch: 50, time: 2.0, duration: 0.5, clef: "bass" }
    ]
});
evHandWait.setActiveHands({ left: true, right: false });
if (JSON.stringify(evHandWait.getExpectedMidisAtTime(0)) !== "[47]") {
    throw new Error("Expected only Left Hand MIDI [47] when Right Hand is toggled OFF");
}
if (evHandWait.evaluatePlayedNotes([71], 0) !== null) {
    throw new Error("Disabled Right Hand reported accuracy in Wait mode");
}
const lhRes = evHandWait.evaluatePlayedNotes([47], 0);
if (!lhRes || !lhRes.chordCompleted || evHandWait.noteStats.perfect !== 1 || evHandWait.noteStats.wrong !== 0) {
    throw new Error("Left Hand Wait beat did not complete cleanly with Right Hand OFF");
}
if (evHandWait.shouldWaitAtTime(1.2)) {
    throw new Error("Wait mode paused on a disabled Right Hand note");
}
if (!evHandWait.shouldWaitAtTime(2.0) || evHandWait.currentWaitNote.pitch !== 50) {
    throw new Error("Wait mode did not advance to next Left Hand target at t=2.0s");
}

let missCallbacks = 0;
const evHandFlow = new NoteEvaluator({
    mode: "flow",
    leftHand: true,
    rightHand: false,
    onMiss: () => { missCallbacks++; }
});
evHandFlow.loadSong({
    bpm: 100,
    notes: [
        { pitch: 71, time: 0.0, duration: 0.5, clef: "treble" },
        { pitch: 47, time: 0.0, duration: 0.5, clef: "bass" },
        { pitch: 74, time: 1.0, duration: 0.5, clef: "treble" },
        { pitch: 76, time: 3.0, duration: 0.5, clef: "treble" }
    ]
});
if (evHandFlow.evaluatePlayedNotes([71], 0.0) !== null) {
    throw new Error("Disabled Right Hand reported accuracy in Flow mode");
}
const flowHit = evHandFlow.evaluatePlayedNotes([47], 0.02);
if (!flowHit || flowHit.hitMidis[0] !== 47) {
    throw new Error("Enabled Left Hand failed to score in Flow mode");
}
evHandFlow.checkMissedNotes(1.5);
if (evHandFlow.noteStats.missed !== 0 || missCallbacks !== 0) {
    throw new Error("Disabled Right Hand reported MISSED notes in Flow mode");
}
evHandFlow.setActiveHands({ left: true, right: true }, 2.0);
evHandFlow.checkMissedNotes(2.1);
if (evHandFlow.noteStats.missed !== 0) {
    throw new Error("Re-enabling Right Hand mid-song caused retroactive MISSED notes");
}
const futureRhHit = evHandFlow.evaluatePlayedNotes([76], 3.0);
if (!futureRhHit || futureRhHit.hitMidis[0] !== 76) {
    throw new Error("Re-enabled Right Hand did not evaluate upcoming treble note");
}
print("PASS Left/Right Hand Toggle (Wait + Flow + Mid-Song Re-Enable) verification.");

// 3. Ergonomic Piano Fingering & 5-Finger Color Scheme Compliance
const validColors = new Set(Object.values(FINGER_PALETTE).map((f) => f.primary));
const validLabels = new Set(["T", "1", "2", "3", "4"]);
const scaleTest = PianoFingeringEngine.assignSongFingering({
    title: "C Major Scale",
    notes: [
        ...[60, 62, 64, 65, 67, 69, 71, 72].map((p, i) => ({ pitch: p, time: i * 0.3, duration: 0.28, clef: "treble" })),
        ...[48, 50, 52, 53, 55, 57, 59, 60].map((p, i) => ({ pitch: p, time: i * 0.3, duration: 0.28, clef: "bass" }))
    ]
});
const rhScale = scaleTest.notes.filter((n) => n.hand === "right").map((n) => n.finger).join("-");
const lhScale = scaleTest.notes.filter((n) => n.hand === "left").map((n) => n.finger).join("-");
if (rhScale !== "1-2-3-1-2-3-4-5" || lhScale !== "5-4-3-2-1-3-2-1") {
    throw new Error(`Unexpected C Major scale fingering: RH=${rhScale}, LH=${lhScale}`);
}
const quickParsed = SheetMusicScanner.parseQuickNotation("Treble: C4:0.5, E4:0.5, G4:1\nBass: C3:1, G3:1", 100);
if (!quickParsed.notes.every((n) => validColors.has(n.fingerColor) && validLabels.has(n.fingerLabel))) {
    throw new Error("QuickComposer ingestion did not color-code notes by finger");
}
print("PASS Ergonomic Piano Fingering & 5-Finger Color Scheme verification.");

// 4. Independent Parabolic Ball Physics & Subtle Non-Punitive Feedback
const mockCtx = {
    setTransform() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, rect() {}, clip() {},
    fillRect() {}, clearRect() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, stroke() {}, fill() {},
    arc() {}, ellipse() {}, roundRect() {}, fillText() {}, setLineDash() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (s) => ({ width: String(s).length * 8 })
};
const mockCanvas = {
    width: 1200,
    height: 560,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 560 }),
    getContext: () => mockCtx,
    addEventListener() {}
};
const renderer = new YousicianRenderer(mockCanvas);
const testNotes = [
    { pitch: 71, time: 0.0, duration: 0.35, clef: "treble", hand: "right" },
    { pitch: 74, time: 0.4, duration: 0.80, clef: "treble", hand: "right" },
    { pitch: 76, time: 2.0, duration: 0.50, clef: "treble", hand: "right" },
    { pitch: 48, time: 0.0, duration: 0.60, clef: "bass", hand: "left" },
    { pitch: 52, time: 0.8, duration: 0.60, clef: "bass", hand: "left" },
    { pitch: 55, time: 1.6, duration: 0.60, clef: "bass", hand: "left" }
];
const rhLayout = { playheadX: 312, bandY: 44, bandBottomY: 280, staffCenterY: 178, trebleCenterY: 178, bassCenterY: 416, staffSpacing: 16, startTime: -2.0 };
const lhLayout = { playheadX: 312, bandY: 292, bandBottomY: 560, staffCenterY: 416, trebleCenterY: 178, bassCenterY: 416, staffSpacing: 16, startTime: -2.0 };

const rhAt0 = renderer.computeBallPosition("right", testNotes, 0.0, rhLayout);
const rhMidShort = renderer.computeBallPosition("right", testNotes, 0.2, rhLayout);
const rhAt04 = renderer.computeBallPosition("right", testNotes, 0.4, rhLayout);
const rhMidLong = renderer.computeBallPosition("right", testNotes, 1.2, rhLayout);
const lhAt08 = renderer.computeBallPosition("left", testNotes, 0.8, lhLayout);
const rhAt08 = renderer.computeBallPosition("right", testNotes, 0.8, rhLayout);

if (rhAt0.x !== 312 || rhMidShort.x !== 312 || rhMidLong.x !== 312 || lhAt08.x !== 312) {
    throw new Error("Ball horizontal coordinate deviated from constant-speed playheadX");
}
if (!(rhMidLong.jumpDuration > rhMidShort.jumpDuration && rhMidLong.jumpDistancePx > rhMidShort.jumpDistancePx && rhMidLong.arcHeight > rhMidShort.arcHeight)) {
    throw new Error("Longer note gap did not produce longer/higher jump");
}
const lhBefore08 = renderer.computeBallPosition("left", testNotes, 0.7999, lhLayout);
const lhAfter08 = renderer.computeBallPosition("left", testNotes, 0.8001, lhLayout);
if (Math.abs(lhBefore08.y - lhAt08.y) > 0.5 || Math.abs(lhAfter08.y - lhAt08.y) > 0.5) {
    throw new Error("Left Hand ball trajectory is not C0 continuous across note head at t=0.8s");
}
if (!(rhAt08.y < rhAt04.y - 10 && rhAt08.inFlight)) {
    throw new Error("Right Hand ball did not independently stay in mid-flight at t=0.8s while Left Hand landed");
}
const yA = renderer.computeBallPosition("right", testNotes, 0.8, rhLayout).y;
const yB = renderer.computeBallPosition("right", testNotes, 1.0, rhLayout).y;
const yC = renderer.computeBallPosition("right", testNotes, 1.2, rhLayout).y;
const yD = renderer.computeBallPosition("right", testNotes, 1.4, rhLayout).y;
const d2_1 = yA - 2 * yB + yC;
const d2_2 = yB - 2 * yC + yD;
if (d2_1 <= 0 || Math.abs(d2_1 - d2_2) > 1e-6) {
    throw new Error(`Trajectory is not a uniform-gravity parabola: d2_1=${d2_1}, d2_2=${d2_2}`);
}

let lastMissColor = null;
const evSubtle = new NoteEvaluator({
    mode: "flow",
    onMiss: (_pitch, _status, color) => { lastMissColor = color; }
});
evSubtle.loadSong({
    bpm: 100,
    notes: [
        { pitch: 60, time: 0.0, duration: 0.5, clef: "treble" },
        { pitch: 64, time: 1.0, duration: 0.5, clef: "treble" }
    ]
});
const wrongRes = evSubtle.evaluatePlayedNotes([61], 0.0);
if (!wrongRes || wrongRes.results[0].color.toUpperCase() === "#EF4444" || lastMissColor === "#EF4444") {
    throw new Error(`Harsh red color leaked on WRONG NOTE: ${JSON.stringify(wrongRes)}`);
}
evSubtle.checkMissedNotes(0.5);
if (lastMissColor === "#EF4444") {
    throw new Error(`Harsh red color leaked on MISSED note: ${lastMissColor}`);
}

renderer.hitTexts = [];
renderer.particles = [];
renderer.ripples = [];
renderer.ghostMarks = [];
renderer.addHitFeedback("MISSED", "#64748B", true, { kind: "missed", pitch: 60 });
if (renderer.hitTexts.length !== 0 || renderer.particles.length !== 0 || renderer.ripples.length !== 0) {
    throw new Error("MISSED note spawned floating text or particle popups");
}
renderer.addHitFeedback("WRONG NOTE", "#94A3B8", true, { kind: "wrong", pitch: 72 });
if (renderer.hitTexts.length !== 0 || renderer.particles.length !== 0 || renderer.ghostMarks.length !== 1 || renderer.ghostMarks[0].pitch !== 72) {
    throw new Error("WRONG NOTE did not use calm ghostMarks without floating popups/particles");
}
renderer.addHitFeedback("PERFECT", "#6EE7B7", true, { kind: "perfect", pitch: 60, note: { pitch: 60, clef: "treble" } });
renderer.addHitFeedback("PERFECT", "#6EE7B7", true, { kind: "perfect", pitch: 64, note: { pitch: 64, clef: "treble" } });
if (renderer.ripples.length !== 2 || renderer.hitTexts.length !== 1 || renderer.hitTexts[0].text !== "Perfect") {
    throw new Error("Expected 2 ripples and 1 deduplicated 'Perfect' whisper label on chord hit");
}

// 5. Wise Men Say (299 notes, 92 measures, 6/8 grid, repeat finger consistency)
const wms = SONG_LIBRARY.find((s) => s.id === "wise_men_say");
if (!wms || wms.notes.length !== 299 || wms.chords.length !== 92 || Math.abs(wms.bpm - 63.3333) > 0.001) {
    throw new Error("Invalid wise_men_say metadata");
}
const wiseRightBelowC4 = wms.notes.filter((n) => n.hand === "right" && n.pitch < 60);
if (wiseRightBelowC4.length !== 10 || !wiseRightBelowC4.every((n) => n.clef === "treble")) {
    throw new Error(`Expected 10 right-hand treble pickup/melody notes below C4 in Wise Men Say, got ${wiseRightBelowC4.length}`);
}
const eighthSec = 60.0 / 190.0;
const gapSec = 0.025;
const validEighthDurs = new Set([1, 2, 3, 6, 9, 12]);
let lhCount = 0, rhCount = 0;
const slotFingerMap = new Map();
for (const n of wms.notes) {
    if (n.hand === "left") lhCount++;
    else if (n.hand === "right") rhCount++;
    const slot = Math.round(n.time / eighthSec);
    if (Math.abs(n.time - slot * eighthSec) > 0.0005) throw new Error(`Note time off 6/8 grid: ${n.time}`);
    const durE = Math.round((n.duration + gapSec) / eighthSec);
    if (!validEighthDurs.has(durE) || Math.abs(n.duration - (durE * eighthSec - gapSec)) > 0.0005) {
        throw new Error(`Note duration off 6/8 grid: ${n.duration}`);
    }
    const m1 = Math.floor(slot / 6) + 1;
    const sub = slot % 6;
    slotFingerMap.set(`${m1}_${sub}_${n.hand}_${n.pitch}`, n.finger);
}
if (lhCount !== 175 || rhCount !== 124) {
    throw new Error(`Expected 175 LH and 124 RH notes in wise_men_say, got LH=${lhCount}, RH=${rhCount}`);
}
for (const [key, f1] of slotFingerMap.entries()) {
    const [mStr, subStr, hand, pStr] = key.split("_");
    const m1 = Number(mStr);
    if (m1 >= 1 && m1 <= 16) {
        for (const offset of [16, 42, 68]) {
            const k2 = `${m1 + offset}_${subStr}_${hand}_${pStr}`;
            if (slotFingerMap.has(k2) && slotFingerMap.get(k2) !== f1) {
                throw new Error(`Verse repeat finger mismatch between ${key} and ${k2}`);
            }
        }
    }
    if (m1 >= 33 && m1 <= 42) {
        const k2 = `${m1 + 26}_${subStr}_${hand}_${pStr}`;
        if (slotFingerMap.get(k2) !== f1) {
            throw new Error(`Bridge repeat finger mismatch between ${key} and ${k2}`);
        }
    }
}
print("PASS Wise Men Say (299 notes, 92 measures, exact 63.3333 BPM, 100% repeat finger consistency).");

// Shared helper to audit any song/part piece across 61-key pitch, grid, finger colors, anatomical chords, and Flow/Wait playthroughs
function auditPiece(s, label, options = {}) {
    const beatSec = 60.0 / s.bpm;
    const measureSec = s.beatsPerMeasure * beatSec;
    const subSec = beatSec / (options.subDivisions || 24.0);
    const ts = s.timeSignature;
    if (!Array.isArray(ts) || ts.length !== 2 || !(ts[0] === s.beatsPerMeasure || (ts[1] === 8 && ts[0] === s.beatsPerMeasure * 3))) {
        throw new Error(`[${label}] Invalid timeSignature ${JSON.stringify(ts)} for beatsPerMeasure=${s.beatsPerMeasure}`);
    }
    const maxOnset = Math.max(...s.notes.map((n) => n.time));
    const expectedBars = Math.floor((maxOnset + 0.02) / measureSec) + 1;
    if (!Array.isArray(s.chords) || s.chords.length !== expectedBars) {
        throw new Error(`[${label}] Expected ${expectedBars} measure chords, got ${s.chords?.length}`);
    }
    for (const cSym of s.chords) {
        if (typeof cSym === "string" && cSym.trim().length > 0) {
            const parsedChord = BackingTrackEngine.parseChordSymbol(cSym.split(/\s*(?:→|->|\||(?:\s+-\s+))\s*/)[0]);
            if (!parsedChord || !Array.isArray(parsedChord.intervals) || parsedChord.intervals.length < 2) {
                throw new Error(`[${label}] Invalid chord symbol '${cSym}'`);
            }
        }
    }

    let prevTime = -1;
    for (const n of s.notes) {
        if (!Number.isInteger(n.pitch) || n.pitch < 36 || n.pitch > 96) {
            throw new Error(`[${label}] Out-of-range pitch [36..96]: ${JSON.stringify(n)}`);
        }
        if (n.time < -1e-6 || n.time < prevTime - 1e-6) {
            throw new Error(`[${label}] Non-chronological or negative timestamp: ${JSON.stringify(n)}`);
        }
        prevTime = n.time;
        if (typeof n.duration !== "number" || n.duration < 0.14) {
            throw new Error(`[${label}] Duration too short (<0.14s): ${JSON.stringify(n)}`);
        }
        if ((n.hand !== "left" && n.hand !== "right") || n.clef !== (n.hand === "left" ? "bass" : "treble")) {
            throw new Error(`[${label}] Hand/clef mismatch: ${JSON.stringify(n)}`);
        }
        const pal = FINGER_PALETTE[n.finger];
        if (!pal || n.fingerLabel !== pal.diagramLabel || n.fingerColor !== pal.primary) {
            throw new Error(`[${label}] Invalid finger/color metadata: ${JSON.stringify(n)}`);
        }
        const subIdx = Math.round(n.time / subSec);
        if (Math.abs(n.time - subIdx * subSec) > 0.001) {
            throw new Error(`[${label}] Off beat-subdivision grid: ${JSON.stringify(n)}`);
        }
    }

    // Anatomical intra-hand chord ordering & repeated-pitch articulation check
    let sameHandChordCount = 0;
    let soloOnsetCount = 0;
    for (const handName of ["left", "right"]) {
        const hNotes = s.notes.filter((n) => n.hand === handName).sort((a, b) => a.time - b.time || a.pitch - b.pitch);

        // Repeated-pitch gap >= 19ms
        const byPitch = new Map();
        for (const n of hNotes) {
            if (!byPitch.has(n.pitch)) byPitch.set(n.pitch, []);
            byPitch.get(n.pitch).push(n);
        }
        for (const [p, arr] of byPitch.entries()) {
            for (let i = 0; i < arr.length - 1; i++) {
                const gapBetween = arr[i + 1].time - (arr[i].time + arr[i].duration);
                if (gapBetween < 0.019) {
                    throw new Error(`[${label}] Overlapping/tight repeated pitch ${p} (${gapBetween.toFixed(4)}s) in ${handName}`);
                }
            }
        }

        // Group simultaneous intra-hand clusters (<= 55ms)
        const handClusters = [];
        for (const n of hNotes) {
            if (handClusters.length > 0 && Math.abs(n.time - handClusters[handClusters.length - 1][0].time) <= 0.055) {
                handClusters[handClusters.length - 1].push(n);
            } else {
                handClusters.push([n]);
            }
        }
        for (const cl of handClusters) {
            if (cl.length > 5) {
                throw new Error(`[${label}] More than 5 simultaneous notes in ${handName} hand at t=${cl[0].time}`);
            }
            if (cl.length >= 2) {
                sameHandChordCount++;
                cl.sort((a, b) => a.pitch - b.pitch);
                for (let i = 0; i < cl.length - 1; i++) {
                    if (cl[i].pitch === cl[i + 1].pitch) {
                        throw new Error(`[${label}] Duplicate unison pitch in ${handName} chord at t=${cl[0].time}`);
                    }
                    if (cl[i].finger === cl[i + 1].finger) {
                        throw new Error(`[${label}] Duplicate finger ${cl[i].finger} in ${handName} chord at t=${cl[0].time}`);
                    }
                    if (handName === "right" && !(cl[i].finger < cl[i + 1].finger)) {
                        throw new Error(`[${label}] Non-increasing RH chord fingers (${cl[i].finger} vs ${cl[i + 1].finger}) at t=${cl[0].time}`);
                    }
                    if (handName === "left" && !(cl[i].finger > cl[i + 1].finger)) {
                        throw new Error(`[${label}] Non-decreasing LH chord fingers (${cl[i].finger} vs ${cl[i + 1].finger}) at t=${cl[0].time}`);
                    }
                }
            }
        }
    }

    // Simulated 100%-accuracy playthroughs in Flow & Wait modes (honoring targetHands if provided)
    const activeHands = options.targetHands || { left: true, right: true };
    const activeNotes = s.notes.filter((n) => (n.hand === "left" ? activeHands.left : activeHands.right));
    if (activeNotes.length === 0) {
        throw new Error(`[${label}] Zero active notes under targetHands=${JSON.stringify(activeHands)}`);
    }

    const clusters = [];
    const sortedActive = [...activeNotes].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
    for (const n of sortedActive) {
        if (clusters.length > 0 && Math.abs(n.time - clusters[clusters.length - 1].time) <= 0.050) {
            clusters[clusters.length - 1].midis.push(n.pitch);
        } else {
            clusters.push({ time: n.time, midis: [n.pitch] });
        }
    }
    for (const cl of clusters) {
        if (cl.midis.length === 1) soloOnsetCount++;
    }

    const evFlow = new NoteEvaluator({ mode: "flow", leftHand: activeHands.left, rightHand: activeHands.right });
    evFlow.loadSong(JSON.parse(JSON.stringify(s)));
    for (const cl of clusters) {
        evFlow.evaluatePlayedNotes(cl.midis, cl.time);
    }
    evFlow.checkMissedNotes(maxOnset + 10.0);
    if (evFlow.noteStats.perfect !== activeNotes.length || evFlow.noteStats.wrong !== 0 || evFlow.noteStats.missed !== 0) {
        throw new Error(`[${label}] Flow playthrough failed: ${JSON.stringify(evFlow.noteStats)} vs expected=${activeNotes.length}`);
    }

    const evWait = new NoteEvaluator({ mode: "wait", leftHand: activeHands.left, rightHand: activeHands.right });
    evWait.loadSong(JSON.parse(JSON.stringify(s)));
    for (const cl of clusters) {
        const wRes = evWait.evaluatePlayedNotes(cl.midis, cl.time);
        if (!wRes || !wRes.chordCompleted) {
            throw new Error(`[${label}] Wait playthrough stuck at t=${cl.time}`);
        }
    }
    if (evWait.noteStats.perfect !== activeNotes.length || evWait.noteStats.wrong !== 0) {
        throw new Error(`[${label}] Wait playthrough stats mismatch: ${JSON.stringify(evWait.noteStats)}`);
    }

    return {
        noteCount: s.notes.length,
        sameHandChordCount,
        multiNoteClusterCount: clusters.filter((c) => c.midis.length >= 2).length,
        soloOnsetCount
    };
}

// 6. Audit All 8 Repertoire & Persisted Songs (602 notes)
const allEightSongs = [...SONG_LIBRARY, ...CUSTOM_SONGS];
if (allEightSongs.length !== 8) {
    throw new Error(`Expected 8 total songs (5 library + 3 custom), got ${allEightSongs.length}`);
}
const jsAgParsed = MidiFileParser.parse(new Uint8Array(AG_MIDI_BYTES).buffer);
if (JSON.stringify(jsAgParsed.notes) !== JSON.stringify(CUSTOM_SONGS[0].notes)) {
    throw new Error("MidiFileParser output on samples/amazing_grace.mid differs from songs_data/amazing_grace.json");
}

let catalogNotesTotal = 0;
for (const s of allEightSongs) {
    const resSong = auditPiece(s, s.id, { subDivisions: 12.0 });
    catalogNotesTotal += resSong.noteCount;
}
if (catalogNotesTotal !== 602) {
    throw new Error(`Expected 602 verified notes across 8 songs, got ${catalogNotesTotal}`);
}
print(`PASS All 8 Repertoire Songs (${catalogNotesTotal} notes) Pitch, Grid, Fingering & Flow/Wait Playthrough verification.`);

// 7. Audit All 9 Curriculum Levels (Levels 1-9, Lessons, Multi-Part Solo + Chords + Combined)
if (PIANO_CURRICULUM.length !== 9 || getCurriculumLevels().length !== 9) {
    throw new Error(`Expected 9 curriculum levels (1..9), got ${PIANO_CURRICULUM.length}`);
}
const seenLessonIds = new Set();
const seenPartIds = new Set();
const seenSongIds = new Set();
let curriculumLessonsTotal = 0;
let curriculumPartsTotal = 0;
let curriculumNotesTotal = 0;
let curriculumChordsTotal = 0;

for (let expectedLv = 1; expectedLv <= 9; expectedLv++) {
    const lv = getLevelByNumber(expectedLv);
    if (!lv || lv.level !== expectedLv || !Array.isArray(lv.lessons) || lv.lessons.length < 3) {
        throw new Error(`Invalid or missing curriculum Level ${expectedLv}`);
    }

    let levelChordOnsets = 0;
    let levelSoloOnsets = 0;
    const levelPartTypes = new Set();

    for (const lesson of lv.lessons) {
        curriculumLessonsTotal++;
        if (!lesson.id || seenLessonIds.has(lesson.id) || getLessonById(lesson.id)?.id !== lesson.id) {
            throw new Error(`Duplicate or unindexed lesson ID: ${lesson.id}`);
        }
        seenLessonIds.add(lesson.id);

        if (!Array.isArray(lesson.parts) || lesson.parts.length < 3) {
            throw new Error(`Lesson ${lesson.id} must have at least 3 parts, got ${lesson.parts?.length}`);
        }

        for (const part of lesson.parts) {
            curriculumPartsTotal++;
            if (!part.id || seenPartIds.has(part.id) || getPartById(part.id)?.part?.id !== part.id) {
                throw new Error(`Duplicate or unindexed part ID: ${part.id}`);
            }
            seenPartIds.add(part.id);
            levelPartTypes.add(part.partType);

            if (!part.song || !Array.isArray(part.song.notes) || part.song.notes.length < 16) {
                throw new Error(`Curriculum part ${part.id} has fewer than 16 notes`);
            }
            if (seenSongIds.has(part.song.id) || getCurriculumSongById(part.song.id)?.part?.id !== part.id) {
                throw new Error(`Duplicate or unindexed curriculum song ID: ${part.song.id}`);
            }
            seenSongIds.add(part.song.id);

            if (!VALID_BACKING_STYLES.has(part.song.backingStyle)) {
                throw new Error(`Invalid backingStyle '${part.song.backingStyle}' on ${part.id}`);
            }

            const pStats = auditPiece(part.song, part.id, {
                subDivisions: 24.0,
                targetHands: part.targetHands || { left: true, right: true }
            });
            curriculumNotesTotal += pStats.noteCount;
            curriculumChordsTotal += pStats.sameHandChordCount;
            levelChordOnsets += pStats.multiNoteClusterCount;
            levelSoloOnsets += pStats.soloOnsetCount;
        }
    }

    if (!levelPartTypes.has("solo") || !levelPartTypes.has("chords") || !levelPartTypes.has("combined")) {
        throw new Error(`Level ${expectedLv} is missing solo, chords, or combined part types: ${JSON.stringify([...levelPartTypes])}`);
    }
    if (levelChordOnsets === 0 || levelSoloOnsets === 0) {
        throw new Error(`Level ${expectedLv} must contain BOTH multi-note chords (${levelChordOnsets}) and solo onsets (${levelSoloOnsets})`);
    }
}

// Verify flat getAllCurriculumParts() & getNextPart() chain traverses all parts end-to-end
const allFlatParts = getAllCurriculumParts();
if (allFlatParts.length !== curriculumPartsTotal) {
    throw new Error(`getAllCurriculumParts() length (${allFlatParts.length}) !== ${curriculumPartsTotal}`);
}
let chainCount = 0;
let cursor = allFlatParts[0];
while (cursor) {
    chainCount++;
    cursor = getNextPart(cursor.part.id);
}
if (chainCount !== curriculumPartsTotal) {
    throw new Error(`getNextPart() chain traversed ${chainCount} parts, expected ${curriculumPartsTotal}`);
}
print(
    `PASS All 9 Curriculum Levels (${curriculumLessonsTotal} lessons, ${curriculumPartsTotal} parts, ` +
    `${curriculumNotesTotal} notes, ${curriculumChordsTotal} same-hand chords) 100% Flow/Wait & Anatomical Fingering verification.`
);

// 8. Verify Headphone BackingTrackEngine + GameEngine Strict Audio Split & onSongComplete
function createMockAudioContext() {
    const makeParam = (initVal = 0) => ({
        value: initVal,
        setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; },
        cancelScheduledValues() {}
    });
    return {
        currentTime: 0,
        sampleRate: 48000,
        state: "running",
        destination: {},
        resume() {},
        createGain: () => ({ gain: makeParam(1), connect() {} }),
        createBiquadFilter: () => ({ type: "lowpass", frequency: makeParam(1200), Q: makeParam(0.7), connect() {} }),
        createStereoPanner: () => ({ pan: makeParam(0), connect() {} }),
        createOscillator: () => ({
            type: "sine",
            frequency: makeParam(440),
            detune: makeParam(0),
            connect() {},
            start() {},
            stop() {}
        }),
        createBuffer: (_ch, len) => {
            const arr = new Float32Array(len);
            return { getChannelData: () => arr };
        },
        createBufferSource: () => ({
            buffer: null,
            connect() {},
            start() {},
            stop() {}
        })
    };
}

const mockAudioCtx = createMockAudioContext();
const testSynth = new PianoSynthesizer({ ctx: mockAudioCtx });
let completedSummary = null;
const testGame = new GameEngine(null, null, testSynth, {
    onSongComplete: (summary) => { completedSummary = summary; }
});

const splitTestSong = {
    id: "backing_split_test",
    title: "Headphone Split Test",
    bpm: 120,
    beatsPerMeasure: 4,
    timeSignature: [4, 4],
    keySignature: "C",
    backingStyle: "acoustic_pop",
    chords: ["C", "G/B"],
    notes: [
        { pitch: 60, time: 0.0, duration: 0.475, clef: "treble", hand: "right", finger: 1, fingerLabel: "T", fingerColor: "#48A870" },
        { pitch: 64, time: 0.5, duration: 0.475, clef: "treble", hand: "right", finger: 3, fingerLabel: "2", fingerColor: "#6848F8" },
        { pitch: 67, time: 1.0, duration: 0.475, clef: "treble", hand: "right", finger: 5, fingerLabel: "4", fingerColor: "#E86078" }
    ]
};

// (a) Play-Along ON (referenceAudioEnabled = true): BOTH piano guide notes AND backing music play
testGame.loadSong(splitTestSong);
testGame.seek(0.0);
testGame.setReferenceAudio(true);
testGame.setBackingAudio(true);
testGame.play();
const notesBeforeOn = testSynth.playNoteCount;
const backingBeforeOn = testGame.backingTrack.stats.totalScheduledNodes;
testGame.step(0.15);
testGame.step(0.45);
if (testSynth.playNoteCount <= notesBeforeOn) {
    throw new Error("Expected PianoSynthesizer guide notes to play when Play-Along is ON");
}
if (testGame.backingTrack.stats.totalScheduledNodes <= backingBeforeOn) {
    throw new Error("Expected BackingTrackEngine accompaniment to schedule when Play-Along is ON");
}

// (b) Play-Along OFF (referenceAudioEnabled = false): Piano guide notes MUST stay silent while Backing Music ALWAYS plays!
testGame.pause();
if (testGame.backingTrack.getActiveVoiceCount() !== 0) {
    throw new Error("BackingTrackEngine left active voices after pause()");
}
testGame.restart();
testGame.seek(0.0);
testGame.setReferenceAudio(false);
testGame.play();
const notesBeforeOff = testSynth.playNoteCount;
const backingBeforeOff = testGame.backingTrack.stats.totalScheduledNodes;
testGame.step(0.15);
testGame.step(0.45);
if (testSynth.playNoteCount !== notesBeforeOff) {
    throw new Error(`Play-Along OFF failed to mute piano guide notes (delta=${testSynth.playNoteCount - notesBeforeOff})`);
}
if (testGame.backingTrack.stats.totalScheduledNodes <= backingBeforeOff) {
    throw new Error("BackingTrackEngine stopped playing when Play-Along piano toggle was turned OFF!");
}

// (c) Wait-mode chord freeze cleanly stops backing oscillators; completing chord resumes & triggers onSongComplete
testGame.pause();
testGame.setMode("wait");
testGame.restart();
testGame.seek(0.0);
testGame.play();
testGame.step(0.05);
if (!testGame.isWaiting || testGame.backingTrack.getActiveVoiceCount() !== 0) {
    throw new Error("Wait-mode freeze did not cleanly release BackingTrackEngine voices");
}
testGame.handleUserInputNotes([60], true);
testGame.step(0.50);
testGame.handleUserInputNotes([64], true);
testGame.step(0.50);
testGame.handleUserInputNotes([67], true);
testGame.step(1.20);
if (!completedSummary || completedSummary.perfectCount !== 3 || completedSummary.accuracy !== 100) {
    throw new Error(`onSongComplete did not fire with 100% summary: ${JSON.stringify(completedSummary)}`);
}

// Verify inferChordsFromNotes automatic chord inference for chordless songs
const inferred = BackingTrackEngine.inferChordsFromNotes({
    bpm: 120,
    beatsPerMeasure: 4,
    keySignature: "C",
    notes: [
        { pitch: 48, time: 0.0, duration: 0.5 },
        { pitch: 64, time: 0.0, duration: 0.5 },
        { pitch: 67, time: 0.5, duration: 0.5 }
    ]
});
if (!Array.isArray(inferred) || inferred.length < 1 || !inferred[0]) {
    throw new Error("BackingTrackEngine.inferChordsFromNotes failed on chordless song");
}
print("PASS BackingTrackEngine + GameEngine Headphone Split (Always-On Backing vs Play-Along Piano Toggle) & onSongComplete.");

// 9. Verify ProgressManager Completion, Stars, XP, Ranks, Streaks & Persistence Round-Trip
const memMap = new Map();
const mockStorage = {
    getItem: (k) => (memMap.has(k) ? memMap.get(k) : null),
    setItem: (k, v) => { memMap.set(k, String(v)); },
    removeItem: (k) => { memMap.delete(k); }
};
const pm = new ProgressManager({ storage: mockStorage, curriculum: PIANO_CURRICULUM });
if (
    ProgressManager.computeStars(95, { mode: "flow" }) !== 3 ||
    ProgressManager.computeStars(80, { mode: "flow" }) !== 2 ||
    ProgressManager.computeStars(55, { mode: "flow" }) !== 1 ||
    ProgressManager.computeStars(30, { mode: "flow" }) !== 0 ||
    ProgressManager.computeStars(20, { mode: "wait", completedFull: true }) !== 1
) {
    throw new Error("ProgressManager.computeStars thresholds violated");
}

// Complete all 3 parts of Level 1 Lesson 1 across consecutive UTC days -> auto-completes Lesson 1 & increments streak
const lv1 = getLevelByNumber(1);
const lesson1 = lv1.lessons[0];
pm.recordPartCompletion(lesson1.parts[0].id, { accuracy: 96, score: 2400, mode: "flow", playedAt: "2026-11-10T10:00:00Z" });
pm.recordPartCompletion(lesson1.parts[1].id, { accuracy: 88, score: 2100, mode: "flow", playedAt: "2026-11-11T10:00:00Z" });
const r3 = pm.recordPartCompletion(lesson1.parts[2].id, { accuracy: 98, score: 3200, mode: "flow", playedAt: "2026-11-12T10:00:00Z" });

if (!pm.isLessonCompleted(lesson1.id) || !r3.newlyCompletedLesson || r3.streakDays !== 3) {
    throw new Error(`Lesson cascade or 3-day streak failed: lessonDone=${pm.isLessonCompleted(lesson1.id)}, streak=${r3.streakDays}`);
}
// Complete remaining lessons of Level 1 -> auto-completes Level 1
for (let li = 1; li < lv1.lessons.length; li++) {
    for (const p of lv1.lessons[li].parts) {
        pm.recordPartCompletion(p.id, { accuracy: 95, score: 2500, mode: "flow", playedAt: "2026-11-12T11:00:00Z" });
    }
}
if (!pm.isLevelCompleted(1)) {
    throw new Error("Completing all lessons in Level 1 did not auto-complete Level 1");
}
// Song completion + manual toggle + reload round-trip
pm.recordSongCompletion("wise_men_say", { accuracy: 94, score: 18000, mode: "flow", totalActiveNotes: 299, playedAt: "2026-11-12T12:00:00Z" });
const toggleRes = pm.toggleManualComplete("fur_elise", "song");
if (!toggleRes.completed || !pm.isSongCompleted("fur_elise")) {
    throw new Error("Manual song completion toggle ON failed");
}
const pmReloaded = new ProgressManager({ storage: mockStorage, curriculum: PIANO_CURRICULUM });
const summaryReloaded = pmReloaded.getSummary(SONG_LIBRARY);
if (
    !pmReloaded.isLevelCompleted(1) ||
    !pmReloaded.isSongCompleted("wise_men_say") ||
    !pmReloaded.isSongCompleted("fur_elise") ||
    summaryReloaded.totalXp <= 0 ||
    PIANIST_RANKS.length !== 6 ||
    summaryReloaded.continueLearning?.level?.level !== 2
) {
    throw new Error(`ProgressManager persistence round-trip mismatch: ${JSON.stringify(summaryReloaded)}`);
}
print("PASS ProgressManager (Stars, XP, Ranks, 3-Day Streak, Cascading Lesson/Level Completion & Persistence) verification.");

// 10. Full Canvas render() smoke check
renderer.render({
    currentTime: 0.8,
    startTime: -2.0,
    leadInBeats: 4,
    firstNoteTime: 0.0,
    isPlaying: true,
    currentBpm: 100,
    song: SONG_LIBRARY[0],
    score: 400,
    streak: 4,
    multiplier: 2,
    isWaiting: false,
    waitTargetNote: null,
    waitTargetChord: [],
    activeHands: { left: true, right: true }
});
print("PASS Full Retina Canvas render() & Subtle Studio Feedback verification.");

// 11. Permanent Ukulele Full-Stack Regression Suite (Arranger, 108 Curriculum Parts, DSP/Tuner/Strum, Engine Swap, Unison Chords, Headphone Split, Progress Isolation)
// 11a. Universal UkuleleArranger across all 8 built-in/server Piano songs
let ukuArrangedNotesTotal = 0;
for (const s of allEightSongs) {
    const ukuSong = UkuleleArranger.arrangeSongForUkulele(s);
    if (!ukuSong || ukuSong.instrument !== "ukulele") {
        throw new Error(`UkuleleArranger failed to tag instrument='ukulele' on ${s.id}`);
    }
    const vRes = verifyUkuleleSong(ukuSong);
    if (!vRes.valid) {
        throw new Error(`verifyUkuleleSong failed on ${s.id}: ${JSON.stringify(vRes.errors.slice(0, 5))}`);
    }
    const melCount = ukuSong.notes.filter((n) => n.lane === "melody").length;
    const chdCount = ukuSong.notes.filter((n) => n.lane === "chords").length;
    if (melCount === 0 || chdCount === 0) {
        throw new Error(`Ukulele arranged ${s.id} missing melody (${melCount}) or chords (${chdCount})`);
    }
    ukuArrangedNotesTotal += ukuSong.notes.length;
}
print(`PASS UkuleleArranger all 8 Repertoire Songs (${ukuArrangedNotesTotal} notes, 0 collisions, 100% pitch=openMidi+fret).`);

// 11b. All 9 Ukulele Curriculum Levels (36 lessons, 108 parts, 9,090 notes, Flow + Wait playthroughs)
if (UKULELE_CURRICULUM.length !== 9 || getUkuleleCurriculumLevels().length !== 9) {
    throw new Error(`Expected 9 Ukulele curriculum levels, got ${UKULELE_CURRICULUM.length}`);
}
let ukuLessonsTotal = 0;
let ukuPartsTotal = 0;
let ukuCurrNotesTotal = 0;
const ukuSeenPartIds = new Set();
for (let lvNum = 1; lvNum <= 9; lvNum++) {
    const lv = getUkuleleLevelByNumber(lvNum);
    if (!lv || lv.level !== lvNum || !Array.isArray(lv.lessons) || lv.lessons.length !== 4) {
        throw new Error(`Invalid Ukulele Level ${lvNum}`);
    }
    const types = new Set();
    for (const lesson of lv.lessons) {
        ukuLessonsTotal++;
        if (!lesson.id || getUkuleleLessonById(lesson.id)?.id !== lesson.id || seenLessonIds.has(lesson.id)) {
            throw new Error(`Invalid or colliding Ukulele lesson ID: ${lesson.id}`);
        }
        if (!Array.isArray(lesson.parts) || lesson.parts.length !== 3) {
            throw new Error(`Ukulele lesson ${lesson.id} must have 3 parts`);
        }
        for (const part of lesson.parts) {
            ukuPartsTotal++;
            types.add(part.partType);
            if (!part.id || ukuSeenPartIds.has(part.id) || seenPartIds.has(part.id) || getUkulelePartById(part.id)?.part?.id !== part.id) {
                throw new Error(`Invalid or colliding Ukulele part ID: ${part.id}`);
            }
            ukuSeenPartIds.add(part.id);
            if (!part.song || part.song.instrument !== "ukulele" || !VALID_BACKING_STYLES.has(part.song.backingStyle)) {
                throw new Error(`Invalid Ukulele curriculum song metadata on ${part.id}`);
            }
            if (getUkuleleCurriculumSongById(part.song.id)?.part?.id !== part.id) {
                throw new Error(`Unindexed Ukulele curriculum song ID: ${part.song.id}`);
            }
            const vRes = verifyUkuleleSong(part.song);
            if (!vRes.valid) {
                throw new Error(`Ukulele curriculum ${part.id} failed verifyUkuleleSong: ${JSON.stringify(vRes.errors.slice(0, 3))}`);
            }
            ukuCurrNotesTotal += part.song.notes.length;

            // Simulated 100% Flow & Wait playthrough (including High-G unison chords)
            const targetHands = part.targetHands || { left: true, right: true };
            const activeNotes = part.song.notes.filter((n) => (n.hand === "left" ? targetHands.left : targetHands.right));
            const sortedActive = [...activeNotes].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
            const clusters = [];
            for (const n of sortedActive) {
                if (clusters.length > 0 && Math.abs(n.time - clusters[clusters.length - 1].time) <= 0.055) {
                    if (!clusters[clusters.length - 1].midis.includes(n.pitch)) {
                        clusters[clusters.length - 1].midis.push(n.pitch);
                    }
                } else {
                    clusters.push({ time: n.time, midis: [n.pitch] });
                }
            }
            const evUkuWait = new NoteEvaluator({ mode: "wait", leftHand: targetHands.left, rightHand: targetHands.right });
            evUkuWait.loadSong(JSON.parse(JSON.stringify(part.song)));
            for (const cl of clusters) {
                const wRes = evUkuWait.evaluatePlayedNotes(cl.midis, cl.time);
                if (!wRes || !wRes.chordCompleted) {
                    throw new Error(`Ukulele Wait playthrough stuck on ${part.id} at t=${cl.time}`);
                }
            }
            if (evUkuWait.noteStats.perfect !== activeNotes.length || evUkuWait.noteStats.wrong !== 0) {
                throw new Error(`Ukulele Wait stats mismatch on ${part.id}: ${JSON.stringify(evUkuWait.noteStats)} vs ${activeNotes.length}`);
            }
        }
    }
    if (!types.has("solo") || !types.has("chords") || !types.has("combined")) {
        throw new Error(`Ukulele Level ${lvNum} missing solo/chords/combined parts`);
    }
}
const allUkuFlat = getAllUkuleleCurriculumParts();
let ukuChain = 0;
let ukuCur = allUkuFlat[0];
while (ukuCur) {
    ukuChain++;
    ukuCur = getNextUkulelePart(ukuCur.part.id);
}
if (ukuChain !== 108 || ukuPartsTotal !== 108 || ukuLessonsTotal !== 36) {
    throw new Error(`Ukulele curriculum chain mismatch: chain=${ukuChain}, parts=${ukuPartsTotal}, lessons=${ukuLessonsTotal}`);
}
print(`PASS All 9 Ukulele Curriculum Levels (${ukuLessonsTotal} lessons, ${ukuPartsTotal} parts, ${ukuCurrNotesTotal} notes) 100% Schema & Wait Playthrough verification.`);

// 11c. UkulelePolyphonicDetector DSP Smoke Test (Silence, A4 +6.5c Tuner, Staggered C Strum)
const ukuDet = new UkulelePolyphonicDetector({ sampleRate: 48000, tuning: "high-g" });
const silRes = ukuDet.detect(new Float32Array(4096), { nowMs: 100 });
if (!silRes.silence || silRes.activeNotes.length !== 0) {
    throw new Error("UkulelePolyphonicDetector reported false positive on digital silence");
}
// Synthetic A4 sharp by +6.5 cents
const srUku = 48000;
const fA4Sharp = 440 * Math.pow(2, 6.5 / 1200);
const a4Frame = new Float32Array(4096);
for (let i = 0; i < 4096; i++) {
    const t = i / srUku;
    a4Frame[i] = 0.22 * Math.sin(2 * Math.PI * fA4Sharp * t)
        + 0.09 * Math.sin(2 * Math.PI * 2 * fA4Sharp * t)
        + 0.03 * Math.sin(2 * Math.PI * 3 * fA4Sharp * t);
}
ukuDet.resetState();
let a4Res = null;
for (let f = 0; f < 3; f++) {
    a4Res = ukuDet.detect(a4Frame, { nowMs: 500 + f * 22, isChordExpected: false });
}
if (!a4Res || !a4Res.activeMidis.includes(69) || Math.abs((a4Res.centsOff ?? 99) - 6.5) > 2.5) {
    throw new Error(`UkulelePolyphonicDetector A4+6.5c tuner check failed: ${JSON.stringify({ midis: a4Res?.activeMidis, cents: a4Res?.centsOff })}`);
}
// Staggered 45ms C Major strum (G4=67, C4=60, E4=64, C5=72) unified into 1 chord
ukuDet.resetState();
const strumFreqs = [
    { midi: 67, onsetSec: 0.000 },
    { midi: 60, onsetSec: 0.015 },
    { midi: 64, onsetSec: 0.030 },
    { midi: 72, onsetSec: 0.045 }
];
const totalSamp = Math.floor(srUku * 0.45);
const strumPcm = new Float32Array(totalSamp);
for (const st of strumFreqs) {
    const f0 = 440 * Math.pow(2, (st.midi - 69) / 12);
    const startIdx = Math.floor(st.onsetSec * srUku);
    for (let i = startIdx; i < totalSamp; i++) {
        const dt = (i - startIdx) / srUku;
        const env = Math.min(1, dt / 0.006) * Math.exp(-dt * 2.2);
        strumPcm[i] += env * (0.14 * Math.sin(2 * Math.PI * f0 * dt)
            + 0.06 * Math.sin(2 * Math.PI * 2 * f0 * dt)
            + 0.025 * Math.sin(2 * Math.PI * 3 * f0 * dt));
    }
}
let unifiedOnset = null;
let detectedCChord = null;
for (let pos = 0; pos + 4096 <= totalSamp; pos += 1024) {
    const nowMs = 1000 + (pos / srUku) * 1000;
    const r = ukuDet.detect(strumPcm.subarray(pos, pos + 4096), { nowMs, expectedMidis: [60, 64, 67, 72], isChordExpected: true });
    if (r.onsetMidis && r.onsetMidis.length >= 3 && !unifiedOnset) {
        unifiedOnset = [...r.onsetMidis].sort((a, b) => a - b);
    }
    if (r.detectedChord) detectedCChord = r.detectedChord;
}
if (!unifiedOnset || JSON.stringify(unifiedOnset) !== "[60,64,67,72]" || detectedCChord !== "C") {
    throw new Error(`UkulelePolyphonicDetector staggered C strum failed: onset=${JSON.stringify(unifiedOnset)}, chord=${detectedCChord}`);
}
print("PASS UkulelePolyphonicDetector DSP (Silence=0 FP, A4+6.5c Tuner, Unified Staggered C Strum).");

// 11d. GameEngine Piano <-> Ukulele Hot-Swap, Unison F Chord, Ukulele Headphone Split & UkuleleTabRenderer
const ukuSynth = new UkuleleSynthesizer(testSynth);
const ukuRenderer = new UkuleleTabRenderer(mockCanvas);
testGame.setInstrumentContext({ instrument: "ukulele", renderer: ukuRenderer, keyboard: null, synth: ukuSynth });
const fChordNotes = chordToTabNotes("F", 0.0, 0.8, { strumDir: "down", chordGroupId: "test_f_0" });
const ukuSplitSong = {
    id: "uku_split_unison_test",
    instrument: "ukulele",
    title: "Ukulele Unison F & Headphone Split",
    bpm: 100,
    beatsPerMeasure: 4,
    timeSignature: [4, 4],
    keySignature: "F",
    backingStyle: "acoustic_pop",
    chords: ["F"],
    notes: fChordNotes
};
testGame.setMode("wait");
testGame.loadSong(ukuSplitSong);
testGame.seek(0.0);
testGame.setReferenceAudio(false);
testGame.setBackingAudio(true);
testGame.play();
testGame.step(0.05);
if (!testGame.isWaiting) throw new Error("Ukulele Wait mode did not pause on unison F chord");
// Single detection of [60, 65, 69] MUST complete ALL 4 strings (including dual A4=69 unison!)
testGame.handleUserInputNotes([60, 65, 69], true);
if (testGame.isWaiting || testGame.evaluator.noteStats.perfect !== 4) {
    throw new Error(`Ukulele unison F chord did not complete all 4 strings: waiting=${testGame.isWaiting}, stats=${JSON.stringify(testGame.evaluator.noteStats)}`);
}
// Flow headphone split check: Play-Along OFF silences UkuleleSynthesizer while BackingTrackEngine schedules!
testGame.pause();
testGame.setMode("flow");
testGame.loadSong(ukuSplitSong);
testGame.seek(0.0);
testGame.setReferenceAudio(false);
testGame.setBackingAudio(true);
const ukuStrumBeforeOff = ukuSynth.playStrumCount + ukuSynth.playNoteCount;
const ukuBackingBeforeOff = testGame.backingTrack.stats.totalScheduledNodes;
testGame.play();
testGame.step(0.15);
testGame.step(0.35);
if ((ukuSynth.playStrumCount + ukuSynth.playNoteCount) !== ukuStrumBeforeOff) {
    throw new Error("Ukulele Play-Along OFF failed to mute UkuleleSynthesizer guide strums");
}
if (testGame.backingTrack.stats.totalScheduledNodes <= ukuBackingBeforeOff) {
    throw new Error("BackingTrackEngine stopped in Ukulele mode when Play-Along was OFF");
}
// UkuleleTabRenderer render() + computeBallPosition() smoke check
const ukuBall = ukuRenderer.computeBallPosition(fChordNotes, 0.0, { playheadX: 312, boardTop: 120, boardHeight: 220 });
if (!ukuBall || !Number.isFinite(ukuBall.y)) {
    throw new Error("UkuleleTabRenderer.computeBallPosition failed");
}
ukuRenderer.render({
    currentTime: 0.25,
    startTime: -2.0,
    leadInBeats: 4,
    firstNoteTime: 0.0,
    isPlaying: true,
    currentBpm: 100,
    song: ukuSplitSong,
    score: 400,
    streak: 4,
    multiplier: 2,
    isWaiting: false,
    waitTargetNote: null,
    waitTargetChord: [],
    activeHands: { left: true, right: true }
});
testGame.pause();
testGame.setInstrumentContext({ instrument: "piano", renderer, keyboard: null, synth: testSynth });
print("PASS GameEngine Piano<->Ukulele Swap, Unison F Chord, Ukulele Headphone Split & UkuleleTabRenderer.");

// 11e. ProgressManager Piano vs Ukulele Isolation
const pmUku = new ProgressManager({
    storage: mockStorage,
    storageKey: "yousician_ukulele_progress_v1",
    curriculum: UKULELE_CURRICULUM,
    ranks: UKULELE_RANKS,
    achievements: UKULELE_ACHIEVEMENT_DEFINITIONS,
    instrument: "ukulele"
});
pmUku.recordPartCompletion("uku_l1_1_p1", { accuracy: 96, score: 1800, mode: "flow", playedAt: "2026-11-12T14:00:00Z" });
pmUku.recordSongCompletion("wise_men_say", { accuracy: 91, score: 9000, mode: "flow", playedAt: "2026-11-12T14:05:00Z" });
const pmPianoReload = new ProgressManager({ storage: mockStorage, curriculum: PIANO_CURRICULUM });
if (pmPianoReload.isPartCompleted("uku_l1_1_p1") || !pmUku.isPartCompleted("uku_l1_1_p1") || pmUku.getSummary().rank.title !== "Open-String Novice") {
    throw new Error("ProgressManager Piano/Ukulele isolation check failed");
}
if (pmUku.getSongProgress("wise_men_say").bestAccuracy !== 91 || pmPianoReload.getSongProgress("wise_men_say").bestAccuracy !== 94) {
    throw new Error("Piano and Ukulele song progress collided on wise_men_say");
}
print("PASS ProgressManager Piano vs Ukulele Isolation & Ukulele Ranks verification.");
EOF
"$JSC" -m "$TMP_DIR/regression_suite.mjs"

echo "=== [4/5] Checking Local HTTP Server & Concurrent ES-Module Fetch (if running on :8080) ==="
python3 - << 'PYEOF'
from concurrent.futures import ThreadPoolExecutor
import urllib.request

routes = [
    "/",
    "/style.css",
    "/api/dataset/summary",
    "/api/dataset/ukulele/summary",
    "/api/songs",
    "/js/app.js",
    "/js/curriculum/index.js",
    "/js/curriculum/levels_1_to_4.js",
    "/js/curriculum/levels_5_to_9.js",
    "/js/audio/backing_track.js",
    "/js/audio/synth.js",
    "/js/audio/ukulele_synth.js",
    "/js/audio/ukulele_detector.js",
    "/js/audio/ukulele_profile.js",
    "/js/ukulele/chords.js",
    "/js/ukulele/arranger.js",
    "/js/ukulele/curriculum.js",
    "/js/ukulele/renderer.js",
    "/js/ukulele/fretboard.js",
    "/js/trainer/ukulele_curriculum.js",
    "/js/engine/game.js",
    "/js/gamification/progress.js",
]

def fetch_route(route):
    url = f"http://127.0.0.1:8080{route}"
    with urllib.request.urlopen(url, timeout=3.0) as r:
        body = r.read()
        if r.status != 200 or len(body) == 0:
            raise RuntimeError(f"Unexpected HTTP {r.status} (len={len(body)}) on {url}")
    return route

try:
    # Probe root first to see if server is up
    fetch_route("/")
    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(fetch_route, routes))
    print(f"HTTP 200 OK across all {len(routes)} concurrent endpoints on http://127.0.0.1:8080")
except urllib.error.URLError as e:
    print(f"Note: server.py is not currently running on :8080 ({e}). Start with: python3 server.py 8080")
PYEOF

echo "=== [5/5] Verifying README.md, Global Skill & Repo agent-skills/ Mirror Synchronization ==="
python3 - "$APP_DIR" "$SKILL_DIR" "$REPO_SKILL_DIR" << 'PYEOF'
import os
import sys
from pathlib import Path

app_dir = Path(sys.argv[1])
skill_dir = Path(sys.argv[2])
repo_skill_dir = Path(sys.argv[3])

code_files = [
    app_dir / "index.html",
    app_dir / "style.css",
    app_dir / "server.py",
    *app_dir.glob("docs/*.md"),
    *app_dir.glob("js/**/*.js"),
    *app_dir.glob("scripts/*.py"),
]
code_files = [p for p in code_files if p.exists()]
newest_code = max(code_files, key=lambda p: p.stat().st_mtime)
newest_code_mtime = newest_code.stat().st_mtime

readme_path = app_dir / "README.md"
readme_mtime = readme_path.stat().st_mtime if readme_path.exists() else 0.0

skill_docs = [skill_dir / "SKILL.md", *skill_dir.glob("references/*.md")]
skill_docs = [p for p in skill_docs if p.exists()]
newest_skill_mtime = max((p.stat().st_mtime for p in skill_docs), default=0.0)

errors = []
# Allow a 2-second filesystem granularity tolerance when updated in the same batch
if newest_code_mtime - readme_mtime > 2.0:
    errors.append(
        f"README.md is older than modified source file '{newest_code.relative_to(app_dir)}'. "
        f"Update /Users/ojus/official/piano-app/README.md to reflect your changes."
    )
if newest_code_mtime - newest_skill_mtime > 2.0:
    errors.append(
        f"Global skill docs (~/.gemini/config/skills/learn-music/) are older than "
        f"modified source file '{newest_code.relative_to(app_dir)}'. "
        f"Update SKILL.md and/or references/*.md to reflect your changes."
    )

# Verify byte-for-byte mirror between ~/.gemini/config/skills/learn-music and repo agent-skills/learn-music
IGNORED_NAMES = {".DS_Store", "__pycache__"}

def collect_tree(root: Path):
    out = {}
    if not root.exists():
        return out
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(part in IGNORED_NAMES for part in rel.parts):
            continue
        if p.is_file():
            out[str(rel)] = p
    return out

if not skill_dir.exists():
    errors.append(f"Missing global skill directory: {skill_dir}")
elif not repo_skill_dir.exists():
    errors.append(
        f"Missing repo skill mirror directory: {repo_skill_dir}. "
        f"Sync with: rsync -a --delete --exclude='.DS_Store' --exclude='__pycache__' {skill_dir}/ {repo_skill_dir}/"
    )
else:
    # Ensure no stray ignored artifacts inside repo mirror
    for stray in sorted(repo_skill_dir.rglob("*")):
        if stray.name in IGNORED_NAMES:
            errors.append(f"Stray artifact inside repo skill mirror: {stray.relative_to(app_dir)}")

    global_files = collect_tree(skill_dir)
    repo_files = collect_tree(repo_skill_dir)
    global_keys = set(global_files.keys())
    repo_keys = set(repo_files.keys())

    missing_in_repo = sorted(global_keys - repo_keys)
    extra_in_repo = sorted(repo_keys - global_keys)
    if missing_in_repo:
        errors.append(f"Files missing in {repo_skill_dir}: {missing_in_repo}")
    if extra_in_repo:
        errors.append(f"Extra/out-of-sync files in {repo_skill_dir}: {extra_in_repo}")

    for rel in sorted(global_keys & repo_keys):
        if global_files[rel].read_bytes() != repo_files[rel].read_bytes():
            errors.append(
                f"Skill mirror byte mismatch on '{rel}' between {skill_dir} and {repo_skill_dir}. "
                f"Sync with: rsync -a --delete --exclude='.DS_Store' --exclude='__pycache__' {skill_dir}/ {repo_skill_dir}/"
            )

    repo_verify = repo_skill_dir / "scripts" / "verify_piano_app.sh"
    if repo_verify.exists() and not os.access(repo_verify, os.X_OK):
        errors.append(f"Repo mirror verification script is not executable (+x): {repo_verify}")

if errors:
    for err in errors:
        print("DOC SYNC ERROR:", err)
    sys.exit(1)

print(
    f"PASS: README.md, global skill (~/.gemini/config/skills/learn-music/), "
    f"and repo mirror (agent-skills/learn-music/, {len(repo_files)} files byte-identical) are in sync."
)
PYEOF

echo "=== ALL PIANO APP VERIFICATION CHECKS PASSED ==="
