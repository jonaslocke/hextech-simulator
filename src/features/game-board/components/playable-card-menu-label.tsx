import { ResourceCost } from "./resource-cost";
import type { BoardPlayerProjection } from "../board-view-model";
import { getKeywordImagePath } from "@/features/card-presentation/lib/keyword-assets";

/* eslint-disable @next/next/no-img-element */

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
  const declaration = [presentation?.declarationLabel, ...mode.targets
    .filter((target) => target.maximum > 0)
    .map((target) => target.label)
    .filter((label): label is string => Boolean(label))]
    .filter((entry): entry is string => Boolean(entry));
  if (!preview || !presentation?.showCost) return <>
    <span>{renderPlayLabel(label)}</span>
    {declaration.length > 0 && <span className="block text-slate-400 text-[11px]">{declaration.join(" → ")}</span>}
  </>;
  return <span className="flex flex-col gap-0.5">
    <span>{renderPlayLabel(label)}</span>
    {declaration.length > 0 && <span className="text-slate-400 text-[11px]">{declaration.join(" → ")}</span>}
    <span className="inline-flex flex-wrap items-center gap-1 text-slate-300 text-[11px]">
      Cost: <ResourceCost energy={preview.energy} powerCosts={mode.poolPayment?.powerCosts ?? [{ amount: preview.effectivePower, domains: mode.poolPayment?.powerDomains ?? [] }]} />
    </span>
    {presentation.modifierSources.length > 0 && <span className="text-[11px] text-slate-400">{presentation.modifierSources.join(", ")}</span>}
  </span>;
}

function renderPlayLabel(label: string) {
  const markers = /\[(Flow|Repeat)\]/g;
  if (!markers.test(label)) return label;

  markers.lastIndex = 0;
  return (
    <span className="inline-flex items-center gap-1">
      {label.split(markers).map((part, index) => {
        if (part !== "Flow" && part !== "Repeat") return part;

        const asset = getKeywordImagePath(
          part === "Flow" ? "flow" : "repeat",
          "md",
        );
        return asset ? (
          <img
            alt={part}
            className="h-4 w-auto object-contain"
            key={`${part}-${index}`}
            src={asset}
          />
        ) : `[${part}]`;
      })}
    </span>
  );
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
