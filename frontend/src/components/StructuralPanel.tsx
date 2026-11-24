import { lazy, Suspense } from 'react'
import { signedInr } from '../format'
import type { CheckResult, StructuralFinding } from '../types'
import GraphBoundary from './GraphBoundary'
import { IconAlertTriangle, IconCheckCircle } from './Icons'

// Lazy: @xyflow/react only loads when a lost link is on screen. The text alert below does not depend on it.
const LostLinkGraph = lazy(() => import('./LostLinkGraph'))

const PROTECTED = 'protected_formula_edit'
const KIND_LABEL: Record<StructuralFinding['kind'], string> = {
  lost_link: 'Lost link',
  typed_over_formula: 'Typed over a formula',
  shortened_range: 'Shortened range',
  rows_deleted_in_range: 'Rows deleted inside a range',
  protected_formula_edit: 'Protected cell edited',
}

interface Card {
  cell: string
  headline: StructuralFinding
  rest: StructuralFinding[]
}

function cards(findings: StructuralFinding[]): Card[] {
  const byCell = new Map<string, StructuralFinding[]>()
  for (const f of findings) {
    if (f.kind !== PROTECTED) {
      byCell.set(f.cell, [...(byCell.get(f.cell) ?? []), f])
    }
  }
  const out = [...byCell].map(([cell, list]) => {
    const headline = list.find((f) => f.kind === 'lost_link') ?? list[0]
    return { cell, headline, rest: list.filter((f) => f !== headline) }
  })
  return out.sort(
    (a, b) => Number(b.headline.kind === 'lost_link') - Number(a.headline.kind === 'lost_link'),
  )
}

export default function StructuralPanel({ check }: { check: CheckResult }) {
  const outputs = new Map(check.outputs.map((o) => [o.cell, o]))
  const protectedEdits = check.structural.filter((f) => f.kind === PROTECTED)
  const list = cards(check.structural)
  const outputLabels = Object.fromEntries(check.outputs.map((o) => [o.cell, o.label]))

  if (check.structural.length === 0) {
    return (
      <div className="ledger-card flex items-center gap-2.5 px-5 py-4 text-sm text-[#36452B]/75">
        <IconCheckCircle className="h-4 w-4 shrink-0 text-[#8A9646]" />
        <span>No structural findings detected.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {list.map(({ cell, headline, rest }) => {
        const lost = headline.kind === 'lost_link'
        const output = headline.output ? outputs.get(headline.output) : undefined
        return (
          <article key={cell} className="ledger-card overflow-hidden">
            <header
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 ${
                lost
                  ? 'border-[#A44A3F]/25 bg-[#EEDADA]/60'
                  : 'border-[#D7D0C5] bg-[#F0EDE6]'
              }`}
            >
              <div className="flex items-center gap-2">
                <IconAlertTriangle
                  className={`h-4 w-4 shrink-0 ${lost ? 'text-[#A44A3F]' : 'text-[#36452B]'}`}
                />
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    lost ? 'text-[#A44A3F]' : 'text-[#36452B]'
                  }`}
                >
                  {KIND_LABEL[headline.kind]}
                </span>
              </div>
              <span className="rounded border border-[#D7D0C5] bg-[#FFFFFF] px-2 py-0.5 font-mono text-xs font-semibold text-[#36452B]">
                {cell}
              </span>
            </header>

            <div className="space-y-4 p-5 sm:p-6">
              <div>
                <h4
                  className={`text-xl font-bold leading-snug sm:text-2xl ${
                    lost ? 'text-[#A44A3F]' : 'text-[#36452B]'
                  }`}
                >
                  {headline.message}
                </h4>
                {headline.output && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#36452B]/80">
                    <span>Watched output:</span>
                    <strong className="font-semibold text-[#36452B]">
                      {output?.label ?? headline.output}
                    </strong>
                    <span className="rounded bg-[#F0EDE6] px-1.5 py-0.5 font-mono text-xs text-[#36452B]">
                      {headline.output}
                    </span>
                    {output && (
                      <span>
                        · change{' '}
                        <strong className="font-mono font-bold tabular-nums text-[#36452B]">
                          {output.delta_observed === null ? 'unknown' : signedInr(output.delta_observed)}
                        </strong>
                      </span>
                    )}
                  </p>
                )}
              </div>

              {[headline, ...rest]
                .filter((f) => f.kind === 'lost_link')
                .map((f, i) => (
                  <GraphBoundary key={i}>
                    <Suspense fallback={null}>
                      <LostLinkGraph finding={f} outputLabels={outputLabels} />
                    </Suspense>
                  </GraphBoundary>
                ))}

              {rest.length > 0 && (
                <ul className="space-y-1.5 border-t border-[#D7D0C5] pt-3 text-sm text-[#36452B]/80">
                  {rest.map((f, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-2">
                      <span className="rounded bg-[#F0EDE6] px-1.5 py-0.5 font-mono text-xs font-medium text-[#36452B]">
                        {KIND_LABEL[f.kind]}
                      </span>
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        )
      })}

      {protectedEdits.length > 0 && (
        <div className="ledger-card bg-[#F8F7F4] p-4 sm:p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#36452B]/75">
            {KIND_LABEL[PROTECTED]} ({protectedEdits.length})
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-[#36452B]/85">
            {protectedEdits.map((f, i) => (
              <li key={i}>
                <span className="rounded bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-xs font-semibold text-[#36452B]">
                  {f.cell}
                </span>{' '}
                <span className="ml-1">{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
