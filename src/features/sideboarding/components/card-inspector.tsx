import { CardRulesText } from "@/features/card-presentation";
import type { SideboardingCardView } from "@/shared/game";
import { CardMetadata } from "./card-metadata";
import { CardFace } from "./card-face";

export function CardInspector({ card }: { card: SideboardingCardView | null }) {
  return (
    <aside className="hidden min-h-0 flex-col rounded-md border border-white/10 bg-slate-950/75 p-2.5 text-slate-100 xl:flex">
      <CardFace card={card} />
      {card && (
        <div className="mt-2.5 min-h-0 overflow-y-auto">
          <h2 className="font-semibold leading-tight">{card.name}</h2>
          <div className="mt-1">
            <CardMetadata card={card} />
          </div>
          {card.rulesText.trim() && (
            <div className="mt-3 text-slate-300 text-xs leading-5">
              <CardRulesText text={card.rulesText} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
