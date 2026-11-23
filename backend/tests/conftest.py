"""Shared fixtures: golden paths, the demo policy, a tamper helper and a tiny workbook builder."""

import re
import zipfile
from pathlib import Path

import pytest
from openpyxl import Workbook, load_workbook

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "golden"
V2, V3, JUDGE = GOLDEN / "dues_v2.xlsx", GOLDEN / "dues_v3_REAL.xlsx", GOLDEN / "judge_xlookup.xlsx"


@pytest.fixture(scope="session")
def policy():
    from deltagate.config import load_policy

    return load_policy(ROOT / "policy.yaml")


@pytest.fixture(scope="session")
def check_v3(policy):
    from deltagate.engine.check import check

    return check(V2, V3, policy)


@pytest.fixture(scope="session")
def check_judge(policy):
    from deltagate.engine.check import check

    return check(V2, JUDGE, policy)


@pytest.fixture
def home(tmp_path, monkeypatch):
    """A fresh runtime home (data/ + store/) with LibreOffice off, and a connection to its database."""
    from deltagate import db

    monkeypatch.setenv("DELTAGATE_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("DELTAGATE_SOFFICE", "off")
    conn = db.connect()
    yield conn
    conn.close()


def book(path: Path, sheets: dict[str, dict[str, object]]) -> Path:
    """Write a workbook from {sheet: {cell: content}}. openpyxl-written, so it has no cached values."""
    wb = Workbook()
    wb.remove(wb.active)
    for name, cells in sheets.items():
        ws = wb.create_sheet(name)
        for cell, content in cells.items():
            ws[cell] = content
    wb.save(path)
    return path


def tamper_cached(src: Path, dst: Path, sheet: str, old: str, new: str) -> Path:
    """Copy src to dst with one saved (cached) value rewritten in the sheet XML. Formulas untouched."""
    index = load_workbook(src).sheetnames.index(sheet) + 1
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == f"xl/worksheets/sheet{index}.xml":
                text, n = re.subn(f"<v>{old}</v>", f"<v>{new}</v>", data.decode())
                assert n == 1, f"expected exactly one <v>{old}</v>, found {n}"
                data = text.encode()
            zout.writestr(item, data)
    return dst
