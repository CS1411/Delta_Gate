"""The frozen demo workbooks: saved (cached) values and formula hygiene."""

import re
from pathlib import Path

import pytest
from openpyxl import load_workbook

GOLDEN = Path(__file__).resolve().parents[2] / "golden"

V3 = {"Summary!C6": 328000, "Summary!C4": 100000, "Summary!C3": 75000, "LateFees!F2": 200000, "LateFees!F3": 8000}
CACHED = {
    "dues_v2.xlsx": {"Summary!C6": 286000, "Summary!C4": 100000, "Summary!C3": 37000, "LateFees!F2": 200000, "LateFees!F3": 4000},
    "dues_v3_REAL.xlsx": V3,
    "judge_xlookup.xlsx": V3,
}
ALLOWED = {"SUM", "INDEX", "MATCH", "VLOOKUP", "IF"}


def formulas(name):
    wb = load_workbook(GOLDEN / name)
    return {f"{ws.title}!{c.coordinate}": c.value for ws in wb for row in ws for c in row if c.data_type == "f"}


@pytest.mark.parametrize("name", CACHED)
def test_saved_values(name):
    wb = load_workbook(GOLDEN / name, data_only=True)
    if wb["Summary"]["C6"].value is None:
        pytest.skip(f"{name} has no cached values: run golden/recalc.sh")
    for ref, want in CACHED[name].items():
        sheet, cell = ref.split("!")
        assert wb[sheet][cell].value == pytest.approx(want, abs=1e-6), ref


@pytest.mark.parametrize("name", CACHED)
def test_only_allowlisted_functions_and_bounded_ranges(name):
    allowed = ALLOWED | ({"XLOOKUP"} if name == "judge_xlookup.xlsx" else set())
    for ref, formula in formulas(name).items():
        used = {f.removeprefix("_xlfn.").removeprefix("_xlws.") for f in re.findall(r"([A-Za-z_.]+)\(", formula)}
        assert used <= allowed, f"{ref}: {formula}"
        assert not re.search(r"\$?[A-Z]+:\$?[A-Z]+(?![0-9])", formula), f"whole-column range in {ref}: {formula}"


def test_planted_changes():
    v2, v3, judge = (formulas(n) for n in CACHED)
    assert v2["LateFees!F3"] == "=F2*0.02" and v3["LateFees!F3"] == "=F2*0.04"
    assert "Summary!C4" in v2 and "Summary!C4" not in v3  # typed over a formula
    assert load_workbook(GOLDEN / "dues_v3_REAL.xlsx")["Expenses"]["B12"].value == 38000
    assert load_workbook(GOLDEN / "dues_v2.xlsx")["Expenses"]["B12"].value is None
    assert sum("XLOOKUP" in f for f in judge.values()) == 60 and not any("XLOOKUP" in f for f in v3.values())


# --- TRUE / FALSE golden file (Phase 2, step 0) ---------------------------------------------------


def test_truefalse_golden_matches_excel():
    """TRUE / FALSE are on the allowlist only because every one of these cells matches Excel's saved value."""
    from deltagate.engine import allowlist, recalc
    from deltagate.engine.parse import Formula, parse
    from deltagate.engine.verify import close

    book = parse(GOLDEN / "truefalse.xlsx")
    assert book.saved_by == "Microsoft Excel"
    cells = [a for a, content in book.cells.items() if isinstance(content, Formula)]
    assert len(cells) == 24 and all(book.cached[a] is not None for a in cells)
    assert book.cached["Cases!F2"] == 300 and book.cached["Cases!F8"] is True and book.cached["Cases!F25"] == 101

    engine = recalc.recompute(book.path, cells)
    wrong = {a: (book.cells[a], engine[a], book.cached[a]) for a in cells if not close(engine[a], book.cached[a])}
    assert not wrong, wrong
    assert [a for a in cells if allowlist.unverifiable_reason(book.cells[a])] == []
