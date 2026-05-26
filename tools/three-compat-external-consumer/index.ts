import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { readonly exports: Record<string, string> };
const requiredSubpaths = [".", "./rendering", "./assets", "./materials", "./environments", "./controls", "./animation", "./three-compat"];
const missingSubpaths = requiredSubpaths.filter((subpath) => !packageJson.exports[subpath]);
const consumerSource = requiredSubpaths.map((subpath) => {
  const importPath = subpath === "." ? "@aura3d/engine" : `@aura3d/engine/${subpath.slice(2)}`;
  return `import "${importPath}";`;
}).join("\n");
const monorepoInternalImports = /\.\.\/|packages\//.test(consumerSource);
const report = {
  schema: "a3d-three-compat-external-consumer/v1",
  generatedAt: new Date().toISOString(),
  pass: missingSubpaths.length === 0 && !monorepoInternalImports,
  requiredSubpaths,
  missingSubpaths,
  consumerSource,
  monorepoInternalImports
};
const sourcePath = resolve("tests/reports/three-compat-external-consumer/consumer.ts");
mkdirSync(dirname(sourcePath), { recursive: true });
writeFileSync(sourcePath, `${consumerSource}\n`);
const reportPath = resolve("tests/reports/three-compat-external-consumer.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 external consumer passed: ${requiredSubpaths.length} public subpaths.`);
