"""Dependency graph. Nodes are cells ('Sheet!A1') and ranges ('Sheet!A2:E61'); edges run precedent -> dependent.

A range is one node fed by each of its cells, so 60 formulas over the same range share one expansion.
"""

import networkx as nx
from openpyxl.utils import get_column_letter

from deltagate.engine.parse import Book, Formula, Ref, addr, parse_ref, split, tokens

_MAX_AREA = 1_000_000


def references(formula: str, sheet: str) -> list[Ref]:
    """Cell and range references in formula order. Unparseable ones are skipped: the allowlist flags them."""
    refs = (parse_ref(v, sheet) for v, kind, subtype in tokens(formula) if (kind, subtype) == ("OPERAND", "RANGE"))
    return [r for r in refs if r is not None]


def _clip(ref: Ref, book: Book) -> Ref:
    """Whole-column / whole-row and absurdly large ranges are cut to the sheet's used area."""
    max_row, max_col = book.sheets.get(ref.sheet, (0, 0))
    r2 = max_row if ref.r2 is None else ref.r2
    c2 = max_col if ref.c2 is None else ref.c2
    if (r2 - ref.r1 + 1) * (c2 - ref.c1 + 1) > _MAX_AREA:
        r2, c2 = min(r2, max_row), min(c2, max_col)
    return ref._replace(r2=r2, c2=c2)


def build(book: Book) -> nx.DiGraph:
    g = nx.DiGraph()
    g.add_nodes_from(book.cells)
    ranges: dict[str, Ref] = {}  # range node -> its (clipped) rectangle
    for cell, content in book.cells.items():
        if not isinstance(content, Formula):
            continue
        for ref in references(content, split(cell)[0]):
            if ref.name not in ranges and not ref.is_cell:
                ranges[ref.name] = area = _clip(ref, book)
                g.add_edges_from(
                    (addr(area.sheet, r, c), ref.name)
                    for r in range(area.r1, area.r2 + 1) for c in range(area.c1, area.c2 + 1)
                )
            g.add_edge(ref.name, cell)
    g.graph["ranges"] = ranges
    return g


def is_cell(node: str) -> bool:
    return ":" not in node  # Excel forbids ':' in sheet names


def ancestors(g: nx.DiGraph, node: str) -> set[str]:
    return nx.ancestors(g, node) if node in g else set()


def descendants(g: nx.DiGraph, node: str) -> set[str]:
    return nx.descendants(g, node) if node in g else set()


def input_regions(g: nx.DiGraph, book: Book, output: str) -> dict[tuple, tuple[str, str, str | None]]:
    """Input regions an output transitively depends on: {(sheet, header or column): (sheet, column, header)}.

    An input is any non-formula cell upstream. Same workbook only, no named ranges (hackathon scope).
    """
    regions = {}
    for node in ancestors(g, output):
        if not is_cell(node) or isinstance(book.cells.get(node), Formula):
            continue
        sheet, _, col = split(node)
        column = get_column_letter(col)
        header = book.header(sheet, col)
        regions[(sheet, header or column)] = (sheet, column, header)
    return regions
