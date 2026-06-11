import { createHash } from "node:crypto";
import type {
  DeckSnapshotDocument,
  DocumentRepository
} from "../db";
import type { DeckSnapshot } from "./types";

export type CreateDeckSnapshotDocumentInput = {
  snapshot: DeckSnapshot;
  playerId: string;
  matchId?: string | null;
  now?: Date;
};

export function createDeckSnapshotDocument({
  snapshot,
  playerId,
  matchId = null,
  now = new Date()
}: CreateDeckSnapshotDocumentInput): DeckSnapshotDocument {
  const timestamp = now.toISOString();
  const sourceHash = createHash("sha256")
    .update(playerId)
    .update(snapshot.catalogVersionHash)
    .update(snapshot.sourceText)
    .digest("hex");

  return {
    id: `deck:${playerId}:${sourceHash}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    matchId,
    playerId,
    sourceText: snapshot.sourceText,
    catalogVersionHash: snapshot.catalogVersionHash,
    snapshot
  };
}

export async function persistDeckSnapshot(
  repository: DocumentRepository<DeckSnapshotDocument>,
  input: CreateDeckSnapshotDocumentInput
) {
  const document = createDeckSnapshotDocument(input);
  await repository.upsert(document);
  return document;
}
