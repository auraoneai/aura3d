import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Cloud Runner art frames. Remote-only (tools/remote-acr/run.sh); never local Playwright. Boots the port in manual mode, teleports
 * the run to the same course distances the original's reference frames use (tools/crayon-capture/kid-goku-frames.ts), settles
 * the game layer and emits each frame twice (clean = no DOM interface, hud = interface on) as chunked base64 log lines
 * `@@KG_CHUNK <name> <variant> <i>/<n> <data>`; unpack with tools/crayon-capture/kid-goku-frames-assemble.ts --prefix port.
 */
interface Shot { name: string; s?: number; nimbus?: boolean; menu?: boolean; lane?: number; hud?: boolean; settle?: number }
const SHOTS: Shot[] = [
  { name: "menu", menu: true, hud: true, settle: 40 },
  { name: "s0", s: 0, hud: true, settle: 40 },
  { name: "s60", s: 60 },
  { name: "s300", s: 295 },
  { name: "s570", s: 545 },
  { name: "s700", s: 690, nimbus: true, hud: true },
  { name: "s900", s: 880 },
  { name: "s1040", s: 1040 },
  { name: "s1300", s: 1270 },
  { name: "s1560", s: 1555 }
];
const only = (process.env.KG_SHOTS ?? "").split(",").filter(Boolean);
const [VW, VH] = (process.env.KG_VIEWPORT ?? "1280x720").split("x").map(Number) as [number, number];

interface Api {
  ready: boolean;
  place(s: number, o?: { lane?: number; nimbus?: boolean; phase?: "playing" | "menu" }): unknown;
  settle(n?: number): unknown;
  stats(): unknown;
  diagnostics(): { drawCalls?: number; triangles?: number; errors?: readonly unknown[] } | null;
  errors(): string[];
}
declare global { interface Window { __AURA_KID_GOKU__?: Api } }

test.describe("kid-goku-art-frames", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("captures the port at the reference course distances", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: VW, height: VH });
    await page.goto(`${server.origin}/examples/kid-goku-beyond-the-clouds-port/?manual=1`);
    await page.waitForFunction(() => window.__AURA_KID_GOKU__?.ready === true, undefined, { timeout: 300_000 });
    const emit = async (name: string, variant: "clean" | "hud"): Promise<void> => {
      const buf = await page.screenshot({ type: "jpeg", quality: 86, timeout: 600_000 });
      const b64 = buf.toString("base64"), CHUNK = 48000, total = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < total; i++) console.log(`\n@@KG_CHUNK ${name} ${variant} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)} ;\n`);
      console.log(`KGART frame ${name}/${variant} ${buf.length} bytes`);
    };
    for (const shot of SHOTS.filter((x) => only.length === 0 || only.includes(x.name))) {
      await page.evaluate(({ s, o, menu }) => { const api = window.__AURA_KID_GOKU__!; api.place(s ?? 0, menu ? { phase: "menu" } : o); }, { s: shot.s, o: { nimbus: shot.nimbus, lane: shot.lane }, menu: shot.menu });
      const snap = await page.evaluate((n) => window.__AURA_KID_GOKU__!.settle(n), shot.settle ?? 40);
      console.log(`KGART shot ${shot.name} ${JSON.stringify(snap)}`);
      await page.addStyleTag({ content: "#cr-ui{visibility:hidden !important}" }).then(async (h) => { await emit(shot.name, "clean"); await h.evaluate((n) => n.remove()); });
      if (shot.hud) await emit(shot.name, "hud");
    }
    const diag = await page.evaluate(() => ({ d: window.__AURA_KID_GOKU__!.diagnostics(), st: window.__AURA_KID_GOKU__!.stats() }));
    console.log(`KGART diag ${JSON.stringify(diag)}`);
    expect(await page.evaluate(() => window.__AURA_KID_GOKU__!.errors())).toEqual([]);
    expect(errors.filter((e) => !/favicon|net::ERR|GPU stall|swiftshader/i.test(e))).toEqual([]);
  });
});
