# Chain, Timing, Cleanup, and Continuation Verification

Use when correctness depends on Chain origin, Priority, Focus, resolution frames, delayed work, Cleanup, or alternate paths that suspend/resume execution.

## Minimal model dimensions

- Chain items and their semantic origin
- finalized versus pending state
- Priority / Focus owner
- pending choice or resolution frame
- outstanding Cleanup/tasks
- turn/showdown timing

## Useful actions

Open/add/finalize a Chain item, add a response, pass Priority/Focus, resolve top item, create/resolve a choice, order simultaneous work, remove an item, perform Cleanup, and close the Chain.

## High-value properties

- Semantic origin survives suspension/resume and is not inferred from the final resolving item type.
- Pending work created during resolution is not erased by finalizing earlier work.
- Cleanup that becomes due during resolution remains outstanding until the rules permit it.
- Phase/showdown progression does not skip unresolved Chain items, choices, or required Cleanup.
- Alternate execution paths preserve the same accepted semantic contract as the simple path.
- Intermediate Priority/Focus checkpoints are correct, not merely the final state.

Keep sequences short; shrink failures to the smallest action trace that still violates an invariant.
