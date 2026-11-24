import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, approveEdit, denyEdit, fetchHeld } from '../../api'
import cantVerify from '../../fixtures/decision_cant_verify.json'
import sessionA from '../../fixtures/decision_session_a.json'
import sessionB from '../../fixtures/decision_session_b.json'
import type { Decision } from '../../types'
import HeldCard from './HeldCard'
import Workbooks from './Workbooks'

// Approvals inbox: the queue of held agent edits. Polls every 2 s so an edit held on stage appears without
// a refresh; pauses polling for 5 s after an approve/deny click so the optimistic update is not overwritten
// by a poll before the server has finished writing the commit.
const POLL_MS = 2000
const PAUSE_AFTER_ACTION_MS = 5000
const SAMPLE = [sessionA, sessionB, cantVerify] as Decision[]

export default function Approvals() {
  const [inbox, setInbox] = useState<Decision[]>([])
  const [offline, setOffline] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [problems, setProblems] = useState<Record<string, string>>({})
  const lastAction = useRef(0)

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

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h2 className="text-2xl font-serif font-bold text-[#36452B]">
          Approvals <span className="text-sm font-sans font-normal text-[#7F7D74]">({inbox.length} held)</span>
        </h2>
        <p className="text-xs text-[#7F7D74]">Held agent edits awaiting human sign-off</p>
      </div>

      {offline && (
        <p role="status" className="rounded-lg bg-[#D7D0C5]/40 border border-[#D7D0C5] px-4 py-2 text-xs font-mono text-[#7F7D74]">
          offline — showing sample data
        </p>
      )}

      {loaded && inbox.length === 0 && <p className="text-base text-[#7F7D74]">Nothing is waiting for approval.</p>}

      {inbox.map((d) => (
        <div key={d.edit_id} className="space-y-2">
          <HeldCard decision={d} busy={busy.has(d.edit_id)}
            onApprove={(id) => void act(id, approveEdit)} onDeny={(id) => void act(id, denyEdit)} />
          {problems[d.edit_id] && (
            <p role="alert" className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA] px-6 py-4 text-sm font-semibold text-[#36452B]">
              {problems[d.edit_id]}
            </p>
          )}
        </div>
      ))}
      <Workbooks />
    </div>
  )
}
