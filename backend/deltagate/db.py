"""SQLite: schema and connection. WAL mode, because the MCP server and the API are separate processes.

Beyond the build rules' table list: workbooks' columns (unspecified there), versions.saved_by (the
honest label of each version: Microsoft Excel | LibreOffice | pending | none) and edits.workbook_id.
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from deltagate import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS workbooks (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, current_version_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workbook_id TEXT NOT NULL REFERENCES workbooks(id),
    sha256 TEXT NOT NULL, path TEXT NOT NULL, parent_id INTEGER REFERENCES versions(id),
    source TEXT NOT NULL CHECK (source IN ('managed', 'unmanaged')),
    saved_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, drift REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS edits (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workbook_id TEXT NOT NULL, ops_json TEXT NOT NULL,
    status TEXT NOT NULL, decision_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
    seq INTEGER PRIMARY KEY, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    payload_json TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checkpoints (
    seq INTEGER PRIMARY KEY, head_hash TEXT NOT NULL, ts TEXT NOT NULL, signature TEXT NOT NULL);
"""


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    # check_same_thread=False: FastAPI opens a request's connection on one worker thread and may run the endpoint
    # on another. Each connection still belongs to one request (or one process) and is never used concurrently.
    conn = sqlite3.connect(path or config.db_path(), isolation_level=None, timeout=30,  # we say BEGIN ourselves
                           check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def tx(conn: sqlite3.Connection):
    """One write transaction. BEGIN IMMEDIATE takes the write lock up front, so the other process waits
    instead of reading a state we are about to change. Re-entrant: an inner tx joins the outer one."""
    if conn.in_transaction:
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")
