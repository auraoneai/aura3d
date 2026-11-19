/**
 * @aura3d/cli 5.6.0 A6 — monorepo-only verbs fail fast with one clear message outside an Aura3D checkout.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../packages/aura3d-cli/src/commands/registry";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import { MONOREPO_ONLY_RULES, monorepoOnlyMessage, unmetMonorepoRule } from "../../../../packages/aura3d-cli/src/monorepo-only";
import { runLookJudge } from "../../../../packages/aura3d-cli/src/look/judge";

function io(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) }, out, err };
}

const emptyProject = () => mkdtempSync(join(tmpdir(), "a3d-npm-project-"));

describe("monorepo-only rules", () => {
  it("cover the verbs the npm package cannot run", () => {
    const covered = MONOREPO_ONLY_RULES.map((rule) => `${rule.command}${rule.mode ? ` ${rule.mode}` : ""}`);
    expect(covered).toEqual(expect.arrayContaining([
      "assets bake-impostor", "assets lookdev", "assets optimize <id…> mode", "look judge --judge prism", "perf gate",
      "codemod pin-emissive-defaults", "codemod animation-3.1"
    ]));
  });

  it("apply only to the monorepo-only invocation", () => {
    const cwd = emptyProject();
    const fakeCli = emptyProject();
    expect(unmetMonorepoRule("assets optimize", ["hero"], cwd, fakeCli)?.needs).toBe("tools/asset-optimize/index.ts");
    expect(unmetMonorepoRule("assets optimize", ["--file", "in.glb", "--out", "o.glb"], cwd, fakeCli)).toBeUndefined();
    expect(unmetMonorepoRule("look judge", ["--judge", "prism"], cwd, fakeCli)?.needs).toBe("tools/quality-gate/src/judge-prism.ts");
    expect(unmetMonorepoRule("look judge", ["--validate", "j.json"], cwd, fakeCli)).toBeUndefined();
    expect(unmetMonorepoRule("codemod", ["pin-emissive-defaults", "src"], cwd, fakeCli)?.needs).toBe("tools/codemods/pin-emissive-defaults.mjs");
    expect(unmetMonorepoRule("codemod", ["animation-3.1", "src"], cwd, fakeCli)?.needs).toBe("tools/codemods/animation-3.1.mjs");
    expect(unmetMonorepoRule("codemod", ["renderer-imports", "src"], cwd, fakeCli)).toBeUndefined();
    expect(unmetMonorepoRule("assets bake-impostor", ["--asset", "x"], cwd, fakeCli)?.needs).toBe("tools/impostor-bake/index.js");
    expect(unmetMonorepoRule("perf gate", ["--report", "r.json"], cwd, fakeCli)?.needs).toBe("tools/perf-gate/index.mjs");
    expect(unmetMonorepoRule("perf gate", ["--report", "r.json", "--gate", "g.mjs"], cwd, fakeCli)).toBeUndefined();
  });

  it("are satisfied by the repo file (cli-relative or found walking up from cwd)", () => {
    const fakeCli = emptyProject();
    mkdirSync(join(fakeCli, "tools/impostor-bake"), { recursive: true });
    writeFileSync(join(fakeCli, "tools/impostor-bake/index.js"), "");
    expect(unmetMonorepoRule("assets bake-impostor", [], emptyProject(), fakeCli)).toBeUndefined();
    const repo = emptyProject();
    mkdirSync(join(repo, "tools/perf-gate"), { recursive: true });
    writeFileSync(join(repo, "tools/perf-gate/index.mjs"), "");
    mkdirSync(join(repo, "apps/x"), { recursive: true });
    expect(unmetMonorepoRule("perf gate", ["--report", "r.json"], join(repo, "apps/x"), fakeCli)).toBeUndefined();
  });

  it("print one message naming the verb, the missing path, the repo and the alternative", () => {
    const message = monorepoOnlyMessage("assets optimize", "tools/asset-optimize/index.ts", { mode: "<id…> mode", base: "cwd-exact", alternative: "`aura3d assets optimize --file in.glb --out out.glb` works anywhere" });
    expect(message).toBe("aura3d assets optimize <id…> mode is monorepo-only: it needs tools/asset-optimize/index.ts from the Aura3D repository (https://github.com/auraoneai/aura3d), which the npm package does not ship. Run it from the root of an Aura3D repository checkout, or `aura3d assets optimize --file in.glb --out out.glb` works anywhere.");
    expect(monorepoOnlyMessage("codemod", "tools/codemods/animation-3.1.mjs", { mode: "animation-3.1", base: "cli" })).toMatch(/^aura3d codemod \(animation-3\.1\) is monorepo-only: .*pnpm exec tsx packages\/aura3d-cli\/src\/cli\.ts/);
  });
});

describe("monorepo-only verbs outside a checkout", () => {
  it("assets optimize <id…> exits 2 with the monorepo message", async () => {
    const h = io(emptyProject());
    expect(await cliCommandFor("assets optimize")!.run(["hero"], h.io)).toBe(2);
    expect(h.err.join("\n")).toContain("aura3d assets optimize <id…> mode is monorepo-only");
  });

  it("assets lookdev exits 2 before reading any manifest", async () => {
    const h = io(emptyProject());
    expect(await cliCommandFor("assets lookdev")!.run(["hero"], h.io)).toBe(2);
    expect(h.err).toHaveLength(1);
    expect(h.err[0]).toContain("aura3d assets lookdev is monorepo-only");
  });

  it("perf gate keeps PERF_GATE_NOT_FOUND and explains the monorepo requirement", async () => {
    const cwd = emptyProject();
    writeFileSync(join(cwd, "report.json"), "{}");
    const h = io(cwd);
    expect(await cliCommandFor("perf gate")!.run(["--report", "report.json"], h.io)).toBe(2);
    expect(h.err.join("\n")).toMatch(/PERF_GATE_NOT_FOUND: aura3d perf gate is monorepo-only/);
  });

  it("look judge --judge prism with an injected provider skips the repo check (test seam)", async () => {
    const h = io(emptyProject());
    const code = await runLookJudge(["--judge", "prism"], h.io, { loadPrismJudge: async () => undefined });
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--shots");
  });
});
