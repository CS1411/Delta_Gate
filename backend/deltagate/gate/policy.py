"""Gate rules, as one pure function. Decisions are per change group.

  1. can't verify      the group edits or feeds a cell the engine must not compute   -> CANT_VERIFY_HELD
  2. structural        any structural finding on the group's cells (a direct edit to a protected cell
                       is one of them); a finding on no group's cell holds every group -> HELD
  3. impact limit      |solo effect| on a watched output > impact_limit_abs            -> HELD
  4. drift budget      session drift + the group's largest |solo effect| > drift_budget -> HELD
     workbook drift   same, summed over every session on the workbook in the last drift_window_hours
                       (when workbook_drift_budget is set), so opening a new session cannot reset it
  5. combined effect   all passing groups applied together move an output past the limit -> all HELD

Every number in a reason is an engine value or a policy value. The sentences are templates.
"""

from collections.abc import Callable

from deltagate.engine.classify import ChangeGroup
from deltagate.models import GroupDecision, Impact, Policy, StructuralFinding

COMBINED = "Combined effect of passing groups exceeds limit"


def inr(value: float | None, signed: bool = False) -> str:
    """Indian digit grouping: 286000 -> ₹2,86,000."""
    if value is None:
        return "unknown"
    sign = "-" if value < 0 else "+" if signed and value > 0 else ""
    whole, paise = divmod(round(abs(value) * 100), 100)
    digits = str(whole)
    head, tail = digits[:-3], digits[-3:]
    while head:
        head, tail = head[:-2], f"{head[-2:]},{tail}"
    return f"{sign}₹{tail}" + (f".{paise:02d}" if paise else "")


def decide(groups: list[ChangeGroup], solos: dict[str, dict[str, float | None]], findings: list[StructuralFinding],
           blocked: dict[str, str], policy: Policy, drift: float,
           joint: Callable[[list[str]], dict[str, float | None]],
           window_drift: float = 0) -> tuple[list[GroupDecision], float]:
    """(one decision per group, the session's drift afterwards).

    solos: group id -> {watched output: solo effect, None if the engine has no number}.
    blocked: group id -> why it cannot be verified. joint(ids): the effect of those groups applied together.
    """
    labels = {w.cell: w.label for w in policy.watched_outputs}
    limit, start = policy.impact_limit_abs, drift
    stray = [f for f in findings if not any(f.cell in g.cells for g in groups)]
    out = []
    for g in groups:
        solo = solos[g.group_id]
        unknown = next((w for w, d in solo.items() if d is None), None)
        if g.group_id in blocked or unknown:
            why = blocked.get(g.group_id) or f"the engine could not compute {unknown}"
            out.append(GroupDecision(group_id=g.group_id, status="CANT_VERIFY_HELD", reasons=[f"Can't verify: {why}"], impacts=[]))
            continue
        reasons = [f.message for f in findings if f.cell in g.cells or f in stray]
        reasons += [f"Impact on {w} ({labels[w]}) is {inr(d, True)}, over the limit of {inr(limit)}"
                    for w, d in solo.items() if abs(d) > limit]
        size = max((abs(d) for d in solo.values()), default=0)  # one edit moves several outputs: count it once
        if not reasons and drift + size > policy.drift_budget:
            reasons.append(f"Session drift would reach {inr(drift + size)}, over the budget of {inr(policy.drift_budget)}")
        wide = policy.workbook_drift_budget
        if not reasons and wide is not None and window_drift + (drift - start) + size > wide:
            reasons.append(f"Workbook drift over the last {policy.drift_window_hours:g} h would reach "
                           f"{inr(window_drift + (drift - start) + size)}, over the budget of {inr(wide)}")
        if not reasons:
            drift += size
        out.append(GroupDecision(group_id=g.group_id, status="HELD" if reasons else "PASS", reasons=reasons,
                                 impacts=[Impact(cell=w, delta=d) for w, d in solo.items()]))

    passing = [d for d in out if d.status == "PASS"]
    if len(passing) > 1:  # each is fine alone; together they are what would actually be committed
        together = joint([d.group_id for d in passing])
        over = [f"Together they move {w} ({labels[w]}) by {inr(d, True)}, over the limit of {inr(limit)}" if d is not None
                else f"Together their effect on {w} ({labels[w]}) cannot be computed"
                for w, d in together.items() if d is None or abs(d) > limit]
        if over:
            for d in passing:
                d.status, d.reasons = "HELD", [COMBINED, *over]
            drift = start
    return out, drift
