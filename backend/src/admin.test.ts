import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import express from "express";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { authRouter } from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import type { AdminProductOperations } from "./services/admin-product-service.js";

const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const password = "A-secure-test-only-passphrase";
const hash = scryptSync(password, salt, 64);
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD_HASH = `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
process.env.ADMIN_SESSION_SECRET = "test-only-session-secret-with-more-than-32-bytes";
process.env.FRONTEND_ORIGIN = "http://localhost:5173";

const sampleProduct = {
  id: "9b427e18-7d51-4b61-963c-f6e77715116a",
  name: "Real supplied product name",
  description: null,
  part_number: null,
  condition: "unassessed",
  known_defects: null,
  price: null,
  price_type: "enquiry",
  quantity_available: 0,
  category: "Verified category",
  category_id: "b4d2921d-2c8e-47ea-9e14-c6e3d6ee98a0",
  category_slug: "verified-category",
  image_path: null,
  image_paths: [],
  compatible_vehicles: [],
  compatibility: [],
  is_active: false
};

const calls: string[] = [];
const operations: AdminProductOperations = {
  async listProducts() {
    return { rows: [sampleProduct], hasMore: false };
  },
  async getProduct(id) {
    return id === sampleProduct.id ? sampleProduct : null;
  },
  async listVehicleModels() {
    return [];
  },
  async createProduct(input) {
    calls.push(`create:${input.name}`);
    return sampleProduct;
  },
  async updateProduct(id) {
    calls.push(`update:${id}`);
    return id === sampleProduct.id ? sampleProduct : null;
  },
  async archiveProduct(id) {
    calls.push(`archive:${id}`);
    return id === sampleProduct.id;
  }
};

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/admin", createAdminRouter(operations));
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

async function signIn(username = "test-admin", suppliedPassword = password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ username, password: suppliedPassword })
  });
  return response;
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

const validInput = {
  name: "Actual product provided by administrator",
  description: "Verified description",
  partNumber: null,
  categoryId: sampleProduct.category_id,
  condition: "unassessed",
  knownDefects: null,
  price: null,
  priceType: "enquiry",
  quantityAvailable: 0,
  isActive: false,
  imageUrls: [],
  compatibility: []
};

test("admin login verifies provisioned scrypt credentials and issues a protected cookie", async () => {
  const invalid = await signIn("test-admin", "incorrect-test-password");
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), { error: "Invalid username or password." });

  const valid = await signIn();
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { authenticated: true, username: "test-admin", expiresIn: 28800 });
  assert.match(valid.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(valid.headers.get("set-cookie") ?? "", /SameSite=Strict/i);
});

test("admin mutations reject requests without a valid session", async () => {
  const response = await fetch(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify(validInput)
  });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test("authenticated admin product create and update APIs validate and return saved records", async () => {
  const login = await signIn();
  const cookie = cookieFrom(login);
  const create = await fetch(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify(validInput)
  });
  assert.equal(create.status, 201);
  assert.deepEqual((await create.json() as { product: { id: string } }).product, sampleProduct);

  const update = await fetch(`${baseUrl}/api/admin/products/${sampleProduct.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ ...validInput, quantityAvailable: 4, price: 125.5, priceType: "fixed", isActive: true })
  });
  assert.equal(update.status, 200);
  assert.deepEqual(calls, [`create:${validInput.name}`, `update:${sampleProduct.id}`]);
});

test("admin product API rejects invalid price, negative stock and missing product", async () => {
  const login = await signIn();
  const cookie = cookieFrom(login);
  const invalidPrice = await fetch(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ ...validInput, priceType: "fixed", price: null })
  });
  assert.equal(invalidPrice.status, 400);

  const negativeStock = await fetch(`${baseUrl}/api/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify({ ...validInput, quantityAvailable: -1 })
  });
  assert.equal(negativeStock.status, 400);

  const missing = await fetch(`${baseUrl}/api/admin/products/0af540d6-c66d-4d27-b9f0-54173d360f8b`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: JSON.stringify(validInput)
  });
  assert.equal(missing.status, 404);
});

test("admin session endpoint and logout invalidate browser cookie", async () => {
  const login = await signIn();
  const cookie = cookieFrom(login);
  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.deepEqual(await session.json(), { authenticated: true, username: "test-admin", expiresIn: 28800 });
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
    body: "{}"
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { authenticated: false });
  assert.match(logout.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970|Max-Age=0/i);
});
