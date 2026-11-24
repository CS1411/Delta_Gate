// The only module that talks to the backend. Plain fetch, no library. /api is proxied to uvicorn in vite.config.ts.

import type { AuditLog, CheckResult, Decision, SavedBy } from './types'

/** A non-2xx answer. `message` is the server's own `detail` (e.g. why an approve was refused). */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init) // rejects (TypeError) when nothing answers
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null // e.g. the dev proxy's plain-text error when the backend is down
  }
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    throw new ApiError(response.status, typeof detail === 'string' ? detail : `Request failed (${response.status})`)
  }
  return body as T
}

export const fetchHeld = () => call<Decision[]>('/api/edits?status=held')
export const approveEdit = (editId: string) => call<Decision>(`/api/edits/${encodeURIComponent(editId)}/approve`, { method: 'POST' })
export const denyEdit = (editId: string) => call<Decision>(`/api/edits/${encodeURIComponent(editId)}/deny`, { method: 'POST' })

export const fetchAudit = () => call<AuditLog>('/api/audit')

/** GET /api/audit/verify. A tampered log still answers 200: always read `ok`, never the status. (Defined in api.py, not models.py.) */
export interface AuditVerdict { ok: boolean; entries: number; checkpoints: number; error: string | null }
export const verifyAudit = () => call<AuditVerdict>('/api/audit/verify')

// --- Check tab and shell (P1) -------------------------------------------------------------------------------

/** POST /api/checks with the two versions of a workbook. */
export function runCheck(base: File, next: File) {
  const form = new FormData()
  form.append('base', base)
  form.append('new', next)
  return call<CheckResult>('/api/checks', { method: 'POST', body: form })
}

/** The change log of a stored Check, as a download link. */
export const csvHref = (checkId: string) => `/api/exports/${encodeURIComponent(checkId)}.csv`

/** POST /api/checks/{id}/proof/{group}: the proof workbook, saved by the browser under the server's file name. */
export async function downloadProof(checkId: string, groupId: string) {
  const response = await fetch(`/api/checks/${encodeURIComponent(checkId)}/proof/${encodeURIComponent(groupId)}`, { method: 'POST' })
  if (!response.ok) {
    const detail = await response.json().then((b) => b?.detail, () => null)
    throw new ApiError(response.status, typeof detail === 'string' ? detail : `Request failed (${response.status})`)
  }
  const name = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `proof-${groupId}.xlsx`
  const url = URL.createObjectURL(await response.blob())
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}

/** GET /api/workbooks: managed workbooks and their current version (defined in api.py, not models.py). */
export interface WorkbookSummary {
  workbook_id: string
  name: string
  current_version: string
  saved_by: SavedBy | 'pending'
  source: 'managed' | 'unmanaged'
  updated_at: string
  can_rollback: boolean
}
export const fetchWorkbooks = () => call<WorkbookSummary[]>('/api/workbooks')

// The policy the gate enforces (policy.yaml), for the header: limits are never typed into the UI.
export interface Policy {
  watched_outputs: { cell: string; label: string }[]
  impact_limit_abs: number
  drift_budget: number
  protected: string[]
}
export const fetchPolicy = () => call<Policy>('/api/policy')

/** POST /api/workbooks/{id}/rollback: the version it made current. 409 (with the server's reason) when there is nothing earlier. */
export interface RollbackResult { workbook_id: string; sha256: string; saved_by: SavedBy | 'pending'; source: 'managed' | 'unmanaged'; created_at: string }
export const rollbackWorkbook = (workbookId: string) =>
  call<RollbackResult>(`/api/workbooks/${encodeURIComponent(workbookId)}/rollback`, { method: 'POST' })

// --- Session Audit (defined in api.py, not models.py) ---------------------------------------------------------

/** POST /api/session-audit/snapshot: an exact copy of the workbook, kept before an in-Excel AI session. */
export interface SnapshotTaken { snapshot_id: string; sha256: string }
export function takeSnapshot(file: File) {
  const form = new FormData()
  form.append('file', file)
  return call<SnapshotTaken>('/api/session-audit/snapshot', { method: 'POST', body: form })
}

/** POST /api/session-audit/complete: the snapshot against the file after the session, as a CheckResult (mode session_audit). */
export function completeSessionAudit(snapshotId: string, file: File) {
  const form = new FormData()
  form.append('snapshot_id', snapshotId)
  form.append('file', file)
  return call<CheckResult>('/api/session-audit/complete', { method: 'POST', body: form })
}
