import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * T1.9 — scripts/check-art-direction.mjs static half (§7.1 capture-branch rule).
 * The fixture route under tests/qr/prd14/fixtures/ambient-route MUST fail.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const SCRIPT = fileURLToPath(new URL("../../../../scripts/check-art-direction.mjs", import.meta.url));
const FIXTURES = `${ROOT}/fixtures`;

function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("check-art-direction.mjs static scan (T1.9)", () => {
  it("ambient-route fixture fails with capture-branch + ambient-light + evidence-global violations", () => {
    const r = run("--apps-root", FIXTURES, "--routes", "ambient-route");
    expect(r.code).toBe(1);
    expect(r.out).toContain("capture-branch");
    expect(r.out).toContain("ambient-light");
    expect(r.out).toContain("__MY_OWN_EVIDENCE__");
  });

  it("clean-route fixture passes", () => {
    const r = run("--apps-root", FIXTURES, "--routes", "clean-route");
    expect(r.code).toBe(0);
  });

  it("a route without src/v2 fails (T1.10 dispatcher missing)", () => {
    const r = run("--apps-root", FIXTURES, "--routes", "no-such-route");
    expect(r.code).toBe(1);
    expect(r.out).toContain("no src/v2");
  });

  it("exits 2 with no --routes", () => {
    const r = run("--apps-root", FIXTURES);
    expect(r.code).toBe(2);
  });
});
