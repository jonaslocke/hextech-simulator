"use client";

import type { MatchProjection } from "@/shared/game";
import { GameActionButton } from "@/features/game-board/components/game-action-button";
import { Flag, ShieldCheck } from "lucide-react";

export function BetweenGamesScreen({
  busy,
  onConcedeMatch,
  onReady,
  projection,
}: {
  busy: boolean;
  onConcedeMatch: () => void;
  onReady: () => void;
  projection: MatchProjection;
}) {
  const betweenGames = projection.betweenGames;
  if (!betweenGames) return null;

  const players = projection.currentGame.players;
  const previousWinner = players.find(
    (player) => player.playerId === betweenGames.previousGameWinnerPlayerId,
  );
  const nextChooser = players.find(
    (player) => player.playerId === betweenGames.nextStartingPlayerChooserId,
  );
  const viewerSubmitted = betweenGames.viewerStatus === "submitted";

  return (
    <main className="place-items-center grid bg-slate-950 p-5 min-h-screen text-slate-100 tabletop-background">
      <section className="gap-5 grid bg-slate-950/92 shadow-2xl p-5 border border-cyan-300/20 rounded-xl w-full max-w-3xl">
        <header className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
              Between games
            </p>
            <h1 className="mt-1 font-semibold text-2xl">
              Game {betweenGames.nextGameNumber} setup
            </h1>
          </div>
          <ScoreSummary projection={projection} />
        </header>

        <div className="gap-3 grid sm:grid-cols-3">
          <InfoPanel
            label="Completed"
            value={`Game ${betweenGames.nextGameNumber - 1}`}
            detail={`${previousWinner?.displayName ?? "Winner"} won`}
          />
          <InfoPanel
            label="Next chooser"
            value={nextChooser?.displayName ?? betweenGames.nextStartingPlayerChooserId}
            detail="Chooses who starts"
          />
          <InfoPanel
            label="Battlefield"
            value={
              betweenGames.nextBattlefieldMode === "server_auto"
                ? "Automatic"
                : "Player choice"
            }
            detail={
              betweenGames.nextBattlefieldMode === "server_auto"
                ? "Final unused Battlefield"
                : "Used Battlefields unavailable"
            }
          />
        </div>

        <div className="gap-3 grid md:grid-cols-2">
          {players.map((player) => (
            <BattlefieldUsage
              key={player.playerId}
              playerName={player.displayName}
              remaining={
                betweenGames.remainingBattlefieldRegisteredIdsByPlayerId[
                  player.playerId
                ] ?? []
              }
              used={
                betweenGames.usedBattlefieldRegisteredIdsByPlayerId[
                  player.playerId
                ] ?? []
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 bg-white/5 p-3 border border-white/10 rounded-lg">
          <div className="flex items-center gap-3 text-sm">
            <ReadinessBadge label="You" status={betweenGames.viewerStatus} />
            <ReadinessBadge
              label="Opponent"
              status={betweenGames.opponentStatus}
            />
          </div>
          {viewerSubmitted && betweenGames.opponentStatus === "pending" && (
            <p className="text-slate-400 text-sm">
              Waiting for opponent readiness.
            </p>
          )}
        </div>

        <div className="gap-3 grid sm:grid-cols-[1fr_auto]">
          <GameActionButton
            actionSlot="primary"
            disabled={
              !betweenGames.capabilities.canReadyWithCurrentConfiguration ||
              viewerSubmitted
            }
            fullWidth
            isBusy={busy}
            onAction={onReady}
            size="lg"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {viewerSubmitted ? "Ready submitted" : "Ready for next game"}
            </span>
          </GameActionButton>
          <GameActionButton
            actionSlot="cancel"
            disabled={!betweenGames.capabilities.canConcedeMatch}
            isBusy={busy}
            onAction={onConcedeMatch}
            size="lg"
            variant="destructive"
          >
            <span className="inline-flex items-center gap-2">
              <Flag className="w-4 h-4" />
              Concede match
            </span>
          </GameActionButton>
        </div>
      </section>
    </main>
  );
}

function ScoreSummary({ projection }: { projection: MatchProjection }) {
  return (
    <div className="flex gap-2">
      {projection.currentGame.players.map((player) => (
        <div
          className="bg-white/5 px-3 py-2 border border-white/10 rounded-lg min-w-24"
          key={player.playerId}
        >
          <p className="max-w-24 truncate text-slate-400 text-xs">
            {player.displayName}
          </p>
          <p className="font-semibold tabular-nums text-cyan-100 text-xl">
            {projection.scoreByPlayerId[player.playerId] ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}

function InfoPanel({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/5 p-3 border border-white/10 rounded-lg">
      <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-widest">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-100 truncate">{value}</p>
      <p className="mt-1 text-slate-400 text-xs">{detail}</p>
    </div>
  );
}

function BattlefieldUsage({
  playerName,
  remaining,
  used,
}: {
  playerName: string;
  remaining: string[];
  used: string[];
}) {
  return (
    <div className="bg-white/5 p-3 border border-white/10 rounded-lg">
      <p className="font-semibold text-slate-200">{playerName}</p>
      <p className="mt-2 text-slate-400 text-xs">
        Used: {used.length ? used.map(shortId).join(", ") : "none"}
      </p>
      <p className="mt-1 text-slate-400 text-xs">
        Remaining:{" "}
        {remaining.length ? remaining.map(shortId).join(", ") : "none"}
      </p>
    </div>
  );
}

function ReadinessBadge({
  label,
  status,
}: {
  label: string;
  status: "pending" | "submitted";
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="bg-slate-900 px-2 py-1 border border-white/10 rounded text-xs">
        {status === "submitted" ? "Ready" : "Pending"}
      </span>
    </span>
  );
}

function shortId(value: string) {
  return value.split(":").slice(-2).join(":");
}
