"""Dump real engine / gate output as JSON fixtures for the UI: frontend/src/fixtures/*.json.

    cd backend && uv run python ../scripts/dump_fixtures.py [--out DIR]

Every file is model_dump_json(indent=2) of a pydantic model; nothing is written by hand. The run is
deterministic (fixed ids, clock and signing key, throwaway runtime home), so re-running changes nothing
unless the engine, the gate or models.py changed. tests/test_fixtures.py enforces that.
"""

import argparse
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

GOLDEN = ROOT / "golden"
DEFAULT_OUT = ROOT / "frontend" / "src" / "fixtures"
FIXTURE_KEY = bytes(range(32))  # a public, throwaway Ed25519 seed: only ever signs fixture checkpoints


def _freeze() -> None:
    """Deterministic uuid4, clock and gate timings. Process-wide: this script is a one-shot."""
    from deltagate import db
    from deltagate.gate import gate

    counter = iter(range(1, 10**6))
    uuid.uuid4 = lambda: uuid.UUID(int=next(counter) << 100)  # ids use the first 12 hex digits, so shift them up
    tick = iter(range(10**6))
    db.now = lambda: f"2026-11-23T10:{(n := next(tick)) // 60:02d}:{n % 60:02d}.000+00:00"  # one second per call
    # openpyxl stamps the current time into core.xml and into the zip entries; without this every committed
    # version (and so every sha256 in the fixtures) would differ from run to run.
    import datetime as real
    import time as real_time
    from openpyxl.packaging import core
    from openpyxl.writer import excel

    class Frozen(real.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 23, 10, 0, 0, tzinfo=tz)

    shim = SimpleNamespace(datetime=Frozen, timezone=real.timezone)
    core.datetime = excel.datetime = shim
    real_time.time = lambda: 1795428000.0  # 2026-11-23 10:00:00 UTC
    import zipfile

    from_file = zipfile.ZipInfo.from_file  # ZipFile.write() takes the entry time from the temp file's mtime

    def pinned(*args, **kwargs):
        info = from_file(*args, **kwargs)
        info.date_time = (2026, 11, 23, 10, 0, 0)
        return info

    zipfile.ZipInfo.from_file = staticmethod(pinned)
    ticks = iter(range(10**6))
    gate.time = SimpleNamespace(perf_counter=lambda: next(ticks) * 0.01)  # 10 ms per reading


def build() -> dict[str, str]:
    """{fixture file name: JSON text}."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    home = tempfile.mkdtemp(prefix="deltagate-fixtures-")
    os.environ["DELTAGATE_HOME"] = home
    os.environ["DELTAGATE_SOFFICE"] = "off"  # no background LibreOffice: committed versions stay `none`

    from deltagate import config, db
    from deltagate.engine.check import check
    from deltagate.gate import audit, gate, store

    _freeze()
    (Path(home) / "data").mkdir(exist_ok=True)
    config.key_path().write_bytes(Ed25519PrivateKey.from_private_bytes(FIXTURE_KEY).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    policy = config.load_policy()
    out: dict[str, str] = {}
    out["check_v2_v3.json"] = check(GOLDEN / "dues_v2.xlsx", GOLDEN / "dues_v3_REAL.xlsx", policy).model_dump_json(indent=2)
    out["check_judge_xlookup.json"] = check(GOLDEN / "dues_v2.xlsx", GOLDEN / "judge_xlookup.xlsx", policy).model_dump_json(indent=2)

    conn = db.connect()
    store.register(conn, GOLDEN / "dues_v2.xlsx", "dues")
    script = json.loads((GOLDEN / "drift_steps.json").read_text(encoding="utf-8"))
    decisions = {}
    for session in script["sessions"]:
        for number, step in enumerate(session["steps"], start=1):
            decision = gate.propose_edit(conn, "dues", step["ops"], session["session_id"])
            assert decision.status == step["expect"]["status"], (session["session_id"], number, decision.status)
            decisions[session["session_id"], number] = decision
        gate.end_session(conn, session["session_id"])
    store.drain()

    a = decisions["s_A", 1]
    assert a.status == "PARTIAL"
    b = decisions["s_B", 9]  # the first edit the drift budget holds
    assert b.status == "HELD" and any("drift" in r for r in b.groups[0].reasons)
    out["decision_session_a.json"] = a.model_dump_json(indent=2)
    out["decision_session_b.json"] = b.model_dump_json(indent=2)

    assert audit.verify(conn)["ok"]
    log = audit.read(conn)
    assert log.checkpoints
    out["audit.json"] = log.model_dump_json(indent=2)
    conn.close()
    return {name: text + "\n" for name, text in out.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for name, text in build().items():
        (args.out / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.out / name}")


if __name__ == "__main__":
    main()
