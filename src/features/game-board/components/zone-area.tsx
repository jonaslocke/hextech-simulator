import { cn } from "@/shared/utils/cn";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  animationZoneId?: string;
  className?: string;
  contentClassName?: string;
  density?: "compact" | "default" | "roomy";
  isCentered?: boolean;
  /**
   * Kept for compatibility with the previous typo in the public prop.
   */
  isHightlighted?: boolean;
  isHighlighted?: boolean;
  totalCardsCount?: {
    ready: number;
    total: number;
  };
}

const DENSITY_CLASS_NAMES: Record<NonNullable<Props["density"]>, string> = {
  compact: "gap-1.5 px-2 py-1.5",
  default: "gap-2 px-3 py-2",
  roomy: "gap-3 px-4 py-3",
};

export const ZoneArea: FC<Props> = ({
  animationZoneId,
  children,
  className,
  contentClassName,
  density = "default",
  isCentered = false,
  isHightlighted = false,
  isHighlighted,
  totalCardsCount,
}) => {
  const hasTotalCardsCount = !totalCardsCount
    ? false
    : Object.values(totalCardsCount).reduce((acc, cur) => acc + cur, 0) > 0;

  const highlighted = isHighlighted ?? isHightlighted;

  return (
    <div
      data-zone-animation-id={animationZoneId}
      className={cn(
        "relative flex items-center border rounded-md min-h-0 overflow-visible",
        highlighted ? "border-[#88F6F6]" : "border-white/15",
        className,
      )}
    >
      {hasTotalCardsCount && (
        <div className="top-1 right-1 z-20 absolute font-mono text-[10px] text-white/65 pointer-events-none">
          {`${totalCardsCount?.ready}/${totalCardsCount?.total}`}
        </div>
      )}

      <div
        className={cn(
          "flex items-center w-full min-w-0 min-h-full overflow-visible",
          DENSITY_CLASS_NAMES[density],
          isCentered && "justify-center",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
