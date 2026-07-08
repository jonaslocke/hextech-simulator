"use client";

import { FC, MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  CardRulesText,
  DomainIcon,
  EnergyResource,
  formatDomain,
  MightResource,
} from "@/features/card-presentation";
import { cn } from "@/shared/utils/cn";
import { Card } from "../types";
import { useLocationDragState } from "../drag-and-drop/location-drag-provider";

const CARD_ASPECT_RATIO = 130 / 181;
const LANDSCAPE_CARD_ASPECT_RATIO = 181 / 130;
const LANDSCAPE_IMAGE_RATIO_THRESHOLD = 1.05;

export type CardTileSize = "sm" | "md" | "lg" | "xl";
export type CardTileOrientation = "auto" | "portrait" | "landscape";

type ResolvedCardTileOrientation = Exclude<CardTileOrientation, "auto">;

export const CARD_TILE_SIZE_CONFIG: Record<
  CardTileSize,
  {
    width: number;
    height: number;
    mightBadgeClassName: string;
    damageBadgeClassName: string;
  }
> = {
  sm: {
    width: Math.round(96 * CARD_ASPECT_RATIO),
    height: 96,
    mightBadgeClassName: "-right-1 -top-1 h-4 min-w-4 px-1 text-[10px]",
    damageBadgeClassName: "-left-1.5 h-5 min-w-5 px-1 text-[10px]",
  },
  md: {
    width: Math.round(120 * CARD_ASPECT_RATIO),
    height: 120,
    mightBadgeClassName: "-right-1 -top-1 h-5 min-w-5 px-1 text-xs",
    damageBadgeClassName: "-left-2 h-6 min-w-6 px-1 text-xs",
  },
  lg: {
    width: Math.round(144 * CARD_ASPECT_RATIO),
    height: 144,
    mightBadgeClassName: "-right-1.5 -top-1.5 h-6 min-w-6 px-1.5 text-sm",
    damageBadgeClassName: "-left-2 h-7 min-w-7 px-1.5 text-sm",
  },
  xl: {
    width: Math.round(176 * CARD_ASPECT_RATIO),
    height: 176,
    mightBadgeClassName: "-right-2 -top-2 h-7 min-w-7 px-1.5 text-sm",
    damageBadgeClassName: "-left-2.5 h-8 min-w-8 px-1.5 text-sm",
  },
};

const CARD_ORIENTATION_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 40,
  mass: 0.7,
  restDelta: 0.001,
  restSpeed: 0.001,
};

type CardTileProps = Card & {
  enableHoverPreview?: boolean;
  enableZoneAnimation?: boolean;
  focusablePreview?: boolean;
  isHighlighted?: boolean;
  isTransferHidden?: boolean;
  orientation?: CardTileOrientation;
  preserveOrientation?: boolean;
  onContextAction?: (event: MouseEvent<HTMLDivElement>) => void;
  onHighlightPointerEnter?: () => void;
  onHighlightPointerLeave?: () => void;
  onPrimaryAction?: (event?: MouseEvent<HTMLDivElement>) => void;
  ownerLabel?: string;
  ownerSeat?: "player" | "opponent";
  showMight?: boolean;
  size?: CardTileSize;
};

export const CardTile: FC<CardTileProps> = ({
  domains = [],
  enableHoverPreview = false,
  enableZoneAnimation = true,
  damage,
  energy,
  focusablePreview = true,
  instanceId,
  isHighlighted = false,
  isTransferHidden = false,
  isExhausted,
  img,
  might,
  name,
  onContextAction,
  onHighlightPointerEnter,
  onHighlightPointerLeave,
  onPrimaryAction,
  orientation = "auto",
  ownerLabel,
  ownerSeat,
  power,
  preserveOrientation = false,
  publicCode,
  rulesText,
  setLabel,
  showMight = true,
  size = "md",
  supertype,
  type,
}) => {
  const [previewPosition, setPreviewPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [autoOrientation, setAutoOrientation] =
    useState<ResolvedCardTileOrientation>(() =>
      inferCardOrientation({ supertype, type }),
    );
  const tileRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeConfig = CARD_TILE_SIZE_CONFIG[size];
  const resolvedOrientation =
    orientation === "auto" ? autoOrientation : orientation;
  const dimensions = getCardTileDimensions(size, resolvedOrientation);
  const isRotatedExhausted = Boolean(isExhausted && !preserveOrientation);
  const { isLocationDragActive } = useLocationDragState();
  const canShowHoverPreview = enableHoverPreview && !isLocationDragActive;

  const footprintStyle = {
    width: isRotatedExhausted ? dimensions.height : dimensions.width,
    height: isRotatedExhausted
      ? resolvedOrientation === "landscape"
        ? dimensions.width
        : dimensions.height
      : dimensions.height,
    zIndex: previewPosition ? 2147483647 : undefined,
  };

  const motionOrigin = "50% 50%";

  useEffect(() => {
    if (orientation !== "auto") {
      return;
    }

    setAutoOrientation(inferCardOrientation({ supertype, type }));
  }, [img, orientation, supertype, type]);

  const clearPreview = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    setPreviewPosition(null);
  };

  const schedulePreview = () => {
    if (!canShowHoverPreview || !bodyRef.current) {
      return;
    }

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    previewTimeoutRef.current = setTimeout(() => {
      const gutter = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const previewWidth = Math.min(560, viewportWidth - gutter * 2);
      const previewHeight = 382;
      const rect = bodyRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const availableAbove = rect.top - gutter;
      const availableBelow = viewportHeight - rect.bottom - gutter;
      const placeBelow =
        availableBelow >= previewHeight || availableBelow >= availableAbove;
      const left = Math.min(
        Math.max(gutter, rect.left + rect.width / 2 - previewWidth / 2),
        Math.max(gutter, viewportWidth - previewWidth - gutter),
      );
      const top = placeBelow
        ? Math.min(
            rect.bottom + gutter,
            viewportHeight - previewHeight - gutter,
          )
        : Math.max(gutter, rect.top - previewHeight - gutter);

      setPreviewPosition({ left, top });
    }, 2000);
  };

  useEffect(() => {
    if (!isLocationDragActive) {
      return;
    }

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    setPreviewPosition(null);
  }, [isLocationDragActive]);

  useEffect(
    () => () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <div
      data-card-instance-id={
        enableZoneAnimation && instanceId ? instanceId : undefined
      }
      data-card-orientation={resolvedOrientation}
      className={cn(
        "relative flex justify-center items-center overflow-visible shrink-0",
        (onPrimaryAction || onContextAction) && "cursor-pointer",
        isTransferHidden && "invisible pointer-events-none",
        previewPosition ? "z-[2147483647]" : isHighlighted ? "z-20" : "z-10",
      )}
      onBlur={clearPreview}
      onClick={(event) => {
        onPrimaryAction?.(event);
      }}
      onContextMenu={(event) => {
        if (!onContextAction) {
          return;
        }

        event.preventDefault();
        clearPreview();
        onContextAction(event);
      }}
      onFocus={schedulePreview}
      onKeyDown={(event) => {
        if (!onPrimaryAction || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }

        event.preventDefault();
        onPrimaryAction();
      }}
      onPointerEnter={() => {
        onHighlightPointerEnter?.();
        schedulePreview();
      }}
      onPointerLeave={() => {
        onHighlightPointerLeave?.();
        clearPreview();
      }}
      ref={tileRef}
      style={footprintStyle}
      tabIndex={canShowHoverPreview && focusablePreview ? 0 : undefined}
    >
      <motion.div
        animate={{
          rotate: isExhausted && !preserveOrientation ? 90 : 0,
          scale: isExhausted && !preserveOrientation ? 0.98 : 1,
          y: isExhausted && !preserveOrientation ? -2 : 0,
        }}
        className="relative transform-gpu shrink-0"
        initial={false}
        ref={bodyRef}
        style={{
          height: dimensions.height,
          transformOrigin: motionOrigin,
          width: dimensions.width,
          willChange: "transform",
        }}
        transition={CARD_ORIENTATION_TRANSITION}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block bg-slate-900 shadow-md border border-white/15 rounded-md object-cover transition",
            "hover:border-yellow-300/70 hover:shadow-lg hover:shadow-black/40",
            isHighlighted &&
              "border-cyan-300 ring-2 ring-cyan-300 shadow-cyan-300/40 shadow-lg",
          )}
          draggable={false}
          onLoad={(event) => {
            if (orientation !== "auto") {
              return;
            }

            const image = event.currentTarget;
            const nextOrientation =
              image.naturalWidth >
              image.naturalHeight * LANDSCAPE_IMAGE_RATIO_THRESHOLD
                ? "landscape"
                : "portrait";

            setAutoOrientation((currentOrientation) =>
              currentOrientation === nextOrientation
                ? currentOrientation
                : nextOrientation,
            );
          }}
          src={img}
          style={{
            height: dimensions.height,
            width: dimensions.width,
          }}
        />
        {showMight && might !== undefined && (
          <span
            className={cn(
              "absolute flex justify-center items-center bg-white shadow border border-slate-900/70 rounded-full font-bold text-slate-950",
              sizeConfig.mightBadgeClassName,
            )}
          >
            {might}
          </span>
        )}
        {damage !== undefined && damage > 0 && (
          <span
            className={cn(
              "top-1/2 absolute flex justify-center items-center bg-red-500 shadow border border-red-100 rounded-full font-black text-white -translate-y-1/2",
              sizeConfig.damageBadgeClassName,
            )}
          >
            {damage}
          </span>
        )}
      </motion.div>
      <CardHoverPreviewPortal
        domains={domains}
        energy={energy}
        img={img}
        might={might}
        name={name}
        ownerLabel={ownerLabel}
        ownerSeat={ownerSeat}
        power={power}
        previewPosition={previewPosition}
        publicCode={publicCode}
        resolvedOrientation={resolvedOrientation}
        rulesText={rulesText}
        setLabel={setLabel}
        supertype={supertype}
        type={type}
      />
    </div>
  );
};

function CardHoverPreviewPortal({
  domains,
  energy,
  img,
  might,
  name,
  ownerLabel,
  ownerSeat,
  power,
  previewPosition,
  publicCode,
  resolvedOrientation,
  rulesText,
  setLabel,
  supertype,
  type,
}: {
  domains: string[];
  energy?: number;
  img: string;
  might?: number;
  name: string;
  ownerLabel?: string;
  ownerSeat?: "player" | "opponent";
  power?: number;
  previewPosition: { left: number; top: number } | null;
  publicCode?: string;
  resolvedOrientation: ResolvedCardTileOrientation;
  rulesText?: string;
  setLabel?: string;
  supertype?: Card["supertype"];
  type?: Card["type"];
}) {
  if (!previewPosition || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "z-[2147483647] fixed flex gap-3 p-2 rounded-xl overflow-hidden text-slate-100 pointer-events-none",
        "w-[min(35rem,calc(100vw-1.5rem))] max-h-[min(24rem,calc(100vh-1.5rem))]",
        "border border-cyan-100/15 bg-slate-950/74 shadow-2xl shadow-black/80 ring-1 ring-cyan-300/10",
        "supports-backdrop-filter:bg-slate-950/58 supports-backdrop-filter:backdrop-blur-md",
      )}
      style={{
        left: previewPosition.left,
        top: previewPosition.top,
        zIndex: 2147483647,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(103,232,249,0.13),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_42%)] pointer-events-none"
      />
      <div className="relative bg-white/4.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_36px_rgba(0,0,0,0.42)] p-1.5 border border-white/10 rounded-lg shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block drop-shadow-[0_16px_24px_rgba(0,0,0,0.72)] rounded-md object-contain",
            resolvedOrientation === "landscape" ? "w-80" : "w-55",
          )}
          draggable={false}
          src={img}
        />
      </div>
      <CardSummary
        domains={domains}
        energy={energy}
        might={might}
        name={name}
        ownerLabel={ownerLabel}
        ownerSeat={ownerSeat}
        power={power}
        publicCode={publicCode}
        rulesText={rulesText}
        setLabel={setLabel}
        supertype={supertype}
        type={type}
      />
    </div>,
    document.body,
  );
}

function getCardTileDimensions(
  size: CardTileSize,
  orientation: ResolvedCardTileOrientation,
) {
  const height = `var(--card-${size}-height, ${CARD_TILE_SIZE_CONFIG[size].height}px)`;
  if (orientation === "landscape") {
    return {
      height,
      width: `calc(${height} * ${LANDSCAPE_CARD_ASPECT_RATIO})`,
    };
  }

  return {
    height,
    width: `calc(${height} * ${CARD_ASPECT_RATIO})`,
  };
}

function inferCardOrientation({
  supertype,
  type,
}: {
  supertype?: Card["supertype"];
  type?: Card["type"];
}): ResolvedCardTileOrientation {
  const typeLine = [supertype, type].filter(Boolean).join(" ").toLowerCase();

  return typeLine.includes("battlefield") ? "landscape" : "portrait";
}

function CardSummary({
  domains,
  energy,
  might,
  name,
  ownerLabel,
  ownerSeat,
  power,
  publicCode,
  rulesText,
  setLabel,
  supertype,
  type,
}: {
  domains: string[];
  energy?: number;
  might?: number;
  name: string;
  ownerLabel?: string;
  ownerSeat?: "player" | "opponent";
  power?: number;
  publicCode?: string;
  rulesText?: string;
  setLabel?: string;
  supertype?: Card["supertype"];
  type?: Card["type"];
}) {
  const typeLine = [supertype, type].filter(Boolean).join(" ");
  const hasStats =
    energy !== undefined || power !== undefined || might !== undefined;

  return (
    <div className="relative flex flex-col flex-1 gap-2 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-3 border border-white/10 rounded-lg min-w-0 overflow-auto">
      <div>
        <div className="flex justify-between items-start gap-2">
          <div className="drop-shadow-sm font-semibold text-slate-50 text-base leading-tight">
            {name}
          </div>
          {ownerLabel && ownerSeat && (
            <span
              className={cn(
                "shadow-sm px-2 py-0.5 border border-white/10 rounded-full font-semibold text-[10px] text-white uppercase tracking-wide shrink-0",
                ownerSeat === "player"
                  ? "bg-player-accent"
                  : "bg-opponent-accent",
              )}
            >
              {ownerLabel}
            </span>
          )}
        </div>
        {typeLine && (
          <div className="mt-1 text-slate-400 text-xs uppercase tracking-wide">
            {typeLine}
          </div>
        )}
      </div>
      {(domains.length > 0 || hasStats) && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((domain) => (
            <span
              className="inline-flex items-center gap-1 bg-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] px-2 py-0.5 border border-white/10 rounded-full text-[11px] text-slate-200"
              key={domain}
            >
              <DomainIcon compact decorative domain={domain} />
              {formatDomain(domain)}
            </span>
          ))}
          {energy !== undefined && (
            <SummaryStatChip label="Energy">
              <EnergyResource compact value={energy} />
            </SummaryStatChip>
          )}
          {power !== undefined && (
            <SummaryStatChip label="Power">{power}</SummaryStatChip>
          )}
          {might !== undefined && (
            <SummaryStatChip label="Might">
              <MightResource compact value={might} />
            </SummaryStatChip>
          )}
        </div>
      )}
      <div className="gap-1.5 grid bg-slate-950/45 shadow-inner p-2 border border-white/10 rounded-md text-slate-100 text-sm">
        {rulesText?.trim() ? (
          <CardRulesText text={rulesText} />
        ) : (
          <p className="text-slate-400">No rules text.</p>
        )}
      </div>
      {(setLabel || publicCode) && (
        <div className="mt-auto pt-2 border-white/10 border-t text-[11px] text-slate-500">
          {[setLabel, publicCode].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}

function SummaryStatChip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 bg-yellow-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] px-2 py-0.5 border border-yellow-300/25 rounded-full text-[11px] text-yellow-100">
      <span>{label}</span>
      {children}
    </span>
  );
}
