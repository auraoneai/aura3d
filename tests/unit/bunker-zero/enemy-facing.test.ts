import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper without types for accessor/nodeIndex/forward
import { accessor, forward, nodeIndex, readGlb } from "../../../tools/aura-fc/glb.mjs";
import { ENEMY_FORWARD, ENEMY_TURN_RATE, enemyFacingError, nextEnemyYaw, simHeading } from "../../../apps/showcase-bunker-zero/src/enemy-facing";

const ASSETS = resolve("apps/showcase-bunker-zero/public/aura-assets");
const FILES: Record<string, string> = { guard: "bzGuardMeshy", gunner: "bzGunnerMeshy", boss: "bzWardenMeshy" };

function glbPath(stem: string): string | null {
  const f = readdirSync(ASSETS).find((n) => n.startsWith(`${stem}.`) && n.endsWith(".glb"));
  return f ? resolve(ASSETS, f) : null;
}

/** +1 when the toes point toward +Z of the model, -1 toward -Z (lowest vertices against the foot bones of the rest pose). */
function toeDirection(path: string): number {
  const glb = readGlb(path);
  const names: string[] = nodeIndex(glb).names;
  const rest = glb.json.nodes.map((n: any) => ({ t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1] }));
  const fk = forward(glb, rest);
  const footZ = (fk.pos[names.indexOf("LeftFoot")][2] + fk.pos[names.indexOf("RightFoot")][2]) / 2;
  const pos = accessor(glb, glb.json.meshes[0].primitives[0].attributes.POSITION);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < pos.count; i++) { ymin = Math.min(ymin, pos.data[i * 3 + 1]); ymax = Math.max(ymax, pos.data[i * 3 + 1]); }
  let sum = 0, n = 0;
  for (let i = 0; i < pos.count; i++) if (pos.data[i * 3 + 1] < ymin + 0.06 * (ymax - ymin)) { sum += pos.data[i * 3 + 2]; n++; }
  return Math.sign(sum / n - footZ);
}

describe("Bunker Zero enemy facing", () => {
  for (const [kind, stem] of Object.entries(FILES)) {
    it(`${kind}: the configured forward axis matches the shipped GLB's toes`, () => {
      const p = glbPath(stem);
      if (!p || !existsSync(p)) return; // GLB not staged (slim context)
      const dir = toeDirection(p);
      expect(ENEMY_FORWARD[kind as keyof typeof ENEMY_FORWARD]).toBe(dir > 0 ? "+z" : "-z");
    });
  }

  it("a drawn enemy faces the player for every compass bearing", () => {
    for (const kind of Object.keys(ENEMY_FORWARD) as Array<keyof typeof ENEMY_FORWARD>) {
      for (let i = 0; i < 48; i++) {
        const simFacing = (i / 48) * Math.PI * 2;
        const h = simHeading(simFacing);                // the sim looks along this world direction
        const yaw = nextEnemyYaw(0, kind, simFacing, 10); // snap (large dt)
        expect(enemyFacingError(yaw, kind, h.x, h.z)).toBeLessThan(1e-9);
      }
    }
  });

  it("turns a half turn away and converges within 0.4 s at the configured turn rate", () => {
    const kind = "guard" as const;
    const simFacing = 1.1, h = simHeading(simFacing);
    let yaw = nextEnemyYaw(0, kind, simFacing, 10) + Math.PI;
    let t = 0;
    while (t < 0.4 - 1e-9) { yaw = nextEnemyYaw(yaw, kind, simFacing, 1 / 60); t += 1 / 60; }
    expect((enemyFacingError(yaw, kind, h.x, h.z) * 180) / Math.PI).toBeLessThan(1);
    expect(ENEMY_TURN_RATE * 0.4).toBeGreaterThan(Math.PI);
  });
});
