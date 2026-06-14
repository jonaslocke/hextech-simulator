import { FC, useState } from "react";
import { Card } from "../types";
import { cn } from "@/lib/utils";

export const CardTile: FC<Card> = ({
  comesToPlayReady,
  isExhausted,
  img,
  name,
}) => {
  const [exhausted, setExhausted] = useState(isExhausted);
  return (
    <img
      className={cn(
        "block z-10 border border-white/15 rounded-md h-30 aspect-130/181 transition",
        exhausted && "rotate-90",
      )}
      onClick={() => setExhausted(!exhausted)}
      src={img}
    />
  );
};
