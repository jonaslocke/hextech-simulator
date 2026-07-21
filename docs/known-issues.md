[x] Meditation - paying the additional cost only drew 1 card. Resolved and manually validated on 2026-07-14.
[x] Karma, Channeler OGN-235 - effective text of cards with errata are not being displayed correctly on the card preview. Match 82d72e9e-b42f-448f-a114-0917ab457c3c - Game 1 - G11 ![alt text](image-5.png)
[x] Qiyana, Victorious - at conquer the trigger with modal is working, but on the opponent client an error has been thrown: [ { "code": "too_small", "minimum": 1, "type": "array", "inclusive": true, "exact": false, "message": "Array must contain at least 1 element(s)", "path": [ "pendingChoice", "options" ] } ]
Match 74a8be3a-1de7-4a4f-a3e6-d59297483cce - Game 1 - G33
![alt text](image-6.png)
[x] Adaptatron - after conquer a modal asking for confirmation rised, I select accept. expected: a new choice prompt asks what gear to kill, current: nothing happens. Match 74a8be3a-1de7-4a4f-a3e6-d59297483cce - Game 1 - G87 ![alt text](image-7.png)
[x] Miss Fortune, Captain - after moving a prompt asks for confirmation, I accepted. expected: a new prompt shows asking for one exhausted card on board to be readied. current: nothing happens. Match 74a8be3a-1de7-4a4f-a3e6-d59297483cce - Game 1 - G108
[ ] Miss Fortune, Buccaneer - the image select for the card was no the canonical one, we need a way to always select the card image for the least number in collection, for this card we have this presentations in card corpus: OGN-193/298 and OGN-193a/298, the right one to select is OGN-193/298, no "a", no "\*", on the "metadata": {
"clean_name": "Miss Fortune Buccaneer",
"alternate_art": false,
"overnumbered": false,
"signature": false
}
alternate art, overnumbered and signature are false.
