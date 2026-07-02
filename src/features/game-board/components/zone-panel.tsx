import type { ProjectedAction, ProjectedZone } from "@/shared/game";
import { actionsForSource } from "../model";
import { ProjectedCard } from "./projected-card";

export function ZonePanel({
  actions,
  onAction,
  zone
}: {
  actions: readonly ProjectedAction[];
  onAction: (action: ProjectedAction) => void;
  zone: ProjectedZone;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {zone.kind} · {zone.count}
      </h3>
      {zone.cards.length ? (
        <div className="flex flex-wrap gap-3">
          {zone.cards.map((card) => (
            <ProjectedCard actions={actionsForSource(actions, card.instanceId)} card={card} key={card.instanceId} onAction={onAction} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-600">{zone.visibility === "secret" ? "Hidden cards" : "Empty"}</p>
      )}
    </section>
  );
}

