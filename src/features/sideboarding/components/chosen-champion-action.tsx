import { Crown } from "lucide-react";
import { Button } from "@/shared/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/tooltip";

export function ChosenChampionAction({
  cardName,
  className,
  disabled,
  isCurrent,
  isEligible,
  onSelect,
  visibleOnArtwork = false,
}: {
  cardName: string;
  className?: string;
  disabled: boolean;
  isCurrent: boolean;
  isEligible: boolean;
  onSelect: () => void;
  visibleOnArtwork?: boolean;
}) {
  const tooltip = isCurrent
    ? "Current Chosen Champion"
    : isEligible
      ? "Set as Chosen Champion"
      : "Not eligible as Chosen Champion";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>
            <Button
              aria-label={
                isCurrent
                  ? `${cardName} is the current Chosen Champion`
                  : `Set ${cardName} as Chosen Champion`
              }
              className={[
                visibleOnArtwork
                  ? "h-8 w-8 border border-slate-950/40 bg-slate-950/90 shadow-lg hover:bg-slate-900"
                  : "",
                isCurrent ? "text-amber-200" : "",
              ].join(" ")}
              disabled={disabled || !isEligible || isCurrent}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              size={visibleOnArtwork ? "icon-sm" : "icon-xs"}
              type="button"
              variant={isCurrent ? "default" : "secondary"}
            >
              <Crown
                className={visibleOnArtwork ? "h-4 w-4" : "h-3 w-3"}
                fill={isCurrent ? "currentColor" : "none"}
              />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
