import type { Card } from "../catalog";

export const deckSectionNames = [
  "Legend",
  "Champion",
  "Runes",
  "Battlefields",
  "MainDeck",
  "Sideboard"
] as const;

export type DeckSectionName = (typeof deckSectionNames)[number];

export type DeckEntry = {
  section: DeckSectionName;
  quantity: number;
  name: string;
  line: number;
};

export type ParsedDeck = {
  entries: DeckEntry[];
  sections: Record<DeckSectionName, DeckEntry[]>;
};

export type ResolvedDeckEntry = DeckEntry & {
  card: Card;
};

export type RuntimeCardInstance = {
  instanceId: string;
  ownerId: string;
  source: "legend" | "champion" | "mainDeck" | "runeDeck" | "battlefield" | "sideboard";
  card: Card;
};

export type DeckSnapshot = {
  sourceText: string;
  catalogVersionHash: string;
  legend: ResolvedDeckEntry;
  champion: ResolvedDeckEntry;
  mainDeck: ResolvedDeckEntry[];
  runes: ResolvedDeckEntry[];
  battlefields: ResolvedDeckEntry[];
  sideboard: ResolvedDeckEntry[];
  instances: RuntimeCardInstance[];
};

export type DeckValidationIssue = {
  code: string;
  message: string;
  line?: number;
};

export type DeckValidationResult =
  | {
      ok: true;
      snapshot: DeckSnapshot;
      issues: [];
    }
  | {
      ok: false;
      issues: DeckValidationIssue[];
    };
