import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { type Plugin, type ViteDevServer } from "vite";
import { createServer } from "./native-vite-server";
import { installedAuraPackageAliases } from "./installed-package-resolve";

// Self-authored triangle. This spec is authored in Phase A and executed only after the global
// CODE_COMPLETE_GO gate against a packed, installed candidate, never a workspace source alias.
const vertices = Buffer.from(new Float32Array([-0.8, -0.8, 0, 0.8, -0.8, 0, 0, 0.8, 0]).buffer);
const source = JSON.stringify({
  asset: { version: "2.0" },
  buffers: [{ uri: "triangle.bin", byteLength: vertices.byteLength }],
  bufferViews: [{ buffer: 0, byteLength: vertices.byteLength }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.8, 0], max: [0.8, 0.8, 0] }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.2, 0.1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  nodes: [{ name: "verified-triangle", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
});
const hash = (value: string | Buffer) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const documentHash = hash(source);
const dependencyHash = hash(vertices);
const moduleName = "virtual:aura3d-native-asset-integrity";
const moduleId = `\0${moduleName}`;
const script = `
import { camera, createAuraApp, defineAuraAssets, lights, model, scene } from "@aura3d/engine";
const stage = document.getElementById("stage");
window.runIntegrityProbe = async (variant) => {
  stage.replaceChildren();
  const assets = defineAuraAssets({ triangle: { type: "model", format: "gltf", url: "/wp07/" + variant + "/model.gltf",
    hash: ${JSON.stringify(documentHash)}, integrity: { version: 1, digest: ${JSON.stringify(documentHash)},
      dependencies: { "triangle.bin": ${JSON.stringify(dependencyHash)} }, requireDependencies: true } } });
  const builder = scene({ camera: camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 45 }), background: "#000000" })
    .add(model(assets.triangle, { name: "verified-triangle" }))
    .add(lights.ambient({ intensity: 1 }));
  const app = createAuraApp(stage, { autoStart: false, pixelRatio: 1, resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: builder });
  try {
    await app.ready();
    app.step(1 / 60);
    const diagnostics = app.diagnostics();
    return { status: "ready", backend: diagnostics.renderer?.runtimeBackend, drawCalls: diagnostics.drawCalls, errors: diagnostics.errors };
  } catch (error) {
    return { status: "error", error: String(error), errors: app.diagnostics().errors };
  } finally { await app.disposeAsync(); }
};
`;

function fixturePlugin(): Plugin {
  return {
    name: "native-asset-integrity-fixture",
    resolveId(id) { return id === moduleName ? moduleId : undefined; },
    load(id) { return id === moduleId ? script : undefined; },
    configureServer(server) {
      server.middlewares.use("/wp07-integrity.html", (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><style>#stage{width:128px;height:128px}</style><div id="stage"></div><script type="module" src="/@id/__x00__virtual:aura3d-native-asset-integrity"></script>');
      });
    }
  };
}

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const aliases = installedAuraPackageAliases();
  const engine = aliases.find((entry) => entry.find === "@aura3d/engine");
  if (!engine || realpathSync(engine.replacement).includes("/packages/engine/src/")) throw new Error("Expected the packed root engine entrypoint");
  server = await createServer({ root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin()] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("Candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

test("root model verifies admitted document and dependency bytes before drawing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/wp07/**/model.gltf", (route) => route.fulfill({ contentType: "model/gltf+json",
    body: route.request().url().includes("document-tampered") ? `${source} ` : source }));
  await page.route("**/wp07/**/triangle.bin", (route) => route.fulfill({ contentType: "application/octet-stream",
    body: route.request().url().includes("dependency-tampered") ? Buffer.alloc(vertices.length, 0) : vertices }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}wp07-integrity.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof (window as unknown as { runIntegrityProbe?: unknown }).runIntegrityProbe === "function");
  const probe = async (variant: string) => page.evaluate((value) =>
    (window as unknown as { runIntegrityProbe(value: string): Promise<{ status: string; backend?: string; drawCalls?: number; errors: string[]; error?: string }> }).runIntegrityProbe(value), variant);
  const valid = await probe("valid");
  expect(valid.status, JSON.stringify(valid)).toBe("ready");
  expect(valid.backend).toBe("production-runtime");
  expect(valid.drawCalls).toBeGreaterThan(0);
  expect(valid.errors).toEqual([]);
  for (const variant of ["document-tampered", "dependency-tampered"]) {
    const rejected = await probe(variant);
    expect(rejected.status, JSON.stringify(rejected)).toBe("error");
    expect(`${rejected.error} ${rejected.errors.join(" ")}`).toMatch(/integrity|sha-?256/i);
  }
  expect(errors).toEqual([]);
});
