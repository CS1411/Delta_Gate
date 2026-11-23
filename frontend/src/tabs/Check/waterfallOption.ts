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

const GROUP_COLOR: Record<GroupType, string> = {
  data: '#0284c7',
  logic: '#7c3aed',
  structural: '#d97706',
}

function stepColor(meta: StepMeta, selected: boolean): string {
  if (meta.kind === 'total') return meta.label === 'Base' ? '#475569' : '#0f172a'
  if (meta.kind === 'unverified') return '#f59e0b'
  const base = meta.share !== undefined && meta.share < 0 ? '#059669' : GROUP_COLOR[meta.groupType ?? 'data']
  return selected ? '#0369a1' : base
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
  const extremes: number[] = [output.base, output.new]

  for (const a of causes) {
    const group = groupById.get(a.group_id)
    const start = a.share >= 0 ? running : running + a.share
    bases.push(start)
    heights.push(Math.abs(a.share))
    running += a.share
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
    grid: { left: 96, right: 28, top: 44, bottom: 56 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { dataIndex?: number } | undefined
        const meta = first?.dataIndex !== undefined ? metas[first.dataIndex] : undefined
        if (!meta) return ''
        if (meta.kind === 'total') return `<b>${meta.label}</b><br/>${inr(meta.value)}`
        if (meta.kind === 'unverified') return `<b>Unverified</b><br/>${signedInr(meta.value)} (never guessed)`
        return [
          `<b>${meta.label}</b> (${meta.groupType ?? 'change'})`,
          `Share: <b>${signedInr(meta.share ?? 0)}</b>`,
          `Solo: ${signedInr(meta.solo ?? 0)}`,
          `Interaction: ${signedInr(meta.interaction ?? 0)}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: metas.map((m) => m.label),
      axisLabel: {
        interval: 0,
        fontSize: 13,
        color: '#334155',
        formatter: (value: string) => (value.length > 26 ? `${value.slice(0, 24)}…` : value),
      },
    },
    yAxis: {
      type: 'value',
      min: axisMin,
      axisLabel: {
        fontSize: 13,
        color: '#475569',
        formatter: (value: number) => inr(value),
      },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
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
        barMaxWidth: 72,
        label: {
          show: true,
          position: 'top',
          fontSize: 14,
          fontWeight: 'bold',
          color: '#0f172a',
          formatter: ({ dataIndex }: { dataIndex: number }) => {
            const meta = metas[dataIndex]
            if (!meta) return ''
            return meta.kind === 'total' ? inr(meta.value) : signedInr(meta.value)
          },
        },
        data: heights.map((value, i) => {
          const meta = metas[i]
          const isSelected = Boolean(meta.groupId && meta.groupId === selectedGroupId)
          return {
            value,
            groupId: meta.groupId ?? null,
            itemStyle: {
              color: stepColor(meta, isSelected),
              borderRadius: [6, 6, 0, 0],
              borderColor: isSelected ? '#0f172a' : 'transparent',
              borderWidth: isSelected ? 3 : 0,
            },
          }
        }),
      },
    ],
  }
}
