import { cn } from "@/shared/utils/cn";
import { FC, PropsWithChildren } from "react";
import { boardLocationDropFeedbackClassName } from "../drag-and-drop/drop-feedback";
import type {
  BoardDropLocation,
  BoardLocationDropStatus,
} from "../drag-and-drop/location-drag-actions";
import { useBoardLocationDroppable } from "../drag-and-drop/use-board-location-droppable";

interface Props extends PropsWithChildren {
  animationZoneId?: string;
  className?: string;
  contentClassName?: string;
  density?: "compact" | "default" | "roomy";
  isCentered?: boolean;
  isDestinationHighlighted?: boolean;
  isHighlighted?: boolean;
  /**
   * Backwards-compatible typo kept so existing consumers do not break.
   * Prefer `isHighlighted` for new usages.
   */
  isHightlighted?: boolean;
  totalCardsCount?: {
    ready: number;
    total: number;
  };
  dropLocation?: BoardDropLocation;
  dropStatus?: BoardLocationDropStatus;
  isDropEnabled?: boolean;
}

const densityClassNames = {
  compact: "gap-1.5 px-2 py-2",
  default: "gap-2 px-3 py-2.5",
  roomy: "gap-3 px-4 py-3",
} satisfies Record<NonNullable<Props["density"]>, string>;

export const ZoneArea: FC<Props> = ({
  animationZoneId,
  children,
  className,
  contentClassName,
  density = "default",
  isCentered = false,
  isDestinationHighlighted = false,
  isHighlighted,
  isHightlighted,
  totalCardsCount,
  dropLocation,
  dropStatus,
  isDropEnabled,
}) => {
  const highlighted = Boolean(isHighlighted ?? isHightlighted);
  const hasTotalCardsCount = !totalCardsCount
    ? false
    : Object.values(totalCardsCount).reduce((acc, cur) => acc + cur, 0) > 0;

  const { setNodeRef } = useBoardLocationDroppable({
    disabled: !isDropEnabled || !dropLocation,
    location: dropLocation ?? { kind: "base" },
  });

  const dropFeedbackClassName = boardLocationDropFeedbackClassName(dropStatus);
  const isDropHighlighted =
    dropStatus === "legal" || dropStatus === "legal-over";

  const isVisuallyDestinationHighlighted =
    isDestinationHighlighted || isDropHighlighted;

  return (
    <div
      data-zone-animation-id={animationZoneId}
      data-destination-highlighted={
        isVisuallyDestinationHighlighted ? "true" : undefined
      }
      className={cn(
        "relative flex items-center border rounded-md min-h-0 overflow-visible select-none",
        "bg-slate-950/20 supports-backdrop-filter:bg-slate-950/10 supports-backdrop-filter:backdrop-blur-[2px]",
        "transition-[border-color,background-color,box-shadow] duration-700 ease-out",
        highlighted
          ? "border-cyan-200/35 bg-cyan-300/5 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.10),0_0_18px_rgba(34,211,238,0.10)]"
          : "border-cyan-100/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]",
        isVisuallyDestinationHighlighted &&
          "border-cyan-200/70 bg-cyan-300/6 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_0_28px_rgba(34,211,238,0.18)]",
        dropFeedbackClassName,
        className,
      )}
      ref={dropLocation ? setNodeRef : undefined}
      data-drop-status={dropStatus}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-[inherit] pointer-events-none",
          "bg-cyan-300/5 opacity-0 blur-[1px]",
          "transition-opacity duration-700 ease-out",
          (highlighted || isVisuallyDestinationHighlighted) && "opacity-100",
        )}
      />

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-[inherit] pointer-events-none",
          "ring-1 ring-inset ring-cyan-200/0",
          "transition-[--tw-ring-color] duration-700 ease-out",
          highlighted && "ring-cyan-200/20",
          isVisuallyDestinationHighlighted && "ring-cyan-200/40",
        )}
      />

      {hasTotalCardsCount && (
        <div
          className={cn(
            "top-1 right-1 z-10 absolute font-mono text-[10px] transition-colors duration-700 ease-out pointer-events-none",
            highlighted || isVisuallyDestinationHighlighted
              ? "text-cyan-100/75"
              : "text-white/60",
          )}
        >
          {`${totalCardsCount?.ready}/${totalCardsCount?.total}`}
        </div>
      )}

      <div
        className={cn(
          "z-1 relative flex flex-1 items-center min-w-0 min-h-full overflow-visible",
          densityClassNames[density],
          isCentered && "justify-center",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
