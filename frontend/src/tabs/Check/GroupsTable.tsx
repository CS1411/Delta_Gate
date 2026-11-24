import { Fragment, useState } from 'react'
import { signedInr } from '../../format'
import type { Attribution, Group, GroupType, Unverifiable } from '../../types'

export type GroupFilter = 'all' | GroupType | 'unverified'

interface Props {
  groups: Group[]
  attribution: Attribution[]
  unverifiable: Unverifiable[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onProve?: (groupId: string) => void
}

export default function GroupsTable({
  groups,
  attribution,
  unverifiable,
  selectedGroupId,
  onSelectGroup,
  onProve,
}: Props) {
  const [filter, setFilter] = useState<GroupFilter>('all')

  const attrByGroup = new Map(attribution.map((a) => [a.group_id, a]))
  const unverifiedByCell = new Map(unverifiable.map((u) => [u.cell, u.reason]))
  const isGroupUnverified = (g: Group) =>
    !attrByGroup.has(g.group_id) || g.cells.some((c) => unverifiedByCell.has(c))

  const counts: Record<GroupFilter, number> = {
    all: groups.length,
    data: groups.filter((g) => g.type === 'data').length,
    logic: groups.filter((g) => g.type === 'logic').length,
    structural: groups.filter((g) => g.type === 'structural').length,
    unverified: groups.filter(isGroupUnverified).length,
  }

  const visible = groups.filter((g) => {
    if (filter === 'all') return true
    if (filter === 'unverified') return isGroupUnverified(g)
    return g.type === filter
  })

  const filters: { key: GroupFilter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'data', label: `Data (${counts.data})` },
    { key: 'logic', label: `Logic (${counts.logic})` },
    { key: 'structural', label: `Structural (${counts.structural})` },
    { key: 'unverified', label: `Unverified (${counts.unverified})` },
  ]

  const colSpan = onProve ? 5 : 4

  return (
    <section aria-label="Change groups ledger" className="glass-card p-6 sm:p-8 border border-[#D7D0C5] bg-white/80">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D7D0C5]/60 pb-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            Change groups
          </p>
          <h3 className="mt-1 text-2xl font-serif font-bold tracking-tight text-[#36452B]">
            Attribution Breakdown &amp; Cell Proofs
          </h3>
        </div>

        {/* Filter pills with #36452B active state */}
        <div role="group" aria-label="Filter change groups by type" className="flex flex-wrap gap-2">
          {filters.map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3.5 py-1 font-mono text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#36452B] text-[#F8F7F4] shadow-xs'
                    : 'border border-[#D7D0C5] bg-white/70 text-[#7F7D74] hover:border-[#8A9646] hover:text-[#36452B]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-[#D7D0C5] bg-white shadow-xs">
        <table className="w-full border-collapse text-left font-sans">
          <thead>
            <tr className="border-b border-[#D7D0C5] bg-[#F8F7F4] text-[11px] font-bold uppercase tracking-wider text-[#7F7D74]">
              <th className="py-3.5 pl-6 pr-4">CHANGE GROUP &amp; CELLS</th>
              <th className="px-4 py-3.5 text-right">SOLO EFFECT</th>
              <th className="px-4 py-3.5 text-right">SHAPLEY SHARE (Φ)</th>
              <th
                className="px-4 py-3.5 text-right cursor-help"
                title="interaction = φ(g) - solo(g)"
              >
                <span className="border-b border-dotted border-[#7F7D74]">INTERACTION</span>
              </th>
              {onProve && <th className="py-3.5 pl-4 pr-6 text-right">PROOF</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D7D0C5]/60 text-sm">
            {visible.map((g) => {
              const attr = attrByGroup.get(g.group_id)
              const excluded = !attr
              const selected = selectedGroupId === g.group_id

              return (
                <Fragment key={g.group_id}>
                  <tr
                    onClick={() => onSelectGroup(selected ? null : g.group_id)}
                    className={`cursor-pointer transition-colors ${
                      selected ? 'bg-[#8A9646]/10' : 'hover:bg-[#F8F7F4]'
                    }`}
                  >
                    <td className="py-4 pl-6 pr-4 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-[#D7D0C5] bg-[#F8F7F4] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#36452B]">
                          {g.type}
                        </span>
                        {isGroupUnverified(g) && (
                          <span className="rounded-md border border-[#D7D0C5] bg-[#EEDADA] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#36452B]">
                            unverified
                          </span>
                        )}
                        <span className="text-base font-serif font-bold text-[#36452B]">{g.label}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-[#7F7D74]">
                        {g.cells.length} {g.cells.length === 1 ? 'cell' : 'cells'} · click to {selected ? 'collapse' : 'expand'} coordinates
                      </p>
                    </td>

                    <td className="px-4 py-4 text-right align-top font-mono text-sm font-semibold tabular-nums text-[#7F7D74]">
                      {excluded ? <span className="text-xs">unverified</span> : signedInr(attr.solo)}
                    </td>

                    <td className="px-4 py-4 text-right align-top font-mono text-base font-bold tabular-nums text-[#36452B]">
                      {excluded ? <span className="text-xs text-[#36452B]">unverified</span> : signedInr(attr.share)}
                    </td>

                    <td className="px-4 py-4 text-right align-top font-mono text-sm font-medium tabular-nums text-[#7F7D74]">
                      {excluded ? <span className="text-xs">unverified</span> : signedInr(attr.interaction)}
                    </td>

                    {onProve && (
                      <td className="py-4 pl-4 pr-6 text-right align-top">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onProve(g.group_id)
                          }}
                          className="rounded-xl border border-[#36452B] bg-[#36452B] px-3.5 py-1.5 text-xs font-bold text-[#F8F7F4] shadow-xs transition-all hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646]"
                        >
                          Prove it
                        </button>
                      </td>
                    )}
                  </tr>

                  {/* Expandable Target cell coordinates */}
                  {selected && (
                    <tr className="bg-[#8A9646]/5">
                      <td colSpan={colSpan} className="px-6 pb-4 pt-2">
                        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7F7D74]">
                          Target cell coordinates in {g.group_id} ({g.label}):
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {g.cells.map((cell) => {
                            const reason = unverifiedByCell.get(cell)
                            return (
                              <span
                                key={cell}
                                title={reason ? `Unverified: ${reason}` : cell}
                                className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold ${
                                  reason
                                    ? 'border-[#D7D0C5] bg-[#EEDADA] text-[#36452B]'
                                    : 'border-[#D7D0C5] bg-white text-[#36452B]'
                                }`}
                              >
                                {cell}
                                {reason && (
                                  <span className="ml-1 text-[#7F7D74]">({reason})</span>
                                )}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
