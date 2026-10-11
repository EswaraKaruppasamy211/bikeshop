import { Router } from "express";
import { checkDatabase } from "../database.js";

export const systemRouter = Router();

systemRouter.get("/health", async (_request, response) => {
  const database = await checkDatabase();
  response.status(database.reachable ? 200 : 503).json({
    status: database.reachable ? "ok" : "error",
    database
  });
});

systemRouter.get("/assessments/status", (_request, response) => {
  response.status(503).json({
    status: "unavailable",
    error: "Image assessment is not configured. No AI assessment was performed."
  });
});
