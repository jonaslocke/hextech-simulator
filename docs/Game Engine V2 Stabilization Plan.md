Game Engine V2 Stabilization Plan
Summary
Fix payment restrictions, target legality and interaction, duplicate UI identity, and disable movement until showdown is implemented. Each milestone must pass its verification gate before receiving a standalone commit; commits will not be squashed.
The approved plan will first be persisted as docs/game-engine-v2-stabilization-plan.md.
Milestones
Persist the approved plan
Create the stabilization document with milestones, acceptance criteria, rollout, and rollback.
Run the current baseline suite.
Commit: docs: add game v2 stabilization plan

Correct payment and instance-state behavior
Restrict automatic Energy payment to eligible Basic Rune resource abilities.
Require Lux Crownguard to be activated manually before its spell-only Energy can be spent.
Ensure spell-only Energy cannot pay for Units.
Preserve independent state for Champion and Main Deck copies of the same card.
Add regression coverage proving that playing a second Lux exhausts only the new Unit and payment Runes; an already-ready Lux remains ready.
Gate: targeted payment tests, npm test, typecheck, and lint.
Commit: fix: respect resource restrictions in v2 payments

Constrain projected actions to legal, implemented flows
Omit play actions when any mandatory selector lacks enough legal targets.
Continue exposing optional zero-target actions such as Singularity.
Remove movement action generation and execution so base Units cannot enter battlefields.
Retain showdown schemas, projections, and UI contracts as dormant future-facing code.
Replace movement acceptance cases with assertions that no movement action is projected and forged movement IDs are rejected.
Gate: targeting, flow, acceptance, full unit suite, typecheck, and lint.
Commit: fix: restrict v2 actions to implemented legal flows

Restore targeting and action-menu interaction parity
Key action-menu rows by stable action or option IDs rather than labels.
Derive legal targets from the selected projected action instead of aggregating all actions for the source card.
Match legacy behavior for hover highlighting, selected highlighting, exact-target auto-submit, optional-target submission, cancellation, and pending submission highlighting.
Add an interactive visual-parity fixture that opens a targeted play action, compares hover highlighting, selects the target, and verifies the submitted action ID and target instance ID.
Gate: board tests, full unit suite, typecheck, lint, and visual tests.
Commit: fix: restore v2 targeting interaction parity

Complete acceptance and rollout documentation
Run npm test, npm run typecheck, npm run lint, npm run build, and npm run test:visual.
Require no test/build failures and no new lint warnings beyond the current nine baseline warnings.
Record actual milestone hashes in the stabilization document.
Mark every item in docs/fixes-after-enginev2.md complete with its resolving commit.
Commit: docs: complete game v2 stabilization rollout

Interface Changes
No schema or HTTP payload changes.
GameProjectionV2.actions will no longer contain:mandatory-target plays with insufficient legal targets;
movement actions.

Action IDs remain opaque and state-version-bound.
The action-menu item identity field is internal UI state.
Existing showdown types remain compatible but unreachable from newly created matches.
Acceptance Tests
Two different Lux instance IDs retain independent canonical and projected exhaustion state.
A ready Lux cannot automatically pay for a Unit.
Manual Lux activation adds two spell-only Energy; Units cannot spend it, while Spells can.
Required one- and two-target cards disappear from playable actions without sufficient targets.
Optional zero-to-two-target cards remain playable with zero targets.
Hovering a legal target visibly highlights the correct card.
Clicking a legal target submits exactly that projected action and instance ID.
Duplicate action labels produce no React key warning.
Base Units expose no battlefield movement action.
Legacy /legacy behavior and existing static visual-parity fixtures remain unchanged.
Rollout and Rollback
Keep v2 at / and legacy at /legacy; add no feature flag or environment-specific staging flow.
After all commits pass, deploy the fixed revision and directly drop the disposable matchesV2, gamesV2, gameEventsV2, and deckSnapshotsV2 collections from the configured MongoDB database.
Do not archive these collections. Attempt each deletion independently; report failures but do not block rollout because old matches will never be replayed and can be removed manually.
Smoke-test a fresh match: manual Lux Energy, two-Lux state independence, required/optional targeting, target highlighting, chain resolution, and absence of movement.
Roll back by reverting milestone commits newest-first and redeploying. No database restore is required; players create fresh matches.
Confirmed Defaults
The first Lux was ready before the second Lux was played.
Lux resource activation is manual.
Mandatory-target actions with no targets are omitted rather than disabled.
Existing v2 matches are disposable.
Partial showdown contracts remain dormant.
The new plan document receives its own initial commit.
