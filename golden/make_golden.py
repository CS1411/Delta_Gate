"""Build the demo workbooks: dues_v2.xlsx, dues_v3_REAL.xlsx, judge_xlookup.xlsx.

Run:  cd backend && uv run python ../golden/make_golden.py
Then: bash golden/recalc.sh   (LibreOffice fills in cached values), then re-save in Excel.

WARNING: openpyxl writes formulas without cached values, so re-running this script
un-freezes the golden files. Re-run recalc.sh (and the Excel save) afterwards.

Design (numbers asserted below):
  Summary!C6 Total pending dues = Billed + Expense recovery + Late fees - Collected
  v2: 3,45,000 + 37,000 + 4,000 - 1,00,000 = 2,86,000
  v3: +38,000 (new expense row) +4,000 (late fee 2% -> 4% of 2,00,000) = 3,28,000
      and Summary!C4 (Collected) typed over with its own value 1,00,000 (delta 0).
Only allowlisted functions (SUM, INDEX, MATCH, VLOOKUP, IF), bounded ranges, no ROUND.
"""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

HERE = Path(__file__).resolve().parent
N = 60  # flats, rows 2..61
LAST = N + 1
RATE = 5  # rupees per sq ft
INR = r"[>=10000000]##\,##\,##\,##0;[>=100000]##\,##\,##0;##,##0"  # Indian digit grouping

# Category per flat, repeating every 12 flats: O = overdue, N = not yet due (unpaid), P = paid in full.
# Row 5 (index 3) is an "N" flat, so the contract example edit Payments!C5 = 2500 makes sense.
PATTERN = "POPNOPONOPON"
assert len(PATTERN) == 12 and PATTERN.count("O") == 5 and PATTERN.count("N") == 3 and PATTERN[3] == "N"

OWNERS = ["Iyer", "Sharma", "Khan", "D'Souza", "Patel", "Reddy", "Banerjee", "Singh", "Nair", "Joshi", "Mehta", "Das"]
INITIALS = "ARSKMPVNDG"

EXPENSES = [
    ("Security staff", 9000),
    ("Housekeeping", 6000),
    ("Common-area electricity", 5500),
    ("Water tanker", 3500),
    ("Garden upkeep", 2000),
    ("Lift AMC", 4000),
    ("Generator diesel", 2500),
    ("Pest control", 1500),
    ("Accountant fee", 2000),
    ("Minor repairs", 1000),
]
LIFT_REPAIR = ("Lift repair", 38000)


def flats():
    """60 rows of (flat_no, owner, area, overdue, paid, mode). Deterministic."""
    rows, seen = [], {"O": 0, "N": 0, "P": 0}
    for i in range(N):
        block, floor, unit = "ABC"[i // 20], (i % 20) // 4 + 1, i % 4 + 1
        flat_no = f"{block}-{floor}0{unit}"
        owner = f"{INITIALS[i % 10]}. {OWNERS[(i * 7) % 12]}"
        cat = PATTERN[i % 12]
        k = seen[cat]
        seen[cat] += 1
        if cat == "O":  # 25 overdue flats: balances total 2,00,000
            area = (1800, 1800, 1600, 1600, 1400)[k % 5]
            paid = 1000 if k % 5 == 4 else 0  # five part-payers
            mode = "UPI" if paid else "-"
        elif cat == "N":  # 15 flats billed 3,000, not yet due, nothing paid: the Act 2 edit targets
            area, paid, mode = 600, 0, "-"
        else:  # 20 flats paid in full
            area = 800 if k % 4 == 3 else 1000
            paid, mode = area * RATE, ("UPI", "NEFT", "Cheque")[k % 3]
        rows.append((flat_no, owner, area, "Y" if cat == "O" else "N", paid, mode))
    return rows


def header(ws, titles, widths):
    ws.append(titles)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for col, width in zip("ABCDEFGH", widths):
        ws.column_dimensions[col].width = width


def build(variant: str) -> Workbook:
    """variant: 'v2' | 'v3' | 'judge' (judge = v3 with XLOOKUP on the late-fee path)."""
    rows = flats()
    wb = Workbook()

    ws = wb.active
    ws.title = "Flats"
    header(ws, ["Flat No", "Owner", "Area (sq ft)", "Monthly dues", "Overdue"], [10, 16, 13, 14, 9, 3, 16, 8])
    ws["G1"], ws["H1"] = "Rate per sq ft", RATE
    for r, (flat_no, owner, area, overdue, _, _) in enumerate(rows, start=2):
        ws.append([flat_no, owner, area, f"=C{r}*$H$1", overdue])

    ws = wb.create_sheet("Payments")
    header(ws, ["Flat No", "Mode", "Amount paid", "Balance"], [10, 10, 13, 12])
    for r, (flat_no, _, _, _, paid, mode) in enumerate(rows, start=2):
        balance = f"=INDEX(Flats!$D$2:$D${LAST},MATCH(A{r},Flats!$A$2:$A${LAST},0))-C{r}"
        ws.append([flat_no, mode, paid, balance])

    ws = wb.create_sheet("Expenses")
    header(ws, ["Item", "Amount"], [28, 12])
    for item in EXPENSES + ([LIFT_REPAIR] if variant != "v2" else []):
        ws.append(list(item))

    ws = wb.create_sheet("LateFees")
    header(ws, ["Flat No", "Overdue", "Balance", "Overdue amount", "Item", "Amount"], [10, 9, 12, 15, 14, 12])
    for r, (flat_no, *_) in enumerate(rows, start=2):
        if variant == "judge":
            balance = f"=_xlfn.XLOOKUP(A{r},Payments!$A$2:$A${LAST},Payments!$D$2:$D${LAST})"
        else:
            balance = f"=Payments!D{r}"
        overdue = f"=VLOOKUP(A{r},Flats!$A$2:$E${LAST},5,0)"
        ws.append([flat_no, overdue, balance, f'=IF(B{r}="Y",C{r},0)'])
    ws["E2"], ws["F2"] = "Overdue total", f"=SUM(D2:D{LAST})"
    ws["E3"], ws["F3"] = "Late fee", "=F2*0.02" if variant == "v2" else "=F2*0.04"

    collected = sum(paid for *_, paid, _ in rows)
    ws = wb.create_sheet("Summary")
    header(ws, ["", "Item", "Amount (Rs)"], [3, 40, 14])
    ws.append(["", "Maintenance billed", f"=SUM(Flats!D2:D{LAST})"])
    ws.append(["", "Expense recovery (charged to members)", "=SUM(Expenses!B2:B40)"])
    # v3 plants the structural break: the Collected formula is typed over with its own current value.
    ws.append(["", "Collected", f"=SUM(Payments!C2:C{LAST})" if variant == "v2" else collected])
    ws.append(["", "Late fees", "=LateFees!F3"])
    ws.append(["", "Total pending dues", "=C2+C3+C5-C4"])
    ws["B6"].font = ws["C6"].font = Font(bold=True)

    for sheet, cells in (("Summary", "C2:C6"), ("LateFees", "F2:F3")):
        for (cell,) in wb[sheet][cells]:
            cell.number_format = INR
    return wb


def expected(variant: str) -> dict:
    """The same arithmetic in plain Python: what the workbook must show once recalculated."""
    rows = flats()
    billed = sum(area * RATE for _, _, area, *_ in rows)
    collected = sum(paid for *_, paid, _ in rows)
    overdue = sum(area * RATE - paid for _, _, area, flag, paid, _ in rows if flag == "Y")
    expenses = sum(a for _, a in EXPENSES) + (LIFT_REPAIR[1] if variant != "v2" else 0)
    late_fee = overdue * (2 if variant == "v2" else 4) // 100
    return {
        "Summary!C2": billed,
        "Summary!C3": expenses,
        "Summary!C4": collected,
        "Summary!C5": late_fee,
        "Summary!C6": billed + expenses + late_fee - collected,
        "LateFees!F2": overdue,
        "LateFees!F3": late_fee,
    }


FILES = {"v2": "dues_v2.xlsx", "v3": "dues_v3_REAL.xlsx", "judge": "judge_xlookup.xlsx"}

if __name__ == "__main__":
    rows = flats()
    assert [sum(1 for r in rows if r[3] == "Y"), sum(1 for r in rows if r[4] == 0 and r[3] == "N")] == [25, 15]
    v2, v3 = expected("v2"), expected("v3")
    assert v2 == {"Summary!C2": 345000, "Summary!C3": 37000, "Summary!C4": 100000, "Summary!C5": 4000,
                  "Summary!C6": 286000, "LateFees!F2": 200000, "LateFees!F3": 4000}, v2
    assert v3["Summary!C6"] == 328000 and v3["Summary!C4"] == 100000 and v3["LateFees!F3"] == 8000, v3
    assert expected("judge") == v3
    for variant, name in FILES.items():
        build(variant).save(HERE / name)
        print(f"{name:22s} expected Summary!C6 = {expected(variant)['Summary!C6']:,}")
    print("No cached values yet: run golden/recalc.sh")
