import { useState } from 'react'
import Approvals from './tabs/Approvals'
import Audit from './tabs/Audit'

// Placeholder until P4's three-tab shell lands (it replaces this file): a plain switch between P2's tabs.
const TABS = { Approvals, Audit } as const

export default function App() {
  const [tab, setTab] = useState<keyof typeof TABS>('Approvals')
  const Tab = TABS[tab]
  return (
    <>
      <nav className="flex gap-2 border-b border-slate-200 bg-white px-4 py-3">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((name) => (
          <button key={name} type="button" onClick={() => setTab(name)} aria-current={tab === name}
            className={`rounded-lg px-5 py-2 text-lg font-semibold ${tab === name ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
            {name}
          </button>
        ))}
      </nav>
      <Tab />
    </>
  )
}
