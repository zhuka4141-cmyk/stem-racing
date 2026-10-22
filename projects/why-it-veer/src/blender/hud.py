"""HUD layer: pixel-space text and vector marks in a second Blender scene.

A 1080x1920 orthographic camera maps 1 Blender unit to 1 canvas pixel, so every
position below is literally the pixel coordinate the text will land on. Geometry
is rendered flat (Workbench FLAT light) with per-object colour.
"""
import bpy

FONTS = {
    "cjk": r"C:\Windows\Fonts\msyh.ttc",
    "cjk_b": r"C:\Windows\Fonts\msyhbd.ttc",
    "cond": r"C:\Windows\Fonts\bahnschrift.ttf",
    "mono": r"C:\Windows\Fonts\consola.ttf",
    "mono_b": r"C:\Windows\Fonts\consolab.ttf",
}

# fonts that carry no CJK glyphs - passing Chinese to these silently drops it
LATIN_ONLY = ("cond", "mono", "mono_b")

_cache = {}


def font(key):
    if key not in _cache:
        _cache[key] = bpy.data.fonts.load(FONTS[key], check_existing=True)
    return _cache[key]


def make_scene(width, height):
    sc = bpy.data.scenes.new("HUD")
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'OBJECT'
    sc.display.shading.show_object_outline = False
    sc.render.film_transparent = True
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.render.fps = 30

    cam_d = bpy.data.cameras.new("CAMHUD")
    cam = bpy.data.objects.new("CAMHUD", cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = float(height)
    # camera sits at z=100 and every glyph lives on z=0, which would land
    # exactly on the default clip_end of 100 and vanish
    cam_d.clip_start = 1.0
    cam_d.clip_end = 1000.0
    cam.location = (0, 0, 100)
    cam.rotation_euler = (0, 0, 0)
    return sc, cam, width / 2.0, height / 2.0


class Hud:
    def __init__(self, scene, w, h):
        self.sc = scene
        self.w = w
        self.h = h
        self.cx = w / 2.0
        self.cy = h / 2.0
        self.items = []

    # ---------------------------------------------------------------- text
    def text(self, body, x, y, size, fkey="cjk", color=(1, 1, 1, 1),
             align='LEFT', tracking=1.0, line=None):
        if fkey in LATIN_ONLY and any('\u3400' <= ch <= '\u9fff' for ch in body):
            raise ValueError(
                f"font '{fkey}' has no CJK glyphs, refusing to drop: {body!r} "
                f"-> use fkey='cjk'/'cjk_b' or split the run")
        cu = bpy.data.curves.new(f"t_{body[:8]}", 'FONT')
        cu.body = body
        cu.font = font(fkey)
        cu.size = float(size)
        cu.align_x = align
        cu.align_y = 'TOP'
        cu.space_character = tracking
        if line:
            cu.space_line = line
        ob = bpy.data.objects.new("T", cu)
        self.sc.collection.objects.link(ob)
        ob.location = (x - self.cx, self.cy - y, 0)
        ob.color = color
        self.items.append(ob)
        return ob

    # ------------------------------------------------------------ geometry
    def _mesh(self, verts, faces, color, z=0.0):
        me = bpy.data.meshes.new("m")
        me.from_pydata([(vx - self.cx, self.cy - vy, z) for vx, vy in verts], [], faces)
        me.update()
        ob = bpy.data.objects.new("M", me)
        self.sc.collection.objects.link(ob)
        ob.color = color
        self.items.append(ob)
        return ob

    def rect(self, x0, y0, x1, y1, color, z=0.0):
        return self._mesh([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], [(0, 1, 2, 3)], color, z)

    def stroke(self, x0, y0, x1, y1, color, w=2.0, z=0.0):
        """A line of width w drawn as a rotated quad."""
        import math
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L < 1e-6:
            return None
        nx, ny = -dy / L * w / 2.0, dx / L * w / 2.0
        v = [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]
        return self._mesh(v, [(0, 1, 2, 3)], color, z)

    def polyline(self, pts, color, w=2.0, z=0.0):
        out = []
        for a, b in zip(pts, pts[1:]):
            out.append(self.stroke(a[0], a[1], b[0], b[1], color, w, z))
        return out

    def tri(self, x0, y0, x1, y1, x2, y2, color, z=0.0):
        return self._mesh([(x0, y0), (x1, y1), (x2, y2)], [(0, 1, 2)], color, z)

    def dot(self, x, y, r, color, z=0.0, seg=16):
        import math
        v = [(x + r * math.cos(2 * math.pi * i / seg), y + r * math.sin(2 * math.pi * i / seg))
             for i in range(seg)]
        return self._mesh(v, [tuple(range(seg))], color, z)

    def ring(self, x, y, r, color, w=2.0, z=0.0, seg=24):
        import math
        pts = [(x + r * math.cos(2 * math.pi * i / seg), y + r * math.sin(2 * math.pi * i / seg))
               for i in range(seg + 1)]
        return self.polyline(pts, color, w, z)

    def clear(self):
        for ob in self.items:
            cu = getattr(ob.data, "font", None)
            bpy.data.objects.remove(ob, do_unlink=True)
            if cu is not None:
                pass
            try:
                bpy.data.meshes.remove(ob.data)
            except Exception:
                pass
        self.items = []
