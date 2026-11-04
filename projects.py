"""
Stellura project files (.stellura)
==================================
A project is one ordinary zip file you can copy to a pen drive or e-mail:

    manifest.json   format version, row/column counts, saved time
    state.json      everything the app needs besides the table (formatting, steps, audit log ...)
    data.parquet    the table, compressed, stored as text exactly as imported

Saving never overwrites the only good copy: the previous version is kept as <name>.stellura.bak.
"""
import io
import json
import os
import re
import time
import zipfile
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

FORMAT = 1
EXT = ".stellura"


class ProjectError(ValueError):
    pass


def projects_dir():
    base = os.environ.get("STELLURA_HOME")
    root = Path(base) if base else Path.home() / "Stellura"
    d = root / "Projects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_name(name):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", str(name or "")).strip(" .")[:80]
    return name or "Untitled"


def _path(name):
    return projects_dir() / (safe_name(name) + EXT)


def save(name, state, table):
    """table: pyarrow.Table with the real header names as column names."""
    path = _path(name)
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="zstd")
    manifest = {
        "format": FORMAT, "app": "Stellura", "name": safe_name(name),
        "saved": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "rows": table.num_rows, "cols": table.num_columns,
    }
    tmp = path.with_suffix(EXT + ".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        z.writestr("state.json", json.dumps(state or {}, ensure_ascii=False))
        z.writestr("data.parquet", buf.getvalue())
    if path.exists():
        os.replace(path, path.with_suffix(EXT + ".bak"))
    os.replace(tmp, path)
    return {**manifest, "path": str(path), "size": path.stat().st_size}


def open_project(name):
    path = _path(name)
    if not path.exists():
        raise ProjectError("Project not found.")
    try:
        with zipfile.ZipFile(path) as z:
            manifest = json.loads(z.read("manifest.json"))
            if manifest.get("format", 0) > FORMAT:
                raise ProjectError("This project was saved by a newer version of Stellura.")
            state = json.loads(z.read("state.json"))
            table = pq.read_table(io.BytesIO(z.read("data.parquet")))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError, pa.ArrowException) as exc:
        raise ProjectError(f"This project file is damaged ({exc}). Try the .bak copy next to it.")
    return manifest, state, table


def list_projects():
    out = []
    for p in sorted(projects_dir().glob("*" + EXT), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with zipfile.ZipFile(p) as z:
                m = json.loads(z.read("manifest.json"))
        except Exception:
            m = {}
        out.append({"name": p.stem, "rows": m.get("rows"), "cols": m.get("cols"),
                    "saved": m.get("saved"), "size": p.stat().st_size})
    return out


def delete(name):
    path = _path(name)
    if not path.exists():
        return False
    path.unlink()
    path.with_suffix(EXT + ".bak").unlink(missing_ok=True)
    return True
