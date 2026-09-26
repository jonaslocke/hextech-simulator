"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

export function BoardScrollArea({
  ariaLabel,
  children,
  className,
  contentClassName,
  onViewportWidthChange,
  scrollable = true,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onViewportWidthChange?: (width: number) => void;
  scrollable?: boolean;
}) {
  const scrollportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const [metrics, setMetrics] = useState({ clientHeight: 0, scrollHeight: 0, scrollTop: 0, trackHeight: 0 });

  const measure = useCallback(() => {
    const port = scrollportRef.current;
    const track = trackRef.current;
    if (!port) return;
    onViewportWidthChange?.(Math.max(0, port.clientWidth - (scrollable ? 8 : 4)));
    setMetrics({
      clientHeight: port.clientHeight,
      scrollHeight: port.scrollHeight,
      scrollTop: port.scrollTop,
      trackHeight: track?.clientHeight ?? port.clientHeight,
    });
  }, [onViewportWidthChange, scrollable]);

  useEffect(() => {
    const port = scrollportRef.current;
    if (!port) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(port);
    if (port.firstElementChild) observer.observe(port.firstElementChild);
    return () => observer.disconnect();
  }, [measure, children]);

  const thumbHeight = metrics.scrollHeight > 0
    ? Math.max(18, Math.round(metrics.trackHeight * metrics.clientHeight / metrics.scrollHeight))
    : metrics.trackHeight;
  const thumbTravel = Math.max(0, metrics.trackHeight - thumbHeight);
  const scrollTravel = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const thumbTop = scrollTravel > 0 ? Math.round(metrics.scrollTop / scrollTravel * thumbTravel) : 0;

  const onThumbPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const port = scrollportRef.current;
    if (!port) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerY: event.clientY, scrollTop: port.scrollTop };
  };

  const onThumbPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const port = scrollportRef.current;
    const drag = dragRef.current;
    if (!port || !drag) return;
    const ratio = scrollTravel / Math.max(1, thumbTravel);
    port.scrollTop = drag.scrollTop + (event.clientY - drag.pointerY) * ratio;
  };

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const port = scrollportRef.current;
    const track = trackRef.current;
    if (!port || !track) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    port.scrollTop = fraction * scrollTravel;
  };

  return (
    <div className={cn("relative h-full min-h-0 min-w-0", className)}>
      <div
        aria-label={ariaLabel}
        className={cn(
          "h-full min-h-0 min-w-0 overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          scrollable ? "pr-2" : "pr-1",
          scrollable ? "overflow-y-auto" : "overflow-y-hidden",
          contentClassName,
        )}
        onScroll={measure}
        ref={scrollportRef}
        role="region"
        tabIndex={scrollable ? 0 : undefined}
      >
        {children}
      </div>
      {scrollable && (
        <div
          aria-hidden="true"
          className="absolute inset-y-1 right-0 z-40 flex w-2 justify-center"
          onPointerDown={onTrackPointerDown}
          ref={trackRef}
        >
          {metrics.scrollHeight > metrics.clientHeight && (
            <button
              className="absolute w-1.5 rounded-full bg-cyan-100/35 hover:bg-cyan-100/70 focus-visible:outline focus-visible:outline-yellow-300"
              onPointerDown={onThumbPointerDown}
              onPointerMove={onThumbPointerMove}
              onPointerUp={() => { dragRef.current = null; }}
              onLostPointerCapture={() => { dragRef.current = null; }}
              style={{ height: thumbHeight, top: thumbTop }}
              tabIndex={-1}
              type="button"
            />
          )}
        </div>
      )}
    </div>
  );
}
