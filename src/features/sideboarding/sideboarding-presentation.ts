import type { CSSProperties } from "react";
import type { DeckValidationConstraints } from "@/shared/deck-validation";

/** Formats server constraints and sizes both card views; never evaluates validity. */
export function buildSideboardingPresentation(input: {
  constraints: DeckValidationConstraints;
  counts: { active: number; mainDeck: number; chosenChampion: number; sideboard: number };
}) {
  const { constraints, counts } = input;
  const columns = constraints.sideboard.maximum;
  // Both grids have half-rem gaps and half-rem padding on each side.
  const gridSpacingRem = 1 + (columns - 1) * 0.5;
  const cardWorkspaceStyle: CSSProperties & Record<"--sideboarding-card-width", string> = {
    "--sideboarding-card-width":
      `clamp(4.5rem, calc((100cqw - ${gridSpacingRem}rem) / ${columns}), 7.25rem)`,
  };
  const cardGridStyle = {
    gridTemplateColumns: `repeat(${columns}, var(--sideboarding-card-width))`,
    width: "max-content",
  } satisfies CSSProperties;
  const sideboardTarget =
    constraints.sideboard.exact ?? constraints.sideboard.maximum;

  return {
    cardGridStyle,
    cardWorkspaceStyle,
    countLabels: {
      active: `${counts.active}/${constraints.mainDeck.exact}`,
      mainDeck: `${counts.mainDeck} editable copies`,
      chosenChampion: `${counts.chosenChampion}/${constraints.chosenChampion.exact}`,
      sideboard: `${counts.sideboard}/${sideboardTarget}`,
    },
    mainDeckCountingLabel: constraints.mainDeck.includesChosenChampion
      ? "Includes Chosen Champion"
      : "Excludes Chosen Champion",
  };
}
