import { cn } from "@/lib/utils";
import { FC, PropsWithChildren } from "react";

interface Props extends PropsWithChildren {
  isCentered?: boolean;
}

// TODO
// add card amount counters to this component, we have three variants, non-existent, simple counting &
// exhausted/ready
//
// the name of the zone must be real subtle maybe like in battlefield component

export const ZoneArea: FC<Props> = ({ children, isCentered = false }) => {
  return (
    <div
      className={cn(
        // TODO
        // -space-x-  needs to be tied to the screen width from non-existent to -space-x-6
        "flex items-center -space-x-6 border border-white/15 rounded-md overflow-auto px-2",
        isCentered && "justify-center",
      )}
    >
      {children}
    </div>
  );
};
