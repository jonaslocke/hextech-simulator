# Codex Skill: Game Action Buttons

## Purpose

Use `GameActionButton` for gameplay actions that should expose semantic keybinds.

This component is the standard gameplay CTA layer for the Hextech/Riftbound simulator. It should replace manual CTA key handling, detached `<Kbd>` hints, and base shadcn buttons when the action is part of a game decision or gameplay workflow.

The goal is to keep gameplay action UX consistent while reducing one-off keyboard shortcut logic.

---

## Component

Use:

```tsx
import { GameActionButton } from "@/features/game-board/components/game-action-button";
```

Or, when already inside `src/features/game-board/components`, use the relative path:

```tsx
import { GameActionButton } from "./game-action-button";
```

Default semantic keybinds:

```ts
primary      -> J
secondary    -> K
tertiary     -> L
quaternary   -> U
cancel       -> Esc
```

Do not wire raw physical keys manually unless the control is not a gameplay CTA.

---

## When to use `GameActionButton`

Use `GameActionButton` for:

- Confirm / submit / resolve gameplay decisions.
- Cancel / close / back out actions inside gameplay prompts.
- Priority, focus, targeting, showdown, combat, setup, or card-selection CTAs.
- Multiple gameplay actions inside the same prompt when they need keybindings.
- Destructive gameplay actions after confirmation, such as conceding.
- Match-result actions that continue gameplay flow, such as creating a new match.

Examples already wired in the project:

- Card selection prompt:
  - `Cancel` -> `cancel`
  - `Choose card`, `Lock battlefield`, `Submit order` -> `primary`
- Target selection prompt:
  - `Cancel` -> `cancel`
  - `Play` -> `primary`
- Chain overlay:
  - `Pass priority` -> `primary`
- Showdown prompt:
  - `Pass Focus` -> `secondary`
- Combat damage dialog:
  - `Auto assign` -> `secondary`
  - `Reset` -> `tertiary`
  - `Resolve damage` -> `primary`
- Concede confirmation dialog:
  - `Cancel` -> `cancel`
  - `Concede` -> `primary` with `variant="destructive"`
- Floating overlay close:
  - Close overlay -> `cancel`
- Match result dialog:
  - `Create New Match` -> `primary`

---

## When not to use it

Do not automatically replace every button.

Keep regular shadcn `Button` or existing local controls for:

- Purely visual or navigation-like rail buttons.
- Card option buttons.
- List item buttons.
- Reorder buttons, unless the user explicitly asks for semantic keybindings.
- Checkbox or toggle controls.
- Tooltip/info buttons.
- Non-gameplay utility buttons.

Exception: if the user explicitly wants keybindings on a workflow action, use `GameActionButton`.

---

## Key rule

If a button represents a gameplay action and the player should be able to trigger it from the keyboard, use `GameActionButton`.

If a key hint is shown beside a CTA, remove the detached hint and let `GameActionButton` render the keybind itself.

---

## Do not duplicate shortcut logic

When migrating a component:

1. Remove manual `useEffect` keyboard listeners for the same action.
2. Remove detached `<Kbd>` hints for the same action.
3. Replace the CTA button with `GameActionButton`.
4. Keep any unrelated keyboard logic that belongs to a non-button control.

`GameActionButton` already handles:

- Keyboard shortcut listener.
- Ignoring key repeat.
- Ignoring modifier keys.
- Ignoring editable targets.
- Preventing duplicate submits.
- Disabled and busy states.
- Showing the keybind hint.
- `aria-keyshortcuts`.

---

## Common replacements

### Confirm action

```tsx
<GameActionButton
  actionSlot="primary"
  disabled={!canConfirm}
  isBusy={isSubmitting}
  onAction={onConfirm}
>
  {isSubmitting ? "Submitting…" : "Confirm"}
</GameActionButton>
```

### Cancel action

```tsx
<GameActionButton
  actionSlot="cancel"
  onAction={onCancel}
  variant="secondary"
>
  Cancel
</GameActionButton>
```

### Secondary gameplay action

```tsx
<GameActionButton
  actionSlot="secondary"
  disabled={isSubmitting}
  onAction={onAutoAssign}
  variant="secondary"
>
  Auto assign
</GameActionButton>
```

### Tertiary gameplay action

```tsx
<GameActionButton
  actionSlot="tertiary"
  disabled={isSubmitting || !canReset}
  onAction={onReset}
  variant="secondary"
>
  Reset
</GameActionButton>
```

### Destructive confirmed action

Use `variant="destructive"` for the visual treatment. Do not create a separate destructive action slot.

```tsx
<GameActionButton
  actionSlot="primary"
  disabled={!canConfirm}
  onAction={onConcede}
  variant="destructive"
>
  Concede
</GameActionButton>
```

---

## Dialogs and overlays

For dialogs and floating overlays, pass `isActive` when the action should only respond while the surface is open.

```tsx
<GameActionButton
  actionSlot="cancel"
  isActive={isOpen}
  onAction={onClose}
  variant="secondary"
>
  Close
</GameActionButton>
```

If the dialog has an input, do not add special handling for typing. `GameActionButton` already ignores shortcuts while focus is inside inputs, textareas, selects, contenteditable elements, and textbox roles.

---

## Visual styling

Prefer the base `GameActionButton` styling.

The project theme already defines the gameplay colors through Tailwind/shadcn tokens, so avoid hardcoding large proprietary button styles unless matching an existing surface.

Allowed targeted overrides:

```tsx
<GameActionButton
  actionSlot="primary"
  className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
  keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
  onAction={onPassPriority}
>
  Pass Priority
</GameActionButton>
```

Use this kind of override only when preserving an established screen treatment, such as the Chain overlay cyan button.

---

## Multiple gameplay actions in one surface

Do not assume only the final submit button should use `GameActionButton`.

If the surface has multiple gameplay workflow actions, map them semantically:

```tsx
<GameActionButton
  actionSlot="secondary"
  onAction={autoAssignDamage}
  variant="secondary"
>
  Auto assign
</GameActionButton>

<GameActionButton
  actionSlot="tertiary"
  onAction={resetAssignments}
  variant="secondary"
>
  Reset
</GameActionButton>

<GameActionButton
  actionSlot="primary"
  disabled={!canSubmit}
  isBusy={isSubmitting}
  onAction={submitDamage}
>
  Resolve damage
</GameActionButton>
```

This produces:

```txt
Auto assign      K
Reset            L
Resolve damage   J
```

---

## Preserve non-button shortcuts only when appropriate

Some controls may keep local keyboard handling if they are not `GameActionButton`s.

Example:

- Chain `Auto-pass` is a checkbox/toggle.
- Its `L` shortcut can remain local while `Pass priority` uses `GameActionButton`.

Do not remove non-button shortcut logic unless the control is being converted into a formal game action button.

---

## Migration checklist

When asked to wire a component:

1. Identify gameplay CTAs.
2. Replace those CTAs with `GameActionButton`.
3. Assign semantic slots:
   - Main action: `primary`
   - Secondary action: `secondary`
   - Third action: `tertiary`
   - Fourth action: `quaternary`
   - Cancel/close/back: `cancel`
4. Remove obsolete detached `<Kbd>` hints for migrated CTAs.
5. Remove obsolete manual keyboard listeners for migrated CTAs.
6. Keep base `Button` only where still needed by non-gameplay controls.
7. Keep existing visual layout unless the user asks for redesign.
8. Use `isBusy` for submitting actions.
9. Use `disabled` for invalid/unavailable actions.
10. Use `isActive` for dialogs/overlays that should only listen while open.

---

## Avoid these mistakes

Do not:

- Add a second keyboard listener for an action already handled by `GameActionButton`.
- Keep a detached `<Kbd>` beside a migrated CTA.
- Use physical key names in callers instead of semantic `actionSlot`.
- Treat destructive as a keybind slot. Destructive is a visual variant.
- Convert every utility button blindly.
- Disable keybinds unnecessarily on active gameplay prompts.
- Forget that multiple gameplay actions in the same dialog can all be `GameActionButton`s.

---

## Preferred mental model

`Button` is for generic UI.

`GameActionButton` is for gameplay intent.

The component should make gameplay actions discoverable, keyboard-accessible, and consistent without forcing each screen to reimplement keybind behavior.
