import { ResourceCost } from "./resource-cost";
import type { BoardPlayerProjection } from "../board-view-model";

export function PlayableCardMenuLabel({
  label: labelOverride,
  mode,
}: {
  label?: string;
  mode: BoardPlayerProjection["availablePaymentModes"][string][number];
}) {
  if (mode.resourceCost) {
    return <ResourceCostMenuLabel label={mode.label} cost={mode.resourceCost} />;
  }
  const preview = mode.costPreview;
  const presentation = mode.playCost;
  const label = labelOverride ?? presentation?.label ?? mode.label;
  if (!preview || !presentation?.showCost) return <>{label}</>;
  return <span className="flex flex-col gap-0.5">
    <span>{label}</span>
    <span className="inline-flex flex-wrap items-center gap-1 text-slate-300 text-[11px]">
      Cost: <ResourceCost energy={preview.energy} powerCosts={mode.poolPayment?.powerCosts ?? [{ amount: preview.effectivePower, domains: mode.poolPayment?.powerDomains ?? [] }]} />
    </span>
    {presentation.modifierSources.length > 0 && <span className="text-[11px] text-slate-400">{presentation.modifierSources.join(", ")}</span>}
  </span>;
}

export function ResourceCostMenuLabel({
  cost,
  label,
}: {
  cost: { energy: number; powerCosts: Array<{ amount: number; domains: string[] }> };
  label: string;
}) {
  return <span className="flex flex-col gap-0.5">
    <span>{label}</span>
    <span className="inline-flex flex-wrap items-center gap-1 text-slate-300 text-[11px]">
      Cost: <ResourceCost energy={cost.energy} powerCosts={cost.powerCosts} />
    </span>
  </span>;
}
