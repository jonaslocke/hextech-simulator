# Best-of-Three Match Models — Codex Implementation Plan

**Project:** Hextech Riftbound Simulator  
**Scope:** Server-authoritative BO3 match orchestration, persistence, transport, and host integration  
**Status:** Product and architecture decisions resolved  
**Dependencies:** Existing single-game engine and setup flow  
**Parallel fronts not implemented here:** Sideboarding/deck-reconfiguration UI and the standalone deck-validation API


## 0. Codex execution contract

This plan is intended to be implemented by Codex in one continuous execution. The product and architecture decisions in this document are closed and must be treated as authoritative.

### One-go implementation

- Implement the complete plan in one workflow, across all milestones required for the end-to-end BO3 capability.
- Do not stop between milestones to request routine confirmation, report progress, or ask permission to continue.
- Do not reduce the scope to a partial implementation unless a blocking assumption is discovered.
- Follow the repository's existing architecture and conventions where they provide a clear answer.

### No-assumption stop rule

Codex must not make an unstated product, rules, architecture, persistence, API, or UX assumption.

If implementation requires a decision that is not answered by this plan, the local rules, or an established repository convention, Codex must immediately stop the workflow before implementing the assumption.

When stopping, Codex must:

1. Identify the exact unresolved decision and where it blocks implementation.
2. Explain why the existing plan, rules, and repository do not resolve it.
3. Present concrete implementation options, including the relevant trade-offs.
4. Recommend one option when there is a defensible technical preference, clearly labeling it as a recommendation rather than a decision.
5. Wait for explicit user direction before continuing.

Codex must not:

- silently choose an option;
- leave a TODO and continue around the unresolved decision;
- implement multiple competing approaches;
- invent temporary behavior that changes the contract;
- treat an assumption as an implementation detail when it affects observable behavior or future architecture.

A repository detail that can be resolved by inspecting existing code is not an assumption. Codex must inspect the repository and follow the established pattern. Stop only when inspection still leaves a meaningful unresolved choice.

## 1. Objective

Replace the current one-game match lifecycle with a server-authoritative Riftbound **1v1 Match** that always uses best-of-three rules.

The implementation must wrap the existing game engine with a match orchestration layer rather than expanding one `GameDocument` to contain multiple rounds.

The completed flow is:

```text
Create match
  -> create fresh Game 1
  -> Game 1 setup
  -> Game 1 play
  -> record Game 1 result
  -> if a player has two set points: complete match
  -> otherwise enter between-games state
  -> both players independently become ready
  -> create fresh Game 2 using the unchanged deck configurations
  -> Game 2 setup with unused Battlefields
  -> Game 2 play
  -> record Game 2 result
  -> if a player has two set points: complete match
  -> otherwise enter between-games state
  -> both players independently become ready
  -> create fresh Game 3 using the unchanged deck configurations
  -> automatically select each player's final unused Battlefield
  -> starting-player choice and mulligans
  -> Game 3 play
  -> record result
  -> complete match
```

This first implementation must be structurally ready for the future sideboarding feature. For now, readiness submits the player's currently active deck configuration unchanged.

## 2. Scope boundaries

### In scope

- BO3-only match creation.
- Match-level lifecycle and state versioning.
- One to three independently persisted `GameDocument` records per match.
- Persisted game numbering.
- Compact completed-game summaries in the match.
- Set-score derivation.
- Battlefield-use derivation and rotation.
- Random starting-player chooser for Game 1.
- Previous-game loser as chooser for Games 2 and 3.
- A real `between_games` match state.
- Independent per-player readiness.
- Temporary unchanged-deck submission behind centralized feature flags.
- Future-ready current deck configurations.
- Stable registered-card-copy identity across the match.
- Fresh runtime card instances for every game.
- Automatic Battlefield selection for Game 3.
- Current-game concession as a game loss.
- Between-games match concession as immediate match completion.
- MongoDB transactions for multi-document transitions.
- Deterministic IDs and idempotency guards.
- Match-level projection and intent dispatch.
- Local and online host integration.
- A temporary between-games screen sufficient to play BO3 end to end.

### Out of scope

- BO1 support or a configurable match-format engine.
- Best-of-five or arbitrary set lengths.
- Editing a deck between games.
- The final sideboarding editor.
- The deck-reconfiguration intent.
- Calling the future deck-validation API between games.
- Sideboard legality implementation.
- Changing the Champion Legend, Rune Deck, or registered Battlefield pool.
- Battlefield-selection, starting-player-selection, or mulligan UX redesign.
- A completed-game history browser.
- Migration or preservation of pre-BO3 development data.
- New realtime architecture unrelated to propagating the existing match projection.

## 3. Rules validation and product decisions

### Rules-backed behavior

The local rules are authoritative.

- **Rule 645.5:** Each player registers three Battlefields, uses one per game, and cannot select a used Battlefield again during the same Match.
- **Rule 645.6:** A 1v1 Match is best of three. A game winner earns one set point; the first player to two set points wins the Match. After each game, players reset the game state and choose new Battlefields.
- **Rule 645.7:** The player going second receives the mode's first-turn Rune adjustment in every game.
- **Rules 110–118:** Setup places the Legend and Chosen Champion, prepares and shuffles the Main Deck and Rune Deck, determines turn order, draws opening hands, performs mulligans, and begins play.
- **Rules 649–652:** An in-progress game may be conceded; in a two-player game, the remaining player wins that game.

Therefore, Game 2 and Game 3 must be new authoritative games. A completed `GameDocument` must never be cleared and reused.

Every game independently resets at least:

- point score;
- board and zones;
- card runtime state;
- resources and Runes in play;
- turn, phase, Focus, and Priority;
- Chain and Showdown state;
- pending decisions and choices;
- modifiers, delayed effects, triggers, and combat;
- opening hand and mulligan state;
- first-turn adjustment tracking.

The Main Deck and Rune Deck are shuffled again as part of each new game's setup.

### Explicit Hextech product rules

The following decisions are deliberate project behavior where the core rules are silent or less specific:

- Hextech supports BO3 only after this implementation.
- Before Game 1, the starting-player chooser is selected randomly.
- Before Game 2 or Game 3, the loser of the previous game chooses who starts.
- Both players must independently confirm readiness before the next game is created.
- The initial readiness flow reuses the entire current deck configuration unchanged.
- Game 3 automatically selects each player's only remaining Battlefield.
- In-game `Concede` concedes only the current game.
- `Concede match` is available on the between-games screen and completes the entire match without fabricating another game result or set point.

## 4. Target ownership model

```text
Match orchestration
  owns:
    match lifecycle
    completed-game summaries
    set-score derivation
    match completion
    between-games state
    readiness/submission state
    starting-player chooser for the next game
    next-game creation
    stable current deck configurations

Game engine
  owns:
    one game's setup
    one game's point score
    one game's zones and runtime objects
    one game's legal actions and decisions
    one game's winner and completion reason

Immutable registered deck snapshot
  owns:
    Champion Legend
    registered Chosen Champion/Main Deck/Sideboard card-copy pool
    Rune Deck
    three registered Battlefields
    stable registered-card-copy IDs

Future deck validation
  owns later:
    legality of a proposed next-game deck configuration

Future sideboarding feature
  owns later:
    client-local editing
    deck-reconfiguration intent construction

Match host UI
  owns:
    choosing between GameBoard, between-games screen, and final match result
```

`GameBoard` must remain game-scoped. It receives only a `GameProjection` and must not own set score, readiness, match concession, or next-game creation.

## 5. Match lifecycle

Use only match-level statuses. Do not duplicate the current game's setup or phase state in the match.

```ts
type MatchStatus = "playing" | "between_games" | "complete";
```

### Meaning

- `playing`: A current `GameDocument` exists. That game may be in setup or active gameplay; the game owns that distinction.
- `between_games`: The current game is complete, the match is not complete, and the match is waiting for both next-game submissions/readiness confirmations.
- `complete`: The match ended through two set points or a between-games match concession.

### Legal transitions

```text
create match
  -> playing (Game 1)

playing
  -> between_games   when current game completes and neither player has two set points
  -> complete        when current game completes and a player reaches two set points

between_games
  -> playing         when both players are submitted/ready and the next game is created
  -> complete        when a player concedes the match

complete
  -> no transitions
```

### Core invariants

- A match contains one to three game IDs.
- `currentGameId` is always included in `gameIds`.
- During `between_games`, `currentGameId` points to the just-completed game.
- During `playing`, `currentGameId` points to the current setup/active game.
- Every `CompletedGameSummary.gameId` appears exactly once and belongs to `gameIds`.
- Set score is derived only from completed-game summaries.
- Used Battlefields are derived only from completed-game summaries.
- A player cannot use the same registered Battlefield ID in two completed games.
- Game number equals its one-based position in the match.
- Game 3 exists only after a 1–1 score.
- No fourth game can be created.
- Match completion through set points requires exactly two summarized wins by the winner.
- Match completion through match concession does not require or create a second set point.
- A next-game submission belongs to one specific `betweenGames.id` and one player.
- A submitted readiness/configuration cannot be replaced during the same between-games phase.

## 6. Persisted match model

Use a Zod schema as the canonical persistence definition. Exact field placement may follow the current repository, but the model must preserve these semantics.

### Deck configuration

Only sections that may be reconfigured in the future belong to the current configuration:

```ts
const deckConfigurationSchema = z.object({
  chosenChampionRegisteredCardId: z.string().min(1),
  mainDeckRegisteredCardIds: z.array(z.string().min(1)),
  sideboardRegisteredCardIds: z.array(z.string().min(1)),
});
```

The following remain fixed and are resolved from the immutable registered snapshot:

- Champion Legend;
- Rune Deck;
- registered Battlefield pool.

For the initial BO3 implementation, `currentDeckConfiguration` never changes after match creation.

### Completed-game summary

```ts
const completedGameSummarySchema = z.object({
  gameId: z.string().min(1),
  gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  winnerPlayerId: z.string().min(1),
  loserPlayerId: z.string().min(1),
  startingPlayerChooserId: z.string().min(1),
  startingPlayerId: z.string().min(1),
  battlefieldRegisteredCardIdByPlayerId: z.record(z.string().min(1)),
  completionReason: z.enum(["victory", "game_concession"]),
  completedAt: z.string(),
});
```

The summary stores only immutable match facts needed for orchestration. The complete `GameDocument` remains separately persisted and retrievable by `gameId`.

Do not embed full games inside the match.

### Between-games submission

Use future-facing submission terminology in persistence even though the initial UI calls it readiness:

```ts
const nextGameSubmissionSchema = z.object({
  status: z.enum(["pending", "submitted"]),
  configuration: deckConfigurationSchema.nullable(),
  submittedAt: z.string().nullable(),
});
```

For this implementation, `readyForNextGame` copies the player's existing `currentDeckConfiguration` into `configuration` and marks the submission as `submitted`.

The future sideboarding intent will write a validated modified configuration into the same field without changing the lifecycle model.

### Between-games state

```ts
const betweenGamesSchema = z.object({
  id: z.string().min(1),
  afterGameId: z.string().min(1),
  nextGameNumber: z.union([z.literal(2), z.literal(3)]),
  previousGameWinnerPlayerId: z.string().min(1),
  previousGameLoserPlayerId: z.string().min(1),
  nextStartingPlayerChooserId: z.string().min(1),
  submissionsByPlayerId: z.record(nextGameSubmissionSchema),
});
```

Use a deterministic phase ID such as:

```ts
`${match.id}:between:${completedGame.gameId}`
```

### Match completion

Model the completion reason explicitly:

```ts
const matchCompletionSchema = z.discriminatedUnion("reason", [
  z.object({
    reason: z.literal("two_set_points"),
    winnerPlayerId: z.string().min(1),
    completedAt: z.string(),
  }),
  z.object({
    reason: z.literal("match_concession"),
    winnerPlayerId: z.string().min(1),
    concededByPlayerId: z.string().min(1),
    completedAt: z.string(),
  }),
]);
```

### Match seat

```ts
const matchSeatSchema = z.object({
  playerId: z.string().min(1),
  seat: z.enum(["player-1", "player-2"]),
  tokenHash: z.string().min(1),
  displayName: z.string().min(1),
  registeredDeckSnapshotId: z.string().min(1),
  currentDeckConfiguration: deckConfigurationSchema,
});
```

### Match document

```ts
export const matchDocumentSchema = z.object({
  id: z.string().min(1),
  format: z.literal("riftbound-1v1-match"),
  status: z.enum(["playing", "between_games", "complete"]),
  stateVersion: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),

  currentGameId: z.string().min(1),
  gameIds: z.array(z.string().min(1)).min(1).max(3),
  completedGames: z.array(completedGameSummarySchema).max(3),

  betweenGames: betweenGamesSchema.nullable(),
  completion: matchCompletionSchema.nullable(),

  seats: z.tuple([matchSeatSchema, matchSeatSchema]),
});
```

### Data intentionally not persisted separately

Do not persist independent copies of:

- `scoreByPlayerId`;
- used Battlefield arrays;
- remaining Battlefield arrays.

Derive them from `completedGames` and the registered Battlefield pools. Projection may expose the derived values.

This prevents drift between history, score, and Battlefield usage.

## 7. Stable registered identity and fresh game identity

The match needs two distinct identity layers.

### Stable registered card copies

Each physical registered copy receives one stable ID for the entire match:

```ts
type RegisteredCardCopy = {
  registeredCardId: string;
  cardCode: string;
  originalSection:
    | "legend"
    | "champion"
    | "mainDeck"
    | "sideboard"
    | "runes"
    | "battlefields";
};
```

The immutable deck snapshot owns these records.

If the current snapshot's instance IDs are already stable and unique, Codex may preserve their values while introducing explicit `registeredCardId` terminology. Do not perform a repository-wide rename solely for cosmetic consistency.

### Fresh runtime game instances

Each `GameDocument` receives new runtime instances:

```ts
type GameCardInstance = {
  instanceId: string;
  registeredCardId: string;
  ownerPlayerId: string;
  cardCode: string;
  // existing runtime fields
};
```

Example:

```text
registered copy: match-123:p1:copy-17
Game 1 runtime: match-123:game:1:card:copy-17
Game 2 runtime: match-123:game:2:card:copy-17
Game 3 runtime: match-123:game:3:card:copy-17
```

A `registeredCardId` remains stable when a future sideboarding operation moves a copy between Chosen Champion, Main Deck, and Sideboard. A runtime `instanceId` is scoped to one game.

### Do not use original source as active assignment

The current original-source field may remain useful as snapshot metadata, but it must not determine active sections for Game 2 or Game 3.

The game factory must consume `currentDeckConfiguration` explicitly.

## 8. Game model and factory changes

### Persist game number

Add a persisted game number:

```ts
gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)])
```

`projectGame` must use the persisted value rather than hardcoding Game 1.

### Persist game completion reason

The game must distinguish normal victory from current-game concession:

```ts
type GameCompletionReason = "victory" | "game_concession";
```

Use the existing winner field and add or normalize the completion reason in the canonical game result state.

### Replace Game-1-specific construction

Refactor the current initial-game creator into one pure factory for all games:

```ts
type CreateMatchGameInput = {
  matchId: string;
  gameNumber: 1 | 2 | 3;
  now: string;
  players: [MatchSeat, MatchSeat];
  registeredDecksByPlayerId: Record<string, RegisteredDeckSnapshot>;
  activeConfigurationsByPlayerId: Record<string, DeckConfiguration>;
  startingPlayerChooserId: string;
  availableBattlefieldRegisteredIdsByPlayerId: Record<string, string[]>;
  autoSelectedBattlefieldRegisteredIdByPlayerId?: Record<string, string>;
};

function createMatchGame(input: CreateMatchGameInput): GameDocument;
```

The factory must:

- use deterministic ID `${matchId}:game:${gameNumber}`;
- create fresh runtime card instances from stable registered copies;
- use the supplied active configuration;
- resolve the fixed Legend, Rune Deck, and Battlefield pool from the registered snapshot;
- initialize a completely fresh game state;
- use the supplied starting-player chooser;
- expose only unused Battlefields to setup;
- preselect Game 3 Battlefields when provided;
- keep persistence out of the factory.

### Game-specific active deck view

Create an explicit internal representation rather than filtering by original source:

```ts
type ActiveGameDeck = {
  legendRegisteredCardId: string;
  chosenChampionRegisteredCardId: string;
  mainDeckRegisteredCardIds: string[];
  runeDeckRegisteredCardIds: string[];
  availableBattlefieldRegisteredCardIds: string[];
  sideboardRegisteredCardIds: string[];
};
```

The Sideboard does not enter runtime game zones, but retaining it in the configuration preserves the complete registered partition for future sideboarding.

## 9. Centralized temporary feature flags

Create one server-authoritative match configuration module, for example:

```text
src/server/game/bo3-match-config.ts
```

Use centralized constants:

```ts
export const BO3_MATCH_FEATURES = {
  enableDeckReconfigurationBetweenGames: false,
  readyWithCurrentDeckConfiguration: true,
} as const;
```

Add an invariant that rejects an invalid combination. For this implementation:

```text
enableDeckReconfigurationBetweenGames = false
readyWithCurrentDeckConfiguration = true
```

When the sideboarding/deck-reconfiguration front is integrated later:

```text
enableDeckReconfigurationBetweenGames = true
readyWithCurrentDeckConfiguration = false
```

The server remains authoritative. Do not duplicate these constants in React. Project the active between-games mode/capabilities to the client:

```ts
type BetweenGamesMode =
  | "ready_with_current_configuration"
  | "deck_reconfiguration";
```

The initial implementation supports only the first mode.

## 10. Match-level intents

Evolve the match endpoint into a discriminated match-intent dispatcher.

### Initial intent union

```ts
type MatchIntent =
  | {
      kind: "gameAction";
      expectedGameStateVersion: number;
      actionId: string;
      selectedIds: string[];
      allocations?: DamageAssignment[];
    }
  | {
      kind: "readyForNextGame";
      betweenGamesId: string;
    }
  | {
      kind: "concedeMatch";
      betweenGamesId: string;
    };
```

The future sideboarding front will add:

```ts
{
  kind: "submitDeckReconfiguration";
  betweenGamesId: string;
  configuration: DeckConfiguration;
}
```

Do not implement that future intent in this plan.

### Why readiness uses the phase ID

Both players may act from projections with the same match version. Requiring a shared expected match version would make the second valid readiness request stale because the first player readied.

`betweenGamesId` identifies the phase without serializing independent players unnecessarily.

The server must verify:

- the actor owns a match seat;
- match status is `between_games`;
- the ID matches the current `betweenGames.id`;
- the actor's submission is still pending;
- the temporary feature mode permits `readyForNextGame`.

### Temporary readiness behavior

`readyForNextGame` carries no deck data.

The server:

1. Reads the actor's persisted `currentDeckConfiguration`.
2. Copies it into that player's next-game submission.
3. Marks the submission as submitted.
4. Records `submittedAt`.
5. Never changes the configuration.
6. Advances only when both players have submitted.

A byte-for-byte replay for an already submitted player in the same phase is idempotent success. It must not create a second next game.

### Match concession behavior

`concedeMatch` is legal only during the current between-games phase.

It:

- marks the match complete;
- records the opponent as match winner;
- records `match_concession` and the conceding player;
- clears `betweenGames`;
- does not create another game;
- does not append a fabricated completed-game summary;
- does not award a fabricated set point.

## 11. Match creation

Initial match creation must run as one MongoDB transaction.

1. Load both selected registered deck definitions using the existing match-creation path.
2. Preserve existing authoritative registration/deck validation behavior.
3. Create immutable registered deck snapshots with stable registered-card-copy IDs.
4. Build each seat's initial `currentDeckConfiguration` from the registered Chosen Champion, Main Deck, and Sideboard assignments.
5. Select the Game 1 starting-player chooser using the existing fair random method.
6. Build Game 1 with:
   - game number 1;
   - all three registered Battlefields available to each player;
   - both current deck configurations;
   - fresh runtime card instances.
7. Create the match with:
   - format `riftbound-1v1-match`;
   - status `playing`;
   - `gameIds: [game1.id]`;
   - `currentGameId: game1.id`;
   - no completed games;
   - no between-games state;
   - no completion.
8. Parse all canonical documents with Zod before persistence.
9. Insert snapshots, Game 1, and Match in one transaction.

No BO1 branch or format selector should remain in the post-implementation creation path.

## 12. Recording a completed game

Move match advancement out of generic game-action conditionals into a dedicated orchestration service.

### Preconditions

- Match status is `playing`.
- The acted-on game is `currentGameId`.
- Game status is complete.
- Game has a winner and completion reason.
- The game is not already in `completedGames`.
- Match is not complete.

### Build the summary

Read from the completed game:

- winner and loser;
- game number;
- chooser and selected starting player;
- each player's selected registered Battlefield;
- completion reason;
- completion timestamp.

Append one `CompletedGameSummary`.

### Derive score

```ts
function deriveSetScore(
  playerIds: [string, string],
  completedGames: CompletedGameSummary[],
): Record<string, number>;
```

If the winner now has two summarized wins:

- set match status to `complete`;
- set completion reason to `two_set_points`;
- set the match winner;
- clear `betweenGames`;
- create no additional game.

Otherwise:

- set match status to `between_games`;
- keep `currentGameId` on the completed game;
- create deterministic `betweenGames.id`;
- set next game number to 2 or 3;
- set the previous loser as `nextStartingPlayerChooserId`;
- initialize both player submissions as pending.

### Transaction boundary

The game update that completes the game and the match update that records the result must commit in the same MongoDB transaction.

A persisted complete game with no corresponding match summary must not be an accepted final state.

### Idempotency

Use `completedGames.gameId` as the semantic idempotency boundary.

A retry that finds the game already summarized returns the current match projection without adding another set point or between-games phase.

## 13. Deriving score and Battlefield availability

### Set score

Count one set point for each completed-game summary won by a player.

A match-concession winner may have fewer than two derived set points. The projection must therefore expose both:

- derived score;
- authoritative match completion and winner.

### Used Battlefields

For each player, collect their Battlefield ID from each completed summary.

```ts
function deriveUsedBattlefieldsByPlayerId(
  completedGames: CompletedGameSummary[],
): Record<string, string[]>;
```

### Remaining Battlefields

```ts
remaining = registeredBattlefieldIds.filter(
  (id) => !usedBattlefieldIds.includes(id),
);
```

Never trust the client to supply remaining Battlefields.

Expected counts:

- before Game 1: three per player;
- before Game 2: two per player;
- before Game 3: one per player.

Any other count is an invariant violation and must stop advancement with a structured internal/domain error.

## 14. Readiness and next-game advancement

### First readiness submission

When only one player is submitted:

- persist only that player's submission;
- increment match `stateVersion`;
- remain in `between_games`;
- expose the player as ready and the opponent as waiting;
- do not create the next game.

### Second readiness submission

When both players are submitted:

1. Re-read/lock the latest match inside the transaction.
2. Verify the same between-games phase is active.
3. Verify both configurations exist.
4. Derive the current score and remaining Battlefields.
5. Build the next game plan.
6. Promote both submitted configurations to seat `currentDeckConfiguration`.
   - In this implementation the promoted values are identical to the previous values.
7. Create the next `GameDocument` with a deterministic ID.
8. Append the game ID exactly once.
9. Set `currentGameId` to the new game.
10. Set match status to `playing`.
11. Clear `betweenGames`.
12. Increment match `stateVersion`.
13. Insert the new game and update the match in one transaction.

### Game 2 plan

- Game number: 2.
- Starting-player chooser: Game 1 loser.
- Each player's available Battlefield pool contains exactly two unused IDs.
- Existing private Battlefield-choice setup runs normally.
- After both Battlefield choices resolve, the chooser selects the starting player.
- Opening hands and mulligans run through the existing setup system.

### Game 3 plan

- Game number: 3.
- It may be created only at 1–1.
- Starting-player chooser: Game 2 loser.
- Each player has exactly one remaining Battlefield.
- The server preselects and reveals those Battlefields as part of game creation.
- Battlefield-choice setup is skipped.
- Setup proceeds to the chooser's starting-player decision, then opening hands and mulligans.

## 15. Concession model

### Current-game concession

Preserve the existing in-game concession action as a game action.

In a two-player game:

- the acting player loses the current game;
- the opponent becomes game winner;
- game completion reason is `game_concession`;
- one completed-game summary and one set point are recorded;
- the match either completes at two set points or enters `between_games`.

Do not reinterpret the current in-game action as conceding the entire BO3 match.

### Between-games match concession

The between-games screen exposes a distinct destructive action:

```text
Concede match
```

This action completes the match immediately under the match-concession model described above.

## 16. MongoDB transactions, concurrency, and idempotency

MongoDB remains the persistence system. Cross-document BO3 transitions require transactions.

### Required transaction support

Pass `ClientSession` through match, game, snapshot, and event repository operations. Do not silently fall back to non-transactional multi-document writes.

The runtime MongoDB deployment must support transactions. Fail clearly during development/configuration if it does not.

### Transactional operations

Use transactions for at least:

- initial match + Game 1 + deck snapshot creation;
- a gameplay action that completes a game and updates the match;
- the second readiness submission when it creates Game 2 or Game 3;
- between-games match concession and match-level event persistence.

A readiness submission that does not create a game still uses a conditional match update and may use the same transaction-oriented service path.

### Deterministic IDs

Use deterministic IDs:

```text
Game 1: <matchId>:game:1
Game 2: <matchId>:game:2
Game 3: <matchId>:game:3
Between phase: <matchId>:between:<completedGameId>
```

The game's `_id`/unique index is a final duplicate-creation guard.

### Conditional updates

Do not use blind whole-document upserts for concurrent readiness.

Repository updates must filter by:

- match ID;
- status `between_games`;
- matching `betweenGames.id`;
- acting player's submission status `pending`.

### Retry behavior

Use MongoDB transaction retry handling for transient transaction errors and write conflicts.

The orchestration services must also be semantically idempotent:

- a summarized game cannot add another point;
- an already submitted player cannot replace their submission;
- an already created deterministic game is not inserted twice;
- an already completed match cannot create another game;
- a fourth game is rejected by invariants.

### Concurrent readiness

Both players may send readiness at nearly the same time.

The implementation must guarantee:

- neither readiness is lost;
- at most one next game is created;
- the committed next game uses both submitted configurations;
- one request may retry after a write conflict;
- a retry returns the current authoritative projection.

### Readiness versus match concession race

Both actions carry the current `betweenGames.id` and run transactionally.

Whichever valid phase transition commits first becomes authoritative. The stale action must be rejected or treated as phase-changed; it must not partially update the match.

## 17. Match projection

The match endpoint must return a match wrapper rather than a bare `GameProjection`.

```ts
type MatchProjection = {
  matchId: string;
  stateVersion: number;
  format: "riftbound-1v1-match";
  status: "playing" | "between_games" | "complete";
  viewerPlayerId: string;

  scoreByPlayerId: Record<string, number>;
  winnerPlayerId: string | null;
  completionReason: "two_set_points" | "match_concession" | null;

  currentGameId: string;
  gameNumber: 1 | 2 | 3;
  gameIds: string[];
  completedGames: Array<{
    gameId: string;
    gameNumber: 1 | 2 | 3;
    winnerPlayerId: string;
    completionReason: "victory" | "game_concession";
  }>;

  currentGame: GameProjection;
  betweenGames: ViewerBetweenGamesProjection | null;
};
```

The complete prior `GameDocument` remains separately available by ID at the repository/domain level. This plan does not add a completed-game history UI.

### Viewer-safe between-games projection

```ts
type ViewerBetweenGamesProjection = {
  id: string;
  mode: "ready_with_current_configuration";
  nextGameNumber: 2 | 3;

  previousGameWinnerPlayerId: string;
  previousGameLoserPlayerId: string;
  nextStartingPlayerChooserId: string;

  viewerStatus: "pending" | "submitted";
  opponentStatus: "pending" | "submitted";

  usedBattlefieldRegisteredIdsByPlayerId: Record<string, string[]>;
  remainingBattlefieldRegisteredIdsByPlayerId: Record<string, string[]>;
  nextBattlefieldMode: "player_choice" | "server_auto";

  viewerCurrentDeckConfiguration: DeckConfiguration;

  capabilities: {
    canReadyWithCurrentConfiguration: boolean;
    canSubmitDeckReconfiguration: false;
    canConcedeMatch: boolean;
  };
};
```

Do not expose:

- opponent Main Deck or Sideboard;
- opponent current configuration;
- private future sideboarding changes;
- hidden game information from the completed game beyond the existing viewer-safe game projection.

### Projection composition

```text
projectMatch
  -> derive score and Battlefield usage
  -> project current GameDocument with projectGame
  -> project viewer-safe between-games state
```

`projectGame` must not know about set score, readiness, or match concession.

## 18. API and route integration

Keep route handlers thin.

### GET match

`GET /api/matches/:matchId` returns `MatchProjection`.

### POST intent

`POST /api/matches/:matchId/intents`:

1. authenticates the viewer/seat;
2. parses the discriminated `MatchIntent`;
3. dispatches game actions to the existing game path;
4. dispatches readiness and match concession to match orchestration;
5. returns the latest viewer-safe `MatchProjection`.

A temporary normalization layer for the old game-action payload is acceptable during one migration milestone, but remove it once both hosts use the explicit union. Do not keep two permanent APIs.

### Structured errors

Use stable codes such as:

```text
match.notFound
match.invalidPlayerToken
match.complete
match.intentNotAllowed
match.betweenGamesChanged
match.alreadyReady
match.nextGameAlreadyCreated
match.gameAlreadyRecorded
match.invariantViolation
state.gameVersionStale
```

Do not include private deck configuration data in errors.

## 19. Top-level client integration

Create or evolve a match-level host:

```tsx
function MatchExperience({ projection }: { projection: MatchProjection }) {
  if (projection.status === "complete") {
    return <MatchResultDialog projection={projection} />;
  }

  if (projection.status === "between_games") {
    return <BetweenGamesScreen projection={projection} />;
  }

  return (
    <>
      <MatchScoreBar projection={projection} />
      <GameBoard projection={projection.currentGame} />
    </>
  );
}
```

### Between-games screen

This is the persistent match-flow surface that the future sideboarding UI will replace or expand. It is not a temporary modal over `GameBoard`.

Show:

- current set score;
- completed game number and winner;
- next game number;
- player who will choose who starts next;
- used and remaining Battlefields;
- whether Game 3's Battlefield is automatic;
- viewer readiness;
- opponent readiness.

Actions:

- Primary: `Ready for next game`.
- Destructive: `Concede match`.

Use the existing semantic `GameActionButton` conventions for gameplay CTAs and keybindings.

After the viewer readies:

- disable the primary action;
- show waiting feedback if the opponent is pending;
- refresh/navigate to the next game when the authoritative projection changes to `playing`.

### Result behavior

Do not render the final match result because `currentGame.status === "complete"`.

Render it only when:

```ts
matchProjection.status === "complete"
```

Game 1 and a non-final Game 2 must lead to `BetweenGamesScreen`.

### Local host

Preserve seat switching for development. Each seat must have independent readiness state and must submit its own intent.

### Online host

Use the project's existing projection refresh/invalidation mechanism. Match-level transitions must trigger the same synchronization path used after game actions so the opponent can observe readiness and next-game creation without introducing a separate state model.

## 20. Events and privacy

Gameplay events remain attached to their `gameId`.

Add match-level lifecycle events using the existing event infrastructure or a clear match event variant:

- game completed;
- set point awarded;
- between-games state started;
- player became ready;
- next game created;
- match completed by set points;
- match conceded.

Public readiness events may identify that a player is ready. They must not contain deck contents.

The future sideboarding implementation must be able to reuse this privacy boundary without exposing exact changes.

## 21. Recommended server structure

Codex must inspect the current repository before choosing exact edits, but preserve these concern boundaries:

```text
src/server/game/
  state.ts                 canonical game/match schemas
  projection.ts            game-only projection
  setup.ts                 existing per-game setup
  match-service.ts         repository coordination
  repositories.ts          session-aware persistence

  bo3-match-config.ts      centralized transitional feature flags
  match-orchestration.ts   result recording and lifecycle guards
  match-intents.ts         intent schemas and dispatch
  match-projection.ts      match wrapper and privacy
  game-factory.ts          pure fresh-game construction
  match-derivations.ts     score and Battlefield derivations
```

Shared transport types remain under the existing shared game/match transport module.

Client concerns should remain in the match host feature, not `game-board`:

```text
src/features/match-simulator/ or a match-experience feature
  match-experience.tsx
  match-score-bar.tsx
  between-games-screen.tsx
  match-result-dialog.tsx
```

Online matchmaking should consume the same match-level transport and not create a second orchestration implementation.

## 22. Implementation milestones

### Milestone 1 — Characterize current seams

Before changing behavior, inspect the current implementation and document important findings in code comments or the implementation summary where appropriate:

- current `MatchDocument` and repository;
- current game creation;
- current setup initialization;
- current game completion handling;
- current game projection hardcoded number;
- current concession result;
- local and online endpoint consumers;
- card instance creation and snapshot identity.

Do not preserve obsolete behavior merely because an existing test asserts it. Existing tests may be updated, skipped, or removed when their contract intentionally changes, but creating replacement automated coverage is not an acceptance requirement.

**Exit criteria:** Codex can identify all single-game assumptions that must change.

### Milestone 2 — Stable registered identities and fresh runtime instances

- Introduce explicit stable registered-card identity.
- Add `registeredCardId` linkage to game runtime instances.
- Build fresh runtime instances per game.
- Stop using original source as active next-game assignment.
- Preserve existing Game 1 behavior through the new factory path.

**Exit criteria:** Two independently created games from one registered snapshot have different runtime IDs and matching stable registered IDs.

### Milestone 3 — Canonical BO3 schemas and derivations

- Add `gameNumber` and game completion reason.
- Add Zod `MatchDocument` schema.
- Add current deck configurations.
- Add completed summaries, between-games submissions, and match completion.
- Add pure score/Battlefield derivations and invariants.
- Add centralized feature flags.

**Exit criteria:** A new match document parses with Game 1 and no duplicated score/used-Battlefield storage.

### Milestone 4 — Explicit game factory

- Replace Game-1-specific construction.
- Accept game number, chooser, active configurations, and available Battlefields.
- Create a fully fresh game.
- Support Game 3 preselected Battlefields.
- Update setup to use explicit active sections.
- Project persisted game number.

**Exit criteria:** Code inspection and manual execution confirm that the factory can create valid Game 1, Game 2, and Game 3 inputs without persistence concerns leaking into the factory.

### Milestone 5 — Transactional match creation

- Create snapshots, Game 1, and Match in one MongoDB transaction.
- Make all new matches BO3-only.
- Remove/avoid BO1 branches.
- Do not add migration compatibility for existing data.

**Exit criteria:** New local and online matches persist one BO3 match plus Game 1.

### Milestone 6 — Result recording

- Separate game completion from match completion.
- Append one compact summary.
- Derive set score.
- Enter `between_games` or complete at two points.
- Set previous loser as next chooser.
- Preserve current-game concession as one game loss.
- Make the transition transactional and idempotent.

**Exit criteria:** Game 1 completion produces either a 1–0 between-games state; a later completion can produce 2–0, 1–1, or 2–1 correctly.

### Milestone 7 — Match transport and host migration

- Add `MatchProjection` and `projectMatch`.
- Change the match endpoint from bare `GameProjection` to wrapper projection.
- Update local and online consumers.
- Keep `GameBoard` receiving only `currentGame`.
- Add score presentation.
- Gate final result on match completion.

**Exit criteria:** Game 1 still plays end to end through the wrapper with no game-board orchestration leakage.

### Milestone 8 — Match intents and between-games UI

- Add discriminated `MatchIntent`.
- Add `readyForNextGame` and `concedeMatch`.
- Add viewer-safe readiness projection.
- Build `BetweenGamesScreen`.
- Use unchanged current configuration behind the centralized flags.
- Support independent local seats and online players.

**Exit criteria:** One player can ready and wait; the opponent sees readiness without deck information; match concession works between games.

### Milestone 9 — Transactional next-game creation

- Advance only after both submissions.
- Create exactly one Game 2 or Game 3.
- Use previous loser as chooser.
- Exclude used Battlefields.
- Auto-select Game 3 Battlefields.
- Promote submitted configurations and clear between-games state.
- Handle concurrent readiness with retries and idempotency.

**Exit criteria:** Complete Game 1 → readiness → Game 2 and Game 2 at 1–1 → readiness → Game 3 flows work.

### Milestone 10 — Cleanup and documentation

- Remove legacy bare-game match responses.
- Remove hardcoded game number and single-game completion assumptions.
- Remove temporary payload normalization.
- Confirm no UI treats completed game as completed match.
- Update project handoff and architecture documentation.

**Exit criteria:** The repository exposes one coherent BO3-only match contract.

## 23. Testing and acceptance policy

### Manual testing is the only acceptance gate

Acceptance for this implementation comes exclusively from the manual verification flows in Section 24 and the acceptance criteria in Section 25.

Unit tests and integration tests must be kept to the absolute minimum and may be zero.

Codex must not create a broad automated test suite for this plan. In particular, do not add automated tests merely to prove milestones, mirror the implementation structure, characterize temporary behavior, or satisfy a coverage target.

### Automated-test guidance

- Prefer no new unit or integration tests when the behavior can be verified through the required manual flows.
- Add a focused automated test only when it is necessary to protect a small deterministic invariant or a confirmed regression that cannot be reliably validated manually.
- Any added test must be narrow, stable, and directly tied to externally meaningful behavior.
- Do not add broad game-flow tests, repository orchestration suites, UI integration tests, snapshots, fixture-heavy scenario tests, transaction test harnesses, or tests coupled to temporary file/component structure.
- Do not block completion because automated tests were not added.
- Do not treat automated test passage as acceptance of the BO3 implementation.
- Existing automated tests that conflict with the intentionally changed BO1 contract may be updated, skipped, or removed as appropriate.
- Type checking, linting, and existing repository checks may be run as implementation diagnostics, but they do not replace manual acceptance.

The implementation summary must state any automated tests added, updated, skipped, or removed. If none are added, explicitly state that automated coverage was intentionally left at zero in accordance with this plan.

## 24. Manual verification

### 2–0 flow

1. Create a match.
2. Complete Game 1.
3. Confirm score 1–0 and between-games screen.
4. Confirm Game 1 loser is next chooser.
5. Ready Player 1; verify waiting state.
6. Ready Player 2; verify Game 2 is created.
7. Confirm both Game 1 Battlefields are unavailable.
8. Complete Game 2 with the same winner.
9. Confirm final score 2–0.
10. Confirm no Game 3 and no between-games screen.

### 2–1 flow

1. Complete Game 1.
2. Ready both players.
3. Complete Game 2 with the other player.
4. Confirm score 1–1.
5. Confirm Game 2 loser is next chooser.
6. Ready both players.
7. Confirm Game 3 is created.
8. Confirm each player's last Battlefield is automatically selected.
9. Confirm chooser selects the starting player.
10. Confirm opening hands and mulligans run.
11. Complete Game 3 and confirm final winner.

### Game concession

1. Concede Game 1 from the in-game action.
2. Confirm opponent receives one game win and match enters between games.
3. Continue the match normally.

### Match concession

1. Reach a between-games screen.
2. Use `Concede match`.
3. Confirm immediate match completion.
4. Confirm no extra game or point is generated.

### Fresh-state validation

Across Game 1 and Game 2, manually confirm:

- no cards remain in hand, board, Trash, or Banishment from the prior game;
- no points, damage, Buffs, attachments, triggers, or choices carry over;
- decks are newly shuffled;
- setup and mulligans run again.

### Reload and independent sessions

- Reload during between games and confirm accepted readiness is restored.
- Confirm an unready player can still act after reload.
- Confirm both independent online players observe the same next game after advancement.
- Reload after advancement and confirm deterministic Game 2/3 rather than a duplicate.

## 25. Acceptance criteria

These criteria are accepted only through the manual verification described in Section 24. Automated unit or integration tests are not an acceptance gate.

The BO3 match-model implementation is complete when:

1. Every newly created match is a `riftbound-1v1-match`; BO1 is no longer supported.
2. One match owns references to one, two, or three independently persisted games.
3. Every game has a persisted and projected game number.
4. Every game is initialized as a completely fresh rules state.
5. Completed games remain immutable and granularly retrievable by ID.
6. Match history stores compact summaries rather than embedded full games.
7. Set score is derived from completed-game summaries.
8. Used and remaining Battlefields are derived from completed-game summaries and registration.
9. A completed game awards exactly one set point.
10. The match completes at two set points.
11. The loser of the previous game is the next starting-player chooser.
12. Both players must independently ready before Game 2 or Game 3 is created.
13. Initial readiness submits the unchanged full current deck configuration.
14. The Champion Legend, Rune Deck, and registered Battlefield pool remain fixed.
15. Stable registered-card IDs survive across games while runtime instance IDs are fresh per game.
16. Game 2 excludes each player's used Battlefield.
17. Game 3 automatically selects each player's last Battlefield.
18. Starting-player selection and mulligans remain owned by the existing per-game setup system.
19. In-game concession concedes only the current game.
20. Between-games match concession ends the match without fabricating a game or point.
21. Multi-document lifecycle transitions use MongoDB transactions.
22. Deterministic IDs and idempotency prevent duplicate results and games.
23. The API returns a match wrapper projection.
24. `GameBoard` remains game-scoped.
25. Local and online hosts can complete both 2–0 and 2–1 matches end to end.
26. The future sideboarding implementation can replace temporary readiness with deck-reconfiguration submissions without redesigning the match lifecycle or persistence model.

## 26. Codex guardrails

- Use the local rules reference; do not search online for Riftbound rules.
- Do not implement BO1 compatibility.
- Do not embed multiple games inside one `GameDocument`.
- Do not reuse or clear a completed game's state.
- Do not embed full `GameDocument` records inside `MatchDocument`.
- Do not persist duplicate score or used-Battlefield state that can drift from summaries.
- Do not use original card source as current next-game section assignment.
- Do not reuse runtime card instance IDs across games.
- Do not implement the final sideboarding UI.
- Do not implement the deck-validation API in this front.
- Do not accept client-supplied configuration in `readyForNextGame`.
- Do not change Runes or the registered Battlefield pool between games.
- Do not make `GameBoard` responsible for BO3 orchestration.
- Do not mark the match complete merely because the current game is complete.
- Do not create the next game until both players are submitted/ready.
- Do not award an artificial point for a between-games match concession.
- Do not use blind upserts for concurrent lifecycle transitions.
- Do not silently continue without MongoDB transaction support.
- Do not add migration fallbacks for existing development match data.
- Do not leave unresolved TODO decisions in the implementation; this plan contains the resolved product behavior.
- Do not create broad unit or integration test coverage for this plan; manual testing is the only acceptance gate.
- Do not stop for routine milestone approval; implement the plan in one continuous workflow.
- If a meaningful unresolved assumption remains after inspecting the rules, plan, and repository, stop immediately, present options and a recommendation, and wait for user direction.
