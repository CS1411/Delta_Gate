import StructuralPanel from './components/StructuralPanel'
import checkV2V3 from './fixtures/check_v2_v3.json'
import Approvals from './tabs/Approvals'
import type { CheckResult } from './types'

// Placeholder until P4's three-tab shell lands: the Check tab's structural panel, then the Approvals tab.
export default function App() {
  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <h2 className="text-3xl font-bold">Structural findings</h2>
        <StructuralPanel check={checkV2V3 as CheckResult} />
      </div>
      <Approvals />
    </>
  )
}
