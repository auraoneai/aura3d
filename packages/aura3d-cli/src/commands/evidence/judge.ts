/**
 * `aura3d evidence judge`: blind A/B "same game?" judgement of two folders of matched frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. `--a` holds the reference frames, `--b` the candidate frames, matched by file
 * name. For every trial the reference is shown as image A or B in a seeded, balanced order; a vision-capable model reached
 * through Kiro Prism (`/v1/messages`, never a provider SDK) says whether the two are the same game and which one is the
 * reference. The key comes from `PRISM_KEY_FILE` (or `PRISM_API_KEY`) at run time and is never printed or written.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { assignOrder, extractJson, frameDistance, imageStats, summarize, type FrameDistance, type Rgba, type Trial } from "./judgeLib.js";

export const JUDGE_USAGE =
  "aura3d evidence judge --a <ref-frames-dir> --b <candidate-frames-dir> [--trials 48] [--seed 20261023] [--out dir] [--model claude-sonnet-5.5] [--concurrency 3] [--subject \"a browser 3D game\"] [--no-judge] [--json]";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

export function promptIntro(subject: string): string {
  return [
    `You are shown two screenshots of ${subject}, labelled Image A and Image B.`,
    "Both are taken at the same moment of the same recorded run, with any on-screen HUD hidden.",
    "Exactly one of them is from the reference, shipped game; the other is from an independent re-implementation that tries to reproduce it.",
    "Judge only what is visible in the 3D scene: sky, ground, scenery, lighting, glow, characters or vehicles and the camera."
  ].join(" ");
}

export const PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if a player would take both for the same game with the same art direction, false otherwise;',
  '"same_game_confidence": a number from 0 to 1;',
  '"original": "A" or "B", whichever you believe is the reference shipped game (you must choose one);',
  '"original_confidence": a number from 0.5 to 1;',
  '"tells": up to three short phrases naming the visible differences that drove your choice.'
].join(" ");

export function listFrames(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir).sort()) {
    if (IMAGE_EXT.has(extname(name).toLowerCase())) out.set(basename(name, extname(name)), join(dir, name));
  }
  return out;
}

type Sharp = (input: Buffer) => { ensureAlpha: () => { raw: () => { toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number } }> } } };

async function loadSharp(): Promise<Sharp | null> {
  try {
    const name = "sharp";
    const mod = (await import(name)) as { default?: Sharp };
    return mod.default ?? (mod as unknown as Sharp);
  } catch {
    return null;
  }
}

async function callJudge(endpoint: string, key: string, model: string, subject: string, a: { data: Buffer; mime: string }, b: { data: Buffer; mime: string }): Promise<string> {
  const body = {
    model,
    max_tokens: 700,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: promptIntro(subject) },
        { type: "text", text: "Image A:" },
        { type: "image", source: { type: "base64", media_type: a.mime, data: a.data.toString("base64") } },
        { type: "text", text: "Image B:" },
        { type: "image", source: { type: "base64", media_type: b.mime, data: b.data.toString("base64") } },
        { type: "text", text: PROMPT_QUESTION }
      ]
    }],
    stream: false
  };
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${endpoint}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "X-Prism-Client": "aura3d-evidence-judge", "X-Prism-Job-Type": "chat" },
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

function readKey(): string {
  const file = process.env.PRISM_KEY_FILE;
  const key = file ? readFileSync(file, "utf8").trim() : process.env.PRISM_API_KEY?.trim();
  if (!key) throw new Error("Set PRISM_KEY_FILE (path to the Kiro Prism key file) or PRISM_API_KEY; the key is never printed or stored.");
  return key;
}

export async function runJudge(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number> {
  const aDir = flag(argv, "--a");
  const bDir = flag(argv, "--b");
  if (!aDir || !bDir) {
    io.stderr(`Usage: ${JUDGE_USAGE}`);
    return 2;
  }
  const trialCount = Number(flag(argv, "--trials") ?? 48);
  const seed = Number(flag(argv, "--seed") ?? 20261023);
  const model = flag(argv, "--model") ?? "claude-sonnet-5.5";
  const concurrency = Math.max(1, Number(flag(argv, "--concurrency") ?? 3));
  const subject = flag(argv, "--subject") ?? "a browser 3D game";
  const endpoint = process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai";
  const outDir = resolve(io.cwd, flag(argv, "--out") ?? "evidence/judge");
  if (!Number.isInteger(trialCount) || trialCount < 1 || !Number.isInteger(seed)) {
    io.stderr("--trials must be a positive integer and --seed an integer.");
    return 2;
  }

  const as = listFrames(resolve(io.cwd, aDir));
  const bs = listFrames(resolve(io.cwd, bDir));
  const names = [...as.keys()].filter((n) => bs.has(n));
  if (!names.length) {
    io.stderr("No frame name exists in both --a and --b (matching is by file name without extension).");
    return 2;
  }
  const file = (map: Map<string, string>, n: string): { data: Buffer; mime: string } => {
    const path = map.get(n) as string;
    return { data: readFileSync(path), mime: MIME[extname(path).toLowerCase()] as string };
  };

  const sharp = await loadSharp();
  const metrics: ({ frame: string } & FrameDistance)[] = [];
  if (sharp) {
    const decode = async (buf: Buffer): Promise<Rgba> => {
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, data };
    };
    for (const n of names) metrics.push({ frame: n, ...frameDistance(imageStats(await decode(file(as, n).data)), imageStats(await decode(file(bs, n).data))) });
  } else {
    io.stderr("sharp is not installed: skipping pixel metrics (the model judgement still runs).");
  }

  const passes = Math.ceil(trialCount / names.length);
  const plan = assignOrder(names.map((_, i) => i), passes, seed).slice(0, trialCount);
  let trials: Trial[] = [];
  if (!argv.includes("--no-judge")) {
    const key = readKey();
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const name = names[item.step] as string;
        const ref = file(as, name);
        const cand = file(bs, name);
        const [x, y] = item.originalIs === "A" ? [ref, cand] : [cand, ref];
        const trial: Trial = { step: item.step, pass: item.pass, look: name, originalIs: item.originalIs, picked: null, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] };
        try {
          const j = extractJson(await callJudge(endpoint, key, model, subject, x, y));
          if (!j) throw new Error("unparseable model reply");
          trial.picked = j.original === "A" || j.original === "B" ? j.original : null;
          trial.sameGame = typeof j.same_game === "boolean" ? j.same_game : null;
          trial.sameGameConfidence = typeof j.same_game_confidence === "number" ? j.same_game_confidence : null;
          trial.originalConfidence = typeof j.original_confidence === "number" ? j.original_confidence : null;
          trial.tells = Array.isArray(j.tells) ? j.tells.map(String).slice(0, 3) : [];
        } catch (e) {
          trial.error = String(e instanceof Error ? e.message : e).slice(0, 200);
        }
        trials.push(trial);
        io.stderr(`model judge ${name} pass ${item.pass}: ${trial.picked ?? "error"} (reference=${item.originalIs}) ${trial.error ?? ""}`.trimEnd());
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    trials = trials.sort((p, q) => p.pass - q.pass || p.step - q.step);
  }

  const summary = trials.length ? summarize(trials) : null;
  const result = {
    schema: "a3d-evidence-judge/1",
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: { via: `${endpoint}/v1/messages (Kiro Prism)`, model, seed, trials: plan.length, order: "balanced A/B per pass, shuffled with a seeded mulberry32", frames: names },
    prompt: { intro: promptIntro(subject), question: PROMPT_QUESTION },
    metrics,
    summary,
    trials
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "judge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (argv.includes("--json")) io.stdout(JSON.stringify(result, null, 2));
  else if (summary) {
    io.stdout(`model judge (not a human): picked the reference in ${summary.correct} of ${summary.valid} valid trials (${(summary.accuracy * 100).toFixed(0)}%, 95% CI ${(summary.ci95[0] * 100).toFixed(0)}-${(summary.ci95[1] * 100).toFixed(0)}%, p=${summary.pValueVsChance.toFixed(4)} vs chance); rated ${summary.sameGameYes} as the same game; ${summary.distinguishable ? "distinguishable" : "not distinguishable"} at the 70% threshold`);
    io.stdout(`wrote ${join(outDir, "judge-results.json")}`);
  } else io.stdout(`model judge skipped (--no-judge): ${names.length} matched frames, wrote ${join(outDir, "judge-results.json")}`);
  return 0;
}
