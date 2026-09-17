# Payment and Preparation Verification

Use when legality depends on Energy/Power, restricted resources, ready/exhausted sources, additional costs, alternate costs, or staged/preparable actions.

## Minimal model dimensions

- printed/base/effective cost
- available unrestricted and restricted resources
- resource domains
- ready/exhausted payment sources
- additional/alternate costs
- prepared/staged/executable state
- cancellation or failed finalization

## High-value properties

- Payment candidates are deterministic for equivalent state.
- Restricted resources never pay an incompatible cost.
- Alternate cost replaces or combines with base cost exactly as the semantic contract states.
- Feasibility/preparation queries do not mutate authoritative resources.
- `preparable` is not silently treated as `executable`.
- Cancellation/finalization failure follows the authoritative rollback contract; it does not invent refunds or duplicate payments.
- Automatic payment is used only when every allowed choice is semantically equivalent under the accepted policy.

For combinatorial search, assert bounded explored states/branches where practical instead of timing the machine.
