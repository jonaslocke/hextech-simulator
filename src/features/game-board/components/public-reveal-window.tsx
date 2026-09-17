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
    if (fresh.length) {
      setVisible((current) => [...current, ...fresh]);
    }
  }, [reveals]);

  return (
    <FloatingOverlayPanel
      isOpen={visible.length > 0}
      onClose={() => setVisible([])}
      title="Revealed cards"
      closeLabel="Close revealed cards"
      placement="secondary"
    >
      <div className="space-y-4" aria-live="polite">
        {visible.map((reveal) => (
          <section key={reveal.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-100">
                {getRevealSource(reveal.message)}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {reveal.cards.length} revealed
              </span>
            </div>

            <ZoneCards
              emptyLabel="No revealed cards"
              cards={reveal.cards.map((card) => ({
                instanceId: card.instanceId,
                name: card.name,
                img: card.imageUrl ?? "",
                type: card.type,
                rulesText: card.rulesText,
                domains: card.domains,
                publicCode: card.publicCode,
              }))}
            />
          </section>
        ))}
      </div>
    </FloatingOverlayPanel>
  );
}

function getRevealSource(message: string) {
  return message.match(/^(.+?)\s+revealed\b/i)?.[1] ?? "Reveal";
}
