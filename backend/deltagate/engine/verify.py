"""The check against saved values: recompute the base with the engine and compare with what the app saved."""

import math

from deltagate.engine import recalc
from deltagate.engine.parse import Book, Formula

REL_TOL = 1e-9


def close(engine, saved) -> bool:
    if recalc.is_number(engine) and recalc.is_number(saved):
        return math.isclose(engine, saved, rel_tol=REL_TOL, abs_tol=1e-12)
    empty = (None, "")  # an empty-text result is saved as nothing
    return type(engine) is type(saved) and engine == saved or (engine in empty and saved in empty)


def verify(base: Book, skip: set[str]) -> tuple[int, list[str], list[str]]:
    """(matched, mismatched, engine errors) over the base formula cells not in `skip`.

    A file with no saved values has nothing to verify against: 0 matched, and the banner says so.
    """
    if base.saved_by == "none":
        return 0, [], []
    todo = [a for a, content in base.cells.items() if isinstance(content, Formula) and a not in skip]
    values = recalc.recompute(base.path, todo)
    errors = [a for a in todo if isinstance(values[a], recalc.EngineError)]
    mismatched = [a for a in todo if a not in errors and not close(values[a], base.cached[a])]
    return len(todo) - len(errors) - len(mismatched), mismatched, errors
