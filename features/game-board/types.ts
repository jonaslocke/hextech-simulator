import { ComponentProps } from "react";
import { BattlefieldBoard } from "./components/battlefield-board";

export type TemporaryZone = "chain" | "banish" | "log" | null;

export type PlayerData = {
  name: string;
  score: number;
  battlefield: ComponentProps<typeof BattlefieldBoard>["battlefield"];
};
export interface GameScore {
  player: PlayerData;
  opponent: PlayerData;
}

export type Card = {
  name: string;
  img: HTMLImageElement["src"];
  might?: number;
  isExhausted?: boolean;
  comesToPlayReady?: boolean;
};

export interface GameObject extends GameScore {}
