# Deck Validation Contract

## Authority and ownership

Deck Validation in `src/server/deck` is the sole authority for deck validity,
structured rejection reasons, and applicable constraints. Local core rules and
local card data define construction semantics. The feature consumes existing
canonical publication and runtime readiness checks; it does not publish cards,
repair models, or maintain another support registry.

Decklist text and registered configurations use different input adapters and the
same construction evaluator. Server consumers call this feature directly;
browser consumers use `POST /api/decks/validate`. Consumers must not reconstruct
legality, hard-code capacity defaults, or call the server back through HTTP.

## Construction and exact identity

- Exactly one Champion Legend and one Chosen Champion Unit.
- At least 40 Main Deck cards, including the Chosen Champion once, with no
  numeric maximum (local rule 103.2). Separately tracked editable Main Deck
  copies exclude that Champion.
- At most 10 Sideboard cards, counted by quantity.
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

Constraints are returned for invalid evaluations as well. They describe exact
section cardinalities, Main Deck minimum and explicit `maximum: null`, inclusion
of the Chosen Champion, and Sideboard maximum. Summary counts distinguish
`activeCardCount` (including Chosen Champion) from `mainDeckCount` (editable
copies). Fingerprints correlate results with the exact request; a previous valid
response cannot authorize a changed draft.

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
its recorded hash are internally consistent. Sideboard-only dependencies are included. Snapshot
construction and source-only construction checks are intermediate stages and
must not be presented as complete simulator validity. A fixture's unique-card
count is not a deck rule.

Every permanent deck is discovered through the production registry and checked
by the same generic pipeline. The registry defines today's selectable decks,
not a whitelist for text validation. Complete gameplay acceptance remains
manual under `docs/testing.md`; generic validation does not prove every composed
gameplay interaction.

## Registration, submission, and presentation

Registered IDs must belong to the loaded player registration. Each mutable copy
appears exactly once, and the Legend, Rune Deck, and Battlefield pool remain
fixed. Unknown/foreign IDs, duplicate assignments, missing copies, and changed
fixed sections produce specific reasons. Conservation permits a larger Main
Deck and smaller Sideboard; it does not require paired swaps.

Match admission and authenticated final reconfiguration use the same authority
as advisory feedback. A text request cannot replace final registered validation.
The next game consumes the accepted actual registered-copy lists. Match services
retain authentication, transaction, lifecycle, and persistence ownership.

Sideboarding owns draft interaction and layout. Drafts may be invalid, individual
copies remain editable, and reset preserves the existing interaction. Only a
current valid response permits submission; pending/error/retry safeguards remain.
The server projection can carry current validation-owned constraints for initial
presentation, without pinning a historical ruleset. Both card grids derive their
columns from the returned Sideboard maximum, and the central workspace scrolls
to expose every copy, including invalid overflow drafts.
