"use client";

import { FC, MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
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

const CARD_ASPECT_RATIO = 130 / 181;

export type CardTileSize = "sm" | "md" | "lg" | "xl";

export const CARD_TILE_SIZE_CONFIG: Record<
  CardTileSize,
  {
    imageClassName: string;
    width: number;
    height: number;
    mightBadgeClassName: string;
    damageBadgeClassName: string;
  }
> = {
  sm: {
    imageClassName: "h-24",
    width: Math.round(96 * CARD_ASPECT_RATIO),
    height: 96,
    mightBadgeClassName: "-right-1 -top-1 h-4 min-w-4 px-1 text-[10px]",
    damageBadgeClassName: "-left-1.5 h-5 min-w-5 px-1 text-[10px]",
  },
  md: {
    imageClassName: "h-30",
    width: Math.round(120 * CARD_ASPECT_RATIO),
    height: 120,
    mightBadgeClassName: "-right-1 -top-1 h-5 min-w-5 px-1 text-xs",
    damageBadgeClassName: "-left-2 h-6 min-w-6 px-1 text-xs",
  },
  lg: {
    imageClassName: "h-36",
    width: Math.round(144 * CARD_ASPECT_RATIO),
    height: 144,
    mightBadgeClassName: "-right-1.5 -top-1.5 h-6 min-w-6 px-1.5 text-sm",
    damageBadgeClassName: "-left-2 h-7 min-w-7 px-1.5 text-sm",
  },
  xl: {
    imageClassName: "h-44",
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
  const tileRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizeConfig = CARD_TILE_SIZE_CONFIG[size];
  const isRotatedExhausted = Boolean(isExhausted && !preserveOrientation);

  const footprintStyle = {
    width: isRotatedExhausted ? sizeConfig.height : sizeConfig.width,
    height: sizeConfig.height,
    zIndex: previewPosition ? 2147483647 : undefined,
  };

  const motionOrigin = "50% 50%";

  const clearPreview = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    setPreviewPosition(null);
  };

  const schedulePreview = () => {
    if (!enableHoverPreview || !bodyRef.current) {
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
      tabIndex={enableHoverPreview && focusablePreview ? 0 : undefined}
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
          transformOrigin: motionOrigin,
          willChange: "transform",
        }}
        transition={CARD_ORIENTATION_TRANSITION}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block bg-slate-900 shadow-md border border-white/15 rounded-md object-cover aspect-130/181 transition",
            sizeConfig.imageClassName,
            "hover:border-yellow-300/70 hover:shadow-lg hover:shadow-black/40",
            isHighlighted &&
              "border-cyan-300 ring-2 ring-cyan-300 shadow-cyan-300/40 shadow-lg",
          )}
          src={img}
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
      {previewPosition && (
        <div
          className="z-[2147483647] fixed flex gap-3 bg-slate-950/95 shadow-[0_28px_80px_rgba(0,0,0,0.88)] drop-shadow-[0_18px_30px_rgba(0,0,0,0.75)] p-2 rounded-lg ring-1 ring-yellow-300/40 w-[min(35rem,calc(100vw-1.5rem))] max-h-[min(24rem,calc(100vh-1.5rem))] overflow-hidden text-slate-100 pointer-events-none"
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
            zIndex: 2147483647,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
          <img
            alt={name}
            className="block drop-shadow-[0_16px_24px_rgba(0,0,0,0.8)] rounded-md w-55 object-contain shrink-0"
            src={img}
          />
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
        </div>
      )}
    </div>
  );
};

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
    <div className="flex flex-col flex-1 gap-2 pr-1 min-w-0 overflow-auto">
      <div>
        <div className="flex justify-between items-start gap-2">
          <div className="font-semibold text-base leading-tight">{name}</div>
          {ownerLabel && ownerSeat && (
            <span
              className={cn(
                "px-2 py-0.5 rounded font-semibold text-[10px] text-white uppercase tracking-wide shrink-0",
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
              className="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 border border-white/10 rounded text-[11px] text-slate-200"
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
      <div className="gap-1.5 grid bg-black/25 p-2 border border-white/10 rounded text-slate-100 text-sm">
        {rulesText?.trim() ? (
          <CardRulesText text={rulesText} />
        ) : (
          <p className="text-slate-400">No rules text.</p>
        )}
      </div>
      {(setLabel || publicCode) && (
        <div className="mt-auto text-[11px] text-slate-500">
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
    <span className="inline-flex items-center gap-1 bg-yellow-300/10 px-2 py-0.5 border border-yellow-300/30 rounded text-[11px] text-yellow-100">
      <span>{label}</span>
      {children}
    </span>
  );
}
