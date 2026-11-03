import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("native interchange export", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("exports a loaded, edited scene and reloads its geometry, hierarchy, material, and transform", async ({ page }) => {
    test.setTimeout(120_000);
    // Map the published package entries to the source entry points, as the
    // example server does for other source-browser tests. This path intentionally
    // exercises the public exporter barrel, not individual implementation files.
    await page.route(`${server.origin}/__native-exporters`, async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><script type="importmap">${JSON.stringify({
          imports: {
            "@aura3d/assets/exporters": "/packages/assets/src/exporters/index.ts",
            "@aura3d/assets": "/packages/assets/src/browser-index.ts",
            "@aura3d/rendering": "/packages/rendering/src/index.ts"
          }
        })}</script></head><body><canvas id="stage" width="64" height="64"></canvas></body></html>`
      });
    });
    await page.goto(`${server.origin}/__native-exporters`);
    const result = await page.evaluate(async () => {
      const assetsEntry = "@aura3d/assets";
      const exportersEntry = "@aura3d/assets/exporters";
      const renderingEntry = "@aura3d/rendering";
      const { GLTFLoader, LoadContext, createGLTFRenderResources } = await import(assetsEntry);
      const { exportGLTF, sceneFromGLTFAsset } = await import(exportersEntry);
      const { Renderer } = await import(renderingEntry);
      const positions = new Float32Array([-0.7, -0.7, 0, 0.7, -0.7, 0, 0, 0.7, 0]);
      const positionBytes = new Uint8Array(positions.buffer);
      const base64 = btoa(Array.from(positionBytes, (byte) => String.fromCharCode(byte)).join(""));
      const source = {
        asset: { version: "2.0" },
        buffers: [{ uri: `data:application/octet-stream;base64,${base64}`, byteLength: positionBytes.length }],
        bufferViews: [{ buffer: 0, byteLength: positionBytes.length }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.7, 0], max: [0.7, 0.7, 0] }],
        materials: [{ name: "Green", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.8, 0.2, 1], metallicFactor: 0, roughnessFactor: 1 } }],
        meshes: [{ name: "Triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        nodes: [{ name: "Parent", children: [1] }, { name: "Part", mesh: 0 }],
        scenes: [{ nodes: [0] }], scene: 0
      };
      const sourceUrl = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(source))}`;
      const loader = new GLTFLoader();
      const input = await loader.load({ url: sourceUrl }, new LoadContext());
      const live = input.createScene();
      const part = live.findByName("Part")[0];
      if (!part) throw new Error("Imported scene has no Part node");
      part.transform.setPosition(0.35, 0, 0);
      const result = await exportGLTF(sceneFromGLTFAsset(input, live), { binary: true });
      // The loader distinguishes GLB data URIs by MIME type; object URLs have
      // neither that MIME prefix nor a .glb suffix.
      const outputBytes: Uint8Array = result.data instanceof Uint8Array ? result.data : new Uint8Array(await result.data.arrayBuffer());
      const outputBase64 = btoa(Array.from(outputBytes, (byte) => String.fromCharCode(byte)).join(""));
      const outputUrl = `data:model/gltf-binary;base64,${outputBase64}`;
      try {
        const output = await loader.load({ url: outputUrl }, new LoadContext());
        const reloaded = output.createScene();
        reloaded.updateWorldTransforms();
        const loadedPart = reloaded.findByName("Part")[0];
        if (!loadedPart) throw new Error("Export lost the Part node");
        const resources = await createGLTFRenderResources(output);
        const canvas = document.getElementById("stage") as HTMLCanvasElement;
        const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 64, height: 64, clearColor: [0, 0, 0, 1], antialias: false });
        try {
          const frame = renderer.render(resources.toRenderSource({
            qualityPreset: "default", cameraPolicy: "identity", environmentLighting: { color: [1, 1, 1], intensity: 0.75 }
          }));
          return {
            warnings: result.warnings,
            dependencies: result.dependencies.length,
            parent: loadedPart.parent?.name,
            translation: Array.from(loadedPart.transform.worldMatrix).slice(12, 15),
            positions: output.meshes[0]?.positions,
            material: output.materials[0]?.baseColorFactor,
            drawCalls: frame.drawCalls,
            pixel: Array.from(renderer.device.readPixels(36, 32, 1, 1) as Uint8Array)
          };
        } finally {
          renderer.dispose();
          resources.dispose();
          reloaded.dispose();
          loader.dispose(output);
        }
      } finally {
        live.dispose();
        loader.dispose(input);
      }
    });
    expect(result.dependencies).toBe(0);
    expect(result.parent).toBe("Parent");
    expect(result.translation[0]).toBeCloseTo(0.35, 5);
    expect(result.translation.slice(1)).toEqual([0, 0]);
    expect(result.positions).toHaveLength(3);
    expect(result.positions?.[1]?.[0]).toBeCloseTo(0.7, 5);
    expect(result.material?.[0]).toBeCloseTo(0.1, 5);
    expect(result.material?.[1]).toBeCloseTo(0.8, 5);
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.pixel[1]).toBeGreaterThan(result.pixel[0]);
    expect(result.pixel[1]).toBeGreaterThan(result.pixel[2]);
    expect(result.pixel[1]).toBeGreaterThan(10);
  });
});
