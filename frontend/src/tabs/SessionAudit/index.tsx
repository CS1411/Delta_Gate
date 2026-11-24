import { useEffect, useState } from 'react'
import { ApiError, completeSessionAudit, csvHref, downloadProof, takeSnapshot, type SnapshotTaken } from '../../api'
import v2v3 from '../../fixtures/check_v2_v3.json'
import type { CheckResult } from '../../types'
import CheckResultView from '../Check/CheckResultView'
import Waterfall from '../Check/Waterfall'

// Session Audit: snapshot a workbook, let someone use an AI inside Excel, then upload the file afterwards and
// Check everything that changed. The two stages are minutes apart and the page may be reloaded in between, so
// the snapshot id is the one thing that must never be lost: it is saved in localStorage and restored on mount,
// shown on screen with a copy button, can be pasted back in by hand, and is only cleared by "Start over".
const STORAGE_KEY = 'deltagate.sessionAudit.snapshot'
const OFFLINE = "Couldn't reach the server. Is it running? (cd backend && uv run uvicorn deltagate.api:app --port 8000)"
const SAMPLE = v2v3 as CheckResult

interface Stored { snapshot_id: string; sha256: string | null; file: string | null; taken_at: string }

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null
    return parsed && typeof parsed.snapshot_id === 'string' && parsed.snapshot_id
      ? { snapshot_id: parsed.snapshot_id, sha256: parsed.sha256 ?? null, file: parsed.file ?? null, taken_at: parsed.taken_at ?? '' }
      : null
  } catch {
    return null // storage blocked or the value is garbage
  }
}

export default function SessionAudit() {
  const [stored, setStored] = useState<Stored | null>(load)
  const [storageFailed, setStorageFailed] = useState(false)
  const [before, setBefore] = useState<File | null>(null)
  const [after, setAfter] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [resetCount, setResetCount] = useState(0) // remounts the file pickers: a native input would keep showing the old file
  const [busy, setBusy] = useState<'snapshot' | 'complete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [result, setResult] = useState<{ check: CheckResult; live: boolean } | null>(null)
  const [selectedOutputCell, setSelectedOutputCell] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  // Every change to the id goes through here, so it is saved at once. A write that fails (private window) is
  // shown on screen, never silent.
  const remember = (next: Stored | null) => {
    setStored(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      else localStorage.removeItem(STORAGE_KEY)
      setStorageFailed(false)
    } catch {
      setStorageFailed(true)
    }
  }

  const fail = (problem: unknown) => {
    // 502 / 503 / 504 come from the dev proxy or a gateway when nothing is listening: that is offline, not a message.
    if (problem instanceof ApiError && ![502, 503, 504].includes(problem.status)) {
      setError(problem.message) // the server's own words
      setOffline(false)
    } else {
      setError(OFFLINE)
      setOffline(true)
      setResult({ check: SAMPLE, live: false })
    }
  }

  const snapshot = async () => {
    if (!before) return
    setBusy('snapshot')
    setError(null)
    setResult(null)
    try {
      const taken: SnapshotTaken = await takeSnapshot(before)
      setOffline(false)
      remember({ snapshot_id: taken.snapshot_id, sha256: taken.sha256, file: before.name, taken_at: new Date().toISOString() })
    } catch (problem) {
      fail(problem)
    } finally {
      setBusy(null)
    }
  }

  const complete = async () => {
    if (!stored || !after) return
    setBusy('complete')
    setError(null)
    try {
      setResult({ check: await completeSessionAudit(stored.snapshot_id, after), live: true })
      setOffline(false)
    } catch (problem) {
      setResult(null)
      fail(problem)
    } finally {
      setBusy(null)
    }
  }

  const applyPasted = () => {
    const id = pasted.trim()
    if (!id) return
    remember({ snapshot_id: id, sha256: null, file: null, taken_at: new Date().toISOString() })
    setPasted('')
    setError(null)
  }

  const startOver = () => {
    remember(null)
    setResetCount((n) => n + 1)
    setBefore(null)
    setAfter(null)
    setResult(null)
    setError(null)
    setOffline(false)
    setSelectedOutputCell(null)
    setSelectedGroupId(null)
  }

  const prove = async (groupId: string) => {
    if (!result?.live) return
    setError(null)
    try {
      await downloadProof(result.check.check_id, groupId)
    } catch (problem) {
      // Only the error: a failed download must never swap the live result for the sample.
      setError(problem instanceof ApiError && ![502, 503, 504].includes(problem.status) ? problem.message : OFFLINE)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section aria-label="Session Audit" className="space-y-6 rounded-2xl bg-white p-6 shadow-md">
        <div>
          <h2 className="text-3xl font-bold">Session Audit</h2>
          <p className="mt-1 text-lg text-slate-600">
            For AI that edits inside Excel, where nothing can be blocked: snapshot the workbook first, let the session run,
            then upload the file afterwards. Delta Gate Checks everything that changed.
          </p>
        </div>

        {offline && (
          <p role="status" className="rounded-lg bg-slate-200 px-4 py-2 text-base text-slate-700">offline — showing sample data</p>
        )}

        <Step number={1} title="Snapshot the workbook before the AI session" done={stored !== null}>
          {stored ? (
            <SnapshotId stored={stored} />
          ) : (
            <>
              <FilePick key={`before${resetCount}`} label="Workbook before the session" file={before} onPick={setBefore} />
              <button type="button" disabled={!before || busy !== null} onClick={() => void snapshot()}
                className="mt-3 h-12 rounded-xl bg-slate-900 px-6 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
                {busy === 'snapshot' ? 'Taking snapshot…' : 'Take snapshot'}
              </button>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <label className="block text-lg font-semibold" htmlFor="pasted-id">Already took one? Paste its snapshot id</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  <input id="pasted-id" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="sa_…" spellCheck={false}
                    className="h-12 w-72 rounded-xl border-2 border-slate-300 px-4 font-mono text-lg" />
                  <button type="button" disabled={!pasted.trim()} onClick={applyPasted}
                    className="h-12 rounded-xl border-2 border-slate-300 px-5 text-base font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                    Use this id
                  </button>
                </div>
              </div>
            </>
          )}
          {storageFailed && stored && (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-base text-amber-950">
              This browser would not save the id. Copy it now: if you reload, it is gone.
            </p>
          )}
        </Step>

        <Step number={2} title="After the session, upload the workbook as it is now" done={result !== null && result.live}>
          <FilePick key={`after${resetCount}`} label="Workbook after the session" file={after} onPick={setAfter} />
          <button type="button" disabled={!stored || !after || busy !== null} onClick={() => void complete()}
            className="mt-3 h-12 rounded-xl bg-slate-900 px-6 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
            {busy === 'complete' ? 'Checking…' : 'Check what the session changed'}
          </button>
          {!stored && <p className="mt-2 text-base text-slate-500">Take a snapshot, or paste an id, first.</p>}
        </Step>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-lg font-semibold text-red-800">{error}</p>}

        {(stored || result) && (
          <button type="button" onClick={startOver}
            className="h-11 rounded-xl border-2 border-slate-300 px-5 text-base font-semibold text-slate-700 hover:bg-slate-100">
            Start over (forget this snapshot)
          </button>
        )}
      </section>

      {result && (
        <>
          <p className="rounded-xl border-l-8 border-indigo-500 bg-indigo-50 px-5 py-3 text-xl text-indigo-950">
            {result.live
              ? <>Session audit: everything that changed in the workbook while the AI session ran{stored ? <> (snapshot <span className="font-mono">{stored.snapshot_id}</span> against the file you just uploaded)</> : null}. This is not a normal two-file Check.</>
              : <>Sample: real engine output for dues v2 → v3, shown because the server is unreachable. Prove it and CSV need a live Session Audit.</>}
          </p>
          <CheckResultView
            check={result.check}
            onProve={result.live ? (groupId) => void prove(groupId) : undefined}
            csvHref={result.live ? csvHref(result.check.check_id) : undefined}
            selectedOutputCell={selectedOutputCell}
            onSelectOutput={setSelectedOutputCell}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            waterfallSlot={
              <Waterfall check={result.check} outputCell={selectedOutputCell} selectedGroupId={selectedGroupId} onSelectGroup={setSelectedGroupId} />
            }
          />
        </>
      )}
    </div>
  )
}

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border-2 p-5 ${done ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-200'}`}>
      <h3 className="mb-3 text-2xl font-bold">
        <span className="mr-2 text-slate-500">{number}.</span>{title}{done && <span className="ml-2 text-emerald-700" aria-label="done">✓</span>}
      </h3>
      {children}
    </div>
  )
}

/** The id is shown in full (it is short) with a copy button: it is what brings the audit back after a reload. */
function SnapshotId({ stored }: { stored: Stored }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => navigator.clipboard?.writeText(stored.snapshot_id).then(() => setCopied(true), () => {})
  return (
    <div className="space-y-2">
      <p className="text-lg text-slate-700">
        {stored.file ? <>Snapshot of <b>{stored.file}</b> kept.</> : <>Using a snapshot id you pasted.</>} It survives a reload; write it down anyway.
      </p>
      <p className="flex flex-wrap items-center gap-3">
        <span className="text-lg text-slate-600">Snapshot id</span>
        <code data-testid="snapshot-id" className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 font-mono text-2xl text-white">{stored.snapshot_id}</code>
        <button type="button" onClick={copy} aria-label="Copy the snapshot id"
          className="h-11 rounded-xl border-2 border-slate-300 px-4 text-base font-semibold text-slate-700 hover:bg-slate-100">
          {copied ? 'copied' : 'copy'}
        </button>
      </p>
      {stored.sha256 && <p className="font-mono text-sm text-slate-500" title={stored.sha256}>file hash {stored.sha256.slice(0, 12)}…</p>}
    </div>
  )
}

function FilePick({ label, file, onPick }: { label: string; file: File | null; onPick: (file: File | null) => void }) {
  return (
    <label className="block rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-slate-500">
      <span className="block text-lg font-semibold">{label}</span>
      <input type="file" accept=".xlsx,.xlsm" className="mt-2 block w-full text-base" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file && <span className="mt-1 block font-mono text-sm text-slate-600">{file.name}</span>}
    </label>
  )
}
