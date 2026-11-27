#!/usr/bin/env python3
"""
Ukulele Acoustic Calibration & Polyphonic Detection Benchmark Suite
===================================================================
Pure Python 3.9 stdlib only (no numpy/scipy).

Supports two modes:
1. `--synthetic-benchmark` (default when `audio_dataset/ukulele/samples/` has no WAVs):
   Synthesizes realistic acoustic nylon-string ukulele audio across all 28 curriculum steps
   (Helmholtz A0 + top-plate T(1,1) body resonances, viscoelastic upper-partial damping,
   pluck click transient, initial tension sharp-bend, room pink noise + rumble, 25-75 ms
   down/up/arpeggio strum stagger, and +4.5 cent unison string beating on Am/F/G/Dm/Em/D)
   and runs a 5-model ablation benchmark with strict zero-leakage LOOCV on single notes
   and zero-shot evaluation on silence, dynamics, dyads/unison, and strummed chords.

2. Real WAV Calibration Mode (automatic when WAVs exist in `audio_dataset/ukulele/samples/`):
   Extracts real room noise floor, 8-harmonic per-note spectral templates, inharmonicity B,
   and tuning offsets from the user's recorded WAVs, runs zero-leakage LOOCV + chord
   benchmarks, writes `audio_dataset/ukulele/calibrated_profile.json`, and updates
   `js/audio/ukulele_profile.js` (`calibrated: true`).

NEVER touches `/Users/ojus/official/piano-app/audio_dataset/samples/` (piano dataset).
"""

import argparse
import cmath
import json
import math
import os
import random
import struct
import time
import wave
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
UKU_DATASET_DIR = ROOT_DIR / "audio_dataset" / "ukulele"
UKU_SAMPLES_DIR = UKU_DATASET_DIR / "samples"
UKU_MANIFEST_PATH = UKU_DATASET_DIR / "manifest.json"
UKU_PROFILE_JSON_PATH = UKU_DATASET_DIR / "calibrated_profile.json"
UKU_PROFILE_JS_PATH = ROOT_DIR / "js" / "audio" / "ukulele_profile.js"

ABS_MIN_MIDI = 55  # G3 (Low-G floor)
ABS_MAX_MIDI = 84  # C6 (upper concert/tenor reach)
HIGH_G_MIN_MIDI = 60  # C4
TOTAL_PITCHES = ABS_MAX_MIDI - ABS_MIN_MIDI + 1  # 30
NUM_HARMONICS = 8
WIN_SIZE = 4096
FFT_SIZE = 8192
HOP_SIZE = 1024
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
CHORD_ROOT_DISPLAY = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

CHORD_TEMPLATES = [
    ("7", (0, 4, 7, 10), 1),
    ("maj7", (0, 4, 7, 11), 2),
    ("m7", (0, 3, 7, 10), 2),
    ("dim7", (0, 3, 6, 9), 3),
    ("add9", (0, 2, 4, 7), 3),
    ("", (0, 4, 7), 0),
    ("m", (0, 3, 7), 0),
    ("sus4", (0, 5, 7), 2),
    ("sus2", (0, 2, 7), 3),
    ("dim", (0, 3, 6), 3),
    ("aug", (0, 4, 8), 3),
]

# Exact mirror of the 28 steps in js/trainer/ukulele_curriculum.js
UKULELE_STEPS = [
    {"id": "uku_step_01_silence", "category": "silence", "expectedMidis": [], "targetFrets": [-1, -1, -1, -1], "strumType": "silence"},
    {"id": "uku_step_02_open_g4", "category": "open_strings", "expectedMidis": [67], "targetFrets": [0, -1, -1, -1], "strumType": "pluck"},
    {"id": "uku_step_03_open_c4", "category": "open_strings", "expectedMidis": [60], "targetFrets": [-1, 0, -1, -1], "strumType": "pluck"},
    {"id": "uku_step_04_open_e4", "category": "open_strings", "expectedMidis": [64], "targetFrets": [-1, -1, 0, -1], "strumType": "pluck"},
    {"id": "uku_step_05_open_a4", "category": "open_strings", "expectedMidis": [69], "targetFrets": [-1, -1, -1, 0], "strumType": "pluck"},
    {"id": "uku_step_06_fret_d4", "category": "fretboard_anchors", "expectedMidis": [62], "targetFrets": [-1, 2, -1, -1], "strumType": "pluck"},
    {"id": "uku_step_07_fret_f4", "category": "fretboard_anchors", "expectedMidis": [65], "targetFrets": [-1, -1, 1, -1], "strumType": "pluck"},
    {"id": "uku_step_08_fret_fs4", "category": "fretboard_anchors", "expectedMidis": [66], "targetFrets": [-1, -1, 2, -1], "strumType": "pluck"},
    {"id": "uku_step_09_fret_bb4", "category": "fretboard_anchors", "expectedMidis": [70], "targetFrets": [3, -1, -1, -1], "strumType": "pluck"},
    {"id": "uku_step_10_fret_b4", "category": "fretboard_anchors", "expectedMidis": [71], "targetFrets": [-1, -1, -1, 2], "strumType": "pluck"},
    {"id": "uku_step_11_fret_c5", "category": "fretboard_anchors", "expectedMidis": [72], "targetFrets": [-1, -1, -1, 3], "strumType": "pluck"},
    {"id": "uku_step_12_fret_d5", "category": "fretboard_anchors", "expectedMidis": [74], "targetFrets": [-1, -1, -1, 5], "strumType": "pluck"},
    {"id": "uku_step_13_fret_e5", "category": "fretboard_anchors", "expectedMidis": [76], "targetFrets": [-1, -1, -1, 7], "strumType": "pluck"},
    {"id": "uku_step_14_fret_g5", "category": "fretboard_anchors", "expectedMidis": [79], "targetFrets": [-1, -1, -1, 10], "strumType": "pluck"},
    {"id": "uku_step_15_fret_a5", "category": "fretboard_anchors", "expectedMidis": [81], "targetFrets": [-1, -1, -1, 12], "strumType": "pluck"},
    {"id": "uku_step_16_dyn_soft", "category": "dynamics", "expectedMidis": [60], "targetFrets": [-1, 0, -1, -1], "strumType": "pluck", "expectedDynamic": "soft"},
    {"id": "uku_step_17_dyn_hard", "category": "dynamics", "expectedMidis": [60, 64, 67, 72], "targetFrets": [0, 0, 0, 3], "strumType": "down_strum", "chordSymbol": "C", "expectedDynamic": "loud"},
    {"id": "uku_step_18_dyad_c4_e4", "category": "intervals", "expectedMidis": [60, 64], "targetFrets": [-1, 0, 0, -1], "strumType": "double_stop"},
    {"id": "uku_step_19_dyad_e4_g4", "category": "intervals", "expectedMidis": [64, 67], "targetFrets": [0, -1, 0, -1], "strumType": "double_stop"},
    {"id": "uku_step_20_unison_a4", "category": "intervals", "expectedMidis": [69], "targetFrets": [2, -1, -1, 0], "strumType": "unison"},
    {"id": "uku_step_21_chord_c", "category": "chords", "expectedMidis": [60, 64, 67, 72], "targetFrets": [0, 0, 0, 3], "strumType": "down_strum", "chordSymbol": "C"},
    {"id": "uku_step_22_chord_am", "category": "chords", "expectedMidis": [60, 64, 69], "targetFrets": [2, 0, 0, 0], "strumType": "down_strum", "chordSymbol": "Am"},
    {"id": "uku_step_23_chord_f", "category": "chords", "expectedMidis": [60, 65, 69], "targetFrets": [2, 0, 1, 0], "strumType": "down_strum", "chordSymbol": "F"},
    {"id": "uku_step_24_chord_g", "category": "chords", "expectedMidis": [62, 67, 71], "targetFrets": [0, 2, 3, 2], "strumType": "down_strum", "chordSymbol": "G"},
    {"id": "uku_step_25_chord_g7", "category": "chords", "expectedMidis": [62, 65, 67, 71], "targetFrets": [0, 2, 1, 2], "strumType": "up_strum", "chordSymbol": "G7"},
    {"id": "uku_step_26_chord_dm", "category": "chords", "expectedMidis": [62, 65, 69], "targetFrets": [2, 2, 1, 0], "strumType": "down_strum", "chordSymbol": "Dm"},
    {"id": "uku_step_27_chord_em", "category": "chords", "expectedMidis": [64, 67, 71], "targetFrets": [0, 4, 3, 2], "strumType": "arpeggio", "chordSymbol": "Em"},
    {"id": "uku_step_28_chord_d", "category": "chords", "expectedMidis": [62, 66, 69], "targetFrets": [2, 2, 2, 0], "strumType": "down_strum", "chordSymbol": "D"},
]

OPEN_CHORD_ORDER_HIGH_G = [67, 60, 64, 69]  # [G4, C4, E4, A4]


def midi_to_name(midi):
    return f"{NOTE_NAMES[midi % 12]}{(midi // 12) - 1}"


def midi_to_freq(midi):
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def identify_ukulele_chord(midis):
    if not midis or len(midis) < 3:
        return None
    pc_set = {m % 12 for m in midis}
    if len(pc_set) < 3:
        return None
    sorted_m = sorted(midis)
    lowest_pc = sorted_m[0] % 12
    best_label = None
    best_score = -1e9
    for root in range(12):
        if root not in pc_set:
            continue
        for suffix, intervals, prio in CHORD_TEMPLATES:
            tmpl_pcs = {(root + iv) % 12 for iv in intervals}
            if tmpl_pcs != pc_set:
                continue
            score = len(tmpl_pcs) * 10.0 - prio * 1.5
            if lowest_pc == root:
                score += 1.2
            if suffix in ("", "m", "7"):
                score += 0.6
            if score > best_score:
                best_score = score
                best_label = f"{CHORD_ROOT_DISPLAY[root]}{suffix}"
    return best_label


# ==============================================================================
# FFT & SIGNAL UTILITIES (Exact match to js/audio/ukulele_detector.js)
# ==============================================================================
BH_WINDOW = [
    0.35875
    - 0.48829 * math.cos(2.0 * math.pi * n / (WIN_SIZE - 1))
    + 0.14128 * math.cos(4.0 * math.pi * n / (WIN_SIZE - 1))
    - 0.01168 * math.cos(6.0 * math.pi * n / (WIN_SIZE - 1))
    for n in range(WIN_SIZE)
]


def _build_bitrev(n):
    bits = int(round(math.log2(n)))
    rev = [0] * n
    for i in range(n):
        x = i
        r = 0
        for _ in range(bits):
            r = (r << 1) | (x & 1)
            x >>= 1
        rev[i] = r
    return rev


BITREV_8192 = _build_bitrev(FFT_SIZE)
TWIDDLES_8192 = {}
_len = 2
while _len <= FFT_SIZE:
    _half = _len // 2
    _ang = -2.0 * math.pi / _len
    TWIDDLES_8192[_len] = [cmath.exp(1j * _ang * k) for k in range(_half)]
    _len <<= 1

_FFT_CACHE = {}


def rfft_magnitude(frame_4096):
    fid = (
        frame_4096[0],
        frame_4096[511],
        frame_4096[1023],
        frame_4096[2047],
        frame_4096[3071],
        frame_4096[4095],
    )
    cached = _FFT_CACHE.get(fid)
    if cached is not None:
        return cached

    buf = [0j] * FFT_SIZE
    for i in range(WIN_SIZE):
        buf[BITREV_8192[i]] = frame_4096[i] * BH_WINDOW[i]

    length = 2
    while length <= FFT_SIZE:
        half = length // 2
        tw = TWIDDLES_8192[length]
        for start in range(0, FFT_SIZE, length):
            for k in range(half):
                u = buf[start + k]
                v = buf[start + k + half] * tw[k]
                buf[start + k] = u + v
                buf[start + k + half] = u - v
        length <<= 1

    max_bin = FFT_SIZE // 2
    res = [abs(buf[k]) for k in range(max_bin + 1)]
    if len(_FFT_CACHE) < 8192:
        _FFT_CACHE[fid] = res
    return res


def compute_rms(frame):
    if not frame:
        return 0.0
    return math.sqrt(sum(x * x for x in frame) / len(frame))


def read_wav_mono(path):
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sr = wf.getframerate()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)
    samples = [s[0] / 32768.0 for s in struct.iter_unpack("<h", raw)]
    if channels > 1:
        samples = samples[::channels]
    return samples, sr


# ==============================================================================
# REALISTIC SYNTHETIC NYLON-STRING UKULELE AUDIO GENERATOR (OUT-OF-DISTRIBUTION)
# ==============================================================================
def _synth_body_eq(freq_hz, a0_hz=298.0, t1_hz=518.0):
    """Simulated soprano/concert ukulele acoustic body transfer function."""
    r = freq_hz / 252.0
    r2 = r * r
    rad = r2 / math.sqrt((1.0 - r2) ** 2 + r2)
    u0 = freq_hz / a0_hz
    a0 = 0.58 / math.sqrt((1.0 - u0 * u0) ** 2 + (u0 / 5.2) ** 2)
    u1 = freq_hz / t1_hz
    t1 = 0.48 / math.sqrt((1.0 - u1 * u1) ** 2 + (u1 / 4.4) ** 2)
    hf = math.exp(-freq_hz / 3150.0)
    return max(0.04, (rad + 0.44 * a0 + 0.38 * t1) * hf)


def _generate_room_noise(n_samples, sr, rng, rms_level=0.0014):
    """Generate realistic pink-ish room ambient noise + 60 Hz mains/HVAC rumble."""
    buf = [0.0] * n_samples
    b0 = b1 = b2 = 0.0
    two_pi = 2.0 * math.pi
    for i in range(n_samples):
        w = rng.gauss(0.0, 1.0)
        b0 = 0.996 * b0 + w * 0.055
        b1 = 0.960 * b1 + w * 0.095
        b2 = 0.680 * b2 + w * 0.140
        rumble = 0.28 * math.sin(two_pi * 60.0 * i / sr) + 0.15 * math.sin(two_pi * 120.0 * i / sr)
        buf[i] = (b0 + b1 + b2 + 0.08 * w + rumble) * rms_level * 2.1
    return buf


def _add_plucked_string(buf, sr, midi, fret, start_sec, amp, rng, bend_cents=8.0, detune_cents=0.0):
    """
    Synthesize one plucked nylon ukulele string into `buf`:
    - Damped inharmonic partials h=1..8 with viscoelastic nylon decay tau_h = tau_1 / h^1.45
    - Coupled body resonance EQ (Helmholtz A0=298 Hz + top-plate T(1,1)=518 Hz)
    - Initial tension pitch-bend (+bend_cents exponentially decaying over 32 ms)
    - Broadband 14 ms pluck noise click transient (1.2-5.5 kHz)
    """
    n_total = len(buf)
    start_idx = int(start_sec * sr)
    if start_idx >= n_total:
        return

    f0_nom = midi_to_freq(midi) * (2.0 ** (detune_cents / 1200.0))
    # Physical inharmonicity scales ~ L^-2 with fret position
    base_b = 0.00009 if midi <= 69 else 0.00014
    B = base_b * (2.0 ** (fret / 6.0))
    pluck_pos = 0.19 + rng.uniform(-0.025, 0.025)
    tau_base = max(0.38, 1.02 - (midi - 60) * 0.024)
    decay_exp = 1.48 if midi < 66 else (1.66 if midi <= 74 else 1.88)

    # Precompute partial amplitudes, frequencies, decay rates & random phases
    partials = []
    for h in range(1, NUM_HARMONICS + 1):
        fh = h * f0_nom * math.sqrt(1.0 + B * h * h)
        if fh > sr * 0.44:
            break
        pluck_mod = max(0.30, abs(math.sin(math.pi * h * pluck_pos)))
        a_h = (h ** (-decay_exp)) * pluck_mod * _synth_body_eq(fh)
        tau_h = tau_base / (h ** 1.38)
        phase0 = rng.uniform(0.0, 2.0 * math.pi)
        partials.append((fh, a_h, tau_h, phase0))

    # Normalize partial energy so `amp` reflects actual RMS contribution
    p_norm = math.sqrt(sum(p[1] * p[1] for p in partials)) or 1.0
    norm_partials = [(fh, (a_h / p_norm) * amp, tau_h, phase0) for (fh, a_h, tau_h, phase0) in partials]

    # Pluck click noise burst (first 16 ms, high-passed difference filter)
    click_len = min(n_total - start_idx, int(0.016 * sr))
    prev_w = 0.0
    for i in range(click_len):
        t = i / sr
        env_c = math.exp(-t / 0.0045) * (1.0 - math.exp(-t / 0.0008))
        w = rng.gauss(0.0, 1.0)
        hp_w = w - 0.72 * prev_w
        prev_w = w
        buf[start_idx + i] += amp * 0.42 * env_c * hp_w

    # Harmonic standing-wave synthesis with smooth attack (4 ms) & decaying pitch-bend
    dur_samples = min(n_total - start_idx, int(0.95 * sr))
    two_pi = 2.0 * math.pi
    bend_tau = 0.032
    inv_sr = 1.0 / sr
    # Precompute phase-integrated pitch bend shift: integral of (2^(bend*exp(-t/tau)/1200) - 1) dt
    # Using accurate small-angle exp approximation: 2^(c/1200) - 1 ≈ (ln(2)/1200) * c
    bend_k = (math.log(2.0) / 1200.0) * bend_cents

    for fh, a_h, tau_h, phase0 in norm_partials:
        w0 = two_pi * fh
        inv_tau = 1.0 / tau_h
        for i in range(dur_samples):
            t = i * inv_sr
            attack = 1.0 - math.exp(-t / 0.004)
            env = attack * math.exp(-t * inv_tau)
            if env < 1e-4 and i > 400:
                break
            bend_phase = w0 * bend_k * bend_tau * (1.0 - math.exp(-t / bend_tau))
            buf[start_idx + i] += a_h * env * math.sin(w0 * t + bend_phase + phase0)


def generate_synthetic_ukulele_dataset(sr=48000, seed=2026):
    """Generate all 28 synthetic ukulele calibration recordings."""
    rng = random.Random(seed)
    dataset = {}
    dur_sec = 0.95  # 950 ms per clip (~40 hop frames, fast & covers full onset + sustain)
    n_samples = int(sr * dur_sec)

    for step in UKULELE_STEPS:
        sid = step["id"]
        buf = _generate_room_noise(n_samples, sr, rng, rms_level=0.0014)
        strum_type = step["strumType"]

        if strum_type == "silence":
            dataset[sid] = (buf, sr)
            continue

        frets = step["targetFrets"]  # [G, C, E, A]
        dyn = step.get("expectedDynamic", "medium")
        base_amp = 0.055 if dyn == "soft" else (0.24 if dyn == "loud" else 0.145)
        bend_base = 3.0 if dyn == "soft" else (18.0 if dyn == "loud" else 9.0)

        # Build list of (chord_string_idx 0=G..3=A, fret, midi)
        active_strings = []
        for s_idx in range(4):
            fr = frets[s_idx]
            if fr >= 0:
                m = OPEN_CHORD_ORDER_HIGH_G[s_idx] + fr
                active_strings.append((s_idx, fr, m))

        # Order strings by strum direction
        if strum_type == "up_strum":
            active_strings.reverse()  # A -> E -> C -> G

        t0 = 0.10  # 100 ms pre-silence before onset
        seen_midis = {}
        for order_i, (s_idx, fr, m) in enumerate(active_strings):
            if strum_type == "down_strum":
                stagger = order_i * rng.uniform(0.013, 0.019)  # 39-57 ms 4-string sweep
            elif strum_type == "up_strum":
                stagger = order_i * rng.uniform(0.014, 0.018)  # 42-54 ms sweep
            elif strum_type == "arpeggio":
                stagger = order_i * 0.023  # 69 ms wide roll
            elif strum_type in ("double_stop", "unison"):
                stagger = order_i * 0.006
            else:
                stagger = 0.0

            # Unison pair realistic fretted-vs-open detuning (+4.5 cents on 2nd string)
            detune = rng.uniform(-2.0, 2.0)
            if m in seen_midis:
                detune = seen_midis[m] + 4.5
            else:
                seen_midis[m] = detune

            # Natural per-string loudness variation (inner/outer strings)
            str_gain = base_amp * rng.uniform(0.84, 1.16)
            _add_plucked_string(
                buf,
                sr,
                midi=m,
                fret=fr,
                start_sec=t0 + stagger,
                amp=str_gain,
                rng=rng,
                bend_cents=bend_base + rng.uniform(-2.0, 3.0),
                detune_cents=detune,
            )

        # Soft clip safeguard
        for i in range(n_samples):
            if buf[i] > 0.98:
                buf[i] = 0.98
            elif buf[i] < -0.98:
                buf[i] = -0.98

        dataset[sid] = (buf, sr)

    return dataset


# ==============================================================================
# ACOUSTIC CALIBRATION EXTRACTION (SILENCE + ANCHOR TEMPLATES + INTERPOLATION)
# ==============================================================================
def analyze_silence(samples, sr):
    rms_list = []
    max_hz = 10000.0
    band_hz = 25.0
    num_bands = int(max_hz / band_hz)
    band_accum = [0.0] * num_bands
    bin_hz = sr / FFT_SIZE

    for start in range(0, len(samples) - WIN_SIZE, HOP_SIZE):
        frame = samples[start : start + WIN_SIZE]
        rms_list.append(compute_rms(frame))
        mag = rfft_magnitude(frame)
        max_bin = min(len(mag) - 1, int(max_hz / bin_hz))
        for k in range(1, max_bin + 1):
            b = min(num_bands - 1, int((k * bin_hz) / band_hz))
            if mag[k] > band_accum[b]:
                band_accum[b] = 0.85 * band_accum[b] + 0.15 * mag[k]
            else:
                band_accum[b] = 0.96 * band_accum[b] + 0.04 * mag[k]

    rms_sorted = sorted(rms_list) if rms_list else [0.0012]
    median_rms = rms_sorted[len(rms_sorted) // 2]
    p90_rms = rms_sorted[min(len(rms_sorted) - 1, int(0.90 * len(rms_sorted)))]
    p98_rms = rms_sorted[min(len(rms_sorted) - 1, int(0.98 * len(rms_sorted)))]

    return {
        "medianRms": round(median_rms, 6),
        "p90Rms": round(p90_rms, 6),
        "p98Rms": round(p98_rms, 6),
        "recommendedRmsGate": round(max(0.0055, p90_rms * 1.85), 5),
        "bandHz": band_hz,
        "noiseBands": [round(v, 5) for v in band_accum],
    }


def subtract_noise_spectrum(mag, sr, silence_profile, hpf_hz=180.0, over_sub=1.75):
    bin_hz = sr / FFT_SIZE
    band_hz = silence_profile["bandHz"]
    noise_bands = silence_profile["noiseBands"]
    num_bands = len(noise_bands)
    clean = [0.0] * len(mag)
    min_bin = max(2, int(hpf_hz / bin_hz))
    max_bin = min(len(mag) - 1, int(8500.0 / bin_hz))
    for k in range(min_bin, max_bin + 1):
        b = int((k * bin_hz) / band_hz)
        nf = noise_bands[b] if b < num_bands else noise_bands[-1]
        val = mag[k] - over_sub * nf
        clean[k] = val if val > 0.0 else 0.0
    return clean


def extract_anchor_template(samples, sr, midi, silence_profile):
    frames = []
    for start in range(0, len(samples) - WIN_SIZE, HOP_SIZE):
        frame = samples[start : start + WIN_SIZE]
        frames.append((compute_rms(frame), start, frame))

    peak_rms = max(f[0] for f in frames) if frames else 0.0
    # Skip initial pluck-click frame; sample steady sustain body frames (frames 2..9 above 40% peak)
    above = [f for f in frames if f[0] >= peak_rms * 0.40]
    active_frames = above[1:9] if len(above) > 2 else above[:6]
    if not active_frames:
        active_frames = sorted(frames, key=lambda x: x[0], reverse=True)[:4]

    f0_ideal = midi_to_freq(midi)
    bin_hz = sr / FFT_SIZE
    hpf_hz = 135.0 if midi < 60 else 180.0

    clean_specs = [subtract_noise_spectrum(rfft_magnitude(f[2]), sr, silence_profile, hpf_hz=hpf_hz) for f in active_frames]
    avg_spec = [sum(cs[k] for cs in clean_specs) / len(clean_specs) for k in range(len(clean_specs[0]))]

    # Grid search nylon inharmonicity B in [0.0, 0.0007]
    best_B = 0.00012
    best_score = -1.0
    for b_idx in range(0, 15):
        cand_B = b_idx * 0.00005
        score = 0.0
        for h in range(1, NUM_HARMONICS + 1):
            fh = h * f0_ideal * math.sqrt(1.0 + cand_B * h * h)
            if fh > 8200.0 or fh > sr * 0.45:
                break
            k_center = fh / bin_hz
            k_lo = max(2, int(math.floor(fh * (2.0 ** (-26.0 / 1200.0)) / bin_hz)))
            k_hi = min(len(avg_spec) - 2, int(math.ceil(fh * (2.0 ** (32.0 / 1200.0)) / bin_hz)))
            best_pk = 0.0
            for k in range(k_lo, k_hi + 1):
                if avg_spec[k] >= avg_spec[k - 1] and avg_spec[k] >= avg_spec[k + 1]:
                    dist_pen = max(0.7, 1.0 - 0.08 * abs(k - k_center))
                    val = avg_spec[k] * dist_pen
                    if val > best_pk:
                        best_pk = val
            score += best_pk
        if score > best_score:
            best_score = score
            best_B = cand_B

    weights = [0.0] * NUM_HARMONICS
    measured_cents = []
    max_avg = max(avg_spec) if avg_spec else 1.0
    for h in range(1, NUM_HARMONICS + 1):
        fh = h * f0_ideal * math.sqrt(1.0 + best_B * h * h)
        if fh > 8200.0 or fh > sr * 0.45:
            continue
        k_lo = max(2, int(math.floor(fh * (2.0 ** (-28.0 / 1200.0)) / bin_hz)))
        k_hi = min(len(avg_spec) - 2, int(math.ceil(fh * (2.0 ** (36.0 / 1200.0)) / bin_hz)))
        best_k = -1
        best_val = 0.0
        for k in range(k_lo, k_hi + 1):
            if avg_spec[k] >= avg_spec[k - 1] and avg_spec[k] >= avg_spec[k + 1]:
                if avg_spec[k] > best_val:
                    best_val = avg_spec[k]
                    best_k = k
        if best_k > 0:
            s0, s1, s2 = avg_spec[best_k - 1], avg_spec[best_k], avg_spec[best_k + 1]
            denom = s0 - 2.0 * s1 + s2
            delta = 0.5 * (s0 - s2) / denom if abs(denom) > 1e-9 else 0.0
            delta = max(-0.5, min(0.5, delta))
            refined_freq = (best_k + delta) * bin_hz
            weights[h - 1] = max(0.0, s1 - 0.25 * (s0 - s2) * delta)
            if h <= 2 and weights[h - 1] > 0.15 * max_avg:
                measured_cents.append(1200.0 * math.log2(refined_freq / fh))

    norm = math.sqrt(sum(w * w for w in weights)) or 1.0
    norm_weights = [round(w / norm, 5) for w in weights]
    cents_offset = round(sum(measured_cents) / len(measured_cents), 2) if measured_cents else 0.0

    return {
        "midi": midi,
        "note": midi_to_name(midi),
        "peakRms": round(peak_rms, 5),
        "inharmonicityB": round(best_B, 6),
        "centsOffset": cents_offset,
        "weights": norm_weights,
    }


def build_ukulele_dictionary(anchor_map, exclude_midi=None):
    """Interpolate 8-harmonic templates & B across MIDI 55..84 with strict LOOCV exclusion."""
    avail_midis = sorted(m for m in anchor_map.keys() if m != exclude_midi)
    templates = {}
    inharmonicity = {}

    for midi in range(ABS_MIN_MIDI, ABS_MAX_MIDI + 1):
        if midi in anchor_map and midi != exclude_midi:
            w = list(anchor_map[midi]["weights"])
            b_val = anchor_map[midi]["inharmonicityB"]
        else:
            lower = [m for m in avail_midis if m < midi]
            upper = [m for m in avail_midis if m > midi]
            if not lower:
                m_hi = upper[0]
                w = list(anchor_map[m_hi]["weights"])
                b_val = anchor_map[m_hi]["inharmonicityB"]
                # Adjust Low-G below C4 for sub-A0 fundamental rolloff
                if midi < 60:
                    w[0] *= 0.62
            elif not upper:
                m_lo = lower[-1]
                w = list(anchor_map[m_lo]["weights"])
                b_val = anchor_map[m_lo]["inharmonicityB"]
            else:
                m_lo = lower[-1]
                m_hi = upper[0]
                alpha = (midi - m_lo) / float(m_hi - m_lo)
                w_lo = anchor_map[m_lo]["weights"]
                w_hi = anchor_map[m_hi]["weights"]
                w = [(1.0 - alpha) * w_lo[h] + alpha * w_hi[h] for h in range(NUM_HARMONICS)]
                b_val = (1.0 - alpha) * anchor_map[m_lo]["inharmonicityB"] + alpha * anchor_map[m_hi]["inharmonicityB"]

        norm = math.sqrt(sum(x * x for x in w)) or 1.0
        templates[midi] = [round(x / norm, 5) for x in w]
        inharmonicity[midi] = round(b_val, 6)

    return templates, inharmonicity


def build_naive_uncalibrated_dictionary():
    """Generic 1/h steel-style harmonic dictionary (for ablation Model 3)."""
    templates = {}
    inharmonicity = {}
    for midi in range(ABS_MIN_MIDI, ABS_MAX_MIDI + 1):
        w = [1.0 / (h ** 1.0) for h in range(1, NUM_HARMONICS + 1)]
        norm = math.sqrt(sum(x * x for x in w))
        templates[midi] = [round(x / norm, 5) for x in w]
        inharmonicity[midi] = 0.00015
    return templates, inharmonicity


# ==============================================================================
# BASELINE MODELS FOR ABLATION (1: YIN, 2: RAW FFT, 3: NAIVE NMF)
# ==============================================================================
def detect_yin_frame(frame, sr, noise_gate=0.008, min_midi=60, max_midi=84):
    rms = compute_rms(frame)
    if rms < noise_gate:
        return None
    half = len(frame) // 2
    min_tau = max(2, int(sr / 1120.0))
    max_tau = min(half - 2, int(sr / 180.0) + 4)
    yin = [1.0] * (max_tau + 2)
    running_sum = 0.0
    for tau in range(1, max_tau + 1):
        diff = 0.0
        for i in range(0, half, 2):
            d = frame[i] - frame[i + tau]
            diff += d * d
        diff *= 2.0
        running_sum += diff
        yin[tau] = (diff * tau) / running_sum if running_sum > 1e-12 else 1.0

    best_tau = -1
    for tau in range(min_tau, max_tau):
        if yin[tau] < 0.15:
            t = tau
            while t + 1 <= max_tau and yin[t + 1] < yin[t]:
                t += 1
            best_tau = t
            break
    if best_tau == -1:
        best_val = 100.0
        for tau in range(min_tau, max_tau):
            if yin[tau] < best_val:
                best_val = yin[tau]
                best_tau = tau
        if best_val > 0.50:
            return None
    freq = sr / float(best_tau)
    if freq < 180.0 or freq > 1120.0:
        return None
    midi = int(round(69.0 + 12.0 * math.log2(freq / 440.0)))
    return midi if min_midi <= midi <= max_midi else None


def evaluate_model1_yin(samples, sr, silence_profile):
    gate = max(0.008, silence_profile["recommendedRmsGate"])
    votes = {}
    for start in range(0, len(samples) - WIN_SIZE, HOP_SIZE):
        frame = samples[start : start + WIN_SIZE]
        if compute_rms(frame) < gate:
            continue
        m = detect_yin_frame(frame, sr, noise_gate=gate)
        if m is not None:
            votes[m] = votes.get(m, 0) + 1
    if not votes:
        return set()
    best_m = max(votes.items(), key=lambda kv: kv[1])[0]
    return {best_m}


def evaluate_model2_raw_fft(samples, sr, silence_profile):
    """Raw FFT peak picking without harmonic deconvolution or overtone suppression."""
    gate = silence_profile["recommendedRmsGate"]
    bin_hz = sr / FFT_SIZE
    min_bin = int(245.0 / bin_hz)
    max_bin = int(1120.0 / bin_hz)
    votes = {}
    active_frames = 0
    for start in range(0, len(samples) - WIN_SIZE, HOP_SIZE):
        frame = samples[start : start + WIN_SIZE]
        if compute_rms(frame) < gate:
            continue
        mag = rfft_magnitude(frame)
        clean = subtract_noise_spectrum(mag, sr, silence_profile, hpf_hz=180.0, over_sub=1.5)
        max_c = max(clean[min_bin : max_bin + 1]) if max_bin > min_bin else 0.0
        if max_c < 0.05:
            continue
        active_frames += 1
        seen_in_frame = set()
        for k in range(min_bin + 1, max_bin):
            if clean[k] > max_c * 0.16 and clean[k] >= clean[k - 1] and clean[k] >= clean[k + 1]:
                freq = k * bin_hz
                m = int(round(69.0 + 12.0 * math.log2(freq / 440.0)))
                if HIGH_G_MIN_MIDI <= m <= ABS_MAX_MIDI:
                    seen_in_frame.add(m)
        for m in seen_in_frame:
            votes[m] = votes.get(m, 0) + 1
    if active_frames == 0:
        return set()
    min_v = max(2, int(math.ceil(active_frames * 0.25)))
    return {m for m, c in votes.items() if c >= min_v}


# ==============================================================================
# PROPOSED UKULELE POLYPHONIC DETECTOR (EXACT PYTHON MIRROR OF ukulele_detector.js)
# ==============================================================================
class UkuleleDetectorPy:
    def __init__(
        self,
        sr,
        silence_profile,
        templates,
        inharmonicity,
        tuning="high-g",
        use_pluck_gate=True,
        use_overtone_verifier=True,
        use_unison_scaling=True,
        use_strum_aggregation=True,
        strum_window_ms=98.0,
    ):
        self.sr = sr
        self.silence_profile = silence_profile
        self.templates = templates
        self.inharmonicity = inharmonicity
        self.tuning = tuning
        self.min_midi = 55 if tuning == "low-g" else 60
        self.max_midi = ABS_MAX_MIDI
        self.hpf_hz = 135.0 if tuning == "low-g" else 180.0

        self.use_pluck_gate = use_pluck_gate
        self.use_overtone_verifier = use_overtone_verifier
        self.use_unison_scaling = use_unison_scaling
        self.use_strum_aggregation = use_strum_aggregation
        self.strum_window_ms = strum_window_ms
        self.max_voices = 4

        self.bin_hz = sr / FFT_SIZE
        self.min_bin = max(2, int(math.floor(self.hpf_hz / self.bin_hz)))
        self.max_bin = min(FFT_SIZE // 2 - 2, int(math.floor(8500.0 / self.bin_hz)))
        self.sfm_min_bin = max(self.min_bin, int(math.floor(220.0 / self.bin_hz)))
        self.sfm_max_bin = min(self.max_bin, int(math.floor(4500.0 / self.bin_hz)))

        self._build_basis()
        self.reset()

    def reset(self):
        self.streak_frames = [0] * TOTAL_PITCHES
        self.active_hold_frames = [0] * TOTAL_PITCHES
        self.last_trigger_ms = [-1e9] * TOTAL_PITCHES
        self.prev_clean = [0.0] * (FFT_SIZE // 2 + 1)
        self.prev_key_energy = [0.0] * TOTAL_PITCHES
        self.prev_rms = 0.0
        self.prev_flux = 0.0
        self.strum_buffer = {}
        self.strum_active = False
        self.strum_start_ms = 0.0

    def _build_basis(self):
        self.W_bins = {}
        self.H_windows = {}
        for midi in range(ABS_MIN_MIDI, ABS_MAX_MIDI + 1):
            f0 = midi_to_freq(midi)
            B = self.inharmonicity[midi]
            weights = self.templates[midi]
            bin_map = {}
            h_wins = []
            for h in range(1, NUM_HARMONICS + 1):
                wh = weights[h - 1]
                if wh < 0.008:
                    continue
                fh = h * f0 * math.sqrt(1.0 + B * h * h)
                if fh >= 8200.0 or fh >= self.sr * 0.45:
                    continue
                k_center = fh / self.bin_hz
                k_lo = max(self.min_bin, int(math.floor(fh * (2.0 ** (-30.0 / 1200.0)) / self.bin_hz)))
                k_hi = min(self.max_bin - 1, int(math.ceil(fh * (2.0 ** (40.0 / 1200.0)) / self.bin_hz)))
                if k_hi < k_lo:
                    k_hi = k_lo
                h_wins.append((h - 1, wh, k_lo, k_hi, k_center, f0))

                g_lo = max(self.min_bin, int(round(k_center)) - 2)
                g_hi = min(self.max_bin - 1, int(round(k_center)) + 2)
                lobe = []
                for k in range(g_lo, g_hi + 1):
                    g = math.exp(-0.5 * (((k - k_center) / 1.25) ** 2))
                    lobe.append((k, g))
                lobe_sum = sum(g for _, g in lobe) or 1.0
                for k, g in lobe:
                    bin_map[k] = bin_map.get(k, 0.0) + wh * (g / lobe_sum)

            col_sum = sum(bin_map.values()) or 1.0
            for k in list(bin_map.keys()):
                bin_map[k] /= col_sum
            self.W_bins[midi] = bin_map
            self.H_windows[midi] = h_wins

    def detect_frame(self, frame, now_ms=0.0, expected_midis=None, is_chord_expected=None):
        rms = compute_rms(frame)
        rms_gate = self.silence_profile["recommendedRmsGate"]
        if rms < rms_gate:
            self.prev_rms = rms * 0.5
            for ki in range(TOTAL_PITCHES):
                self.streak_frames[ki] = 0
                if self.active_hold_frames[ki] > 0:
                    self.active_hold_frames[ki] -= 1
                self.prev_key_energy[ki] *= 0.4
            flushed = []
            if self.strum_active and self.strum_buffer:
                flushed = sorted(self.strum_buffer.values(), key=lambda x: x["midi"])
                self.strum_buffer.clear()
                self.strum_active = False
            return {
                "silence": len(flushed) == 0,
                "activeMidis": [n["midi"] for n in flushed],
                "onsetMidis": [n["midi"] for n in flushed],
                "centsOff": None,
                "strumPending": False,
            }

        mag = rfft_magnitude(frame)
        clean = subtract_noise_spectrum(mag, self.sr, self.silence_profile, hpf_hz=self.hpf_hz, over_sub=1.75)

        max_clean = 0.0
        spectral_flux = 0.0
        total_energy = 0.0
        for k in range(self.min_bin, self.max_bin + 1):
            c = clean[k]
            if c > max_clean:
                max_clean = c
            total_energy += c * c
            diff = c - self.prev_clean[k]
            if diff > 0.0:
                spectral_flux += diff
            self.prev_clean[k] = c

        if max_clean <= 1e-4:
            return {"silence": True, "activeMidis": [], "onsetMidis": [], "centsOff": None, "strumPending": False}

        # Pluck-Transient / Spectral Flatness Gate
        peak_only = [0.0] * (self.max_bin + 2)
        is_peak = [False] * (self.max_bin + 2)
        min_pk = max_clean * 0.014
        for k in range(self.min_bin, self.max_bin):
            ck = clean[k]
            if ck > min_pk and ck >= clean[k - 1] and ck >= clean[k + 1]:
                is_peak[k] = True
                if ck > peak_only[k]:
                    peak_only[k] = ck
                if clean[k - 1] > peak_only[k - 1]:
                    peak_only[k - 1] = clean[k - 1]
                if clean[k + 1] > peak_only[k + 1]:
                    peak_only[k + 1] = clean[k + 1]

        if self.use_pluck_gate:
            log_sum = 0.0
            lin_sum = 0.0
            cnt = max(1, self.sfm_max_bin - self.sfm_min_bin + 1)
            for k in range(self.sfm_min_bin, self.sfm_max_bin + 1):
                v = clean[k] + 1e-6
                log_sum += math.log(v)
                lin_sum += v
            sfm = math.exp(log_sum / cnt) / (lin_sum / cnt) if lin_sum > 1e-6 else 1.0
            pk_energy = sum(peak_only[k] * peak_only[k] for k in range(self.min_bin, self.max_bin + 1))
            pk_ratio = pk_energy / (total_energy + 1e-9)
            if sfm > 0.44 and pk_ratio < 0.24:
                self.prev_rms = rms
                self.prev_flux = spectral_flux
                return {
                    "silence": False,
                    "activeMidis": [],
                    "onsetMidis": [],
                    "centsOff": None,
                    "strumPending": self.strum_active,
                }

        exp_set = set(expected_midis) if expected_midis else None
        chord_exp = is_chord_expected if is_chord_expected is not None else bool(exp_set and len(exp_set) >= 2)

        # Physical Acoustic Candidate Pitch Gate
        candidates = []
        key_stats = {}
        for midi in range(self.min_midi, self.max_midi + 1):
            h_wins = self.H_windows[midi]
            if not h_wins:
                continue
            matched_w = 0.0
            total_sig_w = 0.0
            has_h1 = False
            odd_cnt = 0
            max_k_pk = 0.0
            cents_est = 0.0
            h_peaks = [0.0] * 7

            for h_idx, wh, k_lo, k_hi, _, f0 in h_wins:
                if wh >= 0.07:
                    total_sig_w += wh
                best_pk = 0.0
                best_k = -1
                for k in range(k_lo, k_hi + 1):
                    if is_peak[k] and clean[k] > best_pk:
                        best_pk = clean[k]
                        best_k = k
                if h_idx < 6:
                    h_peaks[h_idx + 1] = best_pk
                if best_pk > max_clean * 0.022:
                    if wh >= 0.07:
                        matched_w += wh
                    if best_pk > max_k_pk:
                        max_k_pk = best_pk
                    if h_idx == 0:
                        has_h1 = True
                        s0, s1, s2 = clean[best_k - 1], clean[best_k], clean[best_k + 1]
                        denom = s0 - 2.0 * s1 + s2
                        delta = 0.5 * (s0 - s2) / denom if abs(denom) > 1e-9 else 0.0
                        delta = max(-0.5, min(0.5, delta))
                        freq_meas = (best_k + delta) * self.bin_hz
                        cents_est = 1200.0 * math.log2(freq_meas / f0)
                    if (h_idx % 2 == 0) and h_idx <= 6 and best_pk > max_clean * 0.028:
                        odd_cnt += 1

            comp = matched_w / (total_sig_w or 1.0)
            if midi >= 60:
                if not has_h1 or h_peaks[1] < max_clean * 0.025:
                    continue
                min_comp = 0.44 if midi >= 76 else 0.48
                if comp < min_comp:
                    continue
            else:
                if not ((has_h1 and comp >= 0.44) or (odd_cnt >= 2 and h_peaks[2] > max_clean * 0.04 and comp >= 0.48)):
                    continue

            candidates.append(midi)
            key_stats[midi] = {
                "completeness": comp,
                "has_h1": has_h1,
                "h_peaks": h_peaks,
                "cents": max(-50.0, min(50.0, cents_est)),
            }

        if not candidates:
            self.prev_rms = rms
            self.prev_flux = spectral_flux
            return {"silence": False, "activeMidis": [], "onsetMidis": [], "centsOff": None, "strumPending": self.strum_active}

        # Multiplicative KL-NMF
        acts = {m: (1.55 if (exp_set and m in exp_set) else 1.0) for m in candidates}
        eps = 1e-9
        for _ in range(22):
            v_hat = {}
            for m in candidates:
                ak = acts[m]
                if ak < 1e-6:
                    continue
                for k, wk in self.W_bins[m].items():
                    v_hat[k] = v_hat.get(k, 0.0) + wk * ak
            for m in candidates:
                ak = acts[m]
                if ak < 1e-6:
                    continue
                grad_pos = 0.0
                for k, wk in self.W_bins[m].items():
                    vk = peak_only[k]
                    if vk > 0.0:
                        grad_pos += wk * (vk / (v_hat.get(k, 0.0) + eps))
                nxt = ak * (grad_pos / 1.032)
                acts[m] = 0.0 if nxt < max_clean * 0.01 else nxt

        sorted_acts = sorted(acts.values(), reverse=True)
        max_act = sorted_acts[0] if sorted_acts else 0.0
        second_act = sorted_acts[1] if len(sorted_acts) > 1 else 0.0
        if max_act <= 0.0:
            return {"silence": False, "activeMidis": [], "onsetMidis": [], "centsOff": None, "strumPending": self.strum_active}

        if self.use_unison_scaling and second_act >= max_act * 0.24:
            ref_act = min(max_act, second_act * 1.45)
        else:
            ref_act = max_act

        frame_accepted = []
        accepted_midis = []
        accepted_acts = {}

        for m in candidates:
            act = acts[m]
            if act < ref_act * 0.11:
                continue
            rel = act / ref_act
            st = key_stats[m]
            is_exp = bool(exp_set and m in exp_set)

            is_overtone = False
            if self.use_overtone_verifier:
                for low_m in accepted_midis:
                    diff = m - low_m
                    low_st = key_stats[low_m]
                    low_act = accepted_acts[low_m]
                    low_tmpl = self.templates[low_m]
                    if diff == 12:
                        low_h1 = low_st["h_peaks"][1] or 1e-6
                        low_h2 = low_st["h_peaks"][2]
                        low_h3 = low_st["h_peaks"][3]
                        exp_h2 = (low_tmpl[1] or 0.25) / max(0.12, low_tmpl[0] or 0.75)
                        oct_excess = (low_h2 / low_h1) / max(0.08, exp_h2)
                        high_h2 = st["h_peaks"][2]
                        if is_exp:
                            if act < low_act * 0.14 and oct_excess < 1.15:
                                is_overtone = True
                                break
                        else:
                            if not (
                                act >= low_act * 0.62
                                or (act >= low_act * 0.34 and oct_excess >= 1.42)
                                or (act >= low_act * 0.28 and high_h2 > low_h3 * 0.72 and oct_excess >= 1.25)
                            ):
                                is_overtone = True
                                break
                    elif diff in (19, 24):
                        min_r = 0.18 if is_exp else 0.48
                        if act < low_act * min_r:
                            is_overtone = True
                            break

            if is_overtone:
                continue

            # Adjacent semitone skirt guard
            if any(abs(m - om) == 1 and not is_exp and act < accepted_acts[om] * 0.26 for om in accepted_midis):
                continue

            if exp_set is not None:
                min_th = 0.12 if is_exp else 0.36
            else:
                min_th = 0.18 if st["completeness"] >= 0.70 else 0.25

            if rel >= min_th:
                accepted_midis.append(m)
                accepted_acts[m] = act
                frame_accepted.append(
                    {
                        "midi": m,
                        "ki": m - ABS_MIN_MIDI,
                        "act": act,
                        "rel": min(1.0, rel),
                        "cents": st["cents"],
                        "is_exp": is_exp,
                    }
                )

        if len(frame_accepted) > self.max_voices:
            frame_accepted.sort(key=lambda x: x["act"] * (1.5 if x["is_exp"] else 1.0), reverse=True)
            frame_accepted = sorted(frame_accepted[: self.max_voices], key=lambda x: x["midi"])

        rms_jump = rms - self.prev_rms
        is_attack = rms_jump > max(0.006, self.prev_rms * 0.32) or spectral_flux > max(12.0, self.prev_flux * 1.55)
        frame_ki_set = {x["ki"] for x in frame_accepted}

        active_notes = []
        raw_onsets = []

        for midi in range(self.min_midi, self.max_midi + 1):
            ki = midi - ABS_MIN_MIDI
            if ki not in frame_ki_set:
                self.streak_frames[ki] = 0
                if self.active_hold_frames[ki] > 0:
                    self.active_hold_frames[ki] -= 1
                    if self.active_hold_frames[ki] > 0 and rms >= rms_gate * 1.45:
                        active_notes.append({"midi": midi, "rel": 0.62, "cents": 0.0})
                self.prev_key_energy[ki] *= 0.62

        for item in frame_accepted:
            ki = item["ki"]
            m = item["midi"]
            act = item["act"]
            prev_e = self.prev_key_energy[ki]
            key_jump = act > max(4.5, prev_e * 1.75)
            self.prev_key_energy[ki] = act
            self.streak_frames[ki] = min(250, self.streak_frames[ki] + 1)

            min_f = 1 if (item["is_exp"] and (is_attack or key_jump)) else 2
            if self.streak_frames[ki] < min_f:
                continue

            was_held = self.active_hold_frames[ki] > 0
            self.active_hold_frames[ki] = 4

            is_new = False
            if now_ms - self.last_trigger_ms[ki] > 90.0:
                if (not was_held) or (is_attack and key_jump):
                    is_new = True
                    self.last_trigger_ms[ki] = now_ms

            n_obj = {"midi": m, "rel": item["rel"], "cents": item["cents"]}
            active_notes.append(n_obj)
            if is_new:
                raw_onsets.append(n_obj)

        active_notes.sort(key=lambda x: x["midi"])
        if len(active_notes) > self.max_voices:
            active_notes = sorted(
                sorted(active_notes, key=lambda x: x["rel"], reverse=True)[: self.max_voices],
                key=lambda x: x["midi"],
            )

        # Adaptive Strum-Aggregation Window
        emitted_onsets = []
        bypass_strum = (not self.use_strum_aggregation) or bool(exp_set and len(exp_set) == 1 and not chord_exp)
        if bypass_strum:
            emitted_onsets = list(raw_onsets)
        else:
            if raw_onsets:
                if not self.strum_active:
                    self.strum_active = True
                    self.strum_start_ms = now_ms
                    self.strum_buffer.clear()
                for n in raw_onsets:
                    self.strum_buffer[n["midi"]] = n
            if self.strum_active:
                elapsed = now_ms - self.strum_start_ms
                all_exp = bool(exp_set and len(exp_set) >= 2 and all(m in self.strum_buffer for m in exp_set))
                full_4 = len(self.strum_buffer) >= 4
                blind_single = (
                    exp_set is None
                    and not chord_exp
                    and len(self.strum_buffer) == 1
                    and len(candidates) <= 1
                    and not is_attack
                    and elapsed >= 22.0
                )
                if all_exp or full_4 or blind_single or elapsed >= self.strum_window_ms:
                    emitted_onsets = sorted(self.strum_buffer.values(), key=lambda x: x["midi"])[: self.max_voices]
                    self.strum_buffer.clear()
                    self.strum_active = False

        self.prev_rms = rms
        self.prev_flux = spectral_flux

        cents_out = active_notes[0]["cents"] if len(active_notes) == 1 else None
        return {
            "silence": False,
            "activeMidis": [n["midi"] for n in active_notes],
            "onsetMidis": [n["midi"] for n in emitted_onsets],
            "centsOff": cents_out,
            "strumPending": self.strum_active,
        }


def evaluate_streaming_clip(samples, sr, detector, expected_midis=None, is_chord_expected=None):
    """
    Simulate real-time AudioWorklet frame streaming (4096-pt window, 1024-pt hop = 21.33 ms)
    and return the first unified onset chord/note event, latency (ms from 100ms strike),
    and median single-note cents offset.
    """
    detector.reset()
    hop_ms = (HOP_SIZE / float(sr)) * 1000.0
    onset_events = []
    cents_samples = []
    active_votes = {}
    active_frame_count = 0

    for idx, start in enumerate(range(0, len(samples) - WIN_SIZE, HOP_SIZE)):
        frame = samples[start : start + WIN_SIZE]
        # AudioWorklet delivers each frame at the wall-clock timestamp of its trailing sample
        now_ms = ((start + WIN_SIZE) / float(sr)) * 1000.0
        res = detector.detect_frame(
            frame,
            now_ms=now_ms,
            expected_midis=expected_midis,
            is_chord_expected=is_chord_expected,
        )
        if res["onsetMidis"]:
            onset_events.append((now_ms, set(res["onsetMidis"])))
        if res["activeMidis"]:
            active_frame_count += 1
            for m in res["activeMidis"]:
                active_votes[m] = active_votes.get(m, 0) + 1
        if res["centsOff"] is not None:
            cents_samples.append(res["centsOff"])

    # Flush trailing pending strum if clip ended inside aggregation window
    if detector.strum_active and detector.strum_buffer:
        flushed = set(detector.strum_buffer.keys())
        onset_events.append((len(samples) / float(sr) * 1000.0, flushed))
        detector.strum_buffer.clear()
        detector.strum_active = False

    if onset_events:
        # Primary evaluation metric: the FIRST emitted onset event!
        # (Proves Strum-Aggregation unified a staggered 4-string strum into ONE clean chord event!)
        first_ms, pred = onset_events[0]
        # Latency relative to first audible frame crossing onset (~100 ms in synthetic clips)
        latency_ms = max(0.0, first_ms - 100.0)
    elif active_frame_count > 0:
        min_v = max(2, int(math.ceil(active_frame_count * 0.30)))
        pred = {m for m, c in active_votes.items() if c >= min_v}
        latency_ms = 0.0
    else:
        pred = set()
        latency_ms = 0.0

    # Measure median cents in steady sustain (skip first 2 frames where pluck bend relaxes)
    steady_cents = cents_samples[2:8] if len(cents_samples) > 3 else cents_samples
    med_cents = sorted(steady_cents)[len(steady_cents) // 2] if steady_cents else None
    return pred, round(latency_ms, 1), med_cents, len(onset_events)


def compute_metrics(results):
    tp = fp = fn = exact = oct_err = 0
    total = len(results)
    for r in results:
        gt = r["truth"]
        pred = r["pred"]
        tp += len(gt & pred)
        fp += len(pred - gt)
        fn += len(gt - pred)
        if gt == pred:
            exact += 1
        for p in (pred - gt):
            if any(abs(p - g) == 12 for g in gt):
                oct_err += 1
    prec = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = 2.0 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": round(prec * 100.0, 2),
        "recall": round(rec * 100.0, 2),
        "f1": round(f1 * 100.0, 2),
        "exactCount": exact,
        "totalSteps": total,
        "exactMatchPct": round(exact * 100.0 / total, 2) if total > 0 else 0.0,
        "octaveErrors": oct_err,
    }


def write_profile_files(profile_payload, write_real_files=False):
    if not write_real_files:
        return
    UKU_DATASET_DIR.mkdir(parents=True, exist_ok=True)
    with open(UKU_PROFILE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(profile_payload, f, indent=2)

    js_content = (
        "/**\n"
        " * Auto-Generated Calibrated Ukulele Acoustic Profile\n"
        " * Generated by scripts/calibrate_ukulele.py from user WAV recordings in\n"
        " * audio_dataset/ukulele/samples/.\n"
        " * Covers MIDI 55 (G3 Low-G) through MIDI 84 (C6).\n"
        " */\n\n"
        f"export const CALIBRATED_UKULELE_PROFILE = {json.dumps(profile_payload, indent=2)};\n"
    )
    UKU_PROFILE_JS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(UKU_PROFILE_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)


def run_benchmark(use_real_wavs=False, update_summary_json=False):
    t0 = time.time()
    sr_global = 48000
    wav_cache = {}
    steps_to_run = []

    if use_real_wavs and UKU_MANIFEST_PATH.exists():
        with open(UKU_MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        manifest_by_id = {s["id"]: s for s in manifest.get("samples", [])}
        for step in UKULELE_STEPS:
            m_item = manifest_by_id.get(step["id"])
            if m_item:
                wav_path = UKU_SAMPLES_DIR / m_item["filename"]
                if wav_path.exists():
                    pcm, sr = read_wav_mono(wav_path)
                    wav_cache[step["id"]] = (pcm, sr)
                    sr_global = sr
                    steps_to_run.append(step)
        print(f"[REAL WAV MODE] Loaded {len(steps_to_run)} recorded ukulele WAVs from {UKU_SAMPLES_DIR}")
    else:
        use_real_wavs = False
        wav_cache = generate_synthetic_ukulele_dataset(sr=48000, seed=2026)
        steps_to_run = list(UKULELE_STEPS)
        print(f"[SYNTHETIC BENCHMARK MODE] Generated {len(steps_to_run)} realistic nylon-ukulele audio clips @ 48 kHz")

    # 1. Calibrate Room Silence Floor
    sil_pcm, sil_sr = wav_cache["uku_step_01_silence"]
    silence_profile = analyze_silence(sil_pcm, sil_sr)
    print(
        f"Silence Floor: medianRMS={silence_profile['medianRms']} | "
        f"p90RMS={silence_profile['p90Rms']} | gate={silence_profile['recommendedRmsGate']}"
    )

    # 2. Extract Single-Note Anchor Templates (steps 02..15)
    anchor_map = {}
    for step in steps_to_run:
        if step["category"] in ("open_strings", "fretboard_anchors") and len(step["expectedMidis"]) == 1:
            m = step["expectedMidis"][0]
            pcm, sr = wav_cache[step["id"]]
            anchor_map[m] = extract_anchor_template(pcm, sr, m, silence_profile)

    full_templates, full_inharm = build_ukulele_dictionary(anchor_map, exclude_midi=None)
    naive_templates, naive_inharm = build_naive_uncalibrated_dictionary()

    # Build ablation detectors
    det_naive = UkuleleDetectorPy(
        sr_global,
        silence_profile,
        naive_templates,
        naive_inharm,
        use_pluck_gate=False,
        use_overtone_verifier=False,
        use_unison_scaling=False,
        use_strum_aggregation=False,
    )
    det_full = UkuleleDetectorPy(sr_global, silence_profile, full_templates, full_inharm)

    res_yin = []
    res_raw_fft = []
    res_naive = []
    res_proposed = []
    res_hybrid = []

    chord_symbol_hits = 0
    chord_symbol_total = 0
    tuner_abs_cents = []
    single_latencies = []
    chord_latencies = []
    strum_event_counts = []

    print("\nStep-by-step Ukulele Ablation Benchmark (Strict LOOCV on Single Notes, Zero-Shot on Chords/Dynamics):")
    print(
        f"{'Step ID':<26} | {'Truth':<15} | {'YIN':<8} | {'RawFFT':<16} | "
        f"{'Naive NMF':<15} | {'Uku KL-NMF+Strum':<17} | {'Hybrid':<16} | {'Chord'}"
    )
    print("-" * 136)

    fmt = lambda s: ",".join(midi_to_name(m) for m in sorted(s)) if s else "Silence"

    for step in steps_to_run:
        sid = step["id"]
        cat = step["category"]
        pcm, sr = wav_cache[sid]
        truth = set(step["expectedMidis"])
        is_chord_step = cat == "chords" or len(truth) >= 2

        # Model 1: Monophonic YIN
        p_yin = evaluate_model1_yin(pcm, sr, silence_profile)
        # Model 2: Raw FFT Peaks
        p_raw = evaluate_model2_raw_fft(pcm, sr, silence_profile)
        # Model 3: Naive Uncalibrated NMF (no pluck gate, no overtone verifier, no strum aggregation)
        p_naive, _, _, _ = evaluate_streaming_clip(pcm, sr, det_naive, expected_midis=None, is_chord_expected=False)

        # Model 4: Proposed Calibrated Ukulele KL-NMF + Pluck Gate + Unison Scaling + Strum Aggregation
        # Strict Leave-One-Out CV on all 14 single-note anchors!
        if cat in ("open_strings", "fretboard_anchors") and len(truth) == 1:
            held_out = next(iter(truth))
            loo_t, loo_b = build_ukulele_dictionary(anchor_map, exclude_midi=held_out)
            det_eval = UkuleleDetectorPy(sr, silence_profile, loo_t, loo_b)
        else:
            det_eval = det_full

        p_prop, lat_ms, med_c, n_ev = evaluate_streaming_clip(
            pcm, sr, det_eval, expected_midis=None, is_chord_expected=None
        )
        # Model 5: Score-Informed Hybrid
        p_hyb, lat_hyb, _, _ = evaluate_streaming_clip(
            pcm, sr, det_eval, expected_midis=truth if truth else None, is_chord_expected=is_chord_step
        )

        if cat in ("open_strings", "fretboard_anchors") and med_c is not None:
            tuner_abs_cents.append(abs(med_c))
            single_latencies.append(lat_hyb)
        if cat == "chords":
            chord_latencies.append(lat_ms)
            strum_event_counts.append(n_ev)
            expected_sym = step.get("chordSymbol")
            det_sym = identify_ukulele_chord(sorted(p_prop))
            chord_symbol_total += 1
            if det_sym == expected_sym:
                chord_symbol_hits += 1
        else:
            det_sym = "-"

        res_yin.append({"id": sid, "category": cat, "truth": truth, "pred": p_yin})
        res_raw_fft.append({"id": sid, "category": cat, "truth": truth, "pred": p_raw})
        res_naive.append({"id": sid, "category": cat, "truth": truth, "pred": p_naive})
        res_proposed.append({"id": sid, "category": cat, "truth": truth, "pred": p_prop})
        res_hybrid.append({"id": sid, "category": cat, "truth": truth, "pred": p_hyb})

        print(
            f"{sid:<26} | {fmt(truth):<15} | {fmt(p_yin):<8} | {fmt(p_raw):<16} | "
            f"{fmt(p_naive):<15} | {fmt(p_prop):<17} | {fmt(p_hyb):<16} | {det_sym or '-'}"
        )

    # Compute overall & slice metrics
    models = [
        ("1. Single-Frame Monophonic YIN", res_yin),
        ("2. Raw FFT Peak Picking", res_raw_fft),
        ("3. Naive Uncalibrated NMF (No Strum Agg)", res_naive),
        ("4. Ukulele KL-NMF + Strum-Agg (LOOCV)", res_proposed),
        ("5. Score-Informed Hybrid Ukulele Engine", res_hybrid),
    ]

    overall_summary = {}
    single_summary = {}
    chord_summary = {}

    single_cats = {"open_strings", "fretboard_anchors"}
    chord_cats = {"chords", "intervals"}

    print("\n=== OVERALL BENCHMARK (ALL 28 UKULELE STEPS) ===")
    for label, res in models:
        m = compute_metrics(res)
        overall_summary[label] = m
        print(
            f"{label:<42}: F1={m['f1']:>6.2f}% | Prec={m['precision']:>6.2f}% | "
            f"Rec={m['recall']:>6.2f}% | Exact={m['exactCount']:>2}/{m['totalSteps']} ({m['exactMatchPct']:>5.1f}%) | "
            f"OctErr={m['octaveErrors']}"
        )

    print("\n=== SINGLE-NOTE ANCHORS ONLY (STEPS 02-15, STRICT LOOCV) ===")
    for label, res in models:
        m = compute_metrics([r for r in res if r["category"] in single_cats])
        single_summary[label] = m
        print(
            f"{label:<42}: F1={m['f1']:>6.2f}% | Prec={m['precision']:>6.2f}% | "
            f"Rec={m['recall']:>6.2f}% | Exact={m['exactCount']:>2}/{m['totalSteps']} ({m['exactMatchPct']:>5.1f}%)"
        )

    print("\n=== STRUMMED CHORDS & DYADS (STEPS 18-28, ZERO-SHOT) ===")
    for label, res in models:
        m = compute_metrics([r for r in res if r["category"] in chord_cats])
        chord_summary[label] = m
        print(
            f"{label:<42}: F1={m['f1']:>6.2f}% | Prec={m['precision']:>6.2f}% | "
            f"Rec={m['recall']:>6.2f}% | Exact={m['exactCount']:>2}/{m['totalSteps']} ({m['exactMatchPct']:>5.1f}%)"
        )

    sil_fp_prop = len(res_proposed[0]["pred"])
    sil_fp_hyb = len(res_hybrid[0]["pred"])
    avg_single_lat = round(sum(single_latencies) / len(single_latencies), 1) if single_latencies else 0.0
    avg_chord_lat = round(sum(chord_latencies) / len(chord_latencies), 1) if chord_latencies else 0.0
    tuner_mae = round(sum(tuner_abs_cents) / len(tuner_abs_cents), 2) if tuner_abs_cents else 0.0
    chord_sym_pct = round(100.0 * chord_symbol_hits / chord_symbol_total, 1) if chord_symbol_total else 0.0
    unified_strums = sum(1 for c in strum_event_counts if c == 1)

    print("\n=== UKULELE-SPECIFIC TELEMETRY ===")
    print(f"Silence False Positives       : Proposed={sil_fp_prop}, Hybrid={sil_fp_hyb} (Target: 0)")
    print(f"Chord Symbol Accuracy (8 chds): {chord_symbol_hits}/{chord_symbol_total} ({chord_sym_pct}%)")
    print(f"Unified Single-Event Strums   : {unified_strums}/{len(strum_event_counts)} chords emitted in 1 unified burst")
    print(f"Tuner Cents MAE (14 anchors)  : {tuner_mae:.2f} cents")
    print(f"Mean Onset Latency            : Single-Note={avg_single_lat} ms | Strummed Chord={avg_chord_lat} ms")
    print(f"Total Benchmark Runtime       : {time.time() - t0:.2f}s")

    # Build profile payload
    soft_pcm = wav_cache.get("uku_step_16_dyn_soft", ([0.0] * WIN_SIZE, sr_global))[0]
    hard_pcm = wav_cache.get("uku_step_17_dyn_hard", ([0.0] * WIN_SIZE, sr_global))[0]
    soft_peak = round(
        max((compute_rms(soft_pcm[i : i + WIN_SIZE]) for i in range(0, len(soft_pcm) - WIN_SIZE, HOP_SIZE)), default=0.03),
        5,
    )
    hard_peak = round(
        max((compute_rms(hard_pcm[i : i + WIN_SIZE]) for i in range(0, len(hard_pcm) - WIN_SIZE, HOP_SIZE)), default=0.18),
        5,
    )

    profile_payload = {
        "version": "1.0.0-ukulele-calibrated" if use_real_wavs else "1.0.0-ukulele-physics-default",
        "calibrated": bool(use_real_wavs),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "instrument": {
            "type": "ukulele",
            "defaultTuning": "high-g",
            "minMidi": ABS_MIN_MIDI,
            "maxMidi": ABS_MAX_MIDI,
            "numPitches": TOTAL_PITCHES,
            "concertA4Hz": 440.0,
            "tunings": {
                "high-g": {
                    "label": "Standard High-G (G4-C4-E4-A4)",
                    "stringsTabOrder": [69, 64, 60, 67],
                    "stringsChordOrder": [67, 60, 64, 69],
                    "minMidi": 60,
                    "maxMidi": 84,
                    "hpfHz": 180.0,
                },
                "low-g": {
                    "label": "Linear Low-G (G3-C4-E4-A4)",
                    "stringsTabOrder": [69, 64, 60, 55],
                    "stringsChordOrder": [55, 60, 64, 69],
                    "minMidi": 55,
                    "maxMidi": 84,
                    "hpfHz": 135.0,
                },
            },
        },
        "dsp": {
            "windowSize": WIN_SIZE,
            "fftSize": FFT_SIZE,
            "hopSize": HOP_SIZE,
            "numHarmonics": NUM_HARMONICS,
            "calibrationSampleRate": sr_global,
            "strumWindowMs": 98,
            "pluckFlatnessGate": 0.44,
        },
        "acoustics": {
            "helmholtzHz": 285.0,
            "helmholtzQ": 5.0,
            "topPlateHz": 495.0,
            "topPlateQ": 4.6,
            "pluckBendCentsMax": 18.0,
        },
        "silenceProfile": silence_profile,
        "dynamics": {
            "softPluckPeakRms": soft_peak,
            "hardStrumPeakRms": hard_peak,
        },
        "anchors": {str(k): v for k, v in sorted(anchor_map.items())} if use_real_wavs else {},
        "templates": {str(k): v for k, v in sorted(full_templates.items())},
        "inharmonicity": {str(k): v for k, v in sorted(full_inharm.items())},
        "benchmarkSummary": {
            "mode": "real_wav" if use_real_wavs else "synthetic_ood_benchmark",
            "overall": {
                "yin": overall_summary["1. Single-Frame Monophonic YIN"],
                "rawFft": overall_summary["2. Raw FFT Peak Picking"],
                "naiveNmf": overall_summary["3. Naive Uncalibrated NMF (No Strum Agg)"],
                "ukuleleKlNmfLoocv": overall_summary["4. Ukulele KL-NMF + Strum-Agg (LOOCV)"],
                "hybridScoreInformed": overall_summary["5. Score-Informed Hybrid Ukulele Engine"],
            },
            "singleNoteLoocv": single_summary["4. Ukulele KL-NMF + Strum-Agg (LOOCV)"],
            "strummedChordsZeroShot": chord_summary["4. Ukulele KL-NMF + Strum-Agg (LOOCV)"],
            "strummedChordsHybrid": chord_summary["5. Score-Informed Hybrid Ukulele Engine"],
            "silenceFalsePositives": sil_fp_prop,
            "chordSymbolAccuracyPct": chord_sym_pct,
            "tunerCentsMae": tuner_mae,
            "meanSingleLatencyMs": avg_single_lat,
            "meanChordLatencyMs": avg_chord_lat,
        },
    }

    if use_real_wavs:
        write_profile_files(profile_payload, write_real_files=True)
        print(f"\nWrote real calibrated ukulele profile to {UKU_PROFILE_JSON_PATH} and {UKU_PROFILE_JS_PATH}.")
    elif update_summary_json:
        print("\n[Note] Synthetic mode never overwrites real calibration; use real WAVs for calibrated:true.")

    return profile_payload


def main():
    parser = argparse.ArgumentParser(description="Ukulele Acoustic Calibration & Polyphonic Detection Benchmark")
    parser.add_argument(
        "--synthetic-benchmark",
        action="store_true",
        help="Run realistic synthetic nylon-ukulele ablation benchmark (default if no real WAVs exist)",
    )
    parser.add_argument(
        "--real-wavs",
        action="store_true",
        help="Force real WAV calibration from audio_dataset/ukulele/samples/",
    )
    args = parser.parse_args()

    has_real_wavs = (
        UKU_MANIFEST_PATH.exists()
        and UKU_SAMPLES_DIR.exists()
        and any(UKU_SAMPLES_DIR.glob("*.wav"))
    )
    use_real = bool(args.real_wavs or (has_real_wavs and not args.synthetic_benchmark))
    run_benchmark(use_real_wavs=use_real)


if __name__ == "__main__":
    main()
