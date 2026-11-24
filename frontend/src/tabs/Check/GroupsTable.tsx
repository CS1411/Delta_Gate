import { Fragment, useState } from 'react'
import { IconChevronDown } from '../../components/Icons'
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

const TYPE_STYLE: Record<GroupType, string> = {
  data: 'bg-[#8A9646]/15 text-[#36452B] border-[#8A9646]/35',
  logic: 'bg-[#F0EDE6] text-[#36452B] border-[#D7D0C5]',
  structural: 'bg-[#EEDADA]/70 text-[#36452B] border-[#A44A3F]/25',
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
    { key: 'all', label: 'All' },
    { key: 'data', label: 'Data' },
    { key: 'logic', label: 'Logic' },
    { key: 'structural', label: 'Structural' },
    { key: 'unverified', label: 'Unverified' },
  ]

  const colSpan = onProve ? 5 : 4

  return (
    <section aria-label="Change groups ledger" className="ledger-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#D7D0C5] px-5 py-4 sm:px-6">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-bold text-[#36452B]">Change groups</h3>
          <span className="font-mono text-xs text-[#36452B]/70">({groups.length})</span>
        </div>

        <div
          role="group"
          aria-label="Filter change groups by type"
          className="inline-flex flex-wrap rounded-md border border-[#D7D0C5] bg-[#F0EDE6] p-0.5"
        >
          {filters.map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`pressable rounded px-3 py-1 text-xs font-semibold ${
                  active
                    ? 'bg-[#FFFFFF] text-[#36452B] shadow-xs'
                    : 'text-[#36452B]/70 hover:text-[#36452B]'
                }`}
              >
                {label}{' '}
                <span className="ml-0.5 font-mono text-[11px] opacity-75">{counts[key]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-6 text-sm text-[#36452B]/75">
          No change groups match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#D7D0C5] bg-[#F8F7F4] text-xs font-semibold uppercase tracking-wider text-[#36452B]/75">
                <th className="py-3 pl-5 pr-4 sm:pl-6">Change group &amp; cells</th>
                <th className="px-4 py-3 text-right">Solo effect</th>
                <th className="px-4 py-3 text-right">Shapley share (φ)</th>
                <th className="px-4 py-3 text-right">Interaction</th>
                {onProve && <th className="py-3 pl-4 pr-5 text-right sm:pr-6">Proof</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D7D0C5]">
              {visible.map((g) => {
                const attr = attrByGroup.get(g.group_id)
                const excluded = !attr
                const selected = selectedGroupId === g.group_id
                const cellSummary = `${g.cells.length} ${g.cells.length === 1 ? 'cell' : 'cells'}`
                const cellPreview =
                  g.cells.length <= 2
                    ? g.cells.join(', ')
                    : `${g.cells.slice(0, 2).join(', ')} +${g.cells.length - 2}`

                return (
                  <Fragment key={g.group_id}>
                    <tr
                      onClick={() => onSelectGroup(selected ? null : g.group_id)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-[#8A9646]/12' : 'hover:bg-[#F8F7F4]'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-4 sm:pl-6">
                        <div className="flex items-start gap-2.5">
                          <IconChevronDown
                            className={`mt-1 h-4 w-4 shrink-0 text-[#36452B]/65 transition-transform duration-150 ${
                              selected ? 'rotate-180 text-[#36452B]' : ''
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[#36452B]">{g.label}</span>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase ${TYPE_STYLE[g.type]}`}
                              >
                                {g.type}
                              </span>
                            </div>
                            <p className="mt-0.5 font-mono text-xs text-[#36452B]/70">
                              {cellSummary} · {cellPreview}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono tabular-nums text-[#36452B]">
                        {excluded ? (
                          <span className="text-xs font-medium text-[#A44A3F]">unverified</span>
                        ) : (
                          signedInr(attr.solo)
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold tabular-nums text-[#36452B]">
                        {excluded ? (
                          <span className="text-xs font-semibold text-[#A44A3F]">unverified</span>
                        ) : (
                          signedInr(attr.share)
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono tabular-nums text-[#36452B]/80">
                        {excluded ? '—' : signedInr(attr.interaction)}
                      </td>

                      {onProve && (
                        <td
                          className="whitespace-nowrap py-3.5 pl-4 pr-5 text-right sm:pr-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onProve(g.group_id)}
                            className="pressable rounded-md border border-[#36452B] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#36452B] hover:bg-[#36452B] hover:text-[#F8F7F4]"
                          >
                            Prove it
                          </button>
                        </td>
                      )}
                    </tr>

                    {selected && (
                      <tr className="bg-[#F8F7F4]">
                        <td colSpan={colSpan} className="px-6 py-3.5 sm:pl-12">
                          <div className="animate-dg-enter">
                            <div className="mb-2 text-xs font-semibold text-[#36452B]/75">
                              Target cell coordinates ({g.cells.length})
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {g.cells.map((cell) => {
                                const reason = unverifiedByCell.get(cell)
                                return (
                                  <span
                                    key={cell}
                                    title={reason ? `${cell} — ${reason}` : cell}
                                    className={`rounded border px-2 py-0.5 font-mono text-xs ${
                                      reason
                                        ? 'border-[#A44A3F]/30 bg-[#EEDADA]/70 text-[#36452B]'
                                        : 'border-[#D7D0C5] bg-[#FFFFFF] text-[#36452B]'
                                    }`}
                                  >
                                    {cell}
                                    {reason && (
                                      <span className="ml-1.5 font-sans text-xs font-medium text-[#A44A3F]">
                                        ({reason})
                                      </span>
                                    )}
                                  </span>
                                )
                              })}
                            </div>
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
