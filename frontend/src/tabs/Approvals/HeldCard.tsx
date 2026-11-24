import { savedByBanner, signedInr } from '../../format'
import type { Decision, Group, GroupDecision } from '../../types'

// One held edit in the approvals inbox formatted strictly in 6-color Zen Bamboo palette.
// Sized to read from 3 metres: the ₹ impact is the biggest thing on it.
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
      className={`rounded-2xl border-l-8 bg-white border border-[#D7D0C5] shadow-sm ${
        cantVerify ? 'border-l-[#7F7D74]' : 'border-l-[#EEDADA]'
      }`}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#D7D0C5]/60 px-8 py-5">
        <span
          className={`rounded-full px-4 py-1 text-sm font-bold tracking-wide ${
            cantVerify ? 'bg-[#7F7D74] text-white' : 'bg-[#EEDADA] text-[#36452B]'
          }`}
        >
          {cantVerify ? "HELD · CAN'T VERIFY" : 'HELD'}
        </span>
        <span className="text-sm text-[#7F7D74]">
          Agent session <b className="font-mono text-[#36452B]">{decision.session_id}</b>
        </span>
        <span className="ml-auto font-mono text-xs text-[#7F7D74]">{decision.edit_id}</span>
      </header>

      <div className="space-y-6 px-8 py-6">
        {passed.length > 0 && (
          <p className="rounded-xl bg-[#8A9646]/10 border border-[#8A9646]/30 px-4 py-3 text-sm text-[#36452B]">
            ✓ {passed.map((g) => groupInfo.get(g.group_id)?.label ?? g.group_id).join('; ')}: passed and
            committed{decision.committed_version && <> as version <span className="font-mono">{decision.committed_version.slice(0, 8)}</span></>}.
            The part below is waiting for you.
          </p>
        )}

        {held.map((g) => (
          <HeldGroup key={g.group_id} decision={g} group={groupInfo.get(g.group_id)} outputLabel={outputLabel} />
        ))}

        {check && <p className="text-xs font-mono text-[#7F7D74]">{savedByBanner(check.verification.saved_by)}</p>}
      </div>

      <footer className="flex justify-end gap-4 border-t border-[#D7D0C5]/60 px-8 py-5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeny(decision.edit_id)}
          className="h-12 rounded-xl border border-[#D7D0C5] bg-[#EEDADA]/50 px-6 text-base font-semibold text-[#36452B] hover:bg-[#EEDADA] focus-visible:outline-4 focus-visible:outline-[#D7D0C5] disabled:opacity-50 transition"
        >
          Deny
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(decision.edit_id)}
          className="h-12 rounded-xl bg-[#36452B] px-6 text-base font-semibold text-white hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646] disabled:opacity-50 transition"
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
        <h3 className="text-2xl font-serif font-bold text-[#36452B] leading-tight">{group?.label ?? decision.group_id}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#7F7D74]">
          {group && <span className="rounded bg-[#D7D0C5]/40 px-2 py-0.5 text-xs font-mono font-medium uppercase text-[#36452B]">{group.type}</span>}
          <span className="font-mono text-xs text-[#7F7D74]">
            {cells.slice(0, MAX_CELLS).join(', ')}
            {cells.length > MAX_CELLS && ` and ${cells.length - MAX_CELLS} more`}
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA]/40 px-4 py-3 text-sm text-[#36452B]">
        <span className="font-semibold text-[#36452B]">Why held: </span>
        {decision.reasons.join(' · ')}
      </div>

      {unknown ? (
        <div className="rounded-xl border border-dashed border-[#D7D0C5] p-6 bg-[#F8F7F4]">
          <div className="text-2xl font-serif font-bold text-[#36452B]">Impact unknown</div>
          <p className="mt-1 text-sm text-[#7F7D74]">The engine can't verify this change, so it shows no number. Decide on the cells above.</p>
        </div>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          {decision.impacts.map((i) => (
            <div key={i.cell} className="rounded-xl bg-[#F8F7F4] border border-[#D7D0C5]/60 p-5">
              <dt className="text-sm text-[#7F7D74]">
                {outputLabel.get(i.cell) ?? i.cell} <span className="font-mono text-xs text-[#7F7D74]">{i.cell}</span>
              </dt>
              <dd className="text-4xl font-black tabular-nums text-[#36452B] mt-1">{signedInr(i.delta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
