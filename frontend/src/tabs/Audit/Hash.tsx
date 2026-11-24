import { useEffect, useState } from 'react'

// A 64- or 128-character hex value shown as its first 12 characters. Strictly in 6-color Zen Bamboo palette.
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
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[#36452B]" title={value}>
      {label && <span className="font-sans text-xs text-[#7F7D74]">{label}</span>}
      <span className="text-xs">{value.slice(0, 12)}…</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy full ${label ?? 'value'}`}
        className="rounded px-1 font-sans text-xs text-[#7F7D74] hover:bg-[#D7D0C5]/40 transition"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </span>
  )
}
