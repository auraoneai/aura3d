// Stub model for the C1 dry run: a scripted Messages client that drives the real loop, toolbox, bridge, snapshots and
// scoring with fixed solutions from c1/stub/<task>/<arm>/ (main.ts, followup.ts, bridge recipes *.mjs) instead of model
// output. It returns provider-shaped usage
// (input, cache read, cache write, output) so the cost and token pipeline is exercised; the numbers are synthetic.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const STUB_DIR = join(import.meta.dirname, "stub");

export function stubSolution(task, arm, dir = STUB_DIR) {
  const base = join(dir, String(task), arm);
  if (!existsSync(join(base, "main.ts"))) return null;
  const read = (f) => (existsSync(join(base, f)) ? readFileSync(join(base, f), "utf8") : null);
  const factories = readdirSync(base).filter((f) => f.endsWith(".mjs")).sort().map((f) => ({ path: `recipes/${f}`, content: read(f) }));
  return { main: read("main.ts"), followup: read("followup.ts"), factories };
}

let ids = 0;
const use = (name, input) => ({ type: "tool_use", id: `stub_${(ids += 1)}`, name, input });

/** The scripted turns: each entry is one assistant message (a list of tool calls). */
export function stubScript({ arm, solution }) {
  const main = [[use("read_file", { path: "TASK.md" }), use("list_dir", { path: "." })]];
  if (arm !== "three") main.push([use("read_file", { path: "llms.txt", limit: 80 }), use("aura3d", { command: "info", args: ["--name", "material.pbr"] })]);
  if (arm === "bridge") {
    for (const f of solution.factories) main.push([use("write_file", f), use("import_three", { factory: f.path, seed: 7 })]);
  }
  main.push([use("write_file", { path: "src/main.ts", content: solution.main })], [use("typecheck", {})]);
  // The native and bridge arms exercise the N6 loop: validate (no browser), then render (build + headless Chrome + image).
  if (arm !== "three") main.push([use("aura3d", { command: "validate" })], [use("aura3d", { command: "render", args: ["--width", "640", "--height", "360"] })]);
  main.push([use("finish", { summary: "stub solution written" })]);
  const followup = solution.followup
    ? [[use("write_file", { path: "src/main.ts", content: solution.followup })], [use("typecheck", {})], [use("finish", { summary: "stub follow-up applied" })]]
    : [[use("finish", { summary: "stub has no follow-up" })]];
  return { main, followup };
}

/**
 * createStubClient({ arm, task }) -> { messages(body) }. Turn k reports usage that grows like a cached agent loop:
 * uncached 900 + 150k, cache read 2500(k-1), cache write 1200 on turn 1 then 300, output 350.
 */
export function createStubClient({ arm, task, latencyMs = 25, dir = STUB_DIR }) {
  const solution = stubSolution(task, arm, dir);
  if (!solution) throw new Error(`no stub solution for task ${task} arm ${arm} under ${dir}`);
  const script = stubScript({ arm, solution });
  const queue = [...script.main, ...script.followup];
  let turn = 0;
  return {
    stub: true,
    async messages() {
      turn += 1;
      await new Promise((r) => setTimeout(r, latencyMs));
      const usage = { input_tokens: 900 + 150 * turn, cache_read_input_tokens: 2500 * (turn - 1), cache_creation_input_tokens: turn === 1 ? 1200 : 300, output_tokens: 350 };
      const next = queue.shift();
      if (!next) return { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage };
      return { content: [{ type: "text", text: `stub turn ${turn}` }, ...next], stop_reason: "tool_use", usage };
    }
  };
}
