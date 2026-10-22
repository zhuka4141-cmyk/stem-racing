"""Solve camera framing: distance for size, shift_y for vertical placement."""
import math
import os
import sys

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view as W2C

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scene3d as S  # noqa: E402

W, H = 1080, 1920
PAL = {k: (0.5, 0.5, 0.5, 1.0) for k in
       ("body", "pod", "canopy", "accent", "dark", "wheel", "hub", "pin", "com",
        "floor", "rail", "wall", "stripe_a", "stripe_b", "stripe_ticks")}
CAR_MIN = (-0.0345, -0.0950, 0.0)
CAR_MAX = (0.0345, 0.1335, 0.0470)


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    S.build_world(PAL, 20.0)
    S.build_stripes(PAL, 20.0)
    S.build_car(PAL, 0.004, -0.035)
    return sc, S.make_camera(sc, 50.0)


def px(sc, cam, p):
    v = W2C(sc, cam, Vector(p))
    return (v.x * W, (1.0 - v.y) * H)


def box_of(sc, cam):
    xs, ys = [], []
    for ix in (CAR_MIN[0], CAR_MAX[0]):
        for iy in (CAR_MIN[1], CAR_MAX[1]):
            for iz in (CAR_MIN[2], CAR_MAX[2]):
                x, y = px(sc, cam, (ix, iy, iz))
                xs.append(x); ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def shot(sc, cam, tgt, dist, az, el, lens, shift=0.0):
    az, el = math.radians(az), math.radians(el)
    d = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
    cam.data.lens = lens
    cam.data.shift_y = shift
    cam.location = (tgt[0] + dist * d[0], tgt[1] + dist * d[1], tgt[2] + dist * d[2])
    S.aim(cam, cam.location, tgt)
    bpy.context.view_layer.update()
    return box_of(sc, cam)


def main():
    sc, cam = setup()
    tgt = (0.006, 0.020, 0.024)
    print("--- shift sweep, hero dist 1.10 ---")
    for sh in (-0.12, -0.08, -0.04, 0.0, 0.04):
        x0, x1, y0, y1 = shot(sc, cam, tgt, 1.10, -52, 30, 50, sh)
        print("shift {:+.2f}  x[{:4.0f},{:4.0f}] y[{:4.0f},{:4.0f}] cy={:4.0f} w={:4.0f}".format(
            sh, x0, x1, y0, y1, (y0 + y1) / 2, x1 - x0))

    print("--- candidate final shots ---")
    cands = [
        ("hero",   (0.010, 0.020, 0.022), 1.12, -52, 28, 50, -0.055, 900),
        ("top",    (0.016, 0.030, 0.018), 0.66,   0, 89, 50, -0.030, 900),
        ("topfar", (0.012, 0.020, 0.018), 1.05,   0, 89, 50,  0.000, 900),
        ("front",  (0.010, 0.075, 0.016), 0.60, 168, 11, 50,  0.000, 900),
        ("payoff", (0.006, 0.018, 0.026), 1.55, -46, 22, 50, -0.030, 880),
    ]
    for name, t, dist, az, el, lens, sh, want_cy in cands:
        x0, x1, y0, y1 = shot(sc, cam, t, dist, az, el, lens, sh)
        print("{:<7} x[{:4.0f},{:4.0f}] y[{:4.0f},{:4.0f}] w={:4.0f} h={:4.0f} "
              "cx={:4.0f} cy={:4.0f}".format(name, x0, x1, y0, y1,
                                              x1 - x0, y1 - y0,
                                              (x0 + x1) / 2, (y0 + y1) / 2))
        # a 4 mm lateral offset projects to how many pixels?
        a = px(sc, cam, (0.0, 0.09, 0.021))
        b = px(sc, cam, (0.004, 0.09, 0.021))
        print("        4mm@nose -> {:.1f} px ; 3mm gap -> {:.1f} px".format(
            abs(b[0] - a[0]), abs(px(sc, cam, (S.WALL_X, 0.09, 0.009))[0] - a[0])))


main()