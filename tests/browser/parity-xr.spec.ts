import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * SC-04: `xr.button()` and `app.xr` against an INDEPENDENT WebXR implementation.
 *
 * The Immersive Web Emulation Runtime (iwer, MIT, Meta) is injected before the lab loads, so `navigator.xr`,
 * `XRSession`, `XRWebGLLayer`, the views and the XR frame loop all belong to the emulator, not to us. On the
 * remote runner it is installed in the Docker image (tools/remote-acr/Dockerfile.playwright); locally set
 * AURA3D_IWER_PATH. This is NOT a headset: it proves the session lifecycle, per-eye matrices and viewports,
 * framebuffer handling and cleanup against a second implementation of the WebXR API, nothing about optics,
 * latency, tracking quality or a real compositor.
 *
 * Pixel expectations are computed from the emulator's own view and projection matrices for the very frame that
 * was read back (the init script records them on every emulator frame), never from our code.
 */

const LAB = "/examples/xr-lab/";
const IWER_PATH = process.env.AURA3D_IWER_PATH ?? "/opt/iwer/node_modules/iwer/build/iwer.js";
/** Pixel tolerance between a measured cube centroid and the projection of its centre. */
const CENTROID_TOLERANCE_PX = 7;

type Vec3 = readonly [number, number, number];
interface ClassStats { readonly count: number; readonly cx: number; readonly cy: number }
interface Region { readonly x0: number; readonly x1: number; readonly red: ClassStats; readonly green: ClassStats; readonly magenta: ClassStats; readonly litPixels: number }
interface EmulatorView { readonly eye: string; readonly proj: readonly number[]; readonly world: readonly number[]; readonly inv: readonly number[] }
interface EmulatorFrame { readonly t: number; readonly position: readonly number[]; readonly views: readonly EmulatorView[] }
interface XRCapture { readonly width: number; readonly height: number; readonly glError: number; readonly left: Region; readonly right: Region; readonly full: Region; readonly viewCount: number; readonly emulator: EmulatorFrame | null; readonly sampleHash: number }
interface MonoCapture { readonly width: number; readonly height: number; readonly full: Region; readonly sampleHash: number }
interface LabState {
  readonly presenting: boolean; readonly mode: string | null; readonly canvasWidth: number; readonly canvasHeight: number;
  readonly renderFrame: number; readonly buttonLabel: string; readonly buttonState: string; readonly events: readonly string[];
  readonly xrFrames: number; readonly lastViewCount: number; readonly errors: readonly string[];
}
interface Api {
  captureXRFrame(): Promise<XRCapture>;
  monoCapture(): Promise<MonoCapture>;
  state(): LabState;
  readonly worldPoints: Record<"red" | "green" | "magenta", Vec3>;
}
type Win = {
  __AURA_XR_LAB__?: { status: string; errors: string[]; error?: string; routeHealth?: { parityIds: readonly string[] } };
  __AURA_XR_LAB_API__?: Api;
};

/** The emulator side: install iwer and record, per emulator frame, the views it handed to the page. */
const EMULATOR_GLUE = `
(() => {
  const { XRDevice, metaQuest3 } = window.IWER;
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  device.position.set(0, 1.6, 0);
  window.__IWER__ = device;
  window.__XR_RAF_COUNT__ = 0;
  let refSpace = null;
  const sysProto = window.XRSystem.prototype;
  const origRequest = sysProto.requestSession;
  sysProto.requestSession = async function (mode, init) {
    const session = await origRequest.call(this, mode, init);
    window.__XR_SESSION__ = session;
    session.requestReferenceSpace('local-floor').then((space) => { refSpace = space; });
    return session;
  };
  const sessProto = window.XRSession.prototype;
  const origRaf = sessProto.requestAnimationFrame;
  sessProto.requestAnimationFrame = function (callback) {
    return origRaf.call(this, (t, frame) => {
      window.__XR_RAF_COUNT__ += 1;
      if (refSpace) {
        const pose = frame.getViewerPose(refSpace);
        if (pose) {
          const p = pose.transform.position;
          window.__XR_LAST__ = {
            t,
            position: [p.x, p.y, p.z],
            views: pose.views.map((v) => ({
              eye: v.eye,
              proj: Array.from(v.projectionMatrix),
              world: Array.from(v.transform.matrix),
              inv: Array.from(v.transform.inverse.matrix)
            }))
          };
        }
      }
      return callback(t, frame);
    });
  };
})();
`;

const mulMV = (m: readonly number[], v: readonly [number, number, number, number]): [number, number, number, number] => {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let r = 0; r < 4; r += 1) out[r] = m[r]! * v[0] + m[4 + r]! * v[1] + m[8 + r]! * v[2] + m[12 + r]! * v[3];
  return out;
};

/** Where `point` lands, in absolute framebuffer pixels (origin bottom-left), for one emulator view. */
const project = (point: Vec3, view: EmulatorView, viewport: { x: number; width: number }, height: number): { x: number; y: number } => {
  const eye = mulMV(view.inv, [point[0], point[1], point[2], 1]);
  const clip = mulMV(view.proj, eye);
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  return { x: viewport.x + (ndcX * 0.5 + 0.5) * viewport.width, y: (ndcY * 0.5 + 0.5) * height };
};

/** iwer's `XRWebGLLayer.getViewport`: stereo splits the framebuffer into halves, left first. */
const viewportFor = (eye: string, width: number, stereo = true): { x: number; width: number } =>
  eye === "right" ? { x: width / 2, width: stereo ? width / 2 : 0 } : eye === "left" ? { x: 0, width: stereo ? width / 2 : width } : { x: 0, width };

const near = (actual: number, expected: number, tolerance: number, label: string): void =>
  expect.soft(Math.abs(actual - expected), `${label}: measured ${actual.toFixed(1)}, expected ${expected.toFixed(1)} +/- ${tolerance}`).toBeLessThanOrEqual(tolerance);

test.describe("parity WebXR against an independent emulator (SC-04)", () => {
  test.setTimeout(300_000);
  let server: ExampleDevServer;
  let iwerSource = "";
  let pageErrors: string[] = [];

  test.beforeAll(async () => {
    if (!existsSync(IWER_PATH)) {
      throw new Error(`iwer build not found at ${IWER_PATH}. On the remote runner it is installed by tools/remote-acr/Dockerfile.playwright; locally set AURA3D_IWER_PATH.`);
    }
    iwerSource = readFileSync(IWER_PATH, "utf8");
    expect(iwerSource).toContain("XRDevice");
    server = await startExampleDevServer();
  });
  test.afterAll(async () => { await server?.close(); });

  const openLab = async (page: Page, options: { stereo?: boolean } = {}) => {
    const errors: string[] = [];
    pageErrors = errors;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript({ content: `${iwerSource}\n;${EMULATOR_GLUE}` });
    // iwer defaults to a MONO device (zero-width right viewport); stereo must be asked for explicitly.
    await page.addInitScript({ content: `window.__IWER__.stereoEnabled = ${options.stereo === false ? "false" : "true"};` });
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const lab = (window as unknown as Win).__AURA_XR_LAB__;
      return lab?.status === "ready" || lab?.status === "error";
    }, undefined, { timeout: 120_000 });
    const lab = await page.evaluate(() => (window as unknown as Win).__AURA_XR_LAB__!);
    expect(lab.status, `lab failed: ${lab.error ?? errors.join(" | ")}`).toBe("ready");
    expect(lab.routeHealth?.parityIds).toEqual(["SC-04"]);
    const call = <T>(fn: (api: Api) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.__AURA_XR_LAB_API__)`) as Promise<T>;
    const button = page.locator("button[data-xr-state]");
    await expect(button).toHaveAttribute("data-xr-state", /ready|unsupported|presenting/, { timeout: 30_000 });
    return { errors, call, button };
  };

  /**
   * Leave through the button's own handler. While a session is active iwer covers the page with its overlay
   * container, so a pointer click on the STOP button is intercepted by the emulator, not by a bug of ours.
   */
  const leave = (button: ReturnType<Page["locator"]>) => button.evaluate((element) => (element as HTMLButtonElement).click());

  const enter = async (page: Page, call: <T>(fn: (api: Api) => T | Promise<T>) => Promise<T>, button: ReturnType<Page["locator"]>) => {
    await button.click();
    try {
      await page.waitForFunction(() => (window as unknown as Win).__AURA_XR_LAB_API__?.state().presenting === true, undefined, { timeout: 60_000 });
    } catch (error) {
      const diagnostic = await page.evaluate(`(() => ({
        state: window.__AURA_XR_LAB_API__ && window.__AURA_XR_LAB_API__.state(),
        buttonText: document.querySelector('button[data-xr-state]') && document.querySelector('button[data-xr-state]').textContent,
        buttonTitle: document.querySelector('button[data-xr-state]') && document.querySelector('button[data-xr-state]').title,
        buttonState: document.querySelector('button[data-xr-state]') && document.querySelector('button[data-xr-state]').getAttribute('data-xr-state'),
        hasSession: typeof window.__XR_SESSION__ !== 'undefined',
        xrIsIwer: typeof window.__IWER__ === 'object' && navigator.xr instanceof window.XRSystem,
        layerCtor: typeof window.XRWebGLLayer
      }))()`).catch((e: unknown) => ({ diagnosticFailed: String(e) }));
      throw new Error(`xr session did not start: ${JSON.stringify(diagnostic)} pageErrors=${JSON.stringify(pageErrors.slice(0, 8))} cause=${(error as Error).message}`);
    }
    // A few real frames first so temporal history and the emulator's own session settle.
    await page.waitForFunction(() => ((window as unknown as Win).__AURA_XR_LAB_API__?.state().xrFrames ?? 0) >= 4, undefined, { timeout: 120_000 });
    return call((api) => api.state());
  };

  const checkEye = (capture: XRCapture, world: Record<"red" | "green" | "magenta", Vec3>, label: string, stereo = true): void => {
    const frame = capture.emulator;
    expect(frame, `${label}: the emulator reported no frame`).not.toBeNull();
    const views = frame!.views;
    for (const view of views) {
      const viewport = viewportFor(view.eye, capture.width, stereo);
      if (viewport.width <= 0) continue;
      const region = (view.eye === "right" ? capture.right : capture.left);
      for (const key of ["red", "green", "magenta"] as const) {
        const expected = project(world[key], view, viewport, capture.height);
        // A mono left eye spans both halves, so measure the whole buffer; stereo eyes own one half each.
        const stats = stereo ? region[key] : capture.full[key];
        expect.soft(stats.count, `${label}/${view.eye}/${key}: no pixels of this cube were rendered`).toBeGreaterThan(20);
        if (stats.count > 20) {
          near(stats.cx, expected.x, CENTROID_TOLERANCE_PX, `${label}/${view.eye}/${key} x`);
          near(stats.cy, expected.y, CENTROID_TOLERANCE_PX, `${label}/${view.eye}/${key} y`);
        }
      }
    }
  };

  test("the button reports ENTER VR for the emulated headset", async ({ page }) => {
    const { call, button } = await openLab(page);
    await expect(button).toHaveAttribute("data-xr-state", "ready");
    await expect(button).toHaveText("ENTER VR");
    const state = await call((api) => api.state());
    expect(state.presenting).toBe(false);
    expect(state.events).toEqual([]);
    const supported = await page.evaluate(`(async () => { const xr = navigator.xr; return { isIwer: typeof window.__IWER__ === "object", vr: await xr.isSessionSupported("immersive-vr"), ar: await xr.isSessionSupported("immersive-ar") }; })()`) as { isIwer: boolean; vr: boolean; ar: boolean };
    test.info().annotations.push({ type: "emulator-support", description: JSON.stringify(supported) });
    expect(supported.isIwer).toBe(true);
    expect(supported.vr).toBe(true);
  });

  test("clicking starts an immersive-vr session; frames carry two views through the emulator's XRWebGLLayer", async ({ page }) => {
    const { call, button, errors } = await openLab(page);
    const before = await call((api) => api.state());
    const state = await enter(page, call, button);
    expect(state.mode).toBe("immersive-vr");
    expect(state.events).toContain("sessionstart:immersive-vr");
    expect(state.buttonLabel).toBe("STOP");
    expect(state.lastViewCount).toBe(2);
    // The emulator resized the app canvas to the window and owns it for the session.
    const windowSize = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    expect(state.canvasWidth).toBe(windowSize.w);
    expect(state.canvasHeight).toBe(windowSize.h);
    expect(state.canvasWidth).not.toBe(before.canvasWidth);

    const layer = await page.evaluate(`(() => { const s = window.__XR_SESSION__; const l = s.renderState.baseLayer; return { ctor: l.constructor.name, framebufferIsNull: l.framebuffer === null, fbw: l.framebufferWidth, fbh: l.framebufferHeight, mode: s.visibilityState }; })()`) as { ctor: string; framebufferIsNull: boolean; fbw: number; fbh: number; mode: string };
    test.info().annotations.push({ type: "emulator-layer", description: JSON.stringify(layer) });
    expect(layer.ctor).toBe("XRWebGLLayer");
    expect(layer.framebufferIsNull).toBe(true);
    expect(layer.fbw).toBe(state.canvasWidth);

    // Frame cadence as the EMULATOR sees it: its own callbacks keep arriving and the app keeps rendering.
    const t0 = await page.evaluate(() => ({ raf: (window as unknown as { __XR_RAF_COUNT__: number }).__XR_RAF_COUNT__, at: performance.now() }));
    await page.waitForFunction((start) => (window as unknown as { __XR_RAF_COUNT__: number }).__XR_RAF_COUNT__ >= start + 6, t0.raf, { timeout: 120_000 });
    const t1 = await page.evaluate(() => ({ raf: (window as unknown as { __XR_RAF_COUNT__: number }).__XR_RAF_COUNT__, at: performance.now() }));
    const fps = ((t1.raf - t0.raf) * 1000) / (t1.at - t0.at);
    test.info().annotations.push({ type: "emulator-frame-cadence", description: `${t1.raf - t0.raf} frames in ${(t1.at - t0.at).toFixed(0)} ms = ${fps.toFixed(1)} fps (software WebGL2)` });
    const after = await call((api) => api.state());
    expect(after.xrFrames).toBeGreaterThan(state.xrFrames);
    expect(after.lastViewCount).toBe(2);
    expect(after.errors).toEqual([]);
    const capture = await call((api) => api.captureXRFrame());
    expect(capture.glError).toBe(0);
    expect(capture.viewCount).toBe(2);
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });

  test("each eye renders into its own half at the emulator's matrices (centroids match the emulator's projection)", async ({ page }) => {
    const { call, button } = await openLab(page);
    await enter(page, call, button);
    const world = await call((api) => api.worldPoints);
    const capture = await call((api) => api.captureXRFrame());
    expect(capture.glError).toBe(0);
    expect(capture.emulator?.views.map((v) => v.eye)).toEqual(["left", "right"]);
    checkEye(capture, world, "pose0");

    // The two halves are different images (parallax), and both carry content.
    expect(capture.left.litPixels).toBeGreaterThan(200);
    expect(capture.right.litPixels).toBeGreaterThan(200);
    const disparity = (key: "red" | "green" | "magenta") => capture.left[key].cx - (capture.right[key].cx - capture.width / 2);
    const view0 = capture.emulator!.views[0]!;
    const ipd = Math.abs(capture.emulator!.views[1]!.world[12]! - view0.world[12]!);
    const focalPx = view0.proj[0]! * (capture.width / 2) / 2;
    const expectedDisparity = (z: number) => (focalPx * ipd) / z;
    test.info().annotations.push({ type: "parallax", description: JSON.stringify({ ipd, focalPx, red: disparity("red"), magenta: disparity("magenta"), expectedRed: expectedDisparity(3), expectedMagenta: expectedDisparity(1.5) }) });
    near(disparity("magenta"), expectedDisparity(1.5), 5, "magenta disparity");
    near(disparity("red"), expectedDisparity(3), 5, "red disparity");
    expect(disparity("magenta")).toBeGreaterThan(disparity("red"));
    // Nothing leaks across the seam: each half only holds its own eye's cubes.
    expect(capture.left.red.cx).toBeLessThan(capture.width / 2);
    expect(capture.right.green.cx).toBeGreaterThan(capture.width / 2);
  });

  test("moving or turning the emulated headset changes each eye's pixels as the emulator's new matrices predict", async ({ page }) => {
    const { call, button } = await openLab(page);
    await enter(page, call, button);
    const world = await call((api) => api.worldPoints);
    const before = await call((api) => api.captureXRFrame());
    checkEye(before, world, "pose0");

    const setPose = (x: number, yaw: number) => page.evaluate(({ x, yaw }) => {
      const device = (window as unknown as { __IWER__: { position: { set(x: number, y: number, z: number): void }; quaternion: { set(x: number, y: number, z: number, w: number): void } } }).__IWER__;
      device.position.set(x, 1.6, 0);
      device.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    }, { x, yaw });
    const captureAt = async (x: number) => {
      let capture = await call((api) => api.captureXRFrame());
      for (let attempt = 0; attempt < 12 && Math.abs((capture.emulator?.position[0] ?? 0) - x) > 1e-3; attempt += 1) {
        capture = await call((api) => api.captureXRFrame());
      }
      expect(capture.emulator?.position[0]).toBeCloseTo(x, 3);
      return capture;
    };
    const moved = (a: XRCapture, b: XRCapture, label: string) => {
      for (const key of ["red", "green", "magenta"] as const) {
        for (const side of ["left", "right"] as const) {
          expect.soft(Math.abs(b[side][key].cx - a[side][key].cx), `${label}: ${side}/${key} should shift`).toBeGreaterThan(15);
        }
      }
      expect(b.sampleHash).not.toBe(a.sampleHash);
      expect(b.glError).toBe(0);
    };

    // Translation only: near and far cubes shift by different amounts (parallax) and both eyes follow the emulator.
    await setPose(0.5, 0);
    const translated = await captureAt(0.5);
    checkEye(translated, world, "translated");
    moved(before, translated, "translate");

    // Rotation only: everything slides sideways in both eyes.
    await setPose(0, 0.15);
    const turned = await captureAt(0);
    checkEye(turned, world, "turned");
    moved(before, turned, "yaw");
    test.info().annotations.push({ type: "pose-shift", description: JSON.stringify({ magentaLeft: [before.left.magenta.cx, translated.left.magenta.cx, turned.left.magenta.cx], redLeft: [before.left.red.cx, translated.left.red.cx, turned.left.red.cx] }) });
  });

  test("leaving the session restores the canvas, the full viewport and the normal loop", async ({ page }) => {
    const { call, button } = await openLab(page);
    const baselineState = await call((api) => api.state());
    const baseline = await call((api) => api.monoCapture());
    expect(baseline.full.red.count).toBeGreaterThan(20);

    await enter(page, call, button);
    await call((api) => api.captureXRFrame());
    await leave(button);
    await page.waitForFunction(() => (window as unknown as Win).__AURA_XR_LAB_API__?.state().presenting === false, undefined, { timeout: 60_000 });
    const left = await call((api) => api.state());
    expect(left.events).toEqual(["sessionstart:immersive-vr", "sessionend:immersive-vr"]);
    expect(left.canvasWidth).toBe(baselineState.canvasWidth);
    expect(left.canvasHeight).toBe(baselineState.canvasHeight);
    await expect(button).toHaveText("ENTER VR");
    expect(left.errors).toEqual([]);

    // The app's own loop is running again.
    await page.waitForFunction((frame) => ((window as unknown as Win).__AURA_XR_LAB_API__?.state().renderFrame ?? 0) >= frame + 3, left.renderFrame, { timeout: 60_000 });
    // ... and renders the full canvas again: same cubes, same places as before the session.
    const restored = await call((api) => api.monoCapture());
    expect(restored.width).toBe(baseline.width);
    expect(restored.height).toBe(baseline.height);
    for (const key of ["red", "green", "magenta"] as const) {
      const a = baseline.full[key];
      const b = restored.full[key];
      expect.soft(b.count, `${key} pixel count after the session`).toBeGreaterThan(a.count * 0.85);
      expect.soft(b.count, `${key} pixel count after the session`).toBeLessThan(a.count * 1.15);
      near(b.cx, a.cx, 3, `${key} x after the session`);
      near(b.cy, a.cy, 3, `${key} y after the session`);
    }
    test.info().annotations.push({ type: "restore", description: JSON.stringify({ baselineRed: baseline.full.red, restoredRed: restored.full.red, canvas: [left.canvasWidth, left.canvasHeight] }) });
  });

  test("a second session after leaving works (enter, leave, enter again)", async ({ page }) => {
    const { call, button, errors } = await openLab(page);
    const world = await call((api) => api.worldPoints);
    await enter(page, call, button);
    await leave(button);
    await page.waitForFunction(() => (window as unknown as Win).__AURA_XR_LAB_API__?.state().presenting === false, undefined, { timeout: 60_000 });
    await expect(button).toHaveAttribute("data-xr-state", "ready");
    const firstFrames = (await call((api) => api.state())).xrFrames;
    await enter(page, call, button);
    const state = await call((api) => api.state());
    expect(state.events).toEqual(["sessionstart:immersive-vr", "sessionend:immersive-vr", "sessionstart:immersive-vr"]);
    expect(state.xrFrames).toBeGreaterThan(firstFrames);
    const capture = await call((api) => api.captureXRFrame());
    expect(capture.glError).toBe(0);
    expect(capture.viewCount).toBe(2);
    checkEye(capture, world, "second-session");
    expect(state.errors).toEqual([]);
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });

  test("a mono emulated device (zero-width right viewport) renders the left eye full width without GL errors", async ({ page }) => {
    const { call, button } = await openLab(page, { stereo: false });
    await enter(page, call, button);
    const world = await call((api) => api.worldPoints);
    const capture = await call((api) => api.captureXRFrame());
    const views = capture.emulator?.views ?? [];
    test.info().annotations.push({ type: "mono-views", description: JSON.stringify(views.map((v) => v.eye)) });
    expect(capture.glError).toBe(0);
    checkEye(capture, world, "mono", false);
    // Only the left view has pixels; the zero-width right view is skipped, not rendered and not an error.
    expect(capture.viewCount).toBe(1);
    expect((await call((api) => api.state())).errors).toEqual([]);
  });

  test("the lab and spec do not reach into our rendering internals or three", async () => {
    const source = readFileSync("examples/xr-lab/main.ts", "utf8");
    expect(source).toContain("xr.button(");
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toMatch(/@aura3d\/rendering/);
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);
  });
});
