import { Router } from "express";
import { answerAssistantRequest, AssistantUnavailableError } from "../services/assistant-service.js";
import { assistantRequestSchema } from "../validation/assistant.js";

export const assistantRouter = Router();

assistantRouter.post("/", async (request, response, next) => {
  const parsed = assistantRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a message of up to 1,200 characters." });
    return;
  }

  try {
    response.json(await answerAssistantRequest(parsed.data));
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      const status = error.reason === "provider_failed" ? 502 : 503;
      const message = error.reason === "catalogue_missing"
        ? "The assistant is waiting for the source reference catalogue."
        : error.reason === "catalogue_invalid"
          ? "The reference catalogue is invalid and needs to be checked."
          : error.reason === "catalogue_empty"
            ? "The reference catalogue has no source entries yet. Add the source PDF entries before using the assistant."
            : error.reason === "provider_not_configured"
              ? "The assistant is not configured yet."
              : "The assistant provider is temporarily unavailable.";
      response.status(status).json({ error: message });
      return;
    }
    next(error);
  }
});
