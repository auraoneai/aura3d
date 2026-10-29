import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAgentSkills } from "./agent-skills.js";
import { copyTemplateHdris, TEMPLATE_HDRI_DIR, templateAuthorsLook } from "./template-hdri.js";
import { fetchTemplateAssets, missingTemplateAssets, readTemplateAssetManifest, type FetchTemplateAssetsOptions, type FetchTemplateAssetsResult, type TemplateAssetEntry } from "./template-assets.js";

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

/**
 * Retired template names → current names (Q-13-4 / #700: the `three-compat-*`
 * starters take their §6.8 names). Each entry is a one-minor deprecation alias:
 * the CLI scaffolds the current template and prints `templateAliasWarning`.
 * Entries are added as each template is renamed and dropped in the next minor.
 */
export const TEMPLATE_ALIASES = Object.freeze({
  "three-compat-premium-product-viewer": "premium-product-viewer",
  "three-compat-architecture-interior": "architecture-interior",
  "three-compat-material-authoring": "material-authoring",
  "three-compat-asset-inspector": "asset-inspector",
  "three-compat-character-viewer": "character-viewer",
  "three-compat-postprocess-scene": "postprocess-scene",
  "three-compat-custom-threejs-migration": "custom-scene",
  "three-compat-large-scene": "large-scene"
} as const satisfies Record<string, CreateA3DTemplate>);
export type CreateA3DTemplateAlias = keyof typeof TEMPLATE_ALIASES;

export interface ResolvedTemplateName {
  readonly template: CreateA3DTemplate;
  /** The retired name the caller used, or null for a current template name. */
  readonly deprecated: string | null;
}

/** Resolve a current template name or a retired alias; null when neither. */
export function resolveTemplateAlias(name: string): ResolvedTemplateName | null {
  if ((CREATE_AURA3D_TEMPLATES as readonly string[]).includes(name)) {
    return { template: name as CreateA3DTemplate, deprecated: null };
  }
  const template = Object.prototype.hasOwnProperty.call(TEMPLATE_ALIASES, name) ? TEMPLATE_ALIASES[name as CreateA3DTemplateAlias] : undefined;
  return template ? { template, deprecated: name } : null;
}

/** Deprecation warning for a resolved alias; null when no alias was used. */
export function templateAliasWarning(resolved: ResolvedTemplateName): string | null {
  if (!resolved.deprecated) return null;
  return `Template "${resolved.deprecated}" renamed to "${resolved.template}"; the "${resolved.deprecated}" alias is removed in the next minor.`;
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
  /**
   * Large template binaries the npm package does not ship (template-assets.json) and that are not in the project yet.
   * Empty in a source checkout. Pass the result to `fetchMissingTemplateAssets` (the CLI does) to download them.
   */
  readonly missingAssets: readonly TemplateAssetEntry[];
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
    dependencies["@aura3d/engine"] = options.packageVersion ?? "4.6.0";
  } else if (options.packageVersion) {
    for (const dependency of auraDependencies) dependencies[dependency] = options.packageVersion;
  }
  packageJson.dependencies = dependencies;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  // Look presets load /hdri/<file>.hdr; ship the package's HDRI set (sibling of
  // templates/ under the same root) with every template that authors a look.
  if (templateAuthorsLook(targetDir)) copyTemplateHdris(resolve(rootDir, TEMPLATE_HDRI_DIR), targetDir);
  const agentSkills = options.agent
    ? writeAgentSkills({ projectDir: targetDir, agent: options.agent, skills: options.skills ?? "core", template })
    : undefined;
  return {
    targetDir,
    template,
    files: listTemplateFiles(targetDir),
    ...(agentSkills ? { agentSkills } : {}),
    missingAssets: missingTemplateAssets(readTemplateAssetManifest(rootDir), template, targetDir)
  };
}

/** Download the template binaries `createA3DProject` reported missing; each is verified against its size and sha256. */
export async function fetchMissingTemplateAssets(
  result: CreateA3DProjectResult,
  options: { readonly version: string } & Pick<FetchTemplateAssetsOptions, "bases" | "fetch" | "log">
): Promise<FetchTemplateAssetsResult> {
  return fetchTemplateAssets({ projectDir: result.targetDir, template: result.template, entries: result.missingAssets, ...options });
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
  DEFAULT_TEMPLATE_ASSET_BASES,
  TEMPLATE_ASSET_MANIFEST,
  buildTemplateAssetManifest,
  fetchTemplateAssets,
  missingTemplateAssets,
  readTemplateAssetManifest,
  templateAssetBases,
  type FetchTemplateAssetsOptions,
  type FetchTemplateAssetsResult,
  type TemplateAssetEntry,
  type TemplateAssetManifest
} from "./template-assets.js";

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
