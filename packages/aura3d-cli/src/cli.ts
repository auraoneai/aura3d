#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  addAsset,
  checkDeploy,
  createCharacterAssemblyPlan,
  createAssetThumbnails,
  doctor,
  initAgentFiles,
  inspectAsset,
  listAssets,
  scanAssets,
  validateCartoonAssets,
  validateGameAssets,
  validateAssets,
  writeTypedAssets,
  readAssetManifest
} from "./index.js";
import { runResolve, runSearch, type CliAssetSearchProfile, type CliResolveConstraints } from "./pull-bridge.js";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  const command = args[0];
  if (command === "assets") {
    const action = args[1];
    if (action === "add") {
      const file = args[2];
      const name = readOption("--name");
      if (!file || !name) throw new Error("Usage: aura3d assets add ./model.glb --name robot");
      print(addAsset({
        file,
        name,
        type: readAssetType(),
        publicPath: readOption("--public-path"),
        outputDir: readOption("--output"),
        sourceUrl: readOption("--source-url"),
        license: readOption("--license"),
        author: readOption("--author"),
        sourceFamily: readOption("--source-family"),
        attribution: readOption("--attribution")
      }));
    } else if (action === "scan") {
      print(scanAssets({ directory: args[2] ?? "assets" }));
    } else if (action === "inspect") {
      const file = readInspectFile();
      if (!file) throw new Error("Usage: aura3d assets inspect ./model.glb [--animation] [--humanoid]");
      print(inspectAsset({
        file,
        animation: hasFlag("--animation"),
        humanoid: hasFlag("--humanoid"),
        skeleton: hasFlag("--skeleton"),
        morphs: hasFlag("--morphs"),
        license: hasFlag("--license")
      }));
    } else if (action === "validate") {
      print(validateAssets(readAssetValidationOptions()));
    } else if (action === "validate-game") {
      const profile = readCliAssetProfile();
      print(validateGameAssets({
        output: readEvidenceOutput(),
        ...readAssetValidationOptions(),
        ...(profile === "fighting-character" ? { gameProfile: profile } : {})
      }));
    } else if (action === "validate-cartoon") {
      print(validateCartoonAssets({ output: readEvidenceOutput(), ...readAssetValidationOptions() }));
    } else if (action === "assemble-character") {
      const name = readOption("--name");
      const body = readOption("--body");
      if (!name || !body) throw new Error("Usage: aura3d assets assemble-character --name hero --body bodyAsset [--part hair=hairAsset] [--part weapon=weaponAsset]");
      print(createCharacterAssemblyPlan({ name, body, parts: readParts("--part"), output: readOption("--output") }));
    } else if (action === "list") {
      console.log(JSON.stringify(listAssets(), null, 2));
    } else if (action === "typegen") {
      const path = writeTypedAssets(process.cwd(), readAssetManifest(process.cwd()));
      console.log(`Wrote ${path}`);
    } else if (action === "thumbnail") {
      print(createAssetThumbnails());
    } else if (action === "serve") {
      const manifest = readAssetManifest(process.cwd());
      console.log(`Serve ${manifest.outputDir} at ${manifest.assetBasePath}`);
    } else if (action === "search") {
      const query = args[2];
      if (!query || query.startsWith("--")) throw new Error(`Usage: aura3d assets search <query> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]`);
      const report = await runSearch({ query, constraints: readResolveConstraints() });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printSearchReport(report);
      }
    } else if (action === "resolve") {
      const query = args[2];
      const name = readOption("--name");
      if (!query || query.startsWith("--") || !name) throw new Error(`Usage: aura3d assets resolve <query> --name <name> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated]`);
      const report = await runResolve({ query, name, constraints: readResolveConstraints() });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const message of report.messages) console.log(message);
        for (const warning of report.warnings) console.error(`warning: ${warning}`);
      }
      if (!report.ok) process.exitCode = 1;
    } else {
      throw new Error(`Unknown assets command: ${String(action)}`);
    }
  } else if (command === "doctor") {
    print(doctor());
  } else if (command === "cartoon") {
    runCartoonCommand(args[1]);
  } else if (command === "check-deploy") {
    print(checkDeploy({ distDir: readOption("--dist") }));
  } else if (command === "init") {
    const agent = readOption("--agent") ?? "generic";
    if (!["claude", "cursor", "copilot", "generic", "all"].includes(agent)) throw new Error(`Unsupported agent target: ${agent}`);
    console.log(JSON.stringify({ written: initAgentFiles({ agent: agent as "claude" | "cursor" | "copilot" | "generic" | "all" }) }, null, 2));
  } else {
    console.log(`Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio] [--license CC0-1.0] [--source-url URL] [--author NAME]
  aura3d assets scan ./assets
  aura3d assets inspect ./model.glb [--animation] [--humanoid] [--skeleton] [--morphs] [--license]
  aura3d assets validate [--asset assetId] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-game [--profile fighting-character] [--asset fighter] [--output artifacts/aura3d/game-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-cartoon [--episode] [--asset character] [--output artifacts/aura3d/cartoon-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets assemble-character --name hero --body bodyAsset --part hair=hairAsset
  aura3d assets list
  aura3d assets typegen
  aura3d assets thumbnail
  aura3d assets search <query> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]
  aura3d assets resolve <query> --name <name> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated]
  aura3d cartoon plan|preview|render|package|review|verify [--dry-run]
  aura3d doctor
  aura3d check-deploy --dist dist
  aura3d init --agent all`);
  }
}

function runCartoonCommand(action: string | undefined): void {
  const scriptByAction: Record<string, string> = {
    plan: "episode:plan",
    preview: "episode:preview",
    render: "episode:render",
    package: "episode:package",
    review: "episode:review",
    verify: "episode:verify"
  };
  const script = action ? scriptByAction[action] : undefined;
  if (!script) {
    throw new Error("Usage: aura3d cartoon plan|preview|render|package|review|verify [--dry-run]");
  }
  const command = process.env.npm_execpath && process.env.npm_execpath.includes("pnpm")
    ? "pnpm"
    : "npm";
  const commandArgs = command === "pnpm" ? ["run", script] : ["run", script];
  const report = {
    ok: true,
    command: "cartoon",
    action,
    delegatedScript: script,
    runner: command,
    cwd: process.cwd(),
    dryRun: hasFlag("--dry-run")
  };
  if (hasFlag("--dry-run")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function readInspectFile(): string | undefined {
  return args.slice(2).find((value) => !value.startsWith("--"));
}

function readEvidenceOutput(): string | undefined {
  if (hasFlag("--output")) {
    const output = readOption("--output");
    if (!output || output.startsWith("--")) throw new Error("Expected --output <path>.");
    return output;
  }
  if (hasFlag("--evidence")) {
    const evidence = readOption("--evidence");
    if (!evidence || evidence.startsWith("--")) throw new Error("Expected --evidence <path>.");
    return evidence;
  }
  return undefined;
}

function readAssetValidationOptions(): { readonly episode?: boolean; readonly noPlaceholders?: boolean; readonly requireLicense?: boolean; readonly provenanceFile?: string; readonly assetIds?: readonly string[] } {
  const options: { episode?: boolean; noPlaceholders?: boolean; requireLicense?: boolean; provenanceFile?: string; assetIds?: readonly string[] } = {};
  if (hasFlag("--episode")) options.episode = true;
  if (hasFlag("--no-placeholders")) options.noPlaceholders = true;
  if (hasFlag("--require-license")) options.requireLicense = true;
  const assetIds = readRepeatedOptions("--asset").flatMap((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean));
  if (assetIds.length > 0) options.assetIds = assetIds;
  if (hasFlag("--provenance")) {
    const provenanceFile = readOption("--provenance");
    if (!provenanceFile || provenanceFile.startsWith("--")) throw new Error("Expected --provenance <path>.");
    options.provenanceFile = provenanceFile;
  }
  return options;
}

function readRepeatedOptions(name: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Expected ${name} <value>.`);
    values.push(value);
  }
  return values;
}

function readParts(name: string): readonly { readonly slot: string; readonly asset: string }[] {
  const parts: { slot: string; asset: string }[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Expected ${name} slot=asset`);
    const [slot, asset] = value.split("=");
    if (!slot || !asset) throw new Error(`Expected ${name} slot=asset, got "${value}"`);
    parts.push({ slot, asset });
  }
  return parts;
}

function readAssetType(): "model" | "texture" | "environment" | "audio" | undefined {
  const value = readOption("--type");
  if (!value) return undefined;
  if (value === "model" || value === "texture" || value === "environment" || value === "audio") return value;
  throw new Error(`Unsupported --type value "${value}". Use model, texture, environment, or audio.`);
}

function readResolveConstraints(): CliResolveConstraints {
  const constraints: { license?: readonly ("CC0" | "CC-BY")[]; maxTriangles?: number; animated?: boolean } = {};
  const license = readOption("--license");
  if (license) {
    const normalized = license.toLowerCase();
    if (normalized === "cc0") constraints.license = ["CC0"];
    else if (normalized === "cc-by" || normalized === "ccby") constraints.license = ["CC-BY"];
    else throw new Error(`Unsupported --license value "${license}". Use cc0 or cc-by.`);
  }
  const maxTris = readOption("--max-tris");
  if (maxTris) {
    const parsed = Number.parseInt(maxTris, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--max-tris must be a positive integer (got "${maxTris}").`);
    constraints.maxTriangles = parsed;
  }
  if (hasFlag("--animated")) constraints.animated = true;
  const profile = readCliAssetProfile();
  return profile === "general" ? constraints : { ...constraints, profile };
}

function readCliAssetProfile(): CliAssetSearchProfile {
  const value = readOption("--profile");
  if (!value) return "general";
  if (isSupportedAssetProfile(value)) return value;
  throw new Error(`Unsupported --profile value "${value}". Use ${profileUsage()}.`);
}

function isSupportedAssetProfile(value: string): value is Exclude<CliAssetSearchProfile, "general"> {
  return (
    value === "fighting-character" ||
    value === "cartoon-character" ||
    value === "cartoon-prop" ||
    value === "cartoon-set" ||
    value === "cartoon-environment"
  );
}

function profileUsage(): string {
  return "fighting-character|cartoon-character|cartoon-prop|cartoon-set|cartoon-environment";
}

function printSearchReport(report: { readonly query: string; readonly profile: CliAssetSearchProfile; readonly candidates: readonly { readonly id: string; readonly source: string; readonly title: string; readonly license: string; readonly autoPullable: boolean; readonly sourcePage?: string; readonly profile?: { readonly suitable: boolean; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[] } }[]; readonly rejectedCandidates?: readonly { readonly id: string; readonly source: string; readonly title: string; readonly license: string; readonly autoPullable: boolean; readonly sourcePage?: string; readonly profile?: { readonly suitable: boolean; readonly rejectionReasons: readonly string[]; readonly warnings: readonly string[] } }[]; readonly deepLinks: readonly { readonly id: string; readonly title: string; readonly sourcePage?: string }[]; readonly warnings: readonly string[]; readonly messages: readonly string[] }): void {
  for (const message of report.messages) console.log(message);
  for (const candidate of report.candidates) {
    const profileTag = candidate.profile
      ? candidate.profile.suitable
        ? ", profile-ready"
        : ", profile-rejected"
      : "";
    const tag = candidate.autoPullable ? `auto-pullable${profileTag}` : `manual license check required${profileTag}`;
    console.log(`  [${candidate.source}] ${candidate.id}  "${candidate.title}"  ${candidate.license}  (${tag})`);
    if (candidate.profile && !candidate.profile.suitable) {
      for (const reason of candidate.profile.rejectionReasons) console.log(`    rejects: ${reason}`);
    }
  }
  if (report.rejectedCandidates && report.rejectedCandidates.length > 0) {
    console.log("Rejected by profile:");
    for (const candidate of report.rejectedCandidates) {
      console.log(`  [${candidate.source}] ${candidate.id}  "${candidate.title}"  ${candidate.license}`);
      for (const reason of candidate.profile?.rejectionReasons ?? []) console.log(`    rejects: ${reason}`);
    }
  }
  if (report.deepLinks.length > 0) {
    console.log("Marketplace deep-links (manual download, license check required):");
    for (const link of report.deepLinks) {
      console.log(`  ${link.id}  "${link.title}"  ${link.sourcePage ?? ""}`.trimEnd());
    }
  }
  for (const warning of report.warnings) console.error(`warning: ${warning}`);
}

function print(value: { readonly ok: boolean; readonly messages: readonly string[]; readonly failures?: readonly string[]; readonly warnings?: readonly string[] }): void {
  console.log(JSON.stringify(value, null, 2));
  if (!value.ok) process.exitCode = 1;
}
