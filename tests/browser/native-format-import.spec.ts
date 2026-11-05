import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { type Plugin } from "vite";
import { createServer } from "./native-vite-server";
import { installedAuraPackageAliases } from "./installed-package-resolve";

/**
 * Phase B only: the packed public asset/importer and rendering entries supply
 * explicitly installed adapters, render resources, and a WebGL2 frame. This
 * does not establish root-model, native-GPU, or physical-device support.
 */
const moduleName = "virtual:aura3d-native-format-import";
const moduleId = `\0${moduleName}`;
const modulePath = `/@id/__x00__${moduleName}`;
const moduleSource = `
export * as assets from "@aura3d/assets/browser";
export * as importers from "@aura3d/assets/importers";
export * as rendering from "@aura3d/rendering";
`;

interface FormatDevServer {
  readonly origin: string;
  readonly packageEntries: Readonly<Record<string, string>>;
  close(): Promise<void>;
}

async function startPackedFormatServer(): Promise<FormatDevServer> {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the validated packed candidate consumer");
  const candidateRoot = realpathSync(resolve(root));
  const aliases = installedAuraPackageAliases();
  const entries = new Map(aliases.map((entry) => [entry.find, entry.replacement]));
  const candidateEntry = (name: string): string => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Packed candidate lacks the requested export: ${name}`);
    const actual = realpathSync(entry);
    if (!actual.startsWith(`${candidateRoot}${sep}`)) throw new Error(`Packed export resolves outside its candidate consumer: ${name}`);
    return actual;
  };
  for (const alias of aliases) candidateEntry(alias.find);
  const packageEntries = Object.fromEntries(["@aura3d/assets/browser", "@aura3d/assets/importers", "@aura3d/rendering"]
    .map((name) => [name, relative(candidateRoot, candidateEntry(name)).replaceAll("\\", "/")]));
  const plugin: Plugin = {
    name: "native-format-import-packed-fixture",
    enforce: "pre",
    resolveId(id) {
      if (id === moduleName) return moduleId;
      if (id.startsWith("@aura3d/")) return candidateEntry(id);
      return undefined;
    },
    load(id) { return id === moduleId ? moduleSource : undefined; }
  };
  const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "error",
    resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), candidateRoot] } },
    plugins: [plugin]
  });
  try {
    await vite.listen(0);
    const address = vite.resolvedUrls?.local[0];
    if (!address) throw new Error("The packed format test server has no local origin");
    return { origin: new URL(address).origin, packageEntries, close: () => vite.close() };
  } catch (error) {
    await vite.close();
    throw error;
  }
}

interface Fixture {
  readonly id: string;
  readonly path: string;
  readonly format: string;
  readonly formatVersion: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly dataBase64: string;
  readonly sha256: string;
  readonly limits: { readonly maxBytes: number; readonly maxExpandedBytes?: number; readonly maxCompressionRatio?: number };
  readonly expected: {
    readonly outcome: "render" | "reject" | string;
    readonly positions?: readonly (readonly number[])[];
    readonly indices?: readonly number[];
    readonly bounds?: { readonly min: readonly number[]; readonly max: readonly number[] };
    readonly errorPattern?: string;
  };
}

interface Manifest {
  readonly schema: string;
  readonly version: number;
  readonly fixtures: readonly Fixture[];
}

const manifest = JSON.parse(readFileSync("tests/fixtures/native-capabilities/manifest.json", "utf8")) as Manifest;
const fixtureById = new Map(manifest.fixtures.map((value) => [value.id, value]));
const rendered = [
  "triangle-obj",
  "triangle-ply-ascii",
  "triangle-ply-le",
  "triangle-ply-be",
  "triangle-stl-ascii",
  "triangle-stl-binary",
  "triangle-3mf-stored"
] as const;
const rejected = ["ply-truncated", "stl-truncated", "3mf-expansion-limit"] as const;

// Independently authored in this spec; intercepted same-origin URLs make both
// the OBJ document and its relative MTL dependency observable and hashable.
const panelsObj = `mtllib materials/panels.mtl
o panels
v -0.875 -0.75 0
v -0.125 -0.75 0
v -0.5 0.75 0
v 0.125 -0.75 0
v 0.875 -0.75 0
v 0.5 0.75 0
vn 0 0 1
usemtl red
f -6//1 -5//1 -4//1
usemtl green
f -3//1 -2//1 -1//1
`;
const panelsMtl = `newmtl red
Kd 1 0 0
newmtl green
Kd 0 1 0
`;
const panelsObjDigest = "45d6922ed93ded44f483d4dd25d1d6442b1d3056a800d0a0a18755a906c01c74";
const panelsMtlDigest = "d1249e8f26df705e11ce8d27c8460d9f200cf18fea66421aeb3555c131c3f837";

function fixture(id: string): Fixture {
  const value = fixtureById.get(id);
  if (!value) throw new Error(`Missing required format fixture ${id}`);
  return value;
}

function fixtureBytes(value: Fixture): Buffer {
  const bytes = Buffer.from(value.dataBase64, "base64");
  if (bytes.length !== value.byteLength || bytes.length > value.limits.maxBytes) {
    throw new Error(`${value.id}: byte length exceeds the admitted fixture record`);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== value.sha256) {
    throw new Error(`${value.id}: fixture digest differs from the admitted record`);
  }
  return bytes;
}

interface RequestRecord { readonly path: string; readonly marker: string | undefined }

async function prepare(page: Page, server: FormatDevServer, value: Fixture): Promise<RequestRecord[]> {
  const requests: RequestRecord[] = [];
  await page.route(`${server.origin}/__native-format-import`, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
  }));
  await page.route(`${server.origin}/native-conformance/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push({ path, marker: route.request().headers()["x-aura-format-test"] });
    if (path !== value.path) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Unknown fixture" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: value.mediaType,
      headers: { "cache-control": "no-store" },
      body: fixtureBytes(value)
    });
  });
  await page.goto(`${server.origin}/__native-format-import`, { waitUntil: "domcontentloaded" });
  return requests;
}

interface ProbeOptions {
  readonly expectFailure?: boolean;
  readonly omitAdapters?: boolean;
  readonly digest?: string;
}

async function probe(page: Page, origin: string, value: Fixture, options: ProbeOptions = {}) {
  return page.evaluate(async (input) => {
    // All three namespaces are resolved from the same packed candidate.
    const { assets, importers, rendering } = await import(input.moduleUrl) as {
      assets: typeof import("../../packages/assets/src/browser-index");
      importers: typeof import("../../packages/assets/src/importers");
      rendering: typeof import("../../packages/rendering/src/index");
    };
    const registry = assets.createDefaultFormatRegistry();
    if (!input.omitAdapters) {
      registry.register(assets.createGLTFFormatAdapter("obj", ["obj"], new assets.OBJLoader()));
      registry.register(assets.createGLTFFormatAdapter("ply", ["ply"], new importers.PLYLoader()));
      registry.register(assets.createGLTFFormatAdapter("stl", ["stl"], new importers.STLLoader()));
      registry.register(assets.createGLTFFormatAdapter("model3mf", ["3mf"], new importers.Model3MFLoader({
        maxArchiveBytes: 65_536,
        maxExpandedBytes: 4096,
        maxCompressionRatio: 100
      })));
    }

    let imported: Awaited<ReturnType<typeof assets.loadRenderableAsset>>;
    try {
      imported = await assets.loadRenderableAsset(input.url, {
        format: input.format,
        formatRegistry: registry,
        headers: { "x-aura-format-test": "admitted-fixture" },
        integrity: { version: 1, digest: `sha256-${input.digest}` }
      });
    } catch (error) {
      if (!input.expectFailure) throw error;
      return { status: "rejected" as const, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
    if (input.expectFailure) {
      await imported.dispose?.();
      return { status: "unexpected-success" as const, selectedFormat: imported.selectedFormat };
    }

    const lease = imported.format;
    if (!lease || !imported.dispose) {
      await imported.dispose?.();
      throw new Error("The selected import has no disposable public format lease");
    }
    const decoded = lease.asset as import("../../packages/assets/src/GLTFLoader").GLTFAsset;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      await imported.dispose();
      canvas.remove();
      throw new Error("WebGL2 unavailable; format rendering is unverified");
    }

    const tracked = new Map<string, Set<unknown>>();
    const api = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const kind of ["Buffer", "Texture", "Framebuffer", "Renderbuffer", "VertexArray", "Program", "Shader"]) {
      const create = api[`create${kind}`].bind(gl);
      const remove = api[`delete${kind}`].bind(gl);
      const live = new Set<unknown>();
      tracked.set(kind, live);
      api[`create${kind}`] = (...args) => {
        const object = create(...args);
        if (object) live.add(object);
        return object;
      };
      api[`delete${kind}`] = (...args) => {
        live.delete(args[0]);
        return remove(...args);
      };
    }
    const counts = () => Object.fromEntries([...tracked].map(([kind, objects]) => [kind, objects.size]));
    let renderer: import("../../packages/rendering/src/Renderer").Renderer | undefined;
    try {
      const resources = await lease.createGLTFRenderResources();
      renderer = await rendering.Renderer.create({ backend: "webgl2", canvas, width: 128, height: 128, antialias: false, clearColor: [0, 0, 0, 1] });
      const frame = renderer.render(resources.toRenderSource({
        qualityPreset: "default",
        cameraPolicy: "identity",
        environmentLighting: { color: [1, 1, 1], intensity: 0.75 },
        shadow: false,
        postprocess: false
      }));
      const rgba = renderer.device.readPixels(0, 0, 128, 128);
      const isSubject = (x: number, y: number) => {
        const index = (y * 128 + x) * 4;
        return rgba[index + 3] > 0 && rgba[index] + rgba[index + 1] + rgba[index + 2] > 48;
      };
      let foreground = 0;
      let lowerRow = 0;
      let upperRow = 0;
      for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
        if (!isSubject(x, y)) continue;
        foreground += 1;
        if (y === 32) lowerRow += 1;
        if (y === 96) upperRow += 1;
      }
      const mesh = decoded.meshes[0];
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const evidence = {
        status: "rendered" as const,
        kind: imported.kind,
        selectedFormat: imported.selectedFormat,
        url: imported.url,
        meshCount: decoded.meshes.length,
        topology: mesh?.topology,
        positions: mesh?.positions,
        indices: mesh?.indices,
        bounds: resources.bounds,
        renderables: resources.scene.collectRenderables().length,
        drawCalls: frame.drawCalls,
        pixels: { foreground, lowerRow, upperRow, topLeft: isSubject(4, 120), topCenter: isSubject(64, 96), bottomCenter: isSubject(64, 32) },
        glError: gl.getError(),
        liveBeforeDispose: counts(),
        image: canvas.toDataURL("image/png"),
        browser: navigator.userAgent,
        graphics: {
          version: String(gl.getParameter(gl.VERSION)),
          renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable"
        }
      };
      await imported.dispose();
      await imported.dispose();
      let postDisposeError = "";
      try { await lease.createGLTFRenderResources(); } catch (error) { postDisposeError = String(error); }
      renderer.dispose();
      return { ...evidence, leaseDisposed: lease.disposed, assetDisposed: decoded.disposed, postDisposeError, liveAfterDispose: counts() };
    } finally {
      try { await imported.dispose(); } finally { renderer?.dispose(); canvas.remove(); }
    }
  }, {
    moduleUrl: `${origin}${modulePath}`,
    url: `${origin}${value.path}`,
    format: value.format,
    digest: options.digest ?? value.sha256,
    expectFailure: options.expectFailure ?? false,
    omitAdapters: options.omitAdapters ?? false
  });
}

async function attach(testInfo: TestInfo, value: Fixture, result: unknown, requests: readonly RequestRecord[], browserVersion: string, packageEntries: Readonly<Record<string, string>>): Promise<void> {
  const image = (result as { image?: string }).image;
  const evidence = { ...(result as Record<string, unknown>), image: undefined };
  await testInfo.attach(`${value.id}.json`, {
    body: Buffer.from(JSON.stringify({
      scope: "packed public assets/importers and rendering entries; WebGL2",
      fixture: { id: value.id, version: value.formatVersion, sha256: value.sha256 },
      packageEntries,
      project: testInfo.project.name,
      browserVersion,
      runnerPlatform: process.platform,
      requests,
      ...evidence
    }, null, 2)),
    contentType: "application/json"
  });
  if (image?.startsWith("data:image/png;base64,")) {
    await testInfo.attach(`${value.id}.png`, { body: Buffer.from(image.slice("data:image/png;base64,".length), "base64"), contentType: "image/png" });
  }
}

test.describe("native format imports through public adapters", () => {
  test.setTimeout(90_000);
  let server: FormatDevServer;

  test.beforeAll(async () => {
    if (manifest.schema !== "aura3d.native-format-conformance/1" || manifest.version !== 1) throw new Error("Unexpected fixture manifest version");
    if (fixtureById.size !== manifest.fixtures.length) throw new Error("Duplicate fixture IDs");
    for (const id of [...rendered, ...rejected]) fixtureBytes(fixture(id));
    server = await startPackedFormatServer();
  });

  test.afterAll(async () => { await server?.close(); });

  for (const id of rendered) {
    test(`imports and renders ${id} with the selected adapter`, async ({ page, browser }, testInfo) => {
      const value = fixture(id);
      expect(value.expected.outcome).toBe("render");
      expect(value.expected.positions).toBeDefined();
      expect(value.expected.indices).toBeDefined();
      expect(value.expected.bounds).toBeDefined();
      const requests = await prepare(page, server, value);
      const result = await probe(page, server.origin, value);
      await attach(testInfo, value, result, requests, browser.version(), server.packageEntries);
      expect(result.status).toBe("rendered");
      if (result.status !== "rendered") throw new Error(`Expected a rendered asset, got ${result.status}`);
      expect(requests).toContainEqual({ path: value.path, marker: "admitted-fixture" });
      expect(requests.every((request) => request.path === value.path)).toBe(true);
      expect(result.kind).toBe("native-format");
      expect(result.selectedFormat).toBe(value.format === "3mf" ? "model3mf" : value.format);
      expect(result.url).toBe(`${server.origin}${value.path}`);
      expect(result.meshCount).toBe(1);
      expect(result.topology).toBe("triangles");
      expect(result.positions).toEqual(value.expected.positions);
      expect(result.indices).toEqual(value.expected.indices);
      expect(result.bounds).toEqual(value.expected.bounds);
      expect(result.renderables).toBe(1);
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.graphics.version).toMatch(/WebGL 2/i);
      expect(result.glError).toBe(0);
      // An upward triangle has a broad lower row, a narrower upper row, and
      // background in the upper corner. A clear or substituted box fails.
      expect(result.pixels.foreground).toBeGreaterThan(3000);
      expect(result.pixels.lowerRow).toBeGreaterThan(result.pixels.upperRow * 1.5);
      expect(result.pixels.upperRow).toBeGreaterThan(10);
      expect(result.pixels.topLeft).toBe(false);
      expect(result.pixels.topCenter).toBe(true);
      expect(result.pixels.bottomCenter).toBe(true);
      expect(result.liveBeforeDispose.Buffer).toBeGreaterThan(0);
      expect(result.liveBeforeDispose.Program).toBeGreaterThan(0);
      expect(result.leaseDisposed).toBe(true);
      expect(result.assetDisposed).toBe(true);
      expect(result.postDisposeError).toMatch(/disposed/i);
      expect(Object.values(result.liveAfterDispose)).toEqual(Object.values(result.liveAfterDispose).map(() => 0));
    });
  }

  for (const id of rejected) {
    test(`rejects ${id} before creating render resources`, async ({ page, browser }, testInfo) => {
      const value = fixture(id);
      expect(value.expected.outcome).toBe("reject");
      expect(value.expected.errorPattern).toBeTruthy();
      const requests = await prepare(page, server, value);
      const result = await probe(page, server.origin, value, { expectFailure: true });
      await attach(testInfo, value, result, requests, browser.version(), server.packageEntries);
      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error(`Expected rejection, got ${result.status}`);
      expect(result.error).toMatch(new RegExp(value.expected.errorPattern!, "i"));
      expect(requests).toContainEqual({ path: value.path, marker: "admitted-fixture" });
    });
  }

  test("requires explicit adapter installation", async ({ page, browser }, testInfo) => {
    const value = fixture("triangle-ply-ascii");
    const requests = await prepare(page, server, value);
    const result = await probe(page, server.origin, value, { expectFailure: true, omitAdapters: true });
    await attach(testInfo, value, result, requests, browser.version(), server.packageEntries);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error(`Expected rejection, got ${result.status}`);
    expect(result.error).toMatch(/no native format adapter/i);
    expect(requests).toEqual([]);
  });

  test("rejects a digest mismatch instead of substituting another model", async ({ page, browser }, testInfo) => {
    const value = fixture("triangle-ply-le");
    const requests = await prepare(page, server, value);
    const result = await probe(page, server.origin, value, { expectFailure: true, digest: "0".repeat(64) });
    await attach(testInfo, value, result, requests, browser.version(), server.packageEntries);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error(`Expected rejection, got ${result.status}`);
    expect(result.error).toMatch(/integrity|digest|sha-?256/i);
    expect(requests).toContainEqual({ path: value.path, marker: "admitted-fixture" });
    expect(requests.every((request) => request.path === value.path)).toBe(true);
  });

  test("resolves, verifies and renders a relative OBJ material library", async ({ page, browser }, testInfo) => {
    expect({ bytes: Buffer.byteLength(panelsObj), sha256: createHash("sha256").update(panelsObj).digest("hex") }).toEqual({ bytes: 203, sha256: panelsObjDigest });
    expect({ bytes: Buffer.byteLength(panelsMtl), sha256: createHash("sha256").update(panelsMtl).digest("hex") }).toEqual({ bytes: 42, sha256: panelsMtlDigest });
    const objPath = "/native-format-panels/scene.obj";
    const mtlPath = "/native-format-panels/materials/panels.mtl";
    const requests: RequestRecord[] = [];
    let corruptDependency = false;
    await page.route(`${server.origin}/__native-format-panels`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
    await page.route(`${server.origin}/native-format-panels/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push({ path, marker: route.request().headers()["x-aura-format-test"] });
      if (path !== objPath && path !== mtlPath) {
        await route.fulfill({ status: 404, body: "Unknown dependency" });
        return;
      }
      const body = path === objPath ? panelsObj : corruptDependency ? panelsMtl.replace("Kd 1 0 0", "Kd 0 0 1") : panelsMtl;
      await route.fulfill({ status: 200, contentType: "text/plain", headers: { "cache-control": "no-store" }, body });
    });
    await page.goto(`${server.origin}/__native-format-panels`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (input) => {
      const { assets, rendering } = await import(input.moduleUrl) as {
        assets: typeof import("../../packages/assets/src/browser-index");
        rendering: typeof import("../../packages/rendering/src/index");
      };
      const registry = assets.createDefaultFormatRegistry();
      registry.register(assets.createGLTFFormatAdapter("obj", ["obj"], new assets.OBJLoader()));
      const imported = await assets.loadRenderableAsset(input.url, {
        format: "obj",
        formatRegistry: registry,
        headers: { "x-aura-format-test": "admitted-fixture" },
        integrity: {
          version: 1,
          digest: `sha256-${input.objDigest}`,
          dependencies: { "materials/panels.mtl": `sha256-${input.mtlDigest}` },
          requireDependencies: true
        }
      });
      const lease = imported.format;
      if (!lease || !imported.dispose) {
        await imported.dispose?.();
        throw new Error("OBJ import did not provide a disposable format lease");
      }
      const decoded = lease.asset as import("../../packages/assets/src/GLTFLoader").GLTFAsset;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      document.body.append(canvas);
      const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
      if (!gl) { await imported.dispose(); canvas.remove(); throw new Error("WebGL2 unavailable; material rendering is unverified"); }
      let renderer: import("../../packages/rendering/src/Renderer").Renderer | undefined;
      try {
        const resources = await lease.createGLTFRenderResources();
        renderer = await rendering.Renderer.create({ backend: "webgl2", canvas, width: 128, height: 128, antialias: false, clearColor: [0, 0, 0, 1] });
        const frame = renderer.render(resources.toRenderSource({
          qualityPreset: "default", cameraPolicy: "identity", environmentLighting: { color: [1, 1, 1], intensity: 0.75 }, shadow: false, postprocess: false
        }));
        const rgba = renderer.device.readPixels(0, 0, 128, 128);
        const counts = { redLeft: 0, redRight: 0, greenLeft: 0, greenRight: 0 };
        for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
          const offset = (y * 128 + x) * 4;
          const [red, green, blue] = rgba.slice(offset, offset + 3);
          if (red > 40 && red > green * 1.4 && red > blue * 1.4) counts[x < 64 ? "redLeft" : "redRight"] += 1;
          if (green > 40 && green > red * 1.4 && green > blue * 1.4) counts[x < 64 ? "greenLeft" : "greenRight"] += 1;
        }
        const evidence = {
          selectedFormat: imported.selectedFormat,
          materialNames: decoded.materials.map((material) => material.name),
          colors: decoded.materials.map((material) => material.baseColorFactor),
          indices: decoded.meshes.map((mesh) => mesh.indices),
          features: decoded.loaderDiagnostics.features,
          bounds: resources.bounds,
          renderables: resources.scene.collectRenderables().length,
          drawCalls: frame.drawCalls,
          counts,
          glError: gl.getError(),
          graphicsVersion: String(gl.getParameter(gl.VERSION)),
          userAgent: navigator.userAgent,
          image: canvas.toDataURL("image/png")
        };
        await imported.dispose();
        return { ...evidence, disposed: lease.disposed && decoded.disposed };
      } finally {
        try { await imported.dispose(); } finally { renderer?.dispose(); canvas.remove(); }
      }
    }, {
      moduleUrl: `${server.origin}${modulePath}`,
      url: `${server.origin}${objPath}`,
      objDigest: panelsObjDigest,
      mtlDigest: panelsMtlDigest
    });
    await testInfo.attach("obj-materials.json", { body: Buffer.from(JSON.stringify({ ...result, image: undefined, requests, objSha256: panelsObjDigest, mtlSha256: panelsMtlDigest, browserVersion: browser.version(), project: testInfo.project.name, packageEntries: server.packageEntries }, null, 2)), contentType: "application/json" });
    await testInfo.attach("obj-materials.png", { body: Buffer.from(result.image.slice("data:image/png;base64,".length), "base64"), contentType: "image/png" });
    expect(result.selectedFormat).toBe("obj");
    expect(result.materialNames).toEqual(["red", "green"]);
    expect(result.colors).toEqual([[1, 0, 0, 1], [0, 1, 0, 1]]);
    expect(result.indices).toEqual([[0, 1, 2], [3, 4, 5]]);
    expect(result.features).toContain("obj-multi-material");
    expect(result.bounds).toEqual({ min: [-0.875, -0.75, 0], max: [0.875, 0.75, 0] });
    expect(result.renderables).toBe(2);
    expect(result.drawCalls).toBeGreaterThanOrEqual(2);
    expect(result.graphicsVersion).toMatch(/WebGL 2/i);
    expect(result.glError).toBe(0);
    expect(result.counts.redLeft).toBeGreaterThan(500);
    expect(result.counts.greenRight).toBeGreaterThan(500);
    expect(result.counts.redRight).toBe(0);
    expect(result.counts.greenLeft).toBe(0);
    expect(result.disposed).toBe(true);
    expect(requests).toEqual([
      { path: objPath, marker: "admitted-fixture" },
      { path: mtlPath, marker: "admitted-fixture" }
    ]);
    // Return different dependency bytes under the same URL and original digest.
    // A strict load must fail before a replacement material can be rendered.
    requests.length = 0;
    corruptDependency = true;
    const error = await page.evaluate(async (input) => {
      const { assets } = await import(input.moduleUrl) as { assets: typeof import("../../packages/assets/src/browser-index") };
      const registry = assets.createDefaultFormatRegistry();
      registry.register(assets.createGLTFFormatAdapter("obj", ["obj"], new assets.OBJLoader()));
      let imported: Awaited<ReturnType<typeof assets.loadRenderableAsset>>;
      try {
        imported = await assets.loadRenderableAsset(input.url, {
          format: "obj", formatRegistry: registry, headers: { "x-aura-format-test": "admitted-fixture" },
          integrity: { version: 1, digest: `sha256-${input.objDigest}`, dependencies: { "materials/panels.mtl": `sha256-${input.mtlDigest}` }, requireDependencies: true }
        });
      } catch (caught) { return caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught); }
      await imported.dispose?.();
      return "unexpected-success";
    }, { moduleUrl: `${server.origin}${modulePath}`, url: `${server.origin}${objPath}`, objDigest: panelsObjDigest, mtlDigest: panelsMtlDigest });
    await testInfo.attach("obj-material-integrity-rejection.json", { body: Buffer.from(JSON.stringify({ error, requests, mtlSha256: panelsMtlDigest, packageEntries: server.packageEntries }, null, 2)), contentType: "application/json" });
    expect(error).toMatch(/integrity|digest|sha-?256/i);
    expect(requests).toEqual([
      { path: objPath, marker: "admitted-fixture" },
      { path: mtlPath, marker: "admitted-fixture" }
    ]);
  });
});
