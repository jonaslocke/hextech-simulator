import {
  allocateSelections,
  compileBehaviorModel,
  createBehaviorContext,
  targetRequirementsForClause,
} from "./behavior-runtime";
import type {
  BehaviorExecutionContext,
  BehaviorHandler,
  BehaviorHandlerRegistry,
} from "./behavior-runtime";
import type { DeckSnapshotDocument } from "./repositories";
import type { BehaviorBinding, GameCardDefinition } from "./schemas";
import type { CardInstance, ChainItem, GameDocument } from "./state";
import { createHash } from "node:crypto";
import {
  effectiveNumericValue,
  isContinuousDuration,
} from "./numeric-modifiers";
import { keywordAmount } from "./keyword-evaluation";
import { numericConditionMatches } from "./numeric-condition";
import { conditionMatches } from "./condition-evaluation";
import { getTokenCatalogDefinitions } from "./token-catalog";
import { isLegalUnitDestination, isUnitPlayRestrictedToBase, legalUnitDestinationIds } from "./unit-destinations";
import { buildPaymentPlan, payAnyPower, payCardCost } from "./payment";
import { markBattlefieldContested } from "./board-rules";

export { hasKeyword, keywordAmount } from "./keyword-evaluation";

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
      ...getTokenCatalogDefinitions().map(
        (item) => [item.cardCode, item] as const,
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
    "keyword.ganking", "keyword.hidden", "keyword.accelerate", "keyword.legion",
    "modifier.legion_energy_discount", "cost.pay", "cost.exhaust_source",
    "cost.exhaust_selected_unit", "cost.spend_buff", "cost.spend_source_buff",
    "keyword.temporary", "modifier.cannot_move_from_source_battlefield",
    "modifier.facedown_capacity", "modifier.unit_play_restriction",
    "modifier.cannot_ready", "prevention.prevent",
    "modifier.active_in_zone",
    "cost.discard_cards",
  ]) handlers.set(id, passive);
  // These modifiers are read continuously by their owning legality or
  // prevention subsystem. A permanent entering play may still route its
  // triggerless clauses through immediate resolution, where the modifier has
  // no state mutation to perform.
  for (const id of [
    "modifier.cannot_move_from_source_battlefield",
    "modifier.facedown_capacity",
    "modifier.unit_play_restriction",
    "modifier.cannot_ready",
    "prevention.prevent",
    "modifier.active_in_zone",
  ]) handlers.set(id, { execute() {} });
  // Legion's Energy modifier is consumed by effectiveEnergyCost before the
  // card enters play. It has no separate state mutation when the clause is
  // resolved as part of playing that card.
  handlers.set("modifier.legion_energy_discount", { execute() {} });
  handlers.set("choice.optional", {
    choice(binding) {
      return { kind: "binary", legalIds: ["accept", "decline"], minimum: 1, maximum: 1,
        prompt: typeof binding.parameters.prompt === "string" ? binding.parameters.prompt : "Use this optional effect?",
        acceptLabel: "Accept", declineLabel: "Decline" };
    },
  });
  handlers.set("choice.choose_mode", {
    choice(binding) {
      const optionIds = pipeSeparatedParameter(binding, "optionIds");
      const optionLabels = pipeSeparatedParameter(binding, "optionLabels");
      if (optionIds.length === 0 || optionIds.length !== optionLabels.length) {
        throw new Error("Mode choices require matching option ids and labels.");
      }
      return {
        kind: "mode",
        legalIds: optionIds,
        minimum: 1,
        maximum: 1,
        prompt:
          typeof binding.parameters.prompt === "string"
            ? binding.parameters.prompt
            : "Choose one mode",
        options: optionIds.map((id, index) => ({
          id,
          label: optionLabels[index]!,
        })),
      };
    },
  });
  handlers.set("ability.activate", { execute() {} });
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
      if (
        (binding.parameters.subject === "unit" || binding.parameters.subject === "gear") &&
        context.event.subjectCardInstanceId
      ) {
        const type = definitionForInstance(context.event.subjectCardInstanceId, index)
          .card.classification.type.toLowerCase();
        return type === binding.parameters.subject;
      }
      return false;
    }
  });
  handlers.set("trigger.conquer_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.conquered" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
  handlers.set("trigger.conquer_source", {
    matches: (_binding, context) => {
      if (
        context.event?.type !== "battlefield.conquered" ||
        context.event.actorPlayerId !== context.controllerPlayerId ||
        !context.event.subjectCardInstanceId
      ) {
        return false;
      }
      return context.game.state.battlefields.some(
        (battlefield) =>
          battlefield.cardInstanceId === context.event?.subjectCardInstanceId &&
          battlefield.units.includes(context.sourceCardInstanceId),
      );
    },
  });
  handlers.set("trigger.second_card_played", {
    matches: (_binding, context) =>
      context.event?.type === "card.played" &&
      context.event.actorPlayerId === context.controllerPlayerId &&
      (context.game.state.players[context.controllerPlayerId]
        ?.playedCardIdsThisTurn?.length ?? 0) === 2,
  });
  handlers.set("trigger.conquer", {
    matches: (_binding, context) =>
      context.event?.type === "battlefield.conquered" &&
      context.event.actorPlayerId === context.controllerPlayerId,
  });
  handlers.set("trigger.hold_battlefield", {
    matches: (_binding, context) => {
      if (context.event?.type !== "battlefield.held") return false;
      if (context.event.subjectCardInstanceId === context.sourceCardInstanceId) {
        return true;
      }
      const heldBattlefield = context.game.state.battlefields.find(
        (battlefield) =>
          battlefield.cardInstanceId === context.event?.subjectCardInstanceId,
      );
      return Boolean(
        heldBattlefield?.units.includes(context.sourceCardInstanceId) &&
        context.event.actorPlayerId === context.controllerPlayerId,
      );
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
  handlers.set("trigger.beginning", {
    matches: (binding, context) => context.event?.type === "turn.beginning" &&
      (binding.parameters.player !== "controller" || context.event.actorPlayerId === context.controllerPlayerId),
  });
  handlers.set("trigger.first_beginning", {
    matches: (_binding, context) =>
      context.event?.type === "turn.beginning" &&
      context.event.values.isFirstBeginningPhase === true,
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
  handlers.set("trigger.defend_at_source_battlefield", {
    matches: (_binding, context) =>
      context.event?.type === "unit.defends" &&
      context.game.state.battlefields.some(
        (battlefield) =>
          battlefield.cardInstanceId === context.sourceCardInstanceId &&
          battlefield.battlefieldId === context.event!.values.battlefieldId,
      ),
  });
  handlers.set("trigger.on_death", {
    matches: (binding, context) => {
      if (context.event?.type !== "unit.died" || !context.event.subjectCardInstanceId)
        return false;
      const deadId = context.event.subjectCardInstanceId;
      const deadOwner = index.instances.get(deadId)?.ownerPlayerId;
      const subject = binding.parameters.subject;
      if (subject === "source" || subject === "event_subject")
        return deadId === context.sourceCardInstanceId;
      if (subject === "friendly_unit") return deadOwner === context.controllerPlayerId;
      if (subject === "another_friendly_unit")
        return deadOwner === context.controllerPlayerId && deadId !== context.sourceCardInstanceId;
      return subject === "enemy_unit" && deadOwner !== context.controllerPlayerId;
    },
  });
  handlers.set("trigger.on_damage", {
    matches(binding, context) {
      if (
        context.event?.type !== "unit.damaged" ||
        !context.event.subjectCardInstanceId
      ) {
        return false;
      }
      const subject = binding.parameters.subject;
      if (subject === "any_unit") return true;
      if (subject === "source") {
        return context.event.subjectCardInstanceId === context.sourceCardInstanceId;
      }
      const owner = index.instances.get(
        context.event.subjectCardInstanceId,
      )?.ownerPlayerId;
      return subject === "friendly_unit"
        ? owner === context.controllerPlayerId
        : subject === "enemy_unit" && owner !== context.controllerPlayerId;
    },
  });
  handlers.set("trigger.on_kill", {
    matches(binding, context) {
      if (
        context.event?.type !== "unit.killed" ||
        context.event.actorPlayerId !== context.controllerPlayerId
      ) {
        return false;
      }
      if (
        binding.parameters.method !== "spell" ||
        context.event.values.method === "spell"
      ) {
        if (binding.parameters.subject !== "stunned_enemy_unit") return true;
        const subjectId = context.event.subjectCardInstanceId;
        return Boolean(
          subjectId &&
          context.event.values.wasStunned === true &&
          index.instances.get(subjectId)?.ownerPlayerId !== context.controllerPlayerId,
        );
      }
      return false;
    },
  });
  handlers.set("trigger.look_or_reveal_source", {
    matches: (_binding, context) =>
      (context.event?.type === "card.lookedAt" ||
        context.event?.type === "card.revealed") &&
      context.event.subjectCardInstanceId === context.sourceCardInstanceId,
  });
  handlers.set("trigger.event", {
    matches(binding, context) {
      const event = context.event;
      const subjectCardInstanceId = event?.subjectCardInstanceId;
      if (
        !event ||
        event.type !== binding.parameters.eventType ||
        !subjectCardInstanceId
      ) {
        return false;
      }
      const subject = binding.parameters.subject;
      if (subject === "source") {
        return subjectCardInstanceId === context.sourceCardInstanceId;
      }
      const ownerPlayerId = index.instances.get(subjectCardInstanceId)?.ownerPlayerId;
      const isUnit =
        index.definitions.get(index.instances.get(subjectCardInstanceId)?.cardCode ?? "")
          ?.card.classification.type === "Unit";
      if (subject === "any_unit") return isUnit;
      if (subject === "friendly_unit") {
        return isUnit && ownerPlayerId === context.controllerPlayerId &&
          (binding.parameters.excludesSource !== true ||
            subjectCardInstanceId !== context.sourceCardInstanceId);
      }
      if (subject === "enemy_unit") {
        return isUnit && ownerPlayerId !== context.controllerPlayerId;
      }
      if (subject === "friendly_card") {
        return ownerPlayerId === context.controllerPlayerId;
      }
      return subject === "enemy_card" && ownerPlayerId !== context.controllerPlayerId;
    },
  });
  handlers.set("trigger.on_choose", {
    matches(binding, context) {
      const event = context.event;
      const subjectId = event?.subjectCardInstanceId;
      const actorPlayerId = event?.actorPlayerId;
      if (!event || event.type !== "card.chosen" || !subjectId || !actorPlayerId) {
        return false;
      }
      if (
        binding.parameters.actor === "controller" &&
        actorPlayerId !== context.controllerPlayerId
      ) return false;
      if (
        binding.parameters.actor === "opponent" &&
        actorPlayerId === context.controllerPlayerId
      ) return false;
      const isFriendlyUnit =
        definitionForInstance(subjectId, index).card.classification.type === "Unit" &&
        index.instances.get(subjectId)?.ownerPlayerId === actorPlayerId;
      if (!isFriendlyUnit) return false;
      if (binding.parameters.subject === "friendly_unit_at_source_battlefield") {
        const sourceBattlefieldId = battlefieldForCard(
          context.game,
          context.sourceCardInstanceId,
        )?.battlefieldId;
        if (
          !sourceBattlefieldId ||
          event.values.targetBattlefieldId !== sourceBattlefieldId
        ) return false;
      }
      if (binding.parameters.firstPerSourcePerTurn === true) {
        const state = context.game.state.players[actorPlayerId];
        if (!state) return false;
        const key = `${context.sourceCardInstanceId}:${context.game.state.cardStates[context.sourceCardInstanceId]?.objectVersion ?? 0}:card.chosen`;
        const memory = (state.triggerMemoryKeysThisTurn ??= []);
        if (memory.includes(key)) return false;
        memory.push(key);
      }
      return true;
    },
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
  handlers.set("condition.state", {
    matches(binding, context) {
      return conditionMatches(binding, {
        game: context.game,
        index,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        event: context.event,
      });
    },
  });
  handlers.set("condition.turn_event_count", {
    matches(binding, context) {
      return conditionMatches(binding, {
        game: context.game,
        index,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        event: context.event,
      });
    },
  });
  handlers.set("condition.event_value", {
    matches(binding, context) {
      const value = context.event?.values[binding.parameters.key as string];
      if (typeof binding.parameters.expectedBoolean === "boolean") {
        return value === binding.parameters.expectedBoolean;
      }
      if (
        typeof value !== "number" ||
        typeof binding.parameters.comparisonValue !== "number"
      ) {
        return false;
      }
      return compareNumber(
        value,
        binding.parameters.operator,
        binding.parameters.comparisonValue,
      );
    },
  });
  handlers.set("condition.event_subject_characteristic", {
    matches(binding, context) {
      const id = context.event?.subjectCardInstanceId;
      if (!id) return false;
      const definition = definitionForInstance(id, index);
      if (typeof binding.parameters.tag === "string") {
        return definition.card.tags.includes(binding.parameters.tag);
      }
      if (typeof binding.parameters.minimumMight === "number") {
        return (context.game.state.cardStates[id]?.computedMight ??
          definition.card.attributes.might ?? 0) >= binding.parameters.minimumMight;
      }
      return true;
    },
  });
  handlers.set("condition.event_origin_source_location", {
    matches(_binding, context) {
      const sourceBattlefieldId = context.game.state.battlefields.find(
        (battlefield) => battlefield.cardInstanceId === context.sourceCardInstanceId,
      )?.battlefieldId;
      return (
        sourceBattlefieldId !== undefined &&
        context.event?.values.originBattlefieldId === sourceBattlefieldId
      );
    },
  });
  handlers.set("condition.effect_killed_target", {
    matches: (_binding, context) =>
      context.effectOutcomes.lastDamageKilled === true,
  });
  handlers.set("condition.non_token", {
    matches: (_binding, context) => {
      const subjectId = context.event?.subjectCardInstanceId;
      return Boolean(subjectId && !isTokenInstance(subjectId, index));
    },
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

  handlers.set("selector.unit", {
    targets(binding, context) {
      return selectorTargets(
        binding,
        context.game,
        index,
        () => true,
        selectorReferenceSource(binding, context),
        context.selectedIds,
      );
    }
  });
  handlers.set("selector.friendly_unit", {
    targets(binding, context) {
      return selectorTargets(
        binding,
        context.game,
        index,
        (id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId,
        selectorReferenceSource(binding, context),
        context.selectedIds,
      );
    }
  });
  handlers.set("selector.friendly_card", {
    targets(binding, context) {
      const legalIds = [
        ...context.game.state.players[context.controllerPlayerId]!.zones.base,
        ...context.game.state.battlefields.flatMap((battlefield) =>
          battlefield.units.filter(
            (id) =>
              index.instances.get(id)?.ownerPlayerId ===
              context.controllerPlayerId,
          ),
        ),
      ].filter((id) =>
        definitionForInstance(id, index).card.classification.type !== "Battlefield",
      ).filter(
        (id) =>
          binding.parameters.exhaustedOnly !== true ||
          context.game.state.cardStates[id]?.exhausted === true,
      ).filter(
        (id) =>
          binding.parameters.excludesSource !== true ||
          id !== context.sourceCardInstanceId,
      );
      return {
        kind: "card" as const,
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        label: "friendly card",
        legalIds,
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("selector.enemy_unit", {
    targets(binding, context) {
      return selectorTargets(
        binding,
        context.game,
        index,
        (id) =>
          index.instances.get(id)?.ownerPlayerId !==
          context.controllerPlayerId,
        selectorReferenceSource(binding, context),
        context.selectedIds,
      );
    },
  });
  handlers.set("selector.card", {
    targets(binding, context) {
      // Older approved models predate the explicit owner parameter. Preserve
      // their controller-zone behavior while allowing public opponent zones.
      const owner = typeof binding.parameters.owner === "string"
        ? binding.parameters.owner
        : "controller";
      const ownerPlayerId = owner === "opponent"
        ? context.game.state.setup.playerIds.find(
            (id) => id !== context.controllerPlayerId,
          )
        : context.controllerPlayerId;
      if (!ownerPlayerId) {
        throw new Error("Card selector owner is unavailable.");
      }
      const player = context.game.state.players[ownerPlayerId]!;
      const zone = stringParam(binding, "zone");
      const zoneValue =
        player.zones[zone as keyof typeof player.zones];
      const ids = Array.isArray(zoneValue)
        ? zoneValue
        : zoneValue
          ? [zoneValue]
          : [];
      const cardType = stringParam(binding, "cardType");
      const requiredPaymentAvailable =
        typeof binding.parameters.requiredPaymentDomain !== "string" ||
        canPayEffectResource({
          ...binding,
          parameters: {
            resource: "power",
            domain: binding.parameters.requiredPaymentDomain,
            amount:
              typeof binding.parameters.requiredPaymentAmount === "number"
                ? binding.parameters.requiredPaymentAmount
                : 1,
          },
        }, context, index);
      const legalIds = (requiredPaymentAvailable ? ids : []).filter(
        (id) =>
          cardType === "any" ||
          (cardType === "nonUnit" &&
            definitionForInstance(id, index).card.classification.type !== "Unit") ||
          definitionForInstance(id, index).card.classification.type ===
            cardType,
      ).filter((id) => {
        const attributes = definitionForInstance(id, index).card.attributes;
        return (
          (typeof binding.parameters.maximumEnergy !== "number" ||
            (attributes.energy ?? 0) <= binding.parameters.maximumEnergy) &&
          (binding.parameters.maximumEnergyBelowControllerPoints !== true ||
            (attributes.energy ?? 0) <
              (context.game.state.players[context.controllerPlayerId]?.points ?? 0)) &&
          (typeof binding.parameters.maximumPower !== "number" ||
            (attributes.power ?? 0) <= binding.parameters.maximumPower)
        );
      }).filter((id) =>
        typeof binding.parameters.requiredBehaviorId !== "string" ||
        definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
          [...clause.keywords, ...clause.effects].some(
            (candidate) =>
              candidate.behaviorId === binding.parameters.requiredBehaviorId,
          ),
        ),
      ).filter((id) =>
        binding.parameters.requiresPayablePowerCost !== true ||
        buildPaymentPlan(
          context.game,
          context.controllerPlayerId,
          definitionForInstance(id, index),
          0,
          index,
        ) !== null,
      ).filter(
        (id) =>
          binding.parameters.chosenChampionOnly !== true ||
          index.instances.get(id)?.source === "champion",
      ).filter(
        () =>
          binding.parameters.requiresEmptyChampionZone !== true ||
          player.zones.champion === null,
      );
      const maximum = numberParam(binding, "maximumCount");
      const minimum = binding.parameters.requireMaximumAvailable === true
        ? Math.min(maximum, legalIds.length)
        : numberParam(binding, "minimumCount");
      const cardLabel = cardType === "any"
        ? "card"
        : cardType === "nonUnit"
          ? "non-unit card"
          : cardType.toLowerCase();
      const ownerLabel = owner === "opponent" ? "opponent's " : "";
      return {
        kind: "card" as const,
        label: `${cardLabel} from ${ownerLabel}${zone}`,
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        ...(owner === "opponent" && zone === "hand"
          ? { title: "Choose from opponent's Hand" }
          : {}),
        ...(binding.parameters.revealZone === true ? { revealZone: true } : {}),
        sourceZone:
          zone === "hand" || zone === "trash" || zone === "mainDeck"
            ? zone
            : undefined,
        legalIds,
        minimum,
        maximum,
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
  handlers.set("action.draw_cards", {
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const ids = binding.parameters.player === "eachPlayer"
        ? [...context.game.state.setup.playerIds]
        : binding.parameters.player === "currentTurnPlayer"
          ? context.event?.actorPlayerId ? [context.event.actorPlayerId] : []
          : binding.parameters.player === "selectedCardOwner"
            ? [...new Set(selectionFor(binding, context).map((id) => index.instances.get(id)?.ownerPlayerId).filter((id): id is string => Boolean(id)))]
            : [context.controllerPlayerId];
      for (const id of ids) {
        ensureMainDeck(context.game, id, index);
        draw(context.game.state.players[id]!.zones.mainDeck, context.game.state.players[id]!.zones.hand, count);
      }
    }
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
      draw(player.zones.mainDeck, player.zones.hand, count);
    },
  });
  handlers.set("action.channel_or_draw", {
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const count = numberParam(binding, "channelCount");
      const moved = player.zones.runeDeck.splice(0, count);
      player.zones.base.push(...moved);
      if (binding.parameters.entryState === "exhausted") {
        moved.forEach((id) => {
          context.game.state.cardStates[id]!.exhausted = true;
        });
      }
      if (moved.length === 0) {
        ensureMainDeck(context.game, context.controllerPlayerId, index);
        draw(
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
      if (typeof binding.parameters.selectionKey === "string") return null;
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
      const selectedFromSelector = selectionFor(binding, context);
      const selected = selectedFromSelector.length > 0
        ? selectedFromSelector
        : context.selectedIds.slice(
            0,
            Math.min(
              numberParam(binding, "count"),
              context.game.state.players[context.controllerPlayerId]!.zones.hand.length,
            ),
          );
      for (const id of selected) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        const hand = context.game.state.players[owner]!.zones.hand;
        if (!hand.includes(id)) continue;
        context.game.state.players[owner]!.zones.hand = hand.filter(
          (candidate) => candidate !== id,
        );
        context.game.state.players[owner]!.zones.trash.push(id);
        incrementObjectVersion(context.game, id);
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "card.discarded",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        });
      }
    },
  });
  handlers.set("action.channel_runes", {
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const ids = binding.parameters.player === "eachPlayer"
        ? [...context.game.state.setup.playerIds]
        : binding.parameters.player === "currentTurnPlayer"
          ? context.event?.actorPlayerId ? [context.event.actorPlayerId] : []
          : [context.controllerPlayerId];
      for (const id of ids) {
        const player = context.game.state.players[id]!;
        const moved = player.zones.runeDeck.splice(0, count);
        player.zones.base.push(...moved);
        if (binding.parameters.entryState === "exhausted") moved.forEach((cardId) => { context.game.state.cardStates[cardId]!.exhausted = true; });
      }
      recomputeAllMight(context.game, index);
    }
  });
  handlers.set("action.ready_cards", {
    choice(binding, context) {
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
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "event_subject"
          ? context.event?.subjectCardInstanceId
            ? [context.event.subjectCardInstanceId]
            : []
        : binding.parameters.target === "runes"
        ? context.selectedIds.length > 0
          ? context.selectedIds
          : context.game.state.players[context.controllerPlayerId]!.zones.base
            .filter((id) => definitionForInstance(id, index).card.classification.type === "Rune")
            .slice(0, numberParam(binding, "count"))
        : context.selectedIds;
      const readied = ids.filter(
        (id) =>
          context.game.state.cardStates[id]?.exhausted &&
          !isReadyPrevented(
            context.game,
            context.controllerPlayerId,
            id,
            index,
          ),
      );
      readied.forEach((id) => {
        context.game.state.cardStates[id]!.exhausted = false;
      });
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...readied.map((id) => ({
          type: "card.readied",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    }
  });
  handlers.set("selector.gear", {
    targets(binding, context) {
      const legalIds = context.game.state.setup.playerIds
        .flatMap((playerId) => context.game.state.players[playerId]!.zones.base)
        .filter(
          (id) => definitionForInstance(id, index).card.classification.type === "Gear",
        );
      return {
        kind: "card" as const,
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        label: "gear",
        legalIds,
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("action.look", {
    execute(binding, context) {
      const count = Math.max(0, optionalNumberParam(binding, "count", 1));
      const cards = context.game.state.players[context.controllerPlayerId]!
        .zones.mainDeck.slice(0, count);
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...cards.map((id) => ({
          type: "card.lookedAt",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.recycle_top_cards", {
    choice(binding, context) {
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      const cards = lookedCardsFor(binding, context).slice(
        0,
        numberParam(binding, "count"),
      );
      const availableCards = cards.filter((id) =>
        context.game.state.players[context.controllerPlayerId]!.zones.mainDeck.includes(id),
      );
      const recycleAllRemaining = binding.parameters.recycleAllRemaining === true;
      if (recycleAllRemaining) return null;
      const minimum = recycleAllRemaining
        ? availableCards.length
        : typeof binding.parameters.minimumCount === "number"
          ? binding.parameters.minimumCount
          : 0;
      const maximum = recycleAllRemaining
        ? availableCards.length
        : typeof binding.parameters.maximumCount === "number"
          ? Math.min(binding.parameters.maximumCount, availableCards.length)
          : availableCards.length;
      return availableCards.length > 0
        ? {
            legalIds: availableCards,
            minimum,
            maximum,
            prompt: "Choose any looked-at cards to recycle.",
            sourceZone: "mainDeck" as const,
            presentation: "vision" as const,
            visionAction: "recycle" as const,
          }
        : null;
    },
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const eligible = new Set(lookedCardsFor(binding, context));
      const selected = (binding.parameters.recycleAllRemaining === true
        ? lookedCardsFor(binding, context).filter((id) => player.zones.mainDeck.includes(id))
        : context.selectedIds.filter((id) => eligible.has(id) && player.zones.mainDeck.includes(id)));
      player.zones.mainDeck = player.zones.mainDeck.filter(
        (id) => !selected.includes(id),
      );
      player.zones.mainDeck.push(...selected);
      if (selected.length > 0) {
        recomputeAllMight(context.game, index);
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "card.recycled",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: selected[0]!,
          values: { count: selected.length },
        });
      }
    },
  });
  handlers.set("action.take_to_hand", {
    choice(binding, context) {
      const cards = lookedCardsFor(binding, context).filter((id) =>
        context.game.state.players[context.controllerPlayerId]!.zones.mainDeck.includes(id),
      );
      const count = numberParam(binding, "count");
      return cards.length > 0
        ? {
            legalIds: cards,
            minimum: Math.min(count, cards.length),
            maximum: Math.min(count, cards.length),
            prompt: "Choose a looked-at card to put into your hand.",
            sourceZone: "mainDeck" as const,
            presentation: "vision" as const,
            visionAction: "keep" as const,
          }
        : null;
    },
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const looked = new Set(lookedCardsFor(binding, context));
      const selected = selectionFor(binding, context)
        .filter((id) => looked.has(id) && player.zones.mainDeck.includes(id))
        .slice(0, numberParam(binding, "count"));
      if (selected.length === 0) return;
      player.zones.mainDeck = player.zones.mainDeck.filter((id) => !selected.includes(id));
      player.zones.hand.push(...selected);
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...selected.map((id) => ({
          type: "card.addedToHand",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.select_looked_unit", {
    choice(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const reference = context.effectOutcomes[
        stringParam(binding, "comparisonOutcomeKey")
      ];
      if (typeof reference !== "number") return null;
      const maximum = reference + optionalNumberParam(binding, "maximumOffset", 0);
      const legalIds = lookedCardsFor(binding, context).filter(
        (id) =>
          player.zones.mainDeck.includes(id) &&
          definitionForInstance(id, index).card.classification.type === "Unit" &&
          (definitionForInstance(id, index).card.attributes.might ?? 0) <= maximum,
      );
      return legalIds.length > 0
        ? {
            legalIds,
            minimum: 0,
            maximum: 1,
            prompt: `You may choose a looked-at Unit with Might ${maximum} or less.`,
            sourceZone: "mainDeck" as const,
            presentation: "vision" as const,
            visionAction: "keep" as const,
          }
        : null;
    },
    execute(binding, context) {
      const selected = selectionFor(binding, context)[0];
      if (!selected || binding.parameters.banishSelected !== true) return;
      const player = context.game.state.players[context.controllerPlayerId]!;
      if (!player.zones.mainDeck.includes(selected)) return;
      player.zones.mainDeck = player.zones.mainDeck.filter((id) => id !== selected);
      player.zones.banishment.push(selected);
      (context.game.state.queuedBehaviorEvents ??= []).push({
        type: "card.banished",
        actorPlayerId: context.controllerPlayerId,
        subjectCardInstanceId: selected,
        values: {},
      });
    },
  });
  handlers.set("action.order_top_cards", {
    choice(binding, context) {
      const cards = remainingLookedCards(binding, context);
      return cards.length > 1
        ? {
            legalIds: cards,
            minimum: cards.length,
            maximum: cards.length,
            prompt: "Choose the order for the remaining looked-at cards.",
            sourceZone: "mainDeck" as const,
            presentation: "vision" as const,
          }
        : null;
    },
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const current = remainingLookedCards(binding, context);
      const ordered = context.selectedIds.filter((id) => current.includes(id));
      if (ordered.length !== current.length) return;
      player.zones.mainDeck = [
        ...ordered,
        ...player.zones.mainDeck.filter((id) => !current.includes(id)),
      ];
    },
  });
  handlers.set("action.reveal", {
    execute(binding, context) {
      const count = Math.max(0, optionalNumberParam(binding, "count", 1));
      const cards = context.selectedIds.length > 0
        ? context.selectedIds.slice(0, count || context.selectedIds.length)
        : context.game.state.players[context.controllerPlayerId]!.zones.mainDeck.slice(0, count);
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...cards.map((id) => ({
          type: "card.revealed",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.exhaust_cards", {
    execute(binding, context) {
      const requestedCount = binding.parameters.count;
      const candidates =
        binding.parameters.target === "source"
          ? [context.sourceCardInstanceId]
          : binding.parameters.target === "friendly_unit"
            ? boardUnitsControlledBy(
                context.game,
                context.controllerPlayerId,
                index,
              )
          : context.selectedIds;
      const ids =
        typeof requestedCount === "number"
          ? candidates.slice(0, requestedCount)
          : candidates;
      const exhausted = ids.filter(
        (id) => !context.game.state.cardStates[id]?.exhausted,
      );
      exhausted.forEach((id) => {
        context.game.state.cardStates[id]!.exhausted = true;
      });
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...exhausted.map((id) => ({
          type: "card.exhausted",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.play_token", {
    choice(binding, context) {
      if (binding.parameters.placement !== "chooseBaseOrControlledBattlefield") {
        return null;
      }
      const definition = tokenDefinitionForBinding(binding, index);
      const destinations = unitPlacementDestinations(
        context.game,
        context.controllerPlayerId,
        definition,
        index,
      );
      return destinations.length > 1
        ? {
            kind: "tokenPlacement" as const,
            legalIds: destinations.map((destination) => destination.id),
            minimum: numberParam(binding, "count"),
            maximum: numberParam(binding, "count"),
            prompt: `Choose where to play ${numberParam(binding, "count")} ${tokenDisplayName(binding, definition)} token${numberParam(binding, "count") === 1 ? "" : "s"}`,
            tokenName: tokenDisplayName(binding, definition),
            placementKind: "token" as const,
            destinations,
          }
        : null;
    },
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const tokenCardCode = stringParam(binding, "tokenCardCode");
      const placements =
        binding.parameters.placement === "chooseBaseOrControlledBattlefield"
          ? selectedTokenDestinations(
              context,
              count,
              unitPlacementDestinations(
                context.game,
                context.controllerPlayerId,
                tokenDefinitionForBinding(binding, index),
                index,
              ),
            )
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
          tokenCardCode,
          entryState: binding.parameters.entryState,
          index,
        });
      }
    },
  });
  handlers.set("ability.play_token", handlers.get("action.play_token")!);
  handlers.set("action.play_selected_unit", {
    choice(binding, context) {
      const unitId = selectionForSource(binding, context)[0];
      if (!unitId) return null;
      const definition = definitionForInstance(unitId, index);
      const destinations = unitPlacementDestinations(
        context.game,
        context.controllerPlayerId,
        definition,
        index,
      );
      return {
        kind: "tokenPlacement" as const,
        prompt: "Choose where to play the selected Unit.",
        tokenName: definitionForInstance(unitId, index).card.name,
        placementKind: "unit" as const,
        legalIds: destinations.map((destination) => destination.id),
        minimum: 1,
        maximum: 1,
        destinations,
      };
    },
    execute(binding, context) {
      const unitId = selectionForSource(binding, context)[0];
      const destinationId = selectionFor(binding, context)[0];
      if (!unitId || !destinationId) return;
      const player = context.game.state.players[context.controllerPlayerId]!;
      if (!player.zones.trash.includes(unitId)) return;
      const definition = definitionForInstance(unitId, index);
      if (definition.card.classification.type !== "Unit") return;
      if (!isLegalUnitDestination(
        context.game,
        context.controllerPlayerId,
        definition,
        destinationId,
        index,
      )) return;
      const destination = destinationId === "base"
        ? null
        : context.game.state.battlefields.find(
          (battlefield) => battlefield.battlefieldId === destinationId,
        );
      if (binding.parameters.costMode === "powerOnly") {
        const paymentPlan = buildPaymentPlan(
          context.game,
          context.controllerPlayerId,
          definition,
          0,
          index,
        );
        if (!paymentPlan) return;
        payCardCost(
          context.game,
          context.controllerPlayerId,
          definition,
          0,
          index,
        );
      }
      player.zones.trash = player.zones.trash.filter((id) => id !== unitId);
      if (destination) {
        placeUnitAtBattlefield(context.game, {
          battlefieldId: destination.battlefieldId,
          controllerPlayerId: context.controllerPlayerId,
          unitId,
          index,
        });
        if (destination.controllerPlayerId == null) {
          markBattlefieldContested(
            context.game,
            destination.battlefieldId,
            context.controllerPlayerId,
          );
        }
      }
      else player.zones.base.push(unitId);
      const state = context.game.state.cardStates[unitId];
      if (state) {
        state.exhausted = true;
        state.damage = 0;
        state.stunned = false;
        incrementObjectVersion(context.game, unitId);
      }
      recomputeMight(context.game, unitId, index);
      recordCardPlayed(context.game, context.controllerPlayerId, unitId);
      (context.game.state.queuedBehaviorEvents ??= []).push({
        type: "card.played",
        actorPlayerId: context.controllerPlayerId,
        subjectCardInstanceId: unitId,
        values: {
          "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
          "eventSubject.effectiveEnergyCost": 0,
        },
      });
    },
  });
  handlers.set("action.deal_damage", {
    execute(binding, context) {
      const amount = effectiveNumericValue({
        attribute: "damage",
        baseValue: numberParam(binding, "amount"),
        controllerPlayerId: context.controllerPlayerId,
        game: context.game,
        index,
        targetScope: "controller_effect",
      });
      const ids = damageTargets(binding, context, index).filter((id) =>
        isUnitInPlay(context.game, id) && canTakeDamage(context.game, id, index),
      );
      const wasStunned = new Map(
        ids.map((id) => [id, context.game.state.cardStates[id]?.stunned === true]),
      );
      let killed = false;
      for (const id of ids) {
        const state = context.game.state.cardStates[id];
        if (!state) throw new Error(`Damage target is unavailable: ${id}`);
        state.damage += amount;
        incrementObjectVersion(context.game, id);
      }
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...ids.map((id) => ({
          type: "unit.damaged",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: { amount },
        })),
      );
      killUnitsMarkedForNextDamage(context.game, ids, index);
      cleanupLethalDamage(context.game, ids, index);
      for (const id of ids) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (
          (owner && context.game.state.players[owner]!.zones.trash.includes(id)) ||
          !context.game.state.cardStates[id]
        ) {
          killed = true;
          (context.game.state.queuedBehaviorEvents ??= []).push({
            type: "unit.killed",
            actorPlayerId: context.controllerPlayerId,
            subjectCardInstanceId: id,
            values: {
              method:
                index.definitions.get(
                  index.instances.get(context.sourceCardInstanceId)?.cardCode ?? "",
                )?.card.classification.type === "Spell"
                  ? "spell"
                  : "ability",
              wasStunned: wasStunned.get(id) ?? false,
            },
          });
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
      const damagesFirst = Boolean(
        first && firstState && secondMight > 0 && canTakeDamage(context.game, first, index),
      );
      const damagesSecond = Boolean(
        second && secondState && firstMight > 0 && canTakeDamage(context.game, second, index),
      );
      if (firstState && damagesFirst) firstState.damage += secondMight;
      if (secondState && damagesSecond) secondState.damage += firstMight;
      const damagedIds = [
        ...(damagesFirst ? [first] : []),
        ...(damagesSecond ? [second] : []),
      ].filter((id): id is string => Boolean(id));
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...damagedIds.map((id) => ({
          type: "unit.damaged" as const,
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {
            amount: id === first ? secondMight : firstMight,
          },
        })),
      );
      killUnitsMarkedForNextDamage(context.game, damagedIds, index);
      cleanupLethalDamage(
        context.game,
        damagedIds,
        index,
      );
    },
  });
  handlers.set("action.kill_unit", {
    execute(binding, context) {
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "event_subject" &&
            context.event?.subjectCardInstanceId
          ? [context.event.subjectCardInstanceId]
        : selectionFor(binding, context).length > 0
          ? selectionFor(binding, context)
          : context.selectedIds;
      const recordMightKey = binding.parameters.recordMightKey;
      if (typeof recordMightKey === "string" && ids[0]) {
        context.effectOutcomes[recordMightKey] =
          context.game.state.cardStates[ids[0]]?.computedMight ??
          definitionForInstance(ids[0], index).card.attributes.might ??
          0;
      }
      const sourceType = definitionForInstance(
        context.sourceCardInstanceId,
        index,
      ).card.classification.type;
      ids.forEach((id) => moveUnitToTrash(context.game, id, index, false, {
        actorPlayerId: context.controllerPlayerId,
        method: sourceType === "Spell" ? "spell" : "ability",
        wasStunned: context.game.state.cardStates[id]?.stunned === true,
      }));
    }
  });
  handlers.set("action.return_to_champion_zone", {
    execute(binding, context) {
      const id = selectionFor(binding, context)[0];
      if (!id) return;
      const instance = index.instances.get(id);
      const owner = instance?.ownerPlayerId;
      if (!owner || instance.source !== "champion") return;
      const zones = context.game.state.players[owner]!.zones;
      if (zones.champion !== null || !zones.trash.includes(id)) return;
      removeFromAllLocations(context.game, id);
      zones.champion = id;
      resetStateAfterLeavingBoard(context.game, id, index);
      recomputeAllMight(context.game, index);
    },
  });
  handlers.set("action.kill_on_next_damage", {
    execute(binding, context) {
      const targets = selectionFor(binding, context);
      const legionSatisfied = (
        context.game.state.players[context.controllerPlayerId]
          ?.legionSatisfiedCardIdsThisTurn ?? []
      ).includes(context.sourceCardInstanceId);
      if (binding.parameters.immediateWhenLegion === true && legionSatisfied) {
        targets.forEach((id) => moveUnitToTrash(context.game, id, index));
        return;
      }
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: targets,
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
    },
  });
  handlers.set("action.kill_permanent", {
    execute(binding, context) {
      for (const id of selectionFor(binding, context)) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        removeFromAllLocations(context.game, id);
        context.game.state.players[owner]!.zones.trash.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
      }
    },
  });
  handlers.set("action.buff_unit", {
    execute(binding, context) {
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "event_subject"
          ? context.event?.subjectCardInstanceId
            ? [context.event.subjectCardInstanceId]
            : []
        : selectionFor(binding, context).length > 0
          ? selectionFor(binding, context)
          : context.selectedIds.length > 0
            ? context.selectedIds
            : implicitModifierTargets(binding, context, index);
      for (const id of ids) {
        const state = context.game.state.cardStates[id];
        if (!state || state.buffed) continue;
        state.buffed = true;
        recomputeMight(context.game, id, index);
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "unit.buffed",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        });
      }
    },
  });
  handlers.set("action.banish_card", {
    execute(binding, context) {
      const ids =
        binding.parameters.target === "source"
          ? [context.sourceCardInstanceId]
          : context.selectedIds;
      const banished: string[] = [];
      for (const id of ids) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        if (isTokenInstance(id, index)) {
          ceaseToken(context.game, id);
          continue;
        }
        removeFromAllLocations(context.game, id);
        context.game.state.players[owner]!.zones.banishment.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
        banished.push(id);
      }
      if (banished.length > 0) {
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "card.banished",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: banished[0]!,
          values: { count: banished.length },
        });
      }
    },
  });
  handlers.set("action.take_extra_turn", {
    execute(_binding, context) {
      (context.game.state.extraTurnPlayerIds ??= []).push(
        context.controllerPlayerId,
      );
    },
  });
  handlers.set("action.gain_points", {
    execute(_binding, context) {
      const playerId = context.event?.actorPlayerId;
      if (!playerId) throw new Error("Point effect requires a turn player.");
      const player = context.game.state.players[playerId];
      if (!player) throw new Error("Point recipient is unavailable.");
      player.points = (player.points ?? 0) + 1;
      const requirement = effectiveNumericValue({
        attribute: "victoryRequirement",
        baseValue: 8,
        game: context.game,
        index,
        targetScope: "game",
      });
      if (player.points >= requirement) {
        context.game.winnerPlayerId = playerId;
        context.game.status = "complete";
      }
    },
  });
  handlers.set("selector.spell", {
    targets(binding, context) {
      const legalIds = (context.game.state.chain?.items ?? [])
        .filter((item) => item.kind === "spell")
        .map((item) => item.id);
      return {
        kind: "card" as const,
        label: "spell on the Chain",
        ...(typeof binding.parameters.selectionKey === "string"
          ? { selectionKey: binding.parameters.selectionKey }
          : {}),
        legalIds,
        minimum: numberParam(binding, "minimumCount"),
        maximum: numberParam(binding, "maximumCount"),
      };
    },
  });
  handlers.set("action.play_selected_card", {
    choice(binding, context) {
      const cardId = cardSelectedForPlay(binding, context);
      if (!cardId) return null;
      const definition = definitionForInstance(cardId, index);
      if (
        definition.card.classification.type !== "Unit" ||
        binding.parameters.destination === "sourceBattlefield"
      ) {
        return null;
      }
      const destinations = unitPlacementDestinations(
        context.game,
        context.controllerPlayerId,
        definition,
        index,
      );
      return destinations.length > 0 ? {
        kind: "tokenPlacement" as const,
        prompt: "Choose where to play the selected Unit.",
        tokenName: definition.card.name,
        placementKind: "unit" as const,
        legalIds: destinations.map((destination) => destination.id),
        minimum: 1,
        maximum: 1,
        destinations,
      } : null;
    },
    execute(binding, context) {
      const cardId = cardSelectedForPlay(binding, context);
      if (!cardId) return;
      const definition = definitionForInstance(cardId, index);
      const owner = index.instances.get(cardId)?.ownerPlayerId;
      if (!owner || !cardIsInPlayableEffectZone(context.game, owner, cardId)) return;
      const unitDestinationId = definition.card.classification.type === "Unit"
        ? binding.parameters.destination === "sourceBattlefield"
          ? battlefieldForCard(context.game, context.sourceCardInstanceId)?.battlefieldId
          : selectionFor(binding, context)[0]
        : null;
      if (
        definition.card.classification.type === "Unit" &&
        (!unitDestinationId || (
          binding.parameters.destination === "sourceBattlefield"
            ? isUnitPlayRestrictedToBase(
                context.game,
                context.controllerPlayerId,
                index,
              )
            : !isLegalUnitDestination(
                context.game,
                context.controllerPlayerId,
                definition,
                unitDestinationId,
                index,
              )
        ))
      ) return;
      if (binding.parameters.costMode === "powerOnly") {
        const plan = buildPaymentPlan(
          context.game, context.controllerPlayerId, definition, 0, index,
        );
        if (!plan) return;
        payCardCost(context.game, context.controllerPlayerId, definition, 0, index);
      } else if (binding.parameters.costMode === "oneAnyPower") {
        payAnyPower(context.game, context.controllerPlayerId, index);
      }
      removeFromAllLocations(context.game, cardId);
      recordCardPlayed(context.game, context.controllerPlayerId, cardId);
      const playEvent = {
        type: "card.played",
        actorPlayerId: context.controllerPlayerId,
        subjectCardInstanceId: cardId,
        values: {
          "eventSubject.printedEnergyCost": definition.card.attributes.energy ?? 0,
          "eventSubject.effectiveEnergyCost": 0,
          "eventSubject.effectDriven": true,
        },
      };
      if (definition.card.classification.type === "Spell") {
        const resolutionClause = definition.behaviorModel.clauses.filter(
          (clause) => clause.triggers.length === 0 && clause.abilities.length === 0,
        );
        const item: ChainItem = {
          id: `chain:${context.game.stateVersion}:${cardId}:effect-play`,
          kind: "spell",
          label: definition.card.name,
          controllerPlayerId: context.controllerPlayerId,
          sourceCardInstanceId: cardId,
          targetCardInstanceIds: [],
          targetObjectVersions: {},
          lockedSelectionsByBinding: {},
          behaviorClauseId: resolutionClause.length === 1 ? resolutionClause[0]!.id : null,
          activatedBehaviorId: null,
          behaviorEvent: playEvent,
          resolutionDestination:
            binding.parameters.afterResolution === "recycle" ? "recycle" : "trash",
        };
        const chain = context.game.state.chain ?? {
          items: [],
          relevantPlayerIds: [...context.game.state.setup.playerIds],
          priorityPlayerId: context.controllerPlayerId,
          passedPlayerIds: [],
          resumeFocusPlayerId: context.game.state.showdown?.focusPlayerId ?? null,
        };
        chain.items.push(item);
        chain.priorityPlayerId = context.controllerPlayerId;
        chain.passedPlayerIds = [];
        context.game.state.chain = chain;
        return;
      }
      if (definition.card.classification.type !== "Unit") return;
      const destinationId = unitDestinationId!;
      if (destinationId === "base") {
        context.game.state.players[owner]!.zones.base.push(cardId);
      } else {
        placeUnitAtBattlefield(context.game, {
          battlefieldId: destinationId,
          controllerPlayerId: context.controllerPlayerId,
          unitId: cardId,
          index,
        });
        const battlefield = context.game.state.battlefields.find(
          (candidate) => candidate.battlefieldId === destinationId,
        );
        if (battlefield?.controllerPlayerId !== context.controllerPlayerId) {
          markBattlefieldContested(
            context.game,
            destinationId,
            context.controllerPlayerId,
          );
        }
      }
      const state = context.game.state.cardStates[cardId];
      if (state) {
        state.exhausted = !sourceEntersReady(
          context.game,
          context.controllerPlayerId,
          cardId,
          definition,
          index,
        );
        state.damage = 0;
        state.stunned = false;
        incrementObjectVersion(context.game, cardId);
      }
      recomputeMight(context.game, cardId, index);
      (context.game.state.queuedBehaviorEvents ??= []).push(playEvent);
    },
  });
  handlers.set("action.pay_optional_resource", {
    choice(binding, context) {
      if (!canPayEffectResource(binding, context, index)) return null;
      return {
        kind: "binary",
        legalIds: ["accept", "decline"],
        minimum: 1,
        maximum: 1,
        prompt: typeof binding.parameters.prompt === "string"
          ? binding.parameters.prompt
          : "Pay the optional cost?",
        acceptLabel: "Pay",
        declineLabel: "Decline",
      };
    },
    execute(binding, context) {
      if (!selectionFor(binding, context).includes("accept")) return;
      payEffectResource(binding, context, index);
      if (binding.parameters.exhaustSource === true) {
        const state = context.game.state.cardStates[context.sourceCardInstanceId];
        if (!state || state.exhausted) throw new Error("Optional cost source is unavailable.");
        state.exhausted = true;
      }
    },
  });
  handlers.set("action.pay_resource", {
    execute(binding, context) {
      if (!canPayEffectResource(binding, context, index)) {
        throw new Error("Required resolving resource cost cannot be paid.");
      }
      payEffectResource(binding, context, index);
      if (binding.parameters.exhaustSource === true) {
        context.game.state.cardStates[context.sourceCardInstanceId]!.exhausted = true;
      }
    },
  });
  handlers.set("action.pay_optional_buff", {
    choice(_binding, context) {
      const legalIds = friendlyUnitIds(context.game, context.controllerPlayerId, index)
        .filter((id) => context.game.state.cardStates[id]?.buffed === true);
      return legalIds.length > 0 ? {
        kind: "card",
        legalIds,
        minimum: 0,
        maximum: 1,
        prompt: "Choose a friendly Unit whose Buff to spend, or decline.",
      } : null;
    },
    execute(binding, context) {
      const id = selectionFor(binding, context)[0];
      if (!id || context.game.state.cardStates[id]?.buffed !== true) return;
      context.game.state.cardStates[id]!.buffed = false;
      recomputeMight(context.game, id, index);
    },
  });
  handlers.set("action.pay_optional_exhaust", {
    choice(binding, context) {
      const targetId = binding.parameters.target === "legend"
        ? context.game.state.players[context.controllerPlayerId]?.zones.legend
        : context.sourceCardInstanceId;
      if (!targetId || context.game.state.cardStates[targetId]?.exhausted !== false) return null;
      return {
        kind: "binary", legalIds: ["accept", "decline"], minimum: 1, maximum: 1,
        prompt: typeof binding.parameters.prompt === "string"
          ? binding.parameters.prompt
          : "Exhaust the card to use this effect?",
        acceptLabel: "Exhaust", declineLabel: "Decline",
      };
    },
    execute(binding, context) {
      if (!selectionFor(binding, context).includes("accept")) return;
      const targetId = binding.parameters.target === "legend"
        ? context.game.state.players[context.controllerPlayerId]?.zones.legend
        : context.sourceCardInstanceId;
      if (!targetId || context.game.state.cardStates[targetId]?.exhausted !== false) {
        throw new Error("Optional exhaust cost is unavailable.");
      }
      context.game.state.cardStates[targetId]!.exhausted = true;
    },
  });
  handlers.set("action.ready_by_spending_buffs", {
    choice(_binding, context) {
      const legalIds = friendlyUnitIds(
        context.game,
        context.controllerPlayerId,
        index,
      ).filter((id) =>
        context.game.state.cardStates[id]?.buffed === true &&
        context.game.state.cardStates[id]?.exhausted === true,
      );
      return legalIds.length > 0 ? {
        kind: "card",
        legalIds,
        minimum: 0,
        maximum: legalIds.length,
        prompt: "Choose any exhausted friendly Units whose Buffs you want to spend to ready them.",
      } : null;
    },
    execute(binding, context) {
      const readied = selectionFor(binding, context).filter((id) =>
        context.game.state.cardStates[id]?.buffed === true &&
        context.game.state.cardStates[id]?.exhausted === true,
      );
      for (const id of readied) {
        const state = context.game.state.cardStates[id]!;
        state.buffed = false;
        state.exhausted = false;
        recomputeMight(context.game, id, index);
      }
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...readied.map((id) => ({
          type: "card.readied",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.win_game", {
    execute(_binding, context) {
      context.game.winnerPlayerId = context.controllerPlayerId;
      context.game.status = "complete";
    },
  });
  handlers.set("action.stun_card", {
    execute(binding, context) {
      const ids =
        binding.parameters.target === "source"
          ? [context.sourceCardInstanceId]
          : context.selectedIds;
      const newlyStunned = ids.filter(
        (id) => context.game.state.cardStates[id] && !context.game.state.cardStates[id]!.stunned,
      );
      newlyStunned.forEach((id) => {
        context.game.state.cardStates[id]!.stunned = true;
      });
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...newlyStunned.map((id) => ({
          type: "unit.stunned",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {},
        })),
      );
    },
  });
  handlers.set("action.return_to_hand", {
    execute(binding, context) {
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : selectionFor(binding, context).length > 0
          ? selectionFor(binding, context)
          : context.selectedIds;
      for (const id of ids) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        removeFromAllLocations(context.game, id);
        context.game.state.players[owner]!.zones.hand.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
      }
    },
  });
  handlers.set("action.recycle_cards", {
    execute(binding, context) {
      const requestedCount = binding.parameters.count;
      const candidates =
        binding.parameters.target === "source"
          ? [context.sourceCardInstanceId]
          : selectionFor(binding, context).length > 0
            ? selectionFor(binding, context)
            : context.selectedIds;
      const ids =
        typeof requestedCount === "number"
          ? candidates.slice(0, requestedCount)
          : candidates;
      const recycled: string[] = [];
      for (const id of ids) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
        if (isTokenInstance(id, index)) {
          ceaseToken(context.game, id);
          continue;
        }
        removeFromAllLocations(context.game, id);
        const definition = definitionForInstance(id, index);
        const destination =
          definition.card.classification.type === "Rune"
            ? context.game.state.players[owner]!.zones.runeDeck
            : context.game.state.players[owner]!.zones.mainDeck;
        destination.push(id);
        resetStateAfterLeavingBoard(context.game, id, index);
        recycled.push(id);
      }
      if (recycled.length > 0) {
        recomputeAllMight(context.game, index);
        (context.game.state.queuedBehaviorEvents ??= []).push({
          type: "card.recycled",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: recycled[0]!,
          values: { count: recycled.length },
        });
      }
    },
  });
  handlers.set("action.move_unit", {
    execute(binding, context) {
      const ids = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : selectionFor(binding, context).length > 0
          ? selectionFor(binding, context)
          : context.selectedIds;
      for (const id of ids) {
        const destination = movementDestination(binding, context, id);
        if (!destination) continue;
        moveUnitToDestination(
          context.game,
          id,
          destination,
          context.controllerPlayerId,
          index,
        );
      }
    },
  });
  handlers.set("action.swap_unit_locations", {
    execute(binding, context) {
      const otherId = selectionFor(binding, context)[0];
      const sourceId = context.sourceCardInstanceId;
      if (!otherId || sourceId === otherId) return;
      const sourceLocation = boardLocationForUnit(context.game, sourceId);
      const otherLocation = boardLocationForUnit(context.game, otherId);
      if (!sourceLocation || !otherLocation ||
        (sourceLocation.kind === otherLocation.kind && sourceLocation.id === otherLocation.id)) return;
      removeUnitFromBoardLocation(context.game, sourceId);
      removeUnitFromBoardLocation(context.game, otherId);
      placeMovedUnit(context.game, sourceId, otherLocation, index);
      placeMovedUnit(context.game, otherId, sourceLocation, index);
      const events = (context.game.state.queuedBehaviorEvents ??= []);
      events.push(
        movementEvent(context.controllerPlayerId, sourceId, sourceLocation, otherLocation),
        movementEvent(context.controllerPlayerId, otherId, otherLocation, sourceLocation),
      );
    },
  });
  handlers.set("action.gain_spell_control", {
    execute(binding, context) {
      const itemId = selectionFor(binding, context)[0];
      const item = context.game.state.chain?.items.find(
        (candidate) => candidate.id === itemId && candidate.kind === "spell",
      );
      if (item) item.controllerPlayerId = context.controllerPlayerId;
    },
  });
  handlers.set("action.make_new_spell_choices", {
    choice(binding, context) {
      const itemId = context.selectedBySelector[
        stringParam(binding, "spellSelectionKey")
      ]?.[0];
      const item = context.game.state.chain?.items.find(
        (candidate) => candidate.id === itemId && candidate.kind === "spell",
      );
      if (!item?.sourceCardInstanceId || !item.behaviorClauseId) return null;
      const definition = definitionForInstance(item.sourceCardInstanceId, index);
      const clause = compileBehaviorModel(definition.behaviorModel, handlers)
        .clauses.find((candidate) => candidate.id === item.behaviorClauseId);
      if (!clause) return null;
      const requirements = targetRequirementsForClause(
        clause,
        createBehaviorContext(
          context.game,
          context.controllerPlayerId,
          item.sourceCardInstanceId,
          item.behaviorEvent,
          [],
        ),
        handlers,
      );
      const legalIds = [...new Set(requirements.flatMap((item) => item.legalIds))];
      if (legalIds.length === 0) return null;
      return {
        kind: "card",
        legalIds,
        minimum: 0,
        maximum: requirements.reduce((sum, item) => sum + item.maximum, 0),
        prompt: "Choose new targets for the controlled spell, or keep its current choices.",
      };
    },
    execute(binding, context) {
      const selected = selectionFor(binding, context);
      if (selected.length === 0) return;
      const itemId = context.selectedBySelector[
        stringParam(binding, "spellSelectionKey")
      ]?.[0];
      const item = context.game.state.chain?.items.find(
        (candidate) => candidate.id === itemId && candidate.kind === "spell",
      );
      if (!item?.sourceCardInstanceId || !item.behaviorClauseId) return;
      const definition = definitionForInstance(item.sourceCardInstanceId, index);
      const clause = compileBehaviorModel(definition.behaviorModel, handlers)
        .clauses.find((candidate) => candidate.id === item.behaviorClauseId);
      if (!clause) return;
      const choiceContext = createBehaviorContext(
        context.game,
        context.controllerPlayerId,
        item.sourceCardInstanceId,
        item.behaviorEvent,
        [],
      );
      const requirements = clause.selectors.map((selector) =>
        handlers.get(selector.behaviorId)!.targets!(selector, choiceContext),
      );
      const allocations = allocateSelections(requirements, selected);
      if (allocations.some((ids, position) =>
        ids.length < requirements[position]!.minimum ||
        ids.some((id) => !requirements[position]!.legalIds.includes(id)))) {
        throw new Error("New spell choices are not legal.");
      }
      item.controllerPlayerId = context.controllerPlayerId;
      item.targetCardInstanceIds = [...selected];
      item.targetObjectVersions = Object.fromEntries(
        selected.map((id) => [id, context.game.state.cardStates[id]?.objectVersion ?? 0]),
      );
      item.lockedSelectionsByBinding = Object.fromEntries(
        clause.selectors.map((selector, position) => [
          `${clause.id}:selectors:${selector.order}`,
          allocations[position] ?? [],
        ]),
      );
      (context.game.state.queuedBehaviorEvents ??= []).push(
        ...selected.map((id) => ({
          type: "card.chosen",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: {
            method: "spell",
            targetBattlefieldId:
              context.game.state.battlefields.find((battlefield) =>
                battlefield.units.includes(id),
              )?.battlefieldId ?? "base",
          },
        })),
      );
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
  handlers.set("modifier.modify_numeric_value", {
    execute(binding, context) {
      if (binding.parameters.appliesToSourcePlay === true) {
        return;
      }
      if (isContinuousDuration(binding.parameters.duration)) {
        return;
      }
      const attribute = stringParam(binding, "attribute");
      const routedTargets = selectionFor(binding, context);
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "event_subject"
          ? context.event?.subjectCardInstanceId
            ? [context.event.subjectCardInstanceId]
            : []
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
  handlers.set("modifier.copy_numeric_value", {
    execute(binding, context) {
      const targetId = context.selectedBySelector[
        stringParam(binding, "targetSelectionKey")
      ]?.[0];
      const valueId = context.selectedBySelector[
        stringParam(binding, "valueSelectionKey")
      ]?.[0];
      if (!targetId || !valueId || targetId === valueId) return;
      if (binding.parameters.attribute !== "might") return;
      const current = context.game.state.cardStates[targetId]?.computedMight ?? 0;
      const copied = context.game.state.cardStates[valueId]?.computedMight ?? 0;
      if (copied <= current) return;
      context.game.state.modifiers.push({
        id: `modifier:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.modifiers.length}`,
        sourceCardInstanceId: context.sourceCardInstanceId,
        controllerPlayerId: context.controllerPlayerId,
        targetCardInstanceId: targetId,
        targetScope: "unit",
        attribute: "might",
        operation: "increase",
        amount: copied - current,
        minimum: null,
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
      recomputeMight(context.game, targetId, index);
    },
  });
  handlers.set("modifier.next_play_energy_discount", {
    execute(binding, context) {
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: [],
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
    },
  });
  handlers.set("modifier.grant_keyword", {
    execute(binding, context) {
      if (isContinuousDuration(binding.parameters.duration)) {
        return;
      }
      const keywordId = stringParam(binding, "keywordId");
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : selectionFor(binding, context);
      const selectedTargets = targets.length > 0 ? targets : context.selectedIds;
      for (const targetCardInstanceId of selectedTargets) {
        context.game.state.modifiers.push({
          id: `modifier:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.modifiers.length}`,
          sourceCardInstanceId: context.sourceCardInstanceId,
          controllerPlayerId: context.controllerPlayerId,
          targetCardInstanceId,
          targetScope: stringParam(binding, "target"),
          attribute: keywordId,
          operation: "increase",
          amount: optionalNumberParam(binding, "amount", 1),
          minimum: null,
          duration: stringParam(binding, "duration"),
          createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
        });
        recomputeMight(context.game, targetCardInstanceId, index);
      }
    },
  });
  handlers.set("ability.exhaust_for_resource", {
    execute(binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId]!;
      if (state.exhausted) throw new Error("Ability source is exhausted.");
      state.exhausted = true;
      const player = context.game.state.players[context.controllerPlayerId]!;
      const amount = numberParam(binding, "amount");
      if (binding.parameters.resourceType === "power") {
        const domain = powerDomainForResourceAbility(binding, context, index);
        if (binding.parameters.usage === "spellsOnly") {
          const conditionalPower = (player.conditionalPower ??= {});
          conditionalPower[domain] = (conditionalPower[domain] ?? 0) + amount;
        } else {
          player.power[domain] = (player.power[domain] ?? 0) + amount;
        }
      } else if (binding.parameters.usage === "spellsOnly") {
        player.conditionalEnergy += amount;
      } else {
        player.energy += amount;
      }
    }
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
  handlers.set("replacement.optional_recall_on_death", {
    execute(binding, context) {
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: selectionFor(binding, context),
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
        parameters: { ...binding.parameters },
      });
    },
  });
  handlers.set("modifier.cannot_play_cards", {
    execute(binding, context) {
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: [],
        duration: stringParam(binding, "duration"),
        createdAtTurn: context.game.state.turn?.turnNumber ?? 0,
      });
    },
  });
  handlers.set("modifier.enable_source_triggers", {
    execute(binding, context) {
      context.game.state.ongoingEffects.push({
        id: `ongoing:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.ongoingEffects.length}`,
        behaviorId: binding.behaviorId,
        controllerPlayerId: context.controllerPlayerId,
        sourceCardInstanceId: context.sourceCardInstanceId,
        targetCardInstanceIds: [],
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
): number {
  let baseCost = effectiveNumericValue({
    attribute: "energyCost",
    baseValue: definition.card.attributes.energy ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetScope: "controller_spell",
  });
  if (index) {
    for (const clause of definition.behaviorModel.clauses) {
      if (!clause.conditions.every((condition) => conditionMatches(condition, {
        game,
        index,
        controllerPlayerId,
        sourceCardInstanceId: "",
        event: null,
      }))) {
        continue;
      }
      for (const binding of clause.effects) {
        if (
          binding.behaviorId !== "modifier.modify_numeric_value" ||
          binding.parameters.attribute !== "energyCost" ||
          binding.parameters.target !== "controller_spell" ||
          binding.parameters.appliesToSourcePlay !== true ||
          typeof binding.parameters.amount !== "number"
        ) {
          continue;
        }
        baseCost = applyCostOperation(
          baseCost,
          binding.parameters.operation,
          binding.parameters.amount,
        );
      }
    }
  }
  const hasPriorPlayedCard =
    (game.state.players[controllerPlayerId]?.playedCardIdsThisTurn
      ?? game.state.players[controllerPlayerId]?.playedMainDeckCardIdsThisTurn
      ?? []).length > 0;
  const legionDiscount = hasPriorPlayedCard
    ? definition.behaviorModel.clauses
        .filter((clause) =>
          clause.keywords.some(
            (binding) => binding.behaviorId === "keyword.legion",
          ),
        )
        .flatMap((clause) => clause.effects)
        .filter(
          (binding) =>
            binding.behaviorId === "modifier.legion_energy_discount",
        )
        .reduce(
          (total, binding) =>
            total +
            (typeof binding.parameters.amount === "number"
              ? binding.parameters.amount
              : 0),
          0,
        )
    : 0;
  const nextPlayDiscount = game.state.ongoingEffects.find(
    (effect) =>
      effect.behaviorId === "modifier.next_play_energy_discount" &&
      effect.controllerPlayerId === controllerPlayerId &&
      definition.card.classification.type === "Spell",
  );
  const nextPlayAmount = nextPlayDiscount && index
    ? definitionForInstance(nextPlayDiscount.sourceCardInstanceId, index)
        .behaviorModel.clauses.flatMap((clause) => clause.effects)
        .find((binding) => binding.behaviorId === nextPlayDiscount.behaviorId)
        ?.parameters.amount
    : 0;
  return Math.max(
    0,
    baseCost - legionDiscount -
      (typeof nextPlayAmount === "number" ? nextPlayAmount : 0),
  );
}

export function consumeNextPlayEnergyDiscount(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
) {
  if (definition.card.classification.type !== "Spell") return;
  const effectIndex = game.state.ongoingEffects.findIndex(
    (effect) =>
      effect.behaviorId === "modifier.next_play_energy_discount" &&
      effect.controllerPlayerId === controllerPlayerId,
  );
  if (effectIndex >= 0) game.state.ongoingEffects.splice(effectIndex, 1);
}

function applyCostOperation(
  value: number,
  operation: unknown,
  amount: number,
) {
  switch (operation) {
    case "increase": return value + amount;
    case "reduce": return value - amount;
    case "multiply": return value * amount;
    case "set": return amount;
    default: throw new Error("Unsupported Energy-cost modifier operation.");
  }
}

function compareNumber(value: number, operator: unknown, comparison: number) {
  switch (operator) {
    case "equal": return value === comparison;
    case "notEqual": return value !== comparison;
    case "greaterThan": return value > comparison;
    case "greaterThanOrEqual": return value >= comparison;
    case "lessThan": return value < comparison;
    case "lessThanOrEqual": return value <= comparison;
    default: return false;
  }
}

export function cleanupTurnModifiers(game: GameDocument, index: RuntimeCardIndex) {
  const affected = game.state.modifiers.filter((item) => item.duration === "thisTurn" && item.targetCardInstanceId).map((item) => item.targetCardInstanceId!);
  game.state.modifiers = game.state.modifiers.filter((item) => item.duration !== "thisTurn");
  game.state.ongoingEffects = game.state.ongoingEffects.filter(
    (item) => item.duration !== "thisTurn",
  );
  affected.forEach((id) => recomputeMight(game, id, index));
  cleanupLethalDamage(game, [...new Set(affected)], index);
}

export function cleanupCombatModifiers(game: GameDocument, index: RuntimeCardIndex) {
  const affected = game.state.modifiers
    .filter((item) => item.duration === "thisCombat" && item.targetCardInstanceId)
    .map((item) => item.targetCardInstanceId!);
  game.state.modifiers = game.state.modifiers.filter(
    (item) => item.duration !== "thisCombat",
  );
  game.state.ongoingEffects = game.state.ongoingEffects.filter(
    (item) => item.duration !== "thisCombat",
  );
  affected.forEach((id) => recomputeMight(game, id, index));
  cleanupLethalDamage(game, [...new Set(affected)], index);
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
    .filter(
      (id) =>
        binding.parameters.exhaustedOnly !== true ||
        game.state.cardStates[id]?.exhausted === true,
    )
    .filter(
      (id) =>
        binding.parameters.buffedOnly !== true ||
        game.state.cardStates[id]?.buffed === true,
    )
    .filter((id) =>
      unitLocationRelationMatches(
        game,
        id,
        sourceCardInstanceId,
        binding.parameters.locationRelation,
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
          label: binding.parameters.buffedOnly === true
            ? "friendly Unit with a Buff to spend (optional)"
            : "ready friendly unit to exhaust (optional)",
        }
      : {}),
    legalIds,
    minimum: automatic ? 0 : typeof binding.parameters.minimumCount === "number" ? binding.parameters.minimumCount : 1,
    maximum: automatic ? 0 : typeof binding.parameters.maximumCount === "number" ? binding.parameters.maximumCount : 1
  };
}

function damageTargets(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  if (typeof binding.parameters.selectionKey === "string") {
    return selectionFor(binding, context);
  }
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

function friendlyUnitIds(
  game: GameDocument,
  controllerPlayerId: string,
  index: RuntimeCardIndex,
) {
  return [
    ...game.state.players[controllerPlayerId]!.zones.base,
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units),
  ].filter(
    (id) =>
      index.instances.get(id)?.ownerPlayerId === controllerPlayerId &&
      definitionForInstance(id, index).card.classification.type === "Unit",
  );
}

function effectPaymentDefinition(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const amount = numberParam(binding, "amount");
  const source = definitionForInstance(context.sourceCardInstanceId, index);
  const resource = stringParam(binding, "resource");
  const domain = typeof binding.parameters.domain === "string"
    ? binding.parameters.domain
    : "Colorless";
  return {
    ...source,
    card: {
      ...source.card,
      attributes: {
        ...source.card.attributes,
        energy: resource === "energy" ? amount : 0,
        power: resource === "power" ? amount : 0,
      },
      classification: {
        ...source.card.classification,
        type: "Unit" as const,
        domain: resource === "power" ? [domain] : ["Colorless"],
      },
    },
  };
}

function canPayEffectResource(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  if (
    binding.parameters.exhaustSource === true &&
    context.game.state.cardStates[context.sourceCardInstanceId]?.exhausted !== false
  ) {
    return false;
  }
  const definition = effectPaymentDefinition(binding, context, index);
  return buildPaymentPlan(
    context.game,
    context.controllerPlayerId,
    definition,
    definition.card.attributes.energy ?? 0,
    index,
  ) !== null;
}

function payEffectResource(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const definition = effectPaymentDefinition(binding, context, index);
  payCardCost(
    context.game,
    context.controllerPlayerId,
    definition,
    definition.card.attributes.energy ?? 0,
    index,
  );
}

export function consumeEnterReadyEffect(
  game: GameDocument,
  controllerPlayerId: string,
): boolean {
  const effectIndex = game.state.ongoingEffects.findIndex(
    (effect) =>
      effect.behaviorId === "modifier.enter_ready" &&
      effect.controllerPlayerId === controllerPlayerId,
  );
  if (effectIndex < 0) return false;
  game.state.ongoingEffects.splice(effectIndex, 1);
  return true;
}

export function sourceEntersReady(
  game: GameDocument,
  controllerPlayerId: string,
  sourceCardInstanceId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
) {
  return definition.behaviorModel.clauses.some(
    (clause) =>
      clause.triggers.length === 0 &&
      clause.abilities.length === 0 &&
      clause.effects.some(
        (binding) =>
          binding.behaviorId === "modifier.enter_ready" &&
          binding.parameters.target === "source",
      ) &&
      clause.conditions.every((condition) =>
        conditionMatches(condition, {
          game,
          index,
          controllerPlayerId,
          sourceCardInstanceId,
          event: null,
        }),
      ),
  );
}

export function canTakeDamage(
  game: GameDocument,
  cardInstanceId: string,
  index: RuntimeCardIndex,
) {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!instance || !definition) return true;
  return !definition.behaviorModel.clauses.some(
    (clause) =>
      clause.effects.some(
        (binding) =>
          binding.behaviorId === "prevention.prevent" &&
          binding.parameters.event === "damage" &&
          binding.parameters.target === "source",
      ) &&
      clause.conditions.every((condition) =>
        conditionMatches(condition, {
          game,
          index,
          controllerPlayerId: instance.ownerPlayerId,
          sourceCardInstanceId: cardInstanceId,
          event: null,
        }),
      ),
  );
}

function isReadyPrevented(
  game: GameDocument,
  actorPlayerId: string,
  targetCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  const targetType = definitionForInstance(targetCardInstanceId, index)
    .card.classification.type;
  if (targetType !== "Unit" && targetType !== "Gear") return false;
  return game.state.battlefields.some((battlefield) =>
    battlefield.units.some((sourceId) => {
      const source = index.instances.get(sourceId);
      if (!source || source.ownerPlayerId === actorPlayerId) return false;
      const definition = index.definitions.get(source.cardCode);
      return definition?.behaviorModel.clauses.some((clause) =>
        clause.effects.some(
          (binding) =>
            binding.behaviorId === "modifier.cannot_ready" &&
            binding.parameters.affectedPlayer === "opponent" &&
            binding.parameters.source === "spellOrAbility",
        ),
      );
    }),
  );
}

function pipeSeparatedParameter(binding: BehaviorBinding, name: string) {
  const value = binding.parameters[name];
  if (typeof value !== "string") return [];
  return value.split("|").map((item) => item.trim()).filter(Boolean);
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

function unitPlacementDestinations(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
) {
  return legalUnitDestinationIds(game, controllerPlayerId, definition, index).map(
    (destinationId) => {
      if (destinationId === "base") return { id: destinationId, label: "Base" };
      const battlefield = game.state.battlefields.find(
        (candidate) => candidate.battlefieldId === destinationId,
      );
      return {
        id: destinationId,
        label: battlefield
          ? definitionForInstance(battlefield.cardInstanceId, index).card.name
          : destinationId,
      };
    },
  );
}

function selectedTokenDestinations(
  context: BehaviorExecutionContext,
  count: number,
  legalDestinations: readonly { id: string }[],
) {
  if (legalDestinations.length === 1) {
    return Array.from({ length: count }, () => legalDestinations[0]!.id);
  }
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
    tokenCardCode: string;
    entryState: unknown;
    index: RuntimeCardIndex;
  },
) {
  const definition = input.index.definitions.get(input.tokenCardCode);
  if (!definition || definition.card.classification.supertype !== "Token") {
    throw new Error(`Token definition is unavailable: ${input.tokenCardCode}`);
  }
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
    exhausted: input.entryState !== "ready",
    buffed: false,
    damage: 0,
    computedMight: definition.card.attributes.might,
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
    placeUnitAtBattlefield(game, {
      battlefieldId: battlefield.battlefieldId,
      controllerPlayerId: input.controllerPlayerId,
      unitId: instanceId,
      index: input.index,
    });
  }
  if (consumeEnterReadyEffect(game, input.controllerPlayerId)) {
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

export function placeUnitAtBattlefield(
  game: GameDocument,
  input: {
    battlefieldId: string;
    controllerPlayerId: string;
    unitId: string;
    index: RuntimeCardIndex;
  },
) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === input.battlefieldId,
  );
  if (!battlefield) throw new Error("Unit destination is unavailable.");
  if (!battlefield.units.includes(input.unitId)) {
    battlefield.units.push(input.unitId);
  }

  const combat = game.state.combat;
  if (combat?.battlefieldId === input.battlefieldId) {
    const combatRole =
      combat.attackerPlayerId === input.controllerPlayerId
        ? "attacker"
        : combat.defenderPlayerId === input.controllerPlayerId
          ? "defender"
          : null;
    if (combatRole) {
      game.state.cardStates[input.unitId]!.combatRole = combatRole;
      const combatUnitIds =
        combatRole === "attacker"
          ? combat.attackerUnitIds
          : combat.defenderUnitIds;
      if (!combatUnitIds.includes(input.unitId)) {
        combatUnitIds.push(input.unitId);
      }
    }
  }
  recomputeMight(game, input.unitId, input.index);
}

function tokenDefinitionForBinding(
  binding: BehaviorBinding,
  index: RuntimeCardIndex,
): GameCardDefinition {
  const cardCode = stringParam(binding, "tokenCardCode");
  const definition = index.definitions.get(cardCode);
  if (!definition || definition.card.classification.supertype !== "Token") {
    throw new Error(`Token definition is unavailable: ${cardCode}`);
  }
  return definition;
}

function selectionForSource(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const key = binding.parameters.sourceSelectionKey;
  return typeof key === "string" ? context.selectedBySelector[key] ?? [] : [];
}

function lookedCardsFor(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const selectionKey = binding.parameters.sourceSelectionKey;
  if (typeof selectionKey === "string") {
    return context.selectedBySelector[selectionKey] ?? [];
  }
  return context.game.state.players[context.controllerPlayerId]!
    .zones.mainDeck.slice(0, numberParam(binding, "count"));
}

function remainingLookedCards(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const player = context.game.state.players[context.controllerPlayerId]!;
  const recycledSelectionKey = binding.parameters.recycledSelectionKey;
  const recycled = typeof recycledSelectionKey === "string"
    ? new Set(context.selectedBySelector[recycledSelectionKey] ?? [])
    : new Set<string>();
  return lookedCardsFor(binding, context)
    .filter((id) => !recycled.has(id) && player.zones.mainDeck.includes(id));
}

function boardUnitsControlledBy(
  game: GameDocument,
  controllerPlayerId: string,
  index: RuntimeCardIndex,
) {
  return [
    ...game.state.players[controllerPlayerId]?.zones.base ?? [],
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units),
  ].filter(
    (id) =>
      index.instances.get(id)?.ownerPlayerId === controllerPlayerId &&
      definitionForInstance(id, index).card.classification.type === "Unit",
  );
}

function tokenDisplayName(
  binding: BehaviorBinding,
  definition: GameCardDefinition,
): string {
  return typeof binding.parameters.tokenName === "string"
    ? binding.parameters.tokenName
    : definition.card.name;
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
  const sourceBattlefield = context.game.state.battlefields.find(
    (candidate) =>
      candidate.cardInstanceId === context.sourceCardInstanceId ||
      candidate.units.includes(context.sourceCardInstanceId),
  );
  if (sourceBattlefield) return sourceBattlefield.units;
  return context.game.state.players[context.controllerPlayerId]?.zones.base ?? [];
}

export function incrementObjectVersion(game: GameDocument, id: string) {
  const state = game.state.cardStates[id];
  if (state) state.objectVersion = (state.objectVersion ?? 0) + 1;
}
export function recomputeMight(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  const state = game.state.cardStates[id]!;
  const combatRole = state.combatRole;
  const combatKeywordMight =
    combatRole === "attacker"
      ? keywordAmount(game, id, "keyword.assault", index)
      : combatRole === "defender"
        ? keywordAmount(game, id, "keyword.shield", index)
        : 0;
  const baseMight =
    (definitionForInstance(id, index).card.attributes.might ?? 0) +
    (state.buffed ? 1 : 0) +
    combatKeywordMight;
  const value = effectiveNumericValue({
    attribute: "might",
    baseValue: baseMight,
    controllerPlayerId: index.instances.get(id)?.ownerPlayerId,
    game,
    index,
    targetCardInstanceId: id,
    targetScope: "source",
  });
  state.computedMight = Math.max(0, value);
}

export function recordCardPlayed(
  game: GameDocument,
  playerId: string,
  cardId: string,
) {
  const player = game.state.players[playerId]!;
  // Older in-progress games only have the Main Deck-specific history. Preserve
  // that history when the generic counter is first used, then record every
  // actual card play regardless of its zone of origin.
  const played = (player.playedCardIdsThisTurn ??= [
    ...(player.playedMainDeckCardIdsThisTurn ?? []),
  ]);
  if (played.length > 0) {
    (player.legionSatisfiedCardIdsThisTurn ??= []).push(cardId);
  }
  played.push(cardId);
}
export function cleanupLethalDamage(game: GameDocument, ids: string[], index: RuntimeCardIndex) {
  const lethalIds = [...new Set(ids)].filter((id) => {
    const state = game.state.cardStates[id];
    const might =
      state?.computedMight ??
      definitionForInstance(id, index).card.attributes.might ??
      Infinity;
    const unchangedSuppressedDeath =
      state?.lethalSuppressedDamage === state?.damage &&
      state?.lethalSuppressedMight === might;
    return Boolean(
      state &&
      !unchangedSuppressedDeath &&
      state.damage > 0 &&
      state.damage >= might,
    );
  });

  for (const id of lethalIds) {
    moveUnitToTrash(game, id, index);
  }
}
export function moveUnitToTrash(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
  suppressOptionalReplacement = false,
  killAttribution: KillAttribution | null = null,
) {
  if (!isUnitInPlay(game, id)) return;
  const originBattlefieldId = game.state.battlefields.find((battlefield) =>
    battlefield.units.includes(id)
  )?.battlefieldId ?? null;
  const preDeathState = game.state.cardStates[id];
  const preDeathMight = preDeathState?.computedMight ??
    definitionForInstance(id, index).card.attributes.might ?? 0;
  const preDeathDamage = preDeathState?.damage ?? 0;
  const preDeathCombatRole = preDeathState?.combatRole ?? null;
  if (!suppressOptionalReplacement) {
    const optionalReplacement = optionalDeathReplacement(
      game,
      id,
      index,
      killAttribution,
    );
    if (optionalReplacement) {
      if (optionalReplacement.effectId) {
        game.state.ongoingEffects = game.state.ongoingEffects.filter(
          (effect) => effect.id !== optionalReplacement.effectId,
        );
      }
      if (preDeathState) {
        preDeathState.lethalSuppressedDamage = preDeathDamage;
        preDeathState.lethalSuppressedMight = preDeathMight;
      }
      if (game.state.pendingChoice) {
        game.state.queuedDeathReplacements.push(optionalReplacement);
      } else {
        promptDeathReplacement(game, optionalReplacement);
      }
      return;
    }
  }
  const replacementIndex = game.state.ongoingEffects.findIndex(
    (effect) =>
      effect.behaviorId === "replacement.recall_on_next_death" &&
      effect.targetCardInstanceIds.includes(id),
  );
  if (replacementIndex >= 0) {
    game.state.ongoingEffects.splice(replacementIndex, 1);
    const owner = index.instances.get(id)?.ownerPlayerId;
    if (!owner) throw new Error(`Unit owner is unavailable: ${id}`);
    removeFromAllLocations(game, id);
    game.state.players[owner]!.zones.base.push(id);
    resetStateAfterLeavingBoard(game, id, index);
    const state = game.state.cardStates[id]!;
    state.exhausted = true;
    recomputeMight(game, id, index);
    return;
  }
  const owner = index.instances.get(id)?.ownerPlayerId;
  if (!owner) throw new Error(`Unit owner is unavailable: ${id}`);
  if (isTokenInstance(id, index)) {
    ceaseToken(game, id);
    queueAttributedKillEvent(game, id, killAttribution);
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
  recomputeAllMight(game, index);
  (game.state.queuedBehaviorEvents ??= []).push({
    type: "unit.died",
    actorPlayerId: owner,
    subjectCardInstanceId: id,
    values: {
      originBattlefieldId,
      might: preDeathMight,
      damage: preDeathDamage,
      combatRole: preDeathCombatRole,
    },
  });
  queueAttributedKillEvent(game, id, killAttribution);
}

type DeathReplacementRequest = GameDocument["state"]["queuedDeathReplacements"][number];
type KillAttribution = {
  actorPlayerId: string;
  method: "spell" | "ability" | "combat";
  wasStunned: boolean;
};

function queueAttributedKillEvent(
  game: GameDocument,
  unitId: string,
  attribution: KillAttribution | null,
) {
  if (!attribution) return;
  (game.state.queuedBehaviorEvents ??= []).push({
    type: "unit.killed",
    actorPlayerId: attribution.actorPlayerId,
    subjectCardInstanceId: unitId,
    values: {
      method: attribution.method,
      wasStunned: attribution.wasStunned,
    },
  });
}

function optionalDeathReplacement(
  game: GameDocument,
  unitId: string,
  index: RuntimeCardIndex,
  killAttribution: KillAttribution | null,
): DeathReplacementRequest | null {
  const owner = index.instances.get(unitId)?.ownerPlayerId;
  if (!owner) return null;
  const ongoing = game.state.ongoingEffects.find(
    (effect) =>
      effect.behaviorId === "replacement.optional_recall_on_death" &&
      effect.controllerPlayerId === owner &&
      effect.targetCardInstanceIds.includes(unitId),
  );
  if (ongoing) {
    const request = deathReplacementRequestFromParameters(
      unitId,
      ongoing.sourceCardInstanceId,
      ongoing.controllerPlayerId,
      ongoing.id,
      ongoing.parameters ?? {},
      killAttribution,
    );
    return request && deathReplacementCanBePaid(game, request, index)
      ? request
      : null;
  }
  const legendId = game.state.players[owner]?.zones.legend;
  if (!legendId) return null;
  const definition = definitionForInstance(legendId, index);
  for (const clause of definition.behaviorModel.clauses) {
    for (const binding of clause.effects) {
      if (
        binding.behaviorId !== "replacement.optional_recall_on_death" ||
        binding.parameters.target !== "friendlyBuffedUnit" ||
        game.state.cardStates[unitId]?.buffed !== true
      ) continue;
      const request = deathReplacementRequestFromParameters(
        unitId,
        legendId,
        owner,
        null,
        binding.parameters,
        killAttribution,
      );
      if (request && deathReplacementCanBePaid(game, request, index)) return request;
    }
  }
  return null;
}

function deathReplacementRequestFromParameters(
  unitId: string,
  sourceCardInstanceId: string,
  controllerPlayerId: string,
  effectId: string | null,
  parameters: Record<string, string | number | boolean | null>,
  killAttribution: KillAttribution | null,
): DeathReplacementRequest | null {
  const resource = parameters.resource;
  const amount = parameters.amount;
  if (
    (resource !== "energy" && resource !== "power") ||
    typeof amount !== "number" || amount <= 0
  ) return null;
  return {
    unitId,
    sourceCardInstanceId,
    controllerPlayerId,
    effectId,
    resource,
    domain: typeof parameters.domain === "string" ? parameters.domain : null,
    amount,
    exhaustSource: parameters.exhaustSource === true,
    spendTargetBuff: parameters.spendTargetBuff === true,
    killActorPlayerId: killAttribution?.actorPlayerId ?? null,
    killMethod: killAttribution?.method ?? null,
    wasStunned: killAttribution?.wasStunned ?? false,
  };
}

function deathReplacementCanBePaid(
  game: GameDocument,
  request: DeathReplacementRequest,
  index: RuntimeCardIndex,
) {
  if (
    request.exhaustSource &&
    game.state.cardStates[request.sourceCardInstanceId]?.exhausted !== false
  ) return false;
  if (
    request.spendTargetBuff &&
    game.state.cardStates[request.unitId]?.buffed !== true
  ) return false;
  const context = createReplacementContext(game, request);
  return canPayEffectResource({
    behaviorId: "action.pay_resource",
    confidence: "high",
    order: 0,
    parameters: {
      resource: request.resource,
      amount: request.amount,
      domain: request.domain,
    },
  }, context, index);
}

function createReplacementContext(
  game: GameDocument,
  request: DeathReplacementRequest,
): BehaviorExecutionContext {
  return {
    game,
    controllerPlayerId: request.controllerPlayerId,
    sourceCardInstanceId: request.sourceCardInstanceId,
    event: null,
    selectedIds: [],
    selectedBySelector: {},
    effectOutcomes: {},
  };
}

function promptDeathReplacement(
  game: GameDocument,
  request: DeathReplacementRequest,
  resolutionId: string | null = null,
) {
  game.state.pendingChoice = {
    id: `death-replacement:${game.stateVersion}:${request.unitId}`,
    playerId: request.controllerPlayerId,
    type: "binary",
    resolutionId,
    bindingKey: "death-replacement",
    prompt: "Pay to heal, exhaust, and recall this Unit instead of it dying?",
    acceptLabel: "Pay and recall",
    declineLabel: "Let it die",
    deathReplacement: request,
  };
}

export function submitDeathReplacementChoice(
  game: GameDocument,
  playerId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
) {
  const pending = game.state.pendingChoice;
  if (
    !pending || pending.type !== "binary" || !pending.deathReplacement ||
    pending.playerId !== playerId || selectedIds.length !== 1 ||
    !["accept", "decline"].includes(selectedIds[0]!)
  ) throw new Error("Death replacement choice is invalid.");
  const request = pending.deathReplacement;
  game.state.pendingChoice = null;
  if (
    selectedIds[0] === "accept" &&
    deathReplacementCanBePaid(game, request, index)
  ) {
    const context = createReplacementContext(game, request);
    payEffectResource({
      behaviorId: "action.pay_resource",
      confidence: "high",
      order: 0,
      parameters: {
        resource: request.resource,
        amount: request.amount,
        domain: request.domain,
      },
    }, context, index);
    if (request.exhaustSource) {
      game.state.cardStates[request.sourceCardInstanceId]!.exhausted = true;
    }
    if (request.spendTargetBuff) {
      game.state.cardStates[request.unitId]!.buffed = false;
    }
    const owner = index.instances.get(request.unitId)?.ownerPlayerId;
    if (!owner) throw new Error("Recalled Unit owner is unavailable.");
    removeFromAllLocations(game, request.unitId);
    game.state.players[owner]!.zones.base.push(request.unitId);
    resetStateAfterLeavingBoard(game, request.unitId, index);
    game.state.cardStates[request.unitId]!.exhausted = true;
    recomputeMight(game, request.unitId, index);
  } else {
    moveUnitToTrash(
      game,
      request.unitId,
      index,
      true,
      killAttributionFromRequest(request),
    );
  }
  advanceDeathReplacementQueue(game, index, pending.resolutionId);
}

function advanceDeathReplacementQueue(
  game: GameDocument,
  index: RuntimeCardIndex,
  resolutionId: string | null,
) {
  while (!game.state.pendingChoice && game.state.queuedDeathReplacements.length > 0) {
    const next = game.state.queuedDeathReplacements.shift()!;
    if (!isUnitInPlay(game, next.unitId)) continue;
    if (!deathReplacementCanBePaid(game, next, index)) {
      moveUnitToTrash(
        game,
        next.unitId,
        index,
        true,
        killAttributionFromRequest(next),
      );
      continue;
    }
    promptDeathReplacement(game, next, resolutionId);
  }
}

function killAttributionFromRequest(
  request: DeathReplacementRequest,
): KillAttribution | null {
  return request.killActorPlayerId && request.killMethod
    ? {
        actorPlayerId: request.killActorPlayerId,
        method: request.killMethod,
        wasStunned: request.wasStunned,
      }
    : null;
}

function cardSelectedForPlay(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  if (binding.parameters.source === "self") {
    return context.sourceCardInstanceId;
  }
  return selectionForSource(binding, context)[0];
}

function cardIsInPlayableEffectZone(
  game: GameDocument,
  ownerPlayerId: string,
  cardId: string,
) {
  const zones = game.state.players[ownerPlayerId]!.zones;
  return (
    zones.hand.includes(cardId) ||
    zones.trash.includes(cardId) ||
    zones.mainDeck.includes(cardId) ||
    zones.banishment.includes(cardId)
  );
}

function battlefieldForCard(game: GameDocument, cardId: string) {
  return game.state.battlefields.find(
    (battlefield) =>
      battlefield.cardInstanceId === cardId ||
      battlefield.units.includes(cardId),
  );
}

export function killUnitsMarkedForNextDamage(
  game: GameDocument,
  ids: readonly string[],
  index: RuntimeCardIndex,
) {
  for (const id of new Set(ids)) {
    const effectIndex = game.state.ongoingEffects.findIndex(
      (effect) =>
        effect.behaviorId === "action.kill_on_next_damage" &&
        effect.targetCardInstanceIds.includes(id),
    );
    if (effectIndex < 0) continue;
    game.state.ongoingEffects.splice(effectIndex, 1);
    moveUnitToTrash(game, id, index);
  }
}

function isUnitInPlay(game: GameDocument, id: string) {
  return (
    Object.values(game.state.players).some((player) =>
      player.zones.base.includes(id),
    ) || game.state.battlefields.some((battlefield) => battlefield.units.includes(id))
  );
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
  delete game.state.cardStates[id];
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
}
function resetStateAfterLeavingBoard(
  game: GameDocument,
  id: string,
  index?: RuntimeCardIndex,
) {
  const state = game.state.cardStates[id];
  if (!state) return;
  incrementObjectVersion(game, id);
  state.damage = 0;
  state.exhausted = false;
  state.buffed = false;
  state.stunned = false;
  state.combatRole = null;
  state.lethalSuppressedDamage = null;
  state.lethalSuppressedMight = null;
  game.state.modifiers = game.state.modifiers.filter(
    (modifier) => modifier.targetCardInstanceId !== id,
  );
  game.state.ongoingEffects = game.state.ongoingEffects.filter(
    (effect) =>
      effect.sourceCardInstanceId !== id &&
      !effect.targetCardInstanceIds.includes(id),
  );
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
) {
  if (relation === "sourceBattlefield") {
    const sourceBattlefield = game.state.battlefields.find(
      (battlefield) => battlefield.cardInstanceId === sourceId,
    );
    return sourceBattlefield?.units.includes(targetId) ?? false;
  }
  if (
    relation !== "sourceLocation" &&
    relation !== "selectedTargetLocation" &&
    relation !== "sharedLocation" &&
    relation !== "differentFromReferenceLocation"
  ) {
    return true;
  }
  const sourceLocation = boardLocationForUnit(game, sourceId);
  const targetLocation = boardLocationForUnit(game, targetId);
  if (relation === "differentFromReferenceLocation") {
    return (
      sourceLocation !== null &&
      targetLocation !== null &&
      (sourceLocation.kind !== targetLocation.kind ||
        sourceLocation.id !== targetLocation.id)
    );
  }
  if (relation === "selectedTargetLocation" && sourceLocation === null) {
    return true;
  }
  return (
    sourceLocation !== null &&
    targetLocation !== null &&
    sourceLocation.kind === targetLocation.kind &&
    sourceLocation.id === targetLocation.id
  );
}

function selectorReferenceSource(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
) {
  const key = binding.parameters.referenceSelectionKey;
  return typeof key === "string"
    ? context.selectedBySelector[key]?.[0] ?? context.sourceCardInstanceId
    : context.sourceCardInstanceId;
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

type BoardUnitLocation = NonNullable<ReturnType<typeof boardLocationForUnit>>;

function movementDestination(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  unitId: string,
): BoardUnitLocation | null {
  const owner = context.game.state.setup.playerIds.find((playerId) =>
    context.game.state.players[playerId]!.zones.base.includes(unitId) ||
    context.game.state.battlefields.some((battlefield) =>
      battlefield.units.includes(unitId),
    ),
  );
  if (binding.parameters.destination === "base") {
    return owner ? { kind: "base", id: owner } : null;
  }
  if (binding.parameters.destination === "sourceBattlefield") {
    const battlefield = battlefieldForCard(
      context.game,
      context.sourceCardInstanceId,
    );
    return battlefield
      ? { kind: "battlefield", id: battlefield.battlefieldId }
      : null;
  }
  if (binding.parameters.destination === "eventDestination") {
    const battlefieldId = context.event?.values.destinationBattlefieldId;
    if (typeof battlefieldId === "string") {
      return { kind: "battlefield", id: battlefieldId };
    }
    return context.event?.values.destination === "base" && owner
      ? { kind: "base", id: owner }
      : null;
  }
  if (binding.parameters.destination === "selectedUnitBattlefield") {
    const key = binding.parameters.destinationSelectionKey;
    const referenceId = typeof key === "string"
      ? context.selectedBySelector[key]?.[0]
      : undefined;
    const location = referenceId
      ? boardLocationForUnit(context.game, referenceId)
      : null;
    return location?.kind === "battlefield" ? location : null;
  }
  return null;
}

function moveUnitToDestination(
  game: GameDocument,
  unitId: string,
  destination: BoardUnitLocation,
  actorPlayerId: string,
  index: RuntimeCardIndex,
) {
  const origin = boardLocationForUnit(game, unitId);
  if (!origin || (origin.kind === destination.kind && origin.id === destination.id)) return;
  removeUnitFromBoardLocation(game, unitId);
  placeMovedUnit(game, unitId, destination, index);
  (game.state.queuedBehaviorEvents ??= []).push(
    movementEvent(actorPlayerId, unitId, origin, destination),
  );
}

function removeUnitFromBoardLocation(game: GameDocument, unitId: string) {
  for (const player of Object.values(game.state.players)) {
    player.zones.base = player.zones.base.filter((id) => id !== unitId);
  }
  for (const battlefield of game.state.battlefields) {
    battlefield.units = battlefield.units.filter((id) => id !== unitId);
  }
}

function placeMovedUnit(
  game: GameDocument,
  unitId: string,
  destination: BoardUnitLocation,
  index: RuntimeCardIndex,
) {
  const controllerPlayerId = index.instances.get(unitId)?.ownerPlayerId;
  if (!controllerPlayerId) return;
  if (destination.kind === "base") {
    game.state.players[controllerPlayerId]!.zones.base.push(unitId);
  } else {
    placeUnitAtBattlefield(game, {
      battlefieldId: destination.id,
      controllerPlayerId,
      unitId,
      index,
    });
    const battlefield = game.state.battlefields.find(
      (candidate) => candidate.battlefieldId === destination.id,
    );
    if (battlefield?.controllerPlayerId !== controllerPlayerId) {
      markBattlefieldContested(game, destination.id, controllerPlayerId);
    }
  }
  recomputeMight(game, unitId, index);
}

function movementEvent(
  actorPlayerId: string,
  unitId: string,
  origin: BoardUnitLocation,
  destination: BoardUnitLocation,
) {
  return {
    type: "unit.moved",
    actorPlayerId,
    subjectCardInstanceId: unitId,
    values: {
      destination: destination.kind,
      originBattlefieldId: origin.kind === "battlefield" ? origin.id : null,
      destinationBattlefieldId:
        destination.kind === "battlefield" ? destination.id : null,
    },
  };
}

function numberParam(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "number") throw new Error(`Behavior parameter ${key} must be numeric.`);
  return value;
}

function optionalNumberParam(
  binding: BehaviorBinding,
  key: string,
  fallback: number,
) {
  const value = binding.parameters[key];
  return typeof value === "number" ? value : fallback;
}
function stringParam(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string") throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}

function powerDomainForResourceAbility(
  binding: BehaviorBinding,
  context: BehaviorExecutionContext,
  index: RuntimeCardIndex,
) {
  const domain = stringParam(binding, "domain");
  if (domain === "sourceDomain") {
    return (
      definitionForInstance(context.sourceCardInstanceId, index).card.classification.domain[0] ??
      "Rainbow"
    );
  }
  return `${domain.slice(0, 1).toUpperCase()}${domain.slice(1)}`;
}
function draw(source: string[], destination: string[], count: number) { destination.push(...source.splice(0, Math.min(count, source.length))); }

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
