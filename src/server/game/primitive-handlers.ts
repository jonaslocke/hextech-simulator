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
    "type.additional",
    "modifier.ignore_deflect",
    "keyword.ganking", "cost.exhaust_selected_unit",
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
        return definitionForInstance(context.event.subjectCardInstanceId, index).card.classification.type === "Gear";
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
            cardHasType(definitionForInstance(id, index), cardType),
        ),
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
      const playerId = binding.parameters.player === "eachPlayer" ? null : context.controllerPlayerId;
      const count = numberParam(binding, "count");
      const ids = playerId ? [playerId] : [...context.game.state.setup.playerIds];
      for (const id of ids) {
        ensureMainDeck(context.game, id, index);
        draw(context.game.state.players[id]!.zones.mainDeck, context.game.state.players[id]!.zones.hand, count);
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
      draw(player.zones.mainDeck, player.zones.hand, count);
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
      if (legalIds.length === 0) return null;
      const selected = context.selectedIds.filter((id) => legalIds.includes(id));
      if (
        binding.parameters.revealSelected === true &&
        selected.length > 0 &&
        !context.selectedIds.includes("continue")
      ) {
        const revealed = (context.game.state.revealedCardInstanceIds ??= []);
        for (const cardId of selected) {
          if (!revealed.includes(cardId)) revealed.push(cardId);
        }
        return {
          kind: "option" as const,
          choiceKey: "public-reveal",
          legalIds: ["continue"],
          minimum: 1,
          maximum: 1,
          prompt: "Selected card revealed. Continue when all players have reviewed it.",
          options: [{ id: "continue", label: "Continue" }],
        };
      }
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
        presentation: "vision",
      };
    },
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      const looked = player.zones.mainDeck.slice(0, numberParam(binding, "count"));
      const selected = new Set(context.selectedIds.filter((id) => looked.includes(id)));
      player.zones.mainDeck = player.zones.mainDeck.filter((id) => !looked.includes(id));
      player.zones.hand.push(...looked.filter((id) => selected.has(id)));
      player.zones.mainDeck.push(
        ...deterministicallyRecycle(
          looked.filter((id) => !selected.has(id)),
          `${context.game.id}:${context.game.stateVersion}:${context.sourceCardInstanceId}`,
        ),
      );
      context.game.state.revealedCardInstanceIds = (
        context.game.state.revealedCardInstanceIds ?? []
      ).filter((id) => !selected.has(id));
    },
  });
  handlers.set("action.gain_xp", {
    execute(binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      player.xp = (player.xp ?? 0) + numberParam(binding, "amount");
    },
  });
  handlers.set("action.reveal_opponent_hand", {
    choice(_binding, context) {
      const opponentId = context.game.state.setup.playerIds.find(
        (playerId) => playerId !== context.controllerPlayerId,
      );
      if (!opponentId) return null;
      const revealed = (context.game.state.revealedCardInstanceIds ??= []);
      for (const cardId of context.game.state.players[opponentId]!.zones.hand) {
        if (!revealed.includes(cardId)) revealed.push(cardId);
      }
      return {
        kind: "option" as const,
        legalIds: ["continue"],
        minimum: 1,
        maximum: 1,
        prompt: "Opponent hand revealed. Continue when all players have reviewed it.",
        options: [{ id: "continue", label: "Continue" }],
      };
    },
    execute(_binding, context) {
      context.game.state.revealedCardInstanceIds = [];
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
    execute(_binding, context) {
      context.selectedIds.forEach((id) => moveUnitToTrash(context.game, id, index));
    }
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
        moveAttachedCardsWithTopMost(context.game, id, index);
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
  handlers.set("ability.exhaust_for_resource", {
    execute(binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId]!;
      if (state.exhausted) throw new Error("Ability source is exhausted.");
      state.exhausted = true;
      if (binding.parameters.killSource === true) {
        moveCardToTrash(context.game, context.sourceCardInstanceId, index);
      }
      const player = context.game.state.players[context.controllerPlayerId]!;
      const amount = numberParam(binding, "amount");
      const usage = stringParam(binding, "usage");
      if (binding.parameters.resourceType === "power") {
        const domain = resourceDomainForBinding(binding, context, index);
        if (binding.parameters.poolResource === true) {
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
        if (!trash.includes(item.sourceCardInstanceId)) trash.push(item.sourceCardInstanceId);
      }
    },
  });
  handlers.set("action.attach_equipment", {
    execute(_binding, context) {
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
      const selectionKey = binding.parameters.onlyIfSelectedBy;
      if (
        typeof selectionKey === "string" &&
        (context.selectedBySelector[selectionKey] ?? []).length === 0
      ) {
        return null;
      }
      return {
        kind: "option" as const,
        legalIds: ["yes", "no"],
        minimum: 1,
        maximum: 1,
        prompt: stringParam(binding, "prompt"),
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      };
    },
    execute(binding, context) {
      const effectKey = stringParam(binding, "effectKey");
      context.effectOutcomes[effectKey] = context.selectedIds.includes("yes");
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
): number {
  return effectiveNumericValue({
    attribute: "energyCost",
    baseValue: definition.card.attributes.energy ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetCardInstanceId: cardInstanceId,
    targetScope: "controller_spell",
  });
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
            sourceCardInstanceId,
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
    value += keywordAmount(id, "keyword.assault", index, game);
  }
  if (combatRole === "defender") {
    value += keywordAmount(id, "keyword.shield", index, game);
  }
  value += attachedCardIds(game, id).reduce(
    (total, attachedCardInstanceId) =>
      total +
      (definitionForInstance(attachedCardInstanceId, index).card.attributes
        .might ?? 0),
    0,
  );
  game.state.cardStates[id]!.computedMight = Math.max(0, value);
}

export function effectivePowerCost(
  game: GameDocument,
  controllerPlayerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
  cardInstanceId?: string,
): number {
  return effectiveNumericValue({
    attribute: "powerCost",
    baseValue: definition.card.attributes.power ?? 0,
    cardType: definition.card.classification.type,
    controllerPlayerId,
    game,
    index,
    targetCardInstanceId: cardInstanceId,
    targetScope: "controller_spell",
  });
}

export function keywordAmount(
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
  game?: GameDocument,
) {
  const definition = definitionForInstance(cardInstanceId, index);
  const attachedEffectClauses = game
    ? attachedCardIds(game, cardInstanceId).flatMap(
        (attachedCardInstanceId) =>
          definitionForInstance(attachedCardInstanceId, index)
            .effectBehaviorModel?.clauses ?? [],
      )
    : [];
  return [...definition.behaviorModel.clauses, ...attachedEffectClauses]
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
) {
  return definitionForInstance(id, index).behaviorModel.clauses.some(
    (clause) =>
      clause.keywords.some(
        (keyword) => keyword.behaviorId === "keyword.temporary",
      ),
  );
}

function queueDeathTriggeredEffects(
  game: GameDocument,
  sourceCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  const instance = index.instances.get(sourceCardInstanceId);
  if (!instance) return;
  const definition = definitionForInstance(sourceCardInstanceId, index);
  const handlers = createPrimitiveHandlers(index);
  const items = collectTriggeredClauses({
    game,
    controllerPlayerId: instance.ownerPlayerId,
    sources: [{
      sourceCardInstanceId,
      label: definition.card.name,
      model: compileBehaviorModel(definition.behaviorModel, handlers),
    }],
    event: {
      type: "card.died",
      actorPlayerId: null,
      subjectCardInstanceId: sourceCardInstanceId,
      values: {},
    },
    handlers,
  });
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
  resetStateAfterLeavingBoard(game, id, index);
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
) {
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
  controllerPlayerId: string,
) {
  return (game.state.chain?.items ?? []).some((item) =>
    item.kind === "spell" &&
    item.controllerPlayerId !== controllerPlayerId &&
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
function stringParam(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string") throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
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
