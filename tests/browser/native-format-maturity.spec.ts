import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { CATALOG_SCENE_FIXTURES } from "../fixtures/native-capabilities/catalog-scenes";

/**
 * Post-CODE_COMPLETE_GO acceptance. The fixture bytes and expectations are
 * independently authored; they are not copies of another renderer's corpus.
 * This test uses the root typed-model path and observes actual WebGL resources
 * and pixels. Listing the tests or type-checking this file is not a receipt.
 */
interface Fixture {
  readonly id: string;
  readonly path: string;
  readonly format: string;
  readonly formatVersion: string;
  readonly mediaType: string;
  readonly dataBase64: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly limits: { readonly maxBytes: number; readonly maxExpandedBytes?: number; readonly maxCompressionRatio?: number };
  readonly dependencies: readonly { readonly uri: string; readonly fixtureId: string }[];
  readonly expected: {
    readonly outcome: "render" | "reject" | "dependency" | "texture-failure";
    readonly errorPattern?: string;
    readonly unsupportedExtension?: string;
    readonly decoder?: "draco" | "meshopt";
    readonly visual?: { readonly textureRGBA?: readonly number[] };
  };
}

interface Manifest {
  readonly schema: string;
  readonly version: number;
  readonly fixtures: readonly Fixture[];
  readonly unverifiedFormats: readonly string[];
}

interface ProbeResult {
  readonly createdApp: boolean;
  readonly userAgent: string;
  readonly error: string | null;
  readonly disposalError: string | null;
  readonly stepAfterDisposeError: string | null;
  readonly diagnostics: {
    readonly backend?: string;
    readonly drawCalls?: number;
    readonly assets?: readonly unknown[];
    readonly errors?: readonly string[];
    readonly warnings?: readonly string[];
    readonly renderer?: unknown;
  } | null;
  readonly pixels: {
    readonly foreground: number;
    readonly red: number;
    readonly width: number;
    readonly height: number;
    readonly bounds: { readonly width: number; readonly height: number };
    readonly lowerRow: number;
    readonly upperRow: number;
    readonly glError: number;
  } | null;
  readonly device: { readonly version: string; readonly renderer: string } | null;
  readonly resourcesBeforeDispose: Readonly<Record<string, number>>;
  readonly resourcesAfterDispose: Readonly<Record<string, number>>;
  readonly image: string | null;
}

const manifest = JSON.parse(readFileSync("tests/fixtures/native-capabilities/manifest.json", "utf8")) as Manifest;
const fixtureById = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
const fixtureByPath = new Map(manifest.fixtures.map((fixture) => [fixture.path, fixture]));
// Additional WP-08 catalog scene formats authored in catalog-scenes.ts; each
// is rendered through createAuraApp + createNativeFormatRegistry like the
// manifest fixtures, with its own digest-bound integrity record.
const catalogFixtures: readonly Fixture[] = CATALOG_SCENE_FIXTURES.map((value) => {
  const data = Buffer.from(value.source, "utf8");
  return {
    id: value.id, path: `/native-conformance/catalog/${value.id}.${value.format}`, format: value.format, formatVersion: "catalog-scene",
    mediaType: value.mediaType, dataBase64: data.toString("base64"), byteLength: data.length,
    sha256: createHash("sha256").update(data).digest("hex"), limits: { maxBytes: 65536 }, dependencies: [],
    expected: { outcome: "render" }
  };
});
for (const value of catalogFixtures) fixtureByPath.set(value.path, value);
const routePrefix = "/native-conformance/";
const requests: string[] = [];
const decoderRequests: string[] = [];
let browserVersion = "unavailable";

function fixture(id: string): Fixture {
  const value = fixtureById.get(id);
  if (!value) throw new Error(`Missing native conformance fixture: ${id}`);
  return value;
}

function bytes(value: Fixture): Buffer {
  const result = Buffer.from(value.dataBase64, "base64");
  if (result.length !== value.byteLength || result.length > value.limits.maxBytes) {
    throw new Error(`${value.id}: fixture byte length or limit is wrong`);
  }
  if (createHash("sha256").update(result).digest("hex") !== value.sha256) {
    throw new Error(`${value.id}: fixture SHA-256 does not match the manifest`);
  }
  return result;
}

test.describe("independent native format maturity", () => {
  test.setTimeout(90_000);
  let server: ExampleDevServer;
  let page: Page;
  const overrides = new Map<string, "missing" | "changed">();

  test.beforeAll(async ({ browser }) => {
    browserVersion = browser.version();
    if (manifest.schema !== "aura3d.native-format-conformance/1" || manifest.version !== 1) {
      throw new Error("Unsupported native conformance manifest version");
    }
    if (fixtureById.size !== manifest.fixtures.length || fixtureByPath.size !== manifest.fixtures.length + catalogFixtures.length) {
      throw new Error("Native conformance fixture IDs and paths must be unique");
    }
    for (const value of manifest.fixtures) {
      if (!value.path.startsWith(routePrefix)) throw new Error(`${value.id}: invalid fixture path`);
      bytes(value);
      for (const dependency of value.dependencies) {
        const resolved = new URL(dependency.uri, `http://fixture.invalid${value.path}`).pathname;
        if (resolved !== fixture(dependency.fixtureId).path) throw new Error(`${value.id}: ${dependency.uri} resolves to the wrong fixture`);
      }
    }

    server = await startExampleDevServer();
    page = await browser.newPage({ viewport: { width: 300, height: 300 } });
    await page.route(`${server.origin}/__native-format-conformance?capture=1`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
    }));
    // The root app's decoder registry loads its vendored codecs from the
    // default /aura-decoders/ base; serve exactly the packaged files.
    await page.route(`${server.origin}/aura-decoders/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const match = /^\/aura-decoders\/(draco|meshopt|basis)\/([\w.-]+)$/.exec(path);
      const file = match ? `packages/assets/vendor/${match[1]}/${match[2]}` : undefined;
      if (!file || !existsSync(file)) {
        await route.fulfill({ status: 404, contentType: "text/plain", body: `missing decoder ${path}` });
        return;
      }
      decoderRequests.push(path);
      const contentType = file.endsWith(".wasm") ? "application/wasm" : "text/javascript";
      await route.fulfill({ status: 200, contentType, headers: { "cache-control": "no-store" }, body: readFileSync(file) });
    });
    await page.route(`${server.origin}${routePrefix}**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      const value = fixtureByPath.get(path);
      if (!value || overrides.get(path) === "missing") {
        await route.fulfill({ status: 404, contentType: "text/plain", body: `missing ${path}` });
        return;
      }
      const body = bytes(value);
      if (overrides.get(path) === "changed") {
        // Change bytes without changing length, keeping the original admitted digest.
        // For binary geometry this changes only the least significant byte of x.
        const offset = value.format === "buffer" ? 0 : Math.max(0, body.length - 8);
        body[offset] ^= 1;
      }
      await route.fulfill({ status: 200, contentType: value.mediaType, headers: { "cache-control": "no-store" }, body });
    });
    await page.goto(`${server.origin}/__native-format-conformance?capture=1`, { waitUntil: "domcontentloaded" });
  });

  test.afterAll(async () => {
    await page?.close();
    await server?.close();
  });

  test.beforeEach(() => {
    requests.length = 0;
    decoderRequests.length = 0;
    overrides.clear();
  });

  test("records the exact unverified format inventory", async ({}, testInfo) => {
    expect(manifest.fixtures.some((value) => value.expected.outcome === "render")).toBe(true);
    expect(manifest.fixtures.some((value) => value.expected.outcome === "reject")).toBe(true);
    expect(manifest.unverifiedFormats.length).toBeGreaterThan(0);
    expect(manifest.fixtures.every((value) => ["render", "reject", "dependency", "texture-failure"].includes(value.expected.outcome))).toBe(true);
    await testInfo.attach("unverified-formats.json", {
      body: Buffer.from(JSON.stringify(manifest.unverifiedFormats, null, 2)),
      contentType: "application/json"
    });
  });

  for (const value of [...manifest.fixtures.filter((entry) => entry.expected.outcome === "render"), ...catalogFixtures]) {
    test(`renders and disposes ${value.id} (${value.formatVersion}) through the root API`, async ({}, testInfo) => {
      const result = await probe(page, server.origin, value);
      await attachProbe(testInfo, value.id, value, result);
      expect(result.error, JSON.stringify(result.diagnostics)).toBeNull();
      expect(requests).toContain(value.path);
      for (const dependency of value.dependencies) expect(requests).toContain(fixture(dependency.fixtureId).path);
      expect(result.diagnostics?.backend).toBe("webgl2");
      expect(result.diagnostics?.errors).toEqual([]);
      expect(result.diagnostics?.drawCalls).toBeGreaterThan(0);
      expect(result.device?.version).toMatch(/WebGL 2/i);
      expect(result.resourcesBeforeDispose.Buffer).toBeGreaterThan(0);
      expect(result.pixels?.glError).toBe(0);
      expect(result.pixels?.foreground).toBeGreaterThan(1000);
      expect(result.pixels?.bounds.width).toBeGreaterThan(70);
      expect(result.pixels?.bounds.height).toBeGreaterThan(70);
      // Triangle is wider toward its lower edge; a random nonblank background,
      // diagnostic overlay or substituted rectangle cannot satisfy this alone.
      expect(result.pixels?.lowerRow).toBeGreaterThan((result.pixels?.upperRow ?? 0) * 1.3);
      if ((value.expected.visual?.textureRGBA?.[0] ?? 0) > 180) {
        expect(result.pixels?.red, "the admitted red texture must contribute visible pixels").toBeGreaterThan(500);
        expect(result.resourcesBeforeDispose.Texture).toBeGreaterThan(0);
      }
      if (value.expected.unsupportedExtension) {
        expect(JSON.stringify(result.diagnostics)).toContain(value.expected.unsupportedExtension);
      }
      // Claimed compressed variants must really go through their codec.
      if (value.expected.decoder) expect(decoderRequests.some((path) => path.startsWith(`/aura-decoders/${value.expected.decoder}/`))).toBe(true);
      expectDisposed(result);
    });
  }

  for (const value of manifest.fixtures.filter((entry) => entry.expected.outcome === "reject")) {
    test(`rejects ${value.id} with its specific diagnostic`, async ({}, testInfo) => {
      expect(value.expected.errorPattern, `${value.id} needs a specific error pattern`).toBeTruthy();
      const result = await probe(page, server.origin, value);
      await attachProbe(testInfo, value.id, value, result);
      expect(requests).toContain(value.path);
      expect(result.error).toMatch(new RegExp(value.expected.errorPattern!, "i"));
      expectDisposed(result);
    });
  }

  test("rejects changed document bytes before rendering", async ({}, testInfo) => {
    const value = fixture("triangle-glb-embedded");
    overrides.set(value.path, "changed");
    const result = await probe(page, server.origin, value);
    await attachProbe(testInfo, "document-integrity", value, result);
    expect(requests).toContain(value.path);
    expect(result.error).toMatch(/(?:sha-?256|digest|integrity|hash).*(?:mismatch|invalid|different)/i);
    expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
    expectDisposed(result);
  });

  test("rejects changed nested dependency bytes before rendering", async ({}, testInfo) => {
    const value = fixture("triangle-gltf-external");
    const geometry = fixture("external-geometry-bin");
    overrides.set(geometry.path, "changed");
    const result = await probe(page, server.origin, value);
    await attachProbe(testInfo, "dependency-integrity", value, result);
    expect(requests).toContain(value.path);
    expect(requests).toContain(geometry.path);
    expect(result.error).toMatch(/(?:sha-?256|digest|integrity|hash).*(?:mismatch|invalid|different)/i);
    expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
    expectDisposed(result);
  });

  test("reports a missing nested texture instead of silently substituting a successful model", async ({}, testInfo) => {
    const value = fixture("triangle-gltf-external");
    const texture = fixture("external-texture-png");
    overrides.set(texture.path, "missing");
    const result = await probe(page, server.origin, value);
    await attachProbe(testInfo, "missing-texture", value, result);
    expect(requests).toContain(texture.path);
    expect(result.error).toMatch(/(?:texture|image|red\.png|404|fetch|load)/i);
    expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
    expectDisposed(result);
  });

  test("rejects changed texture bytes even when the document and geometry are intact", async ({}, testInfo) => {
    const value = fixture("triangle-gltf-external");
    const texture = fixture("external-texture-png");
    overrides.set(texture.path, "changed");
    const result = await probe(page, server.origin, value);
    await attachProbe(testInfo, "texture-integrity", value, result);
    expect(requests).toContain(texture.path);
    expect(result.error).toMatch(/(?:sha-?256|digest|integrity|hash).*(?:mismatch|invalid|different)/i);
    expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
    expectDisposed(result);
  });

  test("reports an unavailable requested model rather than rendering another fixture", async ({}, testInfo) => {
    const value = fixture("triangle-glb-embedded");
    overrides.set(value.path, "missing");
    const result = await probe(page, server.origin, value);
    await attachProbe(testInfo, "missing-model", value, result);
    expect(requests).toContain(value.path);
    expect(result.error).toMatch(/(?:404|fetch|load|request|http)/i);
    expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
    expectDisposed(result);
  });

  for (const value of manifest.fixtures.filter((entry) => entry.expected.outcome === "texture-failure")) {
    test(`strictly rejects the corrupt texture in ${value.id}`, async ({}, testInfo) => {
      const result = await probe(page, server.origin, value);
      await attachProbe(testInfo, value.id, value, result);
      expect(requests).toContain(value.path);
      expect(result.error).toMatch(/(?:texture|image|png|decode|crc)/i);
      expect(result.diagnostics?.drawCalls ?? 0).toBe(0);
      expectDisposed(result);
    });
  }
});

function expectDisposed(result: ProbeResult): void {
  expect(result.disposalError).toBeNull();
  if (result.createdApp) expect(result.stepAfterDisposeError).toMatch(/disposed/i);
  expect(result.resourcesAfterDispose).toEqual(Object.fromEntries(
    Object.keys(result.resourcesAfterDispose).map((kind) => [kind, 0])
  ));
}

async function attachProbe(testInfo: TestInfo, id: string, value: Fixture, result: ProbeResult): Promise<void> {
  const { image, ...evidence } = result;
  await testInfo.attach(`${id}.json`, {
    body: Buffer.from(JSON.stringify({
      scope: "source-root browser path; packed-consumer and physical-device evidence are separate",
      fixture: { id: value.id, format: value.format, version: value.formatVersion, sha256: value.sha256 },
      dependencies: value.dependencies.map((entry) => ({ uri: entry.uri, sha256: fixture(entry.fixtureId).sha256 })),
      requestedPaths: [...requests],
      browserVersion,
      project: testInfo.project.name,
      runnerPlatform: process.platform,
      ...evidence
    }, null, 2)),
    contentType: "application/json"
  });
  if (image?.startsWith("data:image/png;base64,")) {
    await testInfo.attach(`${id}.png`, { body: Buffer.from(image.split(",")[1], "base64"), contentType: "image/png" });
  }
}

async function probe(page: Page, origin: string, value: Fixture): Promise<ProbeResult> {
  const dependencyHashes = Object.fromEntries(value.dependencies.map((entry) => [entry.uri, `sha256-${fixture(entry.fixtureId).sha256}`]));
  return page.evaluate(async (input) => {
    const engine = await import(input.moduleUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.width = "256px";
    canvas.style.height = "256px";
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is unavailable; this is not a format result");

    // Observe the actual device calls; object counters cannot be reduced by
    // merely changing a diagnostic statistic or clearing a JavaScript cache.
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
    const counts = () => Object.fromEntries([...tracked].map(([kind, live]) => [kind, live.size]));
    const debugRenderer = gl.getExtension("WEBGL_debug_renderer_info");
    const device = {
      version: String(gl.getParameter(gl.VERSION)),
      renderer: debugRenderer ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)) : "unavailable"
    };
    let app: ReturnType<typeof engine.createAuraApp> | undefined;
    let error: string | null = null;
    let disposalError: string | null = null;
    let stepAfterDisposeError: string | null = null;
    let diagnostics: ProbeResult["diagnostics"] = null;
    let pixels: ProbeResult["pixels"] = null;
    let image: string | null = null;
    let resourcesBeforeDispose: Record<string, number> = {};
    try {
      // Non-glTF fixtures (OBJ, PLY, STL, 3MF) use the public opt-in native
      // registry; without it the root validator rejects them before loading.
      const importers = await import(input.importersUrl);
      const formatRegistry = importers.createNativeFormatRegistry();
      const assets = engine.defineAuraAssets({
        fixture: {
          type: "model",
          format: input.format,
          url: input.path,
          hash: `sha256-${input.sha256}`,
          integrity: {
            version: 1,
            digest: `sha256-${input.sha256}`,
            dependencies: input.dependencyHashes,
            requireDependencies: true
          },
          metadata: { license: "MIT" }
        }
      });
      app = engine.createAuraApp(canvas, {
        formatRegistry,
        strict: true,
        autoStart: false,
        resize: false,
        pixelRatio: 1,
        quality: "production",
        scene: engine.scene()
          .background("#05070d")
          .camera(engine.camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 45 }))
          .add(engine.model(assets.fixture, { name: "independent-triangle", targetMaxDimension: 2 }).runtime({ id: "independent-triangle" }))
          .add(engine.lights.studio())
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          app.ready(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Timed out awaiting root asset readiness")), 45_000); })
        ]);
      } finally {
        clearTimeout(timeout);
      }
      app.step(1 / 60);
      diagnostics = app.diagnostics();
      const rgba = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      const background = rgba.slice(0, 3);
      let foreground = 0;
      let red = 0;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      let lowerRow = 0;
      let upperRow = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const r = rgba[index]; const g = rgba[index + 1]; const b = rgba[index + 2];
          const delta = Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]);
          if (rgba[index + 3] === 0 || delta <= 24) continue;
          foreground += 1;
          if (r > 40 && r > g * 1.4 && r > b * 1.4) red += 1;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          if (y === Math.floor(canvas.height * 0.4)) lowerRow += 1;
          if (y === Math.floor(canvas.height * 0.6)) upperRow += 1;
        }
      }
      pixels = { foreground, red, width: canvas.width, height: canvas.height,
        bounds: { width: Math.max(0, maxX - minX + 1), height: Math.max(0, maxY - minY + 1) },
        lowerRow, upperRow, glError: gl.getError() };
      image = canvas.toDataURL("image/png");
    } catch (caught) {
      error = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
      diagnostics = app?.diagnostics() ?? null;
    } finally {
      resourcesBeforeDispose = counts();
      try { await app?.disposeAsync(); } catch (caught) { disposalError = String(caught); }
      if (app) {
        try { app.step(1 / 60); } catch (caught) { stepAfterDisposeError = String(caught); }
      }
      canvas.remove();
    }
    return { createdApp: Boolean(app), userAgent: navigator.userAgent, error, disposalError, stepAfterDisposeError, diagnostics, pixels, device,
      resourcesBeforeDispose, resourcesAfterDispose: counts(), image };
  }, {
    moduleUrl: `${origin}/packages/engine/src/public/index.ts`,
    importersUrl: `${origin}/packages/assets/src/importers.ts`,
    path: value.path,
    format: value.format,
    sha256: value.sha256,
    dependencyHashes
  });
}
