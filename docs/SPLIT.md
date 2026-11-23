# Delta Gate: who does what, 23 Nov → 2 Dec 2026 (v2: two teams)

**Teams.** **Team A, Backend:** P1 = `<name>`, P3 = `<name>`. **Team B, Frontend + demo:** P2 = `<name>`, P4 = `<name>` (fill in the names).
**State on 23 Nov, evening:** Phases 0–2 are on `main`. Seven PRs are open (#6–#12), and a trial merge of all seven into `main` passes: 139 passed, 5 skipped, `npm run build` clean. Not started yet: `api.py`, the page shell, the Check tab, the PPT.

Sources: `CLAUDE.md` (build rules, wins on conflict), `docs/PROGRESS.md` (what is built, known issues), `docs/PROMPTS.md` (Prompts 3 and 4), `docs/delta-gate-final.md` (§10 demo, §11 plan, §12 Q&A).

## 0. Merge queue (do this first, by 24 Nov 12:00)

Merge in this order. After each merge, run `uv run pytest -q` on `main`. Two merges hit a small conflict; the fix is in the table.

| # | PR | Branch | What | Approver | Conflict when merged in this order |
|---|---|---|---|---|---|
| 1 | #7 | `p1-api` | UI fixtures from the real engine + fixture tests | P3 | none |
| 2 | #8 | `p2-approvals` | HELD card, Tailwind, `types.ts`, `format.ts` | P4 | none |
| 3 | #6 | `p3-hardening` | compile cap (≤ 8 compiles), Session Audit engine | P1 | `docs/PROGRESS.md`: keep both "Done" sections |
| 4 | #11 | `p2-messy-drill` | judge's-file drill, 3 messy pairs, renamed sheets | P1 | none |
| 5 | #12 | `p3-engine-fixes` | no ₹0 shares through unverifiable cells; new and renamed sheets grouped | P1 | `classify.py`: keep the renamed/new-sheet grouping, then the compile-budget loop from #6 |
| 6 | #10 | `p3-lostlink-data` | **contract:** `region`, `path_before`, `kept` on lost-link findings | P1, P2, P4 (§8) | `structural.py`: map base regions through renames *and* fill `region` / `path_before` / `kept` |
| 7 | #9 | `p2-graph` | Check tab structural panel (lost link as the headline) | P4 | none |

## 1. Two teams

| | Team A: Backend | Team B: Frontend + demo |
|---|---|---|
| People | P1 (lead), P3 | P4 (lead), P2 |
| Owns | `backend/`, `scripts/` (except `demo_reset.ps1`), Claude Desktop, `DEMO_RUNBOOK.md` | `frontend/`, the PPT, the backup recording, the demo laptop |
| Reviews | P1 and P3 review each other's PRs, the same day | P2 and P4 review each other's PRs, the same day |
| Hands to the other team | REST endpoints, fixtures, contract changes | the UI that the runbook and `demo_check.py` describe |

Code ownership from `CLAUDE.md` §10 stays as it is. A contract change (`models.py`, REST payloads) also needs approval from the other team (§8).

**Why this split:** what is left in the backend is the API and the demo proof; what is left in the frontend is three tabs and the PPT. Each pair works in one folder, reviews its own work quickly and rarely touches the other pair's files.

## 2. Per person (what is left)

Definition of done (DoD) for every code task also includes: `uv run pytest -q` green, PR merged, `docs/PROGRESS.md` updated.

### Team A

#### P1: REST API (team lead)
**Files:** `backend/deltagate/api.py`, `mcp_server.py`, `gate/`, `db.py`, `scripts/dump_fixtures.py`, `backend/tests/test_api.py`.
**Already done:** fixtures and fixture tests (#7).

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Merge queue (§0): review and merge the backend PRs | all seven merged, `main` green | **24 Nov, 12:00** |
| 2 | Approvals endpoints: `GET /api/edits?status=held`, `POST /api/edits/{id}/approve`, `/deny`, `POST /api/workbooks/{id}/rollback` | pytest: Session A held edit approved and denied over HTTP; a `Conflict` returns 409 | **25 Nov, 18:00** |
| 3 | Check endpoints: `POST /api/checks`, `GET /api/checks/{id}`, `POST /api/checks/{id}/proof/{group_id}` | v2 + v3 → +42,000 = 38,000 + 4,000; the proof file downloads | **25 Nov, 23:59** |
| 4 | Audit and export: `GET /api/audit`, `GET /api/audit/verify`, `GET /api/exports/{check_id}.csv` | verify returns ok or the failing entry; the CSV opens in Excel | **26 Nov, 18:00** |
| 5 | Session Audit endpoints on `session_audit.snapshot` / `complete` (engine ready in #6; a bad id returns 404) | snapshot → edit elsewhere → complete returns `mode = session_audit` | **26 Nov, 23:59** (was 28 Nov) |
| 6 | One fixture script: fold `scripts/make_fixtures.py` (the `decision_*` HELD and can't-verify cards) into `dump_fixtures.py`, delete the old one | one command regenerates every fixture | 26 Nov |
| 7 | Clean up old shadow and candidate files; the MCP server shows the banner wording from `saved_by` | nothing left in `store/<id>/shadow/` after approve or deny | 29 Nov |
| 8 | Claude Desktop on the **demo laptop** (§6) | Act 2 prompt gives `PARTIAL` on that machine | **30 Nov, 12:00** |

#### P3: engine and demo proof
**Files:** `backend/deltagate/engine/` (§10 files), `session_audit.py`, `scripts/demo_check.py`, `docs/DEMO_RUNBOOK.md`.
**Already done:** compile cap and Session Audit engine (#6), engine fixes (#12), lost-link path data (#10).

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Review P1's API PRs the day they open | no API PR waits overnight | ongoing |
| 2 | `scripts/demo_check.py`: Acts 1–3 headless, asserts every on-screen number (42,000 / 38,000 / 4,000, lost link on C4, `PARTIAL`, drift on the 9th, XLOOKUP unverifiable) | passes 3 times in a row after `demo_reset.ps1` | **28 Nov, 23:59** |
| 3 | The `pending` window (~2 s after a commit, 8–9 s the first time): warm the LibreOffice profile in `demo_check`; agree the UI label with P4 | the first commit in the demo is not slow; label agreed | 29 Nov |
| 4 | Performance: p95 for Check and gate on the demo files, in PROGRESS.md (the gate test already prints p95) | gate p95 ≤ 3 s, numbers recorded | 29 Nov |
| 5 | `docs/DEMO_RUNBOOK.md` (moved from P4): words per act, the Desktop prompt, fallbacks, how to play the recording. P4 adds the UI clicks | P2 can run the demo from the runbook alone | **29 Nov, 23:59** |
| 6 | Stretch, only if 2–5 are done: Excel-compatible ROUND with a golden test (`ROUND(7.5*1.234,2)` = 9.26) | golden test passes, else ROUND stays unverifiable | 30 Nov |

### Team B

#### P4: shell, Check tab, PPT (team lead)
**Files:** `frontend/` (shell, `src/tabs/Check*`), `golden/`, `scripts/demo_reset.ps1`, the PPT.
**Reuse, do not rebuild:** Tailwind, `src/types.ts` and `src/format.ts` (`inr`, `signedInr`, `savedByBanner`) from #8; `src/components/StructuralPanel.tsx` from #9.

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | **PPT** (§4) | submitted, confirmation screenshot in the team chat | **24 Nov, 20:00** (hard limit 23:59) |
| 2 | Page shell: three tabs, react-query, the honest banner | fixtures render; `pending` and `none` both say "Not verifiable against saved values" | **25 Nov, 23:59** |
| 3 | Check tab core: upload, banner, template headline, ECharts waterfall whose bars sum to Δ, groups table (solo / share / interaction) | v2 + v3 → "+₹42,000 = ₹38,000 … + ₹4,000 …"; a null output shows "unknown", never 0 | **27 Nov, 12:00** |
| 4 | Check tab rest: type filter, clickable rows, "Prove it", drop in `StructuralPanel`, unverifiable list, CSV export | judge file shows 38,000 verified + 4,000 unverified and the XLOOKUP list | **28 Nov, 18:00** |
| 5 | Demo laptop: Excel, LibreOffice, uv, Node, repo on `main`, `uv sync`, `npm i` | `uv run pytest -q` green on it | 29 Nov |
| 6 | UI clicks in P3's runbook; backup screen recording of Acts 1–3 | recording on the demo laptop **and** a USB stick | **30 Nov, 23:59** |

#### P2: Approvals, Audit, lost-link graph
**Files:** `frontend/src/tabs/Approvals*`, `frontend/src/tabs/Audit*`, `frontend/src/tabs/SessionAudit*`, `frontend/src/components/LostLinkGraph*`, engine structure files from §10.
**Already done:** HELD card (#8), structural panel (#9), judge's-file drill (#11).

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Review P4's shell PR the day it opens | the shell merges on 25 Nov | 25 Nov |
| 2 | Approvals inbox live: poll every 2 s, Approve / Deny / Rollback wired to P1's endpoints | Act 2 Session A: the card appears within 2 s of the Desktop edit; Deny removes it | **27 Nov, 18:00** |
| 3 | Audit tab: entries, checkpoints, "Verify log" with ✅ / ❌ | tampering a row in SQLite turns it ❌ | **28 Nov, 12:00** |
| 4 | Lost-link mini-graph (React Flow) from `region`, `path_before`, `kept` (#10) | v3: dashed red Payments!C → Summary!C4; C6 still connected via Payments!D and LateFees!C; the text alert works without it | **28 Nov, 23:59** |
| 5 | Session Audit screen (it had no owner): snapshot → upload the after-file → show the Check | Act 3 can show it; cut-list item 2 if late | 29 Nov |
| 6 | Judge's-file drill again on the demo laptop (`tests/test_messy.py` + one real file a teammate brings) | nothing crashes; every failure is an honest "can't verify" | **30 Nov, 12:00** |

## 3. Order and dependencies

**Build order:**
1. **24 Nov:**
   - Merge queue by 12:00.
   - P4's PPT by 20:00.
   - Nothing else waits on the PPT.
2. **25 Nov:**
   - P1 builds the approvals and check endpoints.
   - P4 builds the shell, which P2's tabs sit in.
   - P2 builds the inbox against fixtures.
3. **26 Nov:**
   - P1 builds the audit, CSV and Session Audit endpoints.
   - P2 builds the Audit tab against fixtures.
4. **27 Nov:**
   - P4 finishes the Check tab core.
   - P2's inbox goes live on the real API.
5. **28 Nov:**
   - Every tab and endpoint is merged.
   - P3's `demo_check.py` runs against them.
6. **29 Nov:**
   - Runbook, demo laptop, rehearsal 1.
7. **30 Nov:**
   - Phase 4 done, freeze, rehearsal 2, recording.

| Needed by | What | From | By |
|---|---|---|---|
| everyone | merge queue (§0) | both teams | 24 Nov 12:00 |
| everyone (pitch) | slide deck | P4 | 24 Nov 20:00 |
| P2 | page shell | P4 | 25 Nov 23:59 |
| P2 | approve / deny / rollback / held endpoints | P1 | 25 Nov 18:00 |
| P4 | checks + proof endpoints | P1 | 25 Nov 23:59 |
| P2, P4 | audit + CSV endpoints | P1 | 26 Nov 18:00 |
| P2 | Session Audit endpoints | P1 | 26 Nov 23:59 |
| P3 (`demo_check.py`) | all endpoints merged | P1 | 28 Nov 18:00 |
| P3 (runbook), P4 (recording) | all three tabs merged | P2, P4 | 28 Nov 23:59 |
| P1 (Desktop) | the demo laptop set up | P4 | 29 Nov |

If a dependency slips by more than half a day, the blocked person keeps building on fixtures and says so in the sync. Inside a team, the lead decides who helps whom.

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

- One branch per task (`p1-…`, `p2-…`, `p3-…`, `p4-…`), off `main`. Branches merge into `main`, not into each other. If you must build on an open PR, say so in your PR and merge after it.
- **PRs into `main`. Nobody pushes to `main` directly.**
- Before every PR: `cd backend && uv run pytest -q` (and `npm run build` if `frontend/` changed). Paste the last line into the PR.
- **Your teammate approves** (Team A: P1 and P3; Team B: P2 and P4). For a contract change, see §8: the other team approves too.
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

| Date | Team A (P1, P3) | Team B (P2, P4) | Everything else |
|---|---|---|---|
| **Mon 23 Nov** | Phases 0–2 merged; #6, #7, #10–#12 open | #8, #9 open | This split agreed, names filled in |
| **Tue 24 Nov** | Merge queue 12:00 | Merge queue 12:00 | PPT inputs 14:00, review 18:00, **submit 20:00 (limit 23:59)** |
| **Wed 25 Nov** | P1 approvals + checks endpoints | P4 shell; P2 inbox on fixtures | Pitch script 20:00, dry run 21:00 |
| **Thu 26 Nov** | P1 audit, CSV, Session Audit endpoints; one fixture script | P2 Audit tab on fixtures | **Pitch (day 1)**; dry run in the morning |
| **Fri 27 Nov** | P3 `demo_check.py` on what is merged | P4 Check core 12:00; P2 inbox live 18:00 | **Pitch (day 2)** |
| **Sat 28 Nov** | P3 `demo_check.py` 23:59. **Phase 3 done** | P2 Audit tab + graph; P4 Check rest | |
| **Sun 29 Nov** | P1 shadow cleanup; P3 pending window, performance, runbook | P2 Session Audit screen; P4 demo laptop | **Rehearsal 1, 21:00** |
| **Mon 30 Nov** | P1 Desktop on demo laptop 12:00. **Phase 4 done, freeze except fixes** | P2 drill 12:00; P4 recording | **Rehearsal 2, 18:00**; confirm what may be brought on site |
| **Tue 1 Dec** | Hackathon hours 0–18 (§7) | Hackathon hours 0–18 (§7) | |
| **Wed 2 Dec** | Hours 18–24 (§7) | Hours 18–24 (§7) | **Demo** |
