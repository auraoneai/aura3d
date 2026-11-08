/**
 * B1 — `aura3d import-three`: run a structured three.js scene factory headless,
 * export it through three's GLTFExporter, admit the GLB as a typed asset and
 * emit Aura3D source plus a supported / approximated / unsupported report.
 * Contract and pipeline: `../../import-three/contract.ts`, `../../import-three/run.ts`.
 */

import { registerCliCommand } from "../../contracts/commands.js";
import { importThree } from "../../import-three/run.js";

export const IMPORT_THREE_USAGE =
  "aura3d import-three <factory.mjs> [--name <key>] [--seed <n>] [--params <json>] [--out <dir>] [--stage <dir>] [--three <dir>] [--no-admit] [--license <id>] [--json]";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value !== undefined && !value.startsWith("--") ? value : undefined;
}

const VALUE_FLAGS = new Set(["--name", "--seed", "--params", "--out", "--stage", "--three", "--license"]);

registerCliCommand({
  name: "import-three",
  owner: "b1-bridge",
  summary: "Bridge a three.js scene factory into a typed GLB asset, Aura3D scene source and a compatibility report.",
  usage: IMPORT_THREE_USAGE,
  async run(argv, io) {
    const factory = argv.find((arg, i) => !arg.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1] ?? ""));
    if (!factory || argv.includes("--help")) {
      io.stderr(`usage: ${IMPORT_THREE_USAGE}`);
      return argv.includes("--help") ? 0 : 2;
    }
    const seedText = flag(argv, "--seed");
    const seed = seedText === undefined ? undefined : Number(seedText);
    if (seed !== undefined && !Number.isInteger(seed)) {
      io.stderr("--seed must be an integer");
      return 2;
    }
    const paramsText = flag(argv, "--params");
    let params: Record<string, unknown> | undefined;
    if (paramsText !== undefined) {
      try {
        params = JSON.parse(paramsText) as Record<string, unknown>;
      } catch {
        params = undefined;
      }
      if (params === undefined || params === null || typeof params !== "object" || Array.isArray(params)) {
        io.stderr("--params must be a JSON object");
        return 2;
      }
    }
    const result = await importThree({
      projectDir: io.cwd,
      factory,
      name: flag(argv, "--name"),
      seed,
      params,
      outDir: flag(argv, "--out"),
      stageDir: flag(argv, "--stage"),
      threeDir: flag(argv, "--three"),
      admit: !argv.includes("--no-admit"),
      license: flag(argv, "--license")
    });
    if (argv.includes("--json")) {
      io.stdout(JSON.stringify({ ...result, rows: result.rows }, null, 2));
    } else {
      io.stdout(`import-three ${result.name}: GLB ${result.glbPath} (sha256 ${result.glbSha256.slice(0, 12)})${result.admitted ? ", admitted as assets." + result.name : ""}`);
      io.stdout(`  supported ${result.counts.supported}, approximated ${result.counts.approximated}, unsupported ${result.counts.unsupported} -> ${result.reportPath}`);
      io.stdout(`  ${result.bridgeModule} (regenerated); ${result.sceneModule} ${result.sceneModuleWritten ? "(written)" : "(kept: native edits preserved)"}`);
      io.stdout(`  ids: ${result.ids.kept} kept, ${result.ids.added.length} added, ${result.ids.removed.length} removed${result.ids.removed.length ? ` (${result.ids.removed.join(", ")})` : ""}`);
    }
    return 0;
  }
});
