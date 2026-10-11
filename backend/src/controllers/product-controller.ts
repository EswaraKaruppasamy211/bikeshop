import type { Request, Response } from "express";
import { DatabaseUnavailableError } from "../database.js";
import { getAvailableProduct, listAvailableProducts } from "../services/product-service.js";
import { productIdSchema, productQuerySchema } from "../validation/product-query.js";

function unavailable(response: Response, error: unknown) {
  if (!(error instanceof DatabaseUnavailableError)) return false;
  response.status(503).json({
    error: error.reason === "not_configured"
      ? "Product listings are not configured yet."
      : "Product listings are temporarily unavailable."
  });
  return true;
}

export async function listProducts(request: Request, response: Response) {
  const parsed = productQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid product search parameters." });
    return;
  }
  try {
    const result = await listAvailableProducts(parsed.data);
    response.json({
      products: result.rows.slice(0, parsed.data.limit),
      hasMore: result.rows.length > parsed.data.limit
    });
  } catch (error) {
    if (!unavailable(response, error)) throw error;
  }
}

export async function productDetails(request: Request, response: Response) {
  const parsed = productIdSchema.safeParse(request.params.id);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid product identifier." });
    return;
  }
  try {
    const product = await getAvailableProduct(parsed.data);
    if (!product) {
      response.status(404).json({ error: "Product not found or no longer available." });
      return;
    }
    response.json({ product });
  } catch (error) {
    if (!unavailable(response, error)) throw error;
  }
}
