# -*- coding: utf-8 -*-
"""Genere app.ico pour PortraitForge : buste incandescent sur fond de forge."""
import os

from PIL import Image, ImageDraw, ImageFilter

APP_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = 512


def draw_base():
    im = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # fond : nuit de forge (anthracite -> pourpre sombre)
    for y in range(BASE):
        t = y / BASE
        d.line([(0, y), (BASE, y)],
               fill=(int(24 + t * 30), int(22 + t * 6), int(34 + t * 14), 255))
    # lueur des braises en bas
    glow = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.ellipse([-140, BASE - 210, BASE + 140, BASE + 240], fill=(255, 110, 20, 190))
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    im.alpha_composite(glow)
    # halo derriere la tete
    halo = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    dh = ImageDraw.Draw(halo)
    dh.ellipse([116, 60, 396, 340], fill=(255, 170, 60, 110))
    halo = halo.filter(ImageFilter.GaussianBlur(48))
    im.alpha_composite(halo)
    # buste : contour "metal chauffe" puis coeur clair
    d = ImageDraw.Draw(im)
    d.ellipse([166, 86, 346, 266], fill=(255, 140, 40, 255))          # tete (liseret)
    d.ellipse([96, 260, 416, 560], fill=(255, 140, 40, 255))          # epaules (liseret)
    d.ellipse([178, 98, 334, 254], fill=(255, 236, 200, 255))         # tete
    d.ellipse([110, 274, 402, 556], fill=(255, 236, 200, 255))        # epaules
    # etincelles
    for (x, y, r) in [(96, 120, 7), (416, 96, 5), (392, 210, 6),
                      (72, 250, 5), (438, 300, 7), (140, 60, 4)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 200, 90, 235))
    # masque coins arrondis
    mask = Image.new("L", (BASE, BASE), 0)
    dm = ImageDraw.Draw(mask)
    dm.rounded_rectangle([0, 0, BASE - 1, BASE - 1], radius=96, fill=255)
    im.putalpha(mask)
    return im


base = draw_base()
sizes = [16, 24, 32, 48, 64, 128, 256]
imgs = [base.resize((s, s), Image.LANCZOS) for s in sizes]
out = os.path.join(APP_DIR, "app.ico")
imgs[-1].save(out, format="ICO", sizes=[(s, s) for s in sizes],
              append_images=imgs[:-1])
print("icone :", out)
