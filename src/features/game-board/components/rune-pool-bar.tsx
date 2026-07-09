import {
  DomainIcon,
  EnergyResource,
  formatDomain,
} from "@/features/card-presentation";
import { cn } from "@/shared/utils/cn";
import type { ReactNode } from "react";
import type { BoardPlayerProjection } from "../board-view-model";

type RunePool = BoardPlayerProjection["runePool"];

export function RunePoolBar({ runePool }: { runePool: RunePool | undefined }) {
  const energy = runePool?.energy ?? 0;
  const conditionalEnergy = runePool?.conditionalEnergy ?? {};
  const power = runePool?.power ?? {};

  const conditionalEntries = Object.entries(conditionalEnergy).filter(
    ([, entry]) => entry.amount > 0,
  );

  const powerEntries = Object.entries(power)
    .filter(([, amount]) => amount > 0)
    .sort(
      ([left], [right]) => powerDomainOrder(left) - powerDomainOrder(right),
    );

  const hasRunePool =
    energy > 0 || powerEntries.length > 0 || conditionalEntries.length > 0;

  if (!hasRunePool) {
    return null;
  }

  return (
    <div
      aria-label="Rune pool"
      className={cn(
        "relative flex items-center gap-2 px-2.5 py-1.5 border rounded-lg min-h-10 overflow-hidden text-slate-100 text-xs",
        "border-cyan-100/12 bg-slate-950/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_10px_28px_rgba(0,0,0,0.18)] ring-1 ring-cyan-300/5",
        "supports-backdrop-filter:bg-slate-950/14 supports-backdrop-filter:backdrop-blur-md",
      )}
      role="status"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_10%_50%,rgba(103,232,249,0.08),transparent_38%),linear-gradient(90deg,rgba(255,255,255,0.035),transparent_55%)] pointer-events-none"
      />

      <span className="relative font-mono font-semibold text-[10px] text-cyan-100/65 uppercase tracking-[0.18em] shrink-0">
        Rune pool
      </span>

      <div className="relative flex flex-1 items-center gap-1.5 min-w-0 overflow-auto [scrollbar-color:rgba(103,232,249,0.22)_transparent]">
        {energy > 0 && (
          <RunePoolChip label="Energy" tone="energy" title={`${energy} Energy`}>
            <EnergyResource compact value={energy} />
          </RunePoolChip>
        )}

        {conditionalEntries.map(([id, entry]) => (
          <RunePoolChip
            key={id}
            label="Spell Energy"
            tone="spell"
            title={`${entry.amount} spell-only Energy`}
          >
            <EnergyResource compact value={entry.amount} />
          </RunePoolChip>
        ))}

        {powerEntries.map(([domain, amount]) => (
          <RunePoolChip
            key={domain}
            label={formatDomain(domain)}
            tone="power"
            title={`${amount} ${formatDomain(domain)} Power`}
          >
            <DomainIcon decorative domain={domain} />
            <span className="font-mono font-bold tabular-nums text-white">
              {amount}
            </span>
          </RunePoolChip>
        ))}
      </div>
    </div>
  );
}

function RunePoolChip({
  children,
  label,
  title,
  tone,
}: {
  children: ReactNode;
  label: string;
  title: string;
  tone: "energy" | "power" | "spell";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] px-2 py-1 border rounded-md shrink-0",
        tone === "energy" &&
          "border-amber-200/25 bg-amber-300/10 text-amber-100",
        tone === "spell" && "border-cyan-200/25 bg-cyan-300/10 text-cyan-100",
        tone === "power" &&
          "border-violet-200/25 bg-violet-300/10 text-violet-100",
      )}
      title={title}
    >
      <span className="text-[11px] text-current/75">{label}</span>
      {children}
    </span>
  );
}

function powerDomainOrder(domain: string) {
  const order = ["Body", "Calm", "Chaos", "Fury", "Mind", "Order", "Rainbow"];
  const formattedDomain = formatDomain(domain);
  const orderIndex = order.indexOf(formattedDomain);

  return orderIndex === -1 ? order.length : orderIndex;
}
