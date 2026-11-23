# Delta Gate: who does what, 23 Nov → 2 Dec 2026

**Team:** P1 = `<name>`, P2 = `<name>`, P3 = `<name>`, P4 = `<name>` (fill in the names).
**State on 23 Nov:** Phases 0–2 are merged to `main` (Check engine + CLI, gate, managed store, audit log, MCP server; 95 tests; Claude Desktop connects). **Left:** Phase 3 (REST API + web UI), Phase 4 (demo hardening), the PPT, the pitch, the demo.

Sources: `CLAUDE.md` (build rules, wins on conflict), `docs/PROGRESS.md` (what is built, known issues), `docs/PROMPTS.md` (Prompts 3 and 4), `docs/delta-gate-final.md` (§10 demo, §11 plan, §12 Q&A).

## 1. Rebalance against CLAUDE.md §10

The §10 areas stay as code ownership. The remaining load does not match them: P1–P3's areas are built, and almost all of Phase 3 would land on P4. So:

| | Owns (unchanged, §10) | Takes on now |
|---|---|---|
| **P1** | `mcp_server.py`, `gate/`, `db.py` | **All of `api.py`** (moved from P4), Claude Desktop on the demo laptop |
| **P2** | `parse.py`, `graph.py`, `align.py`, `classify.py`, `structural.py` | **UI tabs 2 and 3** (Approvals inbox, Audit log) + lost-link graph (moved from P4), judge's-file drill |
| **P3** | `recalc.py`, `verify.py`, `allowlist.py`, `shapley.py`, `proof.py`, `check.py` | **Phase 4 scripts**, Session Audit backend, engine known issues |
| **P4** | `frontend/` shell + **UI tab 1** (Check result), `golden/`, `scripts/` | **PPT lead**, `DEMO_RUNBOOK.md`, backup recording |

## 2. Per person

Definition of done (DoD) for every code task also includes: `uv run pytest -q` green, PR merged, `docs/PROGRESS.md` updated.

### P1 — REST API + agent surface
**Files:** `backend/deltagate/api.py`, `mcp_server.py`, `gate/`, `db.py`, `backend/tests/test_api.py`. **Branch:** `p1-api`.
**Claude Code prompt:** Prompt 3, scoped: *"API part only (api.py + tests). No frontend."*

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Commit `frontend/src/fixtures/*.json`: one real `CheckResult` (v2→v3), one judge result, two held `Decision`s, audit rows (dump from the engine, do not hand-write) | UI people can build against them without the API | **24 Nov, 12:00** |
| 2 | Approvals endpoints: `GET /api/edits?status=held`, `POST /api/edits/{id}/approve`, `/deny`, `POST /api/workbooks/{id}/rollback` | pytest: Session A held edit approved and denied over HTTP; a `Conflict` returns 409 with the message | **25 Nov, 18:00** |
| 3 | Check endpoints: `POST /api/checks` (two files), `GET /api/checks/{id}`, `POST /api/checks/{id}/proof/{group_id}` | upload v2 + v3 → +42,000 = 38,000 + 4,000; the proof file downloads | **25 Nov, 23:59** |
| 4 | Audit + export: `GET /api/audit`, `GET /api/audit/verify`, `GET /api/exports/{check_id}.csv` | verify returns ok / the failing entry; the CSV opens in Excel | **26 Nov, 18:00** |
| 5 | Session Audit endpoints: `POST /api/session-audit/snapshot`, `/complete` (engine call from P3) | snapshot → edit elsewhere → complete returns a Check with `mode = session_audit` | **28 Nov, 18:00** |
| 6 | Known issue: clean up old shadow / candidate files; MCP server shows the banner wording from `saved_by` | no files left in `store/<id>/shadow/` after approve / deny | 29 Nov |
| 7 | Claude Desktop on the **demo laptop** (see §6) | Act 2 prompt gives `PARTIAL` on that machine | **30 Nov, 12:00** |

### P2 — Approvals inbox, Audit tab, structure
**Files:** `frontend/src/tabs/Approvals*`, `frontend/src/tabs/Audit*`, `frontend/src/components/LostLinkGraph*`, engine files from §10, `golden/messy_*.xlsx`. **Branch:** `p2-approvals`.
**Claude Code prompt:** Prompt 3, scoped: *"UI tabs 2 and 3 and the React Flow lost-link graph only. Build the HELD card first. Use the fixtures until the API is merged."*

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | **HELD card** (edit, reasons, ₹ impact per output, Approve / Deny) on fixtures | readable from 3 metres; Indian number format | **25 Nov, 18:00** |
| 2 | Approvals inbox live: polling every 2 s, Approve / Deny / Rollback wired to P1's endpoints | Act 2 Session A: card appears within 2 s of the Desktop edit; Deny removes it | **27 Nov, 18:00** |
| 3 | Audit tab: entries, checkpoints, "Verify log" with ✅ / ❌ | tampering a row in SQLite turns it ❌ | **28 Nov, 12:00** |
| 4 | Lost-link mini-graph (React Flow) on the Check tab | v3 shows "Collected no longer depends on Payments!C"; the text alert works without the graph | **28 Nov, 23:59** |
| 5 | Judge's-own-file drill: 3 messy workbooks (merged headers, no key column, blank rows, unsupported functions, a macro) | nothing crashes; every failure ends in an honest "can't verify" | **30 Nov, 12:00** |
| 6 | Known issues in own area: reverse-direction `lost_link` noise; renamed sheet reads as deleted + added (document, do not fix unless the drill hits it) | decision recorded in PROGRESS.md | 30 Nov |

### P3 — demo hardening + engine
**Files:** `scripts/demo_check.py`, `backend/deltagate/engine/` files from §10, Session Audit engine path, `backend/tests/`. **Branch:** `p3-hardening`.
**Claude Code prompt:** Prompt 4, scoped: *"demo_check.py, Session Audit, performance. Not the runbook."*

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Known issue: cap formula-group compiles (merge formula groups so one Check never exceeds 8 compiles) | a test with 5 formula groups finishes in < 10 s | **25 Nov, 23:59** |
| 2 | Session Audit engine path: snapshot → Check with `mode = session_audit` | pytest: snapshot v2, "return" v3 → +42,000 and the lost link | **26 Nov, 23:59** |
| 3 | `scripts/demo_check.py`: Acts 1–3 headless, asserts every on-screen number (42,000 / 38,000 / 4,000, lost link, `PARTIAL`, drift on the 9th, XLOOKUP unverifiable) | passes 3 times in a row after `demo_reset.ps1` | **28 Nov, 23:59** |
| 4 | Known issue: the `pending` window (~2 s after a commit, 8–9 s on the first) | demo_check warms the LibreOffice profile; the UI label for `pending` agreed with P4 | 29 Nov |
| 5 | Performance: print p95 for Check and gate on the demo files | numbers in PROGRESS.md; gate p95 stays ≤ 3 s | 29 Nov |
| 6 | Stretch, only if 1–5 are done: Excel-compatible ROUND with a golden test (`ROUND(7.5*1.234,2)` = 9.26) | golden test passes against Excel, else ROUND stays unverifiable | 30 Nov |

### P4 — Check result tab, PPT, demo assets
**Files:** `frontend/` (shell, `src/tabs/Check*`, shared components, formatting), `golden/`, `scripts/demo_reset.ps1`, `docs/DEMO_RUNBOOK.md`, the PPT. **Branch:** `p4-check-ui`.
**Claude Code prompt:** Prompt 3, scoped: *"UI shell and tab 1 (Check result) only."* Then Prompt 4, scoped: *"DEMO_RUNBOOK.md only."*

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | **PPT** (see §4) | submitted, confirmation screenshot in the team chat | **24 Nov, 20:00** (hard limit 23:59) |
| 2 | Page shell: three tabs, Tailwind, react-query, `inr()` formatter (₹2,86,000), honest banner from `saved_by` | fixtures render; `pending` and `none` both say "Not verifiable against saved values" | **25 Nov, 23:59** |
| 3 | Check tab core: upload, banner, template headline, ECharts waterfall whose bars sum to Δ, groups table (solo / share / interaction) | v2 + v3 → "+₹42,000 = ₹38,000 … + ₹4,000 …"; a null output shows "unknown", never 0 | **27 Nov, 12:00** |
| 4 | Check tab rest: type filter, clickable rows, "Prove it", structural panel, unverifiable list, CSV export | judge file shows 38,000 verified + 4,000 unverified and the XLOOKUP list | **28 Nov, 18:00** |
| 5 | `docs/DEMO_RUNBOOK.md`: clicks and words per act, the Desktop prompt, fallbacks, how to play the recording | P2 can run the demo from the runbook alone | **29 Nov, 23:59** |
| 6 | Backup screen recording of Acts 1–3 | on the demo laptop **and** a USB stick | **30 Nov, 23:59** |

## 3. Dependencies (who blocks whom)

| Needed by | What | From | By |
|---|---|---|---|
| P2, P4 | JSON fixtures (real engine output) | P1 | 24 Nov 12:00 |
| P2 | approve / deny / rollback / held endpoints | P1 | 25 Nov 18:00 |
| P4 | checks + proof endpoints | P1 | 25 Nov 23:59 |
| P2, P4 | audit + CSV endpoints | P1 | 26 Nov 18:00 |
| P1 | Session Audit engine function | P3 | 26 Nov 23:59 |
| P2 | page shell + shared components (`inr`, banner) | P4 | 25 Nov 23:59 |
| P3 (`demo_check.py`) | all Phase 3 endpoints merged | P1 | 28 Nov 18:00 |
| P4 (runbook, recording) | all three tabs merged | P2, P4 | 28 Nov 23:59 |
| Everyone (pitch) | slide deck | P4 | 24 Nov 20:00 |
| P1 (demo laptop) | the laptop chosen, Excel + LibreOffice + uv + Node installed | P4 | 29 Nov |

If a dependency slips by more than half a day, the blocked person keeps building on fixtures and says so in the sync.

## 4. PPT (due 24 Nov, 23:59)

| Slide block | Content source | Owner |
|---|---|---|
| Problem + who it is for | spec §1 | P4 |
| What it does + positioning table | spec §2, §2.2, §14 | P4 |
| Attribution maths, worked example (300 = 207 + 93) | spec §3 | P3 |
| Controlled-write boundary, MCP tools, audit | spec §5, §8, §2.3 | P1 |
| Structural checks, lost link | spec §4 | P2 |
| Demo screenshots (CLI output + Desktop `PARTIAL`; no UI yet) | `main` today | P1 |
| Roadmap, business one-liner | spec §13, blueprint | P4 |

- Inputs from P1–P3 to P4 by **24 Nov, 14:00**. P4 assembles. Everyone reviews 18:00–19:30.
- **Registration and submission: P4**, backup P1. Submit by **20:00**; do not wait for 23:59.
- Every number on a slide is one the engine prints (build rule 1). No "tamper-proof", no "blocks Copilot".

## 5. Online pitch (26–27 Nov)

| Part | Time | Speaker |
|---|---|---|
| Problem, positioning ("the part in between") | 45 s | P4 |
| Act 1: Check, exact split, lost link | 60 s | P3 |
| Act 2: gate over MCP, HELD, audit | 75 s | P1 |
| Act 3: fail closed + roadmap + close | 40 s | P2 |

- Script draft: P4 by **25 Nov, 20:00**. Dry runs: **25 Nov 21:00** and **26 Nov morning**, timed.
- Live demo in the pitch uses the CLI + Claude Desktop if the UI is not ready; P4's recording is the fallback.

**Judge Q&A owners (spec §12). The owner answers; nobody else adds to it unless asked.**

| Topic | Owner | Backup |
|---|---|---|
| "Can the agent bypass the gate?", "Why MCP?", "MCP gateways already do approval" | P1 | P2 |
| "Is the log tamper-proof?" (answer: tamper-evident) | P1 | P3 |
| "Why Shapley / overkill / old?", "Isn't Prove it circular?" | P3 | P1 |
| "A function you don't support?", ROUND, XLOOKUP | P3 | P2 |
| Structural checks, lost link, "the total didn't change" | P2 | P3 |
| "Copilot shows change history", "Plan mode asks first", "Copilot inside Excel" (Session Audit) | P2 | P4 |
| Tracelight, "diff tools are free", ADDA / MyGate, market, business model | P4 | P1 |

## 6. Demo

| Item | Owner | Done when | By |
|---|---|---|---|
| Demo laptop set up: Excel, LibreOffice, uv, Node, repo on `main`, `uv sync`, `npm i` | P4 | `uv run pytest -q` green on it | 29 Nov |
| Claude Desktop on it: config backed up, `delta-gate` merged in with the absolute path of `uv.exe`, restart, `main.log` shows "Connected to delta-gate (5 tools)" | P1 | Act 2 prompt returns `PARTIAL` | 30 Nov 12:00 |
| Second laptop as a spare, same setup | P2 | same checks | 30 Nov |
| Rehearsal 1 (full, timed, from the runbook) | all, P4 runs it | under 3 min, no dead air | 29 Nov 21:00 |
| Rehearsal 2 + judge's-file drill | all, P2 runs the drill | 3 clean runs in a row | 30 Nov 18:00 |
| Backup recording | P4 | plays offline from USB | 30 Nov 23:59 |

`scripts\demo_reset.ps1` before **every** rehearsal and before the real demo. Quit nothing: it works with Desktop connected.

## 7. Hackathon days (1–2 Dec)

Hours count from the official start. Most of the build is merged, so the day is integration, polish and rehearsal. **If the rules require work done on site, confirm with the organisers on 30 Nov what may be brought in** (owner: P4).

| Hours | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| **0–2** | Desktop + MCP live on the venue network; `demo_reset` | Run the judge's-file drill on the venue laptop | `demo_check.py` ×3; fix the first failure | UI smoke test on the projector resolution |
| 2–8 | API bugs from the smoke tests | Approvals / Audit polish | Engine bugs from the drill | Check tab polish, 3-metre readability |
| 8–12 | Session Audit end to end | Lost-link graph polish | Performance numbers on stage hardware | CSV export, empty and error states |
| 12–16 | Anything a mentor asks for, behind a flag | Second judge-file pass | ROUND stretch only if all green | Runbook update, screenshots for judges |
| 16–18 | Integration: one full run together, fix only blockers | ← | ← | ← |
| **18** | **Freeze.** No new features. Tag `demo-freeze`. Gate not working → demo Check + fail closed only | | | |
| 18–24 | Rehearse the 3 acts ×3; P1 drives Desktop | Judge-sheet drill; Q&A practice | Stands by with `demo_check.py` after each reset | Fresh backup recording; drives the UI |

**After hour 18 only two kinds of commit are allowed:** a fix for a failing `demo_check.py`, and the runbook.

**Cut order if time runs short** (decide in the sync, record in PROGRESS.md):
CSV export → Session Audit screen (explain it verbally) → Ed25519 checkpoints → drift budget → lost-link graph view (keep the text alert) → rollback → Shapley (solo-effect mode, clearly labelled) → gate.
**Never cut:** the check against saved values, the classifier, the HELD screen.

## 8. Interface rules

- Contracts live in `backend/deltagate/models.py` and `CLAUDE.md` §5. Nowhere else.
- A contract changes only through a PR that **the owner of every consumer approves**:

| Contract | Producer | Consumers who must approve |
|---|---|---|
| `CheckResult` | P3 | P1 (API, gate), P4 (Check tab), P2 (lost-link graph) |
| `Decision`, edit ops | P1 | P2 (Approvals), P3 (`demo_check.py`) |
| REST routes and payloads | P1 | P2, P4 |
| `policy.yaml` | P1 | P3, P4 |
| SQLite tables | P1 | P3 |

- The frontend types are generated from, or copied from, `models.py`. A field the UI needs that is not there is a contract PR, not a workaround.
- Every number on screen comes from the engine; the UI only formats. Null means "unknown", never 0.
- Approve, deny and rollback stay REST-only. Nobody adds an MCP tool.

## 9. Merge rules

- One branch per person (`p1-api`, `p2-approvals`, `p3-hardening`, `p4-check-ui`). Short-lived extra branches are fine; they merge into `main`, not into each other.
- **PRs into `main`. Nobody pushes to `main` directly.**
- Before every PR: `cd backend && uv run pytest -q` (and `npm run build` if `frontend/` changed). Paste the last line into the PR.
- One other person approves. For a contract change, see §8.
- **Doc-only PRs may be self-merged.** Any PR that touches `backend/` or `frontend/` needs one teammate's approval.
- Merge commit (no squash), no AI attribution lines in commits or PRs.
- Rebase or merge `main` into your branch at least once a day.
- `scripts\demo_reset.ps1` before every rehearsal.
- `data/`, `store/` and `*.pem` never get committed.

## 10. Daily 15-minute sync (21:00, 24 Nov → 30 Nov)

1. Each person, 2 minutes: merged since yesterday, merging today, blocked on whom.
2. Dependency table (§3): anything due in the next 24 h at risk?
3. Any contract change pending approval? Approve or reject now.
4. `main` green? (`uv run pytest -q`, last run by whom, when.)
5. Cut list: anything to cut today? Write it in PROGRESS.md.
6. Next deadline out loud (PPT / pitch / rehearsal).

## 11. Timeline

| Date | Build | Everything else |
|---|---|---|
| **Mon 23 Nov** | Phases 0–2 merged. This split agreed, names filled in | PPT outline (P4) |
| **Tue 24 Nov** | P1 fixtures 12:00 | PPT inputs 14:00, review 18:00, **submit 20:00 (limit 23:59)**; registration confirmed |
| **Wed 25 Nov** | P1 approvals + checks endpoints; P2 HELD card; P4 shell; P3 compile cap | Pitch script 20:00, dry run 21:00 |
| **Thu 26 Nov** | P1 audit + CSV; P3 Session Audit engine | **Pitch (day 1)**; dry run in the morning |
| **Fri 27 Nov** | P4 Check tab core 12:00; P2 inbox live 18:00 | **Pitch (day 2)** |
| **Sat 28 Nov** | P2 Audit tab + lost-link graph; P4 Check tab rest; P1 Session Audit endpoints; P3 `demo_check.py`. **Phase 3 done** | |
| **Sun 29 Nov** | Known issues (P1 shadow cleanup, P3 pending window + performance) | Runbook (P4); demo laptop ready; **rehearsal 1, 21:00** |
| **Mon 30 Nov** | P2 judge's-file drill 12:00. **Phase 4 done. Code freeze except fixes** | Desktop on demo laptop 12:00; **rehearsal 2, 18:00**; backup recording; confirm what may be brought on site |
| **Tue 1 Dec** | Hackathon hours 0–18: integrate, polish, **freeze at hour 18** | |
| **Wed 2 Dec** | Hours 18–24: rehearse ×3, judge-sheet drill | **Demo** |
