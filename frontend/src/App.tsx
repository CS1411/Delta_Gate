import { useEffect, useState, type ComponentType } from 'react'

import { fetchHeld, fetchPolicy, fetchWorkbooks, type Policy, type WorkbookSummary } from './api'
import { IconSliders } from './components/Icons'
import { inr, savedByBanner } from './format'
import Approvals from './tabs/Approvals'
import Audit from './tabs/Audit'
import Check from './tabs/Check'
import { HomeTab } from './tabs/Home'
import SessionAudit from './tabs/SessionAudit'

interface TabDef {
  label: string
  description: string
  Tab: ComponentType
}

const goTo = (t: string) => {
  window.location.hash = `#${t}`
}

const TABS = {
  home: {
    label: 'Home',
    description: 'What Delta Gate checks, and where to start',
    Tab: () => <HomeTab onNavigateTab={goTo} />,
  },
  check: {
    label: 'Check',
    description: 'Two-version comparator & Shapley attribution',
    Tab: Check,
  },
  approvals: {
    label: 'Approvals',
    description: 'MCP agent gate & held edits inbox',
    Tab: Approvals,
  },
  audit: {
    label: 'Audit',
    description: 'Hash-chained Ed25519 audit ledger',
    Tab: Audit,
  },
  session: {
    label: 'Session Audit',
    description: 'Snapshot before an in-Excel AI session, Check after',
    Tab: SessionAudit,
  },
} as const satisfies Record<string, TabDef>

type TabKey = keyof typeof TABS

const fromHash = (): TabKey => {
  const key = window.location.hash.slice(1)
  return key in TABS ? (key as TabKey) : 'home'
}

const POLL_WORKBOOKS_MS = 5000
const POLL_HELD_MS = 3000

export default function App() {
  return <AppShell />
}

function AppShell() {
  const [tab, setTab] = useState<TabKey>(fromHash)
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null)
  const [heldCount, setHeldCount] = useState<number | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onHash = () => {
      setTab(fromHash())
      setMenuOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let live = true
    const load = () => {
      fetchWorkbooks().then(
        (w) => live && setWorkbooks(w),
        () => live && setWorkbooks(null),
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
        () => live && setHeldCount(null),
      )
    }
    void checkHeld()
    const timer = setInterval(checkHeld, POLL_HELD_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let live = true
    fetchPolicy()
      .then((p) => live && setPolicy(p))
      .catch(() => live && setPolicy(null))
    return () => {
      live = false
    }
  }, [])

  const currentTab = TABS[tab]
  const { Tab } = currentTab

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#36452B]">
      <header className="sticky top-0 z-30 border-b border-[#D7D0C5] bg-[#F8F7F4]/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <a href="#home" className="flex items-center gap-3">
            <img src="/logo.png" alt="Delta Gate logo" className="h-8 w-8 shrink-0 rounded-md object-contain" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-base font-bold tracking-tight text-[#36452B]">Delta Gate</span>
              <span className="text-sm font-semibold text-[#36452B]/80">{currentTab.label}</span>
              <span className="hidden text-xs text-[#36452B]/75 sm:inline">{currentTab.description}</span>
            </div>
          </a>
          <HeaderVerificationBanner workbooks={workbooks} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-36 pt-6 sm:px-6 lg:px-8">
        <div key={tab} className="animate-dg-enter">
          <Tab />
        </div>
      </main>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#36452B]/20 p-4 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="mb-24 w-full max-w-md rounded-2xl border border-[#D7D0C5] bg-[#F8F7F4] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#D7D0C5] pb-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <IconSliders className="h-4 w-4 text-[#8A9646]" />
                <span>Policy guardrails</span>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full px-3 py-1 font-mono text-xs text-[#7F7D74] hover:bg-[#D7D0C5]/40"
              >
                Close ✕
              </button>
            </div>
            {policy ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[#36452B]/75">Impact limit</dt>
                  <dd className="font-mono font-semibold tabular-nums">{inr(policy.impact_limit_abs)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[#36452B]/75">Drift budget</dt>
                  <dd className="font-mono font-semibold tabular-nums">{inr(policy.drift_budget)}</dd>
                </div>
                <div className="border-t border-[#D7D0C5] pt-2">
                  <dt className="text-[#36452B]/75">Protected cells</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {policy.protected.map((cell) => (
                      <span key={cell} className="rounded bg-[#36452B] px-1.5 py-0.5 font-mono text-xs text-[#F8F7F4]">
                        {cell}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[#36452B]/75">Connect backend API to inspect active policy limits.</p>
            )}
          </div>
        </div>
      )}

      {/* Floating bottom dock */}
      <nav aria-label="Main Navigation" className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2">
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] rounded-full border border-[#D7D0C5]/40 bg-[#36452B]/95 p-2 shadow-2xl backdrop-blur-xl">
          {(Object.keys(TABS) as TabKey[]).map((key, i) => {
            const active = tab === key
            const showBadge = key === 'approvals' && heldCount !== null && heldCount > 0
            return (
              <a
                key={key}
                href={`#${key}`}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-all duration-200 sm:gap-2 sm:px-5 sm:text-base ${
                  active ? 'bg-[#8A9646] text-white shadow-sm' : 'text-[#D7D0C5] hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="font-mono text-xs opacity-75">{String(i).padStart(2, '0')}</span>
                <span>{TABS[key].label}</span>
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
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Policy guardrails"
            aria-label="Policy guardrails"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-lg font-bold text-[#D7D0C5] transition hover:bg-white/10 hover:text-white"
          >
            ≡
          </button>
        </div>
      </nav>
    </div>
  )
}

function HeaderVerificationBanner({ workbooks }: { workbooks: WorkbookSummary[] | null }) {
  if (workbooks === null) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-[#D7D0C5] bg-[#FFFFFF] px-3 py-1 text-xs font-medium text-[#36452B]/75">
        <span className="h-2 w-2 rounded-full bg-[#7F7D74]" />
        <span>API offline</span>
      </div>
    )
  }

  if (workbooks.length === 0) {
    return (
      <div className="inline-flex items-center rounded-md border border-[#D7D0C5] bg-[#FFFFFF] px-3 py-1 text-xs text-[#36452B]/75">
        No workbooks registered
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {workbooks.map((w) => {
        const bannerText = savedByBanner(w.saved_by)
        const isTrusted = w.saved_by === 'Microsoft Excel' || w.saved_by === 'LibreOffice'
        return (
          <div
            key={w.workbook_id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-[#D7D0C5] bg-[#FFFFFF] px-3 py-1 text-xs"
          >
            <span
              className={`h-2 w-2 rounded-full ${isTrusted ? 'bg-[#8A9646]' : 'bg-[#A44A3F]'}`}
              aria-hidden="true"
            />
            <span className="font-semibold text-[#36452B]">{w.name}</span>
            <span
              className={`rounded px-2 py-0.5 font-medium ${
                isTrusted
                  ? 'bg-[#8A9646]/15 text-[#36452B]'
                  : 'bg-[#EEDADA]/70 text-[#36452B]'
              }`}
            >
              {bannerText}
            </span>
            {w.source === 'unmanaged' && (
              <span className="rounded border border-[#A44A3F]/30 bg-[#EEDADA] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#A44A3F]">
                Out-of-band edit
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
