import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, approveEdit, denyEdit, fetchHeld } from '../../api'
import { IconAlertTriangle, IconCheckCircle } from '../../components/Icons'
import cantVerify from '../../fixtures/decision_cant_verify.json'
import sessionA from '../../fixtures/decision_session_a.json'
import sessionB from '../../fixtures/decision_session_b.json'
import type { Decision } from '../../types'
import HeldCard from './HeldCard'
import Workbooks from './Workbooks'

// Approvals inbox, live: polls GET /api/edits?status=held every 2 s. If the API cannot be reached it shows the
// engine-generated fixtures instead (the demo must still work with no backend) and says so.
const POLL_MS = 2000
const SAMPLE = [sessionA, sessionB, cantVerify] as Decision[]

export default function Approvals() {
  const [inbox, setInbox] = useState<Decision[]>([])
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [problems, setProblems] = useState<Record<string, string>>({})
  const dismissed = useRef<Set<string>>(new Set())
  const lastAction = useRef(0)

  const poll = useCallback(async () => {
    const started = Date.now()
    try {
      const held = await fetchHeld()
      if (started < lastAction.current) return
      setOffline(false)
      setInbox(held)
      setProblems((p) => Object.fromEntries(Object.entries(p).filter(([id]) => held.some((d) => d.edit_id === id))))
    } catch {
      setOffline(true)
      setInbox(SAMPLE.filter((d) => !dismissed.current.has(d.edit_id)))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => clearInterval(timer)
  }, [poll])

  const act = useCallback(
    async (editId: string, call: (id: string) => Promise<Decision>) => {
      if (offline) {
        dismissed.current.add(editId)
        setInbox((d) => d.filter((x) => x.edit_id !== editId))
        return
      }
      setBusy((b) => new Set(b).add(editId))
      setProblems((p) => {
        const { [editId]: _gone, ...rest } = p
        return rest
      })
      try {
        await call(editId)
        lastAction.current = Date.now()
        setInbox((d) => d.filter((x) => x.edit_id !== editId))
      } catch (error) {
        setProblems((p) => ({
          ...p,
          [editId]: error instanceof ApiError ? error.message : "Couldn't reach the server. Try again.",
        }))
      } finally {
        setBusy((b) => {
          const next = new Set(b)
          next.delete(editId)
          return next
        })
        void poll()
      }
    },
    [offline, poll],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-xl font-bold text-[#36452B]">Held agent edits</h2>
          <span className="rounded bg-[#F0EDE6] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#36452B]">
            {inbox.length} held
          </span>
        </div>

        {offline && (
          <p
            role="status"
            className="rounded-md border border-[#D7D0C5] bg-[#F0EDE6] px-3 py-1.5 text-xs font-medium text-[#36452B]/80"
          >
            Offline — showing sample held edits
          </p>
        )}
      </div>

      {loaded && inbox.length === 0 && (
        <div className="ledger-card flex items-start gap-3 p-6">
          <IconCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A9646]" />
          <div>
            <p className="text-base font-semibold text-[#36452B]">Nothing is waiting for approval</p>
            <p className="mt-0.5 text-sm text-[#36452B]/75">
              AI agent edits proposed through MCP that exceed impact limits, drift budgets, protected cells, or
              verifiability rules appear here for human sign-off.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {inbox.map((d) => (
          <div key={d.edit_id} className="space-y-2">
            <HeldCard
              decision={d}
              busy={busy.has(d.edit_id)}
              onApprove={(id) => void act(id, approveEdit)}
              onDeny={(id) => void act(id, denyEdit)}
            />
            {problems[d.edit_id] && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-[#A44A3F]/35 bg-[#EEDADA]/65 px-4 py-3 text-sm font-semibold text-[#A44A3F]"
              >
                <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{problems[d.edit_id]}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Workbooks />
    </div>
  )
}
