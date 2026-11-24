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

// Visual Design System palette for Waterfall chart:
// - Deep Bamboo Green #36452B: Total waterfall bars (Base, New)
// - Mossy Rock Green #8A9646: Positive attribution bars
// - Terracotta Crimson #A44A3F: Negative attribution bars
// - Cherry Blossom Pink #EEDADA: Unverified bars
// - Weathered Wood Grey #7F7D74: Muted axis labels & captions
// - Zen Sand Beige #D7D0C5: Dividers and subtle grid lines

function stepColor(meta: StepMeta, selected: boolean): string {
  if (meta.kind === 'total') {
    // Both Base and New total bars use Deep Bamboo Green
    return '#36452B'
  }
  if (meta.kind === 'unverified') {
    return '#EEDADA'
  }
  if (meta.share !== undefined && meta.share < 0) {
    return '#A44A3F'
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

  const metas: StepMeta[] = [{ kind: 'total', label: 'Base', value: output.base }]
  const bases: number[] = [0]
  const heights: number[] = [Math.abs(output.base)]

  let running = output.base
  const levels: number[] = [output.base] // where each bar ends; a thin line carries it to the next bar
  const extremes: number[] = [output.base, output.new]

  for (const a of causes) {
    const group = groupById.get(a.group_id)
    const start = a.share >= 0 ? running : running + a.share
    bases.push(start)
    heights.push(Math.abs(a.share))
    running += a.share
    levels.push(running)
    extremes.push(running)
    metas.push({
      kind: 'group',
      label: group?.label ?? a.group_id,
      value: a.share,
      groupId: a.group_id,
      groupType: group?.type,
      solo: a.solo,
      share: a.share,
      interaction: a.interaction,
    })
  }

  if (hasUnverified) {
    const unv = output.delta_unverified!
    const start = unv >= 0 ? running : running + unv
    bases.push(start)
    heights.push(Math.abs(unv))
    running += unv
    levels.push(running)
    extremes.push(running)
    metas.push({ kind: 'unverified', label: 'Unverified', value: unv })
  }

  bases.push(0)
  heights.push(Math.abs(output.new))
  metas.push({ kind: 'total', label: 'New', value: output.new })

  const minVal = Math.min(...extremes)
  const maxVal = Math.max(...extremes)
  const span = maxVal - minVal
  const pad = span > 0 ? span * 0.5 : Math.max(1000, Math.abs(minVal) * 0.1)
  const axisMin = minVal > 0 && minVal > pad ? Math.max(0, Math.floor((minVal - pad) / 1000) * 1000) : undefined

  return {
    backgroundColor: 'transparent',
    grid: { left: 104, right: 32, top: 48, bottom: 88 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#D7D0C5',
      borderWidth: 1,
      textStyle: { color: '#36452B', fontSize: 14, fontFamily: 'inherit' },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { dataIndex?: number } | undefined
        const meta = first?.dataIndex !== undefined ? metas[first.dataIndex] : undefined
        if (!meta) return ''
        if (meta.kind === 'total') {
          return `<div style="font-weight:bold;color:#36452B">${meta.label} Total</div><div style="font-size:16px;font-weight:bold;margin-top:2px;">${inr(meta.value)}</div>`
        }
        if (meta.kind === 'unverified') {
          return `<div style="font-weight:bold;color:#A44A3F">Unverified Delta</div><div style="font-size:16px;font-weight:bold;margin-top:2px;">${signedInr(meta.value)}</div><div style="color:#7F7D74;font-size:12px;margin-top:2px">Excluded from attribution (never guessed)</div>`
        }
        return [
          `<div style="font-weight:bold;color:#36452B">${meta.label} <span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#D7D0C5;color:#36452B;text-transform:uppercase">${meta.groupType ?? 'change'}</span></div>`,
          `<div style="font-size:15px;margin-top:4px;">Shapley Share: <b>${signedInr(meta.share ?? 0)}</b></div>`,
          `<div style="color:#7F7D74;font-size:13px;">Solo Effect: ${signedInr(meta.solo ?? 0)}</div>`,
          `<div style="color:#7F7D74;font-size:13px;">Synergy / Interaction: ${signedInr(meta.interaction ?? 0)}</div>`,
        ].join('')
      },
    },
    xAxis: {
      type: 'category',
      data: metas.map((m) => m.label),
      axisLine: { lineStyle: { color: '#D7D0C5' } },
      axisTick: { show: false },
      axisLabel: {
        interval: 0,
        fontSize: 13,
        fontWeight: '500',
        color: '#7F7D74',
        margin: 12,
        width: 120,
        overflow: 'break',
        lineHeight: 16,
        formatter: (value: string) => (value.length > 40 ? `${value.slice(0, 38)}…` : value),
      },
    },
    yAxis: {
      type: 'value',
      min: axisMin,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        showMinLabel: false, // the cut-off floor (e.g. ₹2,65,000) crowds the first round tick
        fontSize: 13,
        fontWeight: 'bold',
        color: '#7F7D74',
        formatter: (value: number) => inr(value),
      },
      splitLine: {
        lineStyle: {
          color: '#D7D0C5',
          opacity: 0.5,
          type: 'dashed',
        },
      },
    },
    series: [
      {
        name: 'BaseOffset',
        type: 'bar',
        stack: 'wf',
        silent: true,
        itemStyle: { borderColor: 'transparent', color: 'transparent' },
        emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
        data: bases,
      },
      {
        name: 'Amount',
        type: 'bar',
        stack: 'wf',
        barMaxWidth: 76,
        // Connector from the top (or bottom) where each bar ends to the next bar, so the bars read as steps.
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: '#7F7D74', type: 'dashed', width: 1.5, opacity: 0.7 },
          data: levels.map((level, i) => [{ coord: [i, level] }, { coord: [i + 1, level] }]),
        },
        label: {
          show: true,
          position: 'top',
          fontSize: 14,
          fontWeight: 'bold',
          color: '#36452B',
          distance: 6,
          formatter: ({ dataIndex }: { dataIndex: number }) => {
            const meta = metas[dataIndex]
            if (!meta) return ''
            return meta.kind === 'total' ? inr(meta.value) : signedInr(meta.value)
          },
        },
        data: heights.map((value, i) => {
          const meta = metas[i]
          const isSelected = Boolean(meta.groupId && meta.groupId === selectedGroupId)
          const barColor = stepColor(meta, isSelected)
          const isUnverified = meta.kind === 'unverified'
          return {
            value,
            groupId: meta.groupId ?? null,
            itemStyle: {
              color: barColor,
              borderRadius: [6, 6, 0, 0],
              borderColor: isSelected
                ? '#36452B'
                : isUnverified
                ? '#A44A3F'
                : 'transparent',
              borderWidth: isSelected ? 3 : isUnverified ? 1.5 : 0,
            },
          }
        }),
      },
    ],
  }
}
