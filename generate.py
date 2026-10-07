# -*- coding: utf-8 -*-
"""Generation batch : python generate.py [--style KEY] [--stem STEM] [--variants N] [--limit N]"""
import argparse
import sys
import time

import xenostyle as xs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", help="cle de style (defaut: tous)", default=None)
    ap.add_argument("--stem", help="portrait precis (defaut: tous)", default=None)
    ap.add_argument("--variants", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0, help="limite de portraits (test)")
    ap.add_argument("--skip-existing", action="store_true", default=True)
    ap.add_argument("--no-skip-existing", dest="skip_existing", action="store_false")
    ap.add_argument("--denoise", type=float, default=None)
    ap.add_argument("--boost", action="store_true",
                    help="style renforce : denoise>=0.75, controlnet allege, lora +0.1")
    ap.add_argument("--include-excluded", action="store_true",
                    help="genere aussi les images marquees 'a garder telles quelles'")
    args = ap.parse_args()

    if not xs.comfy_alive():
        print("ERREUR: ComfyUI ne repond pas sur " + xs.COMFY_URL)
        sys.exit(1)

    cfg = xs.load_styles()
    style_keys = [args.style] if args.style else list(cfg["styles"].keys())
    portraits = xs.list_portraits()
    if not args.include_excluded:
        excluded = xs.load_excluded()
        portraits = [p for p in portraits if p["stem"] not in excluded]
    if args.stem:
        portraits = [p for p in portraits if p["stem"] == args.stem]
    if args.limit:
        portraits = portraits[:args.limit]

    total = len(style_keys) * len(portraits) * args.variants
    print("%d generations (%d styles x %d portraits x %d variantes)" %
          (total, len(style_keys), len(portraits), args.variants))

    import os
    done = 0
    failed = []
    t0 = time.time()
    for sk in style_keys:
        for p in portraits:
            var_dir = os.path.join(xs.STYLIZED_DIR, sk, p["stem"])
            existing = len([f for f in os.listdir(var_dir)]) if os.path.isdir(var_dir) else 0
            for i in range(args.variants):
                done += 1
                if args.skip_existing and existing >= args.variants:
                    continue
                try:
                    path = xs.generate_variant(cfg, sk, p, denoise=args.denoise,
                                               boost=args.boost)
                    el = time.time() - t0
                    eta = el / done * (total - done)
                    print("[%d/%d] %s / %s OK (eta %dmin)" %
                          (done, total, sk, p["stem"], eta / 60))
                except Exception as e:
                    failed.append((sk, p["stem"], str(e)[:200]))
                    print("[%d/%d] %s / %s ECHEC: %s" %
                          (done, total, sk, p["stem"], str(e)[:200]))
    print("Termine. %d echecs." % len(failed))
    for f in failed[:30]:
        print("  ECHEC:", f)


if __name__ == "__main__":
    main()
