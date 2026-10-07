import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = process.cwd();
const reportDir = resolve("tests/reports/external-parity-package-smoke");
const reportPath = resolve("tests/reports/external-parity-package-smoke.json");
mkdirSync(reportDir, { recursive: true });

const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", reportDir], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim().split(/\r?\n/).at(-1);
if (!tarballName) throw new Error("npm pack did not produce a tarball.");
const tarballPath = join(reportDir, basename(tarballName));
const tempRoot = mkdtempSync(join(tmpdir(), "a3d-package-smoke-"));
const scaffoldRoot = join(tempRoot, "scaffolded");

try {
  writeFileSync(join(tempRoot, "package.json"), `${JSON.stringify({
    name: "a3d-external-parity-package-smoke",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      "@aura3d/engine": `file:${tarballPath}`
    }
  }, null, 2)}\n`);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--silent"], {
    cwd: tempRoot,
    stdio: "pipe"
  });
  const smokeSource = `
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createDiagnosticsPanel, createEnvironment, createA3DApp, createMaterialVariantController, workflows } from "@aura3d/engine";
import { createA3DApp as createA3DAppFromEngineSubpath } from "@aura3d/engine/engine";
import { createA3DProject } from "@aura3d/engine/create-aura3d";

assert.equal(typeof createA3DApp, "function");
assert.equal(createA3DApp, createA3DAppFromEngineSubpath);
assert.equal(typeof workflows.productConfigurator, "function");
assert.equal(createEnvironment({ target: "gallery-neutral-hdr" }).target, "gallery-neutral-hdr");
assert.equal(createMaterialVariantController(["asset", "contrast"], "asset").setVariant("contrast"), "contrast");
assert.equal(createDiagnosticsPanel().kind, "a3d-diagnostics-panel");
const templates = ["external-parity-product-viewer", "external-parity-material-studio", "external-parity-asset-gallery", "external-parity-interactive-scene"];
const results = [];
for (const template of templates) {
  const targetDir = ${JSON.stringify(scaffoldRoot)} + "/" + template;
  const result = createA3DProject({ targetDir, template, packageVersion: "0.1.0-alpha.0" });
  assert.equal(result.template, template);
  assert.equal(existsSync(targetDir + "/src/main.ts"), true);
  const source = readFileSync(targetDir + "/src/main.ts", "utf8");
  assert.equal(source.includes('from "@aura3d/engine"'), true);
  assert.equal(source.includes("workspace:"), false);
  results.push(result);
}
console.log(JSON.stringify({ ok: true, templates: results, publicRootImport: true }));
`;
  writeFileSync(join(tempRoot, "smoke.mjs"), smokeSource);
  const stdout = execFileSync("node", ["smoke.mjs"], {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    exports: Record<string, string>;
    files: string[];
  };
  const tarballBytes = statSync(tarballPath).size;
  const report = {
    schema: "a3d-external-parity-package-smoke",
    generatedAt: new Date().toISOString(),
    ok: stdout.includes("\"ok\":true") &&
      manifest.exports["."] === "./dist/engine/index.js" &&
      manifest.exports["./create-aura3d"] === "./dist/create-aura3d/index.js" &&
      ["templates/external-parity-product-viewer", "templates/external-parity-material-studio", "templates/external-parity-asset-gallery", "templates/external-parity-interactive-scene"].every((file) => manifest.files.includes(file)) &&
      tarballBytes > 10_000,
    tarballPath,
    tarballBytes,
    tarballSha256: createHash("sha256").update(readFileSync(tarballPath)).digest("hex"),
    smokeStdout: stdout.trim(),
    packageExports: manifest.exports,
    packageFiles: manifest.files,
    productBoundary: "Package smoke proves packed install, root product API import, create-aura3d scaffold, and template inclusion."
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
