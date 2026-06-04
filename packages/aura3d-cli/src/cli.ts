#!/usr/bin/env node
import {
  addAsset,
  checkDeploy,
  createAssetThumbnails,
  doctor,
  initAgentFiles,
  listAssets,
  scanAssets,
  validateAssets,
  writeTypedAssets,
  readAssetManifest
} from "./index.js";
import { runResolve, runSearch, type CliResolveConstraints } from "./pull-bridge.js";

const args = process.argv.slice(2);

async function main(): Promise<void> {
  const command = args[0];
  if (command === "assets") {
    const action = args[1];
    if (action === "add") {
      const file = args[2];
      const name = readOption("--name");
      if (!file || !name) throw new Error("Usage: aura3d assets add ./model.glb --name robot");
      print(addAsset({ file, name, publicPath: readOption("--public-path"), outputDir: readOption("--output") }));
    } else if (action === "scan") {
      print(scanAssets({ directory: args[2] ?? "assets" }));
    } else if (action === "validate") {
      print(validateAssets());
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
      if (!query || query.startsWith("--")) throw new Error("Usage: aura3d assets search <query> [--license cc0|cc-by] [--max-tris N] [--animated] [--json]");
      const report = await runSearch({ query, constraints: readResolveConstraints() });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printSearchReport(report);
      }
    } else if (action === "resolve") {
      const query = args[2];
      const name = readOption("--name");
      if (!query || query.startsWith("--") || !name) throw new Error("Usage: aura3d assets resolve <query> --name <name> [--license cc0|cc-by] [--max-tris N] [--animated]");
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
  } else if (command === "check-deploy") {
    print(checkDeploy({ distDir: readOption("--dist") }));
  } else if (command === "init") {
    const agent = readOption("--agent") ?? "generic";
    if (!["claude", "cursor", "copilot", "generic", "all"].includes(agent)) throw new Error(`Unsupported agent target: ${agent}`);
    console.log(JSON.stringify({ written: initAgentFiles({ agent: agent as "claude" | "cursor" | "copilot" | "generic" | "all" }) }, null, 2));
  } else {
    console.log(`Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot
  aura3d assets scan ./assets
  aura3d assets validate
  aura3d assets list
  aura3d assets typegen
  aura3d assets thumbnail
  aura3d assets search <query> [--license cc0|cc-by] [--max-tris N] [--animated] [--json]
  aura3d assets resolve <query> --name <name> [--license cc0|cc-by] [--max-tris N] [--animated]
  aura3d doctor
  aura3d check-deploy --dist dist
  aura3d init --agent all`);
  }
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
  return constraints;
}

function printSearchReport(report: { readonly query: string; readonly candidates: readonly { readonly id: string; readonly source: string; readonly title: string; readonly license: string; readonly autoPullable: boolean; readonly sourcePage?: string }[]; readonly deepLinks: readonly { readonly id: string; readonly title: string; readonly sourcePage?: string }[]; readonly warnings: readonly string[]; readonly messages: readonly string[] }): void {
  for (const message of report.messages) console.log(message);
  for (const candidate of report.candidates) {
    const tag = candidate.autoPullable ? "auto-pullable" : "manual license check required";
    console.log(`  [${candidate.source}] ${candidate.id}  "${candidate.title}"  ${candidate.license}  (${tag})`);
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
