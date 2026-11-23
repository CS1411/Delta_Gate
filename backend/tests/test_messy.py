"""Judge's-own-file drill (P2 task 5): three messy workbook pairs, golden/messy_*, built by scripts/make_messy.py.

Each pair goes through the Check (same entry point as the CLI, and the CLI itself) and its v3 ops through the gate.
Required: nothing crashes, every failure is an honest "can't verify" with a plain reason, an unverifiable output is
never shown as 0 or dropped, the verified part keeps its exact delta, and a macro is never executed.
"""

import json
import os
import subprocess
import sys

import pytest

from conftest import GOLDEN, ROOT, book
from deltagate.engine.check import check
from deltagate.engine.parse import parse
from deltagate.gate import gate, store
from deltagate.models import CheckResult

MANIFEST = json.loads((GOLDEN / "messy_ops.json").read_text(encoding="utf-8"))
C4, C6 = "Summary!C4", "Summary!C6"
NOT_PLAIN = ("Traceback", "Exception", "Error(", 'File "')  # what a stack trace or a raw exception looks like


def pair(name):
    return GOLDEN / MANIFEST[name]["v2"], GOLDEN / MANIFEST[name]["v3"]


@pytest.fixture(scope="module")
def checks(policy):
    return {name: check(*pair(name), policy) for name in MANIFEST}


def out(result, cell):
    return next(o for o in result.outputs if o.cell == cell)


def plain(text: str) -> bool:
    return bool(text.strip()) and not any(s in text for s in NOT_PLAIN)


# --- every case ----------------------------------------------------------------------------------


@pytest.mark.parametrize("name", MANIFEST)
def test_every_watched_output_is_reported_and_none_is_a_fake_zero(name, checks, policy):
    result = checks[name]
    assert [o.cell for o in result.outputs] == [w.cell for w in policy.watched_outputs]  # never silently dropped
    unverifiable = {u.cell for u in result.unverifiable}
    for o in result.outputs:
        if o.delta_observed is None:
            assert o.delta_unverified is None  # unknown stays unknown, never 0
        else:  # verified and unverified are separate and add up to what the saved values show
            assert o.delta_verified + (o.delta_unverified or 0) == pytest.approx(o.delta_observed, abs=1e-9)
        if o.delta_unverified:
            assert o.cell in unverifiable  # an output with an unverified part is listed, with its reason


@pytest.mark.parametrize("name", MANIFEST)
def test_reasons_are_plain_language(name, checks):
    for u in checks[name].unverifiable:
        assert plain(u.reason), u
    for f in checks[name].structural:
        assert plain(f.message), f


@pytest.mark.parametrize("name", MANIFEST)
def test_cli_never_shows_a_stack_trace(name):
    for extra in ([], ["--json"]):
        run = subprocess.run([sys.executable, "-m", "deltagate.cli", "check", *map(str, pair(name)), *extra],
                             cwd=ROOT / "backend", capture_output=True, text=True, encoding="utf-8", timeout=300,
                             env=os.environ | {"PYTHONIOENCODING": "utf-8"})
        assert run.returncode == 0 and "Traceback" not in run.stdout + run.stderr, run.stderr
        if extra:
            CheckResult.model_validate_json(run.stdout)


@pytest.mark.parametrize("name", MANIFEST)
def test_gate_decides_without_crashing(name, home):
    workbook_id = name.replace("_", "-")
    store.register(home, pair(name)[0], workbook_id)
    decision = gate.propose_edit(home, workbook_id, MANIFEST[name]["ops"], f"s_{name}")
    for g in decision.groups:
        if g.status != "PASS":
            assert g.reasons and all(plain(r) for r in g.reasons)
        if g.status == "CANT_VERIFY_HELD":
            assert g.impacts == [] and g.reasons[0].startswith("Can't verify: ")  # no number, never a 0


# --- 1: merged header cells, blank rows, no key column ---------------------------------------------


def test_messy_1_exact_delta(checks):
    result = checks["messy_1"]
    assert result.verification.saved_by == "LibreOffice" and result.coverage == 1.0 and not result.unverifiable
    c4, c6 = out(result, C4), out(result, C6)
    assert (c4.base, c4.new, c4.delta_verified, c4.delta_unverified) == (13000, 13500, 500, 0)
    assert (c6.base, c6.new, c6.delta_verified, c6.delta_unverified) == (11000, 10500, -500, 0)
    assert sum(a.share for a in c6.attribution) == pytest.approx(-500, abs=1e-9)


def test_messy_1_row_appended_past_the_range_is_a_finding(checks):
    found = [(f.kind, f.cell, f.output) for f in checks["messy_1"].structural]
    assert found == [("shortened_range", "Ledger!C13", C4)]


def test_messy_1_gate_passes_the_payment_and_holds_the_uncovered_row(home):
    store.register(home, pair("messy_1")[0], "m1")
    d = gate.propose_edit(home, "m1", MANIFEST["messy_1"]["ops"], "s_m1")
    assert d.status == "PARTIAL" and [g.status for g in d.groups] == ["PASS", "HELD"]
    assert {i.cell: i.delta for i in d.groups[0].impacts} == {C6: -500, C4: 500}
    assert "does not cover new row 13" in d.groups[1].reasons[0]


# --- 2: XLOOKUP, SORT, a defined name; a renamed sheet ---------------------------------------------


def test_messy_2_verified_part_is_exact_and_the_rest_is_unverified(checks):
    result = checks["messy_2"]
    c6, c4 = out(result, C6), out(result, C4)
    assert (c6.delta_observed, c6.delta_verified, c6.delta_unverified) == (-1460, 1000, -2460)  # billed +1,000 verified
    assert (c4.delta_observed, c4.delta_verified, c4.delta_unverified) == (2500, 0, 2500)  # all through XLOOKUP
    reasons = {u.reason for u in result.unverifiable}
    assert {"XLOOKUP", "SORT", "unsupported reference LateRate", "depends on an unverifiable cell"} <= reasons


def test_messy_2_renamed_sheet_is_one_group_not_a_lost_link(checks):
    result = checks["messy_2"]
    assert "Sheet Expenses renamed to Costs" in [g.label for g in result.groups]
    kinds = {f.kind for f in result.structural}
    assert "lost_link" not in kinds and "rows_deleted_in_range" not in kinds


def test_messy_2_gate_holds_both_edits_as_cant_verify(home):
    store.register(home, pair("messy_2")[0], "m2")
    d = gate.propose_edit(home, "m2", MANIFEST["messy_2"]["ops"], "s_m2")
    assert d.status == "HELD" and d.committed_version is None
    assert [g.status for g in d.groups] == ["CANT_VERIFY_HELD", "CANT_VERIFY_HELD"]
    assert d.groups[0].reasons == ["Can't verify: Summary!C5 (unsupported reference LateRate)"]
    assert d.groups[1].reasons == ["Can't verify: LateFees!B2 (XLOOKUP)"]


def test_messy_2_payment_through_xlookup_is_not_shown_as_zero(checks):
    """Its whole effect runs through XLOOKUP cells: left out of the attribution, not a ₹0 row."""
    payment = next(g.group_id for g in checks["messy_2"].groups if g.cells == ["Payments!B4"])
    for cell in (C4, C6):
        assert payment not in {a.group_id for a in out(checks["messy_2"], cell).attribution}


def test_pure_rename_is_exact_zero(tmp_path, policy):
    """The rename and the formulas rewritten for it are one group, so no coalition refers to a missing sheet."""
    data = {"A1": "Item", "B1": "Amount", "A2": "x", "B2": 100, "A3": "y", "B3": 200}
    a = book(tmp_path / "a.xlsx", {"Data": data, "Summary": {"C6": "=SUM(Data!B2:B3)", "C4": "=Data!B2"}})
    b = book(tmp_path / "b.xlsx", {"Costs": data, "Summary": {"C6": "=SUM(Costs!B2:B3)", "C4": "=Costs!B2"}})
    result = check(a, b, policy)
    assert [g.label for g in result.groups] == ["Sheet Data renamed to Costs"]
    assert not any(f.kind in ("lost_link", "rows_deleted_in_range") for f in result.structural)
    assert not result.unverifiable
    assert [(o.base, o.new, o.delta_verified) for o in result.outputs] == [(300, 300, 0), (100, 100, 0)]


def test_new_sheet_and_the_formula_that_uses_it_are_one_group(tmp_path, policy):
    data = {"A1": "Item", "B1": "Amount", "A2": "x", "B2": 100, "A3": "y", "B3": 200}
    summary = {"C6": "=SUM(Data!B2:B3)", "C4": "=Data!B2"}
    a = book(tmp_path / "a.xlsx", {"Data": data, "Summary": summary})
    b = book(tmp_path / "b.xlsx", {"Data": data, "Extra": {"A1": "Item", "B1": "Amount", "B2": 50},
                                   "Summary": summary | {"C6": "=SUM(Data!B2:B3)+Extra!B2"}})
    result = check(a, b, policy)
    assert [(g.label, sorted(g.cells)) for g in result.groups] == [
        ("New sheet Extra", ["Extra!A1", "Extra!B1", "Extra!B2", "Summary!C6"])]
    assert not result.unverifiable
    c6 = out(result, C6)
    assert (c6.base, c6.new, c6.delta_verified) == (300, 350, 50) and c6.attribution[0].share == 50


# --- 3: .xlsm with a macro, hidden sheet, text numbers, empty sheet --------------------------------


@pytest.fixture
def no_processes(monkeypatch):
    """Anything that could run the macro (a child process, a shell open) fails the test instead."""
    def refuse(*args, **kwargs):
        raise AssertionError(f"tried to start a process: {args[:1]}")

    monkeypatch.setattr(subprocess, "Popen", refuse)
    if hasattr(os, "startfile"):
        monkeypatch.setattr(os, "startfile", refuse)


def test_messy_3_macro_blocks_everything_and_is_never_run(home, policy, no_processes):
    v2, v3 = pair("messy_3")
    before = v2.read_bytes()
    book2 = parse(v2)
    assert book2.blockers == ["macros (VBA)"] and {"Data", "Rates", "Notes", "Summary"} <= book2.sheets.keys()

    result = check(v2, v3, policy)
    assert result.coverage == 0 and {u.reason for u in result.unverifiable} == {"macros (VBA)"}
    for o in result.outputs:  # the saved values show the change; none of it is claimed as verified
        assert o.delta_verified == 0 and o.delta_unverified == o.delta_observed != 0
    assert (out(result, C4).delta_observed, out(result, C6).delta_observed) == (2000, pytest.approx(-2200))

    store.register(home, v2, "m3")
    d = gate.propose_edit(home, "m3", MANIFEST["messy_3"]["ops"], "s_m3")
    assert d.status == "HELD" and d.groups[0].status == "CANT_VERIFY_HELD"
    assert d.groups[0].reasons == ["Can't verify: Summary!C4 (macros (VBA))"]
    assert v2.read_bytes() == before  # the macro file is read, never written or run


def test_messy_3_text_numbers_are_skipped_by_sum_in_the_saved_values():
    """The file's own saved values (LibreOffice) skip text-formatted numbers in SUM, as Excel does: only 2,500 counts."""
    book3 = parse(pair("messy_3")[0])
    assert book3.cells["Data!B2"] == "1500" and book3.cached["Summary!C4"] == 2500
