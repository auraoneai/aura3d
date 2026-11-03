/**
 * Acceptance against a restored, candidate-bound scaffold. The global source
 * freeze and source report must pass before restoration or server startup.
 */
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { loadValidatedReleasePlan } from "../../tools/release/exact-release-plan.mjs";
import { restorePackedConsumerProject, restorePortableConsumerProject, validateSourceConsumerReport, type NativeConsumerProject } from "../../tools/package-clean-install/index";
import { consumerReportFromEnvironment, restoreGatedBrowserConsumer, type BrowserGateRecord } from "../../tools/native-capability-gate/browser-contract";
import { TEMPLATE_ENVIRONMENT_PRESETS } from "../../packages/create-aura3d/src/template-hdri";

const root = process.cwd();
const contains = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

/** Serve the restored scaffold's actual files: missing files are real HTTP 404s. */
async function serveRestoredProject(project: string, installed: NativeConsumerProject["installedPackages"]): Promise<{ server: Server; origin: string }> {
  const projectDir = realpathSync(project);
  const publicDir = realpathSync(resolve(projectDir, "public"));
  if (!contains(projectDir, publicDir) || !statSync(publicDir).isDirectory()) throw new Error("Restored project public directory is missing or unsafe");
  const candidates = [
    { name: "@aura3d/engine", installPath: "node_modules/@aura3d/engine", module: "dist/rendering/environment/EnvironmentCache.js" },
    { name: "@aura3d/rendering", installPath: "node_modules/@aura3d/rendering", module: "dist/environment/EnvironmentCache.js" }
  ];
  const selected = candidates.find((candidate) => installed.some(item => item.name === candidate.name && item.installPath === candidate.installPath) &&
    existsSync(join(projectDir, candidate.installPath, candidate.module)));
  if (!selected) throw new Error("Packed candidate environment loader is not present in the restored project");
  const modulePath = realpathSync(join(projectDir, selected.installPath, selected.module));
  if (!contains(projectDir, modulePath) || !statSync(modulePath).isFile()) throw new Error("Environment loader escapes the restored project");
  const built = await build({
    stdin: {
      contents: `import { defaultProbeLoader } from ${JSON.stringify(modulePath)};
const loader = defaultProbeLoader(() => ({}));
globalThis.__nativeEnvironmentLoad = async (preset) => {
  try {
    const probe = await loader({ preset, tier: "balanced" });
    const result = { faceSize: probe.faceSize, mipCount: probe.mipCount, sh9: Array.from(probe.sh9 || []) };
    probe.dispose();
    return result;
  } catch (error) { return { error: String(error && error.message || error) }; }
};`,
      resolveDir: projectDir,
      sourcefile: "native-environment-probe.js",
      loader: "js"
    },
    absWorkingDir: projectDir,
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
    tsconfigRaw: { compilerOptions: {} },
    logLevel: "silent"
  });
  for (const input of Object.keys(built.metafile.inputs)) {
    if (input === "native-environment-probe.js" || input === "<stdin>") continue;
    if (!contains(projectDir, realpathSync(resolve(projectDir, input)))) throw new Error("Environment bundle resolved outside the restored consumer");
  }
  const js = built.outputFiles[0]?.contents;
  if (!js?.length) throw new Error("Bundling the installed environment loader produced no output");
  const server = createServer((req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      if (path === "/") { res.setHeader("content-type", "text/html"); res.end('<script type="module" src="/probe.js"></script>'); return; }
      if (path === "/probe.js") { res.setHeader("content-type", "text/javascript"); res.end(js); return; }
      const file = realpathSync(resolve(publicDir, `.${path}`));
      if (!contains(publicDir, file) || !statSync(file).isFile()) throw new Error("unsafe public file");
      res.setHeader("content-type", extname(file) === ".json" ? "application/json" : "application/octet-stream");
      res.end(readFileSync(file));
    } catch { res.writeHead(404); res.end("missing"); }
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => accept()); });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((done) => server.close(() => done()));
    throw new Error("Could not bind restored project server");
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test.describe("installed template environments", () => {
  test.setTimeout(600_000);
  let serving: Awaited<ReturnType<typeof serveRestoredProject>> | undefined;
  let restored: Awaited<ReturnType<typeof restoreGatedBrowserConsumer>> | undefined;
  test.beforeAll(async () => {
    const gatePath = process.env.AURA3D_CODE_COMPLETE_GATE;
    const reportPath = consumerReportFromEnvironment(process.env);
    const candidatePlan = process.env.A3D_RELEASE_PLAN;
    if (!gatePath || !candidatePlan) throw new Error("A code-complete gate, native consumer source report and candidate plan are required");
    const gateModulePath = "../../tools/native-capability-gate/index.mjs";
    const gateModule = await import(gateModulePath) as { validateAcceptanceGate(input: { root: string; gatePath: string; sourceReport: string }): BrowserGateRecord };
    let installed: NativeConsumerProject["installedPackages"] = [];
    restored = await restoreGatedBrowserConsumer(
      () => gateModule.validateAcceptanceGate({ root, gatePath, sourceReport: reportPath }),
      { candidatePlan, reports: { sourceConsumerReport: reportPath } },
      async (destination, gate) => {
        if (createHash("sha256").update(readFileSync(resolve(root, reportPath))).digest("hex") !== gate.sourceConsumerReport?.sha256) {
          throw new Error("Consumer source report changed after gate validation");
        }
        const plan = loadValidatedReleasePlan(root, candidatePlan);
        if (!plan || plan.reference.path !== gate.candidatePlan.path || plan.reference.sha256 !== gate.candidatePlan.sha256) {
          throw new Error("Packed candidate differs from the validated gate");
        }
        const source = validateSourceConsumerReport(root, reportPath, plan);
        const selected = source.projects.find(project => project.kind === "template" && project.template === "product-viewer");
        if (!selected || (selected.retention !== "portable-v1" && selected.retention !== "packed-v1")) throw new Error("Retained product-viewer project is missing");
        installed = selected.installedPackages;
        if (selected.retention === "packed-v1") await restorePackedConsumerProject(root, selected, destination, plan);
        else await restorePortableConsumerProject(root, selected, destination, plan);
      }
    );
    try { serving = await serveRestoredProject(restored.directory, installed); }
    catch (error) { restored.cleanup(); restored = undefined; throw error; }
  });
  test.afterAll(async () => {
    try { if (serving) await new Promise<void>((done, fail) => serving!.server.close((error) => error ? fail(error) : done())); }
    finally { restored?.cleanup(); }
  });

  test("neutral loads offline without environment file requests", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/aura-environments/")) requests.push(request.url()); });
    await page.route("**/aura-environments/**", (route) => route.abort());
    await page.goto(serving!.origin);
    await page.waitForFunction(() => typeof window.__nativeEnvironmentLoad === "function");
    const probe = await page.evaluate(() => window.__nativeEnvironmentLoad!("neutral"));
    expect(probe.error).toBeUndefined();
    expect(probe.faceSize).toBeGreaterThan(0);
    expect(probe.mipCount).toBeGreaterThan(0);
    expect(probe.sh9).toHaveLength(27);
    expect(requests).toEqual([]);
  });

  for (const name of TEMPLATE_ENVIRONMENT_PRESETS) {
    test(`${name} loads actual retained preset files`, async ({ page }) => {
      const responses: Array<{ path: string; status: number }> = [];
      page.on("response", (response) => {
        const path = new URL(response.url()).pathname;
        if (path.startsWith("/aura-environments/")) responses.push({ path, status: response.status() });
      });
      await page.goto(serving!.origin);
      await page.waitForFunction(() => typeof window.__nativeEnvironmentLoad === "function");
      const probe = await page.evaluate((preset) => window.__nativeEnvironmentLoad!(preset), name);
      expect(probe.error).toBeUndefined();
      expect(probe.faceSize).toBeGreaterThan(0);
      expect(probe.mipCount).toBeGreaterThan(0);
      expect(probe.sh9).toHaveLength(27);
      expect(probe.sh9?.every(Number.isFinite)).toBe(true);
      expect(responses).toEqual(expect.arrayContaining([
        { path: `/aura-environments/${name}.manifest.json`, status: 200 },
        { path: `/aura-environments/${name}.specular.ktx2`, status: 200 },
        { path: `/aura-environments/${name}.sh9.f32`, status: 200 }
      ]));
    });
  }

  test("missing preset returns an explicit diagnostic from a real 404", async ({ page }) => {
    let missingStatus: number | undefined;
    page.on("response", (response) => { if (response.url().endsWith("/aura-environments/no-such-preset.manifest.json")) missingStatus = response.status(); });
    await page.goto(serving!.origin);
    await page.waitForFunction(() => typeof window.__nativeEnvironmentLoad === "function");
    const result = await page.evaluate(() => window.__nativeEnvironmentLoad!("no-such-preset"));
    expect(missingStatus).toBe(404);
    expect(result.error).toMatch(/ENV_PRESET_UNAVAILABLE:no-such-preset.*aura-environments/);
  });
});

declare global {
  interface Window {
    __nativeEnvironmentLoad?: (preset: string) => Promise<{ faceSize?: number; mipCount?: number; sh9?: number[]; error?: string }>;
  }
}
