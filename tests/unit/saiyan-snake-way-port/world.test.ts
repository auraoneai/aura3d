import { describe, expect, it } from "vitest";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap.js";
import { HERO_PARTS } from "../../../examples/saiyan-snake-way-port/hero";
import { buildEntityModelNode } from "../../../examples/saiyan-snake-way-port/art/proceduralModels";
import { solidSpec } from "../../../examples/saiyan-snake-way-port/materials";
import { createRun, stepRun, STEP } from "../../../examples/saiyan-snake-way-port/sim";
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

  it("eliminates Surge / gate-crossing camera shake buzz, uses matte 0.84 woven cloth roughness, and sculpts Oni & Sweeper enemies", () => {
    const defaultCloth = solidSpec([0.6, 0.2, 0.2]);
    expect((defaultCloth.uniforms?.surfaceRoughness as { value: number } | undefined)?.value).toBeCloseTo(0.84, 5);

    // Activating Surge and punting entities during Surge keeps S.shake strictly at 0
    const S = createRun();
    S.phase = "run";
    S.time = 8;
    S.s = 160;
    S.ki = 1;
    S.auraLatch = true;
    S.surge = "on";
    S.speed = 92;
    S.shake = 0.5;
    stepRun(S, { taps: [], held: [] }, STEP);
    expect(S.surge).toBe("on");
    expect(S.shake).toBe(0);

    // Consecutive Surge frames crossing gates and increasing auraRung must stay rock-steady (zero camera roll/buzz)
    const world = buildWorld({ look: { mode: "script", pinnedStage: 0 } });
    const poses: { position: [number, number, number]; target: [number, number, number]; up?: [number, number, number]; fov: number }[] = [];
    const makeHandle = () => {
      const h: Record<string, unknown> = {};
      const self = () => h;
      return Object.assign(h, {
        setPosition: self,
        setRotation: self,
        setScale: self,
        setVisible: self,
        setLight: () => undefined,
        setInstanceMatrices: self,
        setUniform: self
      });
    };
    const runtime = world.bind({
      camera: { setPose: (p: (typeof poses)[number]) => { poses.push(p); } },
      nodes: { require: () => makeHandle() }
    } as never);

    for (let f = 0; f < 6; f++) {
      S.s += 1.6;
      S.gateIdx += 2;
      S.auraRung = Math.min(2, f);
      S.shake = 0.6; // even if external caller wrote S.shake, world.ts suppresses it during Surge
      runtime.update(S, STEP, 8 + f * STEP, 16 / 9);
    }
    expect(poses.length).toBe(6);
    // Lateral eye trajectory advances monotonically/smoothly without 61 rad/s alternating buzz
    for (let i = 2; i < poses.length; i++) {
      const prevDy = poses[i - 1]!.position[1] - poses[i - 2]!.position[1];
      const curDy = poses[i]!.position[1] - poses[i - 1]!.position[1];
      expect(Math.abs(curDy - prevDy)).toBeLessThan(0.12);
    }

    // Fierce Oni Warden and Soul-Sweeper Spirit Chariot have high-density multi-material meshes with baked cavity AO
    for (const enemyType of ["oni", "sweeper"] as const) {
      const json = buildEntityModelNode(enemyType, `test-${enemyType}`).toJSON() as unknown as {
        children?: readonly { geometry?: { positions?: ArrayLike<number>; colors?: ArrayLike<number> } }[];
      };
      const prims = (json.children ?? []).filter((c) => c.geometry?.positions);
      expect(prims.length).toBeGreaterThanOrEqual(5);
      const totalVerts = prims.reduce((acc, p) => acc + (p.geometry!.positions!.length / 3), 0);
      expect(totalVerts).toBeGreaterThan(2500);
      expect(prims.some((p) => (p.geometry?.colors?.length ?? 0) > 0)).toBe(true);
    }
  });
});
