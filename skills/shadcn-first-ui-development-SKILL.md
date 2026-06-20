---
name: shadcn-first-ui-development
description: Use this skill when creating, updating, or refactoring UI components in this game engine repository. Prefer shadcn/ui components first for general application UI. Create custom components only when shadcn/ui does not fit, except for proprietary game engine UI, which may be built from scratch.
---

# shadcn/ui First UI Development Skill

## Purpose

Use this skill whenever the task involves creating, updating, or refactoring UI in this repository.

The default rule is:

```txt
Use shadcn/ui as the first choice for general UI components.
Only create a new custom component when no shadcn/ui component can reasonably be used.
```

This repository contains a game engine, so there is one important exception:

```txt
Game engine UI may be custom-built from scratch when the UI is proprietary, highly interactive, game-specific, or not well represented by shadcn/ui primitives.
```

---

# 1. When to Use This Skill

Use this skill for tasks involving:

- pages;
- forms;
- dialogs;
- menus;
- buttons;
- tabs;
- tables;
- filters;
- dropdowns;
- popovers;
- sheets;
- drawers;
- sidebars;
- navigation;
- cards;
- badges;
- tooltips;
- alerts;
- layout UI;
- admin UI;
- settings UI;
- dashboard UI;
- validation/error UI;
- reusable shared UI components.

Also use this skill when refactoring existing custom UI that could be replaced by shadcn/ui.

---

# 2. Core Rule

Before creating any new UI component, check whether an existing shadcn/ui component can be used.

Prefer shadcn/ui for common interface patterns such as:

```txt
Button
Card
Dialog
Alert Dialog
Sheet
Drawer
Popover
Tooltip
Dropdown Menu
Navigation Menu
Tabs
Accordion
Select
Checkbox
Radio Group
Switch
Input
Textarea
Label
Form
Table
Badge
Alert
Skeleton
Separator
Scroll Area
Command
Context Menu
Menubar
Pagination
Sidebar
```

Do not create a custom component when a shadcn/ui component can satisfy the requirement with composition, props, className, or small wrappers.

---

# 3. Decision Process

Before building a UI component, follow this decision process.

## Step 1: Identify the UI category

Ask:

```txt
Is this a standard application UI pattern?
```

Examples of standard application UI:

```txt
button
form field
modal
dropdown
table
tabs
filter
sidebar
card
badge
tooltip
toast
menu
pagination
empty state
loading skeleton
```

If yes, prefer shadcn/ui.

## Step 2: Check if shadcn/ui can be composed

Ask:

```txt
Can the desired UI be built by composing shadcn/ui primitives?
```

If yes, use shadcn/ui.

Example:

```txt
A "Delete Deck" confirmation modal should use AlertDialog.
A card details panel should use Card.
A settings form should use Form, Input, Select, Checkbox, Button.
A filter menu should use Popover, Command, Select, or DropdownMenu.
```

## Step 3: Create a small wrapper only if useful

If the same shadcn/ui composition is reused multiple times, create a wrapper component.

Good:

```txt
shared/components/confirm-dialog.tsx
features/decks/components/deck-form.tsx
features/cards/components/card-filter-popover.tsx
```

The wrapper should still use shadcn/ui internally.

## Step 4: Create a custom component only when justified

Only create a fully custom component when:

```txt
- shadcn/ui does not provide the needed interaction model;
- shadcn/ui composition would be more complex than a custom implementation;
- the component is game-specific or proprietary;
- the UI requires custom canvas, board, card, zone, drag-and-drop, animation, or spatial behavior;
- the component is part of the game engine surface rather than general application UI.
```

---

# 4. Game Engine UI Exception

This repository contains proprietary game engine UI.

The following UI may be custom-built from scratch:

```txt
game board
battlefield zones
card hand
card fan
card stack
deck area
discard area
banish/exile area
chain/stack area
score track
turn/phase indicator
game log timeline
drag-and-drop card movement
card targeting UI
card attachment UI
card selection overlays
animated card transitions
game-specific context menus
board state visualizations
```

These components are not generic application UI. They are part of the game experience and may require custom layout, animation, pointer handling, and game-state rendering.

For these components, do not force shadcn/ui if it makes the implementation worse.

Good custom game-engine components:

```txt
features/game-board/components/game-board.tsx
features/game-board/components/battlefield-zone.tsx
features/game-board/components/card-fan.tsx
features/game-board/components/score-track.tsx
features/game-board/components/chain-zone.tsx
features/game-board/components/game-log-panel.tsx
features/game-board/components/card-drag-layer.tsx
```

However, even inside game engine UI, use shadcn/ui for standard UI pieces when appropriate.

Examples:

```txt
Use Tooltip for card keyword help if it fits.
Use Dialog for game settings.
Use AlertDialog for concede confirmation.
Use DropdownMenu for simple action menus.
Use Sheet for side panels if suitable.
Use ScrollArea for logs or long text panels.
```

---

# 5. General UI vs Game UI

Use this distinction.

## General application UI

Use shadcn/ui first.

Examples:

```txt
deck builder forms
admin validation screens
settings pages
login screens
card database filters
import/export dialogs
table views
profile menu
navigation
confirmation modals
```

## Proprietary game engine UI

Custom implementation is allowed.

Examples:

```txt
interactive game board
card zones
card movement
card fan
board targeting
real-time action layer
game phase visualization
score track
battlefield layout
```

---

# 6. Component Location Rules

Follow the repository architecture.

Use:

```txt
src/shared/components/
```

for generic reusable UI.

Examples:

```txt
button.tsx
confirm-dialog.tsx
empty-state.tsx
page-header.tsx
```

Use:

```txt
src/features/<feature>/components/
```

for feature-specific UI.

Examples:

```txt
src/features/decks/components/deck-form.tsx
src/features/cards/components/card-filter-popover.tsx
src/features/game-board/components/card-fan.tsx
src/features/game-board/components/battlefield-zone.tsx
```

Do not put game-specific components in `shared/components`.

Bad:

```txt
src/shared/components/card-fan.tsx
src/shared/components/battlefield-zone.tsx
src/shared/components/score-track.tsx
```

Good:

```txt
src/features/game-board/components/card-fan.tsx
src/features/game-board/components/battlefield-zone.tsx
src/features/game-board/components/score-track.tsx
```

---

# 7. File Naming Rules

Use kebab-case for file names.

Good:

```txt
deck-form.tsx
card-filter-popover.tsx
confirm-dialog.tsx
battlefield-zone.tsx
score-track.tsx
card-drag-layer.tsx
```

Use PascalCase for React component names.

Good:

```tsx
export function DeckForm() {}
export function CardFilterPopover() {}
export function BattlefieldZone() {}
export function ScoreTrack() {}
export function CardDragLayer() {}
```

---

# 8. shadcn/ui Usage Rules

When using shadcn/ui:

- Import from the local shadcn/ui component path used by the repository.
- Do not import directly from Radix unless the project already does so or shadcn/ui does not expose the needed primitive.
- Prefer composition over creating new primitives.
- Preserve the project’s Tailwind conventions.
- Use `className` for styling extensions.
- Avoid modifying shadcn/ui base components unless there is a strong reason.
- Prefer wrapping shadcn/ui components for domain-specific behavior.

Example:

```tsx
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
```

If the repository uses a different local path for shadcn/ui components, follow the existing path.

Common paths may include:

```txt
src/components/ui/
src/shared/components/ui/
components/ui/
```

Do not invent a new shadcn/ui location if one already exists.

---

# 9. Wrapper Component Guidance

Create wrapper components when they represent a repeated product pattern.

Good wrapper:

```txt
confirm-dialog.tsx
```

built from:

```txt
AlertDialog
Button
```

Good wrapper:

```txt
card-filter-popover.tsx
```

built from:

```txt
Popover
Command
Button
Badge
```

Bad wrapper:

```txt
custom-button.tsx
```

when it only duplicates the existing shadcn/ui `Button`.

Bad wrapper:

```txt
custom-dialog.tsx
```

when it does not add meaningful project-specific behavior.

---

# 10. Do Not Rebuild shadcn/ui

Do not create custom versions of standard shadcn/ui components.

Avoid creating:

```txt
custom-button.tsx
custom-modal.tsx
custom-dropdown.tsx
custom-tabs.tsx
custom-input.tsx
custom-select.tsx
custom-tooltip.tsx
```

when shadcn/ui already provides an equivalent component.

Use the existing shadcn/ui component and style it.

---

# 11. When Custom Components Are Allowed

Custom components are allowed when the UI is:

```txt
- game-specific;
- proprietary;
- spatial;
- animated;
- drag-and-drop based;
- canvas-based;
- board-based;
- state-machine-driven;
- deeply tied to game rules;
- not naturally represented by shadcn/ui;
- too awkward to build from shadcn/ui composition.
```

Examples:

```txt
CardFan
GameBoard
BattlefieldZone
ChainZone
ScoreTrack
CardMovementLayer
TargetingOverlay
GamePhaseTrack
CardZoneStack
```

These should be treated as product/game components, not generic UI components.

---

# 12. Client Component Rules

Most shadcn/ui interactive components are Client Components.

Add `"use client"` only to files that need it.

Do not mark an entire page or large parent component as `"use client"` just because one dialog, dropdown, or interactive game element needs client behavior.

Prefer:

```txt
game-board.tsx
card-drag-layer.tsx
```

where only the interactive component uses `"use client"`.

For example:

```tsx
// card-drag-layer.tsx

"use client";

export function CardDragLayer() {
  return null;
}
```

Keep non-interactive layout components as Server Components when possible.

---

# 13. Styling Rules

Use Tailwind classes and the project’s existing design tokens.

Prefer project tokens over one-off colors.

Good:

```tsx
<Button className="bg-primary text-primary-foreground">
  Save
</Button>
```

Avoid hardcoded styling unless the component is game-specific and requires custom visual treatment.

For game engine UI, custom visual styling is allowed when necessary to represent zones, cards, board state, targeting, animations, or interaction states.

---

# 14. Accessibility Rules

Do not remove accessibility behavior provided by shadcn/ui or Radix primitives.

When building custom game UI, preserve basic accessibility where reasonable:

```txt
- meaningful button elements for actions;
- aria-label for icon-only buttons;
- keyboard support where practical;
- visible focus states;
- semantic text for important game actions;
- readable labels for zones and controls.
```

For highly visual proprietary board UI, prioritize game usability but do not intentionally block keyboard or screen-reader affordances when simple support is possible.

---

# 15. Implementation Checklist

Before creating a new UI component, verify:

```txt
- Is there a shadcn/ui component for this?
- Can the UI be composed from existing shadcn/ui primitives?
- Is this component general application UI?
- Is this component proprietary game-engine UI?
- Should this live in shared/components or features/<feature>/components?
- Does the file use kebab-case?
- Does the React component use PascalCase?
- Is "use client" only used where necessary?
```

---

# 16. Anti-Patterns

Avoid:

```txt
- Creating custom buttons instead of using shadcn/ui Button.
- Creating custom modals instead of using Dialog or AlertDialog.
- Creating custom dropdowns instead of using DropdownMenu.
- Creating custom tabs instead of using Tabs.
- Creating custom form primitives instead of using shadcn/ui form/input/select components.
- Moving game-specific UI into shared/components.
- Forcing shadcn/ui into board/game interactions where it does not fit.
- Marking large route trees as Client Components.
- Changing shadcn/ui base components unnecessarily.
```

---

# 17. Final Decision Rule

Use this rule when deciding between shadcn/ui and custom UI:

```txt
If the UI is standard application UI, use shadcn/ui first.

If the UI is proprietary game engine UI, custom implementation is allowed.

If shadcn/ui can reasonably be composed to solve the problem, use it.

If shadcn/ui makes the implementation awkward, fragile, or less suitable for game interaction, create a custom feature component.
```

The priority is:

```txt
1. shadcn/ui for standard app UI.
2. Feature-level wrappers around shadcn/ui for repeated product patterns.
3. Custom feature components for proprietary game-engine UI.
4. Shared custom components only when they are truly generic and not already covered by shadcn/ui.
```
