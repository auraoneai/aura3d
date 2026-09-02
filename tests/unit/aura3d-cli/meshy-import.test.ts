import { existsSync, mkdirSync, mkdtempSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, importMeshyAsset, readAssetManifest, validateAssets } from "../../../packages/aura3d-cli/src/index.js";
import { MAX_MESHY_GLB_BYTES } from "../../../packages/aura3d-cli/src/meshy/validation.js";
import { MAX_MESHY_METADATA_BYTES, readMeshyMetadata } from "../../../packages/aura3d-cli/src/meshy/metadata.js";

describe("Aura3D Meshy ingestion", () => {
  test("rejects inputs outside the allowed root and ambiguous GLBs", () => {
    const project = createProject();
    const run = createRun(project, "ambiguous");
    writeFileSync(join(run, "other.glb"), validGlb());
    expect(() => importRun(project, "../outside", "escape")).toThrow(/escapes the allowed root/);
    expect(() => importRun(project, "ambiguous", "ambiguous")).toThrow(/multiple GLBs.*--file/);
    const selected = importRun(project, "ambiguous", "selected", { file: "model.glb" });
    expect(selected.typedKey).toBe("assets.selected");
  });

  test("rejects invalid and oversized GLBs before manifest mutation", () => {
    const project = createProject();
    const invalid = createRun(project, "invalid");
    writeFileSync(join(invalid, "model.glb"), Buffer.from("not-a-glb-but-long-enough"));
    writeFileSync(join(invalid, "thumbnail.png"), validPng());
    expect(() => importRun(project, "invalid", "invalidModel")).toThrow(/invalid magic bytes/);
    expect(existsSync(join(project, "aura.assets.json"))).toBe(false);
    expect(existsSync(join(project, "public", "aura-assets"))).toBe(false);

    const oversized = createRun(project, "oversized");
    truncateSync(join(oversized, "model.glb"), MAX_MESHY_GLB_BYTES + 1);
    expect(() => importRun(project, "oversized", "oversizedModel")).toThrow(/GLB exceeds/);
    expect(existsSync(join(project, "aura.assets.json"))).toBe(false);
  });

  test("rejects malformed, oversized, and credential-bearing metadata", () => {
    const project = createProject();
    const run = createRun(project, "metadata");
    const metadataPath = join(run, "meta.json");
    writeFileSync(metadataPath, "{broken");
    expect(() => importRun(project, "metadata", "brokenMetadata")).toThrow(/not valid JSON/);

    writeFileSync(metadataPath, JSON.stringify({ apiKey: "synthetic-secret-value" }));
    expect(() => importRun(project, "metadata", "secretMetadata")).toThrow(/forbidden credential field/);

    writeFileSync(metadataPath, " ".repeat(MAX_MESHY_METADATA_BYTES + 1));
    expect(() => importRun(project, "metadata", "largeMetadata")).toThrow(/metadata exceeds/);
  });

  test("strips signed URL query strings and hashes prompts", () => {
    const project = createProject();
    const run = createRun(project, "sanitize", {
      prompt: "confidential product prompt",
      settings: {
        artifactUrl: "https://cdn.example.test/model.glb?X-Amz-Signature=secret&X-Amz-Credential=temp",
        mode: "refine"
      }
    });
    const metadata = readMeshyMetadata(join(run, "meta.json"));
    expect(metadata.promptHash).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(JSON.stringify(metadata)).not.toContain("confidential product prompt");
    expect(metadata.settings).toMatchObject({ artifactUrl: "https://cdn.example.test/model.glb", mode: "refine" });
    expect(JSON.stringify(metadata)).not.toMatch(/X-Amz-|Signature=|Credential=/i);
  });

  test("normalizes official CLI epoch-millisecond task timestamps", () => {
    const project = createProject();
    const run = createRun(project, "official-cli", {
      task: {
        id: "task-official-refine",
        type: "text-to-3d-refine",
        created_at: 1_788_382_436_266,
        finished_at: 1_788_382_565_561,
        consumed_credits: 10,
        prompt: "official CLI shape"
      }
    });
    const metadata = readMeshyMetadata(join(run, "meta.json"));
    expect(metadata).toMatchObject({
      taskId: "task-official-refine",
      operation: "text-to-3d-refine",
      createdAt: "2026-09-02T20:53:56.266Z",
      finishedAt: "2026-09-02T20:56:05.561Z",
      consumedCredits: 10
    });
  });

  test("rejects direct release certification", () => {
    const project = createProject();
    createRun(project, "release");
    expect(() => importMeshyAsset({
      projectDir: project,
      input: "artifacts/meshy/release",
      name: "releaseAttempt",
      rightsEvidence: "artifacts/meshy/release/rights.json",
      quality: "release"
    })).toThrow(/cannot certify release quality/);
    expect(existsSync(join(project, "aura.assets.json"))).toBe(false);
  });

  test("retains a local thumbnail as candidate evidence without signed URLs", () => {
    const project = createProject();
    const run = createRun(project, "thumbnail", {
      settings: { thumbnailUrl: "https://cdn.example.test/thumb.png?X-Amz-Signature=temporary" }
    });
    writeFileSync(join(run, "thumbnail.png"), validPng());
    const result = importRun(project, "thumbnail", "meshyThumbnail", { role: "prop" });
    const asset = readAssetManifest(project).assets.find((entry) => entry.id === "meshyThumbnail");
    expect(result.thumbnailEvidence).toMatch(/^public\/aura-assets\/meshyThumbnail\.meshy-candidate\.[a-f0-9]{8}\.png$/);
    expect(existsSync(join(project, result.thumbnailEvidence!))).toBe(true);
    expect(asset?.renderedProbe).toMatchObject({ kind: "manual-inspection", url: expect.stringMatching(/^\/aura-assets\/meshyThumbnail\.meshy-candidate/) });
    expect(asset?.provenance?.evidence).toContain(result.thumbnailEvidence);
    expect(result.admission.checks).toContainEqual(expect.objectContaining({ id: "rendered-candidate-evidence", verdict: "pass" }));
    expect(readFileSync(join(project, "aura.assets.json"), "utf8")).not.toMatch(/X-Amz-|Signature=temporary/);
  });

  test("maps explicit paid-generation rights evidence and passes require-license validation", () => {
    const project = createProject();
    const run = createRun(project, "licensed");
    writeFileSync(join(run, "rights.json"), JSON.stringify({
      provider: "meshy",
      licenseName: "Meshy paid private generation terms",
      termsUrl: "https://www.meshy.ai/terms?utm_source=pilot",
      rightsBasis: "Generated under the paid private plan; commercial-use rights recorded by the importing team.",
      recordedAt: "2026-09-02T10:06:00.000Z"
    }));

    importRun(project, "licensed", "licensedRelic", { role: "prop" });
    const asset = readAssetManifest(project).assets.find((entry) => entry.id === "licensedRelic");
    expect(asset?.provenance).toMatchObject({
      license: "Meshy paid private generation terms",
      licenseName: "Meshy paid private generation terms",
      licenseUrl: "https://www.meshy.ai/terms?utm_source=pilot",
      licenseRaw: "Generated under the paid private plan; commercial-use rights recorded by the importing team."
    });
    expect(asset?.provenance?.license).not.toMatch(/CC0|CC-BY|SPDX/i);
    const validation = validateAssets({ projectDir: project, assetIds: ["licensedRelic"], requireLicense: true });
    expect(validation.ok, validation.failures.join("\n")).toBe(true);
  });

  test("rejects invalid present rights fields while allowing absent license fields", () => {
    const project = createProject();
    const run = createRun(project, "rights-fields");
    expect(() => importRun(project, "rights-fields", "noInventedLicense")).not.toThrow();
    expect(readAssetManifest(project).assets.find((entry) => entry.id === "noInventedLicense")?.provenance?.license).toBeUndefined();
    expect(validateAssets({ projectDir: project, assetIds: ["noInventedLicense"], requireLicense: true }).ok).toBe(false);

    writeFileSync(join(run, "rights.json"), JSON.stringify({ licenseName: "Meshy enterprise generation terms", licenseUrl: "https://example.test/enterprise-terms", licenseRaw: "Enterprise account grants the recorded generation rights." }));
    importRun(project, "rights-fields", "aliasRights");
    expect(readAssetManifest(project).assets.find((entry) => entry.id === "aliasRights")?.provenance).toMatchObject({
      licenseName: "Meshy enterprise generation terms",
      licenseUrl: "https://example.test/enterprise-terms",
      licenseRaw: "Enterprise account grants the recorded generation rights."
    });

    writeFileSync(join(run, "rights.json"), JSON.stringify({ licenseName: "Meshy paid terms", termsUrl: "http://example.test/terms" }));
    expect(() => importRun(project, "rights-fields", "badRightsUrl")).toThrow(/must be an HTTPS URL/);

    writeFileSync(join(run, "rights.json"), JSON.stringify({ licenseName: "   ", licenseUrl: "https://example.test/terms" }));
    expect(() => importRun(project, "rights-fields", "emptyRightsName")).toThrow(/licenseName must be a non-empty string/);
  });

  test("imports through addAsset, preserves existing assets and source files, and emits durable provenance", () => {
    const project = createProject();
    mkdirSync(join(project, "assets"), { recursive: true });
    writeFileSync(join(project, "assets", "existing.navmesh"), "existing-navigation");
    addAsset({ projectDir: project, file: "assets/existing.navmesh", name: "existingNavigation" });
    const run = createRun(project, "success", {
      providerCli: "@meshy-ai/cli@0.2.0",
      taskId: "task-refine-123",
      parentTaskIds: ["task-preview-122"],
      operation: "text-to-3d-refine",
      prompt: "a game prop",
      model: "meshy-model-v1",
      settings: { topology: "quad", artifactUrl: "https://cdn.example.test/model.glb?signature=temporary" },
      createdAt: "2026-09-02T10:00:00.000Z",
      finishedAt: "2026-09-02T10:05:00.000Z",
      consumedCredits: 10
    });
    const sourceBefore = readFileSync(join(run, "model.glb"));

    const result = importRun(project, "success", "meshyRelic", { role: "prop" });
    const manifest = readAssetManifest(project);
    const asset = manifest.assets.find((entry) => entry.id === "meshyRelic");
    expect(manifest.assets.map((entry) => entry.id)).toEqual(["existingNavigation", "meshyRelic"]);
    expect(asset).toMatchObject({ quality: "candidate", role: "prop", provenance: { sourceFamily: "meshy" } });
    expect(asset?.provenance?.generation).toMatchObject({
      provider: "meshy",
      providerCli: "@meshy-ai/cli@0.2.0",
      taskId: "task-refine-123",
      parentTaskIds: ["task-preview-122"],
      operation: "text-to-3d-refine",
      model: "meshy-model-v1",
      consumedCredits: 10,
      localMetadata: expect.stringMatching(/^aura-evidence\/meshy\/meshyRelic\.metadata\.[a-f0-9]{12}\.json$/),
      rightsEvidence: expect.stringMatching(/^aura-evidence\/meshy\/meshyRelic\.rights\.[a-f0-9]{12}\.json$/)
    });
    const generation = asset?.provenance?.generation;
    expect(generation?.localMetadata && existsSync(join(project, generation.localMetadata))).toBe(true);
    expect(generation?.rightsEvidence && existsSync(join(project, generation.rightsEvidence))).toBe(true);
    const retainedMetadata = readFileSync(join(project, generation!.localMetadata), "utf8");
    const retainedRights = readFileSync(join(project, generation!.rightsEvidence), "utf8");
    expect(retainedMetadata).not.toMatch(/signature=temporary|a game prop|apiKey|accessToken/i);
    expect(retainedMetadata).toContain("https://cdn.example.test/model.glb");
    expect(retainedRights).toContain("aura3d.meshy-rights/1.0");
    const durable = readFileSync(join(project, "aura.assets.json"), "utf8");
    expect(durable).not.toMatch(/signature=temporary|confidential|apiKey|accessToken/i);
    expect(durable).toContain("https://cdn.example.test/model.glb");
    expect(result.typedKey).toBe("assets.meshyRelic");
    expect(result.nextCommands).toEqual(expect.arrayContaining([
      expect.stringContaining("assets validate --asset meshyRelic"),
      expect.stringContaining("--release --require-license")
    ]));
    const generated = readFileSync(join(project, "src", "aura-assets.ts"), "utf8");
    expect(generated).toContain('"meshyRelic"');
    expect(generated).not.toContain("task-refine-123");
    expect(generated).not.toContain("consumedCredits");
    expect(readFileSync(join(run, "model.glb"))).toEqual(sourceBefore);
    expect(existsSync(join(run, "meta.json"))).toBe(true);
    expect(existsSync(join(run, "rights.json"))).toBe(true);
  });
});

function createProject(): string {
  const project = mkdtempSync(join(tmpdir(), "aura3d-meshy-"));
  mkdirSync(join(project, "artifacts", "meshy"), { recursive: true });
  return project;
}

function createRun(project: string, name: string, metadata: Record<string, unknown> = {}): string {
  const run = join(project, "artifacts", "meshy", name);
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "model.glb"), validGlb());
  writeFileSync(join(run, "meta.json"), JSON.stringify({ taskId: `task-${name}`, operation: "text-to-3d", ...metadata }));
  writeFileSync(join(run, "rights.json"), JSON.stringify({ provider: "meshy", termsPlan: "paid-private-generation", recordedAt: "2026-09-02T10:06:00.000Z" }));
  return run;
}

function importRun(project: string, run: string, name: string, extra: { file?: string; role?: "prop" } = {}) {
  return importMeshyAsset({
    projectDir: project,
    input: `artifacts/meshy/${run}`,
    name,
    rightsEvidence: `artifacts/meshy/${run}/rights.json`,
    ...extra
  });
}

function validPng(): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(1, 16);
  bytes.writeUInt32BE(1, 20);
  return bytes;
}

function validGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] }));
  const padding = (4 - (json.length % 4)) % 4;
  const chunk = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const buffer = Buffer.alloc(20 + chunk.length);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(chunk.length, 12);
  buffer.write("JSON", 16, "ascii");
  chunk.copy(buffer, 20);
  return buffer;
}
