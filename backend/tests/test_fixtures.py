"""frontend/src/fixtures/*.json are real engine / gate output (scripts/dump_fixtures.py). These tests stop them rotting:
each one is regenerated in a temp dir, must parse back into its model, and must equal the committed file field by field with hashes and
signatures normalised (the exact byte check is opt-in: DG_FIXTURE_EXACT=1).

The script freezes uuid / clock / zip times process-wide, so it runs in a child process, never in pytest's."""

import json
import os
import re
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
    "decision_cant_verify.json": Decision,
    "audit.json": AuditLog,
}


@pytest.fixture(scope="module")
def regenerated(tmp_path_factory):
    out = tmp_path_factory.mktemp("fixtures")
    run = subprocess.run([sys.executable, str(SCRIPT), "--out", str(out)], capture_output=True, text=True, timeout=300)
    assert run.returncode == 0, run.stderr
    return out


SHA256 = re.compile(r"^[0-9a-f]{64}$")


def normalise(node):
    """Field-wise form of a fixture: every sha256 becomes "<sha256>" and every Ed25519 signature "<sig>".
    Everything else (money, labels, statuses, ids, order) is kept, so only platform-dependent bytes are ignored."""
    if isinstance(node, dict):
        return {k: "<sig>" if k == "signature" and isinstance(v, str) else normalise(v) for k, v in node.items()}
    if isinstance(node, list):
        return [normalise(v) for v in node]
    if isinstance(node, str) and SHA256.match(node):
        return "<sha256>"
    return node


def same(a, b) -> bool:
    return normalise(a) == normalise(b)


@pytest.mark.parametrize("name", MODELS)
def test_fixture_parses_and_matches_committed_file_fieldwise(name, regenerated):
    """Runs everywhere. A .xlsx is a zip, so version hashes (and the audit chain and signatures built on them)
    are not reproducible across platforms; everything else must match."""
    fresh = (regenerated / name).read_bytes()
    MODELS[name].model_validate_json(fresh)
    MODELS[name].model_validate_json((COMMITTED / name).read_bytes())
    assert same(json.loads(fresh), json.loads((COMMITTED / name).read_bytes())), \
        f"{name} is stale: re-run `uv run python ../scripts/dump_fixtures.py`"


@pytest.mark.skipif(os.environ.get("DG_FIXTURE_EXACT") != "1",
                    reason="exact byte check is opt-in (DG_FIXTURE_EXACT=1): .xlsx zip bytes, and so the version "
                           "hashes and audit chain built on them, are not reproducible across platforms")
@pytest.mark.parametrize("name", MODELS)
def test_fixture_is_byte_identical(name, regenerated):
    assert (COMMITTED / name).read_bytes() == (regenerated / name).read_bytes()


def _mutated(name, edit):
    data = json.loads((COMMITTED / name).read_text(encoding="utf-8"))
    edit(data)
    return data


def test_normaliser_still_catches_real_drift():
    committed = {n: json.loads((COMMITTED / n).read_text(encoding="utf-8")) for n in MODELS}
    for n, data in committed.items():
        assert same(data, json.loads(json.dumps(data)))

    def money(d):
        next(o for o in d["outputs"] if o["cell"] == "Summary!C6")["delta_observed"] = 42001

    def label(d):
        d["groups"][0]["label"] = "New row in Expenses: Lift repairs"

    def status(d):
        d["groups"][0]["status"] = "HELD"

    def hashes_only(d):
        d["base_version"] = "0" * 64

    check, decision = "check_v2_v3.json", "decision_session_a.json"
    assert not same(committed[check], _mutated(check, money))
    assert not same(committed[check], _mutated(check, label))
    assert not same(committed[decision], _mutated(decision, status))
    assert same(committed[check], _mutated(check, hashes_only))  # a hash alone is not drift
    assert not same(committed["audit.json"], _mutated("audit.json", lambda d: d["entries"][0].update(action="x")))
    assert not same(committed["audit.json"], _mutated("audit.json", lambda d: d["entries"][1]["payload"].update(status="X")))


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


def test_cant_verify_card_has_no_number(fx):
    d = fx["decision_cant_verify.json"]
    assert d.status == "HELD" and d.committed_version is None
    assert d.groups[0].status == "CANT_VERIFY_HELD" and d.groups[0].impacts == []
    assert d.groups[0].reasons == ["Can't verify: LateFees!C2 (XLOOKUP)"]
