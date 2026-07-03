"use client";

import { useEffect } from "react";
import { Swords } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Kbd } from "@/shared/components/kbd";
import { cn } from "@/shared/utils/cn";

export function ShowdownPrompt({
  battlefieldName,
  attackerMight,
  defenderMight,
  focusPlayerId,
  hasFocus,
  hasPriority,
  isClosed,
  isCombat,
  isFinalFocusPass,
  onPassFocus,
  priorityPlayerId,
}: {
  battlefieldName: string;
  attackerMight: number | null;
  defenderMight: number | null;
  focusPlayerId: string;
  hasFocus: boolean;
  hasPriority: boolean;
  isClosed: boolean;
  isCombat: boolean;
  isFinalFocusPass: boolean;
  onPassFocus?: () => void;
  priorityPlayerId: string | null;
}) {
  const canPassFocus = hasFocus && Boolean(onPassFocus);
  const promptTitle = isCombat ? "Combat showdown" : "Showdown";
  const passFocusLabel = getPassFocusLabel({ isCombat, isFinalFocusPass });
  const isResolvingPass = canPassFocus && isFinalFocusPass;
  const statusMessage = getShowdownMessage({
    focusPlayerId,
    hasFocus,
    hasPriority,
    isClosed,
    isCombat,
    isFinalFocusPass,
    attackerMight,
    defenderMight,
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
        "top-15 left-1/2 z-[2147483644] fixed rounded-xl w-[min(34rem,calc(100vw-2rem))] overflow-hidden -translate-x-1/2 select-none",
        "border border-amber-200/20 bg-slate-950/76 text-slate-100 shadow-2xl shadow-black/75 ring-1 ring-amber-300/10",
        "supports-backdrop-filter:bg-slate-950/60 supports-backdrop-filter:backdrop-blur-md",
      )}
      role="status"
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 pointer-events-none",
          isCombat
            ? "bg-[radial-gradient(circle_at_11%_38%,rgba(251,191,36,0.16),transparent_34%),linear-gradient(90deg,rgba(251,191,36,0.075),transparent_58%)]"
            : "bg-[radial-gradient(circle_at_11%_38%,rgba(103,232,249,0.13),transparent_34%),linear-gradient(90deg,rgba(103,232,249,0.055),transparent_58%)]",
        )}
      />

      <div className="relative gap-3 grid px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex justify-center items-center shadow-[0_0_22px_rgba(251,191,36,0.12)] mt-0.5 border rounded-full size-10 shrink-0",
              isCombat
                ? "border-amber-200/35 bg-amber-300/12 text-amber-200"
                : "border-cyan-200/30 bg-cyan-300/10 text-cyan-100",
            )}
          >
            <Swords aria-hidden="true" className="size-4" />
          </span>

          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-mono font-semibold text-[11px] uppercase tracking-[0.24em]",
                isCombat ? "text-amber-200/90" : "text-cyan-100/85",
              )}
            >
              {promptTitle}
            </p>
            <h2 className="mt-0.5 font-semibold text-slate-50 text-base truncate leading-tight">
              {battlefieldName}
            </h2>
            <p className="mt-1 text-slate-300 text-sm leading-5">
              {statusMessage}
            </p>
          </div>
        </div>

        {canPassFocus && (
          <div className="flex justify-end items-center gap-2 pt-3 sm:pl-13 border-white/10 border-t">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-400 text-xs">
              <span>Press</span>
              <Kbd variant="amber">K</Kbd>
            </span>

            <Button
              className={cn(
                "shadow-[0_0_18px_rgba(251,191,36,0.14)] border min-w-36 font-semibold",
                isResolvingPass
                  ? isCombat
                    ? "border-amber-100/35 bg-amber-300/18 text-amber-50 hover:bg-amber-300/28"
                    : "border-cyan-100/35 bg-cyan-300/14 text-cyan-50 hover:bg-cyan-300/24"
                  : "border-amber-100/35 bg-amber-300 text-slate-950 hover:bg-amber-200",
              )}
              onClick={onPassFocus}
              type="button"
            >
              {passFocusLabel}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function getPassFocusLabel({
  isCombat,
  isFinalFocusPass,
}: {
  isCombat: boolean;
  isFinalFocusPass: boolean;
}) {
  if (!isFinalFocusPass) {
    return "Pass Focus";
  }

  return isCombat ? "Pass and resolve combat" : "Pass and resolve showdown";
}

function getShowdownMessage({
  focusPlayerId,
  hasFocus,
  hasPriority,
  isClosed,
  isCombat,
  isFinalFocusPass,
  attackerMight,
  defenderMight,
  priorityPlayerId,
}: {
  focusPlayerId: string;
  hasFocus: boolean;
  hasPriority: boolean;
  isClosed: boolean;
  isCombat: boolean;
  isFinalFocusPass: boolean;
  attackerMight: number | null;
  defenderMight: number | null;
  priorityPlayerId: string | null;
}) {
  if (isClosed) {
    if (hasPriority) {
      return "You have Priority. Play a Reaction or pass Priority.";
    }

    if (hasFocus) {
      return "You retain Focus while waiting for Priority.";
    }

    return `Waiting for ${
      priorityPlayerId ?? "the priority player"
    } to act. ${focusPlayerId} retains Focus.`;
  }

  if (hasFocus) {
    if (isFinalFocusPass) {
      if (isCombat) {
        return getCombatResolveMessage({
          attackerMight,
          defenderMight,
        });
      }

      return "Passing ends this showdown without combat.";
    }

    return "You have Focus. Play an Action or Reaction, or pass Focus.";
  }

  return `Waiting for ${focusPlayerId} to act.`;
}

function getCombatResolveMessage({
  attackerMight,
  defenderMight,
}: {
  attackerMight: number | null;
  defenderMight: number | null;
}) {
  if (attackerMight === null || defenderMight === null) {
    return "Passing ends the combat showdown.";
  }

  if (attackerMight === defenderMight) {
    return `Passing ends the combat showdown. Combat is tied ${attackerMight}–${defenderMight} in Might.`;
  }

  const leader =
    attackerMight > defenderMight ? "Attackers lead" : "Defenders lead";

  return `Passing ends the combat showdown. ${leader} ${attackerMight}–${defenderMight} in Might.`;
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
