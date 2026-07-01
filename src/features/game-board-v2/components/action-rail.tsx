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
    <aside className="relative flex flex-col justify-center items-center gap-3 bg-[#111827] px-3">
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
        label={passTurnLabel}
        onClick={onPassTurn ?? (() => undefined)}
      >
        <SkipForward className="size-5" />
      </ActionButton>
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
