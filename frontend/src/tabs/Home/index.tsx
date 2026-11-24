interface HomeProps {
  onNavigateTab: (tabKey: 'check' | 'approvals' | 'audit') => void;
}

export function HomeTab({ onNavigateTab }: HomeProps) {
  return (
    <div className="space-y-24 py-8">
      {/* HERO: Floating Orb Halo */}
      <section className="relative min-h-[580px] flex flex-col items-center justify-center text-center px-4 overflow-hidden rounded-3xl border border-[#D7D0C5]/60 bg-gradient-to-b from-[#F8F7F4] via-white/40 to-[#F8F7F4] p-8 md:p-16 shadow-sm">
        {/* Subtle mesh background circles strictly in palette */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#EEDADA]/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#8A9646]/15 blur-3xl pointer-events-none" />

        {/* 8 Refractive Glass Orbs surrounding the center in an elliptical halo */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-[340px] h-[340px] sm:w-[540px] sm:h-[440px] md:w-[720px] md:h-[480px]">
            {/* Orb 1: Top-Left (Zen Sand tint) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#D7D0C5]/40 border border-white/80 w-16 h-16 sm:w-20 sm:h-20 animate-float-orb"
              style={{ top: '8%', left: '12%', animationDelay: '0s' }}
              title="AST Dependency Graph"
            >
              <div className="w-full h-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-medium text-[#36452B]/80">
                AST
              </div>
            </div>

            {/* Orb 2: Top-Center (Moss Rock tint) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#8A9646]/25 border border-[#8A9646]/50 w-20 h-20 sm:w-24 sm:h-24 animate-float-orb"
              style={{ top: '-2%', left: '46%', animationDelay: '1.2s' }}
              title="Verified φ(g)"
            >
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono font-semibold text-[#36452B]">
                <span>φ(g)</span>
                <span className="text-[9px] text-[#8A9646]">Verified</span>
              </div>
            </div>

            {/* Orb 3: Top-Right (Cherry Blossom tint) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#EEDADA]/60 border border-[#D7D0C5] w-16 h-16 sm:w-20 sm:h-20 animate-float-orb"
              style={{ top: '10%', right: '12%', animationDelay: '2.5s' }}
              title="Unverified / Risk Alert"
            >
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono font-medium text-[#36452B]">
                <span>Δ!</span>
                <span className="text-[9px] text-[#7F7D74]">Risk</span>
              </div>
            </div>

            {/* Orb 4: Middle-Right (Deep Bamboo translucent) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#36452B]/10 border border-[#D7D0C5] w-14 h-14 sm:w-16 sm:h-16 animate-float-orb"
              style={{ top: '48%', right: '4%', animationDelay: '3.8s' }}
              title="Policy Gate"
            >
              <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-[#36452B]/90 font-medium">
                Gate
              </div>
            </div>

            {/* Orb 5: Bottom-Right (Zen Sand) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#D7D0C5]/50 border border-white/90 w-18 h-18 sm:w-22 sm:h-22 animate-float-orb"
              style={{ bottom: '6%', right: '14%', animationDelay: '5s' }}
              title="SHA-256 Audit Seal"
            >
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] sm:text-xs font-mono text-[#36452B]">
                <span>SHA-256</span>
                <span className="text-[8px] text-[#7F7D74]">Audited</span>
              </div>
            </div>

            {/* Orb 6: Bottom-Center (Mossy Rock) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#8A9646]/20 border border-[#8A9646]/40 w-16 h-16 sm:w-18 sm:h-18 animate-float-orb"
              style={{ bottom: '-4%', left: '48%', animationDelay: '6.2s' }}
              title="Prove it: Cell Proof"
            >
              <div className="w-full h-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-medium text-[#36452B]">
                Prove it
              </div>
            </div>

            {/* Orb 7: Bottom-Left (Cherry Blossom) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#EEDADA]/50 border border-[#D7D0C5] w-14 h-14 sm:w-16 sm:h-16 animate-float-orb"
              style={{ bottom: '8%', left: '10%', animationDelay: '4.2s' }}
              title="Lost Link Detection"
            >
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] font-mono text-[#36452B]">
                <span>Lost</span>
                <span className="text-[8px] text-[#7F7D74]">Link</span>
              </div>
            </div>

            {/* Orb 8: Middle-Left (Weathered Wood tint) */}
            <div
              className="absolute pointer-events-auto glass-orb bg-[#7F7D74]/15 border border-[#D7D0C5] w-18 h-18 sm:w-20 sm:h-20 animate-float-orb"
              style={{ top: '44%', left: '2%', animationDelay: '1.9s' }}
              title="Coalition Attribution"
            >
              <div className="w-full h-full flex flex-col items-center justify-center text-[10px] font-mono text-[#36452B]">
                <span>φ(g)</span>
                <span className="text-[8px] text-[#7F7D74]">Shapley</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Center Content */}
        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#D7D0C5]/40 text-[#36452B] border border-[#D7D0C5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8A9646] animate-pulse" />
            Zero Trust Architecture for Financial Modeling
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold text-[#36452B] tracking-tight leading-[1.15]">
            Independent verification for AI spreadsheet edits
          </h1>

          <p className="text-base sm:text-lg text-[#7F7D74] max-w-2xl mx-auto font-sans leading-relaxed">
            Delta Gate intercepts and verifies financial spreadsheet changes before they reach critical systems. 
            Formula-level dependency graphs, Shapley coalition attribution, and Excel golden cross-validation eliminate silent hallucinations.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => onNavigateTab('check')}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#36452B] text-[#F8F7F4] font-medium text-sm hover:bg-[#36452B]/90 transition shadow-sm hover:shadow"
            >
              Open Check Workspace
              <span className="text-[#8A9646]">→</span>
            </button>
            <a
              href="#overview"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/70 hover:bg-white text-[#36452B] border border-[#D7D0C5] font-medium text-sm transition"
            >
              Read Architecture
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 1: Overview */}
      <section id="overview" className="space-y-6 scroll-mt-24">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-[#36452B] text-[#F8F7F4]">
            1 Overview
          </span>
          <h2 className="text-2xl font-serif font-bold text-[#36452B]">
            Why Modern Spreadsheets Demand Independent Verification
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card p-6 space-y-3">
            <div className="text-xs font-mono text-[#8A9646] font-semibold uppercase tracking-wider">
              The AI Spreadsheet Blindspot
            </div>
            <h3 className="text-lg font-serif font-semibold text-[#36452B]">
              Silent Formula Corruption
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              When LLMs or automated pipelines alter financial models, they often break dynamic dependencies, overwrite formulas with hardcoded constants, or produce silent round-off drift that standard visual review misses.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3">
            <div className="text-xs font-mono text-[#8A9646] font-semibold uppercase tracking-wider">
              Dual-Layer Assurance
            </div>
            <h3 className="text-lg font-serif font-semibold text-[#36452B]">
              Deterministic AST & Golden Excel
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Delta Gate evaluates spreadsheets twice: first via an AST graph evaluator computing exact Shapley coalition attributions, then cross-verified against Microsoft Excel's saved evaluation cache.
            </p>
          </div>

          <div className="glass-card p-6 space-y-3">
            <div className="text-xs font-mono text-[#8A9646] font-semibold uppercase tracking-wider">
              Governance Standard
            </div>
            <h3 className="text-lg font-serif font-semibold text-[#36452B]">
              Zero-Trust Policy Enforcement
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Edits that drift beyond configured thresholds or touch protected cells are immediately held for dual sign-off, leaving an immutable cryptographically sealed audit trail.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 2: Verification Engine */}
      <section id="engine" className="space-y-6 scroll-mt-24">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-[#36452B] text-[#F8F7F4]">
            2 Verification Engine
          </span>
          <h2 className="text-2xl font-serif font-bold text-[#36452B]">
            Three Pillars of Delta Gate Integrity
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Verified vs. Unverified */}
          <div className="glass-card p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-[#8A9646]">Engine Pillar I</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#8A9646]/20 text-[#36452B]">
                  Shapley Attribution
                </span>
              </div>
              <h3 className="text-lg font-serif font-semibold text-[#36452B]">
                Verified vs. Unverified Attribution
              </h3>
              <p className="text-sm text-[#7F7D74] leading-relaxed">
                Delta is decomposed into discrete groups: solo contribution plus cooperative synergy (<span className="font-mono text-xs">interaction = φ(g) − solo(g)</span>). If any component cannot be reconciled with saved values, it is classified as unverified risk.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#D7D0C5]/20 border border-[#D7D0C5]/60 text-xs font-mono text-[#36452B] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#7F7D74]">Verified:</span>
                <span className="font-semibold text-[#8A9646]">Dual Engine Matched</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7F7D74]">Unverified:</span>
                <span className="font-semibold text-[#36452B]">Pending / Discrepancy</span>
              </div>
            </div>
          </div>

          {/* Card 2: Prove it */}
          <div className="glass-card p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-[#8A9646]">Engine Pillar II</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#36452B]/10 text-[#36452B]">
                  Cell Proof
                </span>
              </div>
              <h3 className="text-lg font-serif font-semibold text-[#36452B]">
                Cell-Level Delta Proof ("Prove it")
              </h3>
              <p className="text-sm text-[#7F7D74] leading-relaxed">
                Inspect every modified formula directly. For any cell group, view the exact formula before and after, the intermediate variables, and the step-by-step arithmetic chain verifying the output.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#D7D0C5]/20 border border-[#D7D0C5]/60 text-xs font-mono text-[#36452B] space-y-1">
              <div className="text-[#7F7D74]">Formula Trace:</div>
              <div className="text-[11px] text-[#36452B] truncate font-mono">
                LateFees!F3: Base (₹0) → New (₹4,000)
              </div>
            </div>
          </div>

          {/* Card 3: Structural Lost-Link & Policy */}
          <div className="glass-card p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-[#8A9646]">Engine Pillar III</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#EEDADA] text-[#36452B]">
                  Structural Audit
                </span>
              </div>
              <h3 className="text-lg font-serif font-semibold text-[#36452B]">
                Lost-Link & Guardrails
              </h3>
              <p className="text-sm text-[#7F7D74] leading-relaxed">
                Detects severed formula links instantly (e.g. when an upstream calculation was disconnected or overwritten with hardcoded values) and checks against drift limits and protected cell policies.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#EEDADA]/50 border border-[#D7D0C5] text-xs font-mono text-[#36452B] space-y-1">
              <div className="text-[#36452B] font-semibold">Severed Reference Flagged:</div>
              <div className="text-[11px] text-[#7F7D74] truncate font-mono">
                Summary!C4 lost formula link to LateFees!F3
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Pipeline */}
      <section id="pipeline" className="space-y-6 scroll-mt-24">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-[#36452B] text-[#F8F7F4]">
            3 Pipeline
          </span>
          <h2 className="text-2xl font-serif font-bold text-[#36452B]">
            Four-Stage Deterministic Verification Pipeline
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-[#36452B] text-[#F8F7F4] flex items-center justify-center font-mono text-xs font-bold">
              01
            </div>
            <h4 className="font-serif font-semibold text-[#36452B] text-base">AST Dependency Graph</h4>
            <p className="text-xs text-[#7F7D74] leading-relaxed">
              Parses Excel formula ASTs to construct a directed acyclic graph mapping every cell's upstream inputs and downstream consumers.
            </p>
          </div>

          <div className="glass-card p-5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-[#8A9646] text-[#F8F7F4] flex items-center justify-center font-mono text-xs font-bold">
              02
            </div>
            <h4 className="font-serif font-semibold text-[#36452B] text-base">Coalition Attribution</h4>
            <p className="text-xs text-[#7F7D74] leading-relaxed">
              Computes Shapley values across modified groups, isolating solo impacts and non-linear interactions so changes cannot hide.
            </p>
          </div>

          <div className="glass-card p-5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-[#36452B] text-[#F8F7F4] flex items-center justify-center font-mono text-xs font-bold">
              03
            </div>
            <h4 className="font-serif font-semibold text-[#36452B] text-base">Saved-Value Cross-Check</h4>
            <p className="text-xs text-[#7F7D74] leading-relaxed">
              Cross-evaluates computed values against Microsoft Excel's cached calculation results to detect discrepancy or recalculation errors.
            </p>
          </div>

          <div className="glass-card p-5 space-y-2">
            <div className="w-7 h-7 rounded-lg bg-[#8A9646] text-[#F8F7F4] flex items-center justify-center font-mono text-xs font-bold">
              04
            </div>
            <h4 className="font-serif font-semibold text-[#36452B] text-base">Policy & Approval Gate</h4>
            <p className="text-xs text-[#7F7D74] leading-relaxed">
              Checks changes against drift budgets and protected cells. Clean changes pass automatically; violations require dual sign-off.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: Workspaces */}
      <section id="workspaces" className="space-y-6 scroll-mt-24">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-[#36452B] text-[#F8F7F4]">
            4 Workspaces
          </span>
          <h2 className="text-2xl font-serif font-bold text-[#36452B]">
            Dedicated Governance Workspaces
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Workspace 1: Check */}
          <div
            onClick={() => onNavigateTab('check')}
            className="glass-folder p-6 rounded-2xl cursor-pointer group space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#36452B] uppercase">Workspace 01</span>
              <span className="text-xs font-medium text-[#8A9646] group-hover:translate-x-1 transition">
                Open Check →
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#36452B]">
              Check & Attribution Analysis
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Upload base and modified workbooks to run instantaneous dual-engine verification, view interactive waterfall attributions, inspect cell-level formula proofs, and flag lost links.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-[#7F7D74]">
              <span className="w-2 h-2 rounded-full bg-[#8A9646]" />
              Waterfall Chart · Groups Table · Health Coverage Card
            </div>
          </div>

          {/* Workspace 2: Approvals */}
          <div
            onClick={() => onNavigateTab('approvals')}
            className="glass-folder p-6 rounded-2xl cursor-pointer group space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#36452B] uppercase">Workspace 02</span>
              <span className="text-xs font-medium text-[#8A9646] group-hover:translate-x-1 transition">
                Open Approvals →
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#36452B]">
              Approvals & Held Changes
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Review workbooks held by policy violations (unverified drift, protected cell modifications). Approve or reject with structured rationale and reviewer signature.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-[#7F7D74]">
              <span className="w-2 h-2 rounded-full bg-[#EEDADA]" />
              Held Queue · Dual Sign-off · Governance Actions
            </div>
          </div>

          {/* Workspace 3: Audit */}
          <div
            onClick={() => onNavigateTab('audit')}
            className="glass-folder p-6 rounded-2xl cursor-pointer group space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#36452B] uppercase">Workspace 03</span>
              <span className="text-xs font-medium text-[#8A9646] group-hover:translate-x-1 transition">
                Open Audit →
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#36452B]">
              Cryptographic Audit Log
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Inspect immutable audit records sealed with SHA-256 hashes. Verify payload integrity, timestamp sequences, and approval history for SOC2/regulatory compliance.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-[#7F7D74]">
              <span className="w-2 h-2 rounded-full bg-[#36452B]" />
              SHA-256 Hashes · Payload Verification · Immutable Event Log
            </div>
          </div>

          {/* Workspace 4: Policy & Guardrails */}
          <div
            onClick={() => onNavigateTab('check')}
            className="glass-folder p-6 rounded-2xl cursor-pointer group space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#36452B] uppercase">Workspace 04</span>
              <span className="text-xs font-medium text-[#8A9646] group-hover:translate-x-1 transition">
                Inspect Guardrails →
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#36452B]">
              Policy Guardrails & Drift Limits
            </h3>
            <p className="text-sm text-[#7F7D74] leading-relaxed">
              Enforce organizational guardrails dynamically: impact ceilings, allowable drift thresholds, and strict lockouts on sensitive formula cells like tax rates and fee structures.
            </p>
            <div className="flex items-center gap-2 text-xs font-mono text-[#7F7D74]">
              <span className="w-2 h-2 rounded-full bg-[#8A9646]" />
              Dynamic Policy API · Protected Cells · Automatic Interception
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
