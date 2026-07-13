[ ] Champion-zone plays do not count as played cards

Scenario

Player plays their chosen Champion from the Champion zone, then plays Watchful Sentry.

At this point, Darius, Trifarian should recognize that two cards have been played this turn and receive +2 Might. Instead, Darius only gains the bonus after a third card is played.

This suggests the Champion play is resolving successfully but is not being recorded as a card played this turn.

Current behavior

Cards played from the Champion zone do not appear to increment the "cards played this turn" count.

As a result, abilities that depend on how many cards have been played during the turn evaluate one card behind whenever a chosen Champion was played earlier in the turn.

Expected behavior

Playing a chosen Champion from the Champion zone is still playing a card and must contribute to the turn's played-card count exactly like any other card play.

Cards and mechanics that reference:

cards played this turn,
"after you play...",
"when you play...",
or any other play-counting condition,

must treat Champion-zone plays identically to plays from any other zone.

The fix should be applied to the generic "card played" tracking, not to Darius specifically, since any future card that counts played cards should observe the same behavior.
