"""Delta Gate REST API: the approver's surface. The agent has no way in here (it only has the MCP server).

Group 1 (approvals): list held edits, approve, deny, roll back. approve / deny / rollback exist only in this
module and in gate.py; they are never MCP tools. Responses are the pydantic models serialised as they are:
nothing is formatted or computed here, and null stays null.

Run:  uv run uvicorn deltagate.api:app --reload --port 8000
"""

import sqlite3
from typing import Iterator, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel

from deltagate import db
from deltagate.gate import gate, store
from deltagate.models import Decision

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


@app.post("/api/workbooks/{workbook_id}/rollback")
def rollback_workbook(workbook_id: str, conn: sqlite3.Connection = Conn) -> RollbackResult:
    row = _act(lambda: gate.rollback(conn, workbook_id))
    return RollbackResult(workbook_id=workbook_id, sha256=row["sha256"], saved_by=row["saved_by"],
                          source=row["source"], created_at=row["created_at"])
