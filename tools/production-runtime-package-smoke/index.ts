import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const packDir = resolve("tests/reports/production-runtime-package");
const reportPath = resolve("tests/reports/production-runtime-package-smoke.json");
mkdirSync(packDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });
const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim().split(/\r?\n/).at(-1);
if (!tarballName) throw new Error("npm pack did not return a tarball name.");
const tarballPath = join(packDir, basename(tarballName));
const tempRoot = mkdtempSync(join(tmpdir(), "a3d-production-runtime-package-smoke-"));

try {
  writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ type: "module", dependencies: { "@aura3d/engine": `file:${tarballPath}` } }, null, 2));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], { cwd: tempRoot, stdio: "pipe" });
  const stdout = execFileSync("node", ["--input-type=module", "-e", `
    const workflows = await import("@aura3d/engine/workflows/production");
    const workflowsLegacy = await import("@aura3d/engine/workflows/production-runtime");
    const productionRuntime = await import("@aura3d/engine/production-runtime");
    const productionRuntimeLegacy = await import("@aura3d/engine/production-runtime");
    const renderingProduction = await import("@aura3d/engine/rendering/production-runtime");
    const renderingProductionLegacy = await import("@aura3d/engine/rendering/production-runtime");
    const assetCorpus = await import("@aura3d/engine/assets/asset-corpus");
    const assetCorpusLegacy = await import("@aura3d/engine/assets/production-runtime");
    const rendering = await import("@aura3d/engine/rendering");
    const assets = await import("@aura3d/engine/assets/browser");
    const animation = await import("@aura3d/engine/animation/browser");
    console.log(JSON.stringify({
      hasRunProductionExample: typeof workflows.runProductionExample === "function",
      contextualWorkflowsMatchLegacy: workflows.runProductionExample === workflowsLegacy.runProductionExample,
      contextualRuntimeMatchesLegacy: productionRuntime.A3DRenderer === productionRuntimeLegacy.A3DRenderer,
      contextualRenderingMatchesLegacy: renderingProduction.ProductionRuntimeRenderer === renderingProductionLegacy.ProductionRuntimeRenderer,
      contextualAssetsMatchLegacy: assetCorpus.loadProductionAssetManifest === assetCorpusLegacy.loadProductionAssetManifest,
      hasProductionWebGL2Renderer: typeof rendering.ProductionWebGL2Renderer === "function",
      hasLoadProductionGLTFRenderPipeline: typeof assets.loadProductionGLTFRenderPipeline === "function",
      hasAnimationClip: typeof animation.AnimationClip === "function"
    }));
  `], { cwd: tempRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const imports = JSON.parse(stdout.trim()) as Record<string, boolean>;
  const report = {
    schema: "a3d-production-runtime-package-smoke",
    generatedAt: new Date().toISOString(),
    pass: existsSync(tarballPath) && Object.values(imports).every(Boolean),
    tarballPath,
    imports
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
