import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAudit, fetchWorkbooks, verifyAudit, type AuditVerdict, type WorkbookSummary } from '../../api'
import sample from '../../fixtures/audit.json'
import { savedByBanner } from '../../format'
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
      if (checkpoint.seq === entry.seq) { out.push({ kind: 'checkpoint', checkpoint }); used.add(checkpoint) }
    }
  }
  for (const checkpoint of log.checkpoints) if (!used.has(checkpoint)) out.push({ kind: 'checkpoint', checkpoint })
  return out
}

const clock = (ts: string) => `${ts.slice(0, 10)} ${ts.slice(11, 19)} UTC`

type Verdict = { state: 'idle' } | { state: 'busy' } | { state: 'unreachable' } | ({ state: 'done' } & AuditVerdict)
type AuditFilter = 'all' | 'verified' | 'unverified'

export default function Audit() {
  const [log, setLog] = useState<AuditLog>({ entries: [], checkpoints: [] })
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>({ state: 'idle' })
  const [filter, setFilter] = useState<AuditFilter>('all')

  const poll = useCallback(async () => {
    try {
      const [l, w] = await Promise.all([fetchAudit(), fetchWorkbooks()])
      setLog(l)
      setWorkbooks(w)
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

  // Filter list rows
  const filteredList = useMemo(() => {
    if (filter === 'all') return list
    if (filter === 'verified') {
      return list.filter((r) => r.kind === 'checkpoint' || !r.entry.action.toLowerCase().includes('held'))
    }
    // 'unverified' / 'pending'
    return list.filter((r) => r.kind === 'entry' && r.entry.action.toLowerCase().includes('held'))
  }, [list, filter])

  const activeWorkbook = workbooks && workbooks.length > 0 ? workbooks[0] : null
  const savedStatus = activeWorkbook ? savedByBanner(activeWorkbook.saved_by) : "Verified against Excel's saved values"

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      {/* 1. Top Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-[#D7D0C5]/60 pb-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-[#36452B]">Session Audit</h2>
          <span className="text-xs text-[#7F7D74]">Workbook checkpoint timeline &amp; snapshot verification</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#D7D0C5] bg-white/70 px-3 py-0.5 font-mono text-[11px] font-semibold text-[#7F7D74]">
            {activeWorkbook ? `${activeWorkbook.name} (${activeWorkbook.current_version.slice(0, 8)})` : 'dues (managed)'}
          </span>
          <button
            type="button"
            onClick={() => void verify()}
            disabled={verdict.state === 'busy'}
            className="rounded-xl border border-[#36452B] bg-[#36452B] px-4 py-1.5 font-mono text-xs font-semibold text-[#F8F7F4] shadow-xs hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646] disabled:opacity-50 transition"
          >
            {verdict.state === 'busy' ? 'Verifying…' : 'Verify log'}
          </button>
        </div>
      </div>

      {/* 2. Audit Summary Dossier Strip (3-4 metric cards matching Verification dossier) */}
      <section aria-label="Audit Dossier Strip" className="glass-card p-4 border border-[#D7D0C5] bg-white/80 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
            <span className="block text-[10px] text-[#7F7D74]">Total Entries</span>
            <strong className="text-base text-[#36452B] font-bold">{log.entries.length}</strong>
          </div>
          <div className="rounded-xl border border-[#8A9646]/30 bg-[#8A9646]/10 p-3">
            <span className="block text-[10px] text-[#7F7D74]">Verified Snapshots</span>
            <strong className="text-base text-[#8A9646] font-bold">{log.checkpoints.length} signed</strong>
          </div>
          <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
            <span className="block text-[10px] text-[#7F7D74]">Pending / Held</span>
            <strong className="text-base text-[#36452B] font-bold">
              {log.entries.filter((e) => e.action.toLowerCase().includes('held')).length}
            </strong>
          </div>
          <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
            <span className="block text-[10px] text-[#7F7D74]">Verification Status</span>
            <strong className="text-xs text-[#36452B] font-bold truncate block" title={savedStatus}>
              {savedStatus}
            </strong>
          </div>
        </div>
      </section>

      {/* Verification Verdict Banner */}
      <VerdictBanner verdict={verdict} />

      {offline && (
        <p role="status" className="rounded-lg bg-[#D7D0C5]/40 border border-[#D7D0C5] px-4 py-2 text-xs font-mono text-[#7F7D74]">
          offline — showing sample audit chain
        </p>
      )}

      {/* 3. Checkpoint Timeline & Diff Ledger */}
      <section aria-label="Checkpoint Timeline" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5]/60 pb-3">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#7F7D74]">
            Timeline &amp; Checkpoint Chain
          </span>

          {/* Filter pills with #36452B active state */}
          <div role="group" aria-label="Filter audit entries" className="flex items-center gap-1.5 font-mono text-xs">
            {(['all', 'verified', 'unverified'] as AuditFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-0.5 font-semibold transition ${
                  filter === f
                    ? 'bg-[#36452B] text-[#F8F7F4]'
                    : 'border border-[#D7D0C5] bg-white/70 text-[#7F7D74] hover:text-[#36452B]'
                }`}
              >
                {f === 'all' ? 'All' : f === 'verified' ? 'Verified' : 'Unverified / Pending'}
              </button>
            ))}
          </div>
        </div>

        {loaded && filteredList.length === 0 && (
          <p className="text-xs font-mono text-[#7F7D74] py-8 text-center">No timeline records match the filter.</p>
        )}

        <div className="relative pl-6 space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-0.5 before:bg-[#7F7D74]/30">
          {filteredList.map((row) =>
            row.kind === 'entry' ? (
              <TimelineEntryRow key={`e${row.entry.seq}`} entry={row.entry} />
            ) : (
              <TimelineCheckpointRow key={`c${row.checkpoint.seq}`} checkpoint={row.checkpoint} />
            )
          )}
        </div>
      </section>
    </div>
  )
}

function VerdictBanner({ verdict }: { verdict: Verdict }) {
  if (verdict.state === 'idle' || verdict.state === 'busy') return null
  if (verdict.state === 'unreachable') {
    return (
      <p role="alert" className="rounded-xl bg-[#EEDADA]/60 border border-[#D7D0C5] px-5 py-3 text-xs font-bold text-[#36452B]">
        Can&apos;t verify: backend verification endpoint is unreachable.
      </p>
    )
  }
  return verdict.ok ? (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-[#8A9646] bg-[#8A9646]/15 px-5 py-3.5 shadow-xs">
      <span className="text-2xl leading-none text-[#8A9646]" aria-hidden>✓</span>
      <div>
        <p className="text-sm font-serif font-bold text-[#36452B]">Ed25519 Chain Verified</p>
        <p className="text-xs font-mono text-[#7F7D74]">{verdict.entries} entries and {verdict.checkpoints} signed checkpoints matched SHA-256 state hashes.</p>
      </div>
    </div>
  ) : (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-[#D7D0C5] bg-[#EEDADA] px-5 py-3.5 shadow-xs">
      <span className="text-2xl leading-none text-[#36452B]" aria-hidden>⚠</span>
      <div>
        <p className="text-sm font-serif font-bold text-[#36452B]">Audit Log Does Not Verify</p>
        <p className="text-xs font-mono text-[#7F7D74]">{verdict.error ?? 'Tampered state hash detected'}</p>
      </div>
    </div>
  )
}

function TimelineEntryRow({ entry }: { entry: AuditEntry }) {
  const isHeld = entry.action.toLowerCase().includes('held')
  return (
    <div className="relative rounded-xl border border-[#D7D0C5] bg-white p-4 shadow-xs space-y-2">
      {/* Timeline Node Icon */}
      <span
        className={`absolute -left-[30px] top-4.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${
          isHeld ? 'bg-[#EEDADA] ring-2 ring-[#D7D0C5]' : 'bg-[#8A9646]'
        }`}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[#36452B]">#{entry.seq}</span>
          <span className="font-serif font-bold text-sm text-[#36452B]">{entry.action}</span>
          <span className="rounded bg-[#D7D0C5]/40 px-2 py-0.2 font-mono text-[10px] text-[#7F7D74]">
            by {entry.actor}
          </span>
        </div>
        <time dateTime={entry.ts} className="font-mono text-[11px] text-[#7F7D74]">{clock(entry.ts)}</time>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono border-t border-[#D7D0C5]/40 pt-2 text-[#7F7D74]">
        <Hash value={entry.prev_hash} label="prev" />
        <Hash value={entry.hash} label="hash" />
      </div>

      {Object.keys(entry.payload).length > 0 && (
        <details className="mt-1 pt-1">
          <summary className="cursor-pointer font-mono text-[11px] text-[#7F7D74] hover:text-[#36452B]">
            Inspect cell delta payload details
          </summary>
          <div className="mt-2 rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-2.5">
            <Payload payload={entry.payload} />
          </div>
        </details>
      )}
    </div>
  )
}

function TimelineCheckpointRow({ checkpoint }: { checkpoint: AuditCheckpoint }) {
  return (
    <div className="relative rounded-xl border border-[#8A9646]/50 bg-[#8A9646]/10 p-3.5 shadow-xs space-y-1.5">
      <span className="absolute -left-[30px] top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#36452B] shadow-xs" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-serif font-bold text-xs text-[#36452B]">
          🔏 Signed Checkpoint at #{checkpoint.seq}
        </span>
        <time dateTime={checkpoint.ts} className="font-mono text-[11px] text-[#7F7D74]">{clock(checkpoint.ts)}</time>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-[#36452B]">
        <Hash value={checkpoint.head_hash} label="head" />
        <Hash value={checkpoint.signature} label="Ed25519 sig" />
      </div>
    </div>
  )
}
