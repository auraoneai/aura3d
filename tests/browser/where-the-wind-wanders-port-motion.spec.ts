import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Remote-only (tools/remote-acr/run.sh). Walks the Wind traveller and logs the hero's animation command per step plus a frame strip.
const LAB = "/examples/where-the-wind-wanders-port/";
test.describe.configure({ timeout: 1_500_000 });
let server: ExampleDevServer;
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server.close(); });

test("hero animation command while standing and walking", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as { __AURA_WIND__?: { ready(): boolean } }).__AURA_WIND__?.ready() === true, undefined, { timeout: 540_000 });
  const w = (expr: string) => page.evaluate(`(async () => { const w = window.__AURA_WIND__; return ${expr}; })()`);
  const phase = async (name: string, keys: string, n: number, shotEvery: number) => {
    for (let i = 0; i < n; i++) {
      await w(`w.stepFrames(1, ${JSON.stringify(keys)})`);
      const st = (await w("w.state()")) as { pos: { x: number; z: number }; hop: { phase: string } };
      const rig = await w("w.heroRig()");
      console.log("RWWND_ROW", name, JSON.stringify({ i, x: st.pos.x, z: st.pos.z, hop: st.hop.phase, rig }));
      if (shotEvery && i % shotEvery === 0 && i / shotEvery < 8) {
        const data = (await w("w.frame(640, 360, 0.8)")) as string;
        console.log(`RWWND_SHOT ${name}-${i / shotEvery} ${data.split(",")[1]}`);
      }
    }
  };
  await w("w.stepFrames(40)");
  await phase("idle", "", 30, 0);
  await w(`w.stepFrames(30, "D")`);
  await phase("walk", "D", 90, 6);
  expect(true).toBe(true);
});
