// score-track.tsx
"use client";

import { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/utils/cn";

type ScoreOwner = "player" | "opponent" | "shared";
type ActiveScoreOwner = "player" | "opponent";

const SCORE_MARKER_TRANSITION = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
} as const;

export function ScoreTrack({
  opponentAccent = "var(--opponent-accent)",
  opponentScore,
  playerAccent = "var(--player-accent)",
  playerScore,
  victoryScore,
}: {
  opponentAccent?: string;
  opponentScore: number;
  playerAccent?: string;
  playerScore: number;
  victoryScore: number;
}) {
  const prefersReducedMotion = useReducedMotion();

  const maximum = Math.max(victoryScore, opponentScore, playerScore);
  const ascending = Array.from({ length: maximum + 1 }, (_, index) => index);
  const scoreValues = [...ascending, ...ascending.slice(0, -1).reverse()];
  const centerIndex = maximum;

  const markerTransition = prefersReducedMotion
    ? { duration: 0 }
    : SCORE_MARKER_TRANSITION;

  return (
    <div
      aria-label={`Score track. Player ${playerScore}, opponent ${opponentScore}. Victory score ${victoryScore}.`}
      className={cn(
        "z-10 relative flex items-center gap-1 px-2 py-1 rounded-full select-none",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.20)]",
        "bg-slate-600/30 supports-backdrop-filter:bg-slate-600/18 supports-backdrop-filter:backdrop-blur-md border border-white/10",
      )}
      role="group"
    >
      <div
        aria-hidden="true"
        className="top-1/2 absolute inset-x-3 bg-linear-to-r from-white/5 via-white/16 to-white/5 h-px -translate-y-1/2 pointer-events-none"
      />

      {scoreValues.map((value, index) => {
        const isCenter = index === centerIndex;
        const owner = getScoreOwner(index, centerIndex);
        const activeOwner = getActiveScoreOwner({
          centerIndex,
          index,
          opponentScore,
          playerScore,
          value,
        });

        const active = activeOwner !== null;
        const accent =
          activeOwner === "opponent" ? opponentAccent : playerAccent;

        const markerStyle = active
          ? ({
              "--score-accent": accent,
            } as CSSProperties)
          : undefined;

        return (
          <motion.div
            aria-current={active ? "step" : undefined}
            aria-label={getScoreLabel({
              activeOwner,
              owner,
              value,
            })}
            animate={{
              scale: active ? (isCenter ? 1.04 : 1.02) : 1,
            }}
            className={cn(
              "z-10 relative flex justify-center items-center rounded-full overflow-hidden font-mono font-bold tabular-nums shrink-0",
              "transition-[border-color,color] duration-300 ease-out",
              "before:pointer-events-none before:absolute before:inset-0.5 before:z-10 before:rounded-full before:border before:border-white/8",
              isCenter ? "size-9 text-base" : "size-7 text-sm",
              active
                ? cn(
                    "border border-transparent text-(--score-accent)",
                    "shadow-[0_0_0_1px_color-mix(in_srgb,var(--score-accent)_22%,transparent),0_0_14px_color-mix(in_srgb,var(--score-accent)_18%,transparent)]",
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
            style={markerStyle}
            transition={markerTransition}
          >
            {active ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 border rounded-full"
                layoutId={`score-track-active-${activeOwner}`}
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, var(--score-accent) 34%, rgba(15,23,42,0.92)), color-mix(in srgb, var(--score-accent) 18%, rgba(2,6,23,0.96)))",
                  borderColor: "var(--score-accent)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.18), 0 0 18px color-mix(in srgb, var(--score-accent) 24%, transparent)",
                }}
                transition={markerTransition}
              />
            ) : null}

            <span className="z-20 relative">{value}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function getScoreOwner(index: number, centerIndex: number): ScoreOwner {
  if (index < centerIndex) {
    return "player";
  }

  if (index > centerIndex) {
    return "opponent";
  }

  return "shared";
}

function getActiveScoreOwner({
  centerIndex,
  index,
  opponentScore,
  playerScore,
  value,
}: {
  centerIndex: number;
  index: number;
  opponentScore: number;
  playerScore: number;
  value: number;
}): ActiveScoreOwner | null {
  if (index < centerIndex && value === playerScore) {
    return "player";
  }

  if (index > centerIndex && value === opponentScore) {
    return "opponent";
  }

  if (index === centerIndex) {
    if (value === playerScore && value !== opponentScore) {
      return "player";
    }

    if (value === opponentScore && value !== playerScore) {
      return "opponent";
    }

    if (value === playerScore) {
      return "player";
    }
  }

  return null;
}

function getScoreLabel({
  activeOwner,
  owner,
  value,
}: {
  activeOwner: ActiveScoreOwner | null;
  owner: ScoreOwner;
  value: number;
}) {
  if (!activeOwner) {
    return `${owner} score ${value}`;
  }

  return `Current ${activeOwner} score ${value}`;
}
