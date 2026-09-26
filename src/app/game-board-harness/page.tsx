import { notFound } from "next/navigation";
import { GameBoardFixture } from "@/features/game-board/dev/game-board-fixture";

export default function GameBoardHarnessPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GameBoardFixture />;
}
