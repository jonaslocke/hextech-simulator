Scenario

Player A (Viktor) initiates a combat Showdown and attacks with three units. Player A has Focus first and passes.

Player B (Kai'Sa) gains Focus and casts Void Seeker, targeting and killing one of Viktor's non-Recruit units.

The destroyed unit causes Viktor, Leader to trigger. That triggered ability is placed onto the Chain, resolves, and creates a Recruit token. After the triggered ability resolves, the Chain is empty and the Showdown should continue.

Current behavior

When the triggered ability resolves and the Chain becomes empty, the simulator incorrectly returns Focus to Player B (Kai'Sa), allowing that player to act again.

This behavior only occurs when the original action generates one or more triggered abilities that are added to the Chain. If no additional triggers are created, Focus passes correctly.

Expected behavior

Triggered abilities that are added to the Chain during a Showdown must not reset or restart the Focus sequence.

After the entire Chain has resolved, Focus should pass exactly as defined by the Showdown rules, treating the triggered abilities as part of the same Chain resolution.

In this scenario:

Viktor player has Focus and passes.
Kai'Sa player gains Focus and casts Void Seeker.
Void Seeker resolves.
Viktor, Leader triggers and resolves.
The Chain becomes empty.
Focus must pass to the Viktor player, not back to the Kai'Sa player.

The fix should apply generically to any triggered abilities that extend a Showdown Chain, not specifically to Viktor, Leader or Void Seeker.
