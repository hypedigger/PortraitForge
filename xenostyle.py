# -*- coding: utf-8 -*-
"""Bibliotheque commune : portraits Xenogears -> styles d'artistes via ComfyUI API."""
import io
import json
import mimetypes
import os
import random
import time
import urllib.request
import urllib.parse
import uuid

from PIL import Image

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PROJECT_DIR = os.path.dirname(APP_DIR)
GAMES_FILE = os.path.join(APP_DIR, "games.json")


def _default_games():
    return {"current": "xenogears",
            "games": [{"id": "xenogears", "name": "Xenogears",
                       "work_dir": DEFAULT_PROJECT_DIR,
                       "pack_dir": os.path.join(
                           os.path.dirname(DEFAULT_PROJECT_DIR),
                           "Xenogears_PW_CD1_HD-texture-replacements")}]}


def load_games():
    if os.path.exists(GAMES_FILE):
        with open(GAMES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    g = _default_games()
    save_games(g)
    return g


def save_games(g):
    with open(GAMES_FILE, "w", encoding="utf-8") as f:
        json.dump(g, f, indent=1, ensure_ascii=False)


def current_game():
    g = load_games()
    for game in g["games"]:
        if game["id"] == g.get("current"):
            return game
    return g["games"][0]


def set_game(game):
    """Pointe toute la bibliotheque sur un jeu (repertoires + fichiers d'etat).

    Le repertoire de travail doit contenir _originals\\ ; l'etat (selections,
    sexes, tags...) vit dans <work_dir>\\_appdata\\.
    """
    global PROJECT_DIR, ORIGINALS_DIR, STYLIZED_DIR, EXPORT_DIR, PACK_DIR, \
        PACK_BACKUP_DIR, SELECTIONS_FILE, EXCLUDED_FILE, META_FILE, \
        TAGS_FILE, FINAL_FILE, ORDER_FILE
    PROJECT_DIR = game["work_dir"]
    ORIGINALS_DIR = os.path.join(PROJECT_DIR, "_originals")
    STYLIZED_DIR = os.path.join(PROJECT_DIR, "stylized")
    EXPORT_DIR = os.path.join(PROJECT_DIR, "_selected")
    PACK_DIR = game.get("pack_dir") or ""
    PACK_BACKUP_DIR = os.path.join(PROJECT_DIR, "_pack_backup")
    state = os.path.join(PROJECT_DIR, "_appdata")
    try:
        os.makedirs(state, exist_ok=True)
    except OSError:
        pass
    SELECTIONS_FILE = os.path.join(state, "selections.json")
    EXCLUDED_FILE = os.path.join(state, "excluded.json")
    META_FILE = os.path.join(state, "portrait_meta.json")
    TAGS_FILE = os.path.join(state, "portrait_tags.json")
    FINAL_FILE = os.path.join(state, "final_selections.json")
    ORDER_FILE = os.path.join(state, "portrait_order.json")


set_game(current_game())

COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
CONTROLNET_NAME_HINT = "controlnet-union-sdxl-promax"
MIN_PORTRAIT_SIZE = 256  # ignore les textures d'UI (bandeaux, icones)


def load_styles():
    # styles.json est personnel (non versionne) ; a defaut, les styles
    # generiques livres avec l'app (styles.example.json) sont utilises.
    path = os.path.join(APP_DIR, "styles.json")
    if not os.path.exists(path):
        path = os.path.join(APP_DIR, "styles.example.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


APP_SETTINGS_FILE = os.path.join(APP_DIR, "app_settings.json")


def load_app_settings():
    """Reglages globaux de l'app (utilises comme overrides de generation)."""
    try:
        with open(APP_SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def list_portraits():
    """PNG carres >= MIN_PORTRAIT_SIZE dans _originals (les vrais portraits).

    Tries par date de modification du fichier original : les variantes d'un
    meme personnage (dumpees a la suite) restent groupees.
    """
    items = []
    for name in os.listdir(ORIGINALS_DIR):
        if not name.lower().endswith(".png"):
            continue
        path = os.path.join(ORIGINALS_DIR, name)
        try:
            with Image.open(path) as im:
                w, h = im.size
        except Exception:
            continue
        if w == h and w >= MIN_PORTRAIT_SIZE:
            items.append({"name": name, "stem": os.path.splitext(name)[0],
                          "path": path, "width": w, "height": h,
                          "mtime": os.path.getmtime(path)})
    s = load_app_settings()
    mode = s.get("sort_portraits", "date")

    def apply(crit):
        if crit in ("name", "nom"):
            items.sort(key=lambda x: x["name"].lower())
        elif crit == "custom":
            order = {st: i for i, st in enumerate(load_order())}
            items.sort(key=lambda x: order.get(x["stem"], 10**9))
        # 'date' = ordre de base, deja applique

    items.sort(key=lambda x: (x["mtime"], x["name"]))  # base : date de creation
    if mode == "sexe":
        # tri secondaire a l'interieur de chaque groupe de sexe (tris stables)
        apply(s.get("sort_secondary", "date"))
        meta = load_portrait_meta()
        rank = {"male": 0, "female": 1, "other": 2}
        items.sort(key=lambda x: rank.get(
            (meta.get(x["stem"]) or {}).get("sex") or "male", 0))
    else:
        apply(mode)
    return items


# ---------------------------------------------------------------- ComfyUI API

def _get_json(url_path):
    with urllib.request.urlopen(COMFY_URL + url_path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def comfy_alive():
    try:
        _get_json("/system_stats")
        return True
    except Exception:
        return False


_model_cache = {}


def resolve_model(folder, basename):
    """Retrouve le nom exact (avec sous-dossier) d'un modele pour ComfyUI."""
    if folder not in _model_cache:
        _model_cache[folder] = _get_json("/models/" + folder)
    for full in _model_cache[folder]:
        if os.path.basename(full).lower() == basename.lower():
            return full
    for full in _model_cache[folder]:
        if basename.lower() in full.lower():
            return full
    raise FileNotFoundError("Introuvable dans ComfyUI %s : %s" % (folder, basename))


def upload_image(pil_image, name):
    """Upload une image RGB dans l'input de ComfyUI (multipart)."""
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    data = buf.getvalue()
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    body.write(("--%s\r\n" % boundary).encode())
    body.write(('Content-Disposition: form-data; name="image"; filename="%s"\r\n' % name).encode())
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(data)
    body.write(("\r\n--%s\r\n" % boundary).encode())
    body.write(b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue')
    body.write(("\r\n--%s--\r\n" % boundary).encode())
    req = urllib.request.Request(
        COMFY_URL + "/upload/image", data=body.getvalue(),
        headers={"Content-Type": "multipart/form-data; boundary=%s" % boundary})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))["name"]


def make_lineart(rgb_image):
    """Carte de traits (lignes blanches sur fond noir) calculee localement,
    facon lineart anime — pas besoin de custom node ComfyUI."""
    import numpy as np
    from PIL import ImageFilter
    g = rgb_image.convert("L")
    blur = g.filter(ImageFilter.GaussianBlur(2))
    a = np.asarray(g, dtype=np.int16)
    b = np.asarray(blur, dtype=np.int16)
    diff = np.clip((b - a) * 4, 0, 255).astype(np.uint8)
    return Image.fromarray(diff, "L").convert("RGB")


def build_workflow(cfgset, image_name, seed, control_name=None):
    """Workflow img2img + ControlNet union au format API.

    control_name : image de controle deja uploadee (lineart) ; sinon Canny
    est calcule cote ComfyUI.
    """
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": cfgset["checkpoint"]}},
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1],
                         "lora_name": cfgset["lora"],
                         "strength_model": cfgset["lora_strength"],
                         "strength_clip": cfgset["lora_strength"]}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 1], "text": cfgset["positive"]}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"clip": ["2", 1], "text": cfgset["negative"]}},
        "5": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "6": {"class_type": "ImageScale",
              "inputs": {"image": ["5", 0], "upscale_method": "lanczos",
                         "width": cfgset["size"], "height": cfgset["size"],
                         "crop": "disabled"}},
        "7": {"class_type": "Canny",
              "inputs": {"image": ["6", 0], "low_threshold": 0.25,
                         "high_threshold": 0.6}},
        "8": {"class_type": "ControlNetLoader",
              "inputs": {"control_net_name": cfgset["controlnet"]}},
        "9": {"class_type": "SetUnionControlNetType",
              "inputs": {"control_net": ["8", 0], "type": "canny/lineart/anime_lineart/mlsd"}},
        "10": {"class_type": "ControlNetApplyAdvanced",
               "inputs": {"positive": ["3", 0], "negative": ["4", 0],
                          "control_net": ["9", 0], "image": ["7", 0],
                          "strength": cfgset["cnet_strength"],
                          "start_percent": 0.0,
                          "end_percent": cfgset["cnet_end"],
                          "vae": ["1", 2]}},
        "11": {"class_type": "VAEEncode",
               "inputs": {"pixels": ["6", 0], "vae": ["1", 2]}},
        "12": {"class_type": "KSampler",
               "inputs": {"model": ["2", 0], "positive": ["10", 0],
                          "negative": ["10", 1], "latent_image": ["11", 0],
                          "seed": seed, "steps": cfgset["steps"],
                          "cfg": cfgset["cfg"],
                          "sampler_name": cfgset.get("sampler", "euler_ancestral"),
                          "scheduler": cfgset.get("scheduler", "normal"),
                          "denoise": cfgset["denoise"]}},
        "13": {"class_type": "VAEDecode",
               "inputs": {"samples": ["12", 0], "vae": ["1", 2]}},
        "14": {"class_type": "SaveImage",
               "inputs": {"images": ["13", 0],
                          "filename_prefix": "xenostyle/raw"}},
    }
    if control_name:
        wf["7"] = {"class_type": "LoadImage", "inputs": {"image": control_name}}
    if not cfgset.get("lora"):
        # generation sans LoRA : cabler directement le checkpoint
        del wf["2"]
        wf["3"]["inputs"]["clip"] = ["1", 1]
        wf["4"]["inputs"]["clip"] = ["1", 1]
        wf["12"]["inputs"]["model"] = ["1", 0]
    return wf


def queue_and_wait(workflow, timeout=600):
    payload = json.dumps({"prompt": workflow,
                          "client_id": "xenostyle"}).encode("utf-8")
    req = urllib.request.Request(COMFY_URL + "/prompt", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read().decode("utf-8"))
    if "prompt_id" not in resp:
        raise RuntimeError("ComfyUI a refuse le workflow: %s" % resp)
    pid = resp["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(1.5)
        hist = _get_json("/history/" + pid)
        if pid in hist:
            entry = hist[pid]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                msgs = [m for m in status.get("messages", [])
                        if m[0] == "execution_error"]
                raise RuntimeError("Erreur ComfyUI: %s" % json.dumps(msgs)[:2000])
            outputs = entry.get("outputs", {})
            if "14" in outputs and outputs["14"].get("images"):
                return outputs["14"]["images"][0]
    raise TimeoutError("Generation trop longue (%ss)" % timeout)


def fetch_output(imginfo):
    qs = urllib.parse.urlencode({"filename": imginfo["filename"],
                                 "subfolder": imginfo.get("subfolder", ""),
                                 "type": imginfo.get("type", "output")})
    with urllib.request.urlopen(COMFY_URL + "/view?" + qs, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


# ---------------------------------------------------------------- pipeline

def build_cfgset(styles_cfg, style_key, denoise=None):
    d = styles_cfg["defaults"]
    s = styles_cfg["styles"][style_key]
    base = d[s["base"]]
    app_s = load_app_settings()
    checkpoint = s.get("checkpoint") \
        or app_s.get("checkpoint_" + s["base"]) or base["checkpoint"]
    cfgset = {
        "checkpoint": resolve_model("checkpoints", checkpoint),
        "lora": resolve_model("loras", s["lora"]) if s.get("lora") else None,
        "lora_strength": s.get("lora_strength", 0.9),
        "positive": base["prefix"] + s["prompt"] + d["suffix"],
        "negative": base["negative"] + s.get("negative_extra", ""),
        "cfg": s.get("cfg", app_s.get("cfg_" + s["base"]) or base["cfg"]),
        "steps": int(s.get("steps", app_s.get("gen_steps") or d["steps"])),
        "denoise": s.get("denoise", d["denoise"]),
        "cnet_strength": s.get("cnet_strength", d["cnet_strength"]),
        "cnet_end": s.get("cnet_end", d["cnet_end"]),
        "size": int(app_s.get("gen_size") or d["size"]),
        "sampler": app_s.get("gen_sampler") or "euler_ancestral",
        "scheduler": app_s.get("gen_scheduler") or "normal",
        "cnet_type": app_s.get("cnet_type") or "canny",
        "controlnet": resolve_model("controlnet", CONTROLNET_NAME_HINT),
    }
    if denoise is not None:
        cfgset["denoise"] = max(0.0, min(1.0, float(denoise)))
    return cfgset


def apply_boost(cfgset):
    """Reglages 'style renforce' : plus de liberte au LoRA, ControlNet allege."""
    cfgset["denoise"] = max(cfgset["denoise"], 0.75)
    cfgset["cnet_strength"] = min(cfgset["cnet_strength"], 0.35)
    cfgset["cnet_end"] = min(cfgset["cnet_end"], 0.6)
    cfgset["lora_strength"] = min(1.2, cfgset["lora_strength"] + 0.1)
    return cfgset


def unmatte_white(rgb_image, alpha):
    """Applique l'alpha en retirant le halo blanc des bords semi-transparents.

    L'image a ete generee sur fond blanc : sur les pixels semi-transparents,
    C_observe = C_vrai*a + 255*(1-a). On inverse pour retrouver C_vrai.
    """
    import numpy as np
    rgb = np.asarray(rgb_image.convert("RGB"), dtype=np.float32)
    a = np.asarray(alpha, dtype=np.float32)[..., None] / 255.0
    safe_a = np.maximum(a, 0.02)
    unmatted = (rgb - 255.0 * (1.0 - safe_a)) / safe_a
    out = np.where(a > 0.01, unmatted, rgb)
    out = np.clip(out, 0, 255).astype(np.uint8)
    result = Image.fromarray(out, "RGB").convert("RGBA")
    result.putalpha(alpha)
    return result


MATTING_MODEL = os.path.join(APP_DIR, ".matting", "isnetis.onnx")
_matte_sess = None


def anime_matte(rgb_image):
    """Matte du personnage via ISNet-anime (segmentation semantique).

    Comprend ce qui appartient au personnage : cheveux meche par meche,
    lunettes, poches de fond enfermees entre les meches — la ou les
    heuristiques couleur atteignent leurs limites.
    """
    global _matte_sess
    import numpy as np
    if _matte_sess is None:
        import onnxruntime as ort
        _matte_sess = ort.InferenceSession(MATTING_MODEL,
                                           providers=["CPUExecutionProvider"])
    im = rgb_image.convert("RGB")
    w, h = im.size
    if (w, h) != (1024, 1024):
        im = im.resize((1024, 1024), Image.LANCZOS)
    x = np.asarray(im, dtype=np.float32) / 255.0
    x = np.transpose(x, (2, 0, 1))[None]
    m = _matte_sess.run(None, {_matte_sess.get_inputs()[0].name: x})[0][0][0]
    out = Image.fromarray((np.clip(m, 0.0, 1.0) * 255).astype(np.uint8), "L")
    if (w, h) != (1024, 1024):
        out = out.resize((w, h), Image.LANCZOS)
    return out


def refine_alpha(out_image, alpha):
    """Alpha final d'une generation : matte ISNet-anime, limite au masque
    d'origine (l'image ne doit pas deborder de l'empreinte de la texture).
    Retombe sur les heuristiques couleur si le modele est indisponible."""
    try:
        from PIL import ImageChops
        return ImageChops.darker(anime_matte(out_image), alpha)
    except Exception:
        a = strip_border_halo(out_image, alpha)
        return shrink_alpha(a, erode_px=max(1, round(out_image.size[0] / 512)))


def strip_border_halo(out_image, alpha, max_depth_frac=0.035,
                      lum_min=218, sat_max=48):
    """Retire du masque le fond blanc que le modele a laisse le long du bord.

    Le modele redessine souvent le personnage legerement plus petit que la
    silhouette d'origine : entre son trait et le bord du masque subsiste une
    bande de fond blanc, large de 5 a 25 px selon les endroits — trop
    irreguliere pour une erosion fixe. On retire donc du masque les pixels
    quasi blancs connectes a l'exterieur (flood fill), plafonnes a une
    profondeur de securite pour ne pas manger un vetement ou cheveu blanc.
    Les blancs internes (yeux, reflets) ne touchent pas l'exterieur et
    restent intacts.
    """
    import numpy as np
    try:
        from scipy import ndimage
    except ImportError:
        return alpha
    rgb = np.asarray(out_image.convert("RGB"), dtype=np.float32)
    a = np.asarray(alpha, dtype=np.float32) / 255.0
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    outside = a < 0.5
    depth = ndimage.distance_transform_edt(~outside)

    def connected_from_outside(mask):
        labels, _ = ndimage.label(outside | mask)
        touching = np.unique(labels[outside])
        return np.isin(labels, touching) & mask & ~outside

    # passe 1 : bande quasi blanche le long du bord, profondeur plafonnee
    # (protege les cheveux/vetements clairs qui touchent la silhouette)
    whiteish = (lum >= lum_min) & (sat <= sat_max)
    halo = connected_from_outside(whiteish) \
        & (depth <= max(4.0, rgb.shape[0] * max_depth_frac))

    # passe 2 : fond blanc PUR, sans plafond — le modele laisse parfois de
    # larges biseaux de fond au-dela du plafond (typique dans les cheveux).
    # L'ouverture morphologique epargne les structures fines (meches,
    # reflets speculaires) : seules les plages larges sont retirees.
    pure = (lum >= 247) & (sat <= 14)
    wide = connected_from_outside(pure)
    wide = ndimage.binary_opening(wide, structure=np.ones((5, 5)))
    halo |= wide & pure & ~outside

    if not halo.any():
        return alpha
    new_a = np.array(alpha, dtype=np.uint8)
    new_a[halo] = 0
    return Image.fromarray(new_a, "L")


def shrink_alpha(alpha, erode_px=2, feather=1.2):
    """Contracte legerement le masque alpha et adoucit son bord.

    Le modele redessine souvent un fin lisere clair le long de la
    silhouette (fond blanc de l'img2img) : sur ces pixels le masque
    d'origine est 100% opaque et unmatte_white ne peut rien corriger.
    On rentre donc le bord de quelques pixels avant la decoupe.
    """
    from PIL import ImageFilter, ImageChops
    a = alpha.filter(ImageFilter.MinFilter(erode_px * 2 + 1))
    if feather > 0:
        a = a.filter(ImageFilter.GaussianBlur(feather))
    # le flou ne doit pas re-etendre le bord au-dela du masque d'origine
    return ImageChops.darker(a, alpha)


def prepare_input(portrait_path, size):
    """RGBA -> RGB sur fond blanc, redimensionne en size x size."""
    with Image.open(portrait_path) as im:
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        rgb = Image.alpha_composite(bg, im).convert("RGB")
        alpha = im.getchannel("A")
    rgb = rgb.resize((size, size), Image.LANCZOS)
    alpha = alpha.resize((size, size), Image.LANCZOS)
    return rgb, alpha


_SD_SAMPLERS = {("euler_ancestral", "normal"): "Euler a",
                ("euler", "normal"): "Euler",
                ("dpmpp_2m", "karras"): "DPM++ 2M Karras",
                ("dpmpp_2m_sde", "karras"): "DPM++ 2M SDE Karras"}


def save_png_with_params(img, path, cfgset, seed):
    """Sauvegarde le PNG avec les infos de generation au format A1111
    (chunk 'parameters', lisible par WebUI/Forge/Civitai/PNG Info)."""
    from PIL.PngImagePlugin import PngInfo
    lora_part = ""
    if cfgset.get("lora"):
        lname = os.path.splitext(os.path.basename(cfgset["lora"]))[0]
        lora_part = " <lora:%s:%g>" % (lname, cfgset.get("lora_strength", 1.0))
    sampler = _SD_SAMPLERS.get((cfgset.get("sampler", ""), cfgset.get("scheduler", "")),
                               "%s/%s" % (cfgset.get("sampler", "?"), cfgset.get("scheduler", "?")))
    model = os.path.splitext(os.path.basename(cfgset["checkpoint"]))[0]
    params = ("%s%s\nNegative prompt: %s\n"
              "Steps: %d, Sampler: %s, CFG scale: %g, Seed: %d, Size: %dx%d, "
              "Model: %s, Denoising strength: %g, "
              "ControlNet: union-%s (strength %g, end %g)") % (
        cfgset["positive"], lora_part, cfgset["negative"],
        cfgset["steps"], sampler, cfgset["cfg"], seed,
        cfgset["size"], cfgset["size"], model, cfgset["denoise"],
        cfgset.get("cnet_type", "canny"),
        cfgset.get("cnet_strength", 0), cfgset.get("cnet_end", 0))
    meta = PngInfo()
    meta.add_text("parameters", params)
    img.save(path, pnginfo=meta)


def generate_variant(styles_cfg, style_key, portrait, seed=None, denoise=None,
                     pos_extra=None, neg_extra=None, boost=False,
                     lora_strength=None, cnet_strength=None, cnet_end=None,
                     checkpoint=None, lora_enabled=True):
    """Genere une variante stylisee d'un portrait. Retourne le chemin du PNG."""
    if seed is None:
        seed = random.randint(0, 2**31 - 1)
    app_s = load_app_settings()
    cfgset = build_cfgset(styles_cfg, style_key)
    if boost:
        # le boost s'applique AVANT les valeurs explicites : ce que
        # l'utilisateur fixe dans le popup (ou une relance a l'identique)
        # doit toujours primer
        apply_boost(cfgset)
    if denoise is not None:
        cfgset["denoise"] = max(0.0, min(1.0, float(denoise)))
    if checkpoint:
        cfgset["checkpoint"] = resolve_model("checkpoints", checkpoint)
    if not lora_enabled:
        cfgset["lora_strength"] = 0.0
    if lora_strength is not None and not lora_enabled:
        lora_strength = None
    if lora_strength is not None:
        cfgset["lora_strength"] = float(lora_strength)
    if cnet_strength is not None:
        cfgset["cnet_strength"] = float(cnet_strength)
    if cnet_end is not None:
        cfgset["cnet_end"] = float(cnet_end)
    if pos_extra and pos_extra.strip():
        cfgset["positive"] += ", " + pos_extra.strip()
    if neg_extra and neg_extra.strip():
        cfgset["negative"] += ", " + neg_extra.strip()
    pos_extra, neg_extra = portrait_prompt_tags(portrait["stem"])
    char_tags = ""
    if app_s.get("use_auto_tags", True):
        char_tags = load_portrait_tags().get(portrait["stem"], "")
    if char_tags:
        pos_extra = (pos_extra + ", " + char_tags) if pos_extra else char_tags
    if pos_extra:
        cfgset["positive"] = pos_extra + ", " + cfgset["positive"]
    if neg_extra:
        cfgset["negative"] = cfgset["negative"] + ", " + neg_extra
    rgb, alpha = prepare_input(portrait["path"], cfgset["size"])
    up_name = upload_image(rgb, "xenostyle_%s.png" % portrait["stem"])
    control_name = None
    if cfgset.get("cnet_type") == "lineart":
        control_name = upload_image(make_lineart(rgb),
                                    "xenostyle_ctrl_%s.png" % portrait["stem"])
    wf = build_workflow(cfgset, up_name, seed, control_name)
    imginfo = queue_and_wait(wf)
    out = fetch_output(imginfo)
    if out.size != alpha.size:
        alpha = alpha.resize(out.size, Image.LANCZOS)
    if app_s.get("anti_halo", True):
        alpha = refine_alpha(out, alpha)
        out = unmatte_white(out, alpha)
    else:
        out = out.convert("RGBA")
        out.putalpha(alpha)
    var_dir = os.path.join(STYLIZED_DIR, style_key, portrait["stem"])
    os.makedirs(var_dir, exist_ok=True)
    out_path = os.path.join(var_dir, "seed_%d.png" % seed)
    v = 2
    while os.path.exists(out_path):
        # meme seed regeneree (params differents) : NE PAS ecraser la variante
        out_path = os.path.join(var_dir, "seed_%d_v%d.png" % (seed, v))
        v += 1
    save_png_with_params(out, out_path, cfgset, seed)
    return out_path


CUSTOM_KEY = "_custom"


def generate_custom(portrait, opts):
    """Generation 'categorie Custom' : checkpoint, LoRA, prompt et parametres
    entierement libres (opts), img2img depuis l'original, une image uploadee
    ou l'image custom selectionnee."""
    stem = portrait["stem"]
    seed = int(opts.get("seed") or random.randint(0, 2**31 - 1))
    styles_cfg = load_styles()
    d = styles_cfg["defaults"]
    app_s = load_app_settings()
    checkpoint = opts.get("checkpoint") \
        or app_s.get("checkpoint_pony") or d["pony"]["checkpoint"]
    cfgset = {
        "checkpoint": resolve_model("checkpoints", checkpoint),
        "lora": resolve_model("loras", opts["lora"]) if opts.get("lora") else None,
        "lora_strength": float(opts.get("lora_strength") or 0.9),
        "positive": (opts.get("pos") or "").strip()
        or "portrait, upper body, solo, detailed face",
        "negative": (opts.get("neg") or "").strip()
        or "worst quality, low quality, jpeg artifacts, watermark, text",
        "cfg": float(opts.get("cfg") or 6.0),
        "steps": int(opts.get("steps") or app_s.get("gen_steps") or d["steps"]),
        "denoise": float(opts.get("denoise") or 0.7),
        "cnet_strength": float(opts["cnet_strength"]
                               if opts.get("cnet_strength") is not None
                               else d["cnet_strength"]),
        "cnet_end": float(opts["cnet_end"] if opts.get("cnet_end") is not None
                          else d["cnet_end"]),
        "size": int(app_s.get("gen_size") or d["size"]),
        "sampler": app_s.get("gen_sampler") or "euler_ancestral",
        "scheduler": app_s.get("gen_scheduler") or "normal",
        "cnet_type": app_s.get("cnet_type") or "canny",
        "controlnet": resolve_model("controlnet", CONTROLNET_NAME_HINT),
    }
    pos_extra, neg_extra = portrait_prompt_tags(stem)
    char_tags = ""
    if app_s.get("use_auto_tags", True):
        char_tags = load_portrait_tags().get(stem, "")
    if char_tags:
        pos_extra = (pos_extra + ", " + char_tags) if pos_extra else char_tags
    if pos_extra:
        cfgset["positive"] = pos_extra + ", " + cfgset["positive"]
    if neg_extra:
        cfgset["negative"] += ", " + neg_extra
    # source de l'img2img
    src = opts.get("source")
    src_path = portrait["path"]
    if src and src != "__original__":
        cand = os.path.join(STYLIZED_DIR, CUSTOM_KEY, stem, os.path.basename(src))
        if os.path.exists(cand):
            src_path = cand
    elif not src:
        # auto : image custom selectionnee, sinon la plus recente, sinon original
        files = list_style_variants(CUSTOM_KEY, stem)
        sel = load_selections().get(CUSTOM_KEY + "/" + stem)
        pick = sel if sel in files else (files[-1] if files else None)
        if pick:
            src_path = os.path.join(STYLIZED_DIR, CUSTOM_KEY, stem, pick)
    rgb, alpha = prepare_input(src_path, cfgset["size"])
    up_name = upload_image(rgb, "xenostyle_%s.png" % stem)
    control_name = None
    if cfgset.get("cnet_type") == "lineart":
        control_name = upload_image(make_lineart(rgb),
                                    "xenostyle_ctrl_%s.png" % stem)
    wf = build_workflow(cfgset, up_name, seed, control_name)
    imginfo = queue_and_wait(wf)
    out = fetch_output(imginfo)
    if out.size != alpha.size:
        alpha = alpha.resize(out.size, Image.LANCZOS)
    if app_s.get("anti_halo", True):
        alpha = refine_alpha(out, alpha)
        out = unmatte_white(out, alpha)
    else:
        out = out.convert("RGBA")
        out.putalpha(alpha)
    var_dir = os.path.join(STYLIZED_DIR, CUSTOM_KEY, stem)
    os.makedirs(var_dir, exist_ok=True)
    out_path = os.path.join(var_dir, "seed_%d.png" % seed)
    v = 2
    while os.path.exists(out_path):
        # meme seed regeneree (params differents) : NE PAS ecraser la variante
        out_path = os.path.join(var_dir, "seed_%d_v%d.png" % (seed, v))
        v += 1
    save_png_with_params(out, out_path, cfgset, seed)
    return out_path


def save_custom_upload(stem, data, name="upload"):
    """Enregistre une image uploadee dans la categorie Custom (convertie en PNG)."""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    vdir = os.path.join(STYLIZED_DIR, CUSTOM_KEY, stem)
    os.makedirs(vdir, exist_ok=True)
    base = "upload_%d" % int(time.time() * 1000)
    out_path = os.path.join(vdir, base + ".png")
    im.save(out_path)
    return out_path


# ---------------------------------------------------------------- selections

def load_portrait_meta():
    """Metadonnees par portrait, ex. {stem: {"sex": "male"|"female"|"other", "text": "..."}}."""
    if os.path.exists(META_FILE):
        with open(META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_portrait_meta(meta):
    with open(META_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


def portrait_prompt_tags(stem):
    """(tags positifs, tags negatifs) selon le sexe defini pour ce portrait.

    Par defaut (rien de defini) : male.
    """
    m = load_portrait_meta().get(stem) or {}
    sex = m.get("sex") or "male"
    if sex == "male":
        return "1boy, male focus", "1girl, female"
    if sex == "female":
        return "1girl, female", "1boy, male focus"
    t = (m.get("text") or "").strip()
    return (t, "") if t else ("", "")


def load_portrait_tags():
    """Tags auto-detectes (tagger.py) : {stem: "red hair, green eyes, ..."}."""
    if os.path.exists(TAGS_FILE):
        with open(TAGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_excluded():
    """Stems a garder tels quels (pas des personnages / pas a styliser)."""
    if os.path.exists(EXCLUDED_FILE):
        with open(EXCLUDED_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_excluded(stems):
    with open(EXCLUDED_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(stems), f, indent=1)


def load_order():
    """Ordre custom des portraits (liste de stems, tri 'custom')."""
    if os.path.exists(ORDER_FILE):
        with open(ORDER_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_order(order):
    with open(ORDER_FILE, "w", encoding="utf-8") as f:
        json.dump(list(order), f, indent=1)


def load_selections():
    if os.path.exists(SELECTIONS_FILE):
        with open(SELECTIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_selections(sel):
    with open(SELECTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(sel, f, indent=1, ensure_ascii=False)


def load_final():
    """Choix final par personnage : {stem: "style_key/fichier.png"}."""
    if os.path.exists(FINAL_FILE):
        with open(FINAL_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_final(final):
    with open(FINAL_FILE, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=1, ensure_ascii=False)


def list_style_variants(style_key, stem):
    """Variantes triees par date de generation (plus ancienne d'abord)."""
    vdir = os.path.join(STYLIZED_DIR, style_key, stem)
    if os.path.isdir(vdir):
        files = [f for f in os.listdir(vdir) if f.endswith(".png")]
        files.sort(key=lambda f: os.path.getmtime(os.path.join(vdir, f)))
        return files
    return []


def effective_choice(style_key, stem, selections=None):
    """Variante retenue pour (style, perso) : choix explicite uniquement."""
    if selections is None:
        selections = load_selections()
    files = list_style_variants(style_key, stem)
    explicit = selections.get("%s/%s" % (style_key, stem))
    if explicit and explicit in files:
        return explicit
    return None


def _export_items(items, resize_to_original=None, install_to_pack=True,
                  pack_dir=None):
    """items = [(portrait, style_key, fname)] -> _selected/ + pack (avec backup)."""
    if resize_to_original is None:
        resize_to_original = bool(load_app_settings().get("resize_export", True))
    pack = pack_dir or PACK_DIR
    os.makedirs(EXPORT_DIR, exist_ok=True)
    exported, installed, backed_up = [], 0, 0
    pack_ok = install_to_pack and os.path.isdir(pack)
    for p, style_key, fname in items:
        if style_key is None:
            src = p["path"]  # texture originale conservee volontairement
        else:
            src = os.path.join(STYLIZED_DIR, style_key, p["stem"], fname)
        if not os.path.exists(src):
            continue
        with Image.open(src) as im:
            im = im.convert("RGBA")
            if resize_to_original and im.size != (p["width"], p["height"]):
                im = im.resize((p["width"], p["height"]), Image.LANCZOS)
            im.save(os.path.join(EXPORT_DIR, p["name"]))
            if pack_ok:
                pack_file = os.path.join(pack, p["name"])
                if os.path.exists(pack_file) and \
                   load_app_settings().get("pack_backup", True):
                    backup = os.path.join(PACK_BACKUP_DIR, p["name"])
                    if not os.path.exists(backup):
                        os.makedirs(PACK_BACKUP_DIR, exist_ok=True)
                        os.replace(pack_file, backup)
                        backed_up += 1
                im.save(pack_file)
                installed += 1
        exported.append(p["name"])
    return {"exported": exported, "installed": installed,
            "backed_up": backed_up, "pack_found": pack_ok}


def export_style(style_key, pack_dir=None):
    """Exporte tous les personnages du style (selection explicite uniquement)."""
    sel = load_selections()
    excluded = load_excluded()
    items = []
    for p in list_portraits():
        if p["stem"] in excluded:
            continue
        choice = effective_choice(style_key, p["stem"], sel)
        if choice:
            items.append((p, style_key, choice))
    return _export_items(items, pack_dir=pack_dir)


def restore_originals(pack_dir=None):
    """Recopie les portraits de _originals dans le pack (retour a l'origine)."""
    import shutil
    pack = pack_dir or PACK_DIR
    if not os.path.isdir(pack):
        return {"restored": 0, "pack_found": False}
    n = 0
    for p in list_portraits():
        dst = os.path.join(pack, p["name"])
        shutil.copy2(p["path"], dst)
        n += 1
    return {"restored": n, "pack_found": True}


def export_final(styles_order, pack_dir=None):
    """Exporte une image par personnage : choix final explicite, sinon la
    premiere variante disponible en parcourant les styles dans l'ordre."""
    final = load_final()
    sel = load_selections()
    excluded = load_excluded()
    items = []
    for p in list_portraits():
        if p["stem"] in excluded:
            continue
        ref = final.get(p["stem"])
        if ref == "__original__":
            items.append((p, None, None))
            continue
        if ref and "/" in ref:
            sk, fname = ref.split("/", 1)
            if os.path.exists(os.path.join(STYLIZED_DIR, sk, p["stem"], fname)):
                items.append((p, sk, fname))
                continue
        for sk in styles_order:
            choice = effective_choice(sk, p["stem"], sel)
            if choice:
                items.append((p, sk, choice))
                break
    return _export_items(items, pack_dir=pack_dir)
