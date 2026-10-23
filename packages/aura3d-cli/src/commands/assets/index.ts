/**
 * Asset tooling commands: `assets merge-clips`, `meshy ledger`. (`assets optimize --file` extends the prd05 verb and
 * `assets import-meshy --into` extends the built-in import in cli.ts; both reuse the modules in this folder.)
 */

import { registerCliCommand } from "../../contracts/commands.js";
import { meshyLedgerCommand } from "../meshyLedger.js";
import { mergeClipsUsage, mergeGlbClips, parseClipSpec } from "./mergeClips.js";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

registerCliCommand({
  name: "assets merge-clips",
  owner: "assets-tooling",
  summary: "Merge Meshy animate-task clips into one rigged GLB, by node name.",
  usage: mergeClipsUsage(),
  run: async (argv, io) => {
    const base = flag(argv, "--base");
    const out = flag(argv, "--out");
    const valueFlags = new Set(["--base", "--out", "--tex"]);
    const specs = argv.filter((arg, index) => !arg.startsWith("--") && !valueFlags.has(argv[index - 1] ?? ""));
    if (!base || !out || specs.length === 0) {
      io.stderr(`Usage: ${mergeClipsUsage()}`);
      return 2;
    }
    const tex = flag(argv, "--tex");
    const result = await mergeGlbClips({
      projectDir: io.cwd,
      base,
      output: out,
      clips: specs.map(parseClipSpec),
      keepBaseAnimations: argv.includes("--keep-base-animations"),
      ...(tex ? { tex: Number(tex) } : {})
    });
    if (argv.includes("--json")) io.stdout(JSON.stringify(result, null, 2));
    else {
      for (const clip of result.clips) io.stdout(`${clip.name}: ${clip.channels}/${clip.sourceChannels} channels (${clip.missingNodes} unmatched), ${clip.duration.toFixed(2)}s`);
      io.stdout(`wrote ${result.output} (${result.bytes} bytes), animations: ${result.animations.join(", ")}`);
    }
    return 0;
  }
});

registerCliCommand({
  name: "meshy ledger",
  owner: "assets-tooling",
  summary: "Credit ledger for paid Meshy generation: per-game caps, a global cap, safe settlement.",
  usage: "aura3d meshy ledger status|reserve|settle|reconcile|list [--ledger path] [--global-cap N] [--game tag] [--op op] [--cap N] [--est N] [--rid id] [--status s] [--exit-code N] [--task-id id] [--task-status s] [--actual N] [--note text]",
  run: (argv, io) => meshyLedgerCommand(argv, io)
});

export {};
