import { z } from "zod";

export const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  condition: z.enum(["excellent", "good", "fair", "poor", "unassessed"]).optional(),
  minPrice: z.coerce.number().finite().nonnegative().optional(),
  maxPrice: z.coerce.number().finite().nonnegative().optional(),
  sort: z.enum(["newest", "name_asc", "price_asc", "price_desc"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  offset: z.coerce.number().int().min(0).default(0)
}).refine(
  values => values.minPrice === undefined || values.maxPrice === undefined || values.minPrice <= values.maxPrice,
  { message: "Minimum price cannot exceed maximum price." }
);

export const productIdSchema = z.string().uuid();
