"use client";

import { FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "../types";

type CardTileProps = Card & {
  enableHoverPreview?: boolean;
};

export const CardTile: FC<CardTileProps> = ({
  enableHoverPreview = false,
  isExhausted,
  img,
  might,
  name,
}) => {
  const [previewPosition, setPreviewPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPreview = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    setPreviewPosition(null);
  };

  const schedulePreview = () => {
    if (!enableHoverPreview || !tileRef.current) {
      return;
    }

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    const rect = tileRef.current.getBoundingClientRect();

    previewTimeoutRef.current = setTimeout(() => {
      const previewWidth = 260;
      const previewHeight = 362;
      const gutter = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft = rect.right + gutter;
      const left =
        preferredLeft + previewWidth <= viewportWidth
          ? preferredLeft
          : Math.max(gutter, rect.left - previewWidth - gutter);
      const top = Math.min(
        Math.max(gutter, rect.top - 24),
        Math.max(gutter, viewportHeight - previewHeight - gutter),
      );

      setPreviewPosition({ left, top });
    }, 3000);
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
      tabIndex={enableHoverPreview ? 0 : undefined}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
        <img
          alt={name}
          className={cn(
            "block h-30 aspect-130/181 rounded-md border border-white/15 bg-slate-900 object-cover shadow-md transition",
            "hover:border-yellow-300/70 hover:shadow-lg hover:shadow-black/40",
            isExhausted && "rotate-90",
          )}
          src={img}
        />
        {might !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-black/40 bg-yellow-300 px-1 text-xs font-bold text-black shadow">
            {might}
          </span>
        )}
        {isExhausted && (
          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-100">
            Exhausted
          </span>
        )}
      </div>
      {previewPosition && (
        <div
          className="pointer-events-none fixed z-[250] rounded-lg bg-slate-950/95 p-2 shadow-2xl ring-1 ring-yellow-300/40"
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset. */}
          <img
            alt={name}
            className="block w-[260px] rounded-md object-contain"
            src={img}
          />
        </div>
      )}
    </div>
  );
};
