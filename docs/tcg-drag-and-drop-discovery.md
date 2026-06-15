# TCG Simulator Drag and Drop Discovery

## Context

The simulator needs card interactions where a player can drag cards between game zones, such as hand, battlefield, base, deck, banish, graveyard, and temporary stack/chain areas.

The drag and drop solution should support:

- Cards moving between multiple zones.
- Large board areas, not only vertical lists.
- Mouse, touch, pen, and ideally keyboard input.
- Drag handles, because a card may also need click, hover, selection, zoom, and context-menu behavior.
- Collision detection that can be tuned per zone.
- Future integration with visual movement animations between zones.
- React-friendly state handling.

## Recommendation

Use **dnd kit** as the primary drag and drop library.

For the current React implementation, the recommended package is:

```bash
npm install @dnd-kit/react
```

This package provides React hooks and components for draggable elements, droppable targets, and drag/drop event handling. It is also a thin React integration layer over dnd kit's lower-level architecture.

### Why dnd kit is the best fit

A TCG simulator board is not just a list. It has spatial zones, card piles, stacks, battlefields, possibly slots, and temporary areas. dnd kit is a better fit because it supports flexible use cases such as lists, grids, multiple containers, nested contexts, variable-sized items, virtualized lists, 2D games, and custom collision detection.

For this simulator, the mapping is straightforward:

| Simulator concept | Drag and drop concept |
|---|---|
| Card | Draggable item |
| Zone | Droppable target |
| Hand order | Sortable list, later |
| Battlefield slots | Droppable targets or sortable grid, later |
| Chain / stack | Temporary droppable target |
| Invalid move | Rejected drop or visual feedback |
| Game state | Source of truth |

## Library comparison

| Library | Strengths | Limitations | Fit for this simulator |
|---|---|---|---|
| **dnd kit** | React hooks, draggable/droppable primitives, sensors, collision detection, drag handles, sortable support, touch/keyboard support | Requires some custom implementation for game rules and board behavior | **Best fit** |
| **Atlassian Pragmatic Drag and Drop** | Low-level, fast, Vanilla TypeScript, works with any framework, close to a modern Vanilla JS approach | More manual wiring in React; less directly aligned with React state/components | Good alternative if you want lower-level control |
| **React DnD** | Powerful primitives, mature, flexible | HTML5 backend does not support touch by default; touch backend adds complexity | Good for complex custom DnD, but heavier for this case |
| **hello-pangea/dnd** | Excellent accessible list drag/drop experience, good for vertical/horizontal lists | Not designed for freeform boards; grid layouts are not supported yet | Not recommended for the simulator board |
| **Raw Vanilla JS / HTML5 DnD** | No dependency, full control | Browser inconsistencies, touch complexity, more custom code, harder React integration | Not recommended as the main solution |

## Suggested implementation direction

Start with a simple **card-to-zone drag and drop** implementation.

Do not start by solving every game interaction. First prove that a card can move from one zone to another safely and predictably.

### Phase 1: Basic card movement

- Make each card draggable.
- Make each zone droppable.
- On drop, move the card in game state from the source zone to the target zone.
- Use stable card IDs.
- Use stable zone IDs.
- Use the game state as the source of truth.

Example zone model:

```ts
type ZoneId = "deck" | "hand" | "battlefield" | "base" | "banish" | "graveyard";

type Card = {
  id: string;
  name: string;
  code: string;
};

type Zones = Record<ZoneId, Card[]>;
```

### Phase 2: Drag handles

Use a drag handle instead of making the whole card the drag activator.

This is important because cards will likely have other interactions:

- Click to select.
- Double click to zoom or inspect.
- Hover to preview.
- Right click to open actions.
- Tap on mobile.
- Drag to move.

A drag handle reduces accidental movement and keeps the simulator easier to use.

### Phase 3: Collision tuning by zone

Different zones may need different drop behavior.

Suggested defaults:

| Zone type | Suggested collision behavior |
|---|---|
| Large zones, such as battlefield or base | Overlap-based or pointer-based detection |
| Precise slots | Closest-center detection |
| Card stacks | Closest-center or custom detection |
| Hand sorting | Sortable behavior |
| Temporary chain area | Pointer intersection for explicit intent |

### Phase 4: Rules-aware drops

After the basic interaction works, add rule validation.

Examples:

- A battlefield card cannot be dropped into the deck unless a specific effect allows it.
- A unit can be dropped into a battlefield zone.
- A spell may go to the chain first, then graveyard after resolving.
- A banished card goes to the banish zone and should not be mixed with graveyard.

Recommended approach:

```ts
const canMoveCard = ({ card, fromZoneId, toZoneId }: MoveCardInput) => {
  // Game-specific rule validation here.
  return true;
};
```

Keep this validation outside the UI components, so the drag and drop layer remains visual/interaction-focused.

### Phase 5: Add animation polish

Use dnd kit for drag/drop interaction.

Use Motion shared layout animations for state-change movement between zones.

This gives a clean separation:

- **dnd kit** decides what the user is dragging and where they drop it.
- **Game state** decides whether the move is legal and updates the board.
- **Motion** makes the resulting card movement feel smooth.

## Initial implementation sketch

```tsx
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { PointerSensor, PointerActivationConstraints } from "@dnd-kit/dom";
import { useState } from "react";

const zoneIds = ["deck", "hand", "battlefield", "base", "banish", "graveyard"] as const;

type ZoneId = (typeof zoneIds)[number];

type Card = {
  id: string;
  name: string;
  code: string;
};

type Zones = Record<ZoneId, Card[]>;

const initialZones: Zones = {
  deck: [
    { id: "card-1", name: "Jinx, Rebel", code: "OGN-202" },
    { id: "card-2", name: "Charm", code: "OGN-001" },
  ],
  hand: [],
  battlefield: [],
  base: [],
  banish: [],
  graveyard: [],
};

export const GameBoard = () => {
  const [zones, setZones] = useState<Zones>(initialZones);

  const moveCardToZone = (cardId: string, targetZoneId: ZoneId) => {
    setZones((current) => {
      let movedCard: Card | undefined;

      const nextZones = Object.fromEntries(
        Object.entries(current).map(([zoneId, cards]) => {
          const filteredCards = cards.filter((card) => {
            const shouldMove = card.id === cardId;

            if (shouldMove) {
              movedCard = card;
            }

            return !shouldMove;
          });

          return [zoneId, filteredCards];
        })
      ) as Zones;

      if (!movedCard) {
        return current;
      }

      return {
        ...nextZones,
        [targetZoneId]: [...nextZones[targetZoneId], movedCard],
      };
    });
  };

  return (
    <DragDropProvider
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints: (event) => {
            if (event.pointerType === "touch") {
              return [
                new PointerActivationConstraints.Delay({
                  value: 220,
                  tolerance: 8,
                }),
              ];
            }

            return [
              new PointerActivationConstraints.Distance({
                value: 5,
              }),
            ];
          },
        }),
      ]}
      onDragEnd={(event) => {
        if (event.canceled) {
          return;
        }

        const sourceId = String(event.operation.source?.id ?? "");
        const targetId = String(event.operation.target?.id ?? "");

        if (!sourceId.startsWith("card:")) {
          return;
        }

        if (!targetId.startsWith("zone:")) {
          return;
        }

        const cardId = sourceId.replace("card:", "");
        const targetZoneId = targetId.replace("zone:", "") as ZoneId;

        moveCardToZone(cardId, targetZoneId);
      }}
    >
      <div className="grid min-h-screen grid-cols-3 gap-4 bg-slate-950 p-6 text-white">
        {zoneIds.map((zoneId) => (
          <Zone key={zoneId} zoneId={zoneId} cards={zones[zoneId]} />
        ))}
      </div>
    </DragDropProvider>
  );
};
```

Zone component:

```tsx
type ZoneProps = {
  zoneId: ZoneId;
  cards: Card[];
};

const Zone = ({ zoneId, cards }: ZoneProps) => {
  const { ref, isDropTarget } = useDroppable({
    id: `zone:${zoneId}`,
    accept: "card",
  });

  return (
    <section
      ref={ref}
      className={[
        "min-h-48 rounded-xl border border-white/15 bg-white/5 p-3",
        isDropTarget ? "border-primary bg-primary/10" : "",
      ].join(" ")}
    >
      <h2 className="mb-3 font-title text-xs uppercase tracking-wide text-white/60">
        {zoneId}
      </h2>

      <div className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
};
```

Card component:

```tsx
type DraggableCardProps = {
  card: Card;
};

const DraggableCard = ({ card }: DraggableCardProps) => {
  const { ref, handleRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    type: "card",
    data: {
      cardId: card.id,
    },
  });

  return (
    <article
      ref={ref}
      className={[
        "h-36 w-24 rounded-lg border border-white/15 bg-slate-800 p-2 shadow-lg",
        isDragging ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="font-mono text-[10px] text-white/50">{card.code}</div>

      <div className="mt-2 font-title text-xs font-semibold leading-tight">
        {card.name}
      </div>

      <button
        ref={handleRef}
        type="button"
        className="mt-4 rounded border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-white/60"
      >
        Drag
      </button>
    </article>
  );
};
```

## Recommended project architecture

Keep drag and drop logic close to the board, but keep game rules outside the visual components.

Suggested structure:

```txt
src/
  game/
    rules/
      canMoveCard.ts
    state/
      board.types.ts
      board.utils.ts
  components/
    board/
      GameBoard.tsx
      Zone.tsx
      DraggableCard.tsx
      DragOverlayCard.tsx
```

Suggested separation:

| Layer | Responsibility |
|---|---|
| `GameBoard` | Owns board state and drag/drop provider |
| `Zone` | Renders droppable area |
| `DraggableCard` | Renders draggable card and drag handle |
| `canMoveCard` | Validates game rules |
| `moveCardToZone` | Updates board state |
| Motion animation layer | Smooth visual movement after state changes |

## UX recommendations

### Use explicit visual feedback

When a card is dragged over a valid zone, highlight the zone.

When a card is dragged over an invalid zone, use a subtle blocked state instead of silently doing nothing.

Suggested states:

- Default zone.
- Valid drop target.
- Invalid drop target.
- Active dragged card.
- Card placeholder / source ghost.

### Avoid full-card dragging at first

The whole card should probably remain clickable for selection/preview. Use a small drag handle until the interaction model is clearer.

Possible drag handle locations:

- Top-right corner.
- Bottom action strip.
- Small grip icon.
- Long press on mobile only.

### Add mobile delay

For touch input, use a short hold delay before drag starts. This prevents the drag interaction from hijacking normal scroll/tap behavior.

A good starting point:

```ts
new PointerActivationConstraints.Delay({ value: 220, tolerance: 8 })
```

For mouse input, use a small movement threshold:

```ts
new PointerActivationConstraints.Distance({ value: 5 })
```

## Final decision

Use **dnd kit** for the simulator board.

Use **Motion** later for card movement animations between zones.

Do not use raw Vanilla JS / HTML5 drag and drop as the primary implementation, because the simulator needs touch support, collision tuning, game-rule validation, and React state integration.

Do not use **hello-pangea/dnd** as the main board solution, because it is optimized for list-style drag and drop and explicitly does not support grid layouts.

Consider **Atlassian Pragmatic Drag and Drop** only if you decide to move toward a lower-level Vanilla TypeScript approach.

## Search references

### dnd kit

- dnd kit GitHub repository  
  https://github.com/clauderic/dnd-kit

- dnd kit React Quickstart  
  https://dndkit.com/react/quickstart/

- dnd kit React Sensors guide  
  https://dndkit.com/react/guides/sensors/

- dnd kit React Collision Detection guide  
  https://dndkit.com/react/guides/collision-detection/

### Atlassian Pragmatic Drag and Drop

- Pragmatic Drag and Drop overview  
  https://atlassian.design/components/pragmatic-drag-and-drop

- Pragmatic Drag and Drop core package  
  https://atlassian.design/components/pragmatic-drag-and-drop/core-package/

- GitHub repository  
  https://github.com/atlassian/pragmatic-drag-and-drop

### React DnD

- React DnD documentation  
  https://react-dnd.github.io/react-dnd/

- React DnD Touch Backend documentation  
  https://react-dnd.github.io/react-dnd/docs/backends/touch/

### hello-pangea/dnd

- hello-pangea/dnd GitHub repository  
  https://github.com/hello-pangea/dnd
