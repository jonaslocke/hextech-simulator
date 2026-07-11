import { DomainIcon, EnergyResource, formatDomain } from "@/features/card-presentation";
import type { SideboardingCardView } from "@/shared/game";

export function CardMetadata({ card }: { card: SideboardingCardView }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-500 text-xs">
      <span>{card.type}</span>
      {card.supertype && <Badge label={card.supertype} />}
      {card.energy !== null && (
        <span aria-label={`${card.energy} Energy`} className="inline-flex items-center">
          <EnergyResource compact value={card.energy} />
        </span>
      )}
      {card.power !== null && card.power > 0 && (
        <Badge label={`${card.power} Power`} />
      )}
      {card.domains.map((domain) => (
        <span
          aria-label={`${formatDomain(domain)} domain`}
          className="inline-flex items-center"
          key={domain}
          title={`${formatDomain(domain)} domain`}
        >
          <DomainIcon compact decorative domain={domain} />
        </span>
      ))}
    </span>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded border border-white/10 bg-white/5 px-1 py-0 text-[10px] text-slate-300">
      {label}
    </span>
  );
}
