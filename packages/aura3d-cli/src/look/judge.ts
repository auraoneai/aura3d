/**
 * PRD-13 T2.17 — `look judge` + `look rubric` command bodies.
 * Registered as C-39 commands from commands/prd13/index.ts.
 *
 * `look judge --validate <file>` validates a LookJudgement and reports the
 * per-category scores, weakest category and next-change hint.
 * `look judge --judge prism --shots <jpg,...|dir>` (GU47 WP-9 E-I) sends up to
 * 4 JPEG frames to the C-32 provider `judgeWithPrism`
 * (tools/quality-gate/src/judge-prism.ts) with a 12-category look prompt,
 * turns the GameJudgementRecord into a LookJudgement (judge "prism"),
 * validates it and writes it. The provider is imported from source, so the
 * path works where tools/ exists (a repo checkout, `tsx`); elsewhere it exits
 * 2 with `judge-unavailable`, never a fabricated score. The key comes only
 * from PRISM_API_KEY or the file named by PRISM_KEY_FILE and is never printed.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  AGENT_LOOK_CATEGORIES,
  GENRE_RECIPE_ROWS,
  LOOK_JUDGEMENT_SCHEMA,
  lookHintFor,
  validateLookJudgement,
  weakestLookCategory,
  type AgentLookCategory,
  type LookJudgement
} from "./rubric.js";
import type { AuraCliCommand } from "../contracts/commands.js";

/** The C-32 provider signature (`judgeWithPrism` in tools/quality-gate/src/judge-prism.ts:38). */
export type PrismJudgeFn = (
  packet: { readonly itemId: string; readonly images: readonly string[]; readonly prompt: string; readonly kind: "benchmark" | "game" },
  opts: { readonly baseUrl: string; readonly apiKeyEnv: "PRISM_API_KEY"; readonly model: "claude-opus-5.5" }
) => Promise<unknown>;

export interface LookJudgeDeps {
  /** Test seam: replaces the import of tools/quality-gate/src/judge-prism.ts (resolves undefined when absent). */
  readonly loadPrismJudge?: () => Promise<PrismJudgeFn | undefined>;
}

/** Prism model of the C-32 provider (PrismJudgeOptions.model). */
export const PRISM_LOOK_MODEL = "claude-opus-5.5" as const;
/** Prism accepts at most 4 images per turn (judge-prism.ts). */
export const PRISM_MAX_SHOTS = 4;

async function importPrismJudge(): Promise<PrismJudgeFn | undefined> {
  const { judgeWithPrism } = await import("../../../../tools/quality-gate/src/judge-prism.js");
  const fn: PrismJudgeFn = judgeWithPrism;
  return typeof fn === "function" ? fn : undefined;
}

/** The look-judge prompt: the 12 AGENT_LOOK_CATEGORIES, answered in the C-32 GameJudgementRecord shape plus observations. */
export function lookJudgePrompt(input: { readonly itemId: string; readonly subject: string; readonly genre?: string; readonly shots: number }): string {
  const recipe = input.genre ? GENRE_RECIPE_ROWS[input.genre] : undefined;
  return [
    `You are an art director and rendering engineer judging ${input.shots} screenshot${input.shots === 1 ? "" : "s"} of one browser 3D game (${input.subject}) against a ${AGENT_LOOK_CATEGORIES.length}-category look rubric.`,
    "Judge only what is visible in the frames. Score each category from 0 to 10 in 0.5 steps; omit a category the frames cannot show.",
    "Every score below 7 needs at least one observation for that category naming what you saw.",
    ...(recipe ? [`Genre ${input.genre}: the recipe expects look ${recipe.look}, ${recipe.camera}, subject ${recipe.subjectPercent}% of the frame, key ${recipe.keyLight}, palette ${recipe.palette}, atmosphere ${recipe.atmosphere}, post ${recipe.post}.`] : []),
    `Categories: ${AGENT_LOOK_CATEGORIES.join(", ")}`,
    "Respond with one JSON object and nothing else, exactly these keys:",
    `{ "itemId": ${JSON.stringify(input.itemId)}, "judge": { "id": "prism" }, "scores": { "<category>": <0-10> }, "observations": [{ "category": "<category>", "seen": "<what is visible>" }], "dominantCauses": [{ "cause": "<cause>", "percent": <0-100> }], "competitiveWithModernThree": <true if the frames hold up against current well-made browser 3D games>, "critique": "<at least 200 characters>" }`
  ].join("\n");
}

const snapHalf = (n: number): number => Math.min(10, Math.max(0, Math.round(n * 2) / 2));

/** Map the provider's GameJudgementRecord (plus the prompt's `observations`) onto a LookJudgement with judge "prism". */
export function lookJudgementFromPrism(
  record: unknown,
  input: { readonly round: number; readonly shots: readonly { readonly path: string; readonly sha256: string }[]; readonly references?: readonly string[] }
): LookJudgement {
  const r = (record ?? {}) as { scores?: Record<string, unknown>; observations?: unknown; critique?: unknown };
  const scores: Partial<Record<AgentLookCategory, number>> = {};
  for (const category of AGENT_LOOK_CATEGORIES) {
    const value = r.scores?.[category];
    if (typeof value === "number" && Number.isFinite(value)) scores[category] = snapHalf(value);
  }
  const observations: { category: string; seen: string }[] = [];
  if (Array.isArray(r.observations)) {
    for (const o of r.observations as { category?: unknown; seen?: unknown }[]) {
      if (typeof o?.category === "string" && typeof o.seen === "string" && o.seen.trim() && (AGENT_LOOK_CATEGORIES as readonly string[]).includes(o.category)) {
        observations.push({ category: o.category, seen: o.seen.trim() });
      }
    }
  }
  const critique = typeof r.critique === "string" ? r.critique.trim() : "";
  for (const [category, score] of Object.entries(scores)) {
    if (score < 7 && !observations.some((o) => o.category === category)) {
      observations.push({ category, seen: critique ? `critique: ${critique.slice(0, 240)}` : "scored below 7 by the prism judge without an observation" });
    }
  }
  const draft: LookJudgement = {
    schema: LOOK_JUDGEMENT_SCHEMA,
    round: input.round,
    shots: input.shots,
    references: input.references ?? [],
    scores,
    observations,
    nextChange: { category: "", change: "", api: "" },
    judge: "prism"
  };
  const weakest = weakestLookCategory(draft);
  const hint = weakest ? lookHintFor(weakest) : undefined;
  return { ...draft, nextChange: hint ? { category: hint.category, change: hint.change, api: hint.api } : draft.nextChange };
}

/** `--shots a.jpg,b.jpg` or a folder: JPEG files only (the provider labels every image image/jpeg). */
export function collectJudgeShots(spec: string, cwd: string): { readonly files: readonly string[]; readonly error?: string } {
  const files: string[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const path = resolve(cwd, part);
    if (!existsSync(path)) return { files, error: `shot not found: ${part}` };
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) if (/\.jpe?g$/i.test(name)) files.push(join(path, name));
    } else files.push(path);
  }
  if (files.length === 0) return { files, error: "no JPEG shots given (--shots <a.jpg,b.jpg,...|dir>)" };
  if (files.length > PRISM_MAX_SHOTS) return { files, error: `Prism takes at most ${PRISM_MAX_SHOTS} images per turn; got ${files.length}` };
  for (const file of files) {
    const head = readFileSync(file).subarray(0, 3);
    if (!/\.jpe?g$/i.test(extname(file)) || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
      return { files, error: `not a JPEG: ${relative(cwd, file) || file} (the prism judge sends image/jpeg only)` };
    }
  }
  return { files };
}

/** Run `fn` with PRISM_API_KEY present: from the env, else read from PRISM_KEY_FILE for the call only. Never printed. */
async function withPrismKey<T>(fn: (key: string) => Promise<T>): Promise<T> {
  const previous = process.env.PRISM_API_KEY;
  const fromFile = !previous?.trim() && process.env.PRISM_KEY_FILE ? readFileSync(process.env.PRISM_KEY_FILE, "utf8").trim() : "";
  const key = previous?.trim() || fromFile;
  if (!key) throw new KeyMissing();
  if (fromFile) process.env.PRISM_API_KEY = fromFile;
  try {
    return await fn(key);
  } finally {
    if (fromFile) {
      if (previous === undefined) delete process.env.PRISM_API_KEY;
      else process.env.PRISM_API_KEY = previous;
    }
  }
}

class KeyMissing extends Error {
  constructor() {
    super("set PRISM_API_KEY or PRISM_KEY_FILE (the key is read from the environment only and never printed)");
  }
}

function printJudgement(judgement: LookJudgement, io: { stdout(s: string): void }, asJson: boolean, header: string): void {
  const weakest = weakestLookCategory(judgement);
  const hint = weakest ? lookHintFor(weakest) : undefined;
  if (asJson) {
    io.stdout(JSON.stringify({
      ok: true,
      schema: LOOK_JUDGEMENT_SCHEMA,
      judge: judgement.judge,
      round: judgement.round,
      scores: judgement.scores,
      weakestCategory: weakest ?? null,
      hint: hint ?? null
    }, null, 2));
    return;
  }
  io.stdout(header);
  for (const category of AGENT_LOOK_CATEGORIES) {
    const score = judgement.scores[category];
    if (score !== undefined) io.stdout(`  ${category}: ${score}`);
  }
  if (weakest) {
    io.stdout(`weakest category: ${weakest}`);
    io.stdout(`next change: ${hint!.change}`);
    io.stdout(`api: ${hint!.api}`);
  }
}

interface ParsedArgs {
  readonly flags: ReadonlyMap<string, string>;
  readonly switches: ReadonlySet<string>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(arg.slice(2), next);
        i += 1;
      } else {
        switches.add(arg.slice(2));
      }
    }
  }
  return { flags, switches };
}

type JudgeIo = { readonly cwd: string; stdout(s: string): void; stderr(s: string): void };

async function runPrismLookJudge(flags: ReadonlyMap<string, string>, asJson: boolean, io: JudgeIo, deps: LookJudgeDeps): Promise<number> {
  const spec = flags.get("shots");
  if (!spec) {
    io.stderr(`look judge --judge prism requires --shots <a.jpg,b.jpg,...|dir> (at most ${PRISM_MAX_SHOTS} JPEG frames)`);
    return 2;
  }
  const round = Number(flags.get("round") ?? 1);
  if (!Number.isInteger(round) || round < 1) {
    io.stderr("--round must be an integer >= 1");
    return 2;
  }
  const genre = flags.get("genre");
  if (genre && !GENRE_RECIPE_ROWS[genre]) {
    io.stderr(`unknown genre "${genre}"; genres: ${Object.keys(GENRE_RECIPE_ROWS).join(", ")}`);
    return 2;
  }
  const { files, error } = collectJudgeShots(spec, io.cwd);
  if (error) {
    io.stderr(error);
    return 2;
  }
  let judgeFn: PrismJudgeFn | undefined;
  try {
    judgeFn = await (deps.loadPrismJudge ?? importPrismJudge)();
  } catch {
    judgeFn = undefined;
  }
  if (!judgeFn) {
    io.stderr("judge-unavailable: C-32 judgeWithPrism (tools/quality-gate/src/judge-prism.ts) cannot be loaded here; run the CLI from a repo checkout");
    return 2;
  }
  const images = files.map((file) => readFileSync(file));
  const shots = files.map((file, i) => ({ path: relative(io.cwd, file).split(sep).join("/") || file, sha256: createHash("sha256").update(images[i]!).digest("hex") }));
  const itemId = flags.get("item") ?? "look-judge";
  const prompt = lookJudgePrompt({ itemId, subject: flags.get("subject") ?? "a browser 3D game", genre, shots: files.length });
  let record: unknown;
  let key = "";
  try {
    record = await withPrismKey(async (k) => {
      key = k;
      return judgeFn!(
        { itemId, images: images.map((b) => b.toString("base64")), prompt, kind: "game" },
        { baseUrl: process.env.PRISM_BASE_URL ?? "https://prism.auraone.ai", apiKeyEnv: "PRISM_API_KEY", model: PRISM_LOOK_MODEL }
      );
    });
  } catch (e) {
    if (e instanceof KeyMissing) {
      io.stderr(`judge-unavailable: ${e.message}`);
      return 2;
    }
    const message = String(e instanceof Error ? e.message : e);
    io.stderr(`prism judge failed: ${(key ? message.split(key).join("[redacted]") : message).slice(0, 300)}`);
    return 1;
  }
  const references = (flags.get("references") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const judgement = lookJudgementFromPrism(record, { round, shots, references });
  const validation = validateLookJudgement(judgement);
  if (!validation.ok) {
    for (const problem of validation.errors) io.stderr(`invalid prism judgement: ${problem}`);
    return 1;
  }
  const out = resolve(io.cwd, flags.get("out") ?? "look-judgement.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(judgement, null, 2)}\n`);
  printJudgement(judgement, io, asJson, `prism judgement ${LOOK_JUDGEMENT_SCHEMA} round ${round} (${PRISM_LOOK_MODEL}, ${files.length} shot${files.length === 1 ? "" : "s"}), wrote ${relative(io.cwd, out) || out}`);
  return 0;
}

export async function runLookJudge(argv: readonly string[], io: JudgeIo, deps: LookJudgeDeps = {}): Promise<number> {
  const { flags, switches } = parseArgs(argv);
  const judge = flags.get("judge") ?? "self";
  const asJson = switches.has("json");

  if (judge === "prism" && !flags.has("validate")) return runPrismLookJudge(flags, asJson, io, deps);
  if (judge !== "self" && judge !== "prism") {
    io.stderr(`unknown judge "${judge}" (self or prism)`);
    return 2;
  }

  const validatePath = flags.get("validate");
  if (!validatePath) {
    io.stderr("look judge requires --validate <look-judgement.json>");
    return 2;
  }
  const file = resolve(io.cwd, validatePath);
  if (!existsSync(file)) {
    io.stderr(`judgement file not found: ${file}`);
    return 2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    io.stderr(`judgement file is not valid JSON: ${file}`);
    return 2;
  }
  const validation = validateLookJudgement(parsed);
  if (!validation.ok) {
    for (const error of validation.errors) io.stderr(`invalid judgement: ${error}`);
    return 1;
  }
  const judgement = parsed as LookJudgement;
  printJudgement(judgement, io, asJson, `judgement ${LOOK_JUDGEMENT_SCHEMA} round ${judgement.round} (${judgement.judge}) is valid`);
  return 0;
}

export function runLookRubric(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): number {
  const { flags, switches } = parseArgs(argv);
  const genre = flags.get("genre");
  const asJson = switches.has("json");
  const rubric = {
    schema: "aura3d.look-rubric/1",
    categories: AGENT_LOOK_CATEGORIES,
    judgementSchema: LOOK_JUDGEMENT_SCHEMA,
    genre: genre ?? null,
    recipe: genre ? GENRE_RECIPE_ROWS[genre] ?? null : null,
    genres: Object.keys(GENRE_RECIPE_ROWS)
  };
  if (genre && !rubric.recipe) {
    io.stderr(`unknown genre "${genre}"; genres: ${rubric.genres.join(", ")}`);
    return 2;
  }
  if (asJson) {
    io.stdout(JSON.stringify(rubric, null, 2));
    return 0;
  }
  io.stdout("Agent look rubric (subset of the C-32 visual categories):");
  for (const category of AGENT_LOOK_CATEGORIES) io.stdout(`  - ${category}`);
  io.stdout(`judgement schema: ${LOOK_JUDGEMENT_SCHEMA} (scores 0–10 in 0.5 steps; N/A omitted; >= 1 observation per score < 7)`);
  if (genre && rubric.recipe) {
    const row = rubric.recipe;
    io.stdout(`genre ${genre}: look ${row.look} · ${row.camera} · subject ${row.subjectPercent}% · key ${row.keyLight} · palette ${row.palette} · atmosphere ${row.atmosphere} · post ${row.post}`);
  }
  return 0;
}

export const lookJudgeCommand: AuraCliCommand = {
  name: "look judge",
  owner: "prd13",
  summary: "Validate a LookJudgement, print scores, weakest category and next-change hint",
  usage: "aura3d look judge --validate <look-judgement.json> [--json] | aura3d look judge --judge prism --shots <a.jpg,b.jpg,...|dir> [--round 1] [--genre <genre>] [--item <id>] [--subject <text>] [--references <id,...>] [--out look-judgement.json] [--json]",
  run: (argv, io) => runLookJudge(argv, io)
};

export const lookRubricCommand: AuraCliCommand = {
  name: "look rubric",
  owner: "prd13",
  summary: "Print the agent look rubric and (with --genre) the genre recipe row",
  usage: "aura3d look rubric [--genre platformer|racing|...] [--json]",
  run: async (argv, io) => runLookRubric(argv, io)
};
