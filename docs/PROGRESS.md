# Delta Gate — progress

_Last updated: 23 Nov 2026, end of Phase 0._

## Done (Phase 0)
- **Scaffold:** `backend/` (uv, Python 3.12, deps locked in `uv.lock`), `frontend/` (Vite React TS template, builds), `policy.yaml`, `.gitignore`.
- **Golden workbooks:** `golden/make_golden.py` builds `dues_v2.xlsx`, `dues_v3_REAL.xlsx`, `judge_xlookup.xlsx`; `golden/recalc.sh` fills cached values with LibreOffice headless.
- **Shapley:** `deltagate/engine/shapley.py` (pure, exact, ≤ 8 groups, one oracle call per coalition) + `tests/test_shapley.py` (spec worked example 300 = 207 + 93, solo 204 / 90, interaction +3 / +3; hypothesis: shares sum to Δ, symmetric groups equal; `v(∅) ≠ 0` rejected).
- **Golden tests:** `tests/test_golden.py` asserts saved values, allowlisted-functions-only, bounded ranges, the three planted changes.
- **Spikes:** `spikes/coalition_timing.py`, `spikes/pycel_cached_values.py`.
- `uv run pytest -q`: **15 passed**.

## Demo numbers (asserted in tests)
| Cell | v2 | v3 / judge |
|---|---|---|
| Summary!C2 Maintenance billed | 3,45,000 | 3,45,000 |
| Summary!C3 Expense recovery (charged to members) | 37,000 | 75,000 |
| Summary!C4 Collected | 1,00,000 (formula) | 1,00,000 (typed over) |
| Summary!C5 Late fees | 4,000 | 8,000 |
| **Summary!C6 Total pending dues** | **2,86,000** | **3,28,000** |
| LateFees!F2 Overdue total | 2,00,000 | 2,00,000 |

`C6 = C2 + C3 + C5 − C4`. Formula cells: 307 in v2, 306 in v3 and judge.

Spike output for v2 → v3 on Summary!C6:
```
expense_row            solo +38,000   share +38,000   interaction +0
late_fee_formula       solo  +4,000   share  +4,000   interaction +0
collected_typed_over   solo      +0   share      +0   interaction +0
sum of shares          +42,000
```

## Timing (pycel 1.0b30, Python 3.12.16, Windows 11 laptop, v2 workbook)
8 groups (6 data + 2 formula) = 256 coalitions, strategy from the build rules §6:

| Step | Time |
|---|---|
| Compile 4 models (one per formula-group subset) | ~975 ms (~245 ms each, includes `load_workbook`) |
| Evaluate 256 coalitions with `set_value` | ~133 ms (~0.5 ms each) |
| **Wall time** | **~1.1 s** |
| Naive: recompile for every coalition (estimated) | ~62 s |

The §6 strategy holds. Compile time dominates, so the number of formula groups is what matters: 3 formula groups → 8 compiles ≈ 2 s.

## pycel findings (each reproduced by a spike)
1. **pycel trusts cached values.** `ExcelCompiler(filename=...)` returns the file's saved value for a formula cell without computing it (tampered cached C6 = 999 → pycel returns 999). `ExcelCompiler(excel=openpyxl_workbook)` (formulas only) really computes (286000). **Phase 1 `recalc.py` / `verify.py` must always compile from the formulas-only workbook**, otherwise the check against saved values is circular. (`spikes/pycel_cached_values.py`)
2. **Appended row:** `set_value` on an empty cell inside a referenced range works with no reload (2,86,000 → 3,24,000). A cell outside every referenced range is not in pycel's cell map, cannot move the output, and is skipped; Phase 1 reports that as a structural finding.
3. **`set_value` needs the address in the cell map**, i.e. the output must be evaluated once before any value is set.
4. **`set_value(cell, None)` leaves dependents stale** (output stays 3,24,000). Clearing a cell back to empty needs the private `xl._reset(cell)`, which works. Phase 1 wraps this in one helper.
5. **Typed-over formula cannot be a `set_value`:** pycel keeps the old formula and recomputes it as soon as an upstream cell changes (2,83,500 instead of 2,86,000). Typed-over cells are **formula groups** (recompile). Confirms §6.
6. **Changed formula:** no public API to change a formula in a compiled model. Swapping `cell.formula` and calling `_reset` works only when the precedents are unchanged; not used. Recompile per formula subset. Confirms §6.
7. **SUMPRODUCT returns a numpy scalar** (`np.int64(34)`), correct value, wrong type. `spikes/pycel_function_check.py` prints FAIL for it only because of its `isinstance(v, (int, float))` check. The engine must coerce numpy scalars to Python numbers. Allowlist unchanged.

## File-format findings
- **`docProps/app.xml` Application strings seen:** openpyxl 3.1.5 writes `Microsoft Excel Compatible / Openpyxl 3.1.5`; LibreOffice writes `LibreOffice/26.8.3.1$Windows_X86_64 LibreOffice_project/…`. `parse.py` must match **exactly** `Microsoft Excel` for Excel and the `LibreOffice` prefix for LibreOffice. A substring match would label openpyxl-written files as Excel and break the honest-label rule. No cached values → `none`, whatever the app name says.
- **LibreOffice rewrites the literal `FALSE` as `FALSE()`** on save (seen in `VLOOKUP(…,5,FALSE)`). pycel evaluates it correctly. The golden files now use `0` as the exact-match flag so they are stable across apps. **Proposal for Phase 1:** add `TRUE` and `FALSE` to the allowlist, or every LibreOffice-saved file with a boolean literal becomes unverifiable.
- **XLOOKUP is stored as `_xlfn.XLOOKUP`.** Allowlist detection must strip the `_xlfn.` / `_xlws.` prefixes. LibreOffice 26.8 computes it (judge file has all 306 cached values).
- LibreOffice headless **does** compute values for openpyxl-written files (no cached values going in, all present coming out).

## Golden files: saved values
| File | Saved by | Formula cells with cached value | Summary!C6 | Summary!C4 |
|---|---|---|---|---|
| dues_v2.xlsx | LibreOffice 26.8.3.1 | 307 / 307 | 286000 | 100000 |
| dues_v3_REAL.xlsx | LibreOffice 26.8.3.1 | 306 / 306 | 328000 | 100000 |
| judge_xlookup.xlsx | LibreOffice 26.8.3.1 | 306 / 306 | 328000 | 100000 |

Excel re-save: _pending (see In progress)._

## In progress
- Re-save the three golden files in real Excel, then re-verify cached values and the app name.

## Decisions (with why)
- **Base value ₹2,86,000 → ₹3,28,000**, not the earlier example ₹1,86,000 → ₹2,28,000. Overdue total is fixed at ₹2,00,000 and is part of pending dues, so pending cannot be below ₹2,04,000 unless flats carry advance credits. Δ is unchanged (+₹42,000). The JSON example in the contracts section is illustrative only and was left as is.
- **Lost link fires on watched output `Summary!C4`** ("Collected no longer depends on Payments!C"), not on C6. C6 still reaches Payments!C through `LateFees!C → Payments!D`, so no lost link on C6 is the correct result. Build rules §7 and Prompt 1 acceptance were updated.
- **Bounded ranges only** in the golden files (`$A$2:$A$61` etc.); a test rejects whole-column references.
- **Act 2 edit targets:** 15 flats are billed ₹3,000, not yet due, nothing paid (Payments rows 5, 9, 13, …). A payment there moves Collected by +x and Total pending dues by −x exactly and does not touch the overdue total, so the drift arithmetic (8 × 3,000 = 24,000) is exact.
- **`judge_xlookup.xlsx`** = v3 with `LateFees!C2:C61` as XLOOKUP into Payments. The whole late-fee path becomes unverifiable; expected Phase 1 result: ₹38,000 verified, ₹4,000 unverified.
- **Expenses range is `Expenses!B2:B40`** so the appended row 12 is inside it. A row appended past row 40 would be the "range doesn't cover the new row" finding.
- **Coalition oracle shape:** `shapley(groups, v)` takes `v(frozenset) -> float` and calls it once per coalition; the engine precomputes `F(S)` for all S and passes a table lookup.
- **`pyyaml` added** to backend dependencies (needed for `policy.yaml`).
- **No package build step:** `pytest` uses `pythonpath = ["."]`; run commands work from `backend/`.
- **Branch:** work is on `phase-0-scaffold` (from `origin/main`), not pushed.

## Known issues
- **uv on this machine:** `uv sync` failed with "Missing expected target directory for Python minor version link". Workaround: `uv venv --python %APPDATA%\uv\python\cpython-3.12.16-windows-x86_64-none\python.exe`, then `uv sync`. May not affect other machines.
- Re-running `make_golden.py` strips cached values and un-freezes the golden files; `recalc.sh` and the Excel save must follow.
- The spec, the phase prompts and the build-rules file are kept local and are not committed yet (team decision pending). The four business documents at the repo root are also uncommitted.
- `golden/drift_steps.json` is Phase 2.

## Cut list status
Nothing cut. All Phase 0 fallbacks unused (Shapley exact mode works; coalition strategy is fast enough).
