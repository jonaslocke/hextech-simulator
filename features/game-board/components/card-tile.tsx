import { FC } from "react";
import { Card } from "../types";

export const CardTile: FC<Card> = ({
  isExhausted,
  img,
  name,
}) => {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Card art comes from the catalog and local card back asset.
    <img
      alt={name}
      className={`block z-10 border border-white/15 rounded-md h-30 aspect-130/181 transition ${
        isExhausted ? "rotate-90" : ""
      }`}
      src={img}
    />
  );
};
