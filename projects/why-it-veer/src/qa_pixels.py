"""Pixel-level QA for rendered frames. No eyeballing: every claim is a measurement."""
import json
import sys
import numpy as np
from PIL import Image, ImageFont, ImageDraw


def load(path):
    im = Image.open(path).convert("RGBA")
    return np.asarray(im).astype(np.float32) / 255.0


def ink_mask(a, thr=0.02):
    """Pixels that carry content (alpha above threshold)."""
    return a[..., 3] > thr


def bbox(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return {"x0": int(xs.min()), "x1": int(xs.max()), "y0": int(ys.min()), "y1": int(ys.max())}


def band_bbox(a, y0, y1, x0=0, x1=None):
    if x1 is None:
        x1 = a.shape[1]
    sub = a[y0:y1, x0:x1]
    b = bbox(ink_mask(sub))
    if b is None:
        return None
    return {"x0": b["x0"] + x0, "x1": b["x1"] + x0, "y0": b["y0"] + y0, "y1": b["y1"] + y0,
            "w": b["x1"] - b["x0"] + 1, "h": b["y1"] - b["y0"] + 1}


def coverage(a, y0, y1, x0=0, x1=None):
    if x1 is None:
        x1 = a.shape[1]
    m = ink_mask(a[y0:y1, x0:x1])
    return float(m.mean())


def pil_render(text, font_path, px, index=0):
    """Reference bitmap straight from FreeType via Pillow."""
    f = ImageFont.truetype(font_path, px, index=index)
    l, t, r, b = f.getbbox(text)
    im = Image.new("L", (max(1, r - l + 2), max(1, b - t + 2)), 0)
    ImageDraw.Draw(im).text((1 - l, 1 - t), text, font=f, fill=255)
    return np.asarray(im).astype(np.float32) / 255.0


def ncc(a, b):
    """Normalised cross-correlation of two bitmaps resized to the same grid."""
    from PIL import Image as I
    size = (160, 160)
    A = np.asarray(I.fromarray((a * 255).astype(np.uint8)).resize(size, I.LANCZOS), dtype=np.float32)
    B = np.asarray(I.fromarray((b * 255).astype(np.uint8)).resize(size, I.LANCZOS), dtype=np.float32)
    A -= A.mean()
    B -= B.mean()
    d = np.sqrt((A * A).sum() * (B * B).sum())
    return float((A * B).sum() / d) if d > 0 else 0.0


def crop_alpha(a, box):
    x0, x1, y0, y1 = box["x0"], box["x1"], box["y0"], box["y1"]
    return a[y0:y1 + 1, x0:x1 + 1, 3]


if __name__ == "__main__":
    path = sys.argv[1]
    a = load(path)
    print(json.dumps({"shape": list(a.shape), "alpha_max": float(a[..., 3].max()),
                      "alpha_mean": float(a[..., 3].mean()),
                      "content_bbox": bbox(ink_mask(a))}, indent=1))
    for y0, y1, name in [(200, 320, "hook"), (380, 460, "sub"), (480, 580, "mono"), (1380, 1440, "label")]:
        print(name, band_bbox(a, y0, y1))
