import { z } from "zod";
import { productIdSchema } from "./product-query.js";

const searchSchema = z.string().trim().max(100).optional();
const paginationSchema = {
  search: searchSchema,
  status: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
};

export const adminCategorySearchSchema = z.object({ search: searchSchema });
export const adminCategorySchema = z.object({
  name: z.string().trim().min(1).max(120)
}).strict();

export const adminVehicleEnquiryListSchema = z.object({
  ...paginationSchema,
  status: z.enum(["new", "contacted", "inspection_scheduled", "price_discussed", "completed", "rejected"]).optional()
});
export const adminContactEnquiryListSchema = z.object({
  ...paginationSchema,
  status: z.enum(["new", "contacted", "completed", "rejected"]).optional()
});
export const adminEnquiryIdSchema = productIdSchema;
export const vehicleEnquiryStatusSchema = z.object({
  status: z.enum(["new", "contacted", "inspection_scheduled", "price_discussed", "completed", "rejected"])
}).strict();
export const contactEnquiryStatusSchema = z.object({
  status: z.enum(["new", "contacted", "completed", "rejected"])
}).strict();

const optionalPhone = z.string().trim().max(24).refine(value =>
  value === "" || /^[+]?[\d\s()-]{8,24}$/.test(value),
  "Enter a valid phone number."
);
export const marketplaceSettingsSchema = z.object({
  marketplaceName: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300),
  contactPhone: optionalPhone,
  whatsappNumber: optionalPhone
}).strict();
