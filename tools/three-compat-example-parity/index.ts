import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const catalog = JSON.parse(readFileSync(resolve("examples/three-compat-examples/catalog.json"), "utf8")) as {
  readonly examples: readonly {
    readonly slug: string;
    readonly category: string;
    readonly threeReference: string | null;
    readonly browserTested: boolean;
  }[];
};
const mapped = catalog.examples.filter((example) => example.threeReference);
const report = {
  schema: "a3d-three-compat-example-parity/v1",
  generatedAt: new Date().toISOString(),
  pass: catalog.examples.length >= 50 && catalog.examples.filter((example) => example.browserTested).length >= 30 && mapped.length >= 20,
  exampleCount: catalog.examples.length,
  browserTestedCount: catalog.examples.filter((example) => example.browserTested).length,
  threeReferenceMappingCount: mapped.length,
  mappings: mapped.map((example) => ({ slug: example.slug, category: example.category, threeReference: example.threeReference }))
};
const reportPath = resolve("tests/reports/three-compat-example-parity.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 example parity passed: ${report.exampleCount} examples, ${report.threeReferenceMappingCount} mappings.`);
