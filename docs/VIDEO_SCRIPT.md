# Delta Gate: video pitch script (target 4:30, limit 5:00)

Speaking pace ~130 words/min. Spoken text is in quotes. Every number comes from the engine or the deck. Say "tamper-evident", never "tamper-proof". Say we "audit" in-Excel AI sessions, never that we "block Copilot".

The template asks for seven things: problem, solution, tech stack, process flow, novelty, impact and feasibility, business model. Each has its own section below, in the template's order, so a judge who only watches the video still gets all seven.

---

## 0:00–0:25 · Hook (Rudra)
**Screen:** slide 1, then slide 2 number `₹2,86,000 → ₹3,28,000  +₹42,000 but why?`

"A society treasurer's dues sheet says total pending dues went from ₹2,86,000 to ₹3,28,000. Up ₹42,000. Three things changed in that file: a new expense row, a late-fee formula, and one overwritten total. Which one moved the number, and by how much? Today nobody can tell you. We're team minty jamun from MSRIT, and this is Delta Gate."

## 0:25–1:05 · Problem (Nitika)  [template: PROBLEM STATEMENT]
**Screen:** slide 2, stats and gap table

"Spreadsheets have no memory of cause. 84% of them carry a material error. Now AI agents edit them too, and Microsoft's own Excel agent completes only 57.2% of SpreadsheetBench tasks. So the person who approves an AI edit is signing off blind.

The tools that exist don't close this. Diff tools show what changed, not the rupees each change caused. Copilot's Plan mode shows planned steps, not the computed result. Tracelight shows propagation and an AI summary, but not shares that add up. And MCP gateways see the tool name and arguments, but they cannot recalculate. It hits approvers of AI edits, CAs reviewing models, and society treasurers."

## 1:05–1:50 · Solution and what's different (Rudra)  [template: PROPOSED SOLUTION + NOVELTY]
**Screen:** slide 3 flow, then slide 6 table and Shapley example

"Delta Gate is an independent check for AI spreadsheet edits. It does four things. It recalculates what every edit does. It splits the change in each watched output into exact rupees per cause. It flags structural breakage, even when the total doesn't move. And it holds AI edits that cross policy limits. When it can't verify something, it says can't verify and holds. It never guesses.

Here is how we are different. Others show cells or narrate. We recompute counterfactuals: what would the total be with only this edit. And we split the change with Shapley values, an idea from finance. Take two changes worth 204 and 90 on their own. They add up to 294, but the real change is 300. Shapley shares give 207 and 93, and they sum to exactly 300. Solo effects don't add up. Ours always do."

## 1:50–2:40 · Live demo, Act 1 and Act 2 (Rudra, then Hemanth)
**Screen:** CLI check `dues_v2 → dues_v3_REAL`, then Approvals tab. If the UI isn't ready, use the CLI plus Claude Desktop. Keep the recorded fallback.

"Act 1. We check version 2 against version 3. Verified against Excel's saved values: 307 of 307 formula cells match. Total pending dues moved plus ₹42,000: ₹38,000 from the new Lift repair row, ₹4,000 from the late fee going from 2% to 4%, and ₹0 from the overwritten Collected total. But that ₹0 is flagged: Collected no longer depends on Payments. A broken link, found even though the total didn't move.

Act 2. Claude Desktop now edits through our MCP server. Three ₹2,500 payments pass and are committed. The late-fee formula is protected, so it is held for a human. Then ten ₹3,000 edits: the first eight pass, and the ninth is held, because the session drift would reach ₹27,000 against a ₹25,000 budget. Ten small edits can't slip through."

## 2:40–3:20 · Process flow and tech (Hemanth)  [template: PROCESS FLOW + TECH STACK]
**Screen:** slide 5 diagram, then slide 4 stack

"The agent never holds the pen. Our MCP server exposes five tools, read range, impact preview, explain delta, propose edit and get decision, and nothing else. No file system, no Excel. Every edit lands on a shadow copy, the engine recalculates, and the gate decides per change group. Pass groups are committed by the server as a new version. Held groups go to an approvals inbox. Approve, deny and rollback are web-only, never MCP tools, so the agent cannot approve itself. An edit made outside this path, by a human or Copilot, is detected by hash mismatch and checked automatically.

The stack is all open source and runs on one laptop. React and Vite on the front. FastAPI and the official MCP SDK on the back. openpyxl, networkx and pycel for recalculation. SQLite in WAL mode. The audit log is a SHA-256 hash chain with Ed25519 signed checkpoints. It is tamper-evident, and we don't claim more than that."

## 3:20–3:50 · Fail closed, feasibility and honesty (Nikita)  [template: IMPACT & FEASIBILITY]
**Screen:** slide 7, then a sheet with XLOOKUP showing partial coverage

"Feasibility rests on one rule: fail closed. 22 functions pass our pycel test. XLOOKUP, COUNTA, ROUND, macros and external links are unverifiable. We list them, show no number for them, and hold the edit. If a judge drops in a sheet with XLOOKUP, we verify what we can, say exactly what we can't, and hold. The banner also names the app that saved the values. It says Excel only when Excel saved the file.

Cost scales with the number of change groups, not workbook size. Groups are capped at eight, so at most 256 recalculations for an exact split. It works with any MCP agent, runs locally, and costs nothing to host."

## 3:50–4:25 · Real-world use and business (Nikita)  [template: BUSINESS MODEL]
**Screen:** slide 8

"Who uses it. First, teams letting agents edit financial models, who need a gate. Second, CAs and model reviewers, because Excel files sit outside Tally's edit log. Third, housing societies, as our demo story. Buyers already pay for adjacent tools: $40 a month for Tracelight, $21 to $30 for Copilot. Our model is freemium: an open engine, a free local check, then ₹299 a month for Pro, ₹499 a seat for teams with policies and audit export, and ₹249 for societies. These prices are hypotheses we will test in pilots. Next: open-source the engine on MCP directories, run 10 to 20 pilots, add more verified functions, then a proxy in front of Excel MCP servers."

## 4:25–4:40 · Close (Rudra)
**Screen:** title slide

"AI will keep editing the numbers people rely on. Delta Gate is the part in between: it recalculates, it splits the change to the rupee, and it refuses to guess. Proof, not a guess. Thank you."

---

## Recording notes
- Total about 590 spoken words, about 4:35 at pace. Cut the Act 2 detail first if over 5:00.
- Record the screen demo as a separate take and cut it in. Do not read the numbers live.
- Use the exact numbers above only. Do not round or add figures.
- Pace: pause one beat after "₹42,000" and after "it never guesses".
