"""REST API groups 2-4: checks + proof, audit + CSV export, Session Audit. Over HTTP on a real engine and database."""

import csv
import io
import sqlite3

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from conftest import JUDGE, V2, V3, book
from deltagate import api, config
from deltagate.gate import gate, store
from deltagate.models import AuditLog, CheckResult

C6, C4, F3 = "Summary!C6", "Summary!C4", "LateFees!F3"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture
def client(home):
    return TestClient(api.app)


def upload(path):
    return (path.name, path.read_bytes(), XLSX)


def run_check(client, base=V2, new=V3):
    r = client.post("/api/checks", files={"base": upload(base), "new": upload(new)})
    assert r.status_code == 200, r.text
    return CheckResult.model_validate(r.json())


def output(result, cell):
    return next(o for o in result.outputs if o.cell == cell)


def group_id(result, gtype):
    return next(g.group_id for g in result.groups if g.type == gtype)


# --- checks ------------------------------------------------------------------------------------------


def test_check_v2_v3_over_http(client):
    result = run_check(client)
    c6 = output(result, C6)
    assert (c6.base, c6.new, c6.delta_verified) == (286000, 328000, 42000)
    shares = {a.group_id: a.share for a in c6.attribution}
    assert shares[group_id(result, "data")] == 38000 and shares[group_id(result, "logic")] == 4000
    assert result.mode == "check" and result.verification.saved_by == "Microsoft Excel"
    assert client.get(f"/api/checks/{result.check_id}").json() == result.model_dump(mode="json")


def test_unknown_or_malformed_check_id_is_404(client):
    for check_id in ("chk_000000000000", "nope", "..%2F..%2Fdata"):
        assert client.get(f"/api/checks/{check_id}").status_code == 404


def test_a_file_that_is_not_a_workbook_is_422_in_plain_words(client):
    r = client.post("/api/checks", files={"base": ("a.xlsx", b"not a workbook", XLSX), "new": upload(V3)})
    assert r.status_code == 422 and "not a readable workbook" in r.json()["detail"]


def test_proof_workbook_for_the_logic_group(client, tmp_path):
    result = run_check(client)
    r = client.post(f"/api/checks/{result.check_id}/proof/{group_id(result, 'logic')}")
    assert r.status_code == 200 and r.headers["content-type"] == XLSX
    assert "attachment" in r.headers["content-disposition"]
    proof = tmp_path / "proof.xlsx"
    proof.write_bytes(r.content)
    wb = load_workbook(proof)
    assert wb["LateFees"]["F3"].value == "=F2*0.04" and wb.calculation.fullCalcOnLoad is True
    assert wb["Summary"]["C4"].value == "=SUM(Payments!C2:C61)"  # only the logic group is applied


def test_proof_for_an_unknown_group_or_a_check_without_files_is_404(client, home):
    result = run_check(client)
    assert client.post(f"/api/checks/{result.check_id}/proof/g99").status_code == 404
    store.register(home, V2, "dues")
    held = gate.propose_edit(home, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    r = client.post(f"/api/checks/{held.check.check_id}/proof/g1")  # a gate Check: the API kept no files for it
    assert r.status_code == 404 and "no files" in r.json()["detail"]


# --- audit -------------------------------------------------------------------------------------------


def test_audit_log_and_verify(client, home):
    store.register(home, V2, "dues")
    gate.propose_edit(home, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    log = AuditLog.model_validate(client.get("/api/audit").json())
    assert [e.action for e in log.entries] == ["register", "propose_edit"]
    assert client.get("/api/audit/verify").json() == {"ok": True, "entries": 2, "checkpoints": 0, "error": None}

    with sqlite3.connect(config.db_path()) as raw:  # someone edits the log behind our back
        raw.execute("UPDATE audit_log SET actor = 'someone else' WHERE seq = 2")
    verdict = client.get("/api/audit/verify").json()
    assert verdict["ok"] is False and verdict["error"] == "entry 2 does not match its hash"


# --- CSV export --------------------------------------------------------------------------------------


def rows(client, check_id):
    r = client.get(f"/api/exports/{check_id}.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    return list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))


def test_csv_shares_add_up_and_unverified_is_separate(client):
    result = run_check(client)
    lines = rows(client, result.check_id)
    c6 = [r for r in lines if r["record"] == "attribution" and r["output_cell"] == C6]
    assert sum(float(r["share"]) for r in c6) == 42000
    assert {r["group_label"] for r in c6} >= {"New row in Expenses: Lift repair", "Formula changed: LateFees!F3"}
    lost = [r for r in lines if r["record"] == "structural" and r["detail"].startswith("lost_link")]
    assert [(r["group_cells"], r["output_cell"]) for r in lost] == [(C4, C4)]

    judge = run_check(client, V2, JUDGE)
    out = next(r for r in rows(client, judge.check_id) if r["record"] == "output" and r["output_cell"] == C6)
    assert (float(out["delta_verified"]), float(out["delta_unverified"])) == (38000, 4000)
    assert any(r["record"] == "unverifiable" and r["detail"] == "XLOOKUP" for r in rows(client, judge.check_id))


def test_csv_writes_unknown_never_0_for_null(client, tmp_path):
    cells = {"C6": "=ROUND(Data!B2,0)", "C4": "=Data!B2"}  # ROUND is unverifiable and the files have no saved values
    a = book(tmp_path / "a.xlsx", {"Data": {"B2": 10}, "Summary": cells})
    b = book(tmp_path / "b.xlsx", {"Data": {"B2": 20}, "Summary": cells})
    result = run_check(client, a, b)
    assert output(result, C6).base is None
    out = next(r for r in rows(client, result.check_id) if r["record"] == "output" and r["output_cell"] == C6)
    assert (out["base"], out["new"], out["delta_observed"], out["delta_unverified"]) == ("unknown",) * 4


def test_csv_for_an_unknown_check_is_404(client):
    assert client.get("/api/exports/chk_000000000000.csv").status_code == 404


# --- Session Audit -----------------------------------------------------------------------------------


def test_session_audit_snapshot_then_complete(client):
    snap = client.post("/api/session-audit/snapshot", files={"file": upload(V2)})
    assert snap.status_code == 200 and snap.json()["sha256"] == store.sha256(V2)
    r = client.post("/api/session-audit/complete", data={"snapshot_id": snap.json()["snapshot_id"]},
                    files={"file": upload(V3)})
    assert r.status_code == 200, r.text
    result = CheckResult.model_validate(r.json())
    assert result.mode == "session_audit" and result.base_version == store.sha256(V2)
    assert output(result, C6).delta_verified == 42000
    assert [(f.cell, f.output) for f in result.structural if f.kind == "lost_link"] == [(C4, C4)]
    # it is an ordinary stored Check: readable, provable, exportable
    assert client.get(f"/api/checks/{result.check_id}").status_code == 200
    assert client.post(f"/api/checks/{result.check_id}/proof/{group_id(result, 'logic')}").status_code == 200
    assert rows(client, result.check_id)


def test_session_audit_unknown_or_malformed_snapshot_is_404(client):
    for bad in ("sa_000000000000", "../../etc/passwd"):
        r = client.post("/api/session-audit/complete", data={"snapshot_id": bad}, files={"file": upload(V3)})
        assert r.status_code == 404
