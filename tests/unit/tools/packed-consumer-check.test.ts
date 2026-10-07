import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkTemplate,
  collectEngineSpecifiers,
  specifierAllowed
} from "../../../tools/packed-consumer-check/index";

const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURE = join(REPO_ROOT, "tools/packed-consumer-check/fixtures/repo-alias-only");

let tmp: string;
let tarball: string;
let exportsKeys: ReadonlySet<string>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "a3d-pack-fixture-"));
  execFileSync("pnpm", ["pack", "--pack-destination", tmp], { cwd: REPO_ROOT, stdio: "pipe" });
  tarball = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".tgz"))!);
  execFileSync("tar", ["-xzf", tarball, "-C", tmp, "package/package.json"], { stdio: "pipe" });
  const packed = JSON.parse(
    require("node:fs").readFileSync(join(tmp, "package/package.json"), "utf8")
  ) as { exports?: Record<string, unknown> };
  exportsKeys = new Set(Object.keys(packed.exports ?? {}));
}, 120_000);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("packed consumer check (PRD-15 T1.6)", () => {
  it("rejects a specifier that exists only in repo tsconfig paths", () => {
    const specifiers = collectEngineSpecifiers(FIXTURE);
    expect(specifiers).toContain("@aura3d/engine/lanes");
    expect(specifierAllowed("@aura3d/engine/lanes", exportsKeys)).toBe(false);
    expect(specifierAllowed("@aura3d/engine", exportsKeys)).toBe(true);
    expect(specifierAllowed("@aura3d/engine/contracts", exportsKeys)).toBe(true);
  });

  it("checkTemplate fails the fixture at the specifier gate before any install", () => {
    const dest = join(tmp, "consumer-repo-alias-only");
    const result = checkTemplate(FIXTURE, dest, tarball, exportsKeys, { skipBuild: true });
    expect(result.steps.specifiers).toBe("fail");
    expect(result.detail).toContain("@aura3d/engine/lanes");
    // Fails fast — no install/typecheck/build ran.
    expect(result.steps.install).toBe("skip");
  });
});
