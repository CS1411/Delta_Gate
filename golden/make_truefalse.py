"""Build truefalse.xlsx: the golden test for TRUE / FALSE (literals and the TRUE() / FALSE() spelling
LibreOffice writes) inside VLOOKUP, IF, AND, OR, NOT.

Run:  cd backend && uv run python ../golden/make_truefalse.py
Then: powershell -File golden\\excel_resave.ps1 -Files truefalse.xlsx -Sheets Cases
The committed file is the Excel-saved one. tests/test_golden.py compares the engine with every saved value.
Kept apart from make_golden.py so the frozen dues workbooks are never rewritten.
"""

from pathlib import Path

from openpyxl import Workbook

TABLE = "$A$2:$B$6"  # sorted keys 10..50 -> 100..500
CASES = [  # (label, formula); D2 = 30 (a key), D3 = 35 (between keys), D4 = 5, D5 = -3
    ("exact match, found", f"=VLOOKUP(D2,{TABLE},2,FALSE)"),
    ("exact match, not found", f"=IFERROR(VLOOKUP(D3,{TABLE},2,FALSE),-1)"),
    ("exact match, FALSE()", f"=VLOOKUP(D2,{TABLE},2,FALSE())"),
    ("approximate match, TRUE", f"=VLOOKUP(D3,{TABLE},2,TRUE)"),
    ("approximate match, TRUE()", f"=VLOOKUP(D3,{TABLE},2,TRUE())"),
    ("approximate match, omitted", f"=VLOOKUP(D3,{TABLE},2)"),
    ("IF gives TRUE", "=IF(D4>0,TRUE,FALSE)"),
    ("IF gives FALSE", "=IF(D5>0,TRUE,FALSE)"),
    ("IF gives TRUE()", "=IF(D4>0,TRUE(),FALSE())"),
    ("IF on TRUE", "=IF(TRUE,D2,D3)"),
    ("IF on FALSE", "=IF(FALSE,D2,D3)"),
    ("AND with TRUE", "=AND(TRUE,D4>0)"),
    ("AND with FALSE", "=AND(D4>0,FALSE)"),
    ("AND of literals", "=AND(TRUE,TRUE)"),
    ("OR with FALSE", "=OR(FALSE,D5>0)"),
    ("OR with TRUE", "=OR(TRUE,D5>0)"),
    ("OR of literals", "=OR(FALSE,FALSE)"),
    ("NOT FALSE", "=NOT(FALSE)"),
    ("NOT TRUE()", "=NOT(TRUE())"),
    ("boolean cell into IF (true)", "=IF(F8,100,0)"),
    ("boolean cell into IF (false)", "=IF(F9,100,0)"),
    ("boolean cell into AND", "=IF(AND(F8,TRUE),1,0)"),
    ("boolean cell into OR", "=IF(OR(F9,FALSE),1,0)"),
]
APPROXIMATE = {f"Cases!F{row}" for row, (label, _) in enumerate(CASES, start=2) if label.startswith("approximate")}


def build() -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Cases"
    ws.append(["Key", "Value", None, "Input", "Case", "Result"])
    for i, key in enumerate((10, 20, 30, 40, 50), start=2):
        ws[f"A{i}"], ws[f"B{i}"] = key, key * 10
    for i, value in enumerate((30, 35, 5, -3), start=2):
        ws[f"D{i}"] = value
    for row, (label, formula) in enumerate(CASES, start=2):
        ws[f"E{row}"], ws[f"F{row}"] = label, formula
    last = len(CASES) + 1
    ws[f"E{last + 1}"], ws[f"F{last + 1}"] = "numbers downstream", f"=SUM(F21:F{last})"
    return wb


if __name__ == "__main__":
    assert CASES[6][0] == "IF gives TRUE" and CASES[7][0] == "IF gives FALSE"  # F8 and F9, used further down
    build().save(Path(__file__).resolve().parent / "truefalse.xlsx")
    print("truefalse.xlsx written without saved values: run golden/excel_resave.ps1 -Files truefalse.xlsx -Sheets Cases")
