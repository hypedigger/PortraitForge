# -*- coding: utf-8 -*-
"""Visionneuse / selecteur de portraits stylises.

Lancement :
  "%USERPROFILE%\\Documents\\ComfyUI\\.venv\\Scripts\\python.exe" app.py
puis ouvrir http://127.0.0.1:8777

3 modes :
  - Vue d'ensemble : matrice personnages x styles (1 image par set)
  - Par style : toutes les variantes d'un style, selection / suppression / regen
  - Tri : marquer les textures qui ne sont pas des personnages (a garder telles quelles)
"""
import io
import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image

import xenostyle as xs

PORT = 8777
THUMB_DIR = os.path.join(xs.APP_DIR, ".thumbs", xs.current_game()["id"])
THUMB_SIZE = 176


def switch_game(game_id):
    """Change le jeu courant (repertoires, etat, cache de miniatures)."""
    global THUMB_DIR
    g = xs.load_games()
    if not any(x["id"] == game_id for x in g["games"]):
        return False
    g["current"] = game_id
    xs.save_games(g)
    xs.set_game(xs.current_game())
    THUMB_DIR = os.path.join(xs.APP_DIR, ".thumbs", game_id)
    return True
SETTINGS_FILE = os.path.join(xs.APP_DIR, "app_settings.json")
DEFAULT_SETTINGS = {"regen_count": 2, "hidden_styles": [],
                    "custom_count": 5, "default_denoise": None, "boost": False,
                    "thumb_size": "moyennes", "comfy_url": "", "gen_all_count": 2,
                    "civitai_api_key": "",
                    "gen_steps": None, "gen_size": None,
                    "gen_sampler": "", "gen_scheduler": "",
                    "cfg_pony": None, "cfg_illustrious": None,
                    "checkpoint_pony": "", "checkpoint_illustrious": "",
                    "cnet_type": "canny", "resize_export": True,
                    "use_auto_tags": True, "tag_threshold": 0.35,
                    "anti_halo": True, "pack_backup": True, "wall_size": 60,
                    "sort_portraits": "date", "sort_secondary": "date",
                    "lb_dense": False, "lb_bg": "grey"}


def apply_runtime_settings(s):
    if s.get("comfy_url"):
        xs.COMFY_URL = s["comfy_url"].rstrip("/")


def load_settings():
    s = dict(DEFAULT_SETTINGS)
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                s.update(json.load(f))
        except Exception:
            pass
    return s


def save_settings(s):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=1)


def get_thumb(src_path, cache_key):
    """Miniature PNG mise en cache, classee par artiste (consultable avec un
    autre visualiseur) : .thumbs/<style>/<perso>__<fichier>.png et
    .thumbs/_originals/<perso>.png. Invalidee si la source change."""
    src_path = os.path.abspath(src_path)
    if not src_path.startswith(xs.PROJECT_DIR) or not os.path.exists(src_path):
        return None
    if cache_key.startswith("orig/"):
        sub, name = "_originals", cache_key.split("orig/", 1)[1]
    else:
        parts = cache_key.split("/")  # var/<style>/<stem>/<file>
        sub = parts[1] if len(parts) > 1 else "_divers"
        name = "__".join(parts[2:]) or "inconnu"
    name = name[:-4] if name.lower().endswith(".png") else name
    cache_path = os.path.join(THUMB_DIR, sub, name + ".png")
    try:
        if os.path.exists(cache_path) and \
           os.path.getmtime(cache_path) >= os.path.getmtime(src_path):
            with open(cache_path, "rb") as f:
                return f.read()
    except OSError:
        pass
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with Image.open(src_path) as im:
        im = im.convert("RGBA")
        im.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG")
    data = buf.getvalue()
    tmp = cache_path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, cache_path)
    return data

# --- file de regeneration (un worker, ComfyUI serialise de toute facon) ---
_queue = []
_queue_lock = threading.Lock()
_current = None
_errors = []
_job_t0 = None
_durations = []
_batch_total = 0
_batch_done = 0
_paused = False
_auto_paused = False  # pause posee par le watchdog (levee automatiquement)
_tagger_proc = None
QUEUE_FILE = os.path.join(xs.APP_DIR, "queue_state.json")


def _persist_queue():
    """Sauve la file (job en cours inclus) : survit aux redemarrages/crashs."""
    with _queue_lock:
        jobs = ([_current] if _current else []) + list(_queue)
    try:
        tmp = QUEUE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"jobs": jobs, "batch_total": _batch_total,
                       "batch_done": _batch_done}, f)
        os.replace(tmp, QUEUE_FILE)
    except OSError:
        pass


def _restore_queue():
    """Au demarrage : recharge la file interrompue, EN PAUSE (bouton reprendre)."""
    global _batch_total, _batch_done, _paused
    if not os.path.exists(QUEUE_FILE):
        return
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            st = json.load(f)
    except Exception:
        return
    jobs = st.get("jobs") or []
    if not jobs:
        return
    _queue.extend(jobs)
    _batch_total = st.get("batch_total") or len(jobs)
    _batch_done = st.get("batch_done") or 0
    _paused = True
    print("file restauree : %d generation(s) en attente (en pause)" % len(jobs))


def _launch_comfy():
    """Relance ComfyUI avec les parametres de launch_config.json."""
    try:
        with open(os.path.join(xs.APP_DIR, "launch_config.json"),
                  "r", encoding="utf-8") as f:
            cfg = json.load(f)
        py = os.path.expandvars(cfg["python"])
        main = os.path.expandvars(cfg["comfy_main"])
        args = [py, main, "--port", str(cfg.get("comfy_port", 8188))]
        for a in cfg.get("comfy_args", []):
            args.append(os.path.expandvars(a))
        subprocess.Popen(args, cwd=os.path.dirname(main),
                         creationflags=0x08000000)  # CREATE_NO_WINDOW
        return True
    except Exception as e:
        _errors.append("relance ComfyUI impossible : %s" % str(e)[:200])
        return False


def _ensure_comfy():
    """Watchdog : verifie ComfyUI, le relance si mort, sinon met la file en pause."""
    global _paused, _auto_paused
    if xs.comfy_alive():
        if _auto_paused:
            _paused = False
            _auto_paused = False
        return True
    _errors.append("ComfyUI injoignable — tentative de relance automatique...")
    del _errors[:-20]
    if _launch_comfy():
        for _ in range(45):  # jusqu'a ~90 s de demarrage
            threading.Event().wait(2.0)
            if xs.comfy_alive():
                _errors.append("ComfyUI relance — reprise de la file")
                if _auto_paused:
                    _paused = False
                    _auto_paused = False
                return True
    _paused = True
    _auto_paused = True
    _errors.append("ComfyUI toujours injoignable — file mise en PAUSE "
                   "(reprendra automatiquement des qu'il repond)")
    del _errors[:-20]
    return False


def _is_conn_error(e):
    msg = str(e).lower()
    return ("urlopen error" in msg or "10061" in msg or "refus" in msg
            or "connection" in msg or isinstance(e, (ConnectionError, OSError)))


def _enqueue(jobs, front=False):
    """Ajoute des jobs (front=True : prioritaires, passent devant les batches)."""
    global _batch_total, _batch_done
    with _queue_lock:
        if not _queue and _current is None:
            _batch_total = 0
            _batch_done = 0
        if front:
            _queue[0:0] = jobs
        else:
            _queue.extend(jobs)
        _batch_total += len(jobs)
    _persist_queue()


def _worker():
    global _current, _job_t0, _batch_done, _paused, _auto_paused
    while True:
        if _paused:
            # pause posee par le watchdog : reessayer ComfyUI periodiquement
            if _auto_paused and xs.comfy_alive():
                _paused = False
                _auto_paused = False
                _errors.append("ComfyUI repond a nouveau — reprise de la file")
                del _errors[:-20]
            else:
                threading.Event().wait(3.0)
                continue
        job = None
        with _queue_lock:
            if _queue:
                job = _queue.pop(0)
                _current = job
        if job is None:
            _current = None
            threading.Event().wait(1.0)
            continue
        if not _ensure_comfy():
            with _queue_lock:
                _queue.insert(0, job)
                _current = None
            _persist_queue()
            continue
        _persist_queue()
        _job_t0 = time.time()
        try:
            cfg = xs.load_styles()
            s = load_settings()
            apply_runtime_settings(s)
            portraits = {p["stem"]: p for p in xs.list_portraits()}
            dn = job.get("denoise")
            if dn is None and s.get("default_denoise") is not None:
                dn = s["default_denoise"]
            if job["style"] == xs.CUSTOM_KEY:
                if dn is not None:
                    job = dict(job, denoise=dn)
                xs.generate_custom(portraits[job["stem"]], job)
            else:
                xs.generate_variant(cfg, job["style"], portraits[job["stem"]],
                                    seed=job.get("seed"),
                                    denoise=dn,
                                    pos_extra=job.get("pos"),
                                    neg_extra=job.get("neg"),
                                    boost=bool(s.get("boost")),
                                    lora_strength=job.get("lora_strength"),
                                    cnet_strength=job.get("cnet_strength"),
                                    cnet_end=job.get("cnet_end"),
                                    checkpoint=job.get("checkpoint"),
                                    lora_enabled=job.get("lora_enabled", True))
            _durations.append(time.time() - _job_t0)
            del _durations[:-10]
        except Exception as e:
            if _is_conn_error(e):
                # connexion ComfyUI perdue EN COURS de job : le job n'est pas
                # consomme, il repart en tete de file ; pause via watchdog
                with _queue_lock:
                    _queue.insert(0, job)
                    _current = None
                _errors.append("connexion ComfyUI perdue — job remis en file")
                del _errors[:-20]
                _paused = True
                _auto_paused = True
                _persist_queue()
                _job_t0 = None
                continue
            _errors.append("%s/%s : %s" % (job["style"], job["stem"], str(e)[:300]))
            del _errors[:-20]
        _batch_done += 1
        _current = None
        _job_t0 = None
        _persist_queue()


_restore_queue()
threading.Thread(target=_worker, daemon=True).start()


def list_variants():
    out = {}
    if not os.path.isdir(xs.STYLIZED_DIR):
        return out
    for style in os.listdir(xs.STYLIZED_DIR):
        sdir = os.path.join(xs.STYLIZED_DIR, style)
        if not os.path.isdir(sdir):
            continue
        for stem in os.listdir(sdir):
            vdir = os.path.join(sdir, stem)
            if os.path.isdir(vdir):
                files = [f for f in os.listdir(vdir) if f.endswith(".png")]
                files.sort(key=lambda f: os.path.getmtime(os.path.join(vdir, f)))
                if files:
                    out["%s/%s" % (style, stem)] = files
    return out


# Interface web : servie depuis static/ (index.html, app.css, app.js).
# Modifier ces fichiers ne demande PAS de redemarrer le serveur (F5 suffit).


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _file(self, path):
        path = os.path.abspath(path)
        if not path.startswith(xs.PROJECT_DIR) or not os.path.exists(path):
            self.send_response(404)
            self.end_headers()
            return
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _thumb(self, src_path, cache_key):
        try:
            data = get_thumb(src_path, cache_key)
        except Exception:
            data = None
        if data is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, name, ctype):
        # lu a chaque requete : modifier static/ ne demande pas de redemarrage
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "static", name)
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = urllib.parse.unquote(self.path)
        if p == "/":
            self._serve_static("index.html", "text/html; charset=utf-8")
        elif p == "/static/app.css":
            self._serve_static("app.css", "text/css; charset=utf-8")
        elif p == "/static/app.js":
            self._serve_static("app.js", "text/javascript; charset=utf-8")
        elif p == "/api/state":
            cfg = xs.load_styles()
            d = cfg["defaults"]
            s_app = load_settings()
            styles = [{"key": k, "label": v["label"],
                       "lora_strength": v.get("lora_strength", 0.9),
                       "denoise": v.get("denoise", d["denoise"]),
                       "cnet_strength": v.get("cnet_strength", d["cnet_strength"]),
                       "cnet_end": v.get("cnet_end", d["cnet_end"]),
                       "base": v["base"],
                       "lora": v.get("lora"),
                       "checkpoint": (v.get("checkpoint")
                                      or s_app.get("checkpoint_" + v["base"])
                                      or d[v["base"]]["checkpoint"])}
                      for k, v in cfg["styles"].items()]
            styles.sort(key=lambda s: s["label"].lower())
            self._json({"styles": styles,
                        "portraits": [{"stem": x["stem"], "name": x["name"]}
                                      for x in xs.list_portraits()],
                        "variants": list_variants(),
                        "selections": xs.load_selections(),
                        "excluded": sorted(xs.load_excluded()),
                        "order": xs.load_order(),
                        "meta": xs.load_portrait_meta(),
                        "final": xs.load_final(),
                        "settings": load_settings(),
                        "game": xs.current_game(),
                        "games": xs.load_games()["games"],
                        "tags_done": len(xs.load_portrait_tags()) > 0,
                        "defaults": {
                            "pony_prefix": cfg["defaults"]["pony"]["prefix"],
                            "pony_negative": cfg["defaults"]["pony"]["negative"],
                            "il_prefix": cfg["defaults"]["illustrious"]["prefix"],
                            "il_negative": cfg["defaults"]["illustrious"]["negative"],
                            "suffix": cfg["defaults"]["suffix"]}})
        elif p == "/api/tagger_status":
            running = _tagger_proc is not None and _tagger_proc.poll() is None
            self._json({"running": running,
                        "tagged": len(xs.load_portrait_tags())})
        elif p == "/api/queue":
            with _queue_lock:
                cur = ("%s/%s" % (_current["style"], _current["stem"])) if _current else None
                t0 = _job_t0
                pby = {}
                pkeys = {}
                for j in _queue:
                    pby[j["style"]] = pby.get(j["style"], 0) + 1
                    k = "%s/%s" % (j["style"], j["stem"])
                    pkeys[k] = pkeys.get(k, 0) + 1
                if cur:
                    pkeys[cur] = pkeys.get(cur, 0) + 1
                self._json({"pending": len(_queue), "current": cur,
                            "pending_keys": pkeys,
                            "errors": _errors,
                            "elapsed": (time.time() - t0) if (cur and t0) else 0,
                            "avg": (sum(_durations) / len(_durations)) if _durations else None,
                            "batch_done": _batch_done,
                            "batch_total": _batch_total,
                            "pending_by_style": pby,
                            "paused": _paused})
        elif p == "/api/checkpoints":
            try:
                names = xs._get_json("/models/checkpoints")
            except Exception:
                names = []
            self._json({"checkpoints": names})
        elif p == "/api/loras":
            try:
                names = xs._get_json("/models/loras")
            except Exception:
                names = []
            self._json({"loras": names})
        elif p.startswith("/api/recent"):
            try:
                n = int(urllib.parse.parse_qs(
                    urllib.parse.urlparse(p).query).get("n", ["60"])[0])
            except (ValueError, IndexError):
                n = 60
            items = []
            if os.path.isdir(xs.STYLIZED_DIR):
                for style in os.listdir(xs.STYLIZED_DIR):
                    sdir = os.path.join(xs.STYLIZED_DIR, style)
                    if not os.path.isdir(sdir):
                        continue
                    for stem in os.listdir(sdir):
                        vdir = os.path.join(sdir, stem)
                        if not os.path.isdir(vdir):
                            continue
                        for f in os.listdir(vdir):
                            if f.endswith(".png"):
                                try:
                                    mt = os.path.getmtime(os.path.join(vdir, f))
                                except OSError:
                                    continue
                                items.append((mt, style, stem, f))
            items.sort(reverse=True)
            now = time.time()
            counts = {"minute": 0, "hour": 0, "day": 0}
            for m, _, _, _ in items:
                age = now - m
                if age > 86400:
                    break  # items est trie du plus recent au plus ancien
                counts["day"] += 1
                if age <= 3600:
                    counts["hour"] += 1
                if age <= 60:
                    counts["minute"] += 1
            self._json({"items": [{"style": s, "stem": st, "file": f, "mtime": m}
                                  for m, s, st, f in items[:max(1, min(500, n))]],
                        "counts": counts})
        elif p.startswith("/api/fmtime"):
            # date de generation d'une variante (mtime du fichier)
            q = urllib.parse.parse_qs(urllib.parse.urlparse(p).query)
            rel = (q.get("path") or [""])[0]
            path = os.path.abspath(os.path.join(xs.STYLIZED_DIR, *rel.split("/")))
            mt = None
            if path.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               and os.path.exists(path):
                mt = os.path.getmtime(path)
            self._json({"mtime": mt})
        elif p.startswith("/api/genparams"):
            # parametres de generation d'une image (chunk PNG 'parameters',
            # format A1111 ecrit par save_png_with_params), parses en champs
            q = urllib.parse.parse_qs(urllib.parse.urlparse(p).query)
            rel = (q.get("path") or [""])[0]
            path = os.path.abspath(os.path.join(xs.STYLIZED_DIR, *rel.split("/")))
            out = {}
            txt = ""
            if path.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               and os.path.exists(path):
                try:
                    with Image.open(path) as im:
                        txt = (getattr(im, "text", None) or {}).get("parameters") or ""
                except Exception:
                    txt = ""
            if txt:
                import re
                first = txt.split("\n", 1)[0]
                m = re.search(r"<lora:([^:>]+):([0-9.]+)>", first)
                if m:
                    out["lora"] = m.group(1)
                    out["lora_strength"] = float(m.group(2))
                    first = first[:m.start()].rstrip()
                out["positive"] = first
                m = re.search(r"^Negative prompt: (.*)$", txt, re.M)
                if m:
                    out["negative"] = m.group(1)
                for key, pat, conv in (
                        ("steps", r"Steps: (\d+)", int),
                        ("sampler", r"Sampler: ([^,]+)", str),
                        ("cfg", r"CFG scale: ([\d.]+)", float),
                        ("seed", r"Seed: (\d+)", int),
                        ("model", r"Model: (.*?), Denoising", str),
                        ("denoise", r"Denoising strength: ([\d.]+)", float),
                        ("cnet_type", r"ControlNet: union-(\w+)", str),
                        ("cnet_strength", r"ControlNet: union-\w+ \(strength ([\d.]+)", float),
                        ("cnet_end", r"end ([\d.]+)\)", float)):
                    m = re.search(pat, txt)
                    if m:
                        out[key] = conv(m.group(1))
                # mots ajoutes via le popup a la generation : le positif complet =
                # tags perso + base du style + suffixe + EXTRAS -> on coupe apres
                # le suffixe ; le negatif = base + EXTRAS + tags sexe -> on retire
                # la base au debut et les tags sexe a la fin.
                try:
                    parts_rel = rel.split("/")
                    style_key, stem0 = parts_rel[0], parts_rel[1]
                    cfg = xs.load_styles()
                    st = cfg["styles"].get(style_key)
                    if st and out.get("positive"):
                        sfx = cfg["defaults"]["suffix"]
                        for cand in {sfx,
                                     sfx.replace("looking ahead", "looking at viewer"),
                                     sfx.replace("looking at viewer", "looking ahead")}:
                            i = out["positive"].rfind(cand)
                            if i >= 0:
                                out["pos_extra"] = out["positive"][i + len(cand):].strip(" ,")
                                break
                    if st and out.get("negative"):
                        base_neg = cfg["defaults"][st["base"]]["negative"] \
                            + st.get("negative_extra", "")
                        neg = out["negative"]
                        if neg.startswith(base_neg):
                            mid = neg[len(base_neg):].strip(" ,")
                            _pp, pneg = xs.portrait_prompt_tags(stem0)
                            if pneg and mid.endswith(pneg):
                                mid = mid[:-len(pneg)].strip(" ,")
                            out["neg_extra"] = mid
                except Exception:
                    pass
            self._json(out)
        elif p.startswith("/api/geninfo"):
            # l'image porte-t-elle des infos de generation (chunk PNG
            # 'parameters') ? les uploads/customs n'en ont pas.
            q = urllib.parse.parse_qs(urllib.parse.urlparse(p).query)
            rel = (q.get("path") or [""])[0]
            path = os.path.abspath(os.path.join(xs.STYLIZED_DIR, *rel.split("/")))
            has = False
            if path.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               and os.path.exists(path):
                try:
                    with Image.open(path) as im:
                        has = bool((getattr(im, "text", None) or {}).get("parameters"))
                except Exception:
                    has = False
            self._json({"has_info": has})
        elif p.startswith("/thumb/original/"):
            stem = p.split("/thumb/original/", 1)[1]
            self._thumb(os.path.join(xs.ORIGINALS_DIR, stem + ".png"), "orig/" + stem)
        elif p.startswith("/thumb/var/"):
            rest = p.split("/thumb/var/", 1)[1]
            self._thumb(os.path.join(xs.STYLIZED_DIR, *rest.split("/")), "var/" + rest)
        elif p.startswith("/img/original/"):
            stem = p.split("/img/original/", 1)[1]
            self._file(os.path.join(xs.ORIGINALS_DIR, stem + ".png"))
        elif p.startswith("/img/var/"):
            rest = p.split("/img/var/", 1)[1]
            self._file(os.path.join(xs.STYLIZED_DIR, *rest.split("/")))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        p = self.path
        if p.startswith("/api/upload_custom"):
            # corps binaire (image), pas du JSON
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(p).query)
            stem = (qs.get("stem", [""])[0]).strip()
            portraits = {x["stem"] for x in xs.list_portraits()}
            if stem not in portraits:
                self._json({"ok": False, "error": "portrait inconnu"}, 400)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = self.rfile.read(length)
                out = xs.save_custom_upload(stem, data)
                self._json({"ok": True, "file": os.path.basename(out)})
            except Exception as e:
                self._json({"ok": False, "error": str(e)[:200]}, 400)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if p == "/api/select":
            sel = xs.load_selections()
            sel[body["key"]] = body.get("file")
            xs.save_selections(sel)
            self._json({"ok": True})
        elif p == "/api/regen":
            n = max(1, min(10, int(body.get("count", 1))))
            job = {"style": body["style"], "stem": body["stem"],
                   "denoise": body.get("denoise"),
                   "pos": body.get("pos"), "neg": body.get("neg"),
                   "lora_strength": body.get("lora_strength"),
                   "cnet_strength": body.get("cnet_strength"),
                   "cnet_end": body.get("cnet_end"),
                   "seed": body.get("seed"),
                   "checkpoint": body.get("checkpoint"),
                   "lora_enabled": body.get("lora_enabled", True),
                   "lora": body.get("lora"), "source": body.get("source"),
                   "steps": body.get("steps"), "cfg": body.get("cfg")}
            # ordre chronologique des demandes ; front=True seulement si
            # demande explicitement prioritaire (bouton "Generer en priorite").
            # seed explicite + plusieurs exemplaires : seed incrementee par
            # copie (sinon N images identiques)
            jobs = []
            for i in range(n):
                j = dict(job)
                if j.get("seed") is not None and i:
                    j["seed"] = int(j["seed"]) + i
                jobs.append(j)
            _enqueue(jobs, front=bool(body.get("front")))
            self._json({"ok": True, "queued": n})
        elif p.startswith("/api/upload_custom"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(p).query)
            stem = (qs.get("stem", [""])[0]).strip()
            portraits = {x["stem"] for x in xs.list_portraits()}
            if stem not in portraits:
                self._json({"ok": False, "error": "portrait inconnu"}, 400)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = self.rfile.read(length)
                out = xs.save_custom_upload(stem, data)
                self._json({"ok": True, "file": os.path.basename(out)})
            except Exception as e:
                self._json({"ok": False, "error": str(e)[:200]}, 400)
        elif p == "/api/pick_dir":
            try:
                out = subprocess.run(
                    ["powershell", "-NoProfile", "-STA", "-Command",
                     "Add-Type -AssemblyName System.Windows.Forms;"
                     "$top=New-Object System.Windows.Forms.Form -Property @{TopMost=$true};"
                     "$f=New-Object System.Windows.Forms.FolderBrowserDialog;"
                     "$f.Description='PortraitForge - choisir un répertoire';"
                     "if($f.ShowDialog($top) -eq 'OK'){Write-Output $f.SelectedPath}"],
                    capture_output=True, text=True, timeout=300)
                path = (out.stdout or "").strip()
            except Exception:
                path = ""
            self._json({"path": path})
        elif p == "/api/tagger_run":
            global _tagger_proc
            if _tagger_proc is not None and _tagger_proc.poll() is None:
                self._json({"ok": False, "error": "analyse déjà en cours"})
                return
            _tagger_proc = subprocess.Popen(
                [sys.executable, os.path.join(xs.APP_DIR, "tagger.py")],
                cwd=xs.APP_DIR,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self._json({"ok": True})
        elif p == "/api/queue_ctl":
            global _paused, _batch_total, _auto_paused
            act = body.get("action")
            if act == "pause":
                _paused = True
                _auto_paused = False  # pause voulue par l'utilisateur
            elif act == "resume":
                _paused = False
                _auto_paused = False
            elif act == "clear":
                with _queue_lock:
                    n = len(_queue)
                    _queue.clear()
                    _batch_total = max(0, _batch_total - n)
            _persist_queue()
            self._json({"ok": True, "paused": _paused})
        elif p == "/api/defaults_cfg":
            cfg_path = os.path.join(xs.APP_DIR, "styles.json")
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            d = cfg["defaults"]
            if body.get("pony_prefix") is not None:
                d["pony"]["prefix"] = body["pony_prefix"]
            if body.get("pony_negative") is not None:
                d["pony"]["negative"] = body["pony_negative"]
            if body.get("il_prefix") is not None:
                d["illustrious"]["prefix"] = body["il_prefix"]
            if body.get("il_negative") is not None:
                d["illustrious"]["negative"] = body["il_negative"]
            if body.get("suffix") is not None:
                d["suffix"] = body["suffix"]
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            self._json({"ok": True})
        elif p == "/api/games_select":
            if switch_game(body.get("id")):
                self._json({"ok": True})
            else:
                self._json({"ok": False, "error": "jeu inconnu"}, 404)
        elif p == "/api/games_add":
            name = (body.get("name") or "").strip()
            work = (body.get("work_dir") or "").strip().strip('"')
            pack = (body.get("pack_dir") or "").strip().strip('"')
            if not name or not os.path.isdir(work):
                self._json({"ok": False,
                            "error": "nom manquant ou répertoire de travail introuvable"}, 400)
                return
            if not os.path.isdir(os.path.join(work, "_originals")):
                self._json({"ok": False,
                            "error": "le répertoire de travail doit contenir un sous-dossier _originals avec les images d'origine"}, 400)
                return
            gid = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_") or "jeu"
            g = xs.load_games()
            base_gid, i = gid, 2
            while any(x["id"] == gid for x in g["games"]):
                gid = "%s_%d" % (base_gid, i)
                i += 1
            g["games"].append({"id": gid, "name": name,
                               "work_dir": os.path.abspath(work),
                               "pack_dir": os.path.abspath(pack) if pack else ""})
            xs.save_games(g)
            switch_game(gid)
            self._json({"ok": True, "id": gid})
        elif p == "/api/game_pack":
            g = xs.load_games()
            for game in g["games"]:
                if game["id"] == g.get("current"):
                    game["pack_dir"] = (body.get("pack_dir") or "").strip()
                    xs.save_games(g)
                    xs.set_game(game)
                    break
            self._json({"ok": True})
        elif p == "/api/restore_originals":
            r = xs.restore_originals()
            self._json({"ok": True, "restored": r["restored"],
                        "pack_found": r["pack_found"]})
        elif p == "/api/select_auto":
            excluded = xs.load_excluded()
            sel = xs.load_selections()
            n = 0
            for pt in xs.list_portraits():
                if pt["stem"] in excluded:
                    continue
                key = "%s/%s" % (body["style"], pt["stem"])
                vdir = os.path.join(xs.STYLIZED_DIR, body["style"], pt["stem"])
                if not os.path.isdir(vdir):
                    continue
                files = [f for f in os.listdir(vdir) if f.endswith(".png")]
                if not files:
                    continue
                if sel.get(key) in files:
                    continue  # selection explicite existante conservee
                newest = max(files,
                             key=lambda f: os.path.getmtime(os.path.join(vdir, f)))
                sel[key] = newest
                n += 1
            xs.save_selections(sel)
            self._json({"ok": True, "selected": n})
        elif p == "/api/regen_all":
            excluded = xs.load_excluded()
            count = max(1, min(10, int(body.get("count")
                                       or load_settings().get("gen_all_count", 2))))
            base = {"style": body["style"], "denoise": body.get("denoise"),
                    "pos": body.get("pos"), "neg": body.get("neg"),
                    "lora_strength": body.get("lora_strength"),
                    "cnet_strength": body.get("cnet_strength"),
                    "cnet_end": body.get("cnet_end"),
                    "checkpoint": body.get("checkpoint"),
                    "lora_enabled": body.get("lora_enabled", True),
                    "lora": body.get("lora"), "source": body.get("source"),
                    "steps": body.get("steps"), "cfg": body.get("cfg")}
            sex = body.get("sex")
            meta = xs.load_portrait_meta()
            jobs = []
            for pt in xs.list_portraits():
                if pt["stem"] in excluded:
                    continue
                if sex and ((meta.get(pt["stem"]) or {}).get("sex") or "male") != sex:
                    continue
                if body["style"] == xs.CUSTOM_KEY and \
                   not xs.list_style_variants(xs.CUSTOM_KEY, pt["stem"]):
                    continue  # categorie Custom : seulement les persos qui y ont des images
                for _ in range(count):
                    jobs.append(dict(base, stem=pt["stem"]))
            _enqueue(jobs)
            self._json({"ok": True, "queued": len(jobs)})
        elif p == "/api/regen_perso":
            # X generations de CE personnage dans CHACUN des styles actifs
            n = max(1, min(10, int(body.get("count", 1))))
            hidden = set(load_settings().get("hidden_styles") or [])
            cfg = xs.load_styles()
            keys = [k for k in cfg["styles"] if k not in hidden]
            jobs = []
            for sk in keys:
                for _ in range(n):
                    jobs.append({"style": sk, "stem": body["stem"],
                                 "pos": body.get("pos"), "neg": body.get("neg")})
            _enqueue(jobs, front=bool(body.get("front")))
            self._json({"ok": True, "queued": len(jobs), "styles": len(keys)})
        elif p == "/api/regen_missing":
            variants = list_variants()
            excluded = xs.load_excluded()
            selections = xs.load_selections()
            count = max(1, min(10, int(body.get("count")
                                       or load_settings().get("regen_count", 2))))
            base = {"style": body["style"], "denoise": body.get("denoise"),
                    "pos": body.get("pos"), "neg": body.get("neg"),
                    "lora_strength": body.get("lora_strength"),
                    "cnet_strength": body.get("cnet_strength"),
                    "cnet_end": body.get("cnet_end"),
                    "checkpoint": body.get("checkpoint"),
                    "lora_enabled": body.get("lora_enabled", True)}
            sex = body.get("sex")
            meta = xs.load_portrait_meta()
            jobs = []
            for pt in xs.list_portraits():
                if pt["stem"] in excluded:
                    continue
                if sex and ((meta.get(pt["stem"]) or {}).get("sex") or "male") != sex:
                    continue
                key = "%s/%s" % (body["style"], pt["stem"])
                chosen = selections.get(key)
                if chosen and chosen in (variants.get(key) or []):
                    continue  # deja une selection explicite
                for _ in range(count):
                    jobs.append(dict(base, stem=pt["stem"]))
            _enqueue(jobs)
            self._json({"ok": True, "queued": len(jobs)})
        elif p == "/api/delete":
            fname = os.path.basename(body["file"])
            path = os.path.abspath(os.path.join(
                xs.STYLIZED_DIR, body["style"], body["stem"], fname))
            if not path.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               or not path.endswith(".png") or not os.path.exists(path):
                self._json({"ok": False, "error": "chemin invalide"}, 400)
                return
            # corbeille (annulable) : nom prefixe par la date d'origine,
            # mtime du fichier corbeille = maintenant (pour la purge)
            trash_dir = os.path.join(xs.PROJECT_DIR, "_appdata", "trash",
                                     body["style"], body["stem"])
            os.makedirs(trash_dir, exist_ok=True)
            tname = "%d__%s" % (int(os.path.getmtime(path)), fname)
            os.replace(path, os.path.join(trash_dir, tname))
            os.utime(os.path.join(trash_dir, tname), None)
            # purge des elements en corbeille depuis plus de 7 jours
            troot = os.path.join(xs.PROJECT_DIR, "_appdata", "trash")
            cutoff = time.time() - 7 * 86400
            for r_, _d, fs in os.walk(troot):
                for f0 in fs:
                    p0 = os.path.join(r_, f0)
                    try:
                        if os.path.getmtime(p0) < cutoff:
                            os.remove(p0)
                    except OSError:
                        pass
            key = "%s/%s" % (body["style"], body["stem"])
            sel = xs.load_selections()
            if sel.get(key) == fname:
                sel[key] = None
                xs.save_selections(sel)
            self._json({"ok": True})
        elif p == "/api/undelete":
            # restaure la derniere version en corbeille de ce fichier
            fname = os.path.basename(body["file"])
            trash_dir = os.path.join(xs.PROJECT_DIR, "_appdata", "trash",
                                     body["style"], body["stem"])
            cands = []
            if os.path.isdir(trash_dir):
                cands = [f for f in os.listdir(trash_dir)
                         if f.endswith("__" + fname)]
            if not cands:
                self._json({"ok": False, "error": "introuvable en corbeille"}, 404)
                return
            cands.sort(key=lambda f: os.path.getmtime(os.path.join(trash_dir, f)))
            tpath = os.path.join(trash_dir, cands[-1])
            orig_mtime = None
            try:
                orig_mtime = int(cands[-1].split("__", 1)[0])
            except ValueError:
                pass
            dest_dir = os.path.join(xs.STYLIZED_DIR, body["style"], body["stem"])
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, fname)
            n = 2
            base, ext = os.path.splitext(fname)
            while os.path.exists(dest):
                dest = os.path.join(dest_dir, "%s_r%d%s" % (base, n, ext))
                n += 1
            os.replace(tpath, dest)
            if orig_mtime:
                os.utime(dest, (orig_mtime, orig_mtime))
            self._json({"ok": True, "file": os.path.basename(dest)})
        elif p == "/api/meta":
            meta = xs.load_portrait_meta()
            sex = body.get("sex")
            if sex in ("male", "female", "other"):
                meta[body["stem"]] = {"sex": sex,
                                      "text": (body.get("text") or "").strip()}
            else:
                meta.pop(body["stem"], None)
            xs.save_portrait_meta(meta)
            self._json({"ok": True})
        elif p == "/api/delete_style":
            sk = body.get("style") or ""
            only_unsel = bool(body.get("only_unselected"))
            sdir = os.path.abspath(os.path.join(xs.STYLIZED_DIR, sk))
            if not sk or not sdir.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               or not os.path.isdir(sdir):
                self._json({"ok": False, "error": "style invalide"}, 400)
                return
            sel = xs.load_selections()
            n = 0
            for stem in os.listdir(sdir):
                vdir = os.path.join(sdir, stem)
                if not os.path.isdir(vdir):
                    continue
                key = "%s/%s" % (sk, stem)
                keep = sel.get(key) if only_unsel else None
                for f in os.listdir(vdir):
                    if not f.endswith(".png") or f == keep:
                        continue
                    os.remove(os.path.join(vdir, f))
                    n += 1
                if not only_unsel and sel.get(key):
                    sel[key] = None
            xs.save_selections(sel)
            self._json({"ok": True, "deleted": n})
        elif p == "/api/delete_all":
            vdir = os.path.abspath(os.path.join(
                xs.STYLIZED_DIR, body["style"], body["stem"]))
            if not vdir.startswith(os.path.abspath(xs.STYLIZED_DIR)) \
               or not os.path.isdir(vdir):
                self._json({"ok": False, "error": "chemin invalide"}, 400)
                return
            n = 0
            for f in os.listdir(vdir):
                if f.endswith(".png"):
                    os.remove(os.path.join(vdir, f))
                    n += 1
            key = "%s/%s" % (body["style"], body["stem"])
            sel = xs.load_selections()
            if sel.get(key):
                sel[key] = None
                xs.save_selections(sel)
            self._json({"ok": True, "deleted": n})
        elif p == "/api/open":
            url = urllib.parse.unquote(body.get("url", ""))
            if url.startswith("/img/original/") or url.startswith("/thumb/original/"):
                stem = url.split("/original/", 1)[1]
                path = os.path.join(xs.ORIGINALS_DIR, stem + ".png")
            elif url.startswith("/img/var/") or url.startswith("/thumb/var/"):
                rest = url.split("/var/", 1)[1]
                path = os.path.join(xs.STYLIZED_DIR, *rest.split("/"))
            else:
                path = ""
            path = os.path.abspath(path) if path else ""
            if not path.startswith(xs.PROJECT_DIR) or not os.path.exists(path):
                self._json({"ok": False}, 404)
                return
            if body.get("mode") == "folder":
                subprocess.Popen(["explorer", "/select,", path])
            else:
                os.startfile(path)
            self._json({"ok": True})
        elif p == "/api/exclude":
            ex = xs.load_excluded()
            if body.get("excluded"):
                ex.add(body["stem"])
            else:
                ex.discard(body["stem"])
            xs.save_excluded(ex)
            self._json({"ok": True})
        elif p == "/api/order":
            # ordre custom des portraits (tri "custom" du Tri des textures)
            xs.save_order([str(s) for s in (body.get("order") or [])])
            self._json({"ok": True})
        elif p == "/api/settings":
            s = load_settings()
            for k, v in body.items():
                if k in DEFAULT_SETTINGS:
                    s[k] = v
            save_settings(s)
            apply_runtime_settings(s)
            self._json({"ok": True, "settings": s})
        elif p == "/api/style_cfg":
            cfg_path = os.path.join(xs.APP_DIR, "styles.json")
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            sk = body.get("style")
            if sk not in cfg["styles"]:
                self._json({"ok": False}, 400)
                return
            for k in ("lora_strength", "denoise", "cnet_strength", "cnet_end"):
                if body.get(k) is not None:
                    cfg["styles"][sk][k] = float(body[k])
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            self._json({"ok": True})
        elif p == "/api/open_dir":
            dirs = {"selected": xs.EXPORT_DIR,
                    "backup": xs.PACK_BACKUP_DIR,
                    "pack": xs.PACK_DIR,
                    "thumbs": THUMB_DIR,
                    "work": xs.PROJECT_DIR,
                    "stylized": xs.STYLIZED_DIR}
            d = dirs.get(body.get("which"))
            if d and os.path.isdir(d):
                subprocess.Popen(["explorer", d])
                self._json({"ok": True})
            else:
                self._json({"ok": False, "error": "repertoire introuvable"}, 404)
        elif p == "/api/final":
            final = xs.load_final()
            if body.get("ref"):
                final[body["stem"]] = body["ref"]
            else:
                final.pop(body["stem"], None)
            xs.save_final(final)
            self._json({"ok": True})
        elif p == "/api/export":
            settings = load_settings()
            if body.get("scope") == "style" and body.get("style"):
                r = xs.export_style(body["style"])
            else:
                cfg = xs.load_styles()
                hidden = set(settings.get("hidden_styles", []))
                order = sorted(
                    (k for k in cfg["styles"] if k not in hidden),
                    key=lambda k: cfg["styles"][k]["label"].lower())
                r = xs.export_final(order)
            self._json({"ok": True, "count": len(r["exported"]),
                        "installed": r["installed"],
                        "backed_up": r["backed_up"],
                        "pack_found": r["pack_found"]})
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    print("PortraitForge -> http://127.0.0.1:%d" % PORT)
    if not xs.comfy_alive():
        print("ATTENTION: ComfyUI ne repond pas sur %s (la regeneration echouera)" % xs.COMFY_URL)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
