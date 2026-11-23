"""Delta Gate REST API: the approver's surface. The agent has no way in here (it only has the MCP server).

Group 1 (approvals): list held edits, approve, deny, roll back. approve / deny / rollback exist only in this
module and in gate.py; they are never MCP tools. Responses are the pydantic models serialised as they are:
nothing is formatted or computed here, and null stays null.
Group 2 (checks): run a Check on two uploaded files, read it back, download a proof workbook for one group.
Group 3 (audit): the log, its verification, and a CSV change log of any stored Check.
Group 4 (Session Audit): snapshot a file before an in-Excel AI session, Check the file after it.

Uploaded files live in data/checks/<check_id>/ (never in store/, which only the gate writes). Ids that arrive
in a URL are matched against their exact pattern before anything touches the disk.

Run:  uv run uvicorn deltagate.api:app --reload --port 8000
"""

import csv
import io
import re
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from typing import Iterator, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from deltagate import config, db, session_audit
from deltagate.engine.check import check
from deltagate.engine.proof import proof_workbook
from deltagate.gate import audit, gate, store
from deltagate.models import AuditLog, CheckResult, Decision

app = FastAPI(title="Delta Gate")


def connection() -> Iterator[sqlite3.Connection]:
    """One connection per request (WAL mode lets this process and the MCP server share the database)."""
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


Conn = Depends(connection)


class RollbackResult(BaseModel):
    """The version a rollback made current: the `versions` row, as stored."""
    workbook_id: str
    sha256: str
    saved_by: Literal["Microsoft Excel", "LibreOffice", "pending", "none"]
    source: Literal["managed", "unmanaged"]
    created_at: str


def _refuse(problem: Exception, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail=str(problem.args[0]) if problem.args else str(problem))


def _act(call):
    """Run an approver action. Conflict (the workbook moved on) and ValueError (nothing is waiting, or nothing to
    roll back to) are 409 with the gate's own message; an unknown id is 404."""
    try:
        return call()
    except store.Conflict as problem:
        raise _refuse(problem, 409)
    except ValueError as problem:
        raise _refuse(problem, 409)
    except KeyError as problem:
        raise _refuse(problem, 404)


@app.get("/api/edits")
def held_edits(status: Literal["held"] = Query("held"), conn: sqlite3.Connection = Conn) -> list[Decision]:
    """The approvals inbox: edits with a group still waiting for the approver (HELD and PARTIAL), oldest first."""
    return gate.held(conn)


@app.post("/api/edits/{edit_id}/approve")
def approve_edit(edit_id: str, conn: sqlite3.Connection = Conn) -> Decision:
    return _act(lambda: gate.approve(conn, edit_id))


@app.post("/api/edits/{edit_id}/deny")
def deny_edit(edit_id: str, conn: sqlite3.Connection = Conn) -> Decision:
    return _act(lambda: gate.deny(conn, edit_id))


class WorkbookSummary(BaseModel):
    """A managed workbook and its current version: what the Rollback button needs."""
    workbook_id: str
    name: str
    current_version: str  # sha256
    saved_by: Literal["Microsoft Excel", "LibreOffice", "pending", "none"]
    source: Literal["managed", "unmanaged"]
    updated_at: str  # when the current version was recorded
    can_rollback: bool  # an earlier version exists, so POST .../rollback will not answer 409


@app.get("/api/workbooks")
def list_workbooks(conn: sqlite3.Connection = Conn) -> list[WorkbookSummary]:
    """Registered workbooks with their current version, as recorded (a read only: no unmanaged-change check runs here)."""
    rows = conn.execute("SELECT w.id, w.name, v.sha256, v.saved_by, v.source, v.created_at, v.parent_id FROM workbooks w "
                        "JOIN versions v ON v.id = w.current_version_id ORDER BY w.id")
    return [WorkbookSummary(workbook_id=r["id"], name=r["name"], current_version=r["sha256"], saved_by=r["saved_by"],
                            source=r["source"], updated_at=r["created_at"], can_rollback=r["parent_id"] is not None)
            for r in rows]


@app.post("/api/workbooks/{workbook_id}/rollback")
def rollback_workbook(workbook_id: str, conn: sqlite3.Connection = Conn) -> RollbackResult:
    row = _act(lambda: gate.rollback(conn, workbook_id))
    return RollbackResult(workbook_id=workbook_id, sha256=row["sha256"], saved_by=row["saved_by"],
                          source=row["source"], created_at=row["created_at"])


# --- group 2: checks -------------------------------------------------------------------------------------

MAX_UPLOAD = 25 * 1024 * 1024  # bytes per file
_CHECK_ID = re.compile(r"chk_[0-9a-f]{12}")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _check_dir(check_id: str) -> Path:
    return config.data_dir() / "checks" / check_id


def _save_upload(upload: UploadFile, target: Path) -> Path:
    """Write an uploaded workbook to `target` (its suffix from the upload: .xlsx or .xlsm). 422 if it is not one."""
    data = upload.file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"{upload.filename} is larger than {MAX_UPLOAD // (1024 * 1024)} MB")
    suffix = ".xlsm" if (upload.filename or "").lower().endswith(".xlsm") else ".xlsx"
    path = target.with_suffix(suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    try:
        with zipfile.ZipFile(path) as z:
            z.getinfo("xl/workbook.xml")
    except (zipfile.BadZipFile, KeyError):
        path.unlink()
        raise HTTPException(422, f"{upload.filename} is not a readable workbook (.xlsx or .xlsm)")
    return path


def _files(check_id: str) -> tuple[Path, Path] | None:
    folder = _check_dir(check_id)
    found = {p.stem: p for p in folder.glob("*.xls[xm]")} if folder.is_dir() else {}
    return (found["base"], found["new"]) if {"base", "new"} <= found.keys() else None


def _run_and_keep(conn: sqlite3.Connection, base: Path, new: Path, mode: str) -> CheckResult:
    """Run the Check, keep both files under its id (for proof and export), store the result."""
    try:
        result = check(base, new, config.load_policy(), mode)
    except Exception as problem:  # the engine could not read the pair: say so, never a stack trace
        raise HTTPException(422, f"The Check could not run on these files ({type(problem).__name__})")
    folder = _check_dir(result.check_id)
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(base, folder / f"base{base.suffix}")
    shutil.copyfile(new, folder / f"new{new.suffix}")
    with db.tx(conn):
        conn.execute("INSERT INTO checks (id, json) VALUES (?, ?)", (result.check_id, result.model_dump_json()))
    return result


def _stored(conn: sqlite3.Connection, check_id: str) -> CheckResult:
    row = conn.execute("SELECT json FROM checks WHERE id = ?", (check_id,)).fetchone() \
        if _CHECK_ID.fullmatch(check_id) else None
    if row is None:
        raise HTTPException(404, f"Unknown check '{check_id}'")
    return CheckResult.model_validate_json(row["json"])


@app.post("/api/checks")
def run_check(base: UploadFile = File(...), new: UploadFile = File(...), conn: sqlite3.Connection = Conn) -> CheckResult:
    """Check mode: two versions of a workbook in, the CheckResult out (exact split, structural findings, coverage)."""
    with tempfile.TemporaryDirectory(dir=config.data_dir()) as scratch:
        b = _save_upload(base, Path(scratch) / "base.xlsx")
        n = _save_upload(new, Path(scratch) / "new.xlsx")
        return _run_and_keep(conn, b, n, "check")


@app.get("/api/checks/{check_id}")
def get_check(check_id: str, conn: sqlite3.Connection = Conn) -> CheckResult:
    return _stored(conn, check_id)


@app.post("/api/checks/{check_id}/proof/{group_id}")
def proof(check_id: str, group_id: str, conn: sqlite3.Connection = Conn) -> FileResponse:
    """The base file with only this group applied, formulas intact, recalculated in full when Excel opens it."""
    result = _stored(conn, check_id)
    group = next((g for g in result.groups if g.group_id == group_id), None)
    if group is None:
        raise HTTPException(404, f"Check '{check_id}' has no group '{group_id}'")
    files = _files(check_id)
    if files is None:
        raise HTTPException(404, f"Check '{check_id}' has no files kept (only uploaded Checks and Session Audits do)")
    out = _check_dir(check_id) / f"proof_{group_id}.xlsx"
    proof_workbook(*files, group.cells, out)
    return FileResponse(out, media_type=XLSX, filename=f"delta-gate-proof-{check_id}-{group_id}.xlsx")


# --- group 3: audit and CSV export ---------------------------------------------------------------------


class AuditVerdict(BaseModel):
    ok: bool
    entries: int
    checkpoints: int
    error: str | None  # the first thing that does not add up


@app.get("/api/audit")
def audit_log(conn: sqlite3.Connection = Conn) -> AuditLog:
    return audit.read(conn)


@app.get("/api/audit/verify")
def audit_verify(conn: sqlite3.Connection = Conn) -> AuditVerdict:
    return AuditVerdict(**audit.verify(conn))


CSV_COLUMNS = ["record", "output_cell", "output_label", "base", "new", "delta_observed", "delta_verified",
               "delta_unverified", "group_id", "group_label", "group_type", "group_cells", "solo", "share",
               "interaction", "detail"]


def _known(value) -> object:
    return "unknown" if value is None else value  # null is unknown, never 0


@app.get("/api/exports/{check_id}.csv")
def export_csv(check_id: str, conn: sqlite3.Connection = Conn) -> Response:
    """The change log of a Check, one row per fact: each output, each group's share in it, each structural finding,
    each cell that cannot be verified. Numbers are the engine's, unformatted; null is written as "unknown"."""
    result = _stored(conn, check_id)
    groups = {g.group_id: g for g in result.groups}
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=CSV_COLUMNS, extrasaction="raise")
    w.writeheader()
    for o in result.outputs:
        numbers = {k: _known(getattr(o, k)) for k in ("base", "new", "delta_observed", "delta_verified", "delta_unverified")}
        w.writerow({"record": "output", "output_cell": o.cell, "output_label": o.label, **numbers})
        for a in o.attribution:
            g = groups[a.group_id]
            w.writerow({"record": "attribution", "output_cell": o.cell, "output_label": o.label, "group_id": g.group_id,
                        "group_label": g.label, "group_type": g.type, "group_cells": " ".join(g.cells),
                        "solo": a.solo, "share": a.share, "interaction": a.interaction})
    for f in result.structural:
        w.writerow({"record": "structural", "output_cell": f.output or "", "group_cells": f.cell,
                    "detail": f"{f.kind}: {f.message}"})
    for u in result.unverifiable:
        w.writerow({"record": "unverifiable", "group_cells": u.cell, "detail": u.reason})
    return Response(out.getvalue().encode("utf-8-sig"), media_type="text/csv; charset=utf-8",  # BOM: Excel reads UTF-8
                    headers={"Content-Disposition": f'attachment; filename="delta-gate-{check_id}.csv"'})


# --- group 4: Session Audit ----------------------------------------------------------------------------


class SnapshotTaken(BaseModel):
    snapshot_id: str
    sha256: str


@app.post("/api/session-audit/snapshot")
def snapshot(file: UploadFile = File(...)) -> SnapshotTaken:
    """Keep an exact copy of the workbook before someone uses an AI inside Excel."""
    with tempfile.TemporaryDirectory(dir=config.data_dir()) as scratch:
        taken = session_audit.snapshot(_save_upload(file, Path(scratch) / "before.xlsx"))
    return SnapshotTaken(snapshot_id=taken.snapshot_id, sha256=taken.sha256)


@app.post("/api/session-audit/complete")
def complete(snapshot_id: str = Form(...), file: UploadFile = File(...), conn: sqlite3.Connection = Conn) -> CheckResult:
    """Check everything the AI session changed: the snapshot against the file after it (mode session_audit)."""
    try:
        before = session_audit.path_of(snapshot_id)
    except KeyError:
        raise HTTPException(404, f"Unknown snapshot '{snapshot_id}'")
    with tempfile.TemporaryDirectory(dir=config.data_dir()) as scratch:
        after = _save_upload(file, Path(scratch) / "after.xlsx")
        return _run_and_keep(conn, before, after, "session_audit")
