/**
 * C-39 lane command registrations — prd02 (CONTRACTS.md §C-39).
 * `environments bake` bakes probe assets (specular KTX2 + SH9 + manifest);
 * `migrate lighting` is the physical-units codemod.
 */
import { registerCliCommand, registerCodemod } from "../../contracts/commands.js";
import { runEnvironmentsBake } from "./environmentsBake.js";
import { migrateLightingCodemod } from "./migrateLighting.js";
import { runMigrateLighting } from "./migrateLightingSweep.js";

registerCliCommand({
  name: "migrate lighting",
  owner: "prd02",
  summary: "PRD-02 physical-light-units codemod sweep (report mode by default).",
  usage: "aura3d migrate lighting [dir|glob...] [--report|--write] [--out <dir>]",
  run: runMigrateLighting
});

registerCliCommand({
  name: "environments bake",
  owner: "prd02",
  summary: "Bake an environment probe asset (specular KTX2 + SH9 strip + manifest).",
  usage: "aura3d environments bake --source room [--face-size 256] [--samples 128] [--out public/aura-environments] [--name room-neutral]",
  run: runEnvironmentsBake
});

registerCodemod(migrateLightingCodemod);

export {};
