"""The gate. propose_edit is the agent's only write path; approve / deny / rollback are the approver's
and are never exposed over MCP.

propose_edit: shadow copy -> analyse (base = current version, new = shadow) -> per-group decision from
solo effects (2 evaluations per group, compiled models cached) -> the full Check (exact Shapley) only
if something is held, for the approvals inbox -> commit the PASS groups -> Decision.
"""

import json
import sqlite3
import sys
import time
import uuid

from openpyxl import load_workbook
from pydantic import TypeAdapter

from deltagate import config, db
from deltagate.engine import check as engine
from deltagate.engine.proof import proof_workbook
from deltagate.gate import audit, policy as rules, store
from deltagate.models import Decision, EditOp

_OPS = TypeAdapter(list[EditOp])


def _save(conn: sqlite3.Connection, decision: Decision) -> None:
    conn.execute("UPDATE edits SET status = ?, decision_json = ? WHERE id = ?",
                 (decision.status, decision.model_dump_json(), decision.edit_id))


def get_decision(conn: sqlite3.Connection, edit_id: str) -> Decision:
    row = conn.execute("SELECT decision_json FROM edits WHERE id = ?", (edit_id,)).fetchone()
    if row is None:
        raise KeyError(f"Unknown edit '{edit_id}'")
    return Decision.model_validate_json(row["decision_json"])


def held(conn: sqlite3.Connection) -> list[Decision]:
    """The approvals inbox: edits with a group still waiting for the approver."""
    rows = conn.execute("SELECT decision_json FROM edits WHERE status IN ('HELD', 'PARTIAL') ORDER BY created_at")
    return [Decision.model_validate_json(r["decision_json"]) for r in rows]


def propose_edit(conn: sqlite3.Connection, workbook_id: str, ops: list, session_id: str) -> Decision:
    started = time.perf_counter()
    policy = config.load_policy()
    ops = _OPS.validate_python(ops)
    edit_id = f"ed_{uuid.uuid4().hex[:12]}"
    base, _ = store.current(conn, workbook_id, policy)
    base_path = store.path_of(base)
    shadow = store.shadow(workbook_id, edit_id, base_path, ops)

    a = engine.analyse(base_path, shadow, policy, store.saved_source(base))
    solos = {g.group_id: engine.delta(a, [g.group_id]) for g in a.groups}
    blocked = {g.group_id: why for g in a.groups if (why := engine.cant_verify(a, g))}
    session = conn.execute("SELECT drift FROM sessions WHERE id = ?", (session_id,)).fetchone()
    groups, drift = rules.decide(a.groups, solos, a.structural, blocked, policy, session["drift"] if session else 0,
                                 lambda ids: engine.delta(a, ids))
    decided = time.perf_counter()

    passing = {g.group_id for g in groups if g.status == "PASS"}
    full = engine.result(a, policy, "gate") if len(passing) < len(groups) else None  # for the inbox
    candidate = None
    if passing:  # the base with only the passing groups' cells taken from the shadow
        cells = [c for g in a.groups if g.group_id in passing for c in g.cells]
        candidate = proof_workbook(base_path, shadow, cells, shadow.with_suffix(".pass.xlsx"))

    with db.tx(conn):
        committed = store.commit(conn, workbook_id, candidate, base)["sha256"] if candidate else None
        decision = Decision(
            edit_id=edit_id, session_id=session_id, groups=groups, committed_version=committed, check=full,
            status="PASS" if full is None else "PARTIAL" if passing else "HELD")
        if full:
            conn.execute("INSERT INTO checks (id, json) VALUES (?, ?)", (full.check_id, full.model_dump_json()))
        conn.execute("INSERT INTO sessions (id, drift) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET drift = excluded.drift",
                     (session_id, drift))
        conn.execute("INSERT INTO edits (id, session_id, workbook_id, ops_json, status, decision_json, created_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?)",
                     (edit_id, session_id, workbook_id, _OPS.dump_json(ops).decode(), decision.status,
                      decision.model_dump_json(), db.now()))
        timing = {"decision_ms": round((decided - started) * 1000), "commit_ms": round((time.perf_counter() - decided) * 1000)}
        audit.append(conn, f"agent:{session_id}", "propose_edit", {
            "edit_id": edit_id, "workbook_id": workbook_id, "ops": json.loads(_OPS.dump_json(ops)),
            "status": decision.status, "base_version": base["sha256"], "committed_version": committed,
            "check_id": full.check_id if full else None, "session_drift": drift,
            "groups": [g.model_dump() for g in groups], **timing})
    print(f"delta-gate {edit_id} {decision.status}: decision {timing['decision_ms']} ms, "
          f"check + commit {timing['commit_ms']} ms", file=sys.stderr)  # stdout belongs to the MCP protocol
    return decision


# --- approver only: never registered as MCP tools ----------------------------------------------------


def _waiting(conn: sqlite3.Connection, edit_id: str) -> tuple[sqlite3.Row, Decision]:
    decision = get_decision(conn, edit_id)
    if decision.status not in ("HELD", "PARTIAL"):
        raise ValueError(f"Edit '{edit_id}' is {decision.status}: nothing is waiting for approval")
    return conn.execute("SELECT * FROM edits WHERE id = ?", (edit_id,)).fetchone(), decision


def approve(conn: sqlite3.Connection, edit_id: str) -> Decision:
    """Commit the held groups of an edit onto the current version."""
    edit, decision = _waiting(conn, edit_id)
    workbook_id = edit["workbook_id"]
    current, _ = store.current(conn, workbook_id, config.load_policy())
    waiting = {g.group_id for g in decision.groups if g.status != "PASS"}
    cells = [c for g in decision.check.groups if g.group_id in waiting for c in g.cells]

    # ponytail: the impact shown to the approver was computed on the version the edit was proposed on.
    # We only insist that the held cells are untouched since then; re-run the Check here if that is not enough.
    then, now = (load_workbook(p) for p in (store.path_of(store.by_sha(conn, decision.check.base_version)),
                                            store.path_of(current)))
    for cell in cells:
        sheet, coordinate = cell.rsplit("!", 1)
        if then[sheet][coordinate].value != now[sheet][coordinate].value:
            raise store.Conflict(f"{cell} has changed since edit '{edit_id}' was proposed. Deny it and propose again.")

    shadow = store.shadow_path(workbook_id, edit_id)
    candidate = proof_workbook(store.path_of(current), shadow, cells, shadow.with_suffix(".approved.xlsx"))
    with db.tx(conn):
        decision.committed_version = store.commit(conn, workbook_id, candidate, current)["sha256"]
        decision.status = "APPROVED"
        _save(conn, decision)
        audit.append(conn, "approver", "approve", {"edit_id": edit_id, "workbook_id": workbook_id, "groups": sorted(waiting),
                                                   "committed_version": decision.committed_version})
    return decision


def deny(conn: sqlite3.Connection, edit_id: str) -> Decision:
    """Reject the held groups. Groups that already passed stay committed."""
    edit, decision = _waiting(conn, edit_id)
    with db.tx(conn):
        decision.status = "DENIED"
        _save(conn, decision)
        audit.append(conn, "approver", "deny", {"edit_id": edit_id, "workbook_id": edit["workbook_id"],
                                                "groups": [g.group_id for g in decision.groups if g.status != "PASS"]})
    return decision


def rollback(conn: sqlite3.Connection, workbook_id: str) -> sqlite3.Row:
    """Restore the managed version before the current one. The edit that produced the current one is marked."""
    with db.tx(conn):
        left, restored = store.rollback(conn, workbook_id, config.load_policy())
        undone = conn.execute(
            "SELECT id FROM edits WHERE workbook_id = ? AND json_extract(decision_json, '$.committed_version') = ? "
            "ORDER BY created_at DESC LIMIT 1", (workbook_id, left["sha256"])).fetchone()
        if undone:
            decision = get_decision(conn, undone["id"])
            decision.status = "ROLLED_BACK"
            _save(conn, decision)
        audit.append(conn, "approver", "rollback", {"workbook_id": workbook_id, "from_version": left["sha256"],
                                                    "to_version": restored["sha256"], "edit_id": undone["id"] if undone else None})
    return restored


def end_session(conn: sqlite3.Connection, session_id: str) -> None:
    with db.tx(conn):
        audit.append(conn, "server", "session_end", {"session_id": session_id})
        audit.checkpoint(conn)
