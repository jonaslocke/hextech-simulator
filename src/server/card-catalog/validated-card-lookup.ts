import type { Collection, Db, Filter } from "mongodb";

export const CARD_BEHAVIOR_VALIDATIONS_COLLECTION = "cardBehaviorValidations";
export const CARD_BEHAVIOR_SCHEMA_VERSION = 2 as const;

export type PersistedCardValidationStatus =
  | "approved"
  | "rejected"
  | "requires_engine_support";

export type PersistedCardValidationSummary = {
  cardCode: string;
  schemaVersion: number | null;
  status: PersistedCardValidationStatus;
  sourceTextHash: string | null;
  updatedAt: string | null;
};

type CardBehaviorValidationDocument = {
  _id?: string;
  cardCode?: string;
  schemaVersion?: number;
  status?: PersistedCardValidationStatus;
  sourceTextHash?: string | null;
  updatedAt?: string | null;
};

export type ExistingCardValidationLookup = (
  cardCodes: string[]
) => Promise<Map<string, PersistedCardValidationSummary>>;

export function createMongoCardValidationLookup(
  db: Db
): ExistingCardValidationLookup {
  const collection = db.collection<CardBehaviorValidationDocument>(
    CARD_BEHAVIOR_VALIDATIONS_COLLECTION
  );

  return (cardCodes) => findPersistedCardValidationsByCardCodes(collection, cardCodes);
}

async function findPersistedCardValidationsByCardCodes(
  collection: Collection<CardBehaviorValidationDocument>,
  cardCodes: string[]
): Promise<Map<string, PersistedCardValidationSummary>> {
  const uniqueCardCodes = [...new Set(cardCodes)];

  if (uniqueCardCodes.length === 0) {
    return new Map();
  }

  const documents = await collection
    .find({
      $or: [
        { _id: { $in: uniqueCardCodes } },
        { cardCode: { $in: uniqueCardCodes } }
      ]
    } as Filter<CardBehaviorValidationDocument>)
    .toArray();

  return new Map(
    documents.flatMap((document) => {
      const cardCode = document.cardCode ?? document._id;

      if (!cardCode || !document.status) {
        return [];
      }

      return [
        [
          cardCode,
          {
            cardCode,
            schemaVersion: document.schemaVersion ?? null,
            status: document.status,
            sourceTextHash: document.sourceTextHash ?? null,
            updatedAt: document.updatedAt ?? null
          }
        ]
      ];
    })
  );
}
