import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REQUIRED_BROWSER_PAYLOADS,
  assertStagedContext,
  isOmittableAcceptancePath,
  referencedAcceptanceRoots,
  selectAcceptanceStaging
} from "../../../tools/remote-acr/acceptance-staging.mjs";

const PAYLOADS = REQUIRED_BROWSER_PAYLOADS as readonly string[];

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-staging-"));
  temporary.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const completeContext = (extra: Record<string, string> = {}) => tree({
  "tests/browser/a.spec.ts": "spec",
  ...Object.fromEntries(PAYLOADS.map(dir => [`${dir}/payload`, "x"])),
  ...extra
});

describe("browser acceptance upload selection", () => {
  it("omits only manifest files under unreferenced asset roots", () => {
    const inputs = ["docs/marketing.md", "docs/prds/roadmap.md", "evidence/old/run.json", "evidence/exposure-parity/wp6/rows.json",
      "apps/demo/main.ts", "packages/engine/src/index.ts", "tests/reports/native-capabilities/run/gate.json", "marketing/site.md"];
    const manifestPaths = inputs.filter(path => !path.startsWith("tests/reports/"));
    const { staged, omitted } = selectAcceptanceStaging({ inputs, manifestPaths, keepRoots: ["apps/"] });
    expect(omitted).toEqual(["docs/marketing.md", "evidence/old/run.json", "marketing/site.md"]);
    expect(staged).toEqual(["docs/prds/roadmap.md", "evidence/exposure-parity/wp6/rows.json", "apps/demo/main.ts",
      "packages/engine/src/index.ts", "tests/reports/native-capabilities/run/gate.json"]);
    expect(isOmittableAcceptancePath("packages/engine/src/index.ts")).toBe(false);
    expect(isOmittableAcceptancePath("docs/prds/aura3d-native-capability-roadmap.md")).toBe(false);
  });

  it("keeps a root named by a selected spec or any module it imports", () => {
    const root = tree({
      "tests/browser/a.spec.ts": 'import { helper } from "./helper";\n',
      "tests/browser/helper.ts": 'export const helper = "/evidence/run.json";\n',
      "tests/browser/b.spec.ts": "const nothing = 1;\n"
    });
    expect(referencedAcceptanceRoots(root, ["tests/browser/a.spec.ts"])).toEqual(["evidence/"]);
    expect(referencedAcceptanceRoots(root, ["tests/browser/b.spec.ts"])).toEqual([]);
  });
});

describe("browser launcher staged payload checks", () => {
  it("accepts a complete staged context", () => {
    const context = completeContext({ "src/a.ts": "a" });
    expect(() => assertStagedContext(context, { specs: ["tests/browser/a.spec.ts"], staged: ["src/a.ts"] })).not.toThrow();
  });

  it.each([...PAYLOADS])("fails before submission when %s is missing or empty", (dir: string) => {
    const context = completeContext();
    rmSync(join(context, dir), { recursive: true, force: true });
    expect(() => assertStagedContext(context, { specs: ["tests/browser/a.spec.ts"] })).toThrow(`candidate omitted required payload: ${dir}`);
    mkdirSync(join(context, dir), { recursive: true });
    expect(() => assertStagedContext(context, { specs: ["tests/browser/a.spec.ts"] })).toThrow(`candidate omitted required payload: ${dir}`);
  });

  it("fails when a selected spec or a promised staged input is absent", () => {
    const context = completeContext();
    expect(() => assertStagedContext(context, { specs: ["tests/browser/missing.spec.ts"] })).toThrow(/selected spec absent from candidate: tests\/browser\/missing\.spec\.ts/);
    expect(() => assertStagedContext(context, { specs: [], staged: ["tests/fixtures/gone.glb"] })).toThrow(/staged input missing from context: tests\/fixtures\/gone\.glb/);
  });
});
