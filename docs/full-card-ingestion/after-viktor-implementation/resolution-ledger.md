# Viktor Implementation Resolution Ledger

Source: [`issues.md`](./issues.md). This ledger groups the post-Viktor findings
by reusable cause so each fix is implemented and validated once at the correct
layer.

| ID | Findings covered | Shared cause | Resolution approach | Status | Manual validation gate |
|---|---|---|---|---|---|
| V1 | Trifarian Gloryseeker queues on the first card; Spectral Matron's returned Legion Unit does not receive its Legion result | Card-play event eligibility is split between normal and effect-created Unit plays | Gate keyword conditions before triggered items enter the Chain and record all played Main Deck Units, including effects that play a Unit from Trash | Ready for retest | First card does not show a Legion trigger; a second eligible Main Deck card does and resolves once |
| V2 | Chosen Champion trigger leaks from Champion zone; Viktor duplicate trigger keys | Active trigger sources and Chain item identity are too broad | Restrict Champion trigger sources to cards actually on the board; make simultaneous triggered-item IDs event-specific | Ready for retest | Champion-zone card creates no board trigger; multiple deaths create unique Viktor Chain rows and one Recruit each |
| V3 | Call to Glory normal payment/sequence; Facebreaker targets after stacking; Cull the Weak resolves nothing; Spectral Matron optional/repeated choice and token wording | Card play needs ordered role-aware selections before costs and a consistent optional/deferred effect flow | Generalize staged play selections (targets then optional costs), preserve selection roles through resolution, and give non-token destination choices their own presentation | Ready for retest | Test every listed card's complete sequence, including declining optional choices |
| V4 | Herald disabled/text; Seal interaction and payment; facedown auto-pay | Permanent activated-resource abilities are not uniformly projected or included in payment planning | Unify activated-resource availability, labels, and payment-provider selection; exclude facedown cards from automatic payment | Ready for retest | Herald and Seal Add actions are available at legal priority; Seal can pay eligible costs; hiding requires manual Power choice |
| V5 | Hidden card vanishes/name leaks; Hide available on opponent turn; buff/stun visibility; move wording | Projection and board UI do not consistently apply card state, viewer privacy, or action semantics | Correct hidden visibility/log redaction and timing; render Buff/Stunned state in previews; align Move and permanent-action copy with existing card UI | Ready for retest | Both viewers see correct facedown behavior; no opponent card name in log; state badges and Move labels are clear |
| V6 | Imperial Decree, Shen, Kinkou, Vengeance shown as unplayable | Playability projection is missing or misclassifying supported timing/payment paths | Preserve each disabled play mode and show its exact payment/timing reason instead of a generic "Not playable" label | Ready for retest | Each card shows its enabled mode when payable and its precise unavailable reason otherwise |

## Resolution order

1. V1 and V2 — correctness and chain integrity.
2. V3 — the shared choice/cost protocol behind several failed cards.
3. V4 and V6 — ability/payment/playability projection.
4. V5 — presentation and privacy after the underlying action data is stable.

Each row moves to **Ready for retest** only with focused automated coverage and
an explicit manual validation checklist; it moves to **Accepted** only after
that checklist is confirmed.
