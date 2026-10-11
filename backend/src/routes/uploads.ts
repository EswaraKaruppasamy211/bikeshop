import { Router } from "express";

export const uploadsRouter = Router();
uploadsRouter.use((_request, response) => {
  response.status(503).json({
    status: "unavailable",
    error: "Private image storage is not configured. No file was uploaded."
  });
});
