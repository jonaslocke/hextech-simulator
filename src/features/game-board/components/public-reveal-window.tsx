"use client";

import type { GameProjection } from "@/shared/game";
import { useEffect, useRef, useState } from "react";
import { newPublicReveals } from "../interactions/public-reveal-events";
import { FloatingOverlayPanel } from "./floating-overlay-panel";
import { ZoneCards } from "./temporary-zone-overlay";

type Reveal = NonNullable<GameProjection["publicReveals"]>[number];

export function PublicRevealWindow({ reveals = [] }: { reveals?: Reveal[] }) {
  const seen = useRef(new Set(reveals.map((reveal) => reveal.id)));
  const [visible, setVisible] = useState<Reveal[]>([]);
  useEffect(() => {
    const fresh = newPublicReveals(seen.current, reveals);
    if (fresh.length) setVisible((current) => [...current, ...fresh]);
  }, [reveals]);
  return <FloatingOverlayPanel isOpen={visible.length > 0} onClose={() => setVisible([])} title="Revealed cards" closeLabel="Close revealed cards" placement="secondary">
    <div className="space-y-3" aria-live="polite">{visible.map((reveal) => <section key={reveal.id}>
      <p className="mb-2 text-sm text-cyan-100">{reveal.message}</p>
      <ZoneCards emptyLabel="No revealed cards" cards={reveal.cards.map((card) => ({
        instanceId: card.instanceId, name: card.name, img: card.imageUrl ?? "", type: card.type,
        rulesText: card.rulesText, domains: card.domains, publicCode: card.publicCode,
      }))} />
    </section>)}</div>
  </FloatingOverlayPanel>;
}
