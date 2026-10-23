#!/usr/bin/env tsx
/**
 * tools/crayon-capture/where-the-wind-wanders-judge: blind A/B "same game?" judgement of original-vs-port frames of
 * Where the Wind Wanders (the protocol of heatsink-judge.ts, same prompt shape, same Prism route).
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Original frames come from tools/crayon-capture/where-the-wind-wanders-frames.ts
 * (remote), port frames from tests/browser/where-the-wind-wanders-port.spec.ts (remote), both at the same step of the same
 * recorded key script with the DOM HUD hidden. Both images are resized to 640x360 JPEG before they are shown so size and
 * compression cannot give the answer away. For every pair and pass the original is image A or B in a seeded, balanced
 * order; a vision-capable model reached through Kiro Prism (https://prism.auraone.ai/v1/messages, never a provider SDK)
 * says whether the pair is the same game and which image is the original. The key is read from the Prism key file at run
 * time and is never printed or written. The original's frames are third-party content: keep them local and gitignored.
 *
 *   tsx where-the-wind-wanders-judge.ts --original-dir o/ --port-dir p/ --pairs "start=start,step-2098=end"
 *       [--original-crop 0,56,960,346] [--label after] [--out evidence/where-the-wind-wanders-port] [--seed 20261023] [--passes 10] [--no-judge]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = (input: Buffer) => { extract: (r: { left: number; top: number; width: number; height: number }) => ReturnType<Sharp>; resize: (w: number, h: number, o?: Record<string, unknown>) => { jpeg: (o: { quality: number }) => { toBuffer: () => Promise<Buffer> } }; ensureAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }> } } };
const sharp = requireFromRoot("sharp") as Sharp;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D exploration game in which a small traveller walks through a meadow valley, labelled Image A and Image B.",
  "Both are taken at the same moment of the same recorded run (the traveller is at the same place in the valley), with the on-screen HUD hidden.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge only what is visible in the 3D scene: sky, ground, grass and flowers, trees, buildings, water, lighting, the traveller and the camera."
].join(" ");

export const PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if a player would take both for the same game with the same art direction, false otherwise;',
  '"same_game_confidence": a number from 0 to 1;',
  '"original": "A" or "B", whichever you believe is the original shipped game (you must choose one);',
  '"original_confidence": a number from 0.5 to 1;',
  '"tells": up to three short phrases naming the visible differences that drove your choice.'
].join(" ");

const W = 640, H = 360;
const normalise = async (file: string, crop: number[] | null = null): Promise<Buffer> => {
  let img = sharp(fs.readFileSync(file));
  if (crop) img = img.extract({ left: crop[0]!, top: crop[1]!, width: crop[2]!, height: crop[3]! });
  return img.resize(W, H, { fit: "fill" }).jpeg({ quality: 85 }).toBuffer();
};
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
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "wind-judge", "X-Prism-Job-Type": "chat" },
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
  const outDir = path.resolve(arg("--out") ?? "evidence/where-the-wind-wanders-port");
  const label = arg("--label") ?? "run";
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 10);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const origDir = path.resolve(arg("--original-dir") ?? "original");
  const portDir = path.resolve(arg("--port-dir") ?? "port");
  const crop = arg("--original-crop") ? arg("--original-crop")!.split(",").map(Number) : null;
  const pairs = (arg("--pairs") ?? "start=start").split(",").map((p) => { const [o, q] = p.split("="); return { name: o!, port: q ?? o! }; });
  const keep = new Map<number, { name: string; orig: Buffer; port: Buffer }>();
  pairs.forEach((p, i) => keep.set(i, { name: p.name, orig: Buffer.alloc(0), port: Buffer.alloc(0) }));
  const frameDir = path.join(outDir, `judge-frames-${label}`);
  fs.mkdirSync(frameDir, { recursive: true });

  const metrics: ({ pair: string } & FrameDistance)[] = [];
  for (const [i, p] of pairs.entries()) {
    const orig = await normalise(path.join(origDir, `${p.name}.jpg`), crop);
    const port = await normalise(path.join(portDir, `${p.port}.jpg`));
    keep.set(i, { name: p.name, orig, port });
    fs.writeFileSync(path.join(frameDir, `port-${p.name}.jpg`), port);
    metrics.push({ pair: p.name, ...frameDistance(imageStats(await decode(orig)), imageStats(await decode(port))) });
  }
  const mean = (f: (m: (typeof metrics)[number]) => number): number => metrics.map(f).reduce((s, v) => s + v, 0) / Math.max(1, metrics.length);
  const metricSummary = { frames: metrics.length, lumaJsd: mean((m) => m.lumaJsd), rgbJsd: mean((m) => m.rgbJsd), paletteDistance: mean((m) => m.paletteDistance), edgeDensityRatio: mean((m) => m.edgeDensityRatio), lumaMeanDelta: mean((m) => m.lumaMeanDelta) };

  let trials: Trial[] = [];
  if (!process.argv.includes("--no-judge")) {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    const plan = assignOrder([...keep.keys()], passes, seed);
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const f = keep.get(item.step)!;
        const [a, b] = item.originalIs === "A" ? [f.orig, f.port] : [f.port, f.orig];
        const trial: Trial = { step: item.step, pass: item.pass, look: f.name, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
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
        process.stderr.write(`${f.name} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-wind-blind-judge/1",
    label,
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, pairs: pairs.map((p) => `${p.name}=${p.port}`), order: "balanced A/B per pass, shuffled with a seeded mulberry32", imageSize: `${W}x${H}` },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    metrics: { perFrame: metrics, summary: metricSummary },
    summary,
    trials
  };
  fs.writeFileSync(path.join(outDir, `judge-results-${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ label, pairs: pairs.length, metrics: metricSummary, summary }, null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
