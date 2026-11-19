/**
 * Monorepo-only CLI verbs (5.6.0 A6).
 *
 * A few verbs delegate to code that lives in the Aura3D repository's `tools/`
 * tree (or its GitHub workflows), which the npm package does not ship. They
 * used to fail deep inside with a module-not-found or a half-run. Each rule
 * here names the repo path the verb needs; `cli.ts` checks the rule before it
 * runs the verb and prints ONE message, the help output marks the verb
 * `(monorepo)`, and the verbs themselves reuse {@link monorepoOnlyMessage}.
 *
 * Where a path is looked up:
 * - `cli`: relative to this CLI's own install (the verb imports the tool
 *   through a relative module path, so only a CLI running from a repo checkout
 *   can reach it);
 * - `cwd`: the current directory or any parent (the verb resolves the tool
 *   from the project/repo you run it in);
 * - `cwd-exact`: the current directory only (the verb treats cwd as the repo root).
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AURA3D_REPO_URL = "https://github.com/auraoneai/aura3d";

export interface MonorepoOnlyRule {
  /** Registered or built-in command name (`"perf gate"`, `"codemod"`). */
  readonly command: string;
  /** Which invocation is monorepo-only, shown in help (`"<id…> mode"`). Omitted = the whole verb. */
  readonly mode?: string;
  /** Repo-relative path the verb needs. */
  readonly needs: string;
  readonly base: "cli" | "cwd" | "cwd-exact";
  /** What works from an npm install instead, if anything. */
  readonly alternative?: string;
  /** argv after the command words; true when this invocation needs the repo. */
  applies(argv: readonly string[]): boolean;
}

function flagValue(argv: readonly string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === name) return argv[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

const hasFlag = (argv: readonly string[], name: string): boolean => argv.some((arg) => arg === name || arg.startsWith(`${name}=`));

export const MONOREPO_ONLY_RULES: readonly MonorepoOnlyRule[] = [
  {
    command: "assets bake-impostor",
    needs: "tools/impostor-bake/index.js",
    base: "cli",
    applies: () => true
  },
  {
    command: "assets lookdev",
    needs: ".github/workflows/asset-lookdev.yml",
    base: "cwd",
    alternative: "capture look-dev shots in your own project with `aura3d look capture`",
    applies: () => true
  },
  {
    command: "assets optimize",
    mode: "<id…> mode",
    needs: "tools/asset-optimize/index.ts",
    base: "cwd-exact",
    alternative: "`aura3d assets optimize --file in.glb --out out.glb` works anywhere",
    applies: (argv) => !hasFlag(argv, "--file")
  },
  {
    command: "look judge",
    mode: "--judge prism",
    needs: "tools/quality-gate/src/judge-prism.ts",
    base: "cli",
    alternative: "`aura3d look judge --validate <judgement.json>` works anywhere",
    applies: (argv) => flagValue(argv, "--judge") === "prism"
  },
  {
    command: "perf gate",
    needs: "tools/perf-gate/index.mjs",
    base: "cwd",
    alternative: "pass --gate <path/to/perf-gate/index.mjs> if you have the gate script",
    applies: (argv) => !hasFlag(argv, "--gate")
  },
  {
    command: "codemod",
    mode: "pin-emissive-defaults",
    needs: "tools/codemods/pin-emissive-defaults.mjs",
    base: "cli",
    applies: (argv) => argv[0] === "pin-emissive-defaults"
  },
  {
    command: "codemod",
    mode: "animation-3.1",
    needs: "tools/codemods/animation-3.1.mjs",
    base: "cli",
    applies: (argv) => argv[0] === "animation-3.1"
  }
];

/** Monorepo-only codemod names (shown as `(monorepo)` in `help --json` codemods). */
export const MONOREPO_ONLY_CODEMODS: ReadonlySet<string> = new Set(
  MONOREPO_ONLY_RULES.filter((rule) => rule.command === "codemod" && rule.mode).map((rule) => rule.mode!)
);

/** The repository root this CLI module would sit in when run from a checkout (`packages/aura3d-cli/{src,dist}/` → repo). */
export function cliCheckoutRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

/** Walks up from `start` and returns the first ancestor (inclusive) containing `relPath`. */
export function findUp(start: string, relPath: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, relPath))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** True when the rule's required repo path is reachable from here. `cliRoot` is a test seam. */
export function monorepoRuleSatisfied(rule: MonorepoOnlyRule, cwd: string, cliRoot: string = cliCheckoutRoot()): boolean {
  if (rule.base === "cli") return existsSync(join(cliRoot, rule.needs));
  if (rule.base === "cwd-exact") return existsSync(join(resolve(cwd), rule.needs));
  return findUp(cwd, rule.needs) !== undefined;
}

/** One clear message: what is monorepo-only, what it needs, and what to do instead. */
export function monorepoOnlyMessage(command: string, needs: string, options: { readonly mode?: string; readonly alternative?: string; readonly base?: MonorepoOnlyRule["base"] } = {}): string {
  const subject = options.mode && options.mode !== command ? `aura3d ${command} ${options.mode.startsWith("--") || options.mode.startsWith("<") ? options.mode : `(${options.mode})`}` : `aura3d ${command}`;
  const where = options.base === "cli"
    ? "Run the CLI from an Aura3D repository checkout (pnpm exec tsx packages/aura3d-cli/src/cli.ts …)"
    : options.base === "cwd-exact"
      ? "Run it from the root of an Aura3D repository checkout"
      : "Run it inside an Aura3D repository checkout";
  return `${subject} is monorepo-only: it needs ${needs} from the Aura3D repository (${AURA3D_REPO_URL}), which the npm package does not ship. ${where}${options.alternative ? `, or ${options.alternative}` : ""}.`;
}

/** The first rule that applies to this invocation and is not satisfied here, if any. */
export function unmetMonorepoRule(command: string, argv: readonly string[], cwd: string, cliRoot?: string): MonorepoOnlyRule | undefined {
  return MONOREPO_ONLY_RULES.find((rule) => rule.command === command && rule.applies(argv) && !monorepoRuleSatisfied(rule, cwd, cliRoot));
}

/** Help annotation for a command: undefined when no part of it is monorepo-only. */
export function monorepoNote(command: string): string | undefined {
  const rules = MONOREPO_ONLY_RULES.filter((rule) => rule.command === command);
  if (rules.length === 0) return undefined;
  if (rules.some((rule) => !rule.mode)) return `monorepo-only: needs ${rules.map((rule) => rule.needs).join(", ")} from an Aura3D repository checkout`;
  return `monorepo-only for ${rules.map((rule) => rule.mode).join(", ")}: needs ${rules.map((rule) => rule.needs).join(", ")} from an Aura3D repository checkout`;
}

/** True when every invocation of the command is monorepo-only (help appends `(monorepo)` to the summary). */
export function isWholeCommandMonorepoOnly(command: string): boolean {
  return MONOREPO_ONLY_RULES.some((rule) => rule.command === command && !rule.mode);
}
