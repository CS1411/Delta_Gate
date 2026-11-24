import ReactECharts from 'echarts-for-react'
import { signedInr } from '../format'
import type { CheckResult, Output } from '../types'

interface Props {
  check: CheckResult
  output: Output
}

export default function HealthCoverageCard({ check, output }: Props) {
  const coveragePct = Math.round(check.coverage * 1000) / 10
  const isFullCoverage = check.coverage >= 0.999

  // Group counts per type only. The ₹ per cause is in the headline, waterfall and table, straight from the
  // engine: the UI never adds shares up into totals of its own.
  const countOf = (type: 'data' | 'logic' | 'structural') => check.groups.filter((g) => g.type === type).length

  // Display verified and unverified deltas directly from the engine output (never sum shares)
  const verifiedDelta = output.delta_verified
  const unverifiedDelta = output.delta_unverified

  const unverifiedText = unverifiedDelta === null ? 'unknown' : signedInr(unverifiedDelta)

  const unverifiedAbs = unverifiedDelta !== null ? Math.abs(unverifiedDelta) : 0
  const totalObserved = Math.abs(verifiedDelta) + unverifiedAbs
  const verifiedRatio = totalObserved > 0 ? (Math.abs(verifiedDelta) / totalObserved) * 100 : 100
  const unverifiedRatio = totalObserved > 0 ? (unverifiedAbs / totalObserved) * 100 : 0

  // ECharts Ring Gauge for formula coverage
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
            color: isFullCoverage ? '#8A9646' : '#A44A3F',
          },
        },
        axisLine: {
          lineStyle: {
            width: 14,
            color: [[1, 'rgba(215, 208, 197, 0.4)']],
          },
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        data: [{ value: coveragePct, name: 'Coverage' }],
        title: {
          fontSize: 11,
          fontWeight: 'bold',
          color: '#7F7D74',
          offsetCenter: ['0%', '24%'],
        },
        detail: {
          valueAnimation: true,
          fontSize: 26,
          fontWeight: '900',
          color: '#36452B',
          offsetCenter: ['0%', '-10%'],
          formatter: '{value}%',
        },
      },
    ],
  }

  return (
    <div className="glass-card flex flex-col justify-between p-6 shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#D7D0C5]/60 pb-3">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#7F7D74]">
            AUDIT HEALTH &amp; COVERAGE
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
              isFullCoverage
                ? 'bg-[#8A9646]/20 text-[#36452B]'
                : 'bg-[#EEDADA] text-red-950'
            }`}
          >
            {isFullCoverage ? 'Full Pass' : 'Partial'}
          </span>
        </div>

        {/* Top: Circular Gauge + Match Metrics */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="h-36 w-36 flex-shrink-0">
            <ReactECharts option={gaugeOption} style={{ height: '100%', width: '100%' }} />
          </div>

          <div className="space-y-1.5 text-right font-mono text-xs">
            <div>
              <span className="text-[#7F7D74]">Formula Cells: </span>
              <strong className="text-[#36452B]">
                {check.verification.formula_cells.toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span className="text-[#7F7D74]">Matched Saved: </span>
              <strong className="text-[#8A9646]">
                {check.verification.matched.toLocaleString('en-IN')}
              </strong>
            </div>
            <div>
              <span className="text-[#7F7D74]">Mismatches: </span>
              <strong className={check.verification.mismatched.length > 0 ? 'text-red-700' : 'text-[#36452B]'}>
                {check.verification.mismatched.length}
              </strong>
            </div>
            <div>
              <span className="text-[#7F7D74]">Unverifiable: </span>
              <strong className={check.unverifiable.length > 0 ? 'text-[#A44A3F]' : 'text-[#36452B]'}>
                {check.unverifiable.length}
              </strong>
            </div>
          </div>
        </div>

        {/* Middle: Stacked Horizontal Bar (Verified vs Unverified Δ) */}
        <div className="mt-5 space-y-1.5 border-t border-[#D7D0C5]/60 pt-4">
          <div className="flex justify-between font-mono text-[11px] font-bold">
            <span className="text-[#8A9646]">Verified: {signedInr(verifiedDelta)}</span>
            <span className={unverifiedDelta !== null && unverifiedDelta !== 0 ? 'text-[#A44A3F]' : 'text-[#7F7D74]'}>
              Unverified: {unverifiedText}
            </span>
          </div>

          {unverifiedDelta !== null && (
            <div className="flex h-3 w-full overflow-hidden rounded-full border border-[#D7D0C5] bg-[#F8F7F4]" aria-hidden>
              <div className="bg-[#8A9646] transition-all" style={{ width: `${verifiedRatio}%` }} />
              {unverifiedRatio > 0 && (
                <div className="bg-[#EEDADA] border-l border-red-300 transition-all" style={{ width: `${unverifiedRatio}%` }} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Cause-Type Summary Pills */}
      <div className="mt-5 space-y-2 border-t border-[#D7D0C5]/60 pt-4">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7F7D74]">
          Change groups by type
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-[#8A9646]/30 bg-[#8A9646]/10 p-2">
            <span className="block font-mono text-[10px] font-bold uppercase text-[#7F7D74]">
              Data
            </span>
            <span className="block text-sm font-black tabular-nums text-[#36452B]">
              {countOf('data')}
            </span>
          </div>

          <div className="rounded-xl border border-[#36452B]/20 bg-[#36452B]/5 p-2">
            <span className="block font-mono text-[10px] font-bold uppercase text-[#7F7D74]">
              Logic
            </span>
            <span className="block text-sm font-black tabular-nums text-[#36452B]">
              {countOf('logic')}
            </span>
          </div>

          <div className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA]/50 p-2">
            <span className="block font-mono text-[10px] font-bold uppercase text-[#7F7D74]">
              Struct
            </span>
            <span className="block text-sm font-black tabular-nums text-[#36452B]">
              {countOf('structural')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
