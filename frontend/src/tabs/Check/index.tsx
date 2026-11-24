import { useState, type DragEvent } from 'react'
import { ApiError, csvHref, downloadProof, runCheck } from '../../api'
import { IconAlertTriangle, IconArrowRight, IconCheckCircle, IconRefresh, IconUpload } from '../../components/Icons'
import judgeFixture from '../../fixtures/check_judge_xlookup.json'
import v2v3Fixture from '../../fixtures/check_v2_v3.json'
import type { CheckResult } from '../../types'
import CheckResultView from './CheckResultView'
import Waterfall from './Waterfall'

const SAMPLES: { label: string; desc: string; data: CheckResult }[] = [
  {
    label: 'Sample: dues v2 → v3',
    desc: `${v2v3Fixture.verification.matched} / ${v2v3Fixture.verification.formula_cells} formula cells match Excel's saved values`,
    data: v2v3Fixture as CheckResult,
  },
  {
    label: 'Sample: judge file (XLOOKUP)',
    desc: `Partial verification: ${judgeFixture.unverifiable.length} cells can't be verified (XLOOKUP and what depends on it)`,
    data: judgeFixture as CheckResult,
  },
]

const OFFLINE =
  "Couldn't reach the server. Is it running? (cd backend && uv run uvicorn deltagate.api:app --port 8000) The samples above work without it."

export default function Check() {
  const [base, setBase] = useState<File | null>(null)
  const [next, setNext] = useState<File | null>(null)
  const [result, setResult] = useState<{ check: CheckResult; label: string; live: boolean } | null>(null)
  const [pickerExpanded, setPickerExpanded] = useState(true)
  const [selectedOutputCell, setSelectedOutputCell] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectResult = (check: CheckResult, label: string, live: boolean) => {
    setResult({ check, label, live })
    const preferred =
      check.outputs.find((o) => o.cell === 'Summary!C6')?.cell ?? check.outputs[0]?.cell ?? null
    setSelectedOutputCell(preferred)
    setSelectedGroupId(null)
    setPickerExpanded(false)
  }

  const run = async () => {
    if (!base || !next) return
    setRunning(true)
    setError(null)
    try {
      const check = await runCheck(base, next)
      selectResult(check, `${base.name} → ${next.name}`, true)
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

  const loadSample = (sample: (typeof SAMPLES)[number]) => {
    setError(null)
    selectResult(sample.data, sample.label, false)
  }

  return (
    <div className="space-y-6">
      {/* Compact Comparison Toolbar when a result is loaded */}
      {result && !pickerExpanded && (
        <section
          aria-label="Active comparison"
          className="ledger-card animate-dg-enter flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${
                result.live
                  ? 'bg-[#8A9646]/15 text-[#36452B]'
                  : 'bg-[#F0EDE6] text-[#36452B]'
              }`}
            >
              {result.live ? 'Live check' : 'Sample fixture'}
            </span>
            <span className="text-sm font-semibold text-[#36452B]">{result.label}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SAMPLES.map((s) => {
              const active = !result.live && result.label === s.label
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => loadSample(s)}
                  title={s.desc}
                  className={`pressable rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                    active
                      ? 'border-[#36452B] bg-[#36452B] text-[#F8F7F4]'
                      : 'border-[#D7D0C5] bg-[#F8F7F4] text-[#36452B] hover:border-[#8A9646] hover:bg-[#FFFFFF]'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setPickerExpanded(true)}
              className="pressable inline-flex items-center gap-1.5 rounded-md border border-[#36452B] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold text-[#36452B] hover:bg-[#F8F7F4]"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              <span>Compare other files</span>
            </button>
          </div>
        </section>
      )}

      {/* Dual Workbook Ingestion Panel */}
      {pickerExpanded && (
        <section aria-label="Workbook comparator" className="ledger-card animate-dg-enter p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5] pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#36452B]">Compare two workbook versions</h2>
              <p className="mt-0.5 text-xs text-[#36452B]/75">
                Upload a baseline and edited workbook, or load a pre-computed engine fixture.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => loadSample(s)}
                  title={s.desc}
                  className="rounded-md border border-[#D7D0C5] bg-[#F8F7F4] px-3 py-1.5 text-xs font-semibold text-[#36452B] transition-colors hover:border-[#8A9646] hover:bg-[#FFFFFF]"
                >
                  {s.label}
                </button>
              ))}
              {result && (
                <button
                  type="button"
                  onClick={() => setPickerExpanded(false)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#36452B]/75 hover:text-[#36452B]"
                >
                  Collapse
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <WorkbookDropzone
              roleLabel="Base workbook"
              hint="Approved baseline with saved values (e.g. dues_v2.xlsx)"
              file={base}
              onPick={setBase}
            />
            <WorkbookDropzone
              roleLabel="New workbook"
              hint="Edited version to recalculate and verify (e.g. dues_v3_REAL.xlsx)"
              file={next}
              onPick={setNext}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-md border border-[#A44A3F]/35 bg-[#EEDADA]/60 px-4 py-3 text-sm font-medium text-[#A44A3F]"
            >
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#36452B]/75">
              Accepts <span className="font-mono">.xlsx</span> and <span className="font-mono">.xlsm</span> files.
            </p>
            <button
              type="button"
              disabled={!base || !next || running}
              onClick={() => void run()}
              className="pressable inline-flex items-center gap-2 rounded-md bg-[#36452B] px-5 py-2.5 text-sm font-semibold text-[#F8F7F4] hover:bg-[#2B3822] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>{running ? 'Running engine check…' : 'Run check'}</span>
              <IconArrowRight className="h-4 w-4" />
            </button>
          </div>

          {running && (
            <div
              role="status"
              aria-label="Running engine check"
              className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EDE6]"
            >
              <div className="animate-dg-loading h-full w-1/3 rounded-full bg-[#8A9646]" />
            </div>
          )}
        </section>
      )}

      {/* Results View */}
      {result && (
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
      )}
    </div>
  )
}

function WorkbookDropzone({
  roleLabel,
  hint,
  file,
  onPick,
}: {
  roleLabel: string
  hint: string
  file: File | null
  onPick: (file: File | null) => void
}) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onPick(dropped)
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`group flex cursor-pointer flex-col justify-between rounded-lg border border-dashed p-4 transition-colors ${
        dragging
          ? 'border-[#36452B] bg-[#8A9646]/10'
          : file
            ? 'border-[#8A9646] bg-[#8A9646]/6'
            : 'border-[#D7D0C5] bg-[#F8F7F4] hover:border-[#8A9646] hover:bg-[#FFFFFF]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-[#36452B]">{roleLabel}</span>
          <p className="mt-0.5 text-xs text-[#36452B]/75">{hint}</p>
        </div>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
            file
              ? 'border-[#8A9646]/40 bg-[#8A9646]/15 text-[#36452B]'
              : 'border-[#D7D0C5] bg-[#FFFFFF] text-[#7F7D74] group-hover:text-[#36452B]'
          }`}
        >
          {file ? <IconCheckCircle className="h-4 w-4 text-[#8A9646]" /> : <IconUpload className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#D7D0C5]/70 pt-2.5">
        {file ? (
          <span className="truncate font-mono text-xs font-semibold text-[#36452B]">{file.name}</span>
        ) : (
          <span className="text-xs text-[#36452B]/65">Drop .xlsx / .xlsm here or click to browse</span>
        )}
        <span className="shrink-0 text-xs font-semibold text-[#36452B] underline decoration-[#D7D0C5] group-hover:decoration-[#8A9646]">
          {file ? 'Replace' : 'Browse'}
        </span>
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
