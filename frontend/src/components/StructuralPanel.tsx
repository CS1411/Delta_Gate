import { signedInr } from '../format'
import type { CheckResult, StructuralFinding } from '../types'

// Structural findings for the Check tab strictly formatted with 6-color Zen Bamboo palette.
// One card per cell; lost link is highlighted with Cherry Blossom #EEDADA and Deep Bamboo #36452B.
// Protected-cell edits go in a subtle list at the end so they never bury a lost link.

const PROTECTED = 'protected_formula_edit'
const KIND_LABEL: Record<StructuralFinding['kind'], string> = {
  lost_link: 'Lost link',
  typed_over_formula: 'Typed over a formula',
  shortened_range: 'Shortened range',
  rows_deleted_in_range: 'Rows deleted inside a range',
  protected_formula_edit: 'Protected cell edited',
}

interface Card { cell: string; headline: StructuralFinding; rest: StructuralFinding[] }

function cards(findings: StructuralFinding[]): Card[] {
  const byCell = new Map<string, StructuralFinding[]>()
  for (const f of findings) if (f.kind !== PROTECTED) byCell.set(f.cell, [...(byCell.get(f.cell) ?? []), f])
  const out = [...byCell].map(([cell, list]) => {
    const headline = list.find((f) => f.kind === 'lost_link') ?? list[0]
    return { cell, headline, rest: list.filter((f) => f !== headline) }
  })
  return out.sort((a, b) => Number(b.headline.kind === 'lost_link') - Number(a.headline.kind === 'lost_link'))
}

export default function StructuralPanel({ check }: { check: CheckResult }) {
  const outputs = new Map(check.outputs.map((o) => [o.cell, o]))
  const protectedEdits = check.structural.filter((f) => f.kind === PROTECTED)
  const list = cards(check.structural)

  if (check.structural.length === 0) {
    return <p className="text-xl text-[#7F7D74]">No structural findings.</p>
  }

  return (
    <section aria-label="Structural findings" className="space-y-6">
      {list.map(({ cell, headline, rest }) => {
        const lost = headline.kind === 'lost_link'
        const output = headline.output ? outputs.get(headline.output) : undefined
        return (
          <article
            key={cell}
            className={`rounded-2xl border-l-8 bg-white px-8 py-6 shadow-sm border border-[#D7D0C5] ${
              lost ? 'border-l-[#EEDADA]' : 'border-l-[#D7D0C5]'
            }`}
          >
            <p className="text-lg font-bold uppercase tracking-wide text-[#36452B]">
              ⚠ {KIND_LABEL[headline.kind]} · <span className="font-mono normal-case">{cell}</span>
            </p>
            <h3 className="mt-2 text-3xl font-serif font-bold leading-tight text-[#36452B]">
              {headline.message}
            </h3>
            {headline.output && (
              <p className="mt-3 text-base text-[#7F7D74]">
                Watched output: {output?.label ?? headline.output}{' '}
                <span className="font-mono text-sm text-[#36452B]">{headline.output}</span>
                {output && (
                  <>
                    {' · change '}
                    <b className="tabular-nums text-[#36452B]">
                      {output.delta_observed === null ? 'unknown' : signedInr(output.delta_observed)}
                    </b>
                  </>
                )}
              </p>
            )}
            {rest.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-[#D7D0C5]/60 pt-3 text-sm text-[#7F7D74]">
                {rest.map((f, i) => <li key={i}>{KIND_LABEL[f.kind]}: {f.message}</li>)}
              </ul>
            )}
          </article>
        )
      })}

      {protectedEdits.length > 0 && (
        <div className="px-2">
          <h4 className="text-sm font-semibold text-[#7F7D74]">{KIND_LABEL[PROTECTED]}</h4>
          <ul className="mt-1 space-y-1 text-sm text-[#7F7D74]">
            {protectedEdits.map((f, i) => (
              <li key={i}><span className="font-mono text-[#36452B]">{f.cell}</span>: {f.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
