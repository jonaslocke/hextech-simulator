"use client";

import { useEffect } from "react";
import { Swords } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Kbd } from "@/shared/components/kbd";
import { cn } from "@/shared/utils/cn";

export function ShowdownPrompt({
  battlefieldName,
  focusPlayerId,
  hasFocus,
  hasPriority,
  isClosed,
  isCombat,
  onPassFocus,
  priorityPlayerId,
}: {
  battlefieldName: string;
  focusPlayerId: string;
  hasFocus: boolean;
  hasPriority: boolean;
  isClosed: boolean;
  isCombat: boolean;
  onPassFocus?: () => void;
  priorityPlayerId: string | null;
}) {
  const canPassFocus = hasFocus && Boolean(onPassFocus);
  const statusMessage = getShowdownMessage({
    focusPlayerId,
    hasFocus,
    hasPriority,
    isClosed,
    priorityPlayerId,
  });

  useEffect(() => {
    if (!canPassFocus || !onPassFocus) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") {
        return;
      }

      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      onPassFocus();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canPassFocus, onPassFocus]);

  return (
    <section
      aria-live="assertive"
      className={cn(
        "top-11 left-1/2 z-[2147483644] fixed rounded-xl w-[min(34rem,calc(100vw-2rem))] overflow-hidden -translate-x-1/2 select-none",
        "border border-amber-200/25 bg-slate-950/72 text-slate-100 shadow-2xl shadow-black/75 ring-1 ring-amber-300/10",
        "supports-backdrop-filter:bg-slate-950/58 supports-backdrop-filter:backdrop-blur-md",
      )}
      role="status"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_12%_50%,rgba(251,191,36,0.16),transparent_34%),linear-gradient(90deg,rgba(251,191,36,0.08),transparent_56%)] pointer-events-none"
      />
      <div className="relative flex items-center gap-3 px-4 py-3">
        <span className="flex justify-center items-center bg-amber-300/12 shadow-[0_0_22px_rgba(251,191,36,0.14)] border border-amber-200/35 rounded-full size-10 text-amber-200 shrink-0">
          <Swords aria-hidden="true" className="size-4" />
        </span>

        <div className="flex-1 min-w-0">
          <p className="font-mono font-semibold text-[11px] text-amber-200/90 uppercase tracking-[0.24em]">
            {isCombat ? "Combat showdown" : "Showdown"}
          </p>
          <h2 className="mt-0.5 font-semibold text-slate-50 text-base truncate leading-tight">
            {battlefieldName}
          </h2>
          <p className="mt-1 text-slate-300 text-sm leading-5">
            {statusMessage}
          </p>
        </div>

        {canPassFocus && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 text-xs">
              <span>Press</span>
              <Kbd variant="amber">K</Kbd>
            </span>
            <Button
              className="bg-amber-300 hover:bg-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.18)] border border-amber-100/35 text-slate-950"
              onClick={onPassFocus}
              type="button"
            >
              Pass Focus
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function getShowdownMessage({
  focusPlayerId,
  hasFocus,
  hasPriority,
  isClosed,
  priorityPlayerId,
}: {
  focusPlayerId: string;
  hasFocus: boolean;
  hasPriority: boolean;
  isClosed: boolean;
  priorityPlayerId: string | null;
}) {
  if (isClosed) {
    if (hasPriority) {
      return "You have Priority. Play a Reaction or pass Priority.";
    }

    if (hasFocus) {
      return "You retain Focus while waiting for Priority.";
    }

    return `Waiting for ${priorityPlayerId ?? "the priority player"} to act. ${focusPlayerId} retains Focus.`;
  }

  if (hasFocus) {
    return "You have Focus. Play an Action or Reaction, or pass Focus.";
  }

  return `Waiting for ${focusPlayerId} to act.`;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ) !== null
  );
}
