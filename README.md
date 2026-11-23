# Delta Gate

**An independent, fail-closed check for AI spreadsheet edits.** *(wHACKiest 2026 · Track 1: Make MCP Matter)*

> *Diffing tools are free, and approval gates are standard. Delta Gate is the part in between that recalculates what an edit actually does, splits the change into exact ₹ per cause, catches broken links even when the total doesn't move, and refuses to guess.*

---

## Why Delta Gate?

When an AI agent edits a workbook, nobody can reliably answer **which edit caused how much of the change** or catch silent structural breakage **before** the edit lands. Delta Gate computes every number with a real formula engine (`pycel`), verifies against the workbook's saved values, attributes changes exactly with Shapley values, and gates AI writes behind an MCP boundary.

---

## Three Modes

| Mode | Input | What it produces |
|---|---|---|
| **Check** | Two workbook versions (`base`, `new`) | Exact ₹ change per watched output split by cause (Shapley shares that sum to Δ), `data` vs `logic` vs `structural` groups, structural findings (incl. `lost_link`), coverage %, and a single-change **proof workbook** (`fullCalcOnLoad`) to verify in Excel |
| **Gate** | AI agent edits proposed through our MCP server (the agent's **only** write path) | Per-group decisions (`PASS`, `HELD`, or `CANT_VERIFY_HELD`) enforced on a shadow copy against impact limits, session drift budget, protected cells, and structural checks; every action recorded in a hash-chained, Ed25519-checkpointed audit log |
| **Session Audit** | A pre-session snapshot + the workbook saved after an in-Excel AI session | A full `Check` (`mode = "session_audit"`) of everything the external session changed — our honest answer for in-Excel agents (e.g. Copilot) we cannot intercept |

---

## Core Guarantees

1. **Every number comes from the engine.** UI and summaries only format engine output (`null` always displays as `"unknown"`, never `0`).
2. **Fail closed.** Cells depending on unsupported or volatile functions (e.g. `XLOOKUP`, `ROUND`, `NOW`, `TODAY`, `RAND`, `OFFSET`, `INDIRECT`), macros, external links, or mismatched saved values are marked unverifiable, excluded from attribution (`delta_unverified`), and **HELD** (`CANT_VERIFY_HELD`) if touched by a gated edit.
3. **The agent never holds the pen.**
   - MCP exposes only 5 tools: `read_range`, `impact_preview`, `explain_delta`, `propose_edit`, `get_decision`.
   - `approve`, `deny`, and `rollback` are **REST-only** and approver-only.
   - Only the server writes to `store/`, and out-of-band modifications are flagged as `unmanaged` changes with an automatic Check.
4. **Honest verification labels.** Reads `docProps/app.xml` (`Application`):
   - `Microsoft Excel` → `"Verified against Excel's saved values"`
   - `LibreOffice/` → `"Verified against LibreOffice's saved values"`
   - anything else / missing cached values → `"Not verifiable against saved values"`
5. **Tamper-evident audit log.** Entries are SHA-256 hash-chained (`hash_i = sha256(hash_{i-1} || canonical_json(entry_i))`) with Ed25519-signed checkpoints every 50 entries and at session end (`GET /api/audit/verify`).

---

## Demo Numbers at a Glance (`golden/`)

Comparing `golden/dues_v2.xlsx` → `golden/dues_v3_REAL.xlsx` (60-flat housing society dues workbook):

| Watch / Metric | Value |
|---|---|
| Verification | `Verified against Excel's saved values` (`307 / 307` formula cells match, coverage `1.0`) |
| `Summary!C6` (Total pending dues) | **₹2,86,000 → ₹3,28,000 (`+₹42,000`)** |
| Attribution split (`Σ φ(g) = Δ`) | **+₹38,000** new `Expenses` row (*Lift repair*, `data`) + **+₹4,000** `LateFees!F3` (`=F2*0.02` → `=F2*0.04`, `logic`) + **₹0** `Summary!C4` (`structural`), interaction `0` |
| Structural alert (`Summary!C4`) | `typed_over_formula` + **`lost_link`**: *"Collected no longer depends on Payments!C (Amount paid)"* (₹0 impact) |
| Fail-closed (`judge_xlookup.xlsx`) | `Summary!C6` `+₹42,000` observed = **₹38,000 verified + ₹4,000 unverified** (60 `XLOOKUP` cells listed, coverage `0.596`) |

---

## Architecture & Stack

```text
Claude Desktop ──(MCP stdio, 5 tools)──▶ backend/deltagate/mcp_server.py ──┐
                                                                           ▼
React UI (Vite + TS + Tailwind) ──(REST)──▶ backend/deltagate/api.py ──▶ gate/ & engine/
                                                                           │
                                        data/deltagate.db (SQLite WAL) ◀───┼──▶ store/<id>/
                                        data/signing_key.pem (Ed25519) ◀───┘
```

- **Backend (`backend/`):** Python 3.12 + `uv`, FastAPI + Uvicorn, `mcp` 2.x (`MCPServer`, stdio), `openpyxl`, `networkx`, `pycel` (`1.0b30`), `pydantic` v2, `cryptography` (Ed25519), `sqlite3` (WAL mode), `pytest` + `hypothesis`.
- **Frontend (`frontend/`):** React 19, Vite 8, TypeScript, Tailwind CSS v4.
- **Golden & Scripts (`golden/`, `scripts/`):** Excel-saved golden workbooks, Act 2 gate script (`drift_steps.json`), `demo_reset.ps1`, `dump_fixtures.py`.

---

## Quick Start

### 1. Backend tests & CLI
```powershell
cd backend
uv sync
uv run pytest -q
uv run python -m deltagate.cli check ..\golden\dues_v2.xlsx ..\golden\dues_v3_REAL.xlsx
```

### 2. Reset demo store & run REST API
```powershell
powershell -File scripts\demo_reset.ps1
cd backend
uv run uvicorn deltagate.api:app --reload --port 8000
```

### 3. Frontend dev server
```powershell
cd frontend
npm install
npm run dev
```

### 4. Claude Desktop MCP config (`%APPDATA%\Claude\claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "delta-gate": {
      "command": "C:\\path\\to\\uv.exe",
      "args": ["--directory", "C:\\ABS\\PATH\\Delta_Gate\\backend", "run", "python", "-m", "deltagate.mcp_server"]
    }
  }
}
```

---

## Key Documentation

- [`CLAUDE.md`](CLAUDE.md) — Build rules, stack, contracts, and demo numbers (source of truth for implementation)
- [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) — End-to-end architecture, engine walkthrough, contracts, and progress
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — Build log, decisions, measurements, and known issues
- [`docs/SPLIT.md`](docs/SPLIT.md) — Team ownership, merge queue, and schedule
- [`docs/delta-gate-final.md`](docs/delta-gate-final.md) — Product specification, attribution math, competitive positioning, and Q&A
