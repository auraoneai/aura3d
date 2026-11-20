// 5.7.0: check:agent-docs compiles the doc snippets with the typescript package's own bin, not `pnpm exec tsc`,
// which aborts in a git worktree whose node_modules is a symlink (pnpm's pre-run dependency check tries to reinstall).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tscBin, tscInvocation } from "../../../tools/agent-docs/tsc";

describe("check:agent-docs runs tsc without pnpm exec", () => {
  it("resolves the typescript package's tsc bin and runs it with the current node", () => {
    const bin = tscBin();
    expect(bin).toMatch(/[\\/]typescript[\\/]bin[\\/]tsc$/);
    expect(existsSync(bin)).toBe(true);
    const [command, args] = tscInvocation(["--version"]);
    expect(command).toBe(process.execPath);
    expect(execFileSync(command, [...args], { encoding: "utf8" })).toMatch(/^Version \d+\.\d+/);
  });

  it("the agent-docs check no longer shells out through pnpm exec for tsc", () => {
    const source = readFileSync("tools/agent-docs/index.ts", "utf8");
    expect(source).not.toMatch(/"pnpm",\s*\["exec",\s*"tsc"/);
    expect(source).toContain("tscInvocation(");
  });
});
