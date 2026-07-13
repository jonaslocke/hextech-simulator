[ ] Final Conquer point replacement does not draw a card

Current behavior

When a player conquers a Battlefield and that point would be the final point needed to win, if it is the first Battlefield conquered that turn, the simulator correctly prevents the point from being scored.

However, the replacement effect is never applied. The player neither scores the point nor draws a card.

Expected behavior

If the final point would be scored from Conquer, and this is the first Battlefield the player conquered this turn, the point must be replaced by drawing one card.

The resolution should be:

do not score the point;
draw 1 card instead;
continue the turn normally.

If the player later conquers another Battlefield during the same turn, the replacement no longer applies and the point may be scored normally (including winning the game if it is the final point).
