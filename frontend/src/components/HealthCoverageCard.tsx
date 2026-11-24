import { signedInr } from '../format'
import type { CheckResult, Output } from '../types'

interface Props {
  check: CheckResult
  output: Output
}

export default function HealthCoverageCard({ check, output }: Props) {
  const coveragePct = Math.round(check.coverage * 1000) / 10
  const isFullCoverage = check.coverage >= 0.999

  const countOf = (type: 'data' | 'logic' | 'structural') =>
    check.groups.filter((g) => g.type === type).length

  // Display verified and unverified deltas directly from the engine output (never sum shares)
  const verifiedDelta = output.delta_verified
  const unverifiedDelta = output.delta_unverified
  const unverifiedText = unverifiedDelta === null ? 'unknown' : signedInr(unverifiedDelta)

  const unverifiedAbs = unverifiedDelta !== null ? Math.abs(unverifiedDelta) : 0
  const totalMagnitude = Math.abs(verifiedDelta) + unverifiedAbs
  const verifiedRatio = totalMagnitude > 0 ? (Math.abs(verifiedDelta) / totalMagnitude) * 100 : 100
  const unverifiedRatio = totalMagnitude > 0 ? (unverifiedAbs / totalMagnitude) * 100 : 0

  return (
    <aside aria-label="Verification coverage dossier" className="ledger-card flex flex-col justify-between p-5">
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-[#D7D0C5] pb-3">
          <h3 className="text-sm font-semibold text-[#36452B]">Verification dossier</h3>
          <span
            className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${
              isFullCoverage
                ? 'bg-[#8A9646]/15 text-[#36452B]'
                : 'border border-[#A44A3F]/25 bg-[#EEDADA]/70 text-[#A44A3F]'
            }`}
          >
            {isFullCoverage ? 'Full pass' : 'Partial'}
          </span>
        </div>

        {/* Coverage Bar */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-[#36452B]/75">Formula coverage</span>
            <span className="font-mono text-2xl font-bold tabular-nums text-[#36452B]">
              {coveragePct}%
            </span>
          </div>
          <div
            key={`${check.check_id}:${output.cell}:cov`}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#F0EDE6]"
            role="progressbar"
            aria-valuenow={coveragePct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Formula verification coverage"
          >
            <div
              className={`animate-dg-bar h-full ${isFullCoverage ? 'bg-[#8A9646]' : 'bg-[#A44A3F]'}`}
              style={{ width: `${Math.min(100, Math.max(0, coveragePct))}%` }}
            />
          </div>
        </div>

        {/* 2x2 Hairline Metric Grid */}
        <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-md border border-[#D7D0C5] bg-[#F8F7F4]">
          <div className="border-b border-r border-[#D7D0C5] px-3 py-2.5">
            <dt className="text-xs text-[#36452B]/75">Formula cells</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#36452B]">
              {check.verification.formula_cells.toLocaleString('en-IN')}
            </dd>
          </div>
          <div className="border-b border-[#D7D0C5] px-3 py-2.5">
            <dt className="text-xs text-[#36452B]/75">Matched saved</dt>
            <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#36452B]">
              {check.verification.matched.toLocaleString('en-IN')}
            </dd>
          </div>
          <div className="border-r border-[#D7D0C5] px-3 py-2.5">
            <dt className="text-xs text-[#36452B]/75">Mismatches</dt>
            <dd
              className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                check.verification.mismatched.length > 0 ? 'text-[#A44A3F]' : 'text-[#36452B]'
              }`}
            >
              {check.verification.mismatched.length}
            </dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-xs text-[#36452B]/75">Unverifiable</dt>
            <dd
              className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                check.unverifiable.length > 0 ? 'text-[#A44A3F]' : 'text-[#36452B]'
              }`}
            >
              {check.unverifiable.length}
            </dd>
          </div>
        </dl>

        {/* Verified vs Unverified Split */}
        <div className="mt-4 space-y-1.5 border-t border-[#D7D0C5] pt-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#36452B]">
              Verified <span className="font-mono font-semibold tabular-nums">{signedInr(verifiedDelta)}</span>
            </span>
            <span
              className={`font-medium ${
                unverifiedDelta !== null && unverifiedDelta !== 0 ? 'text-[#A44A3F]' : 'text-[#36452B]/75'
              }`}
            >
              Unverified <span className="font-mono font-semibold tabular-nums">{unverifiedText}</span>
            </span>
          </div>

          {unverifiedDelta !== null && (
            <div
              key={`${check.check_id}:${output.cell}:split`}
              className="flex h-2 w-full overflow-hidden rounded-full bg-[#F0EDE6]"
              aria-hidden="true"
            >
              <div className="animate-dg-bar bg-[#8A9646]" style={{ width: `${verifiedRatio}%` }} />
              {unverifiedRatio > 0 && (
                <div className="animate-dg-bar bg-[#A44A3F]" style={{ width: `${unverifiedRatio}%` }} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Change Groups Count by Type */}
      <div className="mt-4 border-t border-[#D7D0C5] pt-4">
        <p className="text-xs font-medium text-[#36452B]/75">Change groups by type</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-[#D7D0C5] bg-[#8A9646]/10 px-2 py-1.5">
            <span className="block text-[11px] font-medium text-[#36452B]/75">Data</span>
            <span className="block font-mono text-sm font-bold tabular-nums text-[#36452B]">
              {countOf('data')}
            </span>
          </div>
          <div className="rounded-md border border-[#D7D0C5] bg-[#F0EDE6] px-2 py-1.5">
            <span className="block text-[11px] font-medium text-[#36452B]/75">Logic</span>
            <span className="block font-mono text-sm font-bold tabular-nums text-[#36452B]">
              {countOf('logic')}
            </span>
          </div>
          <div className="rounded-md border border-[#D7D0C5] bg-[#EEDADA]/55 px-2 py-1.5">
            <span className="block text-[11px] font-medium text-[#36452B]/75">Structural</span>
            <span className="block font-mono text-sm font-bold tabular-nums text-[#36452B]">
              {countOf('structural')}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
