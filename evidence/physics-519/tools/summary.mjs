// Summarise every capture report in /tmp/phys519/frames.
import fs from "node:fs";
const dir = "/tmp/phys519/frames";
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const rapier = (r.networkTimeline ?? []).filter((e) => /rapier-[^/]+\.js$/.test(e.url));
  console.log(f.padEnd(48), "rapierFetched:", rapier.length ? `yes @${rapier[0].ms}ms` : "no",
    "| errors:", r.consoleErrors.length, "exc:", r.exceptions.length,
    "| steps:", r.recipe?.stats?.steps ?? "-", "| pos:", JSON.stringify(r.recipe?.positions ?? null),
    r.recipe?.timeline ? `| timeline: ${JSON.stringify(r.recipe.timeline)}` : "");
  if (r.consoleErrors.length || r.exceptions.length) console.log("   ", JSON.stringify([...r.consoleErrors, ...r.exceptions]).slice(0, 400));
}
