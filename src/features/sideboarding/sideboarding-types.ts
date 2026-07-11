import type {
  DeckConfiguration,
  RegisteredCardCopy,
  RegisteredDeckConfiguration,
  SideboardingCardView,
  SideboardingSessionInput,
} from "@/shared/game";

export type {
  DeckConfiguration as MutableDeckConfiguration,
  RegisteredCardCopy,
  RegisteredDeckConfiguration,
  SideboardingCardView,
  SideboardingSessionInput,
};

export type SideboardingEditorMode = "compact" | "grid" | "allCards";

export type DeckReconfigurationIntent = {
  kind: "submitDeckReconfiguration";
  matchId: string;
  expectedIntermissionVersion: number;
  configuration: DeckConfiguration;
};

export type IntentResult =
  | { accepted: true }
  | { accepted: false; message: string; code?: string };
