#!/usr/bin/env tsx
/**
 * tools/crayon-capture/kid-goku-judge: blind A/B "which is the original?" judgement plus structural metrics for the Cloud
 * Runner port, run BEFORE and AFTER the art pass against the same original frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Same protocol as heatsink-judge.ts (Kiro Prism, never a provider SDK; seeded
 * balanced A/B order per pass; prompt not weakened; key read from the Prism key file and never printed), adapted to a
 * third-person rail runner. The original frames are third-party screenshots kept local (gitignored); only port frames,
 * metrics and the judgement are written to the committed evidence folder.
 *
 *   tsx kid-goku-judge.ts --original <dir of ref-<state>-clean.jpg> --ports before=<dir>,after=<dir> [--states s0,s570,...]
 *       [--out evidence/cloud-runner-port] [--seed 20261023] [--passes 8] [--model claude-sonnet-5.5] [--concurrency 3]
 *
 * Frames are normalised first: the original sits inside a framed player (a 16:9 rectangle inside the page, or a letterboxed
 * strip), so it is cropped to its 16:9 content and every image is resized to 640x360, giving the judge no aspect or border tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Trial } from "./heatsink-judge-lib.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
type Sharp = (input: Buffer | string) => {
  metadata: () => Promise<{ width?: number; height?: number }>;
  extract: (r: { left: number; top: number; width: number; height: number }) => ReturnType<Sharp>;
  resize: (w: number, h: number, o?: { fit?: string }) => ReturnType<Sharp>;
  jpeg: (o: { quality: number }) => ReturnType<Sharp>;
  ensureAlpha: () => ReturnType<Sharp>;
  raw: () => ReturnType<Sharp>;
  toBuffer: (o?: { resolveWithObject: true }) => Promise<Buffer & { data: Buffer; info: { width: number; height: number } }>;
  composite: (l: { input: Buffer; left: number; top: number }[]) => ReturnType<Sharp>;
};
const sharp = requireFromRoot("sharp") as Sharp & ((o: unknown) => ReturnType<Sharp>);

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";
const W = 640, H = 360;

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D third-person runner game, labelled Image A and Image B.",
  "Both are taken at the same distance along the same course, with the on-screen HUD hidden.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge only what is visible in the 3D scene: sky, clouds, terrain and cliffs, vegetation, lighting, the character and the camera."
].join(" ");

export const PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if a player would take both for the same game with the same art direction, false otherwise;',
  '"same_game_confidence": a number from 0 to 1;',
  '"original": "A" or "B", whichever you believe is the original shipped game (you must choose one);',
  '"original_confidence": a number from 0.5 to 1;',
  '"tells": up to three short phrases naming the visible differences that drove your choice.'
].join(" ");

/** The 16:9 content rectangle of an original frame (it is shown inside a framed player). */
export function originalCrop(width: number, height: number): { left: number; top: number; width: number; height: number } {
  if (width === 1280 && height === 720) return { left: 24, top: 72, width: 806, height: 453 };
  // letterboxed strip (e.g. 960x540: content rows ~56..402): take the centred 16:9 part
  const top = Math.round(height * 0.104), strip = Math.round(height * 0.64);
  const w = Math.min(width, Math.round((strip * 16) / 9));
  return { left: Math.round((width - w) / 2), top, width: w, height: strip };
}

async function normalise(file: string, original: boolean): Promise<Buffer> {
  const buf = fs.readFileSync(file);
  let img = sharp(buf);
  if (original) {
    const m = await img.metadata();
    img = img.extract(originalCrop(m.width ?? 1280, m.height ?? 720));
  }
  return (await img.resize(W, H, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer()) as Buffer;
}
async function decode(jpeg: Buffer) {
  const out = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: out.info.width, height: out.info.height, data: out.data };
}

async function callJudge(key: string, model: string, a: Buffer, b: Buffer): Promise<string> {
  const body = {
    model, max_tokens: 700, stream: false,
    messages: [{ role: "user", content: [
      { type: "text", text: PROMPT_INTRO },
      { type: "text", text: "Image A:" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a.toString("base64") } },
      { type: "text", text: "Image B:" }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } },
      { type: "text", text: PROMPT_QUESTION }
    ] }]
  };
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${ENDPOINT}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "kid-goku-judge", "X-Prism-Job-Type": "chat" }, body: JSON.stringify(body) });
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

async function main(): Promise<void> {
  const outDir = path.resolve(arg("--out") ?? "evidence/cloud-runner-port");
  const seed = Number(arg("--seed") ?? 20261023), passes = Number(arg("--passes") ?? 8);
  const model = arg("--model") ?? "claude-sonnet-5.5", concurrency = Number(arg("--concurrency") ?? 3);
  const originalDir = path.resolve(arg("--original") ?? "evidence/look-reference-frames/kid-goku-beyond-the-clouds");
  const ports = Object.fromEntries((arg("--ports") ?? "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k as string, path.resolve(v as string)] as const; }));
  const states = (arg("--states") ?? "s0,s570,s700,s1040,s1560,menu").split(",").filter(Boolean);
  const prefixOf = (label: string): string => (label === "before" ? "before" : "port");
  fs.mkdirSync(path.join(outDir, "judge-frames"), { recursive: true });

  const usable: string[] = [];
  const original = new Map<string, Buffer>();
  for (const st of states) {
    const f = path.join(originalDir, `ref-${st}-clean.jpg`);
    try { original.set(st, await normalise(f, true)); usable.push(st); } catch { process.stderr.write(`skip ${st}: original frame unreadable\n`); }
  }
  const labelled: Record<string, { frames: Map<string, Buffer>; metrics: ({ state: string } & FrameDistance)[] }> = {};
  for (const [label, dir] of Object.entries(ports)) {
    const frames = new Map<string, Buffer>(), metrics: ({ state: string } & FrameDistance)[] = [];
    for (const st of usable) {
      const f = path.join(dir, `${prefixOf(label)}-${st}-clean.jpg`);
      if (!fs.existsSync(f)) continue;
      const buf = await normalise(f, false);
      frames.set(st, buf);
      fs.writeFileSync(path.join(outDir, "judge-frames", `${label}-${st}.jpg`), buf);
      metrics.push({ state: st, ...frameDistance(imageStats(await decode(original.get(st) as Buffer)), imageStats(await decode(buf))) });
    }
    labelled[label] = { frames, metrics };
  }
  // local-only original crops (third-party) next to the port frames
  const localDir = path.join(originalDir, "judge-crops");
  fs.mkdirSync(localDir, { recursive: true });
  for (const [st, buf] of original) fs.writeFileSync(path.join(localDir, `original-${st}.jpg`), buf);

  const mean = (xs: number[]): number => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
  const result: Record<string, unknown> = {
    schema: "a3d-kid-goku-blind-judge/1", generatedAt: new Date().toISOString(), kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, order: "balanced A/B per pass, shuffled with a seeded mulberry32", states: usable, normalised: `${W}x${H}, original cropped to its 16:9 player content` },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION }, labels: {}
  };
  const key = process.argv.includes("--no-judge") ? "" : fs.readFileSync(KEY_FILE, "utf8").trim();
  for (const [label, data] of Object.entries(labelled)) {
    const stateList = usable.filter((st) => data.frames.has(st));
    const stepIds = stateList.map((_, i) => i);
    let trials: Trial[] = [];
    if (key) {
      const plan = assignOrder(stepIds, passes, seed + (label === "before" ? 0 : 101));
      const queue = [...plan];
      const worker = async (): Promise<void> => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const st = stateList[item.step] as string;
          const orig = original.get(st) as Buffer, port = data.frames.get(st) as Buffer;
          const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
          const t: Trial = { step: item.step, pass: item.pass, look: st, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
          try {
            const j = extractJson(await callJudge(key, model, a, b));
            if (!j) throw new Error("unparseable reply");
            t.picked = j.original === "A" || j.original === "B" ? j.original : null;
            t.sameGame = typeof j.same_game === "boolean" ? j.same_game : null;
            t.sameGameConfidence = typeof j.same_game_confidence === "number" ? j.same_game_confidence : null;
            t.originalConfidence = typeof j.original_confidence === "number" ? j.original_confidence : null;
            t.tells = Array.isArray(j.tells) ? j.tells.map(String).slice(0, 3) : [];
          } catch (e) { t.error = String(e instanceof Error ? e.message : e).slice(0, 160); }
          trials.push(t);
          process.stderr.write(`${label} ${st} pass ${item.pass}: ${t.picked ?? "error"} (original=${item.originalIs}) ${t.error ?? ""}\n`);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
      trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
    }
    (result.labels as Record<string, unknown>)[label] = {
      states: stateList,
      metrics: { perFrame: data.metrics, mean: { lumaJsd: mean(data.metrics.map((m) => m.lumaJsd)), rgbJsd: mean(data.metrics.map((m) => m.rgbJsd)), paletteDistance: mean(data.metrics.map((m) => m.paletteDistance)), edgeDensityRatio: mean(data.metrics.map((m) => m.edgeDensityRatio)) } },
      summary: trials.length ? summarize(trials) : null,
      trials
    };
  }
  fs.writeFileSync(path.join(outDir, "judge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(result.labels as Record<string, { metrics: { mean: unknown }; summary: unknown }>).map(([k, v]) => [k, { metrics: v.metrics.mean, summary: v.summary }])), null, 2)}\n`);
}

if (process.argv[1] && /kid-goku-judge\.(ts|mjs|js)$/.test(process.argv[1])) main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
