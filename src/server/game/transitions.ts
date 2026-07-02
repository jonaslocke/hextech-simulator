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
