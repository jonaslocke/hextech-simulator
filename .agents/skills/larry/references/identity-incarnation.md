# Identity, Incarnation, Owner, and Controller Verification

Use when behavior depends on runtime identity, mutable versioning, zone changes, leave/re-enter semantics, ownership, control, or attachments.

## Distinguish explicitly

- card/definition identity
- runtime instance ID
- game-object incarnation across zone boundaries
- mutable state/version
- owner
- current controller
- current zone/location
- attachment host/source

## High-value properties

- Ordinary mutable updates do not create a new game-object incarnation.
- Zone transitions that rules treat as a new object invalidate the prior incarnation even if the runtime card instance ID is reused.
- Delayed/triggered work bound to an earlier incarnation does not follow a later incarnation unless the contract says it should.
- Owner and controller are never substituted for each other implicitly.
- Moving/clearing an attachment follows the top-most/host lifecycle contract without changing unrelated identity.
- Look-back semantics use the explicitly allowed prior characteristics rather than stale live state.

Generate contrasts such as owner != controller, same instance/same incarnation versus same instance/new incarnation, and source present versus departed/re-entered.
