import { signedInr } from '../../format'
import type { Group, GroupType, Output } from '../../types'

interface Row {
  kind: 'total' | 'group' | 'unverified'
  label: string
  value: number
  groupId?: string
  groupType?: GroupType
  solo?: number
  share?: number
  interaction?: number
}

// "What moved this output", one horizontal bar per cause, every bar starting at ₹0, so nothing floats:
// - Mossy Rock Green #8A9646: a cause that raised the output; Terracotta Crimson #A44A3F: one that lowered it
// - Cherry Blossom Pink #EEDADA: the part the engine can't verify (never attributed, never guessed)
// - Deep Bamboo Green #36452B: the total change, straight from the engine (delta_observed), never summed here

function rowColor(row: Row, selected: boolean): string {
  if (row.kind === 'total') return '#36452B'
  if (row.kind === 'unverified') return '#EEDADA'
  if (selected) return '#36452B'
  return row.value < 0 ? '#A44A3F' : '#8A9646'
}

/** ECharts option for one watched output's change by cause, or null when there is nothing to draw. */
export function buildWaterfallOption(output: Output, groups: Group[], selectedGroupId: string | null = null) {
  if (output.base === null || output.new === null) return null

  const groupById = new Map(groups.map((g) => [g.group_id, g]))
  // Zero-share groups stay out of the chart (they remain listed in GroupsTable).
  const rows: Row[] = output.attribution
    .filter((a) => a.share !== 0)
    .map((a) => {
      const group = groupById.get(a.group_id)
      return {
        kind: 'group',
        label: group?.label ?? a.group_id,
        value: a.share,
        groupId: a.group_id,
        groupType: group?.type,
        solo: a.solo,
        share: a.share,
        interaction: a.interaction,
      }
    })
  if (output.delta_unverified !== null && output.delta_unverified !== 0) {
    rows.push({ kind: 'unverified', label: "Can't verify", value: output.delta_unverified })
  }
  if (output.delta_observed !== null) {
    rows.push({ kind: 'total', label: 'Total change', value: output.delta_observed })
  }
  if (rows.length === 0) return null

  const ordered = [...rows].reverse() // ECharts draws the first category at the bottom; causes read top-down

  return {
    backgroundColor: 'transparent',
    grid: { left: 16, right: 96, top: 16, bottom: 32, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#D7D0C5',
      borderWidth: 1,
      textStyle: { color: '#36452B', fontSize: 14, fontFamily: 'inherit' },
      formatter: ({ dataIndex }: { dataIndex: number }) => {
        const row = ordered[dataIndex]
        if (!row) return ''
        if (row.kind === 'total') {
          return `<div style="font-weight:bold">Total change</div><div style="font-size:16px;font-weight:bold;margin-top:2px">${signedInr(row.value)}</div>`
        }
        if (row.kind === 'unverified') {
          return `<div style="font-weight:bold;color:#A44A3F">Can't verify</div><div style="font-size:16px;font-weight:bold;margin-top:2px">${signedInr(row.value)}</div><div style="color:#7F7D74;font-size:12px;margin-top:2px">Excluded from attribution (never guessed)</div>`
        }
        return [
          `<div style="font-weight:bold">${row.label} <span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#D7D0C5;text-transform:uppercase">${row.groupType ?? 'change'}</span></div>`,
          `<div style="font-size:15px;margin-top:4px">Share: <b>${signedInr(row.share ?? 0)}</b></div>`,
          `<div style="color:#7F7D74;font-size:13px">On its own: ${signedInr(row.solo ?? 0)} · Interaction: ${signedInr(row.interaction ?? 0)}</div>`,
        ].join('')
      },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false }, // each bar carries its own ₹ label; tick labels only crowd it
      splitLine: { lineStyle: { color: '#D7D0C5', opacity: 0.5, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: ordered.map((r) => r.label),
      axisLine: { lineStyle: { color: '#36452B', width: 1.5 } },
      axisTick: { show: false },
      axisLabel: { fontSize: 14, fontWeight: '600', color: '#36452B', width: 220, overflow: 'break', lineHeight: 18 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 40,
        label: {
          show: true,
          position: 'right',
          fontSize: 15,
          fontWeight: 'bold',
          color: '#36452B',
          formatter: ({ dataIndex }: { dataIndex: number }) => signedInr(ordered[dataIndex]?.value ?? 0),
        },
        data: ordered.map((row) => {
          const selected = Boolean(row.groupId && row.groupId === selectedGroupId)
          return {
            value: row.value,
            groupId: row.groupId ?? null,
            itemStyle: {
              color: rowColor(row, selected),
              borderRadius: row.value < 0 ? [6, 0, 0, 6] : [0, 6, 6, 0],
              borderColor: row.kind === 'unverified' ? '#A44A3F' : 'transparent',
              borderWidth: row.kind === 'unverified' ? 1.5 : 0,
            },
          }
        }),
      },
    ],
  }
}
