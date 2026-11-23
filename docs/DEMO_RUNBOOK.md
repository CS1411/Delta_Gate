# Delta Gate — Demo Runbook (3-Minute Live Demo)

Owner: **Hemanth / P3 (`h0674`)** · UI clicks & recording path: **Nitika / P4** · Claude Desktop setup: **P1** · Live presenter / drill: **Nikita / P2**

This runbook lets any teammate (including Nikita/P2) run the 3-minute demo end to end without guessing numbers or improvising recovery steps. Every figure on screen comes directly from the engine (`CLAUDE.md` §7).

---

## 1. Pre-Demo Checklist (10 minutes before going live)

1. **Close Claude Desktop** (or ensure its `delta-gate` MCP connection is not mid-write) before resetting state.
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
4. **Start the backend REST API** (terminal 1, from `backend/`):
   ```powershell
   uv run uvicorn deltagate.api:app --port 8000
   ```
5. **Start the frontend UI** (terminal 2, from `frontend/`):
   ```powershell
   npm run dev
   ```
   Open the browser tab to the Vite URL (e.g. `http://localhost:5173`).
   - `[Nitika/P4: confirm exact Vite URL / port and initial landing tab]`
6. **Open Claude Desktop** and verify the MCP connector indicator shows **`Connected to delta-gate (5 tools)`**:
   - `read_range`, `impact_preview`, `explain_delta`, `propose_edit`, `get_decision`
   - Never any `approve`, `deny`, or `rollback` tool.
7. **Stage the 3 golden files** in an easy-to-reach folder (`golden/`):
   - `golden/dues_v2.xlsx`
   - `golden/dues_v3_REAL.xlsx`
   - `golden/judge_xlookup.xlsx`

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

### Act 1 — Check: Exact Attribution & Broken Link (60 s)

- **Do:**
  1. `[Nitika/P4: exact clicks to open Check tab and upload golden/dues_v2.xlsx as Base and golden/dues_v3_REAL.xlsx as New (POST /api/checks)]`
- **Point to on screen:**
  1. **Verification banner:** `"Verified against Excel's saved values"` (`307 / 307`).
  2. **Headline + ECharts waterfall:** `Summary!C6` moved **₹2,86,000 → ₹3,28,000 (+₹42,000)**, split into **₹38,000** (New row in Expenses: Lift repair, `data`) + **₹4,000** (`LateFees!F3`, `logic`). Interaction is ₹0, so the bars add up exactly to Δ.
  3. **Click the ₹4,000 bar / filter to `logic`:** highlights `LateFees!F3`. `[Nitika/P4: confirm click/filter selector]`
  4. **Click "Prove it"** (`POST /api/checks/{id}/proof/{group_id}`) on the `LateFees!F3` group, download and open the proof workbook in Excel.
     - Show `LateFees!F3` is `=F2*0.04` while `Expenses!B12` is still empty and `Summary!C4` still has its formula.
     - Excel recalculates `Summary!C6` to **₹2,90,000** (**+₹4,000** solo effect — computed by Excel itself, not our engine).
  5. **Point to the red Structural Alert on `Summary!C4` (Collected):**
     - `typed_over_formula` + **`lost_link`**: *"Collected no longer depends on Payments!C (Amount paid)"* with **₹0** change.
     - React Flow mini-graph: dashed red link `Payments!C → Summary!C4`, while `Summary!C6` stays connected via `Payments!D → LateFees!C`.
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
  5. Switch back to the **Approvals** tab (polls `GET /api/edits?status=held` every 2 s; card appears automatically). `[Nitika/P4 & Nikita/P2: confirm Approvals tab click/card button labels]`
  6. Point out the HELD card (reasons + ₹ impact + waterfall), then click **Deny** (`POST /api/edits/{id}/deny`).
  7. Switch to the **Audit** tab (`GET /api/audit`) `[Nitika/P4 & Nikita/P2: confirm Audit tab & Verify log button]` and click **Verify log** (`GET /api/audit/verify`) → **✅**.
- **Say:**
  > "The agent never holds the pen — `propose_edit` is its only write path, while `approve`, `deny`, and `rollback` exist only on the human approver's REST surface. The safe ₹7,500 payments landed; the protected formula edit was held, denied, and sealed in the signed hash-chain audit log."

#### Part B: Session B (Drift budget on the 9th edit + Rollback)

- **Do:**
  1. In Claude Desktop (or if pressed for time, via `golden/drift_steps.json` Session B):
     > `In workbook dues (session s_B), apply ten separate ₹3,000 payments one at a time to Payments!C17, C21, C25, C29, C33, C37, C41, C45, C49, and C53 using propose_edit.`
  2. Show edits 1–8 **PASS** (cumulative session drift reaches **₹24,000** ≤ ₹25,000).
  3. Show the **9th edit (`Payments!C49`) is HELD**: `"Session drift would reach ₹27,000, over the budget of ₹25,000"`.
  4. On the **Approvals** tab, click **Rollback** (`POST /api/workbooks/dues/rollback`) `[Nikita/P2: confirm Rollback button label]` to restore the previous managed version in one click.
- **Say:**
  > "Even small edits under the ₹10,000 per-edit limit can't salami-slice past the ₹25,000 session drift budget — the 9th edit is held, and one click rolls back."

---

### Act 3 — Fail Closed & Session Audit (30 s)

- **Do:**
  1. `[Nitika/P4: upload golden/dues_v2.xlsx + golden/judge_xlookup.xlsx on Check tab]`
- **Point to on screen:**
  1. `Summary!C6`: **+₹42,000 observed = ₹38,000 verified + ₹4,000 unverified**; **coverage 0.596**; `unverifiable` table lists **60 `XLOOKUP` cells** in `LateFees!C2:C61`.
  2. If a gated edit touches those cells, it returns **`CANT_VERIFY_HELD`** with empty impacts (never a guessed number).
- **If asked about Copilot or Claude inside Excel:**
  - Switch to **Session Audit** (`POST /api/session-audit/snapshot` → edit in Excel → `POST /api/session-audit/complete`) `[Nikita/P2: confirm Session Audit tab/buttons]`: take a snapshot before the in-Excel AI session, let the tool edit the sheet, upload the saved file after → Delta Gate runs a full Check (`mode = "session_audit"`).
- **Say:**
  > "We verify ₹38,000 of the ₹42,000 change; the remaining ₹4,000 flows through 60 XLOOKUP cells we don't support yet, so we list them and hold. We never guess. And for AI inside Excel that we can't sit in front of, Session Audit snapshots before and checks everything afterwards."

---

## 4. Fallback Procedures (If Anything Breaks Live)

| Failure | Immediate Action |
|---|---|
| **Claude Desktop hangs, rate-limits, or asks too many clarifying questions** | Run the Act 2 gate flow headlessly from terminal: `cd backend && uv run python ../scripts/demo_check.py --isolated` (or run `demo_reset.ps1` then `demo_check.py`), or switch directly to the backup recording. |
| **Frontend (`localhost:5173`) or API (`localhost:8000`) crashes** | Run Act 1 & Act 3 live in terminal with CLI: `cd backend && uv run python -m deltagate.cli check ../golden/dues_v2.xlsx ../golden/dues_v3_REAL.xlsx` and `cd backend && uv run python -m deltagate.cli check ../golden/dues_v2.xlsx ../golden/judge_xlookup.xlsx`. If needed, switch to the backup recording. |
| **Fresh commit shows `"Not verifiable against saved values"` (`pending` window)** | Do **not** panic — explain honestly: LibreOffice headless is computing the sidecar in the background (~1.8 s after warm-up). Wait 2 s and refresh, or note that an unverified base stays honestly labelled rather than claiming Excel. |
| **Judge hands over their own messy workbook** | Run it through Check (or `uv run python -m deltagate.cli check base.xlsx new.xlsx`). Accept partial coverage or `saved_by = none` openly — never claim 100% coverage on unsupported functions (`ROUND`, `XLOOKUP`, `INDIRECT`, macros). |

### Playing the Backup Recording

- **Location:** `[Nitika/P4: add exact filename and folder on the demo laptop Desktop and USB stick]`
- **Quick switch:** Keep the video player open and paused at `00:00` in a separate workspace / window behind the browser (`Alt+Tab` to switch immediately if live infra stalls for > 10 s).

---

## 5. Judge Q&A Owners (Quick Reference)

- **P1:** *"Can the agent bypass the gate?"*, *"Why MCP?"*, *"MCP gateways already do approval"*, *"Is the log tamper-proof?"* (Answer: **tamper-evident**, never tamper-proof).
- **Hemanth (P3):** *"Why Shapley / overkill / old?"*, *"Isn't Prove it circular?"*, *"What about unsupported functions / ROUND / XLOOKUP?"*
- **Nikita (P2):** *"Structural checks / lost link / total didn't change"*, *"What about Copilot inside Excel?"* (Answer: Session Audit).
- **Nitika (P4):** *"Diff tools are free"*, *"Societies use ADDA/MyGate"*, *"Tracelight / Copilot Plan mode"*.
