"""The managed folder. Only this module writes under store/.

  store/<workbook_id>/current.xlsx          the live file (a human may overwrite it: detected, not blocked)
  store/<workbook_id>/versions/<sha>.xlsx   every version ever seen, immutable
  store/<workbook_id>/versions/<sha>.lo.xlsx  the same version with LibreOffice's saved values (sidecar)
  store/<workbook_id>/shadow/<edit_id>.xlsx   a proposed edit applied to a copy

Saved values. A file the server writes comes from openpyxl and has none. One LibreOffice round trip
takes about 1.8 s here (spikes/soffice_timing.py), too slow for the commit path, so the version is
committed at once as "pending" and a background worker writes the sidecar. The committed file and its
hash never change. Sidecar accepted -> saved_by "LibreOffice" and Checks verify against its values;
anything else -> "none" ("Not verifiable against saved values"). A server commit is never labelled Excel.
"""

import hashlib
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path

from openpyxl import load_workbook

from deltagate import config, db
from deltagate.engine.check import check
from deltagate.engine.parse import Formula, addr, parse, parse_ref
from deltagate.gate import audit
from deltagate.models import AppendRow, CheckResult, EditOp, Policy

RECALC_TIMEOUT = 30  # seconds for one LibreOffice round trip
# One worker: LibreOffice runs are serial (they share a profile folder) and never block a tool call.
_worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="deltagate-libreoffice")
_jobs: list[Future] = []


class Conflict(Exception):
    """The workbook moved on while an edit was being decided or waiting for approval."""


def sha256(path: Path | str) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _dir(workbook_id: str, sub: str = "") -> Path:
    path = config.store_dir() / workbook_id / sub
    path.mkdir(parents=True, exist_ok=True)
    return path


def live_path(workbook_id: str) -> Path:
    return _dir(workbook_id) / "current.xlsx"


def path_of(version: sqlite3.Row) -> Path:
    return config.store_dir() / version["path"]


def saved_source(version: sqlite3.Row) -> Path | None:
    """The sidecar that carries this version's saved values, if LibreOffice produced an accepted one."""
    side = path_of(version).with_suffix(".lo.xlsx")
    return side if version["saved_by"] == "LibreOffice" and side.exists() else None


def by_sha(conn: sqlite3.Connection, sha: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM versions WHERE sha256 = ? ORDER BY id DESC LIMIT 1", (sha,)).fetchone()
    if row is None:
        raise KeyError(f"Unknown version {sha}")
    return row


def workbooks(conn: sqlite3.Connection) -> list[str]:
    return [r["id"] for r in conn.execute("SELECT id FROM workbooks ORDER BY id")]


def _current_row(conn: sqlite3.Connection, workbook_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT v.* FROM workbooks w JOIN versions v ON v.id = w.current_version_id WHERE w.id = ?",
                       (workbook_id,)).fetchone()
    if row is None:  # also keeps anything that is not a registered id away from the file system
        raise KeyError(f"Unknown workbook '{workbook_id}'. Registered: {', '.join(workbooks(conn)) or 'none'}")
    return row


def _last_managed(conn: sqlite3.Connection, version: sqlite3.Row) -> sqlite3.Row:
    while version["source"] != "managed":
        version = conn.execute("SELECT * FROM versions WHERE id = ?", (version["parent_id"],)).fetchone()
    return version


# --- versions -------------------------------------------------------------------------------------


def _add_version(conn: sqlite3.Connection, workbook_id: str, file: Path, parent_id: int | None, source: str,
                 saved_by: str | None = None) -> sqlite3.Row:
    """Snapshot `file` as the workbook's new current version. Call inside a transaction."""
    sha = sha256(file)
    snapshot = _dir(workbook_id, "versions") / f"{sha}.xlsx"
    if not snapshot.exists():
        shutil.copyfile(file, snapshot)
    live = live_path(workbook_id)
    if Path(file) != live:
        shutil.copyfile(snapshot, live.with_suffix(".tmp"))
        os.replace(live.with_suffix(".tmp"), live)

    if saved_by is None:
        try:
            saved_by = parse(snapshot).saved_by
        except Exception:  # not a readable workbook: nothing to verify against
            saved_by = "none"
    soffice = config.soffice()
    if saved_by in ("none", "pending"):
        saved_by = "LibreOffice" if snapshot.with_suffix(".lo.xlsx").exists() else "pending" if soffice else "none"

    relative = snapshot.relative_to(config.store_dir()).as_posix()
    version_id = conn.execute(
        "INSERT INTO versions (workbook_id, sha256, path, parent_id, source, saved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (workbook_id, sha, relative, parent_id, source, saved_by, db.now())).lastrowid
    conn.execute("UPDATE workbooks SET current_version_id = ? WHERE id = ?", (version_id, workbook_id))
    if saved_by == "pending":
        _jobs.append(_worker.submit(_fill_saved_values, str(config.db_path()), sha, snapshot, soffice,
                                    config.data_dir() / "libreoffice_profile"))
    return conn.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()


def register(conn: sqlite3.Connection, src: Path | str, workbook_id: str | None = None) -> str:
    """Take a workbook into the store. Its id is what the agent uses to name it."""
    src = Path(src)
    workbook_id = workbook_id or re.sub(r"[^a-z0-9]+", "_", src.stem.lower()).strip("_")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", workbook_id):
        raise ValueError(f"Bad workbook id '{workbook_id}': use lower-case letters, digits, _ and -")
    with db.tx(conn):
        if conn.execute("SELECT 1 FROM workbooks WHERE id = ?", (workbook_id,)).fetchone():
            raise ValueError(f"Workbook '{workbook_id}' is already registered")
        conn.execute("INSERT INTO workbooks (id, name, created_at) VALUES (?, ?, ?)", (workbook_id, src.name, db.now()))
        version = _add_version(conn, workbook_id, src, None, "managed")
        audit.append(conn, "server", "register", {"workbook_id": workbook_id, "name": src.name,
                                                  "version": version["sha256"], "saved_by": version["saved_by"]})
    return workbook_id


def current(conn: sqlite3.Connection, workbook_id: str, policy: Policy) -> tuple[sqlite3.Row, CheckResult | None]:
    """The current version. If the live file was written outside the server, it becomes a new
    'unmanaged' version and the second value is a Check of it against the last managed version."""
    with db.tx(conn):
        version = _current_row(conn, workbook_id)
        live = live_path(workbook_id)
        if sha256(live) == version["sha256"]:
            return version, None
        managed = _last_managed(conn, version)
        new = _add_version(conn, workbook_id, live, version["id"], "unmanaged")
        found, error = None, None
        try:
            found = check(path_of(managed), path_of(new), policy, "check", saved_source(managed))
            conn.execute("INSERT INTO checks (id, json) VALUES (?, ?)", (found.check_id, found.model_dump_json()))
        except Exception as problem:  # the file may not even be a workbook any more; still on record
            error = f"{type(problem).__name__}: {problem}"
        audit.append(conn, "unknown", "unmanaged_change", {
            "workbook_id": workbook_id, "version": new["sha256"], "last_managed": managed["sha256"],
            "check_id": found.check_id if found else None, "error": error})
    return new, found


def commit(conn: sqlite3.Connection, workbook_id: str, candidate: Path, expect: sqlite3.Row) -> sqlite3.Row:
    """Make `candidate` (an openpyxl-written file) the new current version, if `expect` still is the current one."""
    with db.tx(conn):
        version = _current_row(conn, workbook_id)
        if version["id"] != expect["id"] or sha256(live_path(workbook_id)) != expect["sha256"]:
            raise Conflict(f"Workbook '{workbook_id}' changed while this edit was being handled. Propose it again.")
        return _add_version(conn, workbook_id, candidate, version["id"], "managed", saved_by="none")


def rollback(conn: sqlite3.Connection, workbook_id: str, policy: Policy) -> tuple[sqlite3.Row, sqlite3.Row]:
    """Restore the managed version before the current one, as a new version (history is kept).
    Returns (the version left behind, the new current version)."""
    with db.tx(conn):
        left, _ = current(conn, workbook_id, policy)
        if left["parent_id"] is None:
            raise ValueError(f"Workbook '{workbook_id}' has no earlier version to roll back to")
        parent = conn.execute("SELECT * FROM versions WHERE id = ?", (left["parent_id"],)).fetchone()
        target = _last_managed(conn, parent)
        return left, _add_version(conn, workbook_id, path_of(target), left["id"], "managed", target["saved_by"])


# --- shadow copies --------------------------------------------------------------------------------


def shadow_path(workbook_id: str, edit_id: str) -> Path:
    return _dir(workbook_id, "shadow") / f"{edit_id}.xlsx"


def discard(workbook_id: str, edit_id: str, keep_shadow: bool = False) -> None:
    """Delete an edit's shadow copy and its candidates (<edit>.pass.xlsx, <edit>.approved.xlsx). The shadow is
    kept while held groups wait for the approver: approve copies the held cells from it."""
    folder = config.store_dir() / workbook_id / "shadow"  # not _dir(): never create folders for an unknown id
    if not folder.is_dir():
        return
    shadow_file = folder / f"{edit_id}.xlsx"
    for path in folder.glob(f"{edit_id}*.xlsx"):  # edit ids are fixed length: no prefix clash
        if not (keep_shadow and path == shadow_file):
            path.unlink(missing_ok=True)


def shadow(workbook_id: str, edit_id: str, base: Path, ops: list[EditOp]) -> Path:
    """The base file with the proposed ops applied, as a separate file. The base is not touched."""
    wb = load_workbook(base)  # formulas, not saved values

    def sheet(name: str):
        if name not in wb.sheetnames:
            raise ValueError(f"No sheet '{name}'. Sheets: {', '.join(wb.sheetnames)}")
        return wb[name]

    for op in ops:
        if isinstance(op, AppendRow):
            sheet(op.sheet).append(op.values)
            continue
        ref = parse_ref(op.cell, "")
        if ref is None or not ref.is_cell or not ref.sheet:
            raise ValueError(f"Bad cell address '{op.cell}': write one cell as Sheet!A1")
        coordinate = addr(ref.sheet, ref.r1, ref.c1).rsplit("!", 1)[1]
        sheet(ref.sheet)[coordinate] = op.value if op.op == "set_value" else op.formula
    out = shadow_path(workbook_id, edit_id)
    wb.save(out)
    return out


# --- saved values from LibreOffice (background) ---------------------------------------------------


def _matches(ours, theirs) -> bool:
    if isinstance(ours, Formula):
        return isinstance(theirs, Formula)  # LibreOffice may respell a formula (FALSE -> FALSE())
    return not isinstance(theirs, Formula) and ours == theirs and isinstance(ours, bool) == isinstance(theirs, bool)


def _same_content(ours: Path, theirs: Path) -> bool:
    """LibreOffice's copy must have saved values and must not add, drop or change a cell."""
    a, b = parse(ours), parse(theirs)
    same_cells = a.cells.keys() == b.cells.keys()
    return b.saved_by == "LibreOffice" and same_cells and all(_matches(v, b.cells[c]) for c, v in a.cells.items())


def recalculate(file: Path, side: Path, soffice: str, profile: Path) -> bool:
    """Round-trip `file` through LibreOffice headless into `side`. False on any failure, timeout or doubt."""
    with tempfile.TemporaryDirectory(dir=file.parent) as out:
        # Its own profile: an open LibreOffice window (or a second server) cannot block or redirect the run.
        process = subprocess.Popen(
            [soffice, f"-env:UserInstallation={profile.as_uri()}", "--headless", "--calc", "--convert-to", "xlsx",
             "--outdir", out, str(file)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            process.wait(timeout=RECALC_TIMEOUT)
        except subprocess.TimeoutExpired:
            if sys.platform == "win32":  # soffice.exe starts soffice.bin: take the whole tree down
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(process.pid)], capture_output=True)
            process.kill()
            return False
        made = Path(out) / file.name
        if process.returncode != 0 or not made.exists() or not _same_content(file, made):
            return False
        os.replace(made, side)
    return True


def _fill_saved_values(db_path: str, sha: str, snapshot: Path, soffice: str, profile: Path) -> None:
    label = "none"
    try:
        if recalculate(snapshot, snapshot.with_suffix(".lo.xlsx"), soffice, profile):
            label = "LibreOffice"
    except Exception:  # no binary, no disk, anything: the label stays "none"
        pass
    conn = db.connect(db_path)
    try:
        conn.execute("UPDATE versions SET saved_by = ? WHERE sha256 = ? AND saved_by IN ('pending', 'none')", (label, sha))
    finally:
        conn.close()


def drain() -> None:
    """Wait for every queued LibreOffice run (tests, and a clean shutdown)."""
    while _jobs:
        _jobs.pop().result()


def settle(conn: sqlite3.Connection) -> None:
    """Server start: a 'pending' left by a process that died will never be filled in. Say 'none'."""
    conn.execute("UPDATE versions SET saved_by = 'none' WHERE saved_by = 'pending'")
