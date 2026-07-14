"use client";

import { CardRulesText } from "@/features/card-presentation";
import { GameActionButton } from "@/features/game-board/components/game-action-button";
import { Button } from "@/shared/components/button";
import { DialogPortal } from "@/shared/components/dialog-portal";
import { cn } from "@/shared/utils/cn";
import { useEffect, useMemo, useState } from "react";
import type { TokenPlacementDecisionRequest } from "./player-decision-types";

export function TokenPlacementPrompt({
  decision,
  isSubmitting,
  onSubmit,
}: {
  decision: TokenPlacementDecisionRequest;
  isSubmitting: boolean;
  onSubmit: (
    placements: Array<{ destinationId: string; count: number }>,
  ) => void;
}) {
  const firstDestinationId = decision.destinations[0]?.id ?? "base";
  const [counts, setCounts] = useState<Record<string, number>>(() => ({
    [firstDestinationId]: decision.count,
  }));
  const destinationKey = useMemo(
    () => decision.destinations.map((destination) => destination.id).join("|"),
    [decision.destinations],
  );

  useEffect(() => {
    setCounts({
      [firstDestinationId]: decision.count,
    });
  }, [decision.count, decision.decisionKey, destinationKey, firstDestinationId]);
  const assigned = useMemo(
    () =>
      decision.destinations.reduce(
        (sum, destination) => sum + (counts[destination.id] ?? 0),
        0,
      ),
    [counts, decision.destinations],
  );
  const canConfirm = assigned === decision.count;

  function setCount(destinationId: string, nextCount: number) {
    setCounts((current) => ({
      ...current,
      [destinationId]: Math.max(0, Math.min(decision.count, nextCount)),
    }));
  }

  return (
    <DialogPortal>
      <div className="z-[2147483646] fixed inset-0 flex justify-center items-center bg-black/70 backdrop-blur-sm p-4 text-slate-100">
        <section
          aria-modal="true"
          className={cn(
            "gap-4 grid rounded-xl w-full max-w-xl overflow-hidden",
            "border border-cyan-300/25 bg-slate-950/82 p-4 shadow-2xl shadow-black/80 ring-1 ring-cyan-300/10",
          )}
          role="dialog"
        >
          <header className="space-y-1">
            <h2 className="font-semibold text-slate-50 text-lg leading-tight">
              {decision.title}
            </h2>
            {decision.description && (
              <div className="text-slate-400 text-sm leading-5">
                <CardRulesText text={decision.description} />
              </div>
            )}
          </header>

          <div className="gap-2 grid">
            {decision.destinations.map((destination) => {
              const count = counts[destination.id] ?? 0;
              return (
                <div
                  className="flex items-center gap-3 bg-white/5.5 p-2 border border-white/10 rounded-lg min-h-14"
                  key={destination.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-100 text-sm">
                      {destination.label}
                    </div>
                  </div>
                  <Button
                    disabled={count <= 0}
                    onClick={() => setCount(destination.id, count - 1)}
                    type="button"
                    variant="secondary"
                  >
                    -
                  </Button>
                  <span className="w-8 font-mono text-center text-sm">
                    {count}
                  </span>
                  <Button
                    disabled={assigned >= decision.count}
                    onClick={() => setCount(destination.id, count + 1)}
                    type="button"
                    variant="secondary"
                  >
                    +
                  </Button>
                </div>
              );
            })}
          </div>

          <footer className="flex justify-between items-center gap-2 pt-3 border-white/10 border-t">
            <span className="text-slate-400 text-sm">
              {decision.placementKind === "unit"
                ? `${assigned}/${decision.count} destination selected`
                : `${assigned}/${decision.count} placed`}
            </span>
            <GameActionButton
              actionSlot="primary"
              isBusy={!canConfirm || isSubmitting}
              onAction={() =>
                onSubmit(
                  decision.destinations
                    .map((destination) => ({
                      destinationId: destination.id,
                      count: counts[destination.id] ?? 0,
                    }))
                    .filter((placement) => placement.count > 0),
                )
              }
            >
              {isSubmitting
                ? "Submitting..."
                : decision.confirmLabel ?? "Place tokens"}
            </GameActionButton>
          </footer>
        </section>
      </div>
    </DialogPortal>
  );
}
