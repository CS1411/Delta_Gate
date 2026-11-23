"""Audit log: hash chain, Ed25519 checkpoints, verify()."""

from deltagate import config
from deltagate.gate import audit


def fill(conn, n):
    for i in range(n):
        audit.append(conn, "agent:s_1", "propose_edit", {"i": i, "note": "₹2,500"})


def test_untouched_log_verifies(home):
    fill(home, 3)
    audit.checkpoint(home)
    report = audit.verify(home)
    assert report == {"ok": True, "entries": 3, "checkpoints": 1, "error": None}
    rows = home.execute("SELECT seq, prev_hash, hash FROM audit_log ORDER BY seq").fetchall()
    assert rows[0]["prev_hash"] == audit.GENESIS
    assert [r["prev_hash"] for r in rows[1:]] == [r["hash"] for r in rows[:-1]]  # each entry chains to the one before
    assert config.key_path().exists()  # generated on first use


def test_tampered_row_fails(home):
    fill(home, 5)
    assert audit.verify(home)["ok"]
    home.execute("UPDATE audit_log SET payload_json = ? WHERE seq = 2", ('{"i":1,"note":"₹25,000"}',))
    report = audit.verify(home)
    assert not report["ok"] and "entry 2" in report["error"]


def test_deleted_row_fails(home):
    fill(home, 5)
    home.execute("DELETE FROM audit_log WHERE seq = 3")
    assert not audit.verify(home)["ok"]


def test_checkpoint_every_50_and_tampered_signature_fails(home):
    fill(home, 101)
    assert [r["seq"] for r in home.execute("SELECT seq FROM checkpoints ORDER BY seq")] == [50, 100]
    assert audit.verify(home) == {"ok": True, "entries": 101, "checkpoints": 2, "error": None}

    home.execute("UPDATE checkpoints SET signature = ? WHERE seq = 50", ("00" * 64,))
    report = audit.verify(home)
    assert not report["ok"] and "checkpoint 50" in report["error"]


def test_truncating_past_a_checkpoint_fails(home):
    """Rewriting history is only visible against something signed: the checkpoint remembers entry 50."""
    fill(home, 50)
    home.execute("DELETE FROM audit_log WHERE seq > 40")
    report = audit.verify(home)
    assert not report["ok"] and "checkpoint 50" in report["error"]
