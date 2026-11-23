"""Tests for scripts/demo_check.py: headless Acts 1-3 + REST API verification and latency reporting."""

import sys

import pytest

from conftest import ROOT

SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import demo_check  # noqa: E402


def test_percentile_nearest_rank():
    assert demo_check.percentile([100.0], 95) == 100.0
    assert demo_check.percentile([10.0, 20.0, 30.0, 40.0, 50.0], 50) == 30.0
    assert demo_check.percentile([10.0, 20.0, 30.0, 40.0, 50.0], 95) == 50.0
    with pytest.raises(ValueError):
        demo_check.percentile([], 95)


def test_warm_libreoffice_graceful_when_off(tmp_path, monkeypatch):
    monkeypatch.setenv("DELTAGATE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("DELTAGATE_SOFFICE", "off")
    res = demo_check.warm_libreoffice()
    assert res["warmed"] is False
    assert res["elapsed_ms"] is None


def test_demo_check_isolated_acts_1_to_3_and_api(monkeypatch):
    monkeypatch.setenv("DELTAGATE_SOFFICE", "off")
    report = demo_check.run_all(isolated=True, skip_warm=True, bench_runs=1, use_api=True)
    assert report["act1"]["c6_delta"] == 42000
    assert report["act1"]["data_share"] == 38000
    assert report["act1"]["logic_share"] == 4000
    assert report["act2"]["api_group1_checked"] is True
    assert report["act2"]["session_a_status"] == "PARTIAL"
    assert report["act2"]["session_b_9th_status"] == "HELD"
    assert report["act2"]["audit_ok"] is True
    assert report["act3"]["c6_verified"] == 38000
    assert report["act3"]["c6_unverified"] == 4000
    assert report["perf"]["check_max_ms"] < demo_check.CHECK_LIMIT_MS
    assert report["perf"]["gate_decision_p95_ms"] <= demo_check.GATE_P95_LIMIT_MS
