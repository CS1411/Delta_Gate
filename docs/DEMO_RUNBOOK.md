# Delta Gate — Demo Runbook (3-Minute Live Demo)

Owner: **Hemanth / P3 (`h0674`)** · UI clicks & recording path: **Nitika / P4** · Claude Desktop setup: **P1** · Live presenter / drill: **Nikita / P2**

This runbook lets any teammate (including Nikita/P2) run the 3-minute demo end to end without guessing numbers or improvising recovery steps. Every figure on screen comes directly from the engine (`CLAUDE.md` §7).

---

## 1. Pre-Demo Checklist (10 minutes before going live)

1. **Pull `main` and restart Claude Desktop** (quit Claude Desktop completely before resetting state — a running MCP server process keeps the old Python code in memory until restarted).
2. **Reset to the clean demo start state** (`dues_v2.xlsx` registered as `dues`, empty `store/` and `data/deltagate.db`, keeping `data/libreoffice_profile`):
   ```powershell
   powershell -File scripts\demo_reset.ps1
   ```
3. **Verify everything headless (and warm the LibreOffice profile):**
   ```powershell
   cd backend
   uv run python ..\scripts\demo_check.py --isolated
   ```
   Confirm Acts 1–3 pass and LibreOffice warm-up completes (so `data\libreoffice_profile` is warm and Act 2's first commit sidecar runs in ~1.8 s instead of 8–9 s).
   - **Important:** if you ran `demo_check.py` *without* `--isolated`, it mutates the live `store/` and `data/deltagate.db` — run `powershell -File scripts\demo_reset.ps1` again before starting the demo.
   - **Demo laptop check (29 Nov):** on the demo laptop, run `git pull`, `cd frontend && npm ci`, `cd ..\backend && uv sync`, then run `uv run python ..\scripts\demo_check.py --isolated --bench-runs 5` and confirm `demo_check.py` passes **3 times in a row** with Gate decision p95 ≤ 3,000 ms.
4. **Start the backend REST API** (terminal 1, from `backend/`):
   ```powershell
   uv run uvicorn deltagate.api:app --port 8000
   ```
5. **Start the frontend UI** (terminal 2, from `frontend/`):
   ```powershell
   npm run dev
   ```
   Open `http://localhost:5173/#check`. The floating bottom dock (`01`–`04`) opens each tab directly: **01 Check** (`#check`), **02 Approvals** (`#approvals`, with live held-count badge), **03 Audit** (`#audit`), and **04 Session Audit** (`#session`).
6. **Reopen / restart Claude Desktop** (always restart after pulling `main` so the MCP server loads the latest code) and verify the MCP connector indicator shows **`Connected to delta-gate (5 tools)`**:
   - `read_range`, `impact_preview`, `explain_delta`, `propose_edit`, `get_decision`
   - Never any `approve`, `deny`, or `rollback` tool.
7. **Stage the 3 golden files** in an easy-to-reach folder (`golden/`):
   - `golden/dues_v2.xlsx`
   - `golden/dues_v3_REAL.xlsx`
   - `golden/judge_xlookup.xlsx`
8. **Run `scripts\demo_reset.ps1` only before a run, never once Act 1 has started.** It empties `data\` and `store\`, which removes Session Audit snapshots (Act 3 then fails with `Unknown snapshot '…'`), Act 2's held edits and the audit log.
9. **Never open `store\dues\current.xlsx` in Excel while the gate runs.** Excel holds it open for editing, Windows refuses the commit, and every edit with a PASS group fails with *"current.xlsx is open in another program (Excel?)"*. In Act 2 that means Session A shows no HELD card. To show the committed workbook in Excel, open a **copy** (or open read-only after the last edit and close with *Don't Save*; a read-only window does not refresh).

---

## 2. Exact Numbers Cheat Sheet (Do Not Improvise)

| Cell | `dues_v2.xlsx` | `dues_v3_REAL.xlsx` | Change / Notes |
|---|---|---|---|
| `Summary!C2` Maintenance billed | ₹3,45,000 | ₹3,45,000 | ₹0 |
| `Summary!C3` Expense recovery | ₹37,000 | ₹75,000 | +₹38,000 (row 12: Lift repair) |
| `Summary!C4` Collected | ₹1,00,000 (formula) | ₹1,00,000 (constant) | **₹0**, `typed_over_formula` + `lost_link` |
| `Summary!C5` Late fees | ₹4,000 | ₹8,000 | +₹4,000 (`LateFees!F3`: `=F2*0.02` → `=F2*0.04`) |
| **`Summary!C6` Total pending dues** | **₹2,86,000** | **₹3,28,000** | **+₹42,000** = ₹38,000 (data) + ₹4,000 (logic) |

- **Verification banner (`v2`):** `"Verified against Excel's saved values"` (`307 / 307` formula cells match).
- **Pending / missing saved values banner:** `"Not verifiable against saved values"` (agreed wording for both `pending` and `none` — never claim Excel when it wasn't Excel).
- **Judge file (`judge_xlookup.xlsx`):** `Summary!C6` Δ observed **+₹42,000** = **₹38,000 verified** + **₹4,000 unverified**, coverage **0.596**, 60 `XLOOKUP` cells listed.

---

## 3. Script: The 3-Minute Demo (Acts 0–3)

### Act 0 — Position (15 s)

- **Show:** Positioning slide (`delta-gate-final.md` §2.2 table).
- **Say:**
  > "84% of spreadsheets contain a material error, and AI agents now edit them too. Diffing tools are free, and approval gates are standard — we are the part in between that recalculates what an edit actually does, splits the change into exact rupees per cause, and refuses to guess."

---

### Act 1 — Check: Exact Attribution & Broken Link (45 s)

- **Do (Check tab UI clicks):**
  1. Open `http://localhost:5173/#check` (or click **01 Check** in the bottom dock).
  2. Under **Baseline Version** (`BASE WORKBOOK (.xlsx)`), select `golden/dues_v2.xlsx`; under **Modified Candidate** (`NEW WORKBOOK (.xlsx)`), select `golden/dues_v3_REAL.xlsx`; click **Run Check** *(offline fallback: under **Demo Fixtures**, click **Sample: dues v2 → v3**)*.
  3. Show headline: `Summary!C6` moved **₹2,86,000 → ₹3,28,000 (+₹42,000)**, split into **₹38,000** (Lift repair, `data`) + **₹4,000** (`LateFees!F3`, `logic`). Interaction is ₹0, so the bars add up exactly to Δ.
  4. Click the **+₹4,000** waterfall bar (or `LateFees!F3` group in **05 / Change Groups**) → click **Prove it** (`POST /api/checks/{id}/proof/{group_id}`) to download the solo proof workbook (Excel recalculates `Summary!C6 = ₹2,90,000`), and optionally point to **Export CSV Ledger** in **01 / Integrity Verification**.
  5. Point to the red Structural Alert in **04 / Structural Integrity Audit** on `Summary!C4` (Collected): `typed_over_formula` and **`lost_link`** (*"Collected no longer depends on Payments!C (Amount paid)"*) at **₹0** change; the mini-graph shows the dashed red `Payments!C → Summary!C4` link.
- **Point to on screen:**
  1. **Verification banner:** `"Verified against Excel's saved values: 307 / 307 formula cells match"`.
  2. **Waterfall & Attribution:** `+₹42,000 = ₹38,000 + ₹4,000` with zero interaction.
  3. **Solo Proof & Broken Link:** `LateFees!F3` solo effect verified by Excel itself; `Summary!C4` disconnected link flagged despite zero rupee movement.
- **Say:**
  > "Total pending dues rose ₹42,000: ₹38,000 from a new Lift repair expense row, ₹4,000 from a late-fee formula change, and you can open Prove it in Excel to verify the ₹4,000 yourself. Even better, Collected didn't move by a single rupee — ₹1,00,000 before and after — yet Delta Gate caught that someone typed over its formula and broke its link to Payments."

---

### Act 2 — Gate via MCP: Claude Desktop, Approvals Inbox & Drift Budget (90 s)

#### Part A: Session A (`PARTIAL` → Deny → Verify log)

- **Do:**
  1. Switch to **Claude Desktop** (workbook `dues` is already registered at `dues_v2.xlsx`).
  2. Type the exact prompt:
     > `Update late fees for overdue flats and tidy up the Summary sheet`
     *(If Claude asks which specific changes to make, or for a deterministic live run, send:)*
     > `In workbook dues (session s_A), record ₹2,500 payments in Payments!C5, Payments!C9, and Payments!C13, and update LateFees!F3 to =F2*0.04. Call impact_preview first, then propose_edit.`
  3. Watch Claude Desktop call **`impact_preview`** (`LateFees!F3` is marked `protected: true` and reaches `Summary!C6`), then **`propose_edit`**.
  4. Show Claude's response: **`PARTIAL`** — the 3 payments (**-₹7,500** on `Summary!C6`, **+₹7,500** on `Summary!C4`) **PASS** and are committed; `LateFees!F3` (+₹4,000, protected cell) is **HELD**.
  5. Switch to **02 Approvals** in the bottom dock (`http://localhost:5173/#approvals`; polls `GET /api/edits?status=held` and shows the live held-count badge — the `s_A` HELD card appears automatically).
  6. Point out the HELD card (reasons + ₹ impact), then click **Deny** (`POST /api/edits/{id}/deny`).
  7. Switch to **03 Audit** in the bottom dock (`http://localhost:5173/#audit`, `GET /api/audit`) and click **Verify log** (`GET /api/audit/verify`) → **✅ Chain verified**.
- **Say:**
  > "The agent never holds the pen — `propose_edit` is its only write path, while `approve`, `deny`, and `rollback` exist only on the human approver's REST surface. The safe ₹7,500 payments landed; the protected formula edit was held, denied, and sealed in the signed hash-chain audit log."

#### Part B: Session B (Drift budget on the 9th edit + Rollback)

- **Do:**
  1. In Claude Desktop (or if pressed for time, via `golden/drift_steps.json` Session B):
     > `In workbook dues (session s_B), apply ten separate ₹3,000 payments one at a time to Payments!C17, C21, C25, C29, C33, C37, C41, C45, C49, and C53 using propose_edit.`
  2. Show edits 1–8 **PASS** (cumulative session drift reaches **₹24,000** ≤ ₹25,000).
  3. Show the **9th edit (`Payments!C49`) is HELD**: `"Session drift would reach ₹27,000, over the budget of ₹25,000"`.
  4. On **02 Approvals**, scroll **below the held cards** to the **Workbooks** section. On the `dues` row click **Roll back**, then **Confirm rollback** (two clicks by design, so a stray click can't undo anything; **Cancel** backs out). It calls `POST /api/workbooks/dues/rollback` and restores the managed version before the current one.
- **Say:**
  > "Even small edits under the ₹10,000 per-edit limit can't salami-slice past the ₹25,000 session drift budget — the 9th edit is held, and the approver can roll back with a confirmed click."

---

### Act 3 — Fail Closed & Session Audit (30 s, plus ~60 s if a judge asks about Copilot)

**Before Act 3 (once, during the pre-demo checklist):**
- Stage `golden/dues_v2.xlsx`, `golden/dues_v3_REAL.xlsx` and `golden/judge_xlookup.xlsx` where the file picker opens.
- Open **04 Session Audit** (`#session`) in the bottom dock once and, if it shows a snapshot id left from rehearsal, click **Start over (forget this snapshot)**. The id lives in this browser's `localStorage`, so a rehearsal id would otherwise still be on screen.
- Do **not** run `scripts\demo_reset.ps1` between taking a snapshot and finishing the audit: it empties `data\`, which is where snapshots and kept Checks live, and the audit then fails with `Unknown snapshot '…'`.

#### Part A: Fail closed (judge file, ~30 s)

- **Do:**
  1. Open `http://localhost:5173/#check` (or click **01 Check** in the bottom dock).
  2. Pick `golden/dues_v2.xlsx` under **Baseline Version** (`BASE WORKBOOK (.xlsx)`) and `golden/judge_xlookup.xlsx` under **Modified Candidate** (`NEW WORKBOOK (.xlsx)`), then click **Run Check**.
     *(Offline fallback: under **Demo Fixtures**, click **Sample: judge file (XLOOKUP)**.)*
- **Point to on screen:**
  1. **01 / INTEGRITY VERIFICATION** banner: `Verified against Excel's saved values: 307 / 307 formula cells match`, then `Coverage: 59.6%`, the pill **`Partial verification (59.6%)`**, and the **Audit Health & Coverage** gauge (`59.6%`, `Unverifiable: 124`). The base file is the Excel-saved `dues_v2`; the partial part is the judge file's `XLOOKUP` cells.
  2. Total pending dues (`Summary!C6`): `₹2,86,000 → ₹3,28,000`, and the line **`+₹42,000 observed = +₹38,000 verified + ₹4,000 unverified`**. Under "Verified split" only the `+₹38,000` New row in Expenses: Lift repair (data) is attributed.
  3. **05 / Change Groups**: `60 formulas changed in LateFees!C (Balance)` and `Formula changed: LateFees!F3` both read **`unverified`** in **Solo Effect**, **Shapley Share (φ)**, and **Interaction** (never a ₹ number).
  4. **06 / UNVERIFIABLE BOUNDARY** (`Can't Verify (124 cells)`): `Excluded from attribution — we never guess`, **`XLOOKUP: 60`**, `depends on an unverifiable cell: 64`. The full cell list is behind **`Show all 124 unverifiable cells`**; do not open it live.
- **Say:**
  > "We can prove ₹38,000 of the ₹42,000. The other ₹4,000 flows through sixty XLOOKUP cells we can't verify, so we list them, leave them out of the split, and hold any agent edit that touches them. We never guess."

#### Part B: Session Audit, only if a judge asks about Copilot or Claude inside Excel (~60 s)

- **Do:**
  1. Open **04 Session Audit** in the bottom dock (`http://localhost:5173/#session`). If the tab is missing, use the fallback table below.
  2. Under **1. Snapshot the workbook before the AI session**, click the file picker labelled **Workbook before the session** and choose `golden/dues_v2.xlsx`.
  3. Click **Take snapshot**.
  4. *(The pause: this is where the AI session happens in Excel. On stage, say it, do not wait.)* Optional proof that the id survives: press **F5**. The same snapshot id is still on screen.
  5. Under **2. After the session, upload the workbook as it is now**, click the file picker labelled **Workbook after the session** and choose `golden/dues_v3_REAL.xlsx` (it stands in for the file saved after the AI session).
  6. Click **Check what the session changed**.
- **Point to on screen, in order:**
  1. After step 3, step 1 gets a green ✓ and reads `Snapshot of dues_v2.xlsx kept. It survives a reload; write it down anyway.` The **Snapshot id** is shown big, in the form `sa_` plus 12 characters (it is different every run; read it from the screen), with a **copy** button and `file hash e5ea5f376d40…`.
  2. After step 6, step 2 gets a ✓ and a blue line appears: **`Session audit: everything that changed in the workbook while the AI session ran (snapshot sa_… against the file you just uploaded). This is not a normal two-file Check.`**
  3. **01 / INTEGRITY VERIFICATION** banner: `Verified against Excel's saved values: 307 / 307 formula cells match`, then `Mode: session_audit · Coverage: 100%` and an **Export CSV Ledger** button.
  4. Cards: **Total pending dues `Summary!C6` `+₹42,000`** and **Collected `Summary!C4` `₹0`**; `₹2,86,000 → ₹3,28,000`; `+₹42,000 = +₹38,000 New row in Expenses: Lift repair (data) + ₹4,000 Formula changed: LateFees!F3 (logic)`.
  5. Under **04 / STRUCTURAL INTEGRITY AUDIT**, the red **LOST LINK · Summary!C4** card: `Collected no longer depends on Payments!C (Amount paid)`, `change ₹0`, with the graph: dashed red `Payments!C` to `Summary!C4` labelled `no longer connected`, and grey `Payments!C → Payments!D → LateFees!C → LateFees!D → LateFees!F → Summary!C → Summary!C6` labelled `still connected`. Under it: `Typed over a formula: Summary!C4 held the formula =SUM(Payments!C2:C61) and now holds a typed value`, and the grey **Protected cell edited** list (`LateFees!F3`, `Summary!C4`).
  6. **05 / Change Groups** (`Change Groups (3)`): `All Groups (3)`, `Data (1)`, `Logic (1)`, `Structural (1)`, `Unverified (0)`, each row with **Prove it** (works: the server keeps the two files).
- **Say:**
  > "We can't stand in front of an AI that runs inside Excel, so we audit its session instead. Snapshot before, let it work, upload the result afterwards: it changed Total pending dues by ₹42,000, and it broke the Collected link with no visible change at all."
- **Don't say** that the audit is signed or appears in **03 Audit**: Session Audit writes no audit-log entry. Say "snapshot before, Check after", nothing more.

#### Act 3 fallbacks (each line is what to do if that step fails live)

| Step | If it fails | Do this |
|---|---|---|
| A.1–A.2 Run Check on the judge file | Server down, or the click does nothing | Click **Sample: judge file (XLOOKUP)**; it is real engine output. Say it is a sample. |
| B.1 `04 Session Audit` missing from bottom dock | `#31` not merged on the demo laptop | Open the Session Audit tab by its hash, `http://localhost:5173/#session`; if it still does not appear, stop Part B and say "Session Audit is snapshot, then Check, and it reuses the same Check you just saw." |
| B.2 File not accepted | A red line `x.xlsx is not a readable workbook (.xlsx or .xlsm)` | Wrong file or an Excel lock file (`~$dues_v2.xlsx`): pick `golden/dues_v2.xlsx` again. |
| B.3 Take snapshot fails | `Couldn't reach the server. Is it running? …` plus the grey `offline — showing sample data` and a sample result | The API is down. Restart it (`uv run uvicorn deltagate.api:app --port 8000`, from `backend/`) and click **Take snapshot** again; or say the sample on screen is canned engine output and move on. |
| B.4 Snapshot id gone after F5 | The step-1 file picker is back, no id | Type or paste the id into **Already took one? Paste its snapshot id** and click **Use this id**. If it is lost, click **Start over (forget this snapshot)** and take a new snapshot (10 s). Keep the id written on a sticky note during Part B. |
| B.6 Check what the session changed fails | Red line `Unknown snapshot 'sa_…'` | The id is wrong, or `data\` was reset since the snapshot (never run `demo_reset.ps1` mid-demo). Start over and redo the snapshot. |
| B.6 Result slow | Button reads `Checking…` | Wait up to 5 s (a Check takes about 1.5 s). If it exceeds 10 s, say "this is the same Check engine as Act 1" and switch to the backup recording. |

---

## 4. Fallback Procedures (If Anything Breaks Live)

| Failure | Immediate Action |
|---|---|
| **Claude Desktop hangs, rate-limits, or asks too many clarifying questions** | Run the Act 2 gate flow headlessly from terminal: `cd backend && uv run python ../scripts/demo_check.py --isolated` (if run without `--isolated`, run `powershell -File scripts\demo_reset.ps1` again afterwards), or switch directly to the backup recording. |
| **Frontend (`localhost:5173`) or API (`localhost:8000`) crashes** | Run Act 1 & Act 3 live in terminal with CLI: `cd backend && uv run python -m deltagate.cli check ../golden/dues_v2.xlsx ../golden/dues_v3_REAL.xlsx` and `cd backend && uv run python -m deltagate.cli check ../golden/dues_v2.xlsx ../golden/judge_xlookup.xlsx`. If needed, switch to the backup recording. |
| **Fresh commit shows `"Not verifiable against saved values"` (`pending` window)** | Do **not** panic — explain honestly: LibreOffice headless is computing the sidecar in the background (~1.8 s after warm-up). Wait 2 s and refresh, or note that an unverified base stays honestly labelled rather than claiming Excel. |
| **Agent or Approvals tab says *"current.xlsx is open in another program (Excel?)"*** | Close that Excel window (Don't Save), then ask Claude to propose the edit again, or click Approve / Roll back again. Nothing was committed or recorded, so there is nothing to undo. |
| **Judge hands over their own messy workbook** | Run it through Check (or `uv run python -m deltagate.cli check base.xlsx new.xlsx`). Accept partial coverage or `saved_by = none` openly — never claim 100% coverage on unsupported functions (`ROUND`, `XLOOKUP`, `INDIRECT`, macros). |

### Playing the Backup Recording

- **Location:** `[Hemanth/P3 on 30 Nov: add recording filename on demo laptop Desktop + USB stick]`
- **Quick switch:** Keep the video player open and paused at `00:00` in a separate workspace / window behind the browser (`Alt+Tab` to switch immediately if live infra stalls for > 10 s).

---

## 5. Judge Q&A Owners (Quick Reference)

- **P1:** *"Can the agent bypass the gate?"*, *"Why MCP?"*, *"MCP gateways already do approval"*, *"Is the log tamper-proof?"* (Answer: **tamper-evident**, never tamper-proof).
- **Hemanth (P3):** *"Why Shapley / overkill / old?"*, *"Isn't Prove it circular?"*, *"What about unsupported functions / ROUND / XLOOKUP?"*
- **Nikita (P2):** *"Structural checks / lost link / total didn't change"*, *"What about Copilot inside Excel?"* (Answer: Session Audit).
- **Nitika (P4):** *"Diff tools are free"*, *"Societies use ADDA/MyGate"*, *"Tracelight / Copilot Plan mode"*.
