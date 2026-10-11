import { Router } from "express";
import rateLimit from "express-rate-limit";
import { submitContactEnquiry, submitVehicleEnquiry } from "../controllers/enquiry-controller.js";

export const enquiriesRouter = Router();
enquiriesRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 15 }));
enquiriesRouter.post("/vehicle", submitVehicleEnquiry);
enquiriesRouter.post("/contact", submitContactEnquiry);
