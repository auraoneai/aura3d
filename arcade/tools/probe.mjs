import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5274/";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const app = globalThis.__AURA3D_LIVE_APPS__?.all?.()[0];
  if (!app) return { error: "no app" };
  const out = { ids: app.nodes.ids(), nodes: {} };
  for (const id of app.nodes.ids()) {
    const h = app.nodes.require(id);
    const s = h.snapshot();
    out.nodes[id] = {
      kind: s.kind,
      name: s.name,
      visible: s.visible,
      position: s.position,
      scale: s.scale,
      bounds: (() => {
        try {
          const b = h.bounds();
          return b ? { min: b.min, max: b.max } : null;
        } catch (e) {
          return String(e).slice(0, 80);
        }
      })()
    };
  }
  // scene-level view: what did the builder actually emit?
  const sceneNodes = (app.scene?.nodes ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    name: n.name,
    position: n.position,
    scale: n.scale,
    visible: n.visible,
    instances: n.instances?.length ?? undefined
  }));
  return { ids: out.ids, nodes: out.nodes, sceneNodes };
});

console.log(JSON.stringify(info, null, 1).slice(0, 4000));
await browser.close();
