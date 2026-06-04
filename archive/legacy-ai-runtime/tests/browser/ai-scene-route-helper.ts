import { expect, type Page } from "@playwright/test";

export interface AISceneRuntimeProbe {
  readonly status?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly mode?: string;
  readonly frameCount?: number;
  readonly drawCalls?: number;
  readonly ir?: {
    readonly sceneId?: string;
    readonly objects?: readonly unknown[];
    readonly provenance?: { readonly patchCount?: number };
  } | null;
  readonly diagnostics?: {
    readonly selectedBackend?: string;
    readonly placeholders?: readonly string[];
    readonly warnings?: readonly string[];
  } | null;
  readonly patchHistory?: readonly {
    readonly operations?: readonly { readonly type?: string }[];
  }[];
}

export async function waitForAISceneRuntime(page: Page): Promise<AISceneRuntimeProbe> {
  await page.waitForFunction(() => {
    const runtime = window.__AURA3D_AI_SCENE_PROMPT_LAB__ ?? window.__AURA3D_AI_SCENE_SHOWCASE__;
    return runtime?.status === "ready" && (runtime.frameCount ?? 0) >= 2 && (runtime.drawCalls ?? 0) > 0;
  }, undefined, { timeout: 20_000 });
  return page.evaluate(() => window.__AURA3D_AI_SCENE_PROMPT_LAB__ ?? window.__AURA3D_AI_SCENE_SHOWCASE__);
}

export async function expectAISceneRouteReady(page: Page, path: string, expectedTitle: string): Promise<AISceneRuntimeProbe> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const runtime = await waitForAISceneRuntime(page);
  await expect(page.locator("h1")).toContainText(expectedTitle);
  expect(runtime.status).toBe("ready");
  expect(runtime.provider).toBe("MockProvider");
  expect(runtime.model).toContain("aura-scene-mock");
  expect(runtime.drawCalls ?? 0).toBeGreaterThan(0);
  expect(runtime.ir?.objects?.length ?? 0).toBeGreaterThan(0);
  expect(runtime.diagnostics?.selectedBackend).toBe("canvas2d-previs");
  return runtime;
}

declare global {
  interface Window {
    __AURA3D_AI_SCENE_PROMPT_LAB__?: AISceneRuntimeProbe;
    __AURA3D_AI_SCENE_SHOWCASE__?: AISceneRuntimeProbe;
  }
}
