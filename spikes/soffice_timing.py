"""How long does one LibreOffice headless round trip of dues_v2.xlsx take?

Run:  cd backend && uv run python ../spikes/soffice_timing.py
Decides Phase 2's commit path: p95 <= 1.5 s -> round trip inside the commit; otherwise commit at once
and fill in saved values from a background sidecar file. Uses its own LibreOffice profile, as the
server does, so an open LibreOffice window cannot interfere. The first run creates that profile.
"""

import statistics
import subprocess
import tempfile
import time
from pathlib import Path

from openpyxl import load_workbook

SOFFICE = r"C:\Program Files\LibreOffice\program\soffice.exe"
V2 = Path(__file__).resolve().parents[1] / "golden" / "dues_v2.xlsx"

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    src = tmp / "candidate.xlsx"
    load_workbook(V2).save(src)  # what the server commits: openpyxl-written, no saved values
    profile = (tmp / "profile").as_uri()
    times = []
    for run in range(6):
        start = time.perf_counter()
        subprocess.run([SOFFICE, f"-env:UserInstallation={profile}", "--headless", "--calc", "--convert-to", "xlsx",
                        "--outdir", str(tmp / f"out{run}"), str(src)], check=True, capture_output=True, timeout=120)
        times.append(time.perf_counter() - start)
        value = load_workbook(tmp / f"out{run}" / "candidate.xlsx", data_only=True)["Summary"]["C6"].value
        print(f"run {run}{' (creates the profile)' if run == 0 else ''}: {times[-1]:.2f} s   Summary!C6 = {value}")
    warm = sorted(times[1:])
    print(f"5 warm runs: p50 {statistics.median(warm):.2f} s, p95 {warm[-1]:.2f} s (max of 5), first run {times[0]:.2f} s")
