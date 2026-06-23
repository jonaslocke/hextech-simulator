"use client";

export function ScoreTrack({
  opponentScore,
  playerScore,
}: {
  opponentScore: number;
  playerScore: number;
}) {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="flex items-center gap-1">
      {values.map((value, index) => {
        const active =
          (index <= 8 && value === playerScore) ||
          (index >= 8 && value === opponentScore);

        return (
          <div
            key={`${value}-${index}`}
            className={`flex size-7 items-center justify-center rounded-md border-2 text-sm font-bold ${
              active
                ? "border-yellow-300 bg-white text-slate-950"
                : "border-black bg-slate-100 text-slate-950"
            } ${value === 8 ? "size-10 text-lg" : ""}`}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

