// Usage: node compare.mjs <before records.json> <after records.json>  -> markdown rows
import { readFileSync } from "node:fs";
const [b, a] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, "utf8")));
const last = (list, game) => list.filter((r) => r.game === game && r.ready !== false).at(-1);
const games = [...new Set([...b.meta, ...a.meta].map((m) => m.game))];
const order = ["top-tennis","roadster-rush","heatsink","teleoperator","iron-crown","pips-big-leap","aura-hoops-3d","aura-diamond-3d","aura-fc-3d","aura-links-3d","bunker-zero","slingshot-siege","dot-dash-3d","cross-hop","strange-orbit-port","splat-rush-port","serpentine-sky-run-port","drift-and-deliver-port","heatsink-port","ninja-runner-port","last-train-port","roadster-hours-port","where-the-wind-wanders-port","silt-and-signal-port","cloud-runner-port"];
console.log("| Game | Path before / after | Luma mean before / after | fps before (rAF) | fps after (rAF) | Fused vs production mean (max) | Repeat noise mean (max) |");
console.log("|---|---|---|---|---|---|---|");
for (const g of order) {
  const mb = last(b.meta, g), ma = last(a.meta, g);
  const bl = [...b.bloom, ...a.bloom].filter((r) => r.game === g && r.fusedVsProduction).at(-1);
  const path = (m) => m ? m.info?.renderPath?.path ?? "?" : "n/a";
  const fps = (m) => m ? `${m.info?.fps} (${m.info?.rafFps})` : "n/a";
  console.log(`| ${g} | ${path(mb)} / ${path(ma)} | ${mb?.luma?.mean ?? "n/a"} / ${ma?.luma?.mean ?? "n/a"} | ${fps(mb)} | ${fps(ma)} | ${bl ? `${bl.fusedVsProduction.mean} (${bl.fusedVsProduction.max})` : (([...b.bloom, ...a.bloom].find((r) => r.game === g)?.skipped) ? "no fused bloom" : "n/a")} | ${bl ? `${bl.noiseFloor.mean} (${bl.noiseFloor.max})` : "n/a"} |`);
}
console.log("\nURL typo:", JSON.stringify(a.url.map((u) => ({ game: u.game, mounted: u.mounted, quality: u.info?.renderPath?.quality, bloomFusion: u.info?.renderPath?.bloomFusion, warnings: u.info?.e1Warnings }))));
console.log("URL typo before:", JSON.stringify(b.url.map((u) => ({ game: u.game, mounted: u.mounted, messages: u.messages }))));
