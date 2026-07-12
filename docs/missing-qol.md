[x] the temporary zone should be an element that player can move its position around, sometimes the chain could be placed in top of something crucial and players would want to move it away from that position, every time the temp zone is closed and open again, it reset its position
[x] kbd should be more distingushiable in choose units prompt. the same is true for showdown prompts. ![alt text](image-30.png)![alt text](image-31.png)
[x] Choices prompt in top of runes, can get in the way of players choices, make it movable as tempzone. ![alt text](image-34.png)
[x] Hovering cards are not showing the previews.
[x] BF's zone should have a hightlight state, that way moving unit can highlight BF's


[x] Choose Order for trigger abilities, transform glass like and fix card orientation when showing BF's. ![alt text](image-33.png)
[x] Choose Starting Player glass like. ![alt text](image-36.png)
[x] choose mulligan make it glass like and remove layout shift. ![![alt text](image-39.png)](image-38.png)
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

 ![alt text](image.png)
[x] change autopass keybind to R
[x] decision handling needs to be added to choose a battlefield prompt.  ![alt text](image.png)
[x] plan for bo3
[x] end of a match should close socket connection
[ ] ready a permanent animation
[ ] place tokens decision view
[ ] better between games screen
[x] better game header
[ ] concede in between games more dificult
[ ] The Candlelit Sanctum - reorder + recycle better xp
[ ] improve token placement UI - needs image of the locations and better UX for placement.
