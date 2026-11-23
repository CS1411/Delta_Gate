"""REST API, group 1 (approvals): over HTTP with the FastAPI test client, on a real gate and a real database."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from conftest import V2
from deltagate import api, config, mcp_server
from deltagate.gate import audit, gate, store
from deltagate.models import Decision

F3 = "LateFees!F3"
SESSION_A = [
    {"op": "set_value", "cell": "Payments!C5", "value": 2500},
    {"op": "set_value", "cell": "Payments!C9", "value": 2500},
    {"op": "set_value", "cell": "Payments!C13", "value": 2500},
    {"op": "set_formula", "cell": F3, "formula": "=F2*0.04"},
]


@pytest.fixture
def client(home):
    store.register(home, V2, "dues")
    return TestClient(api.app)


@pytest.fixture
def held(home, client):
    """Session A from the Act 2 script: payments PASS and committed, F3 HELD."""
    decision = gate.propose_edit(home, "dues", SESSION_A, "s_A")
    assert decision.status == "PARTIAL"
    return decision


def test_inbox_lists_the_held_edit_as_the_model(client, held):
    r = client.get("/api/edits", params={"status": "held"})
    assert r.status_code == 200
    assert r.json() == [held.model_dump(mode="json")]  # as-is: nothing formatted, nothing added
    assert Decision.model_validate(r.json()[0]).groups[1].status == "HELD"


def test_inbox_only_knows_held(client):
    assert client.get("/api/edits", params={"status": "all"}).status_code == 422
    assert client.get("/api/edits").json() == []


def test_approve_commits_the_held_group(home, client, held):
    before = store.current(home, "dues", config.load_policy())[0]["sha256"]
    r = client.post(f"/api/edits/{held.edit_id}/approve")
    assert r.status_code == 200
    body = Decision.model_validate(r.json())
    assert body.status == "APPROVED" and body.committed_version and body.committed_version != before
    assert client.get("/api/edits").json() == []


def test_deny_leaves_the_file_alone(home, client, held):
    now = store.current(home, "dues", config.load_policy())[0]["sha256"]
    r = client.post(f"/api/edits/{held.edit_id}/deny")
    assert r.status_code == 200 and r.json()["status"] == "DENIED"
    assert store.current(home, "dues", config.load_policy())[0]["sha256"] == now
    assert audit.verify(home)["ok"]


def test_acting_twice_is_a_409_with_the_gates_message(client, held):
    assert client.post(f"/api/edits/{held.edit_id}/deny").status_code == 200
    for action in ("approve", "deny"):
        r = client.post(f"/api/edits/{held.edit_id}/{action}")
        assert r.status_code == 409
        assert r.json() == {"detail": f"Edit '{held.edit_id}' is DENIED: nothing is waiting for approval"}


def test_conflict_when_the_held_cell_changed(home, client, held):
    # another edit lands on the held cell's neighbourhood: approve must refuse, not overwrite
    gate.propose_edit(home, "dues", [{"op": "set_formula", "cell": F3, "formula": "=F2*0.03"}], "s_other")
    other = next(d for d in gate.held(home) if d.session_id == "s_other")
    assert client.post(f"/api/edits/{other.edit_id}/approve").status_code == 200
    r = client.post(f"/api/edits/{held.edit_id}/approve")
    assert r.status_code == 409 and f"{F3} has changed since edit '{held.edit_id}' was proposed" in r.json()["detail"]


def test_unknown_edit_is_404(client):
    r = client.post("/api/edits/ed_nope/approve")
    assert r.status_code == 404 and "ed_nope" in r.json()["detail"]


def test_rollback_restores_and_marks_the_edit(home, client, held):
    approved = client.post(f"/api/edits/{held.edit_id}/approve").json()
    r = client.post("/api/workbooks/dues/rollback")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"workbook_id", "sha256", "saved_by", "source", "created_at"}
    assert body["workbook_id"] == "dues" and body["sha256"] != approved["committed_version"]
    assert gate.get_decision(home, held.edit_id).status == "ROLLED_BACK"


def test_rollback_with_nothing_earlier_is_409(client):
    r = client.post("/api/workbooks/dues/rollback")
    assert r.status_code == 409 and "no earlier version" in r.json()["detail"]
    assert client.post("/api/workbooks/nope/rollback").status_code == 404


def test_null_stays_null(client, held):
    check = client.get("/api/edits").json()[0]["check"]
    assert check is not None
    for o in check["outputs"]:  # the demo outputs have values; a null would arrive as null, never 0
        assert o["base"] is None or isinstance(o["base"], (int, float))
    assert api.app.openapi()["components"]["schemas"]["Output"]["properties"]["base"]["anyOf"][-1] == {"type": "null"}


def test_approver_actions_are_rest_only_never_mcp():
    names = {t.name for t in asyncio.run(mcp_server.server.list_tools())}
    assert names == {"read_range", "impact_preview", "explain_delta", "propose_edit", "get_decision"}
    assert not {"approve", "deny", "rollback"} & names
    assert not any(hasattr(mcp_server, n) for n in ("approve", "deny", "rollback"))
    paths = {(m, p) for p, ops in api.app.openapi()["paths"].items() for m in ops}
    assert {("post", "/api/edits/{edit_id}/approve"), ("post", "/api/edits/{edit_id}/deny"),
            ("post", "/api/workbooks/{workbook_id}/rollback"), ("get", "/api/edits")} <= paths
