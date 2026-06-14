"use client";

import type { Card } from "@/server/catalog";
import { CardImage } from "./CardImage";
import { UnitRow } from "./UnitRow";

export function BattlefieldContent({
  battlefield,
  mirrored = false,
  units,
}: {
  battlefield: Card;
  mirrored?: boolean;
  units: Card[];
}) {
  return (
    <div className="items-center gap-3 grid grid-cols-[96px_1fr] h-full">
      <CardImage
        card={battlefield}
        className={`w-20 ${mirrored ? "rotate-180" : ""}`}
      />
      <UnitRow cards={units} mirrored={mirrored} />
    </div>
  );
}
