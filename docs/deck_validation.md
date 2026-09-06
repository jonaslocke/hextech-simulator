# Deck Validation Contract

## Authority

Deck legality follows the local core rules reference, local set data, and the
implemented validator. The server validates all submitted deck configurations;
the client may present validation feedback but must not become the legality
authority.

## Supported construction rules

- Exactly one Champion Legend and exactly one Chosen Champion Unit.
- A Main Deck of at least 40 cards, including the Chosen Champion.
- One to three copies per Main Deck entry and at most three combined copies
  across Chosen Champion, Main Deck, and Sideboard.
- Exactly twelve Rune cards and exactly three unique Battlefields.
- No duplicate names in Main Deck or Sideboard entries.
- Section placement by card type: Legend, Champion, Main Deck, Rune Deck, and
  Battlefields must contain their permitted card types.
- Champion-tag compatibility, domain identity, and Signature-card limits.

Card identity and copy limits use canonical gameplay identity rather than an
art variant, display label, or imported-printing name.

## Match and sideboarding validation

The server resolves submitted registered-card-copy IDs against the player’s
registered match pool. A sideboarding draft may be temporarily illegal while it
is edited, but final submission requires a complete legal configuration.

Rune Deck, Legend, and registered Battlefield pool ownership follow the active
match policy. Changing a Chosen Champion must revalidate all affected deck
constraints, including Rune compatibility.

The UI-facing validation API returns machine-readable reason codes alongside
player-suitable messages. Do not replace these with client-derived legality
rules or thrown presentation strings.
