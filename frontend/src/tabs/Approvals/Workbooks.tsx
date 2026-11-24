import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchWorkbooks, rollbackWorkbook, type WorkbookSummary } from '../../api'
import { savedByBanner } from '../../format'

// Rollback per workbook strictly formatted in 6-color Zen Bamboo palette.
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
      const restored = await rollbackWorkbook(id)
      setNotes((n) => ({ ...n, [id]: { ok: true, text: `Rolled back: version ${restored.sha256.slice(0, 8)} is current again.` } }))
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
      <h3 className="text-xl font-serif font-bold text-[#36452B]">Workbooks</h3>
      {workbooks.map((w) => (
        <article key={w.workbook_id} className="rounded-2xl bg-white border border-[#D7D0C5] px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-serif font-semibold text-[#36452B]">{w.name}</p>
              <p className="text-sm text-[#7F7D74]">
                Current version <span className="font-mono text-[#36452B]" title={w.current_version}>{w.current_version.slice(0, 8)}</span>
                {' · '}{savedByBanner(w.saved_by)}
                {w.source === 'unmanaged' && <span className="font-semibold text-[#36452B]"> · changed outside Delta Gate</span>}
              </p>
            </div>
            {confirming === w.workbook_id ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="h-10 rounded-xl border border-[#D7D0C5] bg-[#F8F7F4] px-4 text-sm font-semibold text-[#36452B] hover:bg-[#D7D0C5]/40 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void rollback(w.workbook_id)}
                  className="h-10 rounded-xl bg-[#36452B] px-4 text-sm font-semibold text-white hover:bg-[#36452B]/90 transition"
                >
                  Confirm rollback
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!w.can_rollback || busy === w.workbook_id}
                onClick={() => setConfirming(w.workbook_id)}
                title={w.can_rollback ? 'Restore the version before this one' : 'No earlier version to roll back to'}
                className="h-10 rounded-xl border border-[#D7D0C5] bg-[#EEDADA]/50 px-4 text-sm font-semibold text-[#36452B] hover:bg-[#EEDADA] disabled:opacity-40 transition"
              >
                {busy === w.workbook_id ? 'Rolling back…' : 'Roll back'}
              </button>
            )}
          </div>
          {notes[w.workbook_id] && (
            <p
              role={notes[w.workbook_id].ok ? 'status' : 'alert'}
              className={`mt-3 rounded-lg border px-4 py-2 text-sm ${
                notes[w.workbook_id].ok
                  ? 'bg-[#8A9646]/10 border-[#8A9646]/30 text-[#36452B]'
                  : 'bg-[#EEDADA]/60 border-[#D7D0C5] text-[#36452B]'
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
