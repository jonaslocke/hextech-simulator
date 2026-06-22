"use client";

import {
  FC,
  MouseEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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
        ? Math.min(rect.bottom + gutter, viewportHeight - previewHeight - gutter)
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
        "relative shrink-0",
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
      style={{ zIndex: previewPosition ? 2147483647 : undefined }}
      tabIndex={enableHoverPreview && focusablePreview ? 0 : undefined}
    >
      <motion.div
        animate={{
          rotate: isExhausted && !preserveOrientation ? 90 : 0,
          scale: isExhausted && !preserveOrientation ? 0.98 : 1,
          y: isExhausted && !preserveOrientation ? -2 : 0,
        }}
        className="relative"
        initial={false}
        ref={bodyRef}
        transition={{
          type: "spring",
          stiffness: 360,
          damping: 28,
          mass: 0.75,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block h-30 aspect-130/181 rounded-md border border-white/15 bg-slate-900 object-cover shadow-md transition",
            "hover:border-yellow-300/70 hover:shadow-lg hover:shadow-black/40",
            isHighlighted &&
              "border-cyan-300 ring-2 ring-cyan-300 shadow-cyan-300/40 shadow-lg",
          )}
          src={img}
        />
        {showMight && might !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-900/70 bg-white px-1 text-xs font-bold text-slate-950 shadow">
            {might}
          </span>
        )}
        {damage !== undefined && damage > 0 && (
          <span className="absolute top-1/2 -left-2 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-full border border-red-100 bg-red-500 px-1 text-xs font-black text-white shadow">
            {damage}
          </span>
        )}
      </motion.div>
      {previewPosition && (
        <div
          className="pointer-events-none fixed z-[2147483647] flex max-h-[min(24rem,calc(100vh-1.5rem))] w-[min(35rem,calc(100vw-1.5rem))] gap-3 overflow-hidden rounded-lg bg-slate-950/95 p-2 text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,0.88)] ring-1 ring-yellow-300/40 drop-shadow-[0_18px_30px_rgba(0,0,0,0.75)]"
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
            zIndex: 2147483647,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
          <img
            alt={name}
            className="block w-[220px] shrink-0 rounded-md object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.8)]"
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
    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto pr-1">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="text-base font-semibold leading-tight">{name}</div>
          {ownerLabel && ownerSeat && (
            <span
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white",
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
          <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            {typeLine}
          </div>
        )}
      </div>
      {(domains.length > 0 || hasStats) && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((domain) => (
            <span
              className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] text-slate-200"
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
      <div className="grid gap-1.5 rounded border border-white/10 bg-black/25 p-2 text-sm text-slate-100">
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
    <span className="inline-flex items-center gap-1 rounded border border-yellow-300/30 bg-yellow-300/10 px-2 py-0.5 text-[11px] text-yellow-100">
      <span>{label}</span>
      {children}
    </span>
  );
}
