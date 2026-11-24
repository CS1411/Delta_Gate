import { inr, signedInr } from '../../format'
import type { Group, GroupType, Output } from '../../types'

interface StepMeta {
  kind: 'total' | 'group' | 'unverified'
  label: string
  value: number
  groupId?: string
  groupType?: GroupType
  solo?: number
  share?: number
  interaction?: number
}

// Strict 6-Color Zen Bamboo Palette for Waterfall chart:
// - Deep Bamboo Green #36452B: Total waterfall bars (Base, New) & high contrast
// - Mossy Rock Green #8A9646: Positive attribution bars & active states
// - Cherry Blossom Pink #EEDADA: Negative shares & unverified bars
// - Weathered Wood Grey #7F7D74: Muted axis labels & captions
// - Zen Sand Beige #D7D0C5: Dividers and subtle grid lines
// - Warm Off-White #F8F7F4: Canvas background

function stepColor(meta: StepMeta, selected: boolean): string {
  if (meta.kind === 'total') {
    // Both Base and New total bars use Deep Bamboo Green
    return '#36452B'
  }
  if (meta.kind === 'unverified') {
    return '#EEDADA'
  }
  if (meta.share !== undefined && meta.share < 0) {
    return '#EEDADA'
  }
  // Positive attribution bars use Mossy Rock Green
  const base = '#8A9646'
  return selected ? '#36452B' : base
}

/** Build the ECharts option for a single watched output's waterfall, or null when base/new is unknown. */
export function buildWaterfallOption(
  output: Output,
  groups: Group[],
  selectedGroupId: string | null = null,
) {
  if (output.base === null || output.new === null) return null

  const groupById = new Map(groups.map((g) => [g.group_id, g]))
  // Zero-share groups stay out of the waterfall bars (they remain listed in GroupsTable).
  const causes = output.attribution.filter((a) => a.share !== 0)
  const hasUnverified = output.delta_unverified !== null && output.delta_unverified !== 0

  // Category labels and raw values for the waterfall steps
  const categories: string[] = ['Base']
  const metaList: StepMeta[] = [
    { kind: 'total', label: 'Base', value: output.base },
  ]

  for (const c of causes) {
    const g = groupById.get(c.group_id)
    const label = g?.label ?? c.group_id
    categories.push(label)
    metaList.push({
      kind: 'group',
      label,
      value: c.share,
      groupId: c.group_id,
      groupType: g?.type,
      solo: c.solo,
      share: c.share,
      interaction: c.interaction,
    })
  }

  if (hasUnverified && output.delta_unverified !== null) {
    categories.push('Unverified')
    metaList.push({
      kind: 'unverified',
      label: 'Unverified',
      value: output.delta_unverified,
    })
  }

  categories.push('New')
  metaList.push({ kind: 'total', label: 'New', value: output.new })

  // ECharts waterfall stacked-bar math (transparent base + visible delta)
  const baseSeriesData: number[] = []
  const deltaSeriesData: Array<{
    value: number
    itemStyle?: { color: string; borderColor?: string; borderWidth?: number; borderType?: 'dashed' | 'solid' }
  }> = []

  let running = 0

  for (let i = 0; i < metaList.length; i++) {
    const meta = metaList[i]
    const isSelected = !!meta.groupId && meta.groupId === selectedGroupId

    if (meta.kind === 'total') {
      baseSeriesData.push(0)
      deltaSeriesData.push({
        value: meta.value,
        itemStyle: {
          color: '#36452B',
          borderColor: '#36452B',
        },
      })
      running = meta.value
    } else {
      const delta = meta.value
      const start = running
      const end = running + delta
      const bottom = Math.min(start, end)
      const height = Math.abs(delta)

      baseSeriesData.push(bottom)

      const color = stepColor(meta, isSelected)
      const isUnverified = meta.kind === 'unverified'

      deltaSeriesData.push({
        value: height,
        itemStyle: {
          color,
          borderColor: isUnverified ? '#36452B' : isSelected ? '#36452B' : undefined,
          borderWidth: isUnverified ? 2 : isSelected ? 2 : 0,
          borderType: isUnverified ? 'dashed' : 'solid',
        },
      })

      running = end
    }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const pList = params as Array<{ dataIndex: number }>
        if (!pList || pList.length === 0) return ''
        const idx = pList[0].dataIndex
        const meta = metaList[idx]
        if (!meta) return ''

        if (meta.kind === 'total') {
          return `<div style="font-weight:bold;color:#36452B">${meta.label}</div><div style="font-size:16px;font-weight:bold;margin-top:2px;">${inr(meta.value)}</div>`
        }

        if (meta.kind === 'unverified') {
          return `<div style="font-weight:bold;color:#36452B">Unverified Delta</div><div style="font-size:16px;font-weight:bold;margin-top:2px;">${signedInr(meta.value)}</div><div style="color:#7F7D74;font-size:12px;margin-top:2px">Excluded from attribution (never guessed)</div>`
        }

        const gType = meta.groupType ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#D7D0C5;color:#36452B;margin-left:6px">${meta.groupType}</span>` : ''
        let body = `<div style="display:flex;align-items:center;font-weight:bold;color:#36452B"><span>${meta.label}</span>${gType}</div>`
        body += `<div style="font-size:16px;font-weight:bold;margin-top:4px;color:#36452B">Share: ${signedInr(meta.value)}</div>`

        if (meta.solo !== undefined && meta.interaction !== undefined) {
          body += `<div style="margin-top:6px;font-size:12px;border-top:1px solid #D7D0C5;padding-top:4px;color:#7F7D74">
            <div>Solo contribution: <b style="color:#36452B">${signedInr(meta.solo)}</b></div>
            <div>Interaction (cooperation): <b style="color:#36452B">${signedInr(meta.interaction)}</b></div>
          </div>`
        }

        return body
      },
    },
    grid: {
      top: 24,
      bottom: 40,
      left: 70,
      right: 24,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        color: '#7F7D74',
        fontSize: 12,
        fontWeight: 'bold',
        interval: 0,
        formatter: (val: string) => {
          return val.length > 16 ? `${val.slice(0, 14)}…` : val
        },
      },
      axisLine: { lineStyle: { color: '#D7D0C5' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#7F7D74',
        fontSize: 11,
        formatter: (val: number) => inr(val),
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(215, 208, 197, 0.4)',
          type: 'dashed',
        },
      },
    },
    series: [
      // Transparent helper bar for bottom elevation
      {
        name: 'Placeholder',
        type: 'bar',
        stack: 'waterfall',
        itemStyle: {
          borderColor: 'transparent',
          color: 'transparent',
        },
        emphasis: {
          itemStyle: {
            borderColor: 'transparent',
            color: 'transparent',
          },
        },
        data: baseSeriesData,
      },
      // Visible step / attribution bar
      {
        name: 'Attribution',
        type: 'bar',
        stack: 'waterfall',
        data: deltaSeriesData,
        barMaxWidth: 56,
        label: {
          show: true,
          position: 'top',
          color: '#36452B',
          fontSize: 11,
          fontWeight: 'bold',
          formatter: (params: unknown) => {
            const p = params as { dataIndex: number }
            const meta = metaList[p.dataIndex]
            if (!meta) return ''
            return meta.kind === 'total' ? inr(meta.value) : signedInr(meta.value)
          },
        },
      },
    ],
  }
}
