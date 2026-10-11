import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import express from "express";
import type { QueryResultRow } from "pg";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { authRouter } from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createSettingsRouter } from "./routes/settings.js";
import { createAdminWorkspaceService } from "./services/admin-workspace-service.js";
import type { DatabaseQuery } from "./database.js";

const salt = Buffer.from("ffeeddccbbaa99887766554433221100", "hex");
const password = "workspace-test-password-only";
process.env.ADMIN_USERNAME = "workspace-admin";
process.env.ADMIN_PASSWORD_HASH = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
process.env.ADMIN_SESSION_SECRET = "test-only-workspace-secret-with-more-than-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const categoryId = "a46e9127-e6b5-486c-90be-ac1a3c7dcce9";
const enquiryId = "2f4bfa5b-992d-4f1f-9d59-1ac2fcf49b38";
const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
const category = { id: categoryId, name: "Brakes", slug: "brakes", product_count: 2 };
const vehicleEnquiry = {
  id: enquiryId, customer_name: "Actual submitter", mobile_number: "9876543210",
  vehicle_category: "motorcycle", make_name: "Verified make", model_name: "Verified model",
  approximate_location: "Peraiyur", status: "new", image_paths: ["https://example.test/vehicle.jpg"]
};
const contactEnquiry = {
  id: enquiryId, customer_name: "Actual submitter", mobile_number: "9876543210",
  email: "customer@example.test", message: "Please call back", status: "new"
};
const metrics = {
  total_products: 8, active_products: 5, inactive_products: 3, categories_count: 4,
  vehicle_enquiries_count: 6, contact_enquiries_count: 7, total_stock: 19, out_of_stock_products: 2
};
let settings: Record<string, string> | null = null;

const databaseQuery: DatabaseQuery = async <Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: readonly unknown[] = []
) => {
  calls.push({ sql, values });
  let rows: QueryResultRow[] = [];
  if (sql.includes("FROM product_categories c")) rows = [category];
  else if (sql.includes("INSERT INTO product_categories")) rows = [{ ...category, name: values[0] }];
  else if (sql.includes("UPDATE product_categories")) rows = values[0] === categoryId ? [{ ...category, name: values[1] }] : [];
  else if (sql.includes("AS total_products")) rows = [metrics];
  else if (sql.includes("FROM vehicle_purchase_enquiries e")) {
    rows = sql.includes("WHERE e.id = $1") ? values[0] === enquiryId ? [vehicleEnquiry] : [] : [vehicleEnquiry];
  } else if (sql.includes("UPDATE vehicle_purchase_enquiries")) {
    rows = values[0] === enquiryId ? [{ id: enquiryId, status: values[1] }] : [];
  } else if (sql.includes("FROM contact_enquiries")) {
    rows = sql.includes("WHERE id = $1") ? values[0] === enquiryId ? [contactEnquiry] : [] : [contactEnquiry];
  } else if (sql.includes("UPDATE contact_enquiries")) {
    rows = values[0] === enquiryId ? [{ id: enquiryId, status: values[1] }] : [];
  }   else if (sql.includes("business_settings")) {
    if (sql.includes("INSERT INTO")) {
      settings = JSON.parse(String(values[1])) as Record<string, string>;
      rows = [{ value: settings, updated_at: "2026-10-10T00:00:00Z" }];
    } else {
      rows = settings ? [{ value: settings, updated_at: "2026-10-10T00:00:00Z" }] : [];
    }
  }
  return { rows: rows as Row[] };
};

const workspaceService = createAdminWorkspaceService({ query: databaseQuery });
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/admin", createAdminRouter(undefined, workspaceService));
app.use("/api/settings", createSettingsRouter(workspaceService));
const server = app.listen(0, "127.0.0.1");
let baseUrl = "";

before(async () => {
  await new Promise<void>(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;
});

async function adminCookie(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ username: "workspace-admin", password })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

test("workspace reads and writes require the existing admin session", async () => {
  const initialCalls = calls.length;
  const paths = [
    "/api/admin/categories",
    "/api/admin/vehicle-enquiries",
    "/api/admin/contact-enquiries",
    "/api/admin/reports",
    "/api/admin/settings"
  ];
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, path);
  }
  const create = await fetch(`${baseUrl}/api/admin/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ name: "Unauthorized" })
  });
  assert.equal(create.status, 401);
  assert.equal(calls.length, initialCalls);
});

test("admin category list, create, edit and validation use stored category records", async () => {
  const cookie = await adminCookie();
  const list = await fetch(`${baseUrl}/api/admin/categories?search=Brake`, { headers: { Cookie: cookie } });
  assert.deepEqual((await list.json() as { categories: unknown[] }).categories, [category]);

  const create = await fetch(`${baseUrl}/api/admin/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ name: "Brakes" })
  });
  assert.equal(create.status, 201);
  assert.equal((await create.json() as { category: { name: string } }).category.name, "Brakes");

  const update = await fetch(`${baseUrl}/api/admin/categories/${categoryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ name: "Brake components" })
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json() as { category: { name: string } }).category.name, "Brake components");

  const invalid = await fetch(`${baseUrl}/api/admin/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ name: " " })
  });
  assert.equal(invalid.status, 400);
  assert.ok(calls.some(call => call.sql.includes("ILIKE") && call.values[0] === "%Brake%"));
});

test("admin enquiry APIs list, reveal details, update supported statuses and reject invalid records", async () => {
  const cookie = await adminCookie();
  const vehicleList = await fetch(`${baseUrl}/api/admin/vehicle-enquiries?status=new`, { headers: { Cookie: cookie } });
  assert.deepEqual((await vehicleList.json() as { enquiries: unknown[] }).enquiries, [vehicleEnquiry]);
  const vehicleDetail = await fetch(`${baseUrl}/api/admin/vehicle-enquiries/${enquiryId}`, { headers: { Cookie: cookie } });
  assert.equal((await vehicleDetail.json() as { enquiry: { image_paths: string[] } }).enquiry.image_paths[0], "https://example.test/vehicle.jpg");
  const vehicleStatus = await fetch(`${baseUrl}/api/admin/vehicle-enquiries/${enquiryId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ status: "contacted" })
  });
  assert.equal(vehicleStatus.status, 200);

  const contactList = await fetch(`${baseUrl}/api/admin/contact-enquiries?search=customer`, { headers: { Cookie: cookie } });
  assert.deepEqual((await contactList.json() as { enquiries: unknown[] }).enquiries, [contactEnquiry]);
  const contactDetail = await fetch(`${baseUrl}/api/admin/contact-enquiries/${enquiryId}`, { headers: { Cookie: cookie } });
  assert.equal((await contactDetail.json() as { enquiry: { email: string } }).enquiry.email, "customer@example.test");
  const contactStatus = await fetch(`${baseUrl}/api/admin/contact-enquiries/${enquiryId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ status: "completed" })
  });
  assert.equal(contactStatus.status, 200);

  const unsupportedStatus = await fetch(`${baseUrl}/api/admin/contact-enquiries/${enquiryId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ status: "inspection_scheduled" })
  });
  assert.equal(unsupportedStatus.status, 400);
  const missing = await fetch(`${baseUrl}/api/admin/vehicle-enquiries/4ccddc87-a8c1-40cd-9812-91b6a14fb229`, { headers: { Cookie: cookie } });
  assert.equal(missing.status, 404);
});

test("admin reports execute schema-backed metrics and settings persist through JSONB upsert", async () => {
  const cookie = await adminCookie();
  const report = await fetch(`${baseUrl}/api/admin/reports`, { headers: { Cookie: cookie } });
  assert.deepEqual((await report.json() as { metrics: unknown }).metrics, metrics);
  assert.ok(calls.some(call => call.sql.includes("AS total_products") && call.sql.includes("FROM vehicle_purchase_enquiries")));

  const settings = {
    marketplaceName: "M. M. A. Jinna Vehicle Spare Parts",
    address: "Peraiyur, Kamarajar Street",
    contactPhone: "9345883525",
    whatsappNumber: "6382328587"
  };
  const save = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify(settings)
  });
  assert.equal(save.status, 200);
  assert.deepEqual((await save.json() as { settings: unknown }).settings, settings);

  const read = await fetch(`${baseUrl}/api/admin/settings`, { headers: { Cookie: cookie } });
  assert.deepEqual((await read.json() as { settings: unknown }).settings, settings);
  const publicRead = await fetch(`${baseUrl}/api/settings`);
  assert.deepEqual((await publicRead.json() as { settings: unknown }).settings, settings);
  const invalid = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ ...settings, contactPhone: "bad-number" })
  });
  assert.equal(invalid.status, 400);
  assert.ok(calls.some(call => call.sql.includes("ON CONFLICT (key)") && call.values[0] === "marketplace"));
});
