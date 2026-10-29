// usage (from the repo root): node evidence/strange-orbit-port/audit-fix-2026-10-29/crop.mjs <jpg>...  prints mean luma of fixed regions (menu or race by filename)
import { createRequire } from "node:module";
// Run from the repo root: sharp resolves through the pnpm store there.
import { readdirSync } from "node:fs";
const require = createRequire(`${process.cwd()}/package.json`);
const store = `${process.cwd()}/node_modules/.pnpm`;
const sharpDir = readdirSync(store).find((d) => d.startsWith("sharp@"));
const sharp = require(require.resolve("sharp", { paths: [`${store}/${sharpDir}/node_modules`] }));
const REGIONS = {
  menu: { bike: [620, 350, 910, 525], sky: [900, 180, 1200, 320] },
  race: { rider: [585, 405, 685, 650], pylon: [1090, 20, 1250, 500], sky: [100, 100, 500, 350] }
};
for (const f of process.argv.slice(2)) {
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const kind = f.includes("menu") ? "menu" : "race";
  const out = {};
  let all = 0;
  for (let i = 0; i < data.length; i += info.channels) all += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  out.frame = +(all / (info.width * info.height)).toFixed(2);
  for (const [name, [x0, y0, x1, y1]] of Object.entries(REGIONS[kind])) {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * info.channels;
      s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
    }
    out[name] = +(s / n).toFixed(2);
  }
  console.log(f.split("/").pop(), JSON.stringify(out));
}
