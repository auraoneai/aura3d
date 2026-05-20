import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

type Check = {
  id: string;
  pass: boolean;
  detail: string;
};

const reportPath = resolve("tests/reports/v4-fixture-readiness.json");

function readJson(path: string): JsonObject {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new Error(`Missing required JSON file: ${path}`);
  }
  return JSON.parse(readFileSync(absolute, "utf8")) as JsonObject;
}

function readText(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new Error(`Missing required text file: ${path}`);
  }
  return readFileSync(absolute, "utf8");
}

function asArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hasString(value: JsonObject, key: string): boolean {
  return typeof value[key] === "string" && (value[key] as string).trim().length > 0;
}

function hasLicenseAndProvenance(entry: JsonObject): boolean {
  return hasString(entry, "license") && hasString(entry, "provenance");
}

function sourceHasPin(source: unknown): boolean {
  if (!source || typeof source !== "object") {
    return false;
  }

  const object = source as JsonObject;
  return hasString(object, "repository") && hasString(object, "revision") && hasString(object, "uri") && hasString(object, "sha256");
}

function referencesArePinned(entries: JsonObject[]): boolean {
  return entries.every((entry) => hasLicenseAndProvenance(entry) && sourceHasPin(entry.source));
}

function bootstrapIsDisclaimed(entries: JsonObject[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.role === "bootstrap-only" && entry.notFlagshipProof === true && hasLicenseAndProvenance(entry));
}

function localPathsExist(entries: JsonObject[]): boolean {
  return entries.every((entry) => {
    if (typeof entry.localPath !== "string") {
      return true;
    }
    return existsSync(resolve(entry.localPath));
  });
}

function includesAll(text: string, phrases: string[]): boolean {
  const normalized = text.toLowerCase();
  return phrases.every((phrase) => normalized.includes(phrase.toLowerCase()));
}

const checks: Check[] = [];

function check(id: string, pass: boolean, detail: string): void {
  checks.push({ id, pass, detail });
}

const requiredFiles = [
  "fixtures/v4/manifest.json",
  "fixtures/v4/environments/manifest.json",
  "fixtures/v4/products/manifest.json",
  "fixtures/v4/materials/manifest.json",
  "fixtures/v4/scenes/manifest.json",
  "fixtures/v4/characters/manifest.json",
  "docs/project/v4-roadmap-reference-visual-targets.md"
];

for (const file of requiredFiles) {
  check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
}

const root = readJson("fixtures/v4/manifest.json");
const environments = readJson("fixtures/v4/environments/manifest.json");
const products = readJson("fixtures/v4/products/manifest.json");
const materials = readJson("fixtures/v4/materials/manifest.json");
const scenes = readJson("fixtures/v4/scenes/manifest.json");
const characters = readJson("fixtures/v4/characters/manifest.json");
const targetsDoc = readText("docs/project/v4-roadmap-reference-visual-targets.md");

const sourceManifests = root.sourceManifests as JsonObject | undefined;
const expectedSourceManifests = [
  "fixtures/v4/environments/manifest.json",
  "fixtures/v4/products/manifest.json",
  "fixtures/v4/materials/manifest.json",
  "fixtures/v4/scenes/manifest.json",
  "fixtures/v4/characters/manifest.json"
];

check(
  "root-source-manifests",
  Boolean(sourceManifests) && expectedSourceManifests.every((file) => Object.values(sourceManifests ?? {}).includes(file)),
  "Root manifest must reference every V4 source manifest."
);

const flagshipTargets = asArray(root.flagshipTargets);
check("flagship-target-count", flagshipTargets.length >= 6, "Root manifest must define at least six flagship targets.");
check(
  "flagship-target-product-surface",
  flagshipTargets.every((target) => asStringArray(target.requiredProductSurface).length > 0 && hasString(target, "mustLookLike")),
  "Every flagship target must name product surface and visual target."
);
check(
  "root-product-contract",
  typeof root.productContract === "object" && JSON.stringify(root.productContract).includes("@galileo3d/engine"),
  "Root manifest must name the SDK/runtime/toolchain as the product, not screenshots."
);

const bootstrapGroups = [
  ["root", asArray(root.bootstrapSources)],
  ["environments", asArray(environments.bootstrapLocal)],
  ["products", asArray(products.bootstrapLocal)],
  ["materials", asArray(materials.bootstrapLocal)],
  ["scenes", asArray(scenes.bootstrapLocal)],
  ["characters", asArray(characters.bootstrapLocal)]
] as const;

for (const [name, group] of bootstrapGroups) {
  check(`bootstrap-disclaimer:${name}`, bootstrapIsDisclaimed(group), `${name} bootstrap entries must be marked bootstrap-only and not flagship proof.`);
  check(`bootstrap-local-paths:${name}`, localPathsExist(group), `${name} bootstrap local paths must exist when localPath is declared.`);
}

check(
  "environment-target-count",
  asArray(environments.targets).length >= 5,
  "Environment manifest must define studio, gallery, outdoor, warehouse, and neon HDR targets."
);
check(
  "environment-license-provenance",
  asArray(environments.targets).every(hasLicenseAndProvenance),
  "Every environment target must name license/provenance status."
);

check("material-target-count", asArray(materials.materialTargets).length >= 12, "Material manifest must define at least twelve physical material targets.");
check(
  "material-target-details",
  asArray(materials.materialTargets).every((target) => hasString(target, "id") && hasString(target, "mustProve")),
  "Every material target must define what it must visually prove."
);

const referenceGroups = [
  ["products", asArray(products.externalReferenceCandidates), 4],
  ["materials", asArray(materials.externalReferenceCandidates), 6],
  ["scenes", asArray(scenes.externalReferenceCandidates), 4],
  ["characters", asArray(characters.externalReferenceCandidates), 4]
] as const;

for (const [name, entries, minimum] of referenceGroups) {
  check(`external-reference-count:${name}`, entries.length >= minimum, `${name} manifest must include at least ${minimum} external reference candidates.`);
  check(`external-reference-pinning:${name}`, referencesArePinned(entries), `${name} external references must have license, provenance, repository, revision, URI, and SHA256.`);
}

check(
  "scene-targets",
  asArray(scenes.sceneTargets).length >= 3 && asArray(scenes.sceneTargets).every((target) => hasString(target, "visualGoal") && hasLicenseAndProvenance(target)),
  "Scene manifest must define interior, asset gallery, and interactive visual targets with license/provenance status."
);

check(
  "character-targets",
  asArray(characters.targets).length >= 1 && asArray(characters.targets).every((target) => hasString(target, "visualGoal") && hasLicenseAndProvenance(target)),
  "Character manifest must define animated-character target with license/provenance status."
);

check(
  "visual-target-doc-flagships",
  includesAll(targetsDoc, [
    "Premium Product Configurator",
    "Material Studio Pro",
    "HDR Interior Scene",
    "Complex glTF Asset Review",
    "Animated Character Preview",
    "Interactive Showcase Pro"
  ]),
  "Reference visual targets doc must name all six flagship scenes."
);

check(
  "visual-target-doc-hard-boundary",
  includesAll(targetsDoc, [
    "This document is not visual completion",
    "Generated local fixtures cannot satisfy flagship proof",
    "V4 remains partial progress until `pnpm v4:release` passes"
  ]),
  "Reference visual targets doc must block demo-only or generated-fixture completion claims."
);

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v4-fixture-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 1 fixture and visual target plan is ready. This is not visual completion; it only unlocks HDR/color-management work."
    : "V4 Milestone 1 fixture and visual target plan is incomplete.",
  checkedFiles: requiredFiles,
  counts: {
    flagshipTargets: flagshipTargets.length,
    environmentTargets: asArray(environments.targets).length,
    materialTargets: asArray(materials.materialTargets).length,
    productReferenceCandidates: asArray(products.externalReferenceCandidates).length,
    materialReferenceCandidates: asArray(materials.externalReferenceCandidates).length,
    sceneReferenceCandidates: asArray(scenes.externalReferenceCandidates).length,
    characterReferenceCandidates: asArray(characters.externalReferenceCandidates).length
  },
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
