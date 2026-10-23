#!/usr/bin/env tsx
/**
 * tools/crayon-capture/silt-and-signal-judge: blind A/B "same game?" judgement of Silt & Signal original-vs-port frames, plus the
 * structural metrics (luma / RGB histogram JSD, palette distance, edge density) and side-by-side contact sheets.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Frames are full browser frames (3D scene AND HUD / title / game-over cards),
 * taken at comparable moments of play. Same protocol as heatsink-judge.ts: for
 * each state and pass the original is shown as image A or B in a seeded, balanced order; a vision model reached through
 * Kiro Prism (never a provider SDK) says whether the two are the same game and which is the original. The key is read at
 * run time from the Prism key file and is never printed or written.
 *
 *   tsx silt-and-signal-judge.ts --original-dir evidence/look-reference-frames/silt-and-signal --port-dir evidence/silt-and-signal-port/after
 *       --label after [--out evidence/silt-and-signal-port] [--seed 20261023] [--passes 8] [--model claude-sonnet-5.5] [--no-judge]
 *       [--sheet-before evidence/silt-and-signal-port/before]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = ((input: Buffer | { create: { width: number; height: number; channels: 3; background: string } }) => SharpInstance) & Record<string, unknown>;
interface SharpInstance {
  ensureAlpha: () => SharpInstance;
  raw: () => SharpInstance;
  toBuffer: {
    (o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
    (): Promise<Buffer>;
  };
  composite: (layers: { input: Buffer; left: number; top: number }[]) => SharpInstance;
  jpeg: (o: { quality: number }) => SharpInstance;
}
const sharp = requireFromRoot("sharp") as Sharp;

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

/** [state label, original file stem, port file stem]; set with --pairs "ref-3:ch0-obj0-chase,ref-5:ch0-village:village" (label defaults to the port stem). */
export const DEFAULT_PAIRS = "ref-1:title,ref-2:ch0-obj0-chase,ref-3:ch0-obj2-chase";
export const parsePairs = (spec: string): [string, string, string][] =>
  spec.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [o = "", port = "", label = port] = p.split(":");
    return [label, o, port] as [string, string, string];
  });
let STATES: readonly [string, string, string][] = parsePairs(DEFAULT_PAIRS);

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D hover-board flight game (a rider gliding over a canal valley with a village, aqueduct arches and glowing signal rings), labelled Image A and Image B.",
  "Both are taken at the same moment of the same recorded run (same game state), at the same window size.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge everything visible: the 3D scene (sky, terrain, water, buildings, rider, rings, lighting), the on-screen HUD and any title card."
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
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "silt-and-signal-judge", "X-Prism-Job-Type": "chat" },
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

async function sheet(images: Buffer[], outFile: string): Promise<void> {
  const decoded = await Promise.all(images.map(decode));
  const w = decoded.reduce((s, d) => s + d.width, 0) + 8 * (images.length - 1);
  const h = Math.max(...decoded.map((d) => d.height));
  let x = 0;
  const layers = images.map((input, i) => {
    const layer = { input, left: x, top: 0 };
    x += (decoded[i] as { width: number }).width + 8;
    return layer;
  });
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: "#222222" } }).composite(layers).jpeg({ quality: 88 }).toBuffer();
  fs.writeFileSync(outFile, buf);
}

async function main(): Promise<void> {
  const outDir = path.resolve(arg("--out") ?? "evidence/silt-and-signal-port");
  const originalDir = path.resolve(arg("--original-dir") ?? "evidence/look-reference-frames/silt-and-signal");
  const portDir = path.resolve(arg("--port-dir") ?? "evidence/silt-and-signal-port/after");
  const label = arg("--label") ?? "after";
  STATES = parsePairs(arg("--pairs") ?? DEFAULT_PAIRS);
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 8);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const sheetBefore = arg("--sheet-before") ? path.resolve(arg("--sheet-before") as string) : null;

  const read = (dir: string, stem: string): Buffer | null => {
    const f = path.join(dir, `${stem}.jpg`);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  };
  const states = STATES.filter(([, o, p]) => read(originalDir, o) && read(portDir, p));
  if (!states.length) throw new Error("no state has both an original and a port frame");
  const labelOf = new Map(states.map(([s], i) => [i, s] as const));
  const orig = (i: number): Buffer => read(originalDir, (states[i] as (typeof STATES)[number])[1]) as Buffer;
  const port = (i: number): Buffer => read(portDir, (states[i] as (typeof STATES)[number])[2]) as Buffer;

  const metrics: ({ state: string } & FrameDistance)[] = [];
  for (let i = 0; i < states.length; i++) {
    const o = imageStats(await decode(orig(i)));
    const p = imageStats(await decode(port(i)));
    metrics.push({ state: labelOf.get(i) as string, ...frameDistance(o, p) });
  }
  const mean = (f: (m: (typeof metrics)[number]) => number): number => {
    const xs = metrics.map(f).filter(Number.isFinite);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
  };
  const metricSummary = {
    frames: metrics.length,
    lumaJsd: mean((m) => m.lumaJsd),
    rgbJsd: mean((m) => m.rgbJsd),
    paletteDistance: mean((m) => m.paletteDistance),
    edgeDensityOriginal: mean((m) => m.edgeDensityOriginal),
    edgeDensityPort: mean((m) => m.edgeDensityPort),
    edgeDensityRatio: mean((m) => m.edgeDensityRatio)
  };

  /* contact sheets: the committed one is port-only (before | after); the full pairs stay local with the third-party frames */
  fs.mkdirSync(outDir, { recursive: true });
  const localPairs = path.join(originalDir, "pairs");
  fs.mkdirSync(localPairs, { recursive: true });
  for (let i = 0; i < states.length; i++) {
    const state = labelOf.get(i) as string;
    await sheet([orig(i), port(i)], path.join(localPairs, `pair-${label}-${state}.jpg`));
    const before = sheetBefore ? read(sheetBefore, (states[i] as (typeof STATES)[number])[2]) : null;
    if (before) await sheet([before, port(i)], path.join(outDir, `compare-${state}.jpg`));
  }

  let trials: Trial[] = [];
  if (!process.argv.includes("--no-judge")) {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    const plan = assignOrder(states.map((_, i) => i), passes, seed);
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [a, b] = item.originalIs === "A" ? [orig(item.step), port(item.step)] : [port(item.step), orig(item.step)];
        const state = labelOf.get(item.step) as string;
        const trial: Trial = { step: item.step, pass: item.pass, look: state, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
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
        process.stderr.write(`${state} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-silt-and-signal-blind-judge/1",
    label,
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, order: "balanced A/B per pass, shuffled with a seeded mulberry32", states: states.map(([s]) => s) },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    metrics: { perFrame: metrics, summary: metricSummary },
    summary,
    trials
  };
  fs.writeFileSync(path.join(outDir, `judge-results-${label}.json`), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ label, states: states.length, metrics: metricSummary, summary }, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("silt-and-signal-judge.ts")) main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
