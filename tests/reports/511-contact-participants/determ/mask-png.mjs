import sharp from "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-2/node_modules/sharp/lib/index.js";
import fs from "node:fs";
const dir = process.argv[2];
for (const g of ["top-tennis", "aura-hoops-3d", "aura-fc-3d", "roadster-rush"]) {
  const rep = JSON.parse(fs.readFileSync(`${dir}/${g}-report.json`))[g];
  const [w, h] = rep.maskSize ?? [640, 400];
  const buf = fs.readFileSync(`${dir}/${g}/${g}-mask.gray`);
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } }).flip().resize(1280, 800, { kernel: "nearest" }).png().toFile(`${dir}/${g}-mask.png`);
  console.log(g, "excluded:");
  for (const l of rep.logs.filter(l => /CONTACT_SHADOW_PARTIAL/.test(l))) console.log("  ", l.replace(/^warning: \[prd02.contactShadows\] /, ""));
}
