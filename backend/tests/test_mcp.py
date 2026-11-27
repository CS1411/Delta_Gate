"""The agent's surface: exactly five MCP tools, none of them the approver's."""

import asyncio
import shutil

import pytest

from conftest import V2, V3
from deltagate import config, mcp_server
from deltagate.cli import main as cli_main
from deltagate.gate import store

C6, C4 = "Summary!C6", "Summary!C4"


@pytest.fixture
def dues(home):
    store.register(home, V2, "dues")
    return home


def test_exactly_five_tools_and_no_approver_tools():
    tools = {t.name: t for t in asyncio.run(mcp_server.server.list_tools())}
    assert set(tools) == {"read_range", "impact_preview", "explain_delta", "propose_edit", "get_decision"}
    for forbidden in ("approve", "deny", "rollback"):
        assert not hasattr(mcp_server, forbidden)  # not even importable from the agent-facing module

    assert "impact_preview" in tools["propose_edit"].description and "only way to write" in tools["propose_edit"].description
    assert "before" in tools["impact_preview"].description
    assert "impact_preview" in mcp_server.server.instructions and "propose_edit" in mcp_server.server.instructions
    ops = str(tools["propose_edit"].input_schema)  # the agent sees the three edit ops, typed
    assert all(op in ops for op in ("set_value", "set_formula", "append_row"))


def test_read_range(dues):
    got = mcp_server.read_range("dues", "Summary!B4:C6")
    assert got["version"] == store.sha256(V2) and got["saved_by"] == "Microsoft Excel" and got["unmanaged_change"] is None
    assert got["banner"] == "Verified against Excel's saved values"
    cells = {c["cell"]: c for c in got["cells"]}
    assert cells[C4] == {"cell": C4, "formula": "=SUM(Payments!C2:C61)", "value": 100000}
    assert cells[C6]["value"] == 286000 and cells["Summary!B6"] == {"cell": "Summary!B6", "value": "Total pending dues"}
    with pytest.raises(ValueError):
        mcp_server.read_range("dues", "C4")  # no sheet
    with pytest.raises(KeyError, match="Registered: dues"):
        mcp_server.read_range("nope", "Summary!C4")


def test_read_range_after_a_commit_uses_the_engine(dues):
    """A committed version has no saved values (LibreOffice is off here): values come from the engine, and say so."""
    mcp_server.propose_edit("dues", [{"op": "set_value", "cell": "Payments!C5", "value": 2500}], "s_1")
    got = mcp_server.read_range("dues", "Summary!C6")
    assert got["saved_by"] == "none" and got["cells"] == [{"cell": C6, "formula": "=C2+C3+C5-C4", "value": 283500}]
    assert got["banner"] == "Not verifiable against saved values"
    assert "engine" in got["values"]


def test_impact_preview(dues):
    got = mcp_server.impact_preview("dues", "Payments!C5")
    assert [w["cell"] for w in got["watched_outputs"]] == [C6, C4] and got["protected"] is False
    assert got["direct_dependents"] == ["Payments!D5", C4] and got["dependents"] > 4
    f3 = mcp_server.impact_preview("dues", "LateFees!F3")
    assert f3["protected"] is True and f3["content"] == "=F2*0.02" and [w["cell"] for w in f3["watched_outputs"]] == [C6]
    with pytest.raises(ValueError):
        mcp_server.impact_preview("dues", "Payments!C5:C9")


def test_propose_get_decision_and_explain_delta(dues):
    ops = [{"op": "set_value", "cell": "Payments!C5", "value": 2500},
           {"op": "set_formula", "cell": "LateFees!F3", "formula": "=F2*0.04"}]
    decision = mcp_server.propose_edit("dues", ops, "s_1")
    assert decision["status"] == "PARTIAL" and decision["unmanaged_change"] is None
    assert mcp_server.get_decision(decision["edit_id"])["status"] == "PARTIAL"

    explained = mcp_server.explain_delta(store.sha256(V2), decision["committed_version"])
    c6 = next(o for o in explained["outputs"] if o["cell"] == C6)
    assert (c6["base"], c6["delta_verified"]) == (286000, -2500) and explained["verification"]["saved_by"] == "Microsoft Excel"
    assert explained["banner"] == "Verified against Excel's saved values"
    with pytest.raises(KeyError):
        mcp_server.explain_delta("0" * 64, decision["committed_version"])


def test_unmanaged_change_is_reported_on_the_next_read(dues):
    shutil.copyfile(V3, config.store_dir() / "dues" / "current.xlsx")
    got = mcp_server.read_range("dues", "Summary!C6")
    change = got["unmanaged_change"]
    assert change["version"] == store.sha256(V3) and change["check_id"].startswith("chk_")
    assert {"cell": C6, "delta_observed": 42000, "delta_verified": 42000} in change["outputs"]
    assert got["cells"][0]["value"] == 328000 and mcp_server.read_range("dues", "Summary!C6")["unmanaged_change"] is None


def test_cli_register(home, capsys):
    assert cli_main(["register", str(V2), "--id", "dues"]) == 0
    assert "dues" in capsys.readouterr().out and store.workbooks(home) == ["dues"]


def test_over_real_stdio(dues, tmp_path):
    """The server as Claude Desktop runs it: a child process speaking MCP over stdin / stdout."""
    import json
    import os
    import sys

    from mcp import ClientSession, StdioServerParameters, stdio_client

    from deltagate.gate import audit

    params = StdioServerParameters(
        command=sys.executable, args=["-m", "deltagate.mcp_server"], cwd=str(config.ROOT / "backend"),
        env={"DELTAGATE_HOME": os.environ["DELTAGATE_HOME"], "DELTAGATE_SOFFICE": "off"})
    ops = json.loads((config.ROOT / "golden" / "drift_steps.json").read_text(encoding="utf-8"))["sessions"][0]["steps"][0]["ops"]

    async def talk():
        async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
            await session.initialize()
            names = sorted(t.name for t in (await session.list_tools()).tools)
            result = await session.call_tool("propose_edit", {"workbook_id": "dues", "ops": ops, "session_id": "s_A"})
            refused = await session.call_tool("propose_edit", {"workbook_id": "dues", "session_id": "s_A", "ops": [
                {"op": "set_value", "cell": "Payments!C5", "value": "=SUM(A1:A9)"}]})
            unknown = await session.call_tool("read_range", {"workbook_id": "society", "range": "Summary!C6"})
            return names, result, refused, unknown

    names, result, refused, unknown = asyncio.run(talk())
    assert names == ["explain_delta", "get_decision", "impact_preview", "propose_edit", "read_range"]
    decision = json.loads(result.content[0].text)
    assert not result.is_error and decision["status"] == "PARTIAL" and decision["committed_version"] == store.sha256(
        config.store_dir() / "dues" / "current.xlsx")
    assert refused.is_error  # a formula dressed as a value never reaches the file
    # the agent is told why, and which workbook ids exist, instead of a bare "Error executing tool"
    assert unknown.is_error and "Registered: dues" in unknown.content[0].text

    # the server process has exited: its session got a signed checkpoint on the way out
    actions = [r["action"] for r in dues.execute("SELECT action FROM audit_log ORDER BY seq")]
    assert actions == ["register", "propose_edit", "session_end"] and audit.verify(dues)["checkpoints"] == 1


@pytest.mark.parametrize("saved_by, wording", [
    ("Microsoft Excel", "Verified against Excel's saved values"),
    ("LibreOffice", "Verified against LibreOffice's saved values"),
    ("pending", "Not verifiable against saved values"),
    ("none", "Not verifiable against saved values"),
])
def test_banner_names_the_app_that_saved_the_values(saved_by, wording):
    from deltagate.engine.parse import banner

    assert banner(saved_by) == wording
