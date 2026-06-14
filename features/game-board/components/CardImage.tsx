"use client";

import { Card } from "@/server/catalog";
import { CSSProperties } from "react";

export function CardImage({
  card,
  className,
  style,
}: {
  card: Card;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- MVP intentionally renders set media.image_url directly.
    <img
      alt={card.media.accessibility_text ?? card.name}
      className={`rounded-md border border-black/60 shadow shadow-black/40 ${className ?? ""}`}
      src={card.media.image_url ?? ""}
      style={style}
    />
  );
}
