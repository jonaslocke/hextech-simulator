import { cn } from "@/lib/utils";
import { FC } from "react";
import { BattlefieldData } from "../types";
import { CardTile } from "./card-tile";

type Props = {
  battlefield: BattlefieldData;
  owner: "player" | "opponent";
  showdownState?: "neutral" | "open" | "deferred"; //tied to the game state open or neutral - 'deferred' due to be smaller when other BF is on showdown state open -- betternaming is needed
};

export const BattlefieldBoard: FC<Props> = ({
  battlefield: { description, name, opponentUnits, playerUnits, img },
  owner,
  showdownState = "neutral",
}) => {
  const playerTotalMight = playerUnits.reduce(
    (acc, cur) => acc + (cur.might ?? 0),
    0,
  );
  const opponentTotalMight = opponentUnits.reduce(
    (acc, cur) => acc + (cur.might ?? 0),
    0,
  );
  const hasMightToShow = playerTotalMight + opponentTotalMight > 0;
  return (
    <div
      data-owner={owner}
      className={cn(
        "relative grid grid-rows-[minmax(0,1fr)_36px] bg-white/5 rounded-md overflow-hidden",
        showdownState === "neutral" && "w-1/2",
        showdownState === "open" && "w-3/5",
        showdownState === "deferred" && "w-2/5",
      )}
    >
      <div
        className="absolute bg-center brightness-[0.35] saturate-[0.85] w-full h-full scale-180"
        style={{
          backgroundImage: `url(${img})`,
        }}
      />
      <div className="relative grid grid-rows-2 p-2">
        <div className="top-1 left-2 z-99 absolute bg-black/50 px-1 py-0.5 text-[10px] uppercase">
          {name}
        </div>
        {/* this might work better with a monospaced font */}
        {hasMightToShow && (
          <div className="top-[50%] right-0 absolute flex flex-col items-center bg-yellow-300 p-0.5 text-[10px] text-black/80 translate-y-[-50%]">
            <div className="p-0.5 leading-[100%]">{opponentTotalMight}</div>
            <div className="font-extrabold text-[8px] leading-[100%]">VS</div>
            <div className="p-0.5 leading-[100%]">{playerTotalMight}</div>
          </div>
        )}
        {/* opponent's units */}
        <div className="flex flex-wrap items-end pb-2 border-white/10 border-b border-dashed overflow-auto">
          {opponentUnits.map((unit, index) => (
            <CardTile key={unit.instanceId ?? `${unit.name}-${index}`} {...unit} />
          ))}
        </div>
        {/* player's units */}
        <div className="flex pt-2">
          {playerUnits.map((unit, index) => (
            <CardTile key={unit.instanceId ?? `${unit.name}-${index}`} {...unit} />
          ))}
        </div>
      </div>
      <div className="relative h-9">
        <div className="bottom-0 hover:absolute flex justify-center items-center bg-white/15 px-2 hover:py-2 rounded-b-md w-full h-full hover:h-auto text-[10px] hover:text-base text-center transition">
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
};
