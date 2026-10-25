# -*- coding: utf-8 -*-
"""Exporteurs externes : pour les jeux dont le "pack" n'est pas un simple dossier de PNG.

Un jeu de games.json peut porter une cle "exporter". Seul type pour l'instant, "cpk_mod" :
les images exportees sont deposees dans le dossier d'import d'un toolkit externe qui reconstruit
les archives du jeu en mod LayeredFS (cas de 13 Sentinels: Aegis Rim sur Switch).

  "exporter": {"type": "cpk_mod",
               "toolkit_dir": "<dossier contenant import_mod.py>",
               "export_dir":  "<dossier de l'export du toolkit, avec manifest.json>",
               "import_dir":  "<dossier d'import du toolkit>",
               "load_dir":    "%APPDATA%\\yuzu\\load",
               "mod_name":    "Mon mod",
               "texconv":     ""}            # optionnel : chemin de texconv.exe (meilleur encodage BC7)

Le dossier _originals du jeu doit contenir _sources.json (ecrit par make_workdir.py du toolkit) :
nom du PNG d'origine -> {"png": chemin relatif dans l'export, "sha1": ..., ...}.
Les textures du manifeste qui partagent le meme sha1 (doublons entre archives de langue)
recoivent toutes la meme image.
"""
import json
import os
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

    def sources(self):
        if self._sources is None:
            p = os.path.join(self.work_dir, "_originals", "_sources.json")
            try:
                with open(p, "r", encoding="utf-8") as f:
                    self._sources = json.load(f)
            except (OSError, ValueError):
                self._sources = {}
        return self._sources

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
        """Chemins relatifs (dans import_dir) a ecrire pour un PNG de _originals."""
        src = self.sources().get(name)
        if not src:
            return []
        rels = list(self._duplicates().get(src.get("sha1"), []))
        if src["png"] not in rels:
            rels.insert(0, src["png"])
        return rels

    def _dst(self, rel):
        return os.path.join(self.cfg["import_dir"], rel.replace("\\", os.sep).replace("/", os.sep))

    def install(self, name, image):
        """Depose l'image (deja a la taille d'origine) pour chaque texture concernee. Retourne le nombre ecrit."""
        n = 0
        for rel in self.targets(name):
            dst = self._dst(rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            image.save(dst)
            n += 1
        return n

    def remove(self, name):
        n = 0
        for rel in self.targets(name):
            dst = self._dst(rel)
            if os.path.exists(dst):
                os.remove(dst)
                n += 1
        return n

    def rebuild(self):
        """Reconstruit le mod avec import_mod.py du toolkit (peut prendre plusieurs minutes)."""
        script = os.path.join(self.cfg["toolkit_dir"], "import_mod.py")
        cmd = [sys.executable, script, self.cfg["export_dir"], self.cfg["import_dir"],
               self.cfg["load_dir"], self.cfg["mod_name"]]
        if self.cfg.get("texconv"):
            cmd += ["--texconv", self.cfg["texconv"]]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                               cwd=self.cfg["toolkit_dir"], timeout=3600)
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"ok": False, "error": str(e), "output": ""}
        out = (r.stdout or "") + (r.stderr or "")
        tail = "\n".join(out.strip().splitlines()[-12:])
        return {"ok": r.returncode == 0,
                "error": "" if r.returncode == 0 else "import_mod.py a renvoye le code %d" % r.returncode,
                "output": tail}


def get_exporter(game):
    cfg = (game or {}).get("exporter")
    if isinstance(cfg, dict) and cfg.get("type") == "cpk_mod":
        return CpkModExporter(game["work_dir"], cfg)
    return None
