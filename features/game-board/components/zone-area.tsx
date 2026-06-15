import { cn } from "@/lib/utils";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  isCentered?: boolean;
}

export const ZoneArea: FC<Props> = ({ children, isCentered = false }) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border border-white/15 rounded-md overflow-auto px-2",
        isCentered && "justify-center",
      )}
    >
      {children}
    </div>
  );
};
