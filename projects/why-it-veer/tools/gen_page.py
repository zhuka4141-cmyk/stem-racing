"""Generate index.html from the episode JSON and the physics result.

Everything the page draws is procedural 2D canvas: no images, no fonts fetched
over the network, no ES modules. A file:// page that draws a local image ends up
with a tainted canvas, and getImageData()/toDataURL() then throw - which is
exactly what the export buttons and the gate need. Keeping it vector avoids that
whole class of failure.

    python tools/gen_page.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def trace_samples(trace, n=64):
    if len(trace) <= n:
        idx = range(len(trace))
    else:
        idx = [round(i * (len(trace) - 1) / (n - 1)) for i in range(n)]
    return [[round(trace[i]["t"], 5), round(trace[i]["s"], 5), round(trace[i]["psi_deg"], 4)]
            for i in idx]


def main():
    doc = json.load(io.open(os.path.join(ROOT, "episodes/why-it-veer.json"), encoding="utf-8"))
    ph = json.load(io.open(os.path.join(ROOT, "out/physics.json"), encoding="utf-8"))
    r = ph["run"]
    cfg = doc["physics"]
    data = {
        "id": doc["id"],
        "series": doc["series"],
        "episode": doc["episode_no"],
        "w": doc["canvas"]["w"], "h": doc["canvas"]["h"],
        "fps": doc["canvas"]["fps"], "duration": doc["canvas"]["duration_s"],
        "palette": doc["palette"],
        "beats": [{
            "t0": b["t0"], "t1": b["t1"], "kicker": b["kicker"],
            "head": b["head"], "sub": b["sub"],
            "panel": b.get("panel") or "none", "nums": b.get("nums"),
        } for b in doc["beats"]],
        "num": {
            "t20": r["run_time_s"], "v": r["exit_speed_ms"],
            "a_peak": ph["a_peak_ms2"], "M": r["M_peak_mNm"],
            "Mtyre": r["M_tyre_max_mNm"], "dcrit": ph["critical_offset_mm"],
            "over": ph["over_critical_x"], "contact": r["contact_s_m"],
            "nose": r["nose_end_mm"], "work": r["rail_work_J"],
            "dt_ms": ph["delta_t_s"] * 1000.0,
            "rest": cfg["track_length_m"] - r["contact_s_m"],
            "d_now": ph["cm_offset_mm"], "psi": r["psi_lock_deg"],
            "track": cfg["track_length_m"], "ref_t": ph["reference"]["run_time_s"],
            "ref_v": ph["reference"]["exit_speed_ms"],
        },
        "timeline": [[b["t0"], b["t1"]] for b in doc["beats"]],
        "trace": trace_samples(ph["trace"]),
    }
    tpl = io.open(os.path.join(ROOT, "tools/page_template.html"), encoding="utf-8").read()
    html = tpl.replace("/*__DATA__*/", json.dumps(data, ensure_ascii=False))
    io.open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n").write(html)
    print("index.html", len(html), "bytes")


main()