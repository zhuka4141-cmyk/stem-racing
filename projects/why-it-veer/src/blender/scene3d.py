"""3D layer: car, guide rail, lane wall, track surface. Metres, real scale.

Car space: guide-pin line at the origin, +Y forward, +X right, +Z up. The car
object's own origin sits on the guide line, so rotating it about Z pivots it
exactly about the guide pin - which is the constraint the whole video is about.

Why the guide is on the centreline: a side-mounted guide puts the pin tens of
millimetres off the centre of mass, and the yaw moment m*a*d would then be about
ten times what a real car survives. Real cars put the guide on the centreline,
so the CoM offset under test is a few millimetres, not tens.
"""
import math
import bmesh
import bpy
from mathutils import Vector


def rounded_rect(y, hw, z0, z1, r, seg=3):
    pts = []
    corners = [(hw - r, z1 - r, 0.0), (-hw + r, z1 - r, math.pi / 2),
               (-hw + r, z0 + r, math.pi), (hw - r, z0 + r, 3 * math.pi / 2)]
    for cx, cz, a0 in corners:
        for i in range(seg + 1):
            a = a0 + (math.pi / 2) * i / seg
            pts.append((cx + r * math.cos(a), y, cz + r * math.sin(a)))
    return pts


def loft(name, rings, color):
    me = bpy.data.meshes.new(name)
    verts = [p for ring in rings for p in ring]
    n = len(rings[0])
    faces = []
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
    faces.append(tuple(range(n - 1, -1, -1)))
    base = (len(rings) - 1) * n
    faces.append(tuple(base + j for j in range(n)))
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.color = color
    return ob


def box(name, x0, x1, y0, y1, z0, z1, color, parent=None):
    me = bpy.data.meshes.new(name)
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(v, [], f)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.color = color
    if parent:
        ob.parent = parent
    return ob


def cylinder(name, r, depth, loc, rot, color, seg=20, parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r, depth=depth)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    ob.color = color
    for p in me.polygons:
        p.use_smooth = True
    if parent:
        ob.parent = parent
    return ob


BODY_STATIONS = [
    # (y, half_width, z_bottom, z_top)
    (-0.082, 0.0260, 0.0145, 0.0290),
    (-0.070, 0.0330, 0.0135, 0.0330),
    (-0.030, 0.0345, 0.0130, 0.0355),
    (0.020, 0.0345, 0.0130, 0.0345),
    (0.058, 0.0310, 0.0135, 0.0300),
    (0.074, 0.0345, 0.0135, 0.0288),
    (0.090, 0.0240, 0.0150, 0.0265),
    (0.110, 0.0140, 0.0170, 0.0235),
    (0.126, 0.0068, 0.0185, 0.0215),
    (0.133, 0.0032, 0.0195, 0.0210),
]

PIN_X = 0.0030
PIN_R = 0.0012
RAIL_HW = 0.0015
WALL_X = 0.0375
L_NOSE = 0.090


def build_car(pal, com_x, com_y):
    root = bpy.data.objects.new("CAR", None)
    root.empty_display_size = 0.01
    bpy.context.scene.collection.objects.link(root)

    rings = []
    for y, hw, z0, z1 in BODY_STATIONS:
        rr = min(hw, (z1 - z0) / 2.0) * 0.5
        rings.append(rounded_rect(y, hw, z0, z1, rr))
    body = loft("body", rings, pal["body"])
    body.parent = root

    for name, x0, x1, y0, y1, z0, z1, key in [
        ("canopy", -0.014, 0.014, -0.034, 0.026, 0.0350, 0.0462, "canopy"),
        ("wing", -0.032, 0.032, -0.095, -0.083, 0.0400, 0.0436, "accent"),
        ("wing_fin_l", -0.032, -0.028, -0.095, -0.083, 0.0290, 0.0406, "dark"),
        ("wing_fin_r", 0.028, 0.032, -0.095, -0.083, 0.0290, 0.0406, "dark"),
        ("nose_skid", -0.005, 0.005, 0.118, 0.133, 0.0172, 0.0196, "dark"),
        ("pod_l", -0.0345, -0.0175, -0.062, 0.048, 0.0245, 0.0348, "pod"),
        ("pod_r", 0.0175, 0.0345, -0.062, 0.048, 0.0245, 0.0348, "pod"),
    ]:
        box(name, x0, x1, y0, y1, z0, z1, pal[key], parent=root)

    for i, (wx, wy) in enumerate([(-0.030, 0.075), (0.030, 0.075),
                                  (-0.030, -0.075), (0.030, -0.075)]):
        cylinder(f"wheel{i}", 0.0150, 0.0080, (wx, wy, 0.0150),
                 (0.0, math.pi / 2, 0.0), pal["wheel"], seg=24, parent=root)
        cylinder(f"hub{i}", 0.0072, 0.0092, (wx, wy, 0.0150),
                 (0.0, math.pi / 2, 0.0), pal["hub"], seg=16, parent=root)
        cylinder(f"axle{i}", 0.0016, 0.0620, (0.0, wy, 0.0150),
                 (0.0, math.pi / 2, 0.0), pal["dark"], seg=10, parent=root)

    for sx in (-1, 1):
        cylinder(f"pin{sx}", PIN_R, 0.0125, (sx * PIN_X, 0.0, 0.0088), (0, 0, 0),
                 pal["pin"], seg=14, parent=root)
    box("pin_arm", -0.0105, 0.0105, -0.0042, 0.0042, 0.0140, 0.0178, pal["pin"], parent=root)

    cylinder("com", 0.0034, 0.0016, (com_x, com_y, 0.0358),
             (0, 0, 0), pal["com"], seg=18, parent=root)
    cylinder("com_core", 0.0014, 0.0026, (com_x, com_y, 0.0358),
             (0, 0, 0), pal["dark"], seg=12, parent=root)
    return root


def build_world(pal, track_len_m):
    parts = {}
    parts["floor"] = box("floor", -0.12, 0.12, -3.0, track_len_m + 3.0, -0.006, 0.0, pal["floor"])
    parts["rail"] = box("rail", -RAIL_HW, RAIL_HW, -3.0, track_len_m + 3.0, 0.0, 0.0110, pal["rail"])
    parts["rail_top"] = box("rail_top", -RAIL_HW, RAIL_HW, -3.0, track_len_m + 3.0,
                            0.0110, 0.0122, pal["accent"])
    parts["wall"] = box("wall", WALL_X, WALL_X + 0.006, -3.0, track_len_m + 3.0,
                        0.0, 0.0170, pal["wall"])
    parts["wall_top"] = box("wall_top", WALL_X, WALL_X + 0.006, -3.0, track_len_m + 3.0,
                            0.0170, 0.0186, pal["accent"])
    return parts


def build_stripes(pal, track_len_m, step=1.0):
    obs = []
    for i in range(-3, int(track_len_m / step) + 4):
        y0 = i * step
        c = pal["stripe_a"] if (i % 2 == 0) else pal["stripe_b"]
        obs.append(box(f"st{i}", -0.120, -0.048, y0, y0 + step, 0.0, 0.0010, c))
        obs.append(box(f"sk{i}", -0.048, -0.042, y0, y0 + step, 0.0, 0.0013, pal["stripe_ticks"]))
    return obs


def make_camera(scene, lens=50.0):
    cd = bpy.data.cameras.new("CAM3D")
    cd.lens = lens
    cd.sensor_fit = 'VERTICAL'
    cam = bpy.data.objects.new("CAM3D", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim(cam, loc, target):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
