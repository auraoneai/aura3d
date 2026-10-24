import { TOOL_DEFINITIONS } from "./tools.mjs";

export function systemPrompt(arm) {
  const common = [
    "You are an autonomous coding agent working alone in a sandboxed project. There is no internet access and no shell; use only the provided tools.",
    "The project is a Vite + TypeScript browser app. `index.html` already loads `/src/main.ts`; you write `src/main.ts` (and any other files under src/).",
    "Read TASK.md first: it is your assignment. Work until the task is complete, check your work with the typecheck tool, then call finish.",
    "Keep your final code correct and runnable in a browser: it will be built with `vite build` and run in headless Chromium."
  ];
  const specific =
    arm === "aura"
      ? [
          "The library is Aura3D (`@aura3d/engine`), already installed in node_modules. You may not know it: start from the project docs.",
          "Documentation entry points: `llms.txt` and `AGENTS.md` at the project root, then `docs/agents/`, and `.agents/skills/`. Package types are under `node_modules/@aura3d/`."
        ]
      : [
          "The library is three.js 0.185.1 (`three` and `@types/three`), already installed in node_modules. Examples and addons are under `node_modules/three/examples/jsm`."
        ];
  return [...common, ...specific].join("\n");
}

export const FIRST_USER_MESSAGE = "Start by reading TASK.md, then complete the assignment.";

const usageOf = (response) => {
  const u = response?.usage ?? {};
  return {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    uncachedInput: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0
  };
};

/** Drive one agent to completion. Returns the transcript, usage and end reason; the toolbox owns events and snapshots. */
export async function runAgent({ client, model, arm, toolbox, maxTurns = 40, maxOutputTokens = 8192, session, now = () => Date.now() }) {
  const started = now();
  const messages = [{ role: "user", content: FIRST_USER_MESSAGE }];
  const transcript = [{ role: "user", content: FIRST_USER_MESSAGE }];
  const usage = { input: 0, uncachedInput: 0, output: 0, turns: 0 };
  let endReason = "max_turns";
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const response = await client.messages(
      { model, max_tokens: maxOutputTokens, system: systemPrompt(arm), messages, tools: TOOL_DEFINITIONS },
      { session }
    );
    const u = usageOf(response);
    usage.input += u.input;
    usage.uncachedInput += u.uncachedInput;
    usage.output += u.output;
    usage.turns = turn;
    const content = Array.isArray(response.content) ? response.content : [];
    messages.push({ role: "assistant", content });
    transcript.push({ role: "assistant", turn, content });
    const toolUses = content.filter((block) => block.type === "tool_use");
    if (!toolUses.length) {
      endReason = response.stop_reason === "max_tokens" ? "max_output_tokens" : "stopped_without_finish";
      break;
    }
    const results = [];
    for (const use of toolUses) {
      const { content: text, isError } = toolbox.exec(use.name, use.input);
      results.push({ type: "tool_result", tool_use_id: use.id, content: text, ...(isError ? { is_error: true } : {}) });
      if (toolbox.state.finished) break;
    }
    messages.push({ role: "user", content: results });
    transcript.push({ role: "user", turn, content: results.map((r) => ({ ...r, content: String(r.content).slice(0, 1500) })) });
    if (toolbox.state.finished) {
      endReason = "finished";
      break;
    }
  }
  return { transcript, usage, endReason, wallMs: now() - started };
}
