"use client";

import { DialogPortal } from "@/shared/components/dialog-portal";
import { GameActionButton } from "./game-action-button";

type HiddenLossWarningDialogProps = {
  hiddenCardCount: number;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function HiddenLossWarningDialog({
  hiddenCardCount,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
}: HiddenLossWarningDialogProps) {
  if (!isOpen) return null;

  return (
    <DialogPortal>
      <div className="z-[2147483646] fixed inset-0 flex items-center justify-center bg-black/70 p-4 text-slate-100 backdrop-blur-sm">
        <section
          aria-modal="true"
          className="grid w-full max-w-lg gap-4 rounded-xl border border-amber-300/30 bg-slate-950/90 p-5 shadow-2xl shadow-black/80 ring-1 ring-amber-300/10"
          role="alertdialog"
        >
          <header className="space-y-2">
            <h2 className="text-lg font-semibold text-amber-100">
              Return unit and lose Hidden cards?
            </h2>
            <p className="text-sm leading-6 text-slate-300">
              This is your last unit at this battlefield. Returning it to base
              will cause you to lose control and put {hiddenCardCount}{" "}
              Hidden {hiddenCardCount === 1 ? "card" : "cards"} there into your
              trash.
            </p>
          </header>

          <footer className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <GameActionButton
              actionSlot="cancel"
              disabled={isSubmitting}
              onAction={onCancel}
              variant="secondary"
            >
              Keep unit there
            </GameActionButton>
            <GameActionButton
              actionSlot="primary"
              disabled={isSubmitting}
              isBusy={isSubmitting}
              onAction={onConfirm}
            >
              {isSubmitting ? "Returning…" : "Return to base"}
            </GameActionButton>
          </footer>
        </section>
      </div>
    </DialogPortal>
  );
}
