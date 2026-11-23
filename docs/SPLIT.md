# Delta Gate: who does what, 23 Nov → 2 Dec 2026 (v3: Nitika on design only)

**People.** P1 = `<name>` · P2 = Nikita · P3 = Hemanth · P4 = Nitika.
**Teams.** **Team A, Backend:** P1, P3. **Team B, Frontend:** P2 (Nikita), with P4 (Nitika) on **visual design only**.
**State on 24 Nov, 01:45:**
- On `main`: #6, #7, #11, #12, #15 (tests green).
- Open: #8, #9, #10, #16, #17, #18, #19, #20.
- P1 and Hemanth are working tonight; Nikita and Nitika are not.

Sources: `CLAUDE.md` (build rules, wins on conflict), `docs/PROGRESS.md` (what is built, known issues), `docs/delta-gate-final.md` (§10 demo, §12 Q&A).

## 0. v3 changes (24 Nov, 01:45): these win over anything below that disagrees

### 0.1 Nitika does frontend design only
Nitika keeps the **visual design**: layout, colour, type, spacing, readability from 3 metres, and the look of the waterfall, cards and tables, for every tab. She restyles components that already work against real data, changing markup and classes, not data logic. Before editing a file, she tells its owner (§0.4).

Everything else she owned moves to P1 and Hemanth:

| Moved from Nitika | New owner |
|---|---|
| Reviewing frontend PRs (#8, #9, #17, #19, and later ones) | **Hemanth** |
| Approving the frontend side of contracts (#10, #16) | covered by the new approval rule (§0.5) |
| Page shell: three tabs, `@tanstack/react-query`, the `/api` proxy in `vite.config.ts`, banner logic | **P1** |
| Check tab data: upload two files, call the API, "Prove it" and CSV downloads, null → "unknown" | **P1** |
| Check tab results view, built on fixtures: template headline, ECharts waterfall whose bars sum to Δ, groups table (solo / share / interaction), type filter, clickable rows, unverifiable list, where `StructuralPanel` sits | **Hemanth** |
| Demo laptop setup (Excel, LibreOffice, uv, Node, repo, tests green, `demo_check` p95 re-run) | **Hemanth** |
| UI clicks in `DEMO_RUNBOOK.md` | **Hemanth** (Nikita adds the clicks for her tabs) |
| Backup screen recording of Acts 1–3 | **Hemanth** |
| `golden/` and `scripts/demo_reset.ps1` | **Hemanth** |

### 0.2 Tonight's order (P1 and Hemanth)
**P1**
1. Merge this split (doc-only).
2. Merge queue as approvals land: **#8 → #10 → #16 → #9 → #17 → #19 → #20**.
   - #19 also lands #18.
   - Before #20 merges, merge `main` into it.
   - Delete each branch after its merge.
   - #10, #16, #17 and #20 are approved already. #8, #9 and #19 wait on Hemanth.
3. **Shell PR (`p1-shell`), after #19:**
   - It replaces Nikita's temporary Approvals/Audit switch in `App.tsx`.
   - It adds **all** new frontend dependencies in one go (`@tanstack/react-query`, `echarts`, `echarts-for-react`), so only one PR touches the lockfile.
   - It adds the Vite `/api` proxy and the three tabs (Check, Approvals, Audit) with the honest banner.
4. **Check tab container (`src/tabs/Check/index.tsx`):**
   - upload two files → `POST /api/checks` → render Hemanth's `CheckResultView`;
   - "Prove it" → `POST /api/checks/{id}/proof/{group_id}` → download;
   - CSV → `/api/exports/{check_id}.csv`.

**Hemanth**
1. **Review and approve #8, #9 and #19**, so the queue can move.
2. **Check results view (`p3-check-view`) in `src/tabs/Check/`,** built against `fixtures/check_v2_v3.json` and `fixtures/check_judge_xlookup.json`.
   - **Before the shell PR merges:** the headline, groups table and unverifiable list, which need no new dependencies.
   - **After the shell PR merges:** the ECharts waterfall.
3. **29 Nov:** demo laptop setup and the `demo_check` p95 re-run. **30 Nov:** backup recording. Runbook UI clicks once the tabs work.

### 0.3 The interface between P1's container and Hemanth's view
```ts
// src/tabs/Check/CheckResultView.tsx (Hemanth)
export default function CheckResultView(props: {
  check: CheckResult                  // from src/types.ts
  onProve?: (groupId: string) => void // P1 wires it to POST /api/checks/{id}/proof/{group_id}
  csvHref?: string                    // P1 passes /api/exports/{check_id}.csv
}): JSX.Element
```
- Every number is formatted with `src/format.ts` (`inr`, `signedInr`). The view computes nothing.
- **Null shows "unknown", never 0.**
- **Groups with a zero share** stay out of the headline sentence and the waterfall bars, but they are listed in the groups table (PROGRESS.md UI note).
- **`StructuralPanel`** (from #9) goes in as is.

### 0.4 Who edits which frontend files (avoids clashes tonight)
| Owner | Files |
|---|---|
| P1 | `package.json`, `package-lock.json`, `vite.config.ts`, `App.tsx`, `main.tsx`, `src/api.ts`, `src/tabs/Check/index.tsx` |
| Hemanth | `src/tabs/Check/CheckResultView.tsx`, `Waterfall.tsx`, `GroupsTable.tsx` |
| Nikita | `src/tabs/Approvals/`, `src/tabs/Audit/`, `src/tabs/SessionAudit/`, `src/components/LostLinkGraph*` |
| Nitika | styling passes on any of the above, after telling the owner |

### 0.5 Approvals until 30 Nov (replaces the review lines in §1, §8 and §9)
- **Every code PR needs one approval from someone other than its author.**
- **A contract PR** (`models.py`, REST routes and payloads) needs one approval from a non-author on each side:
  - backend side: P1 or Hemanth;
  - frontend side: Nikita, or P1 / Hemanth where they wire the UI themselves.
- **Doc-only PRs may be self-merged.**
- **Nitika's approval is not required for anything.**

So #10 (Hemanth + Nikita), #16 (Hemanth; P1 wires the UI that uses it, and Nikita's written review had no blockers), #17 and #20 are ready to merge now.

## 1. Two teams

| | Team A: Backend | Team B: Frontend + demo |
|---|---|---|
| People | P1 (lead), P3 | P2 (Nikita); P4 (Nitika) on visual design only (§0.1) |
| Owns | `backend/`, `scripts/`, Claude Desktop, `DEMO_RUNBOOK.md`; since v3 also the shell, the Check tab, the demo laptop, the recording, `golden/` (§0.1) | Approvals, Audit and Session Audit tabs, the lost-link graph; Nitika: the look of every tab |
| Reviews | see §0.5 | see §0.5 |
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
| 3 | The `pending` window (~2 s after a commit, 8–9 s the first time): warm the LibreOffice profile in `demo_check`; agree the UI label with P1 | the first commit in the demo is not slow; label agreed | 29 Nov |
| 4 | Performance: p95 for Check and gate on the demo files, in PROGRESS.md (the gate test already prints p95) | gate p95 ≤ 3 s, numbers recorded | 29 Nov |
| 5 | `docs/DEMO_RUNBOOK.md` (moved from P4): words per act, the Desktop prompt, fallbacks, how to play the recording. Since v3 P3 also adds the UI clicks (Nikita for her tabs) | P2 can run the demo from the runbook alone | **29 Nov, 23:59** |
| 6 | Stretch, only if 2–5 are done: Excel-compatible ROUND with a golden test (`ROUND(7.5*1.234,2)` = 9.26) | golden test passes, else ROUND stays unverifiable | 30 Nov |

### Team B

#### P4 (Nitika): visual design only (v3)
- The look of the shell, the Check tab, and the Approvals, Audit and Session Audit tabs: layout, colour, type, spacing, readability from 3 metres, and the waterfall and card styling.
- She works on components that already render real data and tells the file's owner first (§0.4).
- Her former shell, Check tab, demo laptop, runbook, recording and review tasks moved to P1 and Hemanth (§0.1).
- The PPT is handled separately.

#### P2: Approvals, Audit, lost-link graph
**Files:** `frontend/src/tabs/Approvals*`, `frontend/src/tabs/Audit*`, `frontend/src/tabs/SessionAudit*`, `frontend/src/components/LostLinkGraph*`, engine structure files from §10.
**Already done:** HELD card (#8), structural panel (#9), judge's-file drill (#11).

| # | Task | Done when | Deadline |
|---|---|---|---|
| 1 | Review P1's shell PR the day it opens | the shell merges on 25 Nov | 25 Nov |
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
   - P1 builds the shell, which P2's tabs sit in.
   - P2 builds the inbox against fixtures.
3. **26 Nov:**
   - P1 builds the audit, CSV and Session Audit endpoints.
   - P2 builds the Audit tab against fixtures.
4. **27 Nov:**
   - P1 and Hemanth finish the Check tab core; Nitika styles it.
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
| P2 | page shell | P1 | 25 Nov 23:59 |
| P2 | approve / deny / rollback / held endpoints | P1 | 25 Nov 18:00 |
| Check tab (P1, Hemanth) | checks + proof endpoints (#16) | P1 | 24 Nov |
| P2, Check tab | audit + CSV endpoints (#16) | P1 | 24 Nov |
| P2 | Session Audit endpoints | P1 | 26 Nov 23:59 |
| P3 (`demo_check.py`) | all endpoints merged | P1 | 28 Nov 18:00 |
| P3 (runbook, recording) | all three tabs merged | P1, P2, P3 | 28 Nov 23:59 |
| P1 (Desktop) | the demo laptop set up | P3 | 29 Nov |

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
| Demo laptop set up: Excel, LibreOffice, uv, Node, repo on `main`, `uv sync`, `npm i` | P3 | `uv run pytest -q` green on it | 29 Nov |
| Claude Desktop on it: config backed up, `delta-gate` merged in with the absolute path of `uv.exe`, restart, `main.log` shows "Connected to delta-gate (5 tools)" | P1 | Act 2 prompt returns `PARTIAL` | 30 Nov 12:00 |
| Second laptop as a spare, same setup | P2 | same checks | 30 Nov |
| Rehearsal 1 (full, timed, from the runbook) | all, P3 runs it | under 3 min, no dead air | 29 Nov 21:00 |
| Rehearsal 2 + judge's-file drill | all, P2 runs the drill | 3 clean runs in a row | 30 Nov 18:00 |
| Backup recording | P3 | plays offline from USB | 30 Nov 23:59 |

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
| `CheckResult` | P3 | P1 (API, gate, Check tab), P2 (lost-link graph) |
| `Decision`, edit ops | P1 | P2 (Approvals), P3 (`demo_check.py`) |
| REST routes and payloads | P1 | P2 (and P3 where it wires the UI) |
| `policy.yaml` | P1 | P3 |
| SQLite tables | P1 | P3 |

- The frontend types are generated from, or copied from, `models.py`. A field the UI needs that is not there is a contract PR, not a workaround.
- Every number on screen comes from the engine; the UI only formats. Null means "unknown", never 0.
- Approve, deny and rollback stay REST-only. Nobody adds an MCP tool.

## 9. Merge rules

- One branch per task (`p1-…`, `p2-…`, `p3-…`, `p4-…`), off `main`. Branches merge into `main`, not into each other. If you must build on an open PR, say so in your PR and merge after it.
- **PRs into `main`. Nobody pushes to `main` directly.**
- Before every PR: `cd backend && uv run pytest -q` (and `npm run build` if `frontend/` changed). Paste the last line into the PR.
- **Approvals: see §0.5** (until 30 Nov: one non-author approval; contracts need a non-author on each side; Nitika's approval not required).
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
| **Wed 25 Nov** | P1 shell + Check tab data; P3 Check results view (both started 24 Nov night) | P2 Rollback button, lost-link graph; Nitika design pass | Pitch script 20:00, dry run 21:00 |
| **Thu 26 Nov** | P1 audit, CSV, Session Audit endpoints; one fixture script | P2 Audit tab on fixtures | **Pitch (day 1)**; dry run in the morning |
| **Fri 27 Nov** | Check tab done (P1 + P3) | P2 lost-link graph; Nitika design pass | **Pitch (day 2)** |
| **Sat 28 Nov** | P3 runbook UI clicks. **Phase 3 done** | P2 graph done; Nitika design pass | |
| **Sun 29 Nov** | P3 demo laptop + `demo_check` p95 re-run | P2 Session Audit screen | **Rehearsal 1, 21:00** |
| **Mon 30 Nov** | P1 Desktop on demo laptop 12:00; P3 recording. **Phase 4 done, freeze except fixes** | P2 drill 12:00 | **Rehearsal 2, 18:00**; confirm what may be brought on site |
| **Tue 1 Dec** | Hackathon hours 0–18 (§7) | Hackathon hours 0–18 (§7) | |
| **Wed 2 Dec** | Hours 18–24 (§7) | Hours 18–24 (§7) | **Demo** |
