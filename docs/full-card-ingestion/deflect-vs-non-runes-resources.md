[ ] Deflect supplemental payment does not support non-Rune resource sources

Context

The payment system now recognizes activated abilities from controlled permanents as valid resource sources. This includes sources such as Seals, Legends, and other cards that can add Energy or Power.

That behavior is currently applied to ordinary card payment, where auto-payment may activate those sources automatically and may even prefer them over Runes.

Deflect uses a different payment moment. Its additional Power cost is intentionally not paid automatically: the play flow pauses and requires the player to deliberately add the missing Power before confirming the spell. This prevents a Deflect cost from being paid without the player's knowledge.

The issue is not that Deflect should become fully automatic. The issue is that the manual supplemental-payment stage does not expose or correctly execute every legal resource-producing ability.

Current behavior

When a spell chooses an opposing unit with Deflect:

The system calculates the spell's normal cost.
The Deflect surcharge is correctly identified as additional Power.
Auto-payment stops before paying that additional Power, as intended.
The player is told to add the missing Power to the Rune Pool.

However, during this paused payment state:

exhausting a Seal to add Power does not work
resource abilities from other permanents are likely unavailable or rejected
abilities such as the one on Daughter of the Void are expected to have the same problem
the player may be forced to use a Rune even when another controlled permanent can legally generate the required Power

This creates an inconsistency:

non-Rune resource sources are accepted by regular auto-payment
the same sources are not accepted during Deflect's explicit supplemental-payment step

The visible issue appeared with a Seal, but this should not be treated as a Seal-specific defect.

Expected behavior

Deflect should preserve its existing intentional-payment behavior:

the system must not silently activate a source to pay the additional Deflect cost
the spell must remain unconfirmed while the required additional Power is missing
the player must deliberately choose how to generate that Power

While the payment is paused, the player must be able to use any currently legal controlled source that can add a usable resource, including:

Runes
Gear
Units
Legends
tokens
any future permanent or game object with a legal resource-producing activated ability

The available sources must be determined from their modeled abilities and current game state, not from card names or card categories such as “Seal.”

After the player activates one of those sources:

its activation cost is paid, such as exhausting the source
its resource ability resolves according to normal timing rules
the generated resource is added to the player's current resource pool
the pending spell payment is recalculated
the spell becomes confirmable once both its normal cost and the Deflect surcharge can be paid
Resource compatibility

The supplemental payment must use the same resource-compatibility rules as ordinary payment.

Examples:

generic Power can satisfy a generic additional Power requirement
Rainbow Power can satisfy the requirement when it is legally compatible with the spell
domain-specific Power can only be used when it matches a required domain or is otherwise allowed by the resource rules
Energy-producing abilities must remain available when the unresolved payment still requires Energy
a source that cannot contribute to the remaining cost must not be presented as a useful payment action

The Deflect surcharge should not introduce a second, narrower definition of valid resource sources.

Important distinction from regular auto-payment

There are two related but different behaviors:

Ordinary payment

The automated payment system may select and activate legal sources according to its payment strategy.

Deflect supplemental payment

The system pauses and waits for explicit player action because the surcharge was introduced by the chosen target.

The same source-discovery and resource-validity rules should power both flows, but the activation policy is different:

ordinary cost: sources may be activated automatically
Deflect surcharge: sources are only activated after deliberate player input

The fix should therefore share the generic resource-source model without making Deflect automatic.

Expected scenarios
Seal supplying the Deflect surcharge

Given:

the player is casting a spell
the chosen enemy unit has Deflect
the normal spell cost is already covered
the player controls a ready Seal that can exhaust to add Power

Expected:

the spell remains pending
the Seal's resource ability is available
activating it exhausts the Seal and adds the Power
the pending cost is recalculated
the player can confirm the spell
Legend supplying the Deflect surcharge

Given:

the player controls a ready Legend with a legal Power-producing ability, such as Daughter of the Void
all prerequisites for that ability are satisfied
the pending spell requires one additional Power because of Deflect

Expected:

the Legend ability is available during the pending payment
the player can deliberately activate it
the generated Power contributes to the Deflect surcharge
the spell becomes confirmable when the complete cost is covered
Source is not currently legal

Given a resource-producing permanent that is:

exhausted
unable to pay its activation cost
restricted by timing
missing a required Rune or other prerequisite
unable to produce a resource compatible with the remaining cost

Expected:

its ability is unavailable or disabled
it cannot be used to satisfy the pending payment
Multiple legal sources

Given both a Rune and a non-Rune permanent can satisfy the missing Deflect Power:

Expected:

neither source is activated automatically
both legal choices remain available
the player decides which source to use
only the selected source pays its activation cost
Implementation boundary

This should be modeled as a correction to the generic pending-payment system:

Any payment state that waits for the player to manually add resources must expose and accept all legal resource-producing abilities from controlled sources.

It should not be implemented as:

a Seal exception
a Daughter of the Void exception
a Deflect-specific list of supported cards
automatic payment of the Deflect surcharge
a separate resource-validity model from ordinary card payment
