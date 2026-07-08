"use client";

import { useEffect, useState } from "react";
import { Flag, History, Layers3, SkipForward } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/alert-dialog";
import { Button } from "@/shared/components/button";
import { Input } from "@/shared/components/input";
import { TemporaryZone } from "../types";
import { ActionButton } from "./action-button";

export function ActionRail({
  concedeDisabled = false,
  isChainOpen = false,
  isChainLockedOpen = false,
  onChainOpenChange,
  onConcede,
  onPassTurn,
  openZone,
  passTurnDisabled = false,
  passTurnLabel = "Pass Turn",
  setOpenZone,
}: {
  concedeDisabled?: boolean;
  isChainOpen?: boolean;
  isChainLockedOpen?: boolean;
  onChainOpenChange: (isOpen: boolean) => void;
  onConcede?: () => void | Promise<void>;
  onPassTurn?: () => void;
  openZone: Exclude<TemporaryZone, "chain">;
  passTurnDisabled?: boolean;
  passTurnLabel?: string;
  setOpenZone: (zone: Exclude<TemporaryZone, "chain">) => void;
}) {
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [concedeConfirmationText, setConcedeConfirmationText] = useState("");

  const canPassTurn = Boolean(onPassTurn) && !passTurnDisabled;
  const canConcede = Boolean(onConcede) && !concedeDisabled;
  const canConfirmConcede = concedeConfirmationText === "concede";

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

  const handleConcedeDialogOpenChange = (isOpen: boolean) => {
    setIsConcedeDialogOpen(isOpen);

    if (!isOpen) {
      setConcedeConfirmationText("");
    }
  };

  const handleConfirmConcede = async () => {
    if (!canConfirmConcede || !onConcede) {
      return;
    }

    setIsConcedeDialogOpen(false);
    setConcedeConfirmationText("");
    await onConcede();
  };

  return (
    <>
      <aside
        aria-label="Game actions"
        className="relative flex flex-col justify-center items-center gap-3 bg-slate-950/25 supports-backdrop-filter:bg-slate-950/18 shadow-[inset_1px_0_0_rgba(255,255,255,0.035),-12px_0_32px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-md px-3 border-white/10 border-l ring-1 ring-white/5 overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="left-0 absolute inset-y-3 bg-linear-to-b from-transparent via-cyan-200/20 to-transparent w-px pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-white/3 via-transparent to-black/10 pointer-events-none"
        />

        <div className="z-10 relative flex flex-col items-center gap-3">
          <ActionButton
            active={isChainOpen}
            label={isChainLockedOpen ? "Chain is resolving" : "Chain"}
            onClick={() =>
              onChainOpenChange(isChainLockedOpen ? true : !isChainOpen)
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

          {onConcede && (
            <ActionButton
              active={false}
              disabled={!canConcede}
              label="Concede Game"
              onClick={() => setIsConcedeDialogOpen(true)}
              variant="concede"
            >
              <Flag className="size-5" />
            </ActionButton>
          )}
        </div>
      </aside>

      <AlertDialog
        open={isConcedeDialogOpen}
        onOpenChange={handleConcedeDialogOpenChange}
      >
        <AlertDialogContent className="bg-slate-950 border-red-400/20 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Concede game?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will immediately end the game and your opponent will be the
              winner. Type{" "}
              <span className="font-mono font-semibold text-red-200">
                concede
              </span>{" "}
              to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            autoComplete="off"
            autoFocus
            className="bg-slate-900/80 border-red-400/25 font-mono text-slate-100 placeholder:text-slate-500"
            onChange={(event) =>
              setConcedeConfirmationText(event.currentTarget.value)
            }
            placeholder="concede"
            value={concedeConfirmationText}
          />

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              className="bg-red-950/80 hover:bg-red-900 border border-red-400/30 text-red-100"
              disabled={!canConfirmConcede}
              onClick={handleConfirmConcede}
              type="button"
            >
              Concede
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
