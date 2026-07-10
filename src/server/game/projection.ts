import {
  gameProjectionSchema,
  type GameProjection,
  type ProjectedCardView,
  type ProjectedZone,
} from "../../shared/game";
import type { DeckSnapshotDocument, GameEventDocument } from "./repositories";
import { setupActions } from "./setup";
import { gameplayActions } from "./actions";
import type { ChainItem, GameDocument } from "./state";
import { victoryRequirement } from "./victory";

export function projectGame(input: {
  game: GameDocument;
  viewerPlayerId: string;
  decks: DeckSnapshotDocument[];
  events?: GameEventDocument[];
  playerNames?: Partial<Record<string, string>>;
}): GameProjection {
  const definitions = new Map(
    [
      ...input.decks.flatMap((deck) =>
        deck.snapshot.cards.map(
          (definition) => [definition.cardCode, definition] as const,
        ),
      ),
      ...(input.game.state.createdCardDefinitions ?? []).map(
        (definition) => [definition.cardCode, definition] as const,
      ),
    ],
  );
  const instances = new Map(
    [
      ...input.decks.flatMap((deck) =>
        deck.instances.map(
          (instance) => [instance.instanceId, instance] as const,
        ),
      ),
      ...(input.game.state.createdCardInstances ?? []).map(
        (instance) => [instance.instanceId, instance] as const,
      ),
    ],
  );
  const view = (id: string): ProjectedCardView => {
    const instance = instances.get(id)!;
    const definition = definitions.get(instance.cardCode)!;
    const state = input.game.state.cardStates[id]!;
    const card = definition.card;
    return {
      instanceId: id,
      ownerPlayerId: instance.ownerPlayerId,
      name: card.name,
      imageUrl: card.media.image_url ?? null,
      rulesText: card.text.plain,
      publicCode: card.public_code,
      type: card.classification.type,
      supertype: card.classification.supertype,
      domains: card.classification.domain,
      energy: card.attributes.energy,
      might: card.attributes.might,
      power: card.attributes.power,
      computedMight: state.computedMight,
      damage: state.damage,
      exhausted: state.exhausted,
    };
  };
  const players = input.game.state.setup.playerIds.map((playerId) => {
    const player = input.game.state.players[playerId]!;
    const isViewer = playerId === input.viewerPlayerId;
    const zones = (
      Object.entries(player.zones) as Array<
        [ProjectedZone["kind"], string[] | string | null]
      >
    ).map(([kind, value]) => {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      const visibility =
        kind === "hand"
          ? isViewer
            ? "private"
            : "secret"
          : ["mainDeck", "runeDeck"].includes(kind)
            ? "secret"
            : "public";
      return {
        kind,
        visibility,
        count: ids.length,
        cards: visibility === "secret" ? [] : ids.map(view),
      };
    });
    return {
      playerId,
      displayName: input.playerNames?.[playerId] ?? playerId,
      isViewer,
      points: player.points ?? 0,
      energy: player.energy,
      conditionalEnergy: player.conditionalEnergy,
      power: player.power,
      zones,
    };
  });
  return gameProjectionSchema.parse({
    id: input.game.id,
    matchId: input.game.matchId,
    gameNumber: 1,
    stateVersion: input.game.stateVersion,
    status: input.game.status,
    viewerPlayerId: input.viewerPlayerId,
    activePlayerId: input.game.state.turn?.activePlayerId ?? null,
    winnerPlayerId: input.game.winnerPlayerId,
    victoryScore: victoryRequirement(input.game, input.decks),
    players,
    setup: {
      playerIds: input.game.state.setup.playerIds,
      startingPlayerChooserId: input.game.state.setup.startingPlayerChooserId,
      startingPlayerId: input.game.state.setup.startingPlayerId,
      battlefieldChoices: Object.fromEntries(
        input.game.state.setup.playerIds.map((playerId) => {
          const choice = input.game.state.setup.battlefieldChoices[playerId]!;
          return [
            playerId,
            {
              status: choice?.status ?? "revealed",
              cardInstanceId:
                choice &&
                (choice.status === "revealed" ||
                  playerId === input.viewerPlayerId)
                  ? choice.cardInstanceId
                  : null,
            },
          ];
        }),
      ),
      mulligans: Object.fromEntries(
        input.game.state.setup.playerIds.map((playerId) => [
          playerId,
          {
            status:
              input.game.state.setup.mulligans[playerId]?.status ?? "unlocked",
          },
        ]),
      ),
      battlefieldPool: (
        input.game.state.setup.battlefieldPools[input.viewerPlayerId] ?? []
      ).map(view),
      waitingReason: waitingReason(input.game, input.viewerPlayerId),
    },
    turn: input.game.state.turn
      ? { ...input.game.state.turn, passedPlayerIds: [] }
      : null,
    showdown: input.game.state.showdown
      ? {
          ...input.game.state.showdown,
          priorityPlayerId: input.game.state.chain?.priorityPlayerId ?? null,
        }
      : null,
    pendingChoice:
      input.game.state.pendingChoice?.type === "orderTriggers"
        ? {
            type: "orderTriggers",
            id: input.game.state.pendingChoice.id,
            playerId: input.game.state.pendingChoice.playerId,
            prompt: "Choose the order for triggered abilities.",
            optionIds:
              input.game.state.pendingChoice.playerId === input.viewerPlayerId
                ? input.game.state.pendingChoice.optionIds
                : [],
            pendingChainItems:
              input.game.state.pendingChoice.playerId === input.viewerPlayerId
                ? input.game.state.pendingChoice.pendingItems.map((item) =>
                    projectChainItem(item, view, definitions, instances),
                  )
                : [],
          }
        : input.game.state.pendingChoice?.type === "effectSelection"
          ? {
              type: "effectSelection",
              id: input.game.state.pendingChoice.id,
              playerId: input.game.state.pendingChoice.playerId,
              prompt: input.game.state.pendingChoice.prompt,
              title: "Card selection",
              waitingMessage:
                input.game.state.pendingChoice.playerId === input.viewerPlayerId
                  ? input.game.state.pendingChoice.prompt
                  : `Waiting for the other player to complete: ${input.game.state.pendingChoice.prompt}`,
              sourceZone: input.game.state.pendingChoice.sourceZone,
              presentation: input.game.state.pendingChoice.presentation,
              revealedCards:
                input.game.state.pendingChoice.playerId ===
                  input.viewerPlayerId &&
                input.game.state.pendingChoice.presentation === "vision"
                  ? input.game.state.pendingChoice.legalCardIds.map(view)
                  : [],
              minimum: input.game.state.pendingChoice.minimum,
              maximum: input.game.state.pendingChoice.maximum,
            }
          : input.game.state.pendingChoice?.type === "assignCombatDamage"
            ? {
                type: "assignCombatDamage",
                id: input.game.state.pendingChoice.id,
                playerId: input.game.state.pendingChoice.playerId,
                totalDamage: input.game.state.pendingChoice.totalDamage,
              }
            : input.game.state.pendingChoice?.type === "tokenPlacement"
              ? {
                  type: "tokenPlacement",
                  id: input.game.state.pendingChoice.id,
                  playerId: input.game.state.pendingChoice.playerId,
                  prompt: input.game.state.pendingChoice.prompt,
                  title: "Token placement",
                  waitingMessage:
                    input.game.state.pendingChoice.playerId === input.viewerPlayerId
                      ? input.game.state.pendingChoice.prompt
                      : `Waiting for the other player to place ${input.game.state.pendingChoice.tokenName} tokens.`,
                  tokenName: input.game.state.pendingChoice.tokenName,
                  count: input.game.state.pendingChoice.count,
                  destinations:
                    input.game.state.pendingChoice.playerId ===
                    input.viewerPlayerId
                      ? input.game.state.pendingChoice.legalDestinationIds.map(
                          (id) => ({
                            id,
                            label:
                              input.game.state.pendingChoice
                                ?.type === "tokenPlacement"
                                ? input.game.state.pendingChoice
                                    .destinationLabels[id] ?? id
                                : id,
                          }),
                        )
                      : [],
                }
            : null,
    combat: input.game.state.combat
      ? {
          battlefieldId: input.game.state.combat.battlefieldId,
          stage: input.game.state.combat.stage,
          attackerPlayerId: input.game.state.combat.attackerPlayerId,
          defenderPlayerId: input.game.state.combat.defenderPlayerId,
          attackerUnitIds: input.game.state.combat.attackerUnitIds,
          defenderUnitIds: input.game.state.combat.defenderUnitIds,
          attackerMight: input.game.state.combat.attackerMight,
          defenderMight: input.game.state.combat.defenderMight,
        }
      : null,
    battlefields: input.game.state.battlefields.map((battlefield) => ({
      battlefieldId: battlefield.battlefieldId,
      selectedByPlayerId: battlefield.selectedByPlayerId,
      controllerPlayerId: battlefield.controllerPlayerId ?? null,
      contestedByPlayerId: battlefield.contestedByPlayerId ?? null,
      card: view(battlefield.cardInstanceId),
      units: battlefield.units.map(view),
      facedownCard: null,
    })),
    chain: input.game.state.chain
      ? {
          items: input.game.state.chain.items.map((item) =>
            projectChainItem(item, view, definitions, instances),
          ),
          relevantPlayerIds: input.game.state.chain.relevantPlayerIds,
          priorityPlayerId: input.game.state.chain.priorityPlayerId,
          passedPlayerIds: input.game.state.chain.passedPlayerIds,
        }
      : null,
    actions: (input.game.status === "setup_pending"
      ? setupActions(input.game, input.viewerPlayerId)
      : gameplayActions(input.game, input.viewerPlayerId, input.decks)
    ).map((action) => {
      if (!action.id.includes(":setup:lockBattlefield:")) return action;
      const cardId = action.id.split(":").slice(4).join(":");
      return { ...action, label: `Choose ${view(cardId).name}` };
    }),
    logEntries: (input.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      createdAt: event.createdAt,
    })),
  });
}

function projectChainItem(
  item: ChainItem,
  view: (id: string) => ProjectedCardView,
  definitions: Map<string, DeckSnapshotDocument["snapshot"]["cards"][number]>,
  instances: Map<string, DeckSnapshotDocument["instances"][number]>,
) {
  return {
    id: item.id,
    label: item.label,
    controllerPlayerId: item.controllerPlayerId,
    sourceCardInstanceId: item.sourceCardInstanceId,
    targetCardInstanceIds: item.targetCardInstanceIds,
    kind:
      item.kind === "activatedAbility"
        ? ("ability" as const)
        : item.kind === "trigger"
          ? ("trigger" as const)
          : definitionKind(item.sourceCardInstanceId, definitions, instances),
    card: item.sourceCardInstanceId ? view(item.sourceCardInstanceId) : null,
  };
}

function waitingReason(
  game: GameDocument,
  viewerPlayerId: string,
): string | null {
  if (game.status !== "setup_pending") return null;
  const choice = game.state.setup.battlefieldChoices[viewerPlayerId];
  if (choice?.status === "locked")
    return "Waiting for the other player to choose a battlefield.";
  if (
    game.state.setup.startingPlayerId === null &&
    game.state.setup.startingPlayerChooserId !== viewerPlayerId
  ) {
    return "Waiting for the starting-player choice.";
  }
  if (game.state.setup.mulligans[viewerPlayerId]?.status === "locked")
    return "Waiting for the other player to finish their mulligan.";
  return null;
}

function definitionKind(
  sourceId: string | null,
  definitions: Map<string, DeckSnapshotDocument["snapshot"]["cards"][number]>,
  instances: Map<string, DeckSnapshotDocument["instances"][number]>,
): "spell" | "ability" | "trigger" | "unit" {
  if (!sourceId) return "ability";
  const instance = instances.get(sourceId);
  const type = instance
    ? definitions.get(instance.cardCode)?.card.classification.type
    : null;
  if (type === "Spell") return "spell";
  if (type === "Unit") return "unit";
  return "ability";
}
