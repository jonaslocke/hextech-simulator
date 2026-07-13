# Hidden and Facedown Cards — Rules-First Codex Implementation Plan

## 1. Objective

Implement Hidden and facedown-card mechanics as a complete rules subsystem in Hextech Simulator.

The work must solve the current regressions, support the full local card corpus, preserve private information between independent clients, and remain compatible with the simulator’s server-authoritative architecture.

This is a rules and behavior plan, not a prescribed code design. Codex must inspect the current repository, understand the existing state, action, payment, projection, Chain, targeting, cleanup, trigger, decision, and UI contracts, and then choose the implementation that fits those contracts best.

Do not introduce card-name-specific engine branches. Card text must modify general rules through the project’s existing behavior architecture.

---

## 2. Project constraints

Preserve the current project direction:

- The server owns canonical game state, legal actions, hidden information, transitions, and persisted events.
- The client renders a viewer-specific projection and submits intents.
- The client must not infer Hidden legality, payment legality, target legality, or concealed identity.
- The projected legal actions are the source of truth for gameplay commands.
- Existing Play, Chain, Focus, Priority, payment, target selection, pending choices, cleanup, behavior runtime, and projection systems must be reused rather than bypassed.
- New ordinary player decisions should use the current Player Decision System where appropriate.
- Drag-and-drop is only an interaction layer over projected legal actions and is not part of the first correctness milestone.
- Keep automated tests narrow and deterministic. Manual gameplay validation is the primary acceptance method.
- Do not refactor unrelated systems while implementing this feature.

Codex may implement the plan continuously, but it must stop if it encounters a genuine rules or product assumption that cannot be resolved from the local rules, local errata, card corpus, this plan, or existing architecture. It should describe the conflict and wait for direction rather than guessing.

---

## 3. Rules authority

Use the repository’s local rules and card data. Do not search online.

Apply this order:

1. `docs/riftbound_core_rules_reference.md`
2. Local official errata and canonical card overrides
3. The local card corpus
4. `docs/game_definition.md`
5. The explicit user-approved rulings and acceptance cases in this plan

The Golden Rule is mandatory: card text supersedes the default rules.

If local sources disagree about a current card wording or rule, do not silently choose one. Identify the conflict. The known Tideturner wording and ruling in this plan are intentional acceptance requirements and must be represented through official errata/canonical data, not through a card-name branch.

---

## 4. Domain definitions that must remain distinct

### 4.1 Hidden keyword

Hidden is a card characteristic printed or granted to a card.

Having Hidden does not mean that the card is currently facedown.

A card with Hidden in Hand or the Champion Zone may still be played normally at its printed timing, for its normal cost, and with its normal targeting rules.

### 4.2 Facedown state

Facedown is a state of a card occupying a Battlefield’s Facedown Zone.

A facedown card may have been placed there by Hidden or by another effect. Its permissions are defined by the effect that placed it there.

A card can therefore:

- have Hidden without being facedown;
- be facedown because of Hidden;
- potentially be facedown because of another effect without having Hidden.

Do not collapse these concepts into one generic status.

### 4.3 Hide action

Hide is a discretionary game action.

Under the default Hidden rules, it is available while the card is in the player’s Hand or Champion Zone, on that player’s turn, during an Open State, when all prerequisites are satisfied.

Hide:

- is not Play;
- does not open a Chain;
- does not resolve the card’s rules text;
- does not trigger play effects;
- does not count as a card played during the turn;
- moves the card to an eligible Facedown Zone;
- pays the Hide cost specified by the rules or modified by card effects.

### 4.4 Play from facedown or from Hidden

Playing a card from Hidden is a real Play action.

Beginning on the next turn after the card was hidden, the Hidden permission grants Reaction and allows the card to be played while ignoring its base cost.

Playing from Hidden:

- opens a Chain;
- follows the normal Play lifecycle;
- counts as playing a Main Deck card;
- triggers normal play-based effects;
- can also trigger effects that specifically observe playing from Hidden or face down;
- must preserve the Battlefield association created when the card was hidden;
- follows the normal rules for countering and determining whether the card was successfully played.

Do not implement it as a reveal action followed by an unrelated effect.

---

## 5. Facedown Zones and capacity

Each Battlefield has an associated Facedown Zone.

Default behavior:

- the zone is a board sub-zone, not a Location;
- it normally holds one card;
- a player may place a card there only while that player controls the associated Battlefield;
- the number of cards occupying it is public;
- the face and identity of each card are private to its controller unless another rule or effect grants access or reveals it.

The default capacity must be rules-derived, not an immutable one-card assumption.

### Bandle Tree — OGN-278

Bandle Tree says, “You may hide an additional card here.”

Therefore:

- its Facedown Zone normally supports two cards for the player allowed to hide there;
- after the first card is hidden there, another legal Hide option remains;
- after the second card is hidden there, no third Hide is available without another modifier;
- both cards remain independent game objects;
- each card has its own Hidden timing and play eligibility;
- playing or removing one card does not remove the other;
- the UI and projection must support more than one facedown card at the same Battlefield;
- the engine must evaluate current capacity from rules and card effects.

This is a direct Golden Rule case. Do not special-case Bandle Tree by name, and do not model the Facedown Zone as a permanently singular slot.

---

## 6. Privacy, projection, and visibility

### Controller view

The controller must be able to identify and inspect their own facedown cards.

The exact visual presentation may follow the existing board design, but the card must not disappear after being hidden. It must remain visibly represented in the associated Battlefield’s Facedown Zone.

### Opponent view

An opponent must see only:

- that one or more facedown cards exist;
- the number of facedown cards;
- their associated Battlefield;
- anonymous Main Deck card backs or equivalent concealed representations.

The opponent must not receive or infer:

- card name;
- card definition;
- rules text;
- cost;
- type;
- tags;
- image;
- internal metadata that identifies the card;
- a stable identifier that can be correlated with a previously seen private card.

### Logs

Hiding a card must produce viewer-specific log information.

The controller may see a message identifying the card.

The opponent must see only that a card was hidden at the named Battlefield.

Once a card is legally played or revealed, its identity may become public and the public log may identify it.

The concealed name must not leak through:

- public event text;
- accessibility text;
- animation information;
- action history;
- debug labels;
- pending decisions;
- transport metadata;
- spectator or opponent projections.

### Looking versus revealing

Looking at a facedown card and revealing it are different operations.

- Looking grants the permitted viewer temporary access without making the identity public.
- Revealing discloses the card according to the effect and must be represented consistently in projections and logs.

Scuttle Crab and Noxus Saboteur must not be implemented as the same visibility operation.

---

## 7. Hide timing and legal action presentation

### Default timing

Under the default rules, Hide is available only:

- on the card controller’s turn;
- during an Open State;
- from a permitted source zone;
- when the destination Battlefield is controlled by that player;
- when the destination has available facedown capacity;
- when the Hide cost can be paid;
- when no rule or effect prohibits the action.

Hide is not available merely because the player has Focus during a Showdown or another Closed State.

Card text may modify this default under the Golden Rule.

### Show only real actions

The card action menu must display only actions that are currently legal and executable according to the server projection.

Do not show:

- disabled payment variants as commands;
- illegal Battlefield destinations;
- normal Play commands whose cost cannot be paid;
- Hide commands during a Showdown when no effect permits Hide;
- multiple speculative forms of the same action;
- diagnostic failure reasons as if they were selectable actions.

When a card has no legal action, display one non-action state: `Not Playable`.

Reasons may be available elsewhere as explanatory UI, but they must not clutter the command menu with impossible actions.

### Destination-specific Hide options

A legal Hide option must identify its actual destination.

If a card can be hidden at two Battlefields, the menu should show two real Hide options, one for each Battlefield.

If only one destination is legal, selecting that option must not open a generic Battlefield target prompt.

The Facedown Zone is the action’s destination. It is not a card target.

### Consult the Past — OGN-083

During a Showdown:

- Hide must not appear under the default rules.
- Normal face-up Play may appear because Consult the Past has printed Reaction.
- If its normal cost cannot be paid, the menu must show only `Not Playable`.

After the Showdown, during the controller’s own Open State:

- normal face-up Play may appear if its normal cost is payable;
- a Hide option may appear for each controlled Battlefield with available facedown capacity;
- if normal Play is not payable and Obelisk of Power is the only legal destination, the only actionable entry should be `Hide Consult the Past at Obelisk of Power`.

Selecting Hide must not open the `Required targets` prompt because Consult the Past has no target and the Hide destination is not a target.

---

## 8. Hide payment behavior

The Hide cost uses the deck’s Domain Identity, not the card’s printed domain.

Hide payment must remain server-authoritative and fully validated, but it must not use the generic automatic-payment behavior that chooses and consumes resources without player confirmation.

For every Hide action:

- the player must explicitly select or approve the concrete legal payment;
- the simulator must not automatically activate, exhaust, recycle, or otherwise use a ready Rune to generate the required Power;
- the simulator must not silently choose between multiple valid Hide-payment methods;
- only legal payment options should be presented;
- a stale or no-longer-legal payment must be rejected by the server.

Card effects can modify Hide payment:

- Swift Scout can provide an alternative Energy payment.
- Guerilla Warfare can allow cards to be hidden while ignoring costs.
- Future cards may increase, replace, reduce, or otherwise alter the default cost.

These are Golden Rule modifications to the Hide action. They must integrate with the existing payment system without creating card-name branches.

Playing a card from Hidden ignores its base cost, not every possible cost. Mandatory and optional additional costs continue to function according to the normal Play rules.

---

## 9. Hide is not Play — game-wide semantic requirement

This distinction must be respected everywhere the engine records, counts, checks, or reacts to played cards.

Hiding a card must not:

- increment cards played this turn;
- satisfy Legion;
- count as the first, second, or later card played;
- trigger Darius, Trifarian;
- trigger “when you play a card”;
- trigger “when you play a spell”;
- trigger “when you play a unit”;
- trigger “when you play me” on the hidden card;
- satisfy conditions based on having played a card;
- create or resolve a Chain item.

Playing that card later from Hidden must:

- count as a card played;
- participate in the same turn-history semantics as any other successful Play;
- satisfy Legion when appropriate;
- trigger Darius, Trifarian when it is the second card played in the turn;
- trigger ordinary play-based abilities;
- also trigger effects that specifically observe Play from Hidden or face down.

The engine must not treat Hide as a special kind of Play for convenience.

It must also not treat Play from Hidden as something less than Play.

### Legion

Legion requires a previously played Main Deck card.

A hidden card does not satisfy Legion.

A card successfully played from Hidden does count for Legion under the normal Play rules.

### Darius, Trifarian — OGN-027

Darius triggers when its controller plays their second card in a turn.

Example:

1. Play one card.
2. Hide a card.
3. Darius must not trigger.
4. Play another card.
5. That card is the second played card, so Darius triggers.

Alternative example:

1. Play one card.
2. Play an eligible card from Hidden.
3. The Hidden-origin card is the second played card, so Darius triggers.

Use the existing definition of when a Play is completed. Do not create a separate counting rule for Hidden-origin cards.

---

## 10. Playing from Hidden

### Eligibility

A card hidden through the Hidden keyword cannot be played through that permission during the same turn in which it was hidden.

Beginning on the next turn, it gains the Hidden play permission.

Each facedown card must track its own eligibility. This matters when Bandle Tree holds cards hidden on different turns.

### Timing

The Hidden permission grants Reaction while the card remains facedown and eligible.

This does not remove the card’s normal play option before it is hidden. A card with Hidden in Hand or the Champion Zone may still be played normally according to its printed timing and cost.

### Cost

Playing from Hidden ignores the base cost.

Additional costs, cost increases, restrictions, and other Play requirements continue to apply unless card text says otherwise.

### Chain and public identity

Playing from Hidden opens a Chain normally.

Once the card is played, its identity becomes public through the normal Play presentation.

The source Facedown Zone must stop displaying that concealed card once it has legally entered the Play process.

### Units and Gear

A Unit played from Hidden must be played to the Battlefield where it was hidden, unless an explicit rule or card effect overrides that requirement.

Gear played from Hidden must follow the Hidden destination requirement and then the normal Gear cleanup/recall rules.

Zhonya’s Hourglass is an important acceptance case for Hidden Gear and Cleanup.

---

## 11. Battlefield-associated choices and the Golden Rule

The associated Battlefield imposes default restrictions, but those restrictions are not absolute when explicit card text contradicts them.

Apply the following rules:

- A Hidden Unit is normally played to the Battlefield where it was hidden.
- Targets of a Hidden spell are normally restricted to valid targets at that Battlefield.
- Targets of the play effect of a permanent played from Hidden are normally restricted to that Battlefield.
- If a Hidden spell or play effect causes a Unit to be played, that Unit is normally played to that Battlefield.
- Non-targeted or global instructions continue to function normally.
- Explicit card restrictions can override the default associated-Battlefield restriction under the Golden Rule.

Do not apply a blanket filter to every choice made during or after the card’s resolution.

The engine must understand which choices are:

- targets of the Hidden spell;
- targets of the play effect of a Hidden permanent;
- destinations required by Hidden;
- later choices unrelated to the initial Hidden play;
- global instructions;
- explicit card-text exceptions.

### Hidden Blade — OGN-213

Hidden Blade is hidden at Trifarian War Camp.

The opponent attacks with a Recruit at Obelisk of Power.

The attack creates a valid Reaction window, but the Recruit at Obelisk is not a legal target for that Hidden Blade because the spell was hidden at Trifarian War Camp.

If Hidden Blade has no valid target at Trifarian War Camp, it cannot be played from Hidden.

### Tideturner — OGN-199

The current official wording requires Tideturner to choose a Unit its controller controls at another location.

Tideturner is an explicit Golden Rule exception:

- it is still played to the Battlefield where it was hidden;
- its play ability explicitly requires a Unit at another location;
- that target may therefore be chosen outside the associated Battlefield;
- Tideturner and the chosen Unit exchange locations according to the card text.

If Tideturner is hidden at Trifarian War Camp and its controller has a Unit at Obelisk of Power, that Unit can be chosen.

The opponent’s Recruit cannot be chosen because Tideturner requires a Unit you control.

This behavior must come from the general interaction between Hidden restrictions and explicit targeting restrictions, supported by canonical errata. Do not special-case Tideturner by name.

### Stand United

When played from Hidden, the friendly Unit chosen for the Buff must be at the associated Battlefield.

The instruction that Buffs give an additional bonus to friendly Units this turn remains global. It is not restricted to that Battlefield because it is not the targeted choice.

---

## 12. Cleanup, control, and zone changes

During Cleanup:

- a facedown Hidden card cannot remain at a Battlefield that is no longer controlled by the same player;
- it is placed in its owner’s Trash;
- this applies independently to every facedown card at that Battlefield, including multiple cards at Bandle Tree;
- cleanup must occur through the existing cleanup lifecycle, not as an immediate client-side reaction.

When a facedown card leaves for a Private or Secret zone, or when the game ends, apply the required reveal rules before concealing it again.

Returning a facedown card to Hand must:

- remove it from the Facedown Zone;
- clear the Hidden play permission tied to that placement;
- reveal it as required by the rules;
- preserve Hand privacy after the reveal procedure.

Cards that are moved to Trash become public through the normal public-zone rules.

---

## 13. Corpus behavior families

Before finalizing the engine changes, Codex must audit all Hidden and facedown references in the local OGN, SFD, UNL, and other active set files.

The audit must separate these behavior families.

### Base Hidden cards

Representative examples:

- Consult the Past
- Stand United
- Hidden Blade
- Teemo, Scout
- Teemo, Strategist
- Tideturner
- Zhonya’s Hourglass
- Switcheroo
- Edge of Night
- Mischevious Marai
- Lotus Trap
- Keeper of Masks
- Bone Skewer

### Hide-event observers

Representative example:

- Katarina, Reckless

“When you hide a card” must observe Hide only.

### Played-from-Hidden or played-from-face-down observers

Representative examples:

- Teemo, Strategist
- Ember Monk
- Black Market Broker
- Evelynn, Entrancing
- Katarina, Reckless

These observe the later Play, not the earlier Hide.

### Facedown-presence checks

Representative examples:

- Monster Harpoon
- Mushroom Pouch

These check actual facedown cards controlled on the board, not cards with Hidden in Hand.

### Hide-cost modifiers

Representative examples:

- Swift Scout
- Guerilla Warfare

### Facedown-card manipulation

Representative examples:

- Pack of Wonders
- Scuttle Crab
- Noxus Saboteur

These require separate concepts for returning, looking, revealing, and preventing reveal.

### Cards that play a card with Hidden without hiding it

Representative example:

- Ava Achiever

Playing a card with Hidden from Hand through another effect is:

- a Play;
- from Hand;
- not Hide;
- not Play from Hidden;
- not Play from face down.

This distinction must be preserved for triggers, restrictions, and logs.

### Complex multi-stage interactions

Bone Skewer should be implemented after the foundational rules are stable because it combines Hidden with Battlefield selection, Hand revelation, an opponent decision, forced Play, and later effects.

---

## 14. Required implementation sequence

### Phase 0 — Repository and regression audit

Before changing behavior:

- inspect the current Hidden implementation and every change added in the previous unsatisfactory attempt;
- identify why hidden cards disappear from the board;
- identify where concealed names leak into opponent logs or projections;
- identify where the action menu manufactures disabled or impossible actions;
- identify why Hide enters the required-target flow;
- identify where automatic payment activates or consumes Rune resources;
- identify how the engine currently records cards played this turn;
- identify how Legion, Darius, and other play observers consume that history;
- identify how Battlefield control, Cleanup, card origin, and viewer projection are represented;
- remove or replace unnecessary UI-only metadata introduced by the prior attempt when it has no valid rules purpose.

Do not begin by adding more metadata. First establish which existing concepts can represent the rules.

### Phase 1 — Facedown state, capacity, and privacy

Deliver:

- persistent facedown cards associated with Battlefields;
- default capacity and card-modified capacity;
- support for multiple cards at Bandle Tree;
- controller-visible identity;
- opponent-safe concealed projection;
- board rendering that does not lose the card;
- viewer-safe logs and events;
- persistence across refresh and independent clients.

### Phase 2 — Correct Hide action

Deliver:

- correct default timing;
- correct source zones;
- only controlled Battlefields with available capacity;
- destination-specific legal actions;
- explicit manual Hide payment;
- no automatic Rune usage;
- no Chain;
- no target prompt;
- no Play event or played-card history change;
- immediate authoritative projection into the Facedown Zone after success.

### Phase 3 — Play from Hidden

Deliver:

- next-turn eligibility;
- Reaction permission;
- normal Chain integration;
- base-cost ignore behavior;
- additional costs and other requirements;
- public identity on Play;
- normal play history and triggers;
- Hidden-origin and face-down-origin observers;
- fixed associated-Battlefield context.

### Phase 4 — Targeting, destinations, and Golden Rule exceptions

Deliver:

- Hidden Blade behavior;
- Tideturner behavior;
- Stand United’s targeted and global portions;
- Unit and Gear destination rules;
- target revalidation through Chain and persisted decisions;
- no loss of the associated Battlefield during resumable choices;
- explicit card text overriding default rules without card-name branches.

### Phase 5 — Cleanup and visibility operations

Deliver:

- control-based facedown removal;
- owner Trash destination;
- reveal-on-private/secret-zone-change;
- game-end reveal;
- return-to-Hand behavior;
- temporary look permissions;
- reveal restrictions;
- independent handling of multiple facedown cards.

### Phase 6 — Full corpus integrations

Deliver the reusable behavior needed by:

- Hide observers;
- Play-from-Hidden observers;
- facedown-presence checks;
- payment modifiers;
- capacity modifiers;
- return, look, reveal, and reveal-prevention effects;
- complex Hidden cards.

Implement representative cards in increasing complexity. Do not use Bone Skewer as the foundation.

### Phase 7 — UI polish and optional drag-and-drop

Only after click/menu behavior and manual acceptance are correct:

- refine concealed-card stacking and inspection;
- add clear eligibility feedback for the controller;
- add temporary inspection UI;
- add Hand-to-Facedown drag-to-hide only if it resolves from projected legal actions;
- keep play-from-Hidden explicit unless a separate interaction is intentionally designed.

---

## 15. Manual acceptance scenarios

### A. Current regression: card persistence and privacy

1. Player 1 hides Consult the Past at a controlled Battlefield.
2. Player 1’s client continues to show the card in that Facedown Zone and can identify it.
3. Player 2’s client shows only an anonymous card back.
4. Refresh both clients.
5. Both views remain correct.
6. Player 2’s log does not contain the card name.

### B. Current regression: context menu during Showdown

1. Consult the Past is in Hand.
2. A Showdown is active.
3. The player cannot pay its normal face-up cost.

Expected:

- no Hide entry;
- no disabled Play variants;
- only `Not Playable`.

Repeat while the player can pay the normal Reaction cost.

Expected:

- normal face-up Play is available;
- Hide is still absent.

### C. Current regression: Hide after Showdown

1. The Showdown ends.
2. It is the card controller’s turn during an Open State.
3. The player cannot pay Consult the Past’s normal Play cost.
4. The player controls Obelisk of Power with available facedown capacity.

Expected:

- the actionable entry is `Hide Consult the Past at Obelisk of Power`;
- selecting it opens payment selection or confirmation;
- it does not open `Required targets`.

### D. Current regression: manual Hide payment

1. The player has more than one possible way to produce or spend the required Power.
2. Select Hide.

Expected:

- the player chooses the concrete payment;
- no ready Rune is automatically activated, exhausted, recycled, or spent;
- the selected payment is validated by the server.

### E. Hide is not Play

1. Start a turn with no cards played.
2. Hide a card.
3. Check Legion and all “played a card” conditions.

Expected:

- none are satisfied by Hide.

### F. Darius, Trifarian

1. Play one card.
2. Hide another card.

Expected:

- Darius does not trigger.

Then play another card.

Expected:

- that is the second played card;
- Darius triggers.

Repeat with the second card played from Hidden.

Expected:

- Darius triggers because Play from Hidden is Play.

### G. Bandle Tree

1. Control Bandle Tree.
2. Hide one card there.

Expected:

- a second Hide option at Bandle Tree remains.

3. Hide a second card there.

Expected:

- both cards are represented;
- the controller can identify both;
- the opponent sees two anonymous card backs;
- no third Hide is available without another modifier;
- each card follows its own next-turn eligibility.

### H. Normal Battlefield capacity

1. Hide one card at a normal Battlefield.

Expected:

- no second Hide option exists there under the default rules.

### I. Hidden Blade association

1. Hidden Blade is hidden at Trifarian War Camp.
2. An opponent’s Recruit attacks at Obelisk of Power.

Expected:

- the Reaction window may allow Hidden Blade to be considered;
- the Recruit at Obelisk is not a legal target;
- Hidden Blade cannot be played from Hidden if it has no legal target at Trifarian War Camp.

### J. Tideturner exception

1. Tideturner is hidden at Trifarian War Camp.
2. Its controller has a Unit at Obelisk of Power.
3. Play Tideturner from Hidden.

Expected:

- Tideturner is played to Trifarian War Camp;
- its Unit at Obelisk may be chosen because the card explicitly requires another location;
- the two Units exchange locations;
- an opponent’s Unit cannot be chosen.

### K. Stand United targeted versus global effect

1. Stand United is hidden at a Battlefield.
2. Play it from Hidden.

Expected:

- its chosen Unit must be at that Battlefield;
- its global Buff-related instruction applies normally to all qualifying friendly Units.

### L. Cleanup

1. Hide one or more cards at a controlled Battlefield.
2. Cause the Battlefield to no longer be controlled by that player.
3. Reach Cleanup.

Expected:

- every affected Hidden card is moved to its owner’s Trash;
- identities become public as required;
- no concealed card remains illegally attached to the Battlefield.

### M. Return and inspection

Validate:

- Pack of Wonders returns the correct facedown card and applies the required reveal procedure.
- Scuttle Crab grants only the specified player temporary access to look.
- Noxus Saboteur restricts reveal at the relevant Battlefield without incorrectly removing the owner’s normal private access.

### N. Hidden Gear

Play Zhonya’s Hourglass from Hidden.

Expected:

- it follows the associated-Battlefield rule;
- it then follows normal Gear cleanup/recall behavior.

### O. Card with Hidden played from Hand by another effect

Use Ava Achiever or an equivalent effect.

Expected:

- the card is played from Hand;
- it counts as Play;
- it is not treated as Hide;
- it is not treated as played from facedown;
- Hidden-specific origin triggers do not fire.

### P. Countered Hidden-origin card

Play a card from Hidden and counter it.

Expected:

- it follows the simulator’s normal Counter and Play-completion rules;
- Hidden origin does not create a separate exception for play-history triggers.

---

## 16. Testing discipline

Automated testing should remain minimal.

Add only focused deterministic coverage for rules that are especially vulnerable to privacy or semantic regressions:

- opponent projection cannot expose facedown identity;
- Hide does not modify played-card history;
- Play from Hidden does use normal played-card history;
- default and modified facedown capacity;
- Hide timing and next-turn eligibility;
- destination-specific legal action discovery;
- no target requirement for Hide;
- associated-Battlefield target restriction and Tideturner exception;
- manual Hide payment is respected;
- cleanup removes affected cards;
- persisted facedown state survives a repository round trip.

Do not add broad GameBoard integration tests, visual snapshots, or tests that encode temporary component structure.

Run the existing type checks and focused tests after each coherent phase. Manual acceptance is required before moving to the next phase.

---

## 17. Definition of done

The feature is complete only when all of the following are true:

- facedown cards persist and render correctly;
- opponent identity remains concealed across projections, logs, refreshes, and online clients;
- the action menu shows only real legal actions;
- Hide never enters the target-selection flow;
- Hide payment is explicitly player-selected and never silently consumes a ready Rune;
- Hide is not counted as Play anywhere;
- Play from Hidden behaves as normal Play everywhere;
- Legion and Darius behave correctly;
- next-turn eligibility works independently per card;
- associated-Battlefield restrictions work;
- Tideturner and other Golden Rule exceptions work without card-name branches;
- Bandle Tree supports additional facedown capacity;
- cleanup, reveal, return, and inspection rules work;
- the representative OGN, SFD, and UNL card families are supported through reusable behavior;
- the server remains authoritative and the client does not invent legality.
