import { inr, signedInr } from '../../format'
import Hash from './Hash'

// Generic renderer for an audit entry's free-form payload: no per-action cases. Nested objects and arrays open
// with <details>; null is "unknown", never 0; a hex string is a hash; a few keys are known to be rupee amounts.
const SIGNED_RUPEES = new Set(['delta'])
const RUPEES = new Set(['session_drift', 'drift', 'impact', 'base', 'new', 'delta_observed', 'delta_verified', 'delta_unverified', 'solo', 'share', 'interaction'])
const HEX = /^(?:[0-9a-f]{64}|[0-9a-f]{128})$/

function Scalar({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-500 italic">unknown</span>
  if (typeof value === 'number') {
    if (SIGNED_RUPEES.has(name)) return <b className="tabular-nums">{signedInr(value)}</b>
    if (RUPEES.has(name)) return <b className="tabular-nums">{inr(value)}</b>
    return <span className="tabular-nums">{value}</span>
  }
  if (typeof value === 'string' && HEX.test(value)) return <Hash value={value} />
  if (typeof value === 'boolean') return <span>{value ? 'yes' : 'no'}</span>
  return <span className="break-words">{String(value)}</span>
}

const isNested = (v: unknown) => typeof v === 'object' && v !== null

function Fields({ data }: { data: Record<string, unknown> | unknown[] }) {
  const rows = Array.isArray(data) ? data.map((v, i) => [String(i + 1), v] as const) : Object.entries(data)
  if (rows.length === 0) return <span className="text-slate-500">none</span>
  return (
    <dl className="space-y-1">
      {rows.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-x-2">
          <dt className="text-slate-500">{key}</dt>
          <dd className="min-w-0">
            {isNested(value)
              ? <details><summary className="cursor-pointer text-slate-600">{Array.isArray(value) ? `${value.length} item(s)` : 'details'}</summary>
                  <div className="ml-3 mt-1 border-l-2 border-slate-200 pl-3"><Fields data={value as Record<string, unknown>} /></div></details>
              : <Scalar name={key} value={value} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Payload({ payload }: { payload: Record<string, unknown> }) {
  return <div className="text-base"><Fields data={payload} /></div>
}
