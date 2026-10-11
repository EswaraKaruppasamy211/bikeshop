import type { Request, Response } from "express";
import { DatabaseUnavailableError } from "../database.js";
import { createContactEnquiry, createVehicleEnquiry } from "../services/enquiry-service.js";
import { contactEnquirySchema, vehicleEnquirySchema } from "../validation/enquiry.js";

function serviceUnavailable(response: Response, error: unknown) {
  if (!(error instanceof DatabaseUnavailableError)) return false;
  response.status(503).json({ error: "Enquiry submission is temporarily unavailable. Please try again later." });
  return true;
}

export async function submitVehicleEnquiry(request: Request, response: Response) {
  const parsed = vehicleEnquirySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid vehicle enquiry.", details: parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  try {
    const enquiry = await createVehicleEnquiry(parsed.data);
    response.status(201).json({ enquiry });
  } catch (error) {
    if (!serviceUnavailable(response, error)) throw error;
  }
}

export async function submitContactEnquiry(request: Request, response: Response) {
  const parsed = contactEnquirySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid contact enquiry.", details: parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) });
    return;
  }
  try {
    const enquiry = await createContactEnquiry(parsed.data);
    response.status(201).json({ enquiry });
  } catch (error) {
    if (!serviceUnavailable(response, error)) throw error;
  }
}
