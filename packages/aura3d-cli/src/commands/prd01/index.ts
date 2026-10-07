/**
 * C-39 lane command registrations — PRD 01 (rendering core).
 * `core-v2` codemod: pure transforms live in tools/quality-rebuild-codemods/;
 * `core inspect-programs` prints the C-31 `programs` section of a saved
 * diagnostics JSON (populated once the Phase-3 program generator lands).
 */

import { readFileSync } from "node:fs";
import { registerCliCommand, registerCodemod } from "../../contracts/commands.js";
import { transformCoreV2 } from "../../../../../tools/quality-rebuild-codemods/core-v2.js";

registerCodemod({
  name: "core-v2",
  owner: "prd01",
  description:
    "Aura3D core-v2 migration: pixelRatio overrides → renderer.resolution.{maxPixelRatio|pixelRatio}, " +
    "renderer.qualityProfile → renderer.quality, safe-basic inventory rows, lights.ambient review rows",
  transform: transformCoreV2
});

registerCliCommand({
  name: "core inspect-programs",
  owner: "prd01",
  summary: "Inspect the compiled-program cache reported by a saved diagnostics JSON",
  usage: "aura3d core inspect-programs --diagnostics <path> [--json]",
  async run(argv, io) {
    const at = argv.indexOf("--diagnostics");
    const path = at !== -1 ? argv[at + 1] : undefined;
    if (!path) {
      io.stderr("usage: aura3d core inspect-programs --diagnostics <path>");
      io.stderr("produce one with `?a3d-qr=core` + `JSON.stringify(await app.diagnostics())` once A3D_QR_CORE lands the programs section");
      return 2;
    }
    const diagnostics = JSON.parse(readFileSync(path, "utf8")) as { readonly programs?: unknown };
    if (diagnostics.programs === undefined) {
      io.stdout(JSON.stringify({ programs: null, note: "diagnostics has no programs section — C-31 `programs` populates with the Phase-3 program generator (A3D_QR_CORE)" }, null, 2));
      return 0;
    }
    io.stdout(JSON.stringify(diagnostics.programs, null, 2));
    return 0;
  }
});
