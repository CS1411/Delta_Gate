"""Tamper-evident audit log: a hash chain with Ed25519-signed checkpoints.

hash_i = sha256(hash_{i-1} || canonical_json(entry_i)). A checkpoint signs (seq, head_hash, ts) every
50 entries and at session end. verify() re-walks the chain and checks every signature. Tamper-evident,
not tamper-proof: entries after the last checkpoint are protected by the chain alone.
"""

import hashlib
import json
import sqlite3

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from pydantic import BaseModel

from deltagate import config, db

GENESIS = "0" * 64
CHECKPOINT_EVERY = 50


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash(prev: str, row) -> str:
    entry = {k: row[k] for k in ("seq", "ts", "actor", "action", "payload_json")}
    return hashlib.sha256((prev + canonical(entry)).encode("utf-8")).hexdigest()


def _key() -> Ed25519PrivateKey:
    """The server's signing key, generated on first use. data/ and *.pem are gitignored."""
    path = config.key_path()
    if not path.exists():
        pem = Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        path.write_bytes(pem)
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def _signed(seq: int, head_hash: str, ts: str) -> bytes:
    return canonical({"seq": seq, "head_hash": head_hash, "ts": ts}).encode("utf-8")


def append(conn: sqlite3.Connection, actor: str, action: str, payload: dict) -> int:
    with db.tx(conn):
        last = conn.execute("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
        seq, prev = (last["seq"] + 1, last["hash"]) if last else (1, GENESIS)
        row = {"seq": seq, "ts": db.now(), "actor": actor, "action": action, "payload_json": canonical(payload)}
        conn.execute("INSERT INTO audit_log (seq, ts, actor, action, payload_json, prev_hash, hash) "
                     "VALUES (:seq, :ts, :actor, :action, :payload_json, :prev, :hash)",
                     row | {"prev": prev, "hash": _hash(prev, row)})
        if seq % CHECKPOINT_EVERY == 0:
            checkpoint(conn)
    return seq


def checkpoint(conn: sqlite3.Connection) -> None:
    """Sign the current head of the chain."""
    with db.tx(conn):
        head = conn.execute("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
        if head:
            ts = db.now()
            signature = _key().sign(_signed(head["seq"], head["hash"], ts)).hex()
            conn.execute("INSERT OR REPLACE INTO checkpoints (seq, head_hash, ts, signature) VALUES (?, ?, ?, ?)",
                         (head["seq"], head["hash"], ts, signature))


def verify(conn: sqlite3.Connection) -> dict:
    """{'ok', 'entries', 'checkpoints', 'error'}: the first thing that does not add up, if any."""
    rows = conn.execute("SELECT * FROM audit_log ORDER BY seq").fetchall()
    checkpoints = conn.execute("SELECT * FROM checkpoints ORDER BY seq").fetchall()

    def report(error=None):
        return {"ok": error is None, "entries": len(rows), "checkpoints": len(checkpoints), "error": error}

    hashes, prev = {}, GENESIS
    for expected, row in enumerate(rows, start=1):
        if row["seq"] != expected:
            return report(f"entry {expected} is missing")
        if row["prev_hash"] != prev or row["hash"] != _hash(prev, row):
            return report(f"entry {row['seq']} does not match its hash")
        hashes[row["seq"]] = prev = row["hash"]

    public = _key().public_key()
    for cp in checkpoints:
        if hashes.get(cp["seq"]) != cp["head_hash"]:
            return report(f"checkpoint {cp['seq']} does not match the log")
        try:
            public.verify(bytes.fromhex(cp["signature"]), _signed(cp["seq"], cp["head_hash"], cp["ts"]))
        except (InvalidSignature, ValueError):
            return report(f"checkpoint {cp['seq']} has a bad signature")
    return report()


class AuditEntry(BaseModel):
    """One audit_log row as the API returns it. `payload` is `payload_json` parsed; canonical() round-trips it,
    so the hash can still be recomputed from this shape."""
    seq: int
    ts: str
    actor: str
    action: str
    payload: dict
    prev_hash: str
    hash: str


class AuditCheckpoint(BaseModel):
    seq: int
    head_hash: str
    ts: str
    signature: str  # hex Ed25519 over canonical({seq, head_hash, ts})


class AuditLog(BaseModel):
    """Body of GET /api/audit: the whole chain and its signed checkpoints, oldest first."""
    entries: list[AuditEntry]
    checkpoints: list[AuditCheckpoint]


def read(conn: sqlite3.Connection) -> AuditLog:
    entries = [AuditEntry(seq=r["seq"], ts=r["ts"], actor=r["actor"], action=r["action"], payload=json.loads(r["payload_json"]),
                          prev_hash=r["prev_hash"], hash=r["hash"])
               for r in conn.execute("SELECT * FROM audit_log ORDER BY seq")]
    checkpoints = [AuditCheckpoint(**dict(r)) for r in conn.execute("SELECT * FROM checkpoints ORDER BY seq")]
    return AuditLog(entries=entries, checkpoints=checkpoints)
