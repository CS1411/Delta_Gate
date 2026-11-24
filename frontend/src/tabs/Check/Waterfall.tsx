import ReactECharts from 'echarts-for-react'
import type { CheckResult } from '../../types'
import { buildWaterfallOption } from './waterfallOption'

// ECharts waterfall for the Check tab: Base -> non-zero group shares (+ Unverified if any) -> New.
// Styled according to the Visual Design System:
// - Total bars in Deep Bamboo Green (#36452B)
// - Positive attribution bars in Mossy Rock Green (#8A9646)
// - Unverified in Cherry Blossom Pink (#EEDADA)
// - Axis labels & captions in Weathered Wood Grey (#7F7D74)

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
      <section aria-label="Attribution waterfall" className="glass-card p-6 sm:p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
          03 / ATTRIBUTION WATERFALL
        </p>
        <h3 className="mt-1 text-2xl font-extrabold text-[#36452B]">Attribution Waterfall</h3>
        <p className="mt-2 text-base text-[#7F7D74]">
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
    <section aria-label="Attribution waterfall" className="glass-card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D7D0C5]/60 pb-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            03 / ATTRIBUTION WATERFALL (SHAPLEY SHARES)
          </p>
          <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-[#36452B]">
            Waterfall · <span className="text-[#8A9646]">{output.label}</span>
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-[#36452B]">
            <span className="inline-block h-3 w-3 rounded bg-[#36452B]" />
            Totals (Base/New)
          </span>
          <span className="flex items-center gap-1.5 text-[#8A9646]">
            <span className="inline-block h-3 w-3 rounded bg-[#8A9646]" />
            Positive Attribution
          </span>
          <span className="flex items-center gap-1.5 text-[#7F7D74]">
            <span className="inline-block h-3 w-3 rounded border border-[#D7D0C5] bg-[#EEDADA]" />
            Unverified
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#7F7D74]">
        Bars add up exactly to Δ · Click any group bar to highlight its source cells in the ledger below
      </p>

      <div className="mt-4 min-h-[320px] w-full">
        <ReactECharts
          option={option}
          style={{ height: 360, width: '100%', minHeight: 320 }}
          onEvents={onEvents}
        />
      </div>
    </section>
  )
}
