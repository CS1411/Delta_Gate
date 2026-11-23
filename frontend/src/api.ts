// The only module that talks to the backend. Plain fetch, no library: moving to react-query later means
// replacing the callers of these three functions, nothing else. /api is proxied to uvicorn in vite.config.ts.

import type { Decision } from './types'

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
