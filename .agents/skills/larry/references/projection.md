# Projection, Adaptation, and Composite-Semantics Verification

Use when canonical server state is correct but objects/actions can be lost, altered, hidden, or misclassified while becoming viewer-safe/client-ready state.

## Boundary model

```text
authoritative state
-> viewer-safe projection
-> client adaptation/model
-> component input
-> interaction/rendering
```

## High-value properties

- Projection and adaptation are non-mutating transformations.
- An authorized visible object survives each boundary unless that boundary has an explicit filtering contract.
- Visibility filtering and action/selectability filtering are distinct.
- Composite characteristics use membership/semantic predicates where exact single-type equality would drop valid objects.
- IDs used by projected actions/choices still resolve in the projected/adapted object index.
- Secret/private information never leaks while public/authorized information is conserved.
- A server-illegal action is not made legal by client adaptation; a server-legal action is not silently removed without an explicit presentation contract.

For a reported disappearance, compare the object/action set immediately before and after each transformation and stop at the first boundary where the expected member is lost or changed.
