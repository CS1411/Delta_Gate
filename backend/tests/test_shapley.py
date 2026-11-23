import math
from itertools import combinations

import pytest
from hypothesis import given, strategies as st

from deltagate.engine.shapley import shapley

money = st.floats(min_value=-1e7, max_value=1e7, allow_nan=False, allow_infinity=False)


def subsets(groups):
    return [frozenset(c) for k in range(len(groups) + 1) for c in combinations(groups, k)]


def test_spec_worked_example():
    # dues = rate * area * (1 + late%), area 1,000. Base 3.0 / 2% -> new 3.2 / 5%. Spec section 3.3.
    def dues(applied):
        rate = 3.2 if "rate" in applied else 3.0
        late = 0.05 if "late" in applied else 0.02
        return rate * 1000 * (1 + late)

    base = dues(frozenset())
    result = shapley(["rate", "late"], lambda s: dues(s) - base)

    assert result["rate"].solo == pytest.approx(204, abs=1e-9)
    assert result["late"].solo == pytest.approx(90, abs=1e-9)
    assert result["rate"].share == pytest.approx(207, abs=1e-9)
    assert result["late"].share == pytest.approx(93, abs=1e-9)
    assert result["rate"].interaction == pytest.approx(3, abs=1e-9)
    assert result["late"].interaction == pytest.approx(3, abs=1e-9)
    assert result["rate"].share + result["late"].share == pytest.approx(300, abs=1e-9)


def test_additive_groups_have_no_interaction():
    # The demo shape: +38,000 (data) and +4,000 (logic) are independent, the structural group moves nothing.
    effect = {"expense": 38000, "late_fee": 4000, "typed_over": 0}
    result = shapley(list(effect), lambda s: sum(effect[g] for g in s))
    assert {g: a.share for g, a in result.items()} == effect
    assert all(a.interaction == 0 for a in result.values())


def test_oracle_called_once_per_coalition():
    # Each call is a workbook recalculation, so 2^n calls and not one more.
    calls = []
    shapley(list("abcd"), lambda s: calls.append(s) or len(s))
    assert len(calls) == 16 and len(set(calls)) == 16


def test_nonzero_empty_coalition_is_rejected():
    with pytest.raises(ValueError):
        shapley(["a"], lambda s: 5.0)


def test_more_than_eight_groups_is_rejected():
    with pytest.raises(ValueError):
        shapley(list(range(9)), lambda s: 0.0)


def test_no_groups():
    assert shapley([], lambda s: 0.0) == {}


@given(st.data())
def test_shares_sum_to_delta(data):
    groups = list(range(data.draw(st.integers(1, 6))))
    table = {s: (data.draw(money) if s else 0.0) for s in subsets(groups)}

    result = shapley(groups, table.__getitem__)

    delta = table[frozenset(groups)]
    scale = max(1.0, max(abs(x) for x in table.values()))
    assert math.isclose(sum(a.share for a in result.values()), delta, rel_tol=1e-9, abs_tol=1e-9 * scale)
    for g, a in result.items():
        assert a.solo == table[frozenset({g})]
        assert math.isclose(a.solo + a.interaction, a.share, rel_tol=1e-9, abs_tol=1e-9 * scale)


@given(st.data())
def test_symmetric_groups_get_equal_shares(data):
    # "x" and "y" are interchangeable: v depends only on how many of them are in S.
    others = list(range(data.draw(st.integers(0, 4))))
    table = {
        (twins, s): (data.draw(money) if (twins or s) else 0.0)
        for twins in (0, 1, 2)
        for s in subsets(others)
    }

    def v(s):
        return table[(len(s & {"x", "y"}), s - {"x", "y"})]

    result = shapley(["x", "y", *others], v)

    scale = max(1.0, max(abs(x) for x in table.values()))
    assert math.isclose(result["x"].share, result["y"].share, rel_tol=1e-9, abs_tol=1e-9 * scale)
