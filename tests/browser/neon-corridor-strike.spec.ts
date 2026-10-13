import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Single-path successor to the retired nine-file neon-corridor browser
// family (modes / pause-reset / quality / shot-visual / touch / endurance /
// typed-world / release-asset-probes + harness). Those specs asserted the
// trashed orchestrator's __AURA3D_FPS_EVIDENCE__ global and physics-era
// behaviors; the rebuilt route publishes window.__aura3dGameSnapshot from
// examples/neon-corridor-strike/src/main.ts (createGame + pure rules).
// Detailed look/move/fire/win/reset playthrough assertions live in
// examples/neon-corridor-strike/tests/playable.spec.ts; this root spec
// keeps the monorepo boot/framed/fire smoke. It boots the example's own
// vite server because the shared example-dev-server does not alias
// @aura3d/engine/game or serve app-local /aura-assets trees.

test.setTimeout(300_000);

const PORT = 4183;
const ORIGIN = `http://127.0.0.1:${PORT}`;

test("neon-corridor-strike boots framed and fires on the rebuilt single path", async ({ page }) => {
  const server = await startVite();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${ORIGIN}/?scene=default`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 150_000 }).toBe("true");
    await page.waitForFunction(
      () => (window as unknown as { __aura3dGameSnapshot?: { readonly framed?: boolean } }).__aura3dGameSnapshot?.framed === true,
      undefined,
      { timeout: 60_000 }
    );

    const initial = await readSnapshot(page);
    expect(initial.claimLabel).toBe("prototype");
    expect(initial.look.id).toBe("neon-arcade");
    expect(initial.targetsAlive).toBe(5);
    expect(initial.typedAssets).toEqual(
      expect.arrayContaining(["quaterniusWallModular", "quaterniusCubeCrate", "kenneyCraftMiner"])
    );

    // Pointer-lock request is counted on canvas click (grant is the
    // browser's; headless engagement stays UNVERIFIED by design here).
    await page.locator("#app canvas").first().click();
    await page.waitForFunction(
      () =>
        ((window as unknown as { __aura3dGameSnapshot?: { readonly pointerLockRequested?: number } }).__aura3dGameSnapshot
          ?.pointerLockRequested ?? 0) >= 1,
      undefined,
      { timeout: 30_000 }
    );

    // KeyJ fire (lock-independent) spends ammo and registers in evidence.
    await page.keyboard.press("KeyJ", { delay: 90 });
    await page.waitForFunction(
      () =>
        ((window as unknown as { __aura3dGameSnapshot?: { readonly shotsFired?: number } }).__aura3dGameSnapshot?.shotsFired ?? 0) > 0,
      undefined,
      { timeout: 30_000 }
    );
    const fired = await readSnapshot(page);
    expect(fired.shotsFired).toBeGreaterThan(0);
    expect(fired.events).toEqual(expect.arrayContaining([expect.stringContaining("fire")]));
  } finally {
    server.kill("SIGTERM");
  }
});

async function readSnapshot(page: import("@playwright/test").Page): Promise<{
  readonly claimLabel: string;
  readonly look: { readonly id: string };
  readonly targetsAlive: number;
  readonly typedAssets: readonly string[];
  readonly shotsFired: number;
  readonly events: readonly string[];
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __aura3dGameSnapshot?: {
        readonly claimLabel: string;
        readonly look: { readonly id: string };
        readonly targetsAlive: number;
        readonly typedAssets: readonly string[];
        readonly shotsFired: number;
        readonly events: readonly string[];
      };
    }).__aura3dGameSnapshot;
    if (!state) throw new Error("Missing __aura3dGameSnapshot state.");
    return state;
  });
}

async function startVite(): Promise<ChildProcess> {
  const viteBin = resolve("node_modules/.bin/vite");
  const child = spawn(viteBin, ["--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: resolve("examples/neon-corridor-strike"),
    stdio: "pipe"
  });
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return child;
    } catch {
      // Server not up yet; keep polling until the deadline.
    }
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error("vite did not become ready in time");
    }
    await new Promise((wait) => setTimeout(wait, 500));
  }
}
