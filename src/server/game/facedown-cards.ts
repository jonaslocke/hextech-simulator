import { definitionForInstance, type RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";

export type FacedownCardPlacement = {
  cardInstanceId: string;
  controllerPlayerId: string;
  hiddenAtTurnNumber: number;
};

type BattlefieldState = GameDocument["state"]["battlefields"][number];

const DEFAULT_FACEDOWN_CAPACITY = 1;

/**
 * Reads the persistent facedown zone while remaining compatible with matches
 * created before facedown zones supported more than one card.
 */
export function facedownCardsAt(
  battlefield: BattlefieldState,
): FacedownCardPlacement[] {
  if (battlefield.facedownCards) {
    return battlefield.facedownCards;
  }

  if (
    battlefield.facedownCardInstanceId &&
    battlefield.facedownControllerPlayerId &&
    battlefield.hiddenAtTurnNumber
  ) {
    return [{
      cardInstanceId: battlefield.facedownCardInstanceId,
      controllerPlayerId: battlefield.facedownControllerPlayerId,
      hiddenAtTurnNumber: battlefield.hiddenAtTurnNumber,
    }];
  }

  return [];
}

/**
 * Persists the multi-card facedown zone and mirrors its first entry into the
 * legacy fields so existing snapshots and readers remain compatible during the
 * migration.
 */
export function setFacedownCards(
  battlefield: BattlefieldState,
  cards: readonly FacedownCardPlacement[],
) {
  battlefield.facedownCards = [...cards];
  const firstCard = battlefield.facedownCards[0] ?? null;
  battlefield.facedownCardInstanceId = firstCard?.cardInstanceId ?? null;
  battlefield.facedownControllerPlayerId = firstCard?.controllerPlayerId ?? null;
  battlefield.hiddenAtTurnNumber = firstCard?.hiddenAtTurnNumber ?? null;
}

export function addFacedownCard(
  battlefield: BattlefieldState,
  card: FacedownCardPlacement,
) {
  setFacedownCards(battlefield, [...facedownCardsAt(battlefield), card]);
}

export function removeFacedownCard(
  battlefield: BattlefieldState,
  cardInstanceId: string,
) {
  const cards = facedownCardsAt(battlefield);
  if (!cards.some((card) => card.cardInstanceId === cardInstanceId)) {
    return false;
  }

  setFacedownCards(
    battlefield,
    cards.filter((card) => card.cardInstanceId !== cardInstanceId),
  );
  return true;
}

export function facedownCapacity(
  battlefield: BattlefieldState,
  index: RuntimeCardIndex,
) {
  const definition = definitionForInstance(battlefield.cardInstanceId, index);
  const additionalCapacity = definition.behaviorModel.clauses.reduce(
    (total, clause) =>
      total +
      [...clause.abilities, ...clause.effects, ...clause.keywords].reduce(
        (clauseTotal, binding) =>
          binding.behaviorId === "modifier.facedown_capacity"
            ? clauseTotal +
              (typeof binding.parameters.amount === "number"
                ? binding.parameters.amount
                : 1)
            : clauseTotal,
        0,
      ),
    0,
  );

  return DEFAULT_FACEDOWN_CAPACITY + additionalCapacity;
}

export function hasFacedownCapacity(
  battlefield: BattlefieldState,
  index: RuntimeCardIndex,
) {
  return facedownCardsAt(battlefield).length < facedownCapacity(battlefield, index);
}
