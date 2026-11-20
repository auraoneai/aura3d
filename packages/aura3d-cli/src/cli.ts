#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import {
  addAssetAsync,
  bindGameRouteEvidence,
  certifyGameGeometry,
  checkDeploy,
  createCharacterAssemblyPlan,
  doctor,
  initAgentFiles,
  initAgentSetup,
  inspectAsset,
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
import {
  ANIMATION_SCRIPT_BY_VERB,
  cliCatalog,
  cliCatalogCommands,
  formatCommandHelp,
  formatGroupHelp,
  mainHelp,
  matchCatalogCommand,
  readCliVersion,
  registeredCommandsHelp,
  unknownCommandMessage
} from "./cli-help.js";
import { monorepoOnlyMessage, unmetMonorepoRule } from "./monorepo-only.js";
import { detectPackageManager, readPackageScripts, runScriptCommand } from "./package-manager.js";
import { writeRouteTypedAssets } from "./asset-route-typegen.js";
import { runBrowserDeployCheck } from "./deploy-browser-check.js";
import { runResolve, runSearch } from "./pull-bridge.js";
import { LADDER_ROLES, printLadderReport, runResolveLadder, type LadderRole } from "./resolve-ladder.js";
import { cliCommandFor, type AuraCliCommand } from "./contracts/commands.js";
import "./commands/registry.js";
import { CERTIFY_CATEGORY_USAGE, isCertifyCategory } from "./commands/assets/certifyCategories.js";
import { ALL_SKIN_CODES, checkAssetSkin, checkProjectSkins, formatProjectSkinReport, parseMaterialMap, readSkinAllowlist, resolveAssetFile, runRepairSkin, SKIN_HELP, type SkinCliOptions } from "./skin/command.js";
import type { SkinCode } from "./skin/analysis.js";

const args = process.argv.slice(2);
const {
  hasFlag,
  readAssetQuality,
  readAssetRole,
  readAssetType,
  readAssetValidationOptions,
  readAudioMetadata,
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
  if (command === "--version" || command === "-v") {
    const { name, version } = readCliVersion();
    console.log(hasFlag("--json") ? JSON.stringify({ name, version }) : version);
    return;
  }
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.exitCode = printHelp(args.slice(1));
    return;
  }
  // `<command> --help` prints that command's usage and never runs it, so no verb can write
  // anything when asked for help (assets typegen/thumbnail/resolve, animation, init, …).
  if (helpRequested) {
    process.exitCode = printHelp(args);
    return;
  }
  // C-39 registry first (longest argv-prefix match): lane verbs and the 5.6.0 work-package verbs
  // resolve here, and a registered verb may replace a built-in of the same name.
  const registered = findRegisteredCommand(args);
  if (registered) {
    process.exitCode = await runRegistered(registered.command, registered.argv);
    return;
  }
  if (command === "assets") {
    const action = args[1];
    if (action === undefined) {
      process.exitCode = printHelp(["assets"]);
      return;
    }
    if (action === "add") {
      const file = args[2];
      const name = readOption("--name");
      if (!file || !name) throw new Error("Usage: aura3d assets add ./model.glb --name robot");
      // PRD-05 §6.4/§12.3 Q-14-1: `release` is admitted through `assets admit`
      // after optimize + look-dev — `assets add` can no longer mint it. The
      // legacy flag stays accepted-with-warning only until register scripts
      // migrate; the qr-prd05-gates workflow greps for any in-repo use.
      const requestedQuality = readAssetQuality();
      const inspectionPolicy = readOption("--model-inspection");
      if (hasFlag("--model-inspection") && inspectionPolicy !== "legacy" && inspectionPolicy !== "strict") {
        throw new Error("Expected --model-inspection legacy|strict.");
      }
      if (requestedQuality === "release" && !hasFlag("--legacy-release-gates")) {
        throw new Error("`assets add --quality release` is retired: use `assets admit <id> --quality release` after optimize + look-dev (PRD-05 §6.4).");
      }
      if (hasFlag("--legacy-release-gates")) {
        console.warn("warning: --legacy-release-gates is deprecated and will be removed; register `prototype`/`candidate` and admit through `assets admit`.");
      }
      print(await addAssetAsync({
        file,
        name,
        type: readAssetType(),
        modelInspection: inspectionPolicy as "legacy" | "strict" | undefined,
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
        quality: requestedQuality,
        role: readAssetRole(),
        suitabilityReason: readOption("--suitability"),
        renderedProbe: readRenderedProbe(),
        orientation: readOrientation(),
        artDirection: readOption("--art-direction"),
        audio: readAudioMetadata()
      }));
    } else if (action === "import-meshy") {
      throw new Error("aura3d assets import-meshy was removed in 5.7.0 (Meshy support is no longer part of Aura3D). Admit a GLB you already have with `aura3d assets add <file.glb> --name <key> ...` (or `aura3d assets convert` for other formats).");
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
      if (!isCertifyCategory(category)) {
        throw new Error(`Usage: aura3d assets certify-game-geometry (--asset <id> | --assets <csv>) --category ${CERTIFY_CATEGORY_USAGE}`);
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
      if (!file) throw new Error("Usage: aura3d assets inspect ./model.glb [--animation] [--humanoid] [--pbr]");
      const inspection = inspectAsset({
        file,
        animation: hasFlag("--animation"),
        humanoid: hasFlag("--humanoid"),
        skeleton: hasFlag("--skeleton"),
        morphs: hasFlag("--morphs"),
        license: hasFlag("--license")
      });
      if (hasFlag("--pbr")) {
        // Lessons A11/A12: per-material metalness/roughness/normal-tilt percentiles, encodings and PBR_* warnings.
        if (!/\.(glb|gltf)$/i.test(file)) throw new Error("assets inspect --pbr needs a .glb or .gltf file.");
        const { measurePbrStats, formatPbrWarnings } = await import("./admission/pbrStats.js");
        const pbr = await measurePbrStats(resolve(process.cwd(), file), { projectDir: process.cwd() });
        const warnings = [...inspection.warnings, ...formatPbrWarnings(pbr.warnings)];
        const report = { ...inspection, ok: warnings.length === 0, pbr: { ...pbr, file: inspection.file }, warnings, messages: warnings.length === 0 ? inspection.messages : warnings };
        print(report);
      } else print(inspection);
    } else if (action === "validate" && hasFlag("--skin")) {
      const skinOptions = readSkinCliOptions();
      const report = checkProjectSkins(process.cwd(), skinOptions);
      if (hasFlag("--json")) console.log(JSON.stringify(report, null, 2));
      else console.log(formatProjectSkinReport(report));
      if (!report.ok) process.exitCode = 1;
    } else if (action === "repair-skin") {
      if (!args[2] || args[2].startsWith("--")) { console.error(SKIN_HELP); process.exitCode = 2; return; }
      const stretch = readOption("--cut-stretch");
      const influences = readOption("--max-influences");
      const result = runRepairSkin(process.cwd(), args[2], {
        out: readOption("--out"),
        normalize: hasFlag("--normalize"),
        ...(influences ? { maxInfluences: Number(influences) } : {}),
        pruneDistant: hasFlag("--prune-distant"),
        smoothBridges: hasFlag("--smooth-bridges"),
        ...(stretch ? { cutStretch: Number(stretch) } : {}),
        rebuildLimbs: hasFlag("--rebuild-limbs"),
        refitSkeleton: hasFlag("--refit-skeleton"),
        ...(readOption("--keep-clips") ? { keepClips: readOption("--keep-clips")!.split(",").map((c) => c.trim()).filter(Boolean) } : {}),
        ...(readOption("--smooth-rounds") ? { smoothRounds: Number(readOption("--smooth-rounds")) } : {}),
        ...(readOption("--smooth-rings") ? { smoothRings: Number(readOption("--smooth-rings")) } : {}),
        ...(readOption("--smooth-threshold") ? { smoothThreshold: Number(readOption("--smooth-threshold")) } : {}),
        materialMap: parseMaterialMap(readOption("--material-map")),
      });
      if (hasFlag("--json")) console.log(JSON.stringify(result, null, 2));
      else for (const message of result.messages) console.log(message);
      if (!result.ok) process.exitCode = 1;
    } else if (action === "validate") {
      // PRD-05 §6.4: `--route apps/<app>` runs the full G1–G11 admission
      // table per referenced asset (async — G6 decodes textures).
      const route = readOption("--route");
      if (route) {
        const { validateRouteAssets } = await import("./admission/routeGates.js");
        const report = await validateRouteAssets({
          projectDir: process.cwd(),
          route,
          release: hasFlag("--release"),
        });
        print(report);
        if (!report.ok) process.exitCode = 1;
      } else if (hasFlag("--pbr")) {
        // Lessons A11/A12: decode every GLB's PBR maps and add PBR_* warnings (advisory; ok is unchanged).
        const options = readAssetValidationOptions();
        const result = validateAssets(options);
        const { pbrValidationWarnings } = await import("./admission/pbrValidate.js");
        const pbrWarnings = await pbrValidationWarnings(process.cwd(), options.assetIds);
        const warnings = [...result.warnings, ...pbrWarnings];
        print({ ...result, warnings, messages: [...result.messages, ...pbrWarnings] });
      } else {
        print(validateAssets(readAssetValidationOptions()));
      }
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
      const skinTarget = readOption("--file") ?? readOption("--asset");
      if (skinTarget) {
        // rigged characters also get the skin check: stretched triangles, flaps, bad weights, bind-pose mismatch
        const file = resolveAssetFile(process.cwd(), skinTarget);
        const skin = checkAssetSkin(skinTarget, file, {}, readSkinAllowlist(process.cwd()));
        const skinFailures = skin.report.findings.filter((f) => f.severity === "error" && !skin.allowed.includes(f.code)).map((f) => f.message);
        const combined = { ...report, ok: report.ok && skin.ok, failures: [...report.failures, ...skinFailures], messages: [...report.messages, ...(skin.ok ? [`skin check passed for ${skinTarget}`] : skinFailures)], skin: skin.report };
        console.log(JSON.stringify(combined, null, 2));
        if (!combined.ok) process.exitCode = 1;
      } else {
        print(report);
      }
    } else if (action === "assemble-character") {
      const name = readOption("--name");
      const body = readOption("--body");
      if (!name || !body) throw new Error("Usage: aura3d assets assemble-character --name hero --body bodyAsset [--part hair=hairAsset] [--part weapon=weaponAsset]");
      print(createCharacterAssemblyPlan({ name, body, parts: readParts("--part"), output: readOption("--output") }));
    } else if (action === "list") {
      console.log(JSON.stringify(listAssets(), null, 2));
    } else if (action === "typegen") {
      const route = readOption("--route");
      if (route) {
        const variant = readOption("--variant") ?? "optimized";
        if (variant !== "optimized" && variant !== "source" && variant !== "mobile") {
          throw new Error(`Usage: aura3d assets typegen --route apps/<app> [--variant optimized|source|mobile]`);
        }
        const report = writeRouteTypedAssets({ route, variant });
        console.log(`Wrote ${report.path} (${report.referencedIds.length} ids from ${report.scannedFiles} files).`);
        console.log(`Wrote ${report.creditsPath}`);
        for (const id of report.missingIds) console.error(`typegen --route: ${id} referenced by route but not in manifest.`);
        if (!report.ok) process.exitCode = 1;
      } else {
        const path = writeTypedAssets(process.cwd(), readAssetManifest(process.cwd()));
        console.log(`Wrote ${path}`);
      }
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
      const rawIndex = readOption("--index");
      const candidateIdOption = readOption("--candidate-id");
      if (rawIndex !== undefined || candidateIdOption !== undefined) {
        // Direct pull of a known open-source candidate (from `assets search --json`).
        if (!query || query.startsWith("--") || !name) throw new Error(`Usage: aura3d assets resolve <query> --name <name> [--profile ${profileUsage()}] [--license cc0|cc-by] [--max-tris N] [--animated] [--index N] [--candidate-id ID]`);
        const candidateIndex = rawIndex === undefined ? undefined : Number(rawIndex);
        if (candidateIndex !== undefined && !Number.isInteger(candidateIndex)) {
          throw new Error(`Aura3D resolve failed: --index must be an integer (got "${rawIndex}").`);
        }
        const report = await runResolve({
          query,
          name,
          constraints: readResolveConstraints(),
          ...(candidateIndex === undefined ? {} : { candidateIndex }),
          ...(candidateIdOption === undefined ? {} : { candidateId: candidateIdOption }),
        });
        if (hasFlag("--json")) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          for (const message of report.messages) console.log(message);
          for (const warning of report.warnings) console.error(`warning: ${warning}`);
        }
        if (!report.ok) process.exitCode = 1;
        return;
      }
      // The build-time ladder: project asset, open source, procedural recipe.
      if (!query || query.startsWith("--")) throw new Error('Usage: aura3d assets resolve "<need>" [--name <id>] [--role hero|prop|background|character|texture|hdri] [--dry-run] [--json]');
      if (readOption("--allow") !== undefined || readOption("--budget") !== undefined) {
        throw new Error("Aura3D resolve failed: --allow and --budget were removed in 5.7.0 with Meshy support. The ladder checks project assets, open sources and procedural recipes; admit a GLB you already have with `aura3d assets add`, or generate one with `aura3d assets generate`.");
      }
      const roleOption = readOption("--role");
      if (roleOption !== undefined && !(LADDER_ROLES as readonly string[]).includes(roleOption)) {
        throw new Error(`Aura3D resolve failed: --role must be one of ${LADDER_ROLES.join(", ")} (got "${roleOption}").`);
      }
      const report = await runResolveLadder({
        need: query,
        ...(name === undefined ? {} : { name }),
        ...(roleOption === undefined ? {} : { role: roleOption as LadderRole }),
        dryRun: hasFlag("--dry-run"),
        constraints: readResolveConstraints(),
      });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printLadderReport(report);
      }
      if (!report.ok) process.exitCode = 1;
    } else {
      // Registered `assets` verbs (admit, review, optimize, …) already dispatched above.
      unknownCommand(args);
    }
  } else if (command === "doctor") {
    if (args.includes("--look")) {
      // Q-05-2 (#243): `doctor --look` forwards to the C-39 `look lint`
      // command — registered doctor rules are hosted there; `doctor` stays
      // the PRD-05 manifest verb.
      const lint = cliCommandFor("look lint");
      // No silent fallback to the manifest doctor: `--look` without the
      // C-39 `look lint` registration is an error.
      if (!lint) throw new Error("aura3d doctor --look: the `look lint` command is not registered (C-39, lane 13).");
      process.exitCode = await lint.run(
        args.slice(1).filter((arg) => arg !== "--look"),
        {
          cwd: process.cwd(),
          stdout: (line) => console.log(line),
          stderr: (line) => console.error(line)
        }
      );
      return;
    }
    print(doctor());
  } else if (command === "animation") {
    await runAnimationCommand(args[1]);
  } else if (command === "check-deploy") {
    const staticResult = checkDeploy({ distDir: readOption("--dist"), ...readAssetValidationOptions() });
    if (!hasFlag("--browser")) {
      print(staticResult);
    } else {
      // Runtime pass: open the built site in a headless browser and fail on HTTP errors, failed requests, uncaught errors and console errors.
      const routes = args.flatMap((arg, index) => (arg === "--route" && args[index + 1] && !args[index + 1]!.startsWith("--") ? [args[index + 1]!] : []));
      const timeout = readOption("--browser-timeout");
      const settle = readOption("--browser-settle");
      const browserResult = await runBrowserDeployCheck({
        distDir: resolve(process.cwd(), readOption("--dist") ?? "dist"),
        routes,
        ...(timeout ? { timeoutMs: Number(timeout) } : {}),
        ...(settle ? { settleMs: Number(settle) } : {})
      }).catch((error: unknown) => ({ ok: false, failures: [String((error as Error).message ?? error)], warnings: [] as string[], routes: [] }));
      const failures = [...staticResult.failures, ...browserResult.failures];
      print({
        ...staticResult,
        ok: failures.length === 0,
        failures,
        warnings: [...staticResult.warnings, ...browserResult.warnings],
        messages: failures.length === 0 ? [`${staticResult.messages.join(" ")} Browser pass: ${browserResult.routes.length} route(s) loaded with no HTTP errors, failed requests or console errors.`] : failures
      });
    }
  } else if (command === "init") {
    const agent = readOption("--agent") ?? "generic";
    if (!["claude", "cursor", "copilot", "generic", "all"].includes(agent)) throw new Error(`Unsupported agent target: ${agent}`);
    const skills = readOption("--skills") ?? "core";
    if (!["core", "all", "none"].includes(skills)) throw new Error(`Unsupported --skills mode: ${skills}. Use core, all, or none.`);
    const setup = initAgentSetup({ agent: agent as "claude" | "cursor" | "copilot" | "generic" | "all", skills: skills as "core" | "all" | "none", template: readOption("--template") });
    console.log(JSON.stringify(setup, null, 2));
  } else {
    // Not built in and not registered: a bare group name (`aura3d look`) lists its commands,
    // anything else is an unknown command (exit 2, with "did you mean").
    unknownCommand(args);
  }
}

const cliIo = { cwd: process.cwd(), stdout: (line: string) => console.log(line), stderr: (line: string) => console.error(line) };

/** Longest registered command whose words prefix argv (up to 4 words); the rest of argv goes to its run(). */
function findRegisteredCommand(argv: readonly string[]): { readonly command: AuraCliCommand; readonly argv: readonly string[] } | undefined {
  for (let words = Math.min(argv.length, 4); words > 0; words--) {
    if (argv.slice(0, words).some((word) => word.startsWith("-"))) continue;
    const command = cliCommandFor(argv.slice(0, words).join(" "));
    if (command) return { command, argv: argv.slice(words) };
  }
  return undefined;
}

/** Runs a registered verb unless it is monorepo-only here, which prints one message and exits 2. */
async function runRegistered(command: AuraCliCommand, argv: readonly string[]): Promise<number> {
  const unmet = unmetMonorepoRule(command.name, argv, process.cwd());
  if (unmet) {
    console.error(monorepoOnlyMessage(command.name, unmet.needs, unmet));
    return 2;
  }
  return command.run(argv, cliIo);
}

/**
 * `aura3d help [words] [--json]` and `aura3d <words> --help`: main help, the full JSON catalog,
 * one command's usage, or a group's command list. Unknown → exit 2 with suggestions.
 */
function printHelp(rawWords: readonly string[]): number {
  const json = rawWords.includes("--json");
  const words = rawWords.filter((word) => !word.startsWith("-"));
  if (words.length === 0) {
    console.log(json ? JSON.stringify(cliCatalog(profileUsage()), null, 2) : mainHelp(profileUsage()) + registeredCommandsHelp());
    return 0;
  }
  const commands = cliCatalogCommands(profileUsage());
  const hit = matchCatalogCommand(words, commands);
  if (hit) {
    if (json) console.log(JSON.stringify(hit, null, 2));
    else if (hit.name === "assets validate" && rawWords.includes("--skin")) console.log(SKIN_HELP);
    else console.log(formatCommandHelp(hit));
    return 0;
  }
  const group = formatGroupHelp(words[0]!, commands);
  if (group && words.length === 1) {
    if (json) console.log(JSON.stringify(commands.filter((entry) => entry.name.startsWith(`${words[0]} `)), null, 2));
    else console.log(group);
    return 0;
  }
  console.error(unknownCommandMessage(words, commands));
  return 2;
}

/** Bare group → its command list (exit 0); anything else → unknown command (exit 2). */
function unknownCommand(argv: readonly string[]): void {
  const words = argv.filter((word) => !word.startsWith("-"));
  const commands = cliCatalogCommands(profileUsage());
  if (words.length === 1 && argv.length === 1) {
    const group = formatGroupHelp(words[0]!, commands);
    if (group) {
      console.log(group);
      return;
    }
  }
  console.error(unknownCommandMessage(argv, commands));
  process.exitCode = 2;
}

async function runAnimationCommand(action: string | undefined): Promise<void> {
  // `aura3d animation <verb>` runs the project's own npm script for that verb (ANIMATION_SCRIPT_BY_VERB);
  // registered `animation <sub>` verbs (inspect-clips, validate-hero, …) were dispatched before this.
  if (action === undefined) {
    process.exitCode = printHelp(["animation"]);
    return;
  }
  const script = ANIMATION_SCRIPT_BY_VERB[action];
  if (!script) {
    unknownCommand(args);
    return;
  }
  const cwd = process.cwd();
  const { manager, reason } = detectPackageManager(cwd);
  // Forward everything AFTER the action to the delegated script (so `aura3d animation scene
  // cast add --query robot` reaches animation-scene.ts intact).
  const forwarded = args.slice(2).filter((a) => a !== "--dry-run");
  const run = runScriptCommand(manager, script, forwarded);
  const scripts = readPackageScripts(cwd);
  const scriptFound = scripts !== undefined && typeof scripts[script] === "string";
  const report = {
    ok: scriptFound,
    command: "animation",
    action,
    delegatedScript: script,
    scriptFound,
    forwardedArgs: forwarded,
    runner: manager,
    runnerReason: reason,
    commandLine: [run.command, ...run.args],
    cwd,
    dryRun: hasFlag("--dry-run")
  };
  if (!scriptFound) {
    const available = scripts ? Object.keys(scripts).sort() : [];
    const error = scripts === undefined
      ? `aura3d animation ${action} runs this project's "${script}" npm script, but ${cwd} has no package.json. Run it from an animation project (npx create-aura3d@latest my-episode --template animation-studio).`
      : `aura3d animation ${action} runs this project's "${script}" npm script, and ${join(cwd, "package.json")} has none${available.length ? ` (scripts: ${available.join(", ")})` : ""}. Run it from a project whose package.json defines "${script}" (npx create-aura3d@latest my-episode --template animation-studio ships "scene").`;
    if (hasFlag("--dry-run") || hasFlag("--json")) console.log(JSON.stringify({ ...report, error }, null, 2));
    else console.error(error);
    process.exitCode = 1;
    return;
  }
  if (hasFlag("--dry-run")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const result = spawnSync(run.command, [...run.args], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? (process.env.AURA3D_DEBUG ? error.stack : error.message) : String(error));
  // Usage errors (missing/invalid arguments) exit 2; failures while running exit 1.
  process.exitCode = error instanceof Error && /^usage:/i.test(error.message) ? 2 : 1;
});

function readSkinCliOptions(): SkinCliOptions {
  const skinValue = hasFlag("--skin") ? readOption("--skin") : undefined;
  const positional = skinValue && !skinValue.startsWith("--") ? skinValue : args[2] && !args[2].startsWith("--") ? args[2] : undefined;
  const clips = readOption("--clips");
  const samples = readOption("--samples");
  const stretch = readOption("--stretch-limit");
  const warnOnly = readOption("--warn-only");
  const known = new Set<string>(ALL_SKIN_CODES);
  const warn = warnOnly ? warnOnly.split(",").map((c) => c.trim()).filter(Boolean) : undefined;
  for (const code of warn ?? []) if (!known.has(code)) throw new Error(`--warn-only: unknown skin code ${code}. Known: ${ALL_SKIN_CODES.join(", ")}`);
  return {
    ...(positional ? { file: positional } : {}),
    assetIds: readAssetValidationOptions().assetIds,
    ...(clips ? { clips: clips.split(",").map((c) => c.trim()).filter(Boolean) } : {}),
    ...(samples ? { samples: Number(samples) } : {}),
    ...(stretch ? { stretchLimit: Number(stretch) } : {}),
    strict: hasFlag("--strict"),
    ...(warn ? { warnOnly: warn as SkinCode[] } : {}),
    json: hasFlag("--json"),
  };
}

function print(value: { readonly ok: boolean; readonly messages: readonly string[]; readonly failures?: readonly string[]; readonly warnings?: readonly string[] }): void {
  console.log(JSON.stringify(value, null, 2));
  if (!value.ok) process.exitCode = 1;
}
