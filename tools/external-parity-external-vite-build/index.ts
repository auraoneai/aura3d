import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const reportDir = resolve("tests/reports/external-parity-external-vite-build");
const staticPreviewRoot = resolve("tests/reports/external-parity-static-preview");
const reportPath = resolve("tests/reports/external-parity-external-vite-build.json");
const templates = [
  { id: "external-parity-product-viewer", marker: "__G3D_TEMPLATE_PRODUCT_VIEWER__", requiredText: "gallery-neutral-hdr" },
  { id: "external-parity-material-studio", marker: "__G3D_TEMPLATE_MATERIAL_STUDIO__", requiredText: "studio-softbox-hdr" },
  { id: "external-parity-asset-gallery", marker: "__G3D_TEMPLATE_ASSET_GALLERY__", requiredText: "BoomBox.glb" },
  { id: "external-parity-interactive-scene", marker: "__G3D_TEMPLATE_INTERACTIVE_SCENE__", requiredText: "warehouse-industrial-hdr" }
] as const;

mkdirSync(reportDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", reportDir], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim().split(/\r?\n/).at(-1);

if (!tarballName) throw new Error("npm pack did not return a tarball name.");
const tarballPath = join(reportDir, basename(tarballName));
if (!existsSync(tarballPath)) throw new Error(`Packed tarball was not created: ${tarballPath}`);

const tempRoot = mkdtempSync(join(tmpdir(), "g3d-external-vite-"));
try {
  const builds = [];
  for (const template of templates) {
    const appDir = join(tempRoot, template.id);
    cpSync(resolve("templates", template.id), appDir, { recursive: true });
    const packagePath = join(appDir, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      "@galileo3d/engine": `file:${tarballPath}`
    };
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], {
      cwd: appDir,
      stdio: "pipe"
    });
    execFileSync("npm", ["run", "build", "--silent"], {
      cwd: appDir,
      stdio: "pipe"
    });

    const distDir = join(appDir, "dist");
    const outputFiles = listFiles(distDir).map((file) => file.slice(distDir.length + 1).replaceAll("\\", "/"));
    const staticPreviewDir = join(staticPreviewRoot, template.id);
    rmSync(staticPreviewDir, { recursive: true, force: true });
    cpSync(distDir, staticPreviewDir, { recursive: true });

    const bundledJs = outputFiles
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(join(distDir, file), "utf8"))
      .join("\n");
    builds.push({
      template: template.id,
      tempAppDir: appDir,
      outputDir: staticPreviewDir,
      outputFiles,
      ok: existsSync(join(distDir, "index.html")) &&
        outputFiles.some((file) => file.endsWith(".js")) &&
        bundledJs.includes(template.marker) &&
        bundledJs.includes(template.requiredText) &&
        !bundledJs.includes("workspace:"),
      packageDependency: packageJson.dependencies["@galileo3d/engine"]
    });
  }
  const report = {
    schema: "g3d-external-parity-external-vite-build/v1",
    generatedAt: new Date().toISOString(),
    ok: builds.length === templates.length && builds.every((build) => build.ok),
    tarballPath,
    builds,
    staticPreviewRoot,
    productBoundary: "Fresh Vite production builds for all V4 templates from a packed package. Browser static screenshot proof remains a later release gate."
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
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
    const stats = statSync(file);
    if (stats.isDirectory()) listFiles(file, output);
    else output.push(file);
  }
  return output;
}
