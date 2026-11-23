"""Delta Gate MCP server (stdio): everything an AI agent can do, and nothing else.

Five tools: read_range, impact_preview, explain_delta, propose_edit, get_decision. propose_edit is the
only write path. approve / deny / rollback belong to the human approver (REST, Phase 3) and are
deliberately not defined, imported or reachable here.

Run:  uv run python -m deltagate.mcp_server        (Claude Desktop starts it this way)
      uv run mcp dev deltagate/mcp_server.py        (MCP inspector)
Nothing may be printed to stdout: it carries the protocol. Timings go to stderr.
"""

import sys
from pathlib import Path

if not __package__:  # `mcp dev deltagate/mcp_server.py` loads this file by path: make the package importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mcp.server.mcpserver import MCPServer

from deltagate import config, db
from deltagate.engine import check as engine
from deltagate.engine import graph, recalc
from deltagate.engine.parse import Formula, parse, parse_ref, split
from deltagate.gate import gate, store
from deltagate.models import CheckResult, EditOp

MAX_CELLS = 2000

server = MCPServer("delta-gate", instructions=(
    "Delta Gate is an independent check on spreadsheet edits. You cannot write files yourself. "
    "To change a workbook: call impact_preview on each cell you mean to edit, then call propose_edit, "
    "which is the only way to write. Every edit is recalculated and checked against policy before anything "
    "is committed. HELD or CANT_VERIFY_HELD means a human approver must decide: tell the user what was held "
    "and why. Do not retry, split or rephrase an edit to get around a hold. Workbooks are named by a "
    "workbook_id; an unknown id returns the list of registered ones."
))


def _unmanaged(found: CheckResult | None, version) -> dict | None:
    """What to tell the agent when this call found the file changed outside Delta Gate."""
    if found is None:
        return None
    return {
        "message": "The workbook was changed outside Delta Gate. It is on record as an unmanaged version, "
                   "with a Check against the last managed version.",
        "version": version["sha256"], "check_id": found.check_id,
        "outputs": [{"cell": o.cell, "delta_observed": o.delta_observed, "delta_verified": o.delta_verified}
                    for o in found.outputs],
        "structural": [f.message for f in found.structural],
    }


def _cell(text: str) -> str:
    ref = parse_ref(text, "")
    if ref is None or not ref.is_cell or not ref.sheet:
        raise ValueError(f"Bad cell address '{text}': write one cell as Sheet!A1")
    return ref.name


@server.tool()
def read_range(workbook_id: str, range: str) -> dict:
    """Read cells from a managed workbook: formulas as text, and values. Read-only.

    range is 'Sheet!A1' or 'Sheet!A1:C10'. A formula's value is the one saved in the file by Excel or
    LibreOffice; if the file has none yet, it is computed by Delta Gate's engine, and left null where
    the engine cannot verify it. 'saved_by' says which. Reports any change made outside Delta Gate.
    """
    conn = db.connect()
    try:
        policy = config.load_policy()
        version, found = store.current(conn, workbook_id, policy)
        ref = parse_ref(range, "")
        if ref is None or not ref.sheet or None in (ref.r2, ref.c2):
            raise ValueError(f"Bad range '{range}': write Sheet!A1 or Sheet!A1:C10")
        if (ref.r2 - ref.r1 + 1) * (ref.c2 - ref.c1 + 1) > MAX_CELLS:
            raise ValueError(f"Range '{range}' is larger than {MAX_CELLS} cells: read it in parts")

        path, side = store.path_of(version), store.saved_source(version)
        book = parse(path)
        if ref.sheet not in book.sheets:
            raise ValueError(f"No sheet '{ref.sheet}'. Sheets: {', '.join(book.sheets)}")
        saved = parse(side).cached if side else book.cached
        inside = [c for c in book.cells if split(c)[0] == ref.sheet
                  and ref.r1 <= split(c)[1] <= ref.r2 and ref.c1 <= split(c)[2] <= ref.c2]
        missing = [c for c in inside if isinstance(book.cells[c], Formula) and saved.get(c) is None]
        computed = {}
        if missing:  # only cells the engine may compute; the rest stay null rather than guessed
            tainted = engine.analyse(path, path, policy, side).tainted
            computed = recalc.recompute(path, [c for c in missing if c not in tainted])
        cells = []
        for c in sorted(inside, key=split):
            content = book.cells[c]
            if isinstance(content, Formula):
                value = saved.get(c) if saved.get(c) is not None else computed.get(c)
                cells.append({"cell": c, "formula": str(content),
                              "value": None if isinstance(value, recalc.EngineError) else value})
            else:
                cells.append({"cell": c, "value": content})
        label = "LibreOffice" if side else version["saved_by"]
        return {"workbook_id": workbook_id, "version": version["sha256"], "saved_by": label,
                "values": "saved in the file" if not missing else
                          "computed by Delta Gate's engine where the file has no saved value; null = cannot be verified",
                "cells": cells, "unmanaged_change": _unmanaged(found, version)}
    finally:
        conn.close()


@server.tool()
def impact_preview(workbook_id: str, cell: str) -> dict:
    """What depends on a cell: its direct dependents, how many cells it reaches, which watched outputs
    it can move, and whether it is protected. Call this before propose_edit, for every cell you plan to
    change, so you know what the edit will touch. Read-only.
    """
    conn = db.connect()
    try:
        policy = config.load_policy()
        version, found = store.current(conn, workbook_id, policy)
        book = parse(store.path_of(version))
        return graph.impact(graph.build(book), book, _cell(cell), policy) | {"unmanaged_change": _unmanaged(found, version)}
    finally:
        conn.close()


@server.tool()
def explain_delta(base_version: str, new_version: str) -> dict:
    """Explain the difference between two versions of a managed workbook (version = the sha256 that
    read_range and propose_edit return): each watched output's change split into exact amounts per
    cause, structural findings, and what could not be verified. Read-only.
    """
    conn = db.connect()
    try:
        base, new = store.by_sha(conn, base_version), store.by_sha(conn, new_version)
        found = engine.check(store.path_of(base), store.path_of(new), config.load_policy(), "check", store.saved_source(base))
        conn.execute("INSERT INTO checks (id, json) VALUES (?, ?)", (found.check_id, found.model_dump_json()))
        return found.model_dump(mode="json")
    finally:
        conn.close()


@server.tool()
def propose_edit(workbook_id: str, ops: list[EditOp], session_id: str) -> dict:
    """Propose an edit. This is the only way to write to a workbook. Call impact_preview first.

    ops, applied together to a shadow copy:
      {"op":"set_value","cell":"Payments!C5","value":2500}
      {"op":"set_formula","cell":"LateFees!F3","formula":"=F2*0.04"}
      {"op":"append_row","sheet":"Expenses","values":["Lift repair",38000]}
    session_id: one id of your choosing for the whole conversation (e.g. "s_demo"); the drift budget is
    counted per session.

    Returns a Decision. status PASS: committed. HELD: nothing committed, waiting for a human approver.
    PARTIAL: some change groups committed, the rest held. Each group has its own status
    (PASS / HELD / CANT_VERIFY_HELD), its reasons, and its effect on every watched output.
    You cannot approve a held edit; report it to the user.
    """
    conn = db.connect()
    try:
        version, found = store.current(conn, workbook_id, config.load_policy())
        decision = gate.propose_edit(conn, workbook_id, ops, session_id)
        _sessions.add(session_id)
        return decision.model_dump(mode="json") | {"unmanaged_change": _unmanaged(found, version)}
    finally:
        conn.close()


@server.tool()
def get_decision(edit_id: str) -> dict:
    """The current state of a proposed edit: PASS, HELD, PARTIAL, APPROVED, DENIED or ROLLED_BACK,
    with per-group reasons. Use it to see whether the approver has acted on a held edit. Read-only.
    """
    conn = db.connect()
    try:
        return gate.get_decision(conn, edit_id).model_dump(mode="json")
    finally:
        conn.close()


_sessions: set[str] = set()  # sessions this process served: each gets a signed checkpoint at shutdown


def main() -> None:
    conn = db.connect()
    store.settle(conn)
    conn.close()
    try:
        server.run("stdio")
    finally:
        store.drain()
        conn = db.connect()
        for session_id in sorted(_sessions):
            gate.end_session(conn, session_id)
        conn.close()


if __name__ == "__main__":
    main()
