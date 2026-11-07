// Contact sheet: per game, base | branch side by side. usage (from frames/games): node ../../tools/contact.mjs <out.png> <game> ...
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const [out, ...games] = process.argv.slice(2);
const tiles = [];
for (let i = 0; i < games.length; i++) {
  for (const [j, t] of ["base", "branch"].entries()) {
    tiles.push({ input: await sharp(`${games[i]}.${t}.png`).extract({ left: 0, top: 0, width: 1280, height: 640 }).resize(480, 240).toBuffer(), left: j * 480, top: i * 240 });
  }
}
await sharp({ create: { width: 960, height: 240 * games.length, channels: 3, background: "#000" } }).composite(tiles).png().toFile(out);
