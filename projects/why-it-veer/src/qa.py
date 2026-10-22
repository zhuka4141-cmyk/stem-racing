"""Deterministic frame inspection: no vision model, no eyeballing.

Prints (a) an ASCII density map so composition can be judged in text, and
(b) exact ink bounding boxes, per band and overall.

    python src/qa.py <png...> [--cols 56] [--bands 240:1480:live]
                     [--alpha] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import sys

import numpy as np
from PIL import Image

RAMP = " .:-=+*#%@"


def load(path, use_alpha):
    """Returns (rgba, display_map, ink 0..1).

    Composite plates are contrast-stretched between their 3rd and 99.5th
    luminance percentile. Thresholding absolute luminance instead counted the
    dark track floor as ink and reported 70-99% coverage on frames that were
    mostly background, which made the map useless for judging composition.
    """
    im = Image.open(path)
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    rgb = a[..., :3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    if use_alpha:
        return a, np.maximum(lum, a[..., 3]), a[..., 3]
    lo, hi = np.percentile(lum, [3.0, 99.5])
    hi = max(hi, lo + 1e-4)
    stretch = np.clip((lum - lo) / (hi - lo), 0.0, 1.0)
    return a, stretch, stretch


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def ascii_map(disp, cols):
    h, w = disp.shape
    rows = max(1, int(round(cols * h / w * 0.5)))
    ys = np.linspace(0, h, rows + 1).astype(int)
    xs = np.linspace(0, w, cols + 1).astype(int)
    out = []
    for r in range(rows):
        line = []
        for c in range(cols):
            blk = disp[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            v = float(blk.max()) if blk.size else 0.0
            line.append(RAMP[min(len(RAMP) - 1, int(v * (len(RAMP) - 1) + 0.5))])
        out.append("".join(line))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--cols", type=int, default=56)
    ap.add_argument("--bands", nargs="*", default=[])
    ap.add_argument("--alpha", action="store_true")
    ap.add_argument("--thr", type=float, default=0.15)
    ap.add_argument("--json")
    a = ap.parse_args()

    report = {}
    for path in a.files:
        arr, disp, ink = load(path, a.alpha)
        h, w = ink.shape
        mask = ink > a.thr
        bb = bbox(mask)
        print("=" * (a.cols + 12))
        print(path)
        print("  {}x{}  alpha={}  ink_px={}  coverage={:.2f}%".format(
            w, h, a.alpha, int(mask.sum()), mask.mean() * 100))
        print("  ink_bbox={}  peak={:.3f}".format(bb, float(disp.max())))

        info = {"w": w, "h": h, "ink_px": int(mask.sum()), "bbox": bb, "bands": {}}
        for spec in a.bands:
            y0, y1, label = spec.split(":")
            y0, y1 = int(y0), int(y1)
            sub = mask[y0:y1]
            sb = bbox(sub)
            if sb is None:
                print("  band {:<8} y[{},{})  EMPTY".format(label, y0, y1))
                info["bands"][label] = None
            else:
                x0, sy0, x1, sy1 = sb
                print("  band {:<8} y[{},{})  x[{},{}] y[{},{}] fill={:.1f}%".format(
                    label, y0, y1, x0, x1, y0 + sy0, y0 + sy1, sub.mean() * 100))
                info["bands"][label] = [x0, y0 + sy0, x1, y0 + sy1]

        for line in ascii_map(disp, a.cols):
            print("  " + line)
        report[path] = info

    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=1)
        print("-> " + a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
