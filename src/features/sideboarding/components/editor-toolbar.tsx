import { Grid2X2, Layers3, List } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/shared/components/button";
import type { SideboardingEditorMode } from "../sideboarding-types";

export function EditorToolbar({
  mode,
  onModeChange,
}: {
  mode: SideboardingEditorMode;
  onModeChange: (mode: SideboardingEditorMode) => void;
}) {
  return (
    <div className="top-0 z-10 sticky flex justify-between items-center gap-3 bg-slate-950/90 backdrop-blur px-3 py-2 border-white/10 border-b">
      <div>
        <h2 className="font-semibold text-slate-100 text-sm">Cards</h2>
        <p className="text-[11px] text-slate-500">Sort: Energy</p>
      </div>
      <div className="inline-flex bg-white/5 p-1 border border-white/10 rounded-md">
        <ModeButton
          active={mode === "compact"}
          icon={<List className="w-3.5 h-3.5" />}
          label="List"
          onClick={() => onModeChange("compact")}
        />
        <ModeButton
          active={mode === "grid"}
          icon={<Grid2X2 className="w-3.5 h-3.5" />}
          label="Grouped"
          onClick={() => onModeChange("grid")}
        />
        <ModeButton
          active={mode === "allCards"}
          icon={<Layers3 className="w-3.5 h-3.5" />}
          label="All cards"
          onClick={() => onModeChange("allCards")}
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="gap-1.5 px-2"
      onClick={onClick}
      size="xs"
      type="button"
      variant={active ? "default" : "ghost"}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </Button>
  );
}
