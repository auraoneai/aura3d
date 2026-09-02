import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { redactPotentialSecrets, scanText, shouldScanPath } from "../../../tools/meshy-secret-scan/index.js";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const scratchDirectories: string[] = [];

function syntheticCredential(seed: string): string {
  return ["msy", `A9b8C7d6E5f4G3h2J1k0${seed}`].join("_");
}

function makeRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "meshy-secret-scan-"));
  scratchDirectories.push(root);
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "scanner-test@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Scanner Test"]);
  writeFileSync(join(root, "safe.txt"), "The documented literal prefix is msy_.\nExample: msy_your_api_key_here.\n");
  execFileSync("git", ["-C", root, "add", "safe.txt"]);
  execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  return root;
}

afterEach(() => {
  while (scratchDirectories.length > 0) rmSync(scratchDirectories.pop()!, { recursive: true, force: true });
});

describe("Meshy repository secret scan", () => {
  it("detects credential-like values but ignores literal documentation prefixes", () => {
    const credential = syntheticCredential("Q7");
    expect(scanText("fixture.txt", `prefix only: msy_\nplaceholder: msy_your_api_key_here\nleak=${credential}\n`)).toEqual([
      { path: "fixture.txt", line: 3, column: 6 }
    ]);
    expect(redactPotentialSecrets(`found ${credential}`)).toBe("found msy_[REDACTED]");
  });

  it("excludes dependencies, generated spill, and binary asset paths", () => {
    expect(shouldScanPath("src/main.ts")).toBe(true);
    expect(shouldScanPath("node_modules/vendor/index.js")).toBe(false);
    expect(shouldScanPath("tests/reports/result.json")).toBe(false);
    expect(shouldScanPath("public/aura-assets/model.glb")).toBe(false);
    expect(shouldScanPath("apps/demo/.candidate-assets/search.json")).toBe(false);
  });

  it("fails on tracked and untracked synthetic leaks without printing either secret", () => {
    const root = makeRepository();
    const trackedCredential = syntheticCredential("T4");
    const untrackedCredential = syntheticCredential("U5");
    writeFileSync(join(root, "tracked-leak.env"), `MESHY_API_KEY=${trackedCredential}\n`);
    execFileSync("git", ["-C", root, "add", "tracked-leak.env"]);
    execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "tracked fixture"]);
    writeFileSync(join(root, "untracked-leak.txt"), `token: ${untrackedCredential}\n`);

    const run = spawnSync(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/meshy-secret-scan/index.ts", "--root", root],
      { cwd: repoRoot, encoding: "utf8" }
    );
    const diagnostics = `${run.stdout}
${run.stderr}`;

    expect(run.status).toBe(1);
    expect(diagnostics).toContain("tracked-leak.env:1:");
    expect(diagnostics).toContain("untracked-leak.txt:1:");
    expect(diagnostics).toContain("[REDACTED Meshy credential]");
    expect(diagnostics).not.toContain(trackedCredential);
    expect(diagnostics).not.toContain(untrackedCredential);
    expect(diagnostics).not.toContain(trackedCredential.slice(-8));
    expect(diagnostics).not.toContain(untrackedCredential.slice(-8));
  }, 15_000);

  it("passes a repository containing only documentation examples", () => {
    const root = makeRepository();
    const run = spawnSync(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/meshy-secret-scan/index.ts", "--root", root],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Meshy secret scan passed");
  }, 15_000);
});
