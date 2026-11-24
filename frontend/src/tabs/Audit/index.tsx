import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAudit, verifyAudit, type AuditVerdict } from '../../api'
import { IconSeal, IconShieldAlert, IconShieldCheck } from '../../components/Icons'
import sample from '../../fixtures/audit.json'
import type { AuditCheckpoint, AuditEntry, AuditLog } from '../../types'
import Hash from './Hash'
import Payload from './Payload'

const POLL_MS = 2000
const SAMPLE = sample as AuditLog

type Row = { kind: 'entry'; entry: AuditEntry } | { kind: 'checkpoint'; checkpoint: AuditCheckpoint }

function rows(log: AuditLog): Row[] {
  const out: Row[] = []
  const used = new Set<AuditCheckpoint>()
  for (const entry of log.entries) {
    out.push({ kind: 'entry', entry })
    for (const checkpoint of log.checkpoints) {
      if (checkpoint.seq === entry.seq) {
        out.push({ kind: 'checkpoint', checkpoint })
        used.add(checkpoint)
      }
    }
  }
  for (const checkpoint of log.checkpoints) {
    if (!used.has(checkpoint)) out.push({ kind: 'checkpoint', checkpoint })
  }
  return out
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-xl font-bold text-[#36452B]">Audit log</h2>
          <span className="rounded bg-[#F0EDE6] px-2 py-0.5 font-mono text-xs font-medium text-[#36452B]">
            {count(log.entries.length, 'entry', 'entries')} · {count(log.checkpoints.length, 'checkpoint', 'checkpoints')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void verify()}
          disabled={verdict.state === 'busy'}
          className="pressable inline-flex items-center gap-2 rounded-md bg-[#36452B] px-5 py-2.5 text-sm font-semibold text-[#F8F7F4] hover:bg-[#2B3822] disabled:opacity-50"
        >
          <IconShieldCheck className="h-4 w-4 text-[#8A9646]" />
          <span>{verdict.state === 'busy' ? 'Verifying…' : 'Verify log'}</span>
        </button>
      </div>

      {offline && (
        <p
          role="status"
          className="rounded-md border border-[#D7D0C5] bg-[#F0EDE6] px-3.5 py-2 text-xs font-medium text-[#36452B]/80"
        >
          Offline — showing sample audit log
        </p>
      )}

      <VerdictBanner verdict={verdict} />

      {loaded && list.length === 0 && (
        <div className="ledger-card p-6 text-sm text-[#36452B]/75">The audit log is empty.</div>
      )}

      <ol className="space-y-2.5">
        {list.map((row) =>
          row.kind === 'entry' ? (
            <EntryRow key={`e${row.entry.seq}`} entry={row.entry} />
          ) : (
            <CheckpointRow key={`c${row.checkpoint.seq}`} checkpoint={row.checkpoint} />
          ),
        )}
      </ol>
    </div>
  )
}

function VerdictBanner({ verdict }: { verdict: Verdict }) {
  if (verdict.state === 'idle' || verdict.state === 'busy') return null
  if (verdict.state === 'unreachable') {
    return (
      <p
        role="alert"
        className="rounded-lg border border-[#D7D0C5] bg-[#F0EDE6] px-5 py-4 text-sm font-semibold text-[#36452B]"
      >
        Can&apos;t verify: the server is not reachable.
      </p>
    )
  }

  return verdict.ok ? (
    <div
      role="status"
      className="animate-dg-enter flex items-center gap-4 rounded-lg border border-[#8A9646] bg-[#8A9646]/12 px-5 py-4"
    >
      <IconShieldCheck className="h-8 w-8 shrink-0 text-[#8A9646]" />
      <div>
        <p className="text-lg font-bold text-[#36452B]">
          Chain verified: {count(verdict.entries, 'entry', 'entries')},{' '}
          {count(verdict.checkpoints, 'checkpoint', 'checkpoints')}
        </p>
        <p className="text-xs text-[#36452B]/80">
          Every SHA-256 hash link and Ed25519 checkpoint signature matches.
        </p>
      </div>
    </div>
  ) : (
    <div
      role="alert"
      className="animate-dg-enter flex items-center gap-4 rounded-lg border border-[#A44A3F] bg-[#EEDADA]/75 px-5 py-4"
    >
      <IconShieldAlert className="h-8 w-8 shrink-0 text-[#A44A3F]" />
      <div>
        <p className="text-lg font-bold text-[#A44A3F]">Log does not verify</p>
        <p className="mt-0.5 text-sm font-semibold text-[#36452B]">
          {verdict.error ?? 'No reason given'}
        </p>
      </div>
    </div>
  )
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className="ledger-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded bg-[#F0EDE6] px-2 py-0.5 font-mono text-xs font-bold text-[#36452B]">
          #{entry.seq}
        </span>
        <span className="text-sm font-bold text-[#36452B]">{entry.action}</span>
        <span className="text-sm text-[#36452B]/75">by {entry.actor}</span>
        <time
          dateTime={entry.ts}
          className="ml-auto font-mono text-xs text-[#36452B]/70"
        >
          {clock(entry.ts)}
        </time>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[#36452B]/75 hover:text-[#36452B]">
          Inspect hashes &amp; payload
        </summary>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Hash value={entry.prev_hash} label="prev" />
          <Hash value={entry.hash} label="hash" />
        </div>
        {Object.keys(entry.payload).length > 0 && (
          <div className="mt-2.5">
            <Payload payload={entry.payload} />
          </div>
        )}
      </details>
    </li>
  )
}

function CheckpointRow({ checkpoint }: { checkpoint: AuditCheckpoint }) {
  return (
    <li className="rounded-lg border border-[#36452B]/30 bg-[#36452B]/6 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#36452B]">
          <IconSeal className="h-4 w-4 text-[#8A9646]" />
          <span>Signed checkpoint at #{checkpoint.seq}</span>
        </span>
        <time
          dateTime={checkpoint.ts}
          className="ml-auto font-mono text-xs text-[#36452B]/80"
        >
          {clock(checkpoint.ts)}
        </time>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[#36452B]/80 hover:text-[#36452B]">
          Inspect Ed25519 signature
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Hash value={checkpoint.head_hash} label="head" />
          <Hash value={checkpoint.signature} label="Ed25519 signature" />
        </div>
      </details>
    </li>
  )
}
