import { BoardSlot } from "./BoardSlot";
import { CardBack } from "./CardBack";
import { CountBadge } from "./CountBadge";

export function DeckSlot({ count, title }: { count: number; title: string }) {
  return (
    <BoardSlot title={title}>
      <div className="flex justify-center items-center h-full">
        <div className="relative">
          <CardBack className="w-20" />
          <CountBadge value={count} />
        </div>
      </div>
    </BoardSlot>
  );
}
