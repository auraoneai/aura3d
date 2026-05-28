import { AURA_SCENE_IR_SCHEMA_VERSION } from "./AuraSceneIR.js";

export const AURA_SCENE_REQUIRED_FIELDS = [
  "schemaVersion",
  "sceneId",
  "title",
  "brief",
  "mood",
  "environment",
  "objects",
  "characters",
  "materials",
  "lighting",
  "cameras",
  "shots",
  "timeline",
  "vfx",
  "physics",
  "audio",
  "assetRequirements",
  "backendPreference",
  "qualityTarget",
  "unresolved",
  "provenance"
] as const;

export const AURA_SCENE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://aura3d.dev/schemas/aura-scene-ir.schema.json",
  title: "AuraSceneIR",
  type: "object",
  additionalProperties: false,
  required: AURA_SCENE_REQUIRED_FIELDS,
  properties: {
    schemaVersion: { const: AURA_SCENE_IR_SCHEMA_VERSION },
    sceneId: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    brief: { type: "string", minLength: 1 },
    mood: { type: "array", items: { type: "string" } },
    environment: { type: "object", required: ["id", "label", "kind", "moodTags"] },
    objects: { type: "array", items: { type: "object", required: ["id", "label", "role", "kind", "transform", "semanticTags"] } },
    characters: { type: "array" },
    materials: { type: "array", items: { type: "object", required: ["id", "label", "baseColor", "metallic", "roughness", "source"] } },
    lighting: { type: "object", required: ["id", "label", "mood", "exposure", "keyLight"] },
    cameras: { type: "array", items: { type: "object", required: ["id", "stableId", "label", "kind", "position", "target", "focalLengthMm", "fovDegrees"] } },
    shots: { type: "array", items: { type: "object", required: ["id", "label", "cameraId", "startSeconds", "endSeconds", "movement", "notes"] } },
    timeline: { type: "array" },
    vfx: { type: "array" },
    physics: { type: "array" },
    audio: { type: "array" },
    assetRequirements: { type: "array" },
    backendPreference: { enum: ["auto", "webgl2", "webgpu"] },
    qualityTarget: {
      enum: [
        "L0",
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
        "L0-schema-proof",
        "L1-primitive-previs",
        "L2-asset-backed-previs",
        "L3-cinematic-realtime",
        "L4-production-assisted",
        "L5-offline-final"
      ]
    },
    unresolved: { type: "array" },
    provenance: { type: "object", required: ["provider", "model", "promptHash", "generatedAt", "networkUsed", "patches"] }
  }
} as const;

export const AURA_SCENE_SCHEMA_MIGRATIONS = [
  {
    from: "0.x",
    to: AURA_SCENE_IR_SCHEMA_VERSION,
    notes: "Older draft scenes must add stable IDs, provenance, asset requirements, and explicit quality target fields."
  }
] as const;
