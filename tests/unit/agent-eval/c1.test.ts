import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgent, usageOf } from "../../../tools/agent-eval/lib/loop.mjs";
import { buildSandbox, findRepoSourceLeaks } from "../../../tools/agent-eval/lib/sandbox.mjs";
import { basePackageJson } from "../../../tools/agent-eval/lib/base.mjs";
import { BRIDGE_GUIDE, createBridgeHandler } from "../../../tools/agent-eval/c1/bridge.mjs";
import { costOf, priceFor } from "../../../tools/agent-eval/c1/cost.mjs";
import { PROBES, runProbe } from "../../../tools/agent-eval/c1/probes.mjs";
import { addJudgeUsage } from "../../../tools/agent-eval/c1/judge.mjs";
import { armSummary, bridgeDecision, runMetrics, visualSummary, wilson } from "../../../tools/agent-eval/c1/report.mjs";
import { estimatePlan, loadTasks, resolveArms, resolveC1Tasks } from "../../../tools/agent-eval/c1/run-c1.mjs";
import { stubScript, stubSolution } from "../../../tools/agent-eval/c1/stub-model.mjs";
import { collect, writeGlb } from "../../../tools/agent-eval/c1/stub/mock-bridge.mjs";

const repoRoot = process.cwd();
const C1 = join(repoRoot, "tools/agent-eval/c1");
let work: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "agent-eval-c1-"));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("C1 frozen task set", () => {
  const manifest = loadTasks();
  it("has 8 tasks, one per benchmark-505 category, each with text, checklist, probe and follow-up probe", () => {
    expect(manifest.tasks).toHaveLength(8);
    expect(new Set(manifest.tasks.map((t: { category: string }) => t.category)).size).toBe(8);
    const files = readdirSync(join(C1, "tasks"));
    const checklists = JSON.parse(readFileSync(join(C1, "tasks/checklists.json"), "utf8"));
    for (const t of manifest.tasks) {
      expect(files.some((f) => f.startsWith(`${t.id}-`))).toBe(true);
      expect(checklists[String(t.id)]?.length).toBeGreaterThan(0);
      expect(PROBES[t.probe]).toBeTypeOf("function");
      expect(PROBES[t.followUp.probe]).toBeTypeOf("function");
      expect(t.followUp.text.length).toBeGreaterThan(40);
    }
    expect(manifest.runsPerArm).toBe(3);
    expect(resolveArms("all")).toEqual(["aura", "three", "bridge"]);
    expect(resolveC1Tasks("all", manifest)).toHaveLength(8);
    expect(() => resolveC1Tasks("7", manifest)).toThrow(/frozen/);
  });

  it("estimates the paid run from the per-arm token profile", () => {
    const est = estimatePlan({ arms: ["aura", "three", "bridge"], tasks: resolveC1Tasks("all", manifest), runs: 3, model: "claude-sonnet-5.5", judgeCalls: 216 });
    expect(est.rows.map((r: { runs: number }) => r.runs)).toEqual([24, 24, 24]);
    expect(est.totalUsd).toBeGreaterThan(10);
    expect(est.totalUncachedWorstCaseUsd).toBeGreaterThan(est.totalUsd);
  });
});

describe("C1 billed cost", () => {
  const usage = { uncachedInput: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000, providerCredits: null, providerCostUsd: null };
  it("prices the provider token split at list price when nothing is billed by the provider", () => {
    expect(costOf(usage, "claude-sonnet-5.5")).toMatchObject({ billedUsd: 2 + 0.2 + 2.5 + 10, source: "list-price-estimate" });
    expect(priceFor("acct/claude-sonnet-5.5")).toEqual(priceFor("claude-sonnet-5.5"));
  });
  it("prefers provider USD, then provider credits with a declared rate", () => {
    expect(costOf({ ...usage, providerCostUsd: 1.5 }, "claude-sonnet-5.5")).toMatchObject({ billedUsd: 1.5, source: "provider-usd" });
    expect(costOf({ ...usage, providerCredits: 10 }, "claude-sonnet-5.5", { usdPerCredit: 0.04 })).toMatchObject({ billedUsd: 0.4, source: "provider-credits" });
    expect(costOf({ ...usage, providerCredits: 10 }, "claude-sonnet-5.5").source).toBe("list-price-estimate");
    expect(costOf(usage, "unknown-model")).toMatchObject({ billedUsd: null, source: "unpriced" });
  });
  it("reads cache and billing fields from a provider response", () => {
    expect(usageOf({ usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5, output_tokens: 3, kiro_credits: 0.5 } })).toMatchObject({
      input: 35, uncachedInput: 10, cacheRead: 20, cacheWrite: 5, output: 3, providerCredits: 0.5, providerCostUsd: null
    });
  });
});

describe("C1 loop follow-up phase", () => {
  it("runs the task, then the follow-up in the same conversation, with per-phase usage and tool time", async () => {
    const state = { finished: false, summary: null as string | null };
    const execs: string[] = [];
    const toolbox = {
      state,
      exec(name: string) {
        execs.push(name);
        if (name === "finish") state.finished = true;
        return { content: "ok", isError: false };
      }
    };
    const turns = [["write_file"], ["finish"], ["edit_file"], ["finish"]];
    const seen: unknown[][] = [];
    let n = 0;
    const client = {
      async messages(body: { messages: unknown[] }) {
        seen.push(structuredClone(body.messages));
        const names = turns[n++] ?? ["finish"];
        return { content: names.map((name, i) => ({ type: "tool_use", id: `${n}-${i}`, name, input: {} })), stop_reason: "tool_use", usage: { input_tokens: 100, cache_read_input_tokens: 400, output_tokens: 10 } };
      }
    };
    const phases: string[] = [];
    const out = await runAgent({ client, model: "m", arm: "aura", toolbox, maxTurns: 5, followUp: { text: "Add an Undo button.", maxTurns: 4 }, onPhaseEnd: (p: string) => phases.push(p) });
    expect(out.endReason).toBe("finished");
    expect(out.followUpEndReason).toBe("finished");
    expect(phases).toEqual(["main", "followup"]);
    expect(execs).toEqual(["write_file", "finish", "edit_file", "finish"]);
    expect(out.usage.turns).toBe(4);
    expect(out.usage.cacheRead).toBe(1600);
    expect(out.usage.phases.map((p: { name: string; turns: number }) => [p.name, p.turns])).toEqual([["main", 2], ["followup", 2]]);
    expect(out.usage.toolMs).toBeGreaterThanOrEqual(0);
    // The follow-up request rides on the tool-result user message, so roles keep alternating.
    const third = seen[2] as Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    const last = third[third.length - 1];
    expect(last.role).toBe("user");
    expect(last.content.some((b) => b.type === "tool_result")).toBe(true);
    expect(last.content.find((b) => b.type === "text")?.text).toContain("Add an Undo button.");
  });

  it("answers tool calls made after finish in the same turn, so the follow-up request is a valid conversation", async () => {
    const state = { finished: false, summary: null as string | null };
    const execs: string[] = [];
    const toolbox = { state, exec(name: string) { execs.push(name); if (name === "finish") state.finished = true; return { content: "ok", isError: false }; } };
    const turns = [["finish", "typecheck"], ["finish"]];
    const seen: Array<Array<{ role: string; content: unknown }>> = [];
    let n = 0;
    const client = {
      async messages(body: { messages: Array<{ role: string; content: unknown }> }) {
        seen.push(structuredClone(body.messages));
        const names = turns[n++] ?? ["finish"];
        return { content: names.map((name, i) => ({ type: "tool_use", id: `${n}-${i}`, name, input: {} })), stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } };
      }
    };
    const out = await runAgent({ client, model: "m", arm: "aura", toolbox, maxTurns: 3, followUp: { text: "x", maxTurns: 2 } });
    expect(out.followUpEndReason).toBe("finished");
    expect(execs).toEqual(["finish", "finish"]);
    const results = (seen[1][seen[1].length - 1].content as Array<{ type: string; tool_use_id?: string; is_error?: boolean }>).filter((b) => b.type === "tool_result");
    expect(results.map((r) => r.tool_use_id)).toEqual(["1-0", "1-1"]);
    expect(results[1].is_error).toBe(true);
  });
});

describe("C1 judge cost", () => {
  it("keeps provider-billed credits and USD from judge responses, not only tokens", () => {
    const total = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, providerCredits: null as number | null, providerCostUsd: null as number | null };
    addJudgeUsage(total, usageOf({ usage: { input_tokens: 6000, output_tokens: 400, kiro_credits: 1.5 } }));
    addJudgeUsage(total, usageOf({ usage: { input_tokens: 6000, output_tokens: 400, kiro_credits: 0.5 } }));
    expect(total.uncachedInput).toBe(12000);
    expect(total.providerCredits).toBe(2);
    expect(costOf(total, "claude-sonnet-5.5", { usdPerCredit: 0.04 })).toMatchObject({ billedUsd: 0.08, source: "provider-credits" });
  });
});

/** A small in-memory garden page that behaves like a correct solution. */
function gardenPage({ ignoreSky = true, withUndo = false } = {}) {
  const plants: Array<{ x: number; z: number; born: number }> = [];
  let clock = 0;
  const state = () => ({ ready: true, plantCount: plants.length, plants: plants.map((p) => ({ x: p.x, z: p.z, growth: Math.min(1, (clock - p.born) / 8000) })) });
  return {
    state: async () => state(),
    eval: async (expr: string) => {
      clock += 50; // real page calls take time; plants planted in sequence differ in age
      if (expr.includes("typeof window.__plantAt")) return true;
      const m = /__plantAt\??\.?\(([-\d.]+),\s*([-\d.]+)\)/.exec(expr);
      if (m) plants.push({ x: Number(m[1]), z: Number(m[2]), born: clock });
      return null;
    },
    sleep: async (ms: number) => {
      clock += ms;
    },
    key: async () => {},
    clickCanvas: async (_fx: number, fy: number) => {
      if (fy > 0.4 || !ignoreSky) plants.push({ x: 0.1, z: 2, born: clock });
      return true;
    },
    clickText: async (re: RegExp) => {
      if (re.test("Clear")) {
        plants.length = 0;
        return true;
      }
      if (withUndo && re.test("Undo")) {
        plants.pop();
        return true;
      }
      return false;
    },
    text: async () => `Plants: ${plants.length} Clear`,
    frame: async () => ({ width: 1, height: 1, data: new Uint8Array(4) }),
    diff: () => 0
  };
}

describe("C1 functional probes", () => {
  it("passes every garden check against a correct page and flags a sky click that plants", async () => {
    const ok = await runProbe("garden", gardenPage());
    expect(ok.passed).toBe(ok.total);
    const bad = await runProbe("garden", gardenPage({ ignoreSky: false }));
    expect(bad.checks.skyClickIgnored).toBe(false);
  });
  it("checks the follow-up edit separately and fails cleanly when the feature is missing", async () => {
    expect((await runProbe("garden-followup", gardenPage({ withUndo: true }))).passed).toBe(4);
    const missing = await runProbe("garden-followup", gardenPage());
    expect(missing.checks.undoButton).toBe(false);
    expect(missing.error).toBeUndefined();
  });
  it("turns a driver failure into an error result instead of throwing", async () => {
    const broken = { ...gardenPage(), state: async () => { throw new Error("target closed"); } };
    const r = await runProbe("garden", broken);
    expect(r.passed).toBe(0);
    expect(r.error).toContain("target closed");
  });
});

describe("C1 bridge arm", () => {
  it("builds a bridge sandbox with Aura3D docs and BRIDGE.md, and installs three beside the engine", () => {
    const baseDir = join(work, "base");
    mkdirSync(join(baseDir, "node_modules"), { recursive: true });
    writeFileSync(join(baseDir, "package.json"), "{}");
    const dir = join(work, "bridge-sandbox");
    const r = buildSandbox({ arm: "bridge", task: 107, dir, repoRoot, baseDir, tasksDir: join(C1, "tasks"), condition: { bridgeGuide: BRIDGE_GUIDE } });
    expect(existsSync(join(dir, "BRIDGE.md"))).toBe(true);
    expect(existsSync(join(dir, "llms.txt"))).toBe(true);
    expect(r.docs?.files).toBeGreaterThan(20);
    expect(readFileSync(join(dir, "TASK.md"), "utf8")).toContain("three.js 0.185.1 is also installed");
    expect(findRepoSourceLeaks({ dir, arm: "bridge", repoRoot, baseDir })).toEqual([]);
    expect(Object.keys(basePackageJson("bridge", { auraVersion: "5.2.0" }).dependencies)).toEqual(expect.arrayContaining(["@aura3d/engine", "three", "@types/three"]));
  });

  it("runs the bridge command template inside the sandbox and reports failures as tool errors", () => {
    const dir = join(work, "bridge-tool");
    mkdirSync(join(dir, "src/bridge"), { recursive: true });
    writeFileSync(join(dir, "src/bridge/tower.factory.ts"), "export default () => ({})");
    const calls: Array<[string, string[]]> = [];
    const events: Array<{ pass: boolean }> = [];
    const handler = createBridgeHandler({ dir, command: "node bridge.mjs three {factory} --out {out} --name {name} --seed {seed}", record: (e: { pass: boolean }) => events.push(e), run: (cmd: string, args: string[]) => { calls.push([cmd, args]); return "{}"; } });
    handler({ factory: "src/bridge/tower.factory.ts", seed: 3 });
    expect(calls[0]).toEqual(["node", ["bridge.mjs", "three", "src/bridge/tower.factory.ts", "--out", "public/aura-assets/bridge", "--name", "tower", "--seed", "3"]]);
    expect(events[0].pass).toBe(true);
    expect(() => handler({ factory: "src/main.ts" })).toThrow(/src\/bridge/);
    expect(() => handler({ factory: "src/bridge/missing.factory.ts" })).toThrow(/does not exist/);
    const failing = createBridgeHandler({ dir, command: "x {factory}", run: () => { throw Object.assign(new Error("exit 1"), { stderr: "factory threw" }); } });
    expect(() => failing({ factory: "src/bridge/tower.factory.ts" })).toThrow(/factory threw/);
  });

  it("writes a valid GLB header and sorts unsupported objects into the report", () => {
    // three.js is not a workspace dependency: a duck-typed scene stands in for the factory output.
    const color = (r: number, g: number, b: number) => ({ toArray: () => [r, g, b] });
    const box = {
      name: "box", isMesh: true, visible: true, matrixWorld: null,
      geometry: { clone: () => ({ applyMatrix4() {}, attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 2, 0] }, normal: { array: [0, 0, 1, 0, 0, 1, 0, 0, 1] } }, index: null }) },
      material: { isMeshStandardMaterial: true, color: color(1, 0, 0), emissive: color(1, 1, 1), emissiveIntensity: 3, metalness: 0, roughness: 0.5, transparent: false, opacity: 1, side: 0 }
    };
    const children = [box, { name: "lamp", type: "PointLight", isLight: true }, { name: "dust", type: "Points", isPoints: true }];
    const root = { updateMatrixWorld() {}, traverse: (fn: (o: unknown) => void) => children.forEach(fn) };
    const { meshes, report } = collect(root, { DoubleSide: 2 });
    expect(meshes).toHaveLength(1);
    expect(report.supported).toHaveLength(1);
    expect(report.unsupported.map((u: { id: string }) => u.id)).toEqual(["lamp", "dust"]);
    const glb = writeGlb(meshes);
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    expect(json.accessors[0]).toMatchObject({ count: 3, min: [0, 0, 0], max: [1, 2, 0] });
    expect(json.accessors[2].count).toBe(3);
    expect(json.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength).toBeCloseTo(3);
  });
});

describe("C1 stub model and report", () => {
  it("scripts the bridge arm through factory, export, main, typecheck, finish and the follow-up", () => {
    const solution = stubSolution(107, "bridge");
    const script = stubScript({ arm: "bridge", solution });
    const names = script.main.flat().map((u: { name: string }) => u.name);
    expect(names).toEqual(["read_file", "list_dir", "read_file", "write_file", "bridge_export", "write_file", "typecheck", "finish"]);
    expect(script.followup.flat().map((u: { name: string }) => u.name)).toEqual(["write_file", "typecheck", "finish"]);
  });

  it("summarises runs, judges pairs and applies the bridge decision rule", () => {
    const task = { probe: "garden", followUp: { probe: "garden-followup" } };
    const mk = (arm: string, wall: number, usd: number) => ({
      runId: `r-${arm}`, arm, task: 105, idx: 1, endReason: "finished", followUpEndReason: "finished", wallMs: wall * 1000,
      usage: { turns: 10, input: 1000, output: 100, cacheRead: 800, toolMs: 2000, modelMs: 5000 }, cost: { billedUsd: usd, source: "list-price-estimate" },
      phases: [{ name: "main", turns: 7 }, { name: "followup", turns: 3, cost: { billedUsd: usd / 3 } }]
    });
    const score = { phases: { main: { build: { ok: true }, ready: true, blank: false, pageErrors: [], probes: { garden: { passed: 7, total: 7 } }, size: { jsGzipKB: 100 }, loadMs: 300, fps: 60 }, followup: { build: { ok: true }, probes: { "garden-followup": { passed: 3, total: 4 }, garden: { passed: 6, total: 7 } } } } };
    const aura = runMetrics(mk("aura", 100, 1), score, task);
    expect(aura).toMatchObject({ functionalMainAll: true, functionalFollowUpAll: false, regressedMain: true, cachedShare: 0.8, turnsMain: 7 });
    const bridge = runMetrics(mk("bridge", 60, 0.9), score, task);
    const arms = { aura: armSummary([aura]), bridge: armSummary([bridge]) };
    const even = visualSummary([{ pairing: "bridge-vs-aura", winner: "bridge" }, { pairing: "bridge-vs-aura", winner: "aura" }]);
    expect(even["bridge-vs-aura"].winRate).toBe(0.5);
    expect(bridgeDecision(arms, even).verdict).toMatch(/keep bridge: >=25% lower time/);
    const worse = visualSummary([{ pairing: "bridge-vs-aura", winner: "aura" }, { pairing: "bridge-vs-aura", winner: "aura" }]);
    expect(bridgeDecision(arms, worse).verdict).toMatch(/native stays/);
    expect(bridgeDecision({ aura: arms.aura }, even).verdict).toBe("insufficient data");
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 10)?.[0]).toBeLessThan(0.5);
  });
});
