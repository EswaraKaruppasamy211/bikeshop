import assert from "node:assert/strict";
import test from "node:test";
import { productQuerySchema } from "./validation/product-query.js";
import { contactEnquirySchema, vehicleEnquirySchema } from "./validation/enquiry.js";

test("product filters accept valid filters and defaults", () => {
  const parsed = productQuerySchema.parse({ search: "brake", minPrice: "10", maxPrice: "100" });
  assert.equal(parsed.limit, 12);
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.minPrice, 10);
  assert.equal(productQuerySchema.parse({ sort: "name_asc" }).sort, "name_asc");
});

test("product filters reject reversed price bounds and unsupported sort", () => {
  assert.equal(productQuerySchema.safeParse({ minPrice: 20, maxPrice: 10 }).success, false);
  assert.equal(productQuerySchema.safeParse({ sort: "random" }).success, false);
});

test("vehicle enquiry requires consent and valid category", () => {
  const base = {
    customerName: "Test customer",
    mobileNumber: "9876543210",
    vehicleCategory: "car",
    makeName: "Example make",
    modelName: "Example model",
    approximateLocation: "Example area",
    consent: true
  };
  assert.equal(vehicleEnquirySchema.safeParse(base).success, true);
  assert.equal(vehicleEnquirySchema.safeParse({ ...base, consent: false }).success, false);
  assert.equal(vehicleEnquirySchema.safeParse({ ...base, vehicleCategory: "spaceship" }).success, false);
});

test("contact enquiry validates email and required fields", () => {
  const base = { customerName: "Test customer", mobileNumber: "9876543210", message: "Please contact me", consent: true };
  assert.equal(contactEnquirySchema.safeParse(base).success, true);
  assert.equal(contactEnquirySchema.safeParse({ ...base, email: "invalid" }).success, false);
});
