import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  cardSetFileSchema,
  getDeckCardLookupCandidates,
  getDeckCardNameAliases,
  type Card,
} from "../src/server/catalog";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";
import { updateImplementationStatus } from "../src/server/card-catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import { parseDeckList } from "../src/server/deck";

const ACCEPTED_DECKS = ["garen", "kaisa", "viktor"] as const;
const MANUAL_FAMILIES = [
  {
    familyId: "top-deck-inspection",
    cardCodes: ["OGN-183"],
    note: "Manual family passed on 2026-07-13.",
  },
  {
    familyId: "effect-driven-trash-play",
    cardCodes: ["OGN-165", "OGN-170", "OGN-196", "OGN-198"],
    note: "Manual family passed on 2026-07-14.",
  },
  {
    familyId: "opponent-hand-selection",
    cardCodes: ["OGN-156", "OGN-192"],
    note: "Manual family passed on 2026-07-14.",
  },
  {
    familyId: "optional-play-cost",
    cardCodes: ["OGN-048"],
    note: "Manual family passed on 2026-07-14.",
  },
  {
    familyId: "legion-resource-ability",
    cardCodes: ["OGN-253"],
    note: "Manual family passed on 2026-07-15: Legion blocks both activation and automatic payment before another card is played.",
  },
] as const;

const READY_FOR_MANUAL_VALIDATION = [
  {
    familyId: "next-damage-kill",
    cardCodes: ["OGN-254"],
    note: "Ready for the next-damage, Legion, expiry, and death-replacement manual family gate.",
  },
] as const;

const allCards = (
  await Promise.all(
    ["ogn", "ogs", "sfd", "unl"].map(async (setCode) =>
      cardSetFileSchema.parse(
        JSON.parse(
          await readFile(path.join(process.cwd(), "data", "sets", `${setCode}.json`), "utf8"),
        ),
      ),
    ),
  )
).flat();
const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  for (const deckId of ACCEPTED_DECKS) {
    const cardCodes = await resolveDeckCardCodes(deckId, allCards);
    for (const [setCode, codes] of groupBySet(cardCodes)) {
      await updateImplementationStatus(db, {
        setCode,
        cardCodes: codes,
        status: "accepted",
        familyId: `accepted-deck-${deckId}`,
        note: `${deckId} deck manual validation accepted.`,
      });
    }
  }

  for (const family of MANUAL_FAMILIES) {
    await updateImplementationStatus(db, {
      setCode: "OGN",
      cardCodes: family.cardCodes,
      status: "manual_family_passed",
      familyId: family.familyId,
      note: family.note,
    });
  }

  for (const family of READY_FOR_MANUAL_VALIDATION) {
    await updateImplementationStatus(db, {
      setCode: "OGN",
      cardCodes: family.cardCodes,
      status: "ready_for_manual_validation",
      familyId: family.familyId,
      note: family.note,
    });
  }

  console.log("Seeded accepted deck and recorded manual-family statuses.");
} finally {
  await client.close();
}

async function resolveDeckCardCodes(deckId: string, cards: readonly Card[]) {
  const source = await readFile(
    path.join(process.cwd(), "data", "decks", `${deckId}.dec.txt`),
    "utf8",
  );
  return [...new Set(parseDeckList(source).entries.map((entry) => {
    const candidates = getDeckCardLookupCandidates(entry.name);
    const card = cards.find((candidate) => candidate.name === entry.name) ??
      cards.find((candidate) =>
        candidates.includes(candidate.name) || getDeckCardNameAliases(candidate).includes(entry.name),
      );
    if (!card) throw new Error(`Unable to resolve ${entry.name} from ${deckId}.`);
    return deriveCardCodeFromCard(card);
  }))];
}

function groupBySet(cardCodes: readonly string[]) {
  const grouped = new Map<string, string[]>();
  for (const cardCode of cardCodes) {
    const setCode = cardCode.split("-", 1)[0]!;
    grouped.set(setCode, [...(grouped.get(setCode) ?? []), cardCode]);
  }
  return [...grouped.entries()];
}
