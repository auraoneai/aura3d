#!/usr/bin/env node
// Post-pass for the rigged Idol characters Aura Slam drives from code (view/idolAthleteRig.ts, view/idolUmpire.ts):
// drops the in-place Idol clips (the game plays none: every bone is posed by the retarget) and re-optimises the textures to
// 1024 px (the athletes and umpire are ~100-200 px tall under the broadcast camera). The bind skeleton, the normaliser's
// wrapper and the mesh are unchanged. Overwrites the GLB in place.
//
//   node examples/aura-slam/tools/idol-character-pass.mjs examples/aura-slam/assets/idol/<key>.glb [...]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(root, "packages/aura3d-cli/dist/cli.js");
for (const file of process.argv.slice(2)) {
  const abs = resolve(root, file);
  const work = mkdtempSync(join(tmpdir(), "slam-idol-"));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(abs);
  const clips = doc.getRoot().listAnimations();
  for (const a of clips) {
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) { s.getInput()?.dispose(); s.getOutput()?.dispose(); s.dispose(); }
    a.dispose();
  }
  const stripped = join(work, "stripped.glb");
  await io.write(stripped, doc);
  const before = statSync(abs).size;
  const out = join(work, "out.glb");
  execFileSync("node", [cli, "assets", "optimize", "--file", stripped, "--out", out, "--role", "character", "--max-verts", "40000", "--tex", "1024", "--no-simplify"], { cwd: root, stdio: "ignore" });
  renameSync(out, abs);
  rmSync(work, { recursive: true, force: true });
  console.log(`${file}: ${clips.length} clip(s) dropped, ${(before / 1e6).toFixed(2)} -> ${(statSync(abs).size / 1e6).toFixed(2)} MB`);
}
