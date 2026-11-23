"""Judge's-own-file drill: three messy workbook pairs in golden/, built with openpyxl.

    cd backend && uv run python ../scripts/make_messy.py

  messy_1  merged header cells, blank rows between data, no key column
  messy_2  XLOOKUP, a dynamic-array function (SORT) and a user-defined name in the output chain; v3 renames a sheet
  messy_3  .xlsm with a VBA project, a hidden sheet, text-formatted numbers, an empty sheet

Each pair is messy_N_v2 / messy_N_v3. v3 = v2 + the ops in golden/messy_ops.json (applied the way the gate's
shadow copy applies them) + any change the gate cannot express (the sheet rename). Both files then go through
LibreOffice headless so they carry saved values (saved_by "LibreOffice"; we never claim Excel for these).
messy_3's VBA project is added after LibreOffice and is inert: a marker, never run by anything here.
Every pair has Summary!C4 (Collected) and Summary!C6 (Total pending dues), the outputs policy.yaml watches.
"""

import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "golden"
SOFFICE = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")
VBA_MARKER = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"delta-gate drill: inert VBA marker. Sub Workbook_Open(): End Sub"

OPS = {
    "messy_1": [
        {"op": "set_value", "cell": "Ledger!C5", "value": 2000},
        {"op": "append_row", "sheet": "Ledger", "values": ["Gupta", 3000, 0]},
    ],
    "messy_2": [
        {"op": "set_value", "cell": "Flats!C3", "value": 4000},
        {"op": "set_value", "cell": "Payments!B4", "value": 2500},
    ],
    "messy_3": [
        {"op": "set_value", "cell": "Data!B3", "value": 2000},
    ],
}


def messy_1() -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Ledger"
    ws["A1"] = "Maintenance register 2026"  # a title merged across the header row
    ws.merge_cells("A1:B1")
    ws["C1"], ws["D1"] = "Paid", "Due"
    ws.merge_cells("C1:D1")
    people = [("Rao", 3000, 3000), ("Iyer", 3000, 0), ("Shah", 4500, 1500), None, ("Rao", 3000, 0),
              ("Khan", 3000, 3000), None, None, ("Das", 4500, 4500), ("Iyer", 3000, 1000)]  # repeated names: no key
    for row, person in enumerate(people, start=3):
        if person:
            ws.cell(row, 1, person[0])
            ws.cell(row, 2, person[1])
            ws.cell(row, 3, person[2])
            ws.cell(row, 4, f"=B{row}-C{row}")
    last = 2 + len(people)
    s = wb.create_sheet("Summary")
    s["B4"], s["C4"] = "Collected", f"=SUM(Ledger!C3:C{last})"
    s["B6"], s["C6"] = "Total pending dues", f"=SUM(Ledger!D3:D{last})"
    return wb


def messy_2() -> Workbook:
    wb = Workbook()
    flats = wb.active
    flats.title = "Flats"
    flats.append(["Flat No", "Owner", "Billed"])
    for i, billed in enumerate([3000, 3000, 4500, 3000, 4500], start=1):
        flats.append([f"A-{100 + i}", f"Owner {i}", billed])
    pay = wb.create_sheet("Payments")
    pay.append(["Flat No", "Paid"])
    for i, paid in enumerate([3000, 0, 0, 1500, 4500], start=1):
        pay.append([f"A-{100 + i}", paid])
    exp = wb.create_sheet("Expenses")
    exp.append(["Item", "Amount"])
    for item in [("Security", 12000), ("Cleaning", 6000), ("Water", 4000)]:
        exp.append(list(item))
    late = wb.create_sheet("LateFees")
    late.append(["Flat No", "Paid (lookup)"])
    for r in range(2, 7):
        late.append([f"=Flats!A{r}", f"=_xlfn.XLOOKUP(A{r},Payments!$A$2:$A$6,Payments!$B$2:$B$6)"])
    s = wb.create_sheet("Summary")
    s["B2"], s["C2"] = "Billed", "=SUM(Flats!C2:C6)"
    s["B3"], s["C3"] = "Expenses", "=SUM(_xlfn._xlws.SORT(Expenses!B2:B4))"  # a dynamic-array function
    s["B4"], s["C4"] = "Collected", "=SUM(LateFees!B2:B6)"  # through XLOOKUP
    s["B5"], s["C5"] = "Late fee", "=C2*LateRate"  # a user-defined name
    s["B6"], s["C6"] = "Total pending dues", "=C2+C3+C5-C4"
    s["E1"], s["F1"] = "Late rate", 0.04
    wb.defined_names["LateRate"] = DefinedName("LateRate", attr_text="Summary!$F$1")
    return wb


def messy_2_extra(wb: Workbook) -> None:
    """What the gate cannot express: the Expenses sheet renamed to Costs (formulas follow, as in Excel)."""
    wb["Expenses"].title = "Costs"
    wb["Summary"]["C3"] = "=SUM(_xlfn._xlws.SORT(Costs!B2:B4))"


def messy_3() -> Workbook:
    wb = Workbook()
    data = wb.active
    data.title = "Data"
    data.append(["Flat No", "Paid", "Billed"])
    rows = [("1500", 3000), ("0", 3000), ("3000", 3000), (2500, 4500), ("4500", 4500)]
    for i, (paid, billed) in enumerate(rows, start=1):
        data.append([f"B-{i}", paid, billed])
        if isinstance(paid, str):
            data.cell(i + 1, 2).number_format = "@"  # typed as text: SUM skips it, as Excel does
    rates = wb.create_sheet("Rates")
    rates["A1"], rates["B1"] = "Surcharge", 1.1
    rates.sheet_state = "hidden"
    wb.create_sheet("Notes")  # empty
    s = wb.create_sheet("Summary")
    s["B4"], s["C4"] = "Collected", "=SUM(Data!B2:B6)"
    s["B6"], s["C6"] = "Total pending dues", "=(SUM(Data!C2:C6)-C4)*Rates!B1"
    return wb


def apply(wb: Workbook, ops: list[dict]) -> None:
    """The ops, applied like deltagate.gate.store.shadow (set a cell, or append a row)."""
    for op in ops:
        if op["op"] == "append_row":
            wb[op["sheet"]].append(op["values"])
        else:
            sheet, cell = op["cell"].split("!")
            wb[sheet][cell] = op.get("value", op.get("formula"))


def recalc(path: Path) -> None:
    """LibreOffice headless round trip in place, so the file carries saved values."""
    with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as profile:
        subprocess.run([str(SOFFICE), f"-env:UserInstallation={Path(profile).as_uri()}", "--headless", "--calc",
                        "--convert-to", "xlsx", "--outdir", out, str(path)], check=True, timeout=120,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.move(Path(out) / path.name, path)


def add_vba(src: Path, dst: Path) -> None:
    """Turn an .xlsx into an .xlsm with an (inert) VBA project part, laid out the way Excel does it."""
    main_xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
    main_xlsm = "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
    vba_rel = ('<Relationship Id="rIdVBA" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" '
               'Target="vbaProject.bin"/>')
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "[Content_Types].xml":
                text = data.decode().replace(main_xlsx, main_xlsm)
                text = re.sub(r"(<Types[^>]*>)",
                              r'\1<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>', text, count=1)
                data = text.encode()
            elif item.filename == "xl/_rels/workbook.xml.rels":
                data = data.decode().replace("</Relationships>", vba_rel + "</Relationships>").encode()
            zout.writestr(item, data)
        zout.writestr("xl/vbaProject.bin", VBA_MARKER)


def main() -> None:
    cases = {"messy_1": (messy_1, None), "messy_2": (messy_2, messy_2_extra), "messy_3": (messy_3, None)}
    manifest = {}
    for name, (build, extra) in cases.items():
        files = {}
        for version in ("v2", "v3"):
            wb = build()
            if version == "v3":
                apply(wb, OPS[name])
                if extra:
                    extra(wb)
            path = GOLDEN / f"{name}_{version}.xlsx"
            wb.save(path)
            recalc(path)
            if name == "messy_3":
                add_vba(path, path.with_suffix(".xlsm"))
                path.unlink()
                path = path.with_suffix(".xlsm")
            files[version] = path.name
            print(f"wrote {path.name}")
        manifest[name] = {"v2": files["v2"], "v3": files["v3"], "ops": OPS[name]}
    (GOLDEN / "messy_ops.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("wrote messy_ops.json")


if __name__ == "__main__":
    main()
