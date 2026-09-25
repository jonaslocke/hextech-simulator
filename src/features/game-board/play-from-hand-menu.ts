import type { BoardPlayerProjection } from "./board-view-model";

export type PlayPaymentMode =
  BoardPlayerProjection["availablePaymentModes"][string][number];

export type PlayPaymentModeGroup = {
  id: "standard" | "additional-cost";
  label: "Standard" | "Additional cost";
  modes: PlayPaymentMode[];
};

export function groupPlayPaymentModes(
  modes: PlayPaymentMode[],
): PlayPaymentModeGroup[] | null {
  if (
    modes.some((mode) => !mode.playCost?.paymentMode) ||
    new Set(modes.map((mode) => mode.playCost?.paymentMode)).size < 2
  ) {
    return null;
  }

  return ([
    ["standard", "Standard"],
    ["additional-cost", "Additional cost"],
  ] as const)
    .map(([id, label]) => ({
      id,
      label,
      modes: modes.filter((mode) => mode.playCost?.paymentMode === id),
    }))
    .filter((group) => group.modes.length > 0);
}
