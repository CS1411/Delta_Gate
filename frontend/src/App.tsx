import { useEffect, useState, type ComponentType, type SVGProps } from 'react'

import { fetchHeld, fetchPolicy, fetchWorkbooks, type Policy, type WorkbookSummary } from './api'
import { IconChain, IconCompare, IconHistory, IconInbox, IconSliders } from './components/Icons'
import { inr, savedByBanner } from './format'
import Approvals from './tabs/Approvals'
import Audit from './tabs/Audit'
import Check from './tabs/Check'
import SessionAudit from './tabs/SessionAudit'

interface TabDef {
  label: string
  description: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  Tab: ComponentType
}

const TABS = {
  check: {
    label: 'Check',
    description: 'Two-version comparator & Shapley attribution',
    Icon: IconCompare,
    Tab: Check,
  },
  approvals: {
    label: 'Approvals',
    description: 'MCP agent gate & held edits inbox',
    Icon: IconInbox,
    Tab: Approvals,
  },
  audit: {
    label: 'Audit',
    description: 'Hash-chained Ed25519 audit ledger',
    Icon: IconChain,
    Tab: Audit,
  },
  session: {
    label: 'Session Audit',
    description: 'Snapshot before an in-Excel AI session, Check after',
    Icon: IconHistory,
    Tab: SessionAudit,
  },
} as const satisfies Record<string, TabDef>

type TabKey = keyof typeof TABS

const fromHash = (): TabKey => {
  const key = window.location.hash.slice(1)
  return key in TABS ? (key as TabKey) : 'check'
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
      {/* Desktop / Tablet Left Sidebar Rail (#36452B Deep Bamboo) */}
      <aside
        aria-label="Primary Sidebar"
        className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-56 lg:w-60 md:flex-col md:border-r md:border-[#2B3822] md:bg-[#36452B] md:text-[#F8F7F4]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <img
            src="/logo.png"
            alt="Delta Gate logo"
            className="h-9 w-9 shrink-0 rounded-md bg-[#F8F7F4] object-contain p-1"
          />
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-[#F8F7F4]">Delta Gate</div>
            <div className="truncate text-xs text-[#D7D0C5]/85">Spreadsheet audit &amp; gate</div>
          </div>
        </div>

        <nav aria-label="Main Navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {(Object.keys(TABS) as TabKey[]).map((key) => {
            const active = tab === key
            const { label, Icon } = TABS[key]
            const showBadge = key === 'approvals' && heldCount !== null && heldCount > 0

            return (
              <a
                key={key}
                href={`#${key}`}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                  active
                    ? 'bg-white/12 text-[#F8F7F4]'
                    : 'text-[#D7D0C5]/85 hover:bg-white/6 hover:text-[#F8F7F4]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[#8A9646] transition-opacity duration-150 ${
                    active ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#8A9646]' : 'text-[#D7D0C5]/80'}`} />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="rounded-md bg-[#EEDADA] px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#36452B]">
                    {heldCount}
                  </span>
                )}
              </a>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-md border border-white/10 bg-[#2B3822] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D7D0C5]">
              <IconSliders className="h-3.5 w-3.5 text-[#8A9646]" />
              <span>Policy guardrails</span>
            </div>
            {policy ? (
              <dl className="mt-2.5 space-y-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[#D7D0C5]/80">Impact limit</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#F8F7F4]">
                    {inr(policy.impact_limit_abs)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-[#D7D0C5]/80">Drift budget</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#F8F7F4]">
                    {inr(policy.drift_budget)}
                  </dd>
                </div>
                <div className="border-t border-white/10 pt-2">
                  <dt className="text-[#D7D0C5]/80">Protected cells</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {policy.protected.map((cell) => (
                      <span
                        key={cell}
                        className="rounded bg-[#36452B] px-1.5 py-0.5 font-mono text-[11px] text-[#F8F7F4]"
                      >
                        {cell}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-[#D7D0C5]/75">
                Connect backend API to inspect active policy limits.
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Top Chrome */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-[#36452B] px-4 py-3 text-[#F8F7F4]">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Delta Gate logo"
              className="h-7 w-7 rounded bg-[#F8F7F4] object-contain p-0.5"
            />
            <span className="text-sm font-bold tracking-tight">Delta Gate</span>
          </div>
          {policy && (
            <span className="font-mono text-[11px] text-[#D7D0C5]">
              Limit {inr(policy.impact_limit_abs)} · Drift {inr(policy.drift_budget)}
            </span>
          )}
        </div>
        <nav
          aria-label="Mobile Navigation"
          className="flex overflow-x-auto border-b border-[#D7D0C5] bg-[#F8F7F4] px-2"
        >
          {(Object.keys(TABS) as TabKey[]).map((key) => {
            const active = tab === key
            const { label, Icon } = TABS[key]
            const showBadge = key === 'approvals' && heldCount !== null && heldCount > 0
            return (
              <a
                key={key}
                href={`#${key}`}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#36452B] text-[#36452B]'
                    : 'border-transparent text-[#36452B]/70 hover:text-[#36452B]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-[#8A9646]' : ''}`} />
                <span>{label}</span>
                {showBadge && (
                  <span className="rounded-md bg-[#EEDADA] px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#36452B]">
                    {heldCount}
                  </span>
                )}
              </a>
            )
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="md:pl-56 lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-[#D7D0C5] bg-[#F8F7F4]/95 backdrop-blur-sm">
          <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="text-base font-bold text-[#36452B]">{currentTab.label}</h1>
              <p className="hidden text-xs text-[#36452B]/75 sm:inline">{currentTab.description}</p>
            </div>
            <HeaderVerificationBanner workbooks={workbooks} />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 pb-12 sm:px-6 lg:px-8">
          <div key={tab} className="animate-dg-enter">
            <Tab />
          </div>
        </main>
      </div>
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
