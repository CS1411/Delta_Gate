import ReactECharts from 'echarts-for-react'
import type { CheckResult } from '../../types'
import { buildWaterfallOption } from './waterfallOption'

// ECharts waterfall for the Check tab: Base -> non-zero group shares (+ Unverified if any) -> New.
// Bars add up exactly to Δ; zero-share groups stay out (they remain in GroupsTable).

interface Props {
  check: CheckResult
  outputCell?: string | null
  selectedGroupId?: string | null
  onSelectGroup?: (groupId: string | null) => void
}

export default function Waterfall({ check, outputCell, selectedGroupId = null, onSelectGroup }: Props) {
  const output = check.outputs.find((o) => o.cell === outputCell) ?? check.outputs[0]
  if (!output) return null

  const option = buildWaterfallOption(output, check.groups, selectedGroupId)
  if (!option) {
    return (
      <section aria-label="Attribution waterfall" className="rounded-2xl bg-white p-6 shadow-md">
        <h3 className="text-2xl font-bold text-slate-900">Attribution waterfall</h3>
        <p className="mt-2 text-lg text-slate-600">
          Waterfall unavailable: base or new value is unknown for {output.label} ({output.cell}).
        </p>
      </section>
    )
  }

  const onEvents = onSelectGroup
    ? {
        click: (params: { data?: { groupId?: string | null } }) => {
          const gid = params?.data?.groupId
          if (gid) onSelectGroup(selectedGroupId === gid ? null : gid)
        },
      }
    : undefined

  return (
    <section aria-label="Attribution waterfall" className="rounded-2xl bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-2xl font-bold text-slate-900">
          Attribution waterfall · <span className="font-normal text-slate-600">{output.label}</span>
        </h3>
        <span className="text-sm font-medium text-slate-500">
          Bars sum to Δ · click a bar to highlight its cells
        </span>
      </div>
      <div className="mt-4">
        <ReactECharts option={option} style={{ height: 340, width: '100%' }} onEvents={onEvents} />
      </div>
    </section>
  )
}
