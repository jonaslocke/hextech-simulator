import type {
  BehaviorExecutionContext,
  BehaviorHandler,
  BehaviorHandlerRegistry,
} from "./behavior-runtime";
import type { DeckSnapshotDocument } from "./repositories";
import type { BehaviorBinding, GameCardDefinition } from "./schemas";
import type { CardInstance, GameDocument } from "./state";
import { createHash } from "node:crypto";
import {
  effectiveNumericValue,
  isContinuousDuration,
} from "./numeric-modifiers";
import { numericConditionMatches } from "./numeric-condition";
import { getTokenCatalogDefinitions } from "./token-catalog";

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
    "keyword.ganking", "keyword.hidden", "keyword.accelerate", "keyword.legion", "modifier.legion_energy_discount", "cost.pay", "cost.exhaust_source", "cost.exhaust_selected_unit",
    "keyword.temporary",
  ]) handlers.set(id, passive);
  handlers.set("choice.optional", {
    choice(binding) {
      return { kind: "binary", legalIds: ["accept", "decline"], minimum: 1, maximum: 1,
        prompt: typeof binding.parameters.prompt === "string" ? binding.parameters.prompt : "Use this optional effect?",
        acceptLabel: "Accept", declineLabel: "Decline" };
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
        ?.playedMainDeckCardIdsThisTurn?.length ?? 0) === 2,
  });
  handlers.set("trigger.conquer", {
    matches: (_binding, context) =>
      context.event?.type === "battlefield.conquered" &&
      context.event.actorPlayerId === context.controllerPlayerId,
  });
  handlers.set("trigger.hold_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.held" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
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
    matches: (_binding, context) => {
      const playerId = context.event?.actorPlayerId;
      return (
        context.event?.type === "turn.beginning" &&
        playerId != null &&
        context.game.state.players[playerId]?.hasTakenBeginningPhase !== true
      );
    },
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

  handlers.set("selector.unit", {
    targets(binding, context) {
      return selectorTargets(
        binding,
        context.game,
        index,
        () => true,
        context.sourceCardInstanceId,
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
        context.sourceCardInstanceId,
        context.selectedIds,
      );
    }
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
        context.sourceCardInstanceId,
        context.selectedIds,
      );
    },
  });
  handlers.set("selector.card", {
    targets(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const zone = stringParam(binding, "zone");
      const zoneValue =
        player.zones[zone as keyof typeof player.zones];
      const ids = Array.isArray(zoneValue)
        ? zoneValue
        : zoneValue
          ? [zoneValue]
          : [];
      const cardType = stringParam(binding, "cardType");
      return {
        kind: "card" as const,
        label: `${cardType === "any" ? "card" : cardType.toLowerCase()} from ${zone}`,
        sourceZone:
          zone === "hand" || zone === "trash" || zone === "mainDeck"
            ? zone
            : undefined,
        legalIds: ids.filter(
          (id) =>
            cardType === "any" ||
            definitionForInstance(id, index).card.classification.type ===
              cardType,
        ),
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
  handlers.set("action.draw_cards", {
    execute(binding, context) {
      const playerId = binding.parameters.player === "eachPlayer" ? null : context.controllerPlayerId;
      const count = numberParam(binding, "count");
      const ids = playerId ? [playerId] : [...context.game.state.setup.playerIds];
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
      selected.forEach((id) => incrementObjectVersion(context.game, id));
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
        : binding.parameters.target === "runes"
        ? context.selectedIds.length > 0
          ? context.selectedIds
          : context.game.state.players[context.controllerPlayerId]!.zones.base
            .filter((id) => definitionForInstance(id, index).card.classification.type === "Rune")
            .slice(0, numberParam(binding, "count"))
        : context.selectedIds;
      const readied = ids.filter(
        (id) => context.game.state.cardStates[id]?.exhausted,
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
  handlers.set("action.look", {
    choice(binding, context) {
      ensureMainDeck(context.game, context.controllerPlayerId, index);
      const count = Math.max(0, optionalNumberParam(binding, "count", 1));
      const cards = context.game.state.players[context.controllerPlayerId]!
        .zones.mainDeck.slice(0, count);
      return cards.length > 0
        ? {
            legalIds: cards,
            minimum: 0,
            maximum: 0,
            prompt: `Look at the top ${cards.length} card${cards.length === 1 ? "" : "s"}.`,
            sourceZone: "mainDeck",
            presentation: "vision",
          }
        : null;
    },
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
      const cards = context.game.state.players[context.controllerPlayerId]!
        .zones.mainDeck.slice(0, numberParam(binding, "count"));
      return cards.length > 0
        ? {
            legalIds: cards,
            minimum: 0,
            maximum: cards.length,
            prompt: "Choose any looked-at cards to recycle.",
            sourceZone: "mainDeck" as const,
            presentation: "vision" as const,
          }
        : null;
    },
    execute(_binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const selected = context.selectedIds.filter((id) =>
        player.zones.mainDeck.includes(id),
      );
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
  handlers.set("action.order_top_cards", {
    choice(binding, context) {
      const cards = context.game.state.players[context.controllerPlayerId]!
        .zones.mainDeck.slice(0, numberParam(binding, "count"));
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
      const count = numberParam(binding, "count");
      const current = player.zones.mainDeck.slice(0, count);
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
      const destinations = tokenPlacementDestinations(context.game, context.controllerPlayerId, index);
      return destinations.length > 0
        ? {
            kind: "tokenPlacement" as const,
            legalIds: destinations.map((destination) => destination.id),
            minimum: numberParam(binding, "count"),
            maximum: numberParam(binding, "count"),
            prompt: `Choose where to play ${numberParam(binding, "count")} ${tokenDisplayName(binding, definition)} token${numberParam(binding, "count") === 1 ? "" : "s"}`,
            tokenName: tokenDisplayName(binding, definition),
            destinations,
          }
        : null;
    },
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const tokenCardCode = stringParam(binding, "tokenCardCode");
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
          tokenCardCode,
          index,
        });
      }
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
      const ids = damageTargets(binding, context, index);
      let killed = false;
      for (const id of ids) {
        const state = context.game.state.cardStates[id];
        if (!state) throw new Error(`Damage target is unavailable: ${id}`);
        state.damage += amount;
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
    execute(binding, context) {
      const ids = binding.parameters.target === "source" ? [context.sourceCardInstanceId] : context.selectedIds;
      ids.forEach((id) => moveUnitToTrash(context.game, id, index));
    }
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
      player.hasTakenBeginningPhase = true;
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
  handlers.set("action.recycle_cards", {
    execute(binding, context) {
      const requestedCount = binding.parameters.count;
      const candidates =
        binding.parameters.target === "source"
          ? [context.sourceCardInstanceId]
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
      if (binding.parameters.destination !== "base") {
        throw new Error("Unsupported unit movement destination.");
      }
      for (const id of context.selectedIds) {
        const owner = index.instances.get(id)?.ownerPlayerId;
        if (!owner) continue;
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
        context.game.state.players[owner]!.zones.base.push(id);
        const events = (context.game.state.queuedBehaviorEvents ??= []);
        events.push({
          type: "unit.moved",
          actorPlayerId: context.controllerPlayerId,
          subjectCardInstanceId: id,
          values: { destination: "base" },
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
  handlers.set("modifier.modify_numeric_value", {
    execute(binding, context) {
      if (isContinuousDuration(binding.parameters.duration)) {
        return;
      }
      const attribute = stringParam(binding, "attribute");
      const routedTargets = selectionFor(binding, context);
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
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
    execute(binding, context) {
      const keywordId = stringParam(binding, "keywordId");
      const targets = selectionFor(binding, context);
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
  return handlers;
}

export function effectiveEnergyCost(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
): number {
  const baseCost = effectiveNumericValue({
    attribute: "energyCost",
    baseValue: definition.card.attributes.energy ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetScope: "controller_spell",
  });
  const hasPriorMainDeckCard =
    (game.state.players[controllerPlayerId]?.playedMainDeckCardIdsThisTurn
      ?.length ?? 0) > 0;
  const legionDiscount = hasPriorMainDeckCard
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
  return Math.max(0, baseCost - legionDiscount);
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
          label: "ready friendly unit to exhaust (optional)",
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
    tokenCardCode: string;
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
    exhausted: true,
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
    battlefield.units.push(instanceId);
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
export function recomputeMight(
  game: GameDocument,
  id: string,
  index: RuntimeCardIndex,
) {
  let value = effectiveNumericValue({
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
    value += keywordAmount(game, id, "keyword.assault", index);
  }
  if (combatRole === "defender") {
    value += keywordAmount(game, id, "keyword.shield", index);
  }
  game.state.cardStates[id]!.computedMight = Math.max(0, value);
}

export function keywordAmount(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
) {
  const printedAmount = definitionForInstance(
    cardInstanceId,
    index,
  ).behaviorModel.clauses
    .flatMap((clause) => clause.keywords)
    .filter((binding) => binding.behaviorId === behaviorId)
    .reduce(
      (sum, binding) =>
        sum +
        (typeof binding.parameters.amount === "number"
          ? binding.parameters.amount
          : 1),
      0,
    );
  const grantedAmount = game.state.modifiers
    .filter(
      (modifier) =>
        modifier.targetCardInstanceId === cardInstanceId &&
        modifier.attribute === behaviorId,
    )
    .reduce((sum, modifier) => sum + modifier.amount, 0);
  return printedAmount + grantedAmount;
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
    }
  }
}
export function moveUnitToTrash(game: GameDocument, id: string, index: RuntimeCardIndex) {
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
    values: {},
  });
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
  state.stunned = false;
  state.combatRole = null;
  state.lethalSuppressedDamage = null;
  state.lethalSuppressedMight = null;
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
  if (relation !== "sourceLocation" && relation !== "sharedLocation") {
    return true;
  }
  const sourceLocation = boardLocationForUnit(game, sourceId);
  const targetLocation = boardLocationForUnit(game, targetId);
  return (
    sourceLocation !== null &&
    targetLocation !== null &&
    sourceLocation.kind === targetLocation.kind &&
    sourceLocation.id === targetLocation.id
  );
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
