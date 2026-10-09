import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAgentSkills } from "./agent-skills.js";

export const CREATE_AURA3D_TEMPLATES = [
  "product-viewer",
  "cinematic-scene",
  "mini-game",
  "racing-starter",
  "falling-blocks-starter",
  "fighting-game",
  "arena-shooter",
  "animation-channel",
  "prompt-animation-channel",
  "animation-studio",
  "episode-builder",
  "character-controller",
  "premium-product-viewer",
  "architecture-interior",
  "material-authoring",
  "asset-inspector",
  "character-viewer",
  "postprocess-scene",
  "custom-scene",
  "large-scene"
] as const;
export type CreateA3DTemplate = (typeof CREATE_AURA3D_TEMPLATES)[number];

/** Old `three-compat-*` template names → §6.8 names. Kept for one minor as a
 * deprecation alias; callers surface the warning, then drop the map. */
export const TEMPLATE_ALIASES = {
  "three-compat-premium-product-viewer": "premium-product-viewer",
  "three-compat-architecture-interior": "architecture-interior",
  "three-compat-material-authoring": "material-authoring",
  "three-compat-asset-inspector": "asset-inspector",
  "three-compat-character-viewer": "character-viewer",
  "three-compat-postprocess-scene": "postprocess-scene",
  "three-compat-custom-threejs-migration": "custom-scene",
  "three-compat-large-scene": "large-scene"
} as const satisfies Record<string, CreateA3DTemplate>;
export type CreateA3DTemplateAlias = keyof typeof TEMPLATE_ALIASES;

/** Resolve a template name or alias. Returns the canonical name plus the
 * deprecated name the caller used, so the CLI can warn. */
export function resolveTemplateAlias(
  name: string
): { template: CreateA3DTemplate; deprecated: CreateA3DTemplateAlias | null } | null {
  if ((CREATE_AURA3D_TEMPLATES as readonly string[]).includes(name)) {
    return { template: name as CreateA3DTemplate, deprecated: null };
  }
  const alias = (TEMPLATE_ALIASES as Record<string, string>)[name];
  if (alias) return { template: alias as CreateA3DTemplate, deprecated: name as CreateA3DTemplateAlias };
  return null;
}

export interface CreateA3DProjectOptions {
  readonly targetDir: string;
  readonly template?: CreateA3DTemplate;
  readonly packageVersion?: string;
  readonly rootDir?: string;
  /** Write Aura3D agent skills + llms.txt for these clients after scaffolding. Omit to skip. */
  readonly agent?: import("./agent-skills.js").AuraAgentTarget;
  readonly skills?: import("./agent-skills.js").AuraSkillMode;
}

export interface CreateA3DProjectResult {
  readonly targetDir: string;
  readonly template: CreateA3DTemplate;
  readonly files: readonly string[];
  readonly agentSkills?: import("./agent-skills.js").WriteAgentSkillsResult;
}

export function createA3DProject(options: CreateA3DProjectOptions): CreateA3DProjectResult {
  const template = options.template ?? "product-viewer";
  if (!CREATE_AURA3D_TEMPLATES.includes(template)) {
    throw new Error(`Unknown create-aura3d template: ${template}. Available templates: ${CREATE_AURA3D_TEMPLATES.join(", ")}`);
  }
  const rootDir = options.rootDir ?? findDefaultTemplateRoot();
  const templateDir = resolve(rootDir, "templates", template);
  if (!existsSync(templateDir)) throw new Error(`Unknown create-aura3d template: ${template}`);
  const targetDir = resolve(options.targetDir);
  mkdirSync(targetDir, { recursive: true });
  cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (source) => !relative(templateDir, source).split(/[\\/]/).some((part) => part === "node_modules" || part === "dist" || part === "test-results")
  });
  const packagePath = resolve(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  const auraDependencies = Object.keys(dependencies).filter((name) => name.startsWith("@aura3d/"));
  if (auraDependencies.length === 0) {
    dependencies["@aura3d/engine"] = options.packageVersion ?? "3.0.1";
  } else if (options.packageVersion) {
    for (const dependency of auraDependencies) dependencies[dependency] = options.packageVersion;
  }
  packageJson.dependencies = dependencies;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const agentSkills = options.agent
    ? writeAgentSkills({ projectDir: targetDir, agent: options.agent, skills: options.skills ?? "core", template })
    : undefined;
  return {
    targetDir,
    template,
    files: listTemplateFiles(targetDir),
    ...(agentSkills ? { agentSkills } : {})
  };
}

export function writeCreateA3DReport(path: string, result: CreateA3DProjectResult): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(result, null, 2)}\n`);
}

function listTemplateFiles(targetDir: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path.replace(`${targetDir}/`, ""));
    }
  };
  visit(targetDir);
  return files.sort();
}

function findDefaultTemplateRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if (CREATE_AURA3D_TEMPLATES.every((template) => existsSync(resolve(current, "templates", template)))) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return process.cwd();
}

export {
  probeShowcaseGameGeometry,
  type ShowcaseGameGeometryCategory,
  type ShowcaseGameGeometryProbeResult
} from "./showcase-spec-game-geometry-probe.js";
export type {
  ExtractOptions as ShowcaseGameGeometryExtractOptions,
  GeometryExtractionFailure as ShowcaseGameGeometryExtractionFailure,
  GeometryExtractionResult as ShowcaseGameGeometryExtractionResult,
  GeometryExtractionSuccess as ShowcaseGameGeometryExtractionSuccess
} from "./showcase-spec-game-geometry-extractor.js";
export type {
  ShowcasePlatformerPlayableSurfaceMap,
  ShowcaseRacingTrackTopology
} from "./showcase-spec-types.js";

export {
  SHOWCASE_ASSET_PAIR_COMPOSITION_THRESHOLDS,
  validateShowcaseAssetPairComposition,
  validateShowcaseAssetPairCompositionFromDisk,
  type ShowcaseAssetPairCompositionCategory,
  type ShowcaseAssetPairCompositionCheck,
  type ShowcaseAssetPairCompositionInput,
  type ShowcaseAssetPairCompositionReport,
  type ValidateShowcaseAssetPairCompositionFromDiskOptions
} from "./showcase-spec-asset-pair-composition.js";

export {
  AURA_AGENT_CLIENTS,
  AURA_SKILLS_LEDGER,
  findBundledSkillsDir,
  readSkillsManifest,
  selectSkills,
  writeAgentSkills,
  type AuraAgentClient,
  type AuraAgentTarget,
  type AuraSkillMode,
  type AuraSkillsManifest,
  type WriteAgentSkillsOptions,
  type WriteAgentSkillsResult
} from "./agent-skills.js";
