/**
 * Lane prd13 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 *
 * QR-13 pixels: `prd13-neon-arcade` is 01-simple-geometry with the
 * `neon-arcade` look authored when `looks` is on (no HDRI, so it needs no
 * served corpus file). It gives `suite=promote promote_flag=looks` a scene
 * where the flag can change pixels; the base scenes author no look, so
 * flag-on frames there are byte-identical by design. The three.js arm renders
 * the plain spec (no look equivalent), so the score is a pixel-delta probe,
 * not a parity claim.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { sceneSpecs } from "../../shared/scenes";
import type { SceneSpec } from "../../shared/types";

const sceneList: readonly SceneSpec[] = [
  {
    ...sceneSpecs["01-simple-geometry"]!,
    id: "prd13-neon-arcade",
    owner: "prd13",
    title: "Look: neon-arcade",
    purpose: "Base geometry under the neon-arcade look (A3D_QR_LOOKS pixel probe)",
    qrFlags: ["looks"]
  }
];

export const scenes: readonly BenchSceneRegistration[] = sceneList.map((spec) => ({ id: spec.id, spec }));

export function getPrd13Scene(id: string): SceneSpec {
  const spec = sceneList.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown prd13 scene "${id}"`);
  return spec;
}
