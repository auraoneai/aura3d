import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliCommandFor, cliCommandNames, codemodFor, codemodNames } from "./contracts/commands.js";
import { MONOREPO_ONLY_CODEMODS, isWholeCommandMonorepoOnly, monorepoNote } from "./monorepo-only.js";
import { SKIN_HELP } from "./skin/command.js";

export const assetRoleUsage =
  "hero|character|vehicle|enemy|world|environment|track|product|weapon|prop|set-dressing|backdrop|proxy|hdri|texture-set|vfx-atlas|audio|debug|abstract|unknown";

export function assetsAddHelp(): string {
  return `Usage: aura3d assets add ./model.glb --name robot [options]
       aura3d assets add ./model.3mf --name model [options]
       aura3d assets add ./scan.nrrd --name scan --type scalar-volume
       aura3d assets add ./grade.cube --name venueGrade --type lut   (3-D .cube LUT for effects.colorGrade({ lut: assets.venueGrade }))

OBJ, PLY, STL and 3MF can be inspected with bounded native parsers. Register the
corresponding renderer-capable adapter in the app's FormatRegistry before use;
the default registry contains glTF only. Inspection does not imply full format parity.
For 3MF, use adapter id "model3mf" with extension "3mf" and Model3MFLoader.
Legacy inspection remains the default during migration. Strict rejects formats
without an available bounded parser pass, including the current metadata-only glTF path.
NRRD/NHDR scalar volumes require three spatial axes, supported scalar types and
explicit supported orientation. Detached data must be a safe local relative file.

Options:
  --type model|texture|environment|audio|navigation|lut|scalar-volume
  --model-inspection legacy|strict
  --license CC0-1.0
  --license-name "CC0 1.0 Universal"
  --license-url URL
  --license-raw TEXT
  --source-page URL
  --download-url URL
  --source-url URL
  --author NAME
  --source-family NAME
  --attribution TEXT
  --provenance-evidence TEXT (repeatable)
  --retrieved-at ISO-8601
  --quality ungraded|blocked|prototype|candidate
  --role ${assetRoleUsage}
  --suitability TEXT
  --art-direction ID (assets/art-direction/<id>.json)
  --loudness-lufs N (--type audio)
  --true-peak-db N (--type audio)
  --rendered-probe-json tests/reports/asset.probe.json
  --rendered-probe /aura-assets/probe.png
  --orientation-json tests/reports/asset.orientation.json
  --public-path /aura-assets/
  --output public/aura-assets`;
}

export function mainHelp(profileUsage: string): string {
  return `Aura3D CLI

Commands:
  aura3d help [command ...] [--json]      full usage of one command; --json lists every command with summary, usage and flags
  aura3d --version                        print the CLI version
  aura3d <command> --help                 print a command's usage without running it
  aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio|navigation|lut|scalar-volume] [--license CC0-1.0] [--license-url URL] [--source-page URL] [--download-url URL] [--source-url URL] [--author NAME] [--retrieved-at ISO-8601] [--quality ungraded|blocked|prototype|candidate] [--role ${assetRoleUsage}] [--suitability TEXT] [--rendered-probe-json tests/reports/asset.probe.json] [--rendered-probe /aura-assets/probe.png] [--orientation-json tests/reports/asset.orientation.json]
  aura3d assets admit <id> --quality prototype|candidate|release
  aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background] [--max-verts N] [--tex N] [--no-simplify] [--meshopt] [--json]
  aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube] --file in.hdr --out out_1k.hdr [--json]
      HDRI delivery: writes a downsized .hdr (2k sources to <= 1.5 MB at 1k) and, with --rgb9e5-cube, an RGB9E5 cube map for environments.hdri(...).
      Add --standard-ktx2-primaries <bt709|unspecified> with --rgb9e5-cube to write standard KTX2. This declares input primaries; it does not convert color. The Aura3D probe reader currently requires BT.709.
  aura3d assets merge-clips --base rigged.glb --out hero.glb run=animation_run.glb idle=animation_idle.glb [--keep-base-animations] [--tex 1024] [--json]
  aura3d assets scan ./assets
  aura3d assets inspect ./model.glb [--animation] [--humanoid] [--skeleton] [--morphs] [--license]
  aura3d assets validate [--asset assetId|--no-assets] [--source [src]] [--release] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-game [--profile fighting-character] [--asset fighter] [--output artifacts/aura3d/game-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-animation-studio [--episode] [--asset character] [--output artifacts/aura3d/animation-studio-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate --skin [file.glb] [--asset id] [--clips Walk,Run] [--strict] [--json]   (skinned-mesh stretch, flaps, weights, bind-pose mismatch; known defects in aura.skin-allow.json)
  aura3d assets repair-skin <file.glb|assetId> [--out file.glb] [--normalize] [--prune-distant] [--smooth-bridges] [--cut-stretch 2] [--rebuild-limbs] [--refit-skeleton] [--keep-clips Idle_Loop,Walk_Loop]
  aura3d assets validate-animation --clips Idle_Loop,Walk_Loop,Sprint_Loop --map idle=Idle_Loop,walk=Walk_Loop,run=Sprint_Loop [--require idle,walk,run] [--require-rig]
  aura3d assets assemble-character --name hero --body bodyAsset --part hair=hairAsset
  aura3d assets list
  aura3d assets typegen
  aura3d assets bind-game-route-evidence --route <id> --category racing|platformer --assets <id,id,...> --screenshot <png> --geometry-report <json> --composition-report <json> --visual-review <json>
  aura3d assets certify-game-geometry --asset <id> --category racing|platformer|sports|fighting|arena|puzzle
  aura3d assets certify-game-geometry --assets <id,id,...> --category racing|platformer|sports|fighting|arena|puzzle
  aura3d assets thumbnail
  aura3d assets search <query> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]
  aura3d assets resolve <query> --name <name> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--index N] [--candidate-id ID]
  aura3d animation plan|preview|render|package|review|verify [--dry-run]
  aura3d animation scene <new|show|cast add|prop add|set|block|camera|shot|dialogue|render|...>  (agent-native Scene-Tool CLI)
  aura3d doctor
  aura3d check-deploy --dist dist [--release] [--source [src]] [--asset assetId|--no-assets]
      Static check of the build output against aura.assets.json (hashed assets, unreferenced files, licence gates with --release).
  aura3d check-deploy --dist dist --browser [--route /path ...] [--browser-timeout ms] [--browser-settle ms]
      Also loads each route (default /) from a local static server in headless Chromium and fails on HTTP errors, failed requests, uncaught errors and console errors. Needs Playwright in your project (npm i -D playwright, npx playwright install chromium).
  aura3d info [--json] [--members] [--name <export>[.<member>]]
      Installed Aura3D versions and the @aura3d/engine API surface read from the installed types; --name lists members, option keys and close names.
  aura3d examples <query> [--limit N] [--json] [--no-source] | --list | --id <id> [--write src/main.ts] [--force]
      Start every new scene here: offline search over the shipped recipes and create-aura3d templates; prints the best match's complete src/main.ts and its setup (product viewer, character, effect, outdoor, interior, small game, materials, presentation).
  aura3d validate [file.ts ... | projectDir] [--json] [--no-types] [--strict]
      Static checks: colour strings, unknown options/members/exports, invented asset paths and keys, framing, lighting, reflective materials.
  aura3d render [projectDir] [--json] [--screenshot|--image] [--out shot.png] [--full] [--no-build] [--url http://127.0.0.1:5173/] [--route /path] [--dist dist] [--width N] [--height N]
      Build, serve and render in local headless Chrome; prints a short text summary (--json: same, as JSON): subject framing (engine measureFrameFill), exposure, shadow, motion, errors, fps, backend, done/next. PNG only with --screenshot; --full prints the full diagnostics report.
  aura3d import-three <factory.mjs> [--name <key>] [--seed <n>] [--params <json>] [--out <dir>] [--stage <dir>] [--three <dir>] [--no-admit] [--license <id>] [--json]
      Runs a three.js scene factory headless, admits its GLB as a typed asset and writes Aura3D source plus a supported/approximated/unsupported report (clips, simple ShaderMaterials as material.custom).
  aura3d init --agent all [--skills core|all|none] [--template <create-aura3d template>]
      Writes agent instruction files, Aura3D agent skills (per client skills dir), and llms.txt; never overwrites user-edited files.`;
}

// ---------------------------------------------------------------------------
// 5.6.0 A6 — one help catalog for every command: the verbs hard-wired in
// cli.ts (below) plus every C-39 registry command. `aura3d help <cmd>`,
// `aura3d <cmd> --help` and `aura3d help --json` (the source WP6 generates
// docs/api/cli-reference.md from) all read it, so they cannot drift apart.
// ---------------------------------------------------------------------------

export interface BuiltinCommandHelp {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
}

const skinRepairHelp = SKIN_HELP.slice(SKIN_HELP.indexOf("aura3d assets repair-skin"));
const skinValidateHelp = SKIN_HELP.slice(0, SKIN_HELP.indexOf("aura3d assets repair-skin")).trimEnd();
const assetValidationFlags = "[--asset assetId|--no-assets] [--source [src]] [--release] [--no-placeholders] [--require-license] [--provenance evidence.json]";
const resolveConstraintFlags = "[--license cc0|cc-by] [--max-tris N] [--animated]";

const animationScriptVerbs: readonly (readonly [string, string])[] = [
  ["plan", "episode:plan"],
  ["preview", "episode:preview"],
  ["render", "episode:render"],
  ["package", "episode:package"],
  ["review", "episode:review"],
  ["verify", "episode:verify"],
  ["scene", "scene"]
];

/** `aura3d animation <verb>` → the project npm script it runs (cli.ts dispatch reads this too). */
export const ANIMATION_SCRIPT_BY_VERB: Readonly<Record<string, string>> = Object.fromEntries(animationScriptVerbs);

/** Every verb cli.ts dispatches itself (not through the C-39 registry). */
export function builtinCommands(profileUsage: string): readonly BuiltinCommandHelp[] {
  return [
    { name: "help", summary: "Print help for every command, one command (aura3d help <command>) or the full catalog as JSON.", usage: "aura3d help [command ...] [--json]" },
    { name: "assets add", summary: "Register a local GLB/glTF, texture, environment, audio, navigation, LUT or scalar-volume file as a typed asset with licence and provenance.", usage: assetsAddHelp() },
    { name: "assets scan", summary: "List the asset files under a directory (read-only).", usage: "aura3d assets scan [dir=assets]" },
    { name: "assets bind-game-route-evidence", summary: "Bind route screenshots, geometry, composition and visual-review evidence to game assets.", usage: "aura3d assets bind-game-route-evidence --route <id> --category racing|platformer --assets <id,id,...> --screenshot <png> --geometry-report <json> --composition-report <json> --visual-review <json>" },
    { name: "assets certify-game-geometry", summary: "Certify asset geometry for a game category (one asset writes the certification; --assets is read-only).", usage: "aura3d assets certify-game-geometry --asset <id> --category racing|platformer|sports|fighting|arena|puzzle\naura3d assets certify-game-geometry --assets <id,id,...> --category racing|platformer|sports|fighting|arena|puzzle" },
    { name: "assets inspect", summary: "Print a GLB/glTF's bounds, meshes, materials, textures and optionally clips, skeleton, morphs, licence and PBR statistics (read-only).", usage: "aura3d assets inspect ./model.glb [--animation] [--humanoid] [--skeleton] [--morphs] [--license] [--pbr]\n  --pbr: per material, metalness/roughness p5/p50/p95, normal-map tilt percentiles (degrees), texture encodings and sizes, with PBR_PAINT_METALLIC, PBR_NORMAL_LOSSY_GLOSSY, PBR_NORMAL_NOISY and PBR_SINGLE_MATERIAL_VEHICLE warnings." },
    { name: "assets validate", summary: "Validate the manifest and typed assets; --route runs the G1–G11 admission table per referenced asset; --skin checks skinned meshes; --pbr adds PBR_* material warnings.", usage: `aura3d assets validate ${assetValidationFlags} [--episode] [--pbr]\naura3d assets validate --route apps/<app> [--release]\n${skinValidateHelp}\n  --pbr: decode each model's PBR maps and warn PBR_PAINT_METALLIC, PBR_NORMAL_LOSSY_GLOSSY, PBR_NORMAL_NOISY, PBR_SINGLE_MATERIAL_VEHICLE (advisory).` },
    { name: "assets repair-skin", summary: "Repair skin weights, stretched triangles, limbs or the skeleton of a rigged GLB (every step opt-in).", usage: skinRepairHelp },
    { name: "assets validate-game", summary: "Validate game assets (optionally the fighting-character profile) and write evidence.", usage: `aura3d assets validate-game [--profile fighting-character] [--output artifacts/aura3d/game-assets.json] ${assetValidationFlags}` },
    { name: "assets validate-animation-studio", summary: "Validate animation-studio cast and set assets and write evidence.", usage: `aura3d assets validate-animation-studio [--episode] [--output artifacts/aura3d/animation-studio-assets.json] ${assetValidationFlags}` },
    { name: "assets validate-animation", summary: "Check that clip names cover the required actions; with --file/--asset also runs the skin check on the rig.", usage: "aura3d assets validate-animation --clips Idle_Loop,Walk_Loop,Sprint_Loop --map idle=Idle_Loop,walk=Walk_Loop,run=Sprint_Loop [--require idle,walk,run] [--require-rig] [--file rig.glb|--asset id]" },
    { name: "assets assemble-character", summary: "Plan a character assembled from a body asset and attached part assets.", usage: "aura3d assets assemble-character --name hero --body bodyAsset [--part hair=hairAsset] [--part weapon=weaponAsset] [--output plan.json]" },
    { name: "assets list", summary: "Print the manifest's assets as JSON (read-only).", usage: "aura3d assets list" },
    { name: "assets typegen", summary: "Regenerate src/aura-assets.ts (or a route's typed asset module with --route) from aura.assets.json.", usage: "aura3d assets typegen [--route apps/<app>] [--variant optimized|source|mobile]" },
    { name: "assets serve", summary: "Print where the manifest's output directory is served from (read-only).", usage: "aura3d assets serve" },
    { name: "assets search", summary: "Search open-source asset catalogs for a model (read-only).", usage: `aura3d assets search <query> [--profile ${profileUsage}] ${resolveConstraintFlags} [--json]` },
    { name: "assets resolve", summary: "Resolve a need through the ladder (project asset, open source, procedural recipe) or pull a known candidate.", usage: `aura3d assets resolve "<need>" [--name <id>] [--role hero|prop|background|character|texture|hdri] [--dry-run] [--json]\naura3d assets resolve <query> --name <name> [--profile ${profileUsage}] ${resolveConstraintFlags} [--index N] [--candidate-id ID] [--json]` },
    ...animationScriptVerbs.map(([verb, script]): BuiltinCommandHelp => ({
      name: `animation ${verb}`,
      summary: verb === "scene"
        ? "Agent-native Scene-Tool CLI of animation-studio projects (runs the project's `scene` npm script)."
        : `Run the project's \`${script}\` npm script (animation episode projects).`,
      usage: verb === "scene"
        ? "aura3d animation scene <new|show|cast add|prop add|set|block|camera|shot|dialogue|render|...> [args] [--dry-run]"
        : `aura3d animation ${verb} [args] [--dry-run]`
    })),
    { name: "doctor", summary: "Check the project's Aura3D setup and asset manifest; --look runs the look lint (aura3d look lint).", usage: "aura3d doctor [--look [look lint flags]]" },
    { name: "check-deploy", summary: "Check the build output against aura.assets.json; --browser also loads routes in headless Chromium.", usage: `aura3d check-deploy --dist dist ${assetValidationFlags}\naura3d check-deploy --dist dist --browser [--route /path ...] [--browser-timeout ms] [--browser-settle ms]` },
    { name: "init", summary: "Write agent instruction files, Aura3D agent skills and llms.txt; never overwrites user-edited files.", usage: "aura3d init [--agent claude|cursor|copilot|generic|all] [--skills core|all|none] [--template <create-aura3d template>]" }
  ];
}

export interface CliCatalogCommand {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly flags: readonly string[];
  readonly source: "builtin" | "registry";
  readonly owner: string;
  readonly monorepoOnly?: string;
}

export interface CliCatalogCodemod {
  readonly name: string;
  readonly owner: string;
  readonly description: string;
  readonly monorepoOnly?: boolean;
}

export interface CliCatalog {
  readonly schema: "aura3d.cli-help/1";
  readonly package: string;
  readonly version: string;
  readonly bins: readonly string[];
  readonly exitCodes: Readonly<Record<string, string>>;
  readonly globalFlags: readonly { readonly flag: string; readonly description: string }[];
  readonly commands: readonly CliCatalogCommand[];
  readonly codemods: readonly CliCatalogCodemod[];
}

const FLAG_PATTERN = /(?<![\w-])--[a-z0-9][a-z0-9-]*/gi;

/**
 * The command's own `--flags`, sorted (stable for generated docs). Read from the synopsis lines (`aura3d <name> ...`
 * and their `[...]` continuations) and from the leading token of flag-description lines (`  --flag  text`); flags
 * that only appear in prose (e.g. "then run aura3d assets add --name ...") belong to other commands and are skipped.
 * With no `name`, every synopsis line counts.
 */
export function usageFlags(usage: string, name?: string): readonly string[] {
  const flags = new Set<string>();
  const synopsis = name ? `aura3d ${name}` : "aura3d ";
  const add = (text: string) => { for (const match of text.matchAll(FLAG_PATTERN)) flags.add(match[0]); };
  for (const raw of usage.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(synopsis) && (!name || line.length === synopsis.length || /\s/.test(line[synopsis.length]!))) {
      add(line.replace(/\(\$?\d[^)]*\)\s*$/, ""));
    } else if (line.startsWith("[")) {
      add(line);
    } else if (line.startsWith("--")) {
      add(line.split(/\s+/, 1)[0]!);
    }
  }
  return [...flags].sort();
}

/** The CLI's package name and version, read from the package.json next to the build (dist/ or src/). */
export function readCliVersion(): { readonly name: string; readonly version: string } {
  let dir = dirname(fileURLToPath(import.meta.url));
  let fallback: { name: string; version: string } | undefined;
  for (let depth = 0; depth < 4; depth++) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string };
        if (pkg.name === "@aura3d/cli" && pkg.version) return { name: pkg.name, version: pkg.version };
        if (!fallback && pkg.name?.startsWith("@aura3d/") && pkg.version) fallback = { name: pkg.name, version: pkg.version };
      } catch {
        // keep walking
      }
    }
    dir = dirname(dir);
  }
  return fallback ?? { name: "@aura3d/cli", version: "0.0.0-unknown" };
}

function monorepoSuffix(name: string): string {
  return isWholeCommandMonorepoOnly(name) ? " (monorepo)" : "";
}

/** All commands (built-in + registry), sorted by name; a registry command overrides a built-in of the same name. */
export function cliCatalogCommands(profileUsage: string): readonly CliCatalogCommand[] {
  const byName = new Map<string, CliCatalogCommand>();
  for (const builtin of builtinCommands(profileUsage)) {
    const note = monorepoNote(builtin.name);
    byName.set(builtin.name, { ...builtin, summary: builtin.summary + monorepoSuffix(builtin.name), flags: usageFlags(builtin.usage, builtin.name), source: "builtin", owner: "cli", ...(note ? { monorepoOnly: note } : {}) });
  }
  for (const name of cliCommandNames()) {
    const cmd = cliCommandFor(name)!;
    const note = monorepoNote(name);
    byName.set(name, { name, summary: cmd.summary + monorepoSuffix(name), usage: cmd.usage, flags: usageFlags(cmd.usage, name), source: "registry", owner: cmd.owner, ...(note ? { monorepoOnly: note } : {}) });
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** `aura3d help --json`: the complete, stable command catalog. */
export function cliCatalog(profileUsage: string): CliCatalog {
  const { name, version } = readCliVersion();
  return {
    schema: "aura3d.cli-help/1",
    package: name,
    version,
    bins: ["aura3d", "aura", "cli"],
    exitCodes: { "0": "ok", "1": "the command ran and failed (failures are printed)", "2": "usage error, unknown command, or a monorepo-only command run outside the Aura3D repository" },
    globalFlags: [
      { flag: "--help", description: "Print the command's usage and exit 0 without running it or writing anything (also -h)." },
      { flag: "--version", description: "Print the CLI version (also -v); with --json prints {\"name\",\"version\"}." }
    ],
    commands: cliCatalogCommands(profileUsage),
    codemods: codemodNames().map((codemod) => {
      const mod = codemodFor(codemod)!;
      return { name: codemod, owner: mod.owner, description: mod.description, ...(MONOREPO_ONLY_CODEMODS.has(codemod) ? { monorepoOnly: true } : {}) };
    })
  };
}

/** Text help for one command: summary, every usage form, flags, monorepo note. */
export function formatCommandHelp(command: CliCatalogCommand): string {
  if (command.name === "assets add") return assetsAddHelp();
  const usage = command.usage.includes("\n")
    ? command.usage
    : command.usage.split(/ \| (?=aura3d )/).join("\n");
  const lines = [`aura3d ${command.name} — ${command.summary}`, "", "Usage:", ...usage.split("\n").map((line) => `  ${line}`)];
  if (command.monorepoOnly) lines.push("", `Note: ${command.monorepoOnly}.`);
  if (command.name === "codemod") {
    lines.push("", "Codemods:", ...codemodNames().map((name) => `  ${name}${MONOREPO_ONLY_CODEMODS.has(name) ? " (monorepo)" : ""} — ${codemodFor(name)!.description}`));
  }
  return lines.join("\n");
}

/** Commands under a group prefix (`assets`, `look`, `animation`, …), as help text; undefined when no such group. */
export function formatGroupHelp(group: string, commands: readonly CliCatalogCommand[]): string | undefined {
  const members = commands.filter((command) => command.name.startsWith(`${group} `));
  if (members.length === 0) return undefined;
  return [`aura3d ${group} commands:`, ...members.map((command) => `  aura3d ${command.name} — ${command.summary}`), "", `Run \`aura3d help ${group} <command>\` for a command's full usage.`].join("\n");
}

/** Longest catalog command whose words prefix `words` (positional args after it are ignored). */
export function matchCatalogCommand(words: readonly string[], commands: readonly CliCatalogCommand[]): CliCatalogCommand | undefined {
  const names = new Map(commands.map((command) => [command.name, command]));
  for (let count = Math.min(words.length, 4); count > 0; count--) {
    const hit = names.get(words.slice(0, count).join(" "));
    if (hit) return hit;
  }
  return undefined;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** "Did you mean" candidates for an unknown command (closest names first, at most 3). */
export function suggestCommands(words: readonly string[], names: readonly string[]): readonly string[] {
  const typed = words.filter((word) => !word.startsWith("-"));
  if (typed.length === 0) return [];
  const groups = new Set(names.filter((name) => name.includes(" ")).map((name) => name.split(" ")[0]!));
  const candidates = [...new Set([...names, ...groups])];
  const scored: { name: string; score: number }[] = [];
  for (const name of candidates) {
    const parts = name.split(" ");
    const input = typed.slice(0, parts.length).join(" ");
    const distance = editDistance(input.toLowerCase(), name.toLowerCase());
    const limit = Math.max(1, Math.floor(name.length / 4));
    if (distance > 0 && distance <= limit) scored.push({ name, score: distance });
    // `aura3d optimize` → `assets optimize`: the typed word is a sub-verb of a group.
    else if (parts.length > 1 && parts[parts.length - 1] === typed[0]) scored.push({ name, score: limit + 1 });
  }
  // Ties go to the more specific name (`assets add` before the `assets` group).
  const wordCount = (name: string): number => name.split(" ").length;
  return scored.sort((a, b) => a.score - b.score || wordCount(b.name) - wordCount(a.name) || (a.name < b.name ? -1 : 1)).slice(0, 3).map((entry) => entry.name);
}

/** The stderr text for an unknown command (exit 2). */
export function unknownCommandMessage(words: readonly string[], commands: readonly CliCatalogCommand[]): string {
  const typed = words.filter((word) => !word.startsWith("-"));
  const shown = (typed.length ? typed : words).slice(0, 3).join(" ");
  const suggestions = suggestCommands(words, commands.map((command) => command.name));
  const lines = [`aura3d: unknown command "${shown}".`];
  if (suggestions.length) lines.push(`Did you mean: ${suggestions.map((name) => `aura3d ${name}`).join(", ")}?`);
  lines.push("Run `aura3d help` for every command, or `aura3d help --json` for the machine-readable list.");
  return lines.join("\n");
}

/** Registry commands as the trailing "Lane commands" block of the main help, with (monorepo) marks. */
export function registeredCommandsHelp(): string {
  const names = cliCommandNames();
  if (names.length === 0) return "";
  return `\nMore commands (aura3d help <command> for full usage):\n${names.map((name) => `  aura3d ${name} — ${cliCommandFor(name)?.summary ?? ""}${monorepoSuffix(name)}${!isWholeCommandMonorepoOnly(name) && monorepoNote(name) ? ` [${monorepoNote(name)}]` : ""}`).join("\n")}`;
}
