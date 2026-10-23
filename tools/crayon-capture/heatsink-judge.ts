#!/usr/bin/env tsx
/**
 * tools/crayon-capture/heatsink-judge: blind A/B "same game?" judgement of HEATSINK original-vs-port frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Frames come from two remote runs (tools/crayon-capture/heatsink-frames.ts
 * for the original, tests/browser/heatsink-port.spec.ts for the port), both photographed at the same simulation steps with
 * the DOM HUD hidden. For every step and pass the original is shown as image A or B in a seeded, balanced order; a
 * vision-capable model reached through Kiro Prism (https://prism.auraone.ai/v1/messages, never a provider SDK) says
 * whether the two are the same game and which one is the original. The key is read from the Prism key file at run time and
 * is never printed or written anywhere.
 *
 *   tsx heatsink-judge.ts --original-log o.log --port-log p.log [--reference ref.json] [--out evidence/heatsink-port]
 *       [--seed 20261023] [--passes 3] [--model claude-sonnet-5.5] [--concurrency 3] [--no-judge]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, parseFrameLines, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireFromRoot("sharp") as (input: Buffer) => { ensureAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }> } } };

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D racing game, labelled Image A and Image B.",
  "Both are taken at the same moment of the same recorded run (same track position, same speed), with the on-screen HUD hidden.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge only what is visible in the 3D scene: sky, road, scenery, lighting, glow, the vehicle and the camera."
].join(" ");

export const PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if a player would take both for the same game with the same art direction, false otherwise;',
  '"same_game_confidence": a number from 0 to 1;',
  '"original": "A" or "B", whichever you believe is the original shipped game (you must choose one);',
  '"original_confidence": a number from 0.5 to 1;',
  '"tells": up to three short phrases naming the visible differences that drove your choice.'
].join(" ");

async function decode(jpeg: Buffer) {
  const { data, info } = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

async function callJudge(key: string, model: string, a: Buffer, b: Buffer): Promise<{ text: string }> {
  const body = {
    model,
    max_tokens: 700,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT_INTRO },
        { type: "text", text: "Image A:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.toString("base64") } },
        { type: "text", text: "Image B:" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } },
        { type: "text", text: PROMPT_QUESTION }
      ]
    }],
    stream: false
  };
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${ENDPOINT}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "heatsink-judge", "X-Prism-Job-Type": "chat" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      return { text: (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") };
    }
    lastError = `HTTP ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(lastError || "request failed");
}

async function main(): Promise<void> {
  const outDir = path.resolve(arg("--out") ?? "evidence/heatsink-port");
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 3);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const reference = JSON.parse(fs.readFileSync(path.resolve(arg("--reference") ?? "evidence/crayon-capture/heatsink-reference.json"), "utf8")) as { reference: { snapshots: { step: number; player: { heat: number; burstT: number } }[] } };
  const snapByStep = new Map(reference.reference.snapshots.map((s) => [s.step, s] as const));

  const originals = parseFrameLines(fs.readFileSync(path.resolve(arg("--original-log") ?? "original.log"), "utf8"));
  const ports = parseFrameLines(fs.readFileSync(path.resolve(arg("--port-log") ?? "port.log"), "utf8"));
  const steps = [...originals.keys()].filter((s) => ports.has(s)).sort((a, b) => a - b);
  if (!steps.length) throw new Error("no step has both an original and a port frame");
  const frameDir = path.join(outDir, "frames");
  fs.mkdirSync(frameDir, { recursive: true });
  const look = (step: number): string => {
    const p = snapByStep.get(step)?.player;
    if (!p) return "unknown";
    return p.heat > 0.3 ? "heat" : p.burstT > 0.5 ? "boost" : "cruise";
  };

  const metrics: ({ step: number; look: string } & FrameDistance)[] = [];
  for (const step of steps) {
    fs.writeFileSync(path.join(frameDir, `original-${step}.jpg`), originals.get(step) as Buffer);
    fs.writeFileSync(path.join(frameDir, `port-${step}.jpg`), ports.get(step) as Buffer);
    const o = imageStats(await decode(originals.get(step) as Buffer));
    const p = imageStats(await decode(ports.get(step) as Buffer));
    metrics.push({ step, look: look(step), ...frameDistance(o, p) });
  }
  const mean = (f: (m: (typeof metrics)[number]) => number, only?: string): number => {
    const xs = metrics.filter((m) => !only || m.look === only).map(f).filter(Number.isFinite);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
  };
  const looks = [...new Set(metrics.map((m) => m.look))];
  const metricSummary = Object.fromEntries(["all", ...looks].map((l) => {
    const only = l === "all" ? undefined : l;
    return [l, { frames: metrics.filter((m) => !only || m.look === only).length, lumaJsd: mean((m) => m.lumaJsd, only), rgbJsd: mean((m) => m.rgbJsd, only), paletteDistance: mean((m) => m.paletteDistance, only), edgeDensityOriginal: mean((m) => m.edgeDensityOriginal, only), edgeDensityPort: mean((m) => m.edgeDensityPort, only), edgeDensityRatio: mean((m) => m.edgeDensityRatio, only) }];
  }));

  let trials: Trial[] = [];
  if (!process.argv.includes("--no-judge")) {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    const plan = assignOrder(steps, passes, seed);
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const orig = originals.get(item.step) as Buffer, port = ports.get(item.step) as Buffer;
        const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
        const trial: Trial = { step: item.step, pass: item.pass, look: look(item.step), originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
        try {
          const { text } = await callJudge(key, model, a, b);
          const j = extractJson(text);
          if (!j) throw new Error(`unparseable reply: ${text.slice(0, 160)}`);
          trial.picked = j.original === "A" || j.original === "B" ? j.original : null;
          trial.sameGame = typeof j.same_game === "boolean" ? j.same_game : null;
          trial.sameGameConfidence = typeof j.same_game_confidence === "number" ? j.same_game_confidence : null;
          trial.originalConfidence = typeof j.original_confidence === "number" ? j.original_confidence : null;
          trial.tells = Array.isArray(j.tells) ? j.tells.map(String).slice(0, 3) : [];
        } catch (e) {
          trial.error = String(e instanceof Error ? e.message : e).slice(0, 200);
        }
        trials.push(trial);
        process.stderr.write(`step ${item.step} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-heatsink-blind-judge/1",
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, order: "balanced A/B per pass, shuffled with a seeded mulberry32", frameSteps: steps },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    metrics: { perFrame: metrics, summary: metricSummary },
    summary,
    trials
  };
  fs.writeFileSync(path.join(outDir, "judge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ steps: steps.length, metrics: metricSummary, summary }, null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
