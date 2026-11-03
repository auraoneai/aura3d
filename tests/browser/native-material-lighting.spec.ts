import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { retainTemporalFrame } from "./root-temporal-evidence";

type Backend = "webgl2" | "webgpu";
type Capture = { id: string; pixels: number[]; drawCalls: number; lastError: string | null };
type Calibration = { backend: string; adapter: unknown; size: number; captures: Capture[]; lambert: { actual: number[]; expected: number[]; drawCalls: number } };

/**
 * A deliberately small, independently authored calibration scene. Every
 * capture uses the same sphere, camera, direct light and black background;
 * only the named material setting changes. The dark, repeated and zero-film
 * controls keep a changed canvas or unrelated uniform from counting as proof.
 * These tests require real render/readback. They are authored in Phase A and
 * are executed only after the global code-complete gate.
 */
test.describe("native physical material and light calibration", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const backend of ["webgl2", "webgpu"] as const) {
    test(`${backend}: bounded lobes respond inside the lit subject`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await blankCalibrationPage(page, server.origin);
      const result = await renderCalibration(page, backend);
      expect(result.backend).toBe(backend);
      expect(errors).toEqual([]);

      const captures = new Map(result.captures.map((capture) => [capture.id, capture]));
      const get = (id: string): Capture => {
        const capture = captures.get(id);
        if (!capture) throw new Error(`Missing material calibration capture ${id}`);
        expect(capture.drawCalls, id).toBeGreaterThan(0);
        expect(capture.lastError, id).toBeNull();
        expect(capture.pixels).toHaveLength(result.size * result.size * 4);
        return capture;
      };

      const base = get("base");
      const repeated = get("repeated");
      const dark = get("dark");
      const comparisons = {
        repeat: difference(base, repeated, result.size),
        directLight: difference(base, dark, result.size),
        diffuseRoughness: difference(base, get("rough-diffuse"), result.size),
        retroreflection: difference(base, get("retroreflection"), result.size),
        clearcoat: difference(base, get("clearcoat"), result.size),
        sheen: difference(base, get("sheen"), result.size),
        filmThickness: difference(get("film-thin"), get("film-thick"), result.size),
        filmDisabled: difference(get("film-off-thin"), get("film-off-thick"), result.size),
        filmMinimum: difference(get("textured-film-range"), get("textured-film-minimum"), result.size),
        filmMaximum: difference(get("textured-film-range"), get("textured-film-maximum"), result.size),
        filmMinimumDisabled: difference(get("textured-film-off"), get("textured-film-off-minimum"), result.size),
        anisotropyRotation: difference(get("anisotropy-0"), get("anisotropy-90"), result.size),
        isotropicRotation: difference(get("isotropic-0"), get("isotropic-90"), result.size),
        uvTransform: difference(get("textured-srgb"), get("textured-shifted"), result.size),
        unusedUvTransform: difference(get("textured-no-map"), get("textured-no-map-shifted"), result.size),
        normalMap: difference(get("textured-flat-normal"), get("textured-tilted-normal"), result.size)
      };
      const srgbLuma = subjectLuma(get("textured-srgb"), result.size);
      const linearLuma = subjectLuma(get("textured-linear"), result.size);
      const artifacts = result.captures.map((capture) => ({
        id: capture.id,
        ...retainTemporalFrame(testInfo.outputPath(`${backend}-${capture.id}.png`), result.size, result.size,
          capture.pixels, backend === "webgl2" ? "bottom-left" : "top-left")
      }));
      for (const artifact of artifacts) {
        await testInfo.attach(`${backend}-${artifact.id}`, { path: artifact.path, contentType: "image/png" });
      }
      await testInfo.attach(`${backend}-physical-calibration`, {
        body: JSON.stringify({ backend, adapter: result.adapter, comparisons, srgbLuma, linearLuma, lambert: result.lambert, artifacts, errors }, null, 2),
        contentType: "application/json"
      });

      expect(comparisons.repeat.changedSubjectPixels).toBe(0);
      expect(comparisons.directLight.changedSubjectPixels).toBeGreaterThan(500);
      expect(comparisons.directLight.meanSubjectDelta).toBeGreaterThan(5);
      for (const name of ["diffuseRoughness", "retroreflection", "clearcoat", "sheen", "filmThickness", "filmMinimum", "filmMaximum", "anisotropyRotation", "uvTransform", "normalMap"] as const) {
        expect(comparisons[name].changedSubjectPixels, name).toBeGreaterThan(20);
        expect(comparisons[name].meanSubjectDelta, name).toBeGreaterThan(0.02);
        expect(comparisons[name].changedBackgroundPixels, name).toBe(0);
      }
      expect(comparisons.filmDisabled.changedSubjectPixels).toBe(0);
      expect(comparisons.filmMinimumDisabled.changedSubjectPixels).toBe(0);
      expect(comparisons.isotropicRotation.changedSubjectPixels).toBe(0);
      expect(comparisons.unusedUvTransform.changedSubjectPixels).toBe(0);
      expect(srgbLuma).toBeLessThan(linearLuma * 0.95);
      // Normal incidence, zero specular reflectance and an untextured diffuse
      // card reduce to Lout = albedo * incidentRadiance / pi. The probe-face
      // path is linear, so its RGBA8 readback needs no tone-map inversion.
      expect(result.lambert.drawCalls).toBeGreaterThan(0);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs(result.lambert.actual[channel]! - result.lambert.expected[channel]!), `Lambert channel ${channel}`).toBeLessThanOrEqual(3);
      }
    });
  }
});

async function blankCalibrationPage(page: Page, origin: string): Promise<void> {
  await page.route("**/native-wp04-material-calibration.html", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>"
  }));
  await page.goto(`${origin}/native-wp04-material-calibration.html`);
}

async function renderCalibration(page: Page, backend: Backend): Promise<Calibration> {
  return page.evaluate(async (requestedBackend) => {
    // Variable module URLs are served and TypeScript-transpiled by the shared
    // source dev server; the test uses actual Aura3D classes, not a mock GPU.
    // The public rendering entry imports its lane providers. Loading those
    // before the individual classes reproduces the public registration path,
    // avoiding the renderer's explicit legacy-program fallback.
    const lanePath = "/packages/rendering/src/lanes/index.ts";
    await import(lanePath);
    const paths = ["/packages/rendering/src/Renderer.ts", "/packages/rendering/src/Geometry.ts",
      "/packages/rendering/src/PBRMaterial.ts", "/packages/scene/src/Scene.ts",
      "/packages/rendering/src/TexturedPBRMaterial.ts", "/packages/rendering/src/Texture.ts",
      "/packages/rendering/src/ExtensionScalarAtlas.ts"];
    const [rendererModule, geometryModule, materialModule, sceneModule, texturedModule, textureModule, atlasModule] = await Promise.all(paths.map((path) => import(path)));
    const { Renderer } = rendererModule;
    const { Geometry } = geometryModule;
    const { PBRMaterial } = materialModule;
    const { Scene } = sceneModule;
    const { TexturedPBRMaterial } = texturedModule;
    const { Texture } = textureModule;
    const { createExtensionScalarAtlas } = atlasModule;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    document.body.appendChild(canvas);
    const renderer = await Renderer.create({ backend: requestedBackend, canvas, width: size, height: size,
      clearColor: [0, 0, 0, 1], preserveDrawingBuffer: true, antialias: false });
    const device = renderer.device;
    const target = device.createRenderTarget({ width: size, height: size, format: "rgba8", label: "native-material-calibration" });
    const sphere = Geometry.uvSphere(0.78, 48, 24, { textured: true });
    const scene = new Scene();
    const light = scene.createLight("directional", "calibration-key");
    light.intensity = 1.3;
    scene.root.addChild(light);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const projection = new Float32Array(identity); projection[10] = -1;
    const noEnvironment = { skyColor: [0, 0, 0], horizonColor: [0, 0, 0], groundColor: [0, 0, 0],
      specularColor: [0, 0, 0], intensity: 0, specularIntensity: 0 };
    const base = { baseColor: [0.55, 0.4, 0.25, 1], metallic: 0, roughness: 0.5, environmentIntensity: 0,
      proceduralEnvironmentMap: noEnvironment, renderState: { cullMode: "none" } };
    const variants: Array<[string, Record<string, unknown>]> = [
      ["base", {}], ["repeated", {}], ["dark", {}],
      ["rough-diffuse", { diffuseRoughness: 1 }], ["retroreflection", { retroreflection: 1 }],
      ["clearcoat", { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.1 }],
      ["sheen", { sheenColorFactor: [0.8, 0.3, 0.2], sheenRoughnessFactor: 0.4 }],
      ["film-thin", { iridescenceFactor: 1, iridescenceIor: 1.5, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 120 }],
      ["film-thick", { iridescenceFactor: 1, iridescenceIor: 1.5, iridescenceThicknessMinimum: 600, iridescenceThicknessMaximum: 600 }],
      ["film-off-thin", { iridescenceFactor: 0, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 120 }],
      ["film-off-thick", { iridescenceFactor: 0, iridescenceThicknessMinimum: 600, iridescenceThicknessMaximum: 600 }],
      ["anisotropy-0", { metallic: 1, anisotropyStrength: 0.9, anisotropyRotation: 0 }],
      ["anisotropy-90", { metallic: 1, anisotropyStrength: 0.9, anisotropyRotation: Math.PI / 2 }],
      ["isotropic-0", { metallic: 1, anisotropyStrength: 0, anisotropyRotation: 0 }],
      ["isotropic-90", { metallic: 1, anisotropyStrength: 0, anisotropyRotation: Math.PI / 2 }]
    ];
    const colorBytes = new Uint8Array(8 * 8 * 4);
    const flatNormalBytes = new Uint8Array(8 * 8 * 4);
    const tiltedNormalBytes = new Uint8Array(8 * 8 * 4);
    const thicknessBytes = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
      const offset = (y * 8 + x) * 4;
      colorBytes.set([60 + x * 20, 70 + x * 18, 75 + x * 15, 255], offset);
      flatNormalBytes.set([128, 128, 255, 255], offset);
      tiltedNormalBytes.set([200, 128, 233, 255], offset);
      thicknessBytes.set([0, 128, 0, 255], offset);
    }
    const scalarAtlas = createExtensionScalarAtlas({ iridescenceThickness: { width: 8, height: 8, data: thicknessBytes } });
    const textures = [
      new Texture({ width: 8, height: 8, colorSpace: "srgb", data: colorBytes }),
      new Texture({ width: 8, height: 8, colorSpace: "linear", data: colorBytes }),
      new Texture({ width: 8, height: 8, colorSpace: "linear", data: flatNormalBytes }),
      new Texture({ width: 8, height: 8, colorSpace: "linear", data: tiltedNormalBytes }),
      new Texture({ width: 8, height: 8, colorSpace: "linear", data: thicknessBytes }),
      scalarAtlas.texture
    ];
    const filmRange = { metallic: 1, roughness: 0.2, iridescenceFactor: 1, iridescenceIor: 1.5,
      iridescenceThicknessMinimum: 80, iridescenceThicknessMaximum: 480,
      iridescenceThicknessTexture: textures[4], extensionScalarAtlas: scalarAtlas };
    variants.push(
      ["textured-srgb", { baseColorTexture: textures[0] }],
      ["textured-linear", { baseColorTexture: textures[1] }],
      ["textured-shifted", { baseColorTexture: textures[0], baseColorTextureTransform: { offset: [0.25, 0] } }],
      ["textured-no-map", {}],
      ["textured-no-map-shifted", { baseColorTextureTransform: { offset: [0.25, 0] } }],
      ["textured-flat-normal", { normalTexture: textures[2] }],
      ["textured-tilted-normal", { normalTexture: textures[3] }],
      ["textured-film-range", filmRange],
      ["textured-film-minimum", { ...filmRange, iridescenceThicknessMinimum: 280 }],
      ["textured-film-maximum", { ...filmRange, iridescenceThicknessMaximum: 680 }],
      ["textured-film-off", { ...filmRange, iridescenceFactor: 0 }],
      ["textured-film-off-minimum", { ...filmRange, iridescenceFactor: 0, iridescenceThicknessMinimum: 280 }]
    );
    const captures: Capture[] = [];
    try {
      for (const [id, changes] of variants) {
        light.intensity = id === "dark" ? 0 : 1.3;
        const Constructor = id.startsWith("textured-") ? TexturedPBRMaterial : PBRMaterial;
        const material = new Constructor({ ...base, ...changes });
        try {
          const diagnostics = renderer.render({ scene, renderItems: [{ geometry: sphere, material, modelMatrix: identity,
            modelViewProjectionMatrix: projection, label: "calibration-sphere" }], renderTarget: target,
            cameraPosition: [0, 0, 3], cameraPolicy: "identity", environmentLighting: false, frustumCulling: false });
          device.setRenderTarget(target);
          const pixels = device.readPixelsAsync
            ? await device.readPixelsAsync(0, 0, size, size)
            : device.readPixels(0, 0, size, size);
          captures.push({ id, pixels: Array.from(pixels), drawCalls: diagnostics.drawCalls, lastError: diagnostics.lastError ?? null });
        } finally { material.dispose(); }
      }
      const triangle = Geometry.litTriangle();
      const lambertMaterial = new PBRMaterial({ ...base, baseColor: [0.5, 0.25, 0.125, 1], roughness: 0,
        diffuseRoughness: 0, retroreflection: 0, specularFactor: 0 });
      try {
        light.intensity = 0.5;
        const diagnostics = renderer.renderProbeFace({ scene, renderItems: [{ geometry: triangle, material: lambertMaterial,
          modelMatrix: identity, modelViewProjectionMatrix: projection, label: "lambert-reference" }], environmentLighting: false },
        0, target, projection);
        device.setRenderTarget(target);
        const sample = device.readPixelsAsync
          ? await device.readPixelsAsync(size / 2, size / 2, 1, 1)
          : device.readPixels(size / 2, size / 2, 1, 1);
        const lambert = { actual: Array.from(sample as Uint8Array), expected: [0.5, 0.25, 0.125].map((color) => Math.round(255 * color * 0.5 / Math.PI)),
          drawCalls: diagnostics.drawCalls };
        return { backend: device.kind, adapter: device.info, size, captures, lambert };
      } finally { lambertMaterial.dispose(); triangle.dispose(); }
    } finally { for (const texture of textures) texture.dispose(); sphere.dispose(); target.dispose(); scene.dispose(); renderer.dispose(); canvas.remove(); }
  }, backend);
}

function subjectLuma(capture: Capture, size: number): number {
  let sum = 0, count = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2)) >= 0.72) continue;
    const offset = (y * size + x) * 4;
    sum += 0.2126 * capture.pixels[offset]! + 0.7152 * capture.pixels[offset + 1]! + 0.0722 * capture.pixels[offset + 2]!;
    count += 1;
  }
  return sum / count;
}

/** Region is inset from the sphere edge, so antialiasing is not evidence. */
function difference(a: Capture, b: Capture, size: number): {
  changedSubjectPixels: number; changedBackgroundPixels: number; meanSubjectDelta: number;
} {
  let changedSubjectPixels = 0, changedBackgroundPixels = 0, total = 0, subjectPixels = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const offset = (y * size + x) * 4;
    const delta = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(a.pixels[offset + channel]! - b.pixels[offset + channel]!), 0);
    const radius = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2));
    if (radius < 0.72) {
      subjectPixels += 1; total += delta;
      if (delta > 3) changedSubjectPixels += 1;
    } else if (radius > 0.88 && delta > 3) changedBackgroundPixels += 1;
  }
  return { changedSubjectPixels, changedBackgroundPixels, meanSubjectDelta: total / (subjectPixels * 3) };
}
