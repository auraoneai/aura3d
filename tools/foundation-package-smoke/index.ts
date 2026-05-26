import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runPackageInstallSmoke } from "../package-install-smoke/index";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  readonly exports?: Record<string, string>;
  readonly files?: readonly string[];
};
const installSmoke = runPackageInstallSmoke(process.cwd(), { freshPack: true });
const requiredExports = [".", "./rendering", "./assets", "./product-studio", "./workflows"] as const;
const exportChecks = requiredExports.map((entrypoint) => ({
  entrypoint,
  exists: Object.prototype.hasOwnProperty.call(packageJson.exports ?? {}, entrypoint)
}));
const distChecks = ["dist/index.js", "dist/rendering/index.js", "dist/assets/index.js", "dist/product-studio/index.js", "dist/workflows/index.js"].map((path) => ({
  path,
  exists: existsSync(resolve(path))
}));
const filesChecks = ["dist/rendering", "dist/assets", "dist/product-studio", "dist/workflows"].map((entry) => ({
  entry,
  included: packageJson.files?.includes(entry) === true
}));

const report = {
  schema: "a3d-foundation-package-smoke",
  generatedAt: new Date().toISOString(),
  pass: installSmoke.ok && exportChecks.every((check) => check.exists) && distChecks.every((check) => check.exists) && filesChecks.every((check) => check.included),
  installSmoke,
  exportChecks,
  distChecks,
  filesChecks,
  tarballPath: installSmoke.tarballPath,
  tarballSha256: installSmoke.tarballSha256
};

const reportPath = resolve("tests/reports/foundation-package-smoke.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
