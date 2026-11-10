import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pruneOldImages, runAgent, usageOf } from "../../../tools/agent-eval/lib/loop.mjs";
import { buildSandbox, findRepoSourceLeaks } from "../../../tools/agent-eval/lib/sandbox.mjs";
import { basePackageJson } from "../../../tools/agent-eval/lib/base.mjs";
import { BRIDGE_GUIDE, createImportThreeHandler } from "../../../tools/agent-eval/c1/bridge.mjs";
import { checkArgs, createAura3dHandler } from "../../../tools/agent-eval/c1/cli-tools.mjs";
import { costOf, priceFor } from "../../../tools/agent-eval/c1/cost.mjs";
import { PROBES, runProbe } from "../../../tools/agent-eval/c1/probes.mjs";
import { addJudgeUsage } from "../../../tools/agent-eval/c1/judge.mjs";
import { armSummary, bridgeDecision, decideBridge, runMetrics, visualSummary, wilson } from "../../../tools/agent-eval/c1/report.mjs";
import { estimatePlan, loadTasks, resolveArms, resolveC1Tasks } from "../../../tools/agent-eval/c1/run-c1.mjs";
import { stubScript, stubSolution } from "../../../tools/agent-eval/c1/stub-model.mjs";

const repoRoot = process.cwd();
const C1 = join(repoRoot, "tools/agent-eval/c1");
let work: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "agent-eval-c1-"));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("C1 frozen task set", () => {
  const manifest = loadTasks();
  it("has 8 tasks covering the 8 required categories, each with text, checklist, probe and follow-up probe", () => {
    expect(manifest.tasks).toHaveLength(8);
    expect(manifest.tasks.map((t: { coverage: string }) => t.coverage).sort()).toEqual(
      ["animated presentation", "character / animation", "interior", "materials (metal / glass)", "outdoor", "product viewer", "shader / effect", "small game"]
    );
    expect(manifest.tasks.filter((t: { assetHeavy: boolean }) => t.assetHeavy).map((t: { id: number }) => t.id)).toEqual([101, 109, 110]);
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

/** A small in-memory solar-system page that behaves like a correct solution (optionally with the follow-up tour). */
function solarPage({ escapeWorks = true, withTour = false } = {}) {
  const names = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn"];
  let clock = 0;
  let paused = false;
  let pausedAt = 0;
  let focused: string | null = null;
  let touring = false;
  let tourStart = 0;
  const t = () => (paused ? pausedAt : clock);
  const planets = () => names.map((name, i) => ({ name, x: (i + 2) * Math.cos(t() / (500 * (i + 1))), y: 0, z: (i + 2) * Math.sin(t() / (500 * (i + 1))) }));
  const tick = () => {
    if (touring) focused = names[Math.min(names.length - 1, Math.floor((clock - tourStart) / 3000))]!;
  };
  return {
    now: () => clock,
    state: async () => {
      tick();
      return { ready: true, focused, paused, planets: planets(), cameraDistanceToFocus: focused ? 3 : null, ...(withTour ? { touring } : {}) };
    },
    eval: async (expr: string) => {
      clock += 20;
      if (expr.includes("typeof window.__focusPlanet")) return true;
      const m = /__focusPlanet\("(\w+)"\)/.exec(expr);
      if (m) focused = m[1]!;
      return null;
    },
    sleep: async (ms: number) => {
      clock += ms;
    },
    key: async (code: string) => {
      if (code === "Escape" && escapeWorks) focused = null;
    },
    clickCanvas: async () => true,
    clickText: async (re: RegExp) => {
      if (re.test("Pause") && !paused) {
        paused = true;
        pausedAt = clock;
        return true;
      }
      if (re.test("Play") && paused) {
        paused = false;
        return true;
      }
      if (withTour && re.test("Tour") && !touring) {
        touring = true;
        tourStart = clock;
        return true;
      }
      if (withTour && re.test("Stop tour") && touring) {
        touring = false;
        focused = null;
        return true;
      }
      return false;
    },
    text: async () => `${focused ?? ""} ${paused ? "Play" : "Pause"}`,
    frame: async () => ({ width: 1, height: 1, data: new Uint8Array(4) }),
    diff: () => 0
  };
}

/** Probes time out on Date.now(); a fake page's sleep only advances its own clock, so drive Date.now from it. */
async function onPageClock<T>(page: { now: () => number }, fn: () => Promise<T>): Promise<T> {
  const realNow = Date.now;
  Date.now = page.now;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}
/** The shape runProbe resolves to (tools/agent-eval/c1/probes.mjs is untyped through modules.d.ts). */
type ProbeResult = { name: string; checks: Record<string, boolean>; notes: Record<string, unknown>; passed: number; total: number | null; error?: string };
const probe = (name: string, page: object) => runProbe(name, page) as Promise<ProbeResult>;
const probeOn = (name: string, page: ReturnType<typeof solarPage>) => onPageClock(page, () => probe(name, page));

describe("C1 functional probes", () => {
  it("passes every solar check against a correct page and flags a broken Escape", async () => {
    const ok = await probeOn("solar", solarPage());
    expect(ok.checks).toEqual(Object.fromEntries(Object.keys(ok.checks).map((k) => [k, true])));
    expect(ok.total).toBe(8);
    const bad = await probeOn("solar", solarPage({ escapeWorks: false }));
    expect(bad.checks.escapeReturns).toBe(false);
  });
  it("checks the follow-up tour separately and fails cleanly when the feature is missing", async () => {
    expect((await probeOn("solar-followup", solarPage({ withTour: true }))).passed).toBe(3);
    const missing = await probeOn("solar-followup", solarPage());
    expect(missing.checks.tourButton).toBe(false);
    expect(missing.error).toBeUndefined();
  });
  it("reads the turntable rate across a 360 wrap and the paint colour from frame pixels", async () => {
    let clock = 0;
    let color = "red";
    const px = (r: number, b: number) => ({ width: 2, height: 1, data: new Uint8Array([r, 0, b, 255, r, 0, b, 255]) });
    const page = {
      state: async () => ({ turntableAngleDeg: (350 + (clock / 1000) * 20) % 360, paintFinish: "clearcoat", paintColor: color }),
      sleep: async (ms: number) => { clock += ms; },
      frame: async () => (color === "blue" ? px(20, 160) : color === "black" ? px(5, 5) : px(180, 20)),
      diff: () => 1,
      clickText: async (re: RegExp) => { for (const c of ["red", "blue", "black"]) if (re.test(c[0]!.toUpperCase() + c.slice(1))) { color = c; return true; } return false; }
    };
    const realNow = Date.now;
    Date.now = () => clock;
    try {
      const main = await probe("product", page);
      expect(main.checks).toMatchObject({ clearcoatState: true, turntableTurns: true, turntableRate: true });
      const fu = await probe("product-followup", page);
      expect(fu.passed).toBe(fu.total);
    } finally {
      Date.now = realNow;
    }
  });
  it("turns a driver failure into an error result instead of throwing", async () => {
    const broken = { ...solarPage(), state: async () => { throw new Error("target closed"); } };
    const r = await probeOn("solar", broken);
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
    const r = buildSandbox({ arm: "bridge", task: 109, dir, repoRoot, baseDir, tasksDir: join(C1, "tasks"), condition: { bridgeGuide: BRIDGE_GUIDE } });
    expect(existsSync(join(dir, "BRIDGE.md"))).toBe(true);
    expect(existsSync(join(dir, "llms.txt"))).toBe(true);
    expect(r.docs?.files).toBeGreaterThan(20);
    expect(readFileSync(join(dir, "TASK.md"), "utf8")).toContain("three.js 0.185.1 is also installed");
    expect(findRepoSourceLeaks({ dir, arm: "bridge", repoRoot, baseDir })).toEqual([]);
    expect(Object.keys(basePackageJson("bridge", { auraVersion: "5.5.0" }).dependencies)).toEqual(expect.arrayContaining(["@aura3d/engine", "@aura3d/cli", "three", "@types/three"]));
    expect(basePackageJson("aura", { auraVersion: "5.5.0", withCli: true }).dependencies["@aura3d/cli"]).toBe("5.5.0");
    expect(basePackageJson("three").scripts.build).toBe("vite build");
  });

  it("runs aura3d import-three on a recipe under recipes/ and reports failures as tool errors", () => {
    const dir = join(work, "bridge-tool");
    mkdirSync(join(dir, "recipes"), { recursive: true });
    writeFileSync(join(dir, "recipes/tower.mjs"), "export default () => ({})");
    const calls: Array<[string, string[]]> = [];
    const events: Array<{ pass: boolean }> = [];
    const handler = createImportThreeHandler({ dir, record: (e: { pass: boolean }) => events.push(e), run: (cmd: string, args: string[]) => { calls.push([cmd, args]); return `{"glbPath":"${dir}/public/aura-assets/tower.glb"}`; } });
    expect(handler({ factory: "recipes/tower.mjs", seed: 3, params: { h: 4 } })).toBe('{"glbPath":"public/aura-assets/tower.glb"}');
    expect(calls[0]).toEqual([join(dir, "node_modules/.bin/aura3d"), ["import-three", "recipes/tower.mjs", "--name", "tower", "--seed", "3", "--params", '{"h":4}', "--json"]]);
    expect(events[0].pass).toBe(true);
    expect(() => handler({ factory: "src/main.ts" })).toThrow(/recipes\//);
    expect(() => handler({ factory: "recipes/missing.mjs" })).toThrow(/does not exist/);
    const failing = createImportThreeHandler({ dir, run: () => { throw Object.assign(new Error("exit 1"), { stderr: "factory threw" }); } });
    expect(() => failing({ factory: "recipes/tower.mjs" })).toThrow(/factory threw/);
  });
});

describe("C1 aura3d CLI tool", () => {
  it("keeps only the newest render screenshot in the conversation", () => {
    const shot = (id: string) => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: "report" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "x" } }] }] });
    const messages = [shot("a"), { role: "assistant", content: [] }, shot("b")];
    expect(pruneOldImages(messages)).toBe(1);
    expect(JSON.stringify(messages[0])).toContain("earlier screenshot removed");
    expect(JSON.stringify(messages[2])).toContain('"type":"image"');
    expect(pruneOldImages(messages)).toBe(0);
  });

  it("keeps arguments inside the project and forces a JSON render report", () => {
    const dir = join(work, "cli-tool");
    expect(checkArgs("render", [], dir)).toEqual(["--json", "--out", ".aura3d/render.png"]);
    expect(checkArgs("examples", ["gold trophy", "--id", "recipe-11-", "--write", "src/main.ts"], dir)).toContain("src/main.ts");
    expect(() => checkArgs("examples", ["--id", "x", "--write", "../main.ts"], dir)).toThrow(/src\//);
    expect(() => checkArgs("validate", ["/etc/passwd"], dir)).toThrow(/leaves the project/);
    expect(() => checkArgs("render", ["--chrome", "/bin/sh"], dir)).toThrow(/--chrome/);
    expect(() => checkArgs("render", ["--url", "https://example.com/"], dir)).toThrow(/loopback/);
  });

  it("returns the render report and the screenshot as an image block, and validate findings as text", () => {
    const dir = join(work, "cli-render");
    mkdirSync(join(dir, ".aura3d"), { recursive: true });
    writeFileSync(join(dir, ".aura3d/render.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const events: Array<{ command: string; exit: number }> = [];
    const run = (_cmd: string, args: string[]) => {
      if (args[0] === "render") return '{"schema":"aura3d.render/1","codes":["RENDER_SUBJECT_SMALL"],"steps":[]}';
      throw Object.assign(new Error("exit 1"), { status: 1, stdout: "VALIDATE_NO_LIGHTING warning" });
    };
    const handler = createAura3dHandler({ dir, run, record: (e: { command: string; exit: number }) => events.push(e) });
    const out = handler({ command: "render" });
    expect(out[0].text).toContain("RENDER_SUBJECT_SMALL");
    expect(out[1]).toMatchObject({ type: "image", source: { media_type: "image/png", data: "iVBORw==" } });
    expect(handler({ command: "validate" })).toContain("exit 1\nVALIDATE_NO_LIGHTING");
    expect(events.map((e) => [e.command, e.exit])).toEqual([["render", 0], ["validate", 1]]);
    expect(() => handler({ command: "verify" })).toThrow(/one of/);
    expect(typeof createAura3dHandler({ dir, run, images: false })({ command: "render" })).toBe("string");
  });
});

describe("C1 stub model and report", () => {
  it("scripts the bridge arm through recipe, import, main, typecheck, validate, render, finish and the follow-up", () => {
    const solution = stubSolution(109, "bridge");
    const script = stubScript({ arm: "bridge", solution });
    const names = script.main.flat().map((u: { name: string }) => u.name);
    expect(names).toEqual(["read_file", "list_dir", "read_file", "aura3d", "write_file", "import_three", "write_file", "typecheck", "aura3d", "aura3d", "finish"]);
    expect(stubScript({ arm: "three", solution: stubSolution(109, "three") }).main.flat().map((u: { name: string }) => u.name)).not.toContain("aura3d");
    expect(script.followup.flat().map((u: { name: string }) => u.name)).toEqual(["write_file", "typecheck", "finish"]);
  });

  it("summarises runs, judges pairs and applies the bridge decision rule", () => {
    const task = { probe: "solar", followUp: { probe: "solar-followup" } };
    const mk = (arm: string, wall: number, usd: number) => ({
      runId: `r-${arm}`, arm, task: 111, idx: 1, endReason: "finished", followUpEndReason: "finished", wallMs: wall * 1000,
      usage: { turns: 10, input: 1000, output: 100, cacheRead: 800, toolMs: 2000, modelMs: 5000 }, cost: { billedUsd: usd, source: "list-price-estimate" },
      phases: [{ name: "main", turns: 7 }, { name: "followup", turns: 3, cost: { billedUsd: usd / 3 } }]
    });
    const score = { phases: { main: { build: { ok: true }, ready: true, blank: false, pageErrors: [], probes: { solar: { passed: 8, total: 8 } }, size: { jsGzipKB: 100 }, loadMs: 300, fps: 60 }, followup: { build: { ok: true }, probes: { "solar-followup": { passed: 2, total: 3 }, solar: { passed: 7, total: 8 } } } } };
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
    expect(armSummary([aura, bridge]).ranges.wallSec).toEqual([60, 100]);
    // Bridge only wins on the asset task (101): the verdict is "assets only".
    const rows = [
      { ...aura, task: 101 }, { ...bridge, task: 101 },
      { ...aura, task: 111, wallSec: 60, billedUsd: 0.9 }, { ...bridge, task: 111, wallSec: 100, billedUsd: 1 }
    ];
    const pairs = [{ task: 101, pairing: "bridge-vs-aura", winner: "tie" }, { task: 111, pairing: "bridge-vs-aura", winner: "aura" }];
    const tasks = { tasks: [{ id: 101, assetHeavy: true }, { id: 111, assetHeavy: false }] };
    expect(decideBridge({ rows, pairs, tasks }).verdict).toMatch(/assets only/);
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 10)?.[0]).toBeLessThan(0.5);
  });
});
