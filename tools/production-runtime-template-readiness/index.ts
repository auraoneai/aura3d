import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

type Obj = Record<string, unknown>;

const templates = [
  "production-product-configurator",
  "production-asset-inspector",
  "production-material-studio",
  "production-architecture-viewer",
  "production-webgpu-starter"
] as const;
const reportPath = resolve("tests/reports/production-runtime-template-readiness.json");
const packDir = resolve("tests/reports/production-runtime-template-pack");
const previewRoot = resolve("tests/reports/production-runtime-template-external-builds");

mkdirSync(dirname(reportPath), { recursive: true });
mkdirSync(packDir, { recursive: true });
mkdirSync(previewRoot, { recursive: true });

const templateReports = templates.map((template) => {
  const root = `templates/${template}`;
  const mirror = `packages/create-g3d/templates/${template}`;
  const main = readFileSync(resolve(root, "src/main.ts"), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, "asset-manifest.json"), "utf8")) as { fetchInstructions?: string; assets?: readonly Obj[] };
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { dependencies?: Obj; devDependencies?: Obj };
  const runtimePath = resolve(`tests/reports/production-runtime-templates/${template}.json`);
  const runtime = existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf8")) as { runtime?: Obj } : {};
  const screenshotPath = resolve(`tests/reports/production-runtime-templates/${template}.png`);
  return {
    template,
    filesPresent: ["package.json", "index.html", "src/main.ts", "asset-manifest.json", "README.md"].every((file) => existsSync(resolve(root, file))) &&
      ["package.json", "index.html", "src/main.ts", "asset-manifest.json", "README.md"].every((file) => existsSync(resolve(mirror, file))),
    publicImport: main.includes("from \"@galileo3d/engine/workflows/production\"") && !main.includes("workspace:") && !main.includes("/packages/"),
    packageReady: packageJson.dependencies?.["@galileo3d/engine"] === "0.1.0-alpha.0" && packageJson.devDependencies?.vite !== undefined && !JSON.stringify(packageJson).includes("workspace:"),
    assetManifest: manifest.fetchInstructions?.includes("/fixtures/production-runtime") === true && (manifest.assets?.length ?? 0) >= 2 && manifest.assets?.every((asset) => typeof asset.sha256 === "string"),
    browserProof: runtime.runtime && obj(runtime.runtime).status === "ready" && obj(runtime.runtime).rendererBackend === "webgl2",
    screenshotPresent: existsSync(screenshotPath) && statSync(screenshotPath).size > 10_000
  };
});

const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { files?: readonly string[] };
const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim().split(/\r?\n/).at(-1);
if (!tarballName) throw new Error("npm pack did not return a tarball name.");
const tarballPath = join(packDir, basename(tarballName));

const tempRoot = mkdtempSync(join(tmpdir(), "g3d-production-runtime-template-build-"));
const externalBuilds: Obj[] = [];
try {
  for (const template of templates) {
    const appDir = join(tempRoot, template);
    cpSync(resolve("templates", template), appDir, { recursive: true });
    const packagePath = join(appDir, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { dependencies?: Record<string, string> };
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      "@galileo3d/engine": `file:${tarballPath}`
    };
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], { cwd: appDir, stdio: "pipe" });
    execFileSync("npm", ["run", "build", "--silent"], { cwd: appDir, stdio: "pipe" });
    const distDir = join(appDir, "dist");
    const outputFiles = listFiles(distDir).map((file) => file.slice(distDir.length + 1).replaceAll("\\", "/"));
    const previewDir = join(previewRoot, template);
    rmSync(previewDir, { recursive: true, force: true });
    cpSync(distDir, previewDir, { recursive: true });
    const js = outputFiles.filter((file) => file.endsWith(".js")).map((file) => readFileSync(join(distDir, file), "utf8")).join("\n");
    const hasBrowserBundle = existsSync(join(distDir, "index.html")) && outputFiles.some((file) => file.endsWith(".js"));
    externalBuilds.push({
      template,
      ok: hasBrowserBundle &&
        !js.includes("workspace:") &&
        !js.includes("__vite-browser-external"),
      outputDir: previewDir,
      outputFiles
    });
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

const checks = [
  { id: "template-files", pass: templateReports.every((report) => report.filesPresent), detail: templateReports.filter((report) => !report.filesPresent).map((report) => report.template).join(", ") },
  { id: "public-imports", pass: templateReports.every((report) => report.publicImport), detail: templateReports.filter((report) => !report.publicImport).map((report) => report.template).join(", ") },
  { id: "package-json", pass: templateReports.every((report) => report.packageReady), detail: templateReports.filter((report) => !report.packageReady).map((report) => report.template).join(", ") },
  { id: "asset-manifest", pass: templateReports.every((report) => report.assetManifest), detail: templateReports.filter((report) => !report.assetManifest).map((report) => report.template).join(", ") },
  { id: "browser-proof", pass: templateReports.every((report) => report.browserProof && report.screenshotPresent), detail: templateReports.filter((report) => !report.browserProof || !report.screenshotPresent).map((report) => report.template).join(", ") },
  { id: "package-files", pass: templates.every((template) => rootPackage.files?.includes(`templates/${template}`)), detail: "root package includes V6 templates" },
  { id: "packed-external-vite-build", pass: externalBuilds.length === templates.length && externalBuilds.every((build) => build.ok === true), detail: externalBuilds.filter((build) => build.ok !== true).map((build) => String(build.template)).join(", ") || tarballPath }
];
const report = {
  schema: "g3d-production-runtime-template-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  templates: templateReports,
  tarballPath,
  externalBuilds,
  checks
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function listFiles(dir: string, output: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    const stats = statSync(file);
    if (stats.isDirectory()) listFiles(file, output);
    else output.push(file);
  }
  return output;
}
