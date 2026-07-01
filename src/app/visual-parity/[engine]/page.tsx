import { notFound } from "next/navigation";
import { VisualParityBoard } from "@/features/visual-parity/components/visual-parity-board";

export default async function VisualParityPage({
  params,
  searchParams
}: {
  params: Promise<{ engine: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.VISUAL_PARITY !== "1") notFound();
  const { engine } = await params;
  const { variant = "normal" } = await searchParams;
  if (engine !== "legacy" && engine !== "v2") notFound();
  if (!(["normal", "chain", "showdown", "hand-small", "hand-large"] as const).includes(
    variant as "normal" | "chain" | "showdown" | "hand-small" | "hand-large"
  )) notFound();
  return (
    <VisualParityBoard
      engine={engine}
      variant={variant as "normal" | "chain" | "showdown" | "hand-small" | "hand-large"}
    />
  );
}
