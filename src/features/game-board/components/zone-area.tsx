import { cn } from "@/shared/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { FC, PropsWithChildren } from "react";
import type {
  BoardDropLocation,
  BoardLocationDropStatus,
} from "../drag-and-drop/location-drag-actions";
import { useBoardLocationDroppable } from "../drag-and-drop/use-board-location-droppable";

const zoneAreaRoot = cva(
  [
    "relative flex items-center border rounded-md min-h-0 overflow-visible select-none",
    "bg-slate-950/20 supports-backdrop-filter:bg-slate-950/10 supports-backdrop-filter:backdrop-blur-[2px]",
    "transition-[border-color,background-color,box-shadow] duration-700 ease-out",
  ],
  {
    variants: {
      visualState: {
        idle: [
          "border-cyan-100/12",
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]",
        ],
        highlighted: [
          "border-cyan-200/35 bg-cyan-300/5",
          "shadow-[inset_0_0_0_1px_rgba(103,232,249,0.10),0_0_18px_rgba(34,211,238,0.10)]",
        ],
        destination: [
          "border-cyan-200/70 bg-cyan-300/6",
          "shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_0_28px_rgba(34,211,238,0.18)]",
        ],
        legalDrop: [
          "border-cyan-200/70 bg-cyan-300/6 ring-1 ring-cyan-300/55",
          "shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_0_28px_rgba(34,211,238,0.18),0_0_18px_rgba(103,232,249,0.12)]",
        ],
        legalDropOver: [
          "border-emerald-200/80 bg-emerald-300/[0.08] ring-2 ring-emerald-300/90",
          "shadow-[inset_0_0_0_1px_rgba(110,231,183,0.28),0_0_24px_rgba(110,231,183,0.28)]",
        ],
        invalidDropOver: [
          "border-rose-300/70 bg-rose-500/[0.06] ring-2 ring-rose-300/70",
          "shadow-[0_0_18px_rgba(251,113,133,0.16)]",
        ],
      },
    },
    defaultVariants: {
      visualState: "idle",
    },
  },
);

const zoneAreaGlow = cva(
  [
    "absolute inset-0 rounded-[inherit] pointer-events-none",
    "bg-cyan-300/5 blur-[1px]",
    "transition-opacity duration-700 ease-out",
  ],
  {
    variants: {
      visible: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
    defaultVariants: {
      visible: false,
    },
  },
);

const zoneAreaRing = cva(
  [
    "absolute inset-0 rounded-[inherit] pointer-events-none",
    "ring-1 ring-inset",
    "transition-[--tw-ring-color] duration-700 ease-out",
  ],
  {
    variants: {
      visualState: {
        idle: "ring-cyan-200/0",
        highlighted: "ring-cyan-200/20",
        destination: "ring-cyan-200/40",
        legalDrop: "ring-cyan-200/40",
        legalDropOver: "ring-emerald-200/45",
        invalidDropOver: "ring-rose-200/35",
      },
    },
    defaultVariants: {
      visualState: "idle",
    },
  },
);

const zoneAreaCounter = cva(
  [
    "top-1 right-1 z-10 absolute font-mono text-[10px]",
    "transition-colors duration-700 ease-out pointer-events-none",
  ],
  {
    variants: {
      emphasized: {
        true: "text-cyan-100/75",
        false: "text-white/60",
      },
    },
    defaultVariants: {
      emphasized: false,
    },
  },
);

const zoneAreaContent = cva(
  "z-1 relative flex flex-1 items-center min-w-0 min-h-full overflow-visible",
  {
    variants: {
      density: {
        compact: "gap-1.5 px-2 py-2",
        default: "gap-2 px-3 py-2.5",
        roomy: "gap-3 px-4 py-3",
      },
      centered: {
        true: "justify-center",
        false: "",
      },
    },
    defaultVariants: {
      density: "default",
      centered: false,
    },
  },
);

type ZoneAreaVisualState = NonNullable<
  VariantProps<typeof zoneAreaRoot>["visualState"]
>;

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

function resolveZoneAreaVisualState({
  dropStatus,
  highlighted,
  isDestinationHighlighted,
}: {
  dropStatus: BoardLocationDropStatus;
  highlighted: boolean;
  isDestinationHighlighted: boolean;
}): ZoneAreaVisualState {
  if (dropStatus === "invalid-over") {
    return "invalidDropOver";
  }

  if (dropStatus === "legal-over") {
    return "legalDropOver";
  }

  if (dropStatus === "legal") {
    return "legalDrop";
  }

  if (isDestinationHighlighted) {
    return "destination";
  }

  if (highlighted) {
    return "highlighted";
  }

  return "idle";
}

function isDestinationVisualState(visualState: ZoneAreaVisualState) {
  return (
    visualState === "destination" ||
    visualState === "legalDrop" ||
    visualState === "legalDropOver"
  );
}

function isEmphasizedVisualState(visualState: ZoneAreaVisualState) {
  return visualState !== "idle";
}

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
  dropStatus = "idle",
  isDropEnabled = false,
}) => {
  const highlighted = Boolean(isHighlighted ?? isHightlighted);
  const visualState = resolveZoneAreaVisualState({
    dropStatus,
    highlighted,
    isDestinationHighlighted,
  });

  const hasTotalCardsCount = !totalCardsCount
    ? false
    : Object.values(totalCardsCount).reduce((acc, cur) => acc + cur, 0) > 0;

  const { setNodeRef } = useBoardLocationDroppable({
    disabled: !isDropEnabled || !dropLocation,
    location: dropLocation ?? { kind: "base" },
  });

  return (
    <div
      data-destination-highlighted={
        isDestinationVisualState(visualState) ? "true" : undefined
      }
      data-drop-status={dropStatus}
      data-zone-animation-id={animationZoneId}
      data-zone-visual-state={visualState}
      ref={dropLocation ? setNodeRef : undefined}
      className={cn(zoneAreaRoot({ visualState }), className)}
    >
      <div
        aria-hidden="true"
        className={zoneAreaGlow({
          visible: isEmphasizedVisualState(visualState),
        })}
      />

      <div
        aria-hidden="true"
        className={zoneAreaRing({
          visualState,
        })}
      />

      {hasTotalCardsCount && (
        <div
          className={zoneAreaCounter({
            emphasized: isEmphasizedVisualState(visualState),
          })}
        >
          {`${totalCardsCount?.ready}/${totalCardsCount?.total}`}
        </div>
      )}

      <div
        className={cn(
          zoneAreaContent({
            centered: isCentered,
            density,
          }),
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
