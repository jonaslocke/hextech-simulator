import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayPaymentMode } from "../src/features/game-board/play-from-hand-menu";
import { groupPlayPaymentModes } from "../src/features/game-board/play-from-hand-menu";

test("groups projected play actions by payment mode and preserves every destination", () => {
  const destinations = [
    { label: "Base", boardLocation: { kind: "base" as const } },
    {
      label: "Ornn's Forge",
      boardLocation: { kind: "battlefield" as const, battlefieldId: "forge" },
    },
    {
      label: "Seat of Power",
      boardLocation: { kind: "battlefield" as const, battlefieldId: "seat" },
    },
  ];
  const modes = (["standard", "additional-cost"] as const).flatMap(
    (paymentMode) =>
      destinations.map(({ boardLocation, label }) => ({
        boardLocation,
        disabledReason: null,
        enabled: true,
        id: `${paymentMode}:${label}`,
        label: `Play Clockwork Keeper to ${label}`,
        costPreview: null,
        playCost: {
          destinationLabel: label,
          label: `Play Clockwork Keeper to ${label}`,
          modifierSources: [],
          paymentMode,
          showCost: true,
        },
      } satisfies PlayPaymentMode)),
  );

  const groups = groupPlayPaymentModes(modes);

  assert.deepEqual(groups?.map((group) => group.label), [
    "Standard",
    "Additional cost",
  ]);
  assert.deepEqual(
    groups?.map((group) => group.modes.map((mode) => mode.id)),
    [
      ["standard:Base", "standard:Ornn's Forge", "standard:Seat of Power"],
      [
        "additional-cost:Base",
        "additional-cost:Ornn's Forge",
        "additional-cost:Seat of Power",
      ],
    ],
  );
});

test("keeps single-payment play choices in the existing flat menu", () => {
  const mode = {
    boardLocation: { kind: "base" as const },
    disabledReason: null,
    enabled: true,
    id: "standard:Base",
    label: "Play Unit to Base",
    costPreview: null,
    playCost: {
      label: "Play Unit to Base",
      destinationLabel: "Base",
      paymentMode: "standard",
      showCost: false,
      modifierSources: [],
    },
  } as PlayPaymentMode;

  assert.equal(groupPlayPaymentModes([mode]), null);
});
