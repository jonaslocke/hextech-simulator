import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CANONICAL_CARDS_COLLECTION,
  applyOfficialErrata,
  deriveCanonicalPrintingGroupKey,
  deriveCardCodeFromCard,
  hashCardRulesText,
  loadOfficialErrata,
  normalizeCanonicalCard,
  selectPreferredPrinting,
  synchronizeImplementationStatusLedger,
  type CanonicalCardDocument,
} from "../src/server/card-catalog";
import { cardSetFileSchema } from "../src/server/catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

const commandArguments = process.argv.slice(2);
const requestedCardCodes = readCardCodes(commandArguments);
const confirmed = commandArguments.includes("--confirm") || commandArguments.includes("confirm");
const allowIdentityMigration =
  commandArguments.includes("--allow-identity-migration") ||
  commandArguments.includes("allow-identity-migration");

if (requestedCardCodes.length === 0) {
  throw new Error("Pass at least one --card-code SET-000 value.");
}

const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const collection = db.collection<CanonicalCardDocument & { _id: string }>(
    CANONICAL_CARDS_COLLECTION,
  );
  const repairs = [] as Array<{
    sourceCardCode: string;
    targetCardCode: string;
    before: string;
    after: string;
    document: CanonicalCardDocument;
  }>;

  for (const cardCode of requestedCardCodes) {
    const existing = await collection.findOne({ _id: cardCode });
    if (!existing) throw new Error(`Canonical card ${cardCode} does not exist.`);

    const setCode = cardCode.split("-", 1)[0]!.toLowerCase();
    const sourcePath = path.join(process.cwd(), "data", "sets", `${setCode}.json`);
    const sourceCards = cardSetFileSchema.parse(
      JSON.parse(await readFile(sourcePath, "utf8")),
    );
    const groupKey = deriveCanonicalPrintingGroupKey(existing.card);
    const candidates = sourceCards.filter(
      (card) => deriveCanonicalPrintingGroupKey(card) === groupKey,
    );
    const selected = selectPreferredPrinting(candidates, groupKey);
    const selectedCardCode = deriveCardCodeFromCard(selected);
    if (selectedCardCode !== cardCode && !allowIdentityMigration) {
      throw new Error(
        `${cardCode} resolves to ${selectedCardCode}; rerun with ` +
        "--allow-identity-migration after explicit review.",
      );
    }
    if (selectedCardCode !== cardCode) {
      const conflicting = await collection.findOne({ _id: selectedCardCode });
      if (conflicting) {
        throw new Error(
          `Cannot migrate ${cardCode} to ${selectedCardCode}; the target identity already exists.`,
        );
      }
    }

    const releases = await loadOfficialErrata([selected]);
    const overlay = applyOfficialErrata(selected, releases);
    const sourceTextHash = hashCardRulesText(overlay.effectiveCard);
    if (sourceTextHash !== existing.sourceTextHash) {
      throw new Error(
        `${cardCode} rules text differs from the approved model; reapprove behavior instead of repairing presentation.`,
      );
    }

    const { _id: ignoredId, ...existingDocument } = existing;
    void ignoredId;
    repairs.push({
      sourceCardCode: cardCode,
      targetCardCode: selectedCardCode,
      before: existing.card.public_code,
      after: selected.public_code,
      document: {
        ...existingDocument,
        id: selectedCardCode,
        cardCode: selectedCardCode,
        card: normalizeCanonicalCard(overlay.effectiveCard),
        printedCard: normalizeCanonicalCard(overlay.printedCard),
        printedSourceTextHash: hashCardRulesText(overlay.printedCard),
        appliedErrata: overlay.appliedErrata,
        sourceTextHash,
        // A presentation-only repair does not reapprove or change gameplay behavior.
        updatedAt: existing.updatedAt,
      },
    });
  }

  for (const repair of repairs) {
    const identityChange = repair.sourceCardCode === repair.targetCardCode
      ? repair.sourceCardCode
      : `${repair.sourceCardCode} -> ${repair.targetCardCode}`;
    console.log(`${identityChange}: ${repair.before} -> ${repair.after}`);
  }

  if (!confirmed) {
    console.log("Dry run only. Pass --confirm to persist these repairs.");
  } else {
    for (const repair of repairs) {
      if (repair.sourceCardCode === repair.targetCardCode) {
        await collection.updateOne(
          { _id: repair.sourceCardCode },
          { $set: repair.document },
        );
        continue;
      }

      await collection.insertOne({
        _id: repair.targetCardCode,
        ...repair.document,
      });
      const deletion = await collection.deleteOne({ _id: repair.sourceCardCode });
      if (deletion.deletedCount !== 1) {
        throw new Error(
          `Created ${repair.targetCardCode}, but failed to remove ${repair.sourceCardCode}.`,
        );
      }
    }
    for (const setCode of new Set(repairs.map((repair) => repair.targetCardCode.split("-", 1)[0]!))) {
      await synchronizeImplementationStatusLedger(db, setCode);
    }
    console.log(`Repaired ${repairs.length} canonical card printing(s).`);
  }
} finally {
  await client.close();
}

function readCardCodes(args: readonly string[]) {
  const cardCodes: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument && /^[A-Z0-9]+-(?:\d{3}|[A-Z]\d{2})$/i.test(argument)) {
      cardCodes.push(argument.toUpperCase());
      continue;
    }
    if (argument !== "--card-code") continue;
    const value = args[index + 1];
    if (!value || !/^[A-Z0-9]+-(?:\d{3}|[A-Z]\d{2})$/i.test(value)) {
      throw new Error("--card-code must be followed by a base gameplay code.");
    }
    cardCodes.push(value.toUpperCase());
    index += 1;
  }
  return [...new Set(cardCodes)];
}
