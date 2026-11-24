import { useState, type ReactNode } from 'react'
import { ApiError, completeSessionAudit, csvHref, downloadProof, takeSnapshot, type SnapshotTaken } from '../../api'
import { IconAlertTriangle, IconCheck, IconCheckCircle, IconUpload } from '../../components/Icons'
import v2v3 from '../../fixtures/check_v2_v3.json'
import type { CheckResult } from '../../types'
import CheckResultView from '../Check/CheckResultView'
import Waterfall from '../Check/Waterfall'

const STORAGE_KEY = 'deltagate.sessionAudit.snapshot'
const OFFLINE = "Couldn't reach the server. Is it running? (cd backend && uv run uvicorn deltagate.api:app --port 8000)"
const SAMPLE = v2v3 as CheckResult

interface Stored {
  snapshot_id: string
  sha256: string | null
  file: string | null
  taken_at: string
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null
    return parsed && typeof parsed.snapshot_id === 'string' && parsed.snapshot_id
      ? {
          snapshot_id: parsed.snapshot_id,
          sha256: parsed.sha256 ?? null,
          file: parsed.file ?? null,
          taken_at: parsed.taken_at ?? '',
        }
      : null
  } catch {
    return null
  }
}

export default function SessionAudit() {
  const [stored, setStored] = useState<Stored | null>(load)
  const [storageFailed, setStorageFailed] = useState(false)
  const [before, setBefore] = useState<File | null>(null)
  const [after, setAfter] = useState<File | null>(null)
  const [resetCount, setResetCount] = useState(0)
  const [busy, setBusy] = useState<'snapshot' | 'complete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [result, setResult] = useState<{ check: CheckResult; live: boolean } | null>(null)
  const [selectedOutputCell, setSelectedOutputCell] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

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
    if (problem instanceof ApiError && ![502, 503, 504].includes(problem.status)) {
      setError(problem.message)
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
      remember({
        snapshot_id: taken.snapshot_id,
        sha256: taken.sha256,
        file: before.name,
        taken_at: new Date().toISOString(),
      })
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
      setError(
        problem instanceof ApiError && ![502, 503, 504].includes(problem.status)
          ? problem.message
          : OFFLINE,
      )
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Session Audit" className="ledger-card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D7D0C5] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#36452B]">Session Audit</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-[#36452B]/75">
              For AI that edits inside Excel, where nothing can be intercepted: snapshot the workbook first, let the
              session run, then upload the file afterwards. Delta Gate checks everything that changed.
            </p>
          </div>
          {(stored || result) && (
            <button
              type="button"
              onClick={startOver}
              className="rounded-md border border-[#D7D0C5] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-semibold text-[#36452B] transition-colors hover:border-[#36452B] hover:bg-[#F8F7F4]"
            >
              Start over (forget this snapshot)
            </button>
          )}
        </div>

        {offline && (
          <p
            role="status"
            className="rounded-md border border-[#D7D0C5] bg-[#F0EDE6] px-3.5 py-2 text-xs font-medium text-[#36452B]/80"
          >
            Offline — showing sample data
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Step number={1} title="Snapshot the workbook before the AI session" done={stored !== null}>
            {stored ? (
              <SnapshotNote stored={stored} />
            ) : (
              <div className="space-y-4">
                <FilePick
                  key={`before${resetCount}`}
                  label="Workbook before the session"
                  file={before}
                  onPick={setBefore}
                />
                <button
                  type="button"
                  disabled={!before || busy !== null}
                  onClick={() => void snapshot()}
                  className="pressable rounded-md bg-[#36452B] px-5 py-2 text-sm font-semibold text-[#F8F7F4] hover:bg-[#2B3822] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy === 'snapshot' ? 'Taking snapshot…' : 'Take snapshot'}
                </button>
              </div>
            )}

            {storageFailed && stored && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-[#A44A3F]/30 bg-[#EEDADA]/60 px-3 py-2 text-xs font-medium text-[#A44A3F]"
              >
                This browser would not save the snapshot: if you reload, it is gone.
              </p>
            )}
          </Step>

          <Step number={2} title="After the session, upload the workbook as it is now" done={result !== null && result.live}>
            <div className="space-y-4">
              <FilePick
                key={`after${resetCount}`}
                label="Workbook after the session"
                file={after}
                onPick={setAfter}
              />
              <button
                type="button"
                disabled={!stored || !after || busy !== null}
                onClick={() => void complete()}
                className="pressable rounded-md bg-[#36452B] px-5 py-2 text-sm font-semibold text-[#F8F7F4] hover:bg-[#2B3822] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy === 'complete' ? 'Checking…' : 'Check what the session changed'}
              </button>
              {!stored && (
                <p className="text-xs text-[#36452B]/70">Take a snapshot first.</p>
              )}
            </div>
          </Step>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-[#A44A3F]/35 bg-[#EEDADA]/60 px-4 py-3 text-sm font-semibold text-[#A44A3F]"
          >
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {result && (
        <div className="space-y-6">
          <div className="rounded-lg border border-[#36452B]/25 bg-[#36452B]/6 px-4 py-3 text-sm font-medium text-[#36452B]">
            {result.live
              ? 'Session audit: everything that changed in the workbook while the AI session ran (the snapshot against the file you just uploaded). This is not a normal two-file Check.'
              : 'Sample: real engine output for dues v2 → v3, shown because the server is unreachable. Prove it and CSV need a live Session Audit.'}
          </div>

          <CheckResultView
            check={result.check}
            onProve={result.live ? (groupId) => void prove(groupId) : undefined}
            csvHref={result.live ? csvHref(result.check.check_id) : undefined}
            selectedOutputCell={selectedOutputCell}
            onSelectOutput={setSelectedOutputCell}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
            waterfallSlot={
              <Waterfall
                check={result.check}
                outputCell={selectedOutputCell}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
              />
            }
          />
        </div>
      )}
    </div>
  )
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number
  title: string
  done: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-lg border p-4 sm:p-5 ${
        done ? 'border-[#8A9646]/50 bg-[#8A9646]/6' : 'border-[#D7D0C5] bg-[#F8F7F4]'
      }`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
            done ? 'bg-[#8A9646] text-[#FFFFFF]' : 'bg-[#36452B] text-[#F8F7F4]'
          }`}
        >
          {done ? <IconCheck className="h-3.5 w-3.5" aria-label="done" /> : number}
        </span>
        <h3 className="text-sm font-bold text-[#36452B]">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function SnapshotNote({ stored }: { stored: Stored }) {
  return (
    <p className="text-sm text-[#36452B]/85">
      Snapshot of <strong className="font-semibold text-[#36452B]">{stored.file ?? 'the workbook'}</strong> kept. It
      survives a reload.
    </p>
  )
}

function FilePick({
  label,
  file,
  onPick,
}: {
  label: string
  file: File | null
  onPick: (file: File | null) => void
}) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-[#D7D0C5] bg-[#FFFFFF] p-3.5 transition-colors hover:border-[#8A9646]">
      <div className="min-w-0">
        <span className="block text-sm font-semibold text-[#36452B]">{label}</span>
        {file ? (
          <span className="mt-0.5 block truncate font-mono text-xs text-[#36452B]/80">{file.name}</span>
        ) : (
          <span className="mt-0.5 block text-xs text-[#36452B]/65">Choose .xlsx or .xlsm</span>
        )}
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D7D0C5] bg-[#F8F7F4] text-[#36452B]">
        {file ? <IconCheckCircle className="h-4 w-4 text-[#8A9646]" /> : <IconUpload className="h-4 w-4" />}
      </div>
      <input
        type="file"
        accept=".xlsx,.xlsm"
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}
