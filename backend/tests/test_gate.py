"""Phase 2 acceptance: policy rules, the managed store, the gate, and the Act 2 script (golden/drift_steps.json)."""

import json
import shutil

import pytest
from openpyxl import load_workbook
from pydantic import ValidationError

from conftest import GOLDEN, JUDGE, V2, V3
from deltagate import config
from deltagate.engine import check as engine
from deltagate.engine import recalc
from deltagate.engine.classify import ChangeGroup
from deltagate.gate import audit, gate, policy as rules, store
from deltagate.models import StructuralFinding

C6, C4, F3 = "Summary!C6", "Summary!C4", "LateFees!F3"
PAYMENTS_AND_F3 = [
    {"op": "set_value", "cell": "Payments!C5", "value": 2500},
    {"op": "set_value", "cell": "Payments!C9", "value": 2500},
    {"op": "set_value", "cell": "Payments!C13", "value": 2500},
    {"op": "set_formula", "cell": F3, "formula": "=F2*0.04"},
]


def pay(row, amount=3000):
    return [{"op": "set_value", "cell": f"Payments!C{row}", "value": amount}]


@pytest.fixture
def dues(home):
    store.register(home, V2, "dues")
    return home


def live(workbook_id="dues"):
    return config.store_dir() / workbook_id / "current.xlsx"


def values(*cells, workbook_id="dues"):
    """Engine values of the live file (computed from its formulas)."""
    got = recalc.recompute(live(workbook_id), list(cells))
    return tuple(got[c] for c in cells)


def group(decision, cell):
    """The group decision that covers `cell` (cells live on the Check when one was built)."""
    if decision.check:
        group_id = next(g.group_id for g in decision.check.groups if cell in g.cells)
        return next(g for g in decision.groups if g.group_id == group_id)
    assert len(decision.groups) == 1
    return decision.groups[0]


def drift(conn, session_id):
    row = conn.execute("SELECT drift FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return row["drift"] if row else 0


# --- policy.decide: pure rules --------------------------------------------------------------------


def g(group_id, *cells):
    return ChangeGroup(group_id, group_id, "data", {c: (0, 1) for c in cells})


def decide(groups, solos, policy, findings=(), blocked=None, drift=0, joint=None):
    return rules.decide(groups, solos, list(findings), blocked or {}, policy, drift,
                        joint or (lambda ids: {C6: sum(solos[i][C6] for i in ids)}))


def test_decide_pass_and_impact_limit(policy):
    out, total = decide([g("g1", "A!A1"), g("g2", "A!B1")], {"g1": {C6: -7500, C4: 7500}, "g2": {C6: 38000, C4: 0}}, policy)
    assert [d.status for d in out] == ["PASS", "HELD"] and total == 7500  # drift: the largest move, not the sum
    assert out[1].reasons == ["Impact on Summary!C6 (Total pending dues) is +₹38,000, over the limit of ₹10,000"]
    assert [(i.cell, i.delta) for i in out[0].impacts] == [(C6, -7500), (C4, 7500)]


def test_decide_drift_budget(policy):
    out, total = decide([g("g1", "A!A1")], {"g1": {C6: -3000, C4: 3000}}, policy, drift=24000)
    assert out[0].status == "HELD" and total == 24000  # a held group does not use up the budget
    assert out[0].reasons == ["Session drift would reach ₹27,000, over the budget of ₹25,000"]
    out, total = decide([g("g1", "A!A1")], {"g1": {C6: -1000, C4: 1000}}, policy, drift=24000)
    assert out[0].status == "PASS" and total == 25000  # exactly on the budget still passes


def test_decide_structural_finding_and_cant_verify(policy):
    finding = StructuralFinding(kind="protected_formula_edit", cell=F3, output=C6, message="Protected cell edited")
    stray = StructuralFinding(kind="lost_link", cell=C6, output=C6, message="Lost link")
    solos = {"g1": {C6: 0, C4: 0}, "g2": {C6: 10, C4: 0}, "g3": {C6: None, C4: 0}}
    out, total = decide([g("g1", F3), g("g2", "A!A1"), g("g3", "A!A2")], solos, policy, [finding],
                        blocked={"g2": "LateFees!C5 (XLOOKUP)"})
    assert [d.status for d in out] == ["HELD", "CANT_VERIFY_HELD", "CANT_VERIFY_HELD"] and total == 0
    assert out[0].reasons == ["Protected cell edited"]
    assert out[1].reasons == ["Can't verify: LateFees!C5 (XLOOKUP)"] and out[1].impacts == []  # never a guessed number
    assert "Can't verify" in out[2].reasons[0]  # the engine had no number for an output

    out, _ = decide([g("g1", "A!A1"), g("g2", "A!B1")], {"g1": {C6: 1, C4: 0}, "g2": {C6: 1, C4: 0}}, policy, [stray])
    assert [d.status for d in out] == ["HELD", "HELD"]  # a finding on no group's cell holds them all


def test_decide_joint_effect(policy):
    solos = {"g1": {C6: 9000, C4: 0}, "g2": {C6: 9000, C4: 0}}
    out, total = decide([g("g1", "A!A1"), g("g2", "A!B1")], solos, policy)
    assert [d.status for d in out] == ["HELD", "HELD"] and total == 0
    assert all(d.reasons[0] == "Combined effect of passing groups exceeds limit" for d in out)
    out, total = decide([g("g1", "A!A1"), g("g2", "A!B1")], solos, policy, joint=lambda ids: {C6: 9500, C4: 0})
    assert [d.status for d in out] == ["PASS", "PASS"] and total == 18000


# --- engine pieces the gate uses ------------------------------------------------------------------


def test_solo_matches_shapley_and_models_are_cached(policy, monkeypatch):
    compiles = []
    real = recalc.compile_model
    monkeypatch.setattr(recalc, "compile_model", lambda *a: compiles.append(a[1]) or real(*a))

    a = engine.analyse(V2, V3, policy)
    solos = {grp.group_id: engine.delta(a, [grp.group_id]) for grp in a.groups}
    assert len(compiles) == 4  # verify + base + one per formula group (F3, typed-over C4): 2 evaluations per group
    result = engine.result(a, policy)
    assert len(compiles) == 5  # the full Check only adds the model with both formula groups applied
    for share in next(o for o in result.outputs if o.cell == C6).attribution:
        assert solos[share.group_id][C6] == share.solo
    assert sorted(v[C6] for v in solos.values()) == [0, 4000, 38000]
    assert engine.delta(a, [grp.group_id for grp in a.groups])[C6] == 42000  # the joint effect of all three


# --- store ----------------------------------------------------------------------------------------


def test_register_and_versions(dues):
    rows = dues.execute("SELECT * FROM versions").fetchall()
    assert len(rows) == 1 and rows[0]["source"] == "managed" and rows[0]["parent_id"] is None
    assert rows[0]["sha256"] == store.sha256(V2) == store.sha256(live()) and rows[0]["saved_by"] == "Microsoft Excel"
    with pytest.raises(ValueError):
        store.register(dues, V2, "dues")  # already registered
    with pytest.raises(KeyError, match="dues"):  # the message lists what is registered
        gate.propose_edit(dues, "nope", pay(5), "s_1")


def test_commit_makes_a_child_version(dues):
    d = gate.propose_edit(dues, "dues", pay(5, 2500), "s_1")
    assert d.status == "PASS" and d.check is None  # the full Check is only built for the inbox
    assert [(i.cell, i.delta) for i in d.groups[0].impacts] == [(C6, -2500), (C4, 2500)]
    first, second = dues.execute("SELECT * FROM versions ORDER BY id").fetchall()
    assert second["parent_id"] == first["id"] and second["source"] == "managed"
    assert second["sha256"] == d.committed_version == store.sha256(live()) != first["sha256"]
    assert second["saved_by"] == "none"  # LibreOffice is off in this test: said plainly, never Excel
    assert (config.store_dir() / second["path"]).exists() and (config.store_dir() / first["path"]).exists()
    assert values(C6, C4) == (283500, 102500)
    assert gate.get_decision(dues, d.edit_id) == d


def test_unmanaged_change_is_detected_with_a_check(dues, policy):
    shutil.copyfile(V3, live())  # somebody saved over the file outside the server
    version, found = store.current(dues, "dues", policy)
    assert version["source"] == "unmanaged" and version["sha256"] == store.sha256(V3)
    assert next(o for o in found.outputs if o.cell == C6).delta_verified == 42000
    assert json.loads(dues.execute("SELECT json FROM checks").fetchone()["json"])["check_id"] == found.check_id
    entry = dues.execute("SELECT * FROM audit_log WHERE action = 'unmanaged_change'").fetchone()
    assert json.loads(entry["payload_json"])["check_id"] == found.check_id

    assert store.current(dues, "dues", policy)[1] is None  # reported once; it is now the current version
    d = gate.propose_edit(dues, "dues", pay(17), "s_1")  # not blocked: the next edit builds on it
    assert d.status == "PASS" and load_workbook(live())["Payments"]["C17"].value == 3000
    # v3's typed-over Collected is why this payment moves nothing: the break the lost-link finding reports
    assert {i.cell: i.delta for i in d.groups[0].impacts} == {C6: 0, C4: 0} and values(C6) == (328000,)


def test_rollback_restores_the_previous_version(dues):
    d = gate.propose_edit(dues, "dues", pay(5, 2500), "s_1")
    restored = gate.rollback(dues, "dues")
    assert restored["sha256"] == store.sha256(V2) == store.sha256(live()) and values(C6) == (286000,)
    assert gate.get_decision(dues, d.edit_id).status == "ROLLED_BACK"
    assert dues.execute("SELECT COUNT(*) FROM versions").fetchone()[0] == 3  # history is kept; rollback adds a version
    assert dues.execute("SELECT actor FROM audit_log WHERE action = 'rollback'").fetchone()["actor"] == "approver"


# --- gate -----------------------------------------------------------------------------------------


def test_bad_ops_are_rejected(dues):
    for ops in ([{"op": "set_value", "cell": "Payments!C5", "value": "=SUM(A1:A9)"}],  # a formula dressed as a value
                [{"op": "append_row", "sheet": "Expenses", "values": ["x", "=1+1"]}],
                [{"op": "set_formula", "cell": "Payments!C5", "formula": "2500"}],
                [{"op": "delete_sheet", "sheet": "Payments"}]):
        with pytest.raises(ValidationError):
            gate.propose_edit(dues, "dues", ops, "s_1")
    for ops in (pay(5) + [{"op": "set_value", "cell": "Nope!A1", "value": 1}],
                [{"op": "set_value", "cell": "Payments!C5:C9", "value": 1}],
                [{"op": "append_row", "sheet": "Nope", "values": [1]}]):
        with pytest.raises(ValueError):
            gate.propose_edit(dues, "dues", ops, "s_1")
    assert dues.execute("SELECT COUNT(*) FROM versions").fetchone()[0] == 1 and values(C6) == (286000,)


def test_no_change_passes_and_commits_nothing(dues):
    d = gate.propose_edit(dues, "dues", pay(5, 0), "s_1")  # the cell already holds 0
    assert (d.status, d.groups, d.committed_version) == ("PASS", [], None)


def test_session_a_partial(dues):
    d = gate.propose_edit(dues, "dues", PAYMENTS_AND_F3, "s_A")
    assert d.status == "PARTIAL"
    payments, late_fee = group(d, "Payments!C5"), group(d, F3)
    assert payments.status == "PASS" and {i.cell: i.delta for i in payments.impacts} == {C6: -7500, C4: 7500}
    assert late_fee.status == "HELD" and {i.cell: i.delta for i in late_fee.impacts} == {C6: 4000, C4: 0}
    assert late_fee.reasons == ["Protected cell LateFees!F3 was edited directly (formula changed)"]

    # the payments are in the file, the formula is not
    assert d.committed_version == store.sha256(live()) and values(C6, C4) == (278500, 107500)
    assert load_workbook(live())["LateFees"]["F3"].value == "=F2*0.02"
    assert drift(dues, "s_A") == 7500

    # the inbox gets the full Check: exact shares for both groups
    shares = {a.group_id: a.share for a in next(o for o in d.check.outputs if o.cell == C6).attribution}
    assert shares == {payments.group_id: -7500, late_fee.group_id: 4000} and d.check.mode == "gate"
    assert dues.execute("SELECT status FROM edits WHERE id = ?", (d.edit_id,)).fetchone()["status"] == "PARTIAL"


def test_approve_commits_the_held_group(dues):
    d = gate.propose_edit(dues, "dues", PAYMENTS_AND_F3, "s_A")
    approved = gate.approve(dues, d.edit_id)
    assert approved.status == "APPROVED" and approved.committed_version == store.sha256(live())
    assert load_workbook(live())["LateFees"]["F3"].value == "=F2*0.04" and values(C6) == (282500,)
    assert drift(dues, "s_A") == 7500  # an approval is the approver's call, not session drift
    assert dues.execute("SELECT actor FROM audit_log WHERE action = 'approve'").fetchone()["actor"] == "approver"
    with pytest.raises(ValueError):
        gate.approve(dues, d.edit_id)  # nothing is held any more


def test_deny_leaves_the_file_alone(dues):
    d = gate.propose_edit(dues, "dues", PAYMENTS_AND_F3, "s_A")
    before = store.sha256(live())
    assert gate.deny(dues, d.edit_id).status == "DENIED" and store.sha256(live()) == before
    assert dues.execute("SELECT COUNT(*) FROM audit_log WHERE action = 'deny'").fetchone()[0] == 1
    with pytest.raises(ValueError):
        gate.approve(dues, d.edit_id)


def test_approve_refuses_when_the_held_cell_has_moved_on(dues):
    first = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    second = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.03"}], "s_1")
    assert (first.status, second.status) == ("HELD", "HELD")
    gate.approve(dues, second.edit_id)
    with pytest.raises(store.Conflict):
        gate.approve(dues, first.edit_id)
    assert load_workbook(live())["LateFees"]["F3"].value == "=F2*0.03"


def test_two_9000_groups_are_held_by_their_combined_effect(dues):
    ops = [{"op": "set_value", "cell": "Expenses!B2", "value": 18000},  # Security staff 9,000 -> 18,000
           {"op": "append_row", "sheet": "Expenses", "values": ["Painting", 9000]}]
    d = gate.propose_edit(dues, "dues", ops, "s_1")
    assert d.status == "HELD" and d.committed_version is None and len(d.groups) == 2
    for decision in d.groups:
        assert {i.cell: i.delta for i in decision.impacts} == {C6: 9000, C4: 0}  # each alone is under the limit
        assert decision.status == "HELD" and decision.reasons[0] == "Combined effect of passing groups exceeds limit"
    assert drift(dues, "s_1") == 0 and values(C6) == (286000,)
    assert next(o for o in d.check.outputs if o.cell == C6).delta_verified == 18000


def test_xlookup_edits_cannot_be_verified(home):
    store.register(home, JUDGE, "judge")
    feeds = gate.propose_edit(home, "judge", pay(5, 2500), "s_1")  # Payments!C5 feeds an XLOOKUP cell
    direct = gate.propose_edit(home, "judge", [{"op": "set_formula", "cell": "LateFees!C5", "formula": "=Payments!D5"}], "s_1")
    for d in (feeds, direct):
        assert d.status == "HELD" and d.committed_version is None
        assert [x.status for x in d.groups] == ["CANT_VERIFY_HELD"] and d.groups[0].impacts == []
        assert d.groups[0].reasons[0].startswith("Can't verify: ") and "XLOOKUP" in d.groups[0].reasons[0]
        assert d.check.coverage < 1
    assert store.sha256(live("judge")) == store.sha256(JUDGE)


def test_act_2_script(dues, capsys):
    script = json.loads((GOLDEN / "drift_steps.json").read_text(encoding="utf-8"))
    for session in script["sessions"]:
        for number, step in enumerate(session["steps"], start=1):
            d = gate.propose_edit(dues, "dues", step["ops"], session["session_id"])
            assert d.status == step["expect"]["status"], (session["session_id"], number)
            for cell, status in step["expect"].get("groups", {}).items():
                assert group(d, cell).status == status
        assert drift(dues, session["session_id"]) == session["drift"]
        gate.end_session(dues, session["session_id"])

    held = [d for d in gate.held(dues) if d.session_id == "s_B"]  # the 9th and 10th edit of session B
    assert len(held) == 2 and all("Session drift would reach ₹27,000, over the budget of ₹25,000" in d.groups[0].reasons
                                  for d in held)
    assert values(C6, C4) == (254500, 131500)  # 2,86,000 - 7,500 - 8 x 3,000; F3 is still held
    assert dues.execute("SELECT COUNT(*) FROM versions").fetchone()[0] == 10  # v2 + session A + 8 passes
    assert audit.verify(dues)["ok"] and dues.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0] >= 2

    timings = [json.loads(r["payload_json"]) for r in dues.execute("SELECT payload_json FROM audit_log WHERE action = 'propose_edit'")]
    decision = sorted(t["decision_ms"] for t in timings)
    p95 = decision[max(0, -(-95 * len(decision) // 100) - 1)]  # nearest rank
    with capsys.disabled():
        print(f"\ngate decision over {len(decision)} Act 2 edits: p50 {decision[len(decision) // 2]:.0f} ms, "
              f"p95 {p95:.0f} ms, max {decision[-1]:.0f} ms (limit 3000); "
              f"commit p50 {sorted(t['commit_ms'] for t in timings)[len(timings) // 2]:.0f} ms")
    assert p95 <= 3000


# --- saved values for committed versions: the LibreOffice sidecar ---------------------------------


def test_commit_gets_libreoffice_saved_values_in_the_background(dues, policy, monkeypatch):
    monkeypatch.delenv("DELTAGATE_SOFFICE")
    if not config.soffice():
        pytest.skip("LibreOffice not installed")
    d = gate.propose_edit(dues, "dues", pay(5, 2500), "s_1")
    version = dues.execute("SELECT * FROM versions WHERE sha256 = ?", (d.committed_version,)).fetchone()
    assert version["saved_by"] == "pending"  # propose_edit did not wait for LibreOffice

    store.drain()
    version = dues.execute("SELECT * FROM versions WHERE id = ?", (version["id"],)).fetchone()
    sidecar = store.saved_source(version)
    assert version["saved_by"] == "LibreOffice" and sidecar.name == f"{d.committed_version}.lo.xlsx"
    assert store.sha256(live()) == d.committed_version  # the committed file itself never changed

    held = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    v = held.check.verification  # the next Check verifies the base against LibreOffice's values, and says so
    assert (v.saved_by, v.matched, v.formula_cells, v.mismatched) == ("LibreOffice", 307, 307, [])
    assert next(o for o in held.check.outputs if o.cell == C6).base == 283500


def test_failed_libreoffice_run_is_labelled_none(dues, monkeypatch):
    monkeypatch.setenv("DELTAGATE_SOFFICE", str(config.data_dir() / "no-such-soffice.exe"))
    d = gate.propose_edit(dues, "dues", pay(5, 2500), "s_1")
    store.drain()
    version = dues.execute("SELECT * FROM versions WHERE sha256 = ?", (d.committed_version,)).fetchone()
    assert version["saved_by"] == "none" and store.saved_source(version) is None
    held = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    assert held.check.verification.saved_by == "none" and held.check.verification.matched == 0


# --- shadow and candidate files are cleaned up (P1 task 7) --------------------------------------------


def shadow_files(workbook_id="dues"):
    folder = config.store_dir() / workbook_id / "shadow"
    return sorted(p.name for p in folder.iterdir()) if folder.exists() else []


def test_shadow_files_are_cleaned_up_after_every_decision(dues):
    assert gate.propose_edit(dues, "dues", pay(5), "s_1").status == "PASS" and shadow_files() == []

    held = gate.propose_edit(dues, "dues", PAYMENTS_AND_F3, "s_2")  # PARTIAL: the shadow waits for the approver
    assert held.status == "PARTIAL" and shadow_files() == [f"{held.edit_id}.xlsx"]
    gate.approve(dues, held.edit_id)
    assert shadow_files() == []

    denied = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.03"}], "s_3")
    assert shadow_files() == [f"{denied.edit_id}.xlsx"]
    gate.deny(dues, denied.edit_id)
    assert shadow_files() == []


def test_a_failed_proposal_leaves_no_shadow(dues, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("engine failed")

    monkeypatch.setattr(gate.engine, "analyse", broken)
    with pytest.raises(RuntimeError):
        gate.propose_edit(dues, "dues", pay(5), "s_1")
    assert shadow_files() == []
    with pytest.raises(KeyError):
        gate.propose_edit(dues, "nope", pay(5), "s_1")
    assert not (config.store_dir() / "nope").exists()  # cleanup never creates folders for an unknown id


def test_a_refused_approval_keeps_the_shadow_for_deny(dues):
    first = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.04"}], "s_1")
    second = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.03"}], "s_1")
    gate.approve(dues, second.edit_id)
    with pytest.raises(store.Conflict):
        gate.approve(dues, first.edit_id)
    assert shadow_files() == [f"{first.edit_id}.xlsx"]  # still waiting: the approver can deny it
    gate.deny(dues, first.edit_id)
    assert shadow_files() == []


def test_every_approver_action_signs_a_checkpoint(dues):
    """Approve, deny and rollback each end with a signed checkpoint on their own entry, so the Audit tab shows
    one during the live demo (the MCP server, which signs at session end, keeps running)."""
    def signed_head():
        return dues.execute("SELECT MAX(seq) FROM checkpoints").fetchone()[0]

    def head():
        return dues.execute("SELECT MAX(seq) FROM audit_log").fetchone()[0]

    first = gate.propose_edit(dues, "dues", PAYMENTS_AND_F3, "s_A")
    assert signed_head() is None  # proposing is not an approver action
    gate.deny(dues, first.edit_id)
    assert signed_head() == head()

    second = gate.propose_edit(dues, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.03"}], "s_B")
    gate.approve(dues, second.edit_id)
    assert signed_head() == head()

    gate.rollback(dues, "dues")
    assert signed_head() == head()
    assert audit.verify(dues) == {"ok": True, "entries": head(), "checkpoints": 3, "error": None}


def test_new_session_cannot_reset_workbook_drift(dues, monkeypatch):
    """Smurfing: the per-session budget alone is reset by a fresh session id; the workbook window is not."""
    tight = config.load_policy().model_copy(update={"workbook_drift_budget": 20000})
    monkeypatch.setattr(config, "load_policy", lambda *a, **k: tight)
    statuses = [gate.propose_edit(dues, "dues", [{"op": "set_value", "cell": f"Payments!C{5 + 4 * n}", "value": 3000}],
                                  f"s_new{n}").status for n in range(8)]  # a new session per edit
    assert statuses == ["PASS"] * 6 + ["HELD"] * 2  # 6 x 3,000 = 18,000; the 7th would reach 21,000 > 20,000
    assert gate.held(dues)[0].groups[0].reasons[0].startswith("Workbook drift over the last 24 h would reach")
