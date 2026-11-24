import { savedByBanner, signedInr } from '../../format'
import type { Decision, Group, GroupDecision } from '../../types'

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
      className="rounded-2xl border border-[#7F7D74]/30 bg-[#D7D0C5]/40 shadow-xs backdrop-blur-md overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#D7D0C5]/70 bg-white/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[#D7D0C5] bg-[#EEDADA] px-3 py-0.5 font-mono text-xs font-bold uppercase text-[#36452B]">
            {cantVerify ? "HELD BY POLICY · CAN'T VERIFY" : 'HELD BY POLICY'}
          </span>
          <span className="text-xs text-[#7F7D74]">
            Session: <b className="font-mono text-[#36452B]">{decision.session_id}</b>
          </span>
        </div>
        <span className="font-mono text-xs text-[#7F7D74]">{decision.edit_id}</span>
      </header>

      <div className="space-y-5 px-6 py-5">
        {passed.length > 0 && (
          <p className="rounded-xl border border-[#8A9646]/30 bg-[#8A9646]/15 px-4 py-2.5 text-xs text-[#36452B]">
            ✓ <b>Auto-committed safe changes:</b> {passed.map((g) => groupInfo.get(g.group_id)?.label ?? g.group_id).join('; ')}
            {decision.committed_version && <> (v{decision.committed_version.slice(0, 8)})</>}. Remaining modifications held below for human review.
          </p>
        )}

        {held.map((g) => (
          <HeldGroup key={g.group_id} decision={g} group={groupInfo.get(g.group_id)} outputLabel={outputLabel} />
        ))}

        {check && (
          <p className="font-mono text-[11px] text-[#7F7D74] border-t border-[#D7D0C5]/60 pt-2">
            Verification: {savedByBanner(check.verification.saved_by)}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-3 border-t border-[#D7D0C5]/70 bg-white/40 px-6 py-3.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeny(decision.edit_id)}
          className="rounded-xl border border-[#D7D0C5] bg-[#EEDADA] px-5 py-2 text-xs font-bold text-[#36452B] shadow-xs hover:bg-[#EEDADA]/80 focus-visible:outline-4 focus-visible:outline-[#D7D0C5] disabled:opacity-50 transition"
        >
          Reject / Rollback
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(decision.edit_id)}
          className="rounded-xl border border-[#36452B] bg-[#36452B] px-5 py-2 text-xs font-bold text-[#F8F7F4] shadow-xs hover:bg-[#36452B]/90 focus-visible:outline-4 focus-visible:outline-[#8A9646] disabled:opacity-50 transition"
        >
          Approve &amp; Release
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
    <section className="space-y-3 rounded-xl border border-[#D7D0C5]/70 bg-white/80 p-5 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          {group && (
            <span className="rounded bg-[#D7D0C5]/50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#36452B]">
              {group.type}
            </span>
          )}
          <h4 className="text-lg font-serif font-bold text-[#36452B]">{group?.label ?? decision.group_id}</h4>
        </div>
        <div className="font-mono text-xs text-[#7F7D74]">
          Target cells: <span className="font-bold text-[#36452B]">{cells.slice(0, MAX_CELLS).join(', ')}</span>
          {cells.length > MAX_CELLS && ` and ${cells.length - MAX_CELLS} more`}
        </div>
      </div>

      <div className="rounded-lg border border-[#D7D0C5] bg-[#EEDADA]/60 px-3.5 py-2 text-xs text-[#36452B]">
        <span className="font-bold">Triggered policy rule: </span>
        {decision.reasons.join(' · ')}
      </div>

      {unknown ? (
        <div className="rounded-lg border border-dashed border-[#D7D0C5] p-4 bg-[#F8F7F4] text-xs">
          <div className="font-bold text-[#36452B]">Impact unknown</div>
          <p className="text-[#7F7D74] mt-0.5">The engine cannot deterministically verify this formula, so it computes no attribution.</p>
        </div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {decision.impacts.map((i) => (
            <div key={i.cell} className="rounded-lg bg-[#F8F7F4] border border-[#D7D0C5]/60 p-3">
              <dt className="text-xs text-[#7F7D74] flex justify-between">
                <span>{outputLabel.get(i.cell) ?? i.cell}</span>
                <span className="font-mono text-[#36452B]">{i.cell}</span>
              </dt>
              <dd className="text-2xl font-bold font-mono tabular-nums text-[#36452B] mt-1">{signedInr(i.delta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
