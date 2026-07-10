"use client";

import { DialogPortal } from "@/shared/components/dialog-portal";
import type { GameProjection } from "@/shared/game";
import { cn } from "@/shared/utils/cn";
import { Crown, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { GameActionButton } from "../../game-board/components/game-action-button";

export function MatchResultDialog({
  busy,
  onCreateMatch,
  projection,
}: {
  busy: boolean;
  onCreateMatch: () => void;
  projection: GameProjection;
}) {
  if (projection.status !== "complete" || !projection.winnerPlayerId) {
    return null;
  }

  const viewerWon = projection.winnerPlayerId === projection.viewerPlayerId;
  const winner = projection.players.find(
    (player) => player.playerId === projection.winnerPlayerId,
  );
  const loser = projection.players.find(
    (player) => player.playerId !== projection.winnerPlayerId,
  );

  const winnerName = getPlayerDisplayName(winner, "Winner");
  const loserName = getPlayerDisplayName(loser, "Loser");

  const resultLabel = viewerWon ? "Victory" : "Defeat";
  const resultDescription = viewerWon
    ? "You reached the Victory Score first."
    : "Your opponent reached the Victory Score first.";

  return (
    <DialogPortal>
      <div className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-slate-950/75 backdrop-blur-md p-4 overflow-hidden text-slate-100">
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 opacity-70",
            viewerWon
              ? "bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_50%_90%,rgba(251,191,36,0.16),transparent_36%)]"
              : "bg-[radial-gradient(circle_at_50%_20%,rgba(244,63,94,0.22),transparent_34%),radial-gradient(circle_at_50%_90%,rgba(251,191,36,0.12),transparent_36%)]",
          )}
        />

        <section
          aria-describedby="match-result-description"
          aria-labelledby="match-result-title"
          aria-modal="true"
          className="relative gap-5 grid bg-slate-950/82 shadow-2xl shadow-black/80 backdrop-blur-xl p-5 border border-white/12 rounded-2xl ring-1 ring-white/10 w-full max-w-md overflow-hidden text-center"
          role="dialog"
        >
          <div
            aria-hidden="true"
            className="top-0 absolute inset-x-0 bg-linear-to-r from-transparent via-cyan-200/60 to-transparent h-px pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="-top-24 left-1/2 absolute bg-white/10 blur-3xl rounded-full w-48 h-48 -translate-x-1/2 pointer-events-none"
          />

          <header className="relative justify-items-center gap-3 grid pt-2">
            <div
              className={cn(
                "flex justify-center items-center shadow-lg border rounded-2xl w-14 h-14",
                viewerWon
                  ? "border-cyan-200/30 bg-cyan-300/15 text-cyan-100 shadow-cyan-950/40"
                  : "border-rose-200/30 bg-rose-400/15 text-rose-100 shadow-rose-950/40",
              )}
            >
              {viewerWon ? (
                <Trophy className="w-7 h-7" />
              ) : (
                <Crown className="w-7 h-7" />
              )}
            </div>

            <div>
              <p className="inline-flex items-center gap-1.5 bg-amber-200/10 px-3 py-1 border border-amber-200/20 rounded-full font-semibold text-[10px] text-amber-100 uppercase tracking-[0.22em]">
                <Sparkles className="w-3 h-3" />
                Match complete
              </p>

              <h2
                className={cn(
                  "mt-3 font-semibold text-4xl tracking-tight",
                  viewerWon ? "text-cyan-100" : "text-rose-100",
                )}
                id="match-result-title"
              >
                {resultLabel}
              </h2>

              <p
                className="mx-auto mt-2 max-w-xs text-slate-300 text-sm leading-relaxed"
                id="match-result-description"
              >
                {resultDescription}
              </p>
            </div>
          </header>

          <div className="relative items-stretch gap-2 grid grid-cols-[1fr_auto_1fr] bg-white/4.5 shadow-black/25 shadow-inner p-2 border border-white/10 rounded-xl">
            <ScorePanel
              label="Winner"
              name={winnerName}
              points={winner?.points ?? 0}
              tone="winner"
            />

            <div className="flex flex-col justify-center items-center bg-amber-200/10 px-3 border border-amber-200/20 rounded-lg min-w-18">
              <p className="font-semibold text-[10px] text-amber-100/80 uppercase tracking-widest">
                Goal
              </p>
              <p className="mt-1 font-semibold tabular-nums text-amber-100 text-2xl">
                {projection.victoryScore}
              </p>
            </div>

            <ScorePanel
              label="Loser"
              name={loserName}
              points={loser?.points ?? 0}
              tone="loser"
            />
          </div>

          <div className="relative bg-slate-900/50 px-3 py-2 border border-white/10 rounded-xl text-slate-400 text-xs">
            <span className="text-slate-300">{winnerName}</span> reached the
            Victory Score.
          </div>

          <GameActionButton
            actionSlot="primary"
            className="relative bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 shadow-cyan-950/30 shadow-lg h-11 text-slate-950"
            isBusy={busy}
            keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
            onAction={onCreateMatch}
          >
            <span className="inline-flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              {busy ? "Creating…" : "Create New Match"}
            </span>
          </GameActionButton>
        </section>
      </div>
    </DialogPortal>
  );
}

function ScorePanel({
  label,
  name,
  points,
  tone,
}: {
  label: string;
  name: string;
  points: number;
  tone: "winner" | "loser";
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center items-center px-3 border rounded-lg min-h-20",
        tone === "winner"
          ? "border-cyan-200/20 bg-cyan-300/10"
          : "border-white/10 bg-white/4",
      )}
    >
      <p
        className={cn(
          "font-semibold text-[10px] uppercase tracking-widest",
          tone === "winner" ? "text-cyan-100/80" : "text-slate-500",
        )}
      >
        {label}
      </p>

      <p
        className={cn(
          "mt-1 max-w-24 font-semibold text-sm truncate",
          tone === "winner" ? "text-cyan-100" : "text-slate-300",
        )}
        title={name}
      >
        {name}
      </p>

      <p
        className={cn(
          "mt-1 font-semibold tabular-nums text-2xl",
          tone === "winner" ? "text-cyan-100" : "text-slate-300",
        )}
      >
        {points}
      </p>
    </div>
  );
}

function getPlayerDisplayName(
  player: GameProjection["players"][number] | undefined,
  fallback: string,
) {
  if (!player) {
    return fallback;
  }

  if ("displayName" in player && typeof player.displayName === "string") {
    const displayName = player.displayName.trim();

    if (displayName) {
      return displayName;
    }
  }

  return player.playerId;
}
