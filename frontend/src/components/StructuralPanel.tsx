import { signedInr } from '../format'
import type { CheckResult, StructuralFinding } from '../types'

// Structural findings for the Check tab. One card per cell; a lost link is the card's red headline and the
// cell's other findings sit under it as small grey lines. Protected-cell edits go in a small grey list at the
// end so they never bury a lost link. Every string and number comes from the CheckResult.

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
    return <p className="text-xl text-slate-600">No structural findings.</p>
  }

  return (
    <section aria-label="Structural findings" className="space-y-6">
      {list.map(({ cell, headline, rest }) => {
        const lost = headline.kind === 'lost_link'
        const output = headline.output ? outputs.get(headline.output) : undefined
        return (
          <article
            key={cell}
            className={`rounded-2xl border-l-8 bg-white px-8 py-6 shadow-md ${lost ? 'border-red-600' : 'border-amber-500'}`}
          >
            <p className={`text-lg font-bold uppercase tracking-wide ${lost ? 'text-red-700' : 'text-amber-700'}`}>
              ⚠ {KIND_LABEL[headline.kind]} · <span className="font-mono normal-case">{cell}</span>
            </p>
            <h3 className={`mt-2 text-4xl font-bold leading-tight ${lost ? 'text-red-700' : 'text-slate-900'}`}>
              {headline.message}
            </h3>
            {headline.output && (
              <p className="mt-3 text-xl text-slate-700">
                Watched output: {output?.label ?? headline.output}{' '}
                <span className="font-mono text-lg text-slate-500">{headline.output}</span>
                {output && (
                  <>
                    {' · change '}
                    <b className="tabular-nums">{output.delta_observed === null ? 'unknown' : signedInr(output.delta_observed)}</b>
                  </>
                )}
              </p>
            )}
            {rest.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-base text-slate-500">
                {rest.map((f, i) => <li key={i}>{KIND_LABEL[f.kind]}: {f.message}</li>)}
              </ul>
            )}
          </article>
        )
      })}

      {protectedEdits.length > 0 && (
        <div className="px-2">
          <h4 className="text-base font-semibold text-slate-500">{KIND_LABEL[PROTECTED]}</h4>
          <ul className="mt-1 space-y-1 text-base text-slate-500">
            {protectedEdits.map((f, i) => (
              <li key={i}><span className="font-mono">{f.cell}</span>: {f.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
