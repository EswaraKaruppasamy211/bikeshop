import { z } from "zod";

const messageSchema = z.string().trim().min(1).max(1200);

export const assistantRequestSchema = z.object({
  message: messageSchema,
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: messageSchema
  })).max(12).default([])
}).strict();

export const referenceCatalogueSchema = z.object({
  models: z.array(z.object({
    id: z.string().min(1).max(100),
    manufacturer: z.string().min(1).max(120),
    model: z.string().min(1).max(160),
    engineCapacityApprox: z.string().max(80).optional(),
    notes: z.string().max(1000).optional(),
    discontinued: z.boolean(),
    outsidePeriod: z.boolean(),
    source: z.object({
      document: z.string().min(1).max(200),
      page: z.number().int().positive().optional()
    }).strict()
  }).strict()),
  parts: z.array(z.object({
    id: z.string().min(1).max(100),
    partName: z.string().min(1).max(180),
    category: z.string().min(1).max(120),
    vehicleCategory: z.string().min(1).max(100),
    fitmentNotes: z.string().max(1000).nullable(),
    models: z.array(z.string().min(1).max(100)),
    source: z.object({
      document: z.string().min(1).max(200),
      page: z.number().int().positive().optional()
    }).strict()
  }).strict())
}).strict().superRefine((catalogue, context) => {
  const modelIds = new Set<string>();
  catalogue.models.forEach((model, index) => {
    if (modelIds.has(model.id)) {
      context.addIssue({ code: "custom", path: ["models", index, "id"], message: "Model IDs must be unique." });
    }
    modelIds.add(model.id);
  });
  const partIds = new Set<string>();
  catalogue.parts.forEach((part, index) => {
    if (partIds.has(part.id)) {
      context.addIssue({ code: "custom", path: ["parts", index, "id"], message: "Part IDs must be unique." });
    }
    partIds.add(part.id);
    part.models.forEach((modelId, modelIndex) => {
      if (!modelIds.has(modelId)) {
        context.addIssue({ code: "custom", path: ["parts", index, "models", modelIndex], message: "Part model references must exist." });
      }
    });
  });
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type ReferenceCatalogue = z.infer<typeof referenceCatalogueSchema>;
