import { useState } from 'react'
import cantVerify from '../../fixtures/decision_cant_verify.json'
import driftHeld from '../../fixtures/decision_drift_held.json'
import partial from '../../fixtures/decision_partial.json'
import type { Decision } from '../../types'
import HeldCard from './HeldCard'

// Approvals inbox. For now it shows engine-generated fixtures (scripts/make_fixtures.py);
// the live version polls GET /api/edits?status=held every 2 s once P1's endpoints are merged.
const FIXTURES = [partial, driftHeld, cantVerify] as Decision[]

export default function Approvals() {
  const [inbox, setInbox] = useState(FIXTURES)
  const remove = (editId: string) => setInbox((d) => d.filter((x) => x.edit_id !== editId))

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <h2 className="text-3xl font-bold">Approvals <span className="text-slate-500">({inbox.length} held)</span></h2>
      {inbox.length === 0 && <p className="text-xl text-slate-600">Nothing is waiting for approval.</p>}
      {inbox.map((d) => <HeldCard key={d.edit_id} decision={d} onApprove={remove} onDeny={remove} />)}
    </div>
  )
}
