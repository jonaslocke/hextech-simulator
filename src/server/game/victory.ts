import {
  createRuntimeCardIndex,
} from "./primitive-handlers";
import { effectiveNumericValue } from "./numeric-modifiers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";

export const BASE_VICTORY_SCORE = 8;

export function victoryRequirement(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
  baseRequirement = BASE_VICTORY_SCORE,
): number {
  return effectiveNumericValue({
    attribute: "victoryRequirement",
    baseValue: baseRequirement,
    game,
    index: createRuntimeCardIndex(decks, game),
    targetScope: "game",
  });
}
