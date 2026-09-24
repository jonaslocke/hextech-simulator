import type { BehaviorModel } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { ChainItem, GameDocument } from "./state";

export function behaviorModelForRuntimeCard(
  game: GameDocument,
  cardInstanceId: string,
  index: RuntimeCardIndex,
): { model: BehaviorModel; grantedClauses: Map<string, BehaviorModel["clauses"][number]> } {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${cardInstanceId}`);
  const clauses = [...definition.behaviorModel.clauses];
  const grantedClauses = new Map<string, BehaviorModel["clauses"][number]>();
  const incarnation = game.state.cardStates[cardInstanceId]?.gameObjectIncarnation ?? 0;
  for (const grant of game.state.grantedBehaviorGrants ?? []) {
    if (grant.targetCardInstanceId !== cardInstanceId || grant.targetGameObjectIncarnation !== incarnation) continue;
    for (const clause of grant.clauses) {
      const grantedClause = {
        ...clause,
        id: `granted:${grant.id}:${clause.id}`,
        sequence: clauses.length,
      };
      clauses.push(grantedClause);
      grantedClauses.set(grantedClause.id, grantedClause);
    }
  }
  return {
    model: { ...definition.behaviorModel, clauses },
    grantedClauses,
  };
}

export function behaviorModelForChainItem(
  model: BehaviorModel,
  item: ChainItem,
): BehaviorModel {
  return behaviorModelWithGrantedClause(model, item.grantedBehaviorClauseSnapshot, item.behaviorClauseId);
}

export function behaviorModelWithGrantedClause(
  model: BehaviorModel,
  snapshot: BehaviorModel["clauses"][number] | undefined,
  clauseId: string | null,
): BehaviorModel {
  if (!snapshot || model.clauses.some((clause) => clause.id === clauseId)) return model;
  return {
    ...model,
    clauses: [...model.clauses, { ...snapshot, sequence: model.clauses.length }],
  };
}
