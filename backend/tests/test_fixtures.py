"""frontend/src/fixtures/*.json are real engine / gate output (scripts/dump_fixtures.py). These tests stop them rotting:
each one is regenerated in a temp dir, must parse back into its model, and must equal the committed file byte for byte.

The script freezes uuid / clock / zip times process-wide, so it runs in a child process, never in pytest's."""

import subprocess
import sys

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from conftest import ROOT
from deltagate.gate import audit
from deltagate.models import AuditLog, CheckResult, Decision

SCRIPT = ROOT / "scripts" / "dump_fixtures.py"
COMMITTED = ROOT / "frontend" / "src" / "fixtures"
MODELS = {
    "check_v2_v3.json": CheckResult,
    "check_judge_xlookup.json": CheckResult,
    "decision_session_a.json": Decision,
    "decision_session_b.json": Decision,
    "audit.json": AuditLog,
}


@pytest.fixture(scope="module")
def regenerated(tmp_path_factory):
    out = tmp_path_factory.mktemp("fixtures")
    run = subprocess.run([sys.executable, str(SCRIPT), "--out", str(out)], capture_output=True, text=True, timeout=300)
    assert run.returncode == 0, run.stderr
    return out


@pytest.mark.parametrize("name", MODELS)
def test_fixture_parses_and_matches_committed_file(name, regenerated):
    fresh = (regenerated / name).read_bytes()
    MODELS[name].model_validate_json(fresh)
    assert (COMMITTED / name).read_bytes() == fresh, f"{name} is stale: re-run `uv run python ../scripts/dump_fixtures.py`"


@pytest.fixture(scope="module")
def fx(regenerated):
    return {name: model.model_validate_json((regenerated / name).read_bytes()) for name, model in MODELS.items()}


def output(result, cell):
    return next(o for o in result.outputs if o.cell == cell)


def test_check_v2_v3_demo_numbers(fx):
    result = fx["check_v2_v3.json"]
    c6, c4 = output(result, "Summary!C6"), output(result, "Summary!C4")
    assert (c6.base, c6.new, c6.delta_observed) == (286000, 328000, 42000)
    assert (c4.base, c4.new) == (100000, 100000)
    kind = {g.group_id: g.type for g in result.groups}
    by_type = {kind[a.group_id]: a for a in c6.attribution}
    assert (by_type["data"].share, by_type["logic"].share) == (38000, 4000)
    assert sum(a.share for a in c6.attribution) == pytest.approx(42000, abs=1e-9)
    assert all(a.interaction == 0 for a in c6.attribution)
    assert any(f.kind == "typed_over_formula" and f.cell == "Summary!C4" for f in result.structural)
    assert result.verification.saved_by == "Microsoft Excel" and result.coverage == 1.0


def test_lost_link_is_on_c4_not_c6(fx):
    lost = [f for f in fx["check_v2_v3.json"].structural if f.kind == "lost_link"]
    assert [(f.cell, f.output, f.message) for f in lost] == [
        ("Summary!C4", "Summary!C4", "Collected no longer depends on Payments!C (Amount paid)")]


def test_judge_is_partial(fx):
    result = fx["check_judge_xlookup.json"]
    c6 = output(result, "Summary!C6")
    assert (c6.delta_observed, c6.delta_verified, c6.delta_unverified) == (42000, 38000, 4000)
    assert result.coverage < 1 and result.unverifiable
    assert any(u.reason == "XLOOKUP" for u in result.unverifiable)


def test_session_a_is_partial(fx):
    d = fx["decision_session_a.json"]
    assert d.status == "PARTIAL" and d.committed_version and d.check is not None
    assert [g.status for g in d.groups] == ["PASS", "HELD"]
    assert d.groups[1].reasons == ["Protected cell LateFees!F3 was edited directly (formula changed)"]


def test_session_b_is_held_by_drift(fx):
    d = fx["decision_session_b.json"]
    assert d.status == "HELD" and d.committed_version is None
    assert d.groups[0].reasons == ["Session drift would reach ₹27,000, over the budget of ₹25,000"]


def test_audit_chain_and_signatures_verify(fx):
    log = fx["audit.json"]
    assert log.checkpoints and log.entries
    prev, hashes = audit.GENESIS, {}
    for e in log.entries:
        row = {"seq": e.seq, "ts": e.ts, "actor": e.actor, "action": e.action, "payload_json": audit.canonical(e.payload)}
        assert e.prev_hash == prev and e.hash == audit._hash(prev, row)
        hashes[e.seq] = prev = e.hash
    public = Ed25519PrivateKey.from_private_bytes(bytes(range(32))).public_key()
    for cp in log.checkpoints:
        assert hashes[cp.seq] == cp.head_hash
        public.verify(bytes.fromhex(cp.signature), audit._signed(cp.seq, cp.head_hash, cp.ts))
