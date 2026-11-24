import { inr, signedInr } from '../../format'
import Hash from './Hash'

const SIGNED_RUPEES = new Set(['delta'])
const RUPEES = new Set([
  'session_drift',
  'drift',
  'impact',
  'base',
  'new',
  'delta_observed',
  'delta_verified',
  'delta_unverified',
  'solo',
  'share',
  'interaction',
])
const HEX = /^(?:[0-9a-f]{64}|[0-9a-f]{128})$/

function Scalar({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-[#36452B]/60">unknown</span>
  }
  if (typeof value === 'number') {
    if (SIGNED_RUPEES.has(name)) return <strong className="font-mono font-semibold tabular-nums">{signedInr(value)}</strong>
    if (RUPEES.has(name)) return <strong className="font-mono font-semibold tabular-nums">{inr(value)}</strong>
    return <span className="font-mono tabular-nums">{value}</span>
  }
  if (typeof value === 'string' && HEX.test(value)) return <Hash value={value} />
  if (typeof value === 'boolean') return <span>{value ? 'yes' : 'no'}</span>
  return <span className="break-words">{String(value)}</span>
}

const isNested = (v: unknown) => typeof v === 'object' && v !== null

function Fields({ data }: { data: Record<string, unknown> | unknown[] }) {
  const rows = Array.isArray(data)
    ? data.map((v, i) => [String(i + 1), v] as const)
    : Object.entries(data)
  if (rows.length === 0) return <span className="text-[#36452B]/60">none</span>

  return (
    <dl className="space-y-1">
      {rows.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-x-2.5 text-sm">
          <dt className="font-mono text-xs font-medium text-[#36452B]/70">{key}</dt>
          <dd className="min-w-0 text-[#36452B]">
            {isNested(value) ? (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-[#36452B]/75 hover:text-[#36452B]">
                  {Array.isArray(value) ? `${value.length} item(s)` : 'details'}
                </summary>
                <div className="ml-2 mt-1 border-l border-[#D7D0C5] pl-3">
                  <Fields data={value as Record<string, unknown>} />
                </div>
              </details>
            ) : (
              <Scalar name={key} value={value} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Payload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-[#D7D0C5] bg-[#F8F7F4] p-3 text-sm">
      <Fields data={payload} />
    </div>
  )
}
