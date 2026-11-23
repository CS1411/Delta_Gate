# Delta Gate — progress

_Last updated: 23 Nov 2026, end of Phase 1 (branch `phase-1-check`)._

## Done (Phase 0)
- **Scaffold:** `backend/` (uv, Python 3.12, deps locked in `uv.lock`), `frontend/` (Vite React TS template, builds), `policy.yaml`, `.gitignore`.
- **Golden workbooks:** `golden/make_golden.py` builds `dues_v2.xlsx`, `dues_v3_REAL.xlsx`, `judge_xlookup.xlsx`; `golden/recalc.sh` fills cached values with LibreOffice headless; `golden/excel_resave.ps1` re-saves them in real Excel over COM (CalculateFull, error scan, save, no EXCEL.EXE left behind). **The committed files are the Excel-saved ones.**
- **Shapley:** `deltagate/engine/shapley.py` (pure, exact, ≤ 8 groups, one oracle call per coalition) + `tests/test_shapley.py` (spec worked example 300 = 207 + 93, solo 204 / 90, interaction +3 / +3; hypothesis: shares sum to Δ, symmetric groups equal; `v(∅) ≠ 0` rejected).
- **Golden tests:** `tests/test_golden.py` asserts saved values, allowlisted-functions-only, bounded ranges, the three planted changes.
- **Spikes:** `spikes/coalition_timing.py`, `spikes/pycel_cached_values.py`.
- `uv run pytest -q`: **15 passed**.

## Done (Phase 1): Check mode end to end, CLI
- **Engine** (`deltagate/engine/`): `parse.py` (contents, saved values, `saved_by`, address helpers), `allowlist.py`, `graph.py` (networkx, range nodes), `align.py` (key column, else LCS), `classify.py` (≤ 8 groups), `recalc.py` (pycel wrapper + coalitions), `verify.py`, `structural.py` (5 checks), `proof.py`, `check.py` → `CheckResult`. Plus `models.py`, `config.py`, `cli.py`.
- **CLI:** `uv run python -m deltagate.cli check A.xlsx B.xlsx [--json] [--policy policy.yaml]`.
- `uv run pytest -q`: **61 passed** (15 Phase 0 + 46 new), no skips on this machine (the proof test needs LibreOffice and skips without it).

**Acceptance (all pytest, `tests/test_check.py`):**
| Item | Result |
|---|---|
| v2 → v3, Summary!C6 | Δ +42,000 = 38,000 (data, Expenses row 12) + 4,000 (logic, LateFees!F3) + 0 (structural, Summary!C4); shares sum to Δ; interaction 0 |
| Structural | `typed_over_formula` at Summary!C4; `lost_link` on Summary!C4 "Collected no longer depends on Payments!C (Amount paid)"; **no** lost link on C6; `protected_formula_edit` at LateFees!F3 and Summary!C4 |
| Verification | 307 / 307 matched, `saved_by = Microsoft Excel`, coverage 1.0 |
| judge_xlookup | 60 XLOOKUP cells listed (+ 64 dependents); Δ observed 42,000 = **38,000 verified + 4,000 unverified**; coverage 0.596; the expense row still gets its 38,000 share |
| ROUND | unverifiable (reason `ROUND`), output reported as unknown, not guessed |
| Proof workbook (F3 group) | `fullCalcOnLoad` set; recalculated by LibreOffice headless: Summary!C6 = 2,90,000 = base + 4,000 = the engine's solo effect |
| Timing | full Check v2 → v3 **1.5 s**, v2 → judge **0.6 s** (limit 10 s) |

**Phase 1 requirements (list below): all seven met, each with a test in `tests/test_engine.py`.**
1. `recalc.compile_model` is the only place a model is built, always `ExcelCompiler(excel=load_workbook(path))`. Tamper test: cached C6 = 999 → engine returns 2,86,000 and the Check reports `mismatched = [Summary!C6]`.
2. `recalc.needs_recompile`: any group with a formula on either side is applied by recompiling. Test reproduces the Phase 0 trap (typed-over C4 + a payment must give 2,86,000, not 2,83,500).
3. `recalc.clear_cell` is the only use of `xl._reset`; own test.
4. `parse.saved_by`: exact `Microsoft Excel`, `LibreOffice/` prefix, else `none`; no saved values → `none`. The proof test also checks a real LibreOffice-saved file is labelled LibreOffice.
5. `allowlist._function` strips `_xlfn.` / `_xlws.` (also stacked).
6. `TRUE` / `FALSE` (and `TRUE()` / `FALSE()`) stay **unverifiable**: no golden test has been run for them yet.
7. `recalc.evaluate` turns numpy scalars into Python numbers.

## How a Check decides what is verified (read before Phase 2)
- **Unverifiable roots:** formula not on the allowlist (reason = the function name), TRUE/FALSE literal, `#REF!`-style error, named range / table / external reference, array formula, a workbook with macros or pivot tables (every formula), a base cell whose engine value differs from its saved value, an engine error.
- **Tainted** = roots + everything downstream, taken on the union of the base and new graphs (every coalition's dependencies are a subset of that union).
- **Pinning:** when a watched output is tainted but not a root, every tainted cell upstream of it is held at its **saved base value** in all coalitions. So `delta_verified` is what moves through verified cells only, `delta_unverified = delta_observed − delta_verified`, and a group whose effect on that output runs only through pinned cells is left out of its attribution. If a pinned cell has no saved base value, or the output is itself a root, nothing is verified for that output (`delta_verified = 0`, no attribution).
- **`base` / `new` / `delta_observed`** come from the files' saved values; the engine value is used only when the file has none and the output is not tainted.
- **Coverage** = share of formula cells (base ∪ new) that are not tainted.
- **Coalitions:** per run, only groups with a live cell upstream of the output are evaluated; one compile per subset of formula groups (v2 → v3: 4 compiles; judge: 4).

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
- **LibreOffice rewrites the literal `FALSE` as `FALSE()`** on save (seen in `VLOOKUP(…,5,FALSE)`). pycel evaluates it correctly. The golden files now use `0` as the exact-match flag so they are stable across apps. Decision: `TRUE` / `FALSE` join the allowlist only after a golden test (Phase 1 requirement 6); until then a LibreOffice-saved file with a boolean literal is unverifiable at those cells.
- **XLOOKUP is stored as `_xlfn.XLOOKUP`.** Allowlist detection must strip the `_xlfn.` / `_xlws.` prefixes. LibreOffice 26.8 computes it (judge file has all 306 cached values).
- LibreOffice headless **does** compute values for openpyxl-written files (no cached values going in, all present coming out).

## Golden files: saved values
Pipeline: `make_golden.py` (no cached values) → `recalc.sh` (LibreOffice) → `excel_resave.ps1` (Excel). Both results were checked; the Excel-saved files are the frozen ones.

| File | Step | `docProps/app.xml` Application | Formula cells with cached value | Summary!C6 | Summary!C4 | LateFees!F3 | Error cells |
|---|---|---|---|---|---|---|---|
| dues_v2.xlsx | LibreOffice | `LibreOffice/26.8.3.1$Windows_X86_64 …` | 307 / 307 | 286000 | 100000 | 4000 | 0 |
| dues_v2.xlsx | **Excel 16.0** | `Microsoft Excel` (exact) | 307 / 307 | 286000 | 100000 | 4000 | 0 |
| dues_v3_REAL.xlsx | LibreOffice | `LibreOffice/26.8.3.1$Windows_X86_64 …` | 306 / 306 | 328000 | 100000 | 8000 | 0 |
| dues_v3_REAL.xlsx | **Excel 16.0** | `Microsoft Excel` (exact) | 306 / 306 | 328000 | 100000 | 8000 | 0 |
| judge_xlookup.xlsx | LibreOffice | `LibreOffice/26.8.3.1$Windows_X86_64 …` | 306 / 306 | 328000 | 100000 | 8000 | 0 |
| judge_xlookup.xlsx | **Excel 16.0** | `Microsoft Excel` (exact) | 306 / 306 | 328000 | 100000 | 8000 | 0 |

- **LibreOffice vs Excel, cell by cell** (every cell of every sheet, 1,138 / 1,140 / 1,140 cells): **0 value differences, 0 formula-text differences.** The two applications agree on every cached value.
- Excel's own scan after `CalculateFull` (all formula cells on LateFees and Summary: 187 / 186 / 186): no error values. `judge_xlookup.xlsx` has **no `#NAME?`**: `make_golden.py` already writes `_xlfn.XLOOKUP`, and both Excel and LibreOffice 26.8 compute it.
- The scan detects errors by type: over COM an error cell arrives as an Int32 code (checked: `=NOSUCHFN()` → `-2146826259`, `#NAME?`), a number as Double.
- After the Excel save: `uv run pytest -q` 15 passed; the coalition spike gives the same shares and timing.

## Phase 1 requirements (from Phase 0 findings; treat as acceptance items)
1. **Always compile pycel from a formulas-only copy** (`ExcelCompiler(excel=load_workbook(path))`), never from a filename. Regression test: a file whose cached `Summary!C6` is tampered to 999 must **not** return 999 from recalc.
2. **Typed-over cells are always a formula group** (recompile), never a `set_value`.
3. **Wrap the private pycel `_reset` in one function** (clearing a cell back to empty) **with its own test.** pycel stays pinned at `1.0b30`.
4. **The app name must be an exact match:** `Microsoft Excel` only. Never a substring match (openpyxl writes `Microsoft Excel Compatible / Openpyxl 3.1.5`). LibreOffice is recognised by its `LibreOffice/` prefix. Anything else, or no cached values, is `none`.
5. **The allowlist scanner must strip `_xlfn.` / `_xlws.` prefixes** before checking function names.
6. **`TRUE` / `FALSE` go on the allowlist only after a golden test** (LibreOffice writes them as `TRUE()` / `FALSE()`). Until then they are unverifiable.
7. Coerce numpy scalars from pycel (e.g. SUMPRODUCT) to Python numbers.

## In progress
Nothing. Phase 1 is complete and waiting for review; Phase 2 has not started.

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
- **Branch:** Phase 0 merged to `main` (PR #1). Phase 1 is on `phase-1-check`, not pushed.

**Phase 1 decisions**
- **Contract widened (`models.py`):** `Output.base`, `new`, `delta_observed`, `delta_unverified` are `float | null`. Null means "no saved value and the engine must not compute it" (e.g. a ROUND output in an openpyxl-written file). Reporting 0 there would be a guess. `delta_verified` is always a number.
- **`formulas` fallback engine not wired in.** Under the current rules no function may be routed to it (XLOOKUP needs a golden test first, and the acceptance test requires XLOOKUP to be unverifiable), so the code would be unreachable. Add it together with the XLOOKUP golden test.
- **`protected_formula_edit` follows the build rules, not the spec:** it fires on a direct edit (value or formula) to a cell in `policy.protected`. The spec's wider "any formula on the way to a watched output" is not implemented.
- **A row appended just past a range** (range ended at the old last row and was not extended) is reported as `shortened_range` ("New row 5 in Data is outside Data!B2:B4 …"). No new finding kind, so the contract enum is unchanged.
- **Group labels are engine templates:** "New row in Expenses: Lift repair", "Formula changed: LateFees!F3", "Formula replaced by a value: Summary!C4", "3 values changed in Payments!C (Amount paid)".
- **Grouping:** (sheet, column, type); appended rows = one data group per sheet; trailing deleted rows = one structural group per sheet; a sheet whose rows moved = one structural group. More than 8 → merge to (sheet, type), then (type).
- **`finding.output`:** the cell itself if it is watched, else the first watched output (policy order) it feeds, else null.
- **Header row = row 1** for key-column detection and lost-link region names.
- **pycel's logger is silenced** in `recalc.py` (it prints a traceback for every `#DIV/0!`); two pycel `DeprecationWarning`s are filtered in `pyproject.toml`.

## Known issues
- **uv on this machine:** `uv sync` failed with "Missing expected target directory for Python minor version link". Workaround: `uv venv --python %APPDATA%\uv\python\cpython-3.12.16-windows-x86_64-none\python.exe`, then `uv sync`. May not affect other machines.
- Re-running `make_golden.py` strips cached values and un-freezes the golden files; `recalc.sh` and then `excel_resave.ps1` must follow.
- `excel_resave.ps1` needs Windows with Excel installed. Without it the files stop at the LibreOffice step and the banner must say LibreOffice.
- The four business documents at the repo root are deliberately untracked.
- `golden/drift_steps.json` is Phase 2.
- **Phase 2 must decide this:** a version the server commits is written by openpyxl, so it has **no saved values**. After the first gated commit the base banner becomes "Not verifiable against saved values", and partial verification on files with unverifiable cells (pinning) stops working because there are no saved base values to pin at. Option: round-trip each committed version through LibreOffice headless (as the proof test does) and label it LibreOffice.
- **Formula groups cost a compile each way:** 2^k compiles for k formula groups (~0.25 s each). 3 → 2 s, 5 → 8 s. The classifier does not yet merge formula groups to stay under a budget.
- **Rows inserted or deleted mid-sheet** are one structural group applied cell by cell. If the tool that produced the file did not rewrite dependent formulas (openpyxl `delete_rows`), outputs come back "can't verify" rather than a number. Fail closed, but no attribution.
- **Reverse direction:** restoring a formula over a typed value (v3 → v2) reports a `lost_link` on Summary!C6 for region Summary!C, because the typed constant was an input and no longer is. True, but noisy.
- **TRUE / FALSE literals are common in real workbooks** (`VLOOKUP(…, FALSE)`). Until the golden test is done those cells are unverifiable; do it before the judge's-own-file drill (Phase 4).
- No alignment across renamed sheets; a renamed sheet reads as one deleted and one added.

## Cut list status
Nothing cut from the cut order. Phase 1 left out only the `formulas` fallback wiring (see Phase 1 decisions).
