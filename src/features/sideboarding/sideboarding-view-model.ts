import type {
  DeckConfiguration,
  RegisteredCardCopy,
  SideboardingCardView,
  SideboardingSessionInput,
} from "@/shared/game";

export type SideboardingCardGroup = {
  card: SideboardingCardView;
  canonicalName: string;
  copies: RegisteredCardCopy[];
  quantity: number;
};

export type SideboardingCardCopyView = {
  card: SideboardingCardView;
  copy: RegisteredCardCopy;
};

export type SideboardingViewModel = {
  chosenChampionRegisteredCardId: string;
  chosenChampion: SideboardingCardView | null;
  legend: SideboardingCardView | null;
  battlefields: Array<{
    card: SideboardingCardView;
    registeredCardId: string;
    status: "used" | "available" | "auto-selected";
  }>;
  runeGroups: SideboardingCardGroup[];
  mainDeckGroups: SideboardingCardGroup[];
  sideboardGroups: SideboardingCardGroup[];
  mainDeckCopies: SideboardingCardCopyView[];
  sideboardCopies: SideboardingCardCopyView[];
  selectedCard: SideboardingCardView | null;
  eligibleChosenChampionRegisteredCardIds: Set<string>;
  counts: {
    active: number;
    mainDeck: number;
    chosenChampion: number;
    sideboard: number;
  };
  changedChosenChampion: boolean;
  hasDraftChanges: boolean;
};

export function buildSideboardingViewModel(input: {
  draft: DeckConfiguration;
  selectedRegisteredCardId: string | null;
  session: SideboardingSessionInput;
}): SideboardingViewModel {
  const cardPoolById = new Map(
    input.session.registeredCardPool.map((copy) => [
      copy.registeredCardId,
      copy,
    ]),
  );
  const cardByRegisteredId = new Map(
    input.session.registeredCardPool.map((copy) => [
      copy.registeredCardId,
      input.session.cardsByCode[copy.cardCode] ?? null,
    ]),
  );
  const chosenChampion =
    cardByRegisteredId.get(input.draft.chosenChampionRegisteredCardId) ?? null;
  const legend =
    cardByRegisteredId.get(
      input.session.originalRegisteredDeck.legendRegisteredCardId,
    ) ?? null;
  const selectedCard = input.selectedRegisteredCardId
    ? (cardByRegisteredId.get(input.selectedRegisteredCardId) ?? null)
    : chosenChampion;

  return {
    chosenChampionRegisteredCardId: input.draft.chosenChampionRegisteredCardId,
    chosenChampion,
    legend,
    battlefields: input.session.originalRegisteredDeck.battlefieldRegisteredCardIds.flatMap(
      (registeredCardId) => {
        const card = cardByRegisteredId.get(registeredCardId);
        if (!card) return [];
        const used =
          input.session.context.usedBattlefieldRegisteredCardIds.includes(
            registeredCardId,
          );
        const remaining =
          input.session.context.remainingBattlefieldRegisteredCardIds.includes(
            registeredCardId,
          );

        return [
          {
            card,
            registeredCardId,
            status:
              input.session.context.nextBattlefieldMode === "server-auto" &&
              remaining
                ? "auto-selected"
                : used
                  ? "used"
                  : "available",
          },
        ];
      },
    ),
    runeGroups: groupCopies(
      input.session.originalRegisteredDeck.runeDeckRegisteredCardIds,
      cardPoolById,
      input.session.cardsByCode,
    ),
    mainDeckGroups: groupCopies(
      input.draft.mainDeckRegisteredCardIds,
      cardPoolById,
      input.session.cardsByCode,
    ),
    sideboardGroups: groupCopies(
      input.draft.sideboardRegisteredCardIds,
      cardPoolById,
      input.session.cardsByCode,
    ),
    mainDeckCopies: copyViews(
      input.draft.mainDeckRegisteredCardIds,
      cardPoolById,
      input.session.cardsByCode,
    ),
    sideboardCopies: copyViews(
      input.draft.sideboardRegisteredCardIds,
      cardPoolById,
      input.session.cardsByCode,
    ),
    selectedCard,
    eligibleChosenChampionRegisteredCardIds: new Set(
      input.session.eligibleChosenChampionRegisteredCardIds,
    ),
    counts: {
      active: input.draft.mainDeckRegisteredCardIds.length + 1,
      mainDeck: input.draft.mainDeckRegisteredCardIds.length,
      chosenChampion: 1,
      sideboard: input.draft.sideboardRegisteredCardIds.length,
    },
    changedChosenChampion:
      input.draft.chosenChampionRegisteredCardId !==
      input.session.originalRegisteredDeck.chosenChampionRegisteredCardId,
    hasDraftChanges: !sameDeckConfiguration(
      input.draft,
      input.session.currentDeckConfiguration,
    ),
  };
}

function copyViews(
  registeredCardIds: readonly string[],
  cardPoolById: ReadonlyMap<string, RegisteredCardCopy>,
  cardsByCode: Record<string, SideboardingCardView>,
): SideboardingCardCopyView[] {
  return registeredCardIds
    .flatMap((registeredCardId) => {
      const copy = cardPoolById.get(registeredCardId);
      if (!copy) return [];
      const card = cardsByCode[copy.cardCode];
      if (!card) return [];
      return [{ card, copy }];
    })
    .sort(compareCopyViews);
}

function groupCopies(
  registeredCardIds: readonly string[],
  cardPoolById: ReadonlyMap<string, RegisteredCardCopy>,
  cardsByCode: Record<string, SideboardingCardView>,
): SideboardingCardGroup[] {
  const groups = new Map<string, SideboardingCardGroup>();

  for (const registeredCardId of registeredCardIds) {
    const copy = cardPoolById.get(registeredCardId);
    if (!copy) continue;
    const card = cardsByCode[copy.cardCode];
    if (!card) continue;

    const key = copy.canonicalName;
    const current = groups.get(key);
    if (current) {
      current.copies.push(copy);
      current.quantity += 1;
    } else {
      groups.set(key, {
        card,
        canonicalName: copy.canonicalName,
        copies: [copy],
        quantity: 1,
      });
    }
  }

  return [...groups.values()].sort(compareGroups);
}

export function isChampionUnit(card: SideboardingCardView): boolean {
  return card.type === "Unit" && card.supertype === "Champion";
}

function compareGroups(left: SideboardingCardGroup, right: SideboardingCardGroup) {
  const type = left.card.type.localeCompare(right.card.type);
  if (type !== 0) return type;
  const energy = (left.card.energy ?? 99) - (right.card.energy ?? 99);
  if (energy !== 0) return energy;
  return left.canonicalName.localeCompare(right.canonicalName);
}

function compareCopyViews(
  left: SideboardingCardCopyView,
  right: SideboardingCardCopyView,
) {
  const group = compareGroups(
    {
      card: left.card,
      canonicalName: left.copy.canonicalName,
      copies: [left.copy],
      quantity: 1,
    },
    {
      card: right.card,
      canonicalName: right.copy.canonicalName,
      copies: [right.copy],
      quantity: 1,
    },
  );
  if (group !== 0) return group;
  return left.copy.registeredCardId.localeCompare(right.copy.registeredCardId);
}

function sameDeckConfiguration(
  left: DeckConfiguration,
  right: DeckConfiguration,
) {
  return (
    left.chosenChampionRegisteredCardId === right.chosenChampionRegisteredCardId &&
    sameOrderedIds(left.mainDeckRegisteredCardIds, right.mainDeckRegisteredCardIds) &&
    sameOrderedIds(left.sideboardRegisteredCardIds, right.sideboardRegisteredCardIds)
  );
}

function sameOrderedIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
