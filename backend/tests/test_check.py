"""Phase 1 acceptance: a full Check on the frozen demo workbooks (Prompt 1)."""

import json
import subprocess
import time
from pathlib import Path

import pytest
from openpyxl import load_workbook

from conftest import JUDGE, V2, V3, book, tamper_cached
from deltagate.cli import main as cli_main
from deltagate.config import soffice
from deltagate.engine.check import check
from deltagate.engine.parse import parse
from deltagate.engine.proof import proof_workbook
from deltagate.models import CheckResult

C6, C4 = "Summary!C6", "Summary!C4"


def output(result, cell):
    return next(o for o in result.outputs if o.cell == cell)


def group_of(result, cell):
    return next(g for g in result.groups if cell in g.cells)


def shares(result, cell):
    return {a.group_id: a.share for a in output(result, cell).attribution}


# --- v2 -> v3 ---------------------------------------------------------------------------


def test_v3_delta_and_shares(check_v3):
    o = output(check_v3, C6)
    assert (o.base, o.new) == (286000, 328000)
    assert (o.delta_observed, o.delta_verified, o.delta_unverified) == (42000, 42000, 0)

    expense, late_fee, typed = (group_of(check_v3, c) for c in ("Expenses!B12", "LateFees!F3", C4))
    assert (expense.type, late_fee.type, typed.type) == ("data", "logic", "structural")
    assert set(expense.cells) == {"Expenses!A12", "Expenses!B12"} and late_fee.cells == ["LateFees!F3"]
    assert len(check_v3.groups) == 3

    got = shares(check_v3, C6)
    assert got[expense.group_id] == pytest.approx(38000, abs=1e-9)
    assert got[late_fee.group_id] == pytest.approx(4000, abs=1e-9)
    assert got[typed.group_id] == pytest.approx(0, abs=1e-9)
    assert sum(got.values()) == pytest.approx(o.delta_verified, abs=1e-9)
    assert all(a.interaction == pytest.approx(0, abs=1e-9) for a in o.attribution)  # additive by design
    assert all(a.solo + a.interaction == pytest.approx(a.share, abs=1e-9) for a in o.attribution)


def test_v3_collected_is_unchanged(check_v3):
    o = output(check_v3, C4)
    assert (o.base, o.new, o.delta_observed, o.delta_verified, o.delta_unverified) == (100000, 100000, 0, 0, 0)


def test_v3_structural_findings(check_v3):
    found = {(f.kind, f.cell) for f in check_v3.structural}
    assert ("typed_over_formula", C4) in found
    assert ("protected_formula_edit", "LateFees!F3") in found

    lost = [f for f in check_v3.structural if f.kind == "lost_link"]
    assert [(f.cell, f.output) for f in lost] == [(C4, C4)]
    assert lost[0].message.startswith("Collected no longer depends on Payments!C")
    # C6 still reaches Payments!C through LateFees!C -> Payments!D, so no lost link there.
    assert not any(f.output == C6 for f in lost)


def test_v3_verification(check_v3):
    v = check_v3.verification
    assert (v.saved_by, v.formula_cells, v.matched, v.mismatched) == ("Microsoft Excel", 307, 307, [])
    assert check_v3.coverage == 1.0 and check_v3.unverifiable == []


def test_result_matches_the_contract(check_v3):
    again = CheckResult.model_validate_json(check_v3.model_dump_json())
    assert again == check_v3
    assert check_v3.check_id.startswith("chk_") and check_v3.mode == "check"
    assert len(check_v3.base_version) == len(check_v3.new_version) == 64


# --- judge_xlookup ----------------------------------------------------------------------


def test_judge_partial_verification(check_judge):
    reasons = {u.cell: u.reason for u in check_judge.unverifiable}
    for row in (2, 31, 61):
        assert reasons[f"LateFees!C{row}"] == "XLOOKUP"
    assert sum(r == "XLOOKUP" for r in reasons.values()) == 60
    assert 0 < check_judge.coverage < 1

    o = output(check_judge, C6)
    assert (o.delta_observed, o.delta_verified, o.delta_unverified) == (42000, 38000, 4000)
    expense = group_of(check_judge, "Expenses!B12")
    got = shares(check_judge, C6)
    assert got[expense.group_id] == pytest.approx(38000, abs=1e-9)  # the verified part is still attributed
    assert sum(got.values()) == pytest.approx(38000, abs=1e-9)
    # the late-fee path is unverifiable, so its groups are excluded from attribution, never guessed
    assert group_of(check_judge, "LateFees!F3").group_id not in got

    assert output(check_judge, C4).delta_unverified == 0  # Collected does not touch the XLOOKUP path
    assert check_judge.verification.matched == check_judge.verification.formula_cells == 307  # base is v2


def test_round_is_unverifiable(tmp_path, policy):
    base = book(tmp_path / "a.xlsx", {"Summary": {"A1": 7.5, "C6": "=ROUND(A1*1.234,2)", "C4": "=A1*2"}})
    new = book(tmp_path / "b.xlsx", {"Summary": {"A1": 8.5, "C6": "=ROUND(A1*1.234,2)", "C4": "=A1*2"}})
    result = check(base, new, policy)
    assert {u.cell: u.reason for u in result.unverifiable} == {C6: "ROUND"}
    assert result.verification.saved_by == "none" and result.coverage == 0.5

    rounded = output(result, C6)  # no saved values and no engine value: say so, never guess
    assert (rounded.base, rounded.new, rounded.delta_observed, rounded.delta_unverified) == (None, None, None, None)
    assert rounded.delta_verified == 0 and rounded.attribution == []
    assert output(result, C4).delta_verified == 2  # the supported cell is still computed


def test_tampered_saved_value_is_caught(tmp_path, policy):
    """Requirement 1: recalc never trusts cached values, so a doctored saved value shows up as a mismatch."""
    bad = tamper_cached(V2, tmp_path / "tampered.xlsx", "Summary", "286000", "999")
    result = check(bad, V3, policy)
    assert result.verification.mismatched == [C6] and result.verification.matched == 306
    assert {u.cell for u in result.unverifiable} == {C6} and result.coverage < 1
    o = output(result, C6)
    assert o.delta_verified == 0 and o.attribution == [] and o.delta_unverified == o.delta_observed == 328000 - 999


# --- proof workbook ---------------------------------------------------------------------


def test_proof_workbook_for_f3(check_v3, tmp_path):
    late_fee = group_of(check_v3, "LateFees!F3")
    proof = proof_workbook(V2, V3, late_fee.cells, tmp_path / "proof.xlsx")
    wb = load_workbook(proof)
    assert wb.calculation.fullCalcOnLoad is True
    assert wb["LateFees"]["F3"].value == "=F2*0.04"  # only this change applied, formulas intact
    assert wb["Summary"]["C4"].value == "=SUM(Payments!C2:C61)" and wb["Expenses"]["B12"].value is None

    if not soffice():
        pytest.skip("LibreOffice not installed: cannot recalculate the proof workbook")
    out = tmp_path / "recalculated"
    profile = tmp_path / "lo_profile"
    subprocess.run([soffice(), f"-env:UserInstallation={profile.as_uri()}", "--headless", "--calc", "--convert-to", "xlsx",
                    "--outdir", str(out), str(proof)], check=True, capture_output=True, timeout=120)
    assert parse(out / "proof.xlsx").saved_by == "LibreOffice"  # honest label: this copy was not saved by Excel
    recalculated = load_workbook(out / "proof.xlsx", data_only=True)["Summary"]["C6"].value
    solo = next(a.solo for a in output(check_v3, C6).attribution if a.group_id == late_fee.group_id)
    assert recalculated - 286000 == solo == 4000  # LibreOffice agrees with the engine's solo effect


# --- CLI + timing -----------------------------------------------------------------------


def test_cli_json_and_summary(capsys):
    assert cli_main(["check", str(V2), str(V3), "--json"]) == 0
    result = CheckResult.model_validate(json.loads(capsys.readouterr().out))
    assert output(result, C6).delta_verified == 42000

    assert cli_main(["check", str(V2), str(V3)]) == 0
    text = capsys.readouterr().out
    assert "Verified against Excel's saved values: 307 / 307 formula cells match" in text
    for expected in ("₹2,86,000", "₹3,28,000", "+₹42,000", "+₹38,000", "+₹4,000",
                     "typed_over_formula", "Collected no longer depends on Payments!C"):
        assert expected in text, expected


@pytest.mark.parametrize("new", [V3, JUDGE], ids=["v3", "judge"])
def test_full_check_under_10_seconds(new, policy):
    start = time.perf_counter()
    check(V2, new, policy)
    seconds = time.perf_counter() - start
    print(f"\nfull Check dues_v2.xlsx -> {new.name}: {seconds:.2f} s")
    assert seconds < 10
