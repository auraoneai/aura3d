import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("animated character examples", () => {
  test.setTimeout(60_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("runs an animated procedural character with mixer layers and skinning palette data", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/animated-character/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__?.status === "ready" || window.__GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__?.status === "error",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () => window.__GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__?.currentState === "wave",
      undefined,
      { timeout: 8_000 },
    );

    const state = await page.evaluate(() => window.__GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__);
    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.clipNames).toEqual(["procedural-walk", "additive-hand-wave"]);
    expect(state?.currentState).toBe("wave");
    expect(state?.mixerActionCount).toBe(2);
    expect(state?.paletteJointCount).toBe(2);
    expect(state?.paletteHandTranslation?.[0]).toBeCloseTo(0.45, 5);
    expect(state?.paletteHandTranslation?.[1]).toBeCloseTo(0.58, 5);
    expect(state?.paletteHandTranslation?.[2]).toBeCloseTo(0, 5);
    expect(Math.abs(state?.hipPosition?.[0] ?? 0)).toBeLessThanOrEqual(0.55);
    expect(state?.handOffset?.[1] ?? 0).toBeGreaterThan(0.05);
    expect(state?.graph.states.map((entry) => entry.name)).toEqual(["idle", "walk", "wave"]);
    expect(state?.graph.transitions.some((transition) => transition.label === "wave requested")).toBe(true);
    expect(await hasNonBlank2dPixels(page)).toBe(true);
  });

  test("publishes state-machine graph debug output and reaches the jump/land path", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/animation-state-machine/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__?.status === "ready" || window.__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__?.status === "error",
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () => {
        const visited = window.__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__?.visited ?? [];
        return visited.includes("jump") && visited.includes("land");
      },
      undefined,
      { timeout: 8_000 },
    );

    const state = await page.evaluate(() => window.__GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__);
    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.transitionCount).toBe(5);
    expect(state?.visited).toEqual(expect.arrayContaining(["idle", "walk", "jump", "land"]));
    expect(state?.debugGraph).toContain("AnimationStateMachine current=");
    expect(state?.debugGraph).toContain("-> jump priority=20 label=jump");
    expect(state?.graph.transitions.find((transition) => transition.from === "jump")?.exitTime).toBe(0.18);
    expect(await hasNonBlank2dPixels(page)).toBe(true);
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

async function hasNonBlank2dPixels(page: Page): Promise<boolean> {
  return page.locator("[data-testid='example-canvas']").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const context = canvas.getContext("2d");
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! > 12 || pixels[index + 1]! > 12 || pixels[index + 2]! > 12) {
        visible += 1;
      }
    }
    return visible > 200;
  });
}

declare global {
  interface Window {
    __GALILEO3D_ANIMATED_CHARACTER_EXAMPLE__?: {
      readonly status: "ready" | "error";
      readonly clipNames: readonly string[];
      readonly currentState: string;
      readonly stateTime: number;
      readonly hipPosition: readonly [number, number, number];
      readonly handOffset: readonly [number, number, number];
      readonly paletteJointCount: number;
      readonly paletteHandTranslation: readonly [number, number, number];
      readonly mixerActionCount: number;
      readonly graph: {
        readonly states: readonly { readonly name: string; readonly current: boolean; readonly transitionCount: number }[];
        readonly transitions: readonly { readonly from: string; readonly to: string; readonly label: string; readonly exitTime?: number }[];
      };
      readonly error?: string;
    };
    __GALILEO3D_ANIMATION_STATE_MACHINE_EXAMPLE__?: {
      readonly status: "ready" | "error";
      readonly currentState: string;
      readonly debugGraph: string;
      readonly visited: readonly string[];
      readonly transitionCount: number;
      readonly graph: {
        readonly transitions: readonly { readonly from: string; readonly to: string; readonly label: string; readonly exitTime?: number }[];
      };
      readonly error?: string;
    };
  }
}
