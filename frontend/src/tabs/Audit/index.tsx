import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAudit, verifyAudit, type AuditVerdict } from '../../api'
import sample from '../../fixtures/audit.json'
import type { AuditCheckpoint, AuditEntry, AuditLog } from '../../types'
import Hash from './Hash'
import Payload from './Payload'

// Audit tab strictly formatted in 6-color Zen Bamboo palette.
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
  for (const checkpoint of log.checkpoints) if (!used.has(checkpoint)) out.push({ kind: 'checkpoint', checkpoint })
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
      const result = await verifyAudit()
      setVerdict({ state: 'done', ...result })
    } catch {
      setVerdict({ state: 'unreachable' })
    }
  }

  const list = useMemo(() => rows(log), [log])

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#36452B]">
            Audit Log <span className="text-sm font-sans font-normal text-[#7F7D74]">({log.entries.length} entries, {log.checkpoints.length} checkpoints)</span>
          </h2>
          <p className="text-xs text-[#7F7D74]">Tamper-evident Ed25519 signed chain with SHA-256 state hashes</p>
        </div>
        <button
          type="button"
          onClick={() => void verify()}
          disabled={verdict.state === 'busy'}
          className="ml-auto h-11 rounded-xl bg-[#36452B] px-6 text-sm font-semibold text-white hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646] disabled:opacity-50 transition"
        >
          {verdict.state === 'busy' ? 'Verifying…' : 'Verify Log Integrity'}
        </button>
      </div>

      {offline && (
        <p role="status" className="rounded-lg bg-[#D7D0C5]/40 border border-[#D7D0C5] px-4 py-2 text-xs font-mono text-[#7F7D74]">
          offline — showing sample data
        </p>
      )}

      <VerdictBanner verdict={verdict} />

      {loaded && list.length === 0 && <p className="text-base text-[#7F7D74]">The log is empty.</p>}

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
    return (
      <p role="alert" className="rounded-2xl bg-[#EEDADA]/60 border border-[#D7D0C5] px-6 py-4 text-base font-bold text-[#36452B]">
        Can't verify: the server is not reachable.
      </p>
    )
  }
  return verdict.ok ? (
    <div role="status" className="flex items-center gap-4 rounded-2xl border-2 border-[#8A9646] bg-[#8A9646]/10 px-6 py-5">
      <span className="text-4xl leading-none text-[#8A9646]" aria-hidden>✓</span>
      <div>
        <p className="text-lg font-serif font-bold text-[#36452B]">Chain Verified</p>
        <p className="text-xs font-mono text-[#7F7D74]">{verdict.entries} entries, {verdict.checkpoints} checkpoints matched</p>
      </div>
    </div>
  ) : (
    <div role="alert" className="flex items-center gap-4 rounded-2xl border-2 border-[#D7D0C5] bg-[#EEDADA] px-6 py-5">
      <span className="text-4xl leading-none text-[#36452B]" aria-hidden>⚠</span>
      <div>
        <p className="text-lg font-serif font-bold text-[#36452B]">Log does not verify</p>
        <p className="mt-1 text-xs font-mono text-[#7F7D74]">{verdict.error ?? 'No reason given'}</p>
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="rounded-xl border border-[#D7D0C5] bg-white px-5 py-4 shadow-sm space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-sm font-bold text-[#36452B]">#{entry.seq}</span>
        <span className="text-sm font-serif font-semibold text-[#36452B]">{entry.action}</span>
        <span className="text-xs text-[#7F7D74]">by {entry.actor}</span>
        <time dateTime={entry.ts} className="ml-auto font-mono text-xs text-[#7F7D74]">{clock(entry.ts)}</time>
      </div>
      <div className="flex flex-wrap gap-x-6 text-xs border-t border-[#D7D0C5]/40 pt-2">
        <Hash value={entry.prev_hash} label="prev" />
        <Hash value={entry.hash} label="hash" />
      </div>
      {Object.keys(entry.payload).length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-mono text-[#7F7D74] hover:text-[#36452B]">Payload details</summary>
          <div className="mt-2 p-2 rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60"><Payload payload={entry.payload} /></div>
        </details>
      )}
    </li>
  )
}

function CheckpointRow({ checkpoint }: { checkpoint: AuditCheckpoint }) {
  return (
    <li className="rounded-xl border border-[#8A9646]/60 bg-[#8A9646]/10 px-5 py-3 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm font-serif font-bold text-[#36452B]">🔏 Signed checkpoint at #{checkpoint.seq}</span>
        <time dateTime={checkpoint.ts} className="ml-auto font-mono text-xs text-[#7F7D74]">{clock(checkpoint.ts)}</time>
      </div>
      <div className="flex flex-wrap gap-x-6 text-xs">
        <Hash value={checkpoint.head_hash} label="head" />
        <Hash value={checkpoint.signature} label="Ed25519 signature" />
      </div>
    </li>
  )
}
