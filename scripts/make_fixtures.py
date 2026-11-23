"""Dump real engine output as JSON fixtures for the UI: python scripts/make_fixtures.py (from backend/: uv run).

Runs the gate in a throwaway home (LibreOffice off), so nothing touches data/ or store/.
Writes frontend/src/fixtures/decision_*.json. Never hand-edit the output; rerun this instead.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN, OUT = ROOT / "golden", ROOT / "frontend" / "src" / "fixtures"
sys.path.insert(0, str(ROOT / "backend"))
os.environ["DELTAGATE_HOME"] = tempfile.mkdtemp(prefix="deltagate-fixtures-")
os.environ["DELTAGATE_SOFFICE"] = "off"

from deltagate import db  # noqa: E402  (after DELTAGATE_HOME is set)
from deltagate.gate import gate, store  # noqa: E402


def dump(name: str, decision) -> None:
    (OUT / f"{name}.json").write_text(json.dumps(json.loads(decision.model_dump_json()), indent=2) + "\n", encoding="utf-8")
    print(f"{name}: {decision.status} " + ", ".join(f"{g.group_id}={g.status}" for g in decision.groups))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    steps = json.loads((GOLDEN / "drift_steps.json").read_text(encoding="utf-8"))["sessions"]
    conn = db.connect()
    try:
        store.register(conn, GOLDEN / "dues_v2.xlsx", "dues")
        dump("decision_partial", gate.propose_edit(conn, "dues", steps[0]["steps"][0]["ops"], "s_A"))
        for i, step in enumerate(steps[1]["steps"][:9], start=1):  # 9th call crosses the drift budget
            d = gate.propose_edit(conn, "dues", step["ops"], "s_B")
        dump("decision_drift_held", d)

        store.register(conn, GOLDEN / "judge_xlookup.xlsx", "judge")
        payment = [{"op": "set_value", "cell": "Payments!C5", "value": 2500}]  # feeds LateFees!C via XLOOKUP
        dump("decision_cant_verify", gate.propose_edit(conn, "judge", payment, "s_C"))
    finally:
        store.drain()
        conn.close()


if __name__ == "__main__":
    main()
