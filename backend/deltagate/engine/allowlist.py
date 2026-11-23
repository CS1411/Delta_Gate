"""Supported functions. Anything not proven against saved values is unverifiable (fail closed).

The list is our pycel 1.0b30 test result (spikes/pycel_function_check.py). Not on it, by decision:
ROUND (binary half-up differs from Excel until the override passes a golden test), COUNTA and XLOOKUP
(not in pycel), TRUE/FALSE literals (LibreOffice rewrites them as TRUE()/FALSE(); no golden test yet),
and by design NOW TODAY RAND OFFSET INDIRECT LET and every dynamic-array function.
"""

import re

from deltagate.engine.parse import parse_ref, tokens

SUPPORTED = frozenset(
    "SUM MIN MAX AVERAGE COUNT IF AND OR NOT ABS INT MOD SUMIF SUMIFS COUNTIF SUMPRODUCT "
    "IFERROR VLOOKUP INDEX MATCH LEN ROUNDUP".split()
)
_PREFIX = re.compile(r"^(?:_xlfn\.|_xlws\.)+", re.IGNORECASE)  # how newer functions are stored in the file


def _function(token_value: str) -> str:
    return _PREFIX.sub("", token_value[:-1]).upper()  # '_xlfn.XLOOKUP(' -> 'XLOOKUP'


def functions(formula: str) -> set[str]:
    return {_function(value) for value, kind, subtype in tokens(formula) if (kind, subtype) == ("FUNC", "OPEN")}


def unverifiable_reason(formula: str) -> str | None:
    """Why the engine must not compute this formula, or None if every part of it is supported."""
    for value, kind, subtype in tokens(formula):
        if (kind, subtype) == ("FUNC", "OPEN"):
            if _function(value) not in SUPPORTED:
                return _function(value)
        elif kind == "OPERAND":
            if subtype == "LOGICAL":
                return "TRUE/FALSE literal"
            if subtype == "ERROR":
                return value
            if subtype == "RANGE" and parse_ref(value, "") is None:
                return "external link" if "[" in value and "]" in value and "!" in value \
                    else f"unsupported reference {value}"
    return None
