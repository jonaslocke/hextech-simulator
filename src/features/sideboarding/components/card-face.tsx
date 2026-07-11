import type { SideboardingCardView } from "@/shared/game";
import { cn } from "@/shared/utils/cn";

export function CardFace({
  card,
  className,
  landscape = false,
}: {
  card: SideboardingCardView | null;
  className?: string;
  landscape?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-white/10 bg-slate-900",
        landscape ? "aspect-[7/5]" : "aspect-[5/7]",
        className,
      )}
    >
      {card?.imageUrl ? (
        <img
          alt={card.name}
          className="h-full w-full object-cover"
          src={card.imageUrl}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-3 text-center text-xs text-slate-500">
          {card?.name ?? "Card unavailable"}
        </div>
      )}
    </div>
  );
}
