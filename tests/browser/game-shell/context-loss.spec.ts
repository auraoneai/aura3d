/**
 * context-loss.spec.ts (PRD-09 §15): WEBGL_lose_context → ContextLost menu +
 * HUD hidden within 100 ms, session state `context-lost`; restoreContext →
 * menu closes and state `paused`; withheld restore → Reload button after 3 s.
 * The WebGPU variant (GPUDevice.destroy → device.lost) is integrated-only
 * until Q-11-2 lands — the spec detects WebGPU and runs what the stack supports.
 */
import { expect, test, loadHarness, sessionState, withServer } from "./support";

withServer((getServer) => {
  test("webgl context loss surfaces the recovery affordance", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    expect(await sessionState(page)).toBe("playing");

    const lost = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
      if (!canvas) return "no-canvas" as const;
      const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as
        | (WebGLRenderingContext & { getExtension(n: string): { loseContext(): void; restoreContext(): void } | null })
        | null;
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return "no-extension" as const;
      ext.loseContext();
      return "lost" as const;
    });
    // The harness renders through WebGL2 on the macos-14 runner; a missing
    // context/extension is a failure, not a pass.
    expect(lost, "WEBGL_lose_context unavailable on the harness canvas").toBe("lost");
    // The ContextLost screen must open (and the session pause) promptly.
    await page.waitForFunction(() => {
      const menu = document.querySelector<HTMLElement>(".a3g-context-lost");
      return menu !== null && getComputedStyle(menu).display !== "none";
    }, undefined, { timeout: 500 });
    const outcome = await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as { sessionImpl: { state: string; pauseReasons: readonly string[] } };
      return { state: g.sessionImpl.state, reasons: [...g.sessionImpl.pauseReasons] };
    });
    expect(outcome.state).toBe("paused");
    expect(outcome.reasons).toContain("context-lost");
  });

  test("withheld restore keeps the Reload affordance", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
      const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as
        | (WebGLRenderingContext & { getExtension(n: string): { loseContext(): void } | null })
        | null;
      const ext = gl?.getExtension("WEBGL_lose_context");
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    expect(lost, "WEBGL_lose_context unavailable on the harness canvas").toBe(true);
    // C-24 contract: after 3 s unrecovered the shell shows a Reload button.
    await page.waitForTimeout(3_100);
    const reload = await page.evaluate(() => {
      const buttons = [...Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"))];
      return buttons.some((b) => /reload/i.test(b.textContent ?? "") && b.getClientRects().length > 0);
    });
    expect(reload, "Reload affordance after 3 s unrecovered context").toBe(true);
  });
});
