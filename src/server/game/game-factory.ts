import { gameDocumentSchema, type ActiveGameDeck, type CardInstance, type DeckConfiguration, type GameDocument, type MatchSeat } from "./state";
import type { DeckSnapshotDocument } from "./repositories";

export type CreateMatchGameInput = {
  matchId: string;
  gameNumber: 1 | 2 | 3;
  now: string;
  players: [MatchSeat, MatchSeat];
  registeredDecksByPlayerId: Record<string, DeckSnapshotDocument>;
  activeConfigurationsByPlayerId: Record<string, DeckConfiguration>;
  startingPlayerChooserId: string;
  availableBattlefieldRegisteredIdsByPlayerId: Record<string, string[]>;
  autoSelectedBattlefieldRegisteredIdByPlayerId?: Record<string, string>;
};

export function createMatchGame(input: CreateMatchGameInput): GameDocument {
  const playerIds = input.players.map((player) => player.playerId) as [
    string,
    string,
  ];
  const runtimeDecks = Object.fromEntries(
    playerIds.map((playerId) => {
      const registeredDeck = input.registeredDecksByPlayerId[playerId];
      const configuration = input.activeConfigurationsByPlayerId[playerId];
      if (!registeredDeck || !configuration) {
        throw new Error(`Missing deck input for player ${playerId}.`);
      }

      const activeDeck = resolveActiveGameDeck({
        registeredCopies: registeredDeck.instances,
        configuration,
        availableBattlefieldRegisteredCardIds:
          input.availableBattlefieldRegisteredIdsByPlayerId[playerId] ?? [],
      });

      return [
        playerId,
        createRuntimeInstances({
          matchId: input.matchId,
          gameNumber: input.gameNumber,
          playerId,
          registeredCopies: registeredDeck.instances,
          activeDeck,
        }),
      ] as const;
    }),
  );
  const allRuntimeInstances = playerIds.flatMap(
    (playerId) => runtimeDecks[playerId]!,
  );
  const runtimeByRegisteredIdByPlayerId = Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      new Map(
        runtimeDecks[playerId]!.map((instance) => [
          instance.registeredCardId!,
          instance.instanceId,
        ]),
      ),
    ]),
  );
  const players = Object.fromEntries(
    playerIds.map((playerId) => {
      const registeredDeck = input.registeredDecksByPlayerId[playerId]!;
      const configuration = input.activeConfigurationsByPlayerId[playerId]!;
      const activeDeck = resolveActiveGameDeck({
        registeredCopies: registeredDeck.instances,
        configuration,
        availableBattlefieldRegisteredCardIds:
          input.availableBattlefieldRegisteredIdsByPlayerId[playerId] ?? [],
      });
      const runtimeByRegisteredId =
        runtimeByRegisteredIdByPlayerId[playerId]!;

      return [
        playerId,
        {
          playerId,
          points: 0,
          scoredBattlefieldIdsThisTurn: [],
          energy: 0,
          conditionalEnergy: 0,
          power: {},
          zones: {
            legend: null,
            champion: null,
            mainDeck: activeDeck.mainDeckRegisteredCardIds.map((id) =>
              requireRuntimeId(runtimeByRegisteredId, id),
            ),
            runeDeck: activeDeck.runeDeckRegisteredCardIds.map((id) =>
              requireRuntimeId(runtimeByRegisteredId, id),
            ),
            hand: [],
            trash: [],
            banishment: [],
            base: [],
          },
        },
      ] as const;
    }),
  );
  const cardStates = Object.fromEntries(
    allRuntimeInstances.map((instance) => {
      const deck = input.registeredDecksByPlayerId[instance.ownerPlayerId]!;
      const definition = deck.snapshot.cards.find(
        (candidate) => candidate.cardCode === instance.cardCode,
      );
      if (!definition) {
        throw new Error(`Card definition unavailable: ${instance.cardCode}.`);
      }

      return [
        instance.instanceId,
        {
          exhausted: false,
          damage: 0,
          computedMight: definition.card.attributes.might,
          objectVersion: 0,
        },
      ] as const;
    }),
  );
  const battlefieldPools = Object.fromEntries(
    playerIds.map((playerId) => {
      const runtimeByRegisteredId =
        runtimeByRegisteredIdByPlayerId[playerId]!;
      return [
        playerId,
        (input.availableBattlefieldRegisteredIdsByPlayerId[playerId] ?? []).map(
          (id) => requireRuntimeId(runtimeByRegisteredId, id),
        ),
      ] as const;
    }),
  );
  const battlefieldChoices = Object.fromEntries(
    playerIds.map((playerId) => {
      const selected =
        input.autoSelectedBattlefieldRegisteredIdByPlayerId?.[playerId];
      const runtimeByRegisteredId =
        runtimeByRegisteredIdByPlayerId[playerId]!;

      return [
        playerId,
        selected
          ? {
              status: "revealed" as const,
              cardInstanceId: requireRuntimeId(runtimeByRegisteredId, selected),
            }
          : { status: "unlocked" as const, cardInstanceId: null },
      ] as const;
    }),
  );

  return gameDocumentSchema.parse({
    id: `${input.matchId}:game:${input.gameNumber}`,
    createdAt: input.now,
    updatedAt: input.now,
    matchId: input.matchId,
    gameNumber: input.gameNumber,
    stateVersion: 0,
    status: "setup_pending",
    winnerPlayerId: null,
    completionReason: null,
    state: {
      setup: {
        playerIds,
        startingPlayerChooserId: input.startingPlayerChooserId,
        startingPlayerId: null,
        battlefieldPools,
        battlefieldChoices,
        mulligans: Object.fromEntries(
          playerIds.map((id) => [
            id,
            { status: "unlocked", selectedCardInstanceIds: [] },
          ]),
        ),
      },
      players,
      battlefields: [],
      cardStates,
      createdCardInstances: [],
      createdCardDefinitions: [],
      turn: null,
      chain: null,
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: [],
    },
  });
}

export function createInitialDeckConfiguration(
  registeredCopies: readonly CardInstance[],
): DeckConfiguration {
  const champion = registeredCopies.find((copy) => copy.source === "champion");
  if (!champion?.registeredCardId) {
    throw new Error("Registered deck must contain a chosen champion.");
  }

  return {
    chosenChampionRegisteredCardId: champion.registeredCardId,
    mainDeckRegisteredCardIds: registeredCopies
      .filter((copy) => copy.source === "mainDeck")
      .map(requireRegisteredCardId),
    sideboardRegisteredCardIds: registeredCopies
      .filter((copy) => copy.source === "sideboard")
      .map(requireRegisteredCardId),
  };
}

export function registeredBattlefieldIds(
  registeredCopies: readonly CardInstance[],
): string[] {
  return registeredCopies
    .filter((copy) => copy.source === "battlefield")
    .map(requireRegisteredCardId);
}

export function resolveActiveGameDeck(input: {
  registeredCopies: readonly CardInstance[];
  configuration: DeckConfiguration;
  availableBattlefieldRegisteredCardIds: string[];
}): ActiveGameDeck {
  const legend = input.registeredCopies.find((copy) => copy.source === "legend");
  if (!legend?.registeredCardId) {
    throw new Error("Registered deck must contain a champion legend.");
  }

  return {
    legendRegisteredCardId: legend.registeredCardId,
    chosenChampionRegisteredCardId:
      input.configuration.chosenChampionRegisteredCardId,
    mainDeckRegisteredCardIds: input.configuration.mainDeckRegisteredCardIds,
    runeDeckRegisteredCardIds: input.registeredCopies
      .filter((copy) => copy.source === "runeDeck")
      .map(requireRegisteredCardId),
    availableBattlefieldRegisteredCardIds:
      input.availableBattlefieldRegisteredCardIds,
    sideboardRegisteredCardIds: input.configuration.sideboardRegisteredCardIds,
  };
}

function createRuntimeInstances(input: {
  matchId: string;
  gameNumber: 1 | 2 | 3;
  playerId: string;
  registeredCopies: readonly CardInstance[];
  activeDeck: ActiveGameDeck;
}): CardInstance[] {
  void input.matchId;
  void input.gameNumber;
  void input.playerId;

  const activeRegisteredIds = new Set([
    input.activeDeck.legendRegisteredCardId,
    input.activeDeck.chosenChampionRegisteredCardId,
    ...input.activeDeck.mainDeckRegisteredCardIds,
    ...input.activeDeck.runeDeckRegisteredCardIds,
    ...input.activeDeck.availableBattlefieldRegisteredCardIds,
  ]);

  return input.registeredCopies
    .filter(
      (copy) =>
        copy.registeredCardId && activeRegisteredIds.has(copy.registeredCardId),
    )
    .map((copy) => ({ ...copy }));
}

function requireRuntimeId(
  runtimeByRegisteredId: Map<string, string>,
  registeredCardId: string,
): string {
  const id = runtimeByRegisteredId.get(registeredCardId);
  if (!id) {
    throw new Error(`Runtime card is unavailable: ${registeredCardId}.`);
  }

  return id;
}

function requireRegisteredCardId(copy: CardInstance): string {
  if (!copy.registeredCardId) {
    throw new Error(`Registered card identity is unavailable: ${copy.instanceId}.`);
  }

  return copy.registeredCardId;
}
