# Post-Showdown Corrections Audit

This audit records the implementation state before the post-showdown correction
milestones. It prevents already-working UI from being replaced while the
remaining engine and projection gaps are corrected.

| Checklist item | Current status | Required correction |
| --- | --- | --- |
| Combined rune resource action | Verified | The existing renderer is retained and the server projects the combined action whenever both component Add abilities are legal under the override. |
| Final pass explanation | Verified | Final Priority names the resolving Chain item. Final combat Focus identifies that combat will resolve and displays the current Might leader or tie. |
| Action spell shown as not playable | Verified | Battlefield selectors remain valid. Disabled cards now explain pooled-resource requirements and become enabled after Energy and Power are manually added. |
| Eager Apprentice discount | Verified | Canonical modifiers retain `controller_spell`; Unit costs remain unchanged. |
| Assault | Verified | Assault and Shield modify live `computedMight`, cleanup, projection, and locked damage for the duration of combat roles. |
| Tank | Verified | The existing dialog is retained. Server validation now also rejects interleaving a non-Tank between multiple Tanks. |
| Play Units to controlled battlefields | Verified | Server-issued actions provide Base and controlled battlefield destinations through the reused single-choice dialog. |
| Opponent waits for trigger ordering | Verified | Both viewers receive safe pending status, private ordering details remain chooser-only, and stale pass controls are suppressed. |

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
