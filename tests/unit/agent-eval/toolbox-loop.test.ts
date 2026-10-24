import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgent } from "../../../tools/agent-eval/lib/loop.mjs";
import { createPrismClient, loadKey } from "../../../tools/agent-eval/lib/prism.mjs";
import { createToolbox } from "../../../tools/agent-eval/lib/tools.mjs";

let work: string;
let dir: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "agent-eval-toolbox-"));
  const base = join(work, "base/node_modules");
  mkdirSync(join(base, "@aura3d/engine"), { recursive: true });
  mkdirSync(join(base, "@secret"), { recursive: true });
  writeFileSync(join(base, "@aura3d/engine/README.md"), "engine readme");
  writeFileSync(join(base, "@secret/x.js"), "secret");
  dir = join(work, "sandbox");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs/agents"), { recursive: true });
  writeFileSync(join(dir, "docs/agents/README.md"), "# docs\nline2");
  writeFileSync(join(dir, "llms.txt"), "llms");
  symlinkSync(base, join(dir, "node_modules"), "dir");
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const box = (tsc = { pass: true, output: "" }) => createToolbox({ dir, snapshotRoot: join(work, "snaps"), runTsc: () => tsc });

describe("agent-eval toolbox", () => {
  it("allows reading docs and @aura3d packages, refuses other node_modules and escapes", () => {
    const t = box();
    expect(t.exec("read_file", { path: "docs/agents/README.md" }).content).toContain("1\t# docs");
    expect(t.exec("read_file", { path: "node_modules/@aura3d/engine/README.md" }).isError).toBe(false);
    expect(t.exec("read_file", { path: "node_modules/@secret/x.js" }).isError).toBe(true);
    expect(t.exec("read_file", { path: "../outside.txt" }).isError).toBe(true);
    expect([...t.docsOpened]).toEqual(["docs/agents/README.md"]);
    expect([...t.typesOpened]).toEqual(["node_modules/@aura3d/engine/README.md"]);
  });

  it("limits writes to src, index.html and vite.config.ts, and edits need a unique match", () => {
    const t = box();
    expect(t.exec("write_file", { path: "docs/agents/README.md", content: "x" }).isError).toBe(true);
    expect(t.exec("write_file", { path: "tsconfig.json", content: "{}" }).isError).toBe(true);
    expect(t.exec("write_file", { path: "src/main.ts", content: "const a = 1;\nconst a2 = 1;\n" }).isError).toBe(false);
    expect(t.exec("edit_file", { path: "src/main.ts", old_string: "const a", new_string: "let a" }).isError).toBe(true);
    expect(t.exec("edit_file", { path: "src/main.ts", old_string: "const a2", new_string: "let a2" }).isError).toBe(false);
    expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toContain("let a2");
    expect(t.events.filter((e: { type: string }) => e.type === "write")).toHaveLength(2);
  });

  it("snapshots the draft at the first typecheck and the final at finalize", () => {
    const t = box({ pass: false, output: "error TS2322" });
    t.exec("write_file", { path: "src/main.ts", content: "v1" });
    expect(t.exec("typecheck", {}).content).toContain("TS2322");
    t.exec("write_file", { path: "src/main.ts", content: "v2" });
    t.finalize();
    expect(readFileSync(join(work, "snaps/draft/src/main.ts"), "utf8")).toBe("v1");
    expect(readFileSync(join(work, "snaps/final/src/main.ts"), "utf8")).toBe("v2");
    expect(t.state.draftIsFinal).toBe(false);
  });

  it("marks the draft as the final when the agent never typechecks", () => {
    const t = box();
    t.exec("write_file", { path: "src/main.ts", content: "only" });
    t.finalize();
    expect(t.state.draftIsFinal).toBe(true);
    expect(existsSync(join(work, "snaps/draft/src/main.ts"))).toBe(true);
  });
});

describe("agent-eval loop and Prism client", () => {
  const scripted = (turns: Array<Array<Record<string, unknown>>>) => {
    let n = 0;
    return {
      async messages() {
        const content = turns[Math.min(n, turns.length - 1)];
        n += 1;
        return { content, stop_reason: "tool_use", usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50 } };
      }
    };
  };

  it("runs tool turns to finish and sums usage", async () => {
    const t = box();
    const client = scripted([
      [{ type: "tool_use", id: "1", name: "write_file", input: { path: "src/main.ts", content: "x" } }],
      [{ type: "tool_use", id: "2", name: "typecheck", input: {} }],
      [{ type: "tool_use", id: "3", name: "finish", input: { summary: "done" } }]
    ]);
    const out = await runAgent({ client, model: "m", arm: "aura", toolbox: t, maxTurns: 10 });
    expect(out.endReason).toBe("finished");
    expect(out.usage).toMatchObject({ turns: 3, input: 450, output: 30 });
    expect(t.state.summary).toBe("done");
  });

  it("stops at max turns and when the model stops without finishing", async () => {
    const loop = scripted([[{ type: "tool_use", id: "1", name: "list_dir", input: { path: "." } }]]);
    expect((await runAgent({ client: loop, model: "m", arm: "three", toolbox: box(), maxTurns: 3 })).endReason).toBe("max_turns");
    const talks = { async messages() { return { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: {} }; } };
    expect((await runAgent({ client: talks, model: "m", arm: "three", toolbox: box(), maxTurns: 3 })).endReason).toBe("stopped_without_finish");
  });

  it("never leaks the key in errors and retries retryable statuses", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: false, status: 500, headers: { get: () => null }, text: async () => "boom secret-key-123" } as unknown as Response;
    };
    const client = createPrismClient({ key: "secret-key-123", fetchImpl, maxRetries: 2, sleep: async () => {} });
    await expect(client.messages({ model: "m" })).rejects.toThrow(/\[redacted\]/);
    expect(calls).toBe(3);
    const ok = createPrismClient({ key: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ content: [] }) }) as unknown as Response });
    await expect(ok.messages({ model: "m" })).resolves.toEqual({ content: [] });
    expect(loadKey({ PRISM_API_KEY: " abc " })).toBe("abc");
    expect(readdirSync(work).length).toBeGreaterThan(0);
  });
});
