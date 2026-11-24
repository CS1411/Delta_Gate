import { useState, type CSSProperties, type ReactNode } from 'react'
import HealthCoverageCard from '../../components/HealthCoverageCard'
import { IconAlertTriangle, IconArrowRight, IconDownload, IconShieldCheck } from '../../components/Icons'
import StructuralPanel from '../../components/StructuralPanel'
import { inr, savedByBanner, signedInr } from '../../format'
import type { CheckResult, Group, Output } from '../../types'
import GroupsTable from './GroupsTable'

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

  const bannerBase = savedByBanner(v.saved_by)
  const bannerText = isVerifiable
    ? `${bannerBase} · ${v.matched.toLocaleString('en-IN')} / ${v.formula_cells.toLocaleString('en-IN')} formula cells match`
    : bannerBase

  const coveragePct = Math.round(check.coverage * 1000) / 10
  const healthyVerify = isVerifiable && !hasMismatches && check.coverage >= 0.999

  return (
    <div className="space-y-6">
      {/* Honest Verification Strip */}
      <section
        aria-label="Verification status"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          hasMismatches
            ? 'border-[#A44A3F]/35 bg-[#EEDADA]/65 text-[#36452B]'
            : healthyVerify
              ? 'border-[#8A9646]/45 bg-[#8A9646]/10 text-[#36452B]'
              : 'border-[#D7D0C5] bg-[#FFFFFF] text-[#36452B]'
        }`}
      >
        <div className="flex items-start gap-3 sm:items-center">
          {healthyVerify ? (
            <IconShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8A9646] sm:mt-0" />
          ) : (
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#A44A3F] sm:mt-0" />
          )}
          <div>
            <p className="text-sm font-semibold text-[#36452B]">{bannerText}</p>
            <p className="font-mono text-xs text-[#36452B]/75">
              Coverage {coveragePct}%
              {hasMismatches && ` · ${v.mismatched.length} mismatched`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {check.coverage < 1 && (
            <span className="rounded border border-[#A44A3F]/25 bg-[#EEDADA]/70 px-2.5 py-1 font-mono text-xs font-semibold text-[#A44A3F]">
              Partial ({coveragePct}%)
            </span>
          )}
          {csvHref && (
            <a
              href={csvHref}
              download
              className="pressable inline-flex items-center gap-1.5 rounded-md border border-[#36452B] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#36452B] hover:bg-[#36452B] hover:text-[#F8F7F4]"
            >
              <IconDownload className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </a>
          )}
        </div>
      </section>

      {/* Watched Outputs Switcher */}
      {check.outputs.length > 1 && (
        <section aria-label="Watched outputs" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#36452B]/75">
            Watched outputs
          </h3>
          <div role="group" aria-label="Watched outputs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {check.outputs.map((o) => {
              const active = selectedOutput?.cell === o.cell
              return (
                <button
                  key={o.cell}
                  type="button"
                  onClick={() => setSelectedOutputCell(o.cell)}
                  className={`pressable flex flex-col rounded-lg border px-4 py-3 text-left ${
                    active
                      ? 'border-[#36452B] bg-[#36452B] text-[#F8F7F4]'
                      : 'border-[#D7D0C5] bg-[#FFFFFF] text-[#36452B] hover:border-[#8A9646]'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{o.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                        active ? 'bg-white/15 text-[#F8F7F4]' : 'bg-[#F0EDE6] text-[#36452B]/80'
                      }`}
                    >
                      {o.cell}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className={`font-mono text-xs ${active ? 'text-[#D7D0C5]' : 'text-[#36452B]/70'}`}>
                      {fmtValue(o.base)} → {fmtValue(o.new)}
                    </span>
                    <span className="font-mono text-lg font-bold tabular-nums">
                      {fmtDelta(o.delta_observed)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Reconciliation Row: Executive Sum + Verification Dossier */}
      {selectedOutput && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <HeadlineCard
              output={selectedOutput}
              groupById={groupById}
              selectedGroupId={activeGroupId}
              onSelectGroup={setSelectedGroupId}
            />
          </div>
          <div className="lg:col-span-4">
            <HealthCoverageCard check={check} output={selectedOutput} />
          </div>
        </div>
      )}

      {/* Change by Cause Chart */}
      {waterfallSlot}

      {/* Structural Integrity Findings */}
      <section aria-label="Structural findings" className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-bold text-[#36452B]">Structural findings</h3>
          <span className="font-mono text-xs text-[#36452B]/70">({check.structural.length})</span>
        </div>
        {structuralSlot ?? <StructuralPanel check={check} />}
      </section>

      {/* Change Groups Ledger */}
      <GroupsTable
        groups={check.groups}
        attribution={selectedOutput?.attribution ?? []}
        unverifiable={check.unverifiable}
        selectedGroupId={activeGroupId}
        onSelectGroup={setSelectedGroupId}
        onProve={onProve}
      />

      {/* Unverifiable Boundary */}
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

  const magnitudes = causes.map((c) => Math.abs(c.share))
  if (hasUnverified) magnitudes.push(Math.abs(output.delta_unverified!))
  const maxMag = magnitudes.length > 0 ? Math.max(...magnitudes) : 0

  return (
    <section aria-label="Reconciliation summary" className="ledger-card flex h-full flex-col justify-between p-5 sm:p-6">
      <div>
        {/* Slip Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D7D0C5] pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-[#36452B]">{output.label}</h2>
              <span className="rounded bg-[#F0EDE6] px-2 py-0.5 font-mono text-xs font-medium text-[#36452B]">
                {output.cell}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#36452B]/75">
              Exact Shapley attribution · click any cause row to inspect cells
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[#D7D0C5] bg-[#F8F7F4] px-3 py-1.5 font-mono text-sm">
            <span className="tabular-nums text-[#36452B]/80">{fmtValue(output.base)}</span>
            <IconArrowRight className="h-3.5 w-3.5 text-[#7F7D74]" />
            <span className="font-bold tabular-nums text-[#36452B]">{fmtValue(output.new)}</span>
          </div>
        </div>

        {/* Accounting Sum Rows */}
        <ul key={output.cell} className="mt-4 space-y-1.5">
          {causes.map((a, index) => {
            const group = groupById.get(a.group_id)
            const selected = selectedGroupId === a.group_id
            const widthPct = maxMag > 0 ? Math.max(4, Math.round((Math.abs(a.share) / maxMag) * 100)) : 0
            const isNeg = a.share < 0
            const staggerStyle = { '--stagger-ms': `${Math.min(index * 45, 180)}ms` } as CSSProperties
            return (
              <li key={a.group_id} className="animate-dg-stagger" style={staggerStyle}>
                <button
                  type="button"
                  onClick={() => onSelectGroup(selected ? null : a.group_id)}
                  className={`pressable grid w-full grid-cols-[7.5rem_1fr_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-left sm:grid-cols-[9.5rem_1fr_auto] sm:gap-4 ${
                    selected
                      ? 'border-[#8A9646] bg-[#8A9646]/12'
                      : 'border-transparent hover:border-[#D7D0C5] hover:bg-[#F8F7F4]'
                  }`}
                >
                  <span
                    className={`whitespace-nowrap text-right font-mono text-lg font-bold tabular-nums sm:text-xl ${
                      isNeg ? 'text-[#A44A3F]' : 'text-[#36452B]'
                    }`}
                  >
                    {signedInr(a.share)}
                  </span>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#36452B] sm:text-base">
                      {group?.label ?? a.group_id}
                    </div>
                    <div className="mt-1 h-1 w-full max-w-44 overflow-hidden rounded-full bg-[#F0EDE6]" aria-hidden="true">
                      <div
                        className={`animate-dg-bar h-full ${isNeg ? 'bg-[#A44A3F]' : 'bg-[#8A9646]'}`}
                        style={{ width: `${widthPct}%`, ...staggerStyle }}
                      />
                    </div>
                  </div>

                  <span className="rounded border border-[#D7D0C5] bg-[#F0EDE6] px-2 py-0.5 font-mono text-[11px] font-medium uppercase text-[#36452B]">
                    {group?.type ?? 'change'}
                  </span>
                </button>
              </li>
            )
          })}

          {hasUnverified && (
            <li
              className="animate-dg-stagger grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 rounded-md border border-[#A44A3F]/25 bg-[#EEDADA]/55 px-3 py-2.5 sm:grid-cols-[9.5rem_1fr_auto] sm:gap-4"
              style={{ '--stagger-ms': `${Math.min(causes.length * 45, 180)}ms` } as CSSProperties}
            >
              <span className="whitespace-nowrap text-right font-mono text-lg font-bold tabular-nums text-[#A44A3F] sm:text-xl">
                {signedInr(output.delta_unverified!)}
              </span>
              <span className="text-sm font-semibold text-[#A44A3F] sm:text-base">
                Unverified (excluded, never guessed)
              </span>
              <span className="rounded border border-[#A44A3F]/25 bg-[#FFFFFF]/80 px-2 py-0.5 font-mono text-[11px] font-medium uppercase text-[#A44A3F]">
                excluded
              </span>
            </li>
          )}

          {causes.length === 0 && !hasUnverified && (
            <li className="px-3 py-3 text-sm text-[#36452B]/75">No change to attribute.</li>
          )}
        </ul>
      </div>

      {/* Double-Ruled Accounting Total */}
      <div key={`total-${output.cell}`} className="mt-5 pt-3">
        <div className="animate-dg-rule h-px w-full bg-[#36452B]" aria-hidden="true" />
        <div className="animate-dg-enter grid grid-cols-[7.5rem_1fr] items-baseline gap-3 border-b-2 border-[#36452B] px-3 py-3 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
          <span className="whitespace-nowrap text-right font-mono text-2xl font-bold tabular-nums text-[#36452B] sm:text-3xl">
            {observedKnown ? signedInr(output.delta_observed!) : 'unknown'}
          </span>
          <div className="min-w-0">
            <span className="text-base font-bold text-[#36452B] sm:text-lg">Total change</span>
            {!observedKnown && (
              <span className="ml-2 text-xs text-[#36452B]/75">
                (no saved value; verified part {signedInr(output.delta_verified)})
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
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
    <section aria-label="Unverifiable cells" className="ledger-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5] pb-3.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-bold text-[#36452B]">
            Unverified ({items.length} {items.length === 1 ? 'cell' : 'cells'})
          </h3>
        </div>
        <span className="rounded border border-[#A44A3F]/25 bg-[#EEDADA]/65 px-2.5 py-1 text-xs font-semibold text-[#A44A3F]">
          Excluded from attribution — never guessed
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[...counts.entries()].map(([reason, count]) => (
          <span
            key={reason}
            className="inline-flex items-center gap-2 rounded-md border border-[#D7D0C5] bg-[#F8F7F4] px-3 py-1 text-xs font-semibold text-[#36452B]"
          >
            <span>{reason}</span>
            <span className="font-mono font-bold tabular-nums text-[#A44A3F]">{count}</span>
          </span>
        ))}
      </div>

      {mismatched.length > 0 && (
        <p className="mt-3 rounded-md border border-[#A44A3F]/30 bg-[#EEDADA]/60 px-3.5 py-2.5 font-mono text-xs font-medium text-[#A44A3F]">
          Mismatched saved values: {mismatched.join(', ')}
        </p>
      )}

      {items.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-[#36452B]/80 hover:text-[#36452B]">
            Show all {items.length} unverifiable cells
          </summary>
          <ul className="mt-3 grid max-h-60 gap-2 overflow-y-auto text-xs sm:grid-cols-2 lg:grid-cols-3">
            {items.map((u) => (
              <li
                key={u.cell}
                className="rounded border border-[#D7D0C5] bg-[#F8F7F4] px-2.5 py-1.5 font-mono"
              >
                <span className="font-semibold text-[#36452B]">{u.cell}</span>{' '}
                <span className="text-[#36452B]/70">— {u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
