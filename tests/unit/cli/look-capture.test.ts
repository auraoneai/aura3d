import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextLookdevRound, runLookCapture } from "../../../packages/aura3d-cli/src/look/capture";

interface ExecCall { readonly command: string; readonly args: readonly string[]; readonly cwd: string }

function makeIo(cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) }, out, err };
}

function project(overrides: { workflow?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "look-capture-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/main.ts"), "export {};\n");
  if (overrides.workflow ?? true) {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/aura3d-lookdev.yml"), "name: Aura3D look-dev\non: workflow_dispatch\n");
  }
  return dir;
}

/** Exec stub: gh run list returns queued → completed-success; run download drops a screenshot artifact. */
function ghExec(opts: { runStatusSequence?: readonly string[]; downloadArtifacts?: boolean } = {}) {
  const calls: ExecCall[] = [];
  const seq = [...(opts.runStatusSequence ?? ["in_progress", "completed"])];
  let listCalls = 0;
  const exec = (command: string, args: readonly string[], cwd: string): { status: number; stdout: string; stderr: string } => {
    calls.push({ command, args, cwd });
    if (command === "gh" && args[0] === "--version") return { status: 0, stdout: "gh 2.0", stderr: "" };
    if (command === "gh" && args[0] === "workflow" && args[1] === "run") return { status: 0, stdout: "", stderr: "" };
    if (command === "gh" && args[0] === "run" && args[1] === "list") {
      const status = seq[Math.min(listCalls++, seq.length - 1)];
      return { status: 0, stdout: JSON.stringify([{ databaseId: 77, status, conclusion: status === "completed" ? "success" : null }]), stderr: "" };
    }
    if (command === "gh" && args[0] === "run" && args[1] === "download") {
      if (opts.downloadArtifacts ?? true) {
        const dir = args[args.indexOf("--dir") + 1]!;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "screenshot.png"), Buffer.from([137, 80, 78, 71]));
        writeFileSync(join(dir, "screenshot.json"), JSON.stringify({ profile: { appliedLook: { id: "outdoor-day" }, lint: { findings: [{ severity: "warning", code: "look/flat-palette" }] } } }));
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { calls, exec };
}

describe("look capture", () => {
  it("dispatches the lookdev workflow, polls, downloads artifacts and reports PNGs", async () => {
    const cwd = project();
    const { exec } = ghExec();
    const { io, out } = makeIo(cwd);
    const code = await runLookCapture(["--runner", "gh-actions", "--out", "dist/lookdev/3"], io, { exec, sleep: () => {} });
    expect(code).toBe(0);
    const outDir = join(cwd, "dist/lookdev/3");
    expect(readFileSync(join(outDir, "appliedLook.json"), "utf8")).toContain("outdoor-day");
    const lint = JSON.parse(readFileSync(join(outDir, "lint.json"), "utf8")) as { findings: { severity: string }[] };
    expect(lint.findings).toHaveLength(1);
    expect(out.join("\n")).toContain("screenshot.png");
  });

  it("exits 2 when the project has no lookdev workflow", async () => {
    const cwd = project({ workflow: false });
    const { exec } = ghExec();
    const { io, err } = makeIo(cwd);
    const code = await runLookCapture(["--runner", "gh-actions"], io, { exec, sleep: () => {} });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("aura3d-lookdev.yml");
  });

  it("exits 2 when gh is unavailable", async () => {
    const cwd = project();
    const { io, err } = makeIo(cwd);
    const code = await runLookCapture(["--runner", "gh-actions"], io, {
      exec: () => ({ status: 127, stdout: "", stderr: "gh: command not found" }),
      sleep: () => {}
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("gh CLI");
  });

  it("local runner reports playwright absence instead of faking a capture", async () => {
    const cwd = project();
    const { io, err } = makeIo(cwd);
    const code = await runLookCapture(["--runner", "local"], io, {
      exec: () => ({ status: 127, stdout: "", stderr: "not found" }),
      sleep: () => {}
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("local runner unavailable");
  });

  it("local runner collects tests/reports captures", async () => {
    const cwd = project();
    mkdirSync(join(cwd, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(cwd, "node_modules/.bin/playwright"), "#!/bin/sh\n");
    mkdirSync(join(cwd, "tests/reports"), { recursive: true });
    writeFileSync(join(cwd, "tests/reports/screenshot.png"), Buffer.from([137, 80, 78, 71]));
    writeFileSync(join(cwd, "tests/reports/screenshot.json"), JSON.stringify({ profile: { appliedLook: { id: "neon-night" }, lint: { findings: [{ severity: "error", code: "look/no-ibl" }] } } }));
    const { io, out } = makeIo(cwd);
    const code = await runLookCapture(["--runner", "local", "--out", "dist/lookdev/1"], io, {
      exec: () => ({ status: 0, stdout: "1 passed", stderr: "" }),
      sleep: () => {}
    });
    // Exit 0 even with a lint error finding — lint reports, it does not gate.
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("screenshot.png");
    const lint = JSON.parse(readFileSync(join(cwd, "dist/lookdev/1/lint.json"), "utf8")) as { findings: { code: string }[] };
    expect(lint.findings[0].code).toBe("look/no-ibl");
  });

  it("nextLookdevRound picks the next free integer", () => {
    const cwd = project();
    expect(nextLookdevRound(cwd)).toBe(1);
    mkdirSync(join(cwd, "dist/lookdev/2"), { recursive: true });
    mkdirSync(join(cwd, "dist/lookdev/5"), { recursive: true });
    expect(nextLookdevRound(cwd)).toBe(6);
  });
});
