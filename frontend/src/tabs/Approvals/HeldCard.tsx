import { IconAlertTriangle, IconCheckCircle } from '../../components/Icons'
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
    <article aria-label={`Held edit ${decision.edit_id}`} className="ledger-card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D7D0C5] bg-[#F8F7F4] px-5 py-3.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wide ${
              cantVerify
                ? 'border-[#D7D0C5] bg-[#F0EDE6] text-[#36452B]'
                : 'border-[#A44A3F]/30 bg-[#EEDADA] text-[#A44A3F]'
            }`}
          >
            <IconAlertTriangle className="h-3.5 w-3.5" />
            <span>{cantVerify ? "Held · Can't verify" : 'Held'}</span>
          </span>
          <span className="text-sm text-[#36452B]/75">
            Agent session <strong className="font-mono font-semibold text-[#36452B]">{decision.session_id}</strong>
          </span>
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {passed.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-md border border-[#8A9646]/35 bg-[#8A9646]/10 px-4 py-3 text-sm text-[#36452B]">
            <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8A9646]" />
            <span>
              <strong className="font-semibold">
                {passed.map((g) => groupInfo.get(g.group_id)?.label ?? g.group_id).join('; ')}
              </strong>
              : passed and committed. The held group below awaits your decision.
            </span>
          </div>
        )}

        <div className="space-y-6">
          {held.map((g) => (
            <HeldGroup
              key={g.group_id}
              decision={g}
              group={groupInfo.get(g.group_id)}
              outputLabel={outputLabel}
            />
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D7D0C5] bg-[#F8F7F4]/70 px-5 py-4 sm:px-6">
        <div className="text-xs text-[#36452B]/75">
          {check ? savedByBanner(check.verification.saved_by) : 'Policy gate review'}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeny(decision.edit_id)}
            className="pressable rounded-md border border-[#A44A3F] bg-[#FFFFFF] px-5 py-2 text-sm font-semibold text-[#A44A3F] hover:bg-[#EEDADA]/55 disabled:opacity-50"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(decision.edit_id)}
            className="pressable rounded-md bg-[#36452B] px-5 py-2 text-sm font-semibold text-[#F8F7F4] hover:bg-[#2B3822] disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </footer>
    </article>
  )
}

function HeldGroup({
  decision,
  group,
  outputLabel,
}: {
  decision: GroupDecision
  group: Group | undefined
  outputLabel: Map<string, string>
}) {
  const cells = group?.cells ?? []
  const unknown = decision.status === 'CANT_VERIFY_HELD'

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-bold leading-snug text-[#36452B]">
          {group?.label ?? decision.group_id}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {group && (
            <span className="rounded border border-[#D7D0C5] bg-[#F0EDE6] px-2 py-0.5 font-mono font-semibold uppercase text-[#36452B]">
              {group.type}
            </span>
          )}
          <span className="font-mono text-[#36452B]/75">
            {cells.slice(0, MAX_CELLS).join(', ')}
            {cells.length > MAX_CELLS && ` and ${cells.length - MAX_CELLS} more`}
          </span>
        </div>
      </div>

      <div className="rounded-md border border-[#A44A3F]/25 bg-[#EEDADA]/45 px-4 py-2.5 text-sm text-[#36452B]">
        <span className="font-bold text-[#A44A3F]">Why held: </span>
        <span>{decision.reasons.join(' · ')}</span>
      </div>

      {unknown ? (
        <div className="rounded-lg border border-dashed border-[#D7D0C5] bg-[#F8F7F4] px-5 py-4">
          <div className="text-2xl font-bold text-[#36452B]">Impact unknown</div>
          <p className="mt-1 text-sm text-[#36452B]/75">
            The engine cannot verify this change, so no figure is shown. Review the cells above before deciding.
          </p>
        </div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          {decision.impacts.map((i) => (
            <div key={i.cell} className="rounded-lg border border-[#D7D0C5] bg-[#F8F7F4] px-4 py-3.5">
              <dt className="flex items-center justify-between gap-2 text-xs font-medium text-[#36452B]/75">
                <span>{outputLabel.get(i.cell) ?? i.cell}</span>
                <span className="rounded bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[11px] text-[#36452B]">
                  {i.cell}
                </span>
              </dt>
              <dd className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#36452B]">
                {signedInr(i.delta)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
