import type { CardCatalog } from "./catalog";
import type {
  CardCatalogVersionDocument,
  DocumentRepository
} from "../db";

export function createCardCatalogVersionDocument(
  catalog: CardCatalog,
  now = new Date()
): CardCatalogVersionDocument {
  const timestamp = now.toISOString();

  return {
    id: catalog.versionHash,
    createdAt: timestamp,
    updatedAt: timestamp,
    versionHash: catalog.versionHash,
    setFiles: catalog.setFiles,
    cardCount: catalog.cards.length
  };
}

export async function persistCardCatalogVersion(
  repository: DocumentRepository<CardCatalogVersionDocument>,
  catalog: CardCatalog,
  now = new Date()
) {
  const document = createCardCatalogVersionDocument(catalog, now);
  await repository.upsert(document);
  return document;
}
