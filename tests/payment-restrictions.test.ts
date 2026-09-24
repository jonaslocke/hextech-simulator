import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRestrictions, normalizeResourceRestriction, restrictionAllowsPayment, resourceUsageAllowsPayment, type ResourceRestriction } from "../src/server/game/payment-restrictions";
import { candidateIsEligible, orderPaymentCandidates, type PaymentCandidate } from "../src/server/game/payment-candidates";

function candidate(order: number, restriction: ResourceRestriction, overrides: Partial<PaymentCandidate> = {}): PaymentCandidate {
  return { kind: "energy", amount: 1, restriction, usage: "test", acquisition: "exhaust", order, ...overrides };
}
const narrow = normalizeResourceRestriction("card:Gear");
const broad = normalizeResourceRestriction("cardOrAbility:Gear");
const context = { kind: "card", cardType: "Gear" } as const;

test("normalized eligibility covers production aliases, card/ability scopes and unknown identifiers", () => {
  for (const [usage, card, ability] of [
    ["card:Gear", true, false], ["cardOrAbility:Gear", true, true],
    ["gearAndGearAbilitiesOnly", true, true], ["unrestricted", true, true],
    ["spellsOnly", false, false], ["unknown", false, false],
  ] as const) {
    assert.equal(resourceUsageAllowsPayment(usage, context), card);
    assert.equal(resourceUsageAllowsPayment(usage, { kind: "ability", sourceCardType: "Gear" }), ability);
  }
  assert.equal(resourceUsageAllowsPayment("spellsOnly", { kind: "card", cardType: "Spell" }), true);
  assert.equal(resourceUsageAllowsPayment("spellsOnly", { kind: "ability", sourceCardType: "Spell" }), false);
  assert.equal(compareRestrictions(normalizeResourceRestriction("spellsOnly"), normalizeResourceRestriction("card:Spell")), "equivalent");
  assert.equal(compareRestrictions(broad, normalizeResourceRestriction("gearAndGearAbilitiesOnly")), "equivalent");
  assert.equal(compareRestrictions({ kind: ["card", "ability"] }, {}), "narrower");
  assert.equal(resourceUsageAllowsPayment("card:Spell", { kind: "hide" }), false);
  assert.equal(resourceUsageAllowsPayment("hide:Hide", { kind: "hide" }), true);
  assert.equal(compareRestrictions({ type: ["Gear"] }, broad), "broader");
  assert.equal(compareRestrictions({ kind: [] }, { type: [] }), "equivalent");
});

test("Energy and Power share subset priority across two levels of restriction", () => {
  for (const kind of ["energy", "power"] as const) {
    const resources = [candidate(0, {}, { kind, domain: "Calm" }), candidate(1, broad, { kind, domain: "Calm" }), candidate(2, narrow, { kind, domain: "Calm" })];
    assert.ok(resources.every((resource) => candidateIsEligible(resource, context, ["Calm"])));
    assert.deepEqual(orderPaymentCandidates(resources).map((resource) => resource.order), [2, 1, 0]);
  }
});

test("equivalent and incomparable restrictions preserve stable source order", () => {
  const multiType = normalizeResourceRestriction("card:Gear|Unit");
  assert.equal(compareRestrictions(multiType, broad), "incomparable");
  assert.equal(restrictionAllowsPayment(multiType, context), true);
  assert.equal(restrictionAllowsPayment(broad, context), true);
  for (const restrictions of [[broad, normalizeResourceRestriction("gearAndGearAbilitiesOnly")], [multiType, broad]]) {
    assert.deepEqual(orderPaymentCandidates(restrictions.map((restriction, order) => candidate(order, restriction))).map((resource) => resource.order), [0, 1]);
  }
  // A partial order must not be fed to an unstable/non-transitive sort comparator.
  const ordered = orderPaymentCandidates([candidate(0, broad), candidate(1, multiType), candidate(2, narrow)]);
  assert.deepEqual(ordered.map((resource) => resource.order), [2, 0, 1]);
});

test("domain-specific Power precedes Rainbow for equal usage; narrower usage takes precedence across domains", () => {
  const rainbow = candidate(0, broad, { kind: "power", domain: "Rainbow" });
  const calm = candidate(1, broad, { kind: "power", domain: "Calm" });
  assert.deepEqual(orderPaymentCandidates([rainbow, calm]), [calm, rainbow]);
  const restrictedRainbow = candidate(0, narrow, { kind: "power", domain: "Rainbow" });
  assert.deepEqual(orderPaymentCandidates([calm, restrictedRainbow]), [restrictedRainbow, calm]);
  assert.equal(candidateIsEligible(calm, context, ["Mind"]), false);
  assert.equal(candidateIsEligible(rainbow, context, ["Mind"]), true);
});

test("pooled/generated Energy and Power share the same restriction matcher", () => {
  for (const kind of ["energy", "power"] as const) for (const acquisition of ["pool", "exhaust"] as const) {
    const resource = candidate(0, narrow, { kind, acquisition, domain: "Calm" });
    assert.equal(candidateIsEligible(resource, context, ["Calm"]), true);
    assert.equal(candidateIsEligible(resource, { kind: "ability", sourceCardType: "Gear" }, ["Calm"]), false);
  }
  const pooled = candidate(1, {}, { acquisition: "pool" });
  const generated = candidate(0, narrow);
  assert.deepEqual(orderPaymentCandidates([generated, pooled]), [pooled, generated], "existing pool is spent before adding resources");
});

test("synthetic future characteristic restrictions need no named priority branch", () => {
  const general: ResourceRestriction = { kind: ["card"], type: ["Spell"], school: ["mist", "sun"] };
  const specific: ResourceRestriction = { ...general, school: ["mist"], "trait:echo": ["yes"] };
  const spell = { kind: "card", cardType: "Spell", characteristics: { school: "mist", "trait:echo": "yes" } } as const;
  assert.equal(restrictionAllowsPayment(specific, spell), true);
  assert.equal(restrictionAllowsPayment(specific, { ...spell, characteristics: { school: "sun", "trait:echo": "yes" } }), false);
  assert.equal(compareRestrictions(specific, general), "narrower");
  assert.equal(compareRestrictions(general, normalizeResourceRestriction("spellsOnly")), "narrower");
  assert.equal(compareRestrictions(general, {}), "narrower");
  for (const kind of ["energy", "power"] as const) {
    assert.deepEqual(orderPaymentCandidates([candidate(0, {}, { kind }), candidate(1, general, { kind }), candidate(2, specific, { kind })]).map((resource) => resource.order), [2, 1, 0]);
  }
});

test("destructive acquisition is independent of specificity and never permits ready-Rune recycling", () => {
  const recycle = candidate(0, narrow, { kind: "power", domain: "Calm", acquisition: "recycle", runeState: "ready" });
  assert.equal(candidateIsEligible(recycle, context, ["Calm"]), false);
  assert.equal(candidateIsEligible({ ...recycle, runeState: "exhausted" }, context, ["Calm"]), true);
  assert.equal(candidateIsEligible({ ...recycle, runeState: "exhausted-by-plan" }, context, ["Calm"]), true);
  const exhaust = candidate(1, narrow, { kind: "power", domain: "Calm" });
  assert.deepEqual(orderPaymentCandidates([{ ...recycle, runeState: "exhausted" }, exhaust]).map((resource) => resource.acquisition), ["exhaust", "recycle"]);
});
