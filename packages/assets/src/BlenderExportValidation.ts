import { GLTFLoader, type GLTFAsset } from "./GLTFLoader";
import { LoadContext } from "./LoadContext";

export type BlenderExportValidationStatus = "pass" | "warn" | "fail";

export interface BlenderExportFixtureManifest {
  readonly schemaVersion: "blender-export-fixtures-v1";
  readonly sourceName: string;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly sourceReadme: string;
  readonly sourceEvidence: string;
  readonly fixtures: readonly BlenderExportFixture[];
}

export interface BlenderExportFixture {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly upstreamPath: string;
  readonly sourceSha256: string;
  readonly license: string;
  readonly expectedGeneratorPattern: string;
  readonly tags: readonly string[];
}

export interface BlenderExportFixtureInput extends BlenderExportFixture {
  readonly sourceText: string;
}

export interface BlenderExportValidationReport {
  readonly schemaVersion: "blender-export-validation-v1";
  readonly generatedAt: string;
  readonly sourceManifest: Omit<BlenderExportFixtureManifest, "fixtures"> & { readonly fixtureCount: number };
  readonly summary: Record<BlenderExportValidationStatus, number> & { readonly fixtureCount: number };
  readonly fixtures: readonly BlenderExportValidationFixtureResult[];
}

export interface BlenderExportValidationFixtureResult {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly upstreamPath: string;
  readonly sourceSha256: string;
  readonly license: string;
  readonly tags: readonly string[];
  readonly generator: string;
  readonly status: BlenderExportValidationStatus;
  readonly metrics: {
    readonly scenes: number;
    readonly meshes: number;
    readonly materials: number;
    readonly textures: number;
    readonly images: number;
    readonly animations: number;
    readonly renderables: number;
  };
  readonly diagnostics: readonly BlenderExportValidationDiagnostic[];
}

export interface BlenderExportValidationDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly nextAction: string;
}

export async function createBlenderExportValidationReport(
  manifest: BlenderExportFixtureManifest,
  fixtureInputs: readonly BlenderExportFixtureInput[],
  generatedAt = new Date().toISOString()
): Promise<BlenderExportValidationReport> {
  assertValidBlenderExportFixtureManifest(manifest);
  const inputById = new Map(fixtureInputs.map((fixture) => [fixture.id, fixture]));
  const fixtures = await Promise.all(manifest.fixtures.map(async (fixture) => validateFixture(fixture, inputById.get(fixture.id))));
  return {
    schemaVersion: "blender-export-validation-v1",
    generatedAt,
    sourceManifest: {
      schemaVersion: manifest.schemaVersion,
      sourceName: manifest.sourceName,
      sourceRepository: manifest.sourceRepository,
      sourceRevision: manifest.sourceRevision,
      sourceReadme: manifest.sourceReadme,
      sourceEvidence: manifest.sourceEvidence,
      fixtureCount: manifest.fixtures.length
    },
    summary: {
      fixtureCount: fixtures.length,
      pass: fixtures.filter((fixture) => fixture.status === "pass").length,
      warn: fixtures.filter((fixture) => fixture.status === "warn").length,
      fail: fixtures.filter((fixture) => fixture.status === "fail").length
    },
    fixtures
  };
}

export function assertValidBlenderExportFixtureManifest(manifest: BlenderExportFixtureManifest): BlenderExportFixtureManifest {
  if (manifest.schemaVersion !== "blender-export-fixtures-v1") {
    throw new Error("Blender export fixture manifest schemaVersion must be blender-export-fixtures-v1");
  }
  if (!manifest.sourceRepository || !/^https:\/\/github\.com\/KhronosGroup\/Vulkan-Samples-Assets/.test(manifest.sourceRepository)) {
    throw new Error("Blender export fixture manifest must reference KhronosGroup/Vulkan-Samples-Assets");
  }
  if (!/^[0-9a-f]{40}$/i.test(manifest.sourceRevision)) {
    throw new Error("Blender export fixture manifest sourceRevision must be a git SHA");
  }
  if (manifest.fixtures.length < 2) {
    throw new Error("Blender export validation requires multiple fixtures");
  }
  const ids = new Set<string>();
  for (const fixture of manifest.fixtures) {
    if (ids.has(fixture.id)) {
      throw new Error(`Blender export fixture id is duplicated: ${fixture.id}`);
    }
    ids.add(fixture.id);
    if (!fixture.path.endsWith(".gltf") && !fixture.path.endsWith(".glb")) {
      throw new Error(`Blender export fixture ${fixture.id} must be a glTF or GLB file`);
    }
    if (!/^[0-9a-f]{64}$/i.test(fixture.sourceSha256)) {
      throw new Error(`Blender export fixture ${fixture.id} sourceSha256 must be a SHA-256 digest`);
    }
    if (!fixture.expectedGeneratorPattern) {
      throw new Error(`Blender export fixture ${fixture.id} must define expectedGeneratorPattern`);
    }
  }
  return manifest;
}

async function validateFixture(
  fixture: BlenderExportFixture,
  input: BlenderExportFixtureInput | undefined
): Promise<BlenderExportValidationFixtureResult> {
  if (!input) {
    return failureFixture(fixture, "ASSET_BLENDER_EXPORT_SOURCE_MISSING", "Fixture source text was not provided to the validation runner.");
  }
  try {
    const json = JSON.parse(input.sourceText) as { readonly asset?: { readonly generator?: string } };
    const generator = json.asset?.generator ?? "";
    const diagnostics: BlenderExportValidationDiagnostic[] = [];
    if (!new RegExp(fixture.expectedGeneratorPattern, "i").test(generator)) {
      diagnostics.push({
        code: "ASSET_BLENDER_EXPORT_GENERATOR_MISMATCH",
        severity: "error",
        message: `Expected generator matching ${fixture.expectedGeneratorPattern}, got ${generator || "missing"}.`,
        nextAction: "Replace the fixture with a confirmed Blender-exported glTF file or update the manifest evidence."
      });
    }
    const asset = await new GLTFLoader().load({ url: dataGLTF(input.sourceText) }, new LoadContext());
    return resultForAsset(fixture, asset, generator, diagnostics);
  } catch (error) {
    return failureFixture(fixture, "ASSET_BLENDER_EXPORT_LOAD_FAILED", error instanceof Error ? error.message : String(error));
  }
}

function resultForAsset(
  fixture: BlenderExportFixture,
  asset: GLTFAsset,
  generator: string,
  diagnostics: readonly BlenderExportValidationDiagnostic[]
): BlenderExportValidationFixtureResult {
  const renderables = asset.createScene().collectRenderables().length;
  const status = diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : diagnostics.length > 0 ? "warn" : "pass";
  return {
    id: fixture.id,
    name: fixture.name,
    path: fixture.path,
    upstreamPath: fixture.upstreamPath,
    sourceSha256: fixture.sourceSha256,
    license: fixture.license,
    tags: fixture.tags,
    generator,
    status,
    metrics: {
      scenes: asset.scenes.length,
      meshes: asset.meshes.length,
      materials: asset.materials.length,
      textures: asset.textures.length,
      images: asset.images.length,
      animations: asset.animations.length,
      renderables
    },
    diagnostics: diagnostics.length > 0 ? diagnostics : [{
      code: "ASSET_BLENDER_EXPORT_VALIDATED",
      severity: "info",
      message: "Fixture was confirmed as Blender-exported glTF and loaded through Aura3D's glTF loader.",
      nextAction: "Keep this fixture current when changing loader validation, importer settings, or fixture source revision."
    }]
  };
}

function failureFixture(
  fixture: BlenderExportFixture,
  code: string,
  message: string
): BlenderExportValidationFixtureResult {
  return {
    id: fixture.id,
    name: fixture.name,
    path: fixture.path,
    upstreamPath: fixture.upstreamPath,
    sourceSha256: fixture.sourceSha256,
    license: fixture.license,
    tags: fixture.tags,
    generator: "",
    status: "fail",
    metrics: {
      scenes: 0,
      meshes: 0,
      materials: 0,
      textures: 0,
      images: 0,
      animations: 0,
      renderables: 0
    },
    diagnostics: [{
      code,
      severity: "error",
      message,
      nextAction: "Fix or replace this Blender-export fixture before marking Blender-export validation complete."
    }]
  };
}

function dataGLTF(source: string): string {
  return `data:model/gltf+json,${encodeURIComponent(source)}`;
}
