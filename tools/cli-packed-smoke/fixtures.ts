/**
 * Writes the packed-CLI smoke fixtures into a directory (run from the repo with tsx; the CLI under test never
 * imports this). Reuses the WP1/WP3 unit-test builders so the smoke exercises the same inputs the unit tests prove.
 *
 *   tsx --tsconfig tsconfig.base.json tools/cli-packed-smoke/fixtures.ts <dir>
 *
 * Writes: crate.glb (textured box, embedded PNG → G6 decodes it), tri.obj (OBJ cube → assets convert),
 * rig.glb (skinned named humanoid) + walk.bvh (named BVH walk) → animation import --dry-run, atlas.json (flat
 * flipbook grid → vfx validate-atlas).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeFixture } from "../../tests/unit/aura3d-cli/asset-post/fixtures";
import { HUMANOID, buildRigGlb, bvhText, type BvhRot } from "../../tests/unit/aura3d-cli/animation-io/fixtures";

const dir = resolve(process.argv[2] ?? ".");
mkdirSync(dir, { recursive: true });

await writeFixture(dir, "crate.glb", { texture: true });

const cube = [
  "# unit cube", "o cube",
  "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "v 0 0 1", "v 1 0 1", "v 1 1 1", "v 0 1 1",
  "f 1 3 2", "f 1 4 3", "f 5 6 7", "f 5 7 8", "f 1 2 6", "f 1 6 5", "f 4 7 3", "f 4 8 7", "f 1 5 8", "f 1 8 4", "f 2 3 7", "f 2 7 6"
];
writeFileSync(join(dir, "tri.obj"), `${cube.join("\n")}\n`);

writeFileSync(join(dir, "rig.glb"), buildRigGlb(HUMANOID));
const frames: BvhRot[] = Array.from({ length: 31 }, (_, i) => {
  const swing = 30 * Math.sin((i / 30) * Math.PI * 2);
  return { LeftUpLeg: [swing, 0, 0], RightUpLeg: [-swing, 0, 0], LeftArm: [0, 0, -swing / 2], RightArm: [0, 0, swing / 2] };
});
writeFileSync(join(dir, "walk.bvh"), bvhText(HUMANOID, frames));

writeFileSync(join(dir, "atlas.json"), JSON.stringify({ columns: 4, rows: 4, frames: 16 }));
console.log(`fixtures written to ${dir}`);
