#!/usr/bin/env tsx
/**
 * tools/crayon-capture/ninja-runner-judge: blind A/B "same game?" judgement of Ninja Runner original-vs-port frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. The original's frames (evidence/look-reference-frames/ninja-runner/ref-*.jpg,
 * local and gitignored, with the original's DOM HUD in the corners) and the port's frames (tests/browser/ninja-runner-art.spec.ts,
 * canvas only) are paired by game state; both sides are cropped to the same central 3D region so no HUD is visible. For every shot and pass the original is shown as image A or
 * B in a seeded, balanced order; a vision-capable model reached through Kiro Prism (https://prism.auraone.ai/v1/messages, never
 * a provider SDK) says whether the two are the same game and which one is the original. The key is read from the Prism key file
 * at run time and is never printed or written anywhere. The protocol, statistics and prompt shape are the HEATSINK judge's.
 *
 *   tsx ninja-runner-judge.ts --port-prefix evidence/ninja-runner-port/art-a3 --label after [--seed 20261023] [--trials 48]
 *       [--model claude-sonnet-5.5] [--concurrency 3] [--no-judge]
 * Pairs: village-a = ref-2 vs <prefix>-run-start.jpg, village-b = ref-5 vs <prefix>-village.jpg (the only original frames in the village).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
interface SharpPipeline {
  ensureAlpha: () => SharpPipeline; raw: () => SharpPipeline; extract: (r: { left: number; top: number; width: number; height: number }) => SharpPipeline;
  resize: (w: number, h: number, o: { fit: "fill" }) => SharpPipeline; jpeg: (o: { quality: number }) => SharpPipeline; metadata: () => Promise<{ width?: number; height?: number }>;
  toBuffer: {
    (): Promise<Buffer>;
    (o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  };
}
const sharp = requireFromRoot("sharp") as (input: Buffer) => SharpPipeline;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D endless-runner game (a ninja character running along a village street seen from a chase camera behind the runner), labelled Image A and Image B.",
  "Both are taken near the start of a run on the same course, cropped to the 3D scene so no on-screen HUD is visible.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge only what is visible in the 3D scene: sky, haze, the path surface, buildings, trees, lanterns, lighting and shadows, the character and the camera."
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

/** Crop to the shared 3D region and normalise both sides to 960 x 540-ish JPEGs of equal size. */
async function prepare(jpeg: Buffer): Promise<Buffer> {
  const meta = await sharp(jpeg).metadata();
  const w = meta.width ?? 1, h = meta.height ?? 1;
  const left = Math.round(w * CROP.left), top = Math.round(h * CROP.top);
  return sharp(jpeg).extract({ left, top, width: Math.min(w - left, Math.round(w * CROP.width)), height: h - top }).resize(768, 438, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer();
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
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "ninja-runner-judge", "X-Prism-Job-Type": "chat" },
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

const SHOT_LOOK: Record<string, string> = { "village-a": "village", "village-b": "village" };
/** Central 3D region of the original's 1280 x 720 frame (clear of the corner HUD and the district banner), as fractions. */
const CROP = { left: 0.1, top: 0.19, width: 0.8, height: 0.81 };

async function main(): Promise<void> {
  const originalDir = path.resolve(arg("--original-dir") ?? "evidence/look-reference-frames/ninja-runner");
  const portPrefix = path.resolve(arg("--port-prefix") ?? "evidence/ninja-runner-port/art-a3");
  const label = arg("--label") ?? "after";
  const outDir = path.resolve(arg("--out") ?? "evidence/ninja-runner-port");
  const seed = Number(arg("--seed") ?? 20261023);
  const wanted = Number(arg("--trials") ?? 48);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const PAIRS: Record<string, { original: string; port: string }> = {
    "village-a": { original: path.join(originalDir, "ref-2.jpg"), port: `${portPrefix}-run-start.jpg` },
    "village-b": { original: path.join(originalDir, "ref-5.jpg"), port: `${portPrefix}-village.jpg` }
  };
  const shots = Object.keys(PAIRS).filter((k) => fs.existsSync(PAIRS[k]!.original) && fs.existsSync(PAIRS[k]!.port));
  if (!shots.length) throw new Error("no shot has both an original and a port frame");
  const passes = Math.max(1, Math.ceil(wanted / shots.length));
  const index = new Map(shots.map((s, i) => [i, s] as const));
  const steps = shots.map((_, i) => i);
  const load = async (shot: string, side: "original" | "port"): Promise<Buffer> => prepare(fs.readFileSync(PAIRS[shot]![side]));

  const metrics: ({ shot: string; look: string } & FrameDistance)[] = [];
  for (const shot of shots) {
    const o = imageStats(await decode(await load(shot, "original")));
    const p = imageStats(await decode(await load(shot, "port")));
    metrics.push({ shot, look: SHOT_LOOK[shot] as string, ...frameDistance(o, p) });
  }
  const mean = (f: (m: (typeof metrics)[number]) => number): number => {
    const xs = metrics.map(f).filter(Number.isFinite);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
  };
  const metricSummary = { frames: metrics.length, lumaJsd: mean((m) => m.lumaJsd), rgbJsd: mean((m) => m.rgbJsd), paletteDistance: mean((m) => m.paletteDistance), edgeDensityOriginal: mean((m) => m.edgeDensityOriginal), edgeDensityPort: mean((m) => m.edgeDensityPort), edgeDensityRatio: mean((m) => m.edgeDensityRatio), lumaMeanDelta: mean((m) => m.lumaMeanDelta) };

  let trials: Trial[] = [];
  if (!process.argv.includes("--no-judge")) {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    const plan = assignOrder(steps, passes, seed);
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const shot = index.get(item.step) as string;
        const orig = await load(shot, "original");
        const port = await load(shot, "port");
        const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
        const trial: Trial = { step: item.step, pass: item.pass, look: SHOT_LOOK[shot] as string, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
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
        process.stderr.write(`${shot} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-ninja-runner-blind-judge/1",
    label,
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, shots, order: "balanced A/B per pass, shuffled with a seeded mulberry32" },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    metrics: { perFrame: metrics, summary: metricSummary },
    summary,
    trials: trials.map((t) => ({ ...t, shot: index.get(t.step) }))
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `judge-${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ label, shots: shots.length, metrics: metricSummary, summary }, null, 2)}\n`);
}

if (process.argv[1] && /ninja-runner-judge\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
}
