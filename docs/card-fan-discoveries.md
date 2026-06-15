# Card Fan UI Discovery Notes

## Purpose

This document summarizes practical findings for creating a **card fan** interaction for a digital card game. The goal is to describe the layout model, implementation approach, visual behavior, interaction expectations, and useful references for later development.

A card fan is the visual pattern where multiple cards are slightly overlapped, rotated, and positioned along an arc, similar to how a player holds cards in a physical hand.

---

## Key Discovery

A card fan is usually not created with normal layout spacing such as `gap`. It is better modeled as an **index-based transform system**.

Each card receives a position based on its order in the hand:

- horizontal offset
- vertical offset
- rotation angle
- stacking order
- optional hover/focus offset

This approach gives more control than a regular flex row because card rotation and overlap should not affect the natural layout of neighboring cards.

---

## Common Layout Strategy

The most common strategy found across CSS and game-development discussions is:

1. Count the number of cards.
2. Find the center index of the hand.
3. Calculate each card's offset from the center.
4. Convert that offset into `x`, `y`, and `rotation` values.
5. Render the cards with absolute positioning.
6. Apply `translate`, `rotate`, and sometimes `scale` through CSS transforms or equivalent engine transforms.

Example formula:

```ts
const center = (cardCount - 1) / 2;
const offset = index - center;

const x = offset * spacing;
const y = Math.abs(offset) * curve;
const rotation = offset * rotationStep;
```

Example transform:

```ts
const transform = `translateX(${x}px) translateY(${y}px) rotate(${rotation}deg)`;
```

---

## Why Absolute Positioning Is Useful

A fan layout usually works better with absolute positioning because each card needs visual freedom to rotate and overlap without forcing the container to recalculate spacing around the rotated shape.

Recommended container behavior:

```css
.cardFan {
  position: relative;
  overflow: visible;
}
```

Recommended card behavior:

```css
.cardFanItem {
  position: absolute;
  transform-origin: bottom center;
}
```

The `transform-origin: bottom center` detail is important because cards should rotate around a lower anchor point, closer to how cards fan from a hand.

---

## Main Parameters

A reusable card fan should expose a small number of layout controls.

| Parameter | Purpose |
|---|---|
| `spacing` | Horizontal distance between cards |
| `rotationStep` | Degree difference between neighboring cards |
| `curve` | Vertical offset that creates the arc |
| `hoverOffset` | How far a card rises when hovered or focused |
| `maxRotation` | Optional cap to prevent extreme angles with many cards |
| `maxWidth` | Optional constraint to keep large hands inside the screen |

---

## Basic React-Oriented Implementation Model

This example is framework-neutral enough to adapt, but uses a React-style mapping model.

```tsx
const getCardFanTransform = ({
  index,
  total,
  spacing = 32,
  rotationStep = 5,
  curve = 6,
}: {
  index: number;
  total: number;
  spacing?: number;
  rotationStep?: number;
  curve?: number;
}) => {
  const center = (total - 1) / 2;
  const offset = index - center;

  const x = offset * spacing;
  const y = Math.abs(offset) * curve;
  const rotation = offset * rotationStep;

  return {
    transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg)`,
    transformOrigin: "bottom center",
  };
};
```

Example rendering pattern:

```tsx
<div className="relative h-40 w-full overflow-visible">
  {cards.map((card, index) => (
    <div
      key={card.id}
      className="absolute bottom-0 left-1/2 transition-transform"
      style={{
        zIndex: index,
        ...getCardFanTransform({
          index,
          total: cards.length,
        }),
      }}
    >
      <Card card={card} />
    </div>
  ))}
</div>
```

---

## Hover and Focus Behavior

A strong card fan interaction usually includes a hover/focus state where the selected card moves upward and appears above neighboring cards.

Recommended behavior:

- increase `z-index` on hover/focus
- reduce or neutralize rotation on hover/focus if readability matters
- move the card upward
- optionally scale slightly
- make the same behavior available through keyboard focus, not only mouse hover

Example CSS idea:

```css
.cardFanItem:hover,
.cardFanItem:focus-within {
  z-index: 100;
  transform: translateX(calc(-50% + var(--x))) translateY(calc(var(--y) - 24px)) rotate(0deg) scale(1.05);
}
```

Important: if the transform is generated inline, hover transforms need to preserve the same `x` position. This can be easier if each card stores values in CSS custom properties such as `--x`, `--y`, and `--rotation`.

---

## CSS Custom Property Variant

CSS variables are useful when hover/focus states need to modify only part of the transform.

```tsx
<div
  className="cardFanItem"
  style={{
    "--x": `${x}px`,
    "--y": `${y}px`,
    "--rotation": `${rotation}deg`,
  } as React.CSSProperties}
>
  <Card />
</div>
```

```css
.cardFanItem {
  transform: translateX(calc(-50% + var(--x))) translateY(var(--y)) rotate(var(--rotation));
  transform-origin: bottom center;
}

.cardFanItem:hover,
.cardFanItem:focus-within {
  transform: translateX(calc(-50% + var(--x))) translateY(calc(var(--y) - 24px)) rotate(0deg) scale(1.05);
}
```

---

## Handling Different Hand Sizes

A fan should adapt based on the number of cards.

### 1 card

- no rotation
- centered
- no overlap needed

### 2 cards

- small rotation only
- avoid dramatic angles

### 3–7 cards

- normal fan behavior works well

### 8+ cards

- reduce spacing or rotation
- cap max rotation
- consider scroll, compression, or a focused-card preview

Example adaptive logic:

```ts
const spacing = total > 7 ? 22 : 32;
const rotationStep = total > 7 ? 3 : 5;
```

---

## Stacking Order Considerations

The order in which cards visually overlap matters.

Possible approaches:

1. **Left-to-right stacking**  
   Later cards appear above earlier cards.

2. **Center-focused stacking**  
   Cards closer to the center appear above side cards.

3. **Interaction-focused stacking**  
   The hovered/focused card always appears above every other card.

For card games, interaction-focused stacking is usually necessary because the selected card must remain readable and clickable.

---

## Readability Recommendations

A card fan can become hard to read when too many cards are rotated or overlapped.

Recommended safeguards:

- keep rotation moderate
- avoid hiding important cost/title areas
- raise selected card on hover/focus
- consider showing an enlarged preview of the selected card
- reduce fan curvature for small screens
- avoid excessive overlap if card identity is important

---

## Responsive Behavior

On smaller screens, the card fan may need to compress.

Suggested responsive strategies:

- reduce `spacing`
- reduce `rotationStep`
- reduce `curve`
- allow horizontal scroll
- switch to a simpler overlapped row
- show selected card preview above the hand

Example:

```ts
const isCompact = containerWidth < 640;

const spacing = isCompact ? 20 : 32;
const rotationStep = isCompact ? 3 : 5;
const curve = isCompact ? 4 : 8;
```

---

## Accessibility Notes

Card fan interactions should not depend only on hover.

Recommended practices:

- cards should be reachable by keyboard
- focus state should mirror hover behavior
- selected card should have clear visual state
- avoid motion that makes selection unstable
- keep click/drag targets large enough
- support reduced motion preferences if animations become complex

---

## Development Recommendation

Create a dedicated `CardFan` component instead of mixing card fan behavior into a generic row/zone component.

Suggested responsibilities:

### `CardFan`

- calculates position and rotation
- owns fan layout parameters
- handles hover/focus stacking
- supports compact mode
- exposes render slot for card content

### `Card`

- owns card visuals
- owns card-specific labels, image, stats, etc.
- does not know about fan math

This separation keeps the fan reusable for player hand, opponent hand, preview zones, or any other card collection that needs this layout.

---

## Suggested Initial Values

For a moderate digital card-game hand:

```ts
const defaultFanConfig = {
  spacing: 32,
  rotationStep: 5,
  curve: 7,
  hoverOffset: 24,
};
```

For compact battlefield or small zones:

```ts
const compactFanConfig = {
  spacing: 20,
  rotationStep: 3,
  curve: 4,
  hoverOffset: 16,
};
```

---

## Main Takeaways

- A card fan should be treated as a transform-based layout, not a normal flex layout.
- Each card's visual position should be calculated from its index.
- `translate`, `rotate`, and `transform-origin` are the core mechanics.
- Absolute positioning gives better control over overlap and rotation.
- Hover/focus behavior is essential for readability.
- CSS custom properties can make interaction states easier to maintain.
- Responsive behavior should reduce spacing and rotation before the hand becomes unreadable.

---

## References

1. MDN Web Docs — `rotate()` CSS function  
   https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/transform-function/rotate

2. CSS-Tricks — `transform` property overview  
   https://css-tricks.com/almanac/properties/t/transform/

3. Unity Discussions — Creating a card fan alignment function like Slay the Spire  
   https://discussions.unity.com/t/creating-a-card-fan-alignment-function-like-slay-the-spire/888524

4. GameDev StackExchange — How can I evenly fan out a hand of cards?  
   https://gamedev.stackexchange.com/questions/22162/how-can-i-evenly-fan-out-a-hand-of-cards

5. Stack Overflow — Move div outwards from a card fan, based on its rotation  
   https://stackoverflow.com/questions/53815773/move-div-outwards-from-a-card-fan-based-on-its-rotation

6. Medium — Building an interactive card fan with CSS  
   https://medium.com/@leferreyra/first-blog-building-an-interactive-card-fan-with-css-c79c9cd87a14

7. WeAreDevelopers Magazine — Creating a 3D Card Fan with CSS Transforms  
   https://www.wearedevelopers.com/en/magazine/656/creating-a-3d-card-fan-with-css-transforms-656

8. YouTube — Slay The Spire in Unity, Curved Card Hand  
   https://www.youtube.com/watch?v=EgvCO0b6nVQ

9. YouTube — Easy Curved Card Hand in Unity Using Splines  
   https://www.youtube.com/watch?v=hmIS2iBe-iQ

10. YouTube — 2D Card Fanning in Godot with Curves  
    https://www.youtube.com/watch?v=waVOR2ehpuU
