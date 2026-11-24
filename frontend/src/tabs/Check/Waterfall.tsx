import ReactECharts from 'echarts-for-react'
import type { CheckResult } from '../../types'
import { buildWaterfallOption } from './waterfallOption'

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
      <section aria-label="Attribution waterfall" className="ledger-card p-5">
        <h3 className="text-base font-bold text-[#36452B]">Waterfall · {output.label}</h3>
        <p className="mt-1.5 text-sm text-[#36452B]/75">
          Waterfall unavailable because base or new value is unknown for {output.label} ({output.cell}).
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
    <section aria-label="Attribution waterfall" className="ledger-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5] pb-3.5">
        <div>
          <h3 className="text-base font-bold text-[#36452B]">
            Waterfall · <span className="text-[#8A9646]">{output.label}</span>
          </h3>
          <p className="mt-0.5 text-xs text-[#36452B]/75">
            Bars add up exactly to Δ · Click any group bar to highlight its cells below
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#36452B]/80">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#36452B]" />
            Totals (Base/New)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#8A9646]" />
            Positive attribution
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs border border-[#A44A3F] bg-[#EEDADA]" />
            Unverified
          </span>
        </div>
      </div>

      <div className="mt-3">
        <ReactECharts option={option} style={{ height: 360, width: '100%' }} onEvents={onEvents} />
      </div>
    </section>
  )
}
