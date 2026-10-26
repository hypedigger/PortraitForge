# -*- coding: utf-8 -*-
"""Exporteurs externes : pour les jeux dont le "pack" n'est pas un simple dossier de PNG.

Un jeu de games.json peut porter une cle "exporter". Seul type pour l'instant, "cpk_mod" :
les images exportees sont deposees dans le dossier d'import d'un toolkit externe qui reconstruit
les archives du jeu en mod LayeredFS (cas de 13 Sentinels: Aegis Rim sur Switch).

  "exporter": {"type": "cpk_mod",
               "toolkit_dir": "<dossier contenant import_mod.py et restyle_chain.py>",
               "export_dir":  "<dossier de l'export du toolkit, avec manifest.json>",
               "import_dir":  "<dossier d'import du toolkit>",
               "load_dir":    "%APPDATA%\\yuzu\\load",
               "mod_name":    "Mon mod",
               "texconv":     ""}            # optionnel : chemin de texconv.exe (meilleur encodage BC7)

Le dossier _originals du jeu doit contenir _sources.json (ecrit par make_workdir.py / make_pose_workdir.py
du toolkit) : nom du PNG d'origine -> description de la source. Deux types :
- texture (defaut) : {"png": chemin relatif dans l'export, "sha1": ...} ; l'image choisie remplace la texture
  (et ses doublons de meme sha1 dans les archives de langue).
- region : {"type": "region", "png", "rect": [x, y, l, h], "pad", "square", "alpha": "keep"} ; l'original est
  un sprite decoupe dans une texture (mis au carre par des marges) ; l'image choisie est recadree et recollee
  a sa place dans la texture (alpha d'origine conserve) ; plusieurs regions d'une meme texture se cumulent.
- pose : {"type": "pose", "pose_dir", "stem", "pad", "size", "mbs", "atlas_rel", "selection", "atlas_pngs"} ;
  l'image choisie est recadree (les marges qui la mettaient au carre sont retirees) et rangee comme version
  modifiee de la pose ; a la reconstruction, restyle_chain.py redecoupe toutes les poses modifiees du
  personnage dans ses atlas, dans l'ordre de la selection, puis import_mod.py reconstruit le mod.
- mesh : {"type": "mesh", "render", "png", "sha1", "pad", "size", "square"} ; l'original est une illustration
  assemblee depuis un maillage .fmd (make_mesh_workdir.py) ; l'image choisie est recadree en <render>_mod.png
  et, a la reconstruction, fmd.py split recolle chaque triangle visible dans la texture.
"""
import json
import os
import shutil
import subprocess
import sys


class CpkModExporter:
    type = "cpk_mod"

    def __init__(self, work_dir, cfg):
        self.work_dir = work_dir
        self.cfg = {k: (os.path.expandvars(v) if isinstance(v, str) else v)
                    for k, v in cfg.items()}
        self._sources = None
        self._dups = None

    @property
    def label(self):
        return self.cfg.get("mod_name") or "mod"

    TITLE_ID = "01003FC01670C000"  # 13 Sentinels: Aegis Rim (Switch) ; surcharge : cle "title_id"

    @property
    def destination(self):
        """Dossier ou le mod est reconstruit : <load_dir>\\<title id>\\<mod_name>\\romfs."""
        return os.path.join(self.cfg.get("load_dir") or "", self.cfg.get("title_id") or self.TITLE_ID,
                            self.cfg.get("mod_name") or "mod", "romfs")

    def sources(self):
        if self._sources is None:
            p = os.path.join(self.work_dir, "_originals", "_sources.json")
            try:
                with open(p, "r", encoding="utf-8") as f:
                    self._sources = json.load(f)
            except (OSError, ValueError):
                self._sources = {}
        return self._sources

    # ------------------------------------------------------------- textures
    def _duplicates(self):
        """sha1 -> tous les chemins PNG du manifeste partageant ces donnees."""
        if self._dups is None:
            self._dups = {}
            mf = os.path.join(self.cfg.get("export_dir", ""), "manifest.json")
            try:
                with open(mf, "r", encoding="utf-8") as f:
                    m = json.load(f)
                for r in m.get("textures", []):
                    if r.get("png") and r.get("sha1"):
                        self._dups.setdefault(r["sha1"], []).append(r["png"])
            except (OSError, ValueError):
                pass
        return self._dups

    def targets(self, name):
        """Chemins relatifs (dans import_dir) a ecrire pour un PNG de _originals de type texture."""
        src = self.sources().get(name)
        if not src or src.get("type") in ("pose", "mesh"):
            return []
        rels = list(self._duplicates().get(src.get("sha1"), []))
        if src["png"] not in rels:
            rels.insert(0, src["png"])
        return rels

    def _dst(self, rel):
        return os.path.join(self.cfg["import_dir"], rel.replace("\\", os.sep).replace("/", os.sep))

    # ---------------------------------------------------------------- poses
    def _pose_mod_path(self, src):
        return os.path.join(src["pose_dir"], src["stem"] + "_mod.png")

    def _pose_groups(self):
        """Regroupe les sources de type pose par personnage : cle -> (source de reference, [sources])."""
        groups = {}
        for name, src in self.sources().items():
            if src.get("type") != "pose":
                continue
            key = (src["mbs"], src["atlas_rel"], src["selection"], src["pose_dir"])
            groups.setdefault(key, []).append(src)
        return groups

    # ------------------------------------------------------------- maillages
    def _mesh_mod_path(self, src):
        return os.path.splitext(src["render"])[0] + "_mod.png"

    def _mesh_targets(self, src):
        """Chemins relatifs de la texture et de ses doublons (autres archives)."""
        rels = list(self._duplicates().get(src.get("sha1"), []))
        if src["png"] not in rels:
            rels.insert(0, src["png"])
        return rels

    def _mesh_rebuild(self, src, log):
        """Recolle le rendu modifie dans la texture (fmd.py split) ; sans rendu modifie, retire la texture du mod."""
        tk = self.cfg["toolkit_dir"]
        mod = self._mesh_mod_path(src)
        exp = os.path.join(self.cfg["export_dir"], src["png"].replace("\\", os.sep).replace("/", os.sep))
        rels = self._mesh_targets(src)
        first = self._dst(rels[0])
        marker = first + ".mesh.json"
        if os.path.exists(mod):
            os.makedirs(os.path.dirname(first), exist_ok=True)
            ok, err, out = self._run([os.path.join(tk, "fmd.py"), "split", src["render"], mod, exp, first], 1800)
            log.append("%s : %s" % (os.path.basename(src["png"]), out.splitlines()[-1] if out else err))
            if not ok:
                return False, "fmd.py split %s" % err, out
            with open(marker, "w", encoding="utf-8") as f:
                json.dump({"render": src["render"]}, f)
            for rel in rels[1:]:
                dst = self._dst(rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(first, dst)
        elif os.path.exists(marker):
            for rel in rels:
                dst = self._dst(rel)
                if os.path.exists(dst):
                    os.remove(dst)
            os.remove(marker)
            log.append("%s : plus de rendu modifie, texture retiree du mod" % os.path.basename(src["png"]))
        return True, "", ""

    # -------------------------------------------------------------- regions
    def _region_paths(self, src):
        """(PNG de la texture dans l'export, PNG dans import_dir, fichier annexe listant les regions modifiees)."""
        exp = os.path.join(self.cfg["export_dir"], src["png"].replace("\\", os.sep).replace("/", os.sep))
        imp = self._dst(src["png"])
        return exp, imp, imp + ".regions.json"

    def _region_state(self, side):
        try:
            with open(side, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _region_install(self, name, src, image):
        from PIL import Image
        exp, imp, side = self._region_paths(src)
        x, y, w, h = src["rect"]
        px, py = src["pad"]
        if image.size != (src["square"], src["square"]):
            image = image.resize((src["square"], src["square"]))
        crop = image.convert("RGBA").crop((px, py, px + w, py + h))
        base = Image.open(imp if os.path.exists(imp) else exp).convert("RGBA")
        region = base.crop((x, y, x + w, y + h))
        if src.get("alpha", "keep") == "keep":
            crop.putalpha(region.getchannel("A"))
        base.paste(crop, (x, y))
        os.makedirs(os.path.dirname(imp), exist_ok=True)
        base.save(imp)
        state = self._region_state(side)
        state[name] = src["rect"]
        with open(side, "w", encoding="utf-8") as f:
            json.dump(state, f)
        return 1

    def _region_remove(self, name, src):
        from PIL import Image
        exp, imp, side = self._region_paths(src)
        if not os.path.exists(imp):
            return 0
        state = self._region_state(side)
        if name not in state:
            return 0
        del state[name]
        if not state:
            os.remove(imp)
            if os.path.exists(side):
                os.remove(side)
            return 1
        x, y, w, h = src["rect"]
        base = Image.open(imp).convert("RGBA")
        base.paste(Image.open(exp).convert("RGBA").crop((x, y, x + w, y + h)), (x, y))
        base.save(imp)
        with open(side, "w", encoding="utf-8") as f:
            json.dump(state, f)
        return 1

    # ------------------------------------------------------------ interface
    def install(self, name, image):
        """Depose l'image (deja a la taille de l'original). Retourne le nombre de fichiers ecrits."""
        src = self.sources().get(name)
        if not src:
            return 0
        if src.get("type") == "region":
            return self._region_install(name, src, image)
        if src.get("type") in ("pose", "mesh"):
            px, py = src["pad"]
            w, h = src["size"]
            if image.size != (src["square"], src["square"]):
                image = image.resize((src["square"], src["square"]))
            crop = image.crop((px, py, px + w, py + h))
            dst = self._pose_mod_path(src) if src["type"] == "pose" else self._mesh_mod_path(src)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            crop.save(dst)
            return 1
        n = 0
        for rel in self.targets(name):
            dst = self._dst(rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            image.save(dst)
            n += 1
        return n

    def remove(self, name):
        src = self.sources().get(name)
        if not src:
            return 0
        if src.get("type") == "region":
            return self._region_remove(name, src)
        if src.get("type") in ("pose", "mesh"):
            dst = self._pose_mod_path(src) if src["type"] == "pose" else self._mesh_mod_path(src)
            if os.path.exists(dst):
                os.remove(dst)
                return 1
            return 0
        n = 0
        for rel in self.targets(name):
            dst = self._dst(rel)
            if os.path.exists(dst):
                os.remove(dst)
                n += 1
        return n

    def _run(self, args, timeout):
        try:
            r = subprocess.run([sys.executable] + args, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", cwd=self.cfg["toolkit_dir"], timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as e:
            return False, str(e), ""
        out = (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0, "" if r.returncode == 0 else "code %d" % r.returncode, "\n".join(out.strip().splitlines()[-12:])

    def rebuild(self):
        """Redecoupe les poses modifiees dans les atlas, puis reconstruit le mod avec import_mod.py."""
        tk = self.cfg["toolkit_dir"]
        log = []
        for (mbs, atlas_rel, selection, pose_dir), srcs in self._pose_groups().items():
            atlas_in = os.path.join(self.cfg["export_dir"], atlas_rel.replace("/", os.sep))
            atlas_out = self._dst(atlas_rel)
            has_mod = any(os.path.exists(self._pose_mod_path(s)) for s in srcs)
            if has_mod:
                ok, err, out = self._run([os.path.join(tk, "restyle_chain.py"), "split", mbs, atlas_in, selection, pose_dir, atlas_out], 3600)
                log.append("%s : %s" % (os.path.basename(atlas_rel), out.splitlines()[-1] if out else err))
                if not ok:
                    return {"ok": False, "error": "restyle_chain.py %s" % err, "output": "\n".join(log + [out])}
            elif os.path.isdir(atlas_out):
                for s in srcs[0]["atlas_pngs"]:
                    p = self._dst(s)
                    if os.path.exists(p):
                        os.remove(p)
                log.append("%s : plus de pose modifiee, atlas retires du mod" % os.path.basename(atlas_rel))
        for src in self.sources().values():
            if src.get("type") == "mesh":
                ok, err, out = self._mesh_rebuild(src, log)
                if not ok:
                    return {"ok": False, "error": err, "output": "\n".join(log + [out])}
        cmd = [os.path.join(tk, "import_mod.py"), self.cfg["export_dir"], self.cfg["import_dir"],
               self.cfg["load_dir"], self.cfg["mod_name"]]
        if self.cfg.get("texconv"):
            cmd += ["--texconv", self.cfg["texconv"]]
        ok, err, out = self._run(cmd, 3600)
        return {"ok": ok, "error": "" if ok else "import_mod.py a renvoye %s" % err, "output": "\n".join(log + [out])}


def get_exporter(game):
    cfg = (game or {}).get("exporter")
    if isinstance(cfg, dict) and cfg.get("type") == "cpk_mod":
        return CpkModExporter(game["work_dir"], cfg)
    return None
