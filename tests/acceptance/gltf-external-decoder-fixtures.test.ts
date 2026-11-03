import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { GLTFDracoDecoderModule, GLTFMeshoptDecoderModule } from "../../packages/assets/src";
import { validateAcceptanceGate } from "../../tools/native-capability-gate/index.mjs";
import { createExternalCodecFetch, EXTERNAL_CODEC_POLICY_PATH, validateExternalCodecInputs, validateExternalCodecInstalledProject, validateExternalCodecRunContext } from "../../tools/remote-acr/external-codec-contract.mjs";
import { loadCodec } from "../../tools/remote-acr/external-codec-run.mjs";

// This fixed Phase B cell validates its inputs before loading a codec or
// starting any network request.
const gatePath = process.env.AURA3D_CODE_COMPLETE_GATE;
const lockPath = process.env.AURA3D_EXTERNAL_CODEC_LOCK;
const projectPath = process.env.AURA3D_EXTERNAL_CODEC_PROJECT;
const npmPath = process.env.AURA3D_EXTERNAL_CODEC_NPM_INPUTS;
const contextPath = process.env.AURA3D_EXTERNAL_CODEC_CONTEXT;
const runId = process.env.AURA3D_RUN_ID;
if (process.env.AURA3D_SOURCE_PROCESS_GUARD === "1" || !gatePath || !lockPath || !projectPath || !npmPath || !contextPath || !runId ||
    process.env.AURA3D_RUN_NETWORK_ASSET_TESTS !== "1") {
  throw new Error("External codec fixtures require the global code-complete gate and verified inputs");
}
const root = realpathSync(process.cwd());
const readSafe = (path: string, maxBytes: number): Buffer => {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Unsafe external codec input path");
  }
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}${sep}`) || realpathSync(absolute) !== absolute) throw new Error("External codec input escapes its root");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error("External codec input is missing or too large");
  return readFileSync(absolute);
};
const gate = validateAcceptanceGate({ root, gatePath });
const gateSha256 = createHash("sha256").update(readSafe(gatePath, 16 * 1024 * 1024)).digest("hex");
const lock = JSON.parse(readSafe(lockPath, 24 * 1024 * 1024).toString("utf8"));
if (lockPath !== `tests/reports/native-external-codec-inputs/${lock.runId}/lock.json` ||
    process.env.A3D_RELEASE_PLAN !== gate.candidatePlan.path) throw new Error("External codec input or candidate path differs from the gate");
const verified = validateExternalCodecInputs({
  policyBytes: readSafe(EXTERNAL_CODEC_POLICY_PATH, 64 * 1024), gate, gatePath, gateSha256, lock, readBytes: readSafe
});

// A receipt is only a run binding. Revalidate all gated archives and compare
// the actual isolated installation with their bytes before importing anything.
if (contextPath !== `tests/reports/native-external-codec-acceptance/${runId}/candidate-context.json`) throw new Error("External codec candidate context path differs from the run");
const inputs = loadCodec(root, gatePath, lockPath, npmPath, runId);
const preflight = validatePreflightFields(inputs);
const installed = validateExternalCodecInstalledProject({ root, projectPath, project: preflight.project,
  packageLock: preflight.packageLock, archives: preflight.archives, readArchive: readSafe });
validateExternalCodecRunContext({ context: JSON.parse(readSafe(contextPath, 64 * 1024).toString("utf8")), runId,
  gate: inputs.gate, gatePath, gateSha256: preflight.gateSha256, lockPath, lockSha256: preflight.lockSha256,
  npmPath, npmSha256: preflight.npmSha256, ...installed });

// The launcher restores and verifies this project from the gated candidate
// matrix. Resolve runtime modules inside it, never through workspace aliases.
if (!isAbsolute(projectPath) || realpathSync(projectPath) !== resolve(projectPath) ||
    projectPath === root || projectPath.startsWith(`${root}${sep}`)) throw new Error("External codec candidate project is not isolated");
const candidateRequire = createRequire(join(projectPath, "package.json"));
const insideProject = (entry: string): string => {
  const path = realpathSync(entry), rel = relative(projectPath, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Candidate module escaped its isolated project");
  return path;
};
const assetsEntry = insideProject(candidateRequire.resolve("@aura3d/assets"));
const assetsRequire = createRequire(assetsEntry);
const candidateModule = async (entry: string): Promise<Record<string, unknown>> =>
  await import(/* @vite-ignore */ pathToFileURL(insideProject(entry)).href) as Record<string, unknown>;
const originalFetch = globalThis.fetch;
globalThis.fetch = createExternalCodecFetch({ fixtures: verified.fixtures, limits: verified.limits, fetchImpl: originalFetch });
afterAll(() => { globalThis.fetch = originalFetch; });
let assets: Record<string, unknown>, meshoptimizer: Record<string, unknown>, draco3d: Record<string, unknown>;
try {
  assets = await candidateModule(assetsEntry);
  meshoptimizer = await candidateModule(assetsRequire.resolve("meshoptimizer"));
  draco3d = await candidateModule(assetsRequire.resolve("draco3d"));
} catch (error) {
  globalThis.fetch = originalFetch;
  throw error;
}
const { GLTFLoader, LoadContext, createDracoDecoder, createMeshoptDecoder } = assets as unknown as typeof import("../../packages/assets/src");

describe("external glTF decoder fixture acceptance", () => {
  it("loads the Khronos MeshoptCubeTest asset with the real meshoptimizer package", async () => {
    const fixture = verified.fixtures.find(entry => entry.id === "meshopt-cube")!;
    const asset = await new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(resolveMeshoptModule(meshoptimizer)) })
      .load(requestFor(fixture), new LoadContext());
    expect(asset.meshes.length).toBeGreaterThan(0);
    expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
  });

  it("loads the Khronos Duck Draco asset with the real draco3d package", async () => {
    const fixture = verified.fixtures.find(entry => entry.id === "duck-draco")!;
    const asset = await new GLTFLoader({ dracoDecoder: createDracoDecoder(await resolveDracoModule(draco3d)) })
      .load(requestFor(fixture), new LoadContext());
    expect(asset.meshes.length).toBeGreaterThan(0);
    expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
  });
});

function requestFor(fixture: typeof verified.fixtures[number]) {
  return {
    url: fixture.document.url,
    expectedUrl: fixture.document.url,
    credentials: "omit" as const,
    redirect: "error" as const,
    allowedOrigins: ["https://raw.githubusercontent.com"],
    maxBytes: verified.limits.maxResourceBytes,
    integrity: {
      version: 1 as const,
      digest: fixture.document.sha256,
      dependencies: Object.fromEntries(fixture.dependencies.map(entry => [entry.url, entry.sha256])),
      requireDependencies: true
    }
  };
}

function resolveMeshoptModule(module: Record<string, unknown>): GLTFMeshoptDecoderModule {
  const root = isRecord(module.default) ? module.default : module;
  const candidate = isRecord(root.MeshoptDecoder) ? root.MeshoptDecoder : root;
  if (typeof candidate.decodeGltfBuffer !== "function") throw new Error("meshoptimizer package did not expose MeshoptDecoder.decodeGltfBuffer");
  return candidate as unknown as GLTFMeshoptDecoderModule;
}

async function resolveDracoModule(module: Record<string, unknown>): Promise<GLTFDracoDecoderModule> {
  const root = isRecord(module.default) ? module.default : module;
  const factory = root.createDecoderModule;
  if (typeof factory !== "function") throw new Error("draco3d package did not expose createDecoderModule");
  return await factory() as GLTFDracoDecoderModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validatePreflightFields(value: unknown) {
  if (!isRecord(value) || !isRecord(value.project) || typeof value.project.id !== "string" ||
      typeof value.project.projectSha256 !== "string" || !isRecord(value.packageLock) ||
      typeof value.packageLock.lockfileVersion !== "number" || !isRecord(value.packageLock.packages) ||
      !Array.isArray(value.allArchives) || typeof value.gateSha256 !== "string" ||
      typeof value.lockSha256 !== "string" || typeof value.npmSha256 !== "string") {
    throw new Error("External codec preflight did not return a complete candidate inventory");
  }
  const archives = value.allArchives.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.resolved !== "string" || typeof entry.path !== "string") {
      throw new Error("External codec preflight returned an invalid archive reference");
    }
    return { resolved: entry.resolved, path: entry.path };
  });
  return {
    project: { id: value.project.id, projectSha256: value.project.projectSha256 },
    packageLock: { lockfileVersion: value.packageLock.lockfileVersion, packages: value.packageLock.packages },
    archives, gateSha256: value.gateSha256, lockSha256: value.lockSha256, npmSha256: value.npmSha256
  };
}
