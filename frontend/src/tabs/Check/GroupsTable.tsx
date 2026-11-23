import { Fragment, useState } from 'react'
import { signedInr } from '../../format'
import type { Attribution, Group, GroupType, Unverifiable } from '../../types'

// Change-groups table for the Check tab: type filter, clickable rows highlighting cells, and "Prove it".
// Every number comes straight from the engine's Attribution; groups excluded by taint show "unverified", never 0.

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
  data: 'bg-sky-100 text-sky-900',
  logic: 'bg-violet-100 text-violet-900',
  structural: 'bg-amber-100 text-amber-900',
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
    <section aria-label="Change groups" className="rounded-2xl bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-2xl font-bold text-slate-900">
          Change groups <span className="font-normal text-slate-500">({groups.length})</span>
        </h3>
        <div role="group" aria-label="Filter change groups by type" className="flex flex-wrap gap-2">
          {filters.map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-4 py-1.5 text-base font-semibold transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label} <span className="ml-1 opacity-75">({counts[key]})</span>
              </button>
            )
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-lg text-slate-500">No change groups match this filter.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-slate-200 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-4">Change group</th>
                <th className="px-4 py-3 text-right">Solo</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-4 py-3 text-right">Interaction</th>
                {onProve && <th className="py-3 pl-4 text-right">Proof</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
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
                        selected ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-4 pr-4 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${TYPE_STYLE[g.type]}`}>
                            {g.type}
                          </span>
                          {isGroupUnverified(g) && (
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold uppercase text-slate-700">
                              unverified
                            </span>
                          )}
                          <span className="text-xl font-semibold text-slate-900">{g.label}</span>
                        </div>
                        <p className="mt-1 font-mono text-sm text-slate-500">
                          {g.cells.length} {g.cells.length === 1 ? 'cell' : 'cells'} · click to{' '}
                          {selected ? 'hide' : 'highlight'} cells
                        </p>
                      </td>

                      <td className="px-4 py-4 text-right align-top text-xl font-medium tabular-nums text-slate-700">
                        {excluded ? <span className="text-slate-500">unverified</span> : signedInr(attr.solo)}
                      </td>

                      <td className="px-4 py-4 text-right align-top text-2xl font-bold tabular-nums text-slate-900">
                        {excluded ? <span className="text-lg font-medium text-slate-500">unverified</span> : signedInr(attr.share)}
                      </td>

                      <td className="px-4 py-4 text-right align-top text-xl tabular-nums text-slate-600">
                        {excluded ? <span className="text-slate-500">unverified</span> : signedInr(attr.interaction)}
                      </td>

                      {onProve && (
                        <td className="py-4 pl-4 text-right align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onProve(g.group_id)
                            }}
                            className="rounded-lg border-2 border-slate-900 px-4 py-2 text-base font-semibold text-slate-900 hover:bg-slate-900 hover:text-white focus-visible:outline-4 focus-visible:outline-slate-400"
                          >
                            Prove it
                          </button>
                        </td>
                      )}
                    </tr>

                    {selected && (
                      <tr className="bg-sky-50/70">
                        <td colSpan={colSpan} className="px-4 pb-4 pt-2">
                          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                            Cells in {g.group_id}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {g.cells.map((cell) => {
                              const reason = unverifiedByCell.get(cell)
                              return (
                                <span
                                  key={cell}
                                  title={reason ? `Unverified: ${reason}` : cell}
                                  className={`rounded-md border px-2.5 py-1 font-mono text-sm ${
                                    reason
                                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                                      : 'border-sky-300 bg-white text-slate-900'
                                  }`}
                                >
                                  {cell}
                                  {reason && <span className="ml-1.5 font-sans text-xs font-semibold">({reason})</span>}
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
