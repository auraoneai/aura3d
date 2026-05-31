import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(".");
const outDir = resolve("/tmp/aura3d-task12-repair-smoke");
const port = Number(process.env.AURA3D_TASK12_SMOKE_PORT ?? 48274);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "src"), { recursive: true });
mkdirSync(join(outDir, "public", "benchmark", "assets"), { recursive: true });
writeFileSync(
  join(outDir, "public", "benchmark", "assets", "sneaker.glb"),
  readFileSync(join(repoRoot, "benchmark", "assets", "sneaker.glb"))
);

writeFileSync(join(outDir, "index.html"), `<!doctype html>
<html>
  <head><title>Aura3D Task 12 repair smoke</title></head>
  <body>
    <main id="smoke">
      <section id="particle-panel" class="panel">
        <h1>Particle Fountain</h1>
        <label class="control">Emission rate <input id="particle-rate" type="range" min="40" max="180" value="120" /></label>
        <strong id="particle-readout">120 particles/sec</strong>
        <div id="particle" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="neon-panel" class="panel">
        <h1>Neon Tunnel Flythrough</h1>
        <div id="neon" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="data-panel" class="panel">
        <h1>Revenue Grid</h1>
        <div id="data-readout" class="readout">Hover a bar: awaiting selection</div>
        <div class="axis-overlay">
          <span>X axis: X1 X2 X3 X4 X5 X6</span>
          <span>Z axis: Z1 Z2 Z3 Z4 Z5 Z6</span>
          <span>Height: 0 / 50 / 100</span>
        </div>
        <div id="data" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="city-panel" class="panel">
        <h1 id="city-title">City Day</h1>
        <button id="city-toggle" type="button">Switch to night</button>
        <div id="city" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="product-panel" class="panel">
        <h1>Product Viewer</h1>
        <div id="product" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="humanoid-panel" class="panel">
        <h1>Humanoid Walk</h1>
        <div id="humanoid" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`);

writeFileSync(join(outDir, "src", "style.css"), `html,body{margin:0;min-height:100%;background:#08111f;color:#f8fafc;font-family:Inter,system-ui,sans-serif}#smoke{padding:24px}.panel{display:none;position:relative;width:1280px;height:720px;overflow:hidden;background:#0f172a;border:1px solid #334155;box-sizing:border-box}.viewport{width:1280px;height:720px}.viewport canvas{display:block;width:100%;height:100%}body[data-scene=particle] #particle-panel,body[data-scene=neon] #neon-panel,body[data-scene=data] #data-panel,body[data-scene=city] #city-panel,body[data-scene=product] #product-panel,body[data-scene=humanoid] #humanoid-panel{display:block}h1{position:absolute;z-index:10;left:18px;top:14px;margin:0;padding:7px 10px;border-radius:7px;background:rgba(2,6,23,.78);font-size:18px;letter-spacing:0}.control{position:absolute;z-index:10;left:18px;bottom:18px;display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font-weight:700}.control input{width:220px}strong,.readout,#city-toggle{position:absolute;z-index:10;right:18px;top:18px;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font-size:15px;color:#fff}#city-toggle{top:62px;border:1px solid #93c5fd;cursor:pointer}.readout.is-hover{background:rgba(14,116,144,.92);box-shadow:0 0 24px rgba(34,211,238,.45)}.axis-overlay{position:absolute;z-index:10;left:18px;bottom:18px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font:700 13px/1.25 Inter,system-ui,sans-serif;color:#dff8ff}#product-panel .viewport{height:720px!important}.contact-grid{display:grid;grid-template-columns:repeat(3,420px);gap:12px;padding:12px;background:#08111f}.contact-tile{position:relative;width:420px;height:236px;background:#0f172a;overflow:hidden;border:1px solid #334155}.contact-tile img{display:block;width:100%;height:100%;object-fit:cover}.contact-tile span{position:absolute;left:8px;top:8px;padding:4px 7px;border-radius:5px;background:rgba(2,6,23,.78);font:700 12px system-ui;color:white}`);

writeFileSync(join(outDir, "src", "main.ts"), `import { camera, createAuraApp, defineAuraAssets, effects, interactions, lights, prefabs, scene, timeline, ui } from "@aura3d/engine";
import "./style.css";

const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" }
} as const);

const params = new URLSearchParams(location.search);
const activeScene = params.get("scene") ?? "particle";
document.body.dataset.scene = activeScene;

if (activeScene === "particle") {
  let particleApp = createParticleScene(120);
  ui.onInput(ui.range("#particle-rate"), (input) => {
    const rate = Number(input.value);
    ui.setText("#particle-readout", \`\${rate} particles/sec\`);
    particleApp.dispose();
    particleApp = createParticleScene(rate);
  });
} else if (activeScene === "neon") {
  createAuraApp("#neon", {
    scene: scene()
      .background("#020617")
      .addMany(prefabs.neonTunnel({ rings: 28 }))
      .camera(camera.dolly({ from: [0, 0.36, 1.6], to: [0, 0.36, -4.4], target: [0, 0.28, -5.8], fov: 54, seconds: 8 }))
      .timeline(timeline.loop({ seconds: 8 }))
  });
} else if (activeScene === "data") {
  const dataHover = params.get("hover") === "1";
  if (dataHover) {
    const readout = ui.text("#data-readout");
    readout.classList.add("is-hover");
    readout.textContent = "Hovered bar: row 4 / col 6 / value 100";
  }
  createAuraApp("#data", {
    scene: scene()
      .background("#071017")
      .addMany(prefabs.dataBars3D({ grid: 6, selected: dataHover ? { row: 4, col: 6 } : false }))
      .add(lights.studio({ intensity: 1.1 }))
      .add(interactions.orbit())
      .camera(camera.perspective({ position: [4.7, 3.75, 6.75], target: [0, 0.82, 0], fov: 58 }))
  });
} else if (activeScene === "city") {
  const cityIsNight = params.get("mode") === "night";
  ui.setText("#city-title", cityIsNight ? "City Night" : "City Day");
  ui.setText("#city-toggle", cityIsNight ? "Switch to day" : "Switch to night");
  createCityScene(cityIsNight);
} else if (activeScene === "product") {
  createAuraApp("#product", {
    scene: scene()
      .background("#0b1020")
      .addMany(prefabs.productViewer(assets.sneaker))
      .add(lights.studio({ intensity: 1.35 }))
      .add(interactions.orbit())
      .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
      .timeline(timeline.loop({ seconds: 8 }))
  });
} else if (activeScene === "humanoid") {
  createAuraApp("#humanoid", {
    scene: scene()
      .background("#08111f")
      .addMany(prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true }))
      .add(lights.studio({ intensity: 1.15 }))
      .camera(camera.perspective({ position: [1.15, 1.34, 3.9], target: [0, 0.78, -0.55], fov: 46 }))
      .timeline(timeline.loop({ seconds: 4 }))
  });
}

function createParticleScene(emissionRate: number) {
  return createAuraApp("#particle", {
    scene: scene()
      .background("#030711")
      .addMany(prefabs.particleFountain({ count: 2600, emissionRate }))
      .add(lights.studio({ intensity: 1.15 }))
      .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
  });
}

function createCityScene(isNight: boolean) {
  return createAuraApp("#city", {
    scene: scene()
      .background(isNight ? "#061018" : "#8fc9ff")
      .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: isNight ? "night" : "day" }))
      .add(effects.fog({ density: isNight ? 0.045 : 0.012, color: isNight ? "#0f172a" : "#c7e7ff" }))
      .add(lights.studio({ intensity: isNight ? 0.95 : 1.45 }))
      .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }))
  });
}
`);

writeFileSync(join(outDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@aura3d/engine": ${JSON.stringify(join(repoRoot, "packages", "engine", "src", "agent-api", "index.ts"))}
    }
  }
});
`);

const server = spawn("pnpm", ["exec", "vite", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

let browser;
try {
  browser = await chromium.launch();
  const url = `http://127.0.0.1:${port}/`;
  const summary = {
    url,
    port,
    captures: [],
    serverLog: ""
  };
  await captureRoute(browser, `${url}?scene=particle`, "particle-panel", [["particle-control.png", 1500]], summary);
  await captureRoute(browser, `${url}?scene=neon`, "neon-panel", [["neon-frame-1.png", 1500], ["neon-frame-2.png", 1800]], summary);
  await captureRoute(browser, `${url}?scene=data`, "data-panel", [["data-default.png", 1500]], summary);
  await captureRoute(browser, `${url}?scene=data&hover=1`, "data-panel", [["data-hover.png", 1500]], summary);
  await captureRoute(browser, `${url}?scene=city&mode=day`, "city-panel", [["city-day.png", 1500]], summary);
  await captureRoute(browser, `${url}?scene=city&mode=night`, "city-panel", [["city-night.png", 1500]], summary);
  await captureRoute(browser, `${url}?scene=product`, "product-panel", [["product-landscape.png", 3500]], summary);
  await captureRoute(browser, `${url}?scene=humanoid`, "humanoid-panel", [["humanoid-frame-1.png", 900], ["humanoid-frame-2.png", 1200]], summary);

  await createContactSheet(browser);
  summary.serverLog = serverLog;
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify({ url, port, summary, serverLog }, null, 2)}\n`);
  console.log(join(outDir, "task12-repair-contact-sheet.png"));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

async function waitForServer(page, url) {
  let lastError = "";
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3000 });
      if (response?.ok()) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(`smoke server did not become ready: ${lastError}\n${serverLog}`);
}

async function captureRoute(browserInstance, routeUrl, panelId, captures, summary) {
  const page = await browserInstance.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    page.setDefaultTimeout(60_000);
    await waitForServer(page, routeUrl);
    await page.waitForFunction(() => document.querySelectorAll("canvas").length >= 1, undefined, { timeout: 60_000 });
    for (const [fileName, waitMs] of captures) {
      await page.waitForTimeout(waitMs);
      await capturePanel(page, panelId, fileName);
      summary.captures.push({
        fileName,
        route: routeUrl,
        diagnostics: await page.evaluate(() => ({
          ready: document.body.dataset.aura3dReady,
          drawCalls: document.body.dataset.aura3dDrawCalls,
          canvases: document.querySelectorAll("canvas").length,
          route: window.__AURA3D_ROUTE_READY__?.diagnostics ?? null
        }))
      });
    }
  } finally {
    await page.close();
  }
}

async function capturePanel(page, panelId, fileName) {
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "center", inline: "center" }), panelId);
  await page.waitForTimeout(250);
  const box = await page.locator(`#${panelId}`).boundingBox();
  if (!box) throw new Error(`missing smoke panel: ${panelId}`);
  await page.screenshot({
    path: join(outDir, fileName),
    clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height },
    timeout: 60_000
  });
}

async function createContactSheet(browserInstance) {
  const entries = [
    ["Particles + control", "particle-control.png"],
    ["Neon frame 1", "neon-frame-1.png"],
    ["Neon frame 2", "neon-frame-2.png"],
    ["Data default", "data-default.png"],
    ["Data hover", "data-hover.png"],
    ["City day", "city-day.png"],
    ["City night", "city-night.png"],
    ["Product viewer", "product-landscape.png"],
    ["Humanoid frame 1", "humanoid-frame-1.png"],
    ["Humanoid frame 2", "humanoid-frame-2.png"]
  ];
  const html = `<div class="contact-grid">${entries
    .map(([label, file]) => {
      const base64 = readFileSync(join(outDir, file)).toString("base64");
      return `<div class="contact-tile"><span>${label}</span><img src="data:image/png;base64,${base64}" /></div>`;
    })
    .join("")}</div><style>${readFileSync(join(outDir, "src", "style.css"), "utf8")}</style>`;
  const sheet = await browserInstance.newPage({ viewport: { width: 1296, height: 1050 }, deviceScaleFactor: 1 });
  await sheet.setContent(html, { waitUntil: "load" });
  await sheet.screenshot({ path: join(outDir, "task12-repair-contact-sheet.png"), fullPage: false });
  await sheet.close();
}
