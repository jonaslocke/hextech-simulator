"use client";

import { ComponentProps, useState } from "react";
import { ActionRail } from "./components/ActionRail";
import { ScoreHeader } from "./components/ScoreHeader";
import { BattlefieldBoard } from "./components/battlefield-board";
import { PlayerBoard } from "./components/player-board";

const EMPERORS_DAIS = {
  name: "Emperor's Dais",
  description:
    "When you conquer here, you may pay [1] and return a unit you control here to its owner's hand. If you do, play a 2 [Might] Sand Soldier unit token here.",
  opponentUnits: [],
  playerUnits: [],
  img: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c1ea4f6f58a62fc2b62647aa3459109e3d10297a-1039x744.png",
} as ComponentProps<typeof BattlefieldBoard>["battlefield"];

const ASPIRANTS_CLIMB = {
  name: "Aspirant's Climb",
  description: "Increase the points needed to win the game by 1.",
  opponentUnits: [],
  playerUnits: [],
  img: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/9301593f3800e68427469d38181b578a672473c3-1038x744.png",
} as ComponentProps<typeof BattlefieldBoard>["battlefield"];

type TemporaryZone = "chain" | "banish" | "log" | null;

export function BoardPreview() {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);

  return (
    <main className="flex flex-col h-screen text-slate-100">
      <ScoreHeader playerScore={0} opponentScore={1} />
      <section className="flex flex-1">
        <div className="flex-1 gap-2 grid grid-rows-[146px_minmax(0,1fr)_calc(100vh/3)_minmax(0,1fr)_146px] p-2">
          <PlayerBoard />
          <div className="flex gap-2">
            <BattlefieldBoard
              battlefield={EMPERORS_DAIS}
              owner="player"
              showdownState="neutral"
            />
            <BattlefieldBoard
              battlefield={ASPIRANTS_CLIMB}
              owner="player"
              showdownState="neutral"
            />
          </div>
          <PlayerBoard />
        </div>
        <ActionRail openZone={openZone} setOpenZone={setOpenZone} />
      </section>
    </main>
  );
}
