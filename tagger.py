# -*- coding: utf-8 -*-
"""Auto-tagging des portraits (WD ViT tagger v3, onnxruntime CPU).

Detecte cheveux/yeux/accessoires sur chaque portrait original et ecrit
portrait_tags.json ; ces tags sont injectes dans le prompt a la generation
pour garder les bonnes couleurs.

  python tagger.py [--stem STEM] [--threshold 0.35] [--force]
"""
import argparse
import csv
import json
import os
import urllib.request

import numpy as np
from PIL import Image

import xenostyle as xs

TAGGER_DIR = os.path.join(xs.APP_DIR, ".tagger")
MODEL_URL = "https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/model.onnx"
TAGS_URL = "https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main/selected_tags.csv"
TAGS_FILE = xs.TAGS_FILE  # suit le jeu courant

# tags pertinents pour la fidelite du personnage (couleurs, traits, accessoires)
KEEP_WORDS = (
    "hair", "eye", "skin", "glasses", "sunglasses", "hat", "helmet", "beard",
    "mustache", "stubble", "facial hair", "scar", "earring", "mask", "headband",
    "bandana", "animal ears", "tail", "horn", "freckles", "mole", "eyepatch",
    "bald", "ponytail", "braid", "twintail", "bangs", "ahoge", "sideburns",
    "goatee", "wrinkle", "muscular", "fang", "turban", "crown", "tiara", "hood",
    "goggles", "monocle", "heterochromia", "robot", "android", "armor", "beret",
    "cap", "scarf", "necklace", "collar", "bowtie", "necktie", "jacket", "coat",
    "shirt", "vest", "cape", "uniform", "furry", "colored skin", "old man",
    "old woman", "child", "beak", "whiskers",
)
DROP_TAGS = {"1boy", "1girl", "male focus", "solo", "portrait", "looking at viewer"}
MAX_TAGS = 14


def _download(url, dest):
    if os.path.exists(dest):
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("telechargement", os.path.basename(dest), "...")
    urllib.request.urlretrieve(url, dest + ".part")
    os.replace(dest + ".part", dest)


def load_model():
    import onnxruntime as ort
    model_path = os.path.join(TAGGER_DIR, "model.onnx")
    tags_path = os.path.join(TAGGER_DIR, "selected_tags.csv")
    _download(MODEL_URL, model_path)
    _download(TAGS_URL, tags_path)
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    tags = []
    with open(tags_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tags.append((row["name"].replace("_", " "), int(row["category"])))
    return sess, tags


def prep(path, size):
    with Image.open(path) as im:
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im).convert("RGB")
    im = im.resize((size, size), Image.BICUBIC)
    arr = np.asarray(im, dtype=np.float32)[:, :, ::-1]  # RGB -> BGR
    return arr[None, ...]


def tag_image(sess, tags, path, threshold):
    size = sess.get_inputs()[0].shape[1]
    probs = sess.run(None, {sess.get_inputs()[0].name: prep(path, size)})[0][0]
    found = []
    for (name, cat), p in zip(tags, probs):
        if cat != 0 or p < threshold or name in DROP_TAGS:
            continue
        if any(w in name for w in KEEP_WORDS):
            found.append((name, float(p)))
    found.sort(key=lambda x: -x[1])
    return [n for n, _ in found[:MAX_TAGS]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stem", default=None)
    ap.add_argument("--threshold", type=float,
                    default=xs.load_app_settings().get("tag_threshold", 0.35))
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    existing = {}
    if os.path.exists(TAGS_FILE):
        with open(TAGS_FILE, "r", encoding="utf-8") as f:
            existing = json.load(f)

    sess, tags = load_model()
    portraits = xs.list_portraits()
    if args.stem:
        portraits = [p for p in portraits if p["stem"] == args.stem]
    for i, p in enumerate(portraits):
        if p["stem"] in existing and not args.force:
            continue
        found = tag_image(sess, tags, p["path"], args.threshold)
        existing[p["stem"]] = ", ".join(found)
        print("[%d/%d] %s -> %s" % (i + 1, len(portraits), p["stem"],
                                    existing[p["stem"]]))
        with open(TAGS_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=1, ensure_ascii=False)
    print("Termine :", len(existing), "portraits tagges ->", TAGS_FILE)


if __name__ == "__main__":
    main()
