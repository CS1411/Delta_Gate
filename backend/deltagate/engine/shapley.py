"""Exact Shapley attribution over a coalition value oracle.

Pure: no workbook, no I/O. The caller supplies v(S) = F(base with only groups in S applied) - F(base).
"""

from dataclasses import dataclass
from itertools import combinations
from math import factorial, fsum
from typing import Callable, Hashable, Sequence

MAX_GROUPS = 8  # 2^8 = 256 coalitions; merge groups before calling if there are more


@dataclass(frozen=True)
class Attribution:
    solo: float  # v({g}): what the group does on its own
    share: float  # Shapley value; shares sum to v(all groups)
    interaction: float  # share - solo


def shapley(groups: Sequence[Hashable], v: Callable[[frozenset], float]) -> dict[Hashable, Attribution]:
    """Return {group: Attribution}. Calls v exactly once per coalition (2^n calls)."""
    groups = list(groups)
    n = len(groups)
    if n > MAX_GROUPS:
        raise ValueError(f"{n} groups: exact Shapley is limited to {MAX_GROUPS}")
    if len(set(groups)) != n:
        raise ValueError("duplicate group ids")

    value = {frozenset(c): v(frozenset(c)) for k in range(n + 1) for c in combinations(groups, k)}
    if value[frozenset()] != 0:
        raise ValueError(f"v(empty) must be 0, got {value[frozenset()]!r}")

    weight = [factorial(k) * factorial(n - k - 1) / factorial(n) for k in range(n)]
    result = {}
    for g in groups:
        others = [x for x in groups if x != g]
        share = fsum(
            weight[k] * (value[frozenset(c) | {g}] - value[frozenset(c)])
            for k in range(n)
            for c in combinations(others, k)
        )
        solo = value[frozenset({g})]
        result[g] = Attribution(solo=solo, share=share, interaction=share - solo)
    return result
