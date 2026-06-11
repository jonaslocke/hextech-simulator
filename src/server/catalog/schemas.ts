import { z } from "zod";

export const cardTypeSchema = z.enum([
  "Battlefield",
  "Gear",
  "Legend",
  "Rune",
  "Spell",
  "Unit"
]);

export const cardSupertypeSchema = z
  .enum(["Basic", "Champion", "Signature", "Token"])
  .nullable();

export const cardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    riftbound_id: z.string().optional(),
    public_code: z.string().min(1),
    attributes: z.object({
      energy: z.number().nullable(),
      might: z.number().nullable(),
      power: z.number().nullable()
    }),
    classification: z.object({
      type: cardTypeSchema,
      supertype: cardSupertypeSchema,
      rarity: z.string().nullable().optional(),
      domain: z.array(z.string())
    }),
    text: z.object({
      rich: z.string().optional(),
      plain: z.string()
    }),
    set: z.object({
      set_id: z.string().min(1),
      label: z.string().min(1)
    }),
    media: z.object({
      image_url: z.string().url().optional(),
      artist: z.string().nullable().optional(),
      accessibility_text: z.string().nullable().optional()
    }),
    tags: z.array(z.string()),
    metadata: z
      .object({
        clean_name: z.string().optional(),
        alternate_art: z.boolean().optional(),
        overnumbered: z.boolean().optional(),
        signature: z.boolean().optional()
      })
      .passthrough()
  })
  .passthrough();

export const cardSetFileSchema = z.array(cardSchema);

export type Card = z.infer<typeof cardSchema>;
export type CardType = z.infer<typeof cardTypeSchema>;
