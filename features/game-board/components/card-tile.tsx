"use client";

import { FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "../types";

type CardTileProps = Card & {
  enableHoverPreview?: boolean;
  focusablePreview?: boolean;
  showMight?: boolean;
};

export const CardTile: FC<CardTileProps> = ({
  domains = [],
  enableHoverPreview = false,
  energy,
  focusablePreview = true,
  isExhausted,
  img,
  might,
  name,
  power,
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
      className="relative z-10 shrink-0"
      onBlur={clearPreview}
      onFocus={schedulePreview}
      onPointerEnter={schedulePreview}
      onPointerLeave={clearPreview}
      ref={tileRef}
      tabIndex={enableHoverPreview && focusablePreview ? 0 : undefined}
    >
      <div
        className={cn(
          "relative transition",
          isExhausted && "rotate-90",
        )}
        ref={bodyRef}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block h-30 aspect-130/181 rounded-md border border-white/15 bg-slate-900 object-cover shadow-md transition",
            "hover:border-yellow-300/70 hover:shadow-lg hover:shadow-black/40",
          )}
          src={img}
        />
        {showMight && might !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-900/70 bg-white px-1 text-xs font-bold text-slate-950 shadow">
            {might}
          </span>
        )}
      </div>
      {previewPosition && (
        <div
          className="pointer-events-none fixed z-[250] flex max-h-[min(24rem,calc(100vh-1.5rem))] w-[min(35rem,calc(100vw-1.5rem))] gap-3 overflow-hidden rounded-lg bg-slate-950/95 p-2 text-slate-100 shadow-2xl ring-1 ring-yellow-300/40"
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
          <img
            alt={name}
            className="block w-[220px] shrink-0 rounded-md object-contain"
            src={img}
          />
          <CardSummary
            domains={domains}
            energy={energy}
            might={might}
            name={name}
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
  power?: number;
  publicCode?: string;
  rulesText?: string;
  setLabel?: string;
  supertype?: Card["supertype"];
  type?: Card["type"];
}) {
  const typeLine = [supertype, type].filter(Boolean).join(" ");
  const stats = [
    energy !== undefined ? `Energy ${energy}` : null,
    power !== undefined ? `Power ${power}` : null,
    might !== undefined ? `Might ${might}` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto pr-1">
      <div>
        <div className="text-base font-semibold leading-tight">{name}</div>
        {typeLine && (
          <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
            {typeLine}
          </div>
        )}
      </div>
      {(domains.length > 0 || stats.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((domain) => (
            <span
              className="rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] text-slate-200"
              key={domain}
            >
              {domain}
            </span>
          ))}
          {stats.map((stat) => (
            <span
              className="rounded border border-yellow-300/30 bg-yellow-300/10 px-2 py-0.5 text-[11px] text-yellow-100"
              key={stat}
            >
              {stat}
            </span>
          ))}
        </div>
      )}
      <div className="whitespace-pre-line rounded border border-white/10 bg-black/25 p-2 text-sm leading-snug text-slate-100">
        {rulesText?.trim() ? rulesText : "No rules text."}
      </div>
      {(setLabel || publicCode) && (
        <div className="mt-auto text-[11px] text-slate-500">
          {[setLabel, publicCode].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
