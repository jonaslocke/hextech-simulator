import { Grid2X2, List, Users } from "lucide-react";
import { Button } from "@/shared/components/button";
import type { MatchProjection, SideboardingSessionInput } from "@/shared/game";
import type { SideboardingEditorMode } from "../sideboarding-types";

export function SideboardingHeader({
  editorMode,
  onEditorModeChange,
  projection,
  session,
}: {
  editorMode: SideboardingEditorMode;
  onEditorModeChange: (mode: SideboardingEditorMode) => void;
  projection: MatchProjection;
  session: SideboardingSessionInput;
}) {
  const players = projection.currentGame.players;
  const previousWinner = players.find(
    (player) => player.playerId === session.context.previousGameWinnerPlayerId,
  );
  const nextChooser = players.find(
    (player) => player.playerId === session.context.nextStartingPlayerChooserId,
  );

  return (
    <header className="sticky top-0 z-20 border-cyan-300/20 border-b bg-slate-950/95 px-4 py-3 text-slate-100 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.18em]">
            Between games
          </p>
          <h1 className="mt-1 font-semibold text-xl">
            Game {session.gameNumber} sideboarding
          </h1>
          <p className="mt-1 text-slate-400 text-xs">
            Game {session.gameNumber - 1}:{" "}
            {previousWinner?.displayName ?? "Winner"} won.{" "}
            {nextChooser?.displayName ?? "Chooser"} will choose who starts next.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <Users className="h-4 w-4 text-cyan-200" />
            <span className="text-slate-400">Opponent</span>
            <span className="font-semibold text-slate-100">
              {session.opponentStatus === "submitted" ? "Submitted" : "Editing"}
            </span>
          </div>
          <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-1">
            <Button
              aria-label="Compact list"
              onClick={() => onEditorModeChange("compact")}
              size="icon-sm"
              type="button"
              variant={editorMode === "compact" ? "default" : "ghost"}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              aria-label="Card grid"
              onClick={() => onEditorModeChange("grid")}
              size="icon-sm"
              type="button"
              variant={editorMode === "grid" ? "default" : "ghost"}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
