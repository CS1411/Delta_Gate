import { Fragment, useState } from 'react'
import { signedInr } from '../../format'
import type { Attribution, Group, GroupType, Unverifiable } from '../../types'

// Change-groups table for the Check tab: type filter, clickable rows highlighting cells, and "Prove it".
// Every number comes straight from the engine's Attribution; groups excluded by taint show "unverified", never 0.
// Styled in the "Editorial Glass + Zen Bamboo" visual design system.

export type GroupFilter = 'all' | GroupType | 'unverified'

interface Props {
  groups: Group[]
  attribution: Attribution[]
  unverifiable: Unverifiable[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onProve?: (groupId: string) => void
}

const TYPE_STYLE: Record<GroupType, string> = {
  data: 'bg-[#8A9646]/15 text-[#36452B] border border-[#8A9646]/40',
  logic: 'bg-[#36452B]/10 text-[#36452B] border border-[#36452B]/30',
  structural: 'bg-[#EEDADA] text-[#36452B] border border-[#D7D0C5]',
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
    { key: 'all', label: 'All Groups' },
    { key: 'data', label: 'Data' },
    { key: 'logic', label: 'Logic' },
    { key: 'structural', label: 'Structural' },
    { key: 'unverified', label: 'Unverified' },
  ]

  const colSpan = onProve ? 5 : 4

  return (
    <section aria-label="Change groups ledger" className="glass-card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D7D0C5]/60 pb-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            05 / CHANGE GROUPS & EXACT ATTRIBUTION
          </p>
          <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[#36452B]">
            Change Groups <span className="font-normal text-[#7F7D74]">({groups.length})</span>
          </h3>
        </div>

        <div role="group" aria-label="Filter change groups by type" className="flex flex-wrap gap-2">
          {filters.map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  active
                    ? 'bg-[#36452B] text-white shadow-sm'
                    : 'border border-[#D7D0C5] bg-white/70 text-[#7F7D74] hover:border-[#8A9646] hover:text-[#36452B]'
                }`}
              >
                {label} <span className="ml-1 opacity-75">({counts[key]})</span>
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-base text-[#7F7D74]">No change groups match this category filter.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-[#D7D0C5] font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74]">
                <th className="py-3.5 pr-4">Change Group & Target Cells</th>
                <th className="px-4 py-3.5 text-right">Solo Effect</th>
                <th className="px-4 py-3.5 text-right">Shapley Share (φ)</th>
                <th className="px-4 py-3.5 text-right" title="interaction = φ(g) − solo(g)">
                  <span className="inline-flex items-center gap-1 cursor-help">
                    Interaction
                    <span className="text-[10px] text-[#7F7D74] border border-[#D7D0C5] rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-normal">?</span>
                  </span>
                </th>
                {onProve && <th className="py-3.5 pl-4 text-right">Independent Proof</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D7D0C5]/60">
              {visible.map((g) => {
                const attr = attrByGroup.get(g.group_id)
                const excluded = !attr
                const selected = selectedGroupId === g.group_id
                return (
                  <Fragment key={g.group_id}>
                    <tr
                      onClick={() => onSelectGroup(selected ? null : g.group_id)}
                      aria-expanded={selected}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-[#8A9646]/10' : 'hover:bg-white/60'
                      }`}
                    >
                      <td className="py-4 pr-4 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2.5 py-0.5 font-mono text-xs font-bold uppercase ${TYPE_STYLE[g.type]}`}>
                            {g.type}
                          </span>
                          {isGroupUnverified(g) && (
                            <span className="rounded-md border border-[#D7D0C5] bg-[#EEDADA] px-2 py-0.5 font-mono text-xs font-bold uppercase text-[#36452B]">
                              unverified
                            </span>
                          )}
                          <span className="text-xl font-bold text-[#36452B]">{g.label}</span>
                        </div>
                        <p className="mt-1 font-mono text-xs text-[#7F7D74]">
                          {g.cells.length} {g.cells.length === 1 ? 'cell' : 'cells'} · click to{' '}
                          {selected ? 'collapse' : 'highlight'} origin cells
                        </p>
                      </td>

                      <td className="px-4 py-4 text-right align-top text-xl font-semibold tabular-nums text-[#7F7D74]">
                        {excluded ? (
                          <span className="text-sm font-medium text-[#7F7D74]">unverified</span>
                        ) : (
                          signedInr(attr.solo)
                        )}
                      </td>

                      <td className="px-4 py-4 text-right align-top text-2xl font-black tabular-nums text-[#36452B]">
                        {excluded ? (
                          <span className="text-base font-bold text-[#A44A3F]">unverified</span>
                        ) : (
                          signedInr(attr.share)
                        )}
                      </td>

                      <td className="px-4 py-4 text-right align-top text-lg font-medium tabular-nums text-[#7F7D74]">
                        {excluded ? (
                          <span className="text-sm font-medium text-[#7F7D74]">unverified</span>
                        ) : (
                          signedInr(attr.interaction)
                        )}
                      </td>

                      {onProve && (
                        <td className="py-4 pl-4 text-right align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onProve(g.group_id)
                            }}
                            className="rounded-xl border-2 border-[#36452B] px-4 py-2 text-sm font-bold text-[#36452B] shadow-sm transition-all hover:bg-[#36452B] hover:text-white focus-visible:outline-4 focus-visible:outline-[#8A9646]"
                          >
                            Prove it
                          </button>
                        </td>
                      )}
                    </tr>

                    {selected && (
                      <tr className="bg-[#8A9646]/5">
                        <td colSpan={colSpan} className="px-6 pb-5 pt-3">
                          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74]">
                            Origin Cells in {g.group_id} ({g.label})
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {g.cells.map((cell) => {
                              const reason = unverifiedByCell.get(cell)
                              return (
                                <span
                                  key={cell}
                                  title={reason ? `Unverified: ${reason}` : cell}
                                  className={`rounded-lg border px-3 py-1 font-mono text-xs font-semibold ${
                                    reason
                                      ? 'border-[#D7D0C5] bg-[#EEDADA] text-[#36452B]'
                                      : 'border-[#D7D0C5] bg-white text-[#36452B]'
                                  }`}
                                >
                                  {cell}
                                  {reason && (
                                    <span className="ml-1.5 font-sans text-xs text-[#A44A3F]">
                                      ({reason})
                                    </span>
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
      )}
    </section>
  )
}
