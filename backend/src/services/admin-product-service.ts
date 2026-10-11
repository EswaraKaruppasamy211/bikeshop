import {
  queryDatabase,
  withDatabaseTransaction,
  type DatabaseClient,
  type DatabaseQuery,
  type DatabaseTransaction
} from "../database.js";
import type { QueryResultRow } from "pg";
import type { z } from "zod";
import type { adminProductListSchema, adminProductSchema } from "../validation/admin-product.js";

type ProductInput = z.infer<typeof adminProductSchema>;
type ProductListInput = z.infer<typeof adminProductListSchema>;
export type AdminProductDatabase = { query: DatabaseQuery; transaction: DatabaseTransaction };
export type AdminProductOperations = ReturnType<typeof createAdminProductService>;

export class InvalidProductReferenceError extends Error {
  constructor() {
    super("A referenced category or vehicle model does not exist.");
    this.name = "InvalidProductReferenceError";
  }
}

const adminProductSelect = `
  SELECT p.id, p.name, p.description, p.part_number, p.condition, p.known_defects,
         p.price, p.price_type, p.quantity_available, p.is_active, p.created_at, p.updated_at,
         c.id AS category_id, c.name AS category, c.slug AS category_slug,
         (SELECT pi.storage_path FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_public = TRUE
          ORDER BY pi.sort_order, pi.created_at LIMIT 1) AS image_path,
         COALESCE((SELECT array_agg(pi.storage_path ORDER BY pi.sort_order, pi.created_at)
          FROM product_images pi
          WHERE pi.product_id = p.id AND pi.is_public = TRUE), ARRAY[]::text[]) AS image_paths,
         COALESCE((
           SELECT array_agg(vmk.name || ' ' || vm.name ORDER BY vmk.name, vm.name)
           FROM product_compatibility pc
           JOIN vehicle_models vm ON vm.id = pc.model_id
           JOIN vehicle_makes vmk ON vmk.id = vm.make_id
           WHERE pc.product_id = p.id AND pc.verification_status = 'verified'
         ), ARRAY[]::text[]) AS compatible_vehicles,
         COALESCE((
           SELECT json_agg(json_build_object(
             'modelId', pc.model_id,
             'verificationStatus', pc.verification_status,
             'make', vmk.name,
             'model', vm.name,
             'notes', pc.notes
           ) ORDER BY vmk.name, vm.name)
           FROM product_compatibility pc
           JOIN vehicle_models vm ON vm.id = pc.model_id
           JOIN vehicle_makes vmk ON vmk.id = vm.make_id
           WHERE pc.product_id = p.id
         ), '[]'::json) AS compatibility
  FROM products p
  JOIN product_categories c ON c.id = p.category_id`;

export function createAdminProductService(database: AdminProductDatabase = {
  query: queryDatabase,
  transaction: withDatabaseTransaction
}) {
  async function categoriesExist(categoryId: string): Promise<boolean> {
    const result = await database.query("SELECT id FROM product_categories WHERE id = $1", [categoryId]);
    return result.rows.length === 1;
  }

  async function validateModels(client: DatabaseClient, modelIds: string[]): Promise<boolean> {
    if (modelIds.length === 0) return true;
    const result = await client.query(
      "SELECT id FROM vehicle_models WHERE id = ANY($1::uuid[])",
      [modelIds]
    );
    return result.rows.length === modelIds.length;
  }

  async function replaceImages(client: DatabaseClient, productId: string, input: ProductInput): Promise<void> {
    await client.query("DELETE FROM product_images WHERE product_id = $1 AND is_public = TRUE", [productId]);
    for (const [index, imageUrl] of input.imageUrls.entries()) {
      await client.query(
        `INSERT INTO product_images (product_id, storage_path, alt_text, is_public, sort_order)
         VALUES ($1, $2, $3, TRUE, $4)`,
        [productId, imageUrl, input.name, index]
      );
    }
  }

  async function replaceCompatibility(client: DatabaseClient, productId: string, input: ProductInput): Promise<void> {
    const modelIds = input.compatibility.map(item => item.modelId);
    if (!await validateModels(client, modelIds)) {
      throw new InvalidProductReferenceError();
    }
    await client.query("DELETE FROM product_compatibility WHERE product_id = $1", [productId]);
    for (const item of input.compatibility) {
      await client.query(
        `INSERT INTO product_compatibility (product_id, model_id, verification_status, notes)
         VALUES ($1, $2, $3, $4)`,
        [productId, item.modelId, item.verificationStatus, item.notes]
      );
    }
  }

  async function listProducts(filters: ProductListInput) {
    const result = await database.query(
      `${adminProductSelect}
       WHERE ($1::text IS NULL OR p.name ILIKE $1 OR p.part_number ILIKE $1)
         AND ($2::uuid IS NULL OR p.category_id = $2)
       ORDER BY p.created_at DESC, p.id
       LIMIT $3 OFFSET $4`,
      [filters.search ? `%${filters.search}%` : null, filters.category ?? null, filters.limit + 1, filters.offset]
    );
    return { rows: result.rows.slice(0, filters.limit), hasMore: result.rows.length > filters.limit };
  }

  async function getProduct(productId: string): Promise<QueryResultRow | null> {
    const result = await database.query(`${adminProductSelect} WHERE p.id = $1`, [productId]);
    return result.rows[0] ?? null;
  }

  async function listVehicleModels() {
    const result = await database.query(
      `SELECT vm.id, vm.make_id, vm.name AS model, vm.model_year_start, vm.model_year_end,
              vmk.name AS make
       FROM vehicle_models vm
       JOIN vehicle_makes vmk ON vmk.id = vm.make_id
       WHERE vmk.is_active = TRUE
       ORDER BY vmk.name, vm.name`
    );
    return result.rows;
  }

  async function createProduct(input: ProductInput): Promise<QueryResultRow | null> {
    if (!await categoriesExist(input.categoryId)) return null;
    return database.transaction(async client => {
      const productResult = await client.query<{ id: string }>(
        `INSERT INTO products
           (category_id, name, description, part_number, condition, known_defects,
            price, price_type, quantity_available, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          input.categoryId, input.name, input.description, input.partNumber, input.condition,
          input.knownDefects, input.price, input.priceType, input.quantityAvailable, input.isActive
        ]
      );
      const productId = productResult.rows[0]?.id;
      if (!productId) throw new Error("Product insert did not return its generated identifier.");
      await replaceImages(client, productId, input);
      await replaceCompatibility(client, productId, input);
      const result = await client.query(`${adminProductSelect} WHERE p.id = $1`, [productId]);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES (NULL, 'admin_product_created', 'product', $1)`,
        [productId]
      );
      return result.rows[0] ?? null;
    });
  }

  async function updateProduct(productId: string, input: ProductInput): Promise<QueryResultRow | null> {
    if (!await categoriesExist(input.categoryId)) return null;
    return database.transaction(async client => {
      const updated = await client.query(
        `UPDATE products
         SET category_id = $2, name = $3, description = $4, part_number = $5,
             condition = $6, known_defects = $7, price = $8, price_type = $9,
             quantity_available = $10, is_active = $11, updated_at = now()
         WHERE id = $1
         RETURNING id, is_active, quantity_available`,
        [
          productId, input.categoryId, input.name, input.description, input.partNumber, input.condition,
          input.knownDefects, input.price, input.priceType, input.quantityAvailable, input.isActive
        ]
      );
      if (updated.rows.length === 0) return null;
      await replaceImages(client, productId, input);
      await replaceCompatibility(client, productId, input);
      const result = await client.query(`${adminProductSelect} WHERE p.id = $1`, [productId]);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES (NULL, 'admin_product_updated', 'product', $1)`,
        [productId]
      );
      return result.rows[0] ?? null;
    });
  }

  async function archiveProduct(productId: string): Promise<boolean> {
    return database.transaction(async client => {
      const result = await client.query<{ id: string }>(
        "UPDATE products SET is_active = FALSE, updated_at = now() WHERE id = $1 RETURNING id",
        [productId]
      );
      if (result.rows.length === 0) return false;
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
         VALUES (NULL, 'admin_product_archived', 'product', $1)`,
        [productId]
      );
      return true;
    });
  }

  return { listProducts, getProduct, listVehicleModels, createProduct, updateProduct, archiveProduct };
}

export const adminProductService = createAdminProductService();
