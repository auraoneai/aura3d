/**
 * Lane prd15 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 *
 * T4.7 (§16.3): copies of the two lane-13 lean templates under
 * `tests/qr/prd15/fixtures/lean-templates/`, built from the packed engine +
 * lean tarballs by `tools/packed-consumer-check`, and captured at 1920×1080
 * and 390×844 by `qr-prd15-captures.yml`. `spec` carries the fixture paths so
 * the capture job stays data-driven.
 */
import type { BenchSceneRegistration } from "../../shared/registry";

export const scenes: readonly BenchSceneRegistration[] = [
  {
    id: "prd15-lean-product",
    spec: {
      kind: "lean-template-fixture",
      fixtureDir: "tests/qr/prd15/fixtures/lean-templates/product",
      sourceTemplate: "templates/product-viewer",
      viewports: ["1920x1080", "390x844"],
      reference: "02-pbr-product (three r185)",
      note: "imports @aura3d/lean/product — the deprecated §7.5 shim"
    }
  },
  {
    id: "prd15-lean-minigame",
    spec: {
      kind: "lean-template-fixture",
      fixtureDir: "tests/qr/prd15/fixtures/lean-templates/minigame",
      sourceTemplate: "templates/mini-game",
      viewports: ["1920x1080", "390x844"],
      note: "imports @aura3d/lean/game + §6.7 key light, environment and shadow-receiving ground"
    }
  }
];
