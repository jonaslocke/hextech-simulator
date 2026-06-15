import { cn } from "@/lib/utils";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  isCentered?: boolean;
  isHightlighted?: boolean;
}

export const ZoneArea: FC<Props> = ({
  children,
  isCentered = false,
  isHightlighted = false,
}) => {
  return (
    <div
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
