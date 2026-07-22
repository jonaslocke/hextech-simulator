[x] the temporary zone should be an element that player can move its position around, sometimes the chain could be placed in top of something crucial and players would want to move it away from that position, every time the temp zone is closed and open again, it reset its position
[x] kbd should be more distingushiable in choose units prompt. the same is true for showdown prompts.
[x] Choices prompt in top of runes, can get in the way of players choices, make it movable as tempzone.
[x] Hovering cards are not showing the previews.
[x] BF's zone should have a hightlight state, that way moving unit can highlight BF's


[x] Choose Order for trigger abilities, transform glass like and fix card orientation when showing BF's.
[x] Choose Starting Player glass like.
[x] choose mulligan make it glass like and remove layout shift.
[ ] tuck hand on player decision making
[x] show zones on player decision making
[x] choose battlefield cancel missing gameaction button, firestorm, the code is in ChoiceDialog, with this consumer call:
        <ChoiceDialog
          confirmLabel="Choose battlefield"
          description="Choose the battlefield affected by this action."
          isOpen
          isSubmitting={isSubmittingAction}
          onCancel={() => setTargetSelection(null)}
          onConfirm={(selectedIds) =>
            submitTargetedPlay({
              ...targetSelection,
              selectedTargetIds: selectedIds,
            })
          }
          options={sourceProjection.battlefields
            .filter((battlefield) =>
              targetSelection.legalTargetIds.includes(
                battlefield.battlefieldId,
              ),
            )
            .map((battlefield) => ({
              description: battlefield.card.rulesText || "Battlefield",
              id: battlefield.battlefieldId,
              imageOrientation: "landscape" as const,
              imageUrl: battlefield.card.imageUrl ?? undefined,
              label: battlefield.card.name,
            }))}
          selectionMode="single"
          title="Choose a Battlefield"
        />

[x] change autopass keybind to R
[x] decision handling needs to be added to choose a battlefield prompt.
[x] plan for bo3
[x] end of a match should close socket connection
[ ] ready a permanent animation
[ ] place tokens decision view
[ ] better between games screen
[x] better game header
[ ] concede in between games more dificult
[ ] The Candlelit Sanctum - reorder + recycle better xp
[ ] improve token placement UI - needs image of the locations and better UX for placement.
[ ] Force non unit gears to be placed at left of base
[ ] Client needs a queue of intents, to no discard subsequential intents.
[ ] Choose mode needs inspect board feature.
[ ] Convergent Mutation - this cards requires two targets, and the on board selector is not specific, the xp could be better since the order of chossing might differ the result if a player selects a unit with less might first the card can be resolved without no effect.
[ ] cards with errata text do not follow the same card parse when show the card preview, we need to update our official errata json text to look like the current card corpus text, do not make the parser better, make the source consistent.
