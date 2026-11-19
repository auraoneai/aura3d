/**
 * @aura3d/cli 5.6.0 A6 — `look capture --runner local` and `animation <verb>` use the project's package manager.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPackageManager, execBinaryCommand, readPackageScripts, runScriptCommand } from "../../../../packages/aura3d-cli/src/package-manager";
import { runLookCapture } from "../../../../packages/aura3d-cli/src/look/capture";

const project = (lockfile?: string) => {
  const dir = mkdtempSync(join(tmpdir(), "a3d-pm-"));
  if (lockfile) writeFileSync(join(dir, lockfile), "");
  return dir;
};

describe("detectPackageManager", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"]
  ] as const)("%s → %s", (lockfile, manager) => {
    expect(detectPackageManager(project(lockfile), {}).manager).toBe(manager);
  });

  it("walks up to the workspace root's lockfile", () => {
    const root = project("yarn.lock");
    mkdirSync(join(root, "apps/game"), { recursive: true });
    expect(detectPackageManager(join(root, "apps/game"), {}).manager).toBe("yarn");
  });

  it("falls back to the launching manager, then npm", () => {
    expect(detectPackageManager(project(), { npm_config_user_agent: "pnpm/11.1.3 npm/? node/v22" }).manager).toBe("pnpm");
    expect(detectPackageManager(project(), { npm_execpath: "/usr/lib/node_modules/yarn/bin/yarn.js" }).manager).toBe("yarn");
    expect(detectPackageManager(project(), {}).manager).toBe("npm");
  });
});

describe("command builders", () => {
  it("run a project binary with each manager", () => {
    expect(execBinaryCommand("pnpm", "playwright", ["test"])).toEqual({ command: "pnpm", args: ["exec", "playwright", "test"] });
    expect(execBinaryCommand("npm", "playwright", ["test"])).toEqual({ command: "npx", args: ["--no-install", "playwright", "test"] });
    expect(execBinaryCommand("yarn", "playwright", ["test"])).toEqual({ command: "yarn", args: ["playwright", "test"] });
    expect(execBinaryCommand("bun", "playwright", ["test"])).toEqual({ command: "bunx", args: ["playwright", "test"] });
  });

  it("run a script with forwarded args", () => {
    expect(runScriptCommand("npm", "scene", ["cast", "add"])).toEqual({ command: "npm", args: ["run", "scene", "--", "cast", "add"] });
    expect(runScriptCommand("pnpm", "scene", [])).toEqual({ command: "pnpm", args: ["run", "scene"] });
    expect(runScriptCommand("yarn", "scene", ["show"])).toEqual({ command: "yarn", args: ["run", "scene", "show"] });
  });

  it("read package scripts (undefined without package.json)", () => {
    const dir = project();
    expect(readPackageScripts(dir)).toBeUndefined();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { scene: "tsx scripts/animation-scene.ts" } }));
    expect(readPackageScripts(dir)).toEqual({ scene: "tsx scripts/animation-scene.ts" });
  });
});

describe("look capture --runner local", () => {
  it.each([
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npx"],
    ["pnpm-lock.yaml", "pnpm"]
  ] as const)("with %s runs playwright through %s", async (lockfile, command) => {
    const cwd = project(lockfile);
    const calls: { command: string; args: readonly string[] }[] = [];
    const err: string[] = [];
    const code = await runLookCapture(["--runner", "local"], { cwd, stdout: () => {}, stderr: (s) => err.push(s) }, {
      exec: (cmd, args) => { calls.push({ command: cmd, args }); return { status: cmd === command ? 0 : 127, stdout: "", stderr: "" }; },
      sleep: () => {}
    });
    expect(calls.map((c) => c.command)).toEqual([command, command]);
    expect(calls[1]!.args).toContain("tests/screenshot.spec.ts");
    expect(code).toBe(0);
  });
});
