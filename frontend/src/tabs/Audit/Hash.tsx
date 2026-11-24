import { useEffect, useState } from 'react'
import { IconCheck, IconCopy } from '../../components/Icons'

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
    navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {})
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-[#D7D0C5] bg-[#F8F7F4] px-2 py-0.5 font-mono text-xs text-[#36452B]"
      title={value}
    >
      {label && <span className="font-sans text-[11px] font-medium text-[#36452B]/70">{label}</span>}
      <span>{value.slice(0, 12)}…</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy full ${label ?? 'value'}`}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-sans text-[11px] font-semibold text-[#36452B]/75 transition-colors hover:bg-[#F0EDE6] hover:text-[#36452B]"
      >
        {copied ? (
          <>
            <IconCheck className="h-3 w-3 text-[#8A9646]" />
            <span className="text-[#8A9646]">copied</span>
          </>
        ) : (
          <>
            <IconCopy className="h-3 w-3" />
            <span>copy</span>
          </>
        )}
      </button>
    </span>
  )
}
