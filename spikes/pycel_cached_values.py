"""Spike: does pycel trust cached values? Tamper the saved value of Summary!C6 and compare.

Run:  cd backend && uv run python ../spikes/pycel_cached_values.py ../golden/dues_v2.xlsx
Finding: compiled from a filename pycel returns the saved value (999); compiled from the
formulas-only openpyxl workbook it really computes (286000).
"""
import re
import sys
import tempfile
import zipfile
from pathlib import Path
from openpyxl import load_workbook
from pycel import ExcelCompiler
src = Path(sys.argv[1]); tmp = Path(tempfile.mkdtemp()) / "tampered.xlsx"
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    names = {s.title: f"xl/worksheets/sheet{i}.xml" for i, s in enumerate(load_workbook(src).worksheets, 1)}
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == names["Summary"]:
            text, n = re.subn(r"<v>286000</v>", "<v>999</v>", data.decode())
            assert n == 1, n
            data = text.encode()
        zout.writestr(item, data)
print("cached C6 in tampered file:", load_workbook(tmp, data_only=True)["Summary"]["C6"].value)
print("ExcelCompiler(filename=...).evaluate :", ExcelCompiler(filename=str(tmp)).evaluate("Summary!C6"))
print("ExcelCompiler(excel=formulas_wb)     :", ExcelCompiler(excel=load_workbook(tmp)).evaluate("Summary!C6"))
