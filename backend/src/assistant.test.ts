import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import {
  answerAssistantRequest,
  AssistantUnavailableError,
  loadReferenceCatalogue
} from "./services/assistant-service.js";
import { assistantRequestSchema, referenceCatalogueSchema } from "./validation/assistant.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

const fixtureCatalogue = {
  models: [{
    id: "fixture-model",
    manufacturer: "Fixture Make",
    model: "Fixture Model",
    engineCapacityApprox: "test-only capacity",
    discontinued: false,
    outsidePeriod: false,
    source: { document: "test fixture" }
  }],
  parts: [{
    id: "fixture-part",
    partName: "Fixture Part",
    category: "Test category",
    vehicleCategory: "Test vehicle",
    fitmentNotes: "Test fixture only; compatibility is not verified.",
    models: ["fixture-model"],
    source: { document: "test fixture" }
  }]
};

async function createCatalogue(contents: unknown = fixtureCatalogue) {
  const directory = await mkdtemp(join(tmpdir(), "assistant-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "catalogue.json");
  await writeFile(path, JSON.stringify(contents), "utf8");
  return path;
}

const request = assistantRequestSchema.parse({ message: "Check a fixture part" });
const providerEnvironment = {
  AI_API_URL: "https://provider.example/v1/chat/completions",
  AI_API_KEY: "test-only-key",
  AI_MODEL: "test-model"
};

function providerReply(partIds: string[], modelIds: string[]) {
  return Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          reply: "This provider-supplied text must not be trusted or returned.",
          partIds,
          modelIds
        })
      }
    }]
  });
}

test("reference catalogue loads, validates unique IDs and model references", async () => {
  const path = await createCatalogue();
  const catalogue = await loadReferenceCatalogue(path, {});
  assert.equal(catalogue.models.length, 1);
  assert.equal(catalogue.parts.length, 1);
  assert.equal(referenceCatalogueSchema.safeParse({
    ...fixtureCatalogue,
    parts: [{ ...fixtureCatalogue.parts[0], models: ["missing-model"] }]
  }).success, false);
  assert.equal(referenceCatalogueSchema.safeParse({
    ...fixtureCatalogue,
    models: [fixtureCatalogue.models[0], fixtureCatalogue.models[0]]
  }).success, false);
});

test("committed catalogue JSON conforms to the runtime reference schema", async () => {
  const cataloguePath = resolve(process.cwd(), "..", "data", "reference-catalogue.json");
  const catalogue = await loadReferenceCatalogue(cataloguePath, {});
  assert.deepEqual(catalogue, { models: [], parts: [] });
});

test("missing, malformed and empty catalogues have explicit safe states", async () => {
  await assert.rejects(
    loadReferenceCatalogue(join(tmpdir(), "assistant-catalogue-that-does-not-exist.json"), {}),
    error => error instanceof AssistantUnavailableError && error.reason === "catalogue_missing"
  );
  const invalidPath = await createCatalogue({ models: [{ id: "invalid" }], parts: [] });
  await assert.rejects(
    loadReferenceCatalogue(invalidPath, {}),
    error => error instanceof AssistantUnavailableError && error.reason === "catalogue_invalid"
  );
  const emptyPath = await createCatalogue({ models: [], parts: [] });
  await assert.rejects(
    answerAssistantRequest(request, {
      cataloguePath: emptyPath,
      environment: providerEnvironment,
      fetcher: async () => { throw new Error("Empty catalogue must not contact provider"); }
    }),
    error => error instanceof AssistantUnavailableError && error.reason === "catalogue_empty"
  );
});

test("known model and part lookups return only source catalogue records", async () => {
  const path = await createCatalogue();
  const result = await answerAssistantRequest(request, {
    cataloguePath: path,
    environment: providerEnvironment,
    fetcher: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only-key");
      const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
      assert.match(body.messages[0].content, /only exact records/);
      return providerReply(["fixture-part"], ["fixture-model"]);
    }
  });
  assert.deepEqual(result.parts.map(part => part.id), ["fixture-part"]);
  assert.deepEqual(result.models.map(model => model.id), ["fixture-model"]);
  assert.doesNotMatch(result.reply, /provider-supplied text/);
  assert.match(result.reply, /not live inventory/i);
  assert.match(result.reply, /exact make, model, year, and variant/i);
});

test("unknown model and part lookups clearly report no catalogue match", async () => {
  const path = await createCatalogue();
  const result = await answerAssistantRequest(request, {
    cataloguePath: path,
    environment: providerEnvironment,
    fetcher: async () => providerReply([], [])
  });

  test("Tamil requests receive a safe Tamil no-match explanation", async () => {
    const path = await createCatalogue();
    const result = await answerAssistantRequest(assistantRequestSchema.parse({ message: "எனது வாகனத்திற்கு பாகம் உள்ளதா?" }), {
      cataloguePath: path,
      environment: providerEnvironment,
      fetcher: async () => providerReply([], [])
    });
    assert.match(result.reply, /குறிப்பு பட்டியலில் இல்லை/);
  });
  assert.deepEqual(result.parts, []);
  assert.deepEqual(result.models, []);
  assert.match(result.reply, /does not contain a matching model or part/i);
});

test("missing provider credentials do not make a provider request", async () => {
  const path = await createCatalogue();
  await assert.rejects(
    answerAssistantRequest(request, {
      cataloguePath: path,
      environment: {},
      fetcher: async () => { throw new Error("Missing configuration must not contact provider"); }
    }),
    error => error instanceof AssistantUnavailableError && error.reason === "provider_not_configured"
  );
});

test("provider timeout and network errors are normalized without leaking details", async () => {
  const path = await createCatalogue();
  for (const fetcher of [
    async () => { throw new DOMException("timeout detail", "AbortError"); },
    async () => { throw new Error("secret provider failure detail"); }
  ]) {
    await assert.rejects(
      answerAssistantRequest(request, { cataloguePath: path, environment: providerEnvironment, fetcher }),
      error => error instanceof AssistantUnavailableError && error.reason === "provider_failed" &&
        !error.message.includes("secret") && !error.message.includes("timeout detail")
    );
  }
});

test("provider HTTP errors, malformed responses and unknown IDs fail safely", async () => {
  const path = await createCatalogue();
  const fetchers: typeof fetch[] = [
    async () => new Response(null, { status: 500 }),
    async () => new Response("not-json", { status: 200 }),
    async () => Response.json({ choices: [{ message: { content: "not-json" } }] }),
    async () => providerReply(["unknown-part"], [])
  ];
  for (const fetcher of fetchers) {
    await assert.rejects(
      answerAssistantRequest(request, { cataloguePath: path, environment: providerEnvironment, fetcher }),
      error => error instanceof AssistantUnavailableError && error.reason === "provider_failed"
    );
  }
});
