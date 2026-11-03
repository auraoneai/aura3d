import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WP-21 browser acceptance, run only after the global CODE_COMPLETE_GO gate.
 * The empty, same-origin page lets this test exercise the public source entry
 * without adding test-only state to the engine or using a deployed service.
 */
test.describe("native app isolation", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("a failing app and an unowned load do not alter a live app or notify either app", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`, { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(async () => {
      const moduleUrl = "/packages/engine/src/public/index.ts";
      const engine = await import(moduleUrl) as typeof import("@aura3d/engine");
      const scene = (name: string, color: string) => engine.scene()
        .background("#05070b")
        .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(engine.lights.directional({ intensity: 3 }).position(2, 3, 4))
        .add(engine.primitives.box({ name, material: engine.material.pbr({ color, roughness: 0.4 }) }));
      const canvas = () => {
        const element = document.createElement("canvas");
        element.width = 256;
        element.height = 256;
        document.body.append(element);
        return element;
      };
      const healthyCanvas = canvas();
      const deniedCanvas = canvas();
      const original = deniedCanvas.getContext.bind(deniedCanvas);
      Object.defineProperty(deniedCanvas, "getContext", {
        configurable: true,
        value: (id: string, ...args: unknown[]) => id === "webgl2" || id === "webgl"
          ? null
          : (original as (...values: unknown[]) => unknown)(id, ...args)
      });
      const healthyEvents: string[] = [];
      const deniedEvents: string[] = [];
      const healthy = engine.createAuraApp(healthyCanvas, {
        scene: scene("healthy subject", "#46d6d1"),
        strict: true,
        quality: "safe-basic",
        qualityRebuild: { flags: { A3D_QR_CORE: true }, allowUrlFlags: false },
        pixelRatio: 1,
        autoStart: false,
        resize: false,
        onAssetProgress: () => healthyEvents.push("progress"),
        onAssetError: () => healthyEvents.push("error")
      });
      const denied = engine.createAuraApp(deniedCanvas, {
        scene: scene("denied subject", "#eb8b50"),
        strict: false,
        quality: "production",
        qualityRebuild: { flags: { A3D_QR_CORE: false }, allowUrlFlags: false },
        pixelRatio: 1,
        autoStart: false,
        resize: false,
        onAssetProgress: () => deniedEvents.push("progress"),
        onAssetError: () => deniedEvents.push("error")
      });

      const countSubjectPixels = async (): Promise<number> => {
        const gl = healthyCanvas.getContext("webgl2");
        if (!gl) throw new Error("The healthy app did not acquire WebGL2.");
        for (let frame = 0; frame < 90; frame += 1) {
          healthy.step(1 / 60);
          const pixels = new Uint8Array(healthyCanvas.width * healthyCanvas.height * 4);
          gl.readPixels(0, 0, healthyCanvas.width, healthyCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          let different = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (Math.abs(pixels[index]! - pixels[0]!) + Math.abs(pixels[index + 1]! - pixels[1]!) + Math.abs(pixels[index + 2]! - pixels[2]!) > 16) different += 1;
          }
          if (different > 300) return different;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        return 0;
      };

      try {
        const [healthyReady, deniedReady] = await Promise.all([
          healthy.readiness({ stage: "renderer" }), denied.readiness({ stage: "renderer" })
        ]);
        const beforePixels = await countSubjectPixels();
        const healthyBefore = healthy.diagnostics();
        const deniedDiagnostics = denied.diagnostics();
        // A free-standing request has no app owner. A failure must not be
        // broadcast to whichever apps happen to be registered at the time.
        let loadRejected = false;
        try { await engine.texture.load(`/__aura3d_missing_unowned_${Date.now()}.png`); }
        catch { loadRejected = true; }
        denied.dispose();
        const afterPixels = await countSubjectPixels();
        const healthyAfter = healthy.diagnostics();
        return {
          healthyReady, deniedReady, beforePixels, afterPixels,
          healthyBeforeErrors: healthyBefore.errors,
          healthyAfterErrors: healthyAfter.errors,
          deniedErrors: deniedDiagnostics.errors,
          healthyPath: healthyAfter.renderPath?.path,
          healthyNode: Boolean(healthy.nodes.get("healthy subject")),
          healthyEvents, deniedEvents, loadRejected
        };
      } finally {
        await Promise.all([healthy.disposeAsync(), denied.disposeAsync()]);
        healthyCanvas.remove();
        deniedCanvas.remove();
      }
    });

    expect(result.healthyReady).toEqual({ state: "ready", stage: "renderer", backend: "webgl2" });
    expect(result.deniedReady.state).toBe("failed");
    expect(result.deniedErrors.length).toBeGreaterThan(0);
    expect(result.healthyBeforeErrors).toEqual([]);
    expect(result.healthyAfterErrors).toEqual([]);
    expect(result.healthyPath).toBe("direct");
    expect(result.healthyNode).toBe(true);
    expect(result.beforePixels).toBeGreaterThan(300);
    expect(result.afterPixels).toBeGreaterThan(300);
    expect(result.loadRejected).toBe(true);
    expect(result.healthyEvents).toEqual([]);
    expect(result.deniedEvents).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("concurrent app-owned texture requests deliver progress and errors only to their owner", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`, { waitUntil: "domcontentloaded" });
    // Generate the fixture in the browser from independent pixel values. The
    // route responds locally and makes failures and shared loads deterministic.
    const pngDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas2D is required to create the test texture.");
      context.fillStyle = "#c53a92";
      context.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/png");
    });
    const png = Buffer.from(pngDataUrl.slice(pngDataUrl.indexOf(",") + 1), "base64");
    await page.route("**/__wp21_*.png*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes("fail")) {
        await route.fulfill({ status: 404, contentType: "text/plain", body: "fixture unavailable" });
      } else {
        await route.fulfill({ status: 200, contentType: "image/png", headers: { "content-length": String(png.length) }, body: png });
      }
    });
    const result = await page.evaluate(async () => {
      const moduleUrl = "/packages/engine/src/public/index.ts";
      const engine = await import(moduleUrl) as typeof import("@aura3d/engine");
      const build = () => engine.scene()
        .background("#05070b")
        .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(engine.lights.directional({ intensity: 3 }).position(2, 3, 4))
        .add(engine.primitives.box({ material: engine.material.pbr({ color: "#9fcce0" }) }));
      const canvas = () => {
        const element = document.createElement("canvas");
        element.width = element.height = 128;
        document.body.append(element);
        return element;
      };
      type EventRecord = { type: "progress" | "error"; url: string; detail: string };
      const aEvents: EventRecord[] = [];
      const bEvents: EventRecord[] = [];
      const handlers = (events: EventRecord[]) => ({
        onAssetProgress: (event: { url?: string; loaded: number }) => events.push({ type: "progress", url: event.url ?? "", detail: String(event.loaded) }),
        onAssetError: (event: { url?: string; message?: string; error: unknown }) => events.push({ type: "error", url: event.url ?? "", detail: `${event.message ?? ""} ${event.error instanceof Error ? event.error.message : String(event.error)}` })
      });
      const aCanvas = canvas();
      const bCanvas = canvas();
      const appA = engine.createAuraApp(aCanvas, { scene: build(), autoStart: false, resize: false, pixelRatio: 1, ...handlers(aEvents) });
      const appB = engine.createAuraApp(bCanvas, { scene: build(), autoStart: false, resize: false, pixelRatio: 1, ...handlers(bEvents) });
      const nativeFetch = window.fetch;
      try {
        const ready = await Promise.all([appA.readiness(), appB.readiness()]);
        const textures = await Promise.all([
          engine.texture.load("/__wp21_shared.png", { app: appA }),
          engine.texture.load("/__wp21_shared.png", { app: appB }),
          engine.texture.load("/__wp21_owner_a.png", { app: appA }),
          engine.texture.load("/__wp21_owner_b.png", { app: appB })
        ]);
        textures.forEach((texture) => texture.dispose());
        const failures = await Promise.allSettled([
          engine.texture.load("/__wp21_fail_a.png?token=private-test-secret", { app: appA }),
          engine.texture.load("/__wp21_fail_b.png?token=private-test-secret", { app: appB })
        ]);
        let releaseLate: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => { releaseLate = resolve; });
        window.fetch = async (input, init) => {
          if (String(input).includes("__wp21_late_fail_a.png")) await gate;
          return nativeFetch.call(window, input, init);
        };
        const late = engine.texture.load("/__wp21_late_fail_a.png", { app: appA }).catch(() => undefined);
        const beforeDispose = aEvents.length;
        appA.dispose();
        releaseLate();
        await late;
        await engine.texture.load("/__wp21_fail_b_again.png", { app: appB }).catch(() => undefined);
        return { ready, failureStates: failures.map((failure) => failure.status), aEvents, bEvents, beforeDispose, afterDispose: aEvents.length };
      } finally {
        window.fetch = nativeFetch;
        await Promise.all([appA.disposeAsync(), appB.disposeAsync()]);
        aCanvas.remove();
        bCanvas.remove();
      }
    });
    expect(result.ready.map((outcome) => outcome.state)).toEqual(["ready", "ready"]);
    expect(result.failureStates).toEqual(["rejected", "rejected"]);
    const urls = (events: typeof result.aEvents, type: "progress" | "error") => events.filter((event) => event.type === type).map((event) => event.url);
    expect(urls(result.aEvents, "progress")).toEqual(expect.arrayContaining([expect.stringContaining("__wp21_shared.png"), expect.stringContaining("__wp21_owner_a.png")]));
    expect(urls(result.bEvents, "progress")).toEqual(expect.arrayContaining([expect.stringContaining("__wp21_shared.png"), expect.stringContaining("__wp21_owner_b.png")]));
    expect(urls(result.aEvents, "error")).toHaveLength(1);
    expect(urls(result.aEvents, "error")[0]).toContain("__wp21_fail_a.png");
    expect(urls(result.bEvents, "error")).toHaveLength(2);
    expect(urls(result.bEvents, "error").join(" ")).toContain("__wp21_fail_b.png");
    expect(urls(result.bEvents, "error").join(" ")).toContain("__wp21_fail_b_again.png");
    expect(JSON.stringify(result.aEvents)).not.toContain("__wp21_owner_b.png");
    expect(JSON.stringify(result.bEvents)).not.toContain("__wp21_owner_a.png");
    expect(JSON.stringify([result.aEvents, result.bEvents])).not.toContain("private-test-secret");
    expect(result.afterDispose).toBe(result.beforeDispose);
    expect(pageErrors).toEqual([]);
  });

  test("strict color policy stays with its app after another app is created", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/parity-audio-harness.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async () => {
      const moduleUrl = "/packages/engine/src/public/index.ts";
      const engine = await import(moduleUrl) as typeof import("@aura3d/engine");
      const build = (color: string) => engine.scene()
        .background("#05070b")
        .camera(engine.camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 45 }))
        .add(engine.lights.directional({ intensity: 3 }).position(2, 3, 4))
        .add(engine.primitives.box({ name: "subject", material: engine.material.pbr({ color }) }));
      const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 192;
        document.body.append(canvas);
        return canvas;
      };
      const strictCanvas = makeCanvas();
      const permissiveCanvas = makeCanvas();
      const common = { autoStart: false, resize: false, pixelRatio: 1, qualityRebuild: { flags: { A3D_QR_CORE: true }, allowUrlFlags: false } } as const;
      const strictApp = engine.createAuraApp(strictCanvas, { ...common, strict: true, scene: build("#55c9f0") });
      const permissiveApp = engine.createAuraApp(permissiveCanvas, { ...common, strict: false, scene: build("#f0a055") });
      try {
        const initial = await Promise.all([strictApp.readiness(), permissiveApp.readiness()]);
        // The second app was constructed last. It must not switch the first
        // app's later compilation to the permissive parser.
        strictApp.setScene(build("not-a-css-color-for-strict-app"));
        const strictResult = await strictApp.readiness();
        permissiveApp.setScene(build("not-a-css-color-for-permissive-app"));
        const permissiveResult = await permissiveApp.readiness();
        for (let frame = 0; frame < 90; frame += 1) {
          permissiveApp.step(1 / 60);
          if (permissiveApp.diagnostics().drawCalls > 0) break;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        return {
          initial,
          strictResult,
          permissiveResult,
          strictErrors: strictApp.diagnostics().errors,
          permissiveErrors: permissiveApp.diagnostics().errors,
          permissiveDrawCalls: permissiveApp.diagnostics().drawCalls
        };
      } finally {
        await Promise.all([strictApp.disposeAsync(), permissiveApp.disposeAsync()]);
        strictCanvas.remove();
        permissiveCanvas.remove();
      }
    });
    expect(result.initial.map((outcome) => outcome.state)).toEqual(["ready", "ready"]);
    expect(result.strictResult.state).toBe("failed");
    expect(result.strictErrors.length).toBeGreaterThan(0);
    expect(result.permissiveResult.state).toBe("ready");
    expect(result.permissiveErrors).toEqual([]);
    expect(result.permissiveDrawCalls).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
  });
});
