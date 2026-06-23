import { CardRulesText, DomainIcon, EnergyResource, MightResource } from "@/features/card-presentation";
import { Button } from "@/shared/components/button";
import type { ProjectedAction, ProjectedCardView } from "@/shared/game-v2";

export function ProjectedCard({
  actions,
  card,
  onAction
}: {
  actions: readonly ProjectedAction[];
  card: ProjectedCardView;
  onAction: (action: ProjectedAction) => void;
}) {
  return (
    <article className={`w-52 rounded-lg border bg-slate-900 p-3 shadow-lg ${card.exhausted ? "rotate-3 border-slate-600 opacity-75" : "border-cyan-300/25"}`}>
      {card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Card media is supplied by the approved catalog.
        <img alt={card.name} className="mb-2 aspect-[5/7] w-full rounded object-cover" src={card.imageUrl} />
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-cyan-200/70">{card.publicCode}</p>
          <h3 className="font-semibold text-slate-100">{card.name}</h3>
        </div>
        {card.energy !== null && <EnergyResource compact value={card.energy} />}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
        {card.domains.map((domain) => <DomainIcon compact domain={domain} key={domain} />)}
        <span>{[card.supertype, card.type].filter(Boolean).join(" · ")}</span>
      </div>
      {card.rulesText.trim() && <div className="mt-2 text-xs text-slate-300"><CardRulesText text={card.rulesText} /></div>}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
        {card.computedMight !== null && <MightResource compact value={card.computedMight} />}
        {card.damage > 0 && <span>Damage {card.damage}</span>}
      </div>
      {actions.length > 0 && (
        <div className="mt-3 grid gap-1">
          {actions.map((action) => (
            <Button disabled={!action.enabled} key={action.id} onClick={() => onAction(action)} size="sm" type="button" variant="secondary">
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
