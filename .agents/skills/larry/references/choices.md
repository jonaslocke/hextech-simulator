# Choices, Visibility, and Pending-Decision Verification

Use when effects create selections, ordered choices, modes, optional costs, or new pending decisions while other work is finalizing.

## Minimal model dimensions

- pending choice type and owner
- visible objects
- legal/selectable objects
- minimum/maximum selection
- selected objects/order
- resolution frame that created the choice
- new pending work created while an earlier choice resolves

## High-value properties

- Finalizing one decision consumes only that decision; newly created pending work survives.
- Visible set and selectable set remain separate contracts.
- Cardinality and optionality are preserved at projection and submission validation.
- A choice cannot select objects that are hidden/illegal merely because they are present in canonical state.
- Ordering choices preserve the same semantic items and do not change their origin/identity.
- Projection of choices is non-mutating.

Prefer pairwise contrasts: visible-but-illegal versus visible-and-legal, optional zero selection versus mandatory one, and old choice completion that creates a new choice.
