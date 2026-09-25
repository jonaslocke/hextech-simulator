# Play-from-Hand Context Menu UI Improvement

## Objective

Improve the play-from-hand context menu for cards that expose multiple legal play actions, especially when optional or additional costs create several combinations of destination and payment mode.

The change should preserve the current simple experience for cards with only one play option while making multi-option cards easier to understand and preventing context-menu actions from being clipped outside the visible game area.

## Current Problem

The current context menu renders each projected play action as an independent menu item.

For a unit such as `Clockwork Keeper`, this can produce up to six entries when the player controls multiple Battlefields and the card can be played using more than one payment mode.

Example:

```text
Play Clockwork Keeper to Base

Play Clockwork Keeper to Base
Cost: [2] [Calm]

Play Clockwork Keeper to Ornn's Forge

Play Clockwork Keeper to Ornn's Forge
Cost: [2] [Calm]

Play Clockwork Keeper to Seat of Power

Play Clockwork Keeper to Seat of Power
Cost: [2] [Calm]
```

This creates two UI problems:

1. Destination and payment mode are presented as repeated flat actions instead of as related choices.
2. The menu can become taller than the available viewport, causing the final options to be clipped.

## Proposed Experience

### Preserve the Current Simple Case

Cards with only one legal play action should keep the current presentation.

Example:

```text
Play <Card Name> to Base
Cost: [2]
```

No submenu or additional interaction should be introduced when it is unnecessary.

### Group Multi-Option Play Actions

When the same card exposes multiple payment modes, replace the repeated flat play entries with a single root action:

```text
Play Clockwork Keeper  ›
```

Opening the submenu should show the existing projected play actions grouped by payment mode.

Example:

```text
STANDARD

Base                         [2]
Ornn's Forge                 [2]
Seat of Power                [2]

──────────────────────────────

ADDITIONAL COST

Base                    [2] [Calm]
Ornn's Forge            [2] [Calm]
Seat of Power           [2] [Calm]
```

The player still selects one of the existing projected actions. The UI only changes how those actions are organized and presented.

## Presentation Rules

Use adaptive presentation based on the legal play actions available for the selected card.

| Situation | Presentation |
| --- | --- |
| One legal play action | Preserve the current single menu item |
| Multiple destinations with one payment mode | Preserve the existing destination-oriented presentation |
| Multiple payment modes | Use one `Play <Card Name>` submenu and group actions by payment mode |
| A payment mode has only one destination | Keep that destination inside its payment-mode group for consistency |

Do not mix interaction patterns within the same submenu.

## Cost Presentation

When multiple payment modes are being compared, show the cost for every option.

For example:

```text
STANDARD
Base                         [2]

ADDITIONAL COST
Base                    [2] [Calm]
```

Do not rely on the absence of a cost row to communicate the standard payment.

Use the project's existing resource icons and cost presentation rather than introducing a new visual language.

## Payment Mode Labels

The initial generic grouping should use labels such as:

- `Standard`
- `Additional cost`

Do not parse arbitrary card rules text in the UI to generate labels such as effect descriptions.

If the server projection already provides stable presentation metadata that clearly describes a payment mode, that metadata may be reused.

The client must not invent gameplay semantics.

## Viewport and Clipping Behavior

The menu and its submenus must remain accessible inside the visible game viewport.

Use the existing shadcn/Radix context-menu primitives and their collision-aware positioning rather than manually positioning the submenu.

Expected behavior:

- Prefer the normal submenu direction when enough space exists.
- Shift or reposition the submenu when it would otherwise leave the viewport.
- Prevent menu content from extending below or outside the visible game area.
- If the available vertical space is still insufficient, constrain the menu to the available height and allow the content to remain accessible rather than clipping actions.

The grouped submenu should reduce the root-menu height, but viewport containment must be treated as an explicit requirement rather than relying only on the reduced number of root actions.

## Component Direction

Prefer the existing shadcn/Radix context-menu primitives.

The intended structure is conceptually:

```text
ContextMenuSub
  ContextMenuSubTrigger
    Play <Card Name>

  ContextMenuSubContent
    ContextMenuLabel
      Standard

    ContextMenuItem
      Base
      Cost

    ContextMenuItem
      Battlefield A
      Cost

    ContextMenuItem
      Battlefield B
      Cost

    ContextMenuSeparator

    ContextMenuLabel
      Additional cost

    ContextMenuItem
      Base
      Cost

    ContextMenuItem
      Battlefield A
      Cost

    ContextMenuItem
      Battlefield B
      Cost
```

Do not reproduce the manually positioned submenu used in the visual prototype. The real implementation should let Radix own submenu placement and collision handling.

## Architecture Constraints

This is a UI presentation change.

The implementation must preserve the existing server-authoritative action model.

Do not:

- merge multiple projected actions into a new client-side action;
- create new game-rule logic in the UI;
- infer legality from card text;
- create a second play-action protocol;
- change the underlying action payload merely to support the new menu.

The UI should group and render the legal actions already projected by the server and submit the selected action through the existing action-submission flow.

## Accessibility

Preserve the accessibility behavior provided by shadcn/Radix.

The final interaction should support:

- keyboard navigation;
- focus management;
- semantic menu items;
- accessible labels;
- submenu navigation;
- visible focus states.

Do not replace semantic menu controls with custom clickable containers solely for visual styling.

## Scope

### In Scope

- Play-from-hand context-menu presentation.
- Grouping play actions when multiple payment modes exist.
- Displaying comparable costs for grouped options.
- shadcn/Radix submenu usage.
- Viewport collision handling.
- Preventing context-menu options from being clipped.
- Preserving the current simple experience for cards with one play option.

### Out of Scope

- Gameplay rule changes.
- Payment calculation changes.
- Legal-action generation changes unless a missing presentation field is strictly required by the UI.
- Card text interpretation in the client.
- Board layout changes.
- Drag-and-drop behavior.
- Changes to other player-decision dialogs unless they directly reuse this context-menu component.

## Acceptance Criteria

```gherkin
Scenario: Preserve a regular single play action
  Given a card in hand has exactly one legal play action
  When the player opens the card context menu
  Then the existing single play-action presentation is shown
  And no additional submenu is introduced

Scenario: Group play actions with multiple payment modes
  Given a card in hand has legal play actions using more than one payment mode
  When the player opens the card context menu
  Then a single Play action is shown for that card
  And that action opens a submenu containing the legal play options
  And the options are grouped by payment mode

Scenario: Show destinations within each payment mode
  Given a card can be played to Base and multiple controlled Battlefields
  And the card has multiple payment modes
  When the player opens the Play submenu
  Then each legal destination is shown within the applicable payment-mode group
  And selecting a destination submits the corresponding existing projected action

Scenario: Show comparable costs
  Given the Play submenu contains more than one payment mode
  When the submenu is displayed
  Then every option displays its applicable cost
  And the player can visually distinguish the standard cost from the additional cost

Scenario: Keep the menu inside the visible viewport
  Given the player opens the context menu close to an edge of the game viewport
  When the Play submenu is opened
  Then the menu uses collision-aware positioning
  And the submenu remains accessible within the visible game area
  And no legal play option is clipped outside the viewport

Scenario: Constrain content when vertical space is limited
  Given the available vertical space is smaller than the complete submenu content
  When the submenu is displayed
  Then the menu content is constrained to the available height
  And all legal options remain accessible
  And actions are not silently hidden below the viewport

Scenario: Preserve server-authoritative actions
  Given multiple projected legal play actions are grouped in the UI
  When the player selects one option
  Then the client submits the corresponding existing projected action
  And the client does not create or infer a new gameplay action
```

## Validation

Validate the change with at least:

- a regular card with one play option;
- a unit with multiple legal destinations but one payment mode;
- a unit with multiple destinations and an optional/additional cost;
- the context menu opened near the bottom edge of the board;
- the context menu opened near the right edge of the board;
- keyboard navigation through the root menu and submenu.

The implementation should be considered complete only when every legal action remains reachable without changing the underlying gameplay behavior.
