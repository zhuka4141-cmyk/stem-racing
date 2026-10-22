"""Camera calibration without rendering.

Projects known world points (car bounding box corners, nose tip, guide pin,
lane-wall contact) into pixel coordinates with world_to_camera_view, so framing
can be solved numerically instead of by rendering and squinting.
"""
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view as W2C

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scene3d as S  # noqa: E402

W, H = 1080, 1920
PAL = {k: (0.5, 0.5, 0.5, 1.0) for k in
       ("body", "pod", "canopy", "accent", "dark", "wheel", "hub", "pin", "com",
        "floor", "rail", "wall", "stripe_a", "stripe_b", "stripe_ticks")}

# car extents in car space (x right, y forward, z up)
CAR_MIN = (-0.0345, -0.0950, 0.0000)
CAR_MAX = (0.0345, 0.1335, 0.0470)
COM = (0.0040, -0.0350, 0.0358)
NOSE_R = (0.0032, 0.1330, 0.0205)      # right corner of the nose tip
PIN = (0.0000, 0.0000, 0.0090)


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = W
    sc.render.resolution_y = H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    S.build_world(PAL, 20.0)
    S.build_stripes(PAL, 20.0)
    S.build_car(PAL, COM[0], COM[1])
    cam = S.make_camera(sc, 50.0)
    return sc, cam


def px(sc, cam, p):
    v = W2C(sc, cam, __import__("mathutils").Vector(p))
    return (v.x * W, (1.0 - v.y) * H)


def place(cam, target, dist, az_deg, el_deg, lens):
    az = math.radians(az_deg)
    el = math.radians(el_deg)
    d = (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))
    loc = (target[0] + dist * d[0], target[1] + dist * d[1], target[2] + dist * d[2])
    cam.data.lens = lens
    S.aim(cam, loc, target)
    bpy.context.view_layer.update()
    return loc


def report(sc, cam, name, dist=None):
    xs, ys = [], []
    for ix in (CAR_MIN[0], CAR_MAX[0]):
        for iy in (CAR_MIN[1], CAR_MAX[1]):
            for iz in (CAR_MIN[2], CAR_MAX[2]):
                x, y = px(sc, cam, (ix, iy, iz))
                xs.append(x); ys.append(y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    nx, ny = px(sc, cam, NOSE_R)
    cx, cy = px(sc, cam, COM)
    pxx, pyy = px(sc, cam, PIN)
    # nearest wall point ahead of the nose, at the same station as the nose
    wx, wy = px(sc, cam, (S.WALL_X, 0.1330, 0.0090))
    print("{:<10} box x[{:4.0f},{:4.0f}] y[{:4.0f},{:4.0f}] "
          "w={:4.0f} h={:4.0f} | nose({:4.0f},{:4.0f}) com({:4.0f},{:4.0f}) "
          "pin({:4.0f},{:4.0f}) wall({:4.0f},{:4.0f})".format(
              name, x0, x1, y0, y1, x1 - x0, y1 - y0,
              nx, ny, cx, cy, pxx, pyy, wx, wy))
    return (x0, x1, y0, y1)


def main():
    sc, cam = setup()
    print("canvas {}x{}  live x60-930 y240-1480".format(W, H))
    shots = [
        ("hero",  (0.006, 0.020, 0.024), -52, 30, 50),
        ("hero34", (0.006, 0.010, 0.024), -35, 24, 50),
        ("top",   (0.014, 0.030, 0.020), 0, 89, 50),
        ("front", (0.006, 0.090, 0.018), 165, 12, 50),
        ("side",  (0.000, 0.020, 0.026), -88, 8, 50),
    ]
    for name, tgt, az, el, lens in shots:
        for dist in (0.50, 0.70, 0.90, 1.10):
            place(cam, tgt, dist, az, el, lens)
            report(sc, cam, "{}/{:.2f}".format(name, dist))


main()