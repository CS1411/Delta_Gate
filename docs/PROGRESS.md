# Delta Gate — progress

_Last updated: 23 Nov 2026, end of Phase 2 (branch `phase-2-gate`; Claude Desktop connection confirmed)._

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
6. `TRUE` / `FALSE` (and `TRUE()` / `FALSE()`) stayed unverifiable through Phase 1. **Phase 2 step 0 ran the golden test; they are now supported.**
7. `recalc.evaluate` turns numpy scalars into Python numbers.

## Done (Phase 2): gate, managed store, audit log, MCP server
- **Step 0, TRUE / FALSE golden test:** `golden/make_truefalse.py` → `golden/truefalse.xlsx`, saved by Excel 16 (`excel_resave.ps1 -Files truefalse.xlsx -Sheets Cases`). 24 formula cells: `VLOOKUP` exact (found / not found / `FALSE()`), `VLOOKUP` approximate (`TRUE`, `TRUE()`, 4th argument omitted), `IF`, `AND`, `OR`, `NOT` with literals and with `TRUE()` / `FALSE()`, booleans fed into `IF`, a `SUM` downstream. **All 24 match Excel's saved values**, approximate match included, so `TRUE` and `FALSE` are on the allowlist (literal and function spelling) and no `VLOOKUP` carve-out was needed.
- **Engine:** `check.py` is now `analyse()` → `delta()` / `cant_verify()` → `result()`; `check()` is `result(analyse())`. `recalc.coalitions(..., only=, models=)` evaluates chosen coalitions and keeps one compiled model per formula-group subset in a caller-owned cache.
- **`db.py`:** schema from the build rules, WAL, `tx()` = `BEGIN IMMEDIATE`, re-entrant.
- **`gate/audit.py`:** hash chain, Ed25519 checkpoint every 50 entries and at session end, `verify()`.
- **`gate/store.py`:** `register`, `current` (unmanaged-change detection + automatic Check), `shadow`, `commit`, `rollback`, the LibreOffice sidecar worker.
- **`gate/policy.py`:** `decide()`, pure. **`gate/gate.py`:** `propose_edit`, `get_decision`, `held`, `approve`, `deny`, `rollback`, `end_session`.
- **`mcp_server.py`:** `MCPServer` (mcp 2.3.0), stdio, exactly `read_range`, `impact_preview`, `explain_delta`, `propose_edit`, `get_decision`.
- **CLI:** `python -m deltagate.cli register FILE.xlsx [--id dues]`.
- `golden/drift_steps.json`: the Act 2 script. `spikes/soffice_timing.py`.
- `uv run pytest -q`: **95 passed** (62 before the Phase 2 modules + 33 new), no skips on this machine.

**Acceptance (pytest unless marked manual):**
| Item | Result |
|---|---|
| Act 2, Session A | one `propose_edit` (3 payments of ₹2,500 + `LateFees!F3 = =F2*0.04`) → `PARTIAL`; payments PASS and committed (C6 2,86,000 → 2,78,500, C4 → 1,07,500, drift 7,500); F3 HELD: "Protected cell LateFees!F3 was edited directly (formula changed)", solo +₹4,000 |
| Act 2, Session B | ten edits of ₹3,000: 8 PASS (drift 24,000), 9th and 10th HELD: "Session drift would reach ₹27,000, over the budget of ₹25,000". Final C6 2,54,500, C4 1,31,500 |
| XLOOKUP | an edit that feeds an XLOOKUP cell (`Payments!C5` on the judge file) and a direct edit of one → `CANT_VERIFY_HELD`, no impact number, nothing committed |
| Joint check | two groups of +₹9,000 each (an `Expenses!B2` value and an appended row) → both HELD, "Combined effect of passing groups exceeds limit" (+₹18,000), drift untouched |
| Audit | edited row → `verify()` fails at that entry; edited signature fails; log cut back past a checkpoint fails; untouched passes |
| Unmanaged change | `current.xlsx` overwritten with v3 → next read: version `source = unmanaged`, a Check (+₹42,000) stored and returned, audit entry; later edits build on it |
| Approve / deny / rollback | approve commits the held F3 (C6 +4,000) → `APPROVED`; deny → `DENIED`, file untouched; rollback restores the previous managed version as a new version, edit → `ROLLED_BACK`; approve is refused if the held cell changed meanwhile |
| MCP | `list_tools()` is exactly the five; approve / deny / rollback are not importable from `mcp_server`; a child process over real stdio lists the tools, returns `PARTIAL` for Session A, rejects a formula sent as a value, and leaves a signed checkpoint on exit |
| Gate decision time | 11 Act 2 edits (1 in Session A + 10 in Session B): **p50 ≈ 0.55 s, p95 ≈ 1.1 s, max ≈ 1.1 s** (limit 3 s). Check + commit after the decision: p50 ≈ 0.15 s. Printed by `test_act_2_script`, and on the server's stderr for every edit |
| **Claude Desktop (real connection)** | **Confirmed 23 Nov 2026, 15:01**, Claude Desktop 6.28899.6.0 (Microsoft Store install), mcp 2.3.0 / `MCPServer`. `main.log`: "delta-gate negotiated protocol version: 2025-11-25", "Connected to delta-gate (5 tools)", no error lines. The five tools surfaced by Desktop are `read_range`, `impact_preview`, `explain_delta`, `propose_edit`, `get_decision`; a live `read_range("dues", "Summary!B6:C6")` through Desktop returned 2,86,000, `saved_by` Microsoft Excel. The `mcp<2` / `FastMCP` fallback was not needed |
| **Manual, open** | `uv run mcp dev deltagate/mcp_server.py` (inspector) was not run. The 3-line Act 2 test typed into a Desktop chat (expected `PARTIAL`) is still to be done by hand; the same edit passes over real stdio in `tests/test_mcp.py` |

**LibreOffice round trip (review change 1): measured, then moved off the commit path.**
`spikes/soffice_timing.py`, dues_v2 written by openpyxl, own LibreOffice profile, this laptop:
| Run | Time |
|---|---|
| first run (creates the profile) | 8.86 s |
| 5 warm runs | 1.95, 1.80, 1.78, 1.79, 1.80 s → **p50 1.80 s, p95 1.95 s** |

p95 > 1.5 s, so **sidecar mode** was built: a commit writes the openpyxl file at once (`versions.saved_by = pending`) and a single background worker writes `versions/<sha>.lo.xlsx`. `current.xlsx` and its hash never change. The sidecar is accepted only if LibreOffice's copy has saved values and the same cells (same constants, a formula wherever there was one); then `saved_by = LibreOffice` and a Check with that version as base verifies against the sidecar's values (tested: 307 / 307 match, banner says LibreOffice). Failure, a 30 s timeout (process tree killed) or no LibreOffice → `none` ("Not verifiable against saved values"). A Check that meets a base still `pending` reports `none`. A server commit is never labelled Excel.

## Done (P1-1): UI fixtures from real engine output
`scripts/dump_fixtures.py` (run from `backend/`: `uv run python ../scripts/dump_fixtures.py [--out DIR]`) writes `frontend/src/fixtures/`, each file `model_dump_json(indent=2)` of a pydantic model, nothing hand-written:
`check_v2_v3.json` (CheckResult), `check_judge_xlookup.json` (CheckResult), `decision_session_a.json` (PARTIAL, F3 held as protected), `decision_session_b.json` (the 9th edit, HELD by the drift budget), `audit.json` (whole chain from the Act 2 run: 14 entries, 2 Ed25519 checkpoints).
- **Deterministic:** the script runs the real gate on a throwaway `DELTAGATE_HOME` with LibreOffice off, and freezes `uuid4`, `db.now`, the gate's timings, openpyxl's save time, zip entry times and the signing key (a public throwaway seed, fixtures only). Two runs are byte-identical.
- **`tests/test_fixtures.py`** regenerates all five in a child process (the freezes are process-wide), checks each parses into its model, equals the committed file byte for byte, re-asserts the §7 numbers, and re-walks the audit hash chain and checkpoint signatures from the JSON alone.
- **New models:** `AuditEntry`, `AuditCheckpoint`, `AuditLog` (in `models.py`, see the contract note below); `audit.read()` stays in `gate/audit.py`. No audit response model existed. `AuditLog` = `{entries, checkpoints}`; an entry is the `audit_log` row with `payload_json` parsed to `payload`. This is the proposed body of `GET /api/audit`; P4 should confirm before building on it.
- **Lost link, resolved.** The engine emits `lost_link` with `cell = Summary!C4`, `output = Summary!C4`, `message = "Collected no longer depends on Payments!C (Amount paid)"`, and none on `Summary!C6`. That matches §7. The §5 example CheckResult was stale (`output: Summary!C6`, base/new 186,000/228,000); it now reads `Summary!C4` and 286,000/328,000. Engine unchanged.
- **UI note (Check tab):** a v2 → v3 Check emits **three** structural-type findings on top of the lost link's group: `typed_over_formula` at Summary!C4, `protected_formula_edit` at LateFees!F3 and at Summary!C4, and the `lost_link` (four entries in `structural`). Act 1 therefore shows more than one warning; the **lost link must be the visually dominant one**.
- **UI note (attribution):** the third group (g3, structural, Summary!C4 typed over) has `share = 0`. Exclude zero-share groups from the headline sentence and from the waterfall bars, but still list them in the groups table.
- **Contract change:** `AuditEntry`, `AuditCheckpoint`, `AuditLog` moved into `models.py` (serialised JSON unchanged; `audit.json` re-dumped and byte-identical). `GET /api/audit`'s body is a REST payload, so PR #7 needs **P2 and P4 approval** as a contract change.
- Other §7 values all hold: C6 286,000 → 328,000, Δ 42,000 = 38,000 (data) + 4,000 (logic) + 0 (structural), interaction 0; C4 100,000 in both; `typed_over_formula` at Summary!C4. Not in §7 but visible in the fixture: C6's check also carries `protected_formula_edit` at LateFees!F3 and Summary!C4.
- **How they are compared:** `tests/test_fixtures.py` compares field by field with every sha256 and signature normalised to a placeholder (runs everywhere), plus a test that the normaliser still rejects a changed money value, label or status. The exact byte check is opt-in, `DG_FIXTURE_EXACT=1`, and is expected to pass only on the machine that generated the fixtures: a `.xlsx` is a zip, so its bytes are not reproducible across platforms, and the version hashes, audit chain and signatures all derive from them. `.gitattributes` pins `frontend/src/fixtures/*.json` to LF.
- Regenerate whenever `models.py`, the engine or the gate changes; the test fails until you do.

## Done (P1 tasks 3-5): REST API groups 2-4 (`deltagate/api.py`, branch `p1-api-rest`)
- **Group 2, checks:**
  - `POST /api/checks` (multipart `base` + `new`) → `CheckResult`.
  - `GET /api/checks/{id}`.
  - `POST /api/checks/{id}/proof/{group_id}` → the proof workbook as a download (base + that group only, `fullCalcOnLoad`).
  - Uploaded files are kept in `data/checks/<check_id>/` (never `store/`), so proof and export work later.
  - A file that is not a workbook → **422** "… is not a readable workbook"; over 25 MB → **413**; an engine failure → **422** with the exception name, never a stack trace.
  - Proof for a Check whose files the API did not keep (gate / `explain_delta` Checks) → **404** "has no files kept".
- **Group 3, audit and export:**
  - `GET /api/audit` → `AuditLog`.
  - `GET /api/audit/verify` → `{ok, entries, checkpoints, error}`; a tampered row gives `ok: false`, "entry 2 does not match its hash".
  - `GET /api/exports/{check_id}.csv`: one row per fact. The `record` column is `output`, `attribution`, `structural` or `unverifiable`.
  - Numbers are unformatted engine values; **null is written as `unknown`, never 0**; UTF-8 with BOM so Excel opens it cleanly.
- **Group 4, Session Audit:**
  - `POST /api/session-audit/snapshot` (`file`) → `{snapshot_id, sha256}`.
  - `POST /api/session-audit/complete` (`snapshot_id` + `file`) → `CheckResult` with `mode = session_audit`, stored like any Check (readable, provable, exportable).
  - Unknown or malformed snapshot id → **404**.
- **Workbooks, for the Rollback button:** `GET /api/workbooks` → `[{workbook_id, name, current_version, saved_by, source, updated_at, can_rollback}]`.
  - It reads the database only; no unmanaged-change check runs on a list.
  - `can_rollback` is false when there is no earlier version, i.e. when `POST /api/workbooks/{id}/rollback` would answer 409.
  - **Decision:** rollback is per workbook, not per held edit (it undoes the last committed version, usually something that passed). So the UI shows one Rollback button per workbook from this list, and `Decision` keeps no `workbook_id` (no contract change).
- **Safety:** ids that arrive in a URL (`chk_<12 hex>`, `sa_<12 hex>`) are matched against their exact pattern before any disk access.
- **Tests:** `tests/test_api_checks.py` (11), over HTTP on the real engine: v2 + v3 → +42,000 = 38,000 + 4,000; the proof has F3 = `=F2*0.04` and C4 still a formula; verify flips on a tampered row; CSV shares add up, judge 38,000 verified + 4,000 unverified, null → "unknown"; Session Audit v2 → v3 with the lost link on C4.
- **Branch base:** `p1-api` (#7, group 1) with `p3-hardening` (#6, the Session Audit engine) merged in. Merge after both.
- **Dependency note:** uploads need `python-multipart`. It is installed (locked as a dependency of another package) but not listed in `pyproject.toml`.

## Known issue: `test_proof_workbook_for_f3` fails when two LibreOffice runs overlap
- **Test:** `tests/test_check.py::test_proof_workbook_for_f3`. **Failure line:** `subprocess.CalledProcessError: Command '[…/soffice, --headless, --calc, --convert-to, xlsx, …]' returned non-zero exit status 1`.
- **Rate:** 0 failures in 5 unloaded full runs (`DG_FIXTURE_EXACT=1 pytest -q -rf`); 3 failure reports in 10 loaded runs (5 iterations, each with a second full pytest in parallel; the per-run log names got crossed, so I can't say which of the two runs in an iteration failed). One unlabelled `1 failed, 111 passed` earlier, probably the same test. It is the only test that failed.
- **Cause (from the command line, not yet confirmed by a fix):** the test starts `soffice` with the default LibreOffice user profile. A second `soffice` already using that profile (a parallel pytest, a lingering run, the user's own LibreOffice) makes the headless convert exit 1. The store's worker avoids this with its own profile under `data/libreoffice_profile`.
- **Not the pending-window issue (known issue 4):** this test does not read `saved_by = pending` and does not sleep, so the hypothesis about P3's pending window does not apply.
- **Proposed fix (not done, P3's test):** pass `-env:UserInstallation=file://<tmp_path>/profile` in that test's `subprocess.run`, as `store.recalculate` does. Until then: do not run two pytest sessions, or LibreOffice, at once on the demo laptop.

## Done (P1-2): REST API group 1, approvals (`deltagate/api.py`)
- `GET /api/edits?status=held` (HELD and PARTIAL edits, `list[Decision]`), `POST /api/edits/{id}/approve`, `POST /api/edits/{id}/deny`, `POST /api/workbooks/{id}/rollback`. One SQLite connection per request.
- Responses are the pydantic models as they are: no formatting, no computing, null stays null. Errors: `store.Conflict` and `ValueError` from the gate (nothing waiting, nothing to roll back to) → **409** `{"detail": <the gate's message>}`; unknown edit or workbook → **404**.
- **New payload, flagged:** rollback needs a body and no model existed, so `RollbackResult` (`workbook_id, sha256, saved_by, source, created_at`: the restored `versions` row) is defined in `api.py`, not `models.py`. P2 and P4 should confirm it before the UI uses it; if it should be a contract it moves to `models.py`.
- `tests/test_api.py` (11 tests, over the FastAPI test client on a real gate): Session A held edit approved, and separately denied; double action → 409 with the message; stale held cell → 409; unknown → 404; rollback marks the edit `ROLLED_BACK`; approve / deny / rollback are not MCP tools and not importable from `mcp_server`.
- Not started: checks, proof, audit, export and session-audit endpoints.

## How a Check decides what is verified (read before Phase 2)
- **Unverifiable roots:** formula not on the allowlist (reason = the function name), `#REF!`-style error, named range / table / external reference, array formula, a workbook with macros or pivot tables (every formula), a base cell whose engine value differs from its saved value, an engine error.
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
- **LibreOffice rewrites the literal `FALSE` as `FALSE()`** on save (seen in `VLOOKUP(…,5,FALSE)`). pycel evaluates it correctly. The golden files now use `0` as the exact-match flag so they are stable across apps. `TRUE` / `FALSE` joined the allowlist in Phase 2 after the golden test (`golden/truefalse.xlsx`), in both spellings.
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

## Done (Phase 3, P2 UI work; branch `p2-approvals`)
- **HELD card** (`frontend/src/tabs/Approvals/HeldCard.tsx`) on engine fixtures: badge (HELD / HELD · CAN'T VERIFY), group label, type and cells, "Why held" reasons, ₹ solo impact per watched output in Indian format (5xl, readable from 3 m), committed part of a PARTIAL edit, honest saved-values line, Approve / Deny. A `CANT_VERIFY_HELD` group shows "Impact unknown", never ₹0. Checked in the browser at desktop and phone width; Deny removes the card.
- **Fixtures** from the real gate: `scripts/make_fixtures.py` runs Session A (PARTIAL), Session B's 9th call (drift HELD) and a payment on the judge file (CANT_VERIFY_HELD) in a throwaway home and writes `frontend/src/fixtures/decision_*.json`. P1 adds the CheckResult and audit fixtures to the same script.
- **Structural-findings panel** (`frontend/src/components/StructuralPanel.tsx`) for P4's Check tab, on `fixtures/check_v2_v3.json`: one card per cell; a `lost_link` is the red headline (the engine's message verbatim, "Collected no longer depends on Payments!C (Amount paid)"), the cell's other findings (`typed_over_formula` at C4) are small grey lines under it, and `protected_formula_edit` rows (F3, C4) are a small grey list at the end. The card shows the watched output's label and change from `outputs` (null -> "unknown"). Summary!C6 gets no lost-link card. No React Flow: the mini-graph needs path data that CheckResult does not carry (lost region, old path, surviving paths); that is a contract PR, not started.
- **Shared frontend pieces** P4's shell should reuse, not duplicate: Tailwind v4 (`@tailwindcss/vite`), `src/types.ts` (copied from `models.py`), `src/format.ts` (`inr`, `signedInr`, `savedByBanner`). `App.tsx` renders the Approvals tab alone until the shell lands.
## Done (Phase 3, P3 engine work; branch `p3-hardening`)
- **Compile budget:** `classify` caps formula groups at `MAX_FORMULA_GROUPS = 3`, so one Check compiles at most 2^3 = 8 models. Only formula groups are coarsened (sheet + type, then type alone); value groups keep their per-column detail. Test: 5 formula columns -> <= 3 formula groups, shares add up to Δ, < 10 s.
- **Session Audit engine path:** `deltagate/session_audit.py`. `snapshot(file)` keeps an exact byte copy in `data/session_audits/sa_<12 hex>.xlsx` (saved values and `saved_by` kept); `complete(id, after, policy)` is a Check with `mode = "session_audit"`. Ids are checked against `sa_[0-9a-f]{12}` before touching the disk (they arrive over HTTP). Test: snapshot v2, complete with v3 -> C6 2,86,000 -> 3,28,000 (+42,000 = 38,000 + 4,000), lost link on C4. P1 wires `POST /api/session-audit/snapshot` and `/complete` to these two functions.

## Phase 3 requirements (UI)
- **One card per cell for structural findings.** On v2 → v3, `Summary!C4` gets three findings: `typed_over_formula`, `protected_formula_edit` and `lost_link`. The Check tab groups findings by `cell` into one card, with the lost-link message ("Collected no longer depends on Payments!C (Amount paid)") as the headline and the other two as lines under it, so Act 1 shows one warning for that cell, not three. `LateFees!F3` (`protected_formula_edit`) stays its own card.

## Done (Phase 3, P2: judge's-own-file drill; branch `p2-messy-drill`)
- **Messy workbooks:** `scripts/make_messy.py` builds three v2/v3 pairs in `golden/` with openpyxl, applies the ops in `golden/messy_ops.json` the way the gate's shadow copy does, then runs LibreOffice headless so both files carry saved values (`saved_by` LibreOffice, never Excel).
  - `messy_1`: merged header cells, blank rows between data, no key column (repeated names). v3: one payment edit + a row appended past the summed range.
  - `messy_2`: XLOOKUP, SORT (dynamic-array function) and a user-defined name (`LateRate`) in the output chain. v3: billed and paid edits, and the Expenses sheet renamed to Costs (not expressible as gate ops: Check only).
  - `messy_3`: `.xlsm` with a VBA project part (an inert marker, added after LibreOffice), a hidden sheet, text-formatted numbers, an empty sheet.
- **`tests/test_messy.py` (21 tests + 1 strict xfail):** Check in-process and through the CLI (plain and `--json`; exit 0, no traceback), and the v3 ops through the gate. Every watched output is reported; null stays null; verified + unverified = observed; every reason is plain text; a macro file is never run (child processes and `os.startfile` are refused during the macro test) and never written.
  - `messy_1`: exact (+₹500 / −₹500, coverage 100%); `shortened_range` on Ledger!C13; gate PARTIAL (payment PASS, uncovered row HELD).
  - `messy_2`: C6 −₹1,460 = ₹1,000 verified + −₹2,460 unverified; C4 +₹2,500 all unverified; reasons XLOOKUP, SORT, "unsupported reference LateRate"; gate holds both edits `CANT_VERIFY_HELD`.
  - `messy_3`: coverage 0, every formula "macros (VBA)", verified ₹0 with the whole change unverified; gate `CANT_VERIFY_HELD`.
- **What broke and was fixed (P2 files):**
  - `classify.py` / `structural.py`: a renamed sheet read as all its rows deleted + a new sheet, which raised a false `rows_deleted_in_range` and a false `lost_link` ("Total pending dues no longer depends on Expenses!B (Amount)"). `classify.renamed_sheets` now detects a sheet whose only change is its name (exact content match); its cells form one structural group, "Sheet Expenses renamed to Costs", and structural checks map regions through the rename. A sheet renamed *and* edited in one go still reads as deleted + added.
  - `classify.py`: group labels said "1 data changes"; now "1 data change".
- **Handed to P3, then fixed (branch `p3-engine-fixes`):**
  - `check.py`: a group whose whole effect on an output runs through an unverifiable (pinned) cell was a null player with share ₹0 (messy_2: the payment through XLOOKUP read "₹0" on C4 and C6). `analyse()` now tests reach on the graph with the pinned cells removed, so such a group is left out of that output's attribution and its effect stays in `delta_unverified`.
  - A sheet the base does not have (renamed or new) made any coalition holding the formulas that use it, but not its cells, evaluate a reference to a missing sheet (`FormulaEvalError`); a pure rename failed closed instead of Δ 0. Root cause was the grouping, not `recalc.py`: `classify` now puts a renamed or new sheet and every changed formula that refers to it in one structural group ("Sheet Data renamed to Costs", "New sheet Extra"), so no coalition points at a sheet it does not create. Pure rename: Δ 0 exact; new sheet + formula using it: Δ exact.
  - Left as is: a new sheet that no changed formula uses stays a value group that `set_cell` skips (nothing reads it, so nothing moves).

## Done (P1 task 7): shadow cleanup and the MCP banner (branch `p1-shadow-cleanup`)
- **`store.discard(workbook_id, edit_id, keep_shadow=False)`** deletes an edit's shadow copy and its candidates (`<edit>.pass.xlsx`, `<edit>.approved.xlsx`); it never creates folders, so an unknown workbook id leaves nothing behind. Called by the gate:
  - `propose_edit` PASS → everything deleted; HELD / PARTIAL → only the shadow kept (approve copies the held cells from it); any exception before the edit is recorded → everything deleted.
  - `approve` and `deny` → everything deleted after the transaction. A refused approval (`Conflict`) keeps the shadow, so the approver can still deny.
- **One wording for the banner:** `parse.banner(saved_by)`: "Verified against Excel's saved values" / "Verified against LibreOffice's saved values" / "Not verifiable against saved values" (`pending` and `none`). The CLI uses it (plus the match counts), and the MCP server now returns `banner` next to `saved_by` in `read_range` and in `explain_delta`, so the agent can quote it as is.
- Tests: cleanup after PASS, PARTIAL → approve, HELD → deny, a failed proposal, a refused approval, an unknown id; the banner for all four labels and in both MCP tools.

## In progress
Nothing. Phase 2 is built, the Claude Desktop connection is confirmed, and `phase-2-gate` goes to `main` by pull request. Phase 3 has not started.

## Decisions (with why)
- **Contract change (branch `p3-lostlink-data`): lost-link path data on `StructuralFinding`.** Three optional fields, filled only for `lost_link`, `None` otherwise: `region` `{sheet, column, header}`, `path_before` (column-level nodes from the region to the output in the base file, e.g. `["Payments!C", "Summary!C4"]`) and `kept` (`[{output, path}]` for other watched outputs that still reach the region in the new file; on v2 → v3, Summary!C6 via `Payments!D`, `LateFees!C`, `LateFees!D`, `LateFees!F`, `Summary!C`). Built from the networkx graphs (`graph.column_path`: shortest path from any input cell of the region, range nodes skipped, consecutive cells of one column collapsed), never from message text. Why: the lost-link mini-graph needs them and parsing messages would be a workaround. Needs approval from P1, P2 and P4 (SPLIT.md §8). Fixtures regenerated; `types.ts` mirrors the fields.
- **Session Audit snapshots live in `data/`, not `store/`.** They are not managed versions, and `store/` is written only by `gate/store.py`. No database row: the snapshot id is the file name and the Check carries its SHA-256 as `base_version`.
- **Base value ₹2,86,000 → ₹3,28,000**, not the earlier example ₹1,86,000 → ₹2,28,000. Overdue total is fixed at ₹2,00,000 and is part of pending dues, so pending cannot be below ₹2,04,000 unless flats carry advance credits. Δ is unchanged (+₹42,000). The CheckResult example in CLAUDE.md §5 now uses these values (286000 → 328000) and puts the lost link on output `Summary!C4`, as the engine reports it.
- **Lost link fires on watched output `Summary!C4`** ("Collected no longer depends on Payments!C"), not on C6. C6 still reaches Payments!C through `LateFees!C → Payments!D`, so no lost link on C6 is the correct result. Build rules §7 and Prompt 1 acceptance were updated.
- **Bounded ranges only** in the golden files (`$A$2:$A$61` etc.); a test rejects whole-column references.
- **Act 2 edit targets:** 15 flats are billed ₹3,000, not yet due, nothing paid (Payments rows 5, 9, 13, …). A payment there moves Collected by +x and Total pending dues by −x exactly and does not touch the overdue total, so the drift arithmetic (8 × 3,000 = 24,000) is exact.
- **`judge_xlookup.xlsx`** = v3 with `LateFees!C2:C61` as XLOOKUP into Payments. The whole late-fee path becomes unverifiable; expected Phase 1 result: ₹38,000 verified, ₹4,000 unverified.
- **Expenses range is `Expenses!B2:B40`** so the appended row 12 is inside it. A row appended past row 40 would be the "range doesn't cover the new row" finding.
- **Coalition oracle shape:** `shapley(groups, v)` takes `v(frozenset) -> float` and calls it once per coalition; the engine precomputes `F(S)` for all S and passes a table lookup.
- **`pyyaml` added** to backend dependencies (needed for `policy.yaml`).
- **No package build step:** `pytest` uses `pythonpath = ["."]`; run commands work from `backend/`.
- **Branch:** Phase 0 merged to `main` (PR #1). Phase 1 is on `phase-1-check`, merged to `main` by pull request after review.

**Phase 1 decisions**
- **Contract widened (`models.py`):** `Output.base`, `new`, `delta_observed`, `delta_unverified` are `float | null`. Null means "no saved value and the engine must not compute it" (e.g. a ROUND output in an openpyxl-written file). Reporting 0 there would be a guess. `delta_verified` is always a number. **Accepted in review;** the CheckResult example in the build rules §5 now shows the null case.
- **`formulas` fallback engine not wired in.** Under the current rules no function may be routed to it (XLOOKUP needs a golden test first, and the acceptance test requires XLOOKUP to be unverifiable), so the code would be unreachable. **Review decision: skip for now; wire after XLOOKUP golden test.**
- **`protected_formula_edit` follows the build rules, not the spec:** it fires on a direct edit (value or formula) to a cell in `policy.protected`. **Accepted in review for the hackathon.** Roadmap item: the spec's wider version, "any formula changed on the way to a watched output".
- **A row appended just past a range** (range ended at the old last row and was not extended) is reported as kind `shortened_range` with the message "Range <ref> in <cell> does not cover new row <n>" (e.g. "Range Data!B2:B4 in Summary!C6 does not cover new row 5"; "(and N more formulas)" is added when several formulas use the range). `finding.cell` is the new row's cell. No new finding kind, so the contract enum is unchanged. **Kind and wording confirmed in review.**
- **Group labels are engine templates:** "New row in Expenses: Lift repair", "Formula changed: LateFees!F3", "Formula replaced by a value: Summary!C4", "3 values changed in Payments!C (Amount paid)".
- **Grouping:** (sheet, column, type); appended rows = one data group per sheet; trailing deleted rows = one structural group per sheet; a sheet whose rows moved = one structural group. More than 8 → merge to (sheet, type), then (type).
- **`finding.output`:** the cell itself if it is watched, else the first watched output (policy order) it feeds, else null.
- **Header row = row 1** for key-column detection and lost-link region names.
- **pycel's logger is silenced** in `recalc.py` (it prints a traceback for every `#DIV/0!`); two pycel `DeprecationWarning`s are filtered in `pyproject.toml`.

**Phase 2 decisions**
- **mcp 2.3.0, `MCPServer`.** The locked SDK is 2.x, where `mcp.server.fastmcp` raises on import (`FastMCP` was renamed `mcp.server.mcpserver.MCPServer`; same `@server.tool()`). Kept, on condition that Claude Desktop connects (see In progress).
- **Gate decisions use solo effects** (`delta(a, [g])`: `F(∅)` and `F({g})`, 2 evaluations per group), then **one joint evaluation of all PASS groups**. The full Shapley Check is built only when a group is held, from the same cached models.
- **Contract changes (`models.py`, `db.py`; build rules §5 updated):** `Decision.check` is `CheckResult | null` (null when every group passes; `explain_delta` gives the full Check on demand). `versions.saved_by` (`Microsoft Excel | LibreOffice | pending | none`). `edits.workbook_id`. `workbooks(id, name, current_version_id, created_at)`.
- **Drift per group = the largest |solo Δ| over the watched outputs**, one number per session. A ₹3,000 payment moves C4 by +3,000 and C6 by −3,000 and counts as 3,000, which is what the demo script needs (8 × 3,000 = 24,000). Held groups and approvals do not use the budget.
- **Can't verify (gate):** a group is `CANT_VERIFY_HELD` if any cell it edits, or anything downstream of one, is unverifiable. So any group that can reach a tainted watched output is held, and solo effects are only ever computed on verifiable outputs.
- **Structural rule:** a finding holds the group whose cells include `finding.cell`; a finding on no group's cell holds every group. The protected rule is the `protected_formula_edit` finding.
- **Partial commit is by cells:** the PASS groups' cells are copied from the shadow onto the base (`proof.proof_workbook`); approval copies the held cells onto the current version. Committed files carry `fullCalcOnLoad`, so Excel recalculates them on open.
- **Approval guard:** refused (`Conflict`) if a held cell's content changed since the proposal. The impact is not recomputed at approval time.
- **Rollback** = restore the managed version before the current one, as a new version row; the edit that produced the version left behind becomes `ROLLED_BACK`.
- **Ops are validated at the boundary:** one cell as `Sheet!A1`, the sheet must exist, `set_formula` must start with `=`, a value (also inside `append_row`) must not.
- **`read_range`** returns the saved value of a formula; where the version has none (yet), the engine's value for cells it may compute, else null.
- **The agent learns workbook ids from the error for an unknown id** (it lists the registered ones); there is no sixth tool.
- **Session end** = the MCP server process exiting: each session it served gets a `session_end` entry and a checkpoint.
- **Runtime paths** come from `DELTAGATE_HOME` (default: repo root → `data/`, `store/`); `DELTAGATE_SOFFICE=off` disables LibreOffice. `config.soffice()` replaced the copy in the tests.
- **`inr()` moved** from `cli.py` to `gate/policy.py` (the gate's reasons need it; the CLI imports it).
- **`excel_resave.ps1` takes `-Files` and `-Sheets`** (defaults unchanged).
- **`scripts/demo_reset.ps1`:** one command back to the demo start state (empties `store/` and `data/` except the LibreOffice profile, registers `dues_v2.xlsx` as `dues`). It ran cleanly with Desktop's servers connected: they open the database per call and hold nothing open in between.
- **Claude Desktop on this machine:** config at `%APPDATA%\Claude\claude_desktop_config.json` (backup `…json.bak`), `command` = the absolute path of `uv.exe`. Logs are in `%LOCALAPPDATA%\Claude\Logs`; the connection lines are in `main.log`, and `mcp-server-delta-gate.log` is created but stays empty in this build. Desktop starts **two** server processes for one config entry (chat and the local bridge); both share the SQLite database, which is what WAL mode is for.

## Known issues
- **uv on this machine:** `uv sync` failed with "Missing expected target directory for Python minor version link". Workaround: `uv venv --python %APPDATA%\uv\python\cpython-3.12.16-windows-x86_64-none\python.exe`, then `uv sync`. May not affect other machines.
- Re-running `make_golden.py` strips cached values and un-freezes the golden files; `recalc.sh` and then `excel_resave.ps1` must follow.
- `excel_resave.ps1` needs Windows with Excel installed. Without it the files stop at the LibreOffice step and the banner must say LibreOffice.
- The four business documents at the repo root are deliberately untracked.
- **Formula groups cost a compile each way:** 2^k compiles for k formula groups (~0.25 s each). Capped at k = 3 (8 compiles, ~2 s). The price: with more than 3 formula groups, formula edits on one sheet (or of one type) share a group and a share, and the gate holds or passes them together.
- **Rows inserted or deleted mid-sheet** are one structural group applied cell by cell. If the tool that produced the file did not rewrite dependent formulas (openpyxl `delete_rows`), outputs come back "can't verify" rather than a number. Fail closed, but no attribution.
- **Reverse direction:** restoring a formula over a typed value (v3 → v2) reports a `lost_link` on Summary!C6 for region Summary!C, because the typed constant was an input and no longer is. True, but noisy.
- **Renamed sheets** are detected only on an exact content match (`classify.renamed_sheets`); a sheet renamed and edited in one go still reads as one deleted and one added.
- **Committed files are written by openpyxl.** Charts, images, pivot caches and other things openpyxl does not model are lost on the first gated commit. The demo workbooks have none.
- **A version is `pending` for about 2 s after a commit** (8–9 s the first time, while LibreOffice creates its profile under `data/libreoffice_profile`). A Check in that window says "Not verifiable against saved values", and on a file with unverifiable cells there are no saved values to pin at yet, so those outputs are held rather than partly verified.
- **The sidecar is discarded if LibreOffice drops or changes any cell** (label `none`). Seen to pass on the demo files; not tried on messy real workbooks.
- **Module state outside `config.py` / `db.py`:** `store.py` holds the single LibreOffice worker and its job list; `mcp_server.py` holds the set of sessions it served. Both are process-local.
- **Approver actions have no interface yet** (functions and tests only); REST comes in Phase 3.
- `uv run mcp dev` needs Node (`npx`) for the inspector; `mcp_server.py` puts `backend/` on `sys.path` when it is loaded by file path.

## Cut list status
Nothing cut from the cut order (Ed25519, drift and rollback are all in). Still left out: the `formulas` fallback wiring (see Phase 1 decisions).
