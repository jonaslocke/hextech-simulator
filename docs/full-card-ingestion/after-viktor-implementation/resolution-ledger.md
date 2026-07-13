# Viktor Implementation Resolution Ledger

Source: [`issues.md`](./issues.md). This ledger groups the post-Viktor findings
by reusable cause so each fix is implemented and validated once at the correct
layer.

| ID | Findings covered | Shared cause | Resolution approach | Status | Manual validation gate |
|---|---|---|---|---|---|
| V1 | Trifarian Gloryseeker first-card Legion; Spectral Matron's returned Legion Unit | Card-play event eligibility was split between normal and effect-created Unit plays | Gate keyword conditions before triggered items enter the Chain and record all played Main Deck Units, including effect-created Units | **Accepted** | Validated in Viktor deck gameplay. |
| V2 | Chosen Champion trigger leak; duplicate Viktor trigger keys | Active trigger sources and Chain item identity were too broad | Restrict Champion trigger sources to cards on the board and make simultaneous triggered-item IDs event-specific | **Accepted** | Validated in Viktor deck gameplay. |
| V3 | Call to Glory sequence; Facebreaker targets; Cull the Weak; Spectral Matron choices | Card play needed ordered role-aware selections and a consistent deferred-effect flow | Generalize staged play selections, preserve selection roles through resolution, and give non-token destinations their own presentation | **Accepted** | Validated in Viktor deck gameplay. |
| V4 | Herald; Seal; Daughter of the Void payment | Activated abilities and reusable payment sources bypassed the normal payment plan | Use the card-play payment plan for activated abilities, scan controlled permanent sources, accept Rainbow, and prioritize reusable Power before Runes | **Accepted** | Validated in Viktor deck gameplay. |
| V5 | Hidden card persistence/privacy, timing, and payment | Hidden combines a specialized timing permission, placement cost, privacy, and later altered Play permission | Implement the approved rules-first plan in [`facedown-cards.md`](../facedown-cards.md), beginning with persistent facedown state, capacity, and viewer-safe projection | **Ready for Phase 1 validation** | Validate persistence, controller identity, opponent anonymity/count, and refresh behavior. Bandle Tree capacity needs a selectable deck containing OGN-278. |
| V6 | Imperial Decree; Shen, Kinkou; Vengeance; Awakening; combat keyword roles | Unit timing was published incorrectly, Unit entry paths differed, combat damage omitted generic events, and Awakening omitted Legends | Publish Unit Action/Reaction as play timing, centralize Unit entry through shared combat-role/Might logic, ready Legends, and emit damage events | **Accepted** | Validated in Viktor deck gameplay. |
| V7 | Herald destination; duplicate multi-unit movement; Cull the Weak empty-caster case | Effect Unit placement, multi-select movement, and deferred choices bypassed general rules | Reuse normal Unit destinations, make movement a unique toggle set with server validation, and skip impossible deferred selectors while continuing later instructions | **Accepted** | Validated in Viktor deck gameplay. |

## Resolution order

All Viktor findings are accepted. V5 now proceeds through the approved Hidden
and facedown implementation plan, with Phase 1 as the active gate.

Each row moves to **Ready for retest** only with focused automated coverage and
an explicit manual validation checklist; it moves to **Accepted** only after
that checklist is confirmed.
