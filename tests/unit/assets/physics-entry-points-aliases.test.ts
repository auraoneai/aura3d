import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Lane 519 review fix: gen-physics-entry-points.mjs must follow import and export aliases. A shorthand namespace member
 * whose value is an imported binding (`prefabs = { cityBlock }` with `import { cityBlock } from "./cityBlock.js"`)
 * resolved to the import alias, which has no Value flag, so a body declared behind it was silently missed and
 * `--check` stayed green. The generator runs here with `--root` over a small fixture tree with the repo's layout; each
 * body-declaring function is reachable ONLY through one alias shape.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const GENERATOR = path.join(ROOT, "packages/assets/scripts/gen-physics-entry-points.mjs");
const SCANNER_PATTERN_LINE = readFileSync(path.join(ROOT, "packages/assets/src/vite/auraPhysics.ts"), "utf8")
  .split("\n")
  .find((line) => line.startsWith("export const PHYSICS_USAGE_PATTERN = "))!;

/** Boundary files the generator asserts exist (contents are irrelevant to the fixture). */
const BOUNDARY_FILES = [
  "packages/physics/src/index.ts",
  "packages/physics/src/solverless.ts",
  "packages/physics-rapier/src/index.ts",
  "packages/engine/src/agent-api/physics/onDemandPhysics.ts",
  "packages/engine/src/agent-api/physics/v5/index.ts",
  "packages/engine/src/agent-api/nodes/physics-core.ts",
  "packages/engine/src/agent-api/nodes/physics.ts",
  "packages/engine/src/agent-api/PhysicsRuntime.ts",
  "packages/engine/src/agent-api/app/index.ts",
  "packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts",
  "packages/engine/src/agent-api/physics/PhysicsWorldAccess.ts",
  "packages/engine/src/agent-api/physics/backendMissing.ts",
  "packages/engine/src/public/legacy-physics-access.ts"
];

const body = (name: string) => `import { node } from "./builder.js";\nexport function ${name}() { return node().physics({ type: "static" }); }\n`;
const plain = (name: string) => `import { node } from "./builder.js";\nexport function ${name}() { return node(); }\n`;

const SOURCES: Record<string, string> = {
  "builder.ts": `export class AuraNodeBuilder { physics(spec: unknown): this { void spec; return this; } }\nexport function node() { return new AuraNodeBuilder(); }\n`,
  // 1. shorthand member whose value is a named import (the cityBlock case)
  "shortBody.ts": body("shortBody"),
  // 2. named re-export hop: barrel.ts does `export { reBody } from`
  "reBody.ts": body("reBody"),
  "barrel.ts": `export { reBody } from "./reBody.js";\n`,
  // 3. `export * from` hop
  "starBody.ts": body("starBody"),
  "starBarrel.ts": `export * from "./starBody.js";\n`,
  // 4. renamed import `import { x as y }`
  "renamed.ts": body("renamedImpl"),
  // 5. default import of `export default function`
  "defaultBody.ts": `import { node } from "./builder.js";\nexport default function () { return node().physics({ type: "static" }); }\n`,
  // 6. default import of `export default <identifier>`
  "defaultIdent.ts": `import { node } from "./builder.js";\nfunction identImpl() { return node().physics({ type: "static" }); }\nexport default identImpl;\n`,
  // 7. `export * as ns from` imported into a shorthand member
  "nsModule.ts": body("nsInner"),
  "nsBarrel.ts": `export * as nsReexport from "./nsModule.js";\n`,
  // 8. import then a shorthand member inside a function body (the city.ts makeCityRoadMarkings shape)
  "innerBody.ts": body("innerBody"),
  "maker.ts": `import { innerBody } from "./innerBody.js";\nexport function makeMarkings() { const parts = { innerBody }; return parts.innerBody(); }\n`,
  // 9. `export * as ns` on the public entry itself: members are `ns.<export>`
  "publicNs.ts": body("publicNsBody") + plain("publicNsPlain").replace(`import { node } from "./builder.js";\n`, ""),
  // controls: a plain shorthand import and a mutable one the --check test edits
  "plainBody.ts": plain("plainBody"),
  "laterBody.ts": plain("laterBody"),
  "index.ts": [
    `import "../../physics/src/solverless.js"; // the generator requires the solver-free entry in the program`,
    `import { shortBody } from "./shortBody.js";`,
    `import { reBody } from "./barrel.js";`,
    `import { starBody } from "./starBarrel.js";`,
    `import { renamedImpl as renamedBody } from "./renamed.js";`,
    `import defaultBody from "./defaultBody.js";`,
    `import defaultIdent from "./defaultIdent.js";`,
    `import { nsReexport } from "./nsBarrel.js";`,
    `import { makeMarkings } from "./maker.js";`,
    `import { plainBody } from "./plainBody.js";`,
    `import { laterBody } from "./laterBody.js";`,
    `export const kit = { shortBody, reBody, starBody, renamedBody, defaultBody, defaultIdent, nsReexport, makeMarkings, plainBody, laterBody };`,
    `export * as publicNs from "./publicNs.js";`,
    ``
  ].join("\n")
};

let fixture = "";
const run = (...args: string[]) => spawnSync(process.execPath, [GENERATOR, "--root", fixture, ...args], { cwd: ROOT, encoding: "utf8" });
const generatedPaths = (output: string) => [...output.matchAll(/"path": "([^"]+)"/g)].map((match) => match[1]);

beforeAll(() => {
  fixture = realpathSync(mkdtempSync(path.join(os.tmpdir(), "a3d-physics-aliases-")));
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    writeFileSync(path.join(fixture, file), content);
  };
  write("package.json", JSON.stringify({ name: "@aura3d/engine", exports: { ".": "./packages/engine/src/index.ts" } }));
  write("tsconfig.base.json", JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, baseUrl: ".", paths: { "@aura3d/engine": ["packages/engine/src/index.ts"] } }
  }));
  write("packages/assets/src/vite/auraPhysics.ts", `${SCANNER_PATTERN_LINE}\n`);
  for (const file of BOUNDARY_FILES) write(file, "export {};\n");
  for (const [file, content] of Object.entries(SOURCES)) write(`packages/engine/src/${file}`, content);
});

afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe("gen-physics-entry-points follows import and export aliases", () => {
  it("finds a body declared behind each alias shape and nothing behind the plain controls", () => {
    const result = run("--print");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const paths = generatedPaths(result.stdout);
    for (const expected of [
      "kit.shortBody",
      "kit.reBody",
      "kit.starBody",
      "kit.renamedBody",
      "kit.defaultBody",
      "kit.defaultIdent",
      "kit.nsReexport",
      "kit.makeMarkings",
      "publicNs.publicNsBody"
    ]) {
      expect(paths, expected).toContain(expected);
    }
    expect(paths).not.toContain("kit.plainBody");
    expect(paths).not.toContain("kit.laterBody");
    expect(paths).not.toContain("publicNs.publicNsPlain");
    expect(result.stdout).toMatch(/PHYSICS_NAMESPACE_OBJECTS: readonly string\[\] = \[\s*"kit",\s*"publicNs"\s*\]/);
  }, 120_000);

  it("--check fails after a body is added to a file reached only through a shorthand-imported member", () => {
    const write = run();
    expect(write.status, write.stderr).toBe(0);
    expect(run("--check").status).toBe(0);
    writeFileSync(path.join(fixture, "packages/engine/src/laterBody.ts"), body("laterBody"));
    const check = run("--check");
    expect(check.status).toBe(1);
    expect(check.stderr).toMatch(/is stale/);
    expect(generatedPaths(run("--print").stdout)).toContain("kit.laterBody");
  }, 120_000);
});
