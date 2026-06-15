# Card Fan Selection Discovery

## Context

A card fan layout creates an appealing hand-like presentation by overlapping cards and applying index-based transforms such as horizontal translation, vertical offset, rotation, and scale.

The visual result works well, but selecting cards can become difficult when cards overlap. This document records the issue observed during interaction testing and proposes an implementation approach that separates the visual fan from the pointer interaction layer.

## Problem Observed

When the user tries to select cards inside the fan, some cards are harder to target than expected.

The issue is not only visual. It comes from how the browser handles overlapping elements:

- Cards visually overlap each other.
- The topmost card in the stacking order can intercept pointer events.
- Rotated and transformed cards can create harder-to-predict interaction areas.
- A card may be visible but partially covered by another card's clickable area.
- If hover transforms are applied per card, hover behavior may feel unstable when the pointer crosses overlapping regions.

In practice, this means the fan can look correct while interaction feels unreliable.

## Root Cause

A card fan is usually built with CSS transforms:

```tsx
transform: `translateX(${x}px) translateY(${y}px) rotate(${rotation}deg)`;
```

However, transformed and overlapping elements still participate in pointer hit-testing and stacking behavior. When multiple cards overlap, the browser needs to decide which element is actually under the pointer.

If each card is responsible for its own `hover` and `click` behavior, selection becomes dependent on the visual stacking order rather than the user's expected card position.

## Recommended Approach

Separate the fan into two responsibilities:

1. **Visual layer**
   - Renders the cards.
   - Uses transforms for position, rotation, hover lift, and scale.
   - Uses `pointer-events: none` so visual cards do not compete for pointer events.

2. **Interaction layer**
   - Lives on the fan container.
   - Reads the pointer position inside the container.
   - Calculates the selected card index based on the pointer X position.
   - Controls hover state and selection state.

This makes selection predictable because there is only one pointer target: the fan container.

## Key Implementation Idea

Instead of doing this:

```tsx
<div onClick={() => selectCard(card)} className="absolute ...">
  <Card />
</div>
```

Prefer this:

```tsx
<div onPointerMove={handlePointerMove} onPointerDown={handlePointerDown}>
  <div className="pointer-events-none">
    {cards.map(renderVisualCard)}
  </div>
</div>
```

The container owns interaction. The cards are visual only.

## Suggested React Implementation

```tsx
import { cn } from "@/lib/utils";
import { PointerEvent, ReactNode, useState } from "react";

type CardFanRenderState = {
  index: number;
  isHovered: boolean;
};

type CardFanProps<T> = {
  cards: T[];
  renderCard: (card: T, state: CardFanRenderState) => ReactNode;
  onSelect?: (card: T, index: number) => void;
  className?: string;
  cardWidth?: number;
  spacing?: number;
  rotationStep?: number;
  curve?: number;
  hoverLift?: number;
  hoverScale?: number;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export const CardFan = <T,>({
  cards,
  renderCard,
  onSelect,
  className,
  cardWidth = 72,
  spacing = 32,
  rotationStep = 4,
  curve = 5,
  hoverLift = 72,
  hoverScale = 1.25,
}: CardFanProps<T>) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const center = (cards.length - 1) / 2;

  const getIndexFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;

    const fanCenterX = rect.width / 2;
    const firstCardCenterX = fanCenterX - center * spacing;

    const rawIndex = Math.round((pointerX - firstCardCenterX) / spacing);

    return clamp(rawIndex, 0, cards.length - 1);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (cards.length === 0) return;

    const index = getIndexFromPointer(event);

    setHoveredIndex(index);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (cards.length === 0) return;

    const index = getIndexFromPointer(event);

    onSelect?.(cards[index], index);
  };

  if (cards.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative h-40 w-full overflow-visible touch-none",
        className,
      )}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredIndex(null)}
      onPointerDown={handlePointerDown}
    >
      <div className="pointer-events-none absolute inset-0">
        {cards.map((card, index) => {
          const offset = index - center;
          const isHovered = hoveredIndex === index;

          const x = offset * spacing;
          const y = isHovered ? -hoverLift : Math.abs(offset) * curve;
          const rotation = isHovered ? 0 : offset * rotationStep;
          const scale = isHovered ? hoverScale : 1;

          return (
            <div
              key={index}
              className="absolute bottom-0 left-1/2 transition-transform duration-150 ease-out"
              style={{
                width: cardWidth,
                zIndex: isHovered ? 1000 : index,
                transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg) scale(${scale})`,
                transformOrigin: "bottom center",
              }}
            >
              {renderCard(card, { index, isHovered })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

## Usage Example

```tsx
<CardFan
  cards={cards}
  onSelect={(card) => {
    console.log("selected card", card);
  }}
  renderCard={(card, { isHovered }) => (
    <GameCard
      card={card}
      className={cn(
        "transition-shadow",
        isHovered && "shadow-xl",
      )}
    />
  )}
/>
```

## Important Notes

### Do not mix inline transforms with Tailwind hover transform utilities

Avoid this pattern:

```tsx
<div
  className="hover:-translate-y-6"
  style={{
    transform: `translateX(${x}px) rotate(${rotation}deg)`,
  }}
/>
```

Both the class and the inline style are trying to control `transform`. The inline style will usually win, and the hover class may not behave as expected.

Instead, calculate the hover state and put the full transform into one string:

```tsx
style={{
  transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg) scale(${scale})`,
}}
```

### Prefer pointer events over mouse events

Use pointer events for this component:

```tsx
onPointerMove={handlePointerMove}
onPointerDown={handlePointerDown}
onPointerLeave={() => setHoveredIndex(null)}
```

Pointer events work better as a unified model for mouse, pen, and touch input.

### Use `touch-none` on the fan container

```tsx
className="touch-none"
```

This prevents default touch gestures from interfering with card selection or dragging behavior.

### Use `pointer-events-none` on visual cards

```tsx
<div className="pointer-events-none absolute inset-0">
```

This prevents individual cards from stealing events from the fan container.

## Why This Works Better

This approach matches the actual user expectation:

- The fan behaves like one interactive control.
- The selected card is based on pointer position, not DOM stacking order.
- Hover state is stable.
- Selection is easier even when cards overlap heavily.
- Visual overlap no longer interferes with click behavior.

## Tradeoffs

This approach is best when the hand behaves as a single fan control.

It may need extra logic if individual card regions need highly precise hit-testing, for example:

- Dragging a specific card from any visible corner.
- Selecting only the visible portion of overlapped cards.
- Handling vertical fan layouts.
- Supporting non-uniform card widths.

For most digital card game hands, pointer-position-based selection is a stronger baseline.

## References

- MDN Web Docs — CSS `transform`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform
- MDN Web Docs — CSS `z-index`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/z-index
- MDN Web Docs — CSS `pointer-events`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/pointer-events
- MDN Web Docs — Pointer events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- Unity Discussions — Creating a card fan alignment function like Slay the Spire: https://discussions.unity.com/t/creating-a-card-fan-alignment-function-like-slay-the-spire/888524
- GameDev StackExchange — How can I evenly fan out a hand of cards?: https://gamedev.stackexchange.com/questions/22162/how-can-i-evenly-fan-out-a-hand-of-cards
