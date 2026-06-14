"use client";

import { FC, useState } from "react";
import { ActionRail } from "./components/ActionRail";
import { ScoreHeader } from "./components/ScoreHeader";
import { BattlefieldBoard } from "./components/battlefield-board";
import { PlayerBoard } from "./components/player-board";
import { GameObject } from "./types";

type TemporaryZone = "chain" | "banish" | "log" | null;

// this GameObject is a middle man for the real game state, you need to adapt it to consume gameSchema
// my focus here is on placing the objects in the right place, you can update this definition regarding objects and how this component consumes them
// but you can not change the UI shape, the UI shape needs to keep as it is
// from what I'm seeing currently the game object is a pseudo one, I will create one as close to really as I can, part of your job is validate this hypothesis
export const GameBoard: FC<GameObject> = ({ opponent, player }) => {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);

  return (
    <main className="flex flex-col h-screen text-slate-100">
      <ScoreHeader opponent={opponent} player={player} />
      <section className="flex flex-1">
        <div className="flex-1 gap-2 grid grid-rows-[146px_minmax(0,1fr)_calc(100vh/3)_minmax(0,1fr)_146px] p-2">
          <PlayerBoard isMirrored />
          <div className="flex gap-2">
            <BattlefieldBoard
              battlefield={player.battlefield}
              owner="player"
              showdownState="neutral"
            />
            <BattlefieldBoard
              battlefield={opponent.battlefield}
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
};
