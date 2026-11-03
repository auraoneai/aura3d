import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/** Phase B: exercise the actual v2 display-stage driver on WebGL2 targets. */
test("native effects alter pixels, honor masks and alpha, and isolate afterimage histories", async ({ page }) => {
  const server = await startExampleDevServer();
  try {
    await page.route("**/__native_post_blank", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Native post effects</title>" }));
    await page.goto(`${server.origin}/__native_post_blank`);
    const result = await page.evaluate(async () => {
      const devicePath = "/packages/rendering/src/WebGL2Device.ts";
      const stagesPath = "/packages/rendering/src/post/v2Stages.ts";
      const texturePath = "/packages/rendering/src/Texture.ts";
      const { WebGL2Device } = await import(devicePath);
      const { runV2LdrTail, disposeNativePostEffects } = await import(stagesPath);
      const { Texture } = await import(texturePath);
      const width = 32, height = 24;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const device = WebGL2Device.create({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
      // The test invokes the very same host/driver as the renderer, without a
      // scene whose lighting or tone mapping could obscure effect differences.
      const host = (device as unknown as { host: unknown }).host;
      const source = device.createRenderTarget({ width, height, format: "rgba8", depth: false });
      const output = device.createRenderTarget({ width, height, format: "rgba8", depth: false });
      const image = new Uint8Array(width * height * 4);
      const black = new Uint8Array(width * height * 4);
      const maskPixels = new Uint8Array(width * height * 4);
      const auxPixels = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        image.set([(x * 53 + y * 29) % 256, (x * 17 + y * 71) % 256, (x * 31 + y * 13) % 256, 120], i);
        black.set([0, 0, 0, 120], i);
        maskPixels.set([x < width / 2 ? 255 : 0, 0, 0, 255], i);
        auxPixels.set([20, 220, 140, 80], i);
      }
      const mask = new Texture({ width, height, data: maskPixels, generateMipmaps: false });
      const aux = new Texture({ width, height, data: auxPixels, generateMipmaps: false });
      const scope = {};
      const base = { antiAliasing: "off", depthRange: { near: 0.1, far: 100, projection: "perspective" }, exposure: 1, toneMapping: "none", dither: true };
      const context = (viewId: string, frameId: number, cameraCut = false) => ({
        source: {}, items: [], scopeId: scope, viewId, frameId, cameraCut,
        sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } }
      });
      const render = (pixels: Uint8Array, effects: readonly unknown[], viewId = "main", frameId = 1, cut = false): Uint8Array => {
        device.writeRenderTargetPixels(source, pixels);
        runV2LdrTail(host, source, { ...base, nativeEffects: effects }, output, context(viewId, frameId, cut));
        device.setRenderTarget(output);
        return device.readPixels(0, 0, width, height);
      };
      const baseline = render(image, []);
      const changed = (a: Uint8Array, b: Uint8Array, x0 = 0, x1 = width): number => {
        let count = 0;
        for (let y = 0; y < height; y++) for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 6) count++;
        }
        return count;
      };
      const cases = [
        { kind: "pixelation", size: 5 },
        { kind: "halftone", size: 6, angle: 0.4, strength: 1 },
        { kind: "dot-screen", size: 6, angle: 0.4, strength: 1 },
        { kind: "glitch", intensity: 1, seed: 7 },
        { kind: "transition", texture: aux, progress: 0.8 },
        { kind: "lens-dirt", texture: aux, intensity: 1 }
      ];
      const deltas = cases.map((effect) => [effect.kind, changed(baseline, render(image, [effect]))] as const);
      const masked = render(image, [
        { kind: "mask", texture: mask, invert: false, opacity: 1 },
        { kind: "pixelation", size: 5 }, { kind: "clear-mask" }
      ]);
      const maskedLeft = changed(baseline, masked, 0, width / 2 - 1);
      const maskedRight = changed(baseline, masked, width / 2 + 1, width);
      const afterimage = [{ kind: "afterimage", decay: 0.85 }];
      render(image, afterimage, "trail", 1);
      const trail = render(black, afterimage, "trail", 2);
      const isolated = render(black, afterimage, "other", 2);
      const cut = render(black, afterimage, "trail", 3, true);
      const unchangedBlack = render(black, [], "plain", 2);
      const alpha = trail[3];
      let invalid = "";
      try { render(image, [{ kind: "transition", texture: null, progress: 0.5 }]); }
      catch (error) { invalid = error instanceof Error ? error.message : String(error); }
      disposeNativePostEffects(host);
      mask.dispose(); aux.dispose(); source.dispose(); output.dispose(); device.dispose();
      return { deltas, maskedLeft, maskedRight, trailDelta: changed(trail, unchangedBlack), isolatedDelta: changed(isolated, unchangedBlack), cutDelta: changed(cut, unchangedBlack), alpha, invalid };
    });
    for (const [name, pixels] of result.deltas) expect(pixels, name).toBeGreaterThan(10);
    expect(result.maskedLeft).toBeGreaterThan(20);
    expect(result.maskedRight).toBe(0);
    expect(result.trailDelta).toBeGreaterThan(100);
    expect(result.isolatedDelta).toBe(0);
    expect(result.cutDelta).toBe(0);
    expect(result.alpha).toBeGreaterThan(0);
    expect(result.alpha).toBeLessThan(200);
    expect(result.invalid).toContain("POSTPROCESS_INPUT_UNAVAILABLE:transition:texture");
  } finally {
    await server.close();
  }
});
