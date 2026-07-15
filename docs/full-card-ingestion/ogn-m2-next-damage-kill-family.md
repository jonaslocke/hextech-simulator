# OGN M2 Next-Damage Kill Family

Status: Awaiting manual validation.

## Shared Contract

This family records a selected Unit as the subject of a turn-scoped delayed
kill. It is not a delayed Chain trigger and does not create a second target
choice when damage occurs.

| Concern | Contract |
|---|---|
| Target timing | Select exactly one legal Unit while the parent spell is played; lock its object identity before priority is exchanged. |
| Normal branch | On resolution, create one marker for that locked Unit. The marker waits for the next instance of damage dealt to that same object this turn. |
| Damage event | After the damage is marked, consume the marker and attempt to kill that Unit immediately, before normal lethal cleanup or later damage instructions. |
| Replacement interaction | The attempted kill uses the ordinary kill/death path, so an applicable death replacement may replace it. A death replacement does not restore the consumed next-damage marker. |
| Object identity | If the locked Unit leaves play or changes identity before the damage event, the marker has no target and does nothing; it never retargets. |
| Duration | Remove an unused marker during turn cleanup. |
| Legion replacement | When the card's Legion condition is satisfied as it resolves, kill the locked Unit immediately instead of creating the marker. The delayed instruction is skipped. |
| Chain and priority | The parent spell resolves once. Creating, consuming, or expiring the marker creates no target prompt and no extra priority window. |
| Events | The normal damage event is emitted. An actual kill follows the existing death event and Deathknell flow. |

## Reuse Map

| Card | Printed behavior | Model |
|---|---|---|
| Noxian Guillotine (`OGN-254`) | Choose a Unit; kill it the next time it takes damage this turn. Legion kills it now instead. | `timing.action` -> `selector.unit` -> `action.kill_on_next_damage` with Legion immediate replacement |

## Rules Evidence

Local rule 151.2 names this exact pattern: when Legion is satisfied, the Unit
is killed immediately and the delayed damage instruction is ignored. Rules
573–575 establish that replacement effects intercede during an effect and that
the affected object's owner determines ordering when multiple replacements
apply.

## Manual Validation

1. Play Noxian Guillotine without Legion, choose a Unit, and pass priority.
   The spell resolves without killing it. Deal any damage to that Unit before
   turn end; it is killed immediately, even if that damage was nonlethal.
2. Play Noxian Guillotine with Legion satisfied. After resolution, the chosen
   Unit is killed immediately and taking damage later this turn has no
   additional effect.
3. Without dealing damage, finish the turn. The marker expires and does not
   affect that Unit on a later turn.
4. Focused regression: a Unit protected by Highlander or another accepted
   recall-on-death replacement is recalled instead of trashed when the marker
   attempts its kill; the marker is still consumed.
