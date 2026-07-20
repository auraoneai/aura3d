import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface ValidatorModule {
  validateGameGeometryContract(route: { readonly id: string }, options: { readonly root: string; readonly compileReportPath: string }): { readonly ok: boolean; readonly failures: readonly string[] };
}
const modulePromise = import(pathToFileURL(join(process.cwd(), "tools/showcase-library/game-geometry-contracts.mjs")).href) as Promise<ValidatorModule>;

describe("game geometry contract drift gate", () => {
  it("accepts a hash-bound imported contract and rejects module tampering", async () => {
    const fixture = createFixture();
    try {
      const validator = await modulePromise;
      expect(validator.validateGameGeometryContract(fixture.route, fixture.options)).toMatchObject({ ok: true, failures: [] });
      writeFileSync(join(fixture.root, fixture.modulePath), `${readFileSync(join(fixture.root, fixture.modulePath), "utf8")}\n// hand edit\n`);
      const result = validator.validateGameGeometryContract(fixture.route, fixture.options);
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.startsWith("module-content-hash:"))).toBe(true);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  it("rejects a racing contract without a certified game-to-scene speed model", async () => {
    const fixture = createFixture();
    try {
      const validator = await modulePromise;
      const moduleSource = readFileSync(join(fixture.root, fixture.modulePath), "utf8").replace(/, speedModel: \{[\s\S]*?\}, cameraBounds:/, ", cameraBounds:");
      writeFileSync(join(fixture.root, fixture.modulePath), moduleSource);
      const reportPath = join(fixture.root, fixture.options.compileReportPath);
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      report.geometryContract.contentHash = hash(moduleSource);
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      expect(validator.validateGameGeometryContract(fixture.route, fixture.options).failures).toContain("geometry-contract-racing-speed-model");
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

  it("rejects report tampering and route-local geometry or screenshot hashes", async () => {
    const fixture = createFixture();
    try {
      const validator = await modulePromise;
      writeFileSync(join(fixture.root, fixture.sourceReport), '{"changed":true}\n');
      let result = validator.validateGameGeometryContract(fixture.route, fixture.options);
      expect(result.failures.some((failure) => failure.startsWith("source-report-hash:"))).toBe(true);
      writeFileSync(join(fixture.root, fixture.mainPath), `import { gameGeometryContract } from "./generated/game-geometry";\nconst roadCenterline = [];\nconst screenshot = "sha256-${"a".repeat(64)}";\nvoid gameGeometryContract;\n`);
      result = validator.validateGameGeometryContract(fixture.route, fixture.options);
      expect(result.failures).toEqual(expect.arrayContaining(["route-source-inline-geometry", "route-source-inline-sha256"]));
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "aura3d-geometry-contract-"));
  const route = { id: "showcase-test-racer" };
  const modulePath = `apps/${route.id}/src/generated/game-geometry.ts`;
  const mainPath = `apps/${route.id}/src/main.ts`;
  const sourceReport = "tests/reports/showcase-spec-compiler/test-racer/game-template/geometry.json";
  const compileReportPath = "tests/reports/showcase-spec-compiler/test-racer/showcase-spec-compile-report.json";
  const moduleSource = `export const gameGeometryContract = { schema: "aura3d-game-geometry-contract/1.0", routeId: "${route.id}", category: "racing", speedModel: { kind: "route-length-over-authored-lap-seconds", routeLength: 12, authoredLapSeconds: 30, gameUnitsPerSecond: 0.4, sceneUnitsPerGameUnit: 0.5, sceneUnitsPerSecond: 0.2 }, cameraBounds: {}, evidence: {} } as const;\n`;
  const mainSource = 'import { gameGeometryContract } from "./generated/game-geometry";\nvoid gameGeometryContract;\n';
  const reportSource = '{"pass":true}\n';
  write(modulePath, moduleSource); write(mainPath, mainSource); write(sourceReport, reportSource);
  write(compileReportPath, `${JSON.stringify({ geometryContract: { module: "src/generated/game-geometry.ts", contentHash: hash(moduleSource), sourceReport, sourceReportHash: hash(reportSource) } }, null, 2)}\n`);
  return { root, route, modulePath, mainPath, sourceReport, options: { root, compileReportPath } };
  function write(path: string, value: string) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); }
}
function hash(value: string) { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }
