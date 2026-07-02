import type { ProjectedAction } from "../../shared/game";
import type { GameDocument } from "./state";

export type GameTransitionEvent = {
  type: string;
  actorPlayerId: string | null;
  message: string;
  payload: Record<string, string | number | boolean | null>;
};

export type GameTransition = {
  game: GameDocument;
  events: GameTransitionEvent[];
};

export function acceptedActionEvent(
  actorPlayerId: string,
  action: ProjectedAction
): GameTransitionEvent {
  return {
    type: "game.action.accepted",
    actorPlayerId,
    message: `${actorPlayerId}: ${action.label}`,
    payload: { actionId: action.id }
  };
}

export function stateChangeEvents(
  before: GameDocument,
  after: GameDocument
): GameTransitionEvent[] {
  const events: GameTransitionEvent[] = [];
  if (!before.state.showdown && after.state.showdown) {
    events.push({
      type: "showdown.started",
      actorPlayerId: after.state.showdown.focusPlayerId,
      message: `${after.state.showdown.kind === "combat" ? "Combat showdown" : "Showdown"} started.`,
      payload: {
        battlefieldId: after.state.showdown.battlefieldId,
        kind: after.state.showdown.kind
      }
    });
  }
  if (before.state.showdown && !after.state.showdown) {
    events.push({
      type: "showdown.ended",
      actorPlayerId: null,
      message: "Showdown ended.",
      payload: { battlefieldId: before.state.showdown.battlefieldId }
    });
  }
  if (!before.state.combat && after.state.combat) {
    events.push({
      type: "combat.started",
      actorPlayerId: after.state.combat.attackerPlayerId,
      message: `${after.state.combat.attackerPlayerId} attacked ${after.state.combat.defenderPlayerId}.`,
      payload: { battlefieldId: after.state.combat.battlefieldId }
    });
  }
  if (before.state.combat && !after.state.combat) {
    events.push({
      type: "combat.resolved",
      actorPlayerId: null,
      message: "Combat resolved.",
      payload: { battlefieldId: before.state.combat.battlefieldId }
    });
  }
  for (const battlefield of after.state.battlefields) {
    const previous = before.state.battlefields.find(
      (candidate) => candidate.battlefieldId === battlefield.battlefieldId
    );
    if (
      previous &&
      previous.controllerPlayerId !== battlefield.controllerPlayerId
    ) {
      events.push({
        type: "battlefield.controlChanged",
        actorPlayerId: battlefield.controllerPlayerId ?? null,
        message: battlefield.controllerPlayerId
          ? `${battlefield.controllerPlayerId} gained control of a battlefield.`
          : "A battlefield became uncontrolled.",
        payload: {
          battlefieldId: battlefield.battlefieldId,
          controllerPlayerId: battlefield.controllerPlayerId ?? null
        }
      });
    }
  }
  for (const playerId of after.state.setup.playerIds) {
    const oldPoints = before.state.players[playerId]?.points ?? 0;
    const newPoints = after.state.players[playerId]?.points ?? 0;
    if (oldPoints !== newPoints) {
      events.push({
        type: "player.scored",
        actorPlayerId: playerId,
        message: `${playerId} reached ${newPoints} point${newPoints === 1 ? "" : "s"}.`,
        payload: { playerId, points: newPoints }
      });
    }
  }
  if (!before.winnerPlayerId && after.winnerPlayerId) {
    events.push({
      type: "game.won",
      actorPlayerId: after.winnerPlayerId,
      message: `${after.winnerPlayerId} won the game.`,
      payload: { winnerPlayerId: after.winnerPlayerId }
    });
  }
  return events;
}
