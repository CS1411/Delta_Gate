"""A Check: compare two versions of a workbook -> CheckResult.

Order of work: parse both -> dependency graphs -> change groups -> find what cannot be verified ->
verify the base against its saved values -> evaluate every coalition of groups -> exact Shapley
per watched output -> structural checks.

Fail closed. A cell is unverifiable if its formula is not on the allowlist, if the engine's value
for it disagrees with the saved value, or if it depends on such a cell. Unverifiable cells never
move in a coalition: they are pinned at their saved base value, so whatever flows through them
lands in delta_unverified, not in anyone's share.
"""

import math
import uuid
from pathlib import Path

import networkx as nx

from deltagate.engine import allowlist, graph, recalc, structural
from deltagate.engine.classify import classify
from deltagate.engine.parse import Book, Formula, parse, split
from deltagate.engine.shapley import shapley
from deltagate.engine.verify import verify
from deltagate.models import Attribution, CheckResult, Group, Output, Policy, Unverifiable, Verification

DEPENDS = "depends on an unverifiable cell"


def _saved(book: Book, cell: str):
    """What the file itself says the cell's value is: the constant, or the saved value of a formula."""
    content = book.cells.get(cell)
    value = book.cached.get(cell) if isinstance(content, Formula) else content
    return value if recalc.is_number(value) else None


def _taint(g: nx.DiGraph, roots) -> set[str]:
    return set(roots).union(*(graph.descendants(g, r) for r in roots))


def check(base_path: Path | str, new_path: Path | str, policy: Policy, mode: str = "check") -> CheckResult:
    base, new = parse(base_path), parse(new_path)
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
    base_formulas = [c for c, content in base.cells.items() if isinstance(content, Formula)]
    matched, mismatched, errors = verify(base, skip=_taint(gb, in_base))
    reasons |= {c: "does not match the saved value" for c in mismatched} | {c: "engine error" for c in errors}
    tainted = _taint(gu, reasons)

    # --- coalitions and attribution ---------------------------------------------------------------
    watched = [w.cell for w in policy.watched_outputs]
    upstream = {w: graph.ancestors(gu, w) | {w} for w in watched}
    values: dict[str, dict] = {}  # output -> {coalition: value}
    excluded: dict[str, set] = {w: set() for w in watched}  # groups left out of an output's attribution
    failed: dict[str, str] = {}  # output -> why nothing about it is verified

    runs = [([w for w in watched if w not in tainted], {})]  # clean outputs share one run, nothing pinned
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
                runs.append(([w], pins))

    for outputs, pins in runs:
        relevant = {}
        for g in groups:
            live = {c: pair for c, pair in g.cells.items() if c not in pins}
            for w in outputs:
                if any(c in upstream[w] for c in g.cells) and not any(c in upstream[w] for c in live):
                    excluded[w].add(g.group_id)  # everything it does to w runs through unverifiable cells
            if any(c in upstream[w] for c in live for w in outputs):
                relevant[g.group_id] = live
        try:
            F = recalc.coalitions(base.path, relevant, pins, outputs) if outputs else {}
        except Exception as error:  # the engine could not even build a model: hold, do not guess
            failed |= {w: f"engine error ({type(error).__name__})" for w in outputs}
            continue
        for w in outputs:
            per_coalition = {s: v[w] for s, v in F.items()}
            if all(recalc.is_number(v) for v in per_coalition.values()):
                values[w] = per_coalition
            else:
                failed[w] = "the engine could not compute this output as a number"

    out = []
    for w in policy.watched_outputs:
        F, saved_base, saved_new = values.get(w.cell), _saved(base, w.cell), _saved(new, w.cell)
        everything = frozenset(max(F, key=len)) if F else None
        clean = F is not None and w.cell not in tainted
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
                    a = shares[g.group_id]
                    attribution.append(Attribution(group_id=g.group_id, solo=a.solo, share=a.share, interaction=a.interaction))
                elif g.group_id not in excluded[w.cell]:  # cannot reach this output: a null player
                    attribution.append(Attribution(group_id=g.group_id, solo=0, share=0, interaction=0))
        out.append(Output(
            cell=w.cell, label=w.label, base=b, new=n, delta_observed=observed, delta_verified=verified,
            delta_unverified=None if observed is None
            else 0.0 if math.isclose(observed, verified, rel_tol=1e-9, abs_tol=1e-9) else observed - verified,
            attribution=attribution,
        ))

    # --- report -------------------------------------------------------------------------------------
    for w, why in failed.items():
        reasons.setdefault(w, why)
        tainted.add(w)
    formula_cells = {c for book in (base, new) for c, content in book.cells.items() if isinstance(content, Formula)}
    unverifiable = [Unverifiable(cell=c, reason=reasons.get(c, DEPENDS))
                    for c in sorted(filter(graph.is_cell, tainted), key=lambda c: (c not in reasons, split(c)))]
    return CheckResult(
        check_id=f"chk_{uuid.uuid4().hex[:12]}", mode=mode, base_version=base.sha256, new_version=new.sha256,
        verification=Verification(saved_by=base.saved_by, formula_cells=len(base_formulas),
                                  matched=matched, mismatched=mismatched),
        groups=[Group(group_id=g.group_id, label=g.label, type=g.type, cells=list(g.cells)) for g in groups],
        outputs=out,
        structural=structural.findings(base, new, gb, gn, changes, aligns, policy),
        unverifiable=unverifiable,
        coverage=1 - len(tainted & formula_cells) / len(formula_cells) if formula_cells else 1.0,
    )
