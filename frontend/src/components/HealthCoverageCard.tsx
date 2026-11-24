import ReactECharts from 'echarts-for-react'
import { inr, signedInr } from '../format'
import type { CheckResult, Output } from '../types'

interface Props {
  check: CheckResult
  output: Output
}

export default function HealthCoverageCard({ check, output }: Props) {
  const coveragePct = Math.round(check.coverage * 1000) / 10
  const isFullCoverage = check.coverage >= 0.999

  // Cause-type breakdown for summary pills (from group edit categories)
  const typeSummary = check.groups.reduce(
    (acc, g) => {
      const attr = output.attribution.find((a) => a.group_id === g.group_id)
      const share = attr?.share ?? 0
      acc[g.type].count += 1
      acc[g.type].totalShare += share
      return acc
    },
    {
      data: { count: 0, totalShare: 0 },
      logic: { count: 0, totalShare: 0 },
      structural: { count: 0, totalShare: 0 },
    }
  )

  // Display verified and unverified deltas directly from the engine output (never sum shares)
  const verifiedDelta = output.delta_verified
  const unverifiedDelta = output.delta_unverified

  const unverifiedText = unverifiedDelta === null ? 'unknown' : signedInr(unverifiedDelta)

  const unverifiedAbs = unverifiedDelta !== null ? Math.abs(unverifiedDelta) : 0
  const totalObserved = Math.abs(verifiedDelta) + unverifiedAbs
  const verifiedRatio = totalObserved > 0 ? (Math.abs(verifiedDelta) / totalObserved) * 100 : 100
  const unverifiedRatio = totalObserved > 0 && unverifiedDelta !== null ? (unverifiedAbs / totalObserved) * 100 : 0

  // ECharts Ring Gauge for formula coverage strictly in 5-color Zen Bamboo palette
  const gaugeOption = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        radius: '90%',
        pointer: { show: false },
        progress: {
          show: true,
          overlap: false,
          roundCap: true,
          clip: false,
          itemStyle: {
            color: isFullCoverage ? '#8A9646' : '#EEDADA',
          },
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, 'rgba(215, 208, 197, 0.45)']],
          },
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        data: [{ value: coveragePct, name: 'Coverage' }],
        title: {
          fontSize: 10,
          fontWeight: 'bold',
          color: '#7F7D74',
          offsetCenter: ['0%', '24%'],
        },
        detail: {
          valueAnimation: true,
          fontSize: 22,
          fontWeight: '900',
          color: '#36452B',
          offsetCenter: ['0%', '-10%'],
          formatter: '{value}%',
        },
      },
    ],
  }

  return (
    <div className="glass-card flex flex-col justify-between p-6 shadow-sm border border-[#D7D0C5] bg-white/80">
      <div>
        {/* Header: Title + Full Pass / Alert Badge */}
        <div className="flex items-center justify-between border-b border-[#D7D0C5]/60 pb-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            Verification dossier
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
              isFullCoverage
                ? 'bg-[#8A9646]/20 text-[#36452B]'
                : 'bg-[#EEDADA] text-[#36452B]'
            }`}
          >
            {isFullCoverage ? 'Full pass' : 'Alert'}
          </span>
        </div>

        {/* Circular Gauge + 2x2 Metric Tiles */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="h-28 w-28 flex-shrink-0">
            <ReactECharts option={gaugeOption} style={{ height: '100%', width: '100%' }} />
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1 font-mono text-xs">
            <div className="rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-2">
              <span className="block text-[10px] text-[#7F7D74]">Formula cells</span>
              <strong className="text-[#36452B] text-sm">
                {check.verification.formula_cells.toLocaleString('en-IN')}
              </strong>
            </div>
            <div className="rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-2">
              <span className="block text-[10px] text-[#7F7D74]">Matched saved</span>
              <strong className="text-[#8A9646] text-sm">
                {check.verification.matched.toLocaleString('en-IN')}
              </strong>
            </div>
            <div className="rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-2">
              <span className="block text-[10px] text-[#7F7D74]">Mismatches</span>
              <strong className="text-[#36452B] text-sm">
                {check.verification.mismatched.length}
              </strong>
            </div>
            <div className="rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-2">
              <span className="block text-[10px] text-[#7F7D74]">Unverifiable</span>
              <strong className={check.unverifiable.length > 0 ? 'text-[#7F7D74] text-sm' : 'text-[#36452B] text-sm'}>
                {check.unverifiable.length}
              </strong>
            </div>
          </div>
        </div>

        {/* Formula coverage bar */}
        <div className="mt-4 space-y-1.5 border-t border-[#D7D0C5]/60 pt-3">
          <div className="flex justify-between font-mono text-[11px] font-semibold text-[#7F7D74]">
            <span>Formula coverage</span>
            <span className="text-[#36452B] font-bold">{coveragePct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#D7D0C5]/50">
            <div
              className="h-full bg-[#8A9646] rounded-full transition-all"
              style={{ width: `${Math.min(coveragePct, 100)}%` }}
            />
          </div>
        </div>

        {/* Verified vs Unverified Totals (Displaying engine numbers directly, never ₹0 for null) */}
        <div className="mt-4 space-y-1.5 border-t border-[#D7D0C5]/60 pt-3">
          <div className="flex justify-between font-mono text-[11px] font-bold">
            <span className="text-[#8A9646]">Verified: {signedInr(verifiedDelta)}</span>
            <span className={unverifiedDelta !== null && unverifiedDelta !== 0 ? 'text-[#36452B]' : 'text-[#7F7D74]'}>
              Unverified: {unverifiedText}
            </span>
          </div>

          <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-[#D7D0C5] bg-[#F8F7F4]">
            <div
              className="bg-[#8A9646] transition-all"
              style={{ width: `${verifiedRatio}%` }}
              title={`Verified: ${verifiedRatio.toFixed(1)}%`}
            />
            {unverifiedRatio > 0 && (
              <div
                className="bg-[#EEDADA] border-l border-[#D7D0C5] transition-all"
                style={{ width: `${unverifiedRatio}%` }}
                title={`Unverified: ${unverifiedRatio.toFixed(1)}%`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Change groups by type */}
      <div className="mt-4 space-y-1.5 border-t border-[#D7D0C5]/60 pt-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7F7D74]">
          Change groups by type
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-[#8A9646]/30 bg-[#8A9646]/10 p-1.5">
            <span className="block font-mono text-[9px] font-bold uppercase text-[#7F7D74]">
              Data ({typeSummary.data.count})
            </span>
            <span className="block text-xs font-black tabular-nums text-[#36452B]">
              {inr(typeSummary.data.totalShare)}
            </span>
          </div>

          <div className="rounded-lg border border-[#36452B]/30 bg-[#36452B]/10 p-1.5">
            <span className="block font-mono text-[9px] font-bold uppercase text-[#7F7D74]">
              Logic ({typeSummary.logic.count})
            </span>
            <span className="block text-xs font-black tabular-nums text-[#36452B]">
              {inr(typeSummary.logic.totalShare)}
            </span>
          </div>

          <div className="rounded-lg border border-[#D7D0C5] bg-[#D7D0C5]/20 p-1.5">
            <span className="block font-mono text-[9px] font-bold uppercase text-[#7F7D74]">
              Structural ({typeSummary.structural.count})
            </span>
            <span className="block text-xs font-black tabular-nums text-[#36452B]">
              {inr(typeSummary.structural.totalShare)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
