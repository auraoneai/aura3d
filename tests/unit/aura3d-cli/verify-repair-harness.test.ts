import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
// @ts-ignore plain ESM module without types (tests/unit/agent-eval/modules.d.ts declares *.mjs in the check program)
import { execTool, isRepaired, runRepair, safeSrcPath } from "../../../tools/agent-loop/repair-harness.mjs";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function work(): string {
  const dir = mkdtempSync(join(tmpdir(), "repair-"));
  dirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/main.ts"), "BROKEN");
  return dir;
}
const report = (codes: string[], severity = "warning") => ({ schema: "aura3d.verify/1", ok: true, findings: codes.map((code) => ({ code, severity })) });

describe("repair harness", () => {
  test("sandboxes the subject to src/", () => {
    const dir = work();
    expect(safeSrcPath(dir, "src/main.ts")).toBe(join(dir, "src/main.ts"));
    expect(safeSrcPath(dir, "../secret")).toBeNull();
    expect(safeSrcPath(dir, "src/../package.json")).toBeNull();
    expect(execTool(dir, "read_file", { path: "../../etc/passwd" })).toMatchObject({ isError: true });
    expect(execTool(dir, "write_file", { path: "src/a/b.ts", content: "x" })).toMatchObject({ isError: false });
    expect(execTool(dir, "list_files", {}).text).toContain("src/a/b.ts");
  });

  test("repaired means expected codes gone and no errors", () => {
    expect(isRepaired(report(["LINT_X"]), ["LINT_X"])).toBe(false);
    expect(isRepaired(report([]), ["LINT_X"])).toBe(true);
    expect(isRepaired(report(["OTHER"], "error"), ["LINT_X"])).toBe(false);
  });

  test("counts the turn at which the report first comes back clean", async () => {
    const dir = work();
    let verifies = 0;
    const verify = async (d: string) => { verifies += 1; return report(readFileSync(join(d, "src/main.ts"), "utf8") === "FIXED" ? [] : ["LINT_X"]); };
    // turn 1: the subject reads and does not fix; turn 2: it writes the fix
    const script = [
      [{ type: "tool_use", id: "a", name: "read_file", input: { path: "src/main.ts" } }],
      [{ type: "tool_use", id: "b", name: "done", input: {} }],
      [{ type: "tool_use", id: "c", name: "write_file", input: { path: "src/main.ts", content: "FIXED" } }, { type: "tool_use", id: "d", name: "done", input: {} }]
    ];
    const seen: unknown[] = [];
    const client = { async messages(body: { messages: unknown[] }) { seen.push(JSON.parse(JSON.stringify(body.messages))); return { content: script.shift() ?? [] }; } };
    const result = await runRepair({ workDir: dir, expected: ["LINT_X"], verify, client, model: "m", maxTurns: 5 });
    expect(result).toMatchObject({ repaired: true, repairedAtTurn: 2, initialCodes: ["LINT_X"] });
    expect(verifies).toBe(3); // initial + one per turn
    // the second turn's first message carries the new report as text on the tool_result user message
    const firstOfTurn2 = JSON.stringify(seen[2]);
    expect(firstOfTurn2).toContain("New verify report after your edits (turn 1 of 5)");
    expect(JSON.stringify(seen[0])).not.toContain("expected");
  });

  test("gives up after the turn budget", async () => {
    const dir = work();
    const client = { async messages() { return { content: [{ type: "tool_use", id: "x", name: "done", input: {} }] }; } };
    const result = await runRepair({ workDir: dir, expected: ["LINT_X"], verify: async () => report(["LINT_X"]), client, model: "m", maxTurns: 3 });
    expect(result).toMatchObject({ repaired: false, repairedAtTurn: null, turns: 3 });
  });
});
