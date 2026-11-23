"""Command line: python -m deltagate.cli check BASE.xlsx NEW.xlsx [--json] [--policy policy.yaml]

Every number printed comes from the engine's CheckResult; this file only formats.
"""

import argparse
import sys
import time
from pathlib import Path

from deltagate.config import POLICY_PATH, load_policy
from deltagate.engine.check import check
from deltagate.gate.policy import inr
from deltagate.models import CheckResult, Verification


def banner(v: Verification) -> str:
    """Names the app that actually saved the values. Never claims Excel when it was not Excel."""
    if v.saved_by == "none":
        return "Not verifiable against saved values"
    app = "Excel" if v.saved_by == "Microsoft Excel" else v.saved_by
    return f"Verified against {app}'s saved values: {v.matched:,} / {v.formula_cells:,} formula cells match"


def summary(r: CheckResult, base: Path, new: Path) -> str:
    lines = [f"Delta Gate check: {base.name} -> {new.name}", banner(r.verification), f"Coverage: {r.coverage:.1%}"]
    if r.verification.mismatched:
        lines.append(f"Saved values that do not match the engine: {', '.join(r.verification.mismatched)}")
    labels = {g.group_id: g for g in r.groups}
    for o in r.outputs:
        lines += ["", f"{o.cell}  {o.label}: {inr(o.base)} -> {inr(o.new)}   change {inr(o.delta_observed, True)}"
                      f"   (verified {inr(o.delta_verified, True)}, unverified {inr(o.delta_unverified, True)})"]
        for a in o.attribution:
            g = labels[a.group_id]
            lines.append(f"  {a.group_id}  {g.type:10s}  {g.label:44s}  solo {inr(a.solo, True):>10s}"
                         f"  share {inr(a.share, True):>10s}  interaction {inr(a.interaction, True)}")
        if o.cell in {u.cell for u in r.unverifiable}:
            lines.append("  can't verify: this output depends on cells the engine must not compute (listed below)")
    lines += ["", f"Structural findings: {len(r.structural)}"]
    lines += [f"  {f.kind:24s}  {f.cell:14s}  {f.message}" for f in r.structural]
    lines += ["", f"Unverifiable cells: {len(r.unverifiable)}"]
    by_reason: dict[str, list[str]] = {}
    for u in r.unverifiable:
        by_reason.setdefault(u.reason, []).append(u.cell)
    for reason, cells in by_reason.items():
        lines.append(f"  {reason}: {', '.join(cells[:6])}{f', … ({len(cells)} cells)' if len(cells) > 6 else ''}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="deltagate")
    command = parser.add_subparsers(dest="command", required=True).add_parser("check", help="compare two versions")
    command.add_argument("base", type=Path)
    command.add_argument("new", type=Path)
    command.add_argument("--json", action="store_true", help="print the CheckResult as JSON")
    command.add_argument("--policy", type=Path, default=POLICY_PATH)
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # the Windows console default cannot print ₹
    start = time.perf_counter()
    result = check(args.base, args.new, load_policy(args.policy))
    if args.json:
        print(result.model_dump_json(indent=2))
    else:
        print(summary(result, args.base, args.new))
        print(f"\nCheck ran in {time.perf_counter() - start:.2f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
