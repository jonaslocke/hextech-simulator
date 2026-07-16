import { isContinuousDuration } from "./numeric-modifiers";
import { conditionMatches } from "./condition-evaluation";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";

export type ActiveStaticKeywordGrant = {
  keywordId: string;
  amount: number;
  sourceCardInstanceId: string;
  duration: string;
};

export function keywordAmount(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
) {
  const printedAmount = definitionForInstance(cardInstanceId, index)
    .behaviorModel.clauses
    .flatMap((clause) => clause.keywords)
    .filter((binding) => binding.behaviorId === behaviorId)
    .reduce((sum, binding) => sum + keywordBindingAmount(binding.parameters.amount), 0);
  const grantedAmount = game.state.modifiers
    .filter(
      (modifier) =>
        modifier.targetCardInstanceId === cardInstanceId &&
        modifier.attribute === behaviorId,
    )
    .reduce((sum, modifier) => sum + modifier.amount, 0);

  return printedAmount + grantedAmount + activeStaticKeywordGrants(
    game,
    cardInstanceId,
    index,
  )
    .filter((grant) => grant.keywordId === behaviorId)
    .reduce((sum, grant) => sum + grant.amount, 0);
}

export function hasKeyword(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
) {
  return keywordAmount(game, cardInstanceId, behaviorId, index) > 0;
}

export function activeStaticKeywordGrants(
  game: GameDocument,
  targetCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  const grants: ActiveStaticKeywordGrant[] = [];
  for (const sourceCardInstanceId of activeSourceIds(game)) {
    const source = index.instances.get(sourceCardInstanceId);
    if (!source) continue;
    const definition = index.definitions.get(source.cardCode);
    if (!definition) continue;

    for (const clause of definition.behaviorModel.clauses) {
      if (!clause.conditions.every((condition) => conditionMatches(condition, {
        game,
        index,
        controllerPlayerId: source.ownerPlayerId,
        sourceCardInstanceId,
        event: null,
      }))) {
        continue;
      }
      for (const binding of clause.effects) {
        if (
          binding.behaviorId !== "modifier.grant_keyword" ||
          !isContinuousDuration(binding.parameters.duration) ||
          !sourceIsActive(game, sourceCardInstanceId, binding.parameters.duration) ||
          !continuousGrantAppliesToTarget(
            game,
            sourceCardInstanceId,
            source.ownerPlayerId,
            targetCardInstanceId,
            binding.parameters,
            index,
          )
        ) {
          continue;
        }
        const keywordId = binding.parameters.keywordId;
        const duration = binding.parameters.duration;
        if (typeof keywordId !== "string" || typeof duration !== "string") {
          continue;
        }
        grants.push({
          keywordId,
          amount: keywordBindingAmount(binding.parameters.amount),
          sourceCardInstanceId,
          duration,
        });
      }
    }
  }
  return grants;
}

function continuousGrantAppliesToTarget(
  game: GameDocument,
  sourceCardInstanceId: string,
  controllerPlayerId: string,
  targetCardInstanceId: string,
  parameters: Record<string, string | number | boolean | null>,
  index: RuntimeCardIndex,
) {
  const target = index.instances.get(targetCardInstanceId);
  if (!target) return false;
  const targetKind = parameters.target;
  if (targetKind === "source" && targetCardInstanceId !== sourceCardInstanceId) {
    return false;
  }
  if (targetKind === "friendly_unit" && target.ownerPlayerId !== controllerPlayerId) {
    return false;
  }
  if (targetKind === "enemy_unit" && target.ownerPlayerId === controllerPlayerId) {
    return false;
  }
  if (
    parameters.excludesSource === true &&
    targetCardInstanceId === sourceCardInstanceId
  ) {
    return false;
  }
  if (
    (parameters.locationRelation === "sourceLocation" ||
      parameters.locationRelation === "sharedLocation") &&
    !sameBoardLocation(game, sourceCardInstanceId, targetCardInstanceId)
  ) {
    return false;
  }
  return true;
}

function activeSourceIds(game: GameDocument) {
  return [...new Set([
    ...game.state.setup.playerIds.flatMap((playerId) => {
      const zones = game.state.players[playerId]!.zones;
      return [
        ...(zones.legend ? [zones.legend] : []),
        ...(zones.champion ? [zones.champion] : []),
        ...zones.base,
      ];
    }),
    ...game.state.battlefields.flatMap((battlefield) => [
      battlefield.cardInstanceId,
      ...battlefield.units,
    ]),
  ])];
}

function sourceIsActive(
  game: GameDocument,
  sourceCardInstanceId: string,
  duration: unknown,
) {
  if (duration === "whileSourceAtBattlefield") {
    return game.state.battlefields.some((battlefield) =>
      battlefield.cardInstanceId === sourceCardInstanceId ||
      battlefield.units.includes(sourceCardInstanceId),
    );
  }
  return activeSourceIds(game).includes(sourceCardInstanceId);
}

function sameBoardLocation(
  game: GameDocument,
  firstCardInstanceId: string,
  secondCardInstanceId: string,
) {
  const first = boardLocationForCard(game, firstCardInstanceId);
  const second = boardLocationForCard(game, secondCardInstanceId);
  return first !== null && second !== null && first.kind === second.kind && first.id === second.id;
}

function boardLocationForCard(game: GameDocument, cardInstanceId: string) {
  for (const battlefield of game.state.battlefields) {
    if (
      battlefield.cardInstanceId === cardInstanceId ||
      battlefield.units.includes(cardInstanceId)
    ) {
      return { kind: "battlefield" as const, id: battlefield.battlefieldId };
    }
  }
  for (const playerId of game.state.setup.playerIds) {
    if (game.state.players[playerId]!.zones.base.includes(cardInstanceId)) {
      return { kind: "base" as const, id: playerId };
    }
  }
  return null;
}

function definitionForInstance(cardInstanceId: string, index: RuntimeCardIndex) {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${cardInstanceId}`);
  return definition;
}

function keywordBindingAmount(value: unknown) {
  return typeof value === "number" ? value : 1;
}
