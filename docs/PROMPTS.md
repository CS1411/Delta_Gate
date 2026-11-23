# Claude Code prompts for the Delta Gate build

Paste these one at a time. **Don't start the next phase until the current one's acceptance tests pass.**
Open a fresh session per phase (or use `/clear`). `CLAUDE.md` reloads automatically, so state carries over through `docs/PROGRESS.md`.

---

## Prompt 0: Kickoff (paste first)

```
You are the lead engineer for Delta Gate, our wHACKiest 2026 Track 1 ("Make MCP Matter") entry.

First run /workflow-orchestrator to plan this task (use find-skills if a skill you need is missing).

Context, read fully before writing code:
1. CLAUDE.md: build rules, stack, repo layout, contracts, demo numbers. It wins over the spec where they differ.
2. docs/delta-gate-final.md: the product spec (sections 2–11 matter most; skip the business parts).
3. spikes/pycel_function_check.py: our pycel 1.0b30 function test (results are in CLAUDE.md §6).

Then do PHASE 0 ONLY and stop for my review:

PHASE 0 — Scaffold + golden data + engine spike
a) Create the repo layout from CLAUDE.md §4: backend with uv (pyproject with the pinned deps), an empty frontend (Vite React TS), docs/PROGRESS.md, .gitignore (data/, store/, *.pem, node_modules, .venv). git init and commit.
b) golden/make_golden.py: build dues_v2.xlsx and dues_v3_REAL.xlsx exactly as CLAUDE.md §7 describes (60 flats; sheets Flats, Payments, Expenses, LateFees, Summary; only allowlisted functions; the three planted changes). Also build judge_xlookup.xlsx. Then golden/recalc.sh runs LibreOffice headless so every file has cached values. If LibreOffice isn't installed, tell me the install command and continue with the rest.
c) spikes/coalition_timing.py: load v2 and v3 with pycel, apply the change groups by hand, evaluate Summary!C6 for all 2^n coalitions, and print:
   - the Shapley shares (they must sum to Δ = +42,000: 38,000 + 4,000);
   - wall time for 256 coalitions, using the "one compiled model per formula-group subset + set_value for data groups" strategy from CLAUDE.md §6.
   Also test whether pycel can evaluate an appended row and a changed formula without a full reload, and report what works.
d) backend/tests/test_shapley.py: implement engine/shapley.py as a pure function over a value oracle v(S), with
   - the spec's worked example (300 = 207 + 93; solo 204/90; interaction +3/+3);
   - hypothesis properties: shares sum to Δ, v(∅)=0, symmetric groups get equal shares.
e) Write docs/PROGRESS.md containing: what works, timing numbers, any pycel limitations found, and decisions taken. Commit.

Acceptance for Phase 0:
- `uv run pytest -q` is green.
- The timing spike prints the expected shares and a timing figure.
- The golden files open in LibreOffice/Excel and show the expected Summary!C6 values for v2 and v3.

Rules: don't build anything beyond Phase 0. Ask me before changing any contract in CLAUDE.md §5. If a design note in CLAUDE.md §6 turns out to be wrong, prove it with a spike, record it in PROGRESS.md and propose the fix. Don't silently work around it.
```

---

## Prompt 1: Check engine end to end (CLI)

```
Read CLAUDE.md and docs/PROGRESS.md. Do PHASE 1 and stop.

PHASE 1 — Check mode, backend only, via CLI
Build engine/: parse.py (values + formulas + cached values + saved_by from docProps/app.xml), allowlist.py, graph.py, align.py, classify.py (≤8 groups, data/logic/structural), recalc.py (pycel primary, formulas fallback, the coalition strategy from PROGRESS.md), verify.py (base recompute vs cached values → coverage), structural.py (all 5 checks incl. limited lost link), proof.py (fullCalcOnLoad), check.py → CheckResult (models.py, CLAUDE.md §5 schema). Plus cli.py: `python -m deltagate.cli check A B` prints a readable summary and `--json` prints the CheckResult.

Tests first. Acceptance (all as pytest):
- v2→v3: Summary!C6 Δ = +42,000; shares 38,000 (data, Expenses) + 4,000 (logic, LateFees!F3); sum == Δ.
- Structural findings include typed_over_formula at Summary!C4 and a lost_link on watched output Summary!C4: "Collected no longer depends on Payments!C". There must be NO lost_link on Summary!C6 (it still reaches Payments!C via LateFees!C → Payments!D).
- Verification: matched == formula_cells on v2 (with cached values), saved_by is read correctly.
- judge_xlookup: the XLOOKUP cells are listed as unverifiable, delta_unverified > 0, coverage < 1, and the verified part is still attributed.
- ROUND is detected as unverifiable.
- The proof workbook for the F3 group, recalculated with LibreOffice, gives +4,000 on Summary!C6.
- A full Check on the demo files runs in < 10 s (print the timing).
Update PROGRESS.md and commit.
```

---

## Prompt 2: Gate + store + audit + MCP server

```
Read CLAUDE.md and docs/PROGRESS.md. Do PHASE 2 and stop.

PHASE 2 — Gate, managed store, audit log, MCP server
- gate/store.py: register a workbook into store/ (server-only write), versions with SHA-256 and parent, shadow copies, commit, rollback to the last approved version, unmanaged-change detection (hash mismatch → source=unmanaged + automatic Check vs the last managed version).
- gate/policy.py + gate/gate.py: propose_edit(ops) → shadow copy → Check(base=current, new=shadow) → per-group decision with the rules from CLAUDE.md §5 (impact limit, session drift budget, protected = direct edits, any structural finding, CANT_VERIFY_HELD) → commit PASS groups only → Decision. approve(edit_id) commits the held groups; deny logs them; both approver-only.
- gate/audit.py: hash chain + Ed25519 checkpoints every 50 entries and at session end + verify().
- db.py: the SQLite schema from CLAUDE.md §5, WAL mode.
- mcp_server.py (FastMCP, stdio): read_range, impact_preview(cell) (dependents + watched outputs reached), explain_delta(base_version, new_version), propose_edit(workbook_id, ops, session_id), get_decision(edit_id). NO approve/deny/rollback/file tools. Tool descriptions must tell the agent to call impact_preview before editing and that propose_edit is the only way to write.

Acceptance (pytest + manual):
- The Act 2 script from CLAUDE.md §7: Session A → PARTIAL (payments PASS + committed, F3 HELD); Session B → the 9th edit HELD by drift.
- An edit touching an XLOOKUP cell → CANT_VERIFY_HELD.
- Tampering with an audit_log row makes verify() fail; untouched, it passes.
- Overwriting the stored file outside the server → next read reports an unmanaged change with a Check.
- `uv run mcp dev deltagate/mcp_server.py` lists exactly the 5 tools. Give me the claude_desktop_config.json snippet with absolute paths and a 3-line test I can type into Claude Desktop.
Update PROGRESS.md and commit.
```

---

## Prompt 3: REST API + web UI

```
Read CLAUDE.md and docs/PROGRESS.md. Do PHASE 3 and stop.

PHASE 3 — FastAPI + React page (the judges will look at this, so make it clean and legible from 3 metres away)
API (api.py): POST /api/checks (upload two files) → CheckResult; GET /api/checks/{id}; POST /api/checks/{id}/proof/{group_id} → download; GET /api/edits?status=held; POST /api/edits/{id}/approve|deny; POST /api/workbooks/{id}/rollback; GET /api/audit + /api/audit/verify; GET /api/exports/{check_id}.csv; POST /api/session-audit/snapshot + /complete.
UI (one page, three tabs):
1. Check result: upload, verification banner (honest saved_by wording), headline sentence from templates ("+₹42,000 = ₹38,000 new expense row (data) + ₹4,000 late-fee formula (logic)"), ECharts waterfall whose bars sum to Δ, a table of groups with solo / share / interaction, a type filter (data/logic/structural/unverified), clickable rows that highlight the cells, a "Prove it" button, a structural-warnings panel with the lost-link alert, a React Flow mini-graph for the lost link, an unverifiable list, CSV export.
2. Approvals inbox: held cards (edit, reasons, ₹ impact per output, waterfall), Approve / Deny, Rollback, polling every 2 s.
3. Audit log: entries, checkpoints, a "Verify log" button with ✅/❌.
Build the HELD card first. Use Indian number formatting (₹1,86,000). No auth.

Acceptance: I can run the full demo Acts 1–3 from the browser with the API running, and Act 2 with Claude Desktop connected. Screenshot each tab (or describe it if you can't) and list anything not yet working. Update PROGRESS.md and commit.
```

---

## Prompt 4: Demo hardening

```
Read CLAUDE.md and docs/PROGRESS.md. Do PHASE 4.

PHASE 4 — Make the demo unbreakable
- scripts/demo_reset.sh: restores store/, the DB and the golden files to the demo start state in one command.
- scripts/demo_check.py: runs Acts 1–3 headless and asserts every on-screen number (42,000 / 38,000 / 4,000, the lost link, PARTIAL, drift on the 9th, unverifiable XLOOKUP). It must pass 3 times in a row.
- Session Audit flow end to end (snapshot → edit the file elsewhere → upload → Check).
- Judge's-own-file drill: run Check on 3 messy real-world-style workbooks (merged headers, no key column, blank rows, unsupported functions). Nothing may crash; every failure must end in an honest "can't verify" message.
- Performance: print the p95 for Check and gate on the demo files.
- Write docs/DEMO_RUNBOOK.md: exact clicks and words per act, the Claude Desktop prompt to type, fallback steps if something fails live, and how to play the backup recording.
Update PROGRESS.md (with the final cut-list status) and commit.
```

---

## Prompts for when something breaks

- **A bug:** "Reproduce this with a failing test first, then fix it. Don't change unrelated code. Error: <paste>"
- **Scope creep:** "Stop. Check CLAUDE.md §2 rule 5 and the cut order in §8. Tell me what you'd cut to stay on schedule."
- **Lost context:** "Read CLAUDE.md and docs/PROGRESS.md, summarise where we are in 10 lines, then continue with <next item>."
