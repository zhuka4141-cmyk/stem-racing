# 只保留项目里真正用到的字。Windows 自带的 Noto Sans SC 有 17 MB，
# 全塞进 pck 会让 web 端加载很难看，所以先按源码扫一遍字符再裁。
import json
import os
import sys
import tempfile

from fontTools import subset as ftsub
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

WINDIR = os.environ.get("WINDIR", r"C:\Windows")
FONTS = os.path.join(WINDIR, "Fonts")

JOBS = [
    # (源文件, 输出, 变量轴设置 或 None, 额外字符)
    ("NotoSansSC-VF.ttf", "cjk.ttf", {"wght": 400}),
    ("NotoSansSC-VF.ttf", "cjk-bold.ttf", {"wght": 700}),
    ("consola.ttf", "mono.ttf", None),
]


def collect(paths):
    chars = set()
    for p in paths:
        with open(p, "r", encoding="utf-8") as f:
            chars |= set(f.read())
    chars |= set(chr(c) for c in range(32, 127))
    chars |= set("·×Ø°₂↔—…，：；（）「」／０１２３４５６７８９")
    chars = {c for c in chars if 32 <= ord(c) and not (0xD800 <= ord(c) <= 0xDFFF)}
    return "".join(sorted(chars))


def make(src_path, out_path, axes, text):
    font = TTFont(src_path)
    tmp = None
    if axes:
        tags = set()
        if font.get("fvar") is not None:
            tags = {a.axisTag for a in font["fvar"].axes}
        axes = {k: v for k, v in axes.items() if k in tags}
    if axes:
        font = instancer.instantiateVariableFont(font, axes, updateFontNames=True)
    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False)
    tmp.close()
    font.save(tmp.name)

    opts = ftsub.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.recalc_timestamp = False
    opts.drop_tables += ["DSIG", "hdmx", "VDMX"]
    opts.desubroutinize = True

    f2 = ftsub.load_font(tmp.name, opts)
    ss = ftsub.Subsetter(options=opts)
    ss.populate(text=text)
    ss.subset(f2)
    f2.flavor = None
    f2.save(out_path)
    f2.close()
    try:
        os.unlink(tmp.name)
    except OSError:
        pass
    return os.path.getsize(out_path)


def main():
    project = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    outdir = os.path.join(project, "godot", "assets", "fonts")
    os.makedirs(outdir, exist_ok=True)

    sources = []
    for sub in ("scripts", "scenes"):
        d = os.path.join(project, "godot", sub)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.endswith((".gd", ".tscn", ".godot")):
                sources.append(os.path.join(d, name))
    text = collect(sources)
    print("glyph pool: %d chars from %d files" % (len(text), len(sources)))

    for src, out, axes in JOBS:
        sp = os.path.join(FONTS, src)
        if not os.path.exists(sp):
            print("MISSING %s" % sp)
            sys.exit(2)
        size = make(sp, os.path.join(outdir, out), axes, text)
        print("%-14s -> %-14s %9d bytes" % (src, out, size))


if __name__ == "__main__":
    main()