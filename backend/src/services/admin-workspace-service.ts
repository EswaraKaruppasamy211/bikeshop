import { randomUUID } from "node:crypto";
import { queryDatabase, type DatabaseQuery } from "../database.js";
import type { z } from "zod";
import type {
  adminVehicleEnquiryListSchema,
  adminContactEnquiryListSchema,
  adminCategorySchema,
  marketplaceSettingsSchema
} from "../validation/admin-workspace.js";

type VehicleEnquiryFilters = z.infer<typeof adminVehicleEnquiryListSchema>;
type ContactEnquiryFilters = z.infer<typeof adminContactEnquiryListSchema>;
type CategoryInput = z.infer<typeof adminCategorySchema>;
type MarketplaceSettings = z.infer<typeof marketplaceSettingsSchema>;

export type AdminWorkspaceDatabase = { query: DatabaseQuery };
export type AdminWorkspaceOperations = ReturnType<typeof createAdminWorkspaceService>;

function categorySlug(name: string): string {
  const slug = name.normalize("NFKD").toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `category-${randomUUID()}`;
}

export function createAdminWorkspaceService(database: AdminWorkspaceDatabase = { query: queryDatabase }) {
  async function listCategories(search?: string) {
    const result = await database.query(
      `SELECT c.id, c.name, c.slug, c.created_at, COUNT(p.id)::int AS product_count
       FROM product_categories c
       LEFT JOIN products p ON p.category_id = c.id
       WHERE ($1::text IS NULL OR c.name ILIKE $1 OR c.slug ILIKE $1)
       GROUP BY c.id, c.name, c.slug
       ORDER BY c.name ASC
       LIMIT 500`,
      [search ? `%${search}%` : null]
    );
    return result.rows;
  }

  async function createCategory(input: CategoryInput) {
    const result = await database.query(
      `INSERT INTO product_categories (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, created_at`,
      [input.name, categorySlug(input.name)]
    );
    return result.rows[0] ?? null;
  }

  async function updateCategory(id: string, input: CategoryInput) {
    const result = await database.query(
      `UPDATE product_categories
       SET name = $2, slug = $3
       WHERE id = $1
       RETURNING id, name, slug, created_at`,
      [id, input.name, categorySlug(input.name)]
    );
    return result.rows[0] ?? null;
  }

  async function listVehicleEnquiries(filters: VehicleEnquiryFilters) {
    const result = await database.query(
      `SELECT e.id, e.customer_name, e.mobile_number, e.vehicle_category,
              COALESCE(e.make_name, mk.name) AS make_name,
              COALESCE(e.model_name, vm.name) AS model_name,
              e.manufacturing_year, e.fuel_type, e.registration_region,
              e.vehicle_condition, e.known_damage, e.approximate_location,
              e.expected_price, e.additional_notes, e.status, e.admin_notes,
              e.final_inspection_findings, e.created_at, e.updated_at,
              COALESCE((SELECT array_agg(i.storage_path ORDER BY i.created_at)
                        FROM enquiry_images i WHERE i.enquiry_id = e.id), ARRAY[]::text[]) AS image_paths
       FROM vehicle_purchase_enquiries e
       LEFT JOIN vehicle_makes mk ON mk.id = e.make_id
       LEFT JOIN vehicle_models vm ON vm.id = e.model_id
       WHERE ($1::text IS NULL OR e.customer_name ILIKE $1 OR e.mobile_number ILIKE $1
              OR e.make_name ILIKE $1 OR e.model_name ILIKE $1 OR e.approximate_location ILIKE $1)
         AND ($2::text IS NULL OR e.status = $2)
       ORDER BY e.created_at DESC, e.id
       LIMIT $3 OFFSET $4`,
      [filters.search ? `%${filters.search}%` : null, filters.status ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  }

  async function getVehicleEnquiry(id: string) {
    const result = await database.query(
      `SELECT e.id, e.customer_id, e.customer_name, e.mobile_number, e.vehicle_category,
              COALESCE(e.make_name, mk.name) AS make_name,
              COALESCE(e.model_name, vm.name) AS model_name,
              e.manufacturing_year, e.fuel_type, e.registration_region,
              e.vehicle_condition, e.known_damage, e.approximate_location,
              e.expected_price, e.additional_notes, e.status, e.admin_notes,
              e.final_inspection_findings, e.created_at, e.updated_at,
              COALESCE((SELECT array_agg(i.storage_path ORDER BY i.created_at)
                        FROM enquiry_images i WHERE i.enquiry_id = e.id), ARRAY[]::text[]) AS image_paths
       FROM vehicle_purchase_enquiries e
       LEFT JOIN vehicle_makes mk ON mk.id = e.make_id
       LEFT JOIN vehicle_models vm ON vm.id = e.model_id
       WHERE e.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async function updateVehicleEnquiryStatus(id: string, status: string) {
    const result = await database.query(
      `UPDATE vehicle_purchase_enquiries
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, status, updated_at`,
      [id, status]
    );
    return result.rows[0] ?? null;
  }

  async function listContactEnquiries(filters: ContactEnquiryFilters) {
    const result = await database.query(
      `SELECT id, customer_name, mobile_number, email, message, status, admin_notes, created_at
       FROM contact_enquiries
       WHERE ($1::text IS NULL OR customer_name ILIKE $1 OR mobile_number ILIKE $1
              OR COALESCE(email, '') ILIKE $1 OR message ILIKE $1)
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC, id
       LIMIT $3 OFFSET $4`,
      [filters.search ? `%${filters.search}%` : null, filters.status ?? null, filters.limit, filters.offset]
    );
    return result.rows;
  }

  async function getContactEnquiry(id: string) {
    const result = await database.query(
      `SELECT id, customer_name, mobile_number, email, message, status, admin_notes, created_at
       FROM contact_enquiries
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async function updateContactEnquiryStatus(id: string, status: string) {
    const result = await database.query(
      `UPDATE contact_enquiries
       SET status = $2
       WHERE id = $1
       RETURNING id, status, created_at`,
      [id, status]
    );
    return result.rows[0] ?? null;
  }

  async function getReportMetrics() {
    const result = await database.query(
      `SELECT
         (SELECT COUNT(*)::int FROM products) AS total_products,
         (SELECT COUNT(*)::int FROM products WHERE is_active = TRUE) AS active_products,
         (SELECT COUNT(*)::int FROM products WHERE is_active = FALSE) AS inactive_products,
         (SELECT COUNT(*)::int FROM product_categories) AS categories_count,
         (SELECT COUNT(*)::int FROM vehicle_purchase_enquiries) AS vehicle_enquiries_count,
         (SELECT COUNT(*)::int FROM contact_enquiries) AS contact_enquiries_count,
         (SELECT COALESCE(SUM(quantity_available), 0)::int FROM products) AS total_stock,
         (SELECT COUNT(*)::int FROM products WHERE quantity_available = 0) AS out_of_stock_products`
    );
    return result.rows[0] ?? null;
  }

  async function getMarketplaceSettings() {
    const result = await database.query(
      "SELECT value, updated_at FROM business_settings WHERE key = $1",
      ["marketplace"]
    );
    return result.rows[0] ?? null;
  }

  async function saveMarketplaceSettings(settings: MarketplaceSettings) {
    const result = await database.query(
      `INSERT INTO business_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING value, updated_at`,
      ["marketplace", JSON.stringify(settings)]
    );
    return result.rows[0] ?? null;
  }

  return {
    listCategories, createCategory, updateCategory,
    listVehicleEnquiries, getVehicleEnquiry, updateVehicleEnquiryStatus,
    listContactEnquiries, getContactEnquiry, updateContactEnquiryStatus,
    getReportMetrics, getMarketplaceSettings, saveMarketplaceSettings
  };
}

export const adminWorkspaceService = createAdminWorkspaceService();
