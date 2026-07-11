import {
  matchProjectionSchema,
  type MatchProjection,
  type RegisteredDeckConfiguration,
  type SideboardingCardView,
} from "@/shared/game";
import { BO3_MATCH_FEATURES } from "./bo3-match-config";
import { createInitialDeckConfiguration, registeredBattlefieldIds } from "./game-factory";
import {
  deriveRemainingBattlefieldRegisteredIdsByPlayerId,
  deriveScoreByPlayerId,
  deriveUsedBattlefieldRegisteredIdsByPlayerId,
} from "./match-derivations";
import { projectGame } from "./projection";
import type { DeckSnapshotDocument, GameEventDocument } from "./repositories";
import type { CardInstance } from "./state";
import type { GameDocument, MatchDocument } from "./state";

export function projectMatch(input: {
  match: MatchDocument;
  currentGame: GameDocument;
  viewerPlayerId: string;
  decks: DeckSnapshotDocument[];
  events?: GameEventDocument[];
}): MatchProjection {
  const viewerSeat = input.match.seats.find(
    (seat) => seat.playerId === input.viewerPlayerId,
  );
  const opponentSeat = input.match.seats.find(
    (seat) => seat.playerId !== input.viewerPlayerId,
  );
  if (!viewerSeat || !opponentSeat) {
    throw new Error("Viewer is not seated in this match.");
  }

  const usedBattlefields =
    deriveUsedBattlefieldRegisteredIdsByPlayerId(input.match);
  const remainingBattlefields =
    deriveRemainingBattlefieldRegisteredIdsByPlayerId(input.match, input.decks);
  const viewerDeck = input.decks.find(
    (deck) => deck.playerId === input.viewerPlayerId,
  );
  const currentGame = projectGame({
    game: input.currentGame,
    viewerPlayerId: input.viewerPlayerId,
    decks: input.decks,
    events: input.events,
    playerNames: playerNamesFromMatch(input.match),
  });

  return matchProjectionSchema.parse({
    matchId: input.match.id,
    stateVersion: input.match.stateVersion,
    format: input.match.format,
    status: input.match.status,
    viewerPlayerId: input.viewerPlayerId,
    scoreByPlayerId: deriveScoreByPlayerId(input.match),
    winnerPlayerId: input.match.completion?.winnerPlayerId ?? null,
    completionReason: input.match.completion?.reason ?? null,
    currentGameId: input.match.currentGameId,
    gameNumber: input.currentGame.gameNumber,
    gameIds: input.match.gameIds,
    completedGames: input.match.completedGames.map((game) => ({
      gameId: game.gameId,
      gameNumber: game.gameNumber,
      winnerPlayerId: game.winnerPlayerId,
      completionReason: game.completionReason,
    })),
    currentGame,
    betweenGames: input.match.betweenGames
      ? {
          id: input.match.betweenGames.id,
          mode: "sideboarding",
          nextGameNumber: input.match.betweenGames.nextGameNumber,
          previousGameWinnerPlayerId:
            input.match.betweenGames.previousGameWinnerPlayerId,
          previousGameLoserPlayerId:
            input.match.betweenGames.previousGameLoserPlayerId,
          nextStartingPlayerChooserId:
            input.match.betweenGames.nextStartingPlayerChooserId,
          viewerStatus:
            input.match.betweenGames.submissionsByPlayerId[
              input.viewerPlayerId
            ]?.status ?? "pending",
          opponentStatus:
            input.match.betweenGames.submissionsByPlayerId[
              opponentSeat.playerId
            ]?.status ?? "pending",
          usedBattlefieldRegisteredIdsByPlayerId: usedBattlefields,
          remainingBattlefieldRegisteredIdsByPlayerId: remainingBattlefields,
          nextBattlefieldMode:
            input.match.betweenGames.nextGameNumber === 3
              ? "server_auto"
              : "player_choice",
          viewerCurrentDeckConfiguration:
            viewerSeat.currentDeckConfiguration,
          capabilities: {
            canReadyWithCurrentConfiguration:
              !BO3_MATCH_FEATURES.sideboardingDeckReconfiguration &&
              BO3_MATCH_FEATURES.readyWithCurrentDeckConfiguration &&
              input.match.status === "between_games" &&
              (input.match.betweenGames.submissionsByPlayerId[
                input.viewerPlayerId
              ]?.status ?? "pending") === "pending",
            canSubmitDeckReconfiguration:
              BO3_MATCH_FEATURES.sideboardingDeckReconfiguration &&
              input.match.status === "between_games" &&
              (input.match.betweenGames.submissionsByPlayerId[
                input.viewerPlayerId
              ]?.status ?? "pending") === "pending",
            canConcedeMatch: input.match.status === "between_games",
          },
          sideboardingSession:
            viewerDeck && BO3_MATCH_FEATURES.sideboardingDeckReconfiguration
              ? buildSideboardingSession({
                  match: input.match,
                  viewerDeck,
                  viewerSeat,
                  opponentStatus:
                    input.match.betweenGames.submissionsByPlayerId[
                      opponentSeat.playerId
                    ]?.status ?? "pending",
                  usedBattlefields:
                    usedBattlefields[input.viewerPlayerId] ?? [],
                  remainingBattlefields:
                    remainingBattlefields[input.viewerPlayerId] ?? [],
                })
              : null,
        }
      : null,
  });
}

function playerNamesFromMatch(match: MatchDocument): Record<string, string> {
  return Object.fromEntries(
    match.seats.map((seat) => [
      seat.playerId,
      seat.displayName || seat.playerId,
    ]),
  );
}

function buildSideboardingSession(input: {
  match: MatchDocument;
  viewerDeck: DeckSnapshotDocument;
  viewerSeat: MatchDocument["seats"][number];
  opponentStatus: "pending" | "submitted";
  usedBattlefields: string[];
  remainingBattlefields: string[];
}) {
  const betweenGames = input.match.betweenGames;
  if (!betweenGames) return null;

  return {
    matchId: input.match.id,
    playerId: input.viewerSeat.playerId,
    gameNumber: betweenGames.nextGameNumber,
    expectedIntermissionVersion: input.match.stateVersion,
    originalRegisteredDeck: originalRegisteredDeckConfiguration(
      input.viewerDeck.instances,
    ),
    currentDeckConfiguration: input.viewerSeat.currentDeckConfiguration,
    eligibleChosenChampionRegisteredCardIds:
      eligibleChosenChampionRegisteredCardIds(input.viewerDeck),
    registeredCardPool: input.viewerDeck.instances.flatMap((copy) => {
      if (!copy.registeredCardId) return [];
      const card = input.viewerDeck.snapshot.cards.find(
        (candidate) => candidate.cardCode === copy.cardCode,
      )?.card;
      if (!card) return [];

      return [
        {
          registeredCardId: copy.registeredCardId,
          cardCode: copy.cardCode,
          canonicalName: canonicalGameplayName(card),
        },
      ];
    }),
    cardsByCode: Object.fromEntries(
      input.viewerDeck.snapshot.cards.map((definition) => [
        definition.cardCode,
        {
          cardCode: definition.cardCode,
          canonicalName: canonicalGameplayName(definition.card),
          name: definition.card.name,
          imageUrl: definition.card.media.image_url ?? null,
          rulesText: definition.card.text.plain,
          publicCode: definition.card.public_code,
          type: definition.card.classification.type,
          supertype: definition.card.classification.supertype,
          domains: definition.card.classification.domain,
          tags: definition.card.tags,
          energy: definition.card.attributes.energy,
          might: definition.card.attributes.might,
          power: definition.card.attributes.power,
        } satisfies SideboardingCardView,
      ]),
    ),
    context: {
      previousGameWinnerPlayerId: betweenGames.previousGameWinnerPlayerId,
      previousGameLoserPlayerId: betweenGames.previousGameLoserPlayerId,
      nextStartingPlayerChooserId: betweenGames.nextStartingPlayerChooserId,
      usedBattlefieldRegisteredCardIds: input.usedBattlefields,
      remainingBattlefieldRegisteredCardIds: input.remainingBattlefields,
      nextBattlefieldMode:
        betweenGames.nextGameNumber === 3 ? "server-auto" : "player-choice",
    },
    opponentStatus:
      input.opponentStatus === "submitted" ? "submitted" : "editing",
  };
}

function eligibleChosenChampionRegisteredCardIds(
  deck: DeckSnapshotDocument,
): string[] {
  const definitionsByCode = new Map(
    deck.snapshot.cards.map((definition) => [definition.cardCode, definition]),
  );
  const legend = deck.instances.find((copy) => copy.source === "legend");
  const legendDefinition = legend
    ? definitionsByCode.get(legend.cardCode)
    : undefined;
  if (!legend?.registeredCardId || !legendDefinition) return [];

  const legendTags = new Set(legendDefinition.card.tags);
  const legendDomains = new Set(legendDefinition.card.classification.domain);

  return deck.instances
    .filter(
      (copy) =>
        copy.registeredCardId &&
        ["champion", "mainDeck", "sideboard"].includes(copy.source),
    )
    .filter((copy) => {
      const definition = definitionsByCode.get(copy.cardCode);
      if (!definition) return false;
      const card = definition.card;
      const isChampionUnit =
        card.classification.type === "Unit" &&
        card.classification.supertype === "Champion";
      const matchesLegendTag = card.tags.some((tag) => legendTags.has(tag));
      const matchesLegendDomains = card.classification.domain.every((domain) =>
        legendDomains.has(domain),
      );

      return isChampionUnit && matchesLegendTag && matchesLegendDomains;
    })
    .map(requireRegisteredCardId);
}

function originalRegisteredDeckConfiguration(
  registeredCopies: readonly CardInstance[],
): RegisteredDeckConfiguration {
  const legend = registeredCopies.find((copy) => copy.source === "legend");
  if (!legend?.registeredCardId) {
    throw new Error("Registered deck is missing its Champion Legend.");
  }

  return {
    legendRegisteredCardId: legend.registeredCardId,
    ...createInitialDeckConfiguration(registeredCopies),
    runeDeckRegisteredCardIds: registeredCopies
      .filter((copy) => copy.source === "runeDeck")
      .map(requireRegisteredCardId),
    battlefieldRegisteredCardIds: registeredBattlefieldIds(registeredCopies),
  };
}

function canonicalGameplayName(card: { metadata: { clean_name?: string }; name: string }) {
  return (card.metadata.clean_name ?? card.name).replace(/\s+/g, " ").trim();
}

function requireRegisteredCardId(copy: CardInstance): string {
  if (!copy.registeredCardId) {
    throw new Error(`Registered card identity is unavailable: ${copy.instanceId}.`);
  }

  return copy.registeredCardId;
}
