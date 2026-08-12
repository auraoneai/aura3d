import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { build } from "vite";
import { expect, test, type Page } from "@playwright/test";
import { createA3DProject } from "../../packages/create-aura3d/src/index";
import rootViteConfig from "../../vite.config";

const SOURCE = resolve("benchmark/current-head-to-head/scaffold-to-deploy"); const REPORT_DIRECTORY = resolve("tests/reports/current-head-to-head/scaffold-to-deploy"); let cleanRoot = ""; let auraServer: StaticServer; let threeServer: StaticServer; let scaffoldFiles: readonly string[] = []; let workflowTimings: WorkflowTimings;
test.describe("current head-to-head scaffold to deploy", () => {
  test.beforeAll(async () => {
    test.setTimeout(300_000);
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
    cleanRoot = mkdtempSync(resolve(".head-to-head-clean-"));
    const auraDir = join(cleanRoot, "aura");
    const threeDir = join(cleanRoot, "three");
    const aura: Record<WorkflowPhase, number> = emptyWorkflowRecord();
    const three: Record<WorkflowPhase, number> = emptyWorkflowRecord();

    aura.scaffolding = measureSync(() => {
      const generated = createA3DProject({ targetDir: auraDir, template: "product-viewer", packageVersion: "2.0.0", rootDir: resolve("packages/create-aura3d") });
      scaffoldFiles = generated.files;
    });
    three.scaffolding = measureSync(() => {
      mkdirSync(join(threeDir, "src"), { recursive: true });
      mkdirSync(join(threeDir, "public/aura-assets"), { recursive: true });
      writeFileSync(join(threeDir, "package.json"), `${JSON.stringify({ name: "clean-three-r3f", private: true, type: "module", dependencies: { react: "19.2.8", "react-dom": "19.2.8", three: "0.185.1", "@react-three/fiber": "9.7.0", "@react-three/drei": "10.7.8" } }, null, 2)}\n`);
    });

    aura.assetAcquisition = measureSync(() => {
      rmSync(join(auraDir, "public/aura-assets"), { recursive: true, force: true });
      mkdirSync(join(auraDir, "public/aura-assets"), { recursive: true });
      cpSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"), join(auraDir, "public/aura-assets/showcaseHeadphones.40b1fdf7.glb"));
    });
    three.assetAcquisition = measureSync(() => {
      cpSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"), join(threeDir, "public/aura-assets/showcaseHeadphones.40b1fdf7.glb"));
    });

    const auraFinal = readFileSync(resolve(SOURCE, "aura-main.ts"), "utf8");
    const threeFinal = readFileSync(resolve(SOURCE, "three-main.tsx"), "utf8");
    const auraInitial = auraFinal.replace('document.getElementById("interact")!.addEventListener("click", () => { void mount(true); });', "// interaction is added in the next measured phase");
    const threeInitial = threeFinal.replace(/useEffect\(\(\) => \{ document\.getElementById\("interact"\)![\s\S]*?\}, \[\]\); return <Canvas/u, "return <Canvas");
    expect(auraInitial).not.toBe(auraFinal);
    expect(threeInitial).not.toBe(threeFinal);
    aura.firstEdit = measureSync(() => {
      writeFileSync(join(auraDir, "src/main.ts"), auraInitial);
      cpSync(resolve(SOURCE, "aura-index.html"), join(auraDir, "index.html"));
    });
    three.firstEdit = measureSync(() => {
      writeFileSync(join(threeDir, "src/main.tsx"), threeInitial);
      cpSync(resolve(SOURCE, "three-index.html"), join(threeDir, "index.html"));
    });
    aura.interactionAddition = measureSync(() => writeFileSync(join(auraDir, "src/main.ts"), auraFinal));
    three.interactionAddition = measureSync(() => writeFileSync(join(threeDir, "src/main.tsx"), threeFinal));

    aura.errorRecovery = await measureAsync(() => proveBuildErrorAndRestore(auraDir, "src/main.ts", auraFinal, rootViteConfig.resolve));
    three.errorRecovery = await measureAsync(() => proveBuildErrorAndRestore(threeDir, "src/main.tsx", threeFinal));
    aura.productionBuild = await measureAsync(() => build({ root: auraDir, base: "/", logLevel: "error", resolve: rootViteConfig.resolve, build: { outDir: "dist", emptyOutDir: true } }).then(() => undefined));
    three.productionBuild = await measureAsync(() => build({ root: threeDir, base: "/", logLevel: "error", build: { outDir: "dist", emptyOutDir: true } }).then(() => undefined));
    aura.deploy = await measureAsync(async () => { auraServer = await serve(join(auraDir, "dist")); });
    three.deploy = await measureAsync(async () => { threeServer = await serve(join(threeDir, "dist")); });
    workflowTimings = {
      unit: "milliseconds",
      aura,
      three,
      boundary: "Automated local phase latency on one machine. First edit and interaction addition time deterministic file mutations, error recovery times an intentional unresolved-import build failure plus restoration, and deploy times local static-server readiness. These are not human cognition, package installation, or cloud rollout timings."
    };
  });
  test.afterAll(async () => { await auraServer?.close(); await threeServer?.close(); if (cleanRoot.includes(".head-to-head-clean-")) rmSync(cleanRoot, { recursive: true, force: true }); });
  test("scaffolds, builds, serves, interacts with, and retains both deploy outputs", async ({ browser }) => { test.setTimeout(300_000); const assetHash = createHash("sha256").update(readFileSync(resolve("public/aura-assets/showcaseHeadphones.40b1fdf7.glb"))).digest("hex"); const aura = await inspect(browser, auraServer.origin, "aura", "#app canvas", "__CLEAN_AURA__", "__CLEAN_AURA_ERROR__"); const three = await inspect(browser, threeServer.origin, "three", "#root canvas", "__CLEAN_THREE__", "__CLEAN_THREE_ERROR__"); expect(aura.before).toMatchObject({ ready: true, package: "@aura3d/lean", entry: "product", publicApiOnly: true, backend: "webgl2" }); expect(three.before).toMatchObject({ ready: true, package: "three-react-r3f", actualR3F: true, actualDrei: true, revision: "185", backend: "webgl2" }); expect(aura.beforeHash).not.toBe(aura.afterHash); expect(three.beforeHash).not.toBe(three.afterHash); expect(scaffoldFiles).toEqual(expect.arrayContaining(["index.html", "package.json", "src/main.ts", "src/aura-assets.ts"])); expect(statSync(join(cleanRoot, "aura/dist/index.html")).size).toBeGreaterThan(100); expect(statSync(join(cleanRoot, "three/dist/index.html")).size).toBeGreaterThan(100); expect(assetHash).toBe("40b1fdf7e0afdf0e5f950040f42608d3655561e61f32b9ad59690476abb15833"); writeFileSync(resolve(REPORT_DIRECTORY, "report.json"), `${JSON.stringify({ schema: "aura3d.current-head-to-head-workload/1.0", generatedAt: new Date().toISOString(), pass: true, assetSha256: assetHash, scaffoldFiles, workflowTimings, build: { aura: listDist(join(cleanRoot, "aura/dist")), three: listDist(join(cleanRoot, "three/dist")) }, aura, three }, null, 2)}\n`); });
  test("keeps the clean Aura source public-only and the control on current React/R3F/Drei/Three", () => { const aura = readFileSync(resolve(SOURCE, "aura-main.ts"), "utf8"); const three = readFileSync(resolve(SOURCE, "three-main.tsx"), "utf8"); expect(aura).toContain('from "@aura3d/lean/product"'); expect(aura).not.toContain("packages/"); expect(three).toContain('from "@react-three/fiber"'); expect(three).toContain('from "@react-three/drei"'); expect(three).toContain('from "three"'); });
});
async function inspect(browser: import("@playwright/test").Browser, origin: string, engine: "aura" | "three", canvasSelector: string, stateKey: string, errorKey: string) { const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); await page.goto(origin, { waitUntil: "networkidle" }); await page.waitForFunction(([state, failure]) => Boolean((window as any)[state]?.ready || (window as any)[failure]), [stateKey, errorKey], { timeout: 180_000 }); const failure = await page.evaluate((key) => (window as any)[key], errorKey); expect(failure ?? errors.join(" | ")).toBeFalsy(); const before = await page.evaluate((key) => (window as any)[key], stateKey); const beforeHash = await capture(page, canvasSelector, `${engine}-before.png`); await page.locator("#interact").click(); if (engine === "aura") await page.waitForFunction((key) => (window as any)[key]?.interacted === true, stateKey); else await page.waitForFunction((key) => (window as any)[key]?.interacted === true, stateKey); await page.waitForTimeout(100); const after = await page.evaluate((key) => (window as any)[key], stateKey); const afterHash = await capture(page, canvasSelector, `${engine}-after.png`); await page.close(); return { before, after, beforeHash, afterHash }; }
async function capture(page: Page, selector: string, name: string) { const data = await page.$eval(selector, (canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png")); const bytes = Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64"); writeFileSync(resolve(REPORT_DIRECTORY, name), bytes); return createHash("sha256").update(bytes).digest("hex"); }
async function serve(root: string): Promise<StaticServer> { const server = createServer((request, response) => { const pathname = new URL(request.url ?? "/", "http://localhost").pathname; const candidate = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`); if (!candidate.startsWith(resolve(root))) { response.writeHead(403).end(); return; } try { const bytes = readFileSync(candidate); response.writeHead(200, { "content-type": mime(candidate) }); response.end(bytes); } catch { response.writeHead(404).end(); } }); await new Promise<void>((done) => server.listen(0, "127.0.0.1", done)); const address = server.address(); if (!address || typeof address === "string") throw new Error("Static deploy server failed"); return { origin: `http://127.0.0.1:${address.port}/`, close: () => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())) }; }
interface StaticServer { origin: string; close(): Promise<void> }
type WorkflowPhase = "scaffolding" | "assetAcquisition" | "firstEdit" | "interactionAddition" | "errorRecovery" | "productionBuild" | "deploy";
interface WorkflowTimings { readonly unit: "milliseconds"; readonly aura: Record<WorkflowPhase, number>; readonly three: Record<WorkflowPhase, number>; readonly boundary: string }
function emptyWorkflowRecord(): Record<WorkflowPhase, number> { return { scaffolding: 0, assetAcquisition: 0, firstEdit: 0, interactionAddition: 0, errorRecovery: 0, productionBuild: 0, deploy: 0 }; }
function measureSync(action: () => void): number { const started = performance.now(); action(); return Number((performance.now() - started).toFixed(3)); }
async function measureAsync(action: () => Promise<void>): Promise<number> { const started = performance.now(); await action(); return Number((performance.now() - started).toFixed(3)); }
async function proveBuildErrorAndRestore(directory: string, entry: string, finalSource: string, aliases?: typeof rootViteConfig.resolve): Promise<void> { const path = join(directory, entry); writeFileSync(path, `import "__intentional_missing_workflow_module__";\n${finalSource}`); let rejected = false; try { await build({ root: directory, base: "/", logLevel: "silent", ...(aliases ? { resolve: aliases } : {}), build: { outDir: "dist-error-recovery", emptyOutDir: true } }); } catch { rejected = true; } finally { writeFileSync(path, finalSource); rmSync(join(directory, "dist-error-recovery"), { recursive: true, force: true }); } if (!rejected) throw new Error(`${entry}: intentional unresolved import did not fail the recovery build.`); }
function mime(path: string) { return ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"; }
function listDist(root: string) { const files: Array<{ path: string; bytes: number }> = []; const walk = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) walk(path); else files.push({ path: path.slice(root.length + 1), bytes: statSync(path).size }); } }; walk(root); return files.sort((left, right) => left.path.localeCompare(right.path)); }
