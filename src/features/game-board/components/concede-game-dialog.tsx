"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/alert-dialog";
import { Input } from "@/shared/components/input";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { GameActionButton } from "./game-action-button";

export function ConcedeGameDialog({
  disabled = false,
  isOpen,
  onConcede,
  onOpenChange,
}: {
  disabled?: boolean;
  isOpen: boolean;
  onConcede: () => void | Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [concedeConfirmationText, setConcedeConfirmationText] = useState("");

  const canConfirmConcede =
    !disabled && concedeConfirmationText.trim() === "concede";

  useEffect(() => {
    if (!isOpen) {
      setConcedeConfirmationText("");
    }
  }, [isOpen]);

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleConfirmConcede = async () => {
    if (!canConfirmConcede) {
      return;
    }

    onOpenChange(false);
    setConcedeConfirmationText("");
    await onConcede();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
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
            <GameActionButton
              actionSlot="cancel"
              className="min-w-24"
              isActive={isOpen}
              onAction={handleCancel}
              variant="secondary"
            >
              Cancel
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              className="bg-red-400/15 hover:bg-red-400/25 disabled:opacity-40 shadow-lg shadow-red-950/30 border-red-300/30 min-w-28 text-red-100"
              disabled={!canConfirmConcede}
              isActive={isOpen}
              onAction={handleConfirmConcede}
              variant="destructive"
            >
              Concede
            </GameActionButton>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
