"use client";

import { type ReactNode, useState } from "react";
import { Checkbox } from "@/shared/components/checkbox";
import {
  DEFAULT_GAME_ACTION_KEYBINDS,
  GameActionButton,
  GameActionSplitButton,
} from "@/features/game-board/components/game-action-button";
import { cn } from "@/shared/utils/cn";

export default function GameActionButtonQaPage() {
  const [lastAction, setLastAction] = useState("No action yet.");

  function record(action: string) {
    setLastAction(action);
  }

  return (
    <main className="bg-[#050b14] p-6 min-h-screen text-slate-100">
      <div className="gap-6 grid mx-auto max-w-5xl">
        <header className="bg-white/4 shadow-2xl shadow-black/30 p-5 border border-white/10 rounded-2xl">
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
            Visual QA
          </p>

          <h1 className="mt-2 font-bold text-2xl">
            Gameplay CTA Button System
          </h1>

          <p className="mt-2 max-w-3xl text-slate-400 text-sm leading-6">
            Isolated page for reviewing compact gameplay action buttons,
            semantic keybind hints, disabled states, destructive styling,
            split-button layouts, and contextual help sidecars. Keyboard
            listeners are disabled here because this page intentionally renders
            repeated semantic slots.
          </p>

          <div className="bg-cyan-300/10 mt-4 px-3 py-2 border border-cyan-300/20 rounded-xl text-cyan-100 text-xs">
            Last visual action:{" "}
            <span className="font-semibold">{lastAction}</span>
          </div>
        </header>

        <QaSection
          description="Primary gameplay CTAs now use the amber treatment by default, matching the current Focus prompt direction."
          title="Recommended compact gameplay CTA"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              keyboardEnabled={false}
              onAction={() => record("Pass Focus / J")}
            >
              Pass Focus
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              keyboardEnabled={false}
              onAction={() => record("Submit order / J")}
            >
              Submit order
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              disabled
              keyboardEnabled={false}
              onAction={() => record("Disabled primary")}
            >
              Waiting
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="The component still supports the cyan treatment used by the current Chain overlay through className overrides."
          title="Current Chain cyan treatment"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              className="bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 text-slate-950"
              keyboardEnabled={false}
              keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
              onAction={() => record("Cyan pass priority / J")}
            >
              Pass Priority
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              className="bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 text-slate-950"
              keyboardEnabled={false}
              keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
              onAction={() => record("Cyan submit order / J")}
            >
              Submit order
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              className="bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 text-slate-950"
              disabled
              keyboardEnabled={false}
              keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
              onAction={() => record("Disabled cyan")}
            >
              Waiting
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="All semantic action slots using the default keybind constants."
          title="Semantic slots"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              keyboardEnabled={false}
              onAction={() => record("Primary")}
            >
              Primary action
            </GameActionButton>

            <GameActionButton
              actionSlot="secondary"
              keyboardEnabled={false}
              onAction={() => record("Secondary")}
              variant="secondary"
            >
              Secondary action
            </GameActionButton>

            <GameActionButton
              actionSlot="tertiary"
              keyboardEnabled={false}
              onAction={() => record("Tertiary")}
              variant="outline"
            >
              Tertiary action
            </GameActionButton>

            <GameActionButton
              actionSlot="quaternary"
              keyboardEnabled={false}
              onAction={() => record("Quaternary")}
              variant="ghost"
            >
              Quaternary action
            </GameActionButton>

            <GameActionButton
              actionSlot="cancel"
              keyboardEnabled={false}
              onAction={() => record("Cancel")}
              variant="secondary"
            >
              Cancel
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="Cancel is a semantic slot. Destructive is only a visual variant for dangerous actions."
          title="Cancel versus destructive"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="cancel"
              keyboardEnabled={false}
              onAction={() => record("Neutral cancel")}
              variant="secondary"
            >
              Cancel targeting
            </GameActionButton>

            <GameActionButton
              actionSlot="cancel"
              keyboardEnabled={false}
              onAction={() => record("Destructive cancel")}
              variant="destructive"
            >
              Concede game
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="Busy and disabled states keep the same compact footprint and still show the semantic key hint for recognition."
          title="Disabled and busy states"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              disabled
              keyboardEnabled={false}
              onAction={() => record("Disabled")}
            >
              Disabled
            </GameActionButton>

            <GameActionButton
              actionSlot="primary"
              isBusy
              keyboardEnabled={false}
              onAction={() => record("Busy")}
            >
              Submitting…
            </GameActionButton>

            <GameActionButton
              actionSlot="secondary"
              disabled
              keyboardEnabled={false}
              onAction={() => record("Disabled secondary")}
              variant="secondary"
            >
              Waiting
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="Split button for surfaces with one obvious primary action and secondary alternatives hidden in a shadcn dropdown menu."
          title="Split button"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionSplitButton
              keyboardEnabled={false}
              primaryAction={{
                actionSlot: "primary",
                label: "Pass priority",
                onAction: () => record("Split primary"),
              }}
              secondaryActions={[
                {
                  actionSlot: "secondary",
                  label: "Pass and resolve",
                  onAction: () => record("Split secondary"),
                },
                {
                  actionSlot: "tertiary",
                  label: "Toggle auto-pass",
                  onAction: () => record("Split tertiary"),
                },
              ]}
            />

            <GameActionSplitButton
              helpLabel="Pass priority help"
              helpText="Pass priority now, while keeping access to secondary actions in the dropdown."
              keyboardEnabled={false}
              primaryAction={{
                actionSlot: "primary",
                label: "Pass Priority",
                onAction: () => record("Split with help primary"),
              }}
              secondaryActions={[
                {
                  actionSlot: "secondary",
                  label: "Pass and resolve",
                  onAction: () => record("Split with help secondary"),
                },
                {
                  actionSlot: "tertiary",
                  label: "Toggle auto-pass",
                  onAction: () => record("Split with help tertiary"),
                },
              ]}
            />
          </div>
        </QaSection>

        <QaSection
          description="A near-copy of the compact Chain overlay action row, using the GameActionButton helpText sidecar on the main action."
          title="Chain-inspired compact row"
        >
          <div className="bg-slate-950/90 shadow-2xl shadow-black/40 p-3 border border-white/10 rounded-2xl max-w-xl">
            <div className="flex items-center gap-2">
              <label
                className={cn(
                  "flex items-center gap-1.5 bg-white/6 px-2 border border-white/10 rounded-lg w-37 h-9 text-left transition shrink-0",
                  "hover:bg-white/9",
                )}
              >
                <Checkbox />

                <span className="font-semibold text-slate-100 text-xs whitespace-nowrap cursor-pointer">
                  Auto-pass
                </span>

                <span className="bg-white/10 ml-auto px-1.5 py-0.5 border border-white/15 rounded text-[10px] text-slate-300">
                  L
                </span>
              </label>

              <GameActionButton
                actionSlot="primary"
                className="flex-1 justify-center bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 min-w-0 text-slate-950"
                fullWidth
                helpLabel="Pass priority help"
                helpText="Pass priority without adding anything to the chain. If both players pass in sequence, the next chain item resolves."
                keyboardEnabled={false}
                keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
                onAction={() => record("Chain row pass priority")}
              >
                Pass Priority
              </GameActionButton>
            </div>
          </div>
        </QaSection>

        <QaSection
          description="Contextual help can be attached to a single gameplay CTA without nesting an interactive icon inside the button."
          title="Single CTA with help sidecar"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              helpLabel="Pass Focus help"
              helpText="Pass Focus when you do not want to play an Action or Reaction during this Focus window."
              keyboardEnabled={false}
              onAction={() => record("Pass Focus with help")}
            >
              Pass Focus
            </GameActionButton>

            <GameActionButton
              actionSlot="cancel"
              helpLabel="Cancel targeting help"
              helpText="Cancel the current targeting flow and return to the previous decision state, when the game rules allow it."
              keyboardEnabled={false}
              onAction={() => record("Cancel targeting with help")}
              variant="secondary"
            >
              Cancel targeting
            </GameActionButton>
          </div>
        </QaSection>

        <QaSection
          description="The API can accept a future keybind map without changing callers from semantic action slots to physical keys."
          title="Future keybind map override"
        >
          <div className="flex flex-wrap items-center gap-3">
            <GameActionButton
              actionSlot="primary"
              keyboardEnabled={false}
              keybinds={{
                ...DEFAULT_GAME_ACTION_KEYBINDS,
                primary: "enter",
              }}
              onAction={() => record("Primary override")}
            >
              Confirm
            </GameActionButton>

            <GameActionButton
              actionSlot="cancel"
              keyboardEnabled={false}
              keybinds={{
                ...DEFAULT_GAME_ACTION_KEYBINDS,
                cancel: "backspace",
              }}
              onAction={() => record("Cancel override")}
              variant="secondary"
            >
              Back
            </GameActionButton>
          </div>
        </QaSection>
      </div>
    </main>
  );
}

function QaSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="bg-white/4.5 shadow-black/20 shadow-xl p-5 border border-white/10 rounded-2xl">
      <div className="mb-4">
        <h2 className="font-semibold text-slate-100 text-base">{title}</h2>

        <p className="mt-1 max-w-3xl text-slate-400 text-sm leading-6">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}
