import { CardRulesText } from "@/features/card-presentation";
import type { SideboardingCardView } from "@/shared/game";
import { cn } from "@/shared/utils/cn";
import { CardFace } from "./card-face";
import { CardMetadata } from "./card-metadata";

export function CardInspector({
  card,
  className,
}: {
  card: SideboardingCardView | null;
  className?: string;
}) {
  return (
    <section className={cn("flex min-h-48 flex-1 flex-col p-2.5", className)}>
      <h2 className="mb-2 text-sm font-semibold text-slate-100">Preview</h2>

      <div className="min-h-0 flex-1 [container-type:size]">
        <CardFace
          card={card}
          className="mx-auto w-[min(100cqw,calc(100cqh*5/7),14.5rem)]"
        />
      </div>

      {card && (
        <div className="mt-2.5 max-h-28 shrink-0 overflow-y-auto pr-1">
          <h3 className="font-semibold leading-tight text-slate-100">
            {card.name}
          </h3>
          <div className="mt-1">
            <CardMetadata card={card} />
          </div>
          {card.rulesText.trim() && (
            <div className="mt-2.5 text-xs leading-5 text-slate-300">
              <CardRulesText text={card.rulesText} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
