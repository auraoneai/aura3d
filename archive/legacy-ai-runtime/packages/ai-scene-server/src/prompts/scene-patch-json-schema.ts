export const scenePatchJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://aura3d.dev/schemas/aura-scene-patch.schema.json",
  title: "AuraScenePatch",
  type: "object",
  additionalProperties: true,
  required: ["patchId", "prompt", "provider", "model", "generatedAt"],
  properties: {
    patchId: { type: "string", minLength: 1 },
    prompt: { type: "string", minLength: 1 },
    provider: { type: "string", minLength: 1 },
    model: { type: "string", minLength: 1 },
    generatedAt: { type: "string", minLength: 1 },
    operations: { type: "array" },
    objects: { type: "array" },
    lighting: { type: "object" },
    cameras: { type: "array" },
    vfx: { type: "array" }
  }
} as const;
