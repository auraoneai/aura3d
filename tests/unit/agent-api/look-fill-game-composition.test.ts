// 4.5.0 regression: a game that composes `looks.preset(<no-HDRI look>, overrides)` with its own authored lights must
// be lit by a fill as bright as the neutral room those looks were lit by on 4.3.7.
//
// The 4.5.0 first cut gave night-city / polar-night / neon-arcade the baked "night" probe and space / underwater the
// "studio" probe. The first frame looked right because the analytic neutral floor is bound until the baked probe
// lands; at steady state the night probe's diffuse irradiance (SH9 DC 0.11 to 0.16) is about 30x below the neutral
// room's (3.76), and Aura Diamond 3D Skyline went from mean luma 68.7 to 5.9. This test measures the probe that is
// finally bound, not the placeholder.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEnvironment, resolveQrFlags } from "@aura3d/engine/contracts";
import "@aura3d/engine/lanes"; // registers the C-09 environment sources
import type { AuraLightNode, AuraSceneSnapshot } from "@aura3d/engine";
import { lights, looks, scene } from "../../../packages/engine/src/agent-api/index";

const NO_HDRI_LOOKS = ["night-city", "polar-night", "neon-arcade", "space", "underwater"] as const;
// Game-style overrides (Aura Diamond 3D: looks.preset(park.look, { fogDensityScale: 0, exposureEv })).
const GAME_OVERRIDES = { fogDensityScale: 0, exposureEv: 0.12 };
const FLAGS = resolveQrFlags({ options: { A3D_QR_LIGHTING: true, A3D_QR_COMPILER: true } });

function sh9Dc(probe: string): number {
  const bytes = readFileSync(resolve(__dirname, `../../../public/aura-environments/${probe}.sh9.f32`));
  const f = new Float32Array(bytes.buffer, bytes.byteOffset, 3);
  return (f[0]! + f[1]! + f[2]!) / 3;
}

const stadiumLights: AuraLightNode[] = [
  { kind: "light", light: "directional", intensity: 0.6, position: [10, 20, 8], shadow: true } as AuraLightNode,
  { kind: "light", light: "spot", intensity: 30, position: [0, 12, 0], angle: 0.6 } as AuraLightNode
];

function gameSnapshot(look: (typeof NO_HDRI_LOOKS)[number]): AuraSceneSnapshot {
  const lookNode = (looks.preset(look, GAME_OVERRIDES) as unknown as { toJSON(): unknown }).toJSON();
  return {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    camera: { mode: "orbit", position: [0, 6, 14], target: [0, 0, 0] },
    nodes: [lookNode, ...stadiumLights] as never,
    diagnostics: { enabled: false }
  };
}

describe("looks.preset fill inside a game-style scene", () => {
  const neutralDc = sh9Dc("neutral");
  for (const id of NO_HDRI_LOOKS) {
    it(`${id} + authored lights binds a fill in the neutral room's range, not the 0.03x night probe`, () => {
      const resolution = resolveEnvironment(gameSnapshot(id), "high", FLAGS);
      expect(resolution.kind, `${id} resolution kind`).toBe("explicit");
      const probe = resolution.probe === "neutral" ? "neutral" : "preset" in (resolution.probe as object) ? (resolution.probe as { preset: string }).preset : "other";
      const irradiance = sh9Dc(probe) * resolution.diffuseIntensity;
      expect(irradiance / neutralDc, `${id} bound probe "${probe}" at diffuse ${resolution.diffuseIntensity}`).toBeGreaterThan(0.6);
      expect(irradiance / neutralDc, `${id} must not overshoot the 4.3.7 neutral room`).toBeLessThan(1.15);
    });
  }
});

// Aura Glint Courier composes neon-arcade with lights.ambient 0.92 and lights.hemisphere 0.85. On 4.3.7 an authored ambient light
// withheld the implicit fill (mean luma 25); stacking the neutral room on it measured 77. The look fill yields the same way.
describe("looks.preset fill and an authored ambient light", () => {
  const envNodes = (snapshot: AuraSceneSnapshot): unknown[] => {
    const out: unknown[] = [];
    const walk = (nodes: readonly unknown[]): void => {
      for (const node of nodes as { kind?: string; children?: unknown[] }[]) {
        if (node.kind === "environment") out.push(node);
        if (Array.isArray(node.children)) walk(node.children);
      }
    };
    walk(snapshot.nodes);
    return out;
  };
  const build = (withAmbient: boolean) => {
    const s = scene().add(looks.preset("neon-arcade", { fogDensityScale: 0, exposureEv: 0.05 }));
    if (withAmbient) s.add(lights.ambient({ color: "#ffe9cc", intensity: 0.92 })).add(lights.hemisphere({ skyColor: "#ffe3b8", groundColor: "#2a3a32", intensity: 0.85 }));
    return s.add(lights.directional({ position: [8, 22, 12], intensity: 1.25, shadow: true })).toJSON();
  };

  it("keeps the fill when the scene authors no ambient light", () => {
    expect(envNodes(build(false))).toHaveLength(1);
  });

  it("drops the fill when the scene authors an ambient light, so the ambient stays the only fill", () => {
    const snapshot = build(true);
    expect(envNodes(snapshot)).toHaveLength(0);
    expect(resolveEnvironment(snapshot, "high", FLAGS).kind).toBe("neutral-room");
  });

  it("never drops an environment the author added", () => {
    const own = scene()
      .add(looks.preset("neon-arcade"))
      .add({ kind: "environment", environment: "neutral", intensity: 0.5, name: "own" } as never)
      .add(lights.ambient({ intensity: 0.5 }))
      .toJSON();
    expect(envNodes(own).map((n) => (n as { name?: string }).name)).toContain("own");
  });
});
