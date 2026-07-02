"use client";

import { useEffect } from "react";
import { History, Layers3, SkipForward } from "lucide-react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./action-button";

export function ActionRail({
  isChainLockedOpen = false,
  onPassTurn,
  openZone,
  passTurnDisabled = false,
  passTurnLabel = "Pass Turn",
  setOpenZone,
}: {
  isChainLockedOpen?: boolean;
  onPassTurn?: () => void;
  openZone: TemporaryZone;
  passTurnDisabled?: boolean;
  passTurnLabel?: string;
  setOpenZone: (zone: TemporaryZone) => void;
}) {
  const canPassTurn = Boolean(onPassTurn) && !passTurnDisabled;

  useEffect(() => {
    if (!canPassTurn || !onPassTurn) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceKey(event)) {
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
      onPassTurn();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canPassTurn, onPassTurn]);

  return (
    <aside
      aria-label="Game actions"
      className="relative flex flex-col justify-center items-center gap-3 bg-slate-950/25 supports-backdrop-filter:bg-slate-950/18 shadow-[inset_1px_0_0_rgba(255,255,255,0.035),-12px_0_32px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-md px-3 border-white/10 border-l ring-1 ring-white/5 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="left-0 absolute inset-y-3 bg-gradient-to-b from-transparent via-cyan-200/20 to-transparent w-px pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-white/[3%] via-transparent to-black/10 pointer-events-none"
      />
      <div className="z-10 relative flex flex-col items-center gap-3">
        <ActionButton
          active={openZone === "chain"}
          label={isChainLockedOpen ? "Chain is resolving" : "Chain"}
          onClick={() =>
            setOpenZone(
              openZone === "chain" && !isChainLockedOpen ? null : "chain",
            )
          }
        >
          <Layers3 className="size-5" />
        </ActionButton>
        <ActionButton
          active={openZone === "log"}
          label="Game Log"
          onClick={() => setOpenZone(openZone === "log" ? null : "log")}
        >
          <History className="size-5" />
        </ActionButton>
        <ActionButton
          active={false}
          disabled={!canPassTurn}
          label={`${passTurnLabel} · Space`}
          onClick={onPassTurn ?? (() => undefined)}
        >
          <SkipForward className="size-5" />
        </ActionButton>
      </div>
    </aside>
  );
}

function isSpaceKey(event: KeyboardEvent) {
  return (
    event.code === "Space" || event.key === " " || event.key === "Spacebar"
  );
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
    tagName === "button" ||
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ) !== null
  );
}
