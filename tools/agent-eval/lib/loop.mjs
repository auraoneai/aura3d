import { toolDefinitions } from "./tools.mjs";

export function systemPrompt(arm, condition = {}) {
  const common = [
    "You are an autonomous coding agent working alone in a sandboxed project. There is no internet access and no shell; use only the provided tools.",
    "The project is a Vite + TypeScript browser app. `index.html` already loads `/src/main.ts`; you write `src/main.ts` (and any other files under src/).",
    "Read TASK.md first: it is your assignment. Work until the task is complete, check your work with the typecheck tool, then call finish.",
    "Keep your final code correct and runnable in a browser: it will be built with `vite build` and run in headless Chromium."
  ];
  const specific =
    arm === "bridge"
      ? [
          "The app is built with Aura3D (`@aura3d/engine`, installed in node_modules). three.js 0.185.1 (`three`, `@types/three`) is also installed, for procedural asset generation only.",
          "Read BRIDGE.md first: author the scene content as three.js factories under `recipes/` (writable), turn them into Aura3D source and typed assets with the `import_three` tool, and keep behaviour, input, UI and per-frame logic native Aura3D in `src/`.",
          "Documentation entry points: `llms.txt` and `AGENTS.md` at the project root, then `docs/agents/`, and `.agents/skills/`. Package types are under `node_modules/@aura3d/` and `node_modules/three/`."
        ]
      : arm === "aura"
      ? [
          "The library is Aura3D (`@aura3d/engine`), already installed in node_modules. You may not know it: start from the project docs.",
          "Documentation entry points: `llms.txt` and `AGENTS.md` at the project root, then `docs/agents/`, and `.agents/skills/`. Package types are under `node_modules/@aura3d/`."
        ]
      : [
          "The library is three.js 0.185.1 (`three` and `@types/three`), already installed in node_modules. Examples and addons are under `node_modules/three/examples/jsm`."
        ];
  const extra = [];
  if (arm !== "three" && condition.cliTools) {
    extra.push(
      "You also have the `aura3d` tool: the Aura3D CLI agent tools `info`, `examples`, `validate` and `render` (docs/agents/agent-tools.md). `render` builds the app, screenshots it in headless Chrome and returns diagnostics plus the screenshot, so you can see what you made."
    );
  }
  if (arm === "aura" && condition.lookup) {
    extra.push(
      "You also have `aura_lookup(query)`: one call returns the best-matching working recipe source, exact signatures and gotchas for a keyword query (for example `camera orbit autoRotate` or `custom shader water uniform`). Use it instead of reading or searching doc files one by one."
    );
  }
  return [...common, ...specific, ...extra].join("\n");
}

export const FIRST_USER_MESSAGE = "Start by reading TASK.md, then complete the assignment.";
export const BATCH_HINT =
  " Efficiency matters: you are measured on the number of turns. Put every independent read_file, search and list_dir call in the same turn as parallel tool calls, and write the complete solution before looking anything else up.";

/** Provider usage of one response. `input` is the total prompt size (uncached + cache read + cache write), as Prism reports it. */
export const usageOf = (response) => {
  const u = response?.usage ?? {};
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    uncachedInput: u.input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    // Billed amounts when the provider reports them (Kiro credits through Prism, or a USD cost field); null otherwise.
    providerCredits: num(u.kiro_credits),
    providerCostUsd: num(u.cost_usd) ?? num(u.cost?.total_usd) ?? num(u.cost?.total)
  };
};

/**
 * Keep only the newest screenshot in the conversation: older image blocks inside tool results become a short note.
 * Prism's Kiro route caps a request at 1.5 MB and a few images, and every `aura3d render` adds one; without this a
 * render-heavy run would grow past the cap and end as an infra error. Returns the number of images replaced.
 */
export function pruneOldImages(messages) {
  const holders = [];
  for (const m of messages) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const block of m.content) if (block?.type === "tool_result" && Array.isArray(block.content) && block.content.some((b) => b?.type === "image")) holders.push(block);
  }
  let replaced = 0;
  for (const block of holders.slice(0, -1)) {
    block.content = block.content.map((b) => {
      if (b?.type !== "image") return b;
      replaced += 1;
      return { type: "text", text: "[earlier screenshot removed; only the latest render keeps its image]" };
    });
  }
  return replaced;
}

const emptyUsage = () => ({
  input: 0, uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0, turns: 0, providerCredits: null, providerCostUsd: null,
  modelMs: 0, toolMs: 0, perTurnInput: [], perTurnOutput: [], perTurnCacheRead: []
});

function addUsage(total, u) {
  total.input += u.input;
  total.uncachedInput += u.uncachedInput;
  total.cacheRead += u.cacheRead;
  total.cacheWrite += u.cacheWrite;
  total.output += u.output;
  if (u.providerCredits != null) total.providerCredits = (total.providerCredits ?? 0) + u.providerCredits;
  if (u.providerCostUsd != null) total.providerCostUsd = (total.providerCostUsd ?? 0) + u.providerCostUsd;
  total.perTurnInput.push(u.input);
  total.perTurnOutput.push(u.output);
  total.perTurnCacheRead.push(u.cacheRead);
}

/**
 * Drive one agent to completion. Returns the transcript, usage and end reason; the toolbox owns events and snapshots.
 * Optional `followUp: { text, maxTurns }` continues the same conversation after the first phase ends with one predefined
 * follow-up edit request (C1 benchmark); `onPhaseEnd(name)` runs between phases (snapshot hook). Usage then also carries
 * per-phase totals in `phases`. `extraTools` adds tool definitions (the toolbox must handle them).
 */
export async function runAgent({ client, model, arm, toolbox, maxTurns = 40, maxOutputTokens = 8192, session, condition = {}, now = () => Date.now(), followUp = null, onPhaseEnd = null, extraTools = [] }) {
  const started = now();
  const first = condition.batchHint ? FIRST_USER_MESSAGE + BATCH_HINT : FIRST_USER_MESSAGE;
  const messages = [{ role: "user", content: first }];
  const transcript = [{ role: "user", content: first }];
  const tools = [...toolDefinitions({ lookup: Boolean(condition.lookup) && arm === "aura" }), ...extraTools];
  const system = systemPrompt(arm, condition);
  const usage = emptyUsage();
  const phases = [];
  let turn = 0;

  async function phase(name, budget) {
    const phaseStarted = now();
    const pu = emptyUsage();
    let endReason = "max_turns";
    for (let k = 1; k <= budget; k += 1) {
      turn += 1;
      const t0 = now();
      const response = await client.messages({ model, max_tokens: maxOutputTokens, system, messages, tools }, { session });
      const modelMs = now() - t0;
      const u = usageOf(response);
      for (const total of [usage, pu]) {
        addUsage(total, u);
        total.turns += 1;
        total.modelMs += modelMs;
      }
      const content = Array.isArray(response.content) ? response.content : [];
      messages.push({ role: "assistant", content });
      transcript.push({ role: "assistant", turn, phase: name, content });
      const toolUses = content.filter((block) => block.type === "tool_use");
      if (!toolUses.length) {
        endReason = response.stop_reason === "max_tokens" ? "max_output_tokens" : "stopped_without_finish";
        break;
      }
      const results = [];
      const t1 = now();
      for (const use of toolUses) {
        // Calls after finish in the same turn are not run, but still get a result: the follow-up phase continues this
        // conversation and the API rejects a tool_use without a matching tool_result.
        if (toolbox.state.finished) {
          results.push({ type: "tool_result", tool_use_id: use.id, content: "not run: finish was already called in this turn", is_error: true });
          continue;
        }
        const { content: text, isError } = toolbox.exec(use.name, use.input);
        results.push({ type: "tool_result", tool_use_id: use.id, content: text, ...(isError ? { is_error: true } : {}) });
      }
      const toolMs = now() - t1;
      usage.toolMs += toolMs;
      pu.toolMs += toolMs;
      messages.push({ role: "user", content: results });
      pruneOldImages(messages);
      // Image blocks (aura3d render) are kept out of the transcript file; the text part is kept like any result.
      const brief = (c) => (Array.isArray(c) ? c.map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n") : String(c)).slice(0, 1500);
      transcript.push({ role: "user", turn, phase: name, content: results.map((r) => ({ ...r, content: brief(r.content) })) });
      if (toolbox.state.finished) {
        endReason = "finished";
        break;
      }
    }
    phases.push({ name, endReason, wallMs: now() - phaseStarted, ...pu });
    return endReason;
  }

  const endReason = await phase("main", maxTurns);
  usage.turns = turn;
  if (!followUp) return { transcript, usage, endReason, wallMs: now() - started };

  // Harness work between phases (snapshots, copies, checks) is not agent time: it is excluded from wallMs.
  let harnessMs = 0;
  const hook = (name) => {
    const t = now();
    onPhaseEnd?.(name);
    harnessMs += now() - t;
  };
  hook("main");
  // The follow-up request rides on the last user message (tool results) when there is one, so roles keep alternating.
  const text = `Follow-up request from the user: ${followUp.text}\nMake this change in the existing project, check it with typecheck, then call finish again.`;
  const last = messages[messages.length - 1];
  if (last.role === "user" && Array.isArray(last.content)) last.content.push({ type: "text", text });
  else messages.push({ role: "user", content: text });
  transcript.push({ role: "user", phase: "followup", content: text });
  toolbox.state.finished = false;
  const followUpEnd = await phase("followup", followUp.maxTurns ?? 15);
  usage.turns = turn;
  hook("followup");
  return { transcript, usage: { ...usage, phases }, endReason, followUpEndReason: followUpEnd, wallMs: now() - started - harnessMs, harnessMs };
}
