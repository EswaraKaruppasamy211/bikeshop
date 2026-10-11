import { z } from "zod";
import { productIdSchema } from "./product-query.js";

const productConditionSchema = z.enum(["excellent", "good", "fair", "poor", "unassessed"]);
const imageUrlSchema = z.string().trim().url().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Image URLs must use HTTP or HTTPS and cannot contain credentials.");

export const adminProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable(),
  partNumber: z.string().trim().max(100).nullable(),
  categoryId: productIdSchema,
  condition: productConditionSchema,
  knownDefects: z.string().trim().max(3000).nullable(),
  price: z.number().finite().nonnegative().max(9999999999.99).nullable(),
  priceType: z.enum(["fixed", "enquiry"]),
  quantityAvailable: z.number().int().min(0).max(2147483647),
  isActive: z.boolean(),
  imageUrls: z.array(imageUrlSchema).max(10),
  compatibility: z.array(z.object({
    modelId: productIdSchema,
    verificationStatus: z.enum(["verified", "unverified"]),
    notes: z.string().trim().max(1000).nullable()
  }).strict()).max(50)
}).strict().refine(value => value.priceType !== "fixed" || value.price !== null, {
  path: ["price"],
  message: "A fixed-price product requires an actual price."
}).refine(value => new Set(value.compatibility.map(item => item.modelId)).size === value.compatibility.length, {
  path: ["compatibility"],
  message: "A model can only be listed once."
});

export const adminProductListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: productIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const adminProductIdSchema = productIdSchema;
