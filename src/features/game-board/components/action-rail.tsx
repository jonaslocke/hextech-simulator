"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Flag,
  History,
  Layers3,
  SkipForward,
} from "lucide-react";
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
        <AlertDialogContent className="bg-slate-950/82 shadow-2xl shadow-black/80 backdrop-blur-xl p-0 border border-white/12 sm:rounded-2xl ring-1 ring-white/10 overflow-hidden text-slate-100">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,0.24),transparent_34%),radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.10),transparent_36%)] opacity-80 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="top-0 absolute inset-x-0 bg-linear-to-r from-transparent via-red-200/60 to-transparent h-px pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="-top-24 left-1/2 absolute bg-red-300/10 blur-3xl rounded-full w-48 h-48 -translate-x-1/2 pointer-events-none"
          />

          <div className="relative gap-5 grid p-5">
            <AlertDialogHeader className="items-center text-center">
              <div className="flex justify-center items-center bg-red-400/15 shadow-lg shadow-red-950/40 border border-red-200/30 rounded-2xl w-14 h-14 text-red-100">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div className="mt-1">
                <p className="inline-flex items-center gap-1.5 bg-amber-200/10 px-3 py-1 border border-amber-200/20 rounded-full font-semibold text-[10px] text-amber-100 uppercase tracking-[0.22em]">
                  Irreversible action
                </p>

                <AlertDialogTitle className="mt-3 font-semibold text-red-100 text-3xl tracking-tight">
                  Concede game?
                </AlertDialogTitle>

                <AlertDialogDescription className="mx-auto mt-2 max-w-sm text-slate-300 text-sm leading-relaxed">
                  This will immediately end the game and your opponent will be
                  declared the winner. Type{" "}
                  <span className="font-mono font-semibold text-red-200">
                    concede
                  </span>{" "}
                  to confirm.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>

            <div className="bg-white/4.5 shadow-black/25 shadow-inner p-3 border border-white/10 rounded-xl">
              <Input
                autoComplete="off"
                autoFocus
                className="bg-slate-950/60 border-red-400/25 focus-visible:ring-red-300/40 h-11 font-mono text-slate-100 placeholder:text-slate-500"
                onChange={(event) =>
                  setConcedeConfirmationText(event.currentTarget.value)
                }
                placeholder="concede"
                value={concedeConfirmationText}
              />
              <p className="mt-2 text-slate-500 text-xs text-center">
                Losers says what?
              </p>
            </div>

            <AlertDialogFooter className="sm:flex sm:justify-center gap-2 grid grid-cols-2">
              <AlertDialogCancel className="bg-white/6 hover:bg-white/10 mt-0 border-white/10 text-slate-200 hover:text-white">
                Cancel
              </AlertDialogCancel>

              <Button
                className="bg-red-400/15 hover:bg-red-400/25 disabled:opacity-40 shadow-lg shadow-red-950/30 border border-red-300/30 text-red-100 disabled:cursor-not-allowed"
                disabled={!canConfirmConcede}
                onClick={handleConfirmConcede}
                type="button"
              >
                Concede
              </Button>
            </AlertDialogFooter>
          </div>
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
