"""Session Audit (P3 #2): snapshot before an in-Excel AI session, Check after it."""

import pytest

from conftest import V2, V3
from deltagate import session_audit

C6, C4 = "Summary!C6", "Summary!C4"


def test_snapshot_then_complete_is_a_check_of_the_session(home, policy, tmp_path):
    snap = session_audit.snapshot(V2)
    assert snap.snapshot_id.startswith("sa_")
    assert session_audit.path_of(snap.snapshot_id).read_bytes() == V2.read_bytes()  # exact copy, saved values kept

    result = session_audit.complete(snap.snapshot_id, V3, policy)
    assert result.mode == "session_audit"
    assert result.base_version == snap.sha256
    assert result.verification.saved_by == "Microsoft Excel"
    out = next(o for o in result.outputs if o.cell == C6)
    assert (out.base, out.new, out.delta_verified) == (286000, 328000, 42000)
    assert sorted(a.share for a in out.attribution if a.share) == [4000, 38000]
    lost = [f for f in result.structural if f.kind == "lost_link"]
    assert [(f.cell, f.output) for f in lost] == [(C4, C4)]


def test_the_snapshot_does_not_follow_the_original_file(home, policy, tmp_path):
    work = tmp_path / "work.xlsx"
    work.write_bytes(V2.read_bytes())
    snap = session_audit.snapshot(work)
    work.write_bytes(V3.read_bytes())  # the AI session edits the file in place
    out = next(o for o in session_audit.complete(snap.snapshot_id, work, policy).outputs if o.cell == C6)
    assert out.delta_verified == 42000


@pytest.mark.parametrize("bad", ["sa_missing0000", "../../etc/passwd", "sa_../x", ""])
def test_unknown_or_malformed_ids_are_refused(home, policy, bad):
    with pytest.raises(KeyError):
        session_audit.complete(bad, V3, policy)
