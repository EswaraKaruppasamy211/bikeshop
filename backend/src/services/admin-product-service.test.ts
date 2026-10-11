import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import { adminProductSchema } from "../validation/admin-product.js";
import { createAdminProductService, InvalidProductReferenceError, type AdminProductDatabase } from "./admin-product-service.js";
import type { DatabaseQuery, DatabaseTransaction } from "../database.js";

const categoryId = "b4d2921d-2c8e-47ea-9e14-c6e3d6ee98a0";
const modelId = "d74bce3f-5a3a-4c3c-9f64-3fa831a8c901";
const productId = "9b427e18-7d51-4b61-963c-f6e77715116a";

function createHarness(options: { categoryExists?: boolean; modelExists?: boolean; productExists?: boolean } = {}) {
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const transactionEvents: string[] = [];
  const savedProduct: Record<string, unknown> = {
    id: productId, name: "Actual supplied product", category_id: categoryId,
    category: "Supplied category", condition: "good", price: "25.00", price_type: "fixed",
    quantity_available: 3, is_active: true, image_path: "https://images.example/part.webp",
    image_paths: ["https://images.example/part.webp"], compatible_vehicles: ["Example Brand Example Bike"],
    compatibility: [{ modelId, verificationStatus: "verified", make: "Example Brand", model: "Example Bike", notes: null }]
  };

  const query: DatabaseQuery = async <Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: readonly unknown[] = []
  ) => {
    statements.push({ sql, values });
    let rows: Record<string, unknown>[] = [];
    if (sql.includes("FROM product_categories WHERE id")) {
      rows = options.categoryExists === false ? [] : [{ id: categoryId }];
    } else if (sql.includes("FROM vehicle_models WHERE id = ANY")) {
      rows = options.modelExists === false ? [] : (values[0] as string[]).map(id => ({ id }));
    } else if (sql.includes("INSERT INTO products")) {
      rows = [{ id: productId }];
    } else if (sql.includes("UPDATE products") && sql.includes("RETURNING id")) {
      rows = options.productExists === false ? [] : [{ id: productId }];
    } else if (sql.includes("SELECT p.id")) {
      rows = options.productExists === false && !statements.some(item => item.sql.includes("INSERT INTO products"))
        ? []
        : [savedProduct];
    } else if (sql.includes("UPDATE products SET is_active")) {
      rows = options.productExists === false ? [] : [{ id: productId }];
    }
    return { rows: rows as Row[] };
  };
  const transaction: DatabaseTransaction = async <T>(operation: (client: { query: DatabaseQuery }) => Promise<T>) => {
    transactionEvents.push("begin");
    try {
      const result = await operation({ query });
      transactionEvents.push("commit");
      return result;
    } catch (error) {
      transactionEvents.push("rollback");
      throw error;
    }
  };
  const database: AdminProductDatabase = { query, transaction };
  return { service: createAdminProductService(database), statements, transactionEvents };
}

const validInput = {
  name: "Actual supplied product",
  description: "Description supplied by administrator",
  partNumber: "SKU-REAL-01",
  categoryId,
  condition: "good",
  knownDefects: null,
  price: 25,
  priceType: "fixed",
  quantityAvailable: 3,
  isActive: true,
  imageUrls: ["https://images.example/part.webp"],
  compatibility: [{ modelId, verificationStatus: "verified", notes: null }]
};

test("admin product validation rejects missing fixed price and negative stock", () => {
  assert.equal(adminProductSchema.safeParse({ ...validInput, price: null }).success, false);
  assert.equal(adminProductSchema.safeParse({ ...validInput, quantityAvailable: -1 }).success, false);
  assert.equal(adminProductSchema.safeParse({ ...validInput, price: Number.NaN }).success, false);
  assert.equal(adminProductSchema.safeParse({ ...validInput, imageUrls: ["javascript:alert(1)"] }).success, false);
});

test("admin product creation parameterizes fields and commits product, URL image, compatibility and audit together", async () => {
  const harness = createHarness();
  const input = adminProductSchema.parse(validInput);
  const product = await harness.service.createProduct(input);
  assert.equal(product?.id, productId);
  assert.deepEqual(harness.transactionEvents, ["begin", "commit"]);
  const insert = harness.statements.find(item => item.sql.includes("INSERT INTO products"));
  assert.ok(insert);
  assert.match(insert.sql, /VALUES \(\$1, \$2, \$3/);
  assert.ok(insert.values.includes(input.name));
  assert.ok(harness.statements.some(item => item.sql.includes("INSERT INTO product_images") &&
    item.values.includes("https://images.example/part.webp")));
  assert.ok(harness.statements.some(item => item.sql.includes("INSERT INTO product_compatibility") &&
    item.values.includes(modelId)));
  assert.ok(harness.statements.some(item => item.sql.includes("INSERT INTO audit_logs")));
});

test("admin product update uses transaction and preserves private image rows", async () => {
  const harness = createHarness();
  const product = await harness.service.updateProduct(productId, adminProductSchema.parse(validInput));
  assert.equal(product?.id, productId);
  assert.deepEqual(harness.transactionEvents, ["begin", "commit"]);
  assert.ok(harness.statements.some(item => item.sql.includes("DELETE FROM product_images WHERE product_id = $1 AND is_public = TRUE")));
  assert.ok(harness.statements.some(item => item.sql.includes("UPDATE products") &&
    item.values.includes("Actual supplied product")));
});

test("missing product and invalid references do not report a successful update", async () => {
  const missing = createHarness({ productExists: false });
  assert.equal(await missing.service.updateProduct(productId, adminProductSchema.parse(validInput)), null);

  const invalidModel = createHarness({ modelExists: false });
  await assert.rejects(
    invalidModel.service.createProduct(adminProductSchema.parse(validInput)),
    InvalidProductReferenceError
  );
  assert.deepEqual(invalidModel.transactionEvents, ["begin", "rollback"]);
});

test("archive uses a soft inactive update and reports a missing identifier", async () => {
  const harness = createHarness();
  assert.equal(await harness.service.archiveProduct(productId), true);
  assert.ok(harness.statements.some(item => item.sql.includes("SET is_active = FALSE")));
  const missing = createHarness({ productExists: false });
  assert.equal(await missing.service.archiveProduct(productId), false);
});
