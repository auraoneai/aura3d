#!/usr/bin/env tsx
/**
 * tools/crayon-capture/saiyan-snake-way-judge: blind A/B "same game?" judgement of original-vs-port in-run frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. Original frames are the local-only reference screenshots
 * (evidence/look-reference-frames/saiyan-snake-way, never committed). Port frames come from the remote matched-state capture
 * (tests/browser/saiyan-snake-way-match.spec.ts, printed as `@@SSW_ART <tag> <name> ...`) at the same road distances. Both sides are
 * 1280x720 full-page frames with the HUD visible, because the original's HUD cannot be hidden in its screenshots. For every state and
 * pass the original is shown as image A or B in a seeded, balanced order; a vision-capable model reached through Kiro Prism
 * (https://prism.auraone.ai/v1/messages, never a provider SDK) says whether the two are the same game and which is the original.
 * Each tag found in the log ("before", "after") is judged with the same plan. The key is read from the Prism key file and never printed.
 *
 *   tsx saiyan-snake-way-judge.ts --port-log run.log [--refs evidence/look-reference-frames/saiyan-snake-way]
 *       [--out evidence/saiyan-snake-way-port] [--seed 20261023] [--passes 16] [--model claude-sonnet-5.5] [--concurrency 3] [--no-judge]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type Trial } from "./heatsink-judge-lib.js";
import { parseArtLog } from "./saiyan-snake-way-art-frames.js";

const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireFromRoot("sharp") as (input: Buffer) => { ensureAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }> } } };

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const KEY_FILE = process.env.PRISM_KEY_FILE ?? "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
const ENDPOINT = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";

/** Matched states: port capture name, reference file, label. The late reference frame is the original's hell run, which the port does not have. */
const STATES = [
  { name: "m-early", ref: "ref-2.jpg", look: "check-in" },
  { name: "m-mid", ref: "ref-3.jpg", look: "long-road" },
  { name: "m-sweep", ref: "ref-5.jpg", look: "ki-pickup" }
] as const;

export const PROMPT_INTRO = [
  "You are shown two screenshots of a browser 3D endless-runner game, labelled Image A and Image B.",
  "Both are taken at the same moment of the same run (same road position, same speed), at the same resolution, with the on-screen HUD visible.",
  "Exactly one of them is from the original, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
  "Judge what is visible: sky, clouds, road, lighting, the runner, effects, the camera and the HUD."
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
    const res = await fetch(`${ENDPOINT}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "saiyan-snake-way-judge", "X-Prism-Job-Type": "chat" },
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

async function main(): Promise<void> {
  const outDir = path.resolve(arg("--out") ?? "evidence/saiyan-snake-way-port");
  const refDir = path.resolve(arg("--refs") ?? "evidence/look-reference-frames/saiyan-snake-way");
  const seed = Number(arg("--seed") ?? 20261023);
  const passes = Number(arg("--passes") ?? 16);
  const model = arg("--model") ?? "claude-sonnet-5.5";
  const concurrency = Number(arg("--concurrency") ?? 3);
  const logs = process.argv.flatMap((a, i, all) => (a === "--port-log" ? [all[i + 1] as string] : []));
  const frames = new Map<string, Buffer>();
  for (const l of logs) for (const [k, v] of parseArtLog(fs.readFileSync(l, "utf8")).frames) frames.set(k, v);
  const tags = [...new Set([...frames.keys()].map((k) => k.split("/")[0] as string))];
  const originals = new Map(STATES.map((s) => [s.name, fs.readFileSync(path.join(refDir, s.ref))] as const));
  const lookOf = new Map(STATES.map((s, i) => [i, s.look] as const));
  const key = process.argv.includes("--no-judge") ? "" : fs.readFileSync(KEY_FILE, "utf8").trim();
  const result: Record<string, unknown> = {
    schema: "a3d-saiyan-snake-way-blind-judge/1", generatedAt: new Date().toISOString(), kind: "MODEL judgement, not a human one",
    judge: { via: `${ENDPOINT}/v1/messages (Kiro Prism)`, model, seed, passes, trialsPerTag: STATES.length * passes, order: "balanced A/B per pass, shuffled with a seeded mulberry32" },
    prompt: { intro: PROMPT_INTRO, question: PROMPT_QUESTION },
    note: "Original frames are 1280x720 screenshots with HUD; port frames are 1280x720 page screenshots with HUD at the same road distance (idle run at base speed, invulnerable). The original's late frame (hell run) has no port counterpart and is excluded.",
    tags: {} as Record<string, unknown>
  };
  fs.mkdirSync(path.join(outDir, "judge-frames"), { recursive: true });
  for (const tag of tags) {
    const ports = new Map(STATES.map((s) => [s.name, frames.get(`${tag}/${s.name}`)] as const));
    if ([...ports.values()].some((v) => !v)) { process.stderr.write(`tag ${tag}: missing port frames, skipped\n`); continue; }
    const metrics: Array<{ state: string; look: unknown } & ReturnType<typeof frameDistance>> = [];
    for (const [i, s] of STATES.entries()) {
      fs.writeFileSync(path.join(outDir, "judge-frames", `${tag}-${s.name}.jpg`), ports.get(s.name) as Buffer);
      const o = imageStats(await decode(originals.get(s.name) as Buffer));
      const p = imageStats(await decode(ports.get(s.name) as Buffer));
      metrics.push({ state: s.name, look: lookOf.get(i), ...frameDistance(o, p) });
    }
    const mean = (f: (m: (typeof metrics)[number]) => number): number => metrics.map(f).reduce((a, b) => a + b, 0) / metrics.length;
    let trials: Trial[] = [];
    if (key) {
      const plan = assignOrder(STATES.map((_, i) => i), passes, seed);
      const queue = [...plan];
      const worker = async (): Promise<void> => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const s = STATES[item.step] as (typeof STATES)[number];
          const orig = originals.get(s.name) as Buffer, port = ports.get(s.name) as Buffer;
          const [a, b] = item.originalIs === "A" ? [orig, port] : [port, orig];
          const trial: Trial = { step: item.step, pass: item.pass, look: s.look, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
          try {
            const j = extractJson(await callJudge(key, model, a, b));
            if (!j) throw new Error("unparseable reply");
            trial.picked = j.original === "A" || j.original === "B" ? j.original : null;
            trial.sameGame = typeof j.same_game === "boolean" ? j.same_game : null;
            trial.sameGameConfidence = typeof j.same_game_confidence === "number" ? j.same_game_confidence : null;
            trial.originalConfidence = typeof j.original_confidence === "number" ? j.original_confidence : null;
            trial.tells = Array.isArray(j.tells) ? j.tells.map(String).slice(0, 3) : [];
          } catch (e) { trial.error = String(e instanceof Error ? e.message : e).slice(0, 200); }
          trials.push(trial);
          process.stderr.write(`${tag} ${s.name} pass ${item.pass}: ${trial.picked ?? "error"} (original=${item.originalIs}) ${trial.error ?? ""}\n`);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
      trials = trials.sort((x, y) => x.pass - y.pass || x.step - y.step);
    }
    (result.tags as Record<string, unknown>)[tag] = {
      metrics: { perState: metrics, mean: { lumaJsd: mean((m) => m.lumaJsd), rgbJsd: mean((m) => m.rgbJsd), paletteDistance: mean((m) => m.paletteDistance), edgeDensityRatio: mean((m) => m.edgeDensityRatio), lumaMeanDelta: mean((m) => m.lumaMeanDelta) } },
      summary: trials.length ? summarize(trials) : null,
      trials
    };
  }
  fs.writeFileSync(path.join(outDir, "judge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(result.tags as Record<string, { metrics: { mean: unknown }; summary: unknown }>).map(([t, v]) => [t, { metrics: v.metrics.mean, summary: v.summary }])), null, 2)}\n`);
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
