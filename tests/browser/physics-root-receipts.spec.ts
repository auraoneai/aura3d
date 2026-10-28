import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildReceipt, emitReceipt, writeReceipt, type HarnessFrame } from "../support/motion-receipts";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Remote only (tools/remote-acr/run.sh). Six dynamic bodies (box, sphere, capsule, a capsule
// whose collider is derived from its size, and a ball on a dynamic crate) fall onto a static
// ground through the root `@aura3d/engine` physics; the passing run writes
// evidence/receipts/physics-root-collision/<version>.json and prints it for the ACR log.

const harnessSource = resolve(process.cwd(), "tests/browser/physics-root-receipts-harness.ts");
const version = (JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
const gitSha = process.env.AURA3D_GIT_SHA ?? "unknown-remote";

interface CapabilityResult {
  readonly status: "ok" | "error";
  readonly error?: string;
  readonly measurements: Record<string, unknown>;
  readonly frames: readonly HarnessFrame[];
}
interface Evidence {
  readonly imports: readonly string[];
  readonly capabilities: Record<string, CapabilityResult>;
}

test.describe("root physics collision receipt", () => {
  test.setTimeout(300_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("box, sphere and capsule collide with static and dynamic bodies and come to rest", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/physics-root-receipts-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA3D_PHYSICS_ROOT_RECEIPTS__?: { status: string } }).__AURA3D_PHYSICS_ROOT_RECEIPTS__?.status === "done", undefined, { timeout: 240_000 });
    const evidence = await page.evaluate(() => (window as unknown as { __AURA3D_PHYSICS_ROOT_RECEIPTS__: Evidence }).__AURA3D_PHYSICS_ROOT_RECEIPTS__);
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "no-webgl2";
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });

    const result = evidence.capabilities["physics-root-collision"]!;
    console.log(`MEASUREMENTS::physics-root-collision::${JSON.stringify({ status: result.status, error: result.error, ...result.measurements })}`);

    const source = readFileSync(harnessSource, "utf8");
    expect(source).toContain('from "@aura3d/engine"');
    expect(source).not.toMatch(/from\s+["'](?:three|@aura3d\/(?!engine["'])[^"']*|@aura3d\/engine\/[^"']*)["']/);
    expect(evidence.imports).toEqual(["@aura3d/engine"]);
    expect(errors).toEqual([]);
    expect(result.status, result.error).toBe("ok");

    const m = result.measurements as {
      bodies: Record<string, { restError: number; speed: number; y: number; nodeY: number }>;
      worstRestError: number;
      worstNodeDrift: number;
      fastestBodySpeed: number;
      collidedWithGround: string[];
      collidingPairs: string[];
      changedPixelsStartVsFalling: number;
      changedPixelsStartVsRest: number;
    };
    // Every body rests at the height its collider shape implies (no tunnelling, no float).
    expect(Object.keys(m.bodies).sort()).toEqual(["box", "capsule", "capsuleFromSize", "lowerCrate", "sphere", "upperBall"]);
    expect(m.worstRestError).toBeLessThan(0.08);
    expect(m.fastestBodySpeed).toBeLessThan(0.15);
    // The visible node follows its body.
    expect(m.worstNodeDrift).toBeLessThan(0.05);
    // Dynamic vs static: each body that starts in the air reports a ground contact.
    expect(m.collidedWithGround).toEqual(expect.arrayContaining(["box", "sphere", "capsule", "capsuleFromSize", "lowerCrate"]));
    // Dynamic vs dynamic: the ball is carried by the crate.
    expect(m.collidingPairs).toContain("lowerCrate|upperBall");
    expect(m.changedPixelsStartVsFalling).toBeGreaterThan(500);
    expect(m.changedPixelsStartVsRest).toBeGreaterThan(1500);

    const { receipt, pngs } = buildReceipt({
      capability: "physics-root-collision",
      version,
      gitSha,
      renderer,
      scene: "box, sphere, capsule, size-derived capsule and a ball-on-crate stack falling onto a static ground via createAuraApp physics",
      tests: ["tests/browser/physics-root-receipts.spec.ts", "tests/unit/agent-api/physics-root-collision.test.ts"],
      frames: result.frames,
      measurements: result.measurements
    });
    writeReceipt(process.cwd(), receipt, pngs);
    emitReceipt(receipt, pngs);
  });
});
