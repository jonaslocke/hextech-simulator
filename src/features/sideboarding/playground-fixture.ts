import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  MatchProjection,
  RegisteredCardCopy,
  RegisteredDeckConfiguration,
  SideboardingCardView,
  SideboardingSessionInput,
} from "@/shared/game";
import { loadCardCatalog } from "@/server/catalog";
import { deriveCardCodeFromCard } from "@/server/card-catalog/identity";
import { parseDeckList, type DeckSectionName } from "@/server/deck";
import type { Card } from "@/server/catalog";

const PLAYGROUND_MATCH_ID = "sideboarding-playground";
const PLAYGROUND_PLAYER_ID = "playground-player";
const PLAYGROUND_OPPONENT_ID = "playground-opponent";

export type SideboardingPlaygroundFixture = {
  projection: MatchProjection;
  session: SideboardingSessionInput;
};

export async function createSideboardingPlaygroundFixture(): Promise<SideboardingPlaygroundFixture> {
  const sourceText = await readFile(
    path.join(
      process.cwd(),
      "data",
      "decks",
      "sideboard-validation",
      "annie.dec.txt",
    ),
    "utf8",
  );
  const parsedDeck = parseDeckList(sourceText);
  const catalog = await loadCardCatalog();
  const cardsByName = new Map(catalog.cards.map((card) => [card.name, card]));
  const cardsByCode: Record<string, SideboardingCardView> = {};
  const registeredCardPool: RegisteredCardCopy[] = [];
  const idsBySection: Record<DeckSectionName, string[]> = {
    Legend: [],
    Champion: [],
    MainDeck: [],
    Sideboard: [],
    Runes: [],
    Battlefields: [],
  };

  let copyNumber = 0;

  for (const entry of parsedDeck.entries) {
    const card = cardsByName.get(entry.name);
    if (!card) {
      throw new Error(
        `Playground card is missing from the catalog: ${entry.name}`,
      );
    }

    const cardCode = deriveCardCodeFromCard(card);
    cardsByCode[cardCode] ??= toSideboardingCardView(card, cardCode);

    for (let copy = 0; copy < entry.quantity; copy += 1) {
      const registeredCardId = `${PLAYGROUND_MATCH_ID}:${copyNumber}`;
      copyNumber += 1;
      registeredCardPool.push({
        registeredCardId,
        cardCode,
        canonicalName: canonicalName(card),
      });
      idsBySection[entry.section].push(registeredCardId);
    }
  }

  const originalRegisteredDeck: RegisteredDeckConfiguration = {
    legendRegisteredCardId: idsBySection.Legend[0]!,
    chosenChampionRegisteredCardId: idsBySection.Champion[0]!,
    mainDeckRegisteredCardIds: idsBySection.MainDeck,
    sideboardRegisteredCardIds: idsBySection.Sideboard,
    runeDeckRegisteredCardIds: idsBySection.Runes,
    battlefieldRegisteredCardIds: idsBySection.Battlefields,
  };
  const currentDeckConfiguration = {
    chosenChampionRegisteredCardId:
      originalRegisteredDeck.chosenChampionRegisteredCardId,
    mainDeckRegisteredCardIds: [
      ...originalRegisteredDeck.mainDeckRegisteredCardIds,
    ],
    sideboardRegisteredCardIds: [
      ...originalRegisteredDeck.sideboardRegisteredCardIds,
    ],
  };

  const legendCard =
    cardsByCode[
      registeredCardPool.find(
        (copy) =>
          copy.registeredCardId ===
          originalRegisteredDeck.legendRegisteredCardId,
      )!.cardCode
    ]!;
  const eligibleChosenChampionRegisteredCardIds = registeredCardPool
    .filter((copy) => {
      const card = cardsByCode[copy.cardCode];
      return (
        card?.type === "Unit" &&
        card.supertype === "Champion" &&
        card.tags.some((tag) => legendCard.tags.includes(tag)) &&
        card.domains.every((domain) => legendCard.domains.includes(domain))
      );
    })
    .map((copy) => copy.registeredCardId);

  const session: SideboardingSessionInput = {
    matchId: PLAYGROUND_MATCH_ID,
    playerId: PLAYGROUND_PLAYER_ID,
    gameNumber: 3,
    expectedIntermissionVersion: 7,
    originalRegisteredDeck,
    currentDeckConfiguration,
    eligibleChosenChampionRegisteredCardIds,
    registeredCardPool,
    cardsByCode,
    context: {
      previousGameWinnerPlayerId: PLAYGROUND_PLAYER_ID,
      previousGameLoserPlayerId: PLAYGROUND_OPPONENT_ID,
      nextStartingPlayerChooserId: PLAYGROUND_PLAYER_ID,
      usedBattlefieldRegisteredCardIds: [idsBySection.Battlefields[0]!],
      remainingBattlefieldRegisteredCardIds: idsBySection.Battlefields.slice(1),
      nextBattlefieldMode: "server-auto",
    },
    opponentStatus: "editing",
  };

  return {
    session,
    projection: createPlaygroundProjection(),
  };
}

function toSideboardingCardView(
  card: Card,
  cardCode: string,
): SideboardingCardView {
  return {
    cardCode,
    canonicalName: canonicalName(card),
    name: card.name,
    imageUrl: card.media.image_url ?? null,
    rulesText: card.text.plain,
    publicCode: card.public_code,
    type: card.classification.type,
    supertype: card.classification.supertype,
    domains: card.classification.domain,
    tags: card.tags,
    energy: card.attributes.energy,
    might: card.attributes.might,
    power: card.attributes.power,
  };
}

function canonicalName(card: Card) {
  return (card.metadata.clean_name ?? card.name).replace(/\s+/g, " ").trim();
}

function createPlaygroundProjection(): MatchProjection {
  const players = [
    createPlaygroundPlayer(PLAYGROUND_PLAYER_ID, "You", true),
    createPlaygroundPlayer(PLAYGROUND_OPPONENT_ID, "Opponent", false),
  ];

  return {
    matchId: PLAYGROUND_MATCH_ID,
    stateVersion: 7,
    format: "riftbound-1v1-match",
    status: "between_games",
    viewerPlayerId: PLAYGROUND_PLAYER_ID,
    scoreByPlayerId: {
      [PLAYGROUND_PLAYER_ID]: 1,
      [PLAYGROUND_OPPONENT_ID]: 0,
    },
    winnerPlayerId: null,
    completionReason: null,
    currentGameId: `${PLAYGROUND_MATCH_ID}:game:2`,
    gameNumber: 2,
    gameIds: [`${PLAYGROUND_MATCH_ID}:game:1`, `${PLAYGROUND_MATCH_ID}:game:2`],
    completedGames: [
      {
        gameId: `${PLAYGROUND_MATCH_ID}:game:1`,
        gameNumber: 1,
        winnerPlayerId: PLAYGROUND_PLAYER_ID,
        completionReason: "victory",
      },
    ],
    currentGame: {
      id: `${PLAYGROUND_MATCH_ID}:game:2`,
      matchId: PLAYGROUND_MATCH_ID,
      gameNumber: 2,
      stateVersion: 12,
      status: "complete",
      viewerPlayerId: PLAYGROUND_PLAYER_ID,
      activePlayerId: null,
      winnerPlayerId: PLAYGROUND_PLAYER_ID,
      victoryScore: 2,
      setup: {
        playerIds: [PLAYGROUND_PLAYER_ID, PLAYGROUND_OPPONENT_ID],
        startingPlayerChooserId: PLAYGROUND_PLAYER_ID,
        startingPlayerId: PLAYGROUND_PLAYER_ID,
        battlefieldChoices: {},
        mulligans: {},
        battlefieldPool: [],
        waitingReason: null,
      },
      turn: null,
      showdown: null,
      combat: null,
      pendingChoice: null,
      players,
      battlefields: [],
      chain: null,
      actions: [],
      logEntries: [],
    },
    betweenGames: {
      id: `${PLAYGROUND_MATCH_ID}:between-games:2-3`,
      mode: "sideboarding",
      nextGameNumber: 3,
      previousGameWinnerPlayerId: PLAYGROUND_PLAYER_ID,
      previousGameLoserPlayerId: PLAYGROUND_OPPONENT_ID,
      nextStartingPlayerChooserId: PLAYGROUND_PLAYER_ID,
      viewerStatus: "pending",
      opponentStatus: "pending",
      usedBattlefieldRegisteredIdsByPlayerId: {},
      remainingBattlefieldRegisteredIdsByPlayerId: {},
      nextBattlefieldMode: "server_auto",
      viewerCurrentDeckConfiguration: {
        chosenChampionRegisteredCardId: `${PLAYGROUND_MATCH_ID}:1`,
        mainDeckRegisteredCardIds: [],
        sideboardRegisteredCardIds: [],
      },
      capabilities: {
        canReadyWithCurrentConfiguration: false,
        canSubmitDeckReconfiguration: true,
        canConcedeMatch: true,
      },
      sideboardingSession: null,
    },
  };
}

function createPlaygroundPlayer(
  playerId: string,
  displayName: string,
  isViewer: boolean,
) {
  return {
    playerId,
    displayName,
    isViewer,
    points: 0,
    energy: 0,
    conditionalEnergy: 0,
    power: {},
    zones: [
      {
        kind: "legend" as const,
        visibility: "public" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "champion" as const,
        visibility: "public" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "mainDeck" as const,
        visibility: "secret" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "runeDeck" as const,
        visibility: "secret" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "hand" as const,
        visibility: isViewer ? ("private" as const) : ("secret" as const),
        count: 0,
        cards: [],
      },
      {
        kind: "trash" as const,
        visibility: "public" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "banishment" as const,
        visibility: "public" as const,
        count: 0,
        cards: [],
      },
      {
        kind: "base" as const,
        visibility: "public" as const,
        count: 0,
        cards: [],
      },
    ],
  };
}
