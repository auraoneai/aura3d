import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Phase B browser evidence: the generators and atlas feed the public custom
 * geometry path, and a pointer activation applies a real mesh modifier. The
 * captures come from the renderer; geometry counts alone are not render proof.
 */
test("renders generated meshes and applies a curve deformation on interaction", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  const server = await startExampleDevServer();
  try {
    // The origin root mounts an unrelated example app. Start from a blank
    // same-origin document so that app cannot affect pixels or diagnostics.
    await page.goto(`${server.origin}/tests/browser/rendering-webgpu-harness.html`, { waitUntil: "domcontentloaded" });
    const initial = await page.evaluate(async (origin) => {
      // These are the package entrypoints: a private-only implementation must
      // not satisfy the public browser contract.
      const rendering = await import(`${origin}/packages/rendering/src/index.ts`);
      const engine = await import(`${origin}/packages/engine/src/public/index.ts`);
      const geometryTools = await import(`${origin}/packages/engine/src/public/geometry-tools.ts`);
      const { parametricGeometry, loftGeometry, teapotGeometry } = rendering;
      const { camera, createAuraApp, geometry, lights, material, scene } = engine;
      const { buildUVAtlas, deformAuraMeshAlongCurve } = geometryTools;
      for (const [name, value] of Object.entries({ parametricGeometry, loftGeometry, teapotGeometry, buildUVAtlas, deformAuraMeshAlongCurve })) {
        if (typeof value !== "function") throw new Error(`Missing public geometry export ${name}`);
      }

      const surface = parametricGeometry({
        surface: (u: number, v: number) => [2 * u - 1, 2 * v - 1, 0],
        uSegments: 8,
        vSegments: 8
      });
      // Deliberately omit the authored channel: atlas generation must not
      // silently replace a caller's existing UV coordinates.
      const source = geometry.define({ positions: surface.positions, normals: surface.normals, indices: surface.indices });
      const atlas = buildUVAtlas(source, { destination: "uvs", width: 128, height: 128, texelDensity: 24, gutter: 4 });
      const loft = loftGeometry({
        profile: [[-0.45, -0.4], [0.45, -0.4], [0.45, 0.4], [-0.45, 0.4]],
        path: [[-0.25, -0.9, 0], [0, 0, 0], [0.35, 0.9, 0]],
        closed: true,
        capStart: true,
        capEnd: true
      });
      const teapot = teapotGeometry({ size: 1, segments: 8 });

      document.body.replaceChildren();
      const runButton = document.createElement("button");
      runButton.type = "button";
      runButton.textContent = "Bend generated surface";
      runButton.id = "bend-surface";
      document.body.append(runButton);
      const figures = document.createElement("div");
      figures.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      document.body.append(figures);
      const apps: ReturnType<typeof createAuraApp>[] = [];
      const captured: Record<string, { pixels: Uint8ClampedArray; stats: PixelStats; png: string }> = {};
      const state = {
        status: "booting" as "booting" | "ready" | "changed" | "error",
        error: "",
        changedPixels: 0,
        afterVisible: 0,
        modifierDiagnostics: [] as string[],
        afterPng: "",
        dispose: () => apps.forEach((app) => app.dispose())
      };
      (window as unknown as { __NATIVE_GEOMETRY_TOOLS__: typeof state }).__NATIVE_GEOMETRY_TOOLS__ = state;
      const uvMaterial = material.custom({
        glsl: {
          vertex: `out vec2 geometryUv;
void main() { geometryUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
          fragment: `in vec2 geometryUv; out vec4 outColor;
void main() { outColor = vec4(0.15 + 0.7 * geometryUv.x, 0.15 + 0.7 * geometryUv.y, 0.3, 1.0); }`
        },
        side: "double"
      });

      async function capture(app: ReturnType<typeof createAuraApp>) {
        app.step(1 / 60);
        if (!app.capture) throw new Error("Renderer capture is unavailable");
        const image = await app.capture({ type: "image-bitmap" }) as ImageBitmap;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("2D context is unavailable for renderer readback");
        context.drawImage(image, 0, 0);
        image.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return { pixels, stats: pixelStats(pixels), png: canvas.toDataURL("image/png") };
      }

      function pixelStats(pixels: Uint8ClampedArray): PixelStats {
        let visible = 0;
        let minRed = 255, maxRed = 0, minGreen = 255, maxGreen = 0;
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
          if (r + g + b <= 30) continue;
          visible += 1;
          minRed = Math.min(minRed, r); maxRed = Math.max(maxRed, r);
          minGreen = Math.min(minGreen, g); maxGreen = Math.max(maxGreen, g);
          colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
        return { visible, redSpan: maxRed - minRed, greenSpan: maxGreen - minGreen, colorBuckets: colors.size };
      }

      async function mount(name: string, mesh: typeof atlas.geometry, isUv: boolean, eye: [number, number, number]) {
        const figure = document.createElement("figure");
        figure.style.margin = "0";
        const caption = document.createElement("figcaption");
        caption.textContent = name;
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        canvas.dataset.testid = name;
        figure.append(caption, canvas);
        figures.append(figure);
        const spec = geometry.dynamic({
          positions: mesh.positions,
          normals: mesh.normals,
          uvs: mesh.uvs,
          indices: mesh.indices,
          groups: mesh.groups
        });
        const stage = scene().background("#000000")
          .camera(camera.perspective({ position: eye, target: [0, 0, 0], fov: 42 }))
          .add(lights.studio({ intensity: 1.5 }))
          .add(geometry.custom(spec, {
            material: isUv ? uvMaterial : material.pbr({ color: "#59c9ea", roughness: 0.4, doubleSided: true })
          }).runtime({ id: `${name}-mesh` }));
        const app = createAuraApp(canvas, { scene: stage, autoStart: false, resize: false, pixelRatio: 1 });
        apps.push(app);
        await app.ready();
        // A bounded wait allows asynchronous shader compilation on software
        // WebGL, while still failing if no draw is submitted.
        for (let attempt = 0; attempt < 100 && (app.diagnostics().drawCalls ?? 0) === 0; attempt += 1) {
          app.step(1 / 60);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        captured[name] = await capture(app);
        return app;
      }

      const surfaceApp = await mount("atlas-surface", atlas.geometry, true, [0, 0, 5]);
      const loftApp = await mount("loft", loft, false, [2.5, 1.8, 5]);
      const teapotApp = await mount("teapot", teapot, false, [3, 2, 5]);
      state.status = "ready";
      runButton.addEventListener("click", () => {
        void (async () => {
          try {
            const result = deformAuraMeshAlongCurve(atlas.geometry, {
              axis: "x",
              curve: {
                getPoint: (t: number) => [2 * t - 1, 0.65 * Math.sin(Math.PI * t), 0],
                getTangent: (t: number) => [2, 0.65 * Math.PI * Math.cos(Math.PI * t), 0]
              }
            });
            const handle = surfaceApp.nodes.require("atlas-surface-mesh");
            if (!handle.setGeometry) throw new Error("Runtime geometry replacement is unavailable");
            handle.setGeometry(result.geometry);
            const after = await capture(surfaceApp);
            const before = captured["atlas-surface"]!.pixels;
            for (let i = 0; i < before.length; i += 4) {
              if (Math.abs(before[i]! - after.pixels[i]!) + Math.abs(before[i + 1]! - after.pixels[i + 1]!) + Math.abs(before[i + 2]! - after.pixels[i + 2]!) > 12) state.changedPixels += 1;
            }
            state.modifierDiagnostics = result.diagnostics.map((diagnostic: { code: string }) => diagnostic.code);
            state.afterVisible = after.stats.visible;
            state.afterPng = after.png;
            state.status = "changed";
          } catch (error) {
            state.error = error instanceof Error ? error.stack ?? error.message : String(error);
            state.status = "error";
          }
        })();
      }, { once: true });

      const uv = Array.from(atlas.geometry.uvs as ArrayLike<number>);
      return {
        atlas: {
          charts: atlas.charts.length,
          seams: atlas.seams.length,
          remappedVertices: atlas.vertexRemap.length,
          remappedIndices: atlas.indexRemap.length,
          vertices: atlas.geometry.positions.length / 3,
          indices: atlas.geometry.indices.length,
          uvCount: uv.length,
          minUv: Math.min(...uv),
          maxUv: Math.max(...uv),
          gutter: atlas.gutter
        },
        surface: { ...captured["atlas-surface"]!.stats, png: captured["atlas-surface"]!.png, drawCalls: surfaceApp.diagnostics().drawCalls, errors: surfaceApp.diagnostics().errors },
        loft: { ...captured.loft!.stats, png: captured.loft!.png, drawCalls: loftApp.diagnostics().drawCalls, errors: loftApp.diagnostics().errors, groups: loft.groups?.length ?? 0 },
        teapot: { ...captured.teapot!.stats, png: captured.teapot!.png, drawCalls: teapotApp.diagnostics().drawCalls, errors: teapotApp.diagnostics().errors, triangles: (teapot.indices?.length ?? 0) / 3 }
      };
    }, server.origin);

    expect(initial.atlas.charts).toBeGreaterThan(0);
    expect(initial.atlas.gutter).toBe(4);
    expect(initial.atlas.remappedVertices).toBe(initial.atlas.vertices);
    expect(initial.atlas.remappedIndices).toBe(initial.atlas.indices);
    expect(initial.atlas.uvCount).toBe(initial.atlas.vertices * 2);
    expect(initial.atlas.minUv).toBeGreaterThanOrEqual(0);
    expect(initial.atlas.maxUv).toBeLessThanOrEqual(1);
    for (const [name, render] of Object.entries({ surface: initial.surface, loft: initial.loft, teapot: initial.teapot })) {
      expect(render.drawCalls, `${name} draw calls`).toBeGreaterThan(0);
      expect(render.visible, `${name} rendered pixels`).toBeGreaterThan(500);
      expect(render.errors, `${name} renderer errors`).toEqual([]);
    }
    expect(initial.surface.redSpan).toBeGreaterThan(5);
    expect(initial.surface.greenSpan).toBeGreaterThan(5);
    expect(initial.surface.colorBuckets).toBeGreaterThan(4);
    expect(initial.loft.groups).toBeGreaterThanOrEqual(3);
    expect(initial.teapot.triangles).toBeGreaterThan(100);

    await page.locator("#bend-surface").click();
    await page.waitForFunction(() => {
      const state = (window as unknown as { __NATIVE_GEOMETRY_TOOLS__?: { status: string } }).__NATIVE_GEOMETRY_TOOLS__;
      return state?.status === "changed" || state?.status === "error";
    });
    const interaction = await page.evaluate(() => {
      const state = (window as unknown as { __NATIVE_GEOMETRY_TOOLS__: { status: string; error: string; changedPixels: number; afterVisible: number; modifierDiagnostics: string[]; afterPng: string } }).__NATIVE_GEOMETRY_TOOLS__;
      return { status: state.status, error: state.error, changedPixels: state.changedPixels, afterVisible: state.afterVisible, modifierDiagnostics: state.modifierDiagnostics, afterPng: state.afterPng };
    });
    expect(interaction.status, interaction.error).toBe("changed");
    expect(interaction.changedPixels).toBeGreaterThan(500);
    expect(interaction.afterVisible).toBeGreaterThan(500);
    expect(interaction.modifierDiagnostics).toContain("normals-approximated");
    expect(pageErrors).toEqual([]);

    for (const [name, dataUrl] of Object.entries({ surface: initial.surface.png, loft: initial.loft.png, teapot: initial.teapot.png, deformed: interaction.afterPng })) {
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
      await testInfo.attach(`${name}.png`, { body: Buffer.from(dataUrl.split(",")[1]!, "base64"), contentType: "image/png" });
    }
  } finally {
    await page.evaluate(() => {
      (window as unknown as { __NATIVE_GEOMETRY_TOOLS__?: { dispose(): void } }).__NATIVE_GEOMETRY_TOOLS__?.dispose();
    }).catch(() => undefined);
    await server.close();
  }
});

interface PixelStats {
  readonly visible: number;
  readonly redSpan: number;
  readonly greenSpan: number;
  readonly colorBuckets: number;
}
