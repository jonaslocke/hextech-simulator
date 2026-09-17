# Deck Validation Contract

## Authority and ownership

Deck Validation in `src/server/deck` is the sole authority for deck validity,
structured rejection reasons, and applicable constraints. Local core rules and
local card data define the general construction semantics. For the current
`riftbound-1v1-match` policy, Constructed Tournament Rules are explicit
exceptions where this contract says so: Main Deck cardinality follows Tournament
Rule 601.1.b, and between-games Sideboarding follows Tournament Rule 403.4.

The feature consumes existing canonical publication and runtime readiness checks;
it does not publish cards, repair models, or maintain another support registry.

Decklist text and registered configurations use different input adapters and the
same construction evaluator. Server consumers call this feature directly;
browser consumers use `POST /api/decks/validate`. Consumers must not reconstruct
legality, hard-code capacity defaults, or call the server back through HTTP.

## Construction and exact identity

- Exactly one Champion Legend and one Chosen Champion Unit.
- Exactly 40 Main Deck cards, including the Chosen Champion once. This is the
  Constructed Tournament exception to local core rule 103.2 for the
  `riftbound-1v1-match` policy (Tournament Rule 601.1.b).
- At most 10 Sideboard cards, counted by quantity. A Sideboard may therefore be
  registered with any size from zero through ten.
- One to three copies per Main Deck text entry, and at most three combined
  copies across Chosen Champion, Main Deck, and Sideboard.
- Exactly twelve Rune cards and three unique Battlefields.
- No duplicate named lines in Main Deck or Sideboard text sections.
- Permitted section types, Champion compatibility, domain identity, and
  Signature requirements apply to all input modes.

Copy and uniqueness checks use established gameplay identity, not printing,
display labels, or physical-copy IDs. Section syntax remains strict, including
`MainDeck:`; `Rune Pool:` is a supported alias for `Runes:`.

Legend entries require the exact full deck-facing name, for example
`Ornn, Fire Below the Mountain`. Capitalization, punctuation, apostrophes, and
spacing belonging to the name are significant. Title-only names are invalid.
This boundary does not rename source records or change canonical card codes,
rules-text hashes, or behavior models. The existing shared identity owner
derives Champion identity from verified corpus evidence, preserves distinct
starter titles, chooses established equivalent printings, and reports unresolved
ambiguity. Retrieval candidates never authorize a spelling on their own.

## Public transport contract

Requests have an explicit `input` discriminator and
`policy: "riftbound-1v1-match"`:

- `input: "text"` supplies `sourceText`. It requires no account, saved deck,
  predefined deck ID, or registered match. Evaluation reads the local corpus
  and canonical readiness evidence without saving or publishing anything.
- `input: "registered"` supplies `deck` with Legend and Chosen Champion
  registered-copy IDs plus Main Deck, Rune, Battlefield, and Sideboard ID arrays.
  The server loads registration context; client card definitions, constraints,
  or readiness claims are not trusted.

`src/shared/deck-validation.ts` owns the exact request and response schemas.
Completed evaluations return `legal`, `reasons`, `constraints`, `summary`, and
`fingerprint`. `legal` includes construction and simulator readiness. Reasons
have machine-readable codes and presentation messages, with relevant section,
source line/name, canonical identity, or registered-copy identity. Consumers
render all reason messages generically, including future reason codes.

Constraints are returned for invalid evaluations as well. The Main Deck exposes
an exact count of 40 and whether that count includes the Chosen Champion. The
Sideboard exposes the global maximum of 10. Text validation has no exact
Sideboard target, so `sideboard.exact` is `null`. Registered-match validation
sets `sideboard.exact` to the Sideboard size originally registered for that
player. A nine-card registered Sideboard therefore reports `maximum: 10` and
`exact: 9`.

Summary counts distinguish `activeCardCount` (including Chosen Champion) from
`mainDeckCount` (editable copies). Fingerprints correlate results with the exact
request; a previous valid response cannot authorize a changed draft.

Malformed deck text produces parse diagnostics. Malformed envelopes produce a
transport error. Infrastructure failures remain operational errors, never a
valid result or an unknown-card rejection. Known cards missing executable
canonical models are distinct from unknown names. No ban-list checking is
implemented by this contract.

## Publication and runtime readiness

Validity consumes canonical approval, identity integrity, rules-text freshness,
behavior-definition synchronization, supported bindings and parameters, and
runtime compilation checks. Freshness compares canonical models and registered
runtime cards against current local source rules, even when a stored card and
its recorded hash are internally consistent. Sideboard-only dependencies are
included. Snapshot construction and source-only construction checks are
intermediate stages and must not be presented as complete simulator validity. A
fixture's unique-card count is not a deck rule.

Every permanent deck is discovered through the production registry and checked
by the same generic pipeline. The registry defines today's selectable decks,
not a whitelist for text validation. Complete gameplay acceptance remains
manual under `docs/testing.md`; generic validation does not prove every composed
gameplay interaction.

## Registration, submission, and presentation

Registered IDs must belong to the loaded player registration. Each mutable copy
appears exactly once, and the Legend, Rune Deck, and Battlefield pool remain
fixed. Unknown/foreign IDs, duplicate assignments, missing copies, and changed
fixed sections produce specific reasons.

Between games, Tournament Rule 403.4 is applied literally: Main Deck and
Sideboard cards are exchanged 1-for-1. The final submitted Main Deck must still
contain exactly 40 cards including the Chosen Champion, and the final submitted
Sideboard must contain exactly the same number of cards as the Sideboard
originally registered for the match. The Sideboard's registered size is not
forced to ten. Examples:

- A deck registered with 10 Sideboard cards must submit 10 after sideboarding.
- A deck registered with 9 Sideboard cards must submit 9 after sideboarding.
- A deck registered with no Sideboard must continue to submit none.

The mutable registered pool is still conserved by physical-copy identity. The
explicit `deck.sideboardExchange` reason exists even though exact-40 plus pool
conservation also implies the same cardinality, because validation should tell
the player which between-games rule was violated.

Changing the Chosen Champion remains allowed when the resulting registered-copy
allocation satisfies every construction rule and preserves the registered
Sideboard cardinality.

Match admission and authenticated final reconfiguration use the same authority
as advisory feedback. A text request cannot replace final registered validation.
The next game consumes the accepted actual registered-copy lists. Match services
retain authentication, transaction, lifecycle, and persistence ownership.

Sideboarding owns draft interaction and layout. Drafts may be temporarily
invalid: moving a Sideboard card into the Main Deck may temporarily create
41/9, for example, until a Main Deck card is moved back. The UI must not force
atomic swaps or redesign the existing individual-copy interaction. Only a
current valid response permits submission; pending/error/retry safeguards remain.

The server projection carries current validation-owned constraints for initial
presentation without pinning a historical ruleset. Both card grids derive their
column count from the global Sideboard maximum, while the Sideboard counter uses
the registered exact target. Thus a deck registered with nine Sideboard cards
uses the same ten-column layout but displays a 9/9 legal target. The central
workspace scrolls to expose every copy, including invalid intermediate drafts.
