"use client";

import { cn } from "@/shared/utils/cn";

export function ScoreTrack({
  opponentScore,
  playerScore,
  victoryScore,
}: {
  opponentScore: number;
  playerScore: number;
  victoryScore: number;
}) {
  const maximum = Math.max(victoryScore, opponentScore, playerScore);
  const ascending = Array.from({ length: maximum + 1 }, (_, index) => index);
  const scoreValues = [...ascending, ...ascending.slice(0, -1).reverse()];
  const centerIndex = maximum;

  return (
    <div
      aria-label={`Score track. Player ${playerScore}, opponent ${opponentScore}. Victory Score ${victoryScore}.`}
      className={cn(
        "relative flex items-center gap-1 px-2 py-1 border border-white/10 rounded-full",
        "bg-slate-950/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.20)]",
        "supports-backdrop-filter:bg-slate-950/18 supports-backdrop-filter:backdrop-blur-md",
      )}
      role="group"
    >
      <div
        aria-hidden="true"
        className="top-1/2 absolute inset-x-3 bg-white/10 h-px -translate-y-1/2 pointer-events-none"
      />
      {scoreValues.map((value, index) => {
        const isCenter = index === centerIndex;
        const isPlayerSide = index <= centerIndex;
        const isOpponentSide = index >= centerIndex;
        const active =
          (isPlayerSide && value === playerScore) ||
          (isOpponentSide && value === opponentScore);

        return (
          <div
            aria-current={active ? "step" : undefined}
            aria-label={getScoreLabel({
              active,
              centerIndex,
              index,
              opponentScore,
              playerScore,
              value,
            })}
            className={cn(
              "z-10 relative flex justify-center items-center rounded-full font-mono font-bold tabular-nums transition-[background-color,border-color,box-shadow,color,transform] duration-300 ease-out shrink-0",
              isCenter ? "size-9 text-base" : "size-7 text-sm",
              active
                ? cn(
                    "bg-amber-300 border border-amber-100/80 text-slate-950",
                    "shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_18px_rgba(251,191,36,0.28),inset_0_1px_0_rgba(255,255,255,0.45)]",
                    isCenter && "scale-[1.03]",
                  )
                : cn(
                    "bg-slate-950/35 border border-white/18 text-slate-100/85",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_10px_rgba(0,0,0,0.20)]",
                    "supports-backdrop-filter:bg-white/8",
                    isCenter && "border-white/25 bg-white/12 text-white",
                  ),
            )}
            key={`${value}-${index}`}
            role="img"
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

function getScoreLabel({
  active,
  centerIndex,
  index,
  opponentScore,
  playerScore,
  value,
}: {
  active: boolean;
  centerIndex: number;
  index: number;
  opponentScore: number;
  playerScore: number;
  value: number;
}) {
  const owner =
    index < centerIndex
      ? "player"
      : index > centerIndex
        ? "opponent"
        : "shared center";

  if (!active) {
    return `${owner} score ${value}`;
  }

  const activeOwners = [];

  if (index <= centerIndex && value === playerScore) {
    activeOwners.push("player");
  }

  if (index >= centerIndex && value === opponentScore) {
    activeOwners.push("opponent");
  }

  return `Current ${activeOwners.join(" and ")} score ${value}`;
}
