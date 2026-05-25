import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = existsSync(resolve("tests/reports/external-parity-material-studio-readiness.json"))
  ? JSON.parse(readFileSync(resolve("tests/reports/external-parity-material-studio-readiness.json"), "utf8")) as { pass?: boolean }
  : undefined;
const aliasBrowser = existsSync(resolve("tests/reports/external-parity-material-studio-browser.json"))
  ? JSON.parse(readFileSync(resolve("tests/reports/external-parity-material-studio-browser.json"), "utf8")) as { ok?: boolean }
  : undefined;
const report = {
  schema: "g3d-external-parity-material-readiness-alias/v1",
  generatedAt: new Date().toISOString(),
  pass: source?.pass === true && aliasBrowser?.ok === true,
  sourceReport: "tests/reports/external-parity-material-studio-readiness.json",
  browserAliasReport: "tests/reports/external-parity-material-studio-browser.json",
  productBoundary: "Filename compatibility gate for the original V4 Material Studio required file list."
};
mkdirSync(dirname(resolve("tests/reports/external-parity-material-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-material-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
