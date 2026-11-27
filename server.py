#!/usr/bin/env python3
"""
Yousician Piano App - Local Server
Serves static web files, manages song library, and provides MIDI/Sheet parsing endpoints.
"""

import http.server
import socketserver
import os
import json
import urllib.parse
import mimetypes
import struct
import io
import cgi
import base64
import zipfile
import time
import subprocess
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.join(BASE_DIR, "songs_data")
DATASET_DIR = os.path.join(BASE_DIR, "audio_dataset")
SAMPLES_DIR = os.path.join(DATASET_DIR, "samples")
MANIFEST_PATH = os.path.join(DATASET_DIR, "manifest.json")

# Dedicated Ukulele dataset directories (strictly isolated from Piano audio_dataset/samples/)
UKULELE_DATASET_DIR = os.path.join(DATASET_DIR, "ukulele")
UKULELE_SAMPLES_DIR = os.path.join(UKULELE_DATASET_DIR, "samples")
UKULELE_MANIFEST_PATH = os.path.join(UKULELE_DATASET_DIR, "manifest.json")
UKULELE_PROFILE_PATH = os.path.join(UKULELE_DATASET_DIR, "calibrated_profile.json")

os.makedirs(SONGS_DIR, exist_ok=True)
os.makedirs(SAMPLES_DIR, exist_ok=True)

# Ensure proper MIME types
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("audio/midi", ".mid")
mimetypes.add_type("audio/midi", ".midi")
mimetypes.add_type("application/xml", ".musicxml")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("audio/x-wav", ".wav")


class ServerFingeringEngine:
    """
    Pure-Python mirror of js/engine/fingering.js (Parncutt/Jacobs/Nakamura 2nd-Order Viterbi DP).
    Ensures server-parsed MIDI and persisted catalog songs in songs_data/ always carry
    ergonomic hand, finger (1..5), fingerLabel ("T", "1".."4"), and fingerColor.
    """
    FINGER_PALETTE = {
        1: {"finger": 1, "diagramLabel": "T", "name": "Thumb",  "primary": "#48A870"},
        2: {"finger": 2, "diagramLabel": "1", "name": "Index",  "primary": "#F0C830"},
        3: {"finger": 3, "diagramLabel": "2", "name": "Middle", "primary": "#6848F8"},
        4: {"finger": 4, "diagramLabel": "3", "name": "Ring",   "primary": "#4090F8"},
        5: {"finger": 5, "diagramLabel": "4", "name": "Pinky",  "primary": "#E86078"},
    }
    OCTAVE_WHITE_POS = [0.0, 0.58, 1.0, 1.62, 2.0, 3.0, 3.55, 4.0, 4.58, 5.0, 5.62, 6.0]
    IS_BLACK = [False, True, False, True, False, False, True, False, True, False, True, False]
    PAIR_SPAN = {
        (1, 2): (-5, -3, 1, 5, 8, 10),
        (1, 3): (-4, -2, 3, 7, 10, 12),
        (1, 4): (-3, -1, 5, 9, 12, 14),
        (1, 5): (-1,  1, 7, 10, 12, 15),
        (2, 3): ( 1,  1, 1, 2, 5, 7),
        (2, 4): ( 1,  2, 3, 4, 6, 8),
        (2, 5): ( 2,  4, 5, 6, 8, 10),
        (3, 4): ( 1,  1, 1, 2, 4, 5),
        (3, 5): ( 1,  2, 3, 4, 7, 8),
        (4, 5): ( 1,  1, 1, 2, 4, 5),
    }
    ORDERED_SUBSETS = {
        1: [[1], [2], [3], [4], [5]],
        2: [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [4, 5]],
        3: [[1, 2, 3], [1, 2, 4], [1, 2, 5], [1, 3, 4], [1, 3, 5], [1, 4, 5], [2, 3, 4], [2, 3, 5], [2, 4, 5], [3, 4, 5]],
        4: [[1, 2, 3, 4], [1, 2, 3, 5], [1, 2, 4, 5], [1, 3, 4, 5], [2, 3, 4, 5]],
        5: [[1, 2, 3, 4, 5]],
    }
    CHORD_CLUSTER_SEC = 0.050

    @classmethod
    def clamp61(cls, midi):
        p = int(round(midi))
        while p < 36:
            p += 12
        while p > 96:
            p -= 12
        return p

    @classmethod
    def is_black(cls, midi):
        return cls.IS_BLACK[midi % 12]

    @classmethod
    def white_coord(cls, midi):
        octv = (midi // 12) - 1
        return (octv - 2) * 7.0 + cls.OCTAVE_WHITE_POS[midi % 12]

    @classmethod
    def anchor_x(cls, midi, finger, hand):
        direction = 1.0 if hand == "right" else -1.0
        return cls.white_coord(midi) - direction * (finger - 1)

    @classmethod
    def directed_span(cls, hand, fa, fb, pa, pb):
        if fa == fb:
            return abs(pb - pa)
        if fa < fb:
            return (pb - pa) if hand == "right" else (pa - pb)
        return (pa - pb) if hand == "right" else (pb - pa)

    @classmethod
    def partition_midi_hands(cls, notes):
        if not notes:
            return notes
        by_track = {}
        for n in notes:
            by_track.setdefault(n.get("track", 0), []).append(n)
        if len(by_track) == 2:
            items = sorted(by_track.items(), key=lambda kv: sum(x["pitch"] for x in kv[1]) / len(kv[1]))
            m0 = sum(x["pitch"] for x in items[0][1]) / len(items[0][1])
            m1 = sum(x["pitch"] for x in items[1][1]) / len(items[1][1])
            if m1 - m0 >= 6.0:
                for x in items[0][1]:
                    x["hand"] = "left"
                    x["clef"] = "bass"
                for x in items[1][1]:
                    x["hand"] = "right"
                    x["clef"] = "treble"
                return notes

        ordered = sorted(notes, key=lambda x: (x["time"], x["pitch"]))
        clusters = []
        for n in ordered:
            if clusters and abs(n["time"] - clusters[-1]["time"]) <= cls.CHORD_CLUSTER_SEC:
                clusters[-1]["notes"].append(n)
            else:
                clusters.append({"time": n["time"], "notes": [n]})

        prev_l, prev_r = 48.0, 67.0
        for cl in clusters:
            cl["notes"].sort(key=lambda x: x["pitch"])
            m = len(cl["notes"])
            best_s, best_cost = 0, float("inf")
            for s in range(m + 1):
                ls = cl["notes"][:s]
                rs = cl["notes"][s:]
                if (len(ls) > 5 and not rs) or (len(rs) > 5 and not ls):
                    continue
                cost = 0.0
                if ls:
                    sp = ls[-1]["pitch"] - ls[0]["pitch"]
                    if sp > 15:
                        cost += 50.0 + (sp - 15) * 12.0
                    elif sp > 12:
                        cost += (sp - 12) * 4.0
                    if ls[-1]["pitch"] > 64:
                        cost += (ls[-1]["pitch"] - 64) * 2.2
                    cost += abs(0.5 * (ls[0]["pitch"] + ls[-1]["pitch"]) - prev_l) * 0.35
                if rs:
                    sp = rs[-1]["pitch"] - rs[0]["pitch"]
                    if sp > 15:
                        cost += 50.0 + (sp - 15) * 12.0
                    elif sp > 12:
                        cost += (sp - 12) * 4.0
                    if rs[0]["pitch"] < 55:
                        cost += (55 - rs[0]["pitch"]) * 2.2
                    cost += abs(0.5 * (rs[0]["pitch"] + rs[-1]["pitch"]) - prev_r) * 0.35
                for ln in ls:
                    if ln["pitch"] >= 62:
                        cost += (ln["pitch"] - 61) * 1.4
                for rn in rs:
                    if rn["pitch"] <= 57:
                        cost += (58 - rn["pitch"]) * 1.4
                if cost < best_cost:
                    best_cost, best_s = cost, s
            for i, n in enumerate(cl["notes"]):
                n["hand"] = "left" if i < best_s else "right"
                n["clef"] = "bass" if i < best_s else "treble"
            if best_s > 0:
                prev_l = sum(x["pitch"] for x in cl["notes"][:best_s]) / best_s
            if best_s < m:
                prev_r = sum(x["pitch"] for x in cl["notes"][best_s:]) / (m - best_s)
        return notes

    @classmethod
    def _pair_chord_cost(cls, hand, f1, f2, p1, p2):
        fa, fb = (f1, f2) if f1 < f2 else (f2, f1)
        pa, pb = (p1, p2) if f1 < f2 else (p2, p1)
        d = cls.directed_span(hand, fa, fb, pa, pb)
        min_p, min_c, min_r, max_r, max_c, max_p = cls.PAIR_SPAN[(fa, fb)]
        if d <= 0:
            return 80.0 + abs(d) * 20.0
        cost = 0.0
        if d < min_r:
            cost += (min_r - d) * 0.85
        elif d > max_r:
            cost += (d - max_r) * 0.75
        if d < min_c:
            cost += (min_c - d) * 3.8
        elif d > max_c:
            cost += (d - max_c) * 3.6
        if d < min_p:
            cost += (min_p - d) * 16.0
        elif d > max_p:
            cost += (d - max_p) * 16.0
        dx = abs(cls.white_coord(pb) - cls.white_coord(pa))
        steps = fb - fa
        if steps == 1 and fa >= 2 and dx >= 1.85:
            cost += (dx - 1.0) * 1.65
        elif dx > steps + 2.2:
            cost += (dx - (steps + 2.2)) * 1.6
        return cost

    @classmethod
    def _single_voice_trans(cls, hand, p1, f1, p2, f2, dt, rest_gap, held=False):
        if p1 == p2:
            if dt < 0.13:
                return 1.1 if f1 == f2 else abs(f1 - f2) * 0.45
            return 0.0 if f1 == f2 else (2.1 + abs(f1 - f2) * 0.35)
        if f1 == f2:
            if held:
                return 18.0
            base = 1.6 if rest_gap >= 0.35 else 6.2
            return base + abs(p2 - p1) * 0.55
        fa, fb = (f1, f2) if f1 < f2 else (f2, f1)
        pa, pb = (p1, p2) if f1 < f2 else (p2, p1)
        d = cls.directed_span(hand, fa, fb, pa, pb)
        min_p, min_c, min_r, max_r, max_c, max_p = cls.PAIR_SPAN[(fa, fb)]
        cost = 0.0
        if d < 0:
            if held:
                cost += 12.0 + abs(d) * 4.0
            elif fa == 1 and fb <= 4:
                cost += 1.65 + abs(d) * 0.58
                if d < min_c:
                    cost += (min_c - d) * 2.8
                if d < min_p:
                    cost += (min_p - d) * 10.0
                tb, ob = cls.is_black(pa), cls.is_black(pb)
                if not tb and ob:
                    cost -= 0.55
                elif tb and not ob:
                    cost += 7.8
                elif tb and ob:
                    cost += 3.5
            elif fa == 1 and fb == 5:
                cost += 11.5 + abs(d) * 3.5
            else:
                cost += 12.5 + abs(d) * 3.8
        else:
            if d < min_r:
                cost += (min_r - d) * 0.55
            elif d > max_r:
                cost += (d - max_r) * 0.52
            if d < min_c:
                cost += (min_c - d) * 2.4
            elif d > max_c:
                cost += (d - max_c) * 2.5
            if d < min_p:
                cost += (min_p - d) * 9.5
            elif d > max_p:
                cost += (d - max_p) * 9.5
        if fa == 4 and fb == 5 and dt < 0.35 and d > 3:
            cost += (d - 3) * 1.4
        return cost

    @classmethod
    def ensure_song_fingering(cls, song, force=False):
        notes = song.get("notes") if isinstance(song, dict) else None
        if not isinstance(notes, list) or not notes:
            return song
        if not force and all(isinstance(n.get("finger"), int) and 1 <= n["finger"] <= 5 and n.get("hand") in ("left", "right") for n in notes):
            for n in notes:
                n["pitch"] = cls.clamp61(n.get("pitch", n.get("midi", 60)))
                st = cls.FINGER_PALETTE[n["finger"]]
                n["fingerLabel"] = st["diagramLabel"]
                n["fingerColor"] = st["primary"]
                if not n.get("clef"):
                    n["clef"] = "bass" if n["hand"] == "left" else "treble"
            return song
        return cls.assign_song_fingering(song)

    @classmethod
    def assign_song_fingering(cls, song):
        notes = song.get("notes") if isinstance(song, dict) else None
        if not isinstance(notes, list) or not notes:
            return song
        for n in notes:
            n["pitch"] = cls.clamp61(n.get("pitch", n.get("midi", 60)))
            if n.get("hand") not in ("left", "right"):
                if n.get("clef") == "bass":
                    n["hand"] = "left"
                elif n.get("clef") == "treble":
                    n["hand"] = "right"
                else:
                    n["hand"] = "right" if n["pitch"] >= 60 else "left"
            if n.get("clef") not in ("bass", "treble"):
                n["clef"] = "bass" if n["hand"] == "left" else "treble"

        for hand in ("right", "left"):
            h_notes = [n for n in notes if n["hand"] == hand]
            if h_notes:
                cls._solve_hand(h_notes, hand)
        return song

    @classmethod
    def _solve_hand(cls, hand_notes, hand):
        ordered = sorted(hand_notes, key=lambda x: (x.get("time", 0.0), x["pitch"]))
        events = []
        for n in ordered:
            t = float(n.get("time", 0.0))
            dur = float(n.get("duration", 0.4))
            if events and abs(t - events[-1]["time"]) <= cls.CHORD_CLUSTER_SEC:
                events[-1]["notes"].append(n)
                events[-1]["end"] = max(events[-1]["end"], t + dur)
            else:
                events.append({"time": t, "end": t + dur, "notes": [n]})

        for ev in events:
            ev["notes"].sort(key=lambda x: x["pitch"])
            uniq = []
            for n in ev["notes"]:
                if not uniq or uniq[-1] != n["pitch"]:
                    uniq.append(n["pitch"])
            ev["uniq"] = uniq
            k = len(uniq)
            if k <= 5:
                subs = cls.ORDERED_SUBSETS[k]
                raw = [list(s) if hand == "right" else list(reversed(s)) for s in subs]
            else:
                base = [1, 2, 3, 4, 5] if hand == "right" else [5, 4, 3, 2, 1]
                raw = [[base[min(4, (i * 5) // k)] for i in range(k)]]
            ev["cands"] = [
                {
                    "fingers": fg,
                    "anchor": sum(cls.anchor_x(uniq[i], fg[i], hand) for i in range(k)) / k,
                }
                for fg in raw
            ]

        T = len(events)
        for t, ev in enumerate(events):
            prev_ev = events[t - 1] if t > 0 else None
            next_ev = events[t + 1] if t + 1 < T else None
            pitches = ev["uniq"]
            k = len(pitches)
            all_b = all(cls.is_black(p) for p in pitches)
            u_costs = []
            for cand in ev["cands"]:
                fg = cand["fingers"]
                c = 0.0
                for i, p in enumerate(pitches):
                    f = fg[i]
                    if cls.is_black(p):
                        if f == 1:
                            c += 1.1 if (k >= 2 and (all_b or pitches[-1] - pitches[0] >= 11)) else 3.1
                        elif f == 5:
                            c += 0.35 if k >= 2 else 1.15
                        else:
                            c -= 0.32
                    if k == 1:
                        if f == 4:
                            c += 0.24
                        elif f == 5:
                            peak = (
                                hand == "right"
                                and (not prev_ev or p >= prev_ev["uniq"][-1])
                                and (not next_ev or p >= next_ev["uniq"][-1])
                            ) or (
                                hand == "left"
                                and (not prev_ev or p <= prev_ev["uniq"][0])
                                and (not next_ev or p <= next_ev["uniq"][0])
                            )
                            c += 0.02 if peak else 0.34
                        elif f == 1:
                            c += 0.10
                if k >= 2:
                    for i in range(k):
                        for j in range(i + 1, k):
                            c += cls._pair_chord_cost(hand, fg[i], fg[j], pitches[i], pitches[j])
                    if k >= 3 and (pitches[-1] - pitches[0]) >= 6 and (1 in fg) and (5 in fg):
                        c -= 0.75
                    if 1 in fg:
                        ti = fg.index(1)
                        if cls.is_black(pitches[ti]):
                            if any(idx != ti and fg[idx] <= 4 and not cls.is_black(pitches[idx]) for idx in range(k)):
                                c += 2.4
                u_costs.append(c)
            ev["unary"] = u_costs

        def trans_cost(ev_p, cd_p, ev_c, cd_c):
            dt = max(0.001, ev_c["time"] - ev_p["time"])
            rg = ev_c["time"] - ev_p["end"]
            pw = 0.28 if (rg >= 0.75 or dt >= 2.4) else (0.58 if (rg >= 0.35 or dt >= 1.5) else (1.18 if dt < 0.28 else 1.0))
            cost = abs(cd_c["anchor"] - cd_p["anchor"]) * 0.72 * pw
            pp, fp = ev_p["uniq"], cd_p["fingers"]
            pc, fc = ev_c["uniq"], cd_c["fingers"]
            held = ev_p["end"] > ev_c["time"] + 0.055
            if len(pp) == 1 and len(pc) == 1:
                return cost + pw * cls._single_voice_trans(hand, pp[0], fp[0], pc[0], fc[0], dt, rg, held)
            li_p = len(pp) - 1 if hand == "right" else 0
            li_c = len(pc) - 1 if hand == "right" else 0
            lt = cls._single_voice_trans(hand, pp[li_p], fp[li_p], pc[li_c], fc[li_c], dt, rg, False)
            if len(pp) >= 2 and len(pc) >= 2 and fp[li_p] == fc[li_c] and pp[li_p] != pc[li_c]:
                lt *= 0.16 if (len(pp) >= 3 and len(pc) >= 3) else 0.35
            cost += pw * lt * 0.75
            if len(pp) >= 2 and len(pc) >= 2:
                bi_p = 0 if hand == "right" else len(pp) - 1
                bi_c = 0 if hand == "right" else len(pc) - 1
                bt = cls._single_voice_trans(hand, pp[bi_p], fp[bi_p], pc[bi_c], fc[bi_c], dt, rg, False)
                if fp[bi_p] == fc[bi_c] and pp[bi_p] != pc[bi_c]:
                    bt *= 0.16 if (len(pp) >= 3 and len(pc) >= 3) else 0.35
                cost += pw * bt * 0.45
            for i, pv in enumerate(pp):
                if pv in pc:
                    si = pc.index(pv)
                    if fp[i] == fc[si]:
                        cost -= 0.25
                    elif held:
                        cost += 4.0
                elif held and fp[i] in fc:
                    cost += 14.0
            return cost

        def trigram_cost(e0, c0, e1, c1, e2, c2):
            dt01 = e1["time"] - e0["time"]
            dt12 = e2["time"] - e1["time"]
            if dt01 > 1.4 or dt12 > 1.4:
                return 0.0
            cost = 0.0
            if abs(c1["anchor"] - c0["anchor"]) > 0.75 and abs(c2["anchor"] - c1["anchor"]) > 0.75 and abs(c2["anchor"] - c0["anchor"]) < 0.5:
                cost += 1.65
            if len(e0["uniq"]) == 1 and len(e1["uniq"]) == 1 and len(e2["uniq"]) == 1:
                p0, p1, p2 = e0["uniq"][0], e1["uniq"][0], e2["uniq"][0]
                f0, f1, f2 = c0["fingers"][0], c1["fingers"][0], c2["fingers"][0]
                mono = (p0 < p1 < p2) or (p0 > p1 > p2)
                if mono and f0 == 1 and f2 == 1 and f1 == 2:
                    cost += 4.2
                if mono and f0 == f2 and abs(p2 - p0) <= 4:
                    cost += 2.6
                if p0 == p2 and p0 != p1 and dt01 < 0.35 and dt12 < 0.35:
                    if ((f0 == 4 and f1 == 5) or (f0 == 5 and f1 == 4)) and not cls.is_black(p1):
                        cost += 1.4
            return cost

        if T == 1:
            best_i = min(range(len(events[0]["cands"])), key=lambda c: events[0]["unary"][c])
            chosen = [best_i]
        else:
            c0_n, c1_n = len(events[0]["cands"]), len(events[1]["cands"])
            dp_prev = [
                [
                    events[0]["unary"][c0] + events[1]["unary"][c1] + trans_cost(events[0], events[0]["cands"][c0], events[1], events[1]["cands"][c1])
                    for c1 in range(c1_n)
                ]
                for c0 in range(c0_n)
            ]
            bps = []
            for t in range(2, T):
                e0, e1, e2 = events[t - 2], events[t - 1], events[t]
                n0, n1, n2 = len(e0["cands"]), len(e1["cands"]), len(e2["cands"])
                dp_cur = [[0.0] * n2 for _ in range(n1)]
                bp_cur = [[0] * n2 for _ in range(n1)]
                for i1 in range(n1):
                    cd1 = e1["cands"][i1]
                    for i2 in range(n2):
                        cd2 = e2["cands"][i2]
                        bt = e2["unary"][i2] + trans_cost(e1, cd1, e2, cd2)
                        best_v, best_i0 = float("inf"), 0
                        for i0 in range(n0):
                            v = dp_prev[i0][i1] + bt + trigram_cost(e0, e0["cands"][i0], e1, cd1, e2, cd2)
                            if v < best_v:
                                best_v, best_i0 = v, i0
                        dp_cur[i1][i2] = best_v
                        bp_cur[i1][i2] = best_i0
                dp_prev = dp_cur
                bps.append(bp_cur)
            chosen = [0] * T
            best_end = float("inf")
            b1, b2 = 0, 0
            for i1 in range(len(dp_prev)):
                for i2 in range(len(dp_prev[i1])):
                    if dp_prev[i1][i2] < best_end:
                        best_end, b1, b2 = dp_prev[i1][i2], i1, i2
            chosen[T - 2], chosen[T - 1] = b1, b2
            for t in range(T - 1, 1, -1):
                chosen[t - 2] = bps[t - 2][chosen[t - 1]][chosen[t]]

        for t, ev in enumerate(events):
            cand = ev["cands"][chosen[t]]
            fmap = dict(zip(ev["uniq"], cand["fingers"]))
            for n in ev["notes"]:
                fg = fmap.get(n["pitch"], 1)
                st = cls.FINGER_PALETTE[fg]
                n["finger"] = fg
                n["fingerLabel"] = st["diagramLabel"]
                n["fingerColor"] = st["primary"]


class MidiParser:
    """Lightweight pure-python Standard MIDI File (SMF) parser."""
    @staticmethod
    def parse(midi_bytes):
        try:
            stream = io.BytesIO(midi_bytes)
            header_chunk = stream.read(4)
            if header_chunk != b'MThd':
                return {"error": "Invalid MIDI file (header mismatch)"}
            
            header_length = struct.unpack(">I", stream.read(4))[0]
            fmt, num_tracks, division = struct.unpack(">HHH", stream.read(6))
            
            # Skip any extra header bytes
            if header_length > 6:
                stream.read(header_length - 6)
            
            ticks_per_beat = division if not (division & 0x8000) else 480
            all_notes = []
            tempo = 500000 # default 120 BPM (500,000 microseconds per beat)
            beats_per_measure = 4
            beat_type = 4
            key_signature = "C"
            song_title = "Imported MIDI Song"
            
            for track_idx in range(num_tracks):
                track_chunk = stream.read(4)
                if track_chunk != b'MTrk':
                    break
                track_len = struct.unpack(">I", stream.read(4))[0]
                track_data = stream.read(track_len)
                t_stream = io.BytesIO(track_data)
                
                current_tick = 0
                running_status = 0
                active_notes = {} # note_number -> start_tick
                
                while t_stream.tell() < track_len:
                    # Read delta time (variable length)
                    delta = 0
                    while True:
                        b = t_stream.read(1)
                        if not b:
                            break
                        val = ord(b)
                        delta = (delta << 7) | (val & 0x7F)
                        if not (val & 0x80):
                            break
                    
                    current_tick += delta
                    peek = t_stream.read(1)
                    if not peek:
                        break
                    first_byte = ord(peek)
                    if first_byte >= 0x80:
                        status = first_byte
                        if status < 0xF0:
                            running_status = status
                    else:
                        status = running_status
                        t_stream.seek(-1, io.SEEK_CUR)
                    
                    if status == 0xFF: # Meta event
                        meta_type = ord(t_stream.read(1))
                        # Read length
                        m_len = 0
                        while True:
                            b = t_stream.read(1)
                            if not b:
                                break
                            val = ord(b)
                            m_len = (m_len << 7) | (val & 0x7F)
                            if not (val & 0x80):
                                break
                        m_data = t_stream.read(m_len)
                        if meta_type == 0x51 and len(m_data) == 3: # Set Tempo
                            tempo = (m_data[0] << 16) | (m_data[1] << 8) | m_data[2]
                        elif meta_type == 0x58 and len(m_data) >= 2: # Time Signature
                            if m_data[0] > 0:
                                beats_per_measure = m_data[0]
                                beat_type = 1 << m_data[1]
                        elif meta_type == 0x59 and len(m_data) >= 2: # Key Signature
                            sf = m_data[0] - 256 if m_data[0] > 127 else m_data[0]
                            mi = m_data[1]
                            major_map = {
                                -7: "Cb", -6: "Gb", -5: "Db", -4: "Ab", -3: "Eb", -2: "Bb", -1: "F",
                                0: "C", 1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#"
                            }
                            minor_map = {
                                -7: "Abm", -6: "Ebm", -5: "Bbm", -4: "Fm", -3: "Cm", -2: "Gm", -1: "Dm",
                                0: "Am", 1: "Em", 2: "Bm", 3: "F#m", 4: "C#m", 5: "G#m", 6: "D#m", 7: "A#m"
                            }
                            kmap = minor_map if mi == 1 else major_map
                            if sf in kmap:
                                key_signature = kmap[sf]
                        elif meta_type == 0x03: # Track/Song Name
                            txt = m_data.decode("utf-8", errors="ignore").strip()
                            if txt and song_title == "Imported MIDI Song":
                                song_title = txt
                    elif (status & 0xF0) == 0x90: # Note On
                        note_num = ord(t_stream.read(1))
                        vel = ord(t_stream.read(1))
                        if vel > 0:
                            active_notes[note_num] = current_tick
                        elif note_num in active_notes:
                            start = active_notes.pop(note_num)
                            dur = current_tick - start
                            all_notes.append({
                                "pitch": note_num,
                                "tick": start,
                                "duration_ticks": max(dur, ticks_per_beat // 8),
                                "track": track_idx
                            })
                    elif (status & 0xF0) == 0x80: # Note Off
                        note_num = ord(t_stream.read(1))
                        t_stream.read(1) # vel
                        if note_num in active_notes:
                            start = active_notes.pop(note_num)
                            dur = current_tick - start
                            all_notes.append({
                                "pitch": note_num,
                                "tick": start,
                                "duration_ticks": max(dur, ticks_per_beat // 8),
                                "track": track_idx
                            })
                    elif (status & 0xF0) in (0xA0, 0xB0, 0xE0):
                        t_stream.read(2)
                    elif (status & 0xF0) in (0xC0, 0xD0):
                        t_stream.read(1)
            
            quarter_bpm = 60000000.0 / tempo
            effective_bpm = round(quarter_bpm * (beat_type / 4.0), 4)
            sec_per_tick = (tempo / 1000000.0) / ticks_per_beat
            ordered_raw = sorted(all_notes, key=lambda x: (x["tick"], x["pitch"]))
            ticks_per_measure = max(1, int(round(ticks_per_beat * beats_per_measure * (4.0 / beat_type))))
            first_tick = ordered_raw[0]["tick"] if ordered_raw else 0
            base_tick = (first_tick // ticks_per_measure) * ticks_per_measure
            sixteenth_ticks = max(1.0, ticks_per_beat / 4.0)
            
            # Convert ticks to barline-aligned seconds and articulated durations
            parsed_notes = []
            for n in ordered_raw:
                time_sec = (n["tick"] - base_tick) * sec_per_tick
                raw_dur_sec = n["duration_ticks"] * sec_per_tick
                is_quantized = abs(n["duration_ticks"] - round(n["duration_ticks"] / sixteenth_ticks) * sixteenth_ticks) <= 2
                articulated_dur = max(0.15, raw_dur_sec - 0.025) if is_quantized else max(0.15, raw_dur_sec)
                pitch = ServerFingeringEngine.clamp61(n["pitch"])
                parsed_notes.append({
                    "pitch": pitch,
                    "time": round(time_sec, 4),
                    "duration": round(articulated_dur, 4),
                    "track": n.get("track", 0)
                })

            ServerFingeringEngine.partition_midi_hands(parsed_notes)
            for n in parsed_notes:
                n.pop("track", None)

            song_out = {
                "title": song_title,
                "bpm": effective_bpm,
                "beatsPerMeasure": beats_per_measure,
                "timeSignature": [beats_per_measure, beat_type],
                "keySignature": key_signature,
                "ticks_per_beat": ticks_per_beat,
                "total_notes": len(parsed_notes),
                "notes": parsed_notes
            }
            ServerFingeringEngine.assign_song_fingering(song_out)
            return song_out
        except Exception as e:
            return {"error": f"Error parsing MIDI: {str(e)}"}


class PianoAppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/songs":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            
            # Scan songs_data folder for custom songs
            saved_songs = []
            for filename in os.listdir(SONGS_DIR):
                if filename.endswith(".json"):
                    try:
                        with open(os.path.join(SONGS_DIR, filename), "r", encoding="utf-8") as f:
                            song_data = json.load(f)
                        ServerFingeringEngine.ensure_song_fingering(song_data)
                        saved_songs.append(song_data)
                    except Exception:
                        pass
            
            self.wfile.write(json.dumps({"custom_songs": saved_songs}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/summary":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            manifest = {}
            if os.path.exists(MANIFEST_PATH):
                try:
                    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                        manifest = json.load(f)
                except Exception:
                    manifest = {}
            
            sample_files = [f for f in os.listdir(SAMPLES_DIR) if f.endswith(".wav")]
            response = {
                "total_samples": len(manifest.get("samples", [])),
                "wav_file_count": len(sample_files),
                "manifest": manifest,
                "dataset_dir": DATASET_DIR
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/zip":
            # Package all recorded samples and manifest into an in-memory ZIP file
            try:
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    if os.path.exists(MANIFEST_PATH):
                        zip_file.write(MANIFEST_PATH, arcname="manifest.json")
                    for fname in os.listdir(SAMPLES_DIR):
                        if fname.endswith(".wav"):
                            fpath = os.path.join(SAMPLES_DIR, fname)
                            zip_file.write(fpath, arcname=os.path.join("samples", fname))
                
                zip_bytes = zip_buffer.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="piano_acoustic_dataset.zip"')
                self.send_header("Content-Length", str(len(zip_bytes)))
                self.end_headers()
                self.wfile.write(zip_bytes)
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Failed to generate ZIP: {str(e)}"}).encode("utf-8"))
                return

        elif parsed.path == "/api/dataset/ukulele/summary":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            manifest = {}
            if os.path.exists(UKULELE_MANIFEST_PATH):
                try:
                    with open(UKULELE_MANIFEST_PATH, "r", encoding="utf-8") as f:
                        manifest = json.load(f)
                except Exception:
                    manifest = {}

            sample_files = (
                [f for f in os.listdir(UKULELE_SAMPLES_DIR) if f.endswith(".wav")]
                if os.path.isdir(UKULELE_SAMPLES_DIR)
                else []
            )
            response = {
                "instrument": "ukulele",
                "total_samples": len(manifest.get("samples", [])),
                "wav_file_count": len(sample_files),
                "manifest": manifest,
                "dataset_dir": UKULELE_DATASET_DIR,
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/ukulele/zip":
            try:
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                    if os.path.exists(UKULELE_MANIFEST_PATH):
                        zip_file.write(UKULELE_MANIFEST_PATH, arcname="manifest.json")
                    if os.path.isdir(UKULELE_SAMPLES_DIR):
                        for fname in os.listdir(UKULELE_SAMPLES_DIR):
                            if fname.endswith(".wav"):
                                fpath = os.path.join(UKULELE_SAMPLES_DIR, fname)
                                zip_file.write(fpath, arcname=os.path.join("samples", fname))

                zip_bytes = zip_buffer.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", 'attachment; filename="ukulele_acoustic_dataset.zip"')
                self.send_header("Content-Length", str(len(zip_bytes)))
                self.end_headers()
                self.wfile.write(zip_bytes)
                return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Failed to generate ukulele ZIP: {str(e)}"}).encode("utf-8"))
                return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len) if content_len > 0 else b""

        if parsed.path == "/api/parse-midi":
            result = MidiParser.parse(post_body)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
            return

        elif parsed.path == "/api/songs/save":
            try:
                data = json.loads(post_body.decode("utf-8"))
                ServerFingeringEngine.ensure_song_fingering(data)
                song_id = data.get("id", f"song_{os.urandom(4).hex()}")
                filepath = os.path.join(SONGS_DIR, f"{song_id}.json")
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "id": song_id}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/sample":
            try:
                data = json.loads(post_body.decode("utf-8"))
                meta = data.get("metadata", {})
                audio_b64 = data.get("audioBase64", "")
                
                step_id = meta.get("id", f"sample_{int(time.time())}")
                filename = meta.get("filename", f"{step_id}.wav")
                if not filename.endswith(".wav"):
                    filename += ".wav"
                
                wav_path = os.path.join(SAMPLES_DIR, filename)
                
                # Write audio WAV file
                if audio_b64:
                    wav_bytes = base64.b64decode(audio_b64)
                    with open(wav_path, "wb") as f:
                        f.write(wav_bytes)
                    meta["file_size_bytes"] = len(wav_bytes)
                
                meta["filename"] = filename
                meta["saved_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                meta["audio_url"] = f"/audio_dataset/samples/{filename}"

                # Update manifest.json
                manifest = {"samples": [], "updated_at": meta["saved_at"]}
                if os.path.exists(MANIFEST_PATH):
                    try:
                        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
                            manifest = json.load(f)
                    except Exception:
                        manifest = {"samples": [], "updated_at": meta["saved_at"]}
                
                if "samples" not in manifest or not isinstance(manifest["samples"], list):
                    manifest["samples"] = []

                # Replace existing record for this step or append
                existing_idx = next((i for i, s in enumerate(manifest["samples"]) if s.get("id") == step_id), None)
                if existing_idx is not None:
                    manifest["samples"][existing_idx] = meta
                else:
                    manifest["samples"].append(meta)

                manifest["updated_at"] = meta["saved_at"]
                with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "filename": filename,
                    "total_samples": len(manifest["samples"]),
                    "sample": meta
                }).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Failed to save sample: {str(e)}"}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/recalibrate":
            try:
                script_path = os.path.join(BASE_DIR, "scripts", "calibrate_and_benchmark.py")
                proc = subprocess.run(
                    [sys.executable, script_path],
                    cwd=BASE_DIR,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr or proc.stdout or "Calibration script failed")

                profile_path = os.path.join(DATASET_DIR, "calibrated_profile.json")
                with open(profile_path, "r", encoding="utf-8") as f:
                    profile_data = json.load(f)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "profile": profile_data
                }).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Recalibration failed: {str(e)}"}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/reset":
            try:
                for fname in os.listdir(SAMPLES_DIR):
                    fpath = os.path.join(SAMPLES_DIR, fname)
                    if os.path.isfile(fpath):
                        os.remove(fpath)
                
                with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
                    json.dump({"samples": [], "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f, indent=2)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Dataset reset successfully."}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/ukulele/sample":
            try:
                os.makedirs(UKULELE_SAMPLES_DIR, exist_ok=True)
                data = json.loads(post_body.decode("utf-8"))
                meta = data.get("metadata", {})
                audio_b64 = data.get("audioBase64", "")

                step_id = meta.get("id", f"uku_sample_{int(time.time())}")
                raw_filename = meta.get("filename", f"{step_id}.wav")
                filename = os.path.basename(raw_filename)
                if not filename.endswith(".wav"):
                    filename += ".wav"

                wav_path = os.path.join(UKULELE_SAMPLES_DIR, filename)
                if audio_b64:
                    wav_bytes = base64.b64decode(audio_b64)
                    with open(wav_path, "wb") as f:
                        f.write(wav_bytes)
                    meta["file_size_bytes"] = len(wav_bytes)

                meta["filename"] = filename
                meta["instrument"] = "ukulele"
                meta["saved_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                meta["audio_url"] = f"/audio_dataset/ukulele/samples/{filename}"

                manifest = {"instrument": "ukulele", "samples": [], "updated_at": meta["saved_at"]}
                if os.path.exists(UKULELE_MANIFEST_PATH):
                    try:
                        with open(UKULELE_MANIFEST_PATH, "r", encoding="utf-8") as f:
                            manifest = json.load(f)
                    except Exception:
                        manifest = {"instrument": "ukulele", "samples": [], "updated_at": meta["saved_at"]}

                if "samples" not in manifest or not isinstance(manifest["samples"], list):
                    manifest["samples"] = []

                existing_idx = next((i for i, s in enumerate(manifest["samples"]) if s.get("id") == step_id), None)
                if existing_idx is not None:
                    manifest["samples"][existing_idx] = meta
                else:
                    manifest["samples"].append(meta)

                manifest["instrument"] = "ukulele"
                manifest["updated_at"] = meta["saved_at"]
                with open(UKULELE_MANIFEST_PATH, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "instrument": "ukulele",
                    "filename": filename,
                    "total_samples": len(manifest["samples"]),
                    "sample": meta,
                }).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Failed to save ukulele sample: {str(e)}"}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/ukulele/recalibrate":
            try:
                wav_files = (
                    [f for f in os.listdir(UKULELE_SAMPLES_DIR) if f.endswith(".wav")]
                    if os.path.isdir(UKULELE_SAMPLES_DIR)
                    else []
                )
                if not os.path.exists(UKULELE_MANIFEST_PATH) or len(wav_files) == 0:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "success": False,
                        "error": "No recorded ukulele WAV samples found. Record Room Silence and open-string steps first.",
                    }).encode("utf-8"))
                    return

                script_path = os.path.join(BASE_DIR, "scripts", "calibrate_ukulele.py")
                proc = subprocess.run(
                    [sys.executable, script_path, "--real-wavs"],
                    cwd=BASE_DIR,
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr or proc.stdout or "Ukulele calibration script failed")

                with open(UKULELE_PROFILE_PATH, "r", encoding="utf-8") as f:
                    profile_data = json.load(f)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "instrument": "ukulele",
                    "profile": profile_data,
                }).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Ukulele recalibration failed: {str(e)}"}).encode("utf-8"))
            return

        elif parsed.path == "/api/dataset/ukulele/reset":
            try:
                os.makedirs(UKULELE_SAMPLES_DIR, exist_ok=True)
                for fname in os.listdir(UKULELE_SAMPLES_DIR):
                    fpath = os.path.join(UKULELE_SAMPLES_DIR, fname)
                    if os.path.isfile(fpath):
                        os.remove(fpath)

                with open(UKULELE_MANIFEST_PATH, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "instrument": "ukulele",
                            "samples": [],
                            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        },
                        f,
                        indent=2,
                    )

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "instrument": "ukulele",
                    "message": "Ukulele dataset reset successfully.",
                }).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


def run_server():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    socketserver.ThreadingTCPServer.request_queue_size = 128
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), PianoAppRequestHandler) as httpd:
        print(f"🎵 Yousician Piano App Server running at:")
        print(f"   Local:   http://localhost:{PORT}")
        print(f"   Network: http://127.0.0.1:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    run_server()
