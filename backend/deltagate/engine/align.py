"""Row alignment between two versions of a sheet: by key column, else LCS over row fingerprints."""

from dataclasses import dataclass
from difflib import SequenceMatcher

from deltagate.engine.parse import Formula

KEY_HEADERS = ("flat no", "flat", "invoice no", "id")  # in priority order


@dataclass
class Alignment:
    pairs: list[tuple[int, int]]  # (base row, new row) for rows present in both
    deleted: list[int]  # base rows with no partner
    added: list[int]  # new rows with no partner
    key: int | None = None  # index of the key column, if one was used

    @property
    def shifted(self) -> bool:
        """True when some row sits at a different position: rows were inserted, deleted or moved."""
        return any(b != n for b, n in self.pairs)


def key_column(headers: list) -> int | None:
    names = [str(h).strip().lower().rstrip(".") if h is not None else "" for h in headers]
    return next((names.index(k) for k in KEY_HEADERS if k in names), None)


def _unique(rows, key) -> bool:
    keys = [r[key] for r in rows if r[key] is not None]
    return bool(keys) and len(keys) == len(set(keys))


def _fingerprint(row) -> tuple:
    # Formula text moves with its row (relative references), so only "there is a formula here" is stable.
    return tuple("\0formula" if isinstance(v, Formula) else v for v in row)


def align_rows(base: list[tuple], new: list[tuple], key: int | None = None) -> Alignment:
    """Rows are tuples of cell contents; indices in the result are positions in the two lists."""
    if key is not None and _unique(base, key) and _unique(new, key):
        where = {row[key]: j for j, row in enumerate(new) if row[key] is not None}
        pairs = [(i, where[row[key]]) for i, row in enumerate(base) if row[key] in where]
    else:
        key = None
        # ponytail: difflib is quadratic on very different sheets; swap for a hash-anchored diff if a
        # real workbook with no key column and >10k rows shows up.
        matcher = SequenceMatcher(None, [_fingerprint(r) for r in base], [_fingerprint(r) for r in new], autojunk=False)
        pairs = [pair for tag, i1, i2, j1, j2 in matcher.get_opcodes() if tag in ("equal", "replace")
                 for pair in zip(range(i1, i2), range(j1, j2))]  # replace = edited in place: pair in order

    left_base = set(range(len(base))) - {b for b, _ in pairs}
    left_new = set(range(len(new))) - {n for _, n in pairs}
    if all(b == n for b, n in pairs):  # nothing moved: a leftover at the same position is an in-place edit
        in_place = left_base & left_new
        pairs = sorted(pairs + [(i, i) for i in in_place])
        left_base, left_new = left_base - in_place, left_new - in_place
    blank = lambda row: all(v is None for v in row)  # noqa: E731
    return Alignment(
        pairs=pairs, key=key,
        deleted=sorted(i for i in left_base if not blank(base[i])),
        added=sorted(j for j in left_new if not blank(new[j])),
    )
