import type { CartoonRenderQueueItem, CartoonViewport } from "./CartoonRenderQueue.js";
import type { PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface BrowserFrameCapturePageLike {
  goto?(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number }): Promise<unknown>;
  setViewportSize?(size: { width: number; height: number }): Promise<unknown>;
  waitForSelector?(selector: string, options?: { timeout?: number }): Promise<unknown>;
  evaluate?<T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]): Promise<T>;
  screenshot?(options?: { path?: string; type?: "png" | "jpeg"; fullPage?: boolean }): Promise<Uint8Array>;
  locator?(selector: string): { first(): { screenshot(options?: { path?: string; type?: "png" | "jpeg" }): Promise<Uint8Array> } };
}

export interface BrowserFrameCaptureRequest {
  readonly route: string;
  readonly item: CartoonRenderQueueItem;
  readonly viewport: CartoonViewport;
  readonly selector?: string | undefined;
  readonly outputPath?: string | undefined;
  readonly waitUntil?: "load" | "domcontentloaded" | "networkidle" | undefined;
  readonly timeoutMs?: number | undefined;
  readonly deviceScaleFactor?: number | undefined;
}

export interface BrowserFrameCaptureResult {
  readonly kind: "browser-frame-capture";
  readonly route: string;
  readonly frame: number;
  readonly time: PromptAnimationSeconds;
  readonly viewport: CartoonViewport;
  readonly selector: string;
  readonly deviceScaleFactor: number;
  readonly deterministic: boolean;
  readonly outputPath?: string | undefined;
  readonly byteLength: number;
  readonly image?: Uint8Array | undefined;
}

export interface BrowserFrameCaptureAdapter {
  capture(request: BrowserFrameCaptureRequest): Promise<BrowserFrameCaptureResult>;
}

export interface CreateBrowserFrameCaptureAdapterOptions {
  readonly page: BrowserFrameCapturePageLike;
  readonly defaultSelector?: string | undefined;
  readonly defaultWaitUntil?: "load" | "domcontentloaded" | "networkidle" | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  readonly deviceScaleFactor?: number | undefined;
}

export function createBrowserFrameCaptureAdapter(options: CreateBrowserFrameCaptureAdapterOptions): BrowserFrameCaptureAdapter {
  return {
    async capture(request) {
      const selector = request.selector ?? options.defaultSelector ?? "canvas";
      const waitUntil = request.waitUntil ?? options.defaultWaitUntil ?? "networkidle";
      const timeoutMs = request.timeoutMs ?? options.defaultTimeoutMs ?? 10_000;
      const deviceScaleFactor = request.deviceScaleFactor ?? options.deviceScaleFactor ?? 1;
      await options.page.setViewportSize?.({
        width: request.viewport.width,
        height: request.viewport.height
      });
      await options.page.goto?.(routeWithFrameTime(request.route, request.item.time), { waitUntil, timeout: timeoutMs });
      await options.page.waitForSelector?.(selector, { timeout: timeoutMs });
      await options.page.evaluate?.((time) => {
        const global = globalThis as unknown as {
          __AURA3D_CARTOON_EPISODE_SEEK__?: (time: number) => void;
          __AURA3D_CARTOON_TEMPLATE__?: { sampleAt?(time: number): unknown };
        };
        global.__AURA3D_CARTOON_EPISODE_SEEK__?.(time as number);
        global.__AURA3D_CARTOON_TEMPLATE__?.sampleAt?.(time as number);
      }, request.item.time);
      const image = options.page.locator
        ? await options.page.locator(selector).first().screenshot({ path: request.outputPath, type: "png" })
        : await options.page.screenshot?.({ path: request.outputPath, type: "png", fullPage: false });
      return {
        kind: "browser-frame-capture",
        route: request.route,
        frame: request.item.frame,
        time: request.item.time,
        viewport: request.viewport,
        selector,
        deviceScaleFactor,
        deterministic: true,
        ...(request.outputPath ? { outputPath: request.outputPath } : {}),
        byteLength: image?.byteLength ?? 0,
        ...(image ? { image } : {})
      };
    }
  };
}

export function routeWithFrameTime(route: string, time: PromptAnimationSeconds): string {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}auraFrameTime=${encodeURIComponent(String(time))}`;
}
