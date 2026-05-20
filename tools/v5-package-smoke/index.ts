import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const reportDir = resolve("tests/reports/v5-external-consumer");
mkdirSync(reportDir, { recursive: true });
const packRoot = resolve("tests/reports/v5-external-consumer/pack-root");
rmSync(packRoot, { recursive: true, force: true });
mkdirSync(packRoot, { recursive: true });
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};
const packJson = {
  ...packageJson,
  scripts: {},
  devDependencies: Object.fromEntries(Object.entries(packageJson.devDependencies ?? {}).filter(([, version]) => !version.startsWith("workspace:")))
};
writeFileSync(join(packRoot, "package.json"), `${JSON.stringify(packJson, null, 2)}\n`);
for (const item of ["dist", "templates", "README.md"]) {
  if (existsSync(resolve(item))) cpSync(resolve(item), join(packRoot, item), { recursive: true });
}
execFileSync("npm", ["pack", packRoot, "--pack-destination", reportDir], { stdio: "pipe" });
const tarballs = readdirSync(reportDir).filter((file) => file.endsWith(".tgz"));
const latest = tarballs.sort().at(-1);
const installDir = resolve("tests/reports/v5-external-consumer/temp-app");
rmSync(installDir, { recursive: true, force: true });
mkdirSync(installDir, { recursive: true });
if (latest) {
  writeFileSync(join(installDir, "package.json"), `${JSON.stringify({ type: "module", dependencies: { "@galileo3d/engine": `file:../${latest}` } }, null, 2)}\n`);
  execFileSync("npm", ["install", "--ignore-scripts", "--package-lock=false"], { cwd: installDir, stdio: "pipe" });
}
const report = {
  schema: "g3d-v5-package-smoke/v1",
  generatedAt: new Date().toISOString(),
  pass: Boolean(latest) && existsSync(join(installDir, "node_modules/@galileo3d/engine/package.json")),
  tarball: latest ? `tests/reports/v5-external-consumer/${latest}` : null,
  installedTempApp: "tests/reports/v5-external-consumer/temp-app"
};
const reportPath = resolve("tests/reports/v5-package-smoke.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 package smoke passed: ${report.tarball}`);
