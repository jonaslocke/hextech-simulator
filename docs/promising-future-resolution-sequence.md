# Promising Future — Resolution Sequence

## Purpose

This document summarizes the correct play and resolution sequence for **Promising Future** in Riftbound.

It reflects the current official errata and the clarified Pending Chain Item / finalization behavior discussed in recent rulings and FAQs.

---

## Current Card Text

**Promising Future**

> Each player looks at the top 5 cards of their Main Deck, banishes one of them, then recycles the rest. Starting with the next player, each player plays those cards, ignoring Energy costs. They must still pay Power costs.

The important errata is that the selected card is **banished**, not merely chosen.

---

## Two-Player Sequence

Assume:

- **Player A** is the turn player and is resolving Promising Future.
- **Player B** is the next player.

### 1. Promising Future begins resolving

Promising Future has already been played normally and has reached resolution.

### 2. Player A selects first

Player A:

1. Looks at the top 5 cards of their Main Deck.
2. Chooses 1.
3. Banishes that card.
4. Recycles the other 4.

Call the banished card **A1**.

### 3. Player B selects second

Player B then:

1. Looks at the top 5 cards of their Main Deck.
2. Chooses 1.
3. Banishes that card.
4. Recycles the other 4.

Call the banished card **B1**.

Because the actions are sequential, Player B can see Player A's already-banished card before making their own selection.

---

## Playing the selected cards

Promising Future says:

> Starting with the next player, each player plays those cards.

Therefore the play order is:

1. **Player B plays B1**
2. **Player A plays A1**

This does **not** mean B1 fully resolves before A1 is played.

Both cards are being played while Promising Future itself is still resolving.

---

## Pending Chain Items

When B1 is played:

- B1 is added as a **Pending Chain Item**.
- It does not immediately complete the normal play process.

Then A1 is played:

- A1 is also added as a **Pending Chain Item**.
- It is added after B1.

At this point the conceptual order is:

```text
B1 — Pending
A1 — Pending
```

Promising Future then finishes resolving.

---

## Finalization order

After Promising Future finishes, Pending Chain Items finalize in the same order they were appended.

Therefore:

1. **B1 finalizes**
2. **A1 finalizes**

There is no normal Priority window between these two finalizations.

During finalization, each card completes the normal requirements of being played, including things such as:

- choosing legal targets;
- choosing legal destinations;
- paying Power costs;
- paying mandatory additional costs;
- choosing optional additional costs when allowed.

Promising Future ignores only **Energy costs**.

If a selected card cannot legally complete the play process, its play is undone and it remains or returns to Banishment.

---

## If the selected card is a permanent

If B1 or A1 is a **Unit or Gear**, it resolves as part of completing its play process and enters the Board.

Therefore, if both selected cards are permanents:

```text
B1 finalizes and enters the Board
A1 finalizes and enters the Board
```

Any abilities triggered by those plays may become new Pending Chain Items, but they do not interrupt the remaining Promising Future cards that still need to finalize.

---

## If the selected card is a spell

A Spell that finalizes remains on the Chain waiting for normal Chain resolution.

If both players selected Spells:

### Play order

```text
B1
A1
```

### Finalization order

```text
B1
A1
```

### Chain order after finalization

Because A1 was added after B1:

```text
TOP
A1
B1
BOTTOM
```

### Resolution order

Normal Chain resolution is last-in, first-out:

```text
A1 resolves first
B1 resolves second
```

This is one of the most important consequences of Promising Future.

---

## Priority

Normal Priority is not granted between:

- B1 being placed Pending;
- A1 being placed Pending;
- B1 finalizing;
- A1 finalizing.

Priority resumes only after the Pending Chain Item processing caused by Promising Future has completed.

At that point, players may react according to the normal timing rules.

---

## Full sequence

```text
Player A plays Promising Future
        ↓
Promising Future resolves
        ↓
A looks at top 5
A banishes A1
A recycles the other 4
        ↓
B looks at top 5
B banishes B1
B recycles the other 4
        ↓
B plays B1
B1 becomes Pending
        ↓
A plays A1
A1 becomes Pending
        ↓
Promising Future finishes resolving
        ↓
B1 finalizes
        ↓
A1 finalizes
        ↓
Any newly-created Pending items finalize
        ↓
Normal Priority resumes
        ↓
Normal Chain resolution
```

---

## Important implementation rules

Promising Future must **not** be implemented as:

```text
B plays and completely resolves their card
then
A plays and completely resolves their card
```

It must also **not** be implemented as simply adding two normal Chain Items and immediately beginning LIFO resolution.

The relevant lifecycle is:

```text
selection
→ banishment
→ ordered play
→ Pending Chain Items
→ ordered finalization
→ Priority
→ normal Chain resolution
```

The distinction between **playing**, **Pending**, **finalizing**, and **resolving** is essential to the card's correct behavior.

---

## Compact reference

| Stage | Order |
|---|---|
| Look / choose / banish | A → B |
| Play selected cards | B → A |
| Become Pending | B → A |
| Finalize | B → A |
| Spell resolution | A → B |
| Permanent entry | B → A |

For selected Spells, the final resolution order reverses because normal Chain resolution is LIFO.
