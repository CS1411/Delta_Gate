import { useState, type ReactNode } from 'react'
import StructuralPanel from '../../components/StructuralPanel'
import { inr, signedInr } from '../../format'
import type { CheckResult, Group, Output } from '../../types'
import GroupsTable from './GroupsTable'

// Check tab results view: honest verification banner, executive headline, watched output switcher,
// waterfall chart, structural integrity panel, and change groups ledger.
// Adheres strictly to Non-Negotiable Rules:
// 1. Every number comes directly from the engine CheckResult.
// 2. Null means "unknown", NEVER 0.
// 3. Honest banner based on verification.saved_by.

export interface CheckResultViewProps {
  check: CheckResult
  onProve?: (groupId: string) => void
  csvHref?: string
  waterfallSlot?: ReactNode
  structuralSlot?: ReactNode
  selectedOutputCell?: string | null
  onSelectOutput?: (cell: string) => void
  selectedGroupId?: string | null
  onSelectGroup?: (groupId: string | null) => void
}

const fmtValue = (n: number | null) => (n === null ? 'unknown' : inr(n))
const fmtDelta = (n: number | null) => (n === null ? 'unknown' : signedInr(n))

// Honest verification banner helper complying with rule 5
function getSavedByBannerText(savedBy: string | null | undefined): string {
  if (savedBy === 'Microsoft Excel') return "Verified against Excel's saved values"
  if (savedBy === 'LibreOffice') return "Verified against LibreOffice's saved values"
  if (savedBy === 'pending') return "Verification pending (LibreOffice sidecar running…)"
  return "Not verifiable against saved values"
}

export default function CheckResultView({
  check,
  onProve,
  csvHref,
  waterfallSlot,
  structuralSlot,
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
  const hasMismatches = v.mismatched.length > 0
  const isExcel = v.saved_by === 'Microsoft Excel'
  const isLO = v.saved_by === 'LibreOffice'
  const isVerifiable = isExcel || isLO

  const bannerBase = getSavedByBannerText(v.saved_by)
  const bannerText = isVerifiable
    ? `${bannerBase}: ${v.matched.toLocaleString('en-IN')} / ${v.formula_cells.toLocaleString('en-IN')} formula cells match`
    : bannerBase

  const bannerBorderClass = hasMismatches
    ? 'border-red-400 bg-[#EEDADA]/60 text-red-950'
    : !isVerifiable
    ? 'border-[#D7D0C5] bg-[#EEDADA]/40 text-[#36452B]'
    : 'border-[#8A9646] bg-[#8A9646]/10 text-[#36452B]'

  const coveragePct = Math.round(check.coverage * 1000) / 10

  return (
    <div className="space-y-10">
      {/* 01 / Honest Verification Banner */}
      <section aria-label="Verification Banner" className={`glass-card border-l-8 p-6 shadow-sm ${bannerBorderClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
                01 / INTEGRITY VERIFICATION
              </span>
              {check.coverage === 1 && isVerifiable && (
                <span className="rounded-full bg-[#8A9646]/20 px-2.5 py-0.5 font-mono text-xs font-bold text-[#36452B]">
                  100% COVERAGE
                </span>
              )}
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight text-[#36452B]">
              {bannerText}
            </h3>
            <p className="font-mono text-xs text-[#7F7D74]">
              Check ID: <span className="font-semibold text-[#36452B]">{check.check_id}</span> · Mode: {check.mode} · Coverage: {coveragePct}%
              {hasMismatches && ` · ${v.mismatched.length} mismatched`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {check.coverage < 1 && (
              <span className="rounded-full border border-[#D7D0C5] bg-[#EEDADA] px-4 py-1.5 text-sm font-bold text-[#36452B]">
                Partial verification ({coveragePct}%)
              </span>
            )}
            {csvHref && (
              <a
                href={csvHref}
                download
                className="flex items-center gap-2 rounded-xl border-2 border-[#36452B] bg-white/80 px-5 py-2.5 text-sm font-bold text-[#36452B] shadow-sm transition-all hover:bg-[#36452B] hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV Ledger
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 02 / Watched Outputs Selector */}
      {check.outputs.length > 1 && (
        <section aria-label="Watched Outputs Selector" className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            02 / WATCHED OUTPUT CELLS
          </p>
          <div role="group" aria-label="Watched outputs" className="flex flex-wrap gap-4">
            {check.outputs.map((o) => {
              const active = selectedOutput?.cell === o.cell
              return (
                <button
                  key={o.cell}
                  type="button"
                  onClick={() => setSelectedOutputCell(o.cell)}
                  className={`flex flex-col rounded-2xl border-2 px-6 py-4 text-left transition-all ${
                    active
                      ? 'border-[#36452B] bg-[#36452B] text-white shadow-md'
                      : 'border-[#D7D0C5] bg-white/70 text-[#36452B] hover:border-[#8A9646]'
                  }`}
                >
                  <span className="text-sm font-bold opacity-80">{o.label}</span>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="font-mono text-xs opacity-75">{o.cell}</span>
                    <span className="text-2xl font-black tabular-nums">{fmtDelta(o.delta_observed)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Headline Card (Visible from 3 metres on Projector) */}
      {selectedOutput && (
        <HeadlineCard
          output={selectedOutput}
          groupById={groupById}
          selectedGroupId={activeGroupId}
          onSelectGroup={setSelectedGroupId}
        />
      )}

      {/* 03 / ECharts Waterfall */}
      {waterfallSlot}

      {/* 04 / Structural Integrity Panel */}
      <section aria-label="Structural Findings">
        <div className="mb-4">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            04 / STRUCTURAL INTEGRITY AUDIT
          </p>
        </div>
        {structuralSlot ?? <StructuralPanel check={check} />}
      </section>

      {/* 05 / Change Groups Table */}
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

      {/* 06 / Unverifiable Cells Panel */}
      {(check.unverifiable.length > 0 || v.mismatched.length > 0) && (
        <UnverifiablePanel items={check.unverifiable} mismatched={v.mismatched} />
      )}
    </div>
  )
}

function HeadlineCard({
  output,
  groupById,
  selectedGroupId,
  onSelectGroup,
}: {
  output: Output
  groupById: Map<string, Group>
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
}) {
  const causes = output.attribution.filter((a) => a.share !== 0)
  const hasUnverified = output.delta_unverified !== null && output.delta_unverified !== 0
  const observedKnown = output.delta_observed !== null

  return (
    <section aria-label="Check executive headline" className="glass-card p-8 sm:p-10 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D7D0C5]/60 pb-6">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            WATCHED OUTPUT · <span className="text-[#36452B]">{output.cell}</span>
          </p>
          <h2 className="mt-1 text-3xl sm:text-4xl font-extrabold text-[#36452B]">{output.label}</h2>
        </div>

        <div className="text-right">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74]">Base → New</p>
          <p className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[#36452B]">
            {fmtValue(output.base)} → {fmtValue(output.new)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#D7D0C5]/80 bg-white/70 p-6 sm:p-8">
        {!observedKnown ? (
          <div className="space-y-2">
            <p className="text-4xl sm:text-5xl font-black text-[#36452B]">Observed change: unknown</p>
            <p className="text-xl text-[#7F7D74]">
              Verified change computed by engine: <b className="tabular-nums text-[#36452B]">{signedInr(output.delta_verified)}</b>
            </p>
          </div>
        ) : hasUnverified ? (
          <div className="space-y-4">
            <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight text-[#36452B]">
              {signedInr(output.delta_observed!)} observed ={' '}
              <span className="text-[#8A9646]">{signedInr(output.delta_verified)} verified</span> +{' '}
              <span className="text-[#A44A3F]">{signedInr(output.delta_unverified!)} unverified</span>
            </p>
            {causes.length > 0 && (
              <p className="text-xl text-[#7F7D74]">
                Verified split:{' '}
                <CauseTokens
                  causes={causes}
                  groupById={groupById}
                  selectedGroupId={selectedGroupId}
                  onSelectGroup={onSelectGroup}
                />
              </p>
            )}
          </div>
        ) : (
          <p className="text-4xl sm:text-5xl font-black leading-snug tabular-nums tracking-tight text-[#36452B]">
            <span>{signedInr(output.delta_observed!)}</span>
            {causes.length > 0 ? (
              <>
                {' = '}
                <CauseTokens
                  causes={causes}
                  groupById={groupById}
                  selectedGroupId={selectedGroupId}
                  onSelectGroup={onSelectGroup}
                />
              </>
            ) : (
              <span className="ml-3 text-2xl font-normal text-[#7F7D74]">No verified attribution change</span>
            )}
          </p>
        )}
      </div>
    </section>
  )
}

function CauseTokens({
  causes,
  groupById,
  selectedGroupId,
  onSelectGroup,
}: {
  causes: Output['attribution']
  groupById: Map<string, Group>
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
}) {
  return (
    <>
      {causes.map((a, index) => {
        const group = groupById.get(a.group_id)
        const selected = selectedGroupId === a.group_id
        const amount = index === 0 ? signedInr(a.share) : inr(Math.abs(a.share))
        return (
          <span key={a.group_id}>
            {index > 0 && <span className="text-[#7F7D74]">{a.share < 0 ? ' − ' : ' + '}</span>}
            <button
              type="button"
              onClick={() => onSelectGroup(selected ? null : a.group_id)}
              className={`inline-flex items-baseline gap-2 rounded-xl px-3 py-1 text-left transition-all ${
                selected
                  ? 'border border-[#8A9646] bg-[#8A9646]/20 text-[#36452B]'
                  : 'border border-transparent bg-[#F8F7F4] hover:border-[#D7D0C5]'
              }`}
            >
              <span className="font-extrabold text-[#36452B] tabular-nums">{amount}</span>
              <span className="text-lg font-semibold text-[#36452B]/90">
                {group?.label ?? a.group_id}{' '}
                <span className="font-mono text-xs uppercase tracking-wider text-[#7F7D74]">
                  ({group?.type ?? 'change'})
                </span>
              </span>
            </button>
          </span>
        )
      })}
    </>
  )
}

function UnverifiablePanel({
  items,
  mismatched,
}: {
  items: CheckResult['unverifiable']
  mismatched: string[]
}) {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  }

  return (
    <section aria-label="Unverifiable cells" className="glass-card border-l-8 border-[#7F7D74] p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D7D0C5]/60 pb-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            06 / UNVERIFIABLE BOUNDARY
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-[#36452B]">
            Can&apos;t Verify ({items.length} {items.length === 1 ? 'cell' : 'cells'})
          </h3>
        </div>
        <span className="rounded-full border border-[#D7D0C5] bg-[#EEDADA] px-3.5 py-1 text-xs font-bold uppercase tracking-wide text-[#36452B]">
          Excluded from attribution — we never guess
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {[...counts.entries()].map(([reason, count]) => (
          <span key={reason} className="rounded-xl border border-[#D7D0C5] bg-white/80 px-4 py-1.5 text-sm font-bold text-[#36452B]">
            {reason}: <span className="tabular-nums text-[#8A9646]">{count}</span>
          </span>
        ))}
      </div>

      {mismatched.length > 0 && (
        <p className="mt-4 rounded-xl border border-red-300 bg-[#EEDADA]/60 p-3 font-mono text-sm font-semibold text-red-950">
          Mismatched saved values: {mismatched.join(', ')}
        </p>
      )}

      {items.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74] hover:text-[#36452B]">
            Show all {items.length} unverifiable cells
          </summary>
          <ul className="mt-3 grid max-h-64 gap-2 overflow-y-auto text-xs sm:grid-cols-2 lg:grid-cols-3">
            {items.map((u) => (
              <li key={u.cell} className="rounded-lg border border-[#D7D0C5] bg-white/70 px-3 py-2 font-mono">
                <span className="font-bold text-[#36452B]">{u.cell}</span>{' '}
                <span className="text-[#7F7D74]">— {u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
