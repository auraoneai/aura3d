// Full-page luma of decoded JPEG frames (HUD included). Usage: node evidence/thermal-drift/audit-fix/luma.mjs <jpg...>
import sharp from "sharp";
for (const f of process.argv.slice(2)) {
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  let s = 0, n = 0, dark = 0;
  for (let i = 0; i < data.length; i += info.channels) { const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; s += y; n++; if (y <= 8) dark++; }
  console.log(f.split("/").pop(), info.width + "x" + info.height, "mean", (s / n).toFixed(2), "dark", (dark / n).toFixed(4));
}
