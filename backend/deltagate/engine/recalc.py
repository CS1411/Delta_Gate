"""pycel wrapper: recompute a workbook from its formulas, and evaluate every coalition of change groups.

Rules learned in Phase 0 (docs/PROGRESS.md, "pycel findings"):
  - Always compile from a formulas-only openpyxl workbook. Compiled from a filename, pycel hands back
    the file's saved values without computing anything, which would make verification circular.
  - A changed or typed-over formula needs a recompile; plain values go in with set_value.
  - Clearing a cell needs the private _reset (set_value(cell, None) leaves dependents stale).
pycel is pinned at 1.0b30. The `formulas` fallback engine is not wired in: no function is routed to
it until one passes a golden test (XLOOKUP is the candidate).
"""

import logging
from itertools import combinations
from pathlib import Path

import numpy as np
from openpyxl import load_workbook
from pycel import ExcelCompiler

from deltagate.engine.parse import Formula

logging.getLogger("pycel").setLevel(logging.CRITICAL)  # it logs a traceback for every #DIV/0!


class EngineError:
    """Returned in place of a value when pycel cannot evaluate a cell."""

    def __init__(self, error: Exception):
        self.reason = type(error).__name__

    def __repr__(self):
        return f"EngineError({self.reason})"


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value  # NaN != NaN


def compile_model(path: Path | str, edits: dict[str, object], targets: list[str]) -> ExcelCompiler:
    """Base workbook (formulas only) with `edits` written in, compiled. Targets are evaluated once
    so that all their precedents are in pycel's cell map (set_value needs that)."""
    wb = load_workbook(path)  # never data_only, never ExcelCompiler(filename=...)
    for address, content in edits.items():
        sheet, coordinate = address.rsplit("!", 1)
        (wb[sheet] if sheet in wb.sheetnames else wb.create_sheet(sheet))[coordinate] = content
    xl = ExcelCompiler(excel=wb)
    for target in targets:
        evaluate(xl, target)
    return xl


def evaluate(xl: ExcelCompiler, address: str):
    try:
        value = xl.evaluate(address)
    except Exception as error:  # unknown function, bad reference: fail closed, the caller holds
        return EngineError(error)
    return value.item() if isinstance(value, np.generic) else value  # SUMPRODUCT returns np.int64


def clear_cell(xl: ExcelCompiler, address: str) -> None:
    """Empty a value cell and invalidate its dependents. The one place that touches pycel's private _reset."""
    cell = xl.cell_map.get(address)
    if cell is not None and cell.value is not None:
        xl._reset(cell)


def set_cell(xl: ExcelCompiler, address: str, value) -> None:
    if address not in xl.cell_map:
        return  # not a precedent of any target, so it cannot move one
    if value is None:
        clear_cell(xl, address)
    else:
        xl.set_value(address, value)


def recompute(path: Path | str, addresses: list[str]) -> dict[str, object]:
    """Engine values for the given cells, computed from formulas alone."""
    xl = compile_model(path, {}, [])
    return {a: evaluate(xl, a) for a in addresses}


def needs_recompile(cells: dict[str, tuple[object, object]]) -> bool:
    """A group with a formula on either side (changed, added, removed or typed over) cannot be a set_value."""
    return any(isinstance(content, Formula) for pair in cells.values() for content in pair)


def _subsets(names):
    return [frozenset(c) for k in range(len(names) + 1) for c in combinations(names, k)]


def coalitions(path: Path | str, groups: dict[str, dict], pins: dict[str, object], outputs: list[str]) -> dict:
    """F(S) for every subset S of the groups: {frozenset(group ids): {output: value}}.

    groups: {group id: {address: (base content, new content)}}. pins: cells held at a constant in every
    coalition (the unverifiable ones). One compiled model per subset of formula groups; value groups
    are toggled on top with set_value.
    """
    # ponytail: 2^k compiles for k formula groups (~0.25 s each on the demo file). Fine up to k = 3-4;
    # past that, merge formula groups before calling.
    formula_groups = [g for g, cells in groups.items() if needs_recompile(cells)]
    value_groups = [g for g in groups if g not in formula_groups]
    F = {}
    for applied in _subsets(formula_groups):
        edits = {a: new for g in applied for a, (_, new) in groups[g].items()}
        xl = compile_model(path, edits | pins, outputs)
        for chosen in _subsets(value_groups):
            for g in value_groups:
                for address, (base, new) in groups[g].items():
                    set_cell(xl, address, new if g in chosen else base)
            F[applied | chosen] = {o: evaluate(xl, o) for o in outputs}
    return F
