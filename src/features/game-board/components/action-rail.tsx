"use client";

import { Button } from "@/shared/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/dropdown-menu";
import { cn } from "@/shared/utils/cn";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  History,
  Layers3,
  SkipForward,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./action-button";
import { ConcedeGameDialog } from "./concede-game-dialog";

type OpenableActionRailZone = Exclude<TemporaryZone, "chain">;

export function ActionRail({
  concedeDisabled = false,
  debugAction,
  disabled = false,
  isChainOpen = false,
  isChainLockedOpen = false,
  isReporting = false,
  onChainOpenChange,
  onConcede,
  onDebugAction,
  onPassTurn,
  onReportBug,
  openZone,
  passTurnDisabled = false,
  passTurnLabel = "Pass Turn",
  setOpenZone,
}: {
  concedeDisabled?: boolean;
  debugAction?: { disabled: boolean; disabledReason?: string | null; label: string };
  disabled?: boolean;
  isChainOpen?: boolean;
  isChainLockedOpen?: boolean;
  isReporting?: boolean;
  onChainOpenChange: (isOpen: boolean) => void;
  onConcede?: () => void | Promise<void>;
  onDebugAction?: () => void;
  onPassTurn?: () => void;
  onReportBug?: () => void;
  openZone: OpenableActionRailZone | null;
  passTurnDisabled?: boolean;
  passTurnLabel?: string;
  setOpenZone: (zone: OpenableActionRailZone | null) => void;
}) {
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const canPassTurn = Boolean(onPassTurn) && !passTurnDisabled && !disabled;
  const canConcede = Boolean(onConcede) && !concedeDisabled && !disabled;

  useEffect(() => {
    if (disabled) {
      setIsConcedeDialogOpen(false);
    }
  }, [disabled]);

  return (
    <>
      <aside
        aria-label="Game actions"
        className={cn(
          "relative flex flex-col items-center gap-3 border-l border-white/10",
          "bg-slate-950/25 supports-backdrop-filter:bg-slate-950/18 supports-backdrop-filter:backdrop-blur-md",
          "shadow-[inset_1px_0_0_rgba(255,255,255,0.035),-12px_0_32px_rgba(0,0,0,0.16)] ring-1 ring-white/5",
          "transition-[width] duration-200",
          isExpanded ? "w-52 px-3" : "w-16 px-2",
        )}
      >
        <Button
          aria-label={isExpanded ? "Collapse action bar" : "Expand action bar"}
          aria-expanded={isExpanded}
          className="mt-3 self-end"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          size="icon-xs"
          title={isExpanded ? "Collapse action bar" : "Expand action bar"}
          type="button"
          variant="ghost"
        >
          {isExpanded ? <ChevronRight /> : <ChevronLeft />}
        </Button>

        <div className="flex flex-1 flex-col justify-center gap-3 w-full">
          <ActionButton
            active={isChainOpen}
            collapsed={!isExpanded}
            disabled={disabled}
            label={isChainLockedOpen ? "Chain is resolving" : "Show Chain"}
            onClick={() =>
              onChainOpenChange(isChainLockedOpen ? true : !isChainOpen)
            }
          >
            <Layers3 className="size-5" />
          </ActionButton>

          <ActionButton
            active={openZone === "log"}
            collapsed={!isExpanded}
            disabled={disabled}
            label="Show Game Log"
            onClick={() => setOpenZone(openZone === "log" ? null : "log")}
          >
            <History className="size-5" />
          </ActionButton>

          <ActionButton
            active={false}
            collapsed={!isExpanded}
            disabled={!canPassTurn}
            isShortcutActive={!isConcedeDialogOpen}
            label={passTurnLabel}
            onClick={onPassTurn ?? (() => undefined)}
            shortcut="space"
            shortcutBadge="␣"
            shortcutLabel="Space"
          >
            <SkipForward className="size-5" />
          </ActionButton>
        </div>

        <div className="mb-3 flex flex-col gap-2 w-full">
          {onConcede && (
            <ActionButton
              active={false}
              collapsed={!isExpanded}
              disabled={!canConcede}
              label="Concede"
              onClick={() => setIsConcedeDialogOpen(true)}
              variant="concede"
            >
              <Flag className="size-5" />
            </ActionButton>
          )}

          {onReportBug && (debugAction && onDebugAction ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Report a Bug and admin tools"
                  className={cn(
                    "h-10 justify-start text-slate-100",
                    isExpanded ? "w-full px-3" : "w-10 justify-center px-0",
                  )}
                  title={isExpanded ? undefined : "Report a Bug and admin tools"}
                  type="button"
                  variant="secondary"
                >
                  <Flag aria-hidden="true" className="size-4 shrink-0" />
                  {isExpanded && <span>{isReporting ? "Reporting" : "Report a Bug"}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="left">
                <DropdownMenuItem onSelect={onReportBug}>
                  <Flag aria-hidden="true" />
                  Report a Bug
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={debugAction.disabled}
                  onSelect={onDebugAction}
                  title={debugAction.disabledReason ?? undefined}
                >
                  <Wrench aria-hidden="true" />
                  {debugAction.label}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              aria-label="Report a Bug"
              className={cn(
                "h-10 justify-start text-slate-100",
                isExpanded ? "w-full px-3" : "w-10 justify-center px-0",
              )}
              onClick={onReportBug}
              title={isExpanded ? undefined : "Report a Bug"}
              type="button"
              variant="secondary"
            >
              <Flag aria-hidden="true" className="size-4 shrink-0" />
              {isExpanded && <span>{isReporting ? "Reporting" : "Report a Bug"}</span>}
            </Button>
          ))}
        </div>
      </aside>

      {onConcede && (
        <ConcedeGameDialog
          disabled={!canConcede}
          isOpen={isConcedeDialogOpen}
          onConcede={onConcede}
          onOpenChange={setIsConcedeDialogOpen}
        />
      )}
    </>
  );
}
