import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type Check = {
  name: string;
  ok: boolean;
  details?: Record<string, unknown>;
  error?: string;
};

type PackageJson = {
  name?: string;
  version?: string;
  type?: string;
  exports?: Record<string, unknown>;
  scripts?: Record<string, string>;
  files?: string[];
};

type ReadResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

type CommandEvidence = {
  label: string;
  command: string[];
  cwd: string;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  skipped?: boolean;
  signal?: string;
  error?: string;
};

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolDir, "../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const reportPath = path.join(repoRoot, "tests/reports/game-runtime/package-smoke.json");
const expectedPackageVersion = "1.0.9";
const externalViteExecuteFlag = "--execute-external-vite";
const executeExternalViteSmoke = process.argv.includes(externalViteExecuteFlag);
const externalViteCommandTimeoutMs = 300_000;
const execFileAsync = promisify(execFile);

const requiredRootGameImports = [
  "AnimationController",
  "collectAuraSceneEvidence",
  "createAuraApp",
  "createAnimationController",
  "game",
  "gameAssetValidation",
  "lights",
  "model",
  "quaterniusGameReadyFighterValidationContract",
  "scene",
  "validateQuaterniusGameReadyFighterAsset"
] as const;

const requiredGameRuntimeSourceUses = [
  "collectAuraSceneEvidence(",
  "createAuraApp(",
  "createAnimationController(",
  "animation.crossFade(",
  "animation.restart(",
  "animation.onEvent(",
  "animation.setLayerWeight(",
  "animation.diagnostics(",
  "gameAssetValidation.quaterniusGameReadyFighter",
  "quaterniusGameReadyFighterValidationContract",
  "validateQuaterniusGameReadyFighterAsset.name",
  "game.runtimeNode(",
  "game.input(",
  "game.evidence(app)",
  "app.nodes.require(",
  "app.onFrame(",
  "model(assets.fighter)"
] as const;

const forbiddenConsumerPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "direct-three-import", pattern: /\bfrom\s*["']three(?:["'/])/ },
  { name: "three-examples-import", pattern: /\bthree\/(?:examples|addons)\b/ },
  { name: "three-namespace", pattern: /\bTHREE\./ },
  { name: "gltf-loader", pattern: new RegExp("\\bGLTF" + "Loader\\b") },
  { name: "raw-string-model-id", pattern: /\bmodel\s*\(\s*["'`]/ },
  { name: "unsafe-model-url", pattern: /\bunsafeModelUrl\s*\(/ },
  { name: "raw-github-asset-url", pattern: /\braw\.githubusercontent\.com\b/ },
  { name: "gltf-sample-assets-url", pattern: /\bKhronosGroup\/glTF-Sample-Assets\b/ }
];

const sourceCompleteExpectationGates = [
  {
    id: "external-consumer-public-root-api",
    status: "source-complete-when-present",
    requiredImports: [...requiredRootGameImports],
    requiredSourceUses: [...requiredGameRuntimeSourceUses],
    forbiddenPatterns: forbiddenConsumerPatterns.map(({ name }) => name)
  },
  {
    id: "typed-asset-safe-api",
    status: "source-complete-when-present",
    requiredSourceUses: ["model(assets.fighter)", "game.runtimeNode(\"player\""],
    forbiddenPatterns: ["raw-string-model-id", "unsafe-model-url", "raw-github-asset-url", "gltf-sample-assets-url"]
  },
  {
    id: "source-only-plan-boundary",
    status: "source-complete-when-present",
    requiredSourceUses: ["game.evidence(app)", "app.onFrame(", "input.update(dt)"],
    note: "Without --execute-external-vite this tool emits a source-only external consumer plan; it does not prove package install, typecheck, Vite build, browser rendering, screenshots, deployment, or visual approval."
  }
] as const;

const executionRequiredExpectationGates = [
  {
    id: "external-package-execution",
    status: "execution-required",
    requiredEvidence: [
      "packed tarball path and sha256",
      "fresh temp consumer npm install output",
      "external TypeScript output",
      "external Vite build output"
    ]
  },
  {
    id: "browser-game-runtime-proof",
    status: "execution-required",
    requiredEvidence: [
      "browser route report",
      "frame-loop movement evidence",
      "input/replay evidence",
      "combat/collision event evidence",
      "animation/effects/camera evidence",
      "nonblank screenshot or video artifact"
    ]
  },
  {
    id: "release-proof",
    status: "execution-required",
    requiredEvidence: [
      "CLI asset validation output",
      "deployment route proof",
      "static GLB fetch proof",
      "accessibility evidence",
      "visual approval artifact"
    ]
  }
] as const;

const mainSource = `import {
  AnimationController,
  collectAuraSceneEvidence,
  createAuraApp,
  createAnimationController,
  game,
  gameAssetValidation,
  lights,
  model,
  quaterniusGameReadyFighterValidationContract,
  scene,
  validateQuaterniusGameReadyFighterAsset
} from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_GAME_RUNTIME_PACKAGE_SMOKE__?: unknown;
  }
}

const runtimeScene = scene()
  .add(model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter"] })))
  .add(lights.studio());

const app = createAuraApp("#app", {
  scene: runtimeScene
});

const player = app.nodes.require("player");
const animation = createAnimationController({
  clips: [
    { id: "idle", duration: 1, loop: true, tracks: [], events: [] },
    {
      id: "light",
      duration: 0.28,
      loop: false,
      tracks: [],
      events: [
        { name: "hitStart", time: 0.08 },
        { name: "hitEnd", time: 0.18 }
      ],
      layer: "upper-body",
      restartFromFrameZero: true
    }
  ],
  requiredClips: ["idle", "light"],
  layers: [
    { id: "base", role: "locomotion", bodyMask: "lower-body" },
    { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
  ],
  retarget: {
    source: "external-humanoid-library",
    constraints: ["explicit-humanoid-bone-map", "matching-rest-pose", "uniform-scale"],
    boneMap: [
      { source: "hips", target: "hips", required: true },
      { source: "spine", target: "spine", required: true },
      { source: "head", target: "head", required: true }
    ]
  }
});
const animationEvents: string[] = [];
animation.onEvent((event) => animationEvents.push(event.event.name));
animation.play("idle", { restart: true, layer: "base" });
animation.restart("idle");
animation.crossFade("light", 0.08, { restart: true, layer: "upper-body" });
animation.setLayerWeight("upper-body", 1);
const animationDiagnostics = animation.diagnostics({ requireSkeleton: false });
const input = game.input({
  actions: {
    moveLeft: ["KeyA", "ArrowLeft"],
    moveRight: ["KeyD", "ArrowRight"],
    light: ["KeyJ"]
  },
  axes: {
    moveX: { negative: "moveLeft", positive: "moveRight" }
  }
});

window.__AURA3D_GAME_RUNTIME_PACKAGE_SMOKE__ = {
  schema: "a3d-game-runtime-external-vite-package-smoke/app-evidence",
  runtimeNodeId: "player",
  typedAssets: ["fighter"],
  animationControllerClass: AnimationController.name,
  animationControllerReady: animation instanceof AnimationController,
  animationSnapshot: animation.snapshot(),
  animationEvents,
  animationDiagnostics,
  gameAssetValidationContract: gameAssetValidation.quaterniusGameReadyFighter.kind,
  quaterniusContract: quaterniusGameReadyFighterValidationContract.kind,
  quaterniusValidationHelper: validateQuaterniusGameReadyFighterAsset.name,
  sceneEvidence: collectAuraSceneEvidence(runtimeScene.toJSON()),
  runtimeEvidence: game.evidence(app)
};

app.onFrame(({ dt }) => {
  input.update(dt);
  player.translate(input.axis("moveX") * dt * 1.5, 0, 0);
  if (input.pressed("light")) {
    player.play("light", { restart: true, speed: 1.2 });
  }
});
`;

const auraAssetsSource = `import type { model } from "@aura3d/engine";

const generatedFighterAsset = {} as Parameters<typeof model>[0];

export const assets = {
  fighter: generatedFighterAsset
} as const;
`;

const viteConfigSource = `import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@aura3d/engine"]
  },
  server: {
    host: "127.0.0.1"
  }
});
`;

const indexHtmlSource = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aura3D game runtime package smoke</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

function addCheck(
  checks: Check[],
  name: string,
  ok: boolean,
  details?: Record<string, unknown>,
  error?: string
): void {
  checks.push({
    name,
    ok,
    ...(details ? { details } : {}),
    ...(error ? { error } : {})
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

function packageExportPathToAbsolute(exportPath: string): string {
  return path.join(repoRoot, exportPath.replace(/^\.\//, ""));
}

async function readText(filePath: string): Promise<ReadResult> {
  try {
    return { ok: true, text: await readFile(filePath, "utf8") };
  } catch (error) {
    return { ok: false, error: formatError(error) };
  }
}

function hasSymbol(text: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`).test(text);
}

function parseRootNamedImports(source: string): string[] {
  const names = new Set<string>();
  const importMatches = source.matchAll(
    /import\s+(?:type\s+)?\{\s*([^}]+)\s*\}\s*from\s*["']@aura3d\/engine["']/gs
  );

  for (const match of importMatches) {
    for (const rawName of match[1].split(",")) {
      const name = rawName.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

function parseAuraImportSpecifiers(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/\bfrom\s*["'](@aura3d\/engine[^"']*)["']/g)].map((match) => match[1])
    )
  ].sort();
}

function parseModelCallArguments(source: string): string[] {
  return [...source.matchAll(/\bmodel\s*\(([^)]*)\)/g)].map((match) => match[1].trim());
}

function createTempConsumerFiles(packageDependency: string): Record<string, string> {
  const consumerPackageJson = {
    name: "aura3d-game-runtime-package-smoke-consumer",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 127.0.0.1"
    },
    dependencies: {
      "@aura3d/engine": packageDependency
    },
    devDependencies: {
      typescript: "^5.8.0",
      vite: "^6.0.0"
    }
  };

  const tsconfigJson = {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      module: "ESNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      skipLibCheck: true,
      moduleResolution: "Bundler",
      strict: true,
      noEmit: true
    },
    include: ["src"]
  };

  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(consumerPackageJson, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify(tsconfigJson, null, 2)}\n`,
    "vite.config.ts": viteConfigSource,
    "index.html": indexHtmlSource,
    "src/aura-assets.ts": auraAssetsSource,
    "src/main.ts": mainSource
  };

  return files;
}

async function writeTempConsumer(
  tempConsumerDir: string,
  packageDependency = `file:${repoRoot}`
): Promise<Record<string, string>> {
  const files = createTempConsumerFiles(packageDependency);

  await mkdir(path.join(tempConsumerDir, "src"), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([fileName, contents]) =>
      writeFile(path.join(tempConsumerDir, fileName), contents, "utf8")
    )
  );

  return files;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tail(value: unknown, lines = 24): string {
  const text = typeof value === "string" ? value : Buffer.isBuffer(value) ? value.toString("utf8") : "";
  return text.split(/\r?\n/).slice(-lines).join("\n").trim();
}

function skippedCommand(label: string, command: string[], cwd: string, reason: string): CommandEvidence {
  return {
    label,
    command,
    cwd,
    exitCode: null,
    durationMs: 0,
    stdoutTail: "",
    stderrTail: "",
    skipped: true,
    error: reason
  };
}

async function runCommand(label: string, command: string[], cwd: string): Promise<CommandEvidence> {
  const [executable, ...args] = command;
  if (!executable) {
    return skippedCommand(label, command, cwd, "empty command");
  }

  const startedAt = Date.now();
  try {
    const result = await execFileAsync(executable, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: externalViteCommandTimeoutMs
    });

    return {
      label,
      command,
      cwd,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr)
    };
  } catch (error) {
    const execError = error as Error & {
      code?: number | string;
      signal?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };

    return {
      label,
      command,
      cwd,
      exitCode: typeof execError.code === "number" ? execError.code : null,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(execError.stdout),
      stderrTail: tail(execError.stderr),
      ...(execError.signal ? { signal: execError.signal } : {}),
      error: formatError(error)
    };
  }
}

function plannedExternalViteCommands(tarballPath = "<packed-aura3d-engine.tgz>"): Record<string, string[]> {
  return {
    pack: ["npm", "pack", "--pack-destination", "<temp-pack-dir>", "--silent"],
    install: ["npm", "install", "--no-audit", "--no-fund"],
    typecheck: ["npm", "exec", "tsc", "--", "--noEmit", "--pretty", "false"],
    viteBuild: ["npm", "exec", "vite", "--", "build", "--logLevel", "warn"],
    packageDependency: [`file:${tarballPath}`]
  };
}

async function collectExternalViteSmokeEvidence(packageName: string): Promise<Record<string, unknown>> {
  const plannedFiles = createTempConsumerFiles("file:<packed-aura3d-engine.tgz>");
  const fileHashes = Object.fromEntries(
    Object.entries(plannedFiles).map(([fileName, contents]) => [fileName, `sha256:${hashText(contents)}`])
  );
  const baseEvidence = {
    schema: "a3d-game-runtime-external-vite-package-smoke",
    packageName,
    executeFlag: externalViteExecuteFlag,
    freshExternalViteApp: true,
    packageSource: "npm-pack-current-checkout",
    consumerKind: "external-vite-typescript-app",
    sourceFiles: Object.keys(plannedFiles).sort(),
    sourceFileHashes: fileHashes,
    plannedCommands: plannedExternalViteCommands()
  };

  if (!executeExternalViteSmoke) {
    return {
      ...baseEvidence,
      mode: "source-only-plan",
      ok: null,
      commands: [],
      note: `Pass ${externalViteExecuteFlag} to pack the current checkout, install it in a fresh temp Vite app, run TypeScript and Vite build checks, and write command evidence.`
    };
  }

  let tempRoot: string | undefined;
  const commands: CommandEvidence[] = [];
  const cleanup: Record<string, unknown> = {
    attempted: false,
    ok: null
  };
  const issues: string[] = [];
  let tarballPath: string | undefined;
  let tarballSha256: string | null = null;
  let appDir: string | undefined;

  try {
    tempRoot = await mkdtemp(path.join(tmpdir(), "aura3d-game-runtime-external-vite-smoke-"));
    const packDir = path.join(tempRoot, "pack");
    appDir = path.join(tempRoot, "consumer");
    await mkdir(packDir, { recursive: true });
    await mkdir(appDir, { recursive: true });

    const packCommand = ["npm", "pack", "--pack-destination", packDir, "--silent"];
    const packResult = await runCommand("npm-pack-current-checkout", packCommand, repoRoot);
    commands.push(packResult);

    if (packResult.exitCode === 0) {
      const packedFile = packResult.stdoutTail
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1);
      if (packedFile) {
        tarballPath = path.join(packDir, packedFile);
        try {
          tarballSha256 = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
        } catch (error) {
          issues.push(`packed tarball could not be hashed: ${formatError(error)}`);
        }
      } else {
        issues.push("npm pack did not emit a tarball filename.");
      }
    }

    if (tarballPath && tarballSha256 && appDir) {
      const tempFiles = await writeTempConsumer(appDir, `file:${tarballPath}`);
      const packageFile = JSON.parse(tempFiles["package.json"]) as { dependencies?: Record<string, string> };
      if (packageFile.dependencies?.["@aura3d/engine"] !== `file:${tarballPath}`) {
        issues.push("external Vite consumer did not point @aura3d/engine at the packed tarball.");
      }
    }

    const installCommand = ["npm", "install", "--no-audit", "--no-fund"];
    const typecheckCommand = ["npm", "exec", "tsc", "--", "--noEmit", "--pretty", "false"];
    const viteBuildCommand = ["npm", "exec", "vite", "--", "build", "--logLevel", "warn"];

    if (issues.length === 0 && appDir) {
      commands.push(await runCommand("external-vite-npm-install", installCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-npm-install", installCommand, appDir ?? "<consumer>", issues.join("; ")));
    }

    if (commands.every((command) => command.exitCode === 0) && appDir) {
      commands.push(await runCommand("external-vite-typecheck", typecheckCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-typecheck", typecheckCommand, appDir ?? "<consumer>", "prior package install smoke step failed"));
    }

    if (commands.every((command) => command.exitCode === 0) && appDir) {
      commands.push(await runCommand("external-vite-build", viteBuildCommand, appDir));
    } else {
      commands.push(skippedCommand("external-vite-build", viteBuildCommand, appDir ?? "<consumer>", "prior package install smoke step failed"));
    }
  } catch (error) {
    issues.push(formatError(error));
  } finally {
    if (tempRoot) {
      cleanup.attempted = true;
      try {
        await rm(tempRoot, { recursive: true, force: true });
        cleanup.ok = true;
      } catch (error) {
        cleanup.ok = false;
        cleanup.error = formatError(error);
      }
    }
  }

  const failedCommands = commands.filter((command) => command.exitCode !== 0);
  const ok = issues.length === 0 && failedCommands.length === 0 && tarballSha256 !== null;

  return {
    ...baseEvidence,
    mode: "executed",
    ok,
    tempRoot,
    appDir,
    tarballPath,
    tarballSha256,
    commands,
    failedCommands: failedCommands.map((command) => command.label),
    issues,
    cleanup
  };
}

async function runSmoke(): Promise<Record<string, unknown>> {
  const checks: Check[] = [];
  let packageJson: PackageJson = {};
  let rootExport: unknown;
  let tempConsumerDir: string | undefined;
  let externalViteSmoke: Record<string, unknown> | undefined;
  const cleanup: Record<string, unknown> = {
    attempted: false,
    ok: null
  };

  try {
    const packageJsonRaw = await readFile(packageJsonPath, "utf8");
    packageJson = JSON.parse(packageJsonRaw) as PackageJson;
    rootExport = isRecord(packageJson.exports) ? packageJson.exports["."] : undefined;

    addCheck(checks, "package-name-is-root-engine-package", packageJson.name === "@aura3d/engine", {
      actual: packageJson.name
    });

    addCheck(checks, "package-is-esm", packageJson.type === "module", {
      actual: packageJson.type
    });

    addCheck(checks, "package-version-is-current-aura3d-release", packageJson.version === expectedPackageVersion, {
      expected: expectedPackageVersion,
      actual: packageJson.version
    });

    const script = packageJson.scripts?.["game-runtime:package"];
    const rawScript = packageJson.scripts?.["game-runtime:package:raw"];
    addCheck(
      checks,
      "game-runtime-package-script-runs-this-tool-after-build",
      typeof script === "string" &&
        script.includes("pnpm game-runtime:package:raw") &&
        typeof rawScript === "string" &&
        rawScript.startsWith("pnpm build &&") &&
        rawScript.includes("tools/game-runtime-package-smoke/index.ts") &&
        rawScript.includes(externalViteExecuteFlag),
      { script, rawScript }
    );

    const rootExportRecord = isRecord(rootExport) ? rootExport : {};
    const rootTypes = stringField(rootExportRecord, "types");
    const rootImport = stringField(rootExportRecord, "import");
    const rootBrowser = stringField(rootExportRecord, "browser");
    const rootDefault = stringField(rootExportRecord, "default");

    addCheck(
      checks,
      "root-package-export-points-at-agent-api-dist",
      rootTypes === "./dist/engine/agent-api/index.d.ts" &&
        rootImport === "./dist/engine/agent-api/index.js" &&
        rootBrowser === "./dist/engine/agent-api/index.js" &&
        rootDefault === "./dist/engine/agent-api/index.js",
      {
        types: rootTypes,
        import: rootImport,
        browser: rootBrowser,
        default: rootDefault
      }
    );

    const rootExportTargets = [
      ...new Set([rootTypes, rootImport, rootBrowser, rootDefault].filter((value): value is string => typeof value === "string"))
    ];
    const rootExportReads = await Promise.all(
      rootExportTargets.map(async (exportPath) => ({
        exportPath,
        result: await readText(packageExportPathToAbsolute(exportPath))
      }))
    );
    const missingExportTargets = rootExportReads
      .filter(({ result }) => !result.ok)
      .map(({ exportPath, result }) => ({
        exportPath,
        error: result.ok ? undefined : result.error
      }));

    addCheck(checks, "root-package-export-targets-exist-after-build", missingExportTargets.length === 0, {
      targets: rootExportTargets,
      missing: missingExportTargets
    });

    const declarationRead = rootTypes ? await readText(packageExportPathToAbsolute(rootTypes)) : undefined;
    const runtimeRead = rootImport ? await readText(packageExportPathToAbsolute(rootImport)) : undefined;
    const missingDeclarationSymbols =
      declarationRead?.ok === true
        ? requiredRootGameImports.filter((symbol) => !hasSymbol(declarationRead.text, symbol))
        : [...requiredRootGameImports];
    const missingRuntimeSymbols =
      runtimeRead?.ok === true
        ? requiredRootGameImports.filter((symbol) => !hasSymbol(runtimeRead.text, symbol))
        : [...requiredRootGameImports];

    addCheck(
      checks,
      "root-declarations-expose-game-runtime-imports",
      declarationRead?.ok === true && missingDeclarationSymbols.length === 0,
      {
        required: [...requiredRootGameImports],
        missing: missingDeclarationSymbols
      },
      declarationRead?.ok === false ? declarationRead.error : undefined
    );

    addCheck(
      checks,
      "root-runtime-js-exposes-game-runtime-imports",
      runtimeRead?.ok === true && missingRuntimeSymbols.length === 0,
      {
        required: [...requiredRootGameImports],
        missing: missingRuntimeSymbols
      },
      runtimeRead?.ok === false ? runtimeRead.error : undefined
    );

    tempConsumerDir = await mkdtemp(path.join(tmpdir(), "aura3d-game-runtime-package-smoke-"));
    const tempFiles = await writeTempConsumer(tempConsumerDir, `file:${repoRoot}`);
    const combinedConsumerSource = Object.values(tempFiles).join("\n");
    const consumerPackage = JSON.parse(tempFiles["package.json"]) as {
      private?: boolean;
      type?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const tsconfig = JSON.parse(tempFiles["tsconfig.json"]) as {
      compilerOptions?: Record<string, unknown>;
      include?: string[];
    };

    addCheck(checks, "external-temp-vite-ts-consumer-source-created", true, {
      tempConsumerDir,
      files: Object.keys(tempFiles).sort()
    });

    addCheck(
      checks,
      "external-consumer-package-metadata-uses-root-file-dependency",
      consumerPackage.private === true &&
        consumerPackage.type === "module" &&
        consumerPackage.dependencies?.["@aura3d/engine"] === `file:${repoRoot}` &&
        typeof consumerPackage.devDependencies?.vite === "string" &&
        typeof consumerPackage.devDependencies?.typescript === "string",
      {
        dependency: consumerPackage.dependencies?.["@aura3d/engine"],
        devDependencies: consumerPackage.devDependencies
      }
    );

    addCheck(
      checks,
      "external-consumer-tsconfig-is-bundler-source-only",
      tsconfig.compilerOptions?.moduleResolution === "Bundler" &&
        tsconfig.compilerOptions?.noEmit === true &&
        tsconfig.include?.includes("src") === true,
      {
        moduleResolution: tsconfig.compilerOptions?.moduleResolution,
        noEmit: tsconfig.compilerOptions?.noEmit,
        include: tsconfig.include
      }
    );

    const auraImportSpecifiers = parseAuraImportSpecifiers(combinedConsumerSource);
    const nonRootAuraImportSpecifiers = auraImportSpecifiers.filter(
      (specifier) => specifier !== "@aura3d/engine"
    );

    addCheck(
      checks,
      "external-consumer-imports-root-package-only",
      auraImportSpecifiers.includes("@aura3d/engine") && nonRootAuraImportSpecifiers.length === 0,
      {
        specifiers: auraImportSpecifiers,
        nonRootSpecifiers: nonRootAuraImportSpecifiers
      }
    );

    const rootNamedImports = parseRootNamedImports(mainSource);
    const missingConsumerImports = requiredRootGameImports.filter(
      (name) => !rootNamedImports.includes(name)
    );

    addCheck(
      checks,
      "external-consumer-imports-game-runtime-apis-from-root",
      missingConsumerImports.length === 0,
      {
        required: [...requiredRootGameImports],
        imported: rootNamedImports,
        missing: missingConsumerImports
      }
    );

    const missingGameRuntimeUses = requiredGameRuntimeSourceUses.filter(
      (sourceUse) => !mainSource.includes(sourceUse)
    );

    addCheck(
      checks,
      "external-consumer-uses-game-runtime-source-pattern",
      missingGameRuntimeUses.length === 0,
      {
        requiredUses: [...requiredGameRuntimeSourceUses],
        missing: missingGameRuntimeUses
      }
    );

    const modelCallArguments = parseModelCallArguments(mainSource);
    const nonTypedAssetModelArguments = modelCallArguments.filter(
      (argument) => !/^assets\.[A-Za-z_$][\w$]*$/.test(argument)
    );

    addCheck(
      checks,
      "external-consumer-uses-typed-assets-for-models",
      modelCallArguments.length > 0 && nonTypedAssetModelArguments.length === 0,
      {
        modelCallArguments,
        nonTypedAssetModelArguments
      }
    );

    const forbiddenMatches = forbiddenConsumerPatterns
      .filter(({ pattern }) => pattern.test(combinedConsumerSource))
      .map(({ name }) => name);

    addCheck(
      checks,
      "external-consumer-avoids-three-loaders-and-raw-model-ids",
      forbiddenMatches.length === 0,
      {
        forbiddenMatches,
        checkedPatterns: forbiddenConsumerPatterns.map(({ name }) => name)
      }
    );

    externalViteSmoke = await collectExternalViteSmokeEvidence(packageJson.name ?? "@aura3d/engine");
    const externalViteSmokeMode = externalViteSmoke["mode"];
    const externalViteSmokeOk = externalViteSmoke["ok"];
    addCheck(
      checks,
      executeExternalViteSmoke
        ? "external-vite-package-smoke-executed-and-passed"
        : "external-vite-package-smoke-plan-emitted",
      executeExternalViteSmoke ? externalViteSmokeOk === true : externalViteSmokeMode === "source-only-plan",
      {
        mode: externalViteSmokeMode,
        ok: externalViteSmokeOk,
        executeFlag: externalViteExecuteFlag,
        freshExternalViteApp: externalViteSmoke["freshExternalViteApp"],
        plannedCommands: externalViteSmoke["plannedCommands"]
      }
    );

    if (!executeExternalViteSmoke) {
      addCheck(checks, "source-only-smoke-does-not-run-consumer-commands", true, {
        commandsExecuted: [],
        actions: ["read package metadata", "write temp consumer source", "inspect source text", "write report"],
        executeFlagForLaterEvidence: externalViteExecuteFlag
      });
    }
  } catch (error) {
    addCheck(checks, "game-runtime-package-smoke-tool-completed", false, undefined, formatError(error));
  } finally {
    if (tempConsumerDir) {
      cleanup.attempted = true;
      try {
        await rm(tempConsumerDir, { recursive: true, force: true });
        cleanup.ok = true;
      } catch (error) {
        cleanup.ok = false;
        cleanup.error = formatError(error);
      }
    }
  }

  const passed = checks.every((check) => check.ok);

  return {
    schemaVersion: 1,
    tool: "game-runtime-package-smoke",
    ok: passed,
    status: passed ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    mode: executeExternalViteSmoke ? "external-vite-package-smoke" : "source-only-plan",
    sourceComplete: passed,
    releaseReady: false,
    claimBoundary: executeExternalViteSmoke
      ? "This package smoke can prove packed public API import/install/build behavior for the game-runtime consumer. Browser rendering, screenshots, deployment, accessibility, and visual approval remain separate execution gates."
      : "This package smoke run is a source-only plan. It writes and inspects consumer source but does not run package install, typecheck, Vite build, browser rendering, screenshots, deployment, accessibility, or visual approval.",
    repoRoot,
    reportPath,
    executeExternalViteSmoke,
    externalViteExecuteFlag,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      rootExport,
      gameRuntimePackageScript: packageJson.scripts?.["game-runtime:package"]
    },
    requiredRootGameImports: [...requiredRootGameImports],
    requiredGameRuntimeSourceUses: [...requiredGameRuntimeSourceUses],
    forbiddenConsumerPatterns: forbiddenConsumerPatterns.map(({ name }) => name),
    sourceCompleteExpectationGates,
    executionRequiredExpectationGates,
    tempConsumer: {
      root: tempConsumerDir,
      cleanup
    },
    externalViteSmoke,
    checks
  };
}

async function main(): Promise<void> {
  const report = await runSmoke();
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const status = report.status === "passed" ? "passed" : "failed";
  console.log(
    `game-runtime package smoke ${status}; report written to ${path.relative(repoRoot, reportPath)}`
  );

  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const report = {
    schemaVersion: 1,
    tool: "game-runtime-package-smoke",
    ok: false,
    status: "failed",
    generatedAt: new Date().toISOString(),
    mode: executeExternalViteSmoke ? "external-vite-package-smoke" : "source-only-plan",
    repoRoot,
    reportPath,
    executeExternalViteSmoke,
    externalViteExecuteFlag,
    checks: [
      {
        name: "game-runtime-package-smoke-main",
        ok: false,
        error: formatError(error)
      }
    ]
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(
    `game-runtime package smoke failed; report written to ${path.relative(repoRoot, reportPath)}`
  );
  process.exitCode = 1;
});
