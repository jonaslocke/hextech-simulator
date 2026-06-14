"use client";

import cardBackImage from "../../../assets/cardback.jpg";

export function CardBack({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Local static asset is used directly for the MVP board preview.
    <img
      alt="Hidden card"
      className={`aspect-744/1039 rounded-md border border-black/60 object-cover shadow shadow-black/30 ${className}`}
      src={cardBackImage.src}
    />
  );
}
