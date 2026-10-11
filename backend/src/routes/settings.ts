import { Router } from "express";
import { DatabaseUnavailableError } from "../database.js";
import { adminWorkspaceService, type AdminWorkspaceOperations } from "../services/admin-workspace-service.js";
import { marketplaceSettingsSchema } from "../validation/admin-workspace.js";

export function createSettingsRouter(workspaceService: AdminWorkspaceOperations = adminWorkspaceService) {
  const router = Router();

  router.get("/", async (_request, response) => {
    try {
      const saved = await workspaceService.getMarketplaceSettings();
      const parsed = marketplaceSettingsSchema.safeParse(saved?.value);
      response.json({ settings: parsed.success ? parsed.data : null });
    } catch (error) {
      if (!(error instanceof DatabaseUnavailableError)) throw error;
      response.status(503).json({ error: "Marketplace settings are temporarily unavailable." });
    }
  });

  return router;
}

export const settingsRouter = createSettingsRouter();
