import { savedByBanner, signedInr } from '../../format'
import type { Decision, Group, GroupDecision } from '../../types'

// One held edit in the approvals inbox. Sized to read from 3 metres: the ₹ impact is the biggest thing on it.
// Every number comes from the Decision (engine output); this component only formats.

const MAX_CELLS = 6

interface Props {
  decision: Decision
  onApprove: (editId: string) => void
  onDeny: (editId: string) => void
  busy?: boolean
}

export default function HeldCard({ decision, onApprove, onDeny, busy = false }: Props) {
  const check = decision.check
  const groupInfo = new Map<string, Group>((check?.groups ?? []).map((g) => [g.group_id, g]))
  const outputLabel = new Map((check?.outputs ?? []).map((o) => [o.cell, o.label]))
  const held = decision.groups.filter((g) => g.status !== 'PASS')
  const passed = decision.groups.filter((g) => g.status === 'PASS')
  const cantVerify = held.some((g) => g.status === 'CANT_VERIFY_HELD')

  return (
    <article
      aria-label={`Held edit ${decision.edit_id}`}
      className={`rounded-2xl border-l-8 bg-white shadow-md ${cantVerify ? 'border-slate-500' : 'border-amber-500'}`}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-8 py-5">
        <span
          className={`rounded-full px-4 py-1 text-lg font-bold tracking-wide text-white ${cantVerify ? 'bg-slate-600' : 'bg-amber-600'}`}
        >
          {cantVerify ? "HELD · CAN'T VERIFY" : 'HELD'}
        </span>
        <span className="text-lg text-slate-600">
          Agent session <b className="font-mono text-slate-900">{decision.session_id}</b>
        </span>
        <span className="ml-auto font-mono text-base text-slate-500">{decision.edit_id}</span>
      </header>

      <div className="space-y-6 px-8 py-6">
        {passed.length > 0 && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-lg text-emerald-900">
            ✓ {passed.map((g) => groupInfo.get(g.group_id)?.label ?? g.group_id).join('; ')}: passed and
            committed{decision.committed_version && <> as version <span className="font-mono">{decision.committed_version.slice(0, 8)}</span></>}.
            The part below is waiting for you.
          </p>
        )}

        {held.map((g) => (
          <HeldGroup key={g.group_id} decision={g} group={groupInfo.get(g.group_id)} outputLabel={outputLabel} />
        ))}

        {check && <p className="text-base text-slate-500">{savedByBanner(check.verification.saved_by)}</p>}
      </div>

      <footer className="flex justify-end gap-4 border-t border-slate-200 px-8 py-5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeny(decision.edit_id)}
          className="h-14 rounded-xl border-2 border-red-600 px-8 text-xl font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-4 focus-visible:outline-red-300 disabled:opacity-50"
        >
          Deny
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(decision.edit_id)}
          className="h-14 rounded-xl bg-slate-900 px-8 text-xl font-semibold text-white hover:bg-slate-700 focus-visible:outline-4 focus-visible:outline-slate-400 disabled:opacity-50"
        >
          Approve
        </button>
      </footer>
    </article>
  )
}

function HeldGroup({ decision, group, outputLabel }: {
  decision: GroupDecision
  group: Group | undefined
  outputLabel: Map<string, string>
}) {
  const cells = group?.cells ?? []
  const unknown = decision.status === 'CANT_VERIFY_HELD'

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-3xl font-semibold leading-tight">{group?.label ?? decision.group_id}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-lg text-slate-600">
          {group && <span className="rounded bg-slate-200 px-2 py-0.5 text-base font-medium uppercase">{group.type}</span>}
          <span className="font-mono">
            {cells.slice(0, MAX_CELLS).join(', ')}
            {cells.length > MAX_CELLS && ` and ${cells.length - MAX_CELLS} more`}
          </span>
        </p>
      </div>

      <div className="rounded-lg bg-amber-50 px-4 py-3 text-xl text-amber-950">
        <span className="font-semibold">Why held: </span>
        {decision.reasons.join(' · ')}
      </div>

      {unknown ? (
        <div className="rounded-xl border-2 border-dashed border-slate-400 px-6 py-5">
          <div className="text-4xl font-bold text-slate-700">Impact unknown</div>
          <p className="mt-1 text-lg text-slate-600">The engine can't verify this change, so it shows no number. Decide on the cells above.</p>
        </div>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {decision.impacts.map((i) => (
            <div key={i.cell} className="rounded-xl bg-slate-50 px-6 py-4">
              <dt className="text-lg text-slate-600">
                {outputLabel.get(i.cell) ?? i.cell} <span className="font-mono text-base text-slate-400">{i.cell}</span>
              </dt>
              <dd className="text-5xl font-bold tabular-nums">{signedInr(i.delta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
