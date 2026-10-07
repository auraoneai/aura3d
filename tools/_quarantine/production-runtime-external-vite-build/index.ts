import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const packDir = resolve("tests/reports/production-runtime-external-vite-pack");
const previewDir = resolve("tests/reports/production-runtime-external-consumer-preview");
const reportPath = resolve("tests/reports/production-runtime-external-vite-build.json");
mkdirSync(packDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });
const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim().split(/\r?\n/).at(-1);
if (!tarballName) throw new Error("npm pack did not return a tarball name.");
const tarballPath = join(packDir, basename(tarballName));
const tempRoot = mkdtempSync(join(tmpdir(), "a3d-production-runtime-external-consumer-"));
const appDir = join(tempRoot, "app");

try {
  mkdirSync(join(appDir, "src"), { recursive: true });
  writeFileSync(join(appDir, "package.json"), `${JSON.stringify({
    type: "module",
    scripts: { build: "vite build" },
    dependencies: { "@aura3d/engine": `file:${tarballPath}` },
    devDependencies: { vite: "^7.3.2", typescript: "^5.9.3" }
  }, null, 2)}\n`);
  writeFileSync(join(appDir, "vite.config.ts"), `import { defineConfig } from "vite";\nexport default defineConfig({ base: "./" });\n`);
  writeFileSync(join(appDir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A3D Production External Consumer</title><style>body{margin:0;background:#070a0f;color:#eef2f6;font-family:system-ui,sans-serif}.shell{display:grid;grid-template-rows:auto 1fr;min-height:100vh}canvas{width:100vw;height:calc(100vh - 100px);display:block}.a3d-production-runtime-panel,.a3d-production-runtime-metrics{display:flex;justify-content:space-between;gap:16px;padding:14px 18px;background:#111820}.a3d-production-runtime-metrics{justify-content:flex-start;color:#b7c4cf}</style></head><body><main class="shell"><div id="app"></div><canvas id="viewport" width="960" height="540"></canvas></main><script type="module" src="./src/main.ts"></script></body></html>\n`);
  writeFileSync(join(appDir, "src/main.ts"), `import { runProductionExample } from "@aura3d/engine/workflows/production";\n\nvoid runProductionExample({\n  appId: "production-runtime-external-consumer",\n  sceneId: "external-damaged-helmet",\n  title: "External Production Consumer",\n  workflow: "fresh Vite app importing production APIs from packed @aura3d/engine",\n  assets: [{ id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" }],\n  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },\n  postprocess: true,\n  webgpuReport: false,\n  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]\n});\n`);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], { cwd: appDir, stdio: "pipe" });
  execFileSync("npm", ["run", "build", "--silent"], { cwd: appDir, stdio: "pipe" });
  rmSync(previewDir, { recursive: true, force: true });
  cpSync(join(appDir, "dist"), previewDir, { recursive: true });
  const outputFiles = listFiles(previewDir).map((file) => file.slice(previewDir.length + 1).replaceAll("\\", "/"));
  const js = outputFiles.filter((file) => file.endsWith(".js")).map((file) => readFileSync(join(previewDir, file), "utf8")).join("\n");
  const report = {
    schema: "a3d-production-runtime-external-vite-build",
    generatedAt: new Date().toISOString(),
    pass: existsSync(join(previewDir, "index.html")) &&
      outputFiles.some((file) => file.endsWith(".js")) &&
      !js.includes("workspace:") &&
      !js.includes("__vite-browser-external"),
    tarballPath,
    previewDir,
    outputFiles
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function listFiles(dir: string, output: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) listFiles(file, output);
    else output.push(file);
  }
  return output;
}
