// Writes the GU47 per-venue display LUTs (FC47-P2) into public/aura-assets/ and prints their sha256 for
// src/aura-assets-v2.ts. Run from the repo root: node_modules/.bin/tsx apps/showcase-aura-fc-3d/tools/gen-luts.ts
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fcLutCube } from "../src/game/luts";
import { VENUE_ORDER } from "../src/game/content";

for (const venue of VENUE_ORDER) {
  const text = fcLutCube(venue);
  const key = `fcLut${venue[0]!.toUpperCase()}${venue.slice(1)}`;
  writeFileSync(`apps/showcase-aura-fc-3d/public/aura-assets/${key}.cube`, text);
  console.log(key, `sha256-${createHash("sha256").update(text).digest("hex")}`, Buffer.byteLength(text));
}
