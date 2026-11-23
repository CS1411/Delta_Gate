import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAudit, verifyAudit, type AuditVerdict } from '../../api'
import sample from '../../fixtures/audit.json'
import type { AuditCheckpoint, AuditEntry, AuditLog } from '../../types'
import Hash from './Hash'
import Payload from './Payload'

// Audit tab: the log in seq order with each signed checkpoint right after the entry it covers, and a Verify
// button. Polls every 2 s like the inbox; if the API cannot be reached it shows the sample log and says so.
const POLL_MS = 2000
const SAMPLE = sample as AuditLog

type Row = { kind: 'entry'; entry: AuditEntry } | { kind: 'checkpoint'; checkpoint: AuditCheckpoint }

function rows(log: AuditLog): Row[] {
  const out: Row[] = []
  const used = new Set<AuditCheckpoint>()
  for (const entry of log.entries) {
    out.push({ kind: 'entry', entry })
    for (const checkpoint of log.checkpoints) {
      if (checkpoint.seq === entry.seq) { out.push({ kind: 'checkpoint', checkpoint }); used.add(checkpoint) }
    }
  }
  for (const checkpoint of log.checkpoints) if (!used.has(checkpoint)) out.push({ kind: 'checkpoint', checkpoint }) // covers an entry that is gone
  return out
}

const clock = (ts: string) => `${ts.slice(0, 10)} ${ts.slice(11, 19)} UTC`

type Verdict = { state: 'idle' } | { state: 'busy' } | { state: 'unreachable' } | ({ state: 'done' } & AuditVerdict)

export default function Audit() {
  const [log, setLog] = useState<AuditLog>({ entries: [], checkpoints: [] })
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>({ state: 'idle' })

  const poll = useCallback(async () => {
    try {
      setLog(await fetchAudit())
      setOffline(false)
    } catch {
      setLog(SAMPLE)
      setOffline(true)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => clearInterval(timer)
  }, [poll])

  const verify = async () => {
    setVerdict({ state: 'busy' })
    try {
      const result = await verifyAudit() // a tampered log is still a 200: the answer is in `ok`
      setVerdict({ state: 'done', ...result })
    } catch {
      setVerdict({ state: 'unreachable' })
    }
  }

  const list = useMemo(() => rows(log), [log])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-3xl font-bold">Audit log <span className="text-slate-500">({log.entries.length} entries, {log.checkpoints.length} checkpoints)</span></h2>
        <button type="button" onClick={() => void verify()} disabled={verdict.state === 'busy'}
          className="ml-auto h-14 rounded-xl bg-slate-900 px-8 text-xl font-semibold text-white hover:bg-slate-700 focus-visible:outline-4 focus-visible:outline-slate-400 disabled:opacity-50">
          {verdict.state === 'busy' ? 'Verifying…' : 'Verify log'}
        </button>
      </div>

      {offline && (
        <p role="status" className="rounded-lg bg-slate-200 px-4 py-2 text-base text-slate-700">offline — showing sample data</p>
      )}

      <VerdictBanner verdict={verdict} />

      {loaded && list.length === 0 && <p className="text-xl text-slate-600">The log is empty.</p>}

      <ol className="space-y-3">
        {list.map((row) => row.kind === 'entry'
          ? <EntryRow key={`e${row.entry.seq}`} entry={row.entry} />
          : <CheckpointRow key={`c${row.checkpoint.seq}`} checkpoint={row.checkpoint} />)}
      </ol>
    </div>
  )
}

function VerdictBanner({ verdict }: { verdict: Verdict }) {
  if (verdict.state === 'idle' || verdict.state === 'busy') return null
  if (verdict.state === 'unreachable') {
    return <p role="alert" className="rounded-2xl bg-slate-200 px-8 py-6 text-3xl font-bold text-slate-700">Can't verify: the server is not reachable.</p>
  }
  return verdict.ok ? (
    <div role="status" className="flex items-center gap-6 rounded-2xl border-4 border-emerald-600 bg-emerald-50 px-8 py-8">
      <span className="text-8xl leading-none" aria-hidden>✅</span>
      <p className="text-5xl font-bold text-emerald-800">Chain verified: {verdict.entries} entries, {verdict.checkpoints} checkpoints</p>
    </div>
  ) : (
    <div role="alert" className="flex items-center gap-6 rounded-2xl border-4 border-red-600 bg-red-50 px-8 py-8">
      <span className="text-8xl leading-none" aria-hidden>❌</span>
      <div>
        <p className="text-5xl font-bold text-red-800">Log does not verify</p>
        <p className="mt-2 text-4xl font-semibold text-red-700">{verdict.error ?? 'No reason given'}</p>
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xl font-bold">#{entry.seq}</span>
        <span className="text-lg font-semibold">{entry.action}</span>
        <span className="text-lg text-slate-600">by {entry.actor}</span>
        <time dateTime={entry.ts} className="ml-auto text-base text-slate-500">{clock(entry.ts)}</time>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 text-sm">
        <Hash value={entry.prev_hash} label="prev" />
        <Hash value={entry.hash} label="hash" />
      </div>
      {Object.keys(entry.payload).length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-base text-slate-600">Payload</summary>
          <div className="mt-2"><Payload payload={entry.payload} /></div>
        </details>
      )}
    </li>
  )
}

function CheckpointRow({ checkpoint }: { checkpoint: AuditCheckpoint }) {
  return (
    <li className="rounded-xl border-2 border-indigo-400 bg-indigo-50 px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-bold text-indigo-900">🔏 Signed checkpoint at #{checkpoint.seq}</span>
        <time dateTime={checkpoint.ts} className="ml-auto text-base text-indigo-800">{clock(checkpoint.ts)}</time>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-6 text-sm">
        <Hash value={checkpoint.head_hash} label="head" />
        <Hash value={checkpoint.signature} label="Ed25519 signature" />
      </div>
    </li>
  )
}
