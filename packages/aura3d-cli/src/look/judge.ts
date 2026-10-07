/**
 * PRD-13 T2.17 — `look judge` + `look rubric` command bodies.
 * Registered as C-39 commands from commands/prd13/index.ts.
 *
 * `look judge --validate <file>` validates a LookJudgement and reports the
 * per-category scores, weakest category and next-change hint.
 * `--judge prism` delegates to C-32 judgeWithPrism when the provider ships it;
 * while the export is absent the command exits 2 with `judge-unavailable`
 * rather than fabricating a score (no new provider code here).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_LOOK_CATEGORIES,
  GENRE_RECIPE_ROWS,
  LOOK_JUDGEMENT_SCHEMA,
  lookHintFor,
  validateLookJudgement,
  weakestLookCategory,
  type LookJudgement
} from "./rubric.js";
import type { AuraCliCommand } from "../contracts/commands.js";

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

export async function runLookJudge(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number> {
  const { flags, switches } = parseArgs(argv);
  const judge = flags.get("judge") ?? "self";
  const asJson = switches.has("json");

  if (judge === "prism") {
    // C-32 provider slot: tools/quality-gate exports judgeWithPrism when PRD 12
    // lands the provider. Absent → exit 2 `judge-unavailable` (spec'd behaviour).
    try {
      const mod = (await import("../../../../tools/quality-gate/src/types.js")) as { judgeWithPrism?: unknown };
      if (typeof mod.judgeWithPrism !== "function") {
        io.stderr("judge-unavailable: C-32 judgeWithPrism is not exported by tools/quality-gate yet");
        return 2;
      }
      // Provider path for when PRD 12 lands: delegate and pass through.
      const result = await (mod.judgeWithPrism as (args: { argv: readonly string[]; cwd: string }) => Promise<unknown>)({ argv, cwd: io.cwd });
      io.stdout(asJson ? JSON.stringify(result, null, 2) : String(result));
      return 0;
    } catch {
      io.stderr("judge-unavailable: C-32 judgeWithPrism is not exported by tools/quality-gate yet");
      return 2;
    }
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
    return 0;
  }
  io.stdout(`judgement ${LOOK_JUDGEMENT_SCHEMA} round ${judgement.round} (${judgement.judge}) is valid`);
  for (const category of AGENT_LOOK_CATEGORIES) {
    const score = judgement.scores[category];
    if (score !== undefined) io.stdout(`  ${category}: ${score}`);
  }
  if (weakest) {
    io.stdout(`weakest category: ${weakest}`);
    io.stdout(`next change: ${hint!.change}`);
    io.stdout(`api: ${hint!.api}`);
  }
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
  usage: "aura3d look judge --validate <look-judgement.json> [--judge self|prism] [--json]",
  run: (argv, io) => runLookJudge(argv, io)
};

export const lookRubricCommand: AuraCliCommand = {
  name: "look rubric",
  owner: "prd13",
  summary: "Print the agent look rubric and (with --genre) the genre recipe row",
  usage: "aura3d look rubric [--genre platformer|racing|...] [--json]",
  run: async (argv, io) => runLookRubric(argv, io)
};
