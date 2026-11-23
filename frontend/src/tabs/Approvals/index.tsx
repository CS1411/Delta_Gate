import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, approveEdit, denyEdit, fetchHeld } from '../../api'
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
  const [problems, setProblems] = useState<Record<string, string>>({}) // edit_id -> the server's message
  const dismissed = useRef<Set<string>>(new Set()) // sample cards the user already acted on
  const lastAction = useRef(0) // a poll that started before an action finished must not bring the card back

  const poll = useCallback(async () => {
    const started = Date.now()
    try {
      const held = await fetchHeld()
      if (started < lastAction.current) return // stale: the next poll will be right
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

  const act = useCallback(async (editId: string, call: (id: string) => Promise<Decision>) => {
    if (offline) { // sample data: nothing to send, just take the card away
      dismissed.current.add(editId)
      setInbox((d) => d.filter((x) => x.edit_id !== editId))
      return
    }
    setBusy((b) => new Set(b).add(editId))
    setProblems((p) => { const { [editId]: _gone, ...rest } = p; return rest })
    try {
      await call(editId)
      lastAction.current = Date.now()
      setInbox((d) => d.filter((x) => x.edit_id !== editId)) // optimistic; the next poll is the truth
    } catch (error) {
      setProblems((p) => ({ ...p, [editId]: error instanceof ApiError ? error.message : "Couldn't reach the server. Try again." }))
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(editId); return next })
      void poll()
    }
  }, [offline, poll])

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <h2 className="text-3xl font-bold">Approvals <span className="text-slate-500">({inbox.length} held)</span></h2>
      {offline && (
        <p role="status" className="rounded-lg bg-slate-200 px-4 py-2 text-base text-slate-700">
          offline — showing sample data
        </p>
      )}
      {loaded && inbox.length === 0 && <p className="text-xl text-slate-600">Nothing is waiting for approval.</p>}
      {inbox.map((d) => (
        <div key={d.edit_id} className="space-y-2">
          <HeldCard decision={d} busy={busy.has(d.edit_id)}
            onApprove={(id) => void act(id, approveEdit)} onDeny={(id) => void act(id, denyEdit)} />
          {problems[d.edit_id] && (
            <p role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 px-6 py-4 text-xl font-semibold text-red-800">
              {problems[d.edit_id]}
            </p>
          )}
        </div>
      ))}
      <Workbooks />
    </div>
  )
}
