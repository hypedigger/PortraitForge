# -*- coding: utf-8 -*-
"""Re-detourage des images deja generees avec le matte ISNet-anime.

Reconstruit l'image d'origine (rgb*a + blanc*(1-a) = sortie ComfyUI exacte),
recalcule l'alpha via xenostyle.refine_alpha (ISNet limite au masque du
portrait d'origine) puis re-applique unmatte_white — identique au pipeline
des nouvelles generations.

- les uploads Custom (sans chunk 'parameters') sont ignores
- idempotent : chaque image traitee recoit un chunk 'matting=isnet-v1'
- metadonnees PNG et date de modification preservees

  python rematte.py [--limit N] [--style KEY] [--stem STEM] [--purge-thumbs]
"""
import argparse
import glob
import os
import shutil
import sys
import time

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import xenostyle as xs


def reprocess(path, alpha_cache):
    with Image.open(path) as im0:
        meta = dict(getattr(im0, "text", None) or {})
        im = im0.convert("RGBA")
    if meta.get("matting") == "isnet-v1":
        return "deja-fait"
    parts = os.path.normpath(path).split(os.sep)
    style, stem = parts[-3], parts[-2]
    if style == xs.CUSTOM_KEY and not meta.get("parameters"):
        return "upload-ignore"
    orig = os.path.join(xs.ORIGINALS_DIR, stem + ".png")
    if not os.path.exists(orig):
        return "orig-absent"

    rgba = np.asarray(im, dtype=np.float32)
    a = rgba[..., 3:] / 255.0
    on_white = (rgba[..., :3] * a + 255.0 * (1.0 - a)).astype(np.uint8)
    out = Image.fromarray(on_white, "RGB")

    alpha0 = alpha_cache.get(stem)
    if alpha0 is None:
        with Image.open(orig) as o:
            alpha0 = o.convert("RGBA").getchannel("A")
        alpha_cache[stem] = alpha0
    a0 = alpha0 if alpha0.size == out.size else alpha0.resize(out.size, Image.LANCZOS)

    new_alpha = xs.refine_alpha(out, a0)
    final = xs.unmatte_white(out, new_alpha)

    pnginfo = PngInfo()
    for k, v in meta.items():
        pnginfo.add_text(k, str(v))
    pnginfo.add_text("matting", "isnet-v1")
    st = os.stat(path)
    tmp = path + ".remat"
    final.save(tmp, "PNG", pnginfo=pnginfo)
    os.replace(tmp, path)
    os.utime(path, (st.st_atime, st.st_mtime))
    return "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--style", default=None)
    ap.add_argument("--stem", default=None)
    ap.add_argument("--purge-thumbs", action="store_true",
                    help="vide le cache de miniatures des variantes a la fin")
    args = ap.parse_args()

    pat = os.path.join(xs.STYLIZED_DIR, args.style or "*", args.stem or "*", "*.png")
    files = sorted(glob.glob(pat), key=os.path.getmtime)
    if args.limit:
        files = files[:args.limit]
    print("%d images a traiter" % len(files), flush=True)

    stats, cache = {}, {}
    t0 = time.time()
    for i, f in enumerate(files, 1):
        try:
            r = reprocess(f, cache)
        except Exception as e:
            r = "ERREUR"
            print("ERREUR %s : %s" % (f, str(e)[:150]), flush=True)
        stats[r] = stats.get(r, 0) + 1
        if i % 100 == 0 or i == len(files):
            el = time.time() - t0
            eta = el / i * (len(files) - i)
            print("[%d/%d] %s | eta %dmin" % (i, len(files), stats, eta / 60), flush=True)

    if args.purge_thumbs:
        tdir = os.path.join(xs.APP_DIR, ".thumbs", xs.current_game()["id"])
        if os.path.isdir(tdir):
            for d in os.listdir(tdir):
                if d != "_originals":
                    shutil.rmtree(os.path.join(tdir, d), ignore_errors=True)
            print("cache de miniatures des variantes vide", flush=True)
    print("Termine :", stats, flush=True)


if __name__ == "__main__":
    main()
