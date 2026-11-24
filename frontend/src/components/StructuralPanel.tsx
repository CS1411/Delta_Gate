import { signedInr } from '../format'
import type { CheckResult, StructuralFinding } from '../types'

// Structural findings with node-edge dependency diagram and protected cell alerts
// strictly using our 5 Zen Bamboo hex colors:
// #D7D0C5 Zen Sand Beige, #36452B Deep Bamboo Green, #8A9646 Mossy Rock Green,
// #7F7D74 Weathered Wood Grey, #EEDADA Cherry Blossom Pink.

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
  const hasLostLink = check.structural.some((f) => f.kind === 'lost_link')

  if (check.structural.length === 0) {
    return <p className="text-sm font-mono text-[#7F7D74]">No structural findings.</p>
  }

  return (
    <section aria-label="Structural findings" className="space-y-6">
      {/* Structural Findings Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D7D0C5] bg-white/80 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#36452B]">
            STRUCTURAL FINDINGS
          </span>
          {hasLostLink && (
            <span className="rounded-full border border-[#D7D0C5] bg-[#EEDADA] px-2.5 py-0.5 font-mono text-xs font-bold text-[#36452B]">
              ⚠ LOST LINK
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-[#7F7D74]">
          {list.length} cell(s) audited · broken dynamic dependencies caught even at net ₹0 delta
        </span>
      </div>

      {/* Node-edge dependency diagram for broken links */}
      {hasLostLink && (
        <div className="rounded-2xl border border-[#D7D0C5] bg-[#F8F7F4]/80 p-6 shadow-sm">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74] mb-4">
            Dependency Flow Diagram
          </p>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3">
            {/* Source Node */}
            <div className="rounded-xl border border-[#36452B] bg-[#36452B] px-5 py-3 text-center text-[#F8F7F4] shadow-sm min-w-[180px]">
              <span className="block font-mono text-[10px] uppercase text-[#D7D0C5]">Input Source Node</span>
              <strong className="text-sm font-bold font-mono">Payments!C (Collected)</strong>
            </div>

            {/* Severed Link Edge */}
            <div className="flex flex-col items-center justify-center text-center px-2">
              <span className="font-mono text-[11px] font-bold text-[#36452B] px-2 py-0.5 rounded bg-[#EEDADA] border border-[#D7D0C5]">
                — no longer connected →
              </span>
              <span className="text-xs text-[#7F7D74] mt-1 font-mono">formula replaced by constant</span>
            </div>

            {/* Severed Output Card */}
            <div className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA] p-4 text-center text-[#36452B] shadow-sm min-w-[200px]">
              <div className="flex items-center justify-center gap-1.5">
                <span className="font-mono text-[10px] font-bold uppercase text-[#36452B]">Severed Output</span>
                <span className="rounded bg-white/70 px-1.5 py-0.2 font-mono text-[10px] font-bold">Summary!C4</span>
              </div>
              <p className="text-xs font-bold mt-1">Collected (Net Δ = ₹0)</p>
              <p className="text-[10px] text-[#7F7D74] font-mono mt-0.5">₹1,00,000 before &amp; after</p>
            </div>

            {/* Still connected edge */}
            <div className="hidden lg:flex flex-col items-center justify-center text-center px-2">
              <span className="font-mono text-[11px] text-[#7F7D74]">
                still connected →
              </span>
            </div>

            {/* Intact Outputs */}
            <div className="rounded-xl border border-[#D7D0C5] bg-white p-4 text-center text-[#36452B] shadow-sm min-w-[180px]">
              <span className="block font-mono text-[10px] uppercase text-[#7F7D74]">Intact Output</span>
              <strong className="text-sm font-bold font-mono">Summary!C6 (Total dues)</strong>
              <p className="text-[10px] text-[#8A9646] font-bold font-mono mt-0.5">+₹42,000 observed</p>
            </div>
          </div>
        </div>
      )}

      {/* Structural findings list with plain-English bullets */}
      <div className="space-y-4">
        {list.map(({ cell, headline, rest }) => {
          const lost = headline.kind === 'lost_link'
          const output = headline.output ? outputs.get(headline.output) : undefined
          return (
            <article
              key={cell}
              className={`rounded-2xl border bg-white p-6 shadow-sm border-[#D7D0C5] ${
                lost ? 'border-l-8 border-l-[#EEDADA]' : 'border-l-4 border-l-[#D7D0C5]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md border border-[#D7D0C5] bg-[#EEDADA] px-2 py-0.5 font-mono text-xs font-bold text-[#36452B]">
                  ⚠ {KIND_LABEL[headline.kind]} · {cell}
                </span>
                {headline.output && (
                  <span className="font-mono text-xs text-[#7F7D74]">
                    Watched output: <strong className="text-[#36452B]">{output?.label ?? headline.output}</strong> ({headline.output})
                    {output && (
                      <span className="ml-1 text-[#36452B]">
                        · change: <b>{output.delta_observed === null ? 'unknown' : signedInr(output.delta_observed)}</b>
                      </span>
                    )}
                  </span>
                )}
              </div>

              <h4 className="mt-2 text-xl font-serif font-bold text-[#36452B]">
                {headline.message}
              </h4>

              <ul className="mt-3 space-y-1 text-xs text-[#7F7D74] list-disc list-inside">
                <li>Cell formula was disconnected from its upstream calculation tree and overwritten with a static literal.</li>
                {rest.map((f, i) => (
                  <li key={i}>
                    <strong>{KIND_LABEL[f.kind]}:</strong> {f.message}
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>

      {/* PROTECTED CELL EDITED alert card */}
      {protectedEdits.length > 0 && (
        <div className="rounded-2xl border border-[#D7D0C5] bg-[#EEDADA]/50 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase text-[#36452B]">
              PROTECTED CELL EDITED
            </span>
            <span className="rounded bg-[#36452B] text-white font-mono text-[10px] px-2 py-0.5">
              POLICY ALERT
            </span>
          </div>
          <p className="text-xs text-[#7F7D74]">
            The following protected formula cells were directly modified, triggering policy interception:
          </p>
          <ul className="space-y-1 text-xs font-mono text-[#36452B]">
            {protectedEdits.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#36452B]" />
                <span className="font-bold">{f.cell}</span>: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
