import {
  deckValidationResponseSchema,
  type DeckValidationRequest,
  type DeckValidationResponse,
} from "@/shared/deck-validation";

export async function validateDeckClient(
  candidate: DeckValidationRequest,
  signal?: AbortSignal,
): Promise<DeckValidationResponse> {
  const response = await fetch("/api/decks/validate", {
    body: JSON.stringify(candidate),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? "Deck validation is unavailable.",
    );
  }

  return deckValidationResponseSchema.parse(payload);
}
