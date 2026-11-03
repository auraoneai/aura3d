import { it } from "vitest";
import { glbBaseColorHistogram } from "./native-examples-catalog-template-support.js";
it("coarse", async () => {
  for (const path of [
    "packages/create-aura3d/templates/mini-game/public/aura-assets/kaykit-barbarian.glb",
    "packages/create-aura3d/templates/character-controller/public/aura-assets/auraclash-player-rig.glb",
    "packages/create-aura3d/templates/fighting-game/public/aura-assets/auraclash-rival-rig.glb",
    "packages/create-aura3d/templates/character-viewer/public/aura-assets/kenneyMiniForestCharacterArcher.0fd0f92e.glb"
  ]) {
    const h = await glbBaseColorHistogram(path);
    const coarse = new Map<string, number>();
    for (const [k, v] of h) { const key = k.split(",").map((c) => Math.floor(Number(c) / 48) * 48).join(","); coarse.set(key, (coarse.get(key) ?? 0) + v); }
    console.log(path.split("/").pop(), [...coarse].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v.toFixed(3)}`).join(" "));
  }
}, 120000);
