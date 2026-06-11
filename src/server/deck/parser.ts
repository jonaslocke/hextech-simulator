import {
  deckSectionNames,
  type DeckEntry,
  type DeckSectionName,
  type ParsedDeck
} from "./types";

const sectionSet = new Set<string>(deckSectionNames);

export function parseDeckList(sourceText: string): ParsedDeck {
  const sections: Record<DeckSectionName, DeckEntry[]> = {
    Legend: [],
    Champion: [],
    Runes: [],
    Battlefields: [],
    MainDeck: [],
    Sideboard: []
  };
  const entries: DeckEntry[] = [];
  let currentSection: DeckSectionName | null = null;

  const lines = sourceText.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = lines[index].trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.endsWith(":")) {
      const sectionName = trimmed.slice(0, -1);

      if (!sectionSet.has(sectionName)) {
        throw new Error(`Unknown deck section "${sectionName}" on line ${lineNumber}.`);
      }

      currentSection = sectionName as DeckSectionName;
      continue;
    }

    if (!currentSection) {
      throw new Error(`Deck entry before section on line ${lineNumber}.`);
    }

    const match = trimmed.match(/^(\d+)\s+(.+)$/);

    if (!match) {
      throw new Error(`Invalid deck entry on line ${lineNumber}.`);
    }

    const quantity = Number.parseInt(match[1], 10);
    const name = match[2].trim();

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity on line ${lineNumber}.`);
    }

    const entry: DeckEntry = {
      section: currentSection,
      quantity,
      name,
      line: lineNumber
    };

    sections[currentSection].push(entry);
    entries.push(entry);
  }

  return { entries, sections };
}
