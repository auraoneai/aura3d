#!/usr/bin/env tsx
/**
 * tools/crayon-capture/heatsink-judge-design: the SECOND, separately labelled Phase B question on the same HEATSINK frame pairs.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. The strict question (heatsink-judge.ts: "which one is the original?") asks the
 * judge to find ANY tell. This one asks the symmetric design question the Phase B exit's "same game" wording can also mean:
 * do the two frames show the same game design (same track layout, same kind of vehicle, same overall look-and-feel and art
 * direction family), even if rendering quality, textures and assets differ. The pair is shown in a seeded, balanced A/B order;
 * the judge is not told which image is the original and is not asked to pick one.
 *
 *   tsx heatsink-judge-design.ts --original-log o.log --port-log p.log [--out dir] [--seed 20261023] [--passes 3]
 *       [--model claude-sonnet-5.5] [--concurrency 3]
 */
import fs from "node:fs";
import path from "node:path";
import { assignOrder, extractJson, parseFrameLines, wilson } from "./heatsink-judge-lib.js";

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

export const DESIGN_INTRO = [
  "You are shown two screenshots of a browser 3D racing game, labelled Image A and Image B.",
  "Both are taken at the same moment of the same recorded run (same track position, same speed), with the on-screen HUD hidden.",
  "One may be from a shipped game and the other from an independent re-implementation, or both from the same source; you are not told which."
].join(" ");

export const DESIGN_QUESTION = [
  "Question: do the two images show the SAME GAME DESIGN: the same track layout and scenery layout, the same kind of vehicle, and the same overall look-and-feel and art-direction family,",
  "even if rendering quality, textures, models and effects differ in detail?",
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_design": true or false;',
  '"confidence": a number from 0 to 1;',
  '"matches": up to three short phrases naming what is the same in both;',
  '"differences": up to three short phrases naming the most important differences.'
].join(" ");

async function call(key: string, model: string, a: Buffer, b: Buffer): Promise<string> {
  const body = {
    model,
    max_tokens: 600,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: DESIGN_INTRO },
        { type: "text", text: "Image A:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.toString("base64") } },
        { type: "text", text: "Image B:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } },
        { type: "text", text: DESIGN_QUESTION }
      ]
    }],
    stream: false
  };
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${ENDPOINT}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "heatsink-judge-design", "X-Prism-Job-Type": "chat" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    }
    lastError = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(lastError || "request failed");
}

interface DesignTrial { step: number; pass: number; originalIs: "A" | "B"; sameDesign: boolean | null; confidence: number | null; matches: string[]; differences: string[]; error?: string }

async function main(): Promise<void> {
  const outDir = path.resolve(arg("--out") ?? "evidence/heatsink-port");
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 3);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const originals = parseFrameLines(fs.readFileSync(path.resolve(arg("--original-log") ?? "original.log"), "utf8"));
  const ports = parseFrameLines(fs.readFileSync(path.resolve(arg("--port-log") ?? "port.log"), "utf8"));
  const steps = [...originals.keys()].filter((s) => ports.has(s)).sort((a, b) => a - b);
  if (!steps.length) throw new Error("no step has both an original and a port frame");
  const key = fs.readFileSync(KEY_FILE, "utf8").trim();
  const queue = [...assignOrder(steps, passes, seed)];
  const trials: DesignTrial[] = [];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const orig = originals.get(item.step) as Buffer, port = ports.get(item.step) as Buffer;
      const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
      const t: DesignTrial = { step: item.step, pass: item.pass, originalIs: item.originalIs, sameDesign: null, confidence: null, matches: [], differences: [] };
      try {
        const j = extractJson(await call(key, model, a, b));
        if (!j) throw new Error("unparseable reply");
        t.sameDesign = typeof j.same_design === "boolean" ? j.same_design : null;
        t.confidence = typeof j.confidence === "number" ? j.confidence : null;
        t.matches = Array.isArray(j.matches) ? j.matches.map(String).slice(0, 3) : [];
        t.differences = Array.isArray(j.differences) ? j.differences.map(String).slice(0, 3) : [];
      } catch (e) {
        t.error = String(e instanceof Error ? e.message : e).slice(0, 200);
      }
      trials.push(t);
      process.stderr.write(`step ${item.step} pass ${item.pass}: same_design=${t.sameDesign} ${t.error ?? ""}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  const valid = trials.filter((t) => t.sameDesign !== null);
  const yes = valid.filter((t) => t.sameDesign).length;
  const result = {
    schema: "a3d-heatsink-design-judge/1",
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one; a different question from judge-results.json (symmetric, does not ask which is the original)",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, frameSteps: steps },
    prompt: { intro: DESIGN_INTRO, question: DESIGN_QUESTION },
    summary: { trials: trials.length, valid: valid.length, errors: trials.length - valid.length, sameDesign: yes, sameDesignRate: valid.length ? yes / valid.length : null, wilson95: valid.length ? wilson(yes, valid.length) : null },
    trials
  };
  fs.writeFileSync(path.join(outDir, "judge-results-design.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
