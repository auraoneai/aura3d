import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("character animation viewer", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads and renders a real skinned CesiumMan glTF animation with timeline controls", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/character-animation-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.status === "ready" || window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    await page.waitForFunction(
      () => Number(window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.changedPixels ?? 0) > 20,
      undefined,
      { timeout: 12_000 }
    );

    const running = await page.evaluate(() => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__);
    expect(errors).toEqual([]);
    expect(running?.status, running?.error).toBe("ready");
    expect(running?.renderer).toBe("webgl2");
    expect(running?.assetId).toBe("cesium-man");
    expect(running?.meshName).toBe("Cesium_Man");
    expect(running?.clipName).toBe("animation-0");
    expect(running?.playbackSpeed).toBe(1);
    expect(running?.loopMode).toBe("repeat");
    expect(running?.vertexCount).toBe(3273);
    expect(Number(running?.indexCount ?? 0)).toBeGreaterThan(10_000);
    expect(running?.jointCount).toBe(19);
    expect(running?.trackCount).toBe(57);
    expect(running?.drawCalls).toBe(1);
    expect(Number(running?.greenPixels ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(running?.litPixels ?? 0)).toBeGreaterThan(20_000);
    expect(Number(running?.changedPixels ?? 0)).toBeGreaterThan(20);
    expect(running?.renderPath).toBe("skinned-lit");
    expect(running?.graph.currentState).toBe("playing");
    expect(running?.graph.states.map((entry) => entry.name)).toEqual(["playing", "paused"]);
    expect(running?.debugGraph).toContain("AnimationStateMachine current=playing");
    expect(running?.controls).toEqual({ timeline: true, playPause: true, scrub: true, playbackSpeed: true, loopMode: true, skeletonDebug: true });

    await page.locator("[data-testid='character-animation-play']").click();
    await page.locator("[data-testid='character-animation-speed']").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "1.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("[data-testid='character-animation-loop']").selectOption("once");
    await page.locator("[data-testid='character-animation-time']").evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "1.25";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => Math.abs(Number(window.__AURA3D_CHARACTER_ANIMATION_VIEWER__?.time ?? 0) - 1.25) < 0.02);
    const scrubbed = await page.evaluate(() => window.__AURA3D_CHARACTER_ANIMATION_VIEWER__);
    expect(scrubbed?.playing).toBe(false);
    expect(scrubbed?.time).toBeCloseTo(1.25, 2);
    expect(scrubbed?.playbackSpeed).toBe(1.5);
    expect(scrubbed?.loopMode).toBe("once");
    expect(scrubbed?.graph.currentState).toBe("paused");
    expect(scrubbed?.debugGraph).toContain("-> playing priority=0 label=play button");
    expect(Number(scrubbed?.greenPixels ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(scrubbed?.litPixels ?? 0)).toBeGreaterThan(20_000);
    await expect(page.locator("[data-testid='character-animation-graph']")).toContainText("AnimationStateMachine current=paused");
    await expect(page.locator("[data-testid='character-animation-status']")).toContainText("real-skinned-gltf-animation-viewer");
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_ANIMATION_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly assetId: "cesium-man";
      readonly meshName: string;
      readonly clipName: string;
      readonly playing: boolean;
      readonly time: number;
      readonly playbackSpeed: number;
      readonly loopMode: "repeat" | "once";
      readonly vertexCount: number;
      readonly indexCount: number;
      readonly jointCount: number;
      readonly trackCount: number;
      readonly drawCalls: number;
      readonly greenPixels: number;
      readonly litPixels: number;
      readonly changedPixels: number;
      readonly renderPath: "skinned-lit";
      readonly graph: {
        readonly currentState: string;
        readonly states: readonly { readonly name: string; readonly current: boolean; readonly transitionCount: number }[];
        readonly transitions: readonly { readonly from: string; readonly to: string; readonly label: string; readonly exitTime?: number }[];
      };
      readonly debugGraph: string;
      readonly controls: { readonly timeline: true; readonly playPause: true; readonly scrub: true; readonly playbackSpeed: true; readonly loopMode: true; readonly skeletonDebug: true };
      readonly error?: string;
    };
  }
}
