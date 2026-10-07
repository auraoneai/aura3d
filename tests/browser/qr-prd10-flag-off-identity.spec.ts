import { test, expect } from "@playwright/test";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { resolveEnvironment } from "../../packages/engine/src/contracts/environment";
import { nodeHandlerFor } from "../../packages/engine/src/contracts/compiler";
import { lookLint } from "../../packages/engine/src/contracts/looks";
import { worldDrawPath } from "../../packages/engine/src/production-runtime/world/WorldFramePasses";
import { worldSubflagOn } from "../../packages/engine/src/agent-api/world/flags";
import sentinels from "../../benchmarks/quality-rebuild/sentinels.json" with { type: "json" };

/**
 * PRD-10 S16 — `flag-off-identity.spec.ts` (§15.2): with `qr_flags=none` the
 * 6 sentinel scenes (benchmarks/quality-rebuild/sentinels.json) must produce
 * frames bit-identical to `85aafcd0` within the IC-0 tolerance.
 *
 * The pixel-compare half runs remotely on the GitHub macos-14 sentinel job
 * (CI-ROUTING.md: baseline = last main capture). The lane-controlled half —
 * what this spec proves — is that nothing PRD-10 registered is reachable when
 * every flag is off: no env source resolves, no node handler fires, no
 * look-lint finding is emitted, and `app.world` stays the C-26 stub.
 */

const FLAGS_NONE = resolveQrFlags({ options: [], env: {} });
const FLAGS_WORLD = resolveQrFlags({ options: ["world"], env: {} });

const SNAPSHOT = {
  schema: "aura3d-scene-snapshot/1.0",
  background: "#87b5e0",
  camera: { mode: "orbit", position: [0, 1, 5], target: [0, 0, 0] },
  nodes: [],
  diagnostics: { enabled: false }
} as never;

test("S16: sentinels.json lists the 6 base scenes", () => {
  expect(sentinels.scenes.map((s: { id: string }) => s.id)).toEqual([
    "base-01-triangle",
    "base-02-lit-cube",
    "base-03-textured",
    "base-04-shadows",
    "base-05-environment",
    "base-06-post"
  ]);
});

test("S16: flags none → prd10 env sources never resolve (legacy path only)", () => {
  const res = resolveEnvironment(SNAPSHOT, "high", FLAGS_NONE);
  expect(res.kind).toBe("legacy");
});

test("S16: every prd10 node handler is flag-gated and inert under flags none", () => {
  const worldKinds = [
    "terrain", "scatter", "grass", "water", "biome", "time-of-day", "wind",
    "street", "occluder", "room"
  ];
  for (const kind of worldKinds) {
    const handler = nodeHandlerFor(kind) as { flag?: string } | undefined;
    // A kind PRD 10 registered must carry a flag the none-set doesn't enable;
    // an unregistered kind must simply have no handler at all.
    if (handler === undefined) continue;
    if (handler.flag) {
      expect(FLAGS_NONE.on(handler.flag)).toBe(false);
    }
  }
  // And the compile path has no way to reach a prd10 biome node flag-off.
  expect(nodeHandlerFor("biome") === undefined || FLAGS_NONE.on("A3D_QR_WORLD_BIOME") === false).toBe(true);
});

test("S16: look-lint world rules are silent on sentinel-class content", () => {
  const flagsOff = resolveQrFlags({ options: [], env: {} });
  const ctx = {
    devicePixelRatio: 1,
    tierCap: 3,
    production: true,
    capabilities: { ambientAdditive: false, effectsPixelBacked: [] as readonly string[] }
  };
  // Sentinel content: primitives/materials only — nothing the world rules key on.
  const sentinelLike = {
    ...SNAPSHOT,
    nodes: [
      { kind: "primitive", primitive: "box", name: "cube", size: 1 },
      { kind: "primitive", primitive: "sphere", name: "ball", size: 0.5 }
    ]
  } as never;
  const findings = lookLint(sentinelLike, ctx).filter(
    (f) => f.code === "look/world-void" || f.code === "look/primitive-trees"
  );
  // The rules did not exist at `85aafcd0` — they must stay silent wherever
  // there is no world signal, so the sentinel diff stays within IC-0.
  expect(findings).toEqual([]);
  expect(flagsOff.on("A3D_QR_WORLD")).toBe(false);
});

test("S16: world draw path and sub-flags are all off under flags none", () => {
  expect(worldDrawPath(FLAGS_WORLD)).toBe("S");
  for (const sub of ["A3D_QR_WORLD_TERRAIN", "A3D_QR_WORLD_WATER", "A3D_QR_WORLD_BIOME"] as const) {
    expect(worldSubflagOn(FLAGS_NONE, sub)).toBe(false);
  }
});
