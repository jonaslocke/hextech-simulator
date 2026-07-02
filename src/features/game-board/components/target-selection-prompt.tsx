"use client";

import { useEffect } from "react";
import { Button } from "@/shared/components/button";
import { Kbd } from "@/shared/components/kbd";

export function TargetSelectionPrompt({
  canSubmit,
  maxTargets,
  minTargets,
  onCancel,
  onSubmit,
  selectedCount,
}: {
  canSubmit: boolean;
  maxTargets: number;
  minTargets: number;
  onCancel: () => void;
  onSubmit: () => void;
  selectedCount: number;
}) {
  const isOptional = minTargets === 0;
  const targetRequirementLabel = isOptional
    ? "Optional targets"
    : maxTargets === minTargets
      ? "Required targets"
      : "Choose targets";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (key === "j" && canSubmit) {
        event.preventDefault();
        onSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canSubmit, onCancel, onSubmit]);

  return (
    <div className="bottom-24 left-1/2 z-2147483646 fixed w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 select-none">
      <section className="bg-slate-950/90 shadow-2xl shadow-black/80 backdrop-blur-md border border-cyan-300/25 rounded-xl ring-1 ring-cyan-300/10 overflow-hidden text-slate-100">
        <div className="flex justify-between items-center gap-4 px-4 py-3 border-white/10 border-b">
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight">
              {targetRequirementLabel}
            </div>
            <div className="mt-1 text-slate-400 text-xs">
              {selectedCount}/{maxTargets} selected
              {isOptional ? " · you may play without selecting targets" : ""}
            </div>
          </div>

          <TargetCountBadge
            canSubmit={canSubmit}
            maxTargets={maxTargets}
            minTargets={minTargets}
            selectedCount={selectedCount}
          />
        </div>

        <div className="flex justify-between items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <ShortcutHint label="Cancel" value="Esc" />
            <ShortcutHint disabled={!canSubmit} label="Play" value="J" />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={onCancel} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={!canSubmit} onClick={onSubmit} type="button">
              Play
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TargetCountBadge({
  canSubmit,
  maxTargets,
  minTargets,
  selectedCount,
}: {
  canSubmit: boolean;
  maxTargets: number;
  minTargets: number;
  selectedCount: number;
}) {
  const isComplete = selectedCount >= maxTargets;
  const isBelowMinimum = selectedCount < minTargets;

  return (
    <div
      className={[
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
        canSubmit
          ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
          : isBelowMinimum
            ? "border-yellow-300/40 bg-yellow-300/10 text-yellow-100"
            : isComplete
              ? "border-white/15 bg-white/10 text-slate-300"
              : "border-white/15 bg-white/5 text-slate-400",
      ].join(" ")}
    >
      {selectedCount}/{maxTargets}
    </div>
  );
}

function ShortcutHint({
  disabled = false,
  label,
  value,
}: {
  disabled?: boolean;
  label: string;
  value: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        disabled ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <Kbd>{value}</Kbd>
      <span>{label}</span>
    </span>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
