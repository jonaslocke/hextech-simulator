[x] remove aid window
[x] validate if after a player add a card to the chain he keeps the priority or not
[x] trash should show only the latest card added there on the pile, players can see entire trash after clicking it
[x] hover to show bigger version of the card is not working in trash and on chain
[x] we need a modal/dialog like to prompt user a choice, this would be used by selecting starting player, select battlefied, select order of triggered effects
[x] choosen champion zone is only shown when there's a card there, same coded behavior as in banished cards
[x] on the zone area of runes, there's a counter for exhausted and ready runes, wire this to the real game state projection
[x] we need a card highlight feature, that way when hovering on items on the stack we can highloght cards that are the target of the effects/spells
[ ] when a ability its to be resolved on the chain we need to highlight its source as well, this will help players when there are more than one of the same card and they keep track of witch trigger is resolving
[ ] we need to validate the order of start of the game setup, from my pov the first battlefield choice is done before any player knowing who starts the game, currently the chooser player knows that he is the one choosing, with that, on the BF choice we need to make players aware of who starts
[ ] bug: Lux ability is able to be used even when the player has no priority
[ ] Lux ability is a reaction and should be possible to add energy when owner has priority, right now its no possible to use it when there is a spell on chain
[ ] chain items should wait for triggering order are choosen to only after that appears on the chain ![alt text](image-2.png)
[ ] opponent trash looks strange when there is cards in trash![alt text](image.png)
[ ] base units should wrap down when comes to a limit of width ![alt text](image-1.png)
[ ] Chain events are reacting to the state of the card in battlefield, the units appears rotated on the chain ![alt text](image-3.png)
