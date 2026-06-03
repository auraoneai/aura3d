import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("packages/three-compat/package.json"), "utf8")) as { readonly exports: Record<string, string> };
const requiredSubpaths = [".", "./controls", "./loaders", "./postprocessing"];
const missingSubpaths = requiredSubpaths.filter((subpath) => !packageJson.exports[subpath]);
const consumerSource = requiredSubpaths.map((subpath) => {
  const importPath = subpath === "." ? "@aura3d/three-compat" : `@aura3d/three-compat/${subpath.slice(2)}`;
  return `import "${importPath}";`;
}).join("\n");
const monorepoInternalImports = /\.\.\/|packages\//.test(consumerSource);
const report = {
  schema: "a3d-three-compat-external-consumer",
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
console.log(`Three.js compatibility external consumer passed: ${requiredSubpaths.length} separate package subpaths.`);
