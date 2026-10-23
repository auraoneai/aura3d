import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * saiyan-snake-way-port Meshy-model close-ups (remote only: tools/remote-acr/run.sh).
 * Replays the recorded run to the steps where each Meshy-modelled hazard is 9-14 m ahead and prints the frames as
 * `@@SSW_ART meshy <name> <i> <n> <base64>` lines (extract with tools/crayon-capture/saiyan-snake-way-art-frames.ts).
 */
const FIXTURE = "tests/browser/data/saiyan-snake-way-reference-replay.json";
const STEPS: readonly (readonly [string, number])[] = [["m-arch", 684], ["m-oni", 934], ["m-barrier", 1568], ["m-sweeper", 2137], ["m-feast", 2864], ["m-run", 1200]];
interface Segment { kind: "idle" | "tap" | "hold"; frames: number; key?: string; keys?: string[] }
interface Api {
  ready: boolean;
  runSegments(segments: Segment[], maxSteps?: number): { steps: number };
  frame(w?: number, h?: number, q?: number): Promise<string>;
  diagnostics(): { drawCalls?: number; triangles?: number; errors?: readonly unknown[] } | null;
  meta(): { nodeCount: number; entityNodes: number };
}

test("meshy hazards render close up in the production renderer", async ({ page }) => {
  test.setTimeout(1_200_000);
  const fixture = JSON.parse(readFileSync(resolve(FIXTURE), "utf8")) as { segments: Segment[] };
  const server: ExampleDevServer = await startExampleDevServer();
  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}/examples/saiyan-snake-way-port/?manual=1&autostart=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_SAIYAN_SNAKE_WAY__?: { ready: boolean } }).__AURA_SAIYAN_SNAKE_WAY__?.ready === true, undefined, { timeout: 900_000 });
    const api = <T>(fn: string): Promise<T> => page.evaluate(`(${fn})(window.__AURA_SAIYAN_SNAKE_WAY__)`) as Promise<T>;
    for (const [name, steps] of STEPS) {
      await api(`(o) => o.runSegments(${JSON.stringify(fixture.segments)}, ${steps})`);
      const data = await api<string>(`(o) => o.frame(960, 540, 0.82)`);
      const base64 = data.split(",")[1] as string;
      const n = Math.ceil(base64.length / 4000);
      for (let i = 0; i < n; i++) console.log(`@@SSW_ART meshy ${name} ${i} ${n} ${base64.slice(i * 4000, (i + 1) * 4000)}`);
      const diag = await api<{ drawCalls?: number; triangles?: number; errors?: readonly unknown[] } | null>(`(o) => o.diagnostics()`);
      const meta = await api<{ nodeCount: number; entityNodes: number }>(`(o) => o.meta()`);
      console.log(`@@SSW_PERF meshy-${name} ${JSON.stringify({ drawCalls: diag?.drawCalls, triangles: diag?.triangles, errors: diag?.errors?.length ?? 0, entityNodes: meta.entityNodes })}`);
      expect(diag?.drawCalls ?? 0, `${name} draws something`).toBeGreaterThan(0);
    }
    expect(errors, errors.slice(0, 6).join(" | ")).toEqual([]);
  } finally {
    await server.close();
  }
});
