# Post-Showdown Corrections Audit

This audit records the implementation state before the post-showdown correction
milestones. It prevents already-working UI from being replaced while the
remaining engine and projection gaps are corrected.

| Checklist item | Current status | Required correction |
| --- | --- | --- |
| Combined rune resource action | Partial | The menu renderer already supports `Add Energy and Power`; the server only projects it in Neutral Open and must project it with the priority Add override. |
| Final pass explanation | Missing | The Chain surface detects a resolving Priority pass, but does not name the item. The showdown prompt does not identify a final Focus pass or current combat Might leader. |
| Action spell shown as not playable | Partial | Battlefield selectors work. The captured state had no pooled resources, and Blast of Power also required Order Power. Showdown payment must stop implicitly using Energy sources and disabled actions must explain their resource shortfall. |
| Eager Apprentice discount | Engine defect | The catalog records `controller_spell`, but canonical modifiers discard that scope and reduce Unit costs too. |
| Assault | Engine and presentation defect | Assault is added only when combat damage is locked. Live `computedMight`, lethal cleanup, and card presentation do not include it during the showdown. |
| Tank | Implemented; certification required | Server validation and the damage dialog already enforce Tank-first assignment. Real-catalog and multiple-Tank regression coverage is still required. |
| Play Units to controlled battlefields | Missing | Unit play is hardcoded to Base. The existing single-choice dialog can be reused for destination selection. |
| Opponent waits for trigger ordering | Partial | A reusable pending-choice status exists, but trigger-order choices are projected only to the chooser, leaving the opponent on a stale showdown prompt. |

## Rules contract

- Rules 508-509 and 545-553 distinguish Showdown Open Focus from Chain
  Priority. A final Priority pass resolves only the latest Chain item; a final
  consecutive Focus pass ends the Showdown.
- Rules 559.2 and 563.1.c allow a Unit to be played exhausted to Base or a
  battlefield its controller controls.
- Rules 625.1.b, 719, and 726 apply Assault and Shield for the full duration of
  the attacker/defender designation.
- Rules 626.1.d and 727 require every Tank unit to receive lethal combat damage
  before any non-Tank unit with the same controller.
- Rule 560.4.c limits Eager Apprentice's discount to Spells.
- The decision ledger's Add timing override remains intentional. With
  `ALLOW_ADD_ABILITIES_WHEN_PLAYER_HAS_PRIORITY` enabled, Add abilities resolve
  immediately whenever their controller has Focus or Priority. Disabling it
  restores standard timing.

## Validation method

The in-app browser was unavailable during this audit. UI status was established
from the checked-in screenshots, component behavior, projection flow, and
focused UI-model characterization tests. Each changed surface will also receive
an executable regression before its milestone commit.
