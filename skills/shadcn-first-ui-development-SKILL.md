---
name: shadcn-first-ui-development
description: Build or refactor Hextech UI by reusing local shadcn-style primitives for standard application controls while allowing custom game-board interactions.
---

# shadcn-First UI Development

Use this skill for UI work in Hextech.

## Decision rule

For standard application UI—forms, dialogs, alerts, menus, selects, inputs,
tables, tooltips, and navigation—inspect the local primitives in
`src/shared/components` and `components.json` before creating a custom control.
Compose or wrap an existing primitive when it satisfies the interaction.

Custom feature components are appropriate when the interaction is proprietary
to the simulator: board zones, card fans, spatial layouts, targeting,
drag-and-drop, animation, or game-state visualization. Even there, reuse local
primitives for ordinary controls such as confirmations, menus, tooltips, and
inputs where they fit.

## Ownership and implementation

- Put generic reusable controls in `src/shared/components`.
- Put game/domain UI in its owning feature; game-board UI belongs in
  `src/features/game-board`.
- Do not rebuild a local primitive without a demonstrated gap.
- Use Tailwind and established tokens; preserve semantic elements, focus,
  labels, keyboard behavior, and responsive constraints.
- Add `"use client"` only to the smallest component requiring browser behavior.
- Do not treat visual state or UI visibility as authorization.

Use actual local import paths, for example:

```tsx
import { Button } from "@/shared/components/button";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
```
