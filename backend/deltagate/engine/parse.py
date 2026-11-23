"""Read a workbook: cell contents (formulas as text), the saved values, and which app saved them.

Also the cell-address helpers every other engine module uses. Addresses are "Sheet!A1" (never quoted).
"""

import hashlib
import re
import zipfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from openpyxl import load_workbook
from openpyxl.formula import Tokenizer
from openpyxl.utils import column_index_from_string, get_column_letter


class Formula(str):
    """Formula text such as '=F2*0.04'. A subclass so a text cell '=x' is never mistaken for a formula."""


def same(a, b) -> bool:
    return isinstance(a, Formula) == isinstance(b, Formula) and a == b


# --- addresses and references -------------------------------------------------------------


def addr(sheet: str, row: int, col: int) -> str:
    return f"{sheet}!{get_column_letter(col)}{row}"


@lru_cache(maxsize=None)
def split(address: str) -> tuple[str, int, int]:
    """'Sheet!C5' -> ('Sheet', 5, 3)."""
    sheet, coord = address.rsplit("!", 1)
    letters = coord.rstrip("0123456789")
    return sheet, int(coord[len(letters):]), column_index_from_string(letters)


class Ref(NamedTuple):
    """A cell or range reference. r2 / c2 are None for whole-column / whole-row references."""

    sheet: str
    r1: int
    c1: int
    r2: int | None
    c2: int | None

    @property
    def is_cell(self) -> bool:
        return (self.r1, self.c1) == (self.r2, self.c2)

    @property
    def name(self) -> str:
        if self.is_cell:
            return addr(self.sheet, self.r1, self.c1)
        if self.r2 is None:
            return f"{self.sheet}!{get_column_letter(self.c1)}:{get_column_letter(self.c2)}"
        if self.c2 is None:
            return f"{self.sheet}!{self.r1}:{self.r2}"
        return f"{addr(self.sheet, self.r1, self.c1)}:{get_column_letter(self.c2)}{self.r2}"


_SHEET = r"(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!)?"
_CELL = r"\$?([A-Za-z]{1,3})\$?([0-9]{1,7})"
_RANGE = re.compile(rf"^{_SHEET}{_CELL}(?::{_CELL})?$")
_COLUMNS = re.compile(rf"^{_SHEET}\$?([A-Za-z]{{1,3}}):\$?([A-Za-z]{{1,3}})$")
_ROWS = re.compile(rf"^{_SHEET}\$?([0-9]{{1,7}}):\$?([0-9]{{1,7}})$")


def parse_ref(text: str, sheet: str) -> Ref | None:
    """'Payments!$C$2:$C$61' -> Ref. None for anything else (named range, table, external link, 3D)."""
    if m := _RANGE.match(text):
        quoted, plain, c1, r1, c2, r2 = m.groups()
        c1, r1 = column_index_from_string(c1.upper()), int(r1)
        c2, r2 = (column_index_from_string(c2.upper()), int(r2)) if c2 else (c1, r1)
        rows, cols = sorted((r1, r2)), sorted((c1, c2))
        return Ref(_sheet(quoted, plain, sheet), rows[0], cols[0], rows[1], cols[1])
    if m := _COLUMNS.match(text):
        quoted, plain, c1, c2 = m.groups()
        cols = sorted(column_index_from_string(c.upper()) for c in (c1, c2))
        return Ref(_sheet(quoted, plain, sheet), 1, cols[0], None, cols[1])
    if m := _ROWS.match(text):
        quoted, plain, r1, r2 = m.groups()
        rows = sorted((int(r1), int(r2)))
        return Ref(_sheet(quoted, plain, sheet), rows[0], 1, rows[1], None)
    return None


def _sheet(quoted, plain, default):
    return quoted.replace("''", "'") if quoted else plain or default


@lru_cache(maxsize=None)
def tokens(formula: str) -> tuple:
    """Formula tokens as (value, type, subtype). openpyxl's tokenizer knows text from function calls."""
    return tuple((t.value, t.type, t.subtype) for t in Tokenizer(formula).items)


# --- workbook -----------------------------------------------------------------------------


@dataclass
class Book:
    path: Path
    sha256: str
    app: str  # docProps/app.xml Application, verbatim
    saved_by: str  # "Microsoft Excel" | "LibreOffice" | "none"
    sheets: dict[str, tuple[int, int]]  # name -> (max_row, max_col), in workbook order
    cells: dict[str, object]  # non-empty cells: Formula or constant
    cached: dict[str, object]  # formula cells only: the saved value (None if the file has none)
    unsupported: dict[str, str]  # formula cells openpyxl cannot hand over as plain text, with the reason
    blockers: list[str]  # workbook-level reasons nothing can be verified (macros, pivot tables)

    def header(self, sheet: str, col: int) -> str | None:
        # ponytail: the header is whatever text sits in row 1; detect header rows when a real file needs it
        value = self.cells.get(addr(sheet, 1, col))
        return value if isinstance(value, str) and not isinstance(value, Formula) else None


def saved_by(app: str, has_cached: bool) -> str:
    """Honest label. Exact match only: openpyxl writes 'Microsoft Excel Compatible / Openpyxl 3.1.5'."""
    if not has_cached:
        return "none"
    if app == "Microsoft Excel":
        return "Microsoft Excel"
    if app.startswith("LibreOffice/"):
        return "LibreOffice"
    return "none"


def parse(path: Path | str) -> Book:
    path = Path(path)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        found = re.search(r"<Application>(.*?)</Application>", z.read("docProps/app.xml").decode("utf-8", "replace")) \
            if "docProps/app.xml" in names else None
    app = found.group(1) if found else ""
    blockers = []
    if path.suffix.lower() == ".xlsm" or any(n.endswith("vbaProject.bin") for n in names):
        blockers.append("macros (VBA)")
    if any(n.startswith("xl/pivotTables/") for n in names):
        blockers.append("pivot table")

    with_formulas, with_values = load_workbook(path), load_workbook(path, data_only=True)
    sheets, cells, cached, unsupported = {}, {}, {}, {}
    for ws in with_formulas.worksheets:
        values = with_values[ws.title]
        sheets[ws.title] = (ws.max_row, ws.max_column)
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                address = f"{ws.title}!{cell.coordinate}"
                if cell.data_type != "f":
                    cells[address] = cell.value
                    continue
                if isinstance(cell.value, str):
                    cells[address] = Formula(cell.value)
                else:  # ArrayFormula / DataTableFormula objects
                    cells[address] = Formula(getattr(cell.value, "text", None) or "=")
                    unsupported[address] = "array formula"
                cached[address] = values[cell.coordinate].value

    return Book(
        path=path, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), app=app,
        saved_by=saved_by(app, any(v is not None for v in cached.values())),
        sheets=sheets, cells=cells, cached=cached, unsupported=unsupported, blockers=blockers,
    )
