#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  addAsset,
  bindGameRouteEvidence,
  certifyGameGeometry,
  checkDeploy,
  createCharacterAssemblyPlan,
  createAssetThumbnails,
  doctor,
  initAgentFiles,
  inspectAsset,
  importMeshyAsset,
  listAssets,
  scanAssets,
  validateAnimationAssets,
  validateGameAssets,
  validateAssets,
  validateAnimationStudioAssets,
  parseAnimationClipMap,
  writeTypedAssets,
  readAssetManifest
} from "./index.js";
import {
  createCliOptionReaders,
  printSearchReport,
  profileUsage,
} from "./cli-options.js";
import { assetsAddHelp, mainHelp } from "./cli-help.js";
import { runResolve, runSearch } from "./pull-bridge.js";

const args = process.argv.slice(2);
const {
  hasFlag,
  readAssetQuality,
  readAssetRole,
  readAssetType,
  readAssetValidationOptions,
  readCliAssetProfile,
  readEvidenceOutput,
  readInspectFile,
  readOption,
  readOrientation,
  readParts,
  readProvenanceEvidence,
  readRenderedProbe,
  readResolveConstraints,
} = createCliOptionReaders(args);
const helpRequested = hasFlag("--help") || hasFlag("-h");

async function main(): Promise<void> {
  const command = args[0];
  if (command === "assets") {
    const action = args[1];
    if (action === "add") {
      if (helpRequested) {
        console.log(assetsAddHelp());
        return;
      }
      const file = args[2];
      const name = readOption("--name");
      if (!file || !name) throw new Error("Usage: aura3d assets add ./model.glb --name robot");
      print(addAsset({
        file,
        name,
        type: readAssetType(),
        publicPath: readOption("--public-path"),
        outputDir: readOption("--output"),
        sourcePage: readOption("--source-page"),
        downloadUrl: readOption("--download-url"),
        sourceUrl: readOption("--source-url"),
        license: readOption("--license"),
        licenseName: readOption("--license-name"),
        licenseUrl: readOption("--license-url"),
        licenseRaw: readOption("--license-raw"),
        author: readOption("--author"),
        sourceFamily: readOption("--source-family"),
        attribution: readOption("--attribution"),
        provenanceEvidence: readProvenanceEvidence(),
        retrievedAt: readOption("--retrieved-at"),
        quality: readAssetQuality(),
        role: readAssetRole(),
        suitabilityReason: readOption("--suitability"),
        renderedProbe: readRenderedProbe(),
        orientation: readOrientation()
      }));
    } else if (action === "import-meshy") {
      const input = args[2];
      const name = readOption("--name");
      const rightsEvidence = readOption("--rights-evidence");
      if (!input || !name || !rightsEvidence) {
        throw new Error("Usage: aura3d assets import-meshy <output-dir> --name <typedKey> --rights-evidence <rights.json> [--file model.glb] [--thumbnail thumbnail.png] [--profile prop|environment|vehicle|humanoid] [--allowed-root artifacts/meshy] [--quality candidate] [--role prop]");
      }
      const meshyProfile = readOption("--profile");
      if (meshyProfile && !["prop", "environment", "vehicle", "humanoid"].includes(meshyProfile)) {
        throw new Error(`Unsupported Meshy --profile value "${meshyProfile}". Use prop, environment, vehicle, or humanoid.`);
      }
      print(importMeshyAsset({
        input,
        name,
        rightsEvidence,
        file: readOption("--file"),
        thumbnail: readOption("--thumbnail"),
        allowedRoot: readOption("--allowed-root"),
        quality: readAssetQuality(),
        role: readAssetRole(),
        profile: meshyProfile as "prop" | "environment" | "vehicle" | "humanoid" | undefined
      }));
    } else if (action === "scan") {
      print(scanAssets({ directory: args[2] ?? "assets" }));
    } else if (action === "bind-game-route-evidence") {
      const category = readOption("--category");
      const routeId = readOption("--route");
      const assetIds = readOption("--assets")?.split(",").map((id) => id.trim()).filter(Boolean);
      const routePrimaryScreenshot = readOption("--screenshot");
      const geometryReport = readOption("--geometry-report");
      const compositionReport = readOption("--composition-report");
      const visualReview = readOption("--visual-review");
      if ((category !== "racing" && category !== "platformer") || !routeId || !assetIds || !routePrimaryScreenshot || !geometryReport || !compositionReport || !visualReview) {
        throw new Error("Usage: aura3d assets bind-game-route-evidence --route <id> --category racing|platformer --assets <id,id,...> --screenshot <png> --geometry-report <json> --composition-report <json> --visual-review <json>");
      }
      const result = bindGameRouteEvidence({ category, routeId, assetIds, routePrimaryScreenshot, geometryReport, compositionReport, visualReview });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } else if (action === "certify-game-geometry") {
      const assetId = readOption("--asset");
      const assetIds = readOption("--assets")?.split(",").map((id) => id.trim()).filter(Boolean);
      const category = readOption("--category");
      if (category !== "racing" && category !== "platformer") {
        throw new Error("Usage: aura3d assets certify-game-geometry (--asset <id> | --assets <csv>) --category racing|platformer");
      }
      if (Boolean(assetId) === Boolean(assetIds)) {
        throw new Error("Pass exactly one of --asset <id> or read-only --assets <csv>.");
      }
      const result = await certifyGameGeometry({
        category,
        ...(assetId ? { assetId } : { assetIds })
      });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
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
    } else if (action === "validate-animation-studio") {
      print(validateAnimationStudioAssets({ output: readEvidenceOutput(), ...readAssetValidationOptions() }));
    } else if (action === "validate-animation") {
      const clipsFlag = readOption("--clips");
      const clipMap = parseAnimationClipMap(readOption("--map"));
      const requireFlag = readOption("--require");
      const availableClips = clipsFlag ? clipsFlag.split(",").map((c) => c.trim()).filter(Boolean) : Object.values(clipMap);
      const report = validateAnimationAssets({
        availableClips,
        clipMap,
        requiredActions: requireFlag ? requireFlag.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
        requireRig: hasFlag("--require-rig")
      });
      print(report);
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
      if (!query || query.startsWith("--") || !name) throw new Error(`Usage: aura3d assets resolve <query> --name <name> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated] [--index N] [--candidate-id ID]`);
      // `--index` / `--candidate-id` select which ranked candidate to pull. Without them `resolve`
      // always pulls the top match, so an automated screening loop could not try the 2nd/3rd/Nth
      // result that `assets search` reported.
      const rawIndex = readOption("--index");
      const candidateIndex = rawIndex === undefined ? undefined : Number(rawIndex);
      if (candidateIndex !== undefined && !Number.isInteger(candidateIndex)) {
        throw new Error(`Aura3D resolve failed: --index must be an integer (got "${rawIndex}").`);
      }
      const report = await runResolve({
        query,
        name,
        constraints: readResolveConstraints(),
        ...(candidateIndex === undefined ? {} : { candidateIndex }),
        ...(readOption("--candidate-id") === undefined ? {} : { candidateId: readOption("--candidate-id")! }),
      });
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
  } else if (command === "animation") {
    runAnimationCommand(args[1]);
  } else if (command === "check-deploy") {
    print(checkDeploy({ distDir: readOption("--dist"), ...readAssetValidationOptions() }));
  } else if (command === "init") {
    const agent = readOption("--agent") ?? "generic";
    if (!["claude", "cursor", "copilot", "generic", "all"].includes(agent)) throw new Error(`Unsupported agent target: ${agent}`);
    console.log(JSON.stringify({ written: initAgentFiles({ agent: agent as "claude" | "cursor" | "copilot" | "generic" | "all" }) }, null, 2));
  } else {
    console.log(mainHelp(profileUsage()));
  }
}

function runAnimationCommand(action: string | undefined): void {
  const scriptByAction: Record<string, string> = {
    plan: "episode:plan",
    preview: "episode:preview",
    render: "episode:render",
    package: "episode:package",
    review: "episode:review",
    verify: "episode:verify",
    // The agent-native Scene-Tool CLI (#10 promotion): the user's own coding agent drives
    // `aura3d animation scene <new|cast add|prop add|set|block|shot|dialogue|render|...>`.
    scene: "scene"
  };
  const script = action ? scriptByAction[action] : undefined;
  if (!script) {
    throw new Error("Usage: aura3d animation plan|preview|render|package|review|verify|scene [--dry-run]");
  }
  const command = process.env.npm_execpath && process.env.npm_execpath.includes("pnpm")
    ? "pnpm"
    : "npm";
  // Forward everything AFTER the action to the delegated script (so `aura3d animation scene
  // cast add --query robot` reaches animation-scene.ts intact). npm/pnpm both use `--` to
  // pass through args to the script.
  const forwarded = args.slice(2).filter((a) => a !== "--dry-run");
  const commandArgs = [...(command === "pnpm" ? ["run", script] : ["run", script]), ...(forwarded.length ? ["--", ...forwarded] : [])];
  const report = {
    ok: true,
    command: "animation",
    action,
    delegatedScript: script,
    forwardedArgs: forwarded,
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

function print(value: { readonly ok: boolean; readonly messages: readonly string[]; readonly failures?: readonly string[]; readonly warnings?: readonly string[] }): void {
  console.log(JSON.stringify(value, null, 2));
  if (!value.ok) process.exitCode = 1;
}
