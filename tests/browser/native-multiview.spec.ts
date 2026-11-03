import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Abstract, independently authored colored-box fixtures exercise the public
 * createAuraApp path. All comparisons use the same static scene and change
 * only one view's camera, scissor, or post settings. The browser run belongs
 * to Phase B; source compilation alone is not pixel evidence.
 */
test.describe("native multi-view root rendering", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("array views isolate cameras, scissor and postprocessing, including after resize", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(collectViewPixels, {
      engineUrl: `${server.origin}/packages/engine/src/public/index.ts`,
      kind: "array" as const
    });

    expect(result.backends).toEqual(["webgl2", "webgl2", "webgl2", "webgl2", "webgl2"]);
    expect(result.runtimeBackends).toEqual(["production-runtime", "production-runtime", "production-runtime", "production-runtime", "production-runtime"]);
    expect(result.diagnosticsErrors.flat(), JSON.stringify(result.diagnosticsErrors)).toEqual([]);
    expect(result.sizes).toEqual([[320, 240], [448, 240]]);

    // Each camera points at a different colored box. A shared or stale camera
    // renders the same subject in both centers and fails these checks.
    expect(result.firstCenter[0]).toBeGreaterThan(result.firstCenter[2] * 1.4 + 8);
    expect(result.secondCenter[2]).toBeGreaterThan(result.secondCenter[0] * 1.4 + 8);
    expect(result.resizedFirstCenter[0]).toBeGreaterThan(result.resizedFirstCenter[2] * 1.4 + 8);
    expect(result.resizedSecondCenter[2]).toBeGreaterThan(result.resizedSecondCenter[0] * 1.4 + 8);

    expect(result.cameraChangedSecond.changedFraction).toBeGreaterThan(0.1);
    expect(result.cameraChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.scissorCut.changedFraction).toBeGreaterThan(0.25);
    expect(result.scissorRetained.meanChannelDelta).toBeLessThan(2);
    expect(result.scissorFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.resizedScissorCut.changedFraction).toBeGreaterThan(0.25);
    expect(result.resizedScissorRetained.meanChannelDelta).toBeLessThan(2);
    expect(Math.max(...result.gapColor)).toBeLessThan(40);
    expect(result.gapFirstCenter[0]).toBeGreaterThan(result.gapFirstCenter[2] * 1.4 + 8);
    expect(result.gapSecondCenter[2]).toBeGreaterThan(result.gapSecondCenter[0] * 1.4 + 8);
    expect(result.postChangedSecond.changedFraction).toBeGreaterThan(0.1);
    expect(result.postChangedSecond.meanChannelDelta).toBeGreaterThan(3);
    expect(result.postChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.resizedPostChangedSecond.changedFraction).toBeGreaterThan(0.1);
    expect(result.resizedPostChangedSecond.meanChannelDelta).toBeGreaterThan(3);
    expect(result.resizedPostChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

  test("stereo eyes keep independent projections, clipping and post effects", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(collectViewPixels, {
      engineUrl: `${server.origin}/packages/engine/src/public/index.ts`,
      kind: "stereo" as const
    });

    expect(result.backends).toEqual(["webgl2", "webgl2", "webgl2", "webgl2", "webgl2"]);
    expect(result.runtimeBackends).toEqual(["production-runtime", "production-runtime", "production-runtime", "production-runtime", "production-runtime"]);
    expect(result.diagnosticsErrors.flat(), JSON.stringify(result.diagnosticsErrors)).toEqual([]);
    expect(result.sizes).toEqual([[320, 240], [448, 240]]);
    expect(result.stereoDisparity).toBeGreaterThan(1);
    expect(result.cameraChangedSecond.changedFraction).toBeGreaterThan(0.05);
    expect(result.cameraChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.scissorCut.changedFraction).toBeGreaterThan(0.1);
    expect(result.scissorRetained.meanChannelDelta).toBeLessThan(2);
    expect(result.scissorFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.resizedScissorCut.changedFraction).toBeGreaterThan(0.1);
    expect(result.resizedScissorRetained.meanChannelDelta).toBeLessThan(2);
    expect(Math.max(...result.gapColor)).toBeLessThan(40);
    expect(result.gapFirstCenter[0]).toBeGreaterThan(result.gapFirstCenter[2] * 1.4 + 8);
    expect(result.gapSecondCenter[0]).toBeGreaterThan(result.gapSecondCenter[2] * 1.4 + 8);
    expect(result.postChangedSecond.changedFraction).toBeGreaterThan(0.1);
    expect(result.postChangedSecond.meanChannelDelta).toBeGreaterThan(3);
    expect(result.postChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(result.resizedPostChangedSecond.changedFraction).toBeGreaterThan(0.1);
    expect(result.resizedPostChangedFirst.meanChannelDelta).toBeLessThan(2);
    expect(errors).toEqual([]);
  });
});

async function collectViewPixels({ engineUrl, kind }: { engineUrl: string; kind: "array" | "stereo" }) {
  const { camera, cameras, createAuraApp, lights, material, primitives, scene } = await import(engineUrl);
  const neutralPost = {
    targetFormat: "rgba8",
    toneMapping: { exposure: 1, operator: "reinhard", inputColorSpace: "linear", outputColorSpace: "srgb" }
  };
  const dimPost = { ...neutralPost, toneMapping: { ...neutralPost.toneMapping, exposure: 0.12 } };
  const leftViewport = { x: 0, y: 0, width: 0.5, height: 1 };
  const rightViewport = { x: 0.5, y: 0, width: 0.5, height: 1 };
  const leftGapViewport = { x: 0, y: 0, width: 0.4, height: 1 };
  const rightGapViewport = { x: 0.6, y: 0, width: 0.4, height: 1 };
  // Retain the right side of the second viewport, cutting through its subject.
  const narrowScissor = { x: 0.72, y: 0, width: 0.28, height: 1 };
  type Variant = "base" | "camera" | "scissor" | "post" | "gap";
  const makeScene = (variant: Variant) => {
    const builder = scene()
      .background("#101218")
      .camera(camera.perspective({ position: [0, 0, 4], target: [0, 0, 0], fov: 45, near: 0.1, far: 40 }))
      .add(lights.ambient({ color: "#ffffff", intensity: 2 }))
      .add(lights.directional({ position: [1, 3, 4], intensity: 1.5 }));
    if (kind === "array") {
      builder.add(primitives.box({ name: "array-red", material: material.pbr({ color: "#e83620", roughness: 0.8, metallic: 0 }) })
        .position(-2, 0, 0).scale([1.4, 1.4, 1.4]));
      builder.add(primitives.box({ name: "array-blue", material: material.pbr({ color: "#204ce8", roughness: 0.8, metallic: 0 }) })
        .position(2, 0, 0).scale([1.4, 1.4, 1.4]));
      builder.add(cameras.array({ cameras: [
        { id: "left", viewport: variant === "gap" ? leftGapViewport : leftViewport, camera: { position: [-2, 0, 4], target: [-2, 0, 0] }, postprocess: neutralPost },
        {
          id: "right",
          viewport: variant === "gap" ? rightGapViewport : rightViewport,
          camera: variant === "camera" ? { position: [-2, 0, 4], target: [-2, 0, 0] } : { position: [2, 0, 4], target: [2, 0, 0] },
          ...(variant === "scissor" ? { scissor: narrowScissor } : {}),
          postprocess: variant === "post" ? dimPost : neutralPost
        }
      ] }));
    } else {
      builder.add(primitives.box({ name: "stereo-red", material: material.pbr({ color: "#e83620", roughness: 0.8, metallic: 0 }) })
        .position(0, 0, 0).scale([1.35, 1.35, 1.35]));
      builder.add(primitives.box({ name: "stereo-blue-depth-marker", material: material.pbr({ color: "#204ce8", roughness: 0.8, metallic: 0 }) })
        .position(0.65, 0.2, -2).scale([0.45, 0.45, 0.45]));
      builder.add(cameras.stereo({
        eyeSeparation: 0.8,
        focus: 10,
        views: [
          { id: "left-eye", ...(variant === "gap" ? { viewport: leftGapViewport } : {}), postprocess: neutralPost },
          {
            id: "right-eye",
            ...(variant === "gap" ? { viewport: rightGapViewport } : {}),
            ...(variant === "camera" ? { camera: { position: [1, 0, 4], target: [0, 0, 0], fov: 35 } } : {}),
            ...(variant === "scissor" ? { scissor: narrowScissor } : {}),
            postprocess: variant === "post" ? dimPost : neutralPost
          }
        ]
      }));
    }
    return builder;
  };

  type Frame = { width: number; height: number; pixels: Uint8Array };
  const backends: string[] = [];
  const runtimeBackends: string[] = [];
  const diagnosticsErrors: string[][] = [];
  const captureVariant = async (variant: Variant) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.style.width = "320px";
    canvas.style.height = "240px";
    document.body.append(canvas);
    const app = createAuraApp(canvas, {
      scene: makeScene(variant),
      autoStart: false,
      resize: false,
      pixelRatio: 1,
      quality: "production",
      preserveDrawingBuffer: true
    });
    try {
      await app.ready();
      app.step(0);
      app.step(0);
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("The multi-view fixture requires WebGL2.");
      const read = (): Frame => {
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`WebGL pixel readback failed: ${error}`);
        return { width: canvas.width, height: canvas.height, pixels };
      };
      const frame = read();
      let resized = frame;
      if (variant === "base" || variant === "post" || variant === "scissor") {
        canvas.width = 448;
        canvas.height = 240;
        app.step(0);
        resized = read();
      }
      const diagnostics = app.diagnostics();
      backends.push(diagnostics.backend);
      runtimeBackends.push(diagnostics.renderer?.runtime.backend ?? "unknown");
      diagnosticsErrors.push([...diagnostics.errors]);
      return { frame, resized };
    } finally {
      app.dispose();
      canvas.remove();
    }
  };
  const base = await captureVariant("base");
  const changedCamera = await captureVariant("camera");
  const clipped = await captureVariant("scissor");
  const changedPost = await captureVariant("post");
  const gap = await captureVariant("gap");

  type Region = readonly [number, number, number, number];
  const left: Region = [0.08, 0.2, 0.42, 0.8];
  const right: Region = [0.58, 0.2, 0.92, 0.8];
  const cut: Region = [0.66, 0.4, 0.70, 0.6];
  const retained: Region = [0.76, 0.4, 0.86, 0.6];
  const bounds = (frame: Frame, region: Region) => [
    Math.floor(region[0] * frame.width), Math.floor(region[1] * frame.height),
    Math.floor(region[2] * frame.width), Math.floor(region[3] * frame.height)
  ] as const;
  const difference = (a: Frame, b: Frame, region: Region) => {
    if (a.width !== b.width || a.height !== b.height) throw new Error("Comparison frames must have equal dimensions.");
    const [x0, y0, x1, y1] = bounds(a, region);
    let changed = 0, sum = 0, count = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = (y * a.width + x) * 4;
      const delta = Math.abs(a.pixels[i]! - b.pixels[i]!) + Math.abs(a.pixels[i + 1]! - b.pixels[i + 1]!) + Math.abs(a.pixels[i + 2]! - b.pixels[i + 2]!);
      sum += delta;
      if (delta > 12) changed += 1;
      count += 1;
    }
    return { changedFraction: changed / count, meanChannelDelta: sum / (count * 3) };
  };
  const average = (frame: Frame, region: Region): [number, number, number] => {
    const [x0, y0, x1, y1] = bounds(frame, region);
    const sum: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      sum[0] += frame.pixels[i]!; sum[1] += frame.pixels[i + 1]!; sum[2] += frame.pixels[i + 2]!;
      count += 1;
    }
    return [sum[0] / count, sum[1] / count, sum[2] / count];
  };
  const redCentroid = (frame: Frame, eye: 0 | 1) => {
    const x0 = eye * frame.width / 2, x1 = (eye + 1) * frame.width / 2;
    let sum = 0, count = 0;
    for (let y = 0; y < frame.height; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      if (frame.pixels[i]! > frame.pixels[i + 1]! * 1.4 + 8 && frame.pixels[i]! > frame.pixels[i + 2]! * 1.4 + 8) {
        sum += x - x0; count += 1;
      }
    }
    if (count < 50) throw new Error(`Stereo eye ${eye} has too few red subject pixels: ${count}`);
    return sum / count;
  };

  return {
    backends, runtimeBackends, diagnosticsErrors,
    sizes: [[base.frame.width, base.frame.height], [base.resized.width, base.resized.height]],
    firstCenter: average(base.frame, [0.22, 0.45, 0.28, 0.55]),
    secondCenter: average(base.frame, [0.72, 0.45, 0.78, 0.55]),
    resizedFirstCenter: average(base.resized, [0.22, 0.45, 0.28, 0.55]),
    resizedSecondCenter: average(base.resized, [0.72, 0.45, 0.78, 0.55]),
    stereoDisparity: kind === "stereo" ? Math.abs(redCentroid(base.frame, 0) - redCentroid(base.frame, 1)) : 0,
    cameraChangedFirst: difference(base.frame, changedCamera.frame, left),
    cameraChangedSecond: difference(base.frame, changedCamera.frame, right),
    scissorFirst: difference(base.frame, clipped.frame, left),
    scissorCut: difference(base.frame, clipped.frame, cut),
    scissorRetained: difference(base.frame, clipped.frame, retained),
    resizedScissorCut: difference(base.resized, clipped.resized, cut),
    resizedScissorRetained: difference(base.resized, clipped.resized, retained),
    gapColor: average(gap.frame, [0.46, 0.35, 0.54, 0.65]),
    gapFirstCenter: average(gap.frame, [0.18, 0.45, 0.22, 0.55]),
    gapSecondCenter: average(gap.frame, [0.78, 0.45, 0.82, 0.55]),
    postChangedFirst: difference(base.frame, changedPost.frame, left),
    postChangedSecond: difference(base.frame, changedPost.frame, right),
    resizedPostChangedFirst: difference(base.resized, changedPost.resized, left),
    resizedPostChangedSecond: difference(base.resized, changedPost.resized, right)
  };
}
