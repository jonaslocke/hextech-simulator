import { cn } from "@/shared/utils/cn";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  animationZoneId?: string;
  isCentered?: boolean;
  isHightlighted?: boolean;
  totalCardsCount?: {
    ready: number;
    exhausted: number;
  };
}

export const ZoneArea: FC<Props> = ({
  animationZoneId,
  children,
  isCentered = false,
  isHightlighted = false,
  totalCardsCount,
}) => {
  const hasTotalCardsCount = !totalCardsCount
    ? false
    : Object.values(totalCardsCount).reduce((acc, cur) => acc + cur, 0) > 0;
  return (
    <div
      data-zone-animation-id={animationZoneId}
      className={cn(
        "relative flex items-center gap-2 px-2 border rounded-md overflow-auto",
        isCentered && "justify-center",
        isHightlighted ? "border-[#88F6F6]" : "border-white/15",
      )}
    >
      {hasTotalCardsCount && (
        <div className="top-1 right-1 absolute font-mono text-[10px] text-white/65">{`${totalCardsCount?.exhausted}/${totalCardsCount?.ready}`}</div>
      )}
      {children}
    </div>
  );
};
