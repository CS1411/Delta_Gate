"""Engine unit tests: the seven Phase 1 requirements from PROGRESS.md, alignment, classifier, structural checks."""

import pytest
from openpyxl import load_workbook

from conftest import V2, V3, book, tamper_cached
from deltagate.engine import allowlist, recalc
from deltagate.engine.align import align_rows, key_column
from deltagate.engine.check import check
from deltagate.engine.classify import classify, diff
from deltagate.engine.parse import Formula, parse, saved_by

C6 = "Summary!C6"


# --- requirement 1: formulas-only compile ---------------------------------------------------


def test_recalc_ignores_tampered_cached_value(tmp_path):
    bad = tamper_cached(V2, tmp_path / "tampered.xlsx", "Summary", "286000", "999")
    assert load_workbook(bad, data_only=True)["Summary"]["C6"].value == 999  # the file really is doctored
    assert parse(bad).cached[C6] == 999
    assert recalc.recompute(bad, [C6]) == {C6: 286000}


# --- requirement 2: typed-over cells are formula groups (recompile) ------------------------------


def test_typed_over_is_a_formula_group():
    typed = {"Summary!C4": (Formula("=SUM(Payments!C2:C61)"), 100000)}
    payment = {"Payments!C5": (0, 2500)}
    assert recalc.needs_recompile(typed) and not recalc.needs_recompile(payment)

    F = recalc.coalitions(V2, {"typed": typed, "pay": payment}, {}, [C6])
    value = {tuple(sorted(s)): v[C6] for s, v in F.items()}
    # A set_value on C4 would be recomputed from the old formula once the payment lands (283,500).
    assert value == {(): 286000, ("pay",): 283500, ("typed",): 286000, ("pay", "typed"): 286000}


def test_classifier_marks_typed_over_as_structural(tmp_path):
    groups, _, _ = classify(parse(V2), parse(V3))
    typed = next(g for g in groups if "Summary!C4" in g.cells)
    assert typed.type == "structural" and recalc.needs_recompile(typed.cells)


# --- requirement 3: one wrapper around pycel's private _reset ---------------------------------


def test_clear_cell_resets_dependents():
    xl = recalc.compile_model(V2, {}, [C6])
    recalc.set_cell(xl, "Expenses!B12", 38000)
    assert recalc.evaluate(xl, C6) == 324000
    recalc.clear_cell(xl, "Expenses!B12")  # set_value(cell, None) would leave C6 stale at 324,000
    assert recalc.evaluate(xl, C6) == 286000
    recalc.set_cell(xl, "Expenses!B12", 38000)
    recalc.set_cell(xl, "Expenses!B12", None)  # None routes through clear_cell
    assert recalc.evaluate(xl, C6) == 286000
    recalc.set_cell(xl, "Expenses!Z99", 5)  # not a precedent of any target: skipped, not a crash


# --- requirement 4: exact app-name match -----------------------------------------------------


@pytest.mark.parametrize("app, has_cached, want", [
    ("Microsoft Excel", True, "Microsoft Excel"),
    ("Microsoft Excel Compatible / Openpyxl 3.1.5", True, "none"),  # openpyxl is not Excel
    ("Microsoft Excel Online", True, "none"),
    ("LibreOffice/26.8.3.1$Windows_X86_64 LibreOffice_project/abc", True, "LibreOffice"),
    ("LibreOfficeish", True, "none"),
    ("", True, "none"),
    ("Microsoft Excel", False, "none"),  # no saved values: nothing to verify against, whatever the name
])
def test_saved_by_is_an_exact_match(app, has_cached, want):
    assert saved_by(app, has_cached) == want


def test_saved_by_from_files(tmp_path):
    assert parse(V2).saved_by == "Microsoft Excel"
    assert parse(book(tmp_path / "o.xlsx", {"S": {"A1": 1, "A2": "=A1+1"}})).saved_by == "none"


# --- requirements 5 and 6 + ROUND: the allowlist ---------------------------------------------


def test_allowlist_strips_xlfn_prefixes():
    assert allowlist.functions("=_xlfn.XLOOKUP(A2,B2:B9,C2:C9)") == {"XLOOKUP"}
    assert allowlist.functions("=_xlfn._xlws.FILTER(A1:A9,B1:B9>0)+sum(A1:A2)") == {"FILTER", "SUM"}
    assert allowlist.functions('=IF(A1>0,"ROUND(",0)') == {"IF"}  # text is not a function call


@pytest.mark.parametrize("formula, reason", [
    ("=SUM(A1:A5)+INDEX(B2:B9,MATCH(A1,C2:C9,0))", None),
    ("=IF(B2=\"Y\",C2,0)*0.04-Payments!$D$5", None),
    ("=ROUND(A1*1.234,2)", "ROUND"),  # until the Excel-compatible override passes its golden test
    ("=_xlfn.XLOOKUP(A2,B2:B9,C2:C9)", "XLOOKUP"),
    ("=COUNTA(A1:A9)", "COUNTA"),
    ("=A1*NOW()", "NOW"),
    ("=SUM(OFFSET(A1,0,0,3,1))", "OFFSET"),
    ("=VLOOKUP(A1,B1:C5,2,FALSE)", "TRUE/FALSE literal"),  # requirement 6: no golden test yet
    ("=VLOOKUP(A1,B1:C5,2,FALSE())", "FALSE"),  # LibreOffice's spelling
    ("=[1]Sheet1!A1*2", "external link"),
    ("=Rate*2", "unsupported reference Rate"),  # named ranges are out of scope
    ("=A1+#REF!", "#REF!"),
])
def test_unverifiable_reason(formula, reason):
    assert allowlist.unverifiable_reason(formula) == reason


# --- requirement 7: numpy scalars ------------------------------------------------------------


def test_numpy_scalars_are_coerced(tmp_path):
    path = book(tmp_path / "s.xlsx", {"S": {"A1": 3, "A2": 5, "B1": "=SUMPRODUCT(A1:A2,A1:A2)"}})
    value = recalc.recompute(path, ["S!B1"])["S!B1"]
    assert value == 34 and type(value) is int


# --- alignment --------------------------------------------------------------------------------


def test_key_column_detection():
    assert key_column(["Owner", "Flat No", "Amount"]) == 1
    assert key_column(["invoice no", "Amount"]) == 0
    assert key_column(["Item", "Amount"]) is None


def test_align_by_key_survives_a_deleted_row():
    base = [("A-101", 5), ("A-102", 5), ("A-103", 5)]
    new = [("A-101", 5), ("A-103", 9)]
    a = align_rows(base, new, key=0)
    assert a.pairs == [(0, 0), (2, 1)] and a.deleted == [1] and a.added == [] and a.shifted


def test_align_without_key_keeps_position():
    # two identical rows: without a key only position tells them apart, so the edit stays in place
    base = [("x", 5), ("x", 5), ("y", 7)]
    new = [("x", 5), ("x", 6), ("y", 7), ("z", 1)]
    a = align_rows(base, new, key=None)
    assert a.pairs == [(0, 0), (1, 1), (2, 2)] and a.added == [3] and a.deleted == [] and not a.shifted


# --- classifier -------------------------------------------------------------------------------


def test_same_column_edits_are_one_group_and_many_groups_merge(tmp_path):
    cells = {"A1": "Flat No", **{f"{c}1": f"h{c}" for c in "BCDEFGHIJK"}}
    cells |= {f"A{r}": f"F{r}" for r in range(2, 5)} | {f"{c}{r}": 1 for c in "BCDEFGHIJK" for r in range(2, 5)}
    base = parse(book(tmp_path / "a.xlsx", {"P": cells}))

    three = parse(book(tmp_path / "b.xlsx", {"P": cells | {"C2": 2, "C3": 2, "C4": 2}}))
    groups, _, _ = classify(base, three)
    assert [(g.type, sorted(g.cells)) for g in groups] == [("data", ["P!C2", "P!C3", "P!C4"])]

    ten = parse(book(tmp_path / "c.xlsx", {"P": cells | {f"{c}2": 2 for c in "BCDEFGHIJK"}}))
    groups, _, _ = classify(base, ten)  # ten columns would be ten groups: merged down to <= 8
    assert 1 <= len(groups) <= 8 and sum(len(g.cells) for g in groups) == 10
    assert [g.group_id for g in groups] == [f"g{i + 1}" for i in range(len(groups))]


def test_diff_is_empty_for_identical_files():
    raw, changes, _ = diff(parse(V2), parse(V2))
    assert raw == {} and changes == []


# --- structural checks (typed-over and lost link are asserted on the golden files in test_check) --


POLICY_CELLS = {"A1": "Item", "B1": "Amount", "C6": "=SUM(Data!B2:B4)", "C4": "=Data!B2"}
DATA = {"A1": "Flat No", "B1": "Amount", "A2": "F1", "B2": 10, "A3": "F2", "B3": 20, "A4": "F3", "B4": 30}


def kinds(result):
    return {(f.kind, f.cell) for f in result.structural}


def test_shortened_range(tmp_path, policy):
    base = book(tmp_path / "a.xlsx", {"Summary": POLICY_CELLS, "Data": DATA})
    new = book(tmp_path / "b.xlsx", {"Summary": POLICY_CELLS | {"C6": "=SUM(Data!B2:B3)"}, "Data": DATA})
    result = check(base, new, policy)
    assert ("shortened_range", C6) in kinds(result) and ("protected_formula_edit", C6) in kinds(result)
    out = next(o for o in result.outputs if o.cell == C6)
    assert (out.base, out.new, out.delta_verified) == (60, 30, -30)


def test_rows_deleted_in_range(tmp_path, policy):
    base = book(tmp_path / "a.xlsx", {"Summary": POLICY_CELLS, "Data": DATA})
    shifted = {"A1": "Flat No", "B1": "Amount", "A2": "F1", "B2": 10, "A3": "F3", "B3": 30}  # F2 deleted
    new = book(tmp_path / "b.xlsx", {"Summary": POLICY_CELLS | {"C6": "=SUM(Data!B2:B3)"}, "Data": shifted})
    result = check(base, new, policy)
    finding = next(f for f in result.structural if f.kind == "rows_deleted_in_range")
    assert finding.cell == "Data!A3" and finding.output == C6 and "F2" in finding.message
    assert not any(f.kind == "typed_over_formula" for f in result.structural)
    assert next(o for o in result.outputs if o.cell == C6).delta_verified == -20  # 60 -> 40


def test_appended_row_outside_the_range_is_a_finding_not_a_crash(tmp_path, policy):
    base = book(tmp_path / "a.xlsx", {"Summary": POLICY_CELLS, "Data": DATA})
    new = book(tmp_path / "b.xlsx", {"Summary": POLICY_CELLS, "Data": DATA | {"A5": "F4", "B5": 40}})
    result = check(base, new, policy)
    finding = next(f for f in result.structural if f.kind == "shortened_range")
    assert finding.cell == "Data!B5" and finding.output == C6 and "Data!B2:B4" in finding.message
    assert next(o for o in result.outputs if o.cell == C6).delta_verified == 0  # the new row is not counted
