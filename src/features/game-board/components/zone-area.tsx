import { cn } from "@/shared/utils/cn";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  animationZoneId?: string;
  isCentered?: boolean;
  isHightlighted?: boolean;
}

export const ZoneArea: FC<Props> = ({
  animationZoneId,
  children,
  isCentered = false,
  isHightlighted = false,
}) => {
  return (
    <div
      data-zone-animation-id={animationZoneId}
      className={cn(
        "flex items-center gap-2 px-2 border rounded-md overflow-auto",
        isCentered && "justify-center",
        isHightlighted ? "border-[#88F6F6]" : "border-white/15",
      )}
    >
      {children}
    </div>
  );
};
