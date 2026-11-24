import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, approveEdit, denyEdit, fetchHeld, fetchPolicy, type Policy } from '../../api'
import cantVerify from '../../fixtures/decision_cant_verify.json'
import sessionA from '../../fixtures/decision_session_a.json'
import sessionB from '../../fixtures/decision_session_b.json'
import { inr } from '../../format'
import type { Decision } from '../../types'
import HeldCard from './HeldCard'
import Workbooks from './Workbooks'

const POLL_MS = 2000
const PAUSE_AFTER_ACTION_MS = 5000
const SAMPLE = [sessionA, sessionB, cantVerify] as Decision[]

export default function Approvals() {
  const [inbox, setInbox] = useState<Decision[]>([])
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [policy, setPolicy] = useState<Policy | null>(null)
  const lastAction = useRef(0)

  // Fetch policy once
  useEffect(() => {
    fetchPolicy().then(setPolicy).catch(() => setPolicy(null))
  }, [])

  const poll = useCallback(async () => {
    if (Date.now() - lastAction.current < PAUSE_AFTER_ACTION_MS) return
    try {
      setInbox(await fetchHeld())
      setOffline(false)
    } catch {
      setInbox(SAMPLE)
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

  const act = useCallback(async (editId: string, call: (id: string) => Promise<unknown>) => {
    if (offline) {
      setProblems((p) => ({ ...p, [editId]: "The server is offline. Can't act on sample data." }))
      return
    }
    setBusy((b) => new Set(b).add(editId))
    setProblems((p) => { const { [editId]: _gone, ...rest } = p; return rest })
    try {
      await call(editId)
      lastAction.current = Date.now()
      setInbox((d) => d.filter((x) => x.edit_id !== editId))
    } catch (error) {
      setProblems((p) => ({ ...p, [editId]: error instanceof ApiError ? error.message : "Couldn't reach the server. Try again." }))
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(editId); return next })
      void poll()
    }
  }, [offline, poll])

  const hasHeld = inbox.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      {/* 1. Top Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-[#D7D0C5]/60 pb-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-[#36452B]">Approvals</h2>
          <span className="text-xs text-[#7F7D74]">Policy gate queue &amp; rollback controls</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-0.5 font-mono text-xs font-bold ${
              hasHeld
                ? 'border border-[#D7D0C5] bg-[#EEDADA] text-[#36452B]'
                : 'border border-[#8A9646]/30 bg-[#8A9646]/15 text-[#36452B]'
            }`}
          >
            {hasHeld ? `${inbox.length} HELD IN QUEUE` : '0 HELD · QUEUE CLEAR'}
          </span>
          {offline && (
            <span className="rounded-full border border-[#D7D0C5] bg-white/70 px-2.5 py-0.5 font-mono text-[10px] text-[#7F7D74]">
              Sample data
            </span>
          )}
        </div>
      </div>

      {/* 2. Policy Guardrails Dossier Bar */}
      {policy && (
        <section aria-label="Policy Guardrails Dossier" className="glass-card p-4 border border-[#D7D0C5] bg-white/80 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#D7D0C5]/60 pb-2 mb-3">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#7F7D74]">
              Active Policy Guardrails (Live Engine Rules)
            </span>
            <span className="font-mono text-[11px] text-[#8A9646] font-semibold">Dual sign-off enforced</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
              <span className="block text-[10px] text-[#7F7D74]">Max Absolute Impact</span>
              <strong className="text-sm text-[#36452B] font-bold">{inr(policy.impact_limit_abs)}</strong>
            </div>
            <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
              <span className="block text-[10px] text-[#7F7D74]">Cumulative Drift Budget</span>
              <strong className="text-sm text-[#36452B] font-bold">{inr(policy.drift_budget)}</strong>
            </div>
            <div className="rounded-xl border border-[#D7D0C5]/60 bg-[#F8F7F4] p-3">
              <span className="block text-[10px] text-[#7F7D74]">Protected Formula Cells</span>
              <strong className="text-sm text-[#36452B] font-bold truncate block" title={policy.protected.join(', ')}>
                {policy.protected.join(', ')}
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* 3. Held Edits Ledger Cards */}
      <div className="space-y-4">
        {loaded && !hasHeld && (
          <div className="rounded-2xl border border-dashed border-[#D7D0C5] bg-white/60 p-10 text-center space-y-2">
            <span className="text-3xl">✨</span>
            <h3 className="text-base font-serif font-bold text-[#36452B]">No held edits waiting in queue</h3>
            <p className="text-xs text-[#7F7D74]">
              All AI-agent workbook edits currently satisfy policy drift budgets and formula integrity constraints.
            </p>
          </div>
        )}

        {inbox.map((d) => (
          <div key={d.edit_id} className="space-y-2">
            <HeldCard
              decision={d}
              busy={busy.has(d.edit_id)}
              onApprove={(id) => void act(id, approveEdit)}
              onDeny={(id) => void act(id, denyEdit)}
            />
            {problems[d.edit_id] && (
              <p role="alert" className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA] px-5 py-3 text-xs font-semibold text-[#36452B]">
                {problems[d.edit_id]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 4. Workbook Management & Rollback Controls */}
      <Workbooks />
    </div>
  )
}
