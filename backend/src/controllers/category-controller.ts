import type { Request, Response } from "express";
import { DatabaseUnavailableError } from "../database.js";
import { listCategories } from "../services/product-service.js";

export async function getCategories(_request: Request, response: Response) {
  try {
    const result = await listCategories();
    response.json({ categories: result.rows });
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      response.status(503).json({ error: "Categories are temporarily unavailable." });
      return;
    }
    throw error;
  }
}
