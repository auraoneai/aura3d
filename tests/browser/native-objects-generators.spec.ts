/**
 * WP-15 rendered acceptance, to run remotely only after CODE_COMPLETE_GO.
 * These cases submit the actual generated geometry to Aura3D and inspect its
 * pixels; pointer editing picks the displayed triangle mesh, not a test proxy.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface ProceduralEditProbe {
  readonly hits: number;
  readonly changedVertices: number;
  readonly hitPoint: readonly number[] | null;
  captureInitial(): Promise<void>;
  changedPixels(): Promise<number>;
  undo(): void;
  dispose(): void;
}

test.describe("native procedural objects and editing", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });
  test.beforeEach(async ({ page }) => {
    // Keep the fixture on the dev-server origin without loading the root page,
    // which redirects to the marketing app and would contaminate the canvas.
    await page.route("**/__native_procedural__.html", (route) => route.fulfill({
      status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>"
    }));
  });

  test("generated terrain, trees, city, street furniture, isosurfaces, fractures, and tubes produce visible geometry", async ({ page }) => {
    await page.goto(`${server.origin}/__native_procedural__.html`, { waitUntil: "domcontentloaded" });
    const results = await page.evaluate(async (origin) => {
      const engine = await import(`${origin}/packages/engine/src/public/index.ts`);
      const generators = await import(`${origin}/packages/addons/src/generators/EnvironmentGenerators.ts`);
      const { MarchingCubes } = await import(`${origin}/packages/addons/src/objects/MarchingCubes.ts`);
      const { fractureConvex } = await import(`${origin}/packages/addons/src/tools/Fracture.ts`);
      const { TubePainter } = await import(`${origin}/packages/addons/src/tools/TubePainter.ts`);
      const { camera, createAuraApp, geometry, lights, material, scene } = engine;

      const field = new MarchingCubes({ resolution: [12, 12, 12] });
      field.fill((p: readonly [number, number, number]) => 0.58 - Math.hypot(...p));
      const iso = field.generate();
      if (!iso) throw new Error("isosurface did not produce triangles");
      const cube = {
        positions: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
        indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]
      };
      const fragments = fractureConvex(cube, { planes: [{ normal: [1, 0, 0], constant: 0 }] });
      const tube = new TubePainter({ radius: 0.2, radialSegments: 12, capped: true });
      tube.addPoint([-0.8, -0.7, 0]); tube.addPoint([0, 0, 0]); tube.addPoint([0.8, 0.7, 0.25]);
      const tubeGeometry = tube.geometry();
      if (!tubeGeometry) throw new Error("tube stroke did not produce geometry");

      const generated = [
        { name: "terrain", value: generators.generateTerrain({ seed: 42, columns: 16, rows: 16, size: [4, 4], height: 1 }) },
        { name: "tree", value: generators.generateTree({ seed: 42, height: 3 }) },
        { name: "forest", value: generators.generateForest({ seed: 42, count: 3, min: [-2, -2], max: [2, 2], height: 2 }) },
        { name: "city", value: generators.generateCity({ seed: 42, columns: 2, rows: 2, blockSize: 3, roadWidth: 0.5, minHeight: 1, maxHeight: 3 }) },
        { name: "street", value: generators.generateStreetAssets({ seed: 42, path: [[-2, 0, 0], [2, 0, 0]], spacing: 1.5, kinds: ["lamp", "bench"] }) }
      ];
      type Bounds = { min: readonly [number, number, number]; max: readonly [number, number, number] };
      type Entry = { name: string; parts: readonly { geometry: unknown }[]; bounds: Bounds };
      const entries: Entry[] = generated.map(({ name, value }) => {
        if (!value.bounds || !value.parts.length) throw new Error(`${name} has no drawable parts`);
        return { name, parts: value.parts, bounds: value.bounds };
      });
      entries.push(
        { name: "isosurface", parts: [{ geometry: iso }], bounds: { min: [-1, -1, -1], max: [1, 1, 1] } },
        { name: "fracture", parts: [{ geometry: fragments.fragments[0].geometry }], bounds: fragments.fragments[0].geometry.bounds },
        { name: "tube", parts: [{ geometry: tubeGeometry }], bounds: tubeGeometry.bounds }
      );
      const out: { name: string; subjectPixels: number; drawCalls: number }[] = [];
      try {
        for (const entry of entries) {
          const canvas = document.createElement("canvas");
          canvas.width = 320; canvas.height = 320; document.body.append(canvas);
          let description = scene().background("#0b1220");
          for (const part of entry.parts) {
            description = description.add(geometry.custom(part.geometry, { material: material.pbr({ color: "#72cafa", roughness: 0.55 }) }));
          }
          description = description.add(lights.studio({ intensity: 1.4 })).camera(camera.autoFrame({ bounds: entry.bounds }));
          const app = createAuraApp(canvas, { scene: description, pixelRatio: 1, resize: false, autoStart: false, preserveDrawingBuffer: true });
          try {
            await app.ready();
            const started = performance.now();
            while ((app.diagnostics().drawCalls ?? 0) === 0 && performance.now() - started < 30_000) {
              app.step(1 / 60);
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            app.step(1 / 60);
            const bitmap = await app.capture({ type: "image-bitmap" }) as ImageBitmap;
            const read = document.createElement("canvas"); read.width = bitmap.width; read.height = bitmap.height;
            const ctx = read.getContext("2d");
            if (!ctx) throw new Error("2D pixel readback unavailable");
            ctx.drawImage(bitmap, 0, 0); bitmap.close();
            const pixels = ctx.getImageData(0, 0, read.width, read.height).data;
            const background = [pixels[0], pixels[1], pixels[2]];
            let subjectPixels = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              if (Math.abs(pixels[i]! - background[0]!) + Math.abs(pixels[i + 1]! - background[1]!) + Math.abs(pixels[i + 2]! - background[2]!) > 30) subjectPixels++;
            }
            out.push({ name: entry.name, subjectPixels, drawCalls: app.diagnostics().drawCalls ?? 0 });
          } finally { app.dispose(); canvas.remove(); }
        }
      } finally {
        for (const item of generated) item.value.dispose();
        fragments.dispose(); field.dispose(); tube.dispose();
      }
      return out;
    }, server.origin);

    expect(results.map((entry) => entry.name)).toEqual(["terrain", "tree", "forest", "city", "street", "isosurface", "fracture", "tube"]);
    for (const entry of results) {
      expect(entry.drawCalls, `${entry.name} submitted a draw`).toBeGreaterThan(0);
      expect(entry.subjectPixels, `${entry.name} differs from the background`).toBeGreaterThan(150);
    }
  });

  test("grounded sky, projected shadow, and volume slices change rendered pixels", async ({ page }) => {
    await page.goto(`${server.origin}/__native_procedural__.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (origin) => {
      const { camera, createAuraApp, geometry, lights, material, scene, texture } = await import(`${origin}/packages/engine/src/public/index.ts`);
      const { createGroundedSky, createShadowProjection, createVolumeSlice } = await import(`${origin}/packages/addons/src/objects/SpecializedObjects.ts`);
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 320; document.body.append(canvas);
      const pixels = async (app: ReturnType<typeof createAuraApp>): Promise<Uint8ClampedArray> => {
        app.step(1 / 60);
        const bitmap = await app.capture({ type: "image-bitmap" }) as ImageBitmap;
        const read = document.createElement("canvas"); read.width = bitmap.width; read.height = bitmap.height;
        const ctx = read.getContext("2d");
        if (!ctx) throw new Error("2D pixel readback unavailable");
        ctx.drawImage(bitmap, 0, 0); bitmap.close();
        return ctx.getImageData(0, 0, read.width, read.height).data;
      };
      const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
        if (a.length !== b.length) throw new Error("capture dimensions changed");
        let count = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 20) count++;
        }
        return count;
      };
      const ready = async (app: ReturnType<typeof createAuraApp>): Promise<void> => {
        await app.ready();
        const started = performance.now();
        while ((app.diagnostics().drawCalls ?? 0) === 0 && performance.now() - started < 30_000) {
          app.step(1 / 60); await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if ((app.diagnostics().drawCalls ?? 0) === 0) throw new Error("specialized object did not submit a draw");
      };
      const options = { pixelRatio: 1, resize: false, autoStart: false, preserveDrawingBuffer: true };
      const grounded = createGroundedSky({ radius: 4, groundColor: [0.75, 0.14, 0.06] });
      let app = createAuraApp(canvas, {
        ...options,
        scene: scene().add(grounded.sky).add(grounded.ground.runtime({ id: "ground" }))
          .camera(camera.perspective({ position: [0, 1.5, 4], target: [0, 0, 0], fov: 50 }))
      });
      let skyDifference = 0, panoramaDifference = 0, shadowDifference = 0, volumeDifference = 0, volumeUndoDifference = 0;
      try {
        await ready(app);
        const withGround = await pixels(app);
        app.nodes.require("ground").setVisible(false);
        skyDifference = difference(withGround, await pixels(app));
      } finally { app.dispose(); }

      // Authored in-memory texture: contrasting horizontal and vertical bands
      // make sampling the panorama observable without external image fixtures.
      const panoramaData = new Uint8Array(8 * 4 * 4);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
        const at = (y * 8 + x) * 4;
        panoramaData.set([x < 4 ? 245 : 35, y < 2 ? 55 : 220, 100, 255], at);
      }
      const panoramaTexture = texture.data({ width: 8, height: 4, data: panoramaData, format: "rgba8", colorSpace: "linear" });
      const panorama = createGroundedSky({ panorama: panoramaTexture, radius: 4, cameraHeight: 1.5 });
      app = createAuraApp(canvas, {
        ...options,
        scene: scene().add(panorama.sky).add(panorama.ground.runtime({ id: "panorama" }))
          .camera(camera.perspective({ position: [0, 1.5, 0], target: [0, 0.9, -1], fov: 50 }))
      });
      try {
        await ready(app);
        const withPanorama = await pixels(app);
        app.nodes.require("panorama").setVisible(false);
        panoramaDifference = difference(withPanorama, await pixels(app));
      } finally { app.dispose(); panoramaTexture.dispose(); }

      const floor = geometry.custom({
        kind: "aura-custom-geometry", positions: [-2, 0, -2, 2, 0, -2, 2, 0, 2, -2, 0, 2],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], indices: [0, 2, 1, 0, 3, 2]
      }, { material: material.pbr({ color: "#efefef", roughness: 1 }) });
      const shadow = createShadowProjection({ casterBounds: { min: [-0.7, 0.5, -0.7], max: [0.7, 2, 0.7] }, lightDirection: [0, -1, 0], opacity: 0.8 });
      app = createAuraApp(canvas, {
        ...options,
        scene: scene().background("#303030").add(floor).add(shadow.node.runtime({ id: "shadow" })).add(lights.studio({ intensity: 1.4 }))
          .camera(camera.perspective({ position: [3, 4, 5], target: [0, 0, 0], fov: 45 }))
      });
      try {
        await ready(app);
        const withShadow = await pixels(app);
        app.nodes.require("shadow").setVisible(false);
        shadowDifference = difference(withShadow, await pixels(app));
      } finally { app.dispose(); }

      const volume = createVolumeSlice({ dimensions: [8, 8, 2], values: [...new Array(64).fill(0.2), ...new Array(64).fill(0.8)], axis: "z", index: 0 });
      app = createAuraApp(canvas, {
        ...options,
        scene: scene().background("#101820").add(volume.node.runtime({ id: "slice" }))
          .camera(camera.orthographic({ position: [0, 0, 4], target: [0, 0, 0], orthographicSize: 0.8 }))
      });
      try {
        await ready(app);
        volume.bind(app.nodes.require("slice"));
        const first = await pixels(app);
        volume.setSlice(1);
        volumeDifference = difference(first, await pixels(app));
        volume.setSlice(0);
        volumeUndoDifference = difference(first, await pixels(app));
      } finally { app.dispose(); volume.dispose(); canvas.remove(); }
      return { skyDifference, panoramaDifference, shadowDifference, volumeDifference, volumeUndoDifference };
    }, server.origin);

    expect(result.skyDifference).toBeGreaterThan(100);
    expect(result.panoramaDifference).toBeGreaterThan(100);
    expect(result.shadowDifference).toBeGreaterThan(100);
    expect(result.volumeDifference).toBeGreaterThan(100);
    expect(result.volumeUndoDifference).toBeLessThanOrEqual(10);
  });

  test("a pointer picks the rendered surface, sculpts its silhouette, and undo restores it", async ({ page }) => {
    await page.goto(`${server.origin}/__native_procedural__.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async (origin) => {
      const { camera, createAuraApp, geometry, lights, material, scene } = await import(`${origin}/packages/engine/src/public/index.ts`);
      const { Sculptor } = await import(`${origin}/packages/addons/src/tools/Sculptor.ts`);
      const { buildMeshBVH, raycastMesh } = await import(`${origin}/packages/physics/src/solverless.ts`);
      const positions: number[] = [], indices: number[] = [], size = 21;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) positions.push(-1 + 2 * x / (size - 1), -1 + 2 * y / (size - 1), 0);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const a = y * size + x, b = a + 1, c = a + size, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
      const sculptor = new Sculptor({ positions, indices }, { maxDisplacement: 0.8 });
      const canvas = document.createElement("canvas");
      canvas.id = "procedural-edit-canvas"; canvas.width = 320; canvas.height = 320;
      canvas.style.width = "320px"; canvas.style.height = "320px";
      document.body.replaceChildren(canvas);
      const app = createAuraApp(canvas, {
        scene: scene().background("#0b1220")
          .add(geometry.custom(sculptor.geometry(), { material: material.pbr({ color: "#ffb260", roughness: 0.55 }) }).runtime({ id: "editable" }))
          .add(lights.studio({ intensity: 1.4 }))
          .camera(camera.orthographic({ position: [0, 0, 4], target: [0, 0, 0], orthographicSize: 1.5 })),
        pixelRatio: 1, resize: false, autoStart: false, preserveDrawingBuffer: true
      });
      await app.ready();
      const started = performance.now();
      while ((app.diagnostics().drawCalls ?? 0) === 0 && performance.now() - started < 30_000) {
        app.step(1 / 60);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if ((app.diagnostics().drawCalls ?? 0) === 0) throw new Error("editable geometry did not submit a draw");
      const handle = app.nodes.require("editable");
      if (!handle.setGeometry) throw new Error("runtime geometry updates are unavailable");
      let hitPoint: readonly number[] | null = null, hits = 0, changedVertices = 0;
      let edit: ReturnType<InstanceType<typeof Sculptor>["applyBrush"]> | undefined;
      let initial: Uint8ClampedArray | undefined;
      const capture = async (): Promise<Uint8ClampedArray> => {
        app.step(1 / 60);
        const bitmap = await app.capture({ type: "image-bitmap" }) as ImageBitmap;
        const read = document.createElement("canvas"); read.width = bitmap.width; read.height = bitmap.height;
        const ctx = read.getContext("2d");
        if (!ctx) throw new Error("2D pixel readback unavailable");
        ctx.drawImage(bitmap, 0, 0); bitmap.close();
        return ctx.getImageData(0, 0, read.width, read.height).data;
      };
      const onPointer = (event: PointerEvent): void => {
        const rect = canvas.getBoundingClientRect();
        // Orthographic camera above is axis-aligned, with a 1.5-unit half-height.
        const x = ((event.clientX - rect.left) / rect.width * 2 - 1) * 1.5;
        const y = (1 - (event.clientY - rect.top) / rect.height * 2) * 1.5;
        const current = sculptor.geometry();
        const hit = raycastMesh(buildMeshBVH(current.positions, current.indices), [x, y, 4], [0, 0, -1]);
        if (!hit) return;
        hits++; hitPoint = hit.point;
        edit = sculptor.applyBrush({ center: hit.point, radius: 0.7, strength: 0.65, direction: [1, 0, 0] });
        changedVertices = edit.indices.length;
        handle.setGeometry!(sculptor.geometry());
        app.step(1 / 60);
      };
      canvas.addEventListener("pointerdown", onPointer);
      const state: ProceduralEditProbe = {
        get hits() { return hits; }, get hitPoint() { return hitPoint; }, get changedVertices() { return changedVertices; },
        async captureInitial() { initial = await capture(); },
        async changedPixels() {
          if (!initial) throw new Error("captureInitial must run first");
          const after = await capture();
          if (initial.length !== after.length) throw new Error("capture dimensions changed");
          let count = 0;
          for (let i = 0; i < after.length; i += 4) {
            if (Math.abs(initial[i]! - after[i]!) + Math.abs(initial[i + 1]! - after[i + 1]!) + Math.abs(initial[i + 2]! - after[i + 2]!) > 20) count++;
          }
          return count;
        },
        undo() {
          if (!edit) throw new Error("no stroke to undo");
          sculptor.applyEdit(edit, "undo"); handle.setGeometry!(sculptor.geometry()); app.step(1 / 60);
        },
        dispose() { canvas.removeEventListener("pointerdown", onPointer); sculptor.dispose(); app.dispose(); canvas.remove(); }
      };
      (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit = state;
    }, server.origin);

    try {
      await page.evaluate(() => (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit.captureInitial());
      await page.locator("#procedural-edit-canvas").click({ position: { x: 240, y: 160 } });
      const hit = await page.evaluate(() => {
        const state = (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit;
        return { hits: state.hits, point: state.hitPoint, vertices: state.changedVertices };
      });
      expect(hit.hits).toBe(1);
      expect(hit.point?.[0]).toBeCloseTo(0.75, 2);
      expect(hit.point?.[1]).toBeCloseTo(0, 2);
      expect(hit.point?.[2]).toBeCloseTo(0, 2);
      expect(hit.vertices).toBeGreaterThan(0);
      expect(await page.evaluate(() => (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit.changedPixels())).toBeGreaterThan(80);
      await page.evaluate(() => (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit.undo());
      expect(await page.evaluate(() => (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit.changedPixels())).toBeLessThanOrEqual(10);
    } finally {
      await page.evaluate(() => (window as unknown as { __nativeProceduralEdit: ProceduralEditProbe }).__nativeProceduralEdit.dispose());
    }
  });
});
