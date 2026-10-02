import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AuraAgentClient = "claude" | "cursor" | "copilot" | "generic";
export type AuraAgentTarget = AuraAgentClient | "all";
export type AuraSkillMode = "core" | "all" | "none";

export interface AuraSkillsManifest {
  readonly schema: string;
  readonly cliVersion: string;
  readonly docsBase: string;
  readonly coreSet: readonly string[];
  readonly skills: Readonly<Record<string, { readonly tier: string; readonly prd: string }>>;
  readonly templates: Readonly<Record<string, readonly string[]>>;
  readonly clients: Readonly<Record<AuraAgentClient, string>>;
}

export interface WriteAgentSkillsOptions {
  readonly projectDir: string;
  readonly agent: AuraAgentTarget;
  readonly skills?: AuraSkillMode;
  /** Adds the manifest's template-specific skills on top of the selected mode. */
  readonly template?: string;
  /** Override the bundled skills directory (tests, monorepo sync). */
  readonly skillsDir?: string;
  /** Write the bundled llms.txt into the project root when absent or unmodified. */
  readonly writeLlms?: boolean;
}

export interface WriteAgentSkillsResult {
  readonly skills: readonly string[];
  readonly written: readonly string[];
  readonly skippedUserModified: readonly string[];
}

export const AURA_SKILLS_LEDGER = ".aura3d-skills.json";
export const AURA_AGENT_CLIENTS: readonly AuraAgentClient[] = ["generic", "claude", "cursor", "copilot"];

export function findBundledSkillsDir(start = dirname(fileURLToPath(import.meta.url))): string {
  let current = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(current, "skills");
    if (existsSync(resolve(candidate, "manifest.json"))) return candidate;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  throw new Error("Aura3D skills bundle not found (expected skills/manifest.json next to the package).");
}

export function readSkillsManifest(skillsDir = findBundledSkillsDir()): AuraSkillsManifest {
  return JSON.parse(readFileSync(resolve(skillsDir, "manifest.json"), "utf8")) as AuraSkillsManifest;
}

export function selectSkills(manifest: AuraSkillsManifest, mode: AuraSkillMode, template?: string): readonly string[] {
  if (mode === "none") return [];
  const selected = new Set<string>(mode === "all" ? Object.keys(manifest.skills) : manifest.coreSet);
  if (template) for (const name of manifest.templates[template] ?? []) selected.add(name);
  return [...selected].filter((name) => name in manifest.skills).sort();
}

export function writeAgentSkills(options: WriteAgentSkillsOptions): WriteAgentSkillsResult {
  const projectDir = resolve(options.projectDir);
  const skillsDir = options.skillsDir ?? findBundledSkillsDir();
  const manifest = readSkillsManifest(skillsDir);
  const names = selectSkills(manifest, options.skills ?? "core", options.template);
  const clients = options.agent === "all" ? AURA_AGENT_CLIENTS : [options.agent];
  const ledger = readLedger(projectDir);
  const written: string[] = [];
  const skipped: string[] = [];
  const put = (target: string, contents: string) => {
    const key = relative(projectDir, target);
    if (existsSync(target)) {
      const current = hash(readFileSync(target, "utf8"));
      const recorded = ledger[key];
      if (current === hash(contents)) return;
      if (recorded === undefined || recorded !== current) {
        skipped.push(target);
        return;
      }
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    ledger[key] = hash(contents);
    written.push(target);
  };
  for (const client of clients) {
    const root = resolve(projectDir, manifest.clients[client]);
    for (const name of names) {
      const source = resolve(skillsDir, name);
      if (!existsSync(resolve(source, "SKILL.md"))) throw new Error(`Bundled skill missing SKILL.md: ${name}`);
      for (const file of listFiles(source)) put(resolve(root, name, relative(source, file)), readFileSync(file, "utf8"));
    }
  }
  const llmsSource = resolve(skillsDir, "llms.txt");
  if (options.writeLlms !== false && existsSync(llmsSource)) put(resolve(projectDir, "llms.txt"), readFileSync(llmsSource, "utf8"));
  if (written.length > 0) writeFileSync(resolve(projectDir, AURA_SKILLS_LEDGER), `${JSON.stringify(sortKeys(ledger), null, 2)}\n`);
  return { skills: names, written, skippedUserModified: skipped };
}

function readLedger(projectDir: string): Record<string, string> {
  const path = resolve(projectDir, AURA_SKILLS_LEDGER);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.name !== ".DS_Store") files.push(path);
  }
  return files.sort();
}

function hash(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function sortKeys(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
