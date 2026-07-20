import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Card } from "../catalog";
import { deriveCardCodeFromCard } from "./identity";

const ERRATA_PATH = path.join(process.cwd(), "data", "errata", "official.json");
const ERRATA_KEY = /^(OGN|OGS|SFD|UNL)-[0-9]{3}$/;

const errataCardSchema = z.object({
  cardName: z.string().min(1),
  effectiveText: z.string().min(1),
  reason: z.string().min(1),
  notes: z.array(z.string()).optional(),
}).strict();

const errataReleaseSchema = z.object({
  id: z.string().min(1),
  effectiveFrom: z.string().date(),
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  cards: z.record(errataCardSchema),
}).strict();

export type AppliedErratum = {
  releaseId: string;
  effectiveFrom: string;
  sourceUrl: string;
  effectiveText: string;
};

export type OfficialErrataOverlay = {
  effectiveCard: Card;
  printedCard: Card;
  appliedErrata: AppliedErratum[];
};

export async function loadOfficialErrata(cards: readonly Card[]) {
  const releases = z.array(errataReleaseSchema).parse(
    JSON.parse(await readFile(ERRATA_PATH, "utf8")),
  );
  const releaseIds = new Set<string>();
  const knownCardsByKey = new Map<string, Card[]>();
  for (const card of cards) {
    const key = deriveCardCodeFromCard(card);
    const variants = knownCardsByKey.get(key) ?? [];
    variants.push(card);
    knownCardsByKey.set(key, variants);
  }
  for (const release of releases) {
    if (releaseIds.has(release.id)) {
      throw new Error(`Duplicate official errata release ID: ${release.id}`);
    }
    releaseIds.add(release.id);
    for (const [cardKey, erratum] of Object.entries(release.cards)) {
      if (!ERRATA_KEY.test(cardKey)) {
        throw new Error(`Invalid official errata card key: ${cardKey}`);
      }
      const printed = knownCardsByKey.get(cardKey)?.find(
        (card) =>
          !card.metadata.alternate_art &&
          !card.metadata.overnumbered &&
          !card.metadata.signature,
      ) ?? knownCardsByKey.get(cardKey)?.[0];
      // Imports can contain an individual set or a partial correction batch.
      // Errata for cards outside that upload are irrelevant to its overlay.
      if (!printed) continue;
      if (normalizeName(printed.name) !== normalizeName(erratum.cardName)) {
        throw new Error(`Official errata name does not match ${cardKey}: ${erratum.cardName}`);
      }
    }
  }
  return [...releases].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
}

export function applyOfficialErrata(
  printedCard: Card,
  releases: readonly z.infer<typeof errataReleaseSchema>[],
): OfficialErrataOverlay {
  const cardKey = deriveCardCodeFromCard(printedCard);
  const appliedErrata = releases.flatMap((release) => {
    const erratum = release.cards[cardKey];
    return erratum
      ? [{
          releaseId: release.id,
          effectiveFrom: release.effectiveFrom,
          sourceUrl: release.sourceUrl,
          effectiveText: erratum.effectiveText,
        }]
      : [];
  });
  const latest = appliedErrata.at(-1);
  return {
    printedCard,
    effectiveCard: latest
      ? { ...printedCard, text: { ...printedCard.text, plain: latest.effectiveText } }
      : printedCard,
    appliedErrata,
  };
}

function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}
