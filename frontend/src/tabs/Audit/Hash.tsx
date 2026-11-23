import { useEffect, useState } from 'react'

// A 64- or 128-character hex value shown as its first 12 characters. The full value is the tooltip and the
// copy button's payload. Never wraps: a hash broken across lines cannot be compared by eye.
export default function Hash({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {}) // clipboard can be blocked: stay silent
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-slate-700" title={value}>
      {label && <span className="font-sans text-sm text-slate-500">{label}</span>}
      {value.slice(0, 12)}…
      <button type="button" onClick={copy} aria-label={`Copy full ${label ?? 'value'}`}
        className="rounded px-1 font-sans text-sm text-slate-500 hover:bg-slate-200">
        {copied ? 'copied' : 'copy'}
      </button>
    </span>
  )
}
