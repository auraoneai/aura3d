/**
 * `aura3d evidence judge`: blind A/B "same game?" judgement of two folders of matched frames.
 *
 * THIS IS A MODEL JUDGEMENT, NOT A HUMAN ONE. `--a` holds the reference frames, `--b` the candidate frames, matched by file
 * name. For every trial the reference is shown as image A or B in a seeded, balanced order; a vision-capable model reached
 * through Kiro Prism (`/v1/messages`, never a provider SDK) says whether the two are the same game and which one is the
 * reference. The key comes from `PRISM_KEY_FILE` (or `PRISM_API_KEY`) at run time and is never printed or written.
 *
 * `--mode sibling` (GU47 WP-9 E-I) asks a different question of two DIFFERENT games: "are these two frames from the same
 * game?". `--a` holds this game's frames, `--b` a genre neighbour's; frames are paired by a seeded shuffle of every (a, b)
 * combination (not by name), this game's frame shows as Image A in half the trials of each pass, and the result carries
 * `same_game` / `same_game_confidence` (majority answer and the mean confidence of the trials that gave it). The PRD
 * acceptance is `same_game: false` at `same_game_confidence >= 0.8`.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { assignOrder, extractJson, frameDistance, imageStats, seededRng, summarize, wilson, type FrameDistance, type Rgba, type Trial } from "./judgeLib.js";

export const JUDGE_USAGE =
  "aura3d evidence judge --a <ref-frames-dir> --b <candidate-frames-dir> [--mode reference|sibling] [--trials 48] [--seed 20261023] [--out dir] [--model claude-sonnet-5.5] [--concurrency 3] [--subject \"a browser 3D game\"] [--no-judge] [--json]";

export type JudgeMode = "reference" | "sibling";

/** Sibling acceptance (PRD §7.2): `same_game: false` with `same_game_confidence` at or above this. */
export const SIBLING_CONFIDENCE_THRESHOLD = 0.8;

export function siblingPromptIntro(subject: string): string {
  return [
    `You are shown two screenshots, labelled Image A and Image B; each is from ${subject}.`,
    "They may come from the same game or from two different games made with the same engine, with any on-screen HUD hidden or kept.",
    "Judge only what is visible: sky, ground, scenery, lighting, palette, glow, materials, characters or vehicles, camera and HUD style.",
    "Question: are these two frames from the same game?"
  ].join(" ");
}

export const SIBLING_PROMPT_QUESTION = [
  "Answer with one JSON object and nothing else, with these keys:",
  '"same_game": true if both frames come from the same game, false if they come from two different games;',
  '"same_game_confidence": a number from 0 to 1, how sure you are of your same_game answer;',
  '"tells": up to three short phrases naming the visible cues that drove your answer.'
].join(" ");

export interface SiblingPair { readonly step: number; readonly pass: number; readonly a: string; readonly b: string; readonly gameIs: "A" | "B" }

/** Seeded pairing for sibling mode: every (a, b) combination once per pass in shuffled order, this game's frame shown as
 *  Image A in half of each pass (balanced, shuffled), repeated with a new shuffle until `trials` pairs exist. */
export function siblingPlan(aNames: readonly string[], bNames: readonly string[], trials: number, seed: number): SiblingPair[] {
  const combos = aNames.flatMap((a) => bNames.map((b) => [a, b] as const));
  const out: SiblingPair[] = [];
  for (let pass = 0; combos.length > 0 && out.length < trials; pass++) {
    const rng = seededRng(seed + pass * 7919);
    const order = combos.map((_, i) => i);
    const labels: ("A" | "B")[] = combos.map((_, i) => (i % 2 === 0 ? "A" : "B"));
    for (const list of [order, labels] as unknown[][]) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    for (let i = 0; i < order.length && out.length < trials; i++) {
      const [a, b] = combos[order[i]!]!;
      out.push({ step: out.length, pass, a, b, gameIs: labels[i]! });
    }
  }
  return out;
}

export interface SiblingTrial { step: number; pass: number; a: string; b: string; gameIs: "A" | "B"; sameGame: boolean | null; sameGameConfidence: number | null; tells: string[]; error?: string }

export interface SiblingSummary {
  readonly trials: number;
  readonly valid: number;
  readonly differentGame: number;
  readonly sameGameYes: number;
  readonly differentRate: number;
  readonly ci95: [number, number];
  /** Trials answered `same_game: false` with confidence >= SIBLING_CONFIDENCE_THRESHOLD. */
  readonly confidentDifferent: number;
  readonly confidentDifferentRate: number;
  /** Majority answer over the valid trials (a tie counts as the same game, the failing side). */
  readonly same_game: boolean | null;
  /** Mean confidence of the trials that gave the majority answer. */
  readonly same_game_confidence: number | null;
  readonly passes: boolean;
}

export function summarizeSibling(trials: readonly SiblingTrial[]): SiblingSummary {
  const valid = trials.filter((t) => t.sameGame !== null);
  const different = valid.filter((t) => t.sameGame === false);
  const confident = different.filter((t) => (t.sameGameConfidence ?? 0) >= SIBLING_CONFIDENCE_THRESHOLD).length;
  const sameGame = valid.length ? different.length * 2 <= valid.length : null;
  const majority = sameGame === null ? [] : valid.filter((t) => t.sameGame === sameGame);
  const confidences = majority.map((t) => t.sameGameConfidence).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const meanConfidence = confidences.length ? Math.round((confidences.reduce((s, c) => s + c, 0) / confidences.length) * 1000) / 1000 : null;
  return {
    trials: trials.length,
    valid: valid.length,
    differentGame: different.length,
    sameGameYes: valid.length - different.length,
    differentRate: valid.length ? different.length / valid.length : NaN,
    ci95: wilson(different.length, valid.length),
    confidentDifferent: confident,
    confidentDifferentRate: valid.length ? confident / valid.length : NaN,
    same_game: sameGame,
    same_game_confidence: meanConfidence,
    passes: sameGame === false && meanConfidence !== null && meanConfidence >= SIBLING_CONFIDENCE_THRESHOLD
  };
}

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

async function callJudge(endpoint: string, key: string, model: string, prompt: { intro: string; question: string }, a: { data: Buffer; mime: string }, b: { data: Buffer; mime: string }): Promise<string> {
  const body = {
    model,
    max_tokens: 700,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt.intro },
        { type: "text", text: "Image A:" },
        { type: "image", source: { type: "base64", media_type: a.mime, data: a.data.toString("base64") } },
        { type: "text", text: "Image B:" },
        { type: "image", source: { type: "base64", media_type: b.mime, data: b.data.toString("base64") } },
        { type: "text", text: prompt.question }
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
  const mode = (flag(argv, "--mode") ?? "reference") as JudgeMode;
  if (mode !== "reference" && mode !== "sibling") {
    io.stderr(`--mode must be reference or sibling (got ${mode}).`);
    return 2;
  }
  if (mode === "sibling") {
    return runSiblingJudge({ argv, io, aDir, bDir, trialCount, seed, model, concurrency, subject, endpoint, outDir });
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
          const j = extractJson(await callJudge(endpoint, key, model, { intro: promptIntro(subject), question: PROMPT_QUESTION }, x, y));
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

interface SiblingRun {
  readonly argv: readonly string[];
  readonly io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void };
  readonly aDir: string;
  readonly bDir: string;
  readonly trialCount: number;
  readonly seed: number;
  readonly model: string;
  readonly concurrency: number;
  readonly subject: string;
  readonly endpoint: string;
  readonly outDir: string;
}

async function runSiblingJudge(run: SiblingRun): Promise<number> {
  const { argv, io, trialCount, seed, model, concurrency, subject, endpoint, outDir } = run;
  const as = listFrames(resolve(io.cwd, run.aDir));
  const bs = listFrames(resolve(io.cwd, run.bDir));
  if (!as.size || !bs.size) {
    io.stderr("Sibling mode needs at least one frame in --a (this game) and one in --b (the neighbour); frames are paired by a seeded shuffle, not by name.");
    return 2;
  }
  const file = (map: Map<string, string>, n: string): { data: Buffer; mime: string } => {
    const path = map.get(n) as string;
    return { data: readFileSync(path), mime: MIME[extname(path).toLowerCase()] as string };
  };
  const plan = siblingPlan([...as.keys()], [...bs.keys()], trialCount, seed);
  const prompt = { intro: siblingPromptIntro(subject), question: SIBLING_PROMPT_QUESTION };
  let trials: SiblingTrial[] = [];
  if (!argv.includes("--no-judge")) {
    const key = readKey();
    const queue = [...plan];
    const worker = async (): Promise<void> => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const game = file(as, item.a);
        const neighbour = file(bs, item.b);
        const [x, y] = item.gameIs === "A" ? [game, neighbour] : [neighbour, game];
        const trial: SiblingTrial = { step: item.step, pass: item.pass, a: item.a, b: item.b, gameIs: item.gameIs, sameGame: null, sameGameConfidence: null, tells: [] };
        try {
          const j = extractJson(await callJudge(endpoint, key, model, prompt, x, y));
          if (!j) throw new Error("unparseable model reply");
          trial.sameGame = typeof j.same_game === "boolean" ? j.same_game : null;
          trial.sameGameConfidence = typeof j.same_game_confidence === "number" ? Math.min(1, Math.max(0, j.same_game_confidence)) : null;
          trial.tells = Array.isArray(j.tells) ? j.tells.map(String).slice(0, 3) : [];
        } catch (e) {
          trial.error = String(e instanceof Error ? e.message : e).slice(0, 200);
        }
        trials.push(trial);
        io.stderr(`model judge sibling ${item.a} vs ${item.b} pass ${item.pass}: ${trial.sameGame === null ? "error" : trial.sameGame ? "same game" : "different games"} ${trial.error ?? ""}`.trimEnd());
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    trials = trials.sort((p, q) => p.step - q.step);
  }

  const summary = trials.length ? summarizeSibling(trials) : null;
  const result = {
    schema: "a3d-evidence-judge/1",
    mode: "sibling",
    generatedAt: new Date().toISOString(),
    kind: "MODEL judgement, not a human one",
    judge: {
      via: `${endpoint}/v1/messages (Kiro Prism)`, model, seed, trials: plan.length,
      order: "every (a, b) pair once per pass, shuffled with a seeded mulberry32; this game's frame as Image A in half of each pass",
      framesA: [...as.keys()], framesB: [...bs.keys()]
    },
    prompt,
    acceptance: { same_game: false, same_game_confidence_min: SIBLING_CONFIDENCE_THRESHOLD },
    same_game: summary?.same_game ?? null,
    same_game_confidence: summary?.same_game_confidence ?? null,
    summary,
    plan: trials.length ? undefined : plan,
    trials
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "judge-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  if (argv.includes("--json")) io.stdout(JSON.stringify(result, null, 2));
  else if (summary) {
    const pct = (x: number): string => (x * 100).toFixed(0);
    io.stdout(`model judge (not a human), sibling mode: different games in ${summary.differentGame} of ${summary.valid} valid trials (${pct(summary.differentRate)}%, 95% CI ${pct(summary.ci95[0])}-${pct(summary.ci95[1])}%; ${summary.confidentDifferent} at confidence >= ${SIBLING_CONFIDENCE_THRESHOLD}); same_game=${String(summary.same_game)} same_game_confidence=${summary.same_game_confidence ?? "n/a"}: ${summary.passes ? "pass" : "fail"} (needs same_game false at >= ${SIBLING_CONFIDENCE_THRESHOLD})`);
    io.stdout(`wrote ${join(outDir, "judge-results.json")}`);
  } else io.stdout(`model judge skipped (--no-judge): sibling plan of ${plan.length} pairs over ${as.size} x ${bs.size} frames, wrote ${join(outDir, "judge-results.json")}`);
  return 0;
}
