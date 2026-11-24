import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchWorkbooks, rollbackWorkbook, type WorkbookSummary } from '../../api'
import { savedByBanner } from '../../format'

// Rollback, per workbook: restores the managed version before the current one (as a new version; history is
// kept, and the edit that produced the current version is marked ROLLED_BACK). Two clicks (Roll back -> Confirm)
// so a stray click cannot undo anything.
const POLL_MS = 5000

export default function Workbooks() {
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null)
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
      setNotes((n) => ({
        ...n,
        [id]: { ok: true, text: 'Rolled back: the previous version is current again.' },
      }))
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
    <section aria-label="Managed workbooks" className="space-y-3 pt-2">
      <h3 className="text-base font-bold text-[#36452B]">Managed workbooks</h3>
      {workbooks.map((w) => (
        <article key={w.workbook_id} className="ledger-card px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-[#36452B]">{w.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#36452B]/75">
                <span>{savedByBanner(w.saved_by)}</span>
                {w.source === 'unmanaged' && (
                  <span className="rounded border border-[#A44A3F]/30 bg-[#EEDADA]/75 px-2 py-0.5 font-semibold text-[#A44A3F]">
                    Changed outside Delta Gate
                  </span>
                )}
              </p>
            </div>

            {confirming === w.workbook_id ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-md border border-[#D7D0C5] bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#36452B] transition-colors hover:bg-[#F8F7F4]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void rollback(w.workbook_id)}
                  className="rounded-md bg-[#A44A3F] px-4 py-2 text-xs font-semibold text-[#FFFFFF] transition-colors hover:bg-[#8A3B31]"
                >
                  Confirm rollback
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!w.can_rollback || busy === w.workbook_id}
                onClick={() => setConfirming(w.workbook_id)}
                title={
                  w.can_rollback
                    ? 'Restore the version before this one'
                    : 'No earlier version to roll back to'
                }
                className="rounded-md border border-[#A44A3F] bg-[#FFFFFF] px-4 py-2 text-xs font-semibold text-[#A44A3F] transition-colors hover:bg-[#EEDADA]/55 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === w.workbook_id ? 'Rolling back…' : 'Roll back'}
              </button>
            )}
          </div>

          {notes[w.workbook_id] && (
            <p
              role={notes[w.workbook_id].ok ? 'status' : 'alert'}
              className={`mt-3 rounded-md border px-3.5 py-2 text-sm font-medium ${
                notes[w.workbook_id].ok
                  ? 'border-[#8A9646]/35 bg-[#8A9646]/12 text-[#36452B]'
                  : 'border-[#A44A3F]/35 bg-[#EEDADA]/65 text-[#A44A3F]'
              }`}
            >
              {notes[w.workbook_id].text}
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
