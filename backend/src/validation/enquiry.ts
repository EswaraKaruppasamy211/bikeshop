import { z } from "zod";

const phone = z.string().trim().min(8).max(24).regex(/^[+]?[\d\s()-]+$/);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const vehicleEnquirySchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  mobileNumber: phone,
  vehicleCategory: z.enum(["motorcycle", "scooter", "car", "tractor", "commercial", "other"]),
  makeName: z.string().trim().min(1).max(90),
  modelName: z.string().trim().min(1).max(100),
  manufacturingYear: z.coerce.number().int().min(1886).max(new Date().getFullYear()).optional(),
  fuelType: optionalText(40),
  approximateLocation: z.string().trim().min(1).max(180),
  vehicleCondition: optionalText(120),
  additionalNotes: optionalText(3000),
  consent: z.literal(true)
});

export const contactEnquirySchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  mobileNumber: phone,
  email: z.string().trim().email().max(254).optional(),
  message: z.string().trim().min(1).max(3000),
  consent: z.literal(true)
});
