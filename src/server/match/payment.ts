import { z } from "zod";

export const domains = ["Body", "Calm", "Chaos", "Fury", "Mind", "Order"] as const;
export const rainbowPower = "Rainbow" as const;

export const domainSchema = z.enum(domains);
export const powerPaymentDomainSchema = z.union([
  domainSchema,
  z.literal(rainbowPower)
]);

export const powerRequirementSchema = z.object({
  amount: z.number().int().positive(),
  payableBy: z.union([z.literal("any"), z.array(domainSchema).min(1)])
});

export const resourceCostsSchema = z.object({
  energy: z.number().int().min(0),
  power: z.array(powerRequirementSchema)
});

export const resourcePaymentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("spendEnergy"),
    amount: z.number().int().positive()
  }),
  z.object({
    type: z.literal("spendPower"),
    domain: powerPaymentDomainSchema,
    amount: z.number().int().positive()
  }),
  z.object({
    type: z.literal("exhaustRuneForEnergy"),
    cardInstanceId: z.string().min(1)
  }),
  z.object({
    type: z.literal("recycleRuneForPower"),
    cardInstanceId: z.string().min(1),
    producedDomain: powerPaymentDomainSchema
  })
]);

export const nonResourceCostPaymentSchema = z.object({
  type: z.string().min(1),
  payload: z.unknown().optional()
});

export const paymentPlanSchema = z.object({
  selectedModeId: z.string().min(1),
  resourceCosts: resourceCostsSchema,
  resourcePayments: z.array(resourcePaymentSchema),
  nonResourceCosts: z.array(nonResourceCostPaymentSchema),
  optionalCostsChosen: z.array(z.string().min(1)),
  costModifiersApplied: z.array(z.string().min(1))
});

export const paymentModeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  optionalCosts: z.array(z.string().min(1)),
  resourceCosts: resourceCostsSchema,
  isDefault: z.boolean()
});

export type Domain = z.infer<typeof domainSchema>;
export type PowerPaymentDomain = z.infer<typeof powerPaymentDomainSchema>;
export type PowerRequirement = z.infer<typeof powerRequirementSchema>;
export type ResourceCosts = z.infer<typeof resourceCostsSchema>;
export type ResourcePayment = z.infer<typeof resourcePaymentSchema>;
export type NonResourceCostPayment = z.infer<typeof nonResourceCostPaymentSchema>;
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export function isDomain(value: string): value is Domain {
  return domains.includes(value as Domain);
}

export function cardDomainsInMetadataOrder(domainsFromCard: string[]): Domain[] {
  return domainsFromCard.filter(isDomain);
}
