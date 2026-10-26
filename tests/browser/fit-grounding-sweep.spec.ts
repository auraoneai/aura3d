import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Grounding sweep (remote only, software WebGL2): for every live game, load its route, wait for the scene, and print the drawn
 * world box of every runtime-tagged node (`handle.bounds()` is the rendered GLB box once the render pass has run). An actor or
 * prop whose lowest point hovers above the ground it should stand on (the `scaleMode: "fit"` + "origin at the centre" offset bug:
 * Diamond 0.94 m, Hoops 0.96 m) shows up as minY well above the floor. Also prints one small frame per game.
 * GAMES is replaced per run by the caller (the SWEEP_GAMES constant below).
 */
const SWEEP_GAMES: string[] = [];
const ALL = [
  "showcase-top-tennis", "showcase-roadster-rush", "showcase-heatsink", "showcase-teleoperator", "showcase-iron-crown", "showcase-pips-big-leap",
  "showcase-aura-diamond-3d", "showcase-aura-fc-3d", "showcase-aura-links-3d", "showcase-bunker-zero", "showcase-slingshot-siege",
  "showcase-dot-dash-3d", "showcase-cross-hop", "showcase-strange-orbit-port", "showcase-splat-rush-port", "showcase-serpentine-sky-run-port",
  "showcase-drift-and-deliver-port", "showcase-heatsink-port", "showcase-ninja-runner-port", "showcase-last-train-port",
  "showcase-roadster-hours-port", "showcase-where-the-wind-wanders-port", "showcase-silt-and-signal-port", "showcase-cloud-runner-port",
  "showcase-aura-hoops-3d"
];
const GAMES = SWEEP_GAMES.length ? SWEEP_GAMES : ALL;
// Ports that wrap an example resolve their GLBs through import.meta.url, which the bundled app entry breaks; load the example page itself.
const EXAMPLE_PAGE: Record<string, string> = {
  "showcase-ninja-runner-port": "/examples/ninja-runner-port/index.html",
  "showcase-last-train-port": "/examples/last-train-port/index.html",
  "showcase-cloud-runner-port": "/examples/kid-goku-beyond-the-clouds-port/index.html"
};

let server: ExampleDevServer;
test.setTimeout(3_300_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const folder of GAMES) {
  test(`sweep ${folder}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 620 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    await page.goto(`${server.origin}${EXAMPLE_PAGE[folder] ?? `/apps/${folder}/index.html`}?diag=1&autostart=1`, { waitUntil: "load", timeout: 240_000 }).catch((e) => errors.push(`goto ${String(e).slice(0, 120)}`));
    let n = 0;
    for (let i = 0; i < 90 && n === 0; i += 1) {
      await page.waitForTimeout(2000);
      n = await page.evaluate(() => {
        const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
        const app = reg?.all()[0];
        return app?.nodes?.all?.().length ?? 0;
      }).catch(() => 0);
    }
    await page.waitForTimeout(10_000);
    const nodes = await page.evaluate(() => {
      const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
      const out: Array<Record<string, unknown>> = [];
      for (const app of reg?.all() ?? []) {
        for (const h of app.nodes.all()) {
          let b: any;
          try { b = h.bounds?.(); } catch { b = undefined; }
          if (!b?.min || !b?.max) continue;
          const r = (v: number) => Math.round(v * 100) / 100;
          out.push({ id: h.id, name: h.name, tags: h.tags, min: [r(b.min[0]), r(b.min[1]), r(b.min[2])], max: [r(b.max[0]), r(b.max[1]), r(b.max[2])], pos: h.position ? [r(h.position[0]), r(h.position[1]), r(h.position[2])] : null });
        }
      }
      return out;
    }).catch(() => []);
    console.log(`FITSWEEP ${folder} n=${n} nodes=${nodes.length} errors=${JSON.stringify(errors.slice(0, 3))}`);
    console.log(`FITSWEEP_NODES ${folder} ${JSON.stringify(nodes)}`);
    const buf = await page.screenshot({ type: "jpeg", quality: 80 }).catch(() => undefined);
    if (buf) console.log(`FITSWEEP_FRAME ${folder} ${buf.toString("base64")}`);
  });
}
