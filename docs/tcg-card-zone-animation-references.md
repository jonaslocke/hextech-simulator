# TCG Simulator — Card Movement Animation References

## Purpose

This document collects references and implementation notes for animating cards as they move between zones in a TCG simulator.

The core interaction is:

> A card moves from one visible board zone to another, such as **deck → hand**, **hand → battlefield**, **battlefield → discard**, or **battlefield → exile**, and the player should visually understand where the card came from and where it went.

The best technical pattern for this is usually called **shared layout animation** or **FLIP animation**.

---

## Recommended Direction

For a React-based TCG simulator, start with **Motion for React** using:

- `layout`
- `layoutId`
- `LayoutGroup`

This is the most practical first implementation because it fits naturally with React state updates. Your game logic can simply move a card from one zone array to another, while the animation layer makes the card visually travel between the old and new positions.

Use **GSAP Flip** later if you need more cinematic or complex behavior, such as:

- drawing multiple cards with staggered timing;
- rotating cards while they travel;
- moving cards through a temporary center preview area;
- animating between very different DOM structures;
- building special effects for exile, banish, reveal, or summon actions.

Use the **View Transitions API** as a future/native browser reference, but not as the first implementation. It is promising, but Motion is easier to integrate into React board state today.

---

## Reference 1 — Motion for React Layout Animations

**Source:** Motion Docs — React Layout Animations  
https://motion.dev/docs/react-layout-animations

### Why this matters

Motion supports automatic layout animation by adding the `layout` prop to a `motion` component. It can animate position and size changes caused by React renders.

This is useful when a card changes position inside a zone or when the layout of a zone changes after a card is added or removed.

### Relevant idea for the simulator

Use `layout` for containers and cards that should smoothly reposition after state changes.

```tsx
<motion.div layout>
  {/* zone content */}
</motion.div>
```

```tsx
<motion.button layout>
  {/* card content */}
</motion.button>
```

### TCG simulator use cases

- Reordering cards in hand.
- Cards shifting after one card leaves the battlefield.
- Cards spreading or compacting inside a zone.
- Zone contents resizing without abrupt jumps.

---

## Reference 2 — Motion Shared Layout with `layoutId`

**Source:** Motion Docs — React Layout Animations  
https://motion.dev/docs/react-layout-animations

### Why this matters

Motion supports shared layout animations through `layoutId`. This allows two rendered elements in different places to be treated as the same visual object.

This is the most important reference for card movement between zones.

### Relevant idea for the simulator

Give every card a stable visual identity:

```tsx
<motion.button
  layout
  layoutId={`card-${card.id}`}
>
  {card.name}
</motion.button>
```

When the card moves from `hand` to `battlefield`, React may remove it from one zone and render it in another zone. Because the `layoutId` remains the same, Motion can animate between the previous and next positions.

### TCG simulator use cases

- Hand → battlefield.
- Deck → hand.
- Battlefield → discard.
- Battlefield → exile.
- Chain/stack → discard after resolution.
- Temporary reveal zone → hand or discard.

---

## Reference 3 — Motion `LayoutGroup`

**Source:** Motion Docs — LayoutGroup  
https://motion.dev/docs/react-layout-group

### Why this matters

`LayoutGroup` coordinates layout animations between components that may not render together but still affect each other visually.

A TCG board often has separate zone components: hand, deck, battlefield, discard, exile, chain, base, etc. A card moving between these zones should still feel like one coordinated board-level animation.

### Relevant idea for the simulator

Wrap the board in a `LayoutGroup`:

```tsx
import { LayoutGroup } from "motion/react";

export const Board = () => {
  return (
    <LayoutGroup id="tcg-board">
      <BoardZones />
    </LayoutGroup>
  );
};
```

### TCG simulator use cases

- Coordinating animations across separate zone components.
- Keeping shared `layoutId` animations scoped to one board.
- Avoiding conflicts if there are multiple boards, previews, or mirrored opponent areas.

---

## Reference 4 — GSAP Flip Plugin

**Source:** GSAP Docs — Flip Plugin  
https://gsap.com/docs/v3/Plugins/Flip/

### Why this matters

GSAP Flip is built specifically for transitions between two DOM states. It records where elements are, lets the DOM change, then animates elements from their previous visual state to their new visual state.

The GSAP docs describe it as a way to transition between two states even when the DOM structure changes enough that elements would normally jump.

### Relevant idea for the simulator

The mental model is:

1. Capture the current card position.
2. Update the card zone in the DOM/state.
3. Animate from the captured position to the new position.

### TCG simulator use cases

- More cinematic card movement.
- Batch movement, such as drawing 2 or 3 cards.
- Staggered animations.
- Moving cards between zones with rotation or scale effects.
- Complex board layouts where Motion is not enough.

---

## Reference 5 — GSAP `Flip.getState()`

**Source:** GSAP Docs — `Flip.getState()`  
https://gsap.com/docs/v3/Plugins/Flip/static.getState%28%29/

### Why this matters

`Flip.getState()` captures layout information such as position, size, rotation, skew, opacity, and viewport position before a DOM change.

This is useful if you decide to build a custom animation workflow for card movement.

### Relevant idea for the simulator

A simplified GSAP-style flow would look like this:

```tsx
const state = Flip.getState(cardElement);

moveCard(cardId, fromZone, toZone);

Flip.from(state, {
  duration: 0.35,
  ease: "power2.out",
});
```

### TCG simulator use cases

- Capture a card before moving it from hand to battlefield.
- Capture multiple cards before drawing or discarding them.
- Preserve visual continuity when the DOM changes heavily.

---

## Reference 6 — GSAP `Flip.from()`

**Source:** GSAP Docs — `Flip.from()`  
https://gsap.com/docs/v3/Plugins/Flip/static.from%28%29/

### Why this matters

`Flip.from()` applies the previously captured state and animates toward the current state.

This maps well to TCG interactions because the game state can update first, then the animation catches the user up visually.

### TCG simulator use cases

- Move a card to its real final zone immediately in state.
- Animate from the old visual location to the new location.
- Keep game logic deterministic while UI animation remains presentational.

---

## Reference 7 — FLIP Animation Technique

**Source:** Aerotwist — FLIP Your Animations  
https://aerotwist.com/blog/flip-your-animations/

### Why this matters

FLIP stands for:

- **First**: record the initial state.
- **Last**: record the final state.
- **Invert**: visually move the element back to where it started using transforms.
- **Play**: remove the transform and let the browser animate to the final state.

This is the underlying concept behind many shared layout animation systems.

### Relevant idea for the simulator

When a card moves between zones, avoid manually animating `top`, `left`, `width`, or `height` every frame. Prefer transform-based animation because it is generally more performant and easier for browsers to optimize.

### TCG simulator use cases

- Smooth card movement between zones.
- Efficient animations on a busy board.
- Avoiding expensive layout recalculations during every frame.

---

## Reference 8 — CSS-Tricks FLIP Explanation

**Source:** CSS-Tricks — Animating Layouts with the FLIP Technique  
https://css-tricks.com/animating-layouts-with-the-flip-technique/

### Why this matters

This is a practical explanation of FLIP for layout animation. It is useful if you want to understand the concept before relying on Motion or GSAP.

### Relevant idea for the simulator

The simulator does not need to manually implement FLIP at first, but understanding it helps explain why `layoutId`, `Flip.getState()`, and transform-based animations solve the “card teleporting between zones” problem.

---

## Reference 9 — View Transitions API

**Source:** Chrome Developers — Same-document View Transitions for SPAs  
https://developer.chrome.com/docs/web-platform/view-transitions/same-document

**Source:** MDN — View Transition API  
https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API

### Why this matters

The View Transitions API is a browser-native way to animate between DOM states. Chrome’s same-document view transitions are designed for single-page applications where JavaScript updates the DOM.

### Relevant idea for the simulator

This can eventually become useful for route-level or view-level transitions, such as:

- opening a full-card preview;
- transitioning from board view to deck list view;
- animating between modal/detail views;
- animating a selected card into an enlarged inspection panel.

### Why not start here

For card-to-card zone movement inside a React board, Motion currently gives a more direct component-level model. View Transitions are worth watching, but they are not the simplest first step for the simulator.

---

## Implementation Direction for the Simulator

### Recommended package

```bash
npm install motion
```

### Board-level structure

```tsx
import { LayoutGroup } from "motion/react";

export const GameBoard = () => {
  return (
    <LayoutGroup id="game-board">
      <div className="grid gap-4">
        <Zone id="deck" />
        <Zone id="hand" />
        <Zone id="battlefield" />
        <Zone id="discard" />
      </div>
    </LayoutGroup>
  );
};
```

### Card-level structure

```tsx
import { motion } from "motion/react";

export const GameCard = ({ card }: { card: Card }) => {
  return (
    <motion.button
      layout
      layoutId={`card-${card.id}`}
      transition={{
        layout: {
          type: "spring",
          stiffness: 420,
          damping: 34,
        },
      }}
      className="h-36 w-24 rounded-lg border border-white/15 bg-slate-800"
    >
      <span className="font-mono text-[10px]">{card.code}</span>
      <span className="font-title text-xs">{card.name}</span>
    </motion.button>
  );
};
```

### State update rule

Keep the game logic simple:

```tsx
moveCard(cardId, "hand", "battlefield");
```

The state should decide where the card is. The animation layer should decide how the movement looks.

---

## Animation Timing Recommendation

### Default card movement

Use this for common card movement:

```tsx
transition={{
  layout: {
    type: "spring",
    stiffness: 420,
    damping: 34,
  },
}}
```

Use for:

- hand → battlefield;
- battlefield → discard;
- chain → discard;
- card repositioning inside a zone.

### Dramatic movement

Use slightly softer motion for important actions:

```tsx
transition={{
  layout: {
    type: "spring",
    stiffness: 300,
    damping: 26,
  },
}}
```

Use for:

- draw from deck;
- exile/banish;
- summon/play animation;
- reveal to center zone.

### Fast rearrangement

Use short duration for internal layout cleanup:

```tsx
transition={{
  layout: {
    duration: 0.18,
  },
}}
```

Use for:

- hand fan adjustment;
- battlefield row compaction;
- small zone layout updates.

---

## Practical Rules for TCG Card Movement

1. **Every card needs a stable ID.**  
   Do not rely on array index for animated cards.

2. **Use the same `layoutId` wherever the same card appears.**  
   Example: `layoutId={`card-${card.id}`}`.

3. **Wrap the board in `LayoutGroup`.**  
   This helps coordinate movement across separate zone components.

4. **Keep game state independent from animation.**  
   The game state should update immediately and deterministically.

5. **Use animation as feedback, not as game logic.**  
   Do not wait for an animation to finish before the card legally changes zones unless the rules engine explicitly needs that behavior.

6. **Prefer transform-based movement.**  
   Avoid frame-by-frame layout changes when possible.

7. **Respect reduced motion.**  
   The simulator should eventually disable or reduce movement animations for users who prefer reduced motion.

---

## Decision Summary

For the current simulator, use this path:

1. **Implement Motion shared layout animations first.**
2. Use `layoutId` for cards moving between zones.
3. Use `layout` for cards and zone containers.
4. Use `LayoutGroup` around the board.
5. Add GSAP Flip only if Motion becomes too limited for advanced effects.
6. Keep View Transitions API as a future reference for route/view/detail transitions.

---

## Full Reference List

- Motion for React — Get Started: https://motion.dev/docs/react
- Motion for React — Layout Animations: https://motion.dev/docs/react-layout-animations
- Motion for React — LayoutGroup: https://motion.dev/docs/react-layout-group
- GSAP — Flip Plugin: https://gsap.com/docs/v3/Plugins/Flip/
- GSAP — `Flip.getState()`: https://gsap.com/docs/v3/Plugins/Flip/static.getState%28%29/
- GSAP — `Flip.from()`: https://gsap.com/docs/v3/Plugins/Flip/static.from%28%29/
- Aerotwist — FLIP Your Animations: https://aerotwist.com/blog/flip-your-animations/
- CSS-Tricks — Animating Layouts with the FLIP Technique: https://css-tricks.com/animating-layouts-with-the-flip-technique/
- Chrome Developers — Same-document View Transitions: https://developer.chrome.com/docs/web-platform/view-transitions/same-document
- MDN — View Transition API: https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
