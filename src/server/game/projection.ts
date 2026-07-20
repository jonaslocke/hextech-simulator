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
import { facedownCardsAt } from "./facedown-cards";
import { victoryRequirement } from "./victory";
import { getTokenCatalogDefinitions } from "./token-catalog";
import { activeStaticKeywordGrants } from "./keyword-evaluation";
import { createRuntimeCardIndex } from "./primitive-handlers";
import type { GameCardDefinition } from "./schemas";

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
      ...getTokenCatalogDefinitions().map(
        (definition) => [definition.cardCode, definition] as const,
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
  const runtimeIndex = createRuntimeCardIndex(input.decks, input.game);
  const view = (
    id: string,
    includeActiveModifiers = true,
  ): ProjectedCardView => {
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
      stunned: state.stunned ?? false,
      activeModifiers: includeActiveModifiers
        ? [
            ...(state.buffed
              ? [{ label: "Buff +1", duration: "Until leaving board" }]
              : []),
            ...input.game.state.modifiers
              .filter((modifier) => modifier.targetCardInstanceId === id)
              .map((modifier) => ({
                label: modifierLabel(modifier.attribute, modifier.operation, modifier.amount),
                duration: modifierDurationLabel(modifier.duration),
              })),
            ...activeStaticKeywordGrants(input.game, id, runtimeIndex).map(
              (grant) => ({
                label: staticKeywordGrantLabel(grant.keywordId, grant.amount),
                duration: staticKeywordGrantDurationLabel(
                  grant.duration,
                  cardNameForInstance(grant.sourceCardInstanceId, instances, definitions),
                ),
              }),
            ),
          ]
        : [],
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
        cards: visibility === "secret" ? [] : ids.map((id) => view(id)),
      };
    });
    return {
      playerId,
      displayName: input.playerNames?.[playerId] ?? playerId,
      isViewer,
      points: player.points ?? 0,
      energy: player.energy,
      conditionalEnergy: player.conditionalEnergy,
      conditionalPower: player.conditionalPower ?? {},
      power: player.power,
      zones,
    };
  });
  const actions = (input.game.status === "setup_pending"
    ? setupActions(input.game, input.viewerPlayerId)
    : gameplayActions(input.game, input.viewerPlayerId, input.decks)
  ).map((action) => {
    if (!action.id.includes(":setup:lockBattlefield:")) return action;
    const cardId = action.id.split(":").slice(4).join(":");
    return { ...action, label: `Choose ${view(cardId).name}` };
  });
  const selectionCards = actions
    .flatMap((action) => action.targets)
    .filter((target) => target.kind === "card" && target.sourceZone === "hand")
    .flatMap((target) => target.legalIds)
    .map((id) => view(id));
  const revealedCards = revealedCardsForPendingEffectSelection({
    game: input.game,
    instances,
    viewerPlayerId: input.viewerPlayerId,
    view,
  });

  return gameProjectionSchema.parse({
    id: input.game.id,
    matchId: input.game.matchId,
    gameNumber: input.game.gameNumber,
    stateVersion: input.game.stateVersion,
    status: input.game.status,
    viewerPlayerId: input.viewerPlayerId,
    activePlayerId: input.game.state.turn?.activePlayerId ?? null,
    winnerPlayerId: input.game.winnerPlayerId,
    victoryScore: victoryRequirement(input.game, input.decks),
    selectionCards,
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
      ).map((id) => view(id)),
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
              title: input.game.state.pendingChoice.title,
              waitingMessage:
                input.game.state.pendingChoice.playerId === input.viewerPlayerId
                  ? input.game.state.pendingChoice.prompt
                  : `Waiting for the other player to complete: ${input.game.state.pendingChoice.prompt}`,
              sourceZone: input.game.state.pendingChoice.sourceZone,
              presentation: input.game.state.pendingChoice.presentation,
              visionAction: input.game.state.pendingChoice.visionAction,
              revealedCards,
              minimum: input.game.state.pendingChoice.minimum,
              maximum: input.game.state.pendingChoice.maximum,
              allowDecline: input.game.state.pendingChoice.allowDecline,
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
                  title:
                    input.game.state.pendingChoice.placementKind === "unit"
                      ? "Unit placement"
                      : "Token placement",
                  waitingMessage:
                    input.game.state.pendingChoice.playerId === input.viewerPlayerId
                      ? input.game.state.pendingChoice.prompt
                      : input.game.state.pendingChoice.placementKind === "unit"
                        ? "Waiting for the other player to play their selected Unit."
                        : `Waiting for the other player to place ${input.game.state.pendingChoice.tokenName} tokens.`,
                  tokenName: input.game.state.pendingChoice.tokenName,
                  placementKind: input.game.state.pendingChoice.placementKind,
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
            : input.game.state.pendingChoice?.type === "binary"
              ? {
                  type: "binary", id: input.game.state.pendingChoice.id, playerId: input.game.state.pendingChoice.playerId,
                  prompt: input.game.state.pendingChoice.prompt, acceptLabel: input.game.state.pendingChoice.acceptLabel,
                  declineLabel: input.game.state.pendingChoice.declineLabel,
                }
              : input.game.state.pendingChoice?.type === "mode"
                ? {
                    type: "mode",
                    id: input.game.state.pendingChoice.id,
                    playerId: input.game.state.pendingChoice.playerId,
                    prompt: input.game.state.pendingChoice.prompt,
                    waitingMessage:
                      input.game.state.pendingChoice.playerId === input.viewerPlayerId
                        ? input.game.state.pendingChoice.prompt
                        : "Waiting for the other player to choose a mode.",
                    options:
                      input.game.state.pendingChoice.playerId === input.viewerPlayerId
                        ? input.game.state.pendingChoice.options
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
    battlefields: input.game.state.battlefields.map((battlefield) => {
      const facedownCards = facedownCardsAt(battlefield);
      const controllerCards = facedownCards
        .filter((card) => card.controllerPlayerId === input.viewerPlayerId)
        .map((card) => view(card.cardInstanceId));
      return {
        battlefieldId: battlefield.battlefieldId,
        selectedByPlayerId: battlefield.selectedByPlayerId,
        controllerPlayerId: battlefield.controllerPlayerId ?? null,
        contestedByPlayerId: battlefield.contestedByPlayerId ?? null,
        card: view(battlefield.cardInstanceId),
        units: battlefield.units.map((id) => view(id)),
        facedownCards: controllerCards,
        facedownCardCount: facedownCards.length,
        facedownCard: controllerCards[0] ?? null,
        hasFacedownCard: facedownCards.length > 0,
      };
    }),
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
    actions,
    logEntries: (input.events ?? []).map((event) => ({
      id: event.id,
      message: event.message,
      createdAt: event.createdAt,
    })),
  });
}

function revealedCardsForPendingEffectSelection(input: {
  game: GameDocument;
  instances: Map<string, DeckSnapshotDocument["instances"][number]>;
  viewerPlayerId: string;
  view: (id: string, includeActiveModifiers?: boolean) => ProjectedCardView;
}): ProjectedCardView[] {
  const pending = input.game.state.pendingChoice;
  if (
    !pending ||
    pending.type !== "effectSelection" ||
    pending.playerId !== input.viewerPlayerId
  ) {
    return [];
  }
  if (pending.presentation === "vision") {
    return pending.legalCardIds.map((id) => input.view(id));
  }
  const revealedHandTarget = pending.targetRequirements?.find(
    (target) =>
      target.kind === "card" &&
      target.sourceZone === "hand" &&
      target.revealZone === true,
  );
  const ownerPlayerId = revealedHandTarget?.legalIds
    .map((id) => input.instances.get(id)?.ownerPlayerId)
    .find((id): id is string => Boolean(id));

  return ownerPlayerId
    ? input.game.state.players[ownerPlayerId]!.zones.hand.map((id) =>
        input.view(id),
      )
    : [];
}

function projectChainItem(
  item: ChainItem,
  view: (id: string, includeActiveModifiers?: boolean) => ProjectedCardView,
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
    card: item.sourceCardInstanceId
      ? view(item.sourceCardInstanceId, false)
      : null,
  };
}

function modifierLabel(
  attribute: string,
  operation: "increase" | "reduce" | "multiply" | "set",
  amount: number,
) {
  const label = attribute
    .replace(/^keyword\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  if (attribute.startsWith("keyword.")) {
    return amount > 1 ? `${label} ${amount}` : label;
  }
  if (operation === "increase") return `${label} +${amount}`;
  if (operation === "reduce") return `${label} -${amount}`;
  if (operation === "multiply") return `${label} ×${amount}`;
  return `${label} ${amount}`;
}

function modifierDurationLabel(duration: string) {
  if (duration === "thisCombat") return "This combat";
  if (duration === "thisTurn") return "This turn";
  if (duration === "whileSourceOnBoard") return "While source is on board";
  if (duration === "whileSourceAtBattlefield") {
    return "While source is at this battlefield";
  }
  return duration.replace(/[._-]+/g, " ");
}

function staticKeywordGrantLabel(keywordId: string, amount: number) {
  const keyword = keywordId
    .replace(/^keyword\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return `${keyword} ${amount}`;
}

function staticKeywordGrantDurationLabel(duration: string, sourceName: string) {
  if (duration === "whileSourceAtBattlefield") {
    return `While ${sourceName} is here`;
  }
  if (duration === "whileSourceOnBoard") {
    return `While ${sourceName} is on board`;
  }
  return modifierDurationLabel(duration);
}

function cardNameForInstance(
  instanceId: string,
  instances: Map<string, { cardCode: string }>,
  definitions: Map<string, GameCardDefinition>,
) {
  const instance = instances.get(instanceId);
  return instance ? definitions.get(instance.cardCode)?.card.name ?? "source" : "source";
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
