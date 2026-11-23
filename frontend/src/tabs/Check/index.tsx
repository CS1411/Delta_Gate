import { useState } from 'react'
import { ApiError, csvHref, downloadProof, runCheck } from '../../api'
import judge from '../../fixtures/check_judge_xlookup.json'
import v2v3 from '../../fixtures/check_v2_v3.json'
import type { CheckResult } from '../../types'
import CheckResultView from './CheckResultView'
import Waterfall from './Waterfall'

// Check tab: upload two versions of a workbook → POST /api/checks → CheckResultView. The two samples are real
// engine output (the fixtures), so the tab works and can be designed with no backend; they are labelled as
// samples, and Prove it / CSV only appear for a live Check (the server keeps no files for a sample).
const SAMPLES: [string, CheckResult][] = [
  ['Sample: dues v2 → v3', v2v3 as CheckResult],
  ['Sample: judge file (XLOOKUP)', judge as CheckResult],
]
const OFFLINE = "Couldn't reach the server. Is it running? (cd backend && uv run uvicorn deltagate.api:app --port 8000)"

export default function Check() {
  const [base, setBase] = useState<File | null>(null)
  const [next, setNext] = useState<File | null>(null)
  const [result, setResult] = useState<{ check: CheckResult; live: boolean } | null>(null)
  const [selectedOutputCell, setSelectedOutputCell] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!base || !next) return
    setRunning(true)
    setError(null)
    try {
      setResult({ check: await runCheck(base, next), live: true })
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : OFFLINE)
    } finally {
      setRunning(false)
    }
  }

  const prove = async (groupId: string) => {
    if (!result?.live) return
    setError(null)
    try {
      await downloadProof(result.check.check_id, groupId)
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : OFFLINE)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <section aria-label="Run a Check" className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-3xl font-bold">Check two versions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FilePick label="Base version" file={base} onPick={setBase} />
          <FilePick label="New version" file={next} onPick={setNext} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!base || !next || running}
            onClick={() => void run()}
            className="h-12 rounded-xl bg-slate-900 px-6 text-lg font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {running ? 'Checking…' : 'Run Check'}
          </button>
          {SAMPLES.map(([label, check]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setError(null)
                setResult({ check, live: false })
              }}
              className="h-12 rounded-xl border-2 border-slate-300 px-5 text-base font-semibold text-slate-700 hover:bg-slate-100"
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-lg text-red-800">{error}</p>}
      </section>

      {result && (
        <>
          {!result.live && (
            <p className="text-base text-slate-600">
              Sample: real engine output from the golden files, not a live Check. Prove it and CSV need a live Check.
            </p>
          )}
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
        </>
      )}
    </div>
  )
}

function FilePick({ label, file, onPick }: { label: string; file: File | null; onPick: (file: File | null) => void }) {
  return (
    <label className="block rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-slate-500">
      <span className="block text-lg font-semibold">{label}</span>
      <input
        type="file"
        accept=".xlsx,.xlsm"
        className="mt-2 block w-full text-base"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {file && <span className="mt-1 block font-mono text-sm text-slate-600">{file.name}</span>}
    </label>
  )
}
