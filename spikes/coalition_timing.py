"""Spike: evaluate Summary!C6 for all 2^n coalitions of change groups with pycel.

Run:  cd backend && uv run python ../spikes/coalition_timing.py

Strategy under test (build rules, section 6): one compiled model per subset of formula groups,
data groups applied on top with set_value. Change groups are written out by hand here; the
classifier that derives them is Phase 1.

Prints: Shapley shares for v2 -> v3 (must be 38,000 + 4,000 + 0 = 42,000), wall time for
256 coalitions, and what pycel can / cannot do without a recompile.
"""

import sys
import time
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from openpyxl import load_workbook  # noqa: E402
from pycel import ExcelCompiler  # noqa: E402
from pycel.excelformula import ExcelFormula  # noqa: E402

from deltagate.engine.shapley import shapley  # noqa: E402

V2 = ROOT / "golden" / "dues_v2.xlsx"
V3 = ROOT / "golden" / "dues_v3_REAL.xlsx"
OUT = "Summary!C6"

# --- change groups v2 -> v3, by hand -------------------------------------------------
# data group: {cell: (base value, new value)}
EXPENSE = {"Expenses!A12": (None, "Lift repair"), "Expenses!B12": (None, 38000)}
# formula group: {cell: new content}. A typed-over formula is treated as a formula group.
LATE_FEE = {"LateFees!F3": "=F2*0.04"}
TYPED_OVER = {"Summary!C4": 100000}
# five synthetic payment edits (not-yet-due flats), only to reach 8 groups for the timing run
PAYMENTS = {f"pay{r}": {f"Payments!C{r}": (0, 2500)} for r in (5, 9, 13, 17, 21)}


def subsets(names):
    return [frozenset(c) for k in range(len(names) + 1) for c in combinations(names, k)]


def compile_model(path, edits=None):
    """Formulas-only workbook -> pycel model. No cached values are used: everything is computed."""
    wb = load_workbook(path)
    for addr, content in (edits or {}).items():
        sheet, cell = addr.split("!")
        wb[sheet][cell] = content
    xl = ExcelCompiler(excel=wb)
    xl.evaluate(OUT)  # builds the graph: every precedent of OUT is now in cell_map
    return xl


def put(xl, addr, value):
    if addr not in xl.cell_map:
        return  # not a precedent of the evaluated output, so it cannot move it
    if value is None:
        # set_value(addr, None) leaves dependents stale (probe 2 below), so clear via _reset
        cell = xl.cell_map[addr]
        if cell.value is not None:
            xl._reset(cell)
    else:
        xl.set_value(addr, value)


def evaluate_all(data_groups, formula_groups):
    """F(S) for every coalition S, plus (compile seconds, evaluate seconds, models compiled)."""
    F, t_compile, t_eval = {}, 0.0, 0.0
    formula_subsets = subsets(list(formula_groups))
    for fs in formula_subsets:
        t = time.perf_counter()
        xl = compile_model(V2, {a: c for g in fs for a, c in formula_groups[g].items()})
        t_compile += time.perf_counter() - t
        t = time.perf_counter()
        for ds in subsets(list(data_groups)):
            for g, cells in data_groups.items():
                for addr, (base, new) in cells.items():
                    put(xl, addr, new if g in ds else base)
            F[fs | ds] = float(xl.evaluate(OUT))
        t_eval += time.perf_counter() - t
    return F, t_compile, t_eval, len(formula_subsets)


def main():
    base = float(compile_model(V2).evaluate(OUT))
    new = float(compile_model(V3).evaluate(OUT))
    print(f"F(v2) = {base:,.0f}   F(v3) = {new:,.0f}   delta = {new - base:+,.0f}")
    assert (base, new) == (286000, 328000)

    # --- run 1: the three real groups ---------------------------------------------------
    data, formula = {"expense_row": EXPENSE}, {"late_fee_formula": LATE_FEE, "collected_typed_over": TYPED_OVER}
    F, *_ = evaluate_all(data, formula)
    groups = [*data, *formula]
    assert F[frozenset(groups)] == new, "all groups applied must reproduce v3"
    result = shapley(groups, lambda s: F[s] - F[frozenset()])
    print("\nShapley, v2 -> v3, Summary!C6")
    for g, a in result.items():
        print(f"  {g:22s} solo {a.solo:+10,.0f}   share {a.share:+10,.0f}   interaction {a.interaction:+,.0f}")
    total = sum(a.share for a in result.values())
    print(f"  {'sum of shares':22s} {total:+,.0f}")
    assert [round(result[g].share, 6) for g in groups] == [38000, 4000, 0]
    assert abs(total - 42000) < 1e-9

    # --- run 2: timing, 8 groups = 256 coalitions -----------------------------------------
    data = {"expense_row": EXPENSE, **PAYMENTS}
    t0 = time.perf_counter()
    F, t_compile, t_eval, models = evaluate_all(data, formula)
    wall = time.perf_counter() - t0
    assert len(F) == 256
    result = shapley([*data, *formula], lambda s: F[s] - F[frozenset()])
    delta = F[frozenset([*data, *formula])] - F[frozenset()]
    assert abs(sum(a.share for a in result.values()) - delta) < 1e-9
    print(f"\nTiming, 8 groups (6 data + 2 formula) = {len(F)} coalitions")
    print(f"  compile {models} models : {t_compile * 1000:8.0f} ms  ({t_compile / models * 1000:.0f} ms each)")
    print(f"  evaluate 256       : {t_eval * 1000:8.0f} ms  ({t_eval / 256 * 1000:.2f} ms each)")
    print(f"  wall time          : {wall * 1000:8.0f} ms")
    print(f"  naive (recompile per coalition, estimated): {t_compile / models * 256 * 1000:,.0f} ms")

    # --- probes: what works without a recompile -------------------------------------------
    print("\nProbes")
    xl = compile_model(V2)
    xl.set_value("Expenses!B12", 38000)
    got = xl.evaluate(OUT)
    print(f"  1 appended row via set_value on an empty cell inside the SUM range: {got:,.0f} "
          f"-> {'WORKS' if got == 324000 else 'WRONG'}")

    xl.set_value("Expenses!B12", None)
    got = xl.evaluate(OUT)
    print(f"  2 undo it with set_value(cell, None): {got:,.0f} "
          f"-> {'works' if got == 286000 else 'STALE (dependents not invalidated)'}")
    xl.set_value("Expenses!B12", 38000)
    xl._reset(xl.cell_map["Expenses!B12"])
    got = xl.evaluate(OUT)
    print(f"    undo it with the private xl._reset(cell): {got:,.0f} -> {'WORKS' if got == 286000 else 'WRONG'}")

    xl = compile_model(V2)
    xl.set_value("Summary!C4", 100000)  # type over the Collected formula in the live model
    xl.set_value("Payments!C5", 2500)  # then an upstream payment changes
    got, truth = xl.evaluate(OUT), compile_model(V2, {"Summary!C4": 100000, "Payments!C5": 2500}).evaluate(OUT)
    print(f"  3 typed-over formula via set_value, then an upstream edit: {got:,.0f}, recompiled truth {truth:,.0f} "
          f"-> {'works' if got == truth else 'WRONG (pycel recomputes the old formula)'}")

    xl = compile_model(V2)
    try:
        cell = xl.cell_map["LateFees!F3"]
        cell.formula = ExcelFormula("=F2*0.04", cell=cell, formula_is_python_code=False)
        xl._reset(cell)
        got = xl.evaluate(OUT)
        verdict = "works, but private API and only valid when precedents are unchanged" if got == 290000 else "WRONG"
        print(f"  4 changed formula in a live model (swap cell.formula + _reset): {got:,.0f} -> {verdict}")
    except Exception as e:  # report, never hide
        print(f"  4 changed formula in a live model: FAILS with {type(e).__name__}: {e}")
    print("    no public pycel API changes a formula in place: recompile per formula subset")


if __name__ == "__main__":
    main()
