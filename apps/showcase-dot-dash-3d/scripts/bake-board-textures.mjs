// Glint Courier: write the baked PCB maps (GU47 DD47-M1) of every board as PNGs for review and admission checks.
// The game bakes the same maps at runtime (src/game/boardMaterial.ts, three live canvas textures), so nothing here
// ships; the PNGs and the sha256 list are evidence that the bake is deterministic and reads right.
//
// Run from the repo root through vite-node (grid.ts imports the engine source, which needs the repo's Vite aliases):
//   node node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs --config vite.config.ts \
//     apps/showcase-dot-dash-3d/scripts/bake-board-textures.mjs [outDir] [--low]
// outDir defaults to apps/showcase-dot-dash-3d/dist/board-bake (not committed).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { BOARD_BAKE, BOARD_BAKE_LOW, bakeBoardMaps } from "../src/game/boardMaterial.ts";
import { parseMaze } from "../src/game/grid.ts";
import { BOARD_LOOKS, PEDESTALS } from "../src/game/look.ts";
import { MAZES, MAZE_ORDER } from "../src/game/mazes.ts";
import { pylonLayout } from "../src/game/palette.ts";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** RGBA8 (channels 4) or greyscale (channels 1) PNG. */
function png(width, height, pixels, channels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 0;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let r = 0; r < height; r++) {
    raw[r * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + r * stride, stride).copy(raw, r * (stride + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const args = process.argv.slice(2);
const low = args.includes("--low");
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(appDir, "dist", "board-bake"));
mkdirSync(outDir, { recursive: true });
const size = low ? BOARD_BAKE_LOW : BOARD_BAKE;
const manifest = { schema: "aura3d.dot-dash-3d.board-bake/1", width: size.width, height: size.height, boards: {} };
for (const id of MAZE_ORDER) {
  const def = MAZES[id];
  const maps = bakeBoardMaps({
    maze: parseMaze(def),
    look: BOARD_LOOKS[id],
    pads: pylonLayout(def.id, def.theme).map((p) => ({ x: p.x, z: p.z, w: p.w })),
    outlines: PEDESTALS.map(([x, z]) => ({ x, z, w: 1.25 })),
    ...size
  });
  const entry = {};
  for (const [name, pixels, channels] of [["albedo", maps.albedo, 4], ["normal", maps.normal, 4], ["occlusion", maps.occlusion, 4], ["trace-mask", maps.traceMask, 1]]) {
    const file = path.join(outDir, `${id}.${name}.png`);
    writeFileSync(file, png(maps.width, maps.height, pixels, channels));
    entry[name] = createHash("sha256").update(pixels).digest("hex");
  }
  manifest.boards[id] = entry;
  console.log(`baked ${id} ${maps.width}x${maps.height}`);
}
writeFileSync(path.join(outDir, "board-bake.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${outDir}`);
