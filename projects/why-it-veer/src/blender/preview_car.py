"""Quick geometry check: build the car + track and render two stills.

Not part of the delivered video pipeline - this exists so the modelling can be
looked at before the full 780-frame render is committed to.
"""
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
PROJ = os.path.abspath(os.path.join(HERE, "..", ".."))

import scene3d as S  # noqa: E402

PAL = {
    "body":       (0.706, 0.694, 0.659, 1.0),
    "pod":        (0.647, 0.635, 0.600, 1.0),
    "canopy":     (0.180, 0.192, 0.208, 1.0),
    "accent":     (0.910, 0.349, 0.047, 1.0),
    "dark":       (0.145, 0.153, 0.165, 1.0),
    "wheel":      (0.086, 0.090, 0.098, 1.0),
    "hub":        (0.427, 0.435, 0.443, 1.0),
    "pin":        (0.910, 0.349, 0.047, 1.0),
    "com":        (0.980, 0.900, 0.250, 1.0),
    "floor":      (0.118, 0.125, 0.137, 1.0),
    "rail":       (0.239, 0.251, 0.267, 1.0),
    "wall":       (0.199, 0.208, 0.224, 1.0),
    "stripe_a":   (0.137, 0.145, 0.157, 1.0),
    "stripe_b":   (0.153, 0.161, 0.176, 1.0),
    "stripe_ticks": (0.290, 0.301, 0.318, 1.0),
}


def setup(w, h, transparent):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    d = sc.display.shading
    d.light = 'STUDIO'
    d.color_type = 'OBJECT'
    d.show_cavity = True
    d.cavity_type = 'BOTH'
    d.curvature_ridge_factor = 1.4
    d.curvature_valley_factor = 1.2
    d.show_object_outline = False
    d.show_specular_highlight = True
    d.studiolight_rotate_z = 0.6
    d.background_type = 'VIEWPORT'
    d.background_color = (0.047, 0.051, 0.059)
    sc.render.film_transparent = transparent
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    sc.view_settings.view_transform = 'Standard'
    sc.render.fps = 30
    return sc


def main():
    t0 = time.time()
    outdir = os.path.join(PROJ, "work", "car_preview")
    os.makedirs(outdir, exist_ok=True)

    sc = setup(1080, 1920, False)
    S.build_world(PAL, 20.0)
    S.build_stripes(PAL, 20.0)
    car = S.build_car(PAL, 0.004, -0.035)
    car.rotation_euler = (0.0, 0.0, 0.0)

    cam = S.make_camera(sc, 50.0)

    shots = {
        "hero": ((-0.215, -0.330, 0.185), (0.000, 0.010, 0.026), 55.0),
        "top":  ((0.006, 0.008, 0.520), (0.006, 0.008, 0.020), 50.0),
        "side": ((-0.520, 0.010, 0.075), (0.000, 0.010, 0.026), 60.0),
    }
    for name, (loc, tgt, lens) in shots.items():
        cam.data.lens = lens
        S.aim(cam, loc, tgt)
        sc.render.filepath = os.path.join(outdir, f"{name}.png")
        a = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"SHOT {name} {time.time() - a:.2f}s -> {sc.render.filepath}")

    print(f"PREVIEW_SECONDS={time.time() - t0:.2f}")


main()
