import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchWorkbooks, rollbackWorkbook, type WorkbookSummary } from '../../api'
import { savedByBanner } from '../../format'

// Rollback, per workbook: restores the managed version before the current one (as a new version; history is
// kept, and the edit that produced the current version is marked ROLLED_BACK). Approver only: this button calls
// the REST API, never MCP. Two clicks (Roll back → Confirm) so a stray click on stage cannot undo anything.
const POLL_MS = 5000

export default function Workbooks() {
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null) // null: API not reachable
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({})

  const load = useCallback(() => fetchWorkbooks().then(setWorkbooks, () => setWorkbooks(null)), [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const rollback = async (id: string) => {
    setConfirming(null)
    setBusy(id)
    try {
      await rollbackWorkbook(id)
      setNotes((n) => ({ ...n, [id]: { ok: true, text: 'Rolled back: the previous version is current again.' } }))
    } catch (problem) {
      const text = problem instanceof ApiError ? problem.message : "Couldn't reach the server. Try again."
      setNotes((n) => ({ ...n, [id]: { ok: false, text } }))
    } finally {
      setBusy(null)
      void load()
    }
  }

  if (workbooks === null || workbooks.length === 0) return null

  return (
    <section aria-label="Workbooks" className="space-y-4">
      <h3 className="text-2xl font-bold">Workbooks</h3>
      {workbooks.map((w) => (
        <article key={w.workbook_id} className="rounded-2xl bg-white px-8 py-5 shadow-md">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold">{w.name}</p>
              <p className="text-base text-slate-600">
                {savedByBanner(w.saved_by)}
                {w.source === 'unmanaged' && <span className="font-semibold text-red-700"> · changed outside Delta Gate</span>}
              </p>
            </div>
            {confirming === w.workbook_id ? (
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirming(null)}
                  className="h-12 rounded-xl border-2 border-slate-300 px-5 text-lg font-semibold text-slate-700 hover:bg-slate-100">
                  Cancel
                </button>
                <button type="button" onClick={() => void rollback(w.workbook_id)}
                  className="h-12 rounded-xl bg-red-700 px-5 text-lg font-semibold text-white hover:bg-red-800">
                  Confirm rollback
                </button>
              </div>
            ) : (
              <button type="button" disabled={!w.can_rollback || busy === w.workbook_id}
                onClick={() => setConfirming(w.workbook_id)}
                title={w.can_rollback ? 'Restore the version before this one' : 'No earlier version to roll back to'}
                className="h-12 rounded-xl border-2 border-red-700 px-5 text-lg font-semibold text-red-800 hover:bg-red-50 disabled:opacity-40">
                {busy === w.workbook_id ? 'Rolling back…' : 'Roll back'}
              </button>
            )}
          </div>
          {notes[w.workbook_id] && (
            <p role={notes[w.workbook_id].ok ? 'status' : 'alert'}
              className={`mt-3 rounded-lg px-4 py-2 text-lg ${notes[w.workbook_id].ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>
              {notes[w.workbook_id].text}
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
