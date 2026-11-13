import { describe, expect, it } from "vitest";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { HERO_PARTS } from "../../../examples/saiyan-snake-way-port/hero";
import { createRun } from "../../../examples/saiyan-snake-way-port/sim";
import { CHASE_CAMERA, POOLS, buildWorld } from "../../../examples/saiyan-snake-way-port/world";
import { RUNNER_STYLES } from "../../../examples/saiyan-snake-way-port/styles";

describe("saiyan-snake-way-port world", () => {
  it("builds the scene description without a GPU", () => {
    const world = buildWorld();
    expect(world.scene).toBeDefined();
    expect(typeof world.bind).toBe("function");
  });
  it("mounts sculpted multi-material landmarks, zero static Meshy model nodes, and zero WebGPU custom-shader gaps", () => {
    for (const mode of ["script", "original"] as const) {
      const json = (buildWorld({ look: { mode, pinnedStage: null } }).scene as unknown as {
        toJSON(): { nodes: { kind?: string; name?: string }[]; effects?: { kind?: string; name?: string }[] };
      }).toJSON();
      expect(json.nodes.filter((n) => n.kind === "model")).toEqual([]);
      expect(webgpuCustomShaderGap(json as never)).toBeUndefined();
      if (mode === "script") {
        const names = new Set(json.nodes.map((n) => n.name));
        for (const id of ["serpent-head", "serpent-gatehouse", "serpent-tail-monument", "sanctuary-planetlet", "viaduct-dorsal-spines", "island-0", "lantern-0", "ent-arch-0-0", "ent-barrier-0-0", "ent-oni-0-0", "ent-sweeper-0-0", "ent-feast-0-0"]) {
          expect(names.has(id), id).toBe(true);
        }
        const postNames = (json.effects ?? []).map((e) => e.name);
        expect(postNames).not.toContain("motion blur");
        expect(postNames).not.toContain("outro focus");
      }
    }
  });
  it("pools every entity type the simulation spawns", () => {
    for (const type of ["orb", "soul", "barrier", "arch", "oni", "sweeper", "power", "feast"]) expect(POOLS[type], type).toBeGreaterThan(0);
  });
  it("has unique hero part ids", () => {
    const ids = HERO_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("offers three distinct runner looks with generic names", () => {
    expect(RUNNER_STYLES).toHaveLength(3);
    expect(new Set(RUNNER_STYLES.map((s) => s.gi)).size).toBe(3);
    for (const s of RUNNER_STYLES) expect(`${s.name} ${s.tagline}`).not.toMatch(/goku|saiyan|vegeta|piccolo|namek|kaio/i);
    for (const s of RUNNER_STYLES) {
      const r = (s.gi >> 16) & 255, g = (s.gi >> 8) & 255, b = s.gi & 255;
      expect(r > 150 && g > 50 && g < 120 && b < 70, `${s.name} suit must not be the orange gi`).toBe(false);
      expect(s.sash === 0x2fc8b4 && s.belt === 0x1f7a72, `${s.name} must not pair a teal sash with teal wristbands`).toBe(false);
    }
  });
  it("frames the sculpted runner in the lower third (~22-28% height) with open forward sightlines and updates all 3 styles", () => {
    expect(CHASE_CAMERA.backBase).toBeGreaterThanOrEqual(5.6);
    expect(CHASE_CAMERA.rise).toBeGreaterThanOrEqual(3.2);
    expect(CHASE_CAMERA.ahead).toBeGreaterThanOrEqual(22);

    const world = buildWorld({ look: { mode: "script", pinnedStage: 0 } });
    let lastPose: { position: [number, number, number]; target: [number, number, number]; fov: number } | null = null;
    const baseColors = new Map<string, number[]>();
    const makeHandle = (id: string) => {
      const h: Record<string, unknown> = {};
      const self = () => h;
      Object.assign(h, {
        setPosition: self,
        setRotation: self,
        setScale: self,
        setVisible: self,
        setLight: () => undefined,
        setInstanceMatrices: self,
        setUniform: (name: string, val: unknown) => {
          if (name === "baseColor") baseColors.set(id, val as number[]);
          return h;
        }
      });
      return h;
    };
    const runtime = world.bind({
      camera: { setPose: (p: typeof lastPose) => { lastPose = p; } },
      nodes: { require: (id: string) => makeHandle(id) }
    } as never);

    for (const style of RUNNER_STYLES) {
      runtime.setRunnerStyle(style);
      expect(baseColors.get("r-torso")).toBeDefined();
      expect(baseColors.get("r-collar")).toBeDefined();
      expect(baseColors.get("r-ribbonL")).toBeDefined();
      expect(baseColors.get("r-bootTrimR")).toBeDefined();
      expect(baseColors.get("r-wristL")).toBeDefined();
    }

    for (const [speed, surge, dt] of [[36, "off", 1 / 60], [82, "on", 1 / 60], [82, "on", 1.0]] as const) {
      const S = createRun();
      S.time = 8; // past 4 s intro
      S.s = 120;
      S.speed = speed;
      S.surge = surge;
      S.auraVis = surge === "on" ? 1 : 0;
      runtime.update(S, dt, 8, 16 / 9);
      expect(lastPose).not.toBeNull();

      // Pinhole vertical screen fraction check along chase ray (feet y=0 to hair tips y=2.04 m)
      const back = CHASE_CAMERA.backBase + Math.min(CHASE_CAMERA.backSpeedMax, speed * CHASE_CAMERA.backSpeedFactor);
      const rise = CHASE_CAMERA.rise;
      const dz = -(CHASE_CAMERA.ahead + back);
      const dy = CHASE_CAMERA.aim - rise;
      const len = Math.hypot(dz, dy);
      const vz = dz / len, vy = dy / len;
      const uy = -vz, uz = vy;
      const halfTan = Math.tan(((lastPose!.fov || 62) * Math.PI) / 360);
      const screenY = (worldY: number, worldZ: number): number => {
        const ry = worldY - rise;
        const rz = worldZ - back;
        const camZ = ry * vy + rz * vz;
        const camY = ry * uy + rz * uz;
        return 0.5 - 0.5 * (camY / (camZ * halfTan));
      };
      const feetScreenY = screenY(0, 0);
      const crownScreenY = screenY(2.04, 0);
      const runnerFrac = feetScreenY - crownScreenY;
      expect(runnerFrac).toBeGreaterThanOrEqual(0.22);
      expect(runnerFrac).toBeLessThanOrEqual(0.28);
      expect(crownScreenY).toBeGreaterThan(0.58);
      // Road 12 m ahead projects above the runner's hair tips (zero forward occlusion)
      expect(screenY(0, -12)).toBeLessThan(crownScreenY);
    }
  });
});
