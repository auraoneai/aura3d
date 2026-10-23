#!/usr/bin/env tsx
/**
 * tools/crayon-capture/last-train-judge: blind A/B "same game?" judgement of Last Train to the Sea original-vs-port frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Same protocol as heatsink-judge.ts (Kiro Prism /v1/messages, never a provider SDK;
 * randomised balanced A/B order with a recorded seed; the key is read from the Prism key file at run time and never printed or
 * written). The original's reference frames (local only, third-party, never committed) all show the tram docked at Mango Tide, so
 * the port frames compared are its docked and boarding views at the same station. The original shows its DOM HUD, so every image
 * (both sides) is cropped to the same band (rows 70..500 of a 720-row frame) that contains no HUD in either.
 *
 *   tsx last-train-judge.ts --refs evidence/look-reference-frames/last-train-to-the-sea --port-dir art-after --names 01-docked-day,02-boarding,03-ready
 *       --out evidence/last-train-port/judge-after.json [--seed 20261023] [--passes 4] [--model claude-sonnet-5.5] [--concurrency 3] [--no-judge]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = (input: Buffer) => {
  extract: (r: { left: number; top: number; width: number; height: number }) => Sharp2;
  metadata: () => Promise<{ width?: number; height?: number }>;
};
type Sharp2 = { resize: (w: number, h: number) => Sharp2; jpeg: (o: { quality: number }) => Sharp2; toBuffer: () => Promise<Buffer>; ensureAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }> } } };
const sharp = requireFromRoot("sharp") as Sharp;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D tram game, labelled Image A and Image B.",
  "Both show the tram docked at the first station of the same game, with the on-screen HUD cropped out.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge only what is visible in the 3D scene: sky, buildings, ground, lighting and shadows, the tram, passengers and the camera."
].join(" ");

export const PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if a player would take both for the same game with the same art direction, false otherwise;',
  '"same_game_confidence": a number from 0 to 1;',
  '"original": "A" or "B", whichever you believe is the original shipped game (you must choose one);',
  '"original_confidence": a number from 0.5 to 1;',
  '"tells": up to three short phrases naming the visible differences that drove your choice.'
].join(" ");

/** Crop the HUD-free band (same relative rows for every frame) and resize to a common size. */
async function band(jpeg: Buffer): Promise<Buffer> {
  const meta = await sharp(jpeg).metadata();
  const w = meta.width ?? 1280, h = meta.height ?? 720;
  const top = Math.round((70 / 720) * h), height = Math.round((430 / 720) * h);
  return await sharp(jpeg).extract({ left: 0, top, width: w, height }).resize(1024, Math.round(1024 * (height / w))).jpeg({ quality: 88 }).toBuffer();
}

async function decode(jpeg: Buffer) {
  const { data, info } = await (sharp(jpeg) as unknown as Sharp2).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "last-train-judge", "X-Prism-Job-Type": "chat" },
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
  const refsDir = path.resolve(arg("--refs") ?? "evidence/look-reference-frames/last-train-to-the-sea");
  const portDir = path.resolve(arg("--port-dir") ?? "art-after");
  const names = (arg("--names") ?? "01-docked-day,02-boarding,03-ready").split(",");
  const refFiles = (arg("--ref-files") ?? "ref-2.jpg,ref-3.jpg,ref-5.jpg,ref-6.jpg").split(",");
  const out = path.resolve(arg("--out") ?? "judge.json");
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 4);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);

  const refs = await Promise.all(refFiles.map(async (f) => band(fs.readFileSync(path.join(refsDir, f)))));
  const ports = await Promise.all(names.map(async (n) => band(fs.readFileSync(path.join(portDir, `${n}.jpg`)))));
  const pairs = refFiles.flatMap((rf, r) => names.map((n, p) => ({ id: r * names.length + p, ref: r, port: p, label: `${rf}|${n}` })));

  const metrics: ({ pair: string } & FrameDistance)[] = [];
  for (const pr of pairs) metrics.push({ pair: pr.label, ...frameDistance(imageStats(await decode(refs[pr.ref]!)), imageStats(await decode(ports[pr.port]!))) });
  const mean = (f: (m: FrameDistance) => number): number => metrics.reduce((s, m) => s + f(m), 0) / metrics.length;
  const metricSummary = { pairs: metrics.length, lumaJsd: mean((m) => m.lumaJsd), rgbJsd: mean((m) => m.rgbJsd), paletteDistance: mean((m) => m.paletteDistance), edgeDensityRatio: mean((m) => m.edgeDensityRatio), lumaMeanDelta: mean((m) => m.lumaMeanDelta) };

  let trials: Trial[] = [];
  if (!process.argv.includes("--no-judge")) {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    const plan = assignOrder(pairs.map((p) => p.id), passes, seed);
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const pr = pairs[item.step]!;
        const orig = refs[pr.ref]!, port = ports[pr.port]!;
        const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
        const trial: Trial = { step: item.step, pass: item.pass, look: pr.label, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
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
        process.stderr.write(`pair ${pr.label} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-last-train-blind-judge/1",
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, trials: trials.length, order: "balanced A/B per pass, shuffled with a seeded mulberry32", portFrames: names, referenceFrames: refFiles, crop: "rows 70..500 of 720 on both sides (HUD-free band)" },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    metrics: { perPair: metrics, summary: metricSummary },
    summary,
    trials
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ metrics: metricSummary, summary }, null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
