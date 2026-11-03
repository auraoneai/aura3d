import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Phase B browser evidence: no browser or GPU is started by source checks. */
test.describe("native alternative outputs", () => {
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("spatial DOM labels preserve accessibility, event routing, resize and restoration", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    await page.evaluate(async () => {
      const path: string = "/packages/addons/src/renderers/SpatialDOMRenderer.ts";
      const { SpatialDOMRenderer } = await import(path);
      document.body.textContent = "";
      const host = document.createElement("div");
      Object.assign(host.style, { position: "absolute", left: "0px", top: "0px", width: "200px", height: "100px" });
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 100;
      canvas.id = "underlay";
      let canvasClicks = 0, labelClicks = 0;
      canvas.addEventListener("click", () => { canvasClicks += 1; });
      host.append(canvas);
      const original = document.createElement("section");
      original.id = "original-parent";
      const button = document.createElement("button");
      button.id = "interactive-label";
      button.textContent = "Open item";
      button.style.color = "purple";
      button.addEventListener("click", () => { labelClicks += 1; });
      const passive = document.createElement("span");
      passive.id = "passive-label";
      passive.textContent = "Passive";
      Object.assign(passive.style, { display: "block", width: "40px", height: "24px" });
      const perspective = document.createElement("div");
      perspective.id = "perspective-label";
      perspective.textContent = "Plane";
      original.append(button, passive, perspective);
      document.body.append(host, original);
      const matrix = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
      let occluded = false;
      const renderer = new SpatialDOMRenderer({ container: host, width: 200, height: 100, isOccluded: (label: { id: string }) => occluded && label.id === "button" });
      const render = () => renderer.render([
        { id: "button", element: button, worldMatrix: matrix(0, 0, 0), interactive: true, ariaLabel: "Open scene item" },
        { id: "passive", element: passive, worldMatrix: matrix(-0.7, 0, 0) },
        { id: "plane", element: perspective, worldMatrix: matrix(0.7, 0, 0.5), mode: "perspective" }
      ], { viewProjectionMatrix: matrix(0, 0, 0) });
      render();
      (window as unknown as { __nativeOutput: unknown }).__nativeOutput = {
        counts: () => ({ canvasClicks, labelClicks }),
        hide: (value: boolean) => { occluded = value; render(); },
        resize: () => { host.style.width = "300px"; host.style.height = "200px"; renderer.setSize(300, 200); render(); },
        dispose: () => { renderer.dispose(); return { parent: button.parentElement?.id, children: [...original.children].map((child) => child.id), color: button.style.color, label: button.getAttribute("aria-label"), overlayCount: host.querySelectorAll("[data-aura-spatial-labels]").length }; }
      };
    });
    const button = page.getByRole("button", { name: "Open scene item" });
    await expect(button).toBeVisible();
    await expect(page.locator("#perspective-label")).toHaveCSS("transform", /matrix3d/);
    await button.click();
    await page.mouse.click(30, 50);
    const counts = await page.evaluate(() => (window as unknown as { __nativeOutput: { counts(): { canvasClicks: number; labelClicks: number } } }).__nativeOutput.counts());
    expect(counts).toEqual({ canvasClicks: 1, labelClicks: 1 });
    await page.evaluate(() => (window as unknown as { __nativeOutput: { hide(value: boolean): void } }).__nativeOutput.hide(true));
    await expect(page.locator("#interactive-label")).toHaveAttribute("aria-hidden", "true");
    await expect(button).toHaveCount(0);
    await page.evaluate(() => {
      const hook = (window as unknown as { __nativeOutput: { hide(value: boolean): void; resize(): void } }).__nativeOutput;
      hook.hide(false);
      hook.resize();
    });
    const center = await button.boundingBox();
    expect(center?.x).toBeCloseTo(150 - (center?.width ?? 0) / 2, 0);
    expect(center?.y).toBeCloseTo(100 - (center?.height ?? 0) / 2, 0);
    const restored = await page.evaluate(() => (window as unknown as { __nativeOutput: { dispose(): unknown } }).__nativeOutput.dispose());
    expect(restored).toEqual({ parent: "original-parent", children: ["interactive-label", "passive-label", "perspective-label"], color: "purple", label: null, overlayCount: 0 });
  });

  test("SVG output clips projected geometry and remains drawable after resize", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    const result = await page.evaluate(async () => {
      const vectorPath: string = "/packages/addons/src/renderers/VectorRenderer.ts";
      const renderingPath: string = "/packages/rendering/src/index.ts";
      const [{ VectorRenderer }, { Geometry }] = await Promise.all([import(vectorPath), import(renderingPath)]);
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const geometry = Geometry.triangle();
      const renderer = new VectorRenderer({ width: 120, height: 80, background: "#000000" });
      renderer.setSize(160, 80);
      const svg = renderer.render([{ geometry, style: { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 2 } }], { viewProjectionMatrix: identity });
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("SVG image failed")); image.src = url; });
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 80;
        canvas.id = "svg-raster";
        document.body.append(canvas);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const center = [...context.getImageData(80, 40, 1, 1).data];
        const corner = [...context.getImageData(2, 2, 1, 1).data];
        return { svg, center, corner, width: canvas.width };
      } finally { URL.revokeObjectURL(url); renderer.dispose(); geometry.dispose(); }
    });
    expect(result.svg).toContain("<polygon");
    expect(result.svg).toContain('viewBox="0 0 160 80"');
    expect(result.width).toBe(160);
    expect(result.center[0]).toBeGreaterThan(200);
    expect(result.center[1]).toBeLessThan(20);
    expect(result.corner.slice(0, 3)).toEqual([0, 0, 0]);
    await testInfo.attach("vector-output.png", { body: await page.locator("#svg-raster").screenshot(), contentType: "image/png" });
  });

  test("ASCII capture and object-space outlines respond to a rendered scene", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    const result = await page.evaluate(async () => {
      const renderingPath: string = "/packages/rendering/src/index.ts";
      const asciiPath: string = "/packages/addons/src/effects/AsciiOutput.ts";
      const outlinePath: string = "/packages/addons/src/effects/OutlineOutput.ts";
      const [{ Renderer, Geometry, UnlitMaterial, computePerspectiveCameraFrame }, { AsciiOutput }, { OutlineOutput }] = await Promise.all([import(renderingPath), import(asciiPath), import(outlinePath)]);
      const canvas = document.createElement("canvas");
      canvas.id = "outline-output";
      canvas.width = 96;
      canvas.height = 96;
      document.body.append(canvas);
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 96, height: 96, clearColor: [1, 1, 1, 1], preserveDrawingBuffer: true });
      const geometry = Geometry.uvSphere(0.7, 32, 16);
      const material = new UnlitMaterial({ color: [1, 0, 0, 1] });
      const items = [{ geometry, material }];
      const frame = computePerspectiveCameraFrame({ min: [-0.7, -0.7, -0.7], max: [0.7, 0.7, 0.7] }, { width: 96, height: 96 }, { minDistance: 2.5 });
      const ascii = new AsciiOutput({ width: 12, height: 6, characters: ".#" });
      const outline = new OutlineOutput({ width: 0.15, color: [0, 0, 0] });
      try {
        renderer.render(items, frame);
        const baseline = renderer.device.readPixels(0, 0, 96, 96);
        outline.render(renderer, items, frame);
        const outlined = renderer.device.readPixels(0, 0, 96, 96);
        let changed = 0, blackPixels = 0;
        for (let i = 0; i < outlined.length; i += 4) {
          if (outlined[i] !== baseline[i] || outlined[i + 1] !== baseline[i + 1] || outlined[i + 2] !== baseline[i + 2]) changed++;
          if (outlined[i] < 30 && outlined[i + 1] < 30 && outlined[i + 2] < 30) blackPixels++;
        }
        const text = (await ascii.render(renderer, items, frame)).text;
        outline.render(renderer, items, frame);
        return { changed, blackPixels, text };
      } finally { ascii.dispose(); outline.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); }
    });
    expect(result.changed).toBeGreaterThan(20);
    expect(result.blackPixels).toBeGreaterThan(20);
    expect(result.text).toContain(".");
    expect(result.text).toContain("#");
    expect(result.text.split("\n")).toHaveLength(6);
    await testInfo.attach("outline-output.png", { body: await page.locator("#outline-output").screenshot(), contentType: "image/png" });
  });

  test("stereo outputs draw both real eye views, route pointers and release targets", async ({ page }, testInfo) => {
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`);
    const result = await page.evaluate(async () => {
      const renderingPath: string = "/packages/rendering/src/index.ts";
      const stereoPath: string = "/packages/addons/src/effects/StereoOutputs.ts";
      const [{ Renderer, Geometry, UnlitMaterial, computePerspectiveCameraFrame }, { StereoOutput }] = await Promise.all([import(renderingPath), import(stereoPath)]);
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = 96;
      inputCanvas.height = 48;
      const outputCanvas = document.createElement("canvas");
      outputCanvas.id = "stereo-output";
      document.body.append(outputCanvas);
      const renderer = await Renderer.create({ backend: "webgl2", canvas: inputCanvas, width: 96, height: 48, clearColor: [0, 0, 0, 1] });
      const geometry = Geometry.triangle();
      const material = new UnlitMaterial({ color: [1, 1, 1, 1] });
      const output = new StereoOutput(renderer, { width: 96, height: 48, mode: "side-by-side", eyeSeparation: 0.5, convergenceDistance: 10, canvas: outputCanvas });
      try {
        const camera = computePerspectiveCameraFrame({ min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] }, { width: 96, height: 48 }, { minDistance: 2 });
        const frame = await output.render({ renderItems: [{ geometry, material }] }, camera);
        const lit = [0, 0], xsum = [0, 0];
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
          const i = (y * frame.width + x) * 4;
          if (frame.pixels[i] > 100 && frame.pixels[i + 1] > 100 && frame.pixels[i + 2] > 100) {
            const eye = x < 48 ? 0 : 1;
            lit[eye]++;
            xsum[eye] += x % 48;
          }
        }
        return { lit, centroids: [xsum[0] / lit[0], xsum[1] / lit[1]], views: frame.views.map((view: { eye: string; viewport: unknown }) => ({ eye: view.eye, viewport: view.viewport })), pointer: output.mapClientPointer(170, 70, { left: 100, top: 50, width: 96, height: 48 }) };
      } finally { output.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); }
    });
    expect(result.lit[0]).toBeGreaterThan(10);
    expect(result.lit[1]).toBeGreaterThan(10);
    expect(Math.abs(result.centroids[0] - result.centroids[1])).toBeGreaterThan(1);
    expect(result.views.map((view: { eye: string }) => view.eye)).toEqual(["left", "right"]);
    expect(result.pointer?.eye).toBe("right");
    await testInfo.attach("stereo-output.png", { body: await page.locator("#stereo-output").screenshot(), contentType: "image/png" });
  });
});
