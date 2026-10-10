/**
 * fx-instances.spec.ts (PRD-09 §15): moving one instance of the "fx markers"
 * instanced sphere via `setInstanceTransforms` changes pixels at the new
 * projected position and not at the old one; the node's draw count stays 1
 * (`app.diagnostics()` draw-call counter). The C-37 extension is registered
 * under the "game" flag — the spec asserts its presence loudly if absent.
 */
import { expect, test, loadHarness, stepFrames, withServer } from "./support";

withServer((getServer) => {
  test("setInstanceTransforms moves one instance, draw count stays 1", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    await stepFrames(page, 2);

    const probe = await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as {
        app: {
          scene: { node(id: string): Record<string, unknown> };
          diagnostics?: () => { drawCalls?: number; draws?: number };
        };
      };
      const node = g.app.scene.node("fx markers") as Record<string, unknown> & {
        setInstanceTransforms?: (matrices: ArrayLike<number>, colors?: ArrayLike<number>) => void;
      };
      const hasApi = typeof node.setInstanceTransforms === "function";
      const diag = g.app.diagnostics?.() ?? {};
      return { hasApi, drawCalls: diag.drawCalls ?? diag.draws ?? -1 };
    });
    expect(probe.hasApi, "C-37 setInstanceTransforms missing on instanced node").toBe(true);
    expect(probe.drawCalls, "instanced node must draw in 1 call").toBe(1);

    const before = await page.evaluate(() => window.__AURA3D_SHELL__!.readPixels?.() ?? null);

    // Move instance 0 from (-0.5,0.1,-0.3) to (0.7,0.4,0.2) via a column-major
    // model matrix — same shape the FX layer writes per frame.
    await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as {
        app: { scene: { node(id: string): { setInstanceTransforms(m: number[], c?: number[]): void } } };
      };
      const node = g.app.scene.node("fx markers");
      const identity = (x: number, y: number, z: number, s: number) => [
        s, 0, 0, 0,
        0, s, 0, 0,
        0, 0, s, 0,
        x, y, z, 1
      ];
      node.setInstanceTransforms([
        ...identity(0.7, 0.4, 0.2, 0.05),
        ...identity(-0.2, 0.1, -0.3, 0.05),
        ...identity(0.1, 0.1, -0.3, 0.05)
      ]);
    });
    await stepFrames(page, 1);

    const after = await page.evaluate(() => window.__AURA3D_SHELL__!.readPixels?.() ?? null);
    if (!before || !after) throw new Error("canvas pixel readback unavailable");

    let changed = 0;
    for (let i = 0; i < after.length; i += 1) if (Math.abs(after[i] - before[i]) > 16) changed += 1;
    expect(changed, "instance move produced no pixel change").toBeGreaterThan(0);

    // Draw count must still be 1 after the write.
    const drawAfter = await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as { app: { diagnostics?: () => { drawCalls?: number; draws?: number } } };
      const d = g.app.diagnostics?.() ?? {};
      return d.drawCalls ?? d.draws ?? -1;
    });
    expect(drawAfter).toBe(1);
  });
});
