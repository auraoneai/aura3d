/**
 * C-39 — CLI command and codemod registry (CONTRACTS.md). Provider: PRD 15.
 * PR 0 delivers this real; `cli.ts` dispatch falls through to the registry (PR 0b).
 * Lanes put commands in `packages/aura3d-cli/src/commands/prdNN/*.ts` and register
 * them from `packages/aura3d-cli/src/commands/prdNN/index.ts`.
 */

export interface AuraCliCommand { readonly name: string /* "assets optimize", "look capture", "migrate lighting" */; readonly owner: string /* "prd05" */; readonly summary: string; readonly usage: string; run(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number>; }

const cliCommands = new Map<string, AuraCliCommand>();

export function registerCliCommand(cmd: AuraCliCommand): void {                 // duplicate name throws
  if (cliCommands.has(cmd.name)) throw new Error(`CLI_COMMAND_DUPLICATE:${cmd.name}`);
  cliCommands.set(cmd.name, cmd);
}

export function cliCommandFor(name: string): AuraCliCommand | undefined {
  return cliCommands.get(name);
}

export function cliCommandNames(): readonly string[] {
  return [...cliCommands.keys()].sort();
}

export interface AuraCodemod { readonly name: string; readonly owner: string; readonly description: string; transform(source: string, fileName: string): { readonly code: string; readonly rows: readonly { readonly file: string; readonly line: number; readonly construct: string; readonly mapping: "exact" | "approximate" | "none"; readonly target?: string; readonly note?: string }[] }; }

const codemods = new Map<string, AuraCodemod>();

export function registerCodemod(mod: AuraCodemod): void {                       // run via `aura3d codemod <name> <glob> [--report|--write|--dry-run]`
  if (codemods.has(mod.name)) throw new Error(`CODEMOD_DUPLICATE:${mod.name}`);
  codemods.set(mod.name, mod);
}

export function codemodFor(name: string): AuraCodemod | undefined {
  return codemods.get(name);
}

export interface AuraDoctorRule { readonly code: string /* "feel/evidence-only", "look/capture-branch" */; readonly owner: string; check(file: { readonly path: string; readonly text: string }): readonly { readonly line: number; readonly message: string; readonly severity: "error" | "warning" }[]; }

const doctorRules = new Map<string, AuraDoctorRule>();

export function registerDoctorRule(rule: AuraDoctorRule): void {                // hosted by `aura3d doctor --look` (PRD 13)
  if (doctorRules.has(rule.code)) throw new Error(`DOCTOR_RULE_DUPLICATE:${rule.code}`);
  doctorRules.set(rule.code, rule);
}

export function doctorRulesAll(): readonly AuraDoctorRule[] {
  return [...doctorRules.values()];
}
