import { useEffect, useState } from 'react'
import { fetchWorkbooks, type WorkbookSummary } from './api'
import { savedByBanner } from './format'
import Approvals from './tabs/Approvals'
import Audit from './tabs/Audit'
import Check from './tabs/Check'

// The page shell: three tabs, plus one status line per managed workbook with the honest saved-values wording
// (pending and none both read "Not verifiable against saved values"). The active tab lives in the URL hash, so
// the runbook can open #approvals directly. Layout and look are Nitika's to restyle.
const TABS = { check: { label: 'Check', Tab: Check }, approvals: { label: 'Approvals', Tab: Approvals }, audit: { label: 'Audit', Tab: Audit } }
type TabKey = keyof typeof TABS
const fromHash = (): TabKey => {
  const key = window.location.hash.slice(1)
  return key in TABS ? (key as TabKey) : 'check'
}
const POLL_MS = 5000

export default function App() {
  const [tab, setTab] = useState<TabKey>(fromHash)
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null) // null: the API is not reachable

  useEffect(() => {
    const onHash = () => setTab(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let live = true
    const load = () => fetchWorkbooks().then((w) => live && setWorkbooks(w), () => live && setWorkbooks(null))
    void load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  const { Tab } = TABS[tab]
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
          <h1 className="text-2xl font-bold tracking-tight">Delta Gate</h1>
          <nav aria-label="Tabs" className="flex gap-2">
            {(Object.keys(TABS) as TabKey[]).map((key) => (
              <a
                key={key}
                href={`#${key}`}
                aria-current={tab === key ? 'page' : undefined}
                className={`rounded-lg px-5 py-2 text-lg font-semibold ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {TABS[key].label}
              </a>
            ))}
          </nav>
          <WorkbookStatus workbooks={workbooks} />
        </div>
      </header>
      <main>
        <Tab />
      </main>
    </div>
  )
}

function WorkbookStatus({ workbooks }: { workbooks: WorkbookSummary[] | null }) {
  if (workbooks === null) {
    return <p className="ml-auto text-base text-amber-800">API offline: tabs show sample data</p>
  }
  if (workbooks.length === 0) {
    return <p className="ml-auto text-base text-slate-500">No workbook registered</p>
  }
  return (
    <ul className="ml-auto space-y-0.5 text-right text-base">
      {workbooks.map((w) => (
        <li key={w.workbook_id}>
          <span className="font-semibold">{w.name}</span>
          <span className="text-slate-600">: {savedByBanner(w.saved_by)}</span>
          <span className="ml-2 font-mono text-sm text-slate-400" title={w.current_version}>{w.current_version.slice(0, 8)}</span>
          {w.source === 'unmanaged' && <span className="ml-2 font-semibold text-red-700">changed outside Delta Gate</span>}
        </li>
      ))}
    </ul>
  )
}
