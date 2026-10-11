import { Router } from "express";
import rateLimit from "express-rate-limit";
import { DatabaseUnavailableError } from "../database.js";
import { requireAdmin, requireSameOrigin } from "../middleware/admin-auth.js";
import {
  adminProductService,
  InvalidProductReferenceError,
  type AdminProductOperations
} from "../services/admin-product-service.js";
import {
  adminProductIdSchema,
  adminProductListSchema,
  adminProductSchema
} from "../validation/admin-product.js";
import {
  adminCategorySchema,
  adminCategorySearchSchema,
  adminContactEnquiryListSchema,
  adminEnquiryIdSchema,
  adminVehicleEnquiryListSchema,
  contactEnquiryStatusSchema,
  marketplaceSettingsSchema,
  vehicleEnquiryStatusSchema
} from "../validation/admin-workspace.js";
import { adminWorkspaceService, type AdminWorkspaceOperations } from "../services/admin-workspace-service.js";

function unavailable(error: unknown, response: import("express").Response): boolean {
  if (!(error instanceof DatabaseUnavailableError)) return false;
  response.status(503).json({
    error: error.reason === "not_configured"
      ? "Marketplace data storage is not configured."
      : "Marketplace data storage is temporarily unavailable."
  });
  return true;
}

const mutationLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

function uniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "23505";
}

export function createAdminRouter(
  productService: AdminProductOperations = adminProductService,
  workspaceService: AdminWorkspaceOperations = adminWorkspaceService
) {
  const router = Router();
  router.use(requireAdmin);

  router.get("/products", async (request, response) => {
  const parsed = adminProductListSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid product search parameters." });
    return;
  }
  try {
    const result = await productService.listProducts(parsed.data);
    response.json({ products: result.rows, hasMore: result.hasMore });
  } catch (error) {
    if (!unavailable(error, response)) throw error;
  }
});

  router.get("/vehicle-models", async (_request, response) => {
  try {
    const models = await productService.listVehicleModels();
    response.json({ models });
  } catch (error) {
    if (!unavailable(error, response)) throw error;
  }
});

  router.get("/products/:id", async (request, response) => {
  const parsed = adminProductIdSchema.safeParse(request.params.id);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid product identifier." });
    return;
  }
  try {
    const product = await productService.getProduct(parsed.data);
    if (!product) {
      response.status(404).json({ error: "Product not found." });
      return;
    }
    response.json({ product });
  } catch (error) {
    if (!unavailable(error, response)) throw error;
  }
});

  router.post("/products", requireSameOrigin, mutationLimiter, async (request, response) => {
  const parsed = adminProductSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Product details are invalid.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const product = await productService.createProduct(parsed.data);
    if (!product) {
      response.status(400).json({ error: "The selected product category does not exist." });
      return;
    }
    response.status(201).json({ product });
  } catch (error) {
    if (error instanceof InvalidProductReferenceError) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (!unavailable(error, response)) throw error;
  }
});

  router.put("/products/:id", requireSameOrigin, mutationLimiter, async (request, response) => {
  const id = adminProductIdSchema.safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "Invalid product identifier." });
    return;
  }
  const parsed = adminProductSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Product details are invalid.", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const product = await productService.updateProduct(id.data, parsed.data);
    if (!product) {
      response.status(404).json({ error: "Product or selected category not found." });
      return;
    }
    response.json({ product });
  } catch (error) {
    if (error instanceof InvalidProductReferenceError) {
      response.status(400).json({ error: error.message });
      return;
    }
    if (!unavailable(error, response)) throw error;
  }
});

  router.delete("/products/:id", requireSameOrigin, mutationLimiter, async (request, response) => {
  const parsed = adminProductIdSchema.safeParse(request.params.id);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid product identifier." });
    return;
  }
  try {
    if (!await productService.archiveProduct(parsed.data)) {
      response.status(404).json({ error: "Product not found." });
      return;
    }
    response.json({ archived: true });
  } catch (error) {
    if (!unavailable(error, response)) throw error;
  }
});

  router.get("/categories", async (request, response) => {
    const parsed = adminCategorySearchSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid category search parameters." });
      return;
    }
    try {
      response.json({ categories: await workspaceService.listCategories(parsed.data.search) });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.post("/categories", requireSameOrigin, mutationLimiter, async (request, response) => {
    const parsed = adminCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Category name is invalid.", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const category = await workspaceService.createCategory(parsed.data);
      if (!category) {
        response.status(500).json({ error: "The category was not returned after saving." });
        return;
      }
      response.status(201).json({ category });
    } catch (error) {
      if (uniqueViolation(error)) {
        response.status(409).json({ error: "A category with this name already exists." });
        return;
      }
      if (!unavailable(error, response)) throw error;
    }
  });

  router.put("/categories/:id", requireSameOrigin, mutationLimiter, async (request, response) => {
    const id = adminEnquiryIdSchema.safeParse(request.params.id);
    const parsed = adminCategorySchema.safeParse(request.body);
    if (!id.success) {
      response.status(400).json({ error: "Invalid category identifier." });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: "Category name is invalid.", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const category = await workspaceService.updateCategory(id.data, parsed.data);
      if (!category) {
        response.status(404).json({ error: "Category not found." });
        return;
      }
      response.json({ category });
    } catch (error) {
      if (uniqueViolation(error)) {
        response.status(409).json({ error: "A category with this name already exists." });
        return;
      }
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/vehicle-enquiries", async (request, response) => {
    const parsed = adminVehicleEnquiryListSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid vehicle enquiry search parameters." });
      return;
    }
    try {
      response.json({ enquiries: await workspaceService.listVehicleEnquiries(parsed.data) });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/vehicle-enquiries/:id", async (request, response) => {
    const id = adminEnquiryIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: "Invalid vehicle enquiry identifier." });
      return;
    }
    try {
      const enquiry = await workspaceService.getVehicleEnquiry(id.data);
      if (!enquiry) {
        response.status(404).json({ error: "Vehicle enquiry not found." });
        return;
      }
      response.json({ enquiry });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.patch("/vehicle-enquiries/:id/status", requireSameOrigin, mutationLimiter, async (request, response) => {
    const id = adminEnquiryIdSchema.safeParse(request.params.id);
    const parsed = vehicleEnquiryStatusSchema.safeParse(request.body);
    if (!id.success) {
      response.status(400).json({ error: "Invalid vehicle enquiry identifier." });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: "Vehicle enquiry status is invalid." });
      return;
    }
    try {
      const enquiry = await workspaceService.updateVehicleEnquiryStatus(id.data, parsed.data.status);
      if (!enquiry) {
        response.status(404).json({ error: "Vehicle enquiry not found." });
        return;
      }
      response.json({ enquiry });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/contact-enquiries", async (request, response) => {
    const parsed = adminContactEnquiryListSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid contact enquiry search parameters." });
      return;
    }
    try {
      response.json({ enquiries: await workspaceService.listContactEnquiries(parsed.data) });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/contact-enquiries/:id", async (request, response) => {
    const id = adminEnquiryIdSchema.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: "Invalid contact enquiry identifier." });
      return;
    }
    try {
      const enquiry = await workspaceService.getContactEnquiry(id.data);
      if (!enquiry) {
        response.status(404).json({ error: "Contact enquiry not found." });
        return;
      }
      response.json({ enquiry });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.patch("/contact-enquiries/:id/status", requireSameOrigin, mutationLimiter, async (request, response) => {
    const id = adminEnquiryIdSchema.safeParse(request.params.id);
    const parsed = contactEnquiryStatusSchema.safeParse(request.body);
    if (!id.success) {
      response.status(400).json({ error: "Invalid contact enquiry identifier." });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: "Contact enquiry status is invalid." });
      return;
    }
    try {
      const enquiry = await workspaceService.updateContactEnquiryStatus(id.data, parsed.data.status);
      if (!enquiry) {
        response.status(404).json({ error: "Contact enquiry not found." });
        return;
      }
      response.json({ enquiry });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/reports", async (_request, response) => {
    try {
      const metrics = await workspaceService.getReportMetrics();
      if (!metrics) {
        response.status(503).json({ error: "Report metrics are unavailable." });
        return;
      }
      response.json({ metrics });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.get("/settings", async (_request, response) => {
    try {
      const result = await workspaceService.getMarketplaceSettings();
      if (!result) {
        response.json({ settings: null, updatedAt: null });
        return;
      }
      const parsed = marketplaceSettingsSchema.safeParse(result.value);
      if (!parsed.success) {
        response.status(409).json({ error: "Stored marketplace settings use an unsupported format." });
        return;
      }
      response.json({ settings: parsed.data, updatedAt: result.updated_at ?? null });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  router.put("/settings", requireSameOrigin, mutationLimiter, async (request, response) => {
    const parsed = marketplaceSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Marketplace settings are invalid.", details: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const saved = await workspaceService.saveMarketplaceSettings(parsed.data);
      if (!saved) {
        response.status(500).json({ error: "Settings were not returned after saving." });
        return;
      }
      response.json({ settings: saved.value, updatedAt: saved.updated_at });
    } catch (error) {
      if (!unavailable(error, response)) throw error;
    }
  });

  return router;
}

export const adminRouter = createAdminRouter();
