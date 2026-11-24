import { useState } from 'react'
import HealthCoverageCard from '../../components/HealthCoverageCard'
import StructuralPanel from '../../components/StructuralPanel'
import { inr, signedInr } from '../../format'
import type { CheckResult, Output } from '../../types'
import GroupsTable from './GroupsTable'
import Waterfall from './Waterfall'

export interface CheckResultViewProps {
  check: CheckResult
  baseName?: string
  newName?: string
  isLive?: boolean
  onProve?: (groupId: string) => void
  onReset?: () => void
  csvHref?: string
  selectedOutputCell?: string | null
  onSelectOutput?: (cell: string) => void
  selectedGroupId?: string | null
  onSelectGroup?: (groupId: string | null) => void
}

const fmtValue = (n: number | null) => (n === null ? 'unknown' : inr(n))
const fmtDelta = (n: number | null) => (n === null ? 'unknown' : signedInr(n))

export default function CheckResultView({
  check,
  baseName = 'dues_v2.xlsx',
  newName = 'dues_v3_REAL.xlsx',
  isLive = false,
  onProve,
  onReset,
  csvHref,
  selectedOutputCell: controlledOutput,
  onSelectOutput,
  selectedGroupId: controlledGroup,
  onSelectGroup,
}: CheckResultViewProps) {
  const [internalOutputCell, setInternalOutputCell] = useState<string | null>(null)
  const [internalGroupId, setInternalGroupId] = useState<string | null>(null)

  const selectedOutputCell = controlledOutput !== undefined ? controlledOutput : internalOutputCell
  const setSelectedOutputCell = onSelectOutput ?? setInternalOutputCell
  const selectedGroupId = controlledGroup !== undefined ? controlledGroup : internalGroupId
  const setSelectedGroupId = onSelectGroup ?? setInternalGroupId

  const selectedOutput: Output | undefined =
    check.outputs.find((o) => o.cell === selectedOutputCell) ?? check.outputs[0]
  const activeGroupId = check.groups.some((g) => g.group_id === selectedGroupId) ? selectedGroupId : null
  const groupById = new Map(check.groups.map((g) => [g.group_id, g]))

  const v = check.verification
  const isExcel = v.saved_by === 'Microsoft Excel'
  const isLO = v.saved_by === 'LibreOffice'
  const isVerifiable = isExcel || isLO
  const coveragePct = Math.round(check.coverage * 1000) / 10

  // Cause-type breakdown for change header counts
  const typeSummary = check.groups.reduce(
    (acc, g) => {
      acc[g.type] += 1
      return acc
    },
    { data: 0, logic: 0, structural: 0 }
  )

  const causes = selectedOutput ? selectedOutput.attribution.filter((a) => a.share !== 0) : []

  return (
    <div className="space-y-8">
      {/* 1. Live Check Action Bar & Coverage Banner */}
      <section aria-label="Live Check Action Bar" className="glass-card p-4 sm:p-5 border border-[#D7D0C5] bg-white/80 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1.5 rounded-full border border-[#8A9646] bg-[#8A9646]/15 px-3 py-1 font-mono text-xs font-bold text-[#36452B]">
              <span className="h-2 w-2 rounded-full bg-[#8A9646]" />
              {isLive ? '● LIVE CHECK' : '● CHECK RESULT'}
            </span>
            <span className="font-mono text-xs text-[#7F7D74]">
              {baseName} → {newName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="rounded-xl border border-[#D7D0C5] bg-white px-3.5 py-1.5 font-mono text-xs font-semibold text-[#36452B] shadow-xs hover:border-[#8A9646] hover:bg-[#8A9646]/10 transition"
              >
                Reset to sample
              </button>
            )}
            {csvHref && (
              <a
                href={csvHref}
                download
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#36452B] bg-[#36452B] px-4 py-1.5 font-mono text-xs font-semibold text-[#F8F7F4] shadow-xs hover:bg-[#36452B]/90 transition"
              >
                Export CSV
              </a>
            )}
          </div>
        </div>

        {/* Verification banner showing formula match count and coverage percentage */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#8A9646]/30 bg-[#8A9646]/15 px-4 py-2.5 text-xs text-[#36452B]">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-[#8A9646] font-bold text-sm">✓</span>
            <span>
              <strong>Formula match:</strong> {v.matched.toLocaleString('en-IN')} / {v.formula_cells.toLocaleString('en-IN')} cells match ({coveragePct}%)
            </span>
          </div>
          <span className="font-mono text-[11px] text-[#7F7D74]">
            {isVerifiable ? `Verified against ${v.saved_by}` : 'Not verifiable against saved cache'}
          </span>
        </div>
      </section>

      {/* 2. Watched Outputs Selector Row */}
      {check.outputs.length > 0 && (
        <section aria-label="Watched Outputs Selector" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
              Watched Outputs Selector
            </p>
            <span className="font-mono text-xs text-[#7F7D74]">Click card to switch attribution breakdown</span>
          </div>

          <div role="group" aria-label="Watched outputs" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {check.outputs.map((o) => {
              const active = selectedOutput?.cell === o.cell
              return (
                <button
                  key={o.cell}
                  type="button"
                  onClick={() => setSelectedOutputCell(o.cell)}
                  className={`flex flex-col justify-between rounded-2xl p-4 text-left transition-all ${
                    active
                      ? 'border-2 border-[#36452B] bg-[#36452B] text-[#D7D0C5] shadow-md'
                      : 'border border-[#D7D0C5] bg-white/70 text-[#36452B] hover:border-[#8A9646]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-xs ${active ? 'text-[#8A9646]' : 'text-[#7F7D74]'}`}>
                      {o.cell}
                    </span>
                    <span className={`text-xs font-semibold ${active ? 'text-[#D7D0C5]' : 'text-[#7F7D74]'}`}>
                      {fmtValue(o.base)} → {fmtValue(o.new)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-bold truncate ${active ? 'text-[#F8F7F4]' : 'text-[#36452B]'}`}>
                      {o.label}
                    </span>
                    <span className={`text-xl font-black font-mono tabular-nums ${active ? 'text-[#F8F7F4]' : 'text-[#36452B]'}`}>
                      {fmtDelta(o.delta_observed)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 3. 2-Column Attribution + Verification Dossier Grid */}
      {selectedOutput && (
        <section aria-label="Attribution & Verification Dossier" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Card: Selected output attribution breakdown */}
          <div className="glass-card p-6 flex flex-col justify-between border border-[#D7D0C5] bg-white/80 shadow-xs">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-[#D7D0C5]/60 pb-3">
                <div>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74]">
                    Watched Output · {selectedOutput.cell}
                  </span>
                  <h3 className="text-2xl font-serif font-bold text-[#36452B] mt-0.5">{selectedOutput.label}</h3>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[11px] text-[#7F7D74]">Range:</span>
                  <p className="text-sm font-bold text-[#36452B]">
                    {fmtValue(selectedOutput.base)} → {fmtValue(selectedOutput.new)}
                  </p>
                </div>
              </div>

              <p className="text-xs text-[#7F7D74] italic">
                Exact Shapley attribution — click any cause to inspect its cells
              </p>

              {/* Clickable cause rows with DATA / LOGIC pills */}
              <div className="space-y-2 mt-2">
                {causes.length > 0 ? (
                  causes.map((attr) => {
                    const g = groupById.get(attr.group_id)
                    const isSelected = activeGroupId === attr.group_id
                    return (
                      <div
                        key={attr.group_id}
                        onClick={() => setSelectedGroupId(isSelected ? null : attr.group_id)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#8A9646] bg-[#8A9646]/10'
                            : 'border-[#D7D0C5]/60 bg-[#F8F7F4] hover:border-[#8A9646]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="rounded bg-[#D7D0C5]/50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#36452B]">
                            {g?.type ?? 'change'}
                          </span>
                          <span className="font-serif font-semibold text-sm text-[#36452B]">
                            {g?.label ?? attr.group_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-xs text-[#7F7D74] hidden sm:inline">
                            solo: {signedInr(attr.solo)}
                          </span>
                          <strong className="text-base text-[#36452B] tabular-nums font-bold">
                            {signedInr(attr.share)}
                          </strong>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-[#7F7D74] font-mono py-4 text-center">
                    No verified cause changes for this output
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D7D0C5]/60 flex justify-between items-center text-xs font-mono">
              <span className="text-[#7F7D74]">Observed Net Change:</span>
              <strong className="text-[#36452B] text-base">{fmtDelta(selectedOutput.delta_observed)}</strong>
            </div>
          </div>

          {/* Right Card: Verification dossier / HealthCoverageCard */}
          <HealthCoverageCard check={check} output={selectedOutput} />
        </section>
      )}

      {/* 4. Delta Summary & Interactive ECharts Waterfall */}
      {selectedOutput && (
        <section aria-label="Waterfall Attribution" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5]/60 pb-3">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
                Attribution waterfall
              </p>
              <h3 className="text-2xl font-serif font-black tracking-tight text-[#36452B] mt-0.5">
                {fmtDelta(selectedOutput.delta_observed)} Total change
              </h3>
            </div>

            {/* Data / Logic / Structural count boxes */}
            <div className="flex items-center gap-2">
              <span className="rounded-xl border border-[#D7D0C5] bg-white px-3 py-1 font-mono text-xs text-[#36452B]">
                Data: <b>{typeSummary.data}</b>
              </span>
              <span className="rounded-xl border border-[#D7D0C5] bg-white px-3 py-1 font-mono text-xs text-[#36452B]">
                Logic: <b>{typeSummary.logic}</b>
              </span>
              <span className="rounded-xl border border-[#D7D0C5] bg-white px-3 py-1 font-mono text-xs text-[#36452B]">
                Structural: <b>{typeSummary.structural}</b>
              </span>
            </div>
          </div>

          <Waterfall
            check={check}
            outputCell={selectedOutput.cell}
            selectedGroupId={activeGroupId}
            onSelectGroup={setSelectedGroupId}
          />
        </section>
      )}

      {/* 5. Structural Findings, Lost-Link Graph & Protected Cell Alerts */}
      <section aria-label="Structural Findings">
        <StructuralPanel check={check} />
      </section>

      {/* 6. Expandable Change groups Table */}
      <section aria-label="Change Groups Ledger">
        <GroupsTable
          groups={check.groups}
          attribution={selectedOutput?.attribution ?? []}
          unverifiable={check.unverifiable}
          selectedGroupId={activeGroupId}
          onSelectGroup={setSelectedGroupId}
          onProve={onProve}
        />
      </section>
    </div>
  )
}
