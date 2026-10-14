import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(appDir, "../..");
const cli = "packages/aura3d-cli/src/cli.ts";
const definitions = [
  ["courierVan", "public/aura-assets/courierVan.1984ad81.glb", "vehicle", "Daniel Zhabotinsky", "2026-08-21T20:52:03.185Z", "a350a422d200485ea57778dc42139edc", "000-053", "Typed textured delivery van with a readable commercial silhouette, used as the primary route subject through authored arcade handling; no physical vehicle claim."],
  ["courierParcel", "public/aura-assets/courierParcel.b04bff68.glb", "prop", "macriciox", "2026-08-21T22:45:04.198Z", "76fa80950b1f48a8ad6a8441fe443241", "000-089", "Typed textured parcel visibly mounted and unmounted from scene state by pickup and drop events."],
  ["courierTrafficSedan", "public/aura-assets/courierTrafficSedan.69f41bfa.glb", "vehicle", "Daniel Zhabotinsky", "2026-08-21T22:45:21.245Z", "892b2684fb37442299bfad9222cf331c", "000-078", "Typed textured traffic sedan used on seeded authored lane loops; no navigation or physical-driving claim."],
  ["courierTrafficHatch", "public/aura-assets/courierTrafficHatch.ee239312.glb", "vehicle", "Daniel Zhabotinsky", "2026-08-21T22:46:28.398Z", "055ff8a21b8d4d279debca089e2fafcd", "000-125", "Typed textured traffic hatch used on seeded authored lane loops; no navigation or physical-driving claim."],
  ["courierZoneAwning", "public/aura-assets/courierZoneAwning.97e71538.glb", "prop", "Pixel_Monster", "2026-08-21T22:45:26.134Z", "e8720eef53cc4202a44657e28dfbda96", "000-131", "Typed textured awning used as a readable pickup and drop landmark alongside real route-local sensor state."],
  ["courierZoneBollard", "public/aura-assets/courierZoneBollard.a696b2f7.glb", "prop", "chriskujath2", "2026-08-21T22:45:24.572Z", "9b2904585b5f4276982553f45d74c173", "000-131", "Typed textured bollard used as zone and curb set dressing; it is not the sensor or primary subject."]
];

for (const [id, file, role, author, retrievedAt, uuid, shard, suitability] of definitions) {
  const downloadUrl = `https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/${shard}/${uuid}.glb`;
  const result = spawnSync("pnpm", [
    "exec", "tsx", "--tsconfig", "tsconfig.base.json", cli,
    "assets", "add", file, "--name", id, "--type", "model",
    "--license", "CC-BY-4.0", "--license-url", "https://creativecommons.org/licenses/by/4.0/",
    "--source-page", `https://sketchfab.com/3d-models/${uuid}`, "--download-url", downloadUrl,
    "--author", author, "--retrieved-at", retrievedAt, "--quality", "release",
    "--role", role, "--suitability", suitability
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { payload = null; }
  if (payload?.ok !== true) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(`Registered ${id}`);
}
