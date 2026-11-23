"""A Check: compare two versions of a workbook -> CheckResult.

Order of work: parse both -> dependency graphs -> change groups -> find what cannot be verified ->
verify the base against its saved values -> evaluate every coalition of groups -> exact Shapley
per watched output -> structural checks.

Two stages, so the gate can decide before the full attribution exists: analyse() does everything
up to the coalitions; delta() evaluates single coalitions (the gate's solo and joint effects);
result() evaluates all of them and builds the CheckResult. Compiled models are cached on the
analysis, so result() after delta() compiles nothing twice.

Fail closed. A cell is unverifiable if its formula is not on the allowlist, if the engine's value
for it disagrees with the saved value, or if it depends on such a cell. Unverifiable cells never
move in a coalition: they are pinned at their saved base value, so whatever flows through them
lands in delta_unverified, not in anyone's share.
"""

import math
import uuid
from dataclasses import dataclass, field, replace
from pathlib import Path

import networkx as nx

from deltagate.engine import allowlist, graph, recalc, structural
from deltagate.engine.classify import ChangeGroup, classify
from deltagate.engine.parse import Book, Formula, parse, split
from deltagate.engine.shapley import shapley
from deltagate.engine.verify import verify
from deltagate.models import (
    Attribution, CheckResult, Group, Output, Policy, StructuralFinding, Unverifiable, Verification,
)

DEPENDS = "depends on an unverifiable cell"


@dataclass
class Run:
    """One set of watched outputs evaluated together, with the cells pinned for them."""

    outputs: list[str]
    pins: dict[str, object]
    groups: dict[str, dict]  # group id -> its live (unpinned) cells; only groups that can reach an output
    models: dict = field(default_factory=dict)  # formula groups applied -> compiled model
    values: dict = field(default_factory=dict)  # coalition -> {output: value}
    error: str | None = None


@dataclass
class Analysis:
    base: Book
    new: Book
    gu: nx.DiGraph  # base and new graphs together
    groups: list[ChangeGroup]
    reasons: dict[str, str]  # unverifiable roots -> why
    tainted: set[str]  # roots and everything downstream
    matched: int
    mismatched: list[str]
    base_formulas: int
    runs: list[Run]  # runs[0]: the verifiable outputs, nothing pinned
    excluded: dict[str, set]  # output -> groups whose whole effect on it runs through unverifiable cells
    failed: dict[str, str]  # output -> why nothing about it is verified
    structural: list[StructuralFinding]


def _saved(book: Book, cell: str):
    """What the file itself says the cell's value is: the constant, or the saved value of a formula."""
    content = book.cells.get(cell)
    value = book.cached.get(cell) if isinstance(content, Formula) else content
    return value if recalc.is_number(value) else None


def _taint(g: nx.DiGraph, roots) -> set[str]:
    return set(roots).union(*(graph.descendants(g, r) for r in roots))


def analyse(base_path: Path | str, new_path: Path | str, policy: Policy,
            base_saved: Path | str | None = None) -> Analysis:
    """base_saved: a copy of the base file that carries its saved values (the store's LibreOffice sidecar)."""
    base, new = parse(base_path), parse(new_path)
    if base_saved:
        side = parse(base_saved)
        base = replace(base, cached={a: side.cached.get(a) for a in base.cached}, saved_by=side.saved_by)
    gb, gn = graph.build(base), graph.build(new)
    gu = nx.compose(gb, gn)  # every coalition's dependencies are a subset of this
    groups, changes, aligns = classify(base, new)

    # --- what the engine must not compute ---------------------------------------------------
    def unsupported(book: Book) -> dict[str, str]:
        found = {}
        for cell, content in book.cells.items():
            if isinstance(content, Formula):
                reason = (book.blockers[0] if book.blockers else None) or book.unsupported.get(cell) \
                    or allowlist.unverifiable_reason(content)
                if reason:
                    found[cell] = reason
        return found

    in_base = unsupported(base)
    reasons: dict[str, str] = unsupported(new) | in_base

    # --- the check against saved values (base only) ---------------------------------------------
    matched, mismatched, errors = verify(base, skip=_taint(gb, in_base))
    reasons |= {c: "does not match the saved value" for c in mismatched} | {c: "engine error" for c in errors}
    tainted = _taint(gu, reasons)

    # --- which outputs run together, and which groups can reach them ------------------------------
    watched = [w.cell for w in policy.watched_outputs]
    upstream = {w: graph.ancestors(gu, w) | {w} for w in watched}
    excluded: dict[str, set] = {w: set() for w in watched}
    failed: dict[str, str] = {}

    runs = [Run([w for w in watched if w not in tainted], {}, {})]  # clean outputs share one run, nothing pinned
    for w in watched:
        if w in reasons:
            failed[w] = reasons[w]
        elif w in tainted:
            pinned = {c for c in (tainted - {w}) & upstream[w] if graph.is_cell(c)}
            pins = {c: base.cached.get(c) if isinstance(base.cells.get(c), Formula) else base.cells.get(c)
                    for c in pinned}
            if any(isinstance(base.cells.get(c), Formula) and v is None for c, v in pins.items()):
                failed[w] = DEPENDS  # no saved base value to hold an unverifiable input at: verify nothing
            else:
                runs.append(Run([w], pins, {}))

    for run in runs:
        for g in groups:
            live = {c: pair for c, pair in g.cells.items() if c not in run.pins}
            for w in run.outputs:
                if any(c in upstream[w] for c in g.cells) and not any(c in upstream[w] for c in live):
                    excluded[w].add(g.group_id)  # everything it does to w runs through unverifiable cells
            if any(c in upstream[w] for c in live for w in run.outputs):
                run.groups[g.group_id] = live

    return Analysis(
        base=base, new=new, gu=gu, groups=groups, reasons=reasons, tainted=tainted, matched=matched,
        mismatched=mismatched, base_formulas=sum(isinstance(c, Formula) for c in base.cells.values()),
        runs=runs, excluded=excluded, failed=failed,
        structural=structural.findings(base, new, gb, gn, changes, aligns, policy),
    )


def _evaluate(a: Analysis, run: Run, only: list[frozenset] | None = None) -> None:
    """Fill run.values for the coalitions asked for (default: all). An engine failure is kept on the run."""
    wanted = recalc.subsets(list(run.groups)) if only is None else only
    missing = [s for s in dict.fromkeys(wanted) if s not in run.values]
    if not missing or run.error or not run.outputs:
        return
    try:
        run.values |= recalc.coalitions(a.base.path, run.groups, run.pins, run.outputs, missing, run.models)
    except Exception as error:  # the engine could not even build a model: hold, do not guess
        run.error = f"engine error ({type(error).__name__})"


def delta(a: Analysis, group_ids) -> dict[str, float | None]:
    """Engine delta on each verifiable watched output with only these groups applied: v(S) = F(S) - F(none).

    Two evaluations (one of them shared by every call). None = the engine has no number: the caller holds.
    Outputs that are not verifiable are left out; cant_verify() is true for every group that can reach one.
    """
    run = a.runs[0]
    coalition, nothing = frozenset(group_ids) & run.groups.keys(), frozenset()
    _evaluate(a, run, [nothing, coalition])
    out = {}
    for w in run.outputs:
        before, after = (run.values.get(s, {}).get(w) for s in (nothing, coalition))
        out[w] = after - before if recalc.is_number(before) and recalc.is_number(after) else None
    return out


def cant_verify(a: Analysis, group: ChangeGroup) -> str | None:
    """'Sheet!A1 (reason)' if the group edits, or feeds, a cell the engine must not compute."""
    # ponytail: one graph walk per edited cell; walk the tainted set's ancestors once if groups get large
    for cell in group.cells:
        hit = [c for c in (graph.descendants(a.gu, cell) | {cell}) & a.tainted if graph.is_cell(c)]
        if hit:
            worst = min(hit, key=lambda c: (c not in a.reasons, split(c)))
            return f"{worst} ({a.reasons.get(worst, DEPENDS)})"
    return None


def result(a: Analysis, policy: Policy, mode: str = "check") -> CheckResult:
    """Every coalition, exact Shapley per watched output, and the report."""
    base, new, groups = a.base, a.new, a.groups
    values: dict[str, dict] = {}  # output -> {coalition: value}
    failed = dict(a.failed)
    for run in a.runs:
        _evaluate(a, run)
        for w in run.outputs:
            per_coalition = {s: v[w] for s, v in run.values.items()}
            if run.error:
                failed[w] = run.error
            elif all(recalc.is_number(v) for v in per_coalition.values()):
                values[w] = per_coalition
            else:
                failed[w] = "the engine could not compute this output as a number"

    out = []
    for w in policy.watched_outputs:
        F, saved_base, saved_new = values.get(w.cell), _saved(base, w.cell), _saved(new, w.cell)
        everything = frozenset(max(F, key=len)) if F else None
        clean = F is not None and w.cell not in a.tainted
        b = saved_base if saved_base is not None else F[frozenset()] if clean else None
        n = saved_new if saved_new is not None else F[everything] if clean else None
        observed = n - b if b is not None and n is not None else None
        verified = F[everything] - F[frozenset()] if F else 0.0
        attribution = []
        if F:
            ids = sorted({g for s in F for g in s}, key=lambda g: int(g[1:]))
            shares = shapley(ids, lambda s: F[s] - F[frozenset()])
            for g in groups:
                if g.group_id in shares:
                    s = shares[g.group_id]
                    attribution.append(Attribution(group_id=g.group_id, solo=s.solo, share=s.share, interaction=s.interaction))
                elif g.group_id not in a.excluded[w.cell]:  # cannot reach this output: a null player
                    attribution.append(Attribution(group_id=g.group_id, solo=0, share=0, interaction=0))
        out.append(Output(
            cell=w.cell, label=w.label, base=b, new=n, delta_observed=observed, delta_verified=verified,
            delta_unverified=None if observed is None
            else 0.0 if math.isclose(observed, verified, rel_tol=1e-9, abs_tol=1e-9) else observed - verified,
            attribution=attribution,
        ))

    # --- report -------------------------------------------------------------------------------------
    reasons, tainted = failed | a.reasons, a.tainted | failed.keys()
    formula_cells = {c for book in (base, new) for c, content in book.cells.items() if isinstance(content, Formula)}
    unverifiable = [Unverifiable(cell=c, reason=reasons.get(c, DEPENDS))
                    for c in sorted(filter(graph.is_cell, tainted), key=lambda c: (c not in reasons, split(c)))]
    return CheckResult(
        check_id=f"chk_{uuid.uuid4().hex[:12]}", mode=mode, base_version=base.sha256, new_version=new.sha256,
        verification=Verification(saved_by=base.saved_by, formula_cells=a.base_formulas,
                                  matched=a.matched, mismatched=a.mismatched),
        groups=[Group(group_id=g.group_id, label=g.label, type=g.type, cells=list(g.cells)) for g in groups],
        outputs=out,
        structural=a.structural,
        unverifiable=unverifiable,
        coverage=1 - len(tainted & formula_cells) / len(formula_cells) if formula_cells else 1.0,
    )


def check(base_path: Path | str, new_path: Path | str, policy: Policy, mode: str = "check",
          base_saved: Path | str | None = None) -> CheckResult:
    return result(analyse(base_path, new_path, policy, base_saved), policy, mode)
