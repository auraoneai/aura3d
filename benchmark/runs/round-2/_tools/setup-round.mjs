import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);
const roundRoot = resolve(repoRoot, "benchmark/runs/round-2");
const packageTarball = resolve(roundRoot, "_packages/aura3d-engine-1.0.0.tgz");

const runConfigs = [
  { id: "codex-aura3d", agent: "Codex", library: "Aura3D", context: "aura3d" },
  { id: "codex-threejs", agent: "Codex", library: "Three.js", context: "threejs" },
  { id: "claude-aura3d", agent: "Claude Code", library: "Aura3D", context: "aura3d" },
  { id: "claude-threejs", agent: "Claude Code", library: "Three.js", context: "threejs" }
];

const promptFiles = [
  "01-physics-playground.md",
  "02-particle-fountain.md",
  "03-procedural-solar-system.md",
  "04-neon-tunnel-flythrough.md",
  "05-3d-data-visualization.md",
  "06-mini-golf-hole.md",
  "07-material-lab.md",
  "08-procedural-city-block.md",
  "09-animated-primitive-humanoid.md",
  "10-product-viewer-sneaker.md"
];

function verifyManifest(contextName) {
  const filesDir = resolve(repoRoot, `benchmark/context/${contextName}/files`);
  execFileSync("shasum", ["-a", "256", "-c", "../manifest.sha256"], {
    cwd: filesDir,
    stdio: "pipe"
  });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeScaffold(sourceDir, run, promptNumber) {
  mkdirSync(join(sourceDir, "src"), { recursive: true });
  const isAura = run.library === "Aura3D";
  const packageName = `round2-${run.id}-prompt-${promptNumber}`;
  const dependencies = isAura
    ? { "@aura3d/engine": `file:${packageTarball}` }
    : { three: "0.165.0" };
  const devDependencies = {
    typescript: "^5.8.3",
    vite: "^7.3.2"
  };

  writeJson(join(sourceDir, "package.json"), {
    name: packageName,
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 127.0.0.1",
      typecheck: "tsc --noEmit",
      build: "npm run typecheck && vite build",
      preview: "vite preview --host 127.0.0.1"
    },
    dependencies,
    devDependencies
  });

  writeFileSync(
    join(sourceDir, "index.html"),
    [
      "<!doctype html>",
      "<html lang=\"en\">",
      "  <head>",
      "    <meta charset=\"UTF-8\" />",
      "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "    <title>Aura3D Round 2 Benchmark</title>",
      "  </head>",
      "  <body>",
      "    <div id=\"app\"></div>",
      "    <script type=\"module\" src=\"/src/main.ts\"></script>",
      "  </body>",
      "</html>",
      ""
    ].join("\n")
  );

  writeJson(join(sourceDir, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      module: "ESNext",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      skipLibCheck: true,
      moduleResolution: "Bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      strict: true
    },
    include: ["src"]
  });

  writeFileSync(
    join(sourceDir, "src/main.ts"),
    [
      "// Benchmark scaffold. Replace this file with the requested browser 3D app.",
      ""
    ].join("\n")
  );
}

function writePromptInstruction(promptDir, promptFile) {
  const promptText = readFileSync(resolve(repoRoot, "benchmark/prompts", promptFile), "utf8");
  const instruction = [
    "Provided context bundle path: ./context",
    "Provided clean source directory: ./source",
    "",
    "Use only the provided context bundle and this prompt file. Build a browser 3D",
    "app that satisfies the prompt. Put the app in the provided clean source",
    "directory. Do not search for assets. Prompt 10 may use only",
    "benchmark/assets/sneaker.glb. After implementation, provide the build command,",
    "run command, and any assumptions. Do not edit files outside the source",
    "directory.",
    "",
    "Benchmark process rule: do not leave a long-running dev server attached to",
    "your agent process. You may run finite commands such as npm install, npm run",
    "typecheck, and npm run build. If you start npm run dev or another server for",
    "manual verification, stop it before your final response.",
    "",
    promptText
  ].join("\n");

  writeFileSync(join(promptDir, "prompt.md"), promptText);
  writeFileSync(join(promptDir, "agent-instruction.txt"), instruction);
}

function writeInitialNotes(promptDir, run, promptFile) {
  writeFileSync(
    join(promptDir, "notes.md"),
    [
      `status: prepared`,
      `prompt file: benchmark/prompts/${promptFile}`,
      `agent: ${run.agent}`,
      `library: ${run.library}`,
      `context bundle path: benchmark/context/${run.context}/files`,
      `install command: npm install`,
      `build command: npm run build`,
      `run command: npm run dev -- --port <assigned-port>`,
      `repair turns: 0`,
      ""
    ].join("\n")
  );
}

function hasCompletedAgentRun(promptDir) {
  const metadataPath = join(promptDir, "run-metadata.json");
  if (!existsSync(metadataPath)) return false;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    return metadata.agentExitCode === 0;
  } catch {
    return false;
  }
}

for (const contextName of ["aura3d", "threejs"]) {
  verifyManifest(contextName);
}

if (!existsSync(packageTarball)) {
  mkdirSync(dirname(packageTarball), { recursive: true });
  execFileSync("npm", ["pack", "--pack-destination", dirname(packageTarball)], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

for (const run of runConfigs) {
  for (const promptFile of promptFiles) {
    const promptNumber = promptFile.slice(0, 2);
    const promptDir = resolve(roundRoot, run.id, `prompt-${promptNumber}`);
    const sourceDir = join(promptDir, "source");
    const contextSource = resolve(repoRoot, `benchmark/context/${run.context}/files`);
    const contextDest = join(promptDir, "context");

    if (hasCompletedAgentRun(promptDir)) {
      continue;
    }

    rmSync(promptDir, { recursive: true, force: true });
    mkdirSync(promptDir, { recursive: true });
    cpSync(contextSource, contextDest, { recursive: true });
    writeScaffold(sourceDir, run, promptNumber);
    writePromptInstruction(promptDir, promptFile);
    writeInitialNotes(promptDir, run, promptFile);

    if (promptNumber === "10") {
      const assetDestDir = join(sourceDir, "public/benchmark/assets");
      mkdirSync(assetDestDir, { recursive: true });
      cpSync(resolve(repoRoot, "benchmark/assets/sneaker.glb"), join(assetDestDir, "sneaker.glb"));
    }

    writeJson(join(promptDir, "run-metadata.json"), {
      round: 2,
      runId: run.id,
      agent: run.agent,
      library: run.library,
      contextBundle: `benchmark/context/${run.context}/files`,
      promptFile: `benchmark/prompts/${promptFile}`,
      sourceDirectory: `benchmark/runs/round-2/${run.id}/prompt-${promptNumber}/source`,
      preparedAt: new Date().toISOString()
    });
  }
}

console.log(`Prepared ${runConfigs.length * promptFiles.length} prompt run directories under ${roundRoot}`);
