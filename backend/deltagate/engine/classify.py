"""Raw cell differences -> at most 8 change groups (data / logic / structural).

Two views of the same difference:
  raw      {address: (base content, new content)}: what to apply to the base to get the new file.
           Groups are built from this, so base + all groups == new, always.
  changes  the same edits with rows aligned (a row that only moved is not a change). Structural
           checks read these.
"""

from dataclasses import dataclass

from openpyxl.formula.translate import Translator
from openpyxl.utils import get_column_letter

from deltagate.engine.align import Alignment, align_rows, key_column
from deltagate.engine.parse import Book, Formula, addr, same, split
from deltagate.engine.recalc import needs_recompile
from deltagate.engine.shapley import MAX_GROUPS

MAX_FORMULA_GROUPS = 3  # one compiled model per subset of formula groups: 2^3 = 8 compiles at most
_LEVELS = (lambda k: k, lambda k: (k[0], k[2]), lambda k: (k[2],))  # finest first; the last gives <= 3 groups


@dataclass
class Change:
    base_cell: str | None  # None: the row is new
    new_cell: str | None  # None: the row was deleted
    base: object  # a formula is rewritten for the new position when its row moved
    new: object


@dataclass
class ChangeGroup:
    group_id: str
    label: str
    type: str  # data | logic | structural
    cells: dict[str, tuple[object, object]]  # address -> (base content, new content)


def _rows(book: Book, sheet: str, width: int) -> list[tuple]:
    """Rows 2..max_row as tuples (row 1 is the header)."""
    max_row = book.sheets.get(sheet, (0, 0))[0]
    return [tuple(book.cells.get(addr(sheet, r, c)) for c in range(1, width + 1)) for r in range(2, max_row + 1)]


def _align(base: Book, new: Book, sheet: str) -> Alignment:
    width = max(base.sheets.get(sheet, (0, 0))[1], new.sheets.get(sheet, (0, 0))[1])
    headers = [base.cells.get(addr(sheet, 1, c)) for c in range(1, width + 1)]
    a = align_rows(_rows(base, sheet, width), _rows(new, sheet, width), key_column(headers))
    return Alignment([(b + 2, n + 2) for b, n in a.pairs], [b + 2 for b in a.deleted], [n + 2 for n in a.added], a.key)


def diff(base: Book, new: Book) -> tuple[dict, list[Change], dict[str, Alignment]]:
    order = {name: i for i, name in enumerate([*base.sheets, *(s for s in new.sheets if s not in base.sheets)])}
    position = lambda a: (order[split(a)[0]], *split(a)[1:])  # noqa: E731
    raw = {a: (base.cells.get(a), new.cells.get(a)) for a in sorted(base.cells.keys() | new.cells.keys(), key=position)
           if not same(base.cells.get(a), new.cells.get(a))}
    aligns = {sheet: _align(base, new, sheet) for sheet in dict.fromkeys(split(a)[0] for a in raw)}

    changes = []
    for a, (b, n) in raw.items():
        sheet, row, _ = split(a)
        al = aligns[sheet]
        if row == 1 or not al.shifted:
            changes.append(Change(None, a, None, n) if row in al.added
                           else Change(a, None, b, None) if row in al.deleted else Change(a, a, b, n))
    for sheet, al in aligns.items():
        if not al.shifted:
            continue
        width = max(base.sheets[sheet][1], new.sheets[sheet][1])
        for base_row, new_row in al.pairs:
            for col in range(1, width + 1):
                at_base, at_new = addr(sheet, base_row, col), addr(sheet, new_row, col)
                b, n = base.cells.get(at_base), new.cells.get(at_new)
                if base_row != new_row and isinstance(b, Formula) and isinstance(n, Formula):
                    coordinate = lambda a: a.rsplit("!", 1)[1]  # noqa: E731
                    b = Formula(Translator(b, origin=coordinate(at_base)).translate_formula(coordinate(at_new)))
                if not same(b, n):
                    changes.append(Change(at_base, at_new, b, n))
        changes += [Change(a, None, c, None) for a, c in base.cells.items()
                    if split(a)[0] == sheet and split(a)[1] in al.deleted]
        changes += [Change(None, a, None, c) for a, c in new.cells.items()
                    if split(a)[0] == sheet and split(a)[1] in al.added]
    return raw, changes, aligns


def _kind(b, n) -> str:
    if isinstance(b, Formula) and not isinstance(n, Formula):
        return "structural"  # typed over (or removed): always applied by recompiling, never by set_value
    return "logic" if isinstance(n, Formula) else "data"


def _key(a: str, b, n, aligns) -> tuple[str, str, str]:
    """Finest grouping: (sheet, column or row marker, type)."""
    sheet, row, col = split(a)
    al = aligns[sheet]
    if al.shifted and row > 1:
        return sheet, "~", "structural"
    if row in al.added:
        return sheet, "+", "data"
    if row in al.deleted:
        return sheet, "-", "structural"
    return sheet, get_column_letter(col), _kind(b, n)


_NOUN = {"data": ("Value changed", "values changed"), "logic": ("Formula changed", "formulas changed"),
         "structural": ("Formula replaced by a value", "formulas replaced by values")}


def _label(key: tuple, cells: dict, base: Book) -> str:
    n, kind = len(cells), key[-1]
    changes = "change" if n == 1 else "changes"
    if len(key) == 1:
        return f"{n} {kind} {changes}"
    if len(key) == 2:
        return f"{n} {kind} {changes} in {key[0]}"
    sheet, marker, _ = key
    if marker.startswith("→"):
        return f"Sheet {sheet} renamed to {marker[1:]}"
    rows = len({split(a)[1] for a in cells})
    if marker == "~":
        return f"Rows inserted, deleted or moved in {sheet}"
    if marker == "-":
        return f"{rows} row{'s' if rows > 1 else ''} deleted in {sheet}"
    if marker == "+":
        name = next((v for _, v in cells.values() if isinstance(v, str) and not isinstance(v, Formula)), None)
        return f"New row in {sheet}" + (f": {name}" if name else "") if rows == 1 else f"{rows} new rows in {sheet}"
    if n == 1:
        return f"{_NOUN[kind][0]}: {next(iter(cells))}"
    header = base.header(sheet, split(next(iter(cells)))[2])
    return f"{n} {_NOUN[kind][1]} in {sheet}!{marker}" + (f" ({header})" if header else "")


def renamed_sheets(base: Book, new: Book) -> dict[str, str]:
    """{old name: new name} for sheets whose only change is the name: same constants, formulas in the same places.

    ponytail: exact content match only; a sheet renamed and edited in one go still reads as deleted + added.
    """
    def content(book: Book, sheet: str) -> dict:
        return {split(a)[1:]: "\0formula" if isinstance(v, Formula) else v
                for a, v in book.cells.items() if split(a)[0] == sheet}

    came = {s: content(new, s) for s in new.sheets if s not in base.sheets}
    out: dict[str, str] = {}
    for sheet in (s for s in base.sheets if s not in new.sheets):
        before = content(base, sheet)
        match = next((s for s, c in came.items() if c == before and s not in out.values()), None)
        if match:
            out[sheet] = match
    return out


def classify(base: Book, new: Book) -> tuple[list[ChangeGroup], list[Change], dict[str, Alignment]]:
    raw, changes, aligns = diff(base, new)
    keys = {a: _key(a, b, n, aligns) for a, (b, n) in raw.items()}
    renames = renamed_sheets(base, new)
    old_name = {new_name: old for old, new_name in renames.items()}
    for a in keys:  # a renamed sheet is one structural group, not its cells deleted and added again
        sheet = split(a)[0]
        if (old := sheet if sheet in renames else old_name.get(sheet)) is not None:
            keys[a] = (old, "→" + renames[old], "structural")

    def bucket(level_of) -> dict[tuple, dict]:
        buckets: dict[tuple, dict] = {}
        for a, pair in raw.items():
            buckets.setdefault(_LEVELS[level_of(a)](keys[a]), {})[a] = pair
        return buckets

    # Too many groups for exact Shapley: merge by sheet + type, then by type alone (never more than 3).
    level = next(i for i in range(len(_LEVELS)) if len(bucket(lambda a: i)) <= MAX_GROUPS or i == len(_LEVELS) - 1)
    buckets = bucket(lambda a: level)
    # Too many formula groups for the compile budget: coarsen only those, so value groups keep their detail.
    # Keys at different levels have different lengths, so merged formula groups never swallow a value group.
    formula = {a for cells in buckets.values() if needs_recompile(cells) for a in cells}
    for coarse in range(level + 1, len(_LEVELS)):
        if sum(map(needs_recompile, buckets.values())) <= MAX_FORMULA_GROUPS:
            break
        buckets = bucket(lambda a: coarse if a in formula else level)
    groups = [ChangeGroup(f"g{i}", _label(key, cells, base), key[-1], cells)
              for i, (key, cells) in enumerate(buckets.items(), start=1)]
    return groups, changes, aligns
