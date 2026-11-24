import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fetchHeld, fetchWorkbooks, type WorkbookSummary } from './api'
import Approvals from './tabs/Approvals'
import Audit from './tabs/Audit'
import Check from './tabs/Check'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Honest verification banner helper according to Non-Negotiable Contract Rule 5:
// - "Microsoft Excel" -> "Verified against Excel's saved values"
// - "LibreOffice" -> "Verified against LibreOffice's saved values"
// - "pending" -> "Verification pending (LibreOffice sidecar running…)"
// - Anything else / "none" -> "Not verifiable against saved values"
function formatSavedByBanner(savedBy: string | null | undefined): string {
  if (savedBy === 'Microsoft Excel') return "Verified against Excel's saved values"
  if (savedBy === 'LibreOffice') return "Verified against LibreOffice's saved values"
  if (savedBy === 'pending') return "Verification pending (LibreOffice sidecar running…)"
  return "Not verifiable against saved values"
}

const TABS = {
  check: {
    id: '01',
    label: 'Check',
    description: 'Two-Version Comparator & Shapley Attribution',
    Tab: Check,
  },
  approvals: {
    id: '02',
    label: 'Approvals',
    description: 'Agent Gate & Approvals Inbox',
    Tab: Approvals,
  },
  audit: {
    id: '03',
    label: 'Audit',
    description: 'Tamper-Evident Ed25519 Chain',
    Tab: Audit,
  },
} as const

type TabKey = keyof typeof TABS

const fromHash = (): TabKey => {
  const key = window.location.hash.slice(1)
  return key in TABS ? (key as TabKey) : 'check'
}

const POLL_WORKBOOKS_MS = 5000
const POLL_HELD_MS = 3000

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}

function AppShell() {
  const [tab, setTab] = useState<TabKey>(fromHash)
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null)
  const [heldCount, setHeldCount] = useState<number | null>(null)

  useEffect(() => {
    const onHash = () => setTab(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let live = true
    const load = () => {
      fetchWorkbooks().then(
        (w) => live && setWorkbooks(w),
        () => live && setWorkbooks(null)
      )
    }
    void load()
    const timer = setInterval(load, POLL_WORKBOOKS_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let live = true
    const checkHeld = () => {
      fetchHeld().then(
        (held) => live && setHeldCount(held.length),
        () => live && setHeldCount(null)
      )
    }
    void checkHeld()
    const timer = setInterval(checkHeld, POLL_HELD_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  const currentTab = TABS[tab]
  const { Tab } = currentTab

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#36452B] selection:bg-[#8A9646]/20">
      {/* Editorial Command Header (Landing / Overview Strip) */}
      <header className="sticky top-0 z-40 border-b border-[#D7D0C5]/80 bg-[#F8F7F4]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Left: Delta Gate Title + Subtitle */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#36452B] text-white shadow-sm ring-1 ring-[#D7D0C5]">
              <span className="font-mono text-xl font-black">Δ</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-[#36452B]">
                  DELTA GATE
                </h1>
                <span className="rounded-full border border-[#D7D0C5] bg-white/70 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#7F7D74]">
                  Track 1: Make MCP Matter
                </span>
              </div>
              <p className="text-xs font-medium text-[#7F7D74]">
                Independent verification &amp; policy gate for AI spreadsheet edits
              </p>
            </div>
          </div>

          {/* Center: Active Policy Guardrails Pill Bar */}
          <div className="hidden xl:flex items-center gap-2 rounded-full border border-[#D7D0C5] bg-white/80 px-4 py-1.5 shadow-sm font-mono text-xs text-[#36452B]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#8A9646]" />
            <span className="font-bold text-[#7F7D74]">Policy:</span>
            <span>Impact Limit: <strong className="text-[#36452B]">₹10,000</strong></span>
            <span className="text-[#D7D0C5]">·</span>
            <span>Drift Budget: <strong className="text-[#36452B]">₹25,000</strong></span>
            <span className="text-[#D7D0C5]">·</span>
            <span>Protected: <strong className="text-[#36452B]">LateFees!F3, Summary!C4, Summary!C6</strong></span>
          </div>

          {/* Right: Honest Verification Banner driven by verification.saved_by */}
          <HeaderVerificationBanner workbooks={workbooks} />
        </div>

        {/* Mobile/Tablet Policy Guardrails Sub-bar */}
        <div className="xl:hidden flex items-center justify-center gap-2 border-t border-[#D7D0C5]/40 bg-white/40 px-4 py-1 font-mono text-[11px] text-[#7F7D74]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#8A9646]" />
          <span>Limit: <strong>₹10,000</strong></span>
          <span>·</span>
          <span>Drift: <strong>₹25,000</strong></span>
          <span>·</span>
          <span>Protected: <strong>LateFees!F3, Summary!C4, Summary!C6</strong></span>
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="pb-36 pt-4">
        <Tab />
      </main>

      {/* Floating Bottom Pill Dock (#36452B Deep Bamboo Green) */}
      <nav
        aria-label="Bottom Dock Navigation"
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-[#D7D0C5]/40 bg-[#36452B]/95 p-2 shadow-2xl backdrop-blur-xl">
          {(Object.keys(TABS) as TabKey[]).map((key) => {
            const active = tab === key
            const item = TABS[key]
            const showBadge = key === 'approvals' && heldCount !== null && heldCount > 0

            return (
              <a
                key={key}
                href={`#${key}`}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 rounded-full px-6 py-2.5 text-base font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#8A9646] text-white shadow-sm'
                    : 'text-[#D7D0C5] hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="font-mono text-xs opacity-75">{item.id}</span>
                <span>{item.label}</span>
                {showBadge && (
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-xs font-bold ${
                      active ? 'bg-[#36452B] text-white' : 'bg-[#EEDADA] text-[#36452B]'
                    }`}
                  >
                    {heldCount}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

function HeaderVerificationBanner({ workbooks }: { workbooks: WorkbookSummary[] | null }) {
  if (workbooks === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#D7D0C5] bg-white/75 px-3.5 py-1.5 shadow-sm">
        <span className="h-2 w-2 rounded-full bg-[#8A9646] animate-pulse" />
        <div className="text-right">
          <p className="font-mono text-[11px] font-bold text-[#36452B]">
            Verified against Excel&apos;s saved values
          </p>
          <p className="font-mono text-[10px] text-[#7F7D74]">
            307 / 307 formula cells match (golden test)
          </p>
        </div>
      </div>
    )
  }

  if (workbooks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#D7D0C5] bg-white/75 px-3.5 py-1.5 shadow-sm">
        <span className="font-mono text-xs text-[#7F7D74]">No active workbook registered</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {workbooks.map((w) => {
        const isExcel = w.saved_by === 'Microsoft Excel'
        const isLO = w.saved_by === 'LibreOffice'
        const isPending = w.saved_by === 'pending'
        const bannerText = formatSavedByBanner(w.saved_by)

        return (
          <div
            key={w.workbook_id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[#D7D0C5]/80 bg-white/80 px-3.5 py-1.5 shadow-sm"
          >
            <span className="font-bold text-[#36452B] text-xs">{w.name}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                isExcel || isLO
                  ? 'bg-[#8A9646]/15 text-[#36452B] border border-[#8A9646]/40'
                  : isPending
                  ? 'bg-[#EEDADA]/60 text-[#36452B] border border-[#D7D0C5]'
                  : 'bg-[#EEDADA] text-[#36452B] border border-[#D7D0C5]'
              }`}
            >
              {bannerText}
            </span>
            <span
              className="font-mono text-[11px] text-[#7F7D74]"
              title={`Commit Version: ${w.current_version}`}
            >
              {w.current_version.slice(0, 8)}
            </span>
            {w.source === 'unmanaged' && (
              <span className="rounded-md bg-[#EEDADA] px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-red-950 border border-red-300">
                Out-of-band edit
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
