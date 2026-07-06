import type { Db } from "mongodb";
import type { DeckId } from "@/shared/game";
import {
  DECK_DEFINITIONS_COLLECTION,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
} from "@/server/game/deck-definition";

type StoredDeckDefinition = DeckDefinitionDocument & { _id: string };

export type DeckDefinitionRepository = {
  findById(id: DeckId): Promise<DeckDefinitionDocument | null>;
  upsert(document: DeckDefinitionDocument): Promise<void>;
};

export function createDeckDefinitionRepository(
  db: Db,
): DeckDefinitionRepository {
  const collection = db.collection<StoredDeckDefinition>(
    DECK_DEFINITIONS_COLLECTION,
  );

  return {
    async findById(id) {
      const stored = await collection.findOne({ _id: id });
      if (!stored) return null;

      const { _id, ...document } = stored;
      if (_id !== document.id) {
        throw new Error(`Deck definition identity mismatch: ${id}.`);
      }

      return validateDeckDefinitionDocument(document);
    },

    async upsert(document) {
      const validated = validateDeckDefinitionDocument(document);
      await collection.updateOne(
        { _id: validated.id },
        { $set: validated },
        { upsert: true },
      );
    },
  };
}
