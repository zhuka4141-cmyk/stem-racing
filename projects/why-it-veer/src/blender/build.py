"""Render the vertical film as two layers plus a PIL composite step.

Blender's two-scene compositor rendered the HUD's mesh rectangles but silently
dropped its text objects, so the layers are rendered separately and merged by
work/composite.py. That also leaves a HUD-only PNG per frame, which is what the
safe-area QA measures.

    blender -b -P build.py -- --episode E --physics P
        [--dir3d work/frames3d] [--dirhud work/hud] [--stills 0,120]
        [--start 0] [--end 780] [--layer both|3d|hud]
"""
import argparse
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hud as Hd            # noqa: E402
import scene3d as S         # noqa: E402

PAD = 60
SAFE_X1 = 930
BAND_TOP = 600
BAND_BOT = 1180


def srgb_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hexs):
    h = hexs.lstrip("#")
    return tuple(srgb_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


def pal_of(doc):
    return {k: rgba(v) for k, v in doc["palette"].items()}


def ctx_of(ph, cfg):
    r, ref = ph["run"], ph["reference"]
    return {
        "t20": r["run_time_s"], "v": r["exit_speed_ms"], "a_peak": ph["a_peak_ms2"],
        "M": r["M_peak_mNm"], "Mtyre": r["M_tyre_max_mNm"],
        "dcrit": ph["critical_offset_mm"], "over": ph["over_critical_x"],
        "contact": r["contact_s_m"], "nose": r["nose_end_mm"],
        "work": r["rail_work_J"], "dt": ph["delta_t_s"] * 1000.0,
        "rest": cfg["track_length_m"] - r["contact_s_m"],
        "d_now": ph["cm_offset_mm"], "psi": r["psi_lock_deg"],
        "ref_t": ref["run_time_s"], "ref_v": ref["exit_speed_ms"],
    }


def fmt(v):
    return ("{:.2f}" if abs(v) < 10 else "{:.1f}").format(v)


def tx(hd, *a, **kw):
    """Draw text above the band rectangles.

    Every HUD primitive defaults to z=0, and the opaque bands are coplanar with
    the glyphs, so the rectangles win the depth test and the text disappears.
    """
    ob = getattr(hd, "text")(*a, **kw)
    ob.location.z = 20.0
    return ob


def build_main(doc, pal, w, h):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    d = sc.display.shading
    d.light = 'STUDIO'
    d.color_type = 'OBJECT'
    d.show_cavity = True
    d.cavity_type = 'BOTH'
    d.curvature_ridge_factor = 1.5
    d.curvature_valley_factor = 1.2
    d.show_object_outline = False
    d.show_specular_highlight = True
    d.studiolight_rotate_z = 0.65
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.fps = doc["canvas"]["fps"]
    sc.view_settings.view_transform = 'Standard'

    world = S.build_world(pal, 34.0)
    stripes = S.build_stripes(pal, 34.0)
    car = S.build_car(pal, doc["physics"]["cm_offset_m"], -0.035)
    cam = S.make_camera(sc, 50.0)
    return sc, cam, car, list(world.values()) + stripes


def place(cam, shot):
    az, el = math.radians(shot["az"]), math.radians(shot["el"])
    t, dist = shot["target"], shot["dist"]
    dirv = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
    cam.data.lens = shot["lens"]
    cam.data.shift_y = shot["shift"]
    S.aim(cam, (t[0] + dist * dirv[0], t[1] + dist * dirv[1], t[2] + dist * dirv[2]), t)


def draw(hd, pal, beat, ctx, prog, note):
    hd.clear()
    hd.rect(0, 0, 1080, BAND_TOP, pal["bg"])
    hd.rect(0, BAND_BOT, 1080, 1920, pal["bg"])
    hd.stroke(0, BAND_TOP, 1080, BAND_TOP, pal["hair"], 2)
    hd.stroke(0, BAND_BOT, 1080, BAND_BOT, pal["hair"], 2)

    tx(hd, beat["kicker"], PAD, 248, 48, "cjk", pal["dim"], tracking=1.02)
    if note:
        tx(hd, note, SAFE_X1, 248, 48, "cjk", pal["dim"], align='RIGHT', tracking=1.02)
    hd.stroke(PAD, 312, SAFE_X1, 312, pal["hair"], 2)

    runs = [r for r in beat["head"] if r[1]]
    top = 330 + max(0, (258 - len(runs) * 120)) // 2
    for i, (fkey, txt) in enumerate(runs):
        tx(hd, txt.format(**ctx), PAD, top + i * 120, 108, fkey, pal["text"])

    hd.stroke(PAD, 1206, SAFE_X1, 1206, pal["hair"], 2)
    tx(hd, beat["sub"].format(**ctx), PAD, 1232, 54, "cjk", pal["text"])

    panel = beat.get("panel") or "none"
    if panel == "bar":
        tx(hd, "{:.2f} m / 20 m".format(prog["s"]), PAD, 1312, 64, "mono", pal["text"])
        y = 1404
        hd.stroke(PAD, y, SAFE_X1, y, pal["hair"], 4)
        x = PAD + (SAFE_X1 - PAD) * min(1.0, prog["s"] / 20.0)
        if x > PAD + 3:
            hd.rect(PAD, y - 9, x, y + 9, pal["accent"])
        xc = PAD + (SAFE_X1 - PAD) * min(1.0, prog["contact"] / 20.0)
        hd.stroke(xc, y - 30, xc, y + 30, pal["warn"], 4)
        tx(hd, "0", PAD, 1428, 48, "mono", pal["dim"])
        tx(hd, "20 m", SAFE_X1, 1428, 48, "mono", pal["dim"], align='RIGHT')
        tx(hd, "贴合 {:.3f} m".format(prog["contact"]), SAFE_X1, 1312, 48, "cjk",
                pal["warn"], align='RIGHT')
    elif panel == "nums":
        for i, (label, key, unit) in enumerate(beat["nums"]):
            x = PAD + i * 292
            tx(hd, label, x, 1318, 48, "cjk", pal["dim"])
            tx(hd, fmt(ctx[key]), x, 1366, 84, "mono_b", pal["text"])
            tx(hd, unit, x + 8 + 0.56 * 84 * len(fmt(ctx[key])), 1400, 48, "cjk",
                    pal["dim"])


def sim_at(trace, t):
    lo, hi = 0, len(trace) - 1
    if t <= trace[0]["t"]:
        return trace[0]
    if t >= trace[hi]["t"]:
        return trace[hi]
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if trace[mid]["t"] <= t:
            lo = mid
        else:
            hi = mid
    return trace[lo]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--physics", required=True)
    ap.add_argument("--dir3d", default="work/frames3d")
    ap.add_argument("--dirhud", default="work/hud")
    ap.add_argument("--stills", default="")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, default=0)
    ap.add_argument("--layer", default="both", choices=["both", "3d", "hud"])
    a = ap.parse_args(argv)
    a.dir3d, a.dirhud = os.path.abspath(a.dir3d), os.path.abspath(a.dirhud)

    doc = json.load(open(a.episode, encoding="utf-8"))
    ph = json.load(open(a.physics, encoding="utf-8"))
    pal = pal_of(doc)
    ctx = ctx_of(ph, doc["physics"])
    W, H = doc["canvas"]["w"], doc["canvas"]["h"]
    FPS = doc["canvas"]["fps"]
    n_frames = int(round(doc["canvas"]["duration_s"] * FPS))
    end = a.end or n_frames
    os.makedirs(a.dir3d, exist_ok=True)
    os.makedirs(a.dirhud, exist_ok=True)

    sc = cam = car = movers = None
    if a.layer in ("both", "3d"):
        sc, cam, car, movers = build_main(doc, pal, W, H)
    else:
        # a second scene in the same process loses every FONT object at render
        # time, so the HUD layer always gets a process of its own
        bpy.ops.wm.read_factory_settings(use_empty=True)
    sc_hud, camh, hw, hh = Hd.make_scene(W, H)
    hd = Hd.Hud(sc_hud, hw * 2, hh * 2)

    trace, beats, shots = ph["trace"], doc["beats"], doc["shots"]
    r0 = ph["run"]["run_time_s"]
    keys = [(0.0, 0.0), (2.2, 0.090), (5.2, 0.090), (9.0, 0.130), (11.5, 0.180),
            (14.0, 0.230), (16.5, 0.280), (19.0, 0.900), (24.0, r0)]

    def sim_time(vt):
        if vt >= 24.0:
            vt -= 24.0
        for (ta, sa), (tb, sb) in zip(keys, keys[1:]):
            if ta <= vt <= tb:
                f = 0.0 if tb == ta else (vt - ta) / (tb - ta)
                return sa + (sb - sa) * f
        return keys[-2][1]

    def beat_at(vt):
        for b in beats:
            if b["t0"] <= vt < b["t1"]:
                return b
        return beats[-1]

    if a.stills:
        want = [int(x) for x in a.stills.split(",") if x]
    else:
        want = list(range(a.start, end))

    win = bpy.context.window
    for fi in want:
        vt = fi / float(FPS)
        beat = beat_at(vt)
        st = sim_at(trace, sim_time(vt))
        name = "f_{:05d}.png".format(fi + 1)

        if a.layer in ("both", "3d"):
            if win is not None:
                win.scene = sc
            place(cam, shots[beat["shot"]])
            car.rotation_euler = (0.0, 0.0, -math.radians(st["psi_deg"]))
            for ob in movers:
                ob.location.y = -st["s"]
            sc.render.filepath = os.path.join(a.dir3d, name)
            bpy.ops.render.render(write_still=True)

        if a.layer in ("both", "hud"):
            span = beat["t1"] - beat["t0"]
            dsim = abs(sim_time(min(vt + span, 23.9)) - sim_time(vt))
            note = ""
            if dsim > 1e-6 and span / dsim > 1.5:
                note = "慢放 ×{:.0f}".format(span / dsim)
            draw(hd, pal, beat, ctx, {"s": st["s"], "contact": ctx["contact"]}, note)
            if win is not None:
                win.scene = sc_hud
            sc_hud.render.filepath = os.path.join(a.dirhud, name)
            bpy.ops.render.render(write_still=True)

        if fi % 30 == 0:
            print("FRAME {:05d} t={:.2f} s={:.3f} psi={:.2f}".format(
                fi, vt, st["s"], st["psi_deg"]))
    print("DONE {} frames".format(len(want)))


main()