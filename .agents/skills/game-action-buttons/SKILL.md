---
name: game-action-buttons
description: Apply the Hextech semantic gameplay CTA and keybind component when a gameplay workflow needs a primary, secondary, tertiary, quaternary, or cancel action.
---

# Game Action Buttons

Use `GameActionButton` for a gameplay intent that should be keyboard-accessible.
It is the standard CTA layer for decisions, chain/showdown actions, combat,
setup, confirmation, and gameplay-flow continuation.

```tsx
import { GameActionButton } from "@/features/game-board/components/game-action-button";
```

Use semantic slots rather than physical keys:

```text
primary     J
secondary   K
tertiary    L
quaternary  U
cancel      Esc
```

## Use it when

- a player submits, resolves, confirms, cancels, or advances a gameplay flow;
- a gameplay dialog or overlay needs a discoverable shortcut; or
- several actions in one gameplay surface need semantic priority.

Use the local shadcn-style `Button` or existing feature control for navigation,
toggles, list items, card options, and other non-gameplay utility controls.

## Integration rules

- Use `primary` for the main submit/resolve action and `cancel` for close/back.
- Use `isBusy` for submission and `disabled` for unavailable actions.
- Use `isActive` for dialogs or overlays so shortcuts apply only while visible.
- Remove a migrated CTA's duplicate manual keyboard listener and detached key
  hint. Keep unrelated shortcuts for non-button controls.
- Keep visual overrides narrow and preserve existing surface treatment.

`GameActionButton` handles editable targets, modifiers, repeat events, disabled
state, key hints, and `aria-keyshortcuts`; callers must not reimplement them.
