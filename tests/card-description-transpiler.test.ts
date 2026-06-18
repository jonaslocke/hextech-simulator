import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCardText } from "../src/features/game-board/lib/normalize-card-description";

test("card description transpiler preserves and renders Riftbound resource tokens", () => {
  const text = normalizeCardText(
    ":rb_exhaust:: [Reaction] - [Add] :rb_energy_2:. Give me +1 :rb_might: this turn.",
  );

  assert.equal(text.includes(":rbexhaust:"), false);
  assert.equal(text.includes(":rbenergy2:"), false);
  assert.equal(text.includes(":rbmight:"), false);
  assert.equal(text.includes(":rb_exhaust:"), true);
  assert.equal(text.includes(":rb_energy_2:"), true);
  assert.equal(text.includes(":rb_might:"), true);
  assert.equal(text.includes(":rb_exhaust::\n [Reaction]"), false);
  assert.equal(text.includes(":rb_exhaust:: [Reaction]"), true);
});
