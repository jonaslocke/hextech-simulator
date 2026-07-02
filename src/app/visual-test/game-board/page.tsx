import { notFound } from "next/navigation";
import {
  GameBoardVisualFixture,
  type GameBoardVisualVariant
} from "@/features/game-board/components/game-board-visual-fixture";

const VARIANTS: GameBoardVisualVariant[] = [
  "normal",
  "chain",
  "showdown",
  "hand-small",
  "hand-large"
];

export default async function GameBoardVisualTestPage({
  searchParams
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.VISUAL_TEST !== "1") notFound();

  const { variant = "normal" } = await searchParams;

  if (!VARIANTS.includes(variant as GameBoardVisualVariant)) notFound();

  return (
    <GameBoardVisualFixture variant={variant as GameBoardVisualVariant} />
  );
}
