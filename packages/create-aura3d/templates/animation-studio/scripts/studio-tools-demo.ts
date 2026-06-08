/**
 * studio-tools-demo.ts — proves the Scene-Tool API guardrail.
 *
 * The store/registry must REJECT an edit that leaves the walkable set (a broken scene)
 * and ACCEPT a valid one, with working undo — i.e. there is no path to a broken document.
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/studio-tools-demo.ts
 */

import { moonGardenDocument } from "../src/examples/moon-garden.example.js";
import { EpisodeDocumentStore } from "../src/studio/episode-document-store.js";
import { SceneToolRegistry } from "../src/studio/scene-tool-registry.js";

function main(): void {
  const store = new EpisodeDocumentStore(moonGardenDocument);
  const reg = new SceneToolRegistry(store);
  console.log(`initial revision=${store.currentRevision()} revisions=${store.revisionCount()}`);

  // 1. OFF-SET edit must be REJECTED.
  const offSet = reg.block("miko", "shot-moon-garden-open", [{ time: 0, position: [50, 0, 50], yaw: 0 }], "Loops");
  console.log(`off-set block committed=${offSet.committed} (expect false) :: ${offSet.validation.errors[0] ?? "—"}`);

  // 2. VALID edit must be ACCEPTED.
  const valid = reg.block("miko", "shot-moon-garden-open", [{ time: 0, position: [1.5, 0, 0.5], yaw: 0.4 }], "Loops");
  console.log(`valid block committed=${valid.committed} (expect true) revision=${store.currentRevision()}`);

  // 3. Undo returns to the previous revision.
  const undone = reg.undo();
  const mikoOpen = store
    .current()
    .blocking.find((b) => b.characterId === "miko")
    ?.shots.find((s) => s.shotId === "shot-moon-garden-open")?.waypoints[0]?.position;
  console.log(`undo=${undone} revision=${store.currentRevision()} miko@open=[${mikoOpen?.join(",")}] (expect original [-0.95,0,0])`);

  // 4. A camera edit + a prop placement (valid).
  const cam = reg.camera("shot-moon-garden-open", { preset: "two-shot" });
  const prop = reg.dress({ propId: "mushroom", position: [2.0, 0, 1.0], scale: 0.1, feetOffset: 2.8 });
  console.log(`camera committed=${cam.committed} prop committed=${prop.committed} props=${store.current().setDressing.length}`);

  const ok = offSet.committed === false && valid.committed === true && undone === true && cam.committed && prop.committed;
  console.log(`\nGUARDRAIL ${ok ? "PASS" : "FAIL"} — off-set rejected, valid accepted, undo works, no path to a broken document.`);
  if (!ok) process.exitCode = 1;
}

main();
