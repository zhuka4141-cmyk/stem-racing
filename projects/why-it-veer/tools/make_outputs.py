"""Encode out/*.mp4 and write both cover PNGs.

The ffmpeg on PATH may be a Playwright build compiled with --disable-everything,
which only has libvpx_vp8 and cannot produce H.264 at all; the Jianzhi build is
the one with libx264, so it is addressed by absolute path.
"""
import argparse
import json
import os
import subprocess
import sys
import time

FFMPEG = r"C:\Users\lstcstudent\AppData\Local\Programs\Jianzhi\bin\ffmpeg.exe"


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        sys.stderr.write(p.stderr[-3000:])
        raise SystemExit("ffmpeg failed: " + str(cmd[:3]))
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="work/frames")
    ap.add_argument("--out", default="out")
    ap.add_argument("--cover-frame", default="work/frames/f_00031.png")
    ap.add_argument("--id", default="why-it-veer")
    a = ap.parse_args()

    from PIL import Image

    doc = json.load(open("episodes/why-it-veer.json", encoding="utf-8"))
    fps = doc["canvas"]["fps"]
    dur = doc["canvas"]["duration_s"]
    n = len([f for f in os.listdir(a.frames) if f.startswith("f_")])
    if n == 0:
        raise SystemExit("no frames in " + a.frames)
    os.makedirs(a.out, exist_ok=True)

    mp4 = os.path.join(a.out, "{}-{}-1080x1920.mp4".format(a.id, doc["episode_no"]))
    t0 = time.time()
    run([FFMPEG, "-y", "-framerate", str(fps), "-i",
         os.path.join(a.frames, "f_%05d.png"),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high",
         "-crf", "20", "-maxrate", "12M", "-bufsize", "24M",
         "-preset", "medium", "-movflags", "+faststart", "-an", mp4])
    enc = time.time() - t0

    cover = Image.open(a.cover_frame).convert("RGB")
    p1 = os.path.join(a.out, "{}-{}-1080x1920.png".format(a.id, doc["episode_no"]))
    p2 = os.path.join(a.out, "{}-{}-1080x1350.png".format(a.id, doc["episode_no"]))
    cover.save(p1)
    cover.crop((0, 285, 1080, 1635)).save(p2)

    probe = run([FFMPEG, "-hide_banner", "-i", mp4])
    size = os.path.getsize(mp4)
    print("MP4 {}  {:.2f} MB  {} frames  {:.1f}s encode".format(
        mp4, size / 1048576.0, n, enc))
    print("duration {:.2f}s  fps {}  nominal {:.2f}s".format(dur, fps, n / float(fps)))
    print("covers", os.path.getsize(p1), os.path.getsize(p2))
    print([l for l in probe.stderr.splitlines() if "Stream" in l or "Duration" in l])


main()