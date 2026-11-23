import { useState, type ReactNode } from 'react'
import StructuralPanel from '../../components/StructuralPanel'
import { inr, savedByBanner, signedInr } from '../../format'
import type { CheckResult, Group, Output } from '../../types'
import GroupsTable from './GroupsTable'

// Check tab results view: verification banner, template headline, watched output selector, groups table
// (with type filter, clickable cells, Prove it), structural findings, and unverifiable list.
// Every number comes from the engine CheckResult; null always shows as "unknown", never 0.

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
  const unverifiedSaved = v.saved_by === 'none'
  const bannerText = unverifiedSaved
    ? savedByBanner(v.saved_by)
    : `${savedByBanner(v.saved_by)}: ${v.matched.toLocaleString('en-IN')} / ${v.formula_cells.toLocaleString('en-IN')} formula cells match`

  const bannerClasses = hasMismatches
    ? 'border-red-500 bg-red-50 text-red-900'
    : unverifiedSaved
      ? 'border-amber-500 bg-amber-50 text-amber-950'
      : 'border-emerald-600 bg-emerald-50 text-emerald-950'

  const coveragePct = Math.round(check.coverage * 1000) / 10

  return (
    <div className="space-y-8">
      <header className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border-l-8 px-6 py-4 shadow-sm ${bannerClasses}`}>
        <div className="space-y-1">
          <p className="text-xl font-bold">{bannerText}</p>
          <p className="font-mono text-sm opacity-80">
            {check.check_id} · mode: {check.mode} · coverage {coveragePct}%
            {hasMismatches && ` · ${v.mismatched.length} mismatched`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {check.coverage < 1 && (
            <span className="rounded-full bg-amber-200/80 px-4 py-1 text-base font-bold text-amber-950">
              Partial verification ({coveragePct}%)
            </span>
          )}
          {csvHref && (
            <a
              href={csvHref}
              download
              className="rounded-xl border-2 border-slate-900 bg-white px-5 py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
            >
              Export CSV
            </a>
          )}
        </div>
      </header>

      {check.outputs.length > 1 && (
        <div role="group" aria-label="Watched outputs" className="flex flex-wrap gap-3">
          {check.outputs.map((o) => {
            const active = selectedOutput?.cell === o.cell
            return (
              <button
                key={o.cell}
                type="button"
                onClick={() => setSelectedOutputCell(o.cell)}
                className={`rounded-xl border-2 px-5 py-3 text-left transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
                }`}
              >
                <span className="block text-base font-semibold">{o.label}</span>
                <span className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-sm opacity-75">{o.cell}</span>
                  <span className="text-xl font-bold tabular-nums">{fmtDelta(o.delta_observed)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selectedOutput && (
        <HeadlineCard
          output={selectedOutput}
          groupById={groupById}
          selectedGroupId={activeGroupId}
          onSelectGroup={setSelectedGroupId}
        />
      )}

      {waterfallSlot}

      {structuralSlot ?? <StructuralPanel check={check} />}

      <GroupsTable
        groups={check.groups}
        attribution={selectedOutput?.attribution ?? []}
        unverifiable={check.unverifiable}
        selectedGroupId={activeGroupId}
        onSelectGroup={setSelectedGroupId}
        onProve={onProve}
      />

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
  // Zero-share groups stay out of the headline sentence (they remain visible in GroupsTable).
  const causes = output.attribution.filter((a) => a.share !== 0)
  const hasUnverified = output.delta_unverified !== null && output.delta_unverified !== 0
  const observedKnown = output.delta_observed !== null

  return (
    <section aria-label="Check headline" className="rounded-2xl bg-white p-8 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-lg font-semibold uppercase tracking-wide text-slate-500">
            Watched output · <span className="font-mono normal-case">{output.cell}</span>
          </p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">{output.label}</h2>
        </div>

        <div className="text-right">
          <p className="text-lg text-slate-500">Base → New</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900">
            {fmtValue(output.base)} → {fmtValue(output.new)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-6">
        {!observedKnown ? (
          <div className="space-y-2">
            <p className="text-4xl font-bold text-slate-900">Observed change: unknown</p>
            <p className="text-lg text-slate-600">
              Verified change computed by engine: <b className="tabular-nums">{signedInr(output.delta_verified)}</b>
            </p>
          </div>
        ) : hasUnverified ? (
          <div className="space-y-3">
            <p className="text-4xl font-bold tabular-nums text-slate-900">
              {signedInr(output.delta_observed!)} observed ={' '}
              <span className="text-emerald-800">{signedInr(output.delta_verified)} verified</span> +{' '}
              <span className="text-amber-800">{signedInr(output.delta_unverified!)} unverified</span>
            </p>
            {causes.length > 0 && (
              <p className="text-xl text-slate-700">
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
          <p className="text-4xl font-bold leading-snug tabular-nums text-slate-900">
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
              <span className="ml-3 text-2xl font-normal text-slate-600">No verified attribution change</span>
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
            {index > 0 && <span className="text-slate-400">{a.share < 0 ? ' − ' : ' + '}</span>}
            <button
              type="button"
              onClick={() => onSelectGroup(selected ? null : a.group_id)}
              className={`inline-flex items-baseline gap-1.5 rounded-lg px-2 py-0.5 text-left transition-colors ${
                selected ? 'bg-sky-100 text-sky-950' : 'hover:bg-slate-200'
              }`}
            >
              <span className="font-bold">{amount}</span>
              <span className="text-xl font-medium text-slate-700">
                {group?.label ?? a.group_id} ({group?.type ?? 'change'})
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
    <section aria-label="Unverifiable cells" className="rounded-2xl border-l-8 border-slate-500 bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-2xl font-bold text-slate-900">
          Can&apos;t verify ({items.length} {items.length === 1 ? 'cell' : 'cells'})
        </h3>
        <span className="text-base font-medium text-slate-600">Excluded from attribution — we never guess.</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[...counts.entries()].map(([reason, count]) => (
          <span key={reason} className="rounded-full bg-slate-100 px-4 py-1.5 text-base font-semibold text-slate-800">
            {reason}: <span className="tabular-nums">{count}</span>
          </span>
        ))}
      </div>

      {mismatched.length > 0 && (
        <p className="mt-3 text-base text-red-700">
          Mismatched saved values: <span className="font-mono">{mismatched.join(', ')}</span>
        </p>
      )}

      {items.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-base font-medium text-slate-600">
            Show all {items.length} unverifiable cells
          </summary>
          <ul className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto text-sm sm:grid-cols-2 lg:grid-cols-3">
            {items.map((u) => (
              <li key={u.cell} className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5">
                <span className="font-mono font-semibold text-slate-900">{u.cell}</span>{' '}
                <span className="text-slate-600">— {u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
