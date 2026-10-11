import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL = "";
process.env.AI_API_URL = "";
process.env.AI_API_KEY = "";
process.env.AI_MODEL = "";
process.env.ADMIN_USERNAME = "";
process.env.ADMIN_PASSWORD_HASH = "";
process.env.ADMIN_SESSION_SECRET = "";
const { app } = await import("./app.js");

const server = app.listen(0, "127.0.0.1");
let baseUrl = "";

before(async () => {
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test("API exposes explicit unavailable and validation responses without a database", async t => {
  await t.test("health indicates missing database configuration", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json() as { database: { configured: boolean; status: string } };
    assert.equal(response.status, 503);
    assert.equal(body.database.configured, false);
    assert.equal(body.database.status, "not_configured");
  });

  await t.test("products does not return fabricated inventory", async () => {
    const response = await fetch(`${baseUrl}/api/products`);
    const body = await response.json() as { error: string; products?: unknown[] };
    assert.equal(response.status, 503);
    assert.equal(body.products, undefined);
    assert.match(body.error, /temporarily unavailable|not configured/i);
  });

  await t.test("invalid query receives 400 before any database access", async () => {
    const response = await fetch(`${baseUrl}/api/products?limit=999`);
    assert.equal(response.status, 400);
  });

  await t.test("invalid vehicle enquiry receives 400 before any database access", async () => {
    const response = await fetch(`${baseUrl}/api/enquiries/vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: "Test", consent: false })
    });
    assert.equal(response.status, 400);
  });

  await t.test("category reads fail safely without a database", async () => {
    const response = await fetch(`${baseUrl}/api/categories`);
    assert.equal(response.status, 503);
  });

  await t.test("malformed JSON receives a safe 400 response", async () => {
    const response = await fetch(`${baseUrl}/api/enquiries/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json"
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Request body is invalid." });
  });

  await t.test("assistant returns a safe configuration response with no provider", async () => {
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Look up a part" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "The assistant is not configured yet." });
  });

  await t.test("assistant distinguishes an empty reference catalogue", async () => {
    process.env.AI_API_URL = "https://provider.example/v1/chat/completions";
    process.env.AI_API_KEY = "test-only-key";
    process.env.AI_MODEL = "test-model";
    try {
      const response = await fetch(`${baseUrl}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Look up a part" })
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: "The reference catalogue has no source entries yet. Add the source PDF entries before using the assistant."
      });
    } finally {
      process.env.AI_API_URL = "";
      process.env.AI_API_KEY = "";
      process.env.AI_MODEL = "";
    }
  });

  await t.test("administrator APIs require authentication and uploads remain unavailable", async () => {
    const admin = await fetch(`${baseUrl}/api/admin/dashboard`);
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ username: "test-admin", password: "test-only" })
    });
    const createProduct = await fetch(`${baseUrl}/api/admin/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-only product" })
    });
    const assessment = await fetch(`${baseUrl}/api/assessments/status`);
    const upload = await fetch(`${baseUrl}/api/uploads`, { method: "POST" });
    assert.equal(admin.status, 401);
    assert.equal(login.status, 503);
    assert.equal(createProduct.status, 401);
    assert.equal(assessment.status, 503);
    assert.equal(upload.status, 503);
  });
});
