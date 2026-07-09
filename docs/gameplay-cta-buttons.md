# Feature Definition — Gameplay CTA Buttons with Semantic Keybinds

## Objective

Create a reusable gameplay CTA button system powered by shadcn components. The goal is to standardize how important game actions are displayed, triggered, and prepared for future configurable keybindings.

This feature reframes the missing `J` shortcut on the triggered-ability order dialog as a broader component-level improvement: every gameplay CTA should expose a visible keybind and use a consistent semantic action model.

## Problem

The game currently has several important CTA buttons across prompts, dialogs, chain panels, and decision surfaces. Some support keyboard shortcuts, while others only expose mouse/touch interaction.

Example found during testing:

- The triggered-ability order dialog has a `Submit order` button.
- It should support the same primary action keybind pattern used elsewhere.
- Pressing `J` should submit the order.
- The button should visually show the keybind.

This is not only a bug in one dialog. It shows that gameplay CTAs lack a shared action-button abstraction.

## Design Intention

The game should use semantic action slots instead of hardcoded keybinds per button.

A button should declare that it represents the primary, secondary, tertiary, or fourth gameplay action. The component should resolve the default keybind internally.

This prepares the API for future user-configurable keybindings without forcing future refactors across every prompt.

## Component Requirement

Create a new shadcn-powered gameplay CTA component.

Suggested components:

```ts
GameActionButton;
GameActionSplitButton;
```
