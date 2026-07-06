import type { DeckOption } from "./types";

export async function loadOnlineDeckOptions(): Promise<DeckOption[]> {
  const response = await fetch("/api/matches");
  if (!response.ok) throw new Error("Unable to load available decks.");
  const result = (await response.json()) as { deckOptions: DeckOption[] };
  return result.deckOptions;
}

