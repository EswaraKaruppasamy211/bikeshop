import { queryDatabase } from "../database.js";

export type ProductFilters = {
  search?: string;
  category?: string;
  make?: string;
  model?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: "newest" | "name_asc" | "price_asc" | "price_desc";
  limit: number;
  offset: number;
};

function productConditions(filters: ProductFilters, values: unknown[]): string[] {
  const conditions = ["p.is_active = TRUE", "p.quantity_available > 0"];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.search) {
    const parameter = add(`%${filters.search}%`);
    conditions.push(`(p.name ILIKE ${parameter} OR p.description ILIKE ${parameter})`);
  }
  if (filters.category) conditions.push(`c.slug = ${add(filters.category)}`);
  if (filters.condition) conditions.push(`p.condition = ${add(filters.condition)}`);
  if (filters.minPrice !== undefined) conditions.push(`p.price >= ${add(filters.minPrice)}`);
  if (filters.maxPrice !== undefined) conditions.push(`p.price <= ${add(filters.maxPrice)}`);
  if (filters.make || filters.model) {
    const compatibility = [
      "pc.product_id = p.id",
      "pc.verification_status = 'verified'",
      "vm.id = pc.model_id",
      "vmk.id = vm.make_id"
    ];
    if (filters.make) compatibility.push(`vmk.name ILIKE ${add(`%${filters.make}%`)}`);
    if (filters.model) compatibility.push(`vm.name ILIKE ${add(`%${filters.model}%`)}`);
    conditions.push(`EXISTS (
      SELECT 1 FROM product_compatibility pc
      JOIN vehicle_models vm ON vm.id = pc.model_id
      JOIN vehicle_makes vmk ON vmk.id = vm.make_id
      WHERE ${compatibility.join(" AND ")}
    )`);
  }
  return conditions;
}

export async function listAvailableProducts(filters: ProductFilters) {
  const values: unknown[] = [];
  const conditions = productConditions(filters, values);
  values.push(filters.limit + 1, filters.offset);
  const orderBy = {
    newest: "p.created_at DESC",
    name_asc: "p.name ASC, p.created_at DESC",
    price_asc: "p.price ASC NULLS LAST, p.created_at DESC",
    price_desc: "p.price DESC NULLS LAST, p.created_at DESC"
  }[filters.sort];

  return queryDatabase(
    `SELECT p.id, p.name, p.description, p.part_number, p.condition, p.known_defects,
            p.price, p.price_type, p.quantity_available, c.name AS category,
            (SELECT pi.storage_path FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_public = TRUE
             ORDER BY pi.sort_order LIMIT 1) AS image_path,
            COALESCE((SELECT array_agg(pi.storage_path ORDER BY pi.sort_order, pi.created_at)
             FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_public = TRUE), ARRAY[]::text[]) AS image_paths,
            COALESCE((
              SELECT array_agg(vmk.name || ' ' || vm.name ORDER BY vmk.name, vm.name)
              FROM product_compatibility pc
              JOIN vehicle_models vm ON vm.id = pc.model_id
              JOIN vehicle_makes vmk ON vmk.id = vm.make_id
              WHERE pc.product_id = p.id AND pc.verification_status = 'verified'
            ), ARRAY[]::text[]) AS compatible_vehicles
     FROM products p
     JOIN product_categories c ON c.id = p.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
}

export async function getAvailableProduct(id: string) {
  const result = await queryDatabase(
    `SELECT p.id, p.name, p.description, p.part_number, p.condition, p.known_defects,
            p.price, p.price_type, p.quantity_available, c.name AS category,
            (SELECT pi.storage_path FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_public = TRUE
             ORDER BY pi.sort_order LIMIT 1) AS image_path,
            COALESCE((SELECT array_agg(pi.storage_path ORDER BY pi.sort_order, pi.created_at)
             FROM product_images pi
             WHERE pi.product_id = p.id AND pi.is_public = TRUE), ARRAY[]::text[]) AS image_paths,
            COALESCE((
              SELECT array_agg(vmk.name || ' ' || vm.name ORDER BY vmk.name, vm.name)
              FROM product_compatibility pc
              JOIN vehicle_models vm ON vm.id = pc.model_id
              JOIN vehicle_makes vmk ON vmk.id = vm.make_id
              WHERE pc.product_id = p.id AND pc.verification_status = 'verified'
            ), ARRAY[]::text[]) AS compatible_vehicles
     FROM products p
     JOIN product_categories c ON c.id = p.category_id
     WHERE p.id = $1 AND p.is_active = TRUE AND p.quantity_available > 0`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listCategories() {
  return queryDatabase(
    `SELECT c.id, c.name, c.slug, COUNT(p.id)::int AS available_products
     FROM product_categories c
     LEFT JOIN products p ON p.category_id = c.id AND p.is_active = TRUE AND p.quantity_available > 0
     GROUP BY c.id, c.name, c.slug
     ORDER BY c.name ASC`
  );
}
