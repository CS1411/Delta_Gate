export default function LandingHero() {
  const scrollToIngestion = () => {
    const el = document.getElementById('workbook-ingestion')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
      const firstInput = el.querySelector<HTMLInputElement>('input[type="file"]')
      firstInput?.focus()
    }
  }

  return (
    <section
      aria-label="Delta Gate Introduction"
      className="glass-card mb-8 overflow-hidden rounded-3xl border border-[#D7D0C5]/90 bg-white/75 p-6 shadow-sm backdrop-blur-md sm:p-8 lg:p-10"
    >
      {/* Top Editorial Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5]/60 pb-5">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Delta Gate logo" className="h-6 w-auto object-contain rounded" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#36452B]">
            Delta Gate
          </span>
          <span className="text-[#D7D0C5]">/</span>
          <span className="rounded-full border border-[#D7D0C5] bg-[#F8F7F4] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#7F7D74]">
            wHACKiest 2026 · Track 1: Make MCP Matter
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#8A9646] animate-pulse" />
          <span className="font-mono text-xs font-semibold text-[#8A9646]">
            Fail-Closed Formula Engine
          </span>
        </div>
      </div>

      {/* Main Editorial Header & Lead Proposition */}
      <div className="mt-6 max-w-4xl space-y-4">
        <h2 className="text-3xl font-black tracking-tight text-[#36452B] sm:text-4xl lg:text-5xl">
          Independent verification &amp; policy gate for AI spreadsheet edits
        </h2>
        <p className="text-base font-normal leading-relaxed text-[#7F7D74] sm:text-lg">
          Diffing tools are free and approval gates are standard. Delta Gate is the recalculation
          engine in between: evaluating what an edit actually does, attributing watched output
          deltas into exact amounts per cause, catching broken links even when totals don&apos;t move,
          and refusing to guess on unsupported formulas.
        </p>
      </div>

      {/* Action Buttons & System Mode Badges */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={scrollToIngestion}
          className="flex items-center gap-2.5 rounded-xl bg-[#36452B] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646]"
        >
          <span>Run Workbook Check</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#7F7D74]">
          <span className="font-bold uppercase tracking-wider text-[#36452B]">Modes:</span>
          <span className="rounded-lg border border-[#D7D0C5] bg-[#F8F7F4] px-2.5 py-1 text-[#36452B]">
            01 Check (2-Version Diff)
          </span>
          <span className="rounded-lg border border-[#D7D0C5] bg-[#F8F7F4] px-2.5 py-1 text-[#36452B]">
            02 Gate (MCP Shadow Recalc)
          </span>
          <span className="rounded-lg border border-[#D7D0C5] bg-[#F8F7F4] px-2.5 py-1 text-[#36452B]">
            03 Session Audit (In-Excel Snapshot)
          </span>
        </div>
      </div>

      {/* "How Verification Works" 3-Step Glass Strip */}
      <div className="mt-8 border-t border-[#D7D0C5]/60 pt-6">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
          How Verification Works
        </p>
        <div className="mt-3.5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#D7D0C5]/80 bg-white/60 p-4 transition-all hover:border-[#8A9646]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#36452B] font-mono text-xs font-bold text-white">
                1
              </span>
              <h4 className="font-bold text-[#36452B]">Upload Base &amp; Edited .xlsx</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#7F7D74]">
              Provide baseline and candidate workbooks with cached values. The engine verifies formula cell
              alignment against saved values before analyzing edits.
            </p>
          </div>

          <div className="rounded-2xl border border-[#D7D0C5]/80 bg-white/60 p-4 transition-all hover:border-[#8A9646]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8A9646] font-mono text-xs font-bold text-white">
                2
              </span>
              <h4 className="font-bold text-[#36452B]">Inspect Waterfall &amp; Groups</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#7F7D74]">
              Review exact Shapley attribution shares summing to observed Δ, categorized into Data, Logic,
              and Structural groups, separating verified from unverified impact.
            </p>
          </div>

          <div className="rounded-2xl border border-[#D7D0C5]/80 bg-white/60 p-4 transition-all hover:border-[#8A9646]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#36452B] font-mono text-xs font-bold text-white">
                3
              </span>
              <h4 className="font-bold text-[#36452B]">Prove Deltas or Hold in Approvals</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#7F7D74]">
              Download single-change proof workbooks calculated independently by Excel, or enforce policy limits
              and drift budgets to hold unauthorized edits.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
