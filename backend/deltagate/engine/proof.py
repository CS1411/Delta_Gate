"""Proof workbook: the base file with exactly one change group applied, formulas intact.

It is flagged to recalculate fully on open, so Excel (or LibreOffice) computes the solo effect itself.
"""

from pathlib import Path

from openpyxl import load_workbook


def proof_workbook(base_path: Path | str, new_path: Path | str, cells: list[str], out_path: Path | str) -> Path:
    """Copy the new file's content at `cells` (a group's cells) onto the base and save to out_path."""
    wb, new = load_workbook(base_path), load_workbook(new_path)  # formulas, not saved values
    for address in cells:
        sheet, coordinate = address.rsplit("!", 1)
        target = wb[sheet] if sheet in wb.sheetnames else wb.create_sheet(sheet)
        target[coordinate] = new[sheet][coordinate].value if sheet in new.sheetnames else None
    wb.calculation.fullCalcOnLoad = True
    wb.save(out_path)
    return Path(out_path)
