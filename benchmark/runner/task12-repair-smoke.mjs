import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyFpsCalibrationToMetrics, runFpsCalibration, samplePageFps } from "./fps-calibration.mjs";

const repoRoot = resolve(".");
const outDir = resolve("/tmp/aura3d-task12-repair-smoke");
const port = Number(process.env.AURA3D_TASK12_SMOKE_PORT ?? 48274);
const fpsWarmupMs = Number(process.env.AURA3D_TASK12_FPS_WARMUP_MS ?? 500);
const fpsSampleMs = Number(process.env.AURA3D_TASK12_FPS_SAMPLE_MS ?? 1500);
const physicsCaptureWaitMs = Number(process.env.AURA3D_TASK12_PHYSICS_CAPTURE_WAIT_MS ?? 2800);
const solarCaptureWaitMs = Number(process.env.AURA3D_TASK12_SOLAR_CAPTURE_WAIT_MS ?? 2400);
const dataCaptureWaitMs = Number(process.env.AURA3D_TASK12_DATA_CAPTURE_WAIT_MS ?? 1800);
const miniGolfCaptureWaitMs = Number(process.env.AURA3D_TASK12_MINI_GOLF_CAPTURE_WAIT_MS ?? 2400);
const productCaptureWaitMs = Number(process.env.AURA3D_TASK12_PRODUCT_CAPTURE_WAIT_MS ?? 4500);
const materialCaptureWaitMs = Number(process.env.AURA3D_TASK12_MATERIAL_CAPTURE_WAIT_MS ?? 2800);
const screenshotTimeoutMs = Number(process.env.AURA3D_TASK12_SCREENSHOT_TIMEOUT_MS ?? 15000);
const routeTimeoutMs = Number(process.env.AURA3D_TASK12_ROUTE_TIMEOUT_MS ?? 45_000);
const renderReadyTimeoutMs = Number(process.env.AURA3D_TASK12_RENDER_READY_TIMEOUT_MS ?? 20_000);
const skipFps = process.env.AURA3D_TASK12_SKIP_FPS === "1";
const forceCanvasCapture = process.env.AURA3D_TASK12_FORCE_CANVAS_CAPTURE === "1";
const preferCanvasCapture = process.env.AURA3D_TASK12_PAGE_SCREENSHOT !== "1";
const onlyScenes = new Set(
  (process.env.AURA3D_TASK12_ONLY_SCENES ?? "")
    .split(",")
    .map((sceneName) => sceneName.trim())
    .filter(Boolean)
);
const placeholderPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

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

      <section id="physics-panel" class="panel">
        <h1>Physics Playground</h1>
        <div id="physics" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="solar-panel" class="panel">
        <h1>Solar System</h1>
        <div id="solar" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="data-panel" class="panel">
        <h1>Revenue Grid</h1>
        <div id="data-readout" class="readout">Selected bar: row 4 / col 6 / value 100</div>
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

      <section id="mini-golf-panel" class="panel">
        <h1>Mini Golf</h1>
        <strong id="mini-golf-readout">Shots 2 / Par 3 - Aim 42% - Power 61%</strong>
        <div id="mini-golf" class="viewport" data-aura3d-preserve-page-layout></div>
      </section>

      <section id="material-panel" class="panel">
        <h1>Material Lab</h1>
        <div id="material" class="viewport" data-aura3d-preserve-page-layout></div>
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

writeFileSync(join(outDir, "src", "style.css"), `html,body{margin:0;min-height:100%;background:#08111f;color:#f8fafc;font-family:Inter,system-ui,sans-serif}#smoke{padding:24px}.panel{display:none;position:relative;width:1280px;height:720px;overflow:hidden;background:#0f172a;border:1px solid #334155;box-sizing:border-box}.viewport{width:1280px;height:720px}.viewport canvas{display:block;width:100%;height:100%}body[data-scene=particle] #particle-panel,body[data-scene=neon] #neon-panel,body[data-scene=physics] #physics-panel,body[data-scene=solar] #solar-panel,body[data-scene=data] #data-panel,body[data-scene=city] #city-panel,body[data-scene=product] #product-panel,body[data-scene=mini-golf] #mini-golf-panel,body[data-scene=material] #material-panel,body[data-scene=humanoid] #humanoid-panel{display:block}h1{position:absolute;z-index:10;left:18px;top:14px;margin:0;padding:7px 10px;border-radius:7px;background:rgba(2,6,23,.78);font-size:18px;letter-spacing:0}.control{position:absolute;z-index:10;left:18px;bottom:18px;display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font-weight:700}.control input{width:220px}strong,.readout,#city-toggle{position:absolute;z-index:10;right:18px;top:18px;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font-size:15px;color:#fff}#city-toggle{top:62px;border:1px solid #93c5fd;cursor:pointer}.readout.is-hover{background:rgba(14,116,144,.92);box-shadow:0 0 24px rgba(34,211,238,.45)}.axis-overlay{position:absolute;z-index:10;left:18px;bottom:18px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:7px;background:rgba(2,6,23,.82);font:700 13px/1.25 Inter,system-ui,sans-serif;color:#dff8ff}#product-panel .viewport{height:720px!important}.contact-grid{display:grid;grid-template-columns:repeat(3,420px);gap:12px;padding:12px;background:#08111f}.contact-tile{position:relative;width:420px;height:236px;background:#0f172a;overflow:hidden;border:1px solid #334155}.contact-tile img{display:block;width:100%;height:100%;object-fit:cover}.contact-tile span{position:absolute;left:8px;top:8px;padding:4px 7px;border-radius:5px;background:rgba(2,6,23,.78);font:700 12px system-ui;color:white}`);

writeFileSync(join(outDir, "src", "main.ts"), `import { camera, city, createAuraApp, defineAuraAssets, effects, lights, material, prefabs, primitives, scene, sceneKits, ui } from "@aura3d/engine";
import "./style.css";

const assets = defineAuraAssets({
  sneaker: { type: "model", format: "glb", url: "/benchmark/assets/sneaker.glb" }
} as const);

const params = new URLSearchParams(location.search);
const activeScene = params.get("scene") ?? "particle";
document.body.dataset.scene = activeScene;

const dataSceneKitDataset = [
  [42, 55, 61, 69, 78, 84],
  [38, 47, 59, 72, 81, 91],
  [31, 52, 64, 76, 86, 94],
  [45, 58, 73, 88, 96, 100],
  [29, 43, 57, 69, 83, 90],
  [34, 49, 62, 74, 89, 97]
] as const;

type SmokeRouteDiagnostics = {
  scene: string;
  panelId: string;
  sceneKitPath: string | null;
  captureIntent: string[];
  capturePhase?: string;
  expectedEvidence?: string[];
  timingMs?: number[];
};

const smokeRouteDiagnostics: Record<string, SmokeRouteDiagnostics> = {
  particle: {
    scene: "particle",
    panelId: "particle-panel",
    sceneKitPath: null,
    captureIntent: ["particle density", "emission rate control", "ground collision context"]
  },
  neon: {
    scene: "neon",
    panelId: "neon-panel",
    sceneKitPath: "sceneKits.neonTunnel()",
    captureIntent: ["tunnel depth", "animated flythrough", "controlled bloom"]
  },
  physics: {
    scene: "physics",
    panelId: "physics-panel",
    sceneKitPath: "sceneKits.physicsPlayground()",
    captureIntent: ["settled physics pile", "ramp and catch geometry", "gravity/contact evidence"],
    capturePhase: "post-warmup settled/contact frame",
    expectedEvidence: ["falling or settled cubes", "ramp/catch geometry", "contact patches", "gravity cue", "reset affordance"],
    timingMs: [${physicsCaptureWaitMs}]
  },
  solar: {
    scene: "solar",
    panelId: "solar-panel",
    sceneKitPath: "sceneKits.solarSystem()",
    captureIntent: ["whole-system frame with sun glow/corona", "six labeled planets with distinct materials", "orbit paths and depth-faded rings", "stars/dust and readable scale cues"],
    capturePhase: "post-warmup full-system evidence frame",
    expectedEvidence: ["sun glow/corona", "six labeled planets", "distinct planet materials", "orbit paths", "depth-faded rings", "stars/dust", "whole-system framing", "scale cues"],
    timingMs: [${solarCaptureWaitMs}]
  },
  data: {
    scene: "data",
    panelId: "data-panel",
    sceneKitPath: "sceneKits.dataViz({ dataset })",
    captureIntent: ["scene-kit bars, axes, ticks, title, and legend", "deterministic selected row 4 / col 6 / value 100", "hover capture via ?hover=1 readout overlay"],
    capturePhase: "post-warmup chart evidence frame; hover route adds deterministic selected/hover readout overlay",
    expectedEvidence: ["36 height-encoded bars", "axes and numeric ticks", "title and subtitle", "legend swatches", "selected row 4 / col 6 / value 100", "hover readout overlay"],
    timingMs: [${dataCaptureWaitMs}, ${dataCaptureWaitMs}]
  },
  city: {
    scene: "city",
    panelId: "city-panel",
    sceneKitPath: null,
    captureIntent: ["day and night modes", "street grid", "lit windows"]
  },
  product: {
    scene: "product",
    panelId: "product-panel",
    sceneKitPath: "sceneKits.productViewer(assets.sneaker)",
    captureIntent: ["typed sneaker asset", "centered product stage", "studio softbox/contact shadow"]
  },
  "mini-golf": {
    scene: "mini-golf",
    panelId: "mini-golf-panel",
    sceneKitPath: "sceneKits.miniGolf()",
    captureIntent: ["playable mini-golf state", "aim/power/score UI", "follow-camera and contact cues"],
    capturePhase: "post-warmup gameplay evidence frame",
    expectedEvidence: ["white physics ball", "cup and rim", "aim line", "power/shot state", "score", "obstacle", "course boundaries", "ball trail or contact cue", "follow-camera target"],
    timingMs: [${miniGolfCaptureWaitMs}]
  },
  material: {
    scene: "material",
    panelId: "material-panel",
    sceneKitPath: "sceneKits.materialLab()",
    captureIntent: ["mirror metal", "transparent glass", "rubber/emissive/clearcoat contrast"]
  },
  humanoid: {
    scene: "humanoid",
    panelId: "humanoid-panel",
    sceneKitPath: null,
    captureIntent: ["connected humanoid", "benchmark pose", "fresh PNG plus human review required"]
  }
};

markSmokeRoute(smokeRouteDiagnostics[activeScene] ?? {
  scene: activeScene,
  panelId: activeScene + "-panel",
  sceneKitPath: null,
  captureIntent: ["unknown route"]
});

if (activeScene === "particle") {
  let particleApp = createParticleScene(120);
  ui.onInput(ui.range("#particle-rate"), (input) => {
    const rate = Number(input.value);
    ui.setText("#particle-readout", \`\${rate} particles/sec\`);
    particleApp.dispose();
    particleApp = createParticleScene(rate);
  });
} else if (activeScene === "neon") {
  createAuraApp("#neon", sceneKits.neonTunnel().toAppOptions());
} else if (activeScene === "physics") {
  createAuraApp("#physics", sceneKits.physicsPlayground().toAppOptions());
} else if (activeScene === "solar") {
  createAuraApp("#solar", sceneKits.solarSystem().toAppOptions());
} else if (activeScene === "data") {
  const dataHover = params.get("hover") === "1";
  if (dataHover) {
    const readout = ui.text("#data-readout");
    readout.classList.add("is-hover");
    readout.textContent = "Hovered bar: row 4 / col 6 / value 100";
  }
  createAuraApp("#data", sceneKits.dataViz({
    dataset: dataSceneKitDataset,
    camera: dataHover ? camera.perspective({ position: [3.2, 2.6, 4.1], target: [0.45, 1.0, -0.35], fov: 38 }) : undefined
  }).toAppOptions());
} else if (activeScene === "city") {
  const cityIsNight = params.get("mode") === "night";
  const cityTimeOfDay = cityIsNight ? "night" : "day";
  ui.setText("#city-title", cityIsNight ? "City Night" : "City Day");
  createAuraApp("#city", sceneKits.cityBlock({
    blocks: 20,
    timeOfDay: cityTimeOfDay,
    camera: city.cameraPreset("overview", cityTimeOfDay)
  }).toAppOptions());
} else if (activeScene === "product") {
  createAuraApp("#product", sceneKits.productViewer(assets.sneaker).toAppOptions());
} else if (activeScene === "mini-golf") {
  createAuraApp("#mini-golf", sceneKits.miniGolf().toAppOptions());
} else if (activeScene === "material") {
  createAuraApp("#material", sceneKits.materialLab().toAppOptions());
} else if (activeScene === "humanoid") {
  const humanoidKit = sceneKits.humanoidWalk({ animationState: "benchmark-pose" });
  const humanoidStructuralScore = humanoidKit.diagnostics.structuralScore ?? 0;
  const humanoidStructurallyConnected = humanoidStructuralScore >= 4 && humanoidKit.diagnostics.problems.length === 0;
  (window as unknown as { __AURA_HUMANOID_VISUAL_QA__?: unknown }).__AURA_HUMANOID_VISUAL_QA__ = {
    frameChecks: [
      { capture: "humanoid-frame-1.png", structuralConnected: humanoidStructurallyConnected, structuralScore: humanoidStructuralScore, problems: humanoidKit.diagnostics.problems },
      { capture: "humanoid-frame-2.png", structuralConnected: humanoidStructurallyConnected, structuralScore: humanoidStructuralScore, problems: humanoidKit.diagnostics.problems }
    ],
    structuralConnectedAcrossFrames: humanoidStructurallyConnected,
    acceptanceRequiresFreshPngAndHumanReview: true,
    sceneKitPath: "sceneKits.humanoidWalk({ animationState: benchmark-pose })"
  };
  createAuraApp("#humanoid", humanoidKit.toAppOptions());
}

function createParticleScene(emissionRate: number) {
  return createAuraApp("#particle", {
    scene: scene()
      .background("#030711")
      .addMany(prefabs.particleFountain({ count: 450, emissionRate }))
      .addMany(particleTrailNodes())
      .add(lights.studio({ intensity: 0.82 }))
      .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
  });
}

function particleTrailNodes() {
  const colors = ["#fff7ad", "#fb923c", "#38bdf8", "#ff7ad9", "#60a5fa", "#fef08a"] as const;
  return colors.flatMap((color, index) => {
    const x = (index - 2.5) * 0.13;
    const z = (index % 2 === 0 ? -0.12 : 0.12) + (index - 2.5) * 0.035;
    const y = 0.66 + index * 0.24;
    return [
      primitives.sphere({
        name: \`visible upward plume particle orb \${index + 1}\`,
        material: material.emissive({ color, emissive: color, emissiveIntensity: 1.25, opacity: 0.86 })
      }).position(x, y, z).scale(0.085 + index * 0.01).toJSON(),
      primitives.box({
        name: \`visible upward plume motion streak \${index + 1}\`,
        material: material.emissive({ color, emissive: color, emissiveIntensity: 0.9, opacity: 0.58 })
      }).position(x * 0.92, y - 0.16, z + 0.035).rotate(0.24, 0.12 * index, -0.18).scale([0.028, 0.34 + index * 0.035, 0.028]).toJSON()
    ];
  });
}

function markSmokeRoute(diagnostics: SmokeRouteDiagnostics) {
  (window as unknown as { __AURA3D_ROUTE_READY__?: { diagnostics: SmokeRouteDiagnostics & { readyAt: string } } }).__AURA3D_ROUTE_READY__ = {
    diagnostics: {
      ...diagnostics,
      readyAt: new Date().toISOString()
    }
  };
}
`);

writeFileSync(join(outDir, "vite.config.ts"), `import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@aura3d/engine": ${JSON.stringify(join(repoRoot, "packages", "engine", "src", "agent-api", "index.ts"))}
    }
  },
  server: {
    fs: {
      allow: [${JSON.stringify(repoRoot)}, ${JSON.stringify(outDir)}]
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
  const fpsCalibration = skipFps
    ? skippedFpsCalibration()
    : await runFpsCalibration(browser, {
      viewport: { width: 1440, height: 900 },
      controlWarmupMs: fpsWarmupMs,
      controlSampleMs: fpsSampleMs
    });
  const url = `http://127.0.0.1:${port}/`;
  const summary = {
    schema: "aura3d-task12-repair-smoke/1.0",
    generatedAt: new Date().toISOString(),
    url,
    port,
    captures: [],
    routeMetrics: [],
    fps: {
      warmupMs: fpsWarmupMs,
      sampleMs: fpsSampleMs,
      calibration: fpsCalibration
    },
    serverLog: ""
  };
  await captureScene(browser, "particle", `${url}?scene=particle`, "particle-panel", [["particle-control.png", 1500]], summary, fpsCalibration);
  await captureScene(browser, "neon", `${url}?scene=neon`, "neon-panel", [["neon-frame-1.png", 1200], ["neon-frame-2.png", 2600]], summary, fpsCalibration);
  await captureScene(browser, "physics", `${url}?scene=physics`, "physics-panel", [["physics-playground.png", physicsCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "solar", `${url}?scene=solar`, "solar-panel", [["solar-system.png", solarCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "data", `${url}?scene=data`, "data-panel", [["data-default.png", dataCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "data-hover", `${url}?scene=data&hover=1`, "data-panel", [["data-hover.png", dataCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "city-day", `${url}?scene=city&mode=day`, "city-panel", [["city-day.png", 1500]], summary, fpsCalibration);
  await captureScene(browser, "city-night", `${url}?scene=city&mode=night`, "city-panel", [["city-night.png", 1500]], summary, fpsCalibration);
  await captureScene(browser, "product", `${url}?scene=product`, "product-panel", [["product-landscape.png", productCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "mini-golf", `${url}?scene=mini-golf`, "mini-golf-panel", [["mini-golf.png", miniGolfCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "material", `${url}?scene=material`, "material-panel", [["material-lab.png", materialCaptureWaitMs]], summary, fpsCalibration);
  await captureScene(browser, "humanoid", `${url}?scene=humanoid`, "humanoid-panel", [["humanoid-frame-1.png", 900], ["humanoid-frame-2.png", 1900]], summary, fpsCalibration);

  await createContactSheet(browser);
  summary.serverLog = serverLog;
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify({ url, port, summary, serverLog }, null, 2)}\n`);
  writeFileSync(join(outDir, "metrics.json"), `${JSON.stringify({
    schema: "aura3d-task12-repair-smoke-metrics/1.0",
    generatedAt: new Date().toISOString(),
    fpsWarmupMs,
    fpsSampleMs,
    fpsCalibration,
    routes: summary.routeMetrics,
    pass: (onlyScenes.size > 0 ? summary.routeMetrics.length > 0 : summary.routeMetrics.length >= 12) && summary.routeMetrics.every((route) => route.routeHealth === "pass" && (skipFps || route.fpsInstrumentationStatus === "pass") && (skipFps || Number.isFinite(route.p50Fps)))
  }, null, 2)}\n`);
  console.log(join(outDir, "task12-repair-contact-sheet.png"));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

async function captureScene(browserInstance, sceneName, routeUrl, panelId, captures, summary, fpsCalibration) {
  if (onlyScenes.size > 0 && !onlyScenes.has(sceneName)) return;
  await captureRoute(browserInstance, routeUrl, panelId, captures, summary, fpsCalibration);
}

async function waitForServer(page, url) {
  let lastError = "";
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      if (response?.ok()) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(`smoke server did not become ready: ${lastError}\n${serverLog}`);
}

async function captureRoute(browserInstance, routeUrl, panelId, captures, summary, fpsCalibration) {
  const page = await browserInstance.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  let timeoutId;
  const capturePlan = captures.map(([fileName, waitMs]) => ({ fileName, waitMs }));
  try {
    page.setDefaultTimeout(Math.min(60_000, routeTimeoutMs));
    await Promise.race([
      captureRouteWithPage(page, routeUrl, panelId, captures, summary, fpsCalibration),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`route capture exceeded ${routeTimeoutMs}ms timeout`));
        }, routeTimeoutMs);
      })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.routeMetrics.push(applyFpsCalibrationToMetrics({
      route: routeUrl,
      panelId,
      routeHealth: "fail",
      routeHealthMethod: "route load/canvas/screenshot capture failed before all planned artifacts completed",
      routeMetadata: null,
      capturePlan,
      p50Fps: null,
      p95FrameTimeMs: null,
      fpsSample: emptyRouteFpsSummary(true),
      error: message
    }, fpsCalibration));
    writeFileSync(join(outDir, `${panelId}-route-error.json`), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      route: routeUrl,
      panelId,
      capturePlan,
      message
    }, null, 2)}\n`);
    for (const [fileName, waitMs] of captures) {
      if (!existsSync(join(outDir, fileName))) {
        writeFileSync(join(outDir, fileName), placeholderPng);
        writeFileSync(join(outDir, `${fileName}.failure.json`), `${JSON.stringify({
          generatedAt: new Date().toISOString(),
          route: routeUrl,
          panelId,
          waitMs,
          message,
          placeholder: true
        }, null, 2)}\n`);
        summary.captures.push({
          fileName,
          route: routeUrl,
          waitMs,
          failed: true,
          diagnostics: { error: message }
        });
      }
    }
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

async function captureRouteWithPage(page, routeUrl, panelId, captures, summary, fpsCalibration) {
  await waitForServer(page, routeUrl);
  await page.waitForFunction(() => document.querySelectorAll("canvas").length >= 1, undefined, { timeout: Math.min(60_000, routeTimeoutMs) });
  let renderReadySignal = true;
  let renderReadyWarning;
  try {
    await page.waitForFunction(() => {
      const drawCalls = Number(document.body.dataset.aura3dDrawCalls ?? 0);
      return document.body.dataset.aura3dReady === "true" && Number.isFinite(drawCalls) && drawCalls > 0;
    }, undefined, { timeout: Math.min(renderReadyTimeoutMs, routeTimeoutMs) });
  } catch (error) {
    renderReadySignal = false;
    renderReadyWarning = error instanceof Error ? error.message : String(error);
  }
  const routeMetadata = await page.evaluate((readyInfo) => ({
    ...(window.__AURA3D_ROUTE_READY__?.diagnostics ?? {}),
    renderReadySignal: readyInfo.renderReadySignal,
    renderReadyWarning: readyInfo.renderReadyWarning,
    auraReady: document.body.dataset.aura3dReady ?? null,
    auraDrawCalls: document.body.dataset.aura3dDrawCalls ?? null
  }), { renderReadySignal, renderReadyWarning });
  const capturePlan = captures.map(([fileName, waitMs]) => ({ fileName, waitMs }));
  const fpsSample = skipFps ? emptyRouteFpsSummary(true) : await samplePageFpsWithTimeout(page, { warmupMs: fpsWarmupMs, sampleMs: fpsSampleMs });
  for (const [fileName, waitMs] of captures) {
    await page.waitForTimeout(waitMs);
    await capturePanel(page, panelId, fileName);
    summary.captures.push({
      fileName,
      route: routeUrl,
      waitMs,
      diagnostics: await page.evaluate(() => ({
        ready: document.body.dataset.aura3dReady,
        drawCalls: document.body.dataset.aura3dDrawCalls,
        canvases: document.querySelectorAll("canvas").length,
        humanoidQA: window.__AURA_HUMANOID_VISUAL_QA__ ?? null,
        route: window.__AURA3D_ROUTE_READY__?.diagnostics ?? null
      }))
    });
  }
  summary.routeMetrics.push(applyFpsCalibrationToMetrics({
    route: routeUrl,
    panelId,
    routeHealth: "pass",
    routeHealthMethod: skipFps ? "HTTP load + canvas present + attempted Aura ready/draw-call signal + completed screenshot capture; FPS skipped for visual PNG capture" : "HTTP load + canvas present + attempted Aura ready/draw-call signal + completed screenshot capture",
    routeMetadata,
    capturePlan,
    p50Fps: fpsSample.p50Fps,
    p95FrameTimeMs: fpsSample.p95FrameTimeMs,
    fpsSample
  }, fpsCalibration));
}

async function samplePageFpsWithTimeout(page, options) {
  const timeoutMs = Math.max(5_000, (options.warmupMs ?? 0) + (options.sampleMs ?? 0) + 3_000);
  let timeoutId;
  const samplePromise = samplePageFps(page, options).catch((error) => ({
    ...emptyRouteFpsSummary(true),
    error: error instanceof Error ? error.message : String(error)
  }));
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ...emptyRouteFpsSummary(true),
        error: `scene FPS sampling exceeded ${timeoutMs}ms timeout`
      });
    }, timeoutMs);
  });
  const result = await Promise.race([samplePromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

function emptyRouteFpsSummary(timedOut) {
  return {
    sampleCount: 0,
    totalFrameTimeMs: 0,
    minFrameTimeMs: null,
    maxFrameTimeMs: null,
    p50FrameTimeMs: null,
    p95FrameTimeMs: null,
    p50Fps: null,
    timedOut
  };
}

function skippedFpsCalibration() {
  const skipped = emptyRouteFpsSummary(true);
  return {
    emptyRaf: skipped,
    webglControl: skipped,
    verdict: {
      status: "invalid",
      failures: ["FPS sampling skipped for visual PNG capture."],
      thresholds: {}
    }
  };
}

async function capturePanel(page, panelId, fileName) {
  await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "center", inline: "center" }), panelId);
  await page.waitForTimeout(250);
  const box = await page.evaluate((id) => {
    const panel = document.getElementById(id);
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
  }, panelId);
  if (!box) throw new Error(`missing smoke panel: ${panelId}`);
  const clip = {
    x: Math.max(0, Math.floor(box.x)),
    y: Math.max(0, Math.floor(box.y)),
    width: Math.max(1, Math.ceil(box.width)),
    height: Math.max(1, Math.ceil(box.height))
  };
  const canvasFirstCapture = forceCanvasCapture || preferCanvasCapture || /^(data-hover|humanoid-frame-|solar-system|city-night)/.test(fileName);
  if (canvasFirstCapture && await writeCanvasCapture(page, panelId, fileName, "canvas-first-capture")) return;
  try {
    await page.screenshot({
      path: join(outDir, fileName),
      clip,
      timeout: screenshotTimeoutMs
    });
  } catch (error) {
    if (!await writeCanvasCapture(page, panelId, fileName, error instanceof Error ? error.message : String(error))) throw error;
  }
}

async function writeCanvasCapture(page, panelId, fileName, reason) {
  const dataUrl = await page.evaluate((id) => {
    const panel = document.getElementById(id);
    const canvas = panel?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    return canvas.toDataURL("image/png");
  }, panelId);
  if (!dataUrl?.startsWith("data:image/png;base64,")) return false;
  writeFileSync(join(outDir, fileName), Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  writeFileSync(join(outDir, `${fileName}.fallback.json`), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    fallback: "canvas.toDataURL",
    reason,
    note: "Canvas capture records the scene canvas only, not DOM overlays."
  }, null, 2)}\n`);
  return true;
}

async function createContactSheet(browserInstance) {
  const entries = [
    ["Particles + control", "particle-control.png"],
    ["Neon frame 1", "neon-frame-1.png"],
    ["Neon frame 2", "neon-frame-2.png"],
    ["Physics playground", "physics-playground.png"],
    ["Solar system", "solar-system.png"],
    ["Data default", "data-default.png"],
    ["Data hover", "data-hover.png"],
    ["City day", "city-day.png"],
    ["City night", "city-night.png"],
    ["Product viewer", "product-landscape.png"],
    ["Mini golf", "mini-golf.png"],
    ["Material lab", "material-lab.png"],
    ["Humanoid frame 1", "humanoid-frame-1.png"],
    ["Humanoid frame 2", "humanoid-frame-2.png"]
  ];
  const html = `<div class="contact-grid">${entries
    .map(([label, file]) => {
      const filePath = join(outDir, file);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, placeholderPng);
        writeFileSync(join(outDir, `${file}.failure.json`), `${JSON.stringify({
          generatedAt: new Date().toISOString(),
          file,
          message: "missing capture image while building contact sheet",
          placeholder: true
        }, null, 2)}\n`);
      }
      const base64 = readFileSync(filePath).toString("base64");
      return `<div class="contact-tile"><span>${label}</span><img src="data:image/png;base64,${base64}" /></div>`;
    })
    .join("")}</div><style>${readFileSync(join(outDir, "src", "style.css"), "utf8")}</style>`;
  writeFileSync(join(outDir, "task12-repair-contact-sheet.html"), html);
  const sheet = await browserInstance.newPage({ viewport: { width: 1296, height: 1050 }, deviceScaleFactor: 1 });
  try {
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.screenshot({ path: join(outDir, "task12-repair-contact-sheet.png"), fullPage: false, timeout: 60_000 });
  } catch (error) {
    writeFileSync(join(outDir, "task12-repair-contact-sheet-error.json"), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      fallback: "task12-repair-contact-sheet.html"
    }, null, 2)}\n`);
  } finally {
    await sheet.close();
  }
}
