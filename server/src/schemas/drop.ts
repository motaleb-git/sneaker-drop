import { z } from "zod";

export const createDropSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    priceCents: z.number().int().min(0),
    totalStock: z.number().int().min(1).max(1_000_000),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.endsAt) return;

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const endsAt = new Date(data.endsAt);

    if (endsAt <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt must be after startsAt",
        path: ["endsAt"],
      });
    }
  });

export type CreateDropInput = z.infer<typeof createDropSchema>;
