# CLAUDE.md — Delta Gate (wHACKiest 2026, Track 1: Make MCP Matter)

**Read this file first, every session.** The full product spec is `docs/delta-gate-final.md`. If anything here conflicts with it, **this file wins** for build decisions. That covers the scope cuts and the demo numbers in §7.

## 1. What we are building (one paragraph)
Delta Gate is an **independent check for AI spreadsheet edits**:
1. It recalculates what every edit does.
2. It splits the change in each watched output into **exact ₹ per cause** (Shapley shares that add up to Δ).
3. It flags **structural breakage**, even when the total doesn't move.
4. It **holds** AI-agent edits that cross policy limits.
5. When it can't verify something, it says **"can't verify"** and holds. It never guesses.

It has three modes:
- **Check:** compare two versions.
- **Gate:** check edits arriving through our MCP server, which is the agent's *only* write path.
- **Session Audit:** snapshot before an in-Excel AI session, then a Check afterwards.

## 2. Non-negotiable rules
1. **Every number shown comes from the engine.** The LLM (optional) writes words only. A validator rejects any number in the generated text that wasn't in the engine output. Template sentences are the default.
2. **Fail closed.** A cell depending on an unsupported or volatile function, a macro or an external link is **unverifiable**. Exclude it from attribution, report it in `delta_unverified`, and HOLD any gated edit that touches it.
3. **The agent never holds the pen.**
   - MCP exposes only `read_range`, `impact_preview`, `explain_delta`, `propose_edit` and `get_decision`.
   - `approve`, `deny` and `rollback` are REST-only, approver-only, and **never** MCP tools.
   - Only the server writes files in `store/`.
4. **Be honest in labels.** The verification banner names the app that saved the cached values. Read `docProps/app.xml` (`Application`):
   - Microsoft Excel → "Verified against Excel's saved values";
   - LibreOffice → "Verified against LibreOffice's saved values";
   - none → "Not verifiable against saved values".
   Never claim Excel when it wasn't Excel.
5. **Out of scope for the build:** WhatsApp, S3, Redis, auth/login, Postgres, Docker, cloud deploy, an Excel add-in, proxy mode, a gateway endpoint. Don't add them.

## 3. Stack (pinned; ask before adding dependencies)
- **Backend:**
  - Python 3.12 + **uv**;
  - `fastapi`, `uvicorn`;
  - `mcp[cli]` 2.x (official SDK, `from mcp.server.mcpserver import MCPServer`, stdio transport; `FastMCP` is its 1.x name and no longer imports);
  - `openpyxl`, `networkx`, `pycel` (primary engine), `formulas` (fallback engine);
  - `cryptography` (Ed25519), `pydantic` v2;
  - `sqlite3` (stdlib, WAL mode);
  - `pytest`, `hypothesis`.
- **Frontend:** React + Vite + TypeScript, Tailwind, `echarts` (`echarts-for-react`) for the waterfall, `@xyflow/react` (React Flow) for the lost-link graph, `@tanstack/react-query`.
- **Tools:** LibreOffice headless (`soffice --headless --convert-to xlsx`) to fill in cached values for generated golden files.

## 4. Repo layout
```
delta-gate/
  CLAUDE.md
  docs/delta-gate-final.md        # spec (read-only unless told)
  docs/PROGRESS.md                # you maintain: done / in progress / decisions / known issues
  spikes/                         # throwaway experiments
  golden/
    make_golden.py                # builds the demo workbooks with openpyxl
    recalc.sh                     # LibreOffice headless round-trip to add cached values
    excel_resave.ps1              # Excel COM: CalculateFull, error scan, save (run after recalc.sh)
    make_truefalse.py             # TRUE / FALSE golden workbook (kept apart: never rewrites the dues files)
    dues_v2.xlsx  dues_v3_REAL.xlsx  judge_xlookup.xlsx  truefalse.xlsx  drift_steps.json
  backend/
    pyproject.toml
    deltagate/
      config.py                   # paths, policy loading
      models.py                   # pydantic contracts (§5), the single source of types
      engine/
        parse.py                  # openpyxl: values, formulas, cached values, app name
        allowlist.py              # supported functions; unverifiable detection
        graph.py                  # networkx dependency graph, dependents, input regions
        align.py                  # key-column detection + row alignment (LCS fallback)
        classify.py               # raw diffs → ≤8 change groups (data/logic/structural)
        recalc.py                 # pycel wrapper + formulas fallback; coalition evaluation
        verify.py                 # recompute base vs cached values → coverage
        shapley.py                # exact Shapley over ≤8 groups (pure function)
        structural.py             # typed-over-formula, shortened range, protected edit, rows deleted, lost link
        proof.py                  # single-change proof workbook (fullCalcOnLoad)
        check.py                  # orchestrates a Check → CheckResult
      gate/
        store.py                  # managed folder, versions, SHA-256, unmanaged-change detection
        policy.py                 # impact limit, drift budget, protected, structural, can't verify
        gate.py                   # propose_edit → shadow copy → per-group decision → commit
        audit.py                  # hash chain + Ed25519 checkpoints + verify
      db.py                       # SQLite schema + queries
      api.py                      # FastAPI app (approver/UI surface)
      mcp_server.py               # MCPServer stdio server (agent surface)
      cli.py                      # `python -m deltagate.cli check A.xlsx B.xlsx`
    tests/
  frontend/
  policy.yaml                     # demo policy
```
The MCP server (launched by Claude Desktop) and the FastAPI app are **separate processes**. They share the `deltagate` package, `data/deltagate.db` (SQLite in WAL mode) and the `store/` folder. The UI polls held edits every 2 s.

## 5. Contracts (all parallel work depends on these; change them only by editing `models.py` and noting it in PROGRESS.md)

**Edit ops** (input to `propose_edit`):
```json
{"op":"set_value","cell":"Payments!C5","value":2500}
{"op":"set_formula","cell":"LateFees!F3","formula":"=F2*0.04"}
{"op":"append_row","sheet":"Expenses","values":["Lift repair",38000]}
```

**CheckResult:**
```json
{
  "check_id":"chk_…","mode":"check|gate|session_audit",
  "base_version":"<sha256>","new_version":"<sha256>",
  "verification":{"saved_by":"Microsoft Excel|LibreOffice|none","formula_cells":1248,"matched":1248,"mismatched":["Sheet!A1"]},
  "groups":[{"group_id":"g1","label":"New expense row: Lift repair","type":"data|logic|structural","cells":["Expenses!A12","Expenses!B12"]}],
  "outputs":[{
    "cell":"Summary!C6","label":"Total pending dues",
    "base":186000,"new":228000,
    "delta_observed":42000,"delta_verified":42000,"delta_unverified":0,
    "attribution":[{"group_id":"g1","solo":38000,"share":38000,"interaction":0}]
  },{
    "cell":"Summary!C9","label":"Rounded total",
    "base":null,"new":null,
    "delta_observed":null,"delta_verified":0,"delta_unverified":null,
    "attribution":[]
  }],
  "structural":[{"kind":"typed_over_formula|shortened_range|protected_formula_edit|rows_deleted_in_range|lost_link","cell":"Summary!C4","output":"Summary!C6","message":"Collected no longer depends on Payments!C (Amount paid)"}],
  "unverifiable":[{"cell":"Sheet!B2","reason":"XLOOKUP"}],
  "coverage":1.0
}
```

`base`, `new`, `delta_observed` and `delta_unverified` can be `null`: **null = no saved value, engine must not compute** (e.g. a ROUND output in a file with no saved values). Never show 0 in its place. `delta_verified` is always a number.

**Decision** (returned by `propose_edit` / `get_decision`):
```json
{"edit_id":"ed_…","session_id":"s_…","status":"PASS|HELD|PARTIAL|DENIED|APPROVED|ROLLED_BACK",
 "groups":[{"group_id":"g1","status":"PASS|HELD|CANT_VERIFY_HELD","reasons":["Protected formula LateFees!F3"],"impacts":[{"cell":"Summary!C6","delta":4000}]}],
 "committed_version":"<sha256|null>","check":{…CheckResult…}|null}
```
Decisions are made **per change group**: PASS groups are committed and HELD groups go to the approvals inbox. The result is `PARTIAL` when both happen.

`check` is the full Check (exact Shapley) and is built **only when a group is held**; it is `null` when every group passes. Group decisions come from **solo effects** (2 evaluations per group) plus one joint evaluation of all PASS groups ("Combined effect of passing groups exceeds limit"). `impacts` are those solo effects, and are empty for `CANT_VERIFY_HELD`.

**policy.yaml (demo):**
```yaml
watched_outputs:
  - {cell: "Summary!C6", label: "Total pending dues"}
  - {cell: "Summary!C4", label: "Collected"}
impact_limit_abs: 10000      # per output, per group
drift_budget: 25000          # per session, sum of |Δ| over PASSed groups
protected: ["LateFees!F3", "Summary!C4", "Summary!C6"]
```
**What "protected" means:** a *direct* edit to a protected cell (value or formula) is HELD. When a protected cell's value moves because its inputs changed, that's governed by `impact_limit_abs` and `drift_budget`, not by protection.

**SQLite tables:**
- `workbooks(id, name, current_version_id, created_at)`;
- `versions(id, workbook_id, sha256, path, parent_id, source[managed|unmanaged], saved_by[Microsoft Excel|LibreOffice|pending|none], created_at)`;
- `checks(id, json)`;
- `sessions(id, drift)`;
- `edits(id, session_id, workbook_id, ops_json, status, decision_json, created_at)`;
- `audit_log(seq, ts, actor, action, payload_json, prev_hash, hash)`;
- `checkpoints(seq, head_hash, ts, signature)`.

## 6. Engine design notes (decided; don't relitigate without a failing test)
- **Coalition value:** `v(S) = F(B with only groups in S applied) − F(B)`, so `v(∅) = 0` and `v(G) = Δ`. Use exact Shapley over ≤8 groups, which is ≤256 coalitions. With more than 8 raw groups, merge by sheet + column + type until ≤8.
- **Fast recalculation strategy:**
  - Value groups are applied with pycel `set_value`.
  - Formula groups require a recompile, so **cache one compiled model per subset of formula groups** (usually 1–2 formula groups → ≤4 compiles) and apply value groups on top.
  - Appended rows count as a data group. If a referencing range doesn't cover the new row, that's a finding, not a crash.
- **Saved values:** load once with `data_only=True` (cached values) and once with formulas. Verification recomputes **base** with the engine and compares to the cached values (rel tol 1e-9). Mismatching cells and their dependents become unverifiable.
- **Allowlist (from our pycel 1.0b30 test, `spikes/pycel_function_check.py`):**
  - ✅ SUM MIN MAX AVERAGE COUNT IF AND OR NOT ABS INT MOD SUMIF SUMIFS COUNTIF SUMPRODUCT IFERROR VLOOKUP INDEX MATCH LEN ROUNDUP, and TRUE / FALSE (literals and `TRUE()` / `FALSE()`; golden test `golden/truefalse.xlsx`, Excel-saved, all 24 cells match).
  - ⚠️ ROUND is unverifiable until an Excel-compatible override passes the golden test (`ROUND(7.5*1.234,2)` must give 9.26).
  - ❌ COUNTA and XLOOKUP are unverifiable (XLOOKUP may use the `formulas` fallback only after a golden test).
  - 🚫 Always unverifiable: NOW TODAY RAND OFFSET INDIRECT, macros (`.xlsm`/vbaProject), external links, pivots, dynamic arrays, LET.
- **Lost link (limited):** for each watched output, compute the set of input regions `(sheet, column header)` it transitively depends on, in base and in new. Any region missing in new is a `lost_link` finding. Same workbook only; no named ranges.
- **Row alignment:** detect a key column from headers (`Flat No`, `Flat`, `Invoice No`, `ID`). Fallback: LCS over row fingerprints that include the key and position.
- **Proof workbook:** base + one group applied, formulas intact, `wb.calculation.fullCalcOnLoad = True`.
- **Audit:**
  - `hash_i = sha256(hash_{i-1} || canonical_json(entry_i))`.
  - Write an Ed25519 checkpoint every 50 entries and at session end.
  - The key lives in `data/signing_key.pem`, generated on first run and gitignored.

## 7. Demo data (supersedes the spec's numbers where they differ)
- `dues_v2.xlsx`:
  - 60 flats;
  - sheets **Flats, Payments, Expenses, LateFees, Summary**;
  - only ✅ functions; **no ROUND**.
- `dues_v3_REAL.xlsx` = v2 plus three planted changes:
  1. **Data:** a new expense row "Lift repair ₹38,000" that flows into Total pending dues **+₹38,000**.
  2. **Logic:** `LateFees!F3` changes from `=F2*0.02` to `=F2*0.04`, where `F2` = overdue total = **₹2,00,000** → **+₹4,000**. (This replaces the spec's "2% → 5%", which can't give a whole ₹4,000.)
  3. **Structural:** `Summary!C4` (Collected) has its formula replaced by its own current value. Δ = 0, but it's flagged as typed over a formula plus a **lost link on watched output `Summary!C4`: "Collected no longer depends on Payments!C"**. There is **no** lost link on `Summary!C6`: it still reaches Payments!C via `LateFees!C` → `Payments!D`, and that is the correct result.
- **Expected Check result for Summary!C6:** Δ = **+₹42,000** = 38,000 + 4,000. Shares add up; interaction 0 (the two changes are additive in this design).
- **Base values:** `Summary!C6` = **₹2,86,000** (v2) → **₹3,28,000** (v3); `Summary!C4` = **₹1,00,000** in both. Assert the exact values in tests.
- `judge_xlookup.xlsx`: like v3, but some cells use XLOOKUP. The expected result is a partial `delta_verified` with the XLOOKUP cells listed as unverifiable.
- **Act 2 gate script** (`golden/drift_steps.json` + a pytest; runs from v2, simulating what Claude Desktop will do):
  - **Session A:** one `propose_edit` holding 3 payment rows of ₹2,500 each (one data group, |Δ| ₹7,500 ≤ 10,000) plus the `LateFees!F3` formula edit. The payments **PASS** and are committed; F3 is **HELD** (protected) → status `PARTIAL`.
  - **Session B** (fresh drift): 10 separate `propose_edit` calls of ₹3,000 each. The first 8 PASS (drift ₹24,000); the 9th would reach ₹27,000 > ₹25,000, so it's **HELD** by the drift budget.
- **Server commits:** a version the server commits is written by openpyxl and committed at once (`saved_by = pending`). A background LibreOffice run then adds a sidecar `versions/<sha>.lo.xlsx` with saved values (`saved_by = LibreOffice`; `none` on failure or a 30 s timeout). The committed file and its hash never change, and it is never labelled Excel.
- **Cached values:** generate the files with openpyxl, run `golden/recalc.sh` (LibreOffice) so they contain cached values, then run `golden/excel_resave.ps1` (real Excel over COM) so the banner can honestly say Excel. The committed files are the Excel-saved ones.

## 8. How to work
- **Before each phase:** restate the goal and acceptance tests in 5 lines, then build.
- **Testing:**
  - Write the engine tests **first** (pytest).
  - Property tests (hypothesis):
    - `sum(shares) == Δ` within 1e-9;
    - `v(∅) == 0`;
    - shares are symmetric for identical groups.
  - Unit test for the spec's worked example: rate 3.0 → 3.2 and late 2% → 5% on area 1,000 give Δ 300 = 207 + 93, with solo 204/90 and interaction +3/+3.
- **After every change:** run `uv run pytest -q`. Don't mark anything done with failing tests.
- **Version control:** commit after each green milestone with a clear message.
- **Keep `docs/PROGRESS.md` current:**
  - Done;
  - In progress;
  - Decisions (with why);
  - Known issues;
  - Cut list status.
- **Prefer simple code.** Engine functions are pure (data in, data out). No global state outside `config.py` and `db.py`.
- **When stuck for more than 20 minutes** on a library limitation, write a spike in `spikes/`, record the finding in PROGRESS.md, and choose the fallback from the spec's cut order:
  CSV → Session Audit screen → Ed25519 → drift → lost-link graph view → rollback → Shapley (solo-effect mode, clearly labelled) → gate.
  **Never cut:** the check against saved values, the classifier, the HELD screen.
- **Don't edit** `docs/delta-gate-final.md` unless asked; record deviations in PROGRESS.md instead.

## 9. Run commands (keep these working)
```
cd backend && uv sync && uv run pytest -q
uv run python -m deltagate.cli check ../golden/dues_v2.xlsx ../golden/dues_v3_REAL.xlsx
uv run uvicorn deltagate.api:app --reload --port 8000
uv run python -m deltagate.cli register ../golden/dues_v2.xlsx --id dues   # take a workbook into store/
uv run mcp dev deltagate/mcp_server.py          # MCP inspector
cd frontend && npm i && npm run dev
```
Claude Desktop config (`claude_desktop_config.json`):
```json
{"mcpServers":{"delta-gate":{"command":"uv","args":["--directory","/ABS/PATH/delta-gate/backend","run","python","-m","deltagate.mcp_server"]}}}
```

## 10. Team ownership (parallel branches, same contracts)
- **P1, MCP + Gate:** `mcp_server.py`, `gate/`, `db.py`.
- **P2, Graph + Structure:** `parse.py`, `graph.py`, `align.py`, `classify.py`, `structural.py`, `impact_preview`.
- **P3, Recalc + Attribution:** `recalc.py`, `verify.py`, `allowlist.py`, `shapley.py`, `proof.py`, `check.py`.
- **P4, UI + Demo:** `frontend/`, `golden/`, `api.py` endpoints for the UI, the demo script.
