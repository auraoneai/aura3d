import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_EVAL_DIR } from "./sandbox.mjs";

export const JUDGE_SYSTEM = `You are a strict code-review judge for an authoring trial. You receive a task checklist, the final source an agent wrote, and
measured browser probe results from a headless run. Decide each checklist item from the source AND the probes (probes win when they disagree with the code).
Also report:
- silentNoOps: every place where the source passes an option, call or feature that has no effect at runtime or that the probes show is not working
  (for example an ignored parameter, a control that is constructed but does nothing, a requested effect that never appears). Count each distinct one once.
- glue: estimate the number of non-blank, non-comment source lines that are neither scene description (objects, materials, lights, camera), game rules, shader code
  nor asset references, i.e. plumbing the library should ideally hide (renderer/loop/resize/DOM bootstrapping, manual math helpers, boilerplate).
Answer with ONLY a JSON object: {"checklist":[{"id":string,"pass":boolean,"why":string}],"silentNoOps":[{"where":string,"why":string}],"glue":{"sceneLines":number,"rulesLines":number,"glueLines":number,"notes":string}}`;

export function loadChecklist(task, dir = AGENT_EVAL_DIR) {
  return JSON.parse(readFileSync(join(dir, "tasks", "checklists.json"), "utf8"))[String(task)] ?? [];
}

export function buildJudgePrompt({ task, checklist, sources, probes, remote }) {
  const files = Object.entries(sources)
    .map(([name, text]) => `=== ${name} ===\n${text}`)
    .join("\n\n")
    .slice(0, 60000);
  return `Task ${task} checklist:\n${checklist.map((c) => `- ${c.id}: ${c.text}`).join("\n")}\n\nBrowser results (final snapshot, software WebGL2):\n${JSON.stringify({ build: remote?.build, readyTimeout: remote?.readyTimeout, page: remote?.page, probes }, null, 1).slice(0, 6000)}\n\nFinal source:\n${files}`;
}

export function parseJudge(text) {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new Error("judge returned no JSON");
  const json = JSON.parse(match[0]);
  return {
    checklist: Array.isArray(json.checklist) ? json.checklist.map((c) => ({ id: String(c.id), pass: c.pass === true, why: String(c.why ?? "").slice(0, 240) })) : [],
    silentNoOps: Array.isArray(json.silentNoOps) ? json.silentNoOps.map((n) => ({ where: String(n.where ?? "").slice(0, 120), why: String(n.why ?? "").slice(0, 240) })) : [],
    glue: {
      sceneLines: Number(json.glue?.sceneLines ?? 0),
      rulesLines: Number(json.glue?.rulesLines ?? 0),
      glueLines: Number(json.glue?.glueLines ?? 0),
      notes: String(json.glue?.notes ?? "").slice(0, 300)
    }
  };
}

export async function judgeRun({ client, model, task, sources, probes, remote }) {
  const checklist = loadChecklist(task);
  const response = await client.messages(
    { model, max_tokens: 4000, system: JUDGE_SYSTEM, messages: [{ role: "user", content: buildJudgePrompt({ task, checklist, sources, probes, remote }) }] },
    { session: `judge-${task}`, jobType: "agent-eval-judge" }
  );
  const text = (response.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { ...parseJudge(text), raw: text.slice(0, 4000) };
}
