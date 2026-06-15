import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cardDomainsInMetadataOrder,
  paymentModeSchema,
  paymentPlanSchema,
  powerRequirementSchema,
  rainbowPower,
  resourcePaymentSchema
} from "../src/server/match";

test("validates Power requirements for specific domains and any-domain costs", () => {
  assert.deepEqual(
    powerRequirementSchema.parse({
      amount: 1,
      payableBy: ["Calm", "Chaos"]
    }),
    {
      amount: 1,
      payableBy: ["Calm", "Chaos"]
    }
  );
  assert.deepEqual(
    powerRequirementSchema.parse({
      amount: 1,
      payableBy: "any"
    }),
    {
      amount: 1,
      payableBy: "any"
    }
  );
  assert.equal(
    powerRequirementSchema.safeParse({
      amount: 1,
      payableBy: ["Colorless"]
    }).success,
    false
  );
});

test("validates resource payments including Rainbow Power", () => {
  assert.deepEqual(
    resourcePaymentSchema.parse({
      type: "spendPower",
      domain: rainbowPower,
      amount: 1
    }),
    {
      type: "spendPower",
      domain: "Rainbow",
      amount: 1
    }
  );
  assert.deepEqual(
    resourcePaymentSchema.parse({
      type: "recycleRuneForPower",
      cardInstanceId: "rune-1",
      producedDomain: "Mind"
    }),
    {
      type: "recycleRuneForPower",
      cardInstanceId: "rune-1",
      producedDomain: "Mind"
    }
  );
});

test("validates complete payment plans", () => {
  const plan = paymentPlanSchema.parse({
    selectedModeId: "regular",
    resourceCosts: {
      energy: 1,
      power: [
        {
          amount: 1,
          payableBy: ["Calm", "Chaos"]
        }
      ]
    },
    resourcePayments: [
      {
        type: "spendEnergy",
        amount: 1
      },
      {
        type: "spendPower",
        domain: "Calm",
        amount: 1
      }
    ],
    nonResourceCosts: [],
    optionalCostsChosen: [],
    costModifiersApplied: []
  });

  assert.equal(plan.selectedModeId, "regular");
  assert.deepEqual(plan.resourceCosts.power[0]?.payableBy, ["Calm", "Chaos"]);
});

test("validates payment modes exposed to projections", () => {
  const mode = paymentModeSchema.parse({
    id: "repeat",
    label: "Play with Repeat",
    optionalCosts: ["Repeat"],
    resourceCosts: {
      energy: 2,
      power: [
        {
          amount: 2,
          payableBy: ["Mind"]
        }
      ]
    },
    isDefault: false
  });

  assert.deepEqual(mode.optionalCosts, ["Repeat"]);
});

test("preserves metadata domain order while excluding non-payable domains", () => {
  assert.deepEqual(cardDomainsInMetadataOrder(["Calm", "Chaos"]), [
    "Calm",
    "Chaos"
  ]);
  assert.deepEqual(cardDomainsInMetadataOrder(["Colorless", "Mind"]), ["Mind"]);
});
