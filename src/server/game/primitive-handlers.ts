import type {
  BehaviorExecutionContext,
  BehaviorHandler,
  BehaviorHandlerRegistry,
} from "./behavior-runtime";
import {
  collectTriggeredClauses,
  compileBehaviorModel,
} from "./behavior-runtime";
import type { DeckSnapshotDocument } from "./repositories";
import type { BehaviorBinding, GameCardDefinition } from "./schemas";
import type { CardInstance, GameDocument } from "./state";
import { createHash } from "node:crypto";
import {
  effectiveNumericValue,
  type NumericContribution,
  isContinuousDuration,
} from "./numeric-modifiers";
import { numericConditionMatches } from "./numeric-condition";
import {
  attachCardToTopMost,
  attachedCardIds,
  detachCard,
  detachCardsFromTopMostLeavingBoard,
  moveAttachedCardsWithTopMost,
  removeFromAttachmentLocations,
} from "./attachment-lifecycle";
import { legalEffectMoveDestinationIds } from "./unit-destinations";
import { additiveKeywordIds, effectiveKeywordAmount, evaluateEffectiveKeywords, hasEffectiveKeyword, reconcileRuntimeKeywordActivation } from "./effective-keywords";
import { behaviorModelForRuntimeCard } from "./runtime-behaviors";

export type RuntimeCardIndex = {
  definitions: Map<string, GameCardDefinition>;
  instances: Map<string, CardInstance>;
};

export function createRuntimeCardIndex(
  decks: readonly DeckSnapshotDocument[],
  game?: GameDocument,
): RuntimeCardIndex {
  return {
    definitions: new Map([
      ...decks.flatMap((deck) =>
        deck.snapshot.cards.map((item) => [item.cardCode, item] as const),
      ),
      ...((game?.state.createdCardDefinitions ?? []).map(
        (item) => [item.cardCode, item] as const,
      )),
    ]),
    instances: new Map([
      ...decks.flatMap((deck) =>
        deck.instances.map((item) => [item.instanceId, item] as const),
      ),
      ...((game?.state.createdCardInstances ?? []).map(
        (item) => [item.instanceId, item] as const,
      )),
    ]),
  };
}

export function definitionForInstance(id: string, index: RuntimeCardIndex): GameCardDefinition {
  const instance = index.instances.get(id);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${id}`);
  return definition;
}

export function createPrimitiveHandlers(
  index: RuntimeCardIndex
): BehaviorHandlerRegistry {
  const handlers = new Map<string, BehaviorHandler>();
  const passive: BehaviorHandler = {};
  for (const id of [
    "timing.action", "timing.reaction", "timing.delayed", "keyword.assault",
    "keyword.tank", "keyword.shield", "keyword.vision", "keyword.deflect",
    "keyword.quick_draw", "keyword.temporary",
    "keyword.flow", "keyword.repeat", "keyword.lethal_damage",
    "keyword.hidden",
    "type.additional",
    "modifier.ignore_deflect",
    "modifier.prevent_scoring_until_turn",
    "keyword.ganking", "cost.exhaust_selected_unit", "cost.recycle_selected_cards", "cost.discard_selected_cards",
    "cost.pay", "cost.exhaust_source",
  ]) handlers.set(id, passive);
  handlers.set("ability.activated_effect", {
    execute() {
      // The activated ability's clause resolves through the shared effect frame.
    },
  });
  handlers.set("modifier.play_unit_destination", {
    execute() {
      // The permission is consumed by the unit destination policy.
    },
  });
  handlers.set("trigger.on_play", {
    matches(binding, context) {
      if (context.event?.type !== "card.played" || context.event.actorPlayerId !== context.controllerPlayerId) return false;
      if (binding.parameters.subject === "source") return context.event.subjectCardInstanceId === context.sourceCardInstanceId;
      if (binding.parameters.subject === "card") {
        return (
          context.event.subjectCardInstanceId ===
          context.sourceCardInstanceId
        );
      }
      if (binding.parameters.subject === "spell" && context.event.subjectCardInstanceId) {
        return definitionForInstance(context.event.subjectCardInstanceId, index).card.classification.type === "Spell";
      }
      if (binding.parameters.subject === "gear" && context.event.subjectCardInstanceId) {
        return cardHasType(
          definitionForInstance(context.event.subjectCardInstanceId, index),
          "Gear",
        );
      }
      return false;
    }
  });
  handlers.set("trigger.conquer_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.conquered" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
  handlers.set("trigger.conquer", {
    matches: (_binding, context) =>
      context.event?.type === "battlefield.conquered" &&
      context.event.actorPlayerId === context.controllerPlayerId,
  });
  handlers.set("trigger.hold_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.held" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
  handlers.set("trigger.hold", {
    matches: (_binding, context) => {
      if (context.event?.type !== "battlefield.held" || context.event.actorPlayerId !== context.controllerPlayerId) return false;
      const battlefield = context.game.state.battlefields.find(
        (candidate) => candidate.cardInstanceId === context.event?.subjectCardInstanceId,
      );
      return Boolean(battlefield?.units.includes(context.sourceCardInstanceId));
    },
  });
  handlers.set("trigger.on_move", {
    matches: (binding, context) => {
      if (
        context.event?.type !== "unit.moved" ||
        context.event.subjectCardInstanceId !== context.sourceCardInstanceId
      ) {
        return false;
      }
      if (binding.parameters.destination === "battlefield") {
        return context.event.values.destination !== "base";
      }
      if (binding.parameters.destination === "base") {
        return context.event.values.destination === "base";
      }
      return true;
    },
  });
  handlers.set("trigger.end_of_turn", {
    matches: (binding, context) =>
      context.event?.type === "turn.ended" &&
      (binding.parameters.player !== "controller" ||
        context.event.actorPlayerId === context.controllerPlayerId)
  });
  handlers.set("trigger.attack", {
    matches: (_binding, context) =>
      context.event?.type === "unit.attacks" &&
      context.event.subjectCardInstanceId === context.sourceCardInstanceId
  });
  handlers.set("trigger.defend", {
    matches: (_binding, context) =>
      context.event?.type === "unit.defends" &&
      context.event.subjectCardInstanceId === context.sourceCardInstanceId
  });
  handlers.set("condition.compare_numeric_value", {
    matches(binding, context) {
      return numericConditionMatches({
        binding,
        controllerPlayerId: context.controllerPlayerId,
        eventValues: context.event?.values,
        game: context.game,
        index,
      });
    }
  });
  handlers.set("condition.effect_killed_target", {
    matches: (_binding, context) =>
      context.effectOutcomes.lastDamageKilled === true,
  });
  handlers.set("condition.unit_presence", {
    matches(binding, context) {
      const units = unitsForPresenceCondition(binding, context, index);
      const minimum =
        typeof binding.parameters.minimumCount === "number"
          ? binding.parameters.minimumCount
          : 1;
      return units.length >= minimum;
    },
  });
  handlers.set("condition.card_type_presence", {
    matches(binding, context) {
      const cards = [
        ...context.game.state.players[context.controllerPlayerId]!.zones.base,
        ...context.game.state.battlefields.flatMap((battlefield) => [
          ...battlefield.units.filter(
            (id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId,
          ),
          ...(battlefield.attachedCardInstanceIds ?? []).filter(
            (id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId,
          ),
        ]),
      ];
      return [...new Set(cards)].filter(
        (id) =>
          (binding.parameters.excludesSource !== true ||
            id !== context.sourceCardInstanceId) &&
          cardHasType(definitionForInstance(id, index), stringParam(binding, "cardType")),
      ).length >= numberParam(binding, "minimumCount");
    },
  });

  handlers.set("selector.unit", {
    targets(binding, context) {
      if (!selectorOptionMatches(binding, context)) return noSelectionRequirement(binding);
      return selectorTargets(
        binding,
        context.game,
        index,
        () => true,
        context.sourceCardInstanceId,
        context.selectedIds,
        context.hiddenBattlefieldId,
      );
    }
  });
  handlers.set("selector.friendly_unit", {
    targets(binding, context) {
      if (!selectorOptionMatches(binding, context)) return noSelectionRequirement(binding);
      return selectorTargets(
        binding,
        context.game,
        index,
        (id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId,
        context.sourceCardInstanceId,
        context.selectedIds,
        context.hiddenBattlefieldId,
      );
    }
  });
  handlers.set("selector.enemy_unit", {
    targets(binding, context) {
      if (!selectorOptionMatches(binding, context)) return noSelectionRequirement(binding);
      return selectorTargets(
        binding,
        context.game,
        index,
        (id) =>
          index.instances.get(id)?.ownerPlayerId !==
          context.controllerPlayerId,
        context.sourceCardInstanceId,
        context.selectedIds,
        context.hiddenBattlefieldId,
      );
    },
  });
  handlers.set("selector.card", {
    targets(binding, context) {
      if (!selectorOptionMatches(binding, context)) return noSelectionRequirement(binding);
      const zone = stringParam(binding, "zone");
      const owner = binding.parameters.owner ?? binding.parameters.player;
      const playerIds = owner === "opponent"
        ? Object.keys(context.game.state.players).filter((id) => id !== context.controllerPlayerId)
        : [context.controllerPlayerId];
      const ids = zone === "board"
        ? [
            ...Object.values(context.game.state.players).flatMap((player) => player.zones.base),
            ...context.game.state.battlefields.flatMap((battlefield) => battlefield.units),
          ].filter((id) => playerIds.includes(index.instances.get(id)?.ownerPlayerId ?? ""))
        : playerIds.flatMap((playerId) => {
        const zoneValue = context.game.state.players[playerId]!.zones[zone as keyof typeof context.game.state.players[string]["zones"]];
        return Array.isArray(zoneValue) ? zoneValue : zoneValue ? [zoneValue] : [];
      });
      const topCount = binding.parameters.topCount;
      const visibleIds = typeof topCount === "number" && zone === "mainDeck"
        ? ids.slice(0, Math.max(0, topCount))
        : ids;
      const cardType = stringParam(binding, "cardType");
      return {
        kind: "card" as const,
        label: `${cardType === "any" ? "card" : cardType.toLowerCase()} from ${zone}`,
        sourceZone:
          zone === "hand" || zone === "trash" || zone === "mainDeck"
            ? zone
            : undefined,
        legalIds: visibleIds.filter(
          (id) =>
            cardType === "any" ||
            cardHasType(definitionForInstance(id, index), cardType),
        ),
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("selector.move_destination", {
    targets(binding, context) {
      const unitSelectionKey = stringParam(binding, "unitSelectionKey");
      const selectedUnitIds = context.selectedBySelector[unitSelectionKey] ?? [];
      const candidates = selectedUnitIds.length > 0
        ? selectedUnitIds
        : boardUnitIds(context.game, index);
      const legalIdsBySelectedId = Object.fromEntries(
        candidates.map((unitId) => [
          unitId,
          legalEffectMoveDestinationIds(context.game, unitId, index),
        ]),
      );
      const legalIds = [
        ...new Set(Object.values(legalIdsBySelectedId).flat()),
      ];
      return {
        kind: "location" as const,
        label: "move destination",
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        legalIds,
        legalIdsBySelectedId,
        optionLabels: moveDestinationLabels(context.game, index, legalIds),
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("selector.source", {
    targets(binding, context) {
      const sourceId = context.sourceCardInstanceId;
      const player = context.game.state.players[context.controllerPlayerId]!;
      return {
        kind: "card" as const,
        label: "source card",
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        ...(binding.parameters.selectionPurpose === "optionalCost"
          ? { selectionPurpose: "optionalCost" as const }
          : {}),
        ...(player.zones.hand.includes(sourceId)
          ? { sourceZone: "hand" as const }
          : {}),
        legalIds: [sourceId],
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("selector.battlefield", {
    targets(binding, context) {
      return {
        kind: "battlefield" as const,
        label: "battlefield",
        legalIds: context.game.state.battlefields.map(
          (battlefield) => battlefield.battlefieldId,
        ),
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("trigger.on_death", {
    matches: (binding, context) =>
      context.event?.type === "card.died" &&
      (binding.parameters.subject === "source" ||
        context.event.subjectCardInstanceId === context.sourceCardInstanceId),
  });
  handlers.set("condition.event_subject_combat_alone", {
    matches(_binding, context) {
      const subject = context.event?.subjectCardInstanceId;
      const state = subject ? context.game.state.cardStates[subject] : null;
      if (!subject || !state?.combatRole) return false;
      const owner = index.instances.get(subject)?.ownerPlayerId;
      if (owner !== context.controllerPlayerId) return false;
      const battlefield = context.game.state.battlefields.find((candidate) =>
        candidate.units.includes(subject),
      );
      if (!battlefield) return false;
      return battlefield.units.filter((id) =>
        index.instances.get(id)?.ownerPlayerId === owner &&
        context.game.state.cardStates[id]?.combatRole === state.combatRole,
      ).length === 1;
    },
  });
  handlers.set("trigger.friendly_unit_combat", {
    matches(binding, context) {
      const event = binding.parameters.event;
      const typeMatches =
        (event === "attack" && context.event?.type === "unit.attacks") ||
        (event === "defend" && context.event?.type === "unit.defends") ||
        (event === "attackOrDefend" &&
          (context.event?.type === "unit.attacks" || context.event?.type === "unit.defends"));
      return typeMatches && context.event?.actorPlayerId === context.controllerPlayerId;
    },
  });
  handlers.set("selector.gear", {
    targets(binding, context) {
      if (!selectorOptionMatches(binding, context)) return noSelectionRequirement(binding);
      const candidates = [
        ...Object.values(context.game.state.players).flatMap(
          (player) => player.zones.base,
        ),
        ...context.game.state.battlefields.flatMap(
          (battlefield) => [
            ...battlefield.units,
            ...(battlefield.attachedCardInstanceIds ?? []),
          ],
        ),
      ];
      const controller = binding.parameters.controller;
      return {
        kind: "card" as const,
        label: "gear",
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        legalIds: [...new Set(candidates)].filter((id) => {
          const definition = definitionForInstance(id, index);
          const owner = index.instances.get(id)?.ownerPlayerId;
          return (
            cardHasType(definition, "Gear") &&
            (controller !== "controller" && controller !== "friendly" || owner === context.controllerPlayerId) &&
            (controller !== "opponent" && controller !== "enemy" || owner !== context.controllerPlayerId) &&
            (typeof binding.parameters.maximumEnergyCost !== "number" ||
              (definition.card.attributes.energy ?? 0) <= binding.parameters.maximumEnergyCost)
          );
        }),
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("selector.chain_item", {
    targets(binding, context) {
      const itemKind = stringParam(binding, "itemKind");
      const controller = binding.parameters.controller;
      const choosesControlledCardType = binding.parameters.choosesControlledCardType;
      const legalIds = (context.game.state.chain?.items ?? [])
        .filter((item) => {
          if (itemKind === "spell") return item.kind === "spell";
          return item.kind === "spell" || item.kind === "activatedAbility" || item.kind === "trigger";
        })
        .filter((item) => {
          if (controller === "opponent") return item.controllerPlayerId !== context.controllerPlayerId;
          if (controller === "controller") return item.controllerPlayerId === context.controllerPlayerId;
          return true;
        })
        .filter((item) => {
          if (item.kind !== "spell") return true;
          const definition = item.sourceCardInstanceId
            ? definitionForInstance(item.sourceCardInstanceId, index)
            : null;
          return (
            (typeof binding.parameters.maximumEnergyCost !== "number" ||
              (definition?.card.attributes.energy ?? 0) <= binding.parameters.maximumEnergyCost) &&
            (typeof binding.parameters.maximumPowerCost !== "number" ||
              (definition?.card.attributes.power ?? 0) <= binding.parameters.maximumPowerCost)
          );
        })
        .filter((item) => {
          if (typeof choosesControlledCardType !== "string") return true;
          return item.targetCardInstanceIds.some((targetId) => {
            const target = index.instances.get(targetId);
            if (!target || target.ownerPlayerId !== context.controllerPlayerId) return false;
            const definition = definitionForInstance(targetId, index);
            return choosesControlledCardType === "UnitOrGear"
              ? cardHasType(definition, "Unit") || cardHasType(definition, "Gear")
              : cardHasType(definition, choosesControlledCardType);
          });
        })
        .filter((item) => {
          const selectionKey = binding.parameters.onlyTargetSelectedBy;
          if (typeof selectionKey !== "string") return true;
          const protectedIds = context.selectedBySelector[selectionKey] ?? [];
          if (protectedIds.length === 0) return false;
          const protectedSet = new Set(protectedIds);
          const friendlyTargetIds = item.targetCardInstanceIds.filter((targetId) => {
            const target = index.instances.get(targetId);
            return target?.ownerPlayerId === context.controllerPlayerId &&
              (cardHasType(definitionForInstance(targetId, index), "Unit") ||
                cardHasType(definitionForInstance(targetId, index), "Gear"));
          });
          return friendlyTargetIds.length === protectedSet.size &&
            friendlyTargetIds.every((targetId) => protectedSet.has(targetId));
        })
        .map((item) => item.id);
      return {
        kind: "chainItem" as const,
        label: itemKind === "spell" ? "spell on the chain" : "spell or ability on the chain",
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        legalIds,
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("action.draw_cards", {
    execute(binding, context) {
      if (!effectOutcomeMatches(binding, context)) return;
      const playerId = binding.parameters.player === "eachPlayer" ? null : context.controllerPlayerId;
      const count = numberParam(binding, "count");
      const ids = playerId ? [playerId] : [...context.game.state.setup.playerIds];
      for (const id of ids) {
        ensureMainDeck(context.game, id, index);
        draw(
          context.game,
          context.game.state.players[id]!.zones.mainDeck,
          context.game.state.players[id]!.zones.hand,
          count,
        );
      }
    }
  });
  handlers.set("action.draw_by_controlled_battlefield_count", {
    execute(_binding, context) {
      const sourceBattlefield = context.game.state.battlefields.find(
        (battlefield) => battlefield.cardInstanceId === context.sourceCardInstanceId,
      );
      const count = context.game.state.battlefields.filter(
        (battlefield) =>
          battlefield.controllerPlayerId === context.controllerPlayerId &&
          battlefield.battlefieldId !== sourceBattlefield?.battlefieldId,
      ).length;
      const player = context.game.state.players[context.controllerPlayerId]!;
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      draw(context.game, player.zones.mainDeck, player.zones.hand, count);
    },
  });
  handlers.set("action.search_top_deck", {
    choice(binding, context) {
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      const top = context.game.state.players[context.controllerPlayerId]!.zones.mainDeck
        .slice(0, numberParam(binding, "count"));
      const legalIds = top.filter((id) =>
        cardHasType(definitionForInstance(id, index), stringParam(binding, "cardType")),
      );
      return {
        legalIds,
        minimum: 0,
        maximum: Math.min(
          typeof binding.parameters.maximumSelect === "number"
            ? binding.parameters.maximumSelect
            : 1,
          top.length,
        ),
        prompt: "Choose a matching card to draw, then recycle the rest.",
        sourceZone: "mainDeck",
        presentation: "cardSelection",
        visibleIds: top,
      };
    },
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const looked = player.zones.mainDeck.slice(0, numberParam(binding, "count"));
      const selected = new Set(context.selectedIds.filter((id) => looked.includes(id)));
      player.zones.mainDeck = player.zones.mainDeck.filter((id) => !looked.includes(id));
      const drawn = looked.filter((id) => selected.has(id));
      player.zones.hand.push(...drawn);
      drawn.forEach((id) => advanceGameObjectIncarnation(context.game, id));
      player.zones.mainDeck.push(
        ...deterministicallyRecycle(
          looked.filter((id) => !selected.has(id)),
          `${context.game.id}:${context.game.stateVersion}:${context.sourceCardInstanceId}`,
        ),
      );
      if (binding.parameters.revealSelected === true && selected.size > 0) {
        addPublicReveal(
          context,
          [...selected],
          `${definitionForInstance(context.sourceCardInstanceId, index).card.name} revealed`,
          index,
        );
      }
    },
  });
  handlers.set("action.reveal_until_card_type_and_play", {
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const cardType = stringParam(binding, "cardType");
      const matchingIndex = player.zones.mainDeck.findIndex((id) =>
        cardHasType(definitionForInstance(id, index), cardType),
      );
      const looked = matchingIndex < 0
        ? [...player.zones.mainDeck]
        : player.zones.mainDeck.slice(0, matchingIndex + 1);
      if (looked.length === 0) return;
      addPublicReveal(
        context,
        looked,
        `${definitionForInstance(context.sourceCardInstanceId, index).card.name} revealed`,
        index,
      );
      player.zones.mainDeck = player.zones.mainDeck.filter((id) => !looked.includes(id));
      const selectedCardId = matchingIndex < 0 ? null : looked.at(-1)!;
      const recycled = looked.filter((id) => id !== selectedCardId);
      player.zones.mainDeck.push(
        ...deterministicallyRecycle(
          recycled,
          `${context.game.id}:${context.game.stateVersion}:${context.sourceCardInstanceId}`,
        ),
      );
      if (!selectedCardId || !context.effectResolutionId) return;
      player.zones.hand.push(selectedCardId);
      advanceGameObjectIncarnation(context.game, selectedCardId);
      (context.game.state.effectPlayQueue ??= []).push({
        resolutionId: context.effectResolutionId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        playerId: context.controllerPlayerId,
        cardInstanceId: selectedCardId,
        ignoreBaseEnergy: binding.parameters.ignoreBaseCosts === true,
        ignoreBasePower: binding.parameters.ignoreBaseCosts === true,
        returnZone: "mainDeck",
        forcedDestinationId: null,
        destinationBasePlayerId: null,
      });
    },
  });
  handlers.set("action.gain_xp", {
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      player.xp = (player.xp ?? 0) + numberParam(binding, "amount");
    },
  });
  handlers.set("action.reveal_opponent_hand", {
    choice() {
      return null;
    },
    execute(_binding, context) {
      const opponentId = context.game.state.setup.playerIds.find(
        (playerId) => playerId !== context.controllerPlayerId,
      );
      if (!opponentId) return null;
      addPublicReveal(
        context,
        [...context.game.state.players[opponentId]!.zones.hand],
        `${definitionForInstance(context.sourceCardInstanceId, index).card.name} revealed ${opponentId}'s hand`,
        index,
        opponentId,
      );
    },
  });
  handlers.set("action.grant_facedown_vision", {
    execute(_binding, context) {
      const ownerPlayerId = context.game.state.setup.playerIds.find(
        (playerId) => playerId !== context.controllerPlayerId,
      );
      const expiresAtTurnNumber = context.game.state.turn?.turnNumber;
      if (!ownerPlayerId || !expiresAtTurnNumber) return;
      const grants = (context.game.state.facedownVisibilityGrants ??= []);
      if (
        !grants.some(
          (grant) =>
            grant.viewerPlayerId === context.controllerPlayerId &&
            grant.ownerPlayerId === ownerPlayerId &&
            grant.expiresAtTurnNumber === expiresAtTurnNumber,
        )
      ) {
        grants.push({
          viewerPlayerId: context.controllerPlayerId,
          ownerPlayerId,
          expiresAtTurnNumber,
        });
      }
    },
  });
  handlers.set("action.draw_by_optional_cost", {
    execute(binding, context) {
      const selected = selectionFor(binding, context);
      const count = numberParam(
        binding,
        selected.length > 0 ? "paidCount" : "unpaidCount",
      );
      const player = context.game.state.players[context.controllerPlayerId]!;
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      draw(context.game, player.zones.mainDeck, player.zones.hand, count);
    },
  });
  handlers.set("action.channel_or_draw", {
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const count = numberParam(binding, "channelCount");
      const moved = player.zones.runeDeck.splice(0, count);
      player.zones.base.push(...moved);
      moved.forEach((id) => advanceGameObjectIncarnation(context.game, id));
      if (binding.parameters.entryState === "exhausted") {
        moved.forEach((id) => {
          context.game.state.cardStates[id]!.exhausted = true;
        });
      }
      const fallbackWhenFewerThan = typeof binding.parameters.fallbackWhenFewerThan === "number"
        ? binding.parameters.fallbackWhenFewerThan
        : 1;
      if (moved.length < fallbackWhenFewerThan) {
        ensureMainDeck(context.game, context.controllerPlayerId, index);
        draw(
          context.game,
          player.zones.mainDeck,
          player.zones.hand,
          numberParam(binding, "fallbackDrawCount"),
        );
      }
      recomputeAllMight(context.game, index);
    },
  });
  handlers.set("action.vision", {
    choice(_binding, context) {
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      const top =
        context.game.state.players[context.controllerPlayerId]!.zones.mainDeck[0];
      return top
        ? {
            legalIds: [top],
            minimum: 0,
            maximum: 1,
            prompt: "Recycle the top card?",
            sourceZone: "mainDeck",
            presentation: "vision",
          }
        : null;
    },
    execute(_binding, context) {
      const deck =
        context.game.state.players[context.controllerPlayerId]!.zones.mainDeck;
      const selected = context.selectedIds[0];
      if (selected && deck[0] === selected) {
        deck.shift();
        deck.push(selected);
      }
    },
  });
  handlers.set("action.discard_cards", {
    choice(binding, context) {
      const hand =
        context.game.state.players[context.controllerPlayerId]!.zones.hand;
      const count = Math.min(numberParam(binding, "count"), hand.length);
      return count > 0
        ? {
            legalIds: [...hand],
            minimum: count,
            maximum: count,
            prompt: `Choose ${count} card${count === 1 ? "" : "s"} to discard`,
            sourceZone: "hand",
          }
        : null;
    },
    execute(binding, context) {
      const player =
        context.game.state.players[context.controllerPlayerId]!;
      const count = Math.min(numberParam(binding, "count"), player.zones.hand.length);
      const selected = context.selectedIds.slice(0, count);
      player.zones.hand = player.zones.hand.filter(
        (id) => !selected.includes(id),
      );
      player.zones.trash.push(...selected);
      selected.forEach((id) => {
        incrementObjectVersion(context.game, id);
        advanceGameObjectIncarnation(context.game, id);
      });
    },
  });
  handlers.set("action.channel_runes", {
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const ids = binding.parameters.player === "eachPlayer" ? [...context.game.state.setup.playerIds] : [context.controllerPlayerId];
      for (const id of ids) {
        const player = context.game.state.players[id]!;
        const moved = player.zones.runeDeck.splice(0, count);
        player.zones.base.push(...moved);
        moved.forEach((cardId) => advanceGameObjectIncarnation(context.game, cardId));
        if (binding.parameters.entryState === "exhausted") moved.forEach((cardId) => { context.game.state.cardStates[cardId]!.exhausted = true; });
      }
      recomputeAllMight(context.game, index);
    }
  });
  handlers.set("action.ready_cards", {
    choice(binding, context) {
      if (binding.parameters.selectExhaustedCards === true) {
        const candidates = [
          ...context.game.state.players[context.controllerPlayerId]!.zones.base,
          ...context.game.state.battlefields.flatMap((battlefield) => [
            ...battlefield.units,
            ...(battlefield.attachedCardInstanceIds ?? []),
          ]),
        ];
        const legalIds = [...new Set(candidates)].filter((id) =>
          index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId &&
          context.game.state.cardStates[id]?.exhausted === true &&
          (binding.parameters.excludesSource !== true || id !== context.sourceCardInstanceId),
        );
        return {
          kind: "card" as const,
          legalIds,
          minimum: typeof binding.parameters.minimumCount === "number"
            ? binding.parameters.minimumCount
            : 0,
          maximum: typeof binding.parameters.maximumCount === "number"
            ? binding.parameters.maximumCount
            : 1,
          prompt: typeof binding.parameters.prompt === "string"
            ? binding.parameters.prompt
            : "Choose exhausted cards to ready",
          presentation: "cardSelection" as const,
        };
      }
      if (binding.parameters.target !== "runes") return null;
      const legalIds = context.game.state.players[
        context.controllerPlayerId
      ]!.zones.base.filter(
        (id) =>
          definitionForInstance(id, index).card.classification.type ===
            "Rune" && context.game.state.cardStates[id]?.exhausted,
      );
      const count = numberParam(binding, "count");
      const required = Math.min(count, legalIds.length);
      return required > 0
        ? {
            legalIds,
            minimum: required,
            maximum: required,
            prompt: `Choose ${required} runes to ready`,
          }
        : null;
    },
    execute(binding, context) {
      const routed = selectionFor(binding, context);
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : routed.length > 0
          ? routed
        : binding.parameters.target === "runes"
        ? context.selectedIds.length > 0
          ? context.selectedIds
          : context.game.state.players[context.controllerPlayerId]!.zones.base
            .filter((id) => definitionForInstance(id, index).card.classification.type === "Rune")
            .slice(0, numberParam(binding, "count"))
        : context.selectedIds;
      ids.forEach((id) => { context.game.state.cardStates[id]!.exhausted = false; });
    }
  });
  handlers.set("action.play_token", {
    choice(binding, context) {
      if (binding.parameters.placement !== "chooseBaseOrControlledBattlefield") {
        return null;
      }
      const destinations = tokenPlacementDestinations(context.game, context.controllerPlayerId, index);
      return destinations.length > 0
        ? {
            kind: "tokenPlacement" as const,
            legalIds: destinations.map((destination) => destination.id),
            minimum: numberParam(binding, "count"),
            maximum: numberParam(binding, "count"),
            prompt: `Choose where to play ${numberParam(binding, "count")} ${stringParam(binding, "tokenName")} token${numberParam(binding, "count") === 1 ? "" : "s"}`,
            tokenName: stringParam(binding, "tokenName"),
            destinations,
          }
        : null;
    },
    execute(binding, context) {
      if (
        binding.parameters.onlyIfPreviousEffectSucceeded === true &&
        context.effectOutcomes.lastTargetKilled !== true
      ) {
        return;
      }
      const count = numberParam(binding, "count");
      const tokenName = stringParam(binding, "tokenName");
      const placements =
        binding.parameters.placement === "chooseBaseOrControlledBattlefield"
          ? selectedTokenDestinations(context, count)
          : Array.from({ length: count }, () =>
              fixedTokenDestination(binding, context),
            );
      const requireControlledDestination =
        binding.parameters.placement === "chooseBaseOrControlledBattlefield";
      for (const destinationId of placements) {
        playToken(context.game, {
          controllerPlayerId: context.controllerPlayerId,
          destinationId,
          requireControlledDestination,
          sourceCardInstanceId: context.sourceCardInstanceId,
          tokenName,
          entryState:
            binding.parameters.entryState === "ready" ? "ready" : "exhausted",
          index,
        });
      }
    },
  });
  handlers.set("action.deal_damage", {
    execute(binding, context) {
      if (!effectOutcomeMatches(binding, context)) return;
      const amount = effectiveNumericValue({
        attribute: "damage",
        baseValue: numberParam(binding, "amount"),
        controllerPlayerId: context.controllerPlayerId,
        game: context.game,
        index,
        targetScope: "controller_effect",
      });
      const ids = damageTargets(binding, context, index);
      validateDamageTargetLocations(binding, context.game, ids);
      let killed = false;
      for (const id of ids) {
        const state = context.game.state.cardStates[id];
        if (!state) throw new Error(`Damage target is unavailable: ${id}`);
        state.damage += damageIsLethalAgainstEnemyUnit(
          context.game,
          context.controllerPlayerId,
          id,
          index,
        )
          ? state.computedMight ?? definitionForInstance(id, index).card.attributes.might ?? amount
          : amount;
        incrementObjectVersion(context.game, id);
      }
      cleanupLethalDamage(context.game, ids, index);
      for (const id of ids) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (owner && context.game.state.players[owner]!.zones.trash.includes(id)) {
          killed = true;
        }
      }
      context.effectOutcomes.lastDamageKilled = killed;
    }
  });
  handlers.set("action.fight", {
    execute(binding, context) {
      const first = context.selectedBySelector[
        stringParam(binding, "firstUnitSelectionKey")
      ]?.[0];
      const second = context.selectedBySelector[
        stringParam(binding, "secondUnitSelectionKey")
      ]?.[0];
      const firstState = first ? context.game.state.cardStates[first] : null;
      const secondState = second ? context.game.state.cardStates[second] : null;
      const firstMight = firstState?.computedMight ?? 0;
      const secondMight = secondState?.computedMight ?? 0;
      if (firstState && secondMight > 0) firstState.damage += secondMight;
      if (secondState && firstMight > 0) secondState.damage += firstMight;
      cleanupLethalDamage(
        context.game,
        [first, second].filter((id): id is string => Boolean(id)),
        index,
      );
    },
  });
  handlers.set("action.kill_unit", {
    execute(_binding, context) {
      context.selectedIds.forEach((id) => moveUnitToTrash(context.game, id, index));
    }
  });
  handlers.set("action.banish_card", {
    execute(binding, context) {
      const selectionKey = binding.parameters.selectionKey;
      const selected = typeof selectionKey === "string"
        ? context.selectedBySelector[selectionKey] ?? []
        : context.selectedIds;
      const capturedLocations = selected.map((id) => JSON.stringify({
        cardInstanceId: id,
        location: boardLocationForUnit(context.game, id),
      }));
      if (typeof binding.parameters.captureLocationAs === "string") {
        context.effectOutcomes[binding.parameters.captureLocationAs] = capturedLocations;
      }
      for (const id of selected) {
        const ownerPlayerId = index.instances.get(id)?.ownerPlayerId;
        if (!ownerPlayerId) continue;
        // Rule 427.2 moves directly to Banishment; this is not a Kill or Discard.
        removeFromAllLocations(context.game, id);
        const banishment = context.game.state.players[ownerPlayerId]!.zones.banishment;
        if (!banishment.includes(id)) banishment.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
        if (isTokenInstance(id, index)) {
          ceaseToken(context.game, id);
          continue;
        }
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "card.banished",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        });
      }
    },
  });
  handlers.set("action.play_banished_card", {
    execute(binding, context) {
      if (!context.effectResolutionId) {
        throw new Error("Effect-driven card play must resolve in an effect frame.");
      }
      if ((context.game.state.effectPlayQueue ?? []).length > 0) {
        throw new Error("Effect-driven card play queue is already active.");
      }
      const selectionKey = stringParam(binding, "selectionKey");
      const selected = context.selectedBySelector[selectionKey] ?? [];
      const capturedValue = context.effectOutcomes[stringParam(binding, "capturedLocationsKey")];
      const capturedLocations = new Map(
        (Array.isArray(capturedValue) ? capturedValue : []).flatMap((entry) => {
          if (typeof entry !== "string") return [];
          try {
            const parsed = JSON.parse(entry) as {
              cardInstanceId?: unknown;
              location?: unknown;
            };
            const location = parsed.location as { kind?: unknown; id?: unknown } | null;
            if (
              typeof parsed.cardInstanceId !== "string" ||
              !location ||
              (location.kind !== "base" && location.kind !== "battlefield") ||
              typeof location.id !== "string"
            ) return [];
            return [[parsed.cardInstanceId, { kind: location.kind, id: location.id } as const]];
          } catch {
            return [];
          }
        }),
      );
      const staged = selected.flatMap((id) => {
        const instance = index.instances.get(id);
        const definition = instance && index.definitions.get(instance.cardCode);
        const location = capturedLocations.get(id);
        const player = instance && context.game.state.players[instance.ownerPlayerId];
        if (
          !instance ||
          !player ||
          !definition ||
          definition.card.classification.type !== "Unit" ||
          !location ||
          !player.zones.banishment.includes(id) ||
          (location.kind === "battlefield" && !context.game.state.battlefields.some(
            (battlefield) => battlefield.battlefieldId === location.id,
          )) ||
          (location.kind === "base" && !context.game.state.players[location.id])
        ) return [];
        player.zones.banishment = player.zones.banishment.filter((candidate) => candidate !== id);
        player.zones.hand.push(id);
        advanceGameObjectIncarnation(context.game, id);
        return [{
          resolutionId: context.effectResolutionId!,
          sourceCardInstanceId: context.sourceCardInstanceId,
          playerId: instance.ownerPlayerId,
          cardInstanceId: id,
          ignoreBaseEnergy: binding.parameters.ignoreBaseCosts === true,
          ignoreBasePower: binding.parameters.ignoreBaseCosts === true,
          returnZone: "banishment" as const,
          forcedDestinationId: location.kind === "base" ? "base" : location.id,
          destinationBasePlayerId: location.kind === "base" ? location.id : null,
        }];
      });
      context.game.state.effectPlayQueue = staged;
    },
  });
  handlers.set("action.return_to_hand", {
    execute(_binding, context) {
      for (const id of context.selectedIds) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        removeFromAllLocations(context.game, id);
        context.game.state.players[owner]!.zones.hand.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
      }
    },
  });
  handlers.set("action.each_player_choose_top_deck_card_and_play", {
    choice(binding, context) {
      const count = numberParam(binding, "count");
      const selected = new Set(context.selectedIds);
      for (const playerId of playersStartingWithNext(context.game, context.controllerPlayerId)) {
        const looked = context.game.state.players[playerId]!.zones.mainDeck.slice(0, count);
        if (looked.length > 0 && !looked.some((id) => selected.has(id))) {
          return {
            playerId,
            choiceKey: `player:${playerId}`,
            legalIds: looked,
            visibleIds: looked,
            minimum: 1,
            maximum: 1,
            prompt: "Choose a card to play, then recycle the rest.",
            sourceZone: "mainDeck" as const,
            presentation: "cardSelection" as const,
          };
        }
      }
      return null;
    },
    execute(binding, context) {
      if (!context.effectResolutionId) {
        throw new Error("Effect-driven card play must resolve in an effect frame.");
      }
      const resolutionId = context.effectResolutionId;
      if ((context.game.state.effectPlayQueue ?? []).length > 0) {
        throw new Error("Effect-driven card play queue is already active.");
      }
      const selected = new Set(context.selectedIds);
      const staged = playersStartingWithNext(context.game, context.controllerPlayerId).flatMap((playerId) => {
        const player = context.game.state.players[playerId]!;
        const looked = player.zones.mainDeck.slice(0, numberParam(binding, "count"));
        const chosen = looked.find((id) => selected.has(id));
        if (!chosen) return [];
        recycleCards(context.game, index, context.sourceCardInstanceId, looked.filter((id) => id !== chosen));
        player.zones.mainDeck = player.zones.mainDeck.filter((id) => id !== chosen);
        player.zones.hand.push(chosen);
        advanceGameObjectIncarnation(context.game, chosen);
        return [{
          resolutionId,
          sourceCardInstanceId: context.sourceCardInstanceId,
          playerId,
          cardInstanceId: chosen,
          ignoreBaseEnergy: true,
          ignoreBasePower: false,
          returnZone: "mainDeck" as const,
          forcedDestinationId: null,
          destinationBasePlayerId: null,
        }];
      });
      context.game.state.effectPlayQueue = staged;
    },
  });
  handlers.set("trigger.stored_target_death", {
    matches(_binding, context) {
      const target = context.event?.subjectCardInstanceId;
      return Boolean(target && context.game.state.ongoingEffects.some(
        (effect) => effect.behaviorId === "action.play_token_on_next_death" &&
          effect.sourceCardInstanceId === context.sourceCardInstanceId &&
          effect.targetCardInstanceIds.includes(target),
      ));
    },
  });
  handlers.set("condition.source_empowered", {
    matches: (_binding, context) =>
      context.game.state.cardStates[context.sourceCardInstanceId]?.empowered === true,
  });
  handlers.set("condition.first_non_token_gear_play_this_turn", {
    matches: (_binding, context) => {
      const event = context.event;
      const turn = context.game.state.turn;
      if (!event?.subjectCardInstanceId || event.type !== "card.played" ||
        event.actorPlayerId !== context.controllerPlayerId || !turn) return false;
      const playedGearIds = (turn.playedCardInstanceIds ?? []).filter((id) => {
        const instance = index.instances.get(id);
        return instance?.source !== "token" &&
          definitionForInstance(id, index).card.classification.type === "Gear";
      });
      return playedGearIds.length === 1 && playedGearIds[0] === event.subjectCardInstanceId;
    },
  });
  handlers.set("action.recycle_cards", {
    choice(binding, context) {
      if (!effectOutcomeMatches(binding, context)) return null;
      const zone = binding.parameters.selectFromZone;
      if (zone !== "trash" && zone !== "hand" && zone !== "mainDeck") return null;
      const owner = binding.parameters.owner;
      const playerIds = Object.keys(context.game.state.players).filter((playerId) =>
        owner === "opponent"
          ? playerId !== context.controllerPlayerId
          : owner === "controller"
            ? playerId === context.controllerPlayerId
            : false,
      );
      const cardType = typeof binding.parameters.cardType === "string"
        ? binding.parameters.cardType
        : "any";
      const excludedCardType = binding.parameters.excludesCardType;
      const legalIds = playerIds.flatMap((playerId) =>
        context.game.state.players[playerId]!.zones[zone].filter((id) =>
          (cardType === "any" || cardHasType(definitionForInstance(id, index), cardType)) &&
          (typeof excludedCardType !== "string" ||
            !cardHasType(definitionForInstance(id, index), excludedCardType)) &&
          (typeof binding.parameters.requiredDomain !== "string" ||
            definitionForInstance(id, index).card.classification.domain.includes(
              normalizedDomain(binding.parameters.requiredDomain),
            )),
        ),
      );
      return {
        kind: "card" as const,
        legalIds,
        minimum: typeof binding.parameters.minimumCount === "number"
          ? binding.parameters.minimumCount
          : 0,
        maximum: typeof binding.parameters.maximumCount === "number"
          ? binding.parameters.maximumCount
          : legalIds.length,
        prompt: typeof binding.parameters.prompt === "string"
          ? binding.parameters.prompt
          : "Choose cards to recycle",
        sourceZone: zone,
        presentation: "cardSelection" as const,
      };
    },
    execute(binding, context) {
      if (!effectOutcomeMatches(binding, context)) return;
      const selected = selectionFor(binding, context);
      const count = typeof binding.parameters.count === "number"
        ? binding.parameters.count
        : undefined;
      const cards = (selected.length > 0 ? selected : context.selectedIds)
        .slice(0, count);
      recycleCards(context.game, index, context.sourceCardInstanceId, cards);
    },
  });
  handlers.set("action.move_unit", {
    execute(binding, context) {
      const destinationSelectionKey = binding.parameters.destinationSelectionKey;
      const selectedDestinationIds =
        typeof destinationSelectionKey === "string"
          ? context.selectedBySelector[destinationSelectionKey] ?? []
          : [];
      const destination =
        selectedDestinationIds[0] ??
        (typeof binding.parameters.destination === "string"
          ? binding.parameters.destination
          : null);
      if (!destination) throw new Error("Move destination is unavailable.");
      const selected = selectionFor(binding, context);
      const targetIds = selected.length > 0
        ? selected
        : context.selectedIds.filter((id) =>
            boardUnitIds(context.game, index).includes(id),
          );
      for (const id of targetIds) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        if (!legalEffectMoveDestinationIds(context.game, id, index).includes(destination)) {
          continue;
        }
        for (const player of Object.values(context.game.state.players)) {
          player.zones.base = player.zones.base.filter(
            (candidate) => candidate !== id,
          );
        }
        for (const battlefield of context.game.state.battlefields) {
          battlefield.units = battlefield.units.filter(
            (candidate) => candidate !== id,
          );
        }
        if (destination === "base") {
          context.game.state.players[owner]!.zones.base.push(id);
        } else {
          const battlefield = context.game.state.battlefields.find(
            (candidate) => candidate.battlefieldId === destination,
          );
          if (!battlefield) continue;
          battlefield.units.push(id);
          if (battlefield.controllerPlayerId !== owner) {
            battlefield.contestedByPlayerId = owner;
          }
        }
        moveAttachedCardsWithTopMost(context.game, id, index);
        const events = (context.game.state.queuedBehaviorEvents ??= []);
        events.push({
          type: "unit.moved",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: { destination },
        });
      }
    },
  });
  handlers.set("modifier.enter_ready", {
    execute(binding, context) {
      if (binding.parameters.target === "controller_units") {
        context.game.state.ongoingEffects.push({
          id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
          behaviorId: binding.behaviorId,
          controllerPlayerId: context.controllerPlayerId,
          sourceCardInstanceId: context.sourceCardInstanceId,
          targetCardInstanceIds: [],
          duration: stringParam(binding, "duration"),
          createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
        });
      } else {
        context.game.state.cardStates[context.sourceCardInstanceId]!.exhausted = false;
      }
    }
  });
  handlers.set("modifier.enter_exhausted", {
    execute(_binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId];
      if (!state) throw new Error("Entry exhaustion source is unavailable.");
      state.exhausted = true;
    },
  });
  handlers.set("modifier.modify_numeric_value", {
    execute(binding, context) {
      if (isContinuousDuration(binding.parameters.duration)) {
        return;
      }
      const attribute = stringParam(binding, "attribute");
      const routedTargets = selectionFor(binding, context);
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "event_subject" && context.event?.subjectCardInstanceId
          ? [context.event.subjectCardInstanceId]
        : binding.parameters.target === "game" || binding.parameters.target === "controller_spell"
          ? [null]
          : routedTargets.length > 0
            ? routedTargets
            : context.selectedIds.length > 0
              ? context.selectedIds
              : implicitModifierTargets(binding, context, index);
      if (
        binding.parameters.condition === "onlyFriendlyUnitAtLocation" &&
        targets.some((target) =>
          target ? !isOnlyFriendlyUnitAtLocation(
            context.game,
            target,
            context.controllerPlayerId,
            index,
          ) : false,
        )
      ) {
        return;
      }
      const mightTargets: string[] = [];
      for (const target of targets) {
        const modifier = {
          id: `modifier:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.modifiers.length}`,
          sourceCardInstanceId: context.sourceCardInstanceId,
          controllerPlayerId: context.controllerPlayerId,
          targetCardInstanceId: target,
          targetScope: stringParam(binding, "target"),
          attribute,
          operation: stringParam(binding, "operation") as "increase" | "reduce" | "multiply" | "set",
          amount: numberParam(binding, "amount"),
          minimum: typeof binding.parameters.minimum === "number" ? binding.parameters.minimum : null,
          duration: stringParam(binding, "duration"),
          createdAtTurn: context.game.state.turn?.turnNumber ?? 0
        };
        context.game.state.modifiers.push(modifier);
        if (target && attribute === "might") {
          recomputeMight(context.game, target, index);
          mightTargets.push(target);
        }
      }
      cleanupLethalDamage(context.game, mightTargets, index);
    }
  });
  handlers.set("modifier.grant_keyword", {
    validate(binding) {
      const keywordBehaviorId = binding.parameters.keywordBehaviorId;
      if (typeof keywordBehaviorId !== "string" || !keywordBehaviorId.startsWith("keyword.")) {
        throw new Error("Keyword grant requires a keyword behavior identity.");
      }
      if (keywordBehaviorId !== "keyword.assault" && keywordBehaviorId !== "keyword.deflect" &&
          keywordBehaviorId !== "keyword.shield" && keywordBehaviorId !== "keyword.tank" &&
          keywordBehaviorId !== "keyword.ganking") {
        throw new Error(`Runtime keyword grant is not supported: ${keywordBehaviorId}`);
      }
      if (additiveKeywordIds.has(keywordBehaviorId) && binding.parameters.amount !== undefined &&
          typeof binding.parameters.amount !== "number") {
        throw new Error("Numeric keyword grants require a numeric amount.");
      }
      const keywordAmount = binding.parameters.amount;
      if (additiveKeywordIds.has(keywordBehaviorId) && typeof keywordAmount === "number" &&
          (!Number.isInteger(keywordAmount) || keywordAmount <= 0)) {
        throw new Error("Numeric keyword grants require a positive integer amount.");
      }
      if (!additiveKeywordIds.has(keywordBehaviorId) && binding.parameters.amount !== undefined) {
        throw new Error("Presence keywords cannot be granted with a numeric amount.");
      }
      if (binding.parameters.duration !== undefined && typeof binding.parameters.duration !== "string") {
        throw new Error("Keyword grant duration must be a supported duration value.");
      }
      if (binding.parameters.duration !== undefined && !["thisTurn", "targetObject", "whileSourceAtBattlefield", "whileSourceOnBoard", "whileAttached"].includes(String(binding.parameters.duration))) {
        throw new Error("Keyword grant duration must use a supported lifetime.");
      }
      if (typeof binding.parameters.target !== "string" || !["source", "event_subject", "unit", "friendly_unit", "enemy_unit", "controller_units", "controller_card"].includes(binding.parameters.target)) {
        throw new Error("Keyword grants require a supported target reference.");
      }
    },
    execute(binding, context) {
      const target = stringParam(binding, "target");
      const routedTargets = selectionFor(binding, context);
      const targets = target === "source"
        ? [context.sourceCardInstanceId]
        : target === "event_subject" && context.event?.subjectCardInstanceId
          ? [context.event.subjectCardInstanceId]
          : routedTargets.length > 0
            ? routedTargets
            : context.selectedIds;
      const keywordBehaviorId = stringParam(binding, "keywordBehaviorId");
      const duration = typeof binding.parameters.duration === "string"
        ? binding.parameters.duration
        : "targetObject";
      if (isContinuousDuration(duration)) return;
      const createdAtTurn = context.game.state.turn?.turnNumber ?? 0;
      const activationCandidates = new Set<string>();
      for (const targetCardInstanceId of targets) {
        const targetState = context.game.state.cardStates[targetCardInstanceId];
        if (!targetState) continue;
        const grant = {
          id: `keyword-grant:${context.game.stateVersion}:${targetCardInstanceId}:${(context.game.state.keywordGrants ?? []).length}`,
          targetCardInstanceId,
          targetGameObjectIncarnation: targetState.gameObjectIncarnation ?? 0,
          keywordBehaviorId,
          amount: additiveKeywordIds.has(keywordBehaviorId)
            ? typeof binding.parameters.amount === "number" ? binding.parameters.amount : 1
            : null,
          sourceCardInstanceId: context.sourceCardInstanceId,
          sourceGameObjectIncarnation: context.game.state.cardStates[context.sourceCardInstanceId]?.gameObjectIncarnation ?? 0,
          sourceBehaviorClauseId: context.sourceBehaviorClauseId ?? null,
          sourceBindingOrder: binding.order,
          duration,
          displayDuration: typeof binding.parameters.displayDuration === "string" ? binding.parameters.displayDuration : null,
          createdAtTurn,
          applicationOrder: context.game.state.nextRuntimeEffectOrder ?? 0,
        };
        (context.game.state.keywordGrants ??= []).push(grant);
        context.game.state.nextRuntimeEffectOrder = (context.game.state.nextRuntimeEffectOrder ?? 0) + 1;
        activationCandidates.add(targetCardInstanceId);
      }
      for (const targetCardInstanceId of activationCandidates) {
        reconcileRuntimeKeywordActivation(context.game, targetCardInstanceId, keywordBehaviorId, index);
        if (context.game.state.cardStates[targetCardInstanceId]?.combatRole) {
          recomputeMight(context.game, targetCardInstanceId, index);
          cleanupLethalDamage(context.game, [targetCardInstanceId], index);
        }
      }
    },
  });
  handlers.set("modifier.grant_behavior", {
    validate(binding) {
      if (typeof binding.parameters.behaviorFragmentId !== "string" || !binding.parameters.behaviorFragmentId) {
        throw new Error("Granted behavior requires an approved behavior fragment.");
      }
      if (typeof binding.parameters.displayText !== "string" || !binding.parameters.displayText.trim()) {
        throw new Error("Granted behavior requires its player-facing rules text.");
      }
      if (binding.parameters.duration !== undefined && !["thisTurn", "targetObject"].includes(String(binding.parameters.duration))) {
        throw new Error("Granted behavior duration must use a supported applied lifetime.");
      }
      if (binding.parameters.displayDuration !== undefined && typeof binding.parameters.displayDuration !== "string") {
        throw new Error("Granted behavior display duration must be text when present.");
      }
      if (typeof binding.parameters.target !== "string" || !["source", "event_subject", "unit", "friendly_unit", "enemy_unit", "controller_units", "controller_card"].includes(binding.parameters.target)) {
        throw new Error("Granted behavior requires a supported target reference.");
      }
    },
    execute(binding, context) {
      const fragmentId = stringParam(binding, "behaviorFragmentId");
      const sourceDefinition = definitionForInstance(context.sourceCardInstanceId, index);
      const fragment = sourceDefinition.behaviorModel.fragments?.[fragmentId];
      if (!fragment?.length) throw new Error(`Granted behavior fragment is unavailable: ${fragmentId}`);
      if (fragment.some((clause) => clause.triggers.length === 0 || clause.timings.some((timing) => timing.behaviorId === "timing.delayed"))) {
        throw new Error("Granted behavior fragments currently require non-delayed triggered clauses.");
      }
      compileBehaviorModel({ playTimings: [], clauses: fragment }, handlers);
      const target = stringParam(binding, "target");
      const routedTargets = selectionFor(binding, context);
      const targets = target === "source"
        ? [context.sourceCardInstanceId]
        : target === "event_subject" && context.event?.subjectCardInstanceId
          ? [context.event.subjectCardInstanceId]
          : routedTargets.length > 0
            ? routedTargets
            : context.selectedIds;
      const duration = typeof binding.parameters.duration === "string" ? binding.parameters.duration : "targetObject";
      const createdAtTurn = context.game.state.turn?.turnNumber ?? 0;
      for (const targetCardInstanceId of targets) {
        const targetState = context.game.state.cardStates[targetCardInstanceId];
        if (!targetState) continue;
        (context.game.state.grantedBehaviorGrants ??= []).push({
          id: `behavior-grant:${context.game.stateVersion}:${targetCardInstanceId}:${(context.game.state.grantedBehaviorGrants ?? []).length}`,
          targetCardInstanceId,
          targetGameObjectIncarnation: targetState.gameObjectIncarnation ?? 0,
          clauses: structuredClone(fragment),
          displayText: stringParam(binding, "displayText"),
          sourceCardInstanceId: context.sourceCardInstanceId,
          sourceGameObjectIncarnation: context.game.state.cardStates[context.sourceCardInstanceId]?.gameObjectIncarnation ?? 0,
          sourceBehaviorClauseId: context.sourceBehaviorClauseId ?? null,
          sourceBindingOrder: binding.order,
          duration,
          displayDuration: typeof binding.parameters.displayDuration === "string" ? binding.parameters.displayDuration : null,
          createdAtTurn,
          applicationOrder: context.game.state.nextRuntimeEffectOrder ?? 0,
        });
        context.game.state.nextRuntimeEffectOrder = (context.game.state.nextRuntimeEffectOrder ?? 0) + 1;
      }
    },
  });
  handlers.set("ability.exhaust_for_resource", {
    execute(binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId]!;
      if (state.exhausted) throw new Error("Ability source is exhausted.");
      state.exhausted = true;
      if (binding.parameters.killSource === true) {
        moveCardToTrash(context.game, context.sourceCardInstanceId, index);
      }
      const player = context.game.state.players[context.controllerPlayerId]!;
      const empoweredAmount = binding.parameters.empoweredAmount;
      const amount = state.empowered === true && typeof empoweredAmount === "number"
        ? empoweredAmount
        : numberParam(binding, "amount");
      const usage = stringParam(binding, "usage");
      if (binding.parameters.resourceType === "power") {
        const domain = resourceDomainForBinding(binding, context, index);
        if (usage === "unrestricted" || binding.parameters.poolResource === true) {
          player.power[domain] = (player.power[domain] ?? 0) + amount;
          return;
        }
        player.restrictedResources ??= { energy: {}, power: {} };
        player.restrictedResources.power[usage] ??= {};
        player.restrictedResources.power[usage][domain] =
          (player.restrictedResources.power[usage][domain] ?? 0) + amount;
        return;
      }
      if (usage === "unrestricted") {
        player.energy += amount;
        return;
      }
      if (usage === "spellsOnly") {
        player.conditionalEnergy += amount;
        return;
      }
      player.restrictedResources ??= { energy: {}, power: {} };
      player.restrictedResources.energy[usage] =
        (player.restrictedResources.energy[usage] ?? 0) + amount;
    }
  });
  handlers.set("action.kill_card", {
    execute(binding, context) {
      if (!effectOutcomeMatches(binding, context)) return;
      const selected = selectionFor(binding, context);
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : selected.length > 0 ? selected : context.selectedIds;
      let killed = false;
      for (const id of targets) {
        if (!context.game.state.cardStates[id]) continue;
        moveCardToTrash(context.game, id, index);
        killed = true;
      }
      context.effectOutcomes.lastTargetKilled = killed;
    },
  });
  handlers.set("action.counter_chain_item", {
    execute(binding, context) {
      const targetIds = new Set(selectionFor(binding, context));
      if (targetIds.size === 0) return;
      const chain = context.game.state.chain;
      if (!chain) return;
      const countered = chain.items.filter((item) => targetIds.has(item.id));
      chain.items = chain.items.filter((item) => !targetIds.has(item.id));
      for (const item of countered) {
        if (!item.sourceCardInstanceId || item.kind !== "spell") continue;
        const owner = index.instances.get(item.sourceCardInstanceId)?.ownerPlayerId;
        if (!owner) continue;
        const trash = context.game.state.players[owner]!.zones.trash;
        if (!trash.includes(item.sourceCardInstanceId)) {
          trash.push(item.sourceCardInstanceId);
          advanceGameObjectIncarnation(context.game, item.sourceCardInstanceId);
        }
      }
    },
  });
  handlers.set("action.attach_equipment", {
    execute(binding, context) {
      if (binding.parameters.optional === true && context.selectedIds.length === 0) return;
      attachEquipmentToSelectedUnit(context, index);
    },
  });
  handlers.set("ability.equip", {
    execute(_binding, context) {
      attachEquipmentToSelectedUnit(context, index);
    },
  });
  handlers.set("ability.empower", {
    execute(_binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId];
      if (!state) throw new Error("Empower source is unavailable.");
      if (state.empowered) throw new Error("Source is already Empowered.");
      state.empowered = true;
    },
  });
  handlers.set("action.detach_equipment", {
    execute(binding, context) {
      const optionKey = binding.parameters.requiresOptionKey;
      if (
        typeof optionKey === "string" &&
        context.effectOutcomes[optionKey] !== true
      ) {
        return;
      }
      const selected = selectionFor(binding, context);
      for (const cardInstanceId of selected.length > 0
        ? selected
        : context.selectedIds) {
        const definition = definitionForInstance(cardInstanceId, index);
        if (
          definition.card.classification.type !== "Gear" ||
          !definition.card.tags.includes("Equipment")
        ) {
          if (binding.parameters.onlyIfEquipment === true) continue;
          throw new Error("Only Equipment can be detached.");
        }
        const topMostCardInstanceId = detachCard(
          context.game,
          cardInstanceId,
        );
        if (topMostCardInstanceId) {
          recomputeMight(context.game, topMostCardInstanceId, index);
        }
      }
    },
  });
  handlers.set("action.optional", {
    choice(binding, context) {
      const committedKey = binding.parameters.selectionKey;
      if (binding.parameters.commitAtPlay === true &&
        typeof committedKey === "string" &&
        Object.hasOwn(context.selectionOverrides, committedKey)) return null;
      const selectionKey = binding.parameters.onlyIfSelectedBy;
      if (
        typeof selectionKey === "string" &&
        (context.selectedBySelector[selectionKey] ?? []).length === 0
      ) {
        return null;
      }
      const selected = typeof selectionKey === "string"
        ? context.selectedBySelector[selectionKey] ?? []
        : context.selectedIds;
      const requiredTag = binding.parameters.onlyIfSelectedHasTag;
      if (
        (typeof requiredTag === "string" || binding.parameters.onlyIfSelectedAttached === true) &&
        !selected.some((id) =>
          (typeof requiredTag !== "string" || definitionForInstance(id, index).card.tags.includes(requiredTag)) &&
          (binding.parameters.onlyIfSelectedAttached !== true || Boolean(context.game.state.cardStates[id]?.attachedToCardInstanceId)),
        )
      ) return null;
      return {
        kind: "option" as const,
        legalIds: ["yes", "no"],
        minimum: 1,
        maximum: 1,
        prompt: stringParam(binding, "prompt"),
        options: [
          {
            id: "yes",
            label: typeof binding.parameters.yesLabel === "string"
              ? binding.parameters.yesLabel
              : "Yes",
          },
          {
            id: "no",
            label: typeof binding.parameters.noLabel === "string"
              ? binding.parameters.noLabel
              : "No",
          },
        ],
      };
    },
    execute(binding, context) {
      const effectKey = stringParam(binding, "effectKey");
      const committedKey = binding.parameters.selectionKey;
      const selected = binding.parameters.commitAtPlay === true &&
        typeof committedKey === "string"
        ? context.selectionOverrides[committedKey] ?? context.selectedIds
        : context.selectedIds;
      context.effectOutcomes[effectKey] = selected.includes("yes");
    },
  });
  handlers.set("trigger.beginning_phase", {
    matches(_binding, context) {
      return context.event?.type === "turn.beginning" &&
        context.event.actorPlayerId === context.controllerPlayerId;
    },
  });
  handlers.set("condition.controller_hand_and_battlefield_unit_counts", {
    matches(binding, context) {
      const handCount = binding.parameters.handCount;
      const battlefieldUnitCount = binding.parameters.battlefieldUnitCount;
      if (typeof handCount !== "number" || typeof battlefieldUnitCount !== "number") return false;
      return context.game.state.players[context.controllerPlayerId]!.zones.hand.length === handCount &&
        context.game.state.battlefields.flatMap((battlefield) => battlefield.units)
          .filter((id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId)
          .length === battlefieldUnitCount;
    },
  });
  handlers.set("action.win_game", {
    execute(_binding, context) {
      context.game.winnerPlayerId = context.controllerPlayerId;
      context.game.completionReason = "victory";
      context.game.status = "complete";
    },
  });
  handlers.set("action.play_token_on_next_death", {
    execute(binding, context) {
      const tokenName = binding.parameters.tokenName;
      if (typeof tokenName !== "string") throw new Error("Delayed death token is malformed.");
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: selectionFor(binding, context),
        parameters: { tokenName },
        duration: "thisTurn",
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
    },
  });
  handlers.set("ability.recycle_for_power", {
    execute(_binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      player.zones.base = player.zones.base.filter((id) => id !== context.sourceCardInstanceId);
      player.zones.runeDeck.push(context.sourceCardInstanceId);
      resetStateAfterLeavingBoard(
        context.game,
        context.sourceCardInstanceId,
        index,
      );
      recomputeAllMight(context.game, index);
      const domain = definitionForInstance(context.sourceCardInstanceId, index).card.classification.domain[0] ?? "Rainbow";
      player.power[domain] = (player.power[domain] ?? 0) + 1;
    }
  });
  handlers.set("replacement.recall_on_next_death", {
    execute(binding, context) {
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: selectionFor(binding, context),
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
    },
  });
  return handlers;
}

export function effectiveEnergyCost(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
  cardInstanceId?: string,
  onContribution?: (contribution: NumericContribution) => void,
  baseEnergy?: number,
): number {
  return effectiveNumericValue({
    onContribution,
    attribute: "energyCost",
    baseValue: baseEnergy ?? definition.card.attributes.energy ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetCardInstanceId: cardInstanceId,
    targetScope: "controller_spell",
  });
}

export function cleanupTurnModifiers(game: GameDocument, index: RuntimeCardIndex) {
  const expiredKeywordGrants = (game.state.keywordGrants ?? []).filter((grant) => grant.duration === "thisTurn");
  const affectedKeywordTargets = new Set(expiredKeywordGrants.map((grant) => grant.targetCardInstanceId));
  const affected = [
    ...game.state.modifiers.filter((item) => item.duration === "thisTurn" && item.targetCardInstanceId).map((item) => item.targetCardInstanceId!),
    ...expiredKeywordGrants.filter((grant) => additiveKeywordIds.has(grant.keywordBehaviorId)).map((grant) => grant.targetCardInstanceId),
  ];
  game.state.modifiers = game.state.modifiers.filter((item) => item.duration !== "thisTurn");
  game.state.keywordGrants = (game.state.keywordGrants ?? []).filter((grant) => grant.duration !== "thisTurn");
  game.state.grantedBehaviorGrants = (game.state.grantedBehaviorGrants ?? []).filter((grant) => grant.duration !== "thisTurn");
  game.state.ongoingEffects = game.state.ongoingEffects.filter(
    (item) => item.duration !== "thisTurn",
  );
  affected.forEach((id) => recomputeMight(game, id, index));
  cleanupLethalDamage(game, [...new Set(affected)], index);
  for (const targetCardInstanceId of affectedKeywordTargets) {
    const otherKeywords = new Set(expiredKeywordGrants.filter((grant) => grant.targetCardInstanceId === targetCardInstanceId).map((grant) => grant.keywordBehaviorId));
    for (const behaviorId of otherKeywords) reconcileRuntimeKeywordActivation(game, targetCardInstanceId, behaviorId, index);
  }
}

export function recomputeAllMight(
  game: GameDocument,
  index: RuntimeCardIndex,
) {
  for (const id of Object.keys(game.state.cardStates)) {
    if (
      index.instances.get(id) &&
      definitionForInstance(id, index).card.classification.type === "Unit"
    ) {
      recomputeMight(game, id, index);
    }
  }
}

function selectorTargets(
  binding: BehaviorBinding,
  game: GameDocument,
  index: RuntimeCardIndex,
  predicate: (id: string) => boolean,
  sourceCardInstanceId: string,
  lockedSelectedIds: readonly string[] = [],
  hiddenBattlefieldId: string | null = null,
) {
  const baseUnits = game.state.setup.playerIds.flatMap(
    (playerId) => game.state.players[playerId]?.zones.base ?? []
  );
  const battlefieldUnits = game.state.battlefields.flatMap((battlefield) => battlefield.units);
  const candidates = binding.parameters.area === "combat"
    ? game.state.combat
      ? game.state.battlefields.find(
          (item) => item.battlefieldId === game.state.combat!.battlefieldId,
        )?.units ?? []
      : []
    : binding.parameters.area === "battlefield"
    ? battlefieldUnits
    : binding.parameters.area === "base"
      ? baseUnits
      : [...baseUnits, ...battlefieldUnits];
  const legalIds = candidates
    .filter((id) => definitionForInstance(id, index).card.classification.type === "Unit")
    .filter((id) =>
      typeof binding.parameters.requiredDomain !== "string" ||
      definitionForInstance(id, index).card.classification.domain.includes(
        normalizedDomain(binding.parameters.requiredDomain),
      ),
    )
    .filter((id) => {
      const combatDomain = binding.parameters.inCombatWithEnemyDomain;
      const targetedDomain = binding.parameters.targetedByEnemySpellDomain;
      if (typeof combatDomain !== "string" && typeof targetedDomain !== "string") return true;
      return (
        (typeof combatDomain === "string" &&
          unitIsInCombatWithEnemyDomain(
            game,
            id,
            normalizedDomain(combatDomain),
            index,
          )) ||
        (typeof targetedDomain === "string" &&
          unitIsChosenByEnemySpellDomain(
            game,
            id,
            normalizedDomain(targetedDomain),
            index,
          ))
      );
    })
    .filter(
      (id) =>
        typeof binding.parameters.maximumMight !== "number" ||
        (game.state.cardStates[id]?.computedMight ?? 0) <=
          binding.parameters.maximumMight,
    )
    .filter(
      (id) =>
        binding.parameters.readyOnly !== true ||
        !game.state.cardStates[id]?.exhausted ||
        lockedSelectedIds.includes(id),
    )
    .filter((id) =>
      unitLocationRelationMatches(
        game,
        id,
        sourceCardInstanceId,
        binding.parameters.locationRelation,
        hiddenBattlefieldId,
      ),
    )
    .filter(
      (id) =>
        binding.parameters.excludesSource !== true ||
        id !== sourceCardInstanceId,
    )
    .filter(predicate);
  const automatic =
    binding.parameters.automatic === true ||
    (binding.parameters.scope === "each" &&
      typeof binding.parameters.maximumCount !== "number");
  return {
    kind: "card" as const,
    ...(typeof binding.parameters.selectionKey === "string"
      ? { selectionKey: binding.parameters.selectionKey }
      : {}),
    ...(binding.parameters.selectionPurpose === "optionalCost"
      ? {
          selectionPurpose: "optionalCost" as const,
          label: "ready friendly unit to exhaust (optional)",
        }
      : {}),
    legalIds,
    minimum: automatic ? 0 : typeof binding.parameters.minimumCount === "number" ? binding.parameters.minimumCount : 1,
    maximum: automatic ? 0 : typeof binding.parameters.maximumCount === "number" ? binding.parameters.maximumCount : 1
  };
}

function boardUnitIds(game: GameDocument, index: RuntimeCardIndex) {
  return [
    ...Object.values(game.state.players).flatMap((player) => player.zones.base),
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units),
  ].filter((id) =>
    index.instances.has(id) && cardHasType(definitionForInstance(id, index), "Unit"),
  );
}

function moveDestinationLabels(
  game: GameDocument,
  index: RuntimeCardIndex,
  destinationIds: readonly string[],
) {
  return Object.fromEntries(
    destinationIds.map((id) => [
      id,
      id === "base"
        ? "Target unit's Base"
        : definitionForInstance(
            game.state.battlefields.find(
              (battlefield) => battlefield.battlefieldId === id,
            )!.cardInstanceId,
            index,
          ).card.name,
    ]),
  );
}

function damageTargets(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const routed = selectionFor(binding, context);
  if (routed.length > 0) return routed;
  if (binding.parameters.target === "enemy_unit") {
    const battlefieldIds = new Set(context.selectedIds);
    return context.game.state.battlefields
      .filter((battlefield) => battlefieldIds.has(battlefield.battlefieldId))
      .flatMap((battlefield) => battlefield.units)
      .filter(
        (id) =>
          index.instances.get(id)?.ownerPlayerId !== context.controllerPlayerId,
      );
  }
  if (
    binding.parameters.target === "unit" &&
    context.effectOutcomes.automaticTargets === true
  ) {
    return context.game.state.battlefields.flatMap(
      (battlefield) => battlefield.units,
    );
  }
  return context.selectedIds.filter((id) => context.game.state.cardStates[id]);
}

function selectionFor(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const key = binding.parameters.selectionKey;
  return typeof key === "string"
    ? context.selectedBySelector[key] ?? []
    : [];
}

function implicitModifierTargets(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const target = binding.parameters.target;
  if (
    target !== "friendly_unit" &&
    target !== "enemy_unit" &&
    target !== "unit"
  ) {
    return [];
  }
  const allUnits = [
    ...context.game.state.setup.playerIds.flatMap(
      (playerId) => context.game.state.players[playerId]?.zones.base ?? [],
    ),
    ...context.game.state.battlefields.flatMap(
      (battlefield) => battlefield.units,
    ),
  ];
  return allUnits
    .filter(
      (id) => definitionForInstance(id, index).card.classification.type === "Unit",
    )
    .filter((id) =>
      unitLocationRelationMatches(
        context.game,
        id,
        context.sourceCardInstanceId,
        binding.parameters.locationRelation,
      ),
    )
    .filter(
      (id) =>
        binding.parameters.excludesSource !== true ||
        id !== context.sourceCardInstanceId,
    )
    .filter((id) => {
      const owner = index.instances.get(id)?.ownerPlayerId;
      if (target === "friendly_unit") return owner === context.controllerPlayerId;
      if (target === "enemy_unit") return owner !== context.controllerPlayerId;
      return true;
    });
}

function tokenPlacementDestinations(
  game: GameDocument,
  controllerPlayerId: string,
  index: RuntimeCardIndex,
) {
  return [
    { id: "base", label: "Base" },
    ...game.state.battlefields
      .filter((battlefield) => battlefield.controllerPlayerId === controllerPlayerId)
      .map((battlefield) => ({
        id: battlefield.battlefieldId,
        label: definitionForInstance(battlefield.cardInstanceId, index).card.name,
      })),
  ];
}

function selectedTokenDestinations(
  context: BehaviorExecutionContext,
  count: number,
) {
  if (context.selectedIds.length < count) {
    throw new Error("Token placement count does not match token count.");
  }
  return context.selectedIds.slice(-count);
}

function fixedTokenDestination(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  if (binding.parameters.placement === "base") return "base";
  const battlefield = context.game.state.battlefields.find((candidate) =>
    candidate.units.includes(context.sourceCardInstanceId),
  );
  return battlefield?.battlefieldId ?? "base";
}

function playToken(
  game: GameDocument,
  input: {
    controllerPlayerId: string;
    destinationId: string;
    requireControlledDestination: boolean;
    sourceCardInstanceId: string;
    tokenName: string;
    entryState: "ready" | "exhausted";
    index: RuntimeCardIndex;
  },
) {
  const definition = findOrCreateTokenDefinition(
    game,
    input.tokenName,
    input.index,
  );
  const instanceId = [
    input.controllerPlayerId,
    "token",
    definition.cardCode,
    game.stateVersion,
    (game.state.createdCardInstances ?? []).length + 1,
  ].join(":");
  const instance = {
    instanceId,
    ownerPlayerId: input.controllerPlayerId,
    source: "token" as const,
    cardCode: definition.cardCode,
  };
  (game.state.createdCardInstances ??= []).push(instance);
  input.index.instances.set(instanceId, instance);
  game.state.cardStates[instanceId] = {
    exhausted: input.entryState === "exhausted",
    damage: 0,
    computedMight: definition.card.attributes.might,
    gameObjectIncarnation: 0,
    objectVersion: 0,
  };
  if (input.destinationId === "base") {
    game.state.players[input.controllerPlayerId]!.zones.base.push(instanceId);
  } else {
    const battlefield = game.state.battlefields.find(
      (candidate) => candidate.battlefieldId === input.destinationId,
    );
    if (!battlefield) throw new Error("Token destination is unavailable.");
    if (
      input.requireControlledDestination &&
      battlefield.controllerPlayerId !== input.controllerPlayerId
    ) {
      throw new Error("Token destination is not controlled by the player.");
    }
    if (definition.card.classification.type === "Gear") {
      game.state.players[input.controllerPlayerId]!.zones.base.push(instanceId);
    } else {
      battlefield.units.push(instanceId);
    }
  }
  if (
    game.state.ongoingEffects.some(
      (effect) =>
        effect.behaviorId === "modifier.enter_ready" &&
        effect.controllerPlayerId === input.controllerPlayerId,
    )
  ) {
    game.state.cardStates[instanceId]!.exhausted = false;
  }
  recomputeMight(game, instanceId, input.index);
  const events = (game.state.queuedBehaviorEvents ??= []);
  events.push({
    type: "card.played",
    actorPlayerId: input.controllerPlayerId,
    subjectCardInstanceId: instanceId,
    values: {
      "eventSubject.printedEnergyCost": 0,
      "eventSubject.effectiveEnergyCost": 0,
    },
  });
}

function findOrCreateTokenDefinition(
  game: GameDocument,
  tokenName: string,
  index: RuntimeCardIndex,
): GameCardDefinition {
  const tokenIdentity = tokenIdentityFromName(tokenName);
  const existing = [...index.definitions.values()].find(
    (definition) =>
      definition.card.classification.supertype === "Token" &&
      (definition.card.name === tokenIdentity.name ||
        definition.card.name.startsWith(`${tokenIdentity.name} (`)),
  );
  if (existing) return existing;
  const normalized = tokenIdentity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const cardCode = `TOKEN-${normalized}`;
  const existingGenerated = index.definitions.get(cardCode);
  if (existingGenerated) return existingGenerated;
  const definition: GameCardDefinition = {
    cardCode,
    sourceTextHash: `generated:${normalized}`,
    card: {
      id: cardCode,
      name: tokenIdentity.name,
      public_code: cardCode,
      attributes: {
        energy: null,
        might: tokenIdentity.might,
        power: null,
      },
      classification: {
        type: tokenIdentity.type,
        supertype: "Token",
        rarity: null,
        domain: ["Colorless"],
      },
      text: { plain: "" },
      set: { set_id: "generated", label: "Generated" },
      media: tokenIdentity.imageUrl
        ? { image_url: tokenIdentity.imageUrl }
        : {},
      tags: [],
      metadata: {},
    },
    behaviorModel: {
      playTimings: [],
      clauses: tokenIdentity.goldGear
        ? [{
            id: "gold-gear-resource",
            sequence: 0,
            sourceText: "[Reaction] Kill this, exhaust: Add Rainbow Power.",
            normalizedText: "Kill this, exhaust: Add Rainbow Power.",
            abilities: [{
              behaviorId: "ability.exhaust_for_resource",
              parameters: {
                resourceType: "power",
                amountSource: "constant",
                amount: 1,
                domain: "rainbow",
                usage: "unrestricted",
                killSource: true,
                poolResource: true,
              },
              confidence: "high",
              order: 0,
            }],
            triggers: [],
            conditions: [],
            selectors: [],
            choices: [],
            costs: [],
            timings: [{
              behaviorId: "timing.reaction",
              parameters: {},
              confidence: "high",
              order: 0,
            }],
            effects: [],
            keywords: [],
          }]
        : tokenIdentity.temporary
        ? [{
            id: "temporary",
            sequence: 0,
            sourceText: "Temporary",
            normalizedText: "Temporary",
            abilities: [],
            triggers: [],
            conditions: [],
            selectors: [],
            choices: [],
            costs: [],
            timings: [],
            effects: [],
            keywords: [{
              behaviorId: "keyword.temporary",
              parameters: {},
              confidence: "high",
              order: 0,
            }],
          }]
        : "deflect" in tokenIdentity && tokenIdentity.deflect
        ? [{
            id: "deflect",
            sequence: 0,
            sourceText: "Deflect",
            normalizedText: "Deflect",
            abilities: [], triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [],
            keywords: [{ behaviorId: "keyword.deflect", parameters: {}, confidence: "high", order: 0 }],
          }]
        : [],
    },
  };
  (game.state.createdCardDefinitions ??= []).push(definition);
  index.definitions.set(cardCode, definition);
  return definition;
}

function tokenIdentityFromName(tokenName: string) {
  if (/recruit/i.test(tokenName)) {
    return {
      name: "Recruit",
      might: 1,
      type: "Unit" as const,
      temporary: false,
      goldGear: false,
      imageUrl:
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c168ca334739090a060710dfc440982c3462ac8c-744x1039.png",
    };
  }
  if (/sprite/i.test(tokenName)) {
    return {
      name: "Sprite",
      might: 3,
      type: "Unit" as const,
      temporary: true,
      goldGear: false,
      imageUrl:
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/055892752559d2d3d32e76f491a7a0b540e1a669-744x1039.png",
    };
  }
  if (/sand soldier/i.test(tokenName)) {
    return { name: "Sand Soldier", might: 2, imageUrl: null, type: "Unit" as const, temporary: false, goldGear: false };
  }
  if (/mech/i.test(tokenName)) {
    return { name: "Mech", might: 3, imageUrl: null, type: "Unit" as const, temporary: false, goldGear: false };
  }
  if (/gold gear/i.test(tokenName)) {
    return { name: "Gold Gear", might: null, imageUrl: null, type: "Gear" as const, temporary: false, goldGear: true };
  }
  if (/bird/i.test(tokenName)) {
    return { name: "Bird", might: 1, imageUrl: null, type: "Unit" as const, temporary: false, goldGear: false, deflect: /deflect/i.test(tokenName) };
  }
  return { name: tokenName, might: null, imageUrl: null, type: "Unit" as const, temporary: false, goldGear: false };
}

export function cardHasType(definition: GameCardDefinition, type: string) {
  return definition.card.classification.type === type ||
    definition.behaviorModel.clauses.some((clause) =>
      clause.keywords.some(
        (binding) =>
          binding.behaviorId === "type.additional" &&
          binding.parameters.type === type,
      ),
    );
}

function unitsForPresenceCondition(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const location = unitsAtPresenceLocation(binding, context);
  return location.filter((id) => {
    if (definitionForInstance(id, index).card.classification.type !== "Unit") {
      return false;
    }
    const owner = index.instances.get(id)?.ownerPlayerId;
    const controller = binding.parameters.controller;
    const controllerMatches =
      controller === "controller" || controller === "friendly"
        ? owner === context.controllerPlayerId
        : controller === "enemy" || controller === "opponent"
          ? owner !== context.controllerPlayerId
          : true;
    const readyMatches =
      binding.parameters.readyState !== "ready" ||
      !context.game.state.cardStates[id]?.exhausted;
    return controllerMatches && readyMatches;
  });
}

function unitsAtPresenceLocation(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  if (binding.parameters.locationRelation === "eventBattlefield") {
    const battlefield = context.game.state.battlefields.find(
      (candidate) =>
        candidate.cardInstanceId === context.event?.subjectCardInstanceId ||
        candidate.battlefieldId === context.event?.values.battlefieldId,
    );
    return battlefield?.units ?? [];
  }
  const sourceBattlefield = context.game.state.battlefields.find((candidate) =>
    candidate.units.includes(context.sourceCardInstanceId),
  );
  if (sourceBattlefield) return sourceBattlefield.units;
  return context.game.state.players[context.controllerPlayerId]?.zones.base ?? [];
}

export function incrementObjectVersion(game: GameDocument, id: string) {
  const state = game.state.cardStates[id];
  if (state) state.objectVersion = (state.objectVersion ?? 0) + 1;
}

/**
 * Records an identity-changing zone transition. This is deliberately separate
 * from objectVersion, which protects mutable snapshots and also changes after
 * ordinary state updates such as damage.
 */
export function advanceGameObjectIncarnation(game: GameDocument, id: string) {
  const state = game.state.cardStates[id];
  if (state) {
    state.gameObjectIncarnation = (state.gameObjectIncarnation ?? 0) + 1;
    game.state.keywordGrants = (game.state.keywordGrants ?? []).filter((grant) =>
      grant.targetCardInstanceId !== id || grant.targetGameObjectIncarnation === state.gameObjectIncarnation,
    );
    game.state.grantedBehaviorGrants = (game.state.grantedBehaviorGrants ?? []).filter((grant) =>
      grant.targetCardInstanceId !== id || grant.targetGameObjectIncarnation === state.gameObjectIncarnation,
    );
    game.state.runtimeKeywordActivations = (game.state.runtimeKeywordActivations ?? []).filter((activation) =>
      activation.targetCardInstanceId !== id || activation.targetGameObjectIncarnation === state.gameObjectIncarnation,
    );
  }
}
export function recomputeMight(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  game.state.cardStates[id]!.computedMight = evaluateMight(game, id, index).value;
}

export function evaluateMight(game: GameDocument, id: string, index: RuntimeCardIndex) {
  const contributions: NumericContribution[] = [];
  let value = effectiveNumericValue({
    onContribution: (entry) => contributions.push(entry),
    attribute: "might",
    baseValue: definitionForInstance(id, index).card.attributes.might ?? 0,
    controllerPlayerId: index.instances.get(id)?.ownerPlayerId,
    game,
    index,
    targetCardInstanceId: id,
    targetScope: "source",
  });
  const combatRole = game.state.cardStates[id]?.combatRole;
  if (combatRole === "attacker") {
    const entries = keywordContributions(game, id, "keyword.assault", index);
    value += entries.reduce((sum, entry) => sum + entry.amount, 0);
    contributions.push(...entries);
  }
  if (combatRole === "defender") {
    const entries = keywordContributions(game, id, "keyword.shield", index);
    value += entries.reduce((sum, entry) => sum + entry.amount, 0);
    contributions.push(...entries);
  }
  value += attachedCardIds(game, id).reduce(
    (total, attachedCardInstanceId) => {
      const amount = definitionForInstance(attachedCardInstanceId, index).card.attributes.might ?? 0;
      contributions.push({ id: `equipment:${attachedCardInstanceId}`, sourceCardInstanceId: attachedCardInstanceId, amount, duration: "whileAttached", label: "Equipment" });
      return total + amount;
    },
    0,
  );
  return { value: Math.max(0, value), contributions };
}

export function effectivePowerCost(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
  cardInstanceId?: string,
  onContribution?: (contribution: NumericContribution) => void,
  basePower?: number,
): number {
  return effectiveNumericValue({
    onContribution,
    attribute: "powerCost",
    baseValue: basePower ?? definition.card.attributes.power ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetCardInstanceId: cardInstanceId,
    targetScope: "controller_spell",
  });
}

export function keywordAmount(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
) {
  return effectiveKeywordAmount(game, cardInstanceId, behaviorId, index);
}

function keywordContributions(game: GameDocument, cardInstanceId: string, behaviorId: string, index: RuntimeCardIndex): NumericContribution[] {
  const keyword = evaluateEffectiveKeywords(game, cardInstanceId, index).find((entry) => entry.behaviorId === behaviorId);
  return (keyword?.contributions ?? []).map((entry) => ({
    id: entry.id,
    sourceCardInstanceId: entry.sourceCardInstanceId,
    amount: entry.amount ?? 0,
    duration: behaviorId === "keyword.assault" ? "whileAttacking" : "whileDefending",
    label: behaviorId === "keyword.assault" ? "Assault" : "Shield",
  }));
}
export function cleanupLethalDamage(game: GameDocument, ids: string[], index: RuntimeCardIndex) {
  for (const id of ids) {
    const state = game.state.cardStates[id];
    const might =
      state?.computedMight ??
      definitionForInstance(id, index).card.attributes.might ??
      Infinity;
    const unchangedSuppressedDeath =
      state?.lethalSuppressedDamage === state?.damage &&
      state?.lethalSuppressedMight === might;
    if (state && !unchangedSuppressedDeath && state.damage > 0 && state.damage >= might) {
      moveUnitToTrash(game, id, index);
      if (game.state.pendingChoice) return true;
    }
  }
  return false;
}
export function moveUnitToTrash(game: GameDocument, id: string, index: RuntimeCardIndex) {
  if (resolveDeathReplacement(game, id, index)) {
    return;
  }
  queueDeathTriggeredEffects(game, id, index);
  const owner = index.instances.get(id)?.ownerPlayerId;
  if (!owner) throw new Error(`Unit owner is unavailable: ${id}`);
  if (isTokenInstance(id, index)) {
    ceaseToken(game, id);
    return;
  }
  const zones = game.state.players[owner]!.zones;
  for (const zone of [
    "mainDeck",
    "runeDeck",
    "hand",
    "trash",
    "banishment",
    "base"
  ] as const) {
    zones[zone] = zones[zone].filter((item) => item !== id);
  }
  if (zones.legend === id) zones.legend = null;
  if (zones.champion === id) zones.champion = null;
  game.state.battlefields.forEach((battlefield) => {
    battlefield.units = battlefield.units.filter((item) => item !== id);
  });
  zones.trash.push(id);
  resetStateAfterLeavingBoard(game, id, index);
}

export function moveCardToTrash(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  const definition = definitionForInstance(id, index);
  if (definition.card.classification.type === "Unit") {
    moveUnitToTrash(game, id, index);
    return;
  }
  queueDeathTriggeredEffects(game, id, index);
  const owner = index.instances.get(id)?.ownerPlayerId;
  if (!owner) throw new Error(`Card owner is unavailable: ${id}`);
  if (isTokenInstance(id, index)) {
    ceaseToken(game, id);
    return;
  }
  detachCard(game, id);
  removeFromAllLocations(game, id);
  const trash = game.state.players[owner]!.zones.trash;
  if (!trash.includes(id)) trash.push(id);
  resetStateAfterLeavingBoard(game, id, index);
}

export function isTemporaryCard(
  id: string,
  index: RuntimeCardIndex,
  game: GameDocument,
) {
  return hasEffectiveKeyword(game, id, "keyword.temporary", index);
}

function queueDeathTriggeredEffects(
  game: GameDocument,
  sourceCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  const instance = index.instances.get(sourceCardInstanceId);
  if (!instance) return;
  const definition = definitionForInstance(sourceCardInstanceId, index);
  const runtime = behaviorModelForRuntimeCard(game, sourceCardInstanceId, index);
  const handlers = createPrimitiveHandlers(index);
  const delayedSources = game.state.ongoingEffects
    .filter((effect) => effect.behaviorId === "action.play_token_on_next_death" &&
      effect.targetCardInstanceIds.includes(sourceCardInstanceId))
    .map((effect) => ({
      sourceCardInstanceId: effect.sourceCardInstanceId,
      label: definitionForInstance(effect.sourceCardInstanceId, index).card.name,
      model: compileBehaviorModel(definitionForInstance(effect.sourceCardInstanceId, index).behaviorModel, handlers),
    }));
  const items = collectTriggeredClauses({
    game,
    controllerPlayerId: instance.ownerPlayerId,
    sources: [{
      sourceCardInstanceId,
      label: definition.card.name,
      model: compileBehaviorModel(runtime.model, handlers),
      grantedClauses: runtime.grantedClauses,
    }, ...delayedSources],
    event: {
      type: "card.died",
      actorPlayerId: null,
      subjectCardInstanceId: sourceCardInstanceId,
      values: {},
    },
    handlers,
  });
  if (delayedSources.length) {
    game.state.ongoingEffects = game.state.ongoingEffects.filter((effect) =>
      !(effect.behaviorId === "action.play_token_on_next_death" &&
        effect.targetCardInstanceIds.includes(sourceCardInstanceId)),
    );
  }
  if (items.length === 0) return;
  if (items.length > 1) {
    const choice = {
      id: `choice:${game.stateVersion}:${instance.ownerPlayerId}:death-triggers`,
      playerId: instance.ownerPlayerId,
      type: "orderTriggers" as const,
      optionIds: items.map((item) => item.id),
      pendingItems: items,
    };
    if (game.state.pendingChoice) game.state.queuedTriggerChoices.push(choice);
    else game.state.pendingChoice = choice;
    return;
  }
  const chain = game.state.chain ?? {
    items: [],
    relevantPlayerIds:
      game.state.showdown?.relevantPlayerIds ??
      [...game.state.setup.playerIds],
    priorityPlayerId: instance.ownerPlayerId,
    passedPlayerIds: [],
    openedBy: "triggeredAbility" as const,
  };
  chain.items.push(items[0]!);
  chain.priorityPlayerId = instance.ownerPlayerId;
  chain.passedPlayerIds = [];
  game.state.chain = chain;
}

type DeathReplacementCandidate = {
  id: string;
  sourceCardInstanceId: string;
  kind: "attachedEffect" | "ongoing";
};

export function submitDeathReplacementOrder(
  game: GameDocument,
  actorPlayerId: string,
  orderedIds: string[],
  index: RuntimeCardIndex,
) {
  const pendingChoice = game.state.pendingChoice;
  if (pendingChoice?.type !== "orderReplacements") {
    throw new Error("No replacement ordering decision is pending.");
  }
  if (pendingChoice.playerId !== actorPlayerId) {
    throw new Error("Only the affected unit's controller may order replacements.");
  }
  const expectedIds = pendingChoice.options.map((option) => option.id);
  if (
    orderedIds.length !== expectedIds.length ||
    new Set(orderedIds).size !== expectedIds.length ||
    orderedIds.some((id) => !expectedIds.includes(id))
  ) {
    throw new Error("Replacement order must include each applicable replacement exactly once.");
  }
  const candidates = deathReplacementCandidates(
    game,
    pendingChoice.affectedCardInstanceId,
    index,
  );
  const candidate = candidates.find((item) => item.id === orderedIds[0]);
  if (!candidate) {
    throw new Error("The selected replacement is no longer applicable.");
  }
  game.state.pendingChoice = null;
  applyDeathReplacement(game, pendingChoice.affectedCardInstanceId, candidate, index);
}

function resolveDeathReplacement(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  const candidates = deathReplacementCandidates(game, id, index);
  if (candidates.length === 0) return false;
  const ownerPlayerId = index.instances.get(id)?.ownerPlayerId;
  if (!ownerPlayerId) throw new Error(`Unit owner is unavailable: ${id}`);
  if (candidates.length === 1) {
    applyDeathReplacement(game, id, candidates[0]!, index);
    return true;
  }
  game.state.pendingChoice = {
    id: `replacement-order:${game.stateVersion}:${id}`,
    playerId: ownerPlayerId,
    type: "orderReplacements",
    affectedCardInstanceId: id,
    options: candidates,
  };
  return true;
}

function deathReplacementCandidates(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
): DeathReplacementCandidate[] {
  const ongoing = game.state.ongoingEffects.flatMap((effect) =>
    effect.behaviorId === "replacement.recall_on_next_death" &&
    effect.targetCardInstanceIds.includes(id)
      ? [{
          id: `ongoing:${effect.id}`,
          sourceCardInstanceId: effect.sourceCardInstanceId,
          kind: "ongoing" as const,
        }]
      : [],
  );
  const attachedEffects = attachedCardIds(game, id).flatMap(
    (sourceCardInstanceId) => {
      const definition = definitionForInstance(sourceCardInstanceId, index);
      if (!definition.effectText || !definition.effectBehaviorModel) return [];
      return definition.effectBehaviorModel.clauses.flatMap((clause) =>
        clause.effects.flatMap((binding) =>
          binding.behaviorId === "replacement.recall_on_next_death" &&
          binding.parameters.target === "attachedTopMost" &&
          binding.parameters.duration === "whileAttached" &&
          binding.parameters.consumeSource === "kill"
            ? [{
                id: `attached:${sourceCardInstanceId}:${clause.id}:${binding.order}`,
                sourceCardInstanceId,
                kind: "attachedEffect" as const,
              }]
            : [],
        ),
      );
    },
  );
  return [...ongoing, ...attachedEffects];
}

function applyDeathReplacement(
  game: GameDocument,
  id: string,
  candidate: DeathReplacementCandidate,
  index: RuntimeCardIndex,
) {
  if (candidate.kind === "ongoing") {
    game.state.ongoingEffects = game.state.ongoingEffects.filter(
      (effect) => `ongoing:${effect.id}` !== candidate.id,
    );
  } else {
    moveCardToTrash(game, candidate.sourceCardInstanceId, index);
  }
  recallUnitAfterDeathReplacement(game, id, index);
}

function recallUnitAfterDeathReplacement(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  const owner = index.instances.get(id)?.ownerPlayerId;
  if (!owner) throw new Error(`Unit owner is unavailable: ${id}`);
  removeFromAllLocations(game, id);
  game.state.players[owner]!.zones.base.push(id);
  resetStateAfterLeavingBoard(game, id, index, false);
  const state = game.state.cardStates[id]!;
  state.exhausted = true;
  recomputeMight(game, id, index);
}

function isTokenInstance(id: string, index: RuntimeCardIndex) {
  const instance = index.instances.get(id);
  const definition = instance && index.definitions.get(instance.cardCode);
  return (
    instance?.source === "token" ||
    definition?.card.classification.supertype === "Token"
  );
}

function ceaseToken(game: GameDocument, id: string) {
  removeFromAllLocations(game, id);
  detachCardsFromTopMostLeavingBoard(game, id);
  delete game.state.cardStates[id];
  game.state.keywordGrants = (game.state.keywordGrants ?? []).filter((grant) => grant.targetCardInstanceId !== id);
  game.state.grantedBehaviorGrants = (game.state.grantedBehaviorGrants ?? []).filter((grant) => grant.targetCardInstanceId !== id);
  game.state.runtimeKeywordActivations = (game.state.runtimeKeywordActivations ?? []).filter((activation) => activation.targetCardInstanceId !== id);
  game.state.modifiers = game.state.modifiers.filter(
    (modifier) =>
      modifier.sourceCardInstanceId !== id &&
      modifier.targetCardInstanceId !== id,
  );
  game.state.ongoingEffects = game.state.ongoingEffects.filter(
    (effect) =>
      effect.sourceCardInstanceId !== id &&
      !effect.targetCardInstanceIds.includes(id),
  );
}

function removeFromAllLocations(game: GameDocument, id: string) {
  for (const player of Object.values(game.state.players)) {
    for (const zone of [
      "mainDeck",
      "runeDeck",
      "hand",
      "trash",
      "banishment",
      "base",
    ] as const) {
      player.zones[zone] = player.zones[zone].filter(
        (candidate) => candidate !== id,
      );
    }
    if (player.zones.legend === id) player.zones.legend = null;
    if (player.zones.champion === id) player.zones.champion = null;
  }
  for (const battlefield of game.state.battlefields) {
    battlefield.units = battlefield.units.filter(
      (candidate) => candidate !== id,
    );
  }
  removeFromAttachmentLocations(game, id);
}

function validateDamageTargetLocations(
  binding: BehaviorBinding,
  game: GameDocument,
  ids: readonly string[],
) {
  if (binding.parameters.atMostOnePerLocation !== true &&
    binding.parameters.selectedMustShareLocation !== true) return;
  const locations = ids.map((id) => boardLocationForUnit(game, id));
  if (locations.some((location) => location === null)) {
    throw new Error("Damage targets must be at a location.");
  }
  const keys = locations.map((location) => `${location!.kind}:${location!.id}`);
  if (binding.parameters.atMostOnePerLocation === true && new Set(keys).size !== keys.length) {
    throw new Error("Only one damage target may be chosen at each location.");
  }
  if (binding.parameters.selectedMustShareLocation === true && new Set(keys).size > 1) {
    throw new Error("Damage targets must share one location.");
  }
}

export function damageIsLethalAgainstEnemyUnit(
  game: GameDocument,
  controllerPlayerId: string,
  targetId: string,
  index: RuntimeCardIndex,
) {
  if (index.instances.get(targetId)?.ownerPlayerId === controllerPlayerId) return false;
  const controlledBoardCards = [
    ...game.state.players[controllerPlayerId]!.zones.base,
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units),
  ];
  return controlledBoardCards.some((id) =>
    index.instances.get(id)?.ownerPlayerId === controllerPlayerId &&
    definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
      clause.keywords.some((keyword) => keyword.behaviorId === "keyword.lethal_damage"),
    ),
  );
}

function selectorOptionMatches(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const key = binding.parameters.onlyIfSelectionKey;
  if (typeof key !== "string") return true;
  const expected = binding.parameters.onlyIfSelectionValue;
  return context.selectionOverrides[key]?.includes(
    typeof expected === "string" ? expected : "yes",
  ) ?? false;
}

function noSelectionRequirement(binding: BehaviorBinding) {
  return {
    kind: "card" as const,
    ...(typeof binding.parameters.selectionKey === "string"
      ? { selectionKey: binding.parameters.selectionKey }
      : {}),
    legalIds: [],
    minimum: 0,
    maximum: 0,
  };
}

function effectOutcomeMatches(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const effectKey = binding.parameters.onlyIfEffectKey;
  if (typeof effectKey !== "string") return true;
  const expected = binding.parameters.onlyIfEffectValue;
  return context.effectOutcomes[effectKey] ===
    (typeof expected === "boolean" ? expected : true);
}

function playersStartingWithNext(game: GameDocument, playerId: string) {
  const playerIds = [...game.state.setup.playerIds];
  const index = playerIds.indexOf(playerId);
  return index < 0
    ? playerIds
    : [...playerIds.slice(index + 1), ...playerIds.slice(0, index + 1)];
}

export function recycleCards(
  game: GameDocument,
  index: RuntimeCardIndex,
  sourceCardInstanceId: string,
  cards: readonly string[],
) {
  const byOwnerAndDestination = new Map<string, string[]>();
  for (const cardInstanceId of cards) {
    const owner = index.instances.get(cardInstanceId)?.ownerPlayerId;
    if (!owner) continue;
    if (isTokenInstance(cardInstanceId, index)) {
      ceaseToken(game, cardInstanceId);
      continue;
    }
    const definition = definitionForInstance(cardInstanceId, index);
    const destination = definition.card.classification.type === "Rune"
      ? "runeDeck"
      : "mainDeck";
    removeFromAllLocations(game, cardInstanceId);
    resetStateAfterLeavingBoard(game, cardInstanceId, index);
    const key = `${owner}:${destination}`;
    byOwnerAndDestination.set(key, [
      ...(byOwnerAndDestination.get(key) ?? []),
      cardInstanceId,
    ]);
  }
  for (const [key, ids] of byOwnerAndDestination) {
    const [owner, destination] = key.split(":") as [string, "mainDeck" | "runeDeck"];
    const ordered = destination === "mainDeck" && ids.length > 1
      ? deterministicRecycleOrder(game.id, sourceCardInstanceId, ids)
      : ids;
    game.state.players[owner]!.zones[destination].push(...ordered);
  }
  recomputeAllMight(game, index);
}

function deterministicRecycleOrder(
  gameId: string,
  sourceCardInstanceId: string,
  ids: readonly string[],
): string[] {
  return ids
    .map((id) => ({
      id,
      rank: createHash("sha256")
        .update(`${gameId}:${sourceCardInstanceId}:${id}`)
        .digest("hex"),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .map(({ id }) => id);
}
function resetStateAfterLeavingBoard(
  game: GameDocument,
  id: string,
  index?: RuntimeCardIndex,
  createsNewGameObject = true,
) {
  const state = game.state.cardStates[id];
  if (!state) return;
  incrementObjectVersion(game, id);
  if (createsNewGameObject) advanceGameObjectIncarnation(game, id);
  state.damage = 0;
  state.exhausted = false;
  state.empowered = false;
  state.combatRole = null;
  state.lethalSuppressedDamage = null;
  state.lethalSuppressedMight = null;
  state.attachedToCardInstanceId = null;
  state.attachedAtTurnNumber = null;
  detachCardsFromTopMostLeavingBoard(game, id);
  if (
    index &&
    definitionForInstance(id, index).card.classification.type === "Unit"
  ) {
    recomputeMight(game, id, index);
  }
}

function isOnlyFriendlyUnitAtLocation(
  game: GameDocument,
  targetId: string,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const battlefield = game.state.battlefields.find((item) =>
    item.units.includes(targetId),
  );
  const ids = battlefield
    ? battlefield.units
    : game.state.players[playerId]!.zones.base;
  return ids.filter(
    (id) =>
      index.instances.get(id)?.ownerPlayerId === playerId &&
      definitionForInstance(id, index).card.classification.type === "Unit",
  ).length === 1;
}

function unitLocationRelationMatches(
  game: GameDocument,
  targetId: string,
  sourceId: string,
  relation: unknown,
  hiddenBattlefieldId: string | null = null,
) {
  if (
    relation !== "sourceLocation" &&
    relation !== "sharedLocation" &&
    relation !== "differentSourceLocation"
  ) {
    return true;
  }
  const sourceLocation = hiddenBattlefieldId
    ? { kind: "battlefield" as const, id: hiddenBattlefieldId }
    : boardLocationForUnit(game, sourceId);
  const targetLocation = boardLocationForUnit(game, targetId);
  if (sourceLocation === null || targetLocation === null) return false;
  const sameLocation =
    sourceLocation.kind === targetLocation.kind &&
    sourceLocation.id === targetLocation.id;
  return relation === "differentSourceLocation" ? !sameLocation : sameLocation;
}

function boardLocationForUnit(game: GameDocument, unitId: string) {
  for (const battlefield of game.state.battlefields) {
    if (battlefield.units.includes(unitId)) {
      return { kind: "battlefield" as const, id: battlefield.battlefieldId };
    }
  }
  for (const playerId of game.state.setup.playerIds) {
    if (game.state.players[playerId]?.zones.base.includes(unitId)) {
      return { kind: "base" as const, id: playerId };
    }
  }
  return null;
}

function normalizedDomain(domain: string) {
  return domain.slice(0, 1).toUpperCase() + domain.slice(1).toLowerCase();
}

function deterministicallyRecycle(ids: string[], seed: string) {
  return [...ids].sort((left, right) =>
    createHash("sha256").update(`${seed}:${left}`).digest("hex")
      .localeCompare(createHash("sha256").update(`${seed}:${right}`).digest("hex")),
  );
}

function unitIsInCombatWithEnemyDomain(
  game: GameDocument,
  unitId: string,
  domain: string,
  index: RuntimeCardIndex,
) {
  const battlefieldId = game.state.combat?.battlefieldId;
  const battlefield = battlefieldId
    ? game.state.battlefields.find((candidate) => candidate.battlefieldId === battlefieldId)
    : null;
  const owner = index.instances.get(unitId)?.ownerPlayerId;
  return Boolean(
    battlefield?.units.includes(unitId) &&
      battlefield.units.some(
        (candidate) =>
          index.instances.get(candidate)?.ownerPlayerId !== owner &&
          definitionForInstance(candidate, index).card.classification.domain.includes(domain),
      ),
  );
}

function unitIsChosenByEnemySpellDomain(
  game: GameDocument,
  unitId: string,
  domain: string,
  index: RuntimeCardIndex,
) {
  const targetControllerPlayerId = index.instances.get(unitId)?.ownerPlayerId;
  if (!targetControllerPlayerId) return false;
  return (game.state.chain?.items ?? []).some((item) =>
    item.kind === "spell" &&
    item.controllerPlayerId !== targetControllerPlayerId &&
    item.targetCardInstanceIds.includes(unitId) &&
    item.sourceCardInstanceId !== null &&
    definitionForInstance(item.sourceCardInstanceId, index).card.classification.domain.includes(domain),
  );
}

function numberParam(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "number") throw new Error(`Behavior parameter ${key} must be numeric.`);
  return value;
}

function attachEquipmentToSelectedUnit(
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const targetId = context.selectedIds[0];
  if (!targetId) throw new Error("Equip requires a unit target.");
  const source = definitionForInstance(context.sourceCardInstanceId, index);
  if (
    source.card.classification.type !== "Gear" ||
    !source.card.tags.includes("Equipment")
  ) {
    throw new Error("Only Equipment can be attached with Equip.");
  }
  const target = definitionForInstance(targetId, index);
  if (
    target.card.classification.type !== "Unit" ||
    index.instances.get(targetId)?.ownerPlayerId !== context.controllerPlayerId
  ) {
    throw new Error("Equipment must be attached to a unit you control.");
  }
  attachCardToTopMost(
    context.game,
    context.sourceCardInstanceId,
    targetId,
    index,
  );
  recomputeMight(context.game, targetId, index);
}

function resourceDomainForBinding(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const domain = stringParam(binding, "domain");
  if (domain === "sourceDomain") {
    return (
      definitionForInstance(context.sourceCardInstanceId, index).card.classification
        .domain.find((candidate) => candidate !== "Colorless") ?? "Rainbow"
    );
  }
  return domain.slice(0, 1).toUpperCase() + domain.slice(1);
}

function addPublicReveal(
  context: BehaviorExecutionContext,
  cardInstanceIds: string[],
  prefix: string,
  index: RuntimeCardIndex,
  handOwnerPlayerId?: string,
) {
  if (cardInstanceIds.length === 0) return;
  const cardNames = cardInstanceIds.map(
    (id) => definitionForInstance(id, index).card.name,
  );
  (context.game.state.publicReveals ??= []).push({
    id: `reveal:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.publicReveals?.length ?? 0}`,
    message: `${prefix}: ${cardNames.join(", ")}.`,
    cardInstanceIds,
    ...(handOwnerPlayerId ? { handReveal: {
      playerId: handOwnerPlayerId,
      sourceName: definitionForInstance(context.sourceCardInstanceId, index).card.name,
      cardNames,
    } } : {}),
  });
}

function stringParam(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string") throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}
export function draw(
  game: GameDocument,
  source: string[],
  destination: string[],
  count: number,
) {
  const drawn = source.splice(0, Math.min(count, source.length));
  destination.push(...drawn);
  drawn.forEach((id) => advanceGameObjectIncarnation(game, id));
}

function ensureMainDeck(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  if (player.zones.mainDeck.length > 0) return;
  player.zones.mainDeck = [...player.zones.trash].sort((left, right) =>
    createHash("sha256")
      .update(`${game.id}:${game.stateVersion}:${left}`)
      .digest("hex")
      .localeCompare(
        createHash("sha256")
          .update(`${game.id}:${game.stateVersion}:${right}`)
          .digest("hex"),
      ),
  );
  player.zones.trash = [];
  player.zones.mainDeck.forEach((id) => advanceGameObjectIncarnation(game, id));
  const opponentId = game.state.setup.playerIds.find((id) => id !== playerId)!;
  const opponent = game.state.players[opponentId]!;
  opponent.points = (opponent.points ?? 0) + 1;
  const requirement = effectiveNumericValue({
    attribute: "victoryRequirement",
    baseValue: 8,
    game,
    index,
    targetScope: "game",
  });
  if ((opponent.points ?? 0) >= requirement) {
    game.winnerPlayerId = opponentId;
    game.status = "complete";
  }
}
