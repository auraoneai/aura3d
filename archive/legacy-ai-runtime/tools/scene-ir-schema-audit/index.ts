import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AURA_SCENE_IR_SCHEMA_VERSION, createMockProvider, validateAuraSceneIR } from "../../packages/ai-scene/src";
import { collectProviderEnvironment, redactReport } from "../ai-scene-readiness/index";

export const SCENE_IR_SCHEMA_AUDIT_REPORT = "tests/reports/ai-scene/scene-ir-schema-audit.json";

export async function createSceneIRSchemaAuditReport() {
  const provider = createMockProvider({ generatedAt: "2026-05-26T00:00:00.000Z" });
  const result = await provider.completeScene({
    prompt: "Create an AI scene schema audit fixture with objects, materials, cameras, shots, timeline, vfx, physics, assets, and provenance.",
    qualityTarget: "L3"
  });
  const validation = result.ok ? validateAuraSceneIR(result.value) : { ok: false, errors: [] };
  const requiredFields = [
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
  ];
  const missing = result.ok ? requiredFields.filter((field) => !(field in result.value)) : requiredFields;
  const unsupportedCases = [
    ...(result.ok ? [] : [unsupported("mock-generation", "MockProvider could not create the schema audit scene.")]),
    ...(validation.ok ? [] : [unsupported("schema-validation", "Generated AuraSceneIR did not validate.")]),
    ...missing.map((field) => unsupported(`missing:${field}`, `AuraSceneIR fixture is missing required field '${field}'.`))
  ];
  return {
    schema: "a3d-scene-ir-schema-audit",
    generatedAt: new Date().toISOString(),
    pass: unsupportedCases.length === 0,
    inputs: {
      root: ".",
      providerMode: "mock",
      requiredFiles: [
        "packages/ai-scene/src/AuraSceneIR.ts",
        "packages/ai-scene/src/AuraSceneSchema.ts",
        "packages/ai-scene/src/AuraSceneValidator.ts"
      ],
      requiredReports: [],
      environment: collectProviderEnvironment(process.env)
    },
    evidence: requiredFields.map((field) => ({
      id: field,
      path: `AuraSceneIR.${field}`,
      present: !missing.includes(field),
      status: missing.includes(field) ? "missing" : "present",
      detail: missing.includes(field) ? `${field} missing from fixture.` : `${field} present in fixture.`
    })),
    providerMode: "mock",
    networkUsed: false,
    blockedClaims: [],
    unsupportedCases,
    schemaVersion: AURA_SCENE_IR_SCHEMA_VERSION,
    validation
  };
}

type SceneIRSchemaAuditReport = Awaited<ReturnType<typeof createSceneIRSchemaAuditReport>>;

export function writeSceneIRSchemaAuditReport(report: SceneIRSchemaAuditReport | Promise<SceneIRSchemaAuditReport> = createSceneIRSchemaAuditReport(), path = SCENE_IR_SCHEMA_AUDIT_REPORT): Promise<void> {
  return Promise.resolve(report).then((resolvedReport) => {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), `${JSON.stringify(redactReport(resolvedReport), null, 2)}\n`);
  });
}

function unsupported(id: string, detail: string) {
  return { id, severity: "blocked" as const, detail, nextAction: "Update AuraSceneIR schema or fixture generation." };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await createSceneIRSchemaAuditReport();
  await writeSceneIRSchemaAuditReport(report);
  if (!report.pass) {
    console.error(`Scene IR schema audit failed:\n${report.unsupportedCases.map((entry) => entry.detail).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Scene IR schema audit passed. Report: ${SCENE_IR_SCHEMA_AUDIT_REPORT}`);
  }
}
