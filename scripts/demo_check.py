"""Headless end-to-end verification of Acts 1-3 for the Delta Gate demo.

Run from backend/ after `scripts\\demo_reset.ps1` (or with `--isolated` for a scratch store):
    cd backend && uv run python ../scripts/demo_check.py
    cd backend && uv run python ../scripts/demo_check.py --isolated --bench-runs 5

Verifies every on-screen demo number (42,000 / 38,000 / 4,000, lost link on Summary!C4 only,
Act 2 PARTIAL + REST Deny/Rollback + audit verify + drift held on the 9th edit, Act 3 XLOOKUP
fail-closed), auto-verifies REST Groups 2-4 once PR #16 merges, warms the LibreOffice profile
to remove the cold-start `pending` delay, and asserts Check and Gate p95 latency budgets.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

from deltagate import api, config, db, mcp_server  # noqa: E402
from deltagate.engine import check as engine_check  # noqa: E402
from deltagate.engine import graph, recalc  # noqa: E402
from deltagate.engine.parse import parse  # noqa: E402
from deltagate.engine.proof import proof_workbook  # noqa: E402
from deltagate.gate import audit, gate, store  # noqa: E402

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpx2").setLevel(logging.WARNING)

GOLDEN = ROOT / "golden"
V2 = GOLDEN / "dues_v2.xlsx"
V3 = GOLDEN / "dues_v3_REAL.xlsx"
JUDGE = GOLDEN / "judge_xlookup.xlsx"
DRIFT_STEPS = GOLDEN / "drift_steps.json"
C6, C4, F3 = "Summary!C6", "Summary!C4", "LateFees!F3"

CHECK_LIMIT_MS = 10_000.0
GATE_P95_LIMIT_MS = 3_000.0


def percentile(values: list[float], pct: int) -> float:
    """Nearest-rank percentile matching tests/test_gate.py."""
    if not values:
        raise ValueError("Cannot compute percentile of an empty list")
    ordered = sorted(values)
    index = max(0, -(-pct * len(ordered) // 100) - 1)
    return float(ordered[index])


@contextmanager
def _temp_home(soffice_off: bool = False):
    """Temporarily point DELTAGATE_HOME at a fresh directory and restore env afterwards."""
    prev_home = os.environ.get("DELTAGATE_HOME")
    prev_soffice = os.environ.get("DELTAGATE_SOFFICE")
    with tempfile.TemporaryDirectory(prefix="deltagate-demo-check-") as tmp:
        os.environ["DELTAGATE_HOME"] = tmp
        if soffice_off:
            os.environ["DELTAGATE_SOFFICE"] = "off"
        try:
            yield Path(tmp)
        finally:
            if prev_home is None:
                os.environ.pop("DELTAGATE_HOME", None)
            else:
                os.environ["DELTAGATE_HOME"] = prev_home
            if prev_soffice is None:
                os.environ.pop("DELTAGATE_SOFFICE", None)
            else:
                os.environ["DELTAGATE_SOFFICE"] = prev_soffice


def _output(result, cell: str):
    return next(o for o in result.outputs if o.cell == cell)


def _group_of(result, cell: str):
    return next(g for g in result.groups if cell in g.cells)


def warm_libreoffice() -> dict:
    """Warm up data/libreoffice_profile so the first Act 2 sidecar commit is not slow."""
    soffice_bin = config.soffice()
    if not soffice_bin:
        return {
            "warmed": False,
            "reason": "LibreOffice not installed (or DELTAGATE_SOFFICE=off)",
            "elapsed_ms": None,
        }
    profile = config.data_dir() / "libreoffice_profile"
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="deltagate-warm-", dir=config.data_dir()) as tmp:
        ok = store.recalculate(V2, Path(tmp) / "warm.lo.xlsx", soffice_bin, profile)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "warmed": bool(ok),
        "reason": "ok" if ok else "LibreOffice sidecar warm-up returned False",
        "elapsed_ms": elapsed_ms,
        "profile": str(profile),
    }


def run_act1(policy) -> dict:
    """Act 1: Check v2 -> v3 (+42,000 = 38,000 + 4,000), lost link on C4 only, Prove it."""
    started = time.perf_counter()
    result = engine_check.check(V2, V3, policy)
    check_ms = round((time.perf_counter() - started) * 1000, 1)

    v = result.verification
    assert v.saved_by == "Microsoft Excel", f"Expected Microsoft Excel, got {v.saved_by}"
    assert v.formula_cells == 307 and v.matched == 307 and v.mismatched == []
    assert result.coverage == 1.0 and result.unverifiable == []

    c6 = _output(result, C6)
    c4 = _output(result, C4)
    assert (c6.base, c6.new) == (286000, 328000), c6
    assert (c6.delta_observed, c6.delta_verified, c6.delta_unverified) == (42000, 42000, 0), c6
    assert (c4.base, c4.new, c4.delta_observed) == (100000, 100000, 0), c4

    expense = _group_of(result, "Expenses!B12")
    late_fee = _group_of(result, F3)
    typed = _group_of(result, C4)
    assert (expense.type, late_fee.type, typed.type) == ("data", "logic", "structural")

    by_gid = {a.group_id: a for a in c6.attribution}
    assert by_gid[expense.group_id].solo == 38000 and by_gid[expense.group_id].share == 38000
    assert by_gid[late_fee.group_id].solo == 4000 and by_gid[late_fee.group_id].share == 4000
    assert by_gid[typed.group_id].solo == 0 and by_gid[typed.group_id].share == 0
    assert abs(sum(a.share for a in c6.attribution) - 42000) < 1e-9
    assert all(abs(a.interaction) < 1e-9 for a in c6.attribution)

    found = {(f.kind, f.cell) for f in result.structural}
    assert ("typed_over_formula", C4) in found
    assert ("protected_formula_edit", F3) in found
    assert ("protected_formula_edit", C4) in found
    lost = [f for f in result.structural if f.kind == "lost_link"]
    assert [(f.cell, f.output) for f in lost] == [(C4, C4)]
    assert "Payments!C" in lost[0].message
    assert not any(f.output == C6 for f in lost)

    proof_recalc = False
    with tempfile.TemporaryDirectory(prefix="deltagate-proof-") as tmp:
        tmp_path = Path(tmp)
        proof = proof_workbook(V2, V3, late_fee.cells, tmp_path / "proof.xlsx")
        wb = load_workbook(proof)
        assert wb.calculation.fullCalcOnLoad is True
        assert wb["LateFees"]["F3"].value == "=F2*0.04"
        assert wb["Summary"]["C4"].value == "=SUM(Payments!C2:C61)"
        assert wb["Expenses"]["B12"].value is None
        soffice_bin = config.soffice()
        if soffice_bin:
            out_dir = tmp_path / "recalculated"
            profile = tmp_path / "lo_profile"
            subprocess.run(
                [soffice_bin, f"-env:UserInstallation={profile.as_uri()}", "--headless", "--calc",
                 "--convert-to", "xlsx", "--outdir", str(out_dir), str(proof)],
                check=True, capture_output=True, timeout=120,
            )
            recalc_file = out_dir / "proof.xlsx"
            assert parse(recalc_file).saved_by == "LibreOffice"
            recalc_c6 = load_workbook(recalc_file, data_only=True)["Summary"]["C6"].value
            assert recalc_c6 - 286000 == 4000
            proof_recalc = True

    return {
        "check_ms": check_ms,
        "c6_base": c6.base,
        "c6_new": c6.new,
        "c6_delta": c6.delta_verified,
        "data_share": by_gid[expense.group_id].share,
        "logic_share": by_gid[late_fee.group_id].share,
        "lost_link_output": lost[0].output,
        "proof_recalc_verified": proof_recalc,
    }


def run_act2(policy, isolated: bool, use_api: bool = True) -> dict:
    """Act 2: MCP tool surface, impact_preview, Session A PARTIAL/Deny, Session B drift, Rollback."""
    tool_names = {t.name for t in asyncio.run(mcp_server.server.list_tools())}
    expected_tools = {"read_range", "impact_preview", "explain_delta", "propose_edit", "get_decision"}
    assert tool_names == expected_tools, f"Unexpected MCP tools: {tool_names}"
    assert not any(hasattr(mcp_server, name) for name in ("approve", "deny", "rollback"))

    book_v2 = parse(V2)
    preview = graph.impact(graph.build(book_v2), book_v2, F3, policy)
    assert preview["protected"] is True
    assert any(w["cell"] == C6 for w in preview["watched_outputs"])

    client = TestClient(api.app) if use_api else None
    conn = db.connect()
    try:
        if isolated:
            store.register(conn, V2, "dues")
        else:
            existing = store.workbooks(conn)
            if "dues" not in existing:
                raise RuntimeError(
                    "Workbook 'dues' is not registered. Run `powershell -File scripts\\demo_reset.ps1` "
                    "first (or pass --isolated)."
                )
            current_row, unmanaged = store.current(conn, "dues", policy)
            edits_count = conn.execute("SELECT COUNT(*) FROM edits").fetchone()[0]
            versions_count = conn.execute("SELECT COUNT(*) FROM versions WHERE workbook_id = 'dues'").fetchone()[0]
            if unmanaged is not None or current_row["sha256"] != store.sha256(V2) or edits_count != 0 or versions_count != 1:
                raise RuntimeError(
                    "Live store is not at the clean demo start state. Run "
                    "`powershell -File scripts\\demo_reset.ps1` before running scripts/demo_check.py "
                    "(or pass --isolated)."
                )

        script = json.loads(DRIFT_STEPS.read_text(encoding="utf-8"))
        sessions = {s["session_id"]: s for s in script["sessions"]}
        wall_ms: list[float] = []

        # --- Session A: PARTIAL (payments PASS, LateFees!F3 HELD), then Deny + end_session ---
        step_a = sessions["s_A"]["steps"][0]
        t0 = time.perf_counter()
        dec_a = gate.propose_edit(conn, "dues", step_a["ops"], "s_A")
        wall_ms.append(round((time.perf_counter() - t0) * 1000, 1))
        assert dec_a.status == "PARTIAL", dec_a
        assert dec_a.committed_version is not None and dec_a.check is not None
        pay_gid = next(g.group_id for g in dec_a.check.groups if "Payments!C5" in g.cells)
        f3_gid = next(g.group_id for g in dec_a.check.groups if F3 in g.cells)
        g_by_id = {g.group_id: g for g in dec_a.groups}
        assert g_by_id[pay_gid].status == "PASS"
        assert g_by_id[f3_gid].status == "HELD"
        assert any("Protected" in r for r in g_by_id[f3_gid].reasons)

        live_file = config.store_dir() / "dues" / "current.xlsx"
        vals_a = recalc.recompute(live_file, [C6, C4])
        assert (vals_a[C6], vals_a[C4]) == (278500, 107500), vals_a

        before_deny_sha = store.sha256(live_file)
        if client is not None:
            held_resp = client.get("/api/edits", params={"status": "held"})
            assert held_resp.status_code == 200 and len(held_resp.json()) == 1
            assert held_resp.json()[0]["edit_id"] == dec_a.edit_id
            deny_resp = client.post(f"/api/edits/{dec_a.edit_id}/deny")
            assert deny_resp.status_code == 200 and deny_resp.json()["status"] == "DENIED"
            assert client.get("/api/edits").json() == []
            assert client.post(f"/api/edits/{dec_a.edit_id}/deny").status_code == 409
        else:
            denied = gate.deny(conn, dec_a.edit_id)
            assert denied.status == "DENIED"
        assert store.sha256(live_file) == before_deny_sha

        gate.end_session(conn, "s_A")
        assert audit.verify(conn)["ok"] is True

        # --- Session B: 8 PASS (₹24,000), 9th and 10th HELD by drift budget (₹27,000 > ₹25,000) ---
        dec_b_list = []
        for idx, step in enumerate(sessions["s_B"]["steps"], start=1):
            t0 = time.perf_counter()
            d = gate.propose_edit(conn, "dues", step["ops"], "s_B")
            wall_ms.append(round((time.perf_counter() - t0) * 1000, 1))
            assert d.status == step["expect"]["status"], (idx, d.status)
            dec_b_list.append(d)

        assert all("27,000" in r and "25,000" in r for r in dec_b_list[8].groups[0].reasons), dec_b_list[8]
        drift_b = conn.execute("SELECT drift FROM sessions WHERE id = 's_B'").fetchone()["drift"]
        assert drift_b == 24000, drift_b
        vals_b = recalc.recompute(live_file, [C6, C4])
        assert (vals_b[C6], vals_b[C4]) == (254500, 131500), vals_b
        gate.end_session(conn, "s_B")
        assert audit.verify(conn)["ok"] is True
        cp_count = conn.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0]
        assert cp_count >= 2

        # --- Rollback ---
        sha_before_rb = store.sha256(live_file)
        if client is not None:
            rb_resp = client.post("/api/workbooks/dues/rollback")
            assert rb_resp.status_code == 200 and rb_resp.json()["sha256"] != sha_before_rb
        else:
            restored = gate.rollback(conn, "dues")
            assert restored["sha256"] != sha_before_rb
        vals_rb = recalc.recompute(live_file, [C6, C4])
        assert (vals_rb[C6], vals_rb[C4]) == (257500, 128500), vals_rb
        assert audit.verify(conn)["ok"] is True

        timings = [
            json.loads(r["payload_json"])
            for r in conn.execute("SELECT payload_json FROM audit_log WHERE action = 'propose_edit' ORDER BY seq")
        ]
        decision_ms = [float(t["decision_ms"]) for t in timings]
        commit_ms = [float(t["commit_ms"]) for t in timings]
        store.drain()
        return {
            "api_group1_checked": client is not None,
            "session_a_status": dec_a.status,
            "session_b_9th_status": dec_b_list[8].status,
            "session_b_drift": drift_b,
            "checkpoints": cp_count,
            "audit_ok": True,
            "rollback_c6": vals_rb[C6],
            "decision_ms": decision_ms,
            "commit_ms": commit_ms,
            "wall_ms": wall_ms,
        }
    finally:
        store.drain()
        conn.close()


def run_act3(policy) -> dict:
    """Act 3: Fail closed on judge_xlookup.xlsx (38,000 verified + 4,000 unverified) + CANT_VERIFY_HELD."""
    started = time.perf_counter()
    result = engine_check.check(V2, JUDGE, policy)
    check_ms = round((time.perf_counter() - started) * 1000, 1)

    c6 = _output(result, C6)
    assert (c6.delta_observed, c6.delta_verified, c6.delta_unverified) == (42000, 38000, 4000), c6
    assert 0 < result.coverage < 1.0, result.coverage
    assert any(u.reason == "XLOOKUP" for u in result.unverifiable)

    expense = _group_of(result, "Expenses!B12")
    late_fee = _group_of(result, F3)
    by_gid = {a.group_id: a for a in c6.attribution}
    assert by_gid[expense.group_id].share == 38000
    assert late_fee.group_id not in by_gid

    with _temp_home(soffice_off=True):
        conn = db.connect()
        try:
            store.register(conn, JUDGE, "judge")
            held = gate.propose_edit(
                conn, "judge", [{"op": "set_value", "cell": "Payments!C5", "value": 2500}], "s_act3"
            )
            assert held.status == "HELD" and held.committed_version is None
            assert [g.status for g in held.groups] == ["CANT_VERIFY_HELD"]
            assert held.groups[0].impacts == []
            assert "Can't verify" in held.groups[0].reasons[0] and "XLOOKUP" in held.groups[0].reasons[0]
        finally:
            store.drain()
            conn.close()

    session_audit_ok = None
    if importlib.util.find_spec("deltagate.session_audit") is not None:
        from deltagate import session_audit  # type: ignore

        with _temp_home(soffice_off=True):
            snap = session_audit.snapshot(V2)
            sa_res = session_audit.complete(snap.snapshot_id, V3, policy)
            assert sa_res.mode == "session_audit"
            assert _output(sa_res, C6).delta_verified == 42000
            session_audit_ok = True

    return {
        "check_ms": check_ms,
        "c6_observed": c6.delta_observed,
        "c6_verified": c6.delta_verified,
        "c6_unverified": c6.delta_unverified,
        "coverage": round(result.coverage, 3),
        "xlookup_cells": sum(1 for u in result.unverifiable if u.reason == "XLOOKUP"),
        "gate_cant_verify_status": "CANT_VERIFY_HELD",
        "session_audit_checked": session_audit_ok,
    }


def run_api_groups_2_to_4(use_api: bool = True) -> dict:
    """When PR #16 endpoints exist on api.app, verify Checks, Proof, Audit, CSV, and Session Audit over HTTP."""
    if not use_api:
        return {"checked": False, "reason": "--no-api"}
    paths = set(api.app.openapi().get("paths", {}))
    if "/api/checks" not in paths:
        return {"checked": False, "reason": "waiting on PR #16"}

    xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    with _temp_home(soffice_off=True):
        client = TestClient(api.app)
        with V2.open("rb") as fb, V3.open("rb") as fn:
            resp = client.post("/api/checks", files={"base": (V2.name, fb, xlsx), "new": (V3.name, fn, xlsx)})
        assert resp.status_code == 200, resp.text
        chk = resp.json()
        check_id = chk["check_id"]
        c6 = next(o for o in chk["outputs"] if o["cell"] == C6)
        assert (c6["delta_observed"], c6["delta_verified"]) == (42000, 42000)
        assert client.get(f"/api/checks/{check_id}").status_code == 200

        f3_gid = next(g["group_id"] for g in chk["groups"] if F3 in g["cells"])
        proof_resp = client.post(f"/api/checks/{check_id}/proof/{f3_gid}")
        assert proof_resp.status_code == 200
        wb = load_workbook(io.BytesIO(proof_resp.content))
        assert wb.calculation.fullCalcOnLoad is True and wb["LateFees"]["F3"].value == "=F2*0.04"

        csv_resp = client.get(f"/api/exports/{check_id}.csv")
        assert csv_resp.status_code == 200 and "42000" in csv_resp.text and "38000" in csv_resp.text

        assert client.get("/api/audit").status_code == 200
        verify_resp = client.get("/api/audit/verify")
        assert verify_resp.status_code == 200 and verify_resp.json()["ok"] is True

        with V2.open("rb") as fb:
            snap_resp = client.post("/api/session-audit/snapshot", files={"file": (V2.name, fb, xlsx)})
        assert snap_resp.status_code == 200
        snap_id = snap_resp.json()["snapshot_id"]
        with V3.open("rb") as fn:
            comp_resp = client.post("/api/session-audit/complete", data={"snapshot_id": snap_id},
                                    files={"file": (V3.name, fn, xlsx)})
        assert comp_resp.status_code == 200
        sa = comp_resp.json()
        assert sa["mode"] == "session_audit"
        assert next(o for o in sa["outputs"] if o["cell"] == C6)["delta_verified"] == 42000

    return {"checked": True, "reason": "ok"}


def run_all(isolated: bool = False, skip_warm: bool = False, bench_runs: int = 1, use_api: bool = True) -> dict:
    """Run warm-up + Acts 1-3 (+ REST API checks), assert budgets, return structured report."""
    if bench_runs < 1:
        raise ValueError("--bench-runs must be >= 1")
    policy = config.load_policy()

    def _execute_once(use_isolated: bool) -> dict:
        warm = {"warmed": False, "reason": "skipped", "elapsed_ms": None} if skip_warm else warm_libreoffice()
        act1 = run_act1(policy)
        act2 = run_act2(policy, isolated=use_isolated, use_api=use_api)
        act3 = run_act3(policy)
        api_rest = run_api_groups_2_to_4(use_api=use_api)

        extra_v3_ms: list[float] = []
        extra_judge_ms: list[float] = []
        for _ in range(bench_runs - 1):
            t0 = time.perf_counter()
            engine_check.check(V2, V3, policy)
            extra_v3_ms.append(round((time.perf_counter() - t0) * 1000, 1))
            t1 = time.perf_counter()
            engine_check.check(V2, JUDGE, policy)
            extra_judge_ms.append(round((time.perf_counter() - t1) * 1000, 1))

        v3_samples = [act1["check_ms"], *extra_v3_ms]
        judge_samples = [act3["check_ms"], *extra_judge_ms]
        all_check_samples = [*v3_samples, *judge_samples]
        gate_decisions = act2["decision_ms"]
        gate_commits = act2["commit_ms"]

        perf = {
            "check_v3_p50_ms": percentile(v3_samples, 50),
            "check_v3_p95_ms": percentile(v3_samples, 95),
            "check_judge_p50_ms": percentile(judge_samples, 50),
            "check_judge_p95_ms": percentile(judge_samples, 95),
            "check_max_ms": max(all_check_samples),
            "gate_samples": len(gate_decisions),
            "gate_decision_p50_ms": percentile(gate_decisions, 50),
            "gate_decision_p95_ms": percentile(gate_decisions, 95),
            "gate_decision_max_ms": max(gate_decisions),
            "gate_commit_p50_ms": percentile(gate_commits, 50),
            "gate_commit_p95_ms": percentile(gate_commits, 95),
        }

        assert perf["check_max_ms"] < CHECK_LIMIT_MS, f"Check exceeded {CHECK_LIMIT_MS} ms: {perf}"
        assert perf["gate_decision_p95_ms"] <= GATE_P95_LIMIT_MS, (
            f"Gate decision p95 exceeded {GATE_P95_LIMIT_MS} ms: {perf}"
        )

        return {"warm": warm, "act1": act1, "act2": act2, "act3": act3, "api_rest": api_rest, "perf": perf}

    if isolated:
        with _temp_home(soffice_off=False):
            return _execute_once(use_isolated=True)
    return _execute_once(use_isolated=False)


def _print_report(report: dict, run_idx: int, total_runs: int) -> None:
    warm, a1, a2, a3, rest, p = (
        report["warm"], report["act1"], report["act2"], report["act3"], report["api_rest"], report["perf"]
    )
    prefix = f"[run {run_idx}/{total_runs}] " if total_runs > 1 else ""
    warm_msg = f"warmed in {warm['elapsed_ms']:.0f} ms" if warm["warmed"] else f"skipped ({warm['reason']})"
    print(f"{prefix}LibreOffice warm-up: {warm_msg}")
    print(
        f"{prefix}Act 1 PASS: Summary!C6 {a1['c6_base']:,.0f} -> {a1['c6_new']:,.0f} "
        f"(+₹{a1['c6_delta']:,.0f} = ₹{a1['data_share']:,.0f} data + ₹{a1['logic_share']:,.0f} logic), "
        f"lost_link={a1['lost_link_output']}, proof_lo={a1['proof_recalc_verified']} ({a1['check_ms']:.0f} ms)"
    )
    print(
        f"{prefix}Act 2 PASS: api_group1={a2['api_group1_checked']}, Session A={a2['session_a_status']} (Denied), "
        f"Session B 9th={a2['session_b_9th_status']} (drift ₹{a2['session_b_drift']:,.0f}), "
        f"checkpoints={a2['checkpoints']}, audit_ok={a2['audit_ok']}, rollback C6=₹{a2['rollback_c6']:,.0f}"
    )
    sa_note = "ok" if a3["session_audit_checked"] else "not on branch (skipped)"
    rest_note = "ok" if rest["checked"] else rest["reason"]
    print(
        f"{prefix}Act 3 PASS: judge_xlookup observed=₹{a3['c6_observed']:,.0f} "
        f"(verified=₹{a3['c6_verified']:,.0f}, unverified=₹{a3['c6_unverified']:,.0f}, "
        f"coverage={a3['coverage']}, xlookup_cells={a3['xlookup_cells']}), "
        f"gate={a3['gate_cant_verify_status']}, session_audit={sa_note}, api_groups_2_4={rest_note} ({a3['check_ms']:.0f} ms)"
    )
    print(
        f"{prefix}Perf: Check v2->v3 p50={p['check_v3_p50_ms']:.0f} ms p95={p['check_v3_p95_ms']:.0f} ms | "
        f"Check v2->judge p50={p['check_judge_p50_ms']:.0f} ms p95={p['check_judge_p95_ms']:.0f} ms | "
        f"Gate decision ({p['gate_samples']} edits) p50={p['gate_decision_p50_ms']:.0f} ms "
        f"p95={p['gate_decision_p95_ms']:.0f} ms max={p['gate_decision_max_ms']:.0f} ms (limit {GATE_P95_LIMIT_MS:.0f} ms)"
    )


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Run Delta Gate demo Acts 1-3 headless.")
    parser.add_argument("--isolated", action="store_true", help="Use a fresh temporary DELTAGATE_HOME.")
    parser.add_argument("--runs", type=int, default=1, help="Consecutive verification runs (forces --isolated if > 1).")
    parser.add_argument("--bench-runs", type=int, default=1, help="Check iterations per run for p50/p95 stats.")
    parser.add_argument("--skip-warm", action="store_true", help="Skip LibreOffice profile warm-up.")
    parser.add_argument("--no-api", action="store_true", help="Skip FastAPI TestClient checks.")
    parser.add_argument("--json", action="store_true", help="Print JSON summary.")
    args = parser.parse_args(argv)

    use_isolated = args.isolated or args.runs > 1
    reports = []
    for idx in range(1, args.runs + 1):
        report = run_all(
            isolated=use_isolated, skip_warm=args.skip_warm, bench_runs=args.bench_runs, use_api=not args.no_api
        )
        reports.append(report)
        if not args.json:
            _print_report(report, idx, args.runs)

    if args.json:
        print(json.dumps(reports[0] if len(reports) == 1 else reports, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
