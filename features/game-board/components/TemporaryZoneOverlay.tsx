"use client";

import { X } from "lucide-react";
import { TemporaryZone } from "../types";
import { BoardSlot } from "./BoardSlot";
import { EmptyState } from "./EmptyState";

export function TemporaryZoneOverlay({
  openZone,
  onClose,
}: {
  openZone: TemporaryZone;
  onClose: () => void;
}) {
  if (!openZone) {
    return null;
  }

  const title =
    openZone === "chain"
      ? "Chain"
      : openZone === "banish"
        ? "Banished Cards"
        : "Game Log";
  const message =
    openZone === "chain"
      ? "The chain is empty in the current preview state."
      : openZone === "banish"
        ? ""
        : "No accepted server events are present in the current preview state.";

  return (
    <div className="top-20 right-16 z-30 absolute bg-[#111827]/95 shadow-2xl shadow-black/50 p-3 border border-white/10 rounded-lg w-72">
      <div className="flex justify-between items-center mb-3">
        <div className="font-semibold text-sm">{title}</div>
        <button
          aria-label="Close temporary zone"
          className="bg-slate-700 hover:bg-slate-600 p-1 rounded text-slate-100"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      {openZone === "banish" ? (
        <div className="gap-2 grid">
          <BoardSlot title="Player 1 Banish">
            <EmptyState label="No banished cards in preview state" />
          </BoardSlot>
          <BoardSlot title="Player 2 Banish">
            <EmptyState label="No banished cards in preview state" />
          </BoardSlot>
        </div>
      ) : (
        <EmptyState label={message} />
      )}
    </div>
  );
}
