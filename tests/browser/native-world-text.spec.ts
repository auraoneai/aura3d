import { expect, test } from "@playwright/test";
import { NATIVE_BUNDLE_EXTERNALS } from "./native-bundle-externals";
import { build } from "esbuild";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Independently authored geometric TrueType fixtures, generated for this test
// under CC0-1.0. The Latin face carries `liga` and `kern`; the fallback face
// maps Arabic/CJK code points and Arabic joining features. These outlines are
// synthetic test glyphs, not a typographic design or a coverage claim.
const latin = "AAEAAAAMAIAAAwBAR1BPUys9JGYAAAQEAAAAVkdTVUIgmSVvAAAEXAAAAFZPUy8yRQBD8AAAAUgAAABgY21hcADFAWEAAAG8AAAAVGdseWZMa68BAAACIAAAALRoZWFkLzTt0AAAAMwAAAA2aGhlYQTaAZQAAAEEAAAAJGhtdHgFPAAAAAABqAAAABRsb2NhAIgAxAAAAhAAAAAQbWF4cAAJAAgAAAEoAAAAIG5hbWVEU7xjAAAC1AAAAP9wb3N0AJEBLQAAA9QAAAAwAAEAAAABAABdYxHrXw889QABA+gAAAAA5wxVGgAAAADnDFUaACgAAAHgArwAAAADAAIAAAAAAAAAAQAAAyD/OAAAAggAAABQAbgAAQAAAAAAAAAAAAAAAAAAAAMAAQAAAAcABgABAAAAAAACAAAAAAAAAAAAAAAAAAAAAAADAekBkAAFAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAA/Pz8/AAAAIABpAyD/OAAAAyAAyAAAAAAAAAAAAAAAAAAAACAAAgIIAAABLAAAAggAAAAAAAAAAAAAAAAAAgAAAAMAAAAUAAMAAQAAABQABABAAAAADAAIAAIABAAgAEEAVgBmAGn//wAAACAAQQBWAGYAaf///+H/wf+t/57/nAABAAAAAAAAAAAAAAAAAAAADQANAB4AMAA/AEsAWgABACgAAAHMArwAAwAAMxEhESgBpAK8/UQAAAEAKAAAAeACvAAFAAAzExMjAwMo3Nx4ZGQCvP1EAV7+ogABACgAAAHgArwABQAAGwIjAwMo3Nx4ZGQCvP1EArz+ogFeAAABAEYAAAGaArwABQAAMxEhFSMRRgFU0gK8eP28AAABAFoAAADcAfQAAwAAMxEzEVqCAfT+DAABAEYAAAGaArwABQAAMxEhFSMRRgFU0gK8eP28AAAAAAoAfgABAAAAAAABABMAAAABAAAAAAACAAcAEwABAAAAAAADABEAGgABAAAAAAAEABMAAAABAAAAAAAGABEAGgADAAEECQABACYAKwADAAEECQACAA4AUQADAAEECQADACIAXwADAAEECQAEACYAKwADAAEECQAGACIAX0F1cmEgVGVzdCBHZW5lcmF0ZWRSZWd1bGFyQXVyYVRlc3RHZW5lcmF0ZWQAQQB1AHIAYQAgAFQAZQBzAHQAIABHAGUAbgBlAHIAYQB0AGUAZABSAGUAZwB1AGwAYQByAEEAdQByAGEAVABlAHMAdABHAGUAbgBlAHIAYQB0AGUAZAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAwAkADkASQBMAMAAAQAAAAoAJAAyAAJERkxUAA5sYXRuAA4ABAAAAAD//wABAAAAAWtlcm4ACAAAAAEAAAABAAQAAgAAAAEACAABAAwABAAAAAEAEgABAAEAAgABAAP/nAAAAAEAAAAKACQAMgACREZMVAAObGF0bgAOAAQAAAAA//8AAQAAAAFsaWdhAAgAAAABAAAAAQAEAAQAAAABAAgAAQASAAEACAABAAQABgACAAUAAQABAAQAAA==";
const fallback = "AAEAAAALAIAAAwAwR1NVQuMQ6+UAAATUAAAAlE9TLzJlAJnZAAABOAAAAGBjbWFwokK44AAAAbQAAABMZ2x5ZvjTWskAAAIcAAABNGhlYWQvC+5QAAAAvAAAADZoaGVhBE4CWgAAAPQAAAAkaG10eAImAAAAAAGYAAAAGmxvY2EB+AGyAAACAAAAABptYXhwAA4ACAAAARgAAAAgbmFtZeFXw54AAANQAAAA+XBvc3R0gJBZAAAETAAAAIUAAQAAAAEAAH04e91fDzz1AAED6AAAAADnDFV4AAAAAOcMVXgAKAAAAbcCgAAAAAMAAgAAAAAAAAABAAADIP84AAACJgAAAPoBLAABAAAAAAAAAAAAAAAAAAAAAQABAAAADAAGAAEAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMCJgGQAAUABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAQgAAAAAAAAAAAAAAD8/Pz8AAAAgThYDIP84AAADIADIAAAAAAAAAAAAAAAAAAAAIAABAiYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAOAAAAAoACAACAAIAIAYoBjNOFv//AAAAIAYnBjNOFv///+H52/nRse8AAQAAAAAAAAAAAAAAAAAOAA4AHAAqADgARgBUAGIAcAB+AIwAmgAAAAEAKAAAAVQCgAAFAAAzMxEzNSEobr7+1AJOMgABADoAAAFmAnIABQAAMzMRMzUhOm6+/tQCQDIAAQBDAAABbwJrAAUAADMzETM1IUNuvv7UAjkyAAEATAAAAXgCZAAFAAAzMxEzNSFMbr7+1AIyMgABAFUAAAGBAl0ABQAAMzMRMzUhVW6+/tQCKzIAAQBeAAABigJWAAUAADMzETM1IV5uvv7UAiQyAAEAZwAAAZMCTwAFAAAzMxEzNSFnbr7+1AIdMgABAHAAAAGcAkgABQAAMzMRMzUhcG6+/tQCFjIAAQB5AAABpQJBAAUAADMzETM1IXluvv7UAg8yAAEAggAAAa4COgAFAAAzMxEzNSGCbr7+1AIIMgABAIsAAAG3AjMABQAAMzMRMzUhi26+/tQCATIAAAAKAH4AAQAAAAAAAQASAAAAAQAAAAAAAgAHABIAAQAAAAAAAwAQABkAAQAAAAAABAASAAAAAQAAAAAABgAQABkAAwABBAkAAQAkACkAAwABBAkAAgAOAE0AAwABBAkAAwAgAFsAAwABBAkABAAkACkAAwABBAkABgAgAFtBdXJhIFRlc3QgRmFsbGJhY2tSZWd1bGFyQXVyYVRlc3RGYWxsYmFjawBBAHUAcgBhACAAVABlAHMAdAAgAEYAYQBsAGwAYgBhAGMAawBSAGUAZwB1AGwAYQByAEEAdQByAGEAVABlAHMAdABGAGEAbABsAGIAYQBjAGsAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAwECAQMBBAEFAQYBBwEIAQkBCgELBGFsZWYDYmVoBHNlZW4DY2prCGJlaC5pbml0CGJlaC5tZWRpCGJlaC5maW5hCXNlZW4uaW5pdAlzZWVuLm1lZGkJc2Vlbi5maW5hAAAAAAEAAAAKACgATgACREZMVAAOYXJhYgAOAAQAAAAA//8AAwAAAAEAAgADZmluYQAUaW5pdAAabWVkaQAgAAAAAQACAAAAAQAAAAAAAQABAAMACAAaACwAAQAAAAEACAACAC4AAgAGAAkAAQAAAAEACAACABwAAgAHAAoAAQAAAAEACAACAAoAAgAIAAsAAQACAAMABA==";

test.describe("native world text", () => {
  test.setTimeout(300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("renders shaped, fallback and updated text and exposes a disposable accessible counterpart", async ({ page }) => {
    const consumerRoot = process.env.A3D_INSTALLED_PACKAGE_ROOT;
    if (!consumerRoot) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must point to the frozen candidate consumer.");
    const bundle = await build({
      stdin: { contents: 'export * as engine from "@aura3d/engine"; export * as rendering from "@aura3d/rendering";',
        resolveDir: consumerRoot, sourcefile: "native-world-text-consumer.mjs", loader: "js" },
      bundle: true, write: false, format: "esm", platform: "browser",
      // Optional peers / node-only dynamic imports of the packed engine; see native-bundle-externals.ts.
      external: NATIVE_BUNDLE_EXTERNALS
    });
    await page.route(`${server.origin}/native-world-text-consumer.mjs`, (route) => route.fulfill({
      status: 200, contentType: "text/javascript", body: bundle.outputFiles[0]!.text
    }));
    await page.goto(`${server.origin}/tests/browser/root-sdf-text-g1-harness.html?capture=1`);
    const result = await page.evaluate(async ({ latinFont, fallbackFont }) => {
      const consumerPath = "/native-world-text-consumer.mjs";
      const { engine, rendering } = await import(consumerPath);
      const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const metadata = { family: "Aura independently authored test fixture", license: "CC0-1.0", licenseUrl: "https://spdx.org/licenses/CC0-1.0.html" };
      const font = await engine.loadFont({ data: bytes(latinFont), metadata });
      const fallbackFace = await engine.loadFont({ data: bytes(fallbackFont), metadata });
      const metrics = document.createElement("canvas").getContext("2d")!;
      metrics.font = `64px "${font.family}", "${fallbackFace.family}"`;
      metrics.fontKerning = "normal";
      const kernedWidth = metrics.measureText("AV").width;
      const unkernedWidth = metrics.measureText("A").width + metrics.measureText("V").width;
      const ligatureWidth = metrics.measureText("fi").width;
      const separateWidth = metrics.measureText("f").width + metrics.measureText("i").width;
      const fallbackWidth = metrics.measureText("世").width;
      const direction = rendering.shapeText("بسب", { font, fallbackFonts: [fallbackFace] }, metrics).lines[0]?.direction;
      const stage = document.querySelector<HTMLElement>("#mount")!;
      stage.style.cssText = "width:800px;height:400px";
      const atlas = new rendering.GlyphAtlas({ width: 16, height: 8 });
      atlas.acquire("a", { width: 4, height: 4, data: new Uint8Array(16).fill(20) });
      atlas.takeUpdates();
      atlas.update("a", { width: 4, height: 4, data: new Uint8Array(16).fill(200) });
      const updatedAtlasByte = atlas.takeUpdates()[0]?.data[0];
      atlas.release("a"); atlas.dispose();
      async function capture(text: string, nextText: string) {
        stage.replaceChildren();
        const label = engine.text3D(text, { font, fallbackFonts: [fallbackFace], size: 0.65, maxWidth: 3, name: "world-text" }).runtime({ id: "world-text" });
        const app = engine.createAuraApp(stage, {
          pixelRatio: 1, resize: false,
          renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
          scene: engine.scene().background("#000000")
            .add(engine.lights.ambient({ intensity: 1 }))
            .add(label.position(-1.2, 0, 0))
            .camera(engine.camera.perspective({ position: [0, 1, 4], target: [0, 0.5, 0], fov: 46 }))
        });
        try {
          await app.ready();
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          function read() {
            const gl = app.canvas?.getContext("webgl2", { preserveDrawingBuffer: true });
            if (!gl || !app.canvas) throw new Error("WebGL2 canvas unavailable");
            const pixels = new Uint8Array(app.canvas.width * app.canvas.height * 4);
            gl.readPixels(0, 0, app.canvas.width, app.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let hash = 0, lit = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              const value = (pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0);
              if (value > 20) lit += 1;
              hash = (hash + value * (i + 1)) % 1000000007;
            }
            return { hash, lit, backed: app.diagnostics().renderer?.text?.textPixelBacked,
              label: stage.querySelector("[data-aura-world-text-accessibility]")?.textContent ?? null,
              quads: app.diagnostics().renderer?.text?.quadCount ?? 0 };
          }
          const first = read();
          app.nodes.require("world-text").setText(nextText);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return { first, second: read() };
        } finally { app.dispose(); }
      }
      try {
        const { first, second } = await capture("AV fi\nبسب 世", "VAV\nسب 世");
        const cleaned = !stage.querySelector("[data-aura-world-text-accessibility]");
        return { first, second, cleaned, updatedAtlasByte, kernedWidth, unkernedWidth, ligatureWidth, separateWidth, fallbackWidth, direction };
      } finally { font.dispose(); fallbackFace.dispose(); }
    }, { latinFont: latin, fallbackFont: fallback });
    expect(result.first.backed).toBe(true);
    expect(result.first.lit).toBeGreaterThan(20);
    expect(result.first.quads).toBeGreaterThanOrEqual(2);
    expect(result.first.label).toBe("AV fi\nبسب 世");
    expect(result.second.label).toBe("VAV\nسب 世");
    expect(result.second.hash).not.toBe(result.first.hash);
    expect(result.cleaned).toBe(true);
    expect(result.updatedAtlasByte).toBe(200);
    expect(result.kernedWidth).toBeLessThan(result.unkernedWidth);
    expect(result.ligatureWidth).toBeLessThan(result.separateWidth);
    expect(result.fallbackWidth).toBeCloseTo(64 * 0.55, 0);
    expect(result.direction).toBe("rtl");
  });
});
