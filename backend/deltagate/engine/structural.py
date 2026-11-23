"""Structural checks. They read the dependency graph and the aligned changes, not the numbers,
so they fire even when no total moves.

  typed_over_formula      a cell that held a formula now holds a constant (or nothing)
  shortened_range         a formula's range covers fewer rows/columns; or a range does not cover a new row
  protected_formula_edit  a cell listed in policy.protected was edited directly
  rows_deleted_in_range   rows removed inside a range some formula uses
  lost_link               a watched output no longer depends on an input region (sheet + column header)
"""

import networkx as nx

from deltagate.engine import graph
from deltagate.engine.align import Alignment
from deltagate.engine.classify import Change
from deltagate.engine.parse import Book, Formula, addr, split
from deltagate.models import KeptPath, Policy, Region, StructuralFinding


def _ranges(formula: str, sheet: str):
    return [r for r in graph.references(formula, sheet) if not r.is_cell]


def _fewer(base, new) -> str | None:
    """'1 row fewer' if `new` is a smaller range than `base` on the same sheet."""
    if base.sheet != new.sheet or None in (base.r2, base.c2, new.r2, new.c2):
        return None
    rows = (base.r2 - base.r1) - (new.r2 - new.r1)
    cols = (base.c2 - base.c1) - (new.c2 - new.c1)
    parts = [f"{n} {unit}{'s' if n > 1 else ''} fewer" for n, unit in ((rows, "row"), (cols, "column")) if n > 0]
    return ", ".join(parts) or None


def findings(base: Book, new: Book, gb: nx.DiGraph, gn: nx.DiGraph, changes: list[Change],
             aligns: dict[str, Alignment], policy: Policy) -> list[StructuralFinding]:
    watched = [w.cell for w in policy.watched_outputs]
    gu = nx.compose(gb, gn)

    def reaches(node: str) -> str | None:
        """The watched output this node is, or feeds (first in policy order)."""
        if node in watched:
            return node
        downstream = graph.descendants(gu, node)
        return next((w for w in watched if w in downstream), None)

    out = []

    def add(kind, cell, message, output=..., **lost_link):
        out.append(StructuralFinding(kind=kind, cell=cell, message=message,
                                     output=reaches(cell) if output is ... else output, **lost_link))

    for ch in changes:
        was_formula, is_formula = isinstance(ch.base, Formula), isinstance(ch.new, Formula)
        cell = ch.new_cell or ch.base_cell

        if ch.base_cell and ch.new_cell and was_formula and not is_formula:
            now = "a typed value" if ch.new is not None else "nothing"
            add("typed_over_formula", cell, f"{cell} held the formula {ch.base} and now holds {now}")

        if was_formula and is_formula:
            sheet = split(cell)[0]
            before, after = _ranges(ch.base, sheet), _ranges(ch.new, sheet)
            if len(before) == len(after):
                for b, n in zip(before, after):
                    if fewer := _fewer(b, n):
                        add("shortened_range", cell, f"{cell}: range {b.name} became {n.name} ({fewer})")

        if (ch.base_cell or ch.new_cell) in policy.protected:
            what = ("deleted" if ch.new_cell is None else "formula replaced by a value" if was_formula and not is_formula
                    else "formula changed" if was_formula or is_formula else "value changed")
            add("protected_formula_edit", ch.base_cell or ch.new_cell,
                f"Protected cell {ch.base_cell or ch.new_cell} was edited directly ({what})")

    for sheet, al in aligns.items():
        if al.deleted:
            hit = [name for name, r in gb.graph["ranges"].items()
                   if r.sheet == sheet and any(r.r1 <= row <= r.r2 for row in al.deleted)]
            if hit:
                column = (al.key or 0) + 1
                keys = ", ".join(str(base.cells.get(addr(sheet, row, column))) for row in al.deleted[:5])
                n = len(al.deleted)
                add("rows_deleted_in_range", addr(sheet, al.deleted[0], column),
                    f"{n} row{'s' if n > 1 else ''} deleted from {sheet} ({keys}{', …' if n > 5 else ''}) "
                    f"inside {hit[0]}, a range that formulas use",
                    output=next((w for name in hit if (w := reaches(name))), None))

        # A row appended just past a range that used to cover the whole table: the range was not extended.
        last_row = base.sheets.get(sheet, (0, 0))[0]
        for row in ([] if al.shifted else al.added):
            for name, r in gn.graph["ranges"].items():
                if r.sheet != sheet or not (r.r1 < last_row <= r.r2 < row):
                    continue
                cell = next((a for c in range(r.c1, r.c2 + 1) if (a := addr(sheet, row, c)) in new.cells), None)
                if cell:
                    users = sorted(gn.successors(name), key=split)  # the formulas that use this range
                    more = f" (and {len(users) - 1} more formulas)" if len(users) > 1 else ""
                    add("shortened_range", cell, f"Range {name} in {users[0]}{more} does not cover new row {row}",
                        output=reaches(name))

    after = {w: graph.input_regions(gn, new, w) for w in watched}
    for w in policy.watched_outputs:
        before = graph.input_regions(gb, base, w.cell)
        for key in sorted(before.keys() - after[w.cell].keys(), key=str):
            sheet, column, header = before[key]
            kept = [KeptPath(output=o, path=graph.column_path(gn, new, *after[o][key][:2], o))
                    for o in watched if o != w.cell and key in after[o]]
            add("lost_link", w.cell, f"{w.label} no longer depends on {sheet}!{column}"
                + (f" ({header})" if header else ""), output=w.cell,
                region=Region(sheet=sheet, column=column, header=header),
                path_before=graph.column_path(gb, base, sheet, column, w.cell), kept=kept)
    return out
