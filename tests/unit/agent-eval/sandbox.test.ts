import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertNoRepoSourceLeak, buildSandbox, docSetFingerprint, findRepoSourceLeaks, listSandboxFiles, readTask } from "../../../tools/agent-eval/lib/sandbox.mjs";

const repoRoot = process.cwd();
let work: string;
let baseDir: string;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "agent-eval-sandbox-"));
  baseDir = join(work, "base");
  mkdirSync(join(baseDir, "node_modules"), { recursive: true });
  writeFileSync(join(baseDir, "package.json"), JSON.stringify({ name: "base", private: true }));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("agent-eval sandbox builder", () => {
  it("builds a docs-only Aura3D sandbox with entry docs and nothing from repo source", () => {
    const dir = join(work, "aura");
    const result = buildSandbox({ arm: "aura", task: 1, dir, repoRoot, baseDir });
    expect(existsSync(join(dir, "llms.txt"))).toBe(true);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(dir, "docs/agents"))).toBe(true);
    expect(existsSync(join(dir, ".agents/skills"))).toBe(true);
    expect(result.docs?.files).toBeGreaterThan(20);
    expect(findRepoSourceLeaks({ dir, arm: "aura", repoRoot, baseDir })).toEqual([]);
    const files = listSandboxFiles(dir);
    for (const root of ["packages/", "examples/", "apps/", "tests/", "tools/", "evidence/", "fixtures/"]) {
      expect(files.some((f) => f.startsWith(root))).toBe(false);
    }
  });

  it("builds a three.js sandbox with no docs from the repo", () => {
    const dir = join(work, "three");
    const result = buildSandbox({ arm: "three", task: 1, dir, repoRoot, baseDir });
    expect(result.docs).toBeNull();
    expect(existsSync(join(dir, "llms.txt"))).toBe(false);
    expect(existsSync(join(dir, "docs"))).toBe(false);
    expect(findRepoSourceLeaks({ dir, arm: "three", repoRoot, baseDir })).toEqual([]);
  });

  it("flags the repo's own docs showing up in the three.js arm", () => {
    const dir = join(work, "three-with-docs");
    buildSandbox({ arm: "three", task: 1, dir, repoRoot, baseDir });
    cpSync(join(repoRoot, "llms.txt"), join(dir, "llms.txt"));
    expect(findRepoSourceLeaks({ dir, arm: "three", repoRoot, baseDir }).join("\n")).toContain("unexpected top-level entry: llms.txt");
  });

  it("detects a copied repo source file, a repo source root and a non-symlink node_modules", () => {
    const dir = join(work, "leaky");
    buildSandbox({ arm: "aura", task: 2, dir, repoRoot, baseDir });
    mkdirSync(join(dir, "docs/agents/extra"), { recursive: true });
    cpSync(join(repoRoot, "packages/rendering/src/Renderer.ts"), join(dir, "docs/agents/extra/Renderer.ts"));
    mkdirSync(join(dir, "packages/engine"), { recursive: true });
    writeFileSync(join(dir, "packages/engine/index.ts"), "export {}");
    rmSync(join(dir, "node_modules"));
    mkdirSync(join(dir, "node_modules"));
    const text = findRepoSourceLeaks({ dir, arm: "aura", repoRoot, baseDir }).join("\n");
    expect(text).toContain("identical to repo source packages/rendering/src/Renderer.ts");
    expect(text).toContain("repo source root inside sandbox: packages/engine/index.ts");
    expect(text).toContain("node_modules is not a symlink");
    expect(() => assertNoRepoSourceLeak({ dir, arm: "aura", repoRoot, baseDir })).toThrow(/sandbox leak/);
  });

  it("renders the task with the library label and the shared contract, and fingerprints the doc set", () => {
    const aura = readTask(3, "aura").text;
    const three = readTask(3, "three").text;
    expect(aura).toContain("@aura3d/engine");
    expect(three).toContain("three.js 0.185.1");
    expect(aura).toContain("Rendering contract");
    const dir = join(work, "aura");
    expect(docSetFingerprint(dir).sha256).toBe(docSetFingerprint(dir).sha256);
    expect(readFileSync(join(dir, "TASK.md"), "utf8")).toContain("Task 1");
  });

  it("copies the provided GLB only for tasks that need it", () => {
    const dir = join(work, "t3");
    buildSandbox({ arm: "three", task: 3, dir, repoRoot, baseDir });
    expect(existsSync(join(dir, "public/assets/soldier.glb"))).toBe(true);
    const dir1 = join(work, "t1");
    buildSandbox({ arm: "three", task: 1, dir: dir1, repoRoot, baseDir });
    expect(existsSync(join(dir1, "public/assets/soldier.glb"))).toBe(false);
  });
});
