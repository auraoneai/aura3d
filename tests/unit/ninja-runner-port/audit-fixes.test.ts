import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMERA_CLEARANCE, buildScenery, cameraGap, type ModelSink } from "../../../examples/ninja-runner-port/scenery";
import { MESHY_MANIFEST } from "../../../examples/ninja-runner-port/assets/meshy/manifest";
import { ENEMIES, TUNING, createState, dailySeed, generateEntities, isEnemy, startRun, stepSim, SIM_STEP } from "../../../examples/ninja-runner-port/sim";
import { ENEMY_HINT, OBJECTIVE } from "../../../examples/ninja-runner-port/labels";
import { GameAudio } from "../../../examples/ninja-runner-port/audio";
import { modelMatrix, modelMatrixInto } from "../../../examples/ninja-runner-port/world";

/** Unit coverage for the lane G20 audit fixes (docs/audits/lanes/g20.md). Browser behaviour is in tests/browser/audit-fix/ninja-runner-port.spec.ts. */
const src = (path: string): string => readFileSync(new URL(`../../../examples/ninja-runner-port/${path}`, import.meta.url), "utf8");
const page = readFileSync(new URL("../../../apps/showcase-ninja-runner-port/index.html", import.meta.url), "utf8");

describe("ninja-runner-port audit fixes", () => {
  it("S-01: no page-wide 4.3.0 shadow-fit opt-in, and the sky dome neither casts nor receives", () => {
    const world = src("world.ts");
    expect(world).not.toMatch(/__A3D_SHADOW_FIT__\s*=/);
    expect(world).toMatch(/name: "sky", size: 4000, material: material\.custom\(skySpec\(\)\), castShadow: false, receiveShadow: false/);
  });

  it("S-06: the additive glow spheres (orb, gale star, aura, caster orbs) do not cast sun shadows", () => {
    const world = src("world.ts");
    for (const name of ['"spiralorb"', "`shuriken-${i}`", '"aura"', "`orb-${i}`"]) {
      const line = world.split("\n").find((l) => l.includes(`name: ${name}`) && l.includes("primitives.sphere"));
      expect(line, name).toBeDefined();
      expect(line, name).toContain("castShadow: false");
    }
  });

  it("S-07: the hemisphere light the engine drops next to an environment is gone", () => {
    expect(src("world.ts")).not.toMatch(/lights\.hemisphere\(/);
  });

  it("enemies render from the live state, not the boot state (stale entity map removed)", () => {
    const world = src("world.ts");
    expect(world).not.toMatch(/new Map\(options\.entities\.map/);
    expect(world).toMatch(/inWindow\.get\(id\)/);
  });

  it("S-05: a jump or orb on the title card goes through the countdown, and the countdown ignores actions", () => {
    const main = src("main.ts");
    expect(main).toMatch(/if \(countdown > 0\) return false;/);
    expect(main).toMatch(/if \(z\.phase === "intro"\) \{ if \(action === "spiralorb" \|\| action === "jump"\) \{ startWithCountdown\(\); return true; \} return false; \}/);
  });

  it("S-02 and S-03: hidden tab, blur and a touch pause button pause the run", () => {
    const main = src("main.ts");
    expect(main).toMatch(/visibilitychange/);
    expect(main).toMatch(/addEventListener\("blur"/);
    expect(main).toMatch(/\$\("pause-btn"\)\.addEventListener\("click", \(\) => setPaused\(true\)\)/);
    expect(page).toMatch(/<button id="pause-btn"[^>]*>Pause<\/button>/);
    expect(page).toMatch(/#controls button \{ min-width: 44px; min-height: 44px;/);
  });

  it("S-10: slide, footstep and enemy charge sounds are wired, and the audio holds while paused", () => {
    const main = src("main.ts");
    expect(main).toMatch(/audio\.play\("slide"\)/);
    expect(main).toMatch(/audio\.play\("step"\)/);
    expect(main).toMatch(/CHARGE_SFX\[kind\]/);
    const audio = new GameAudio();
    expect(() => { audio.play("chargeScout"); audio.play("chargeHeavy"); audio.suspend(); audio.release(); }).not.toThrow();
    expect(audio.suspended).toBeNull();
  });

  it("E-01: every enemy kind has a counter hint and the title card states the objective", () => {
    for (const kind of Object.keys(ENEMIES)) expect(ENEMY_HINT[kind as keyof typeof ENEMY_HINT]?.small.length ?? 0, kind).toBeGreaterThan(10);
    expect(OBJECTIVE).toBe("Reach the Valley Gate, 2,640 m.");
    expect(page).toContain(OBJECTIVE);
  });

  it("E-01: rivals charge (approachSpeed > 0) rather than wind up: the hints and cues key on the charge", () => {
    const z = createState();
    startRun(z);
    const charging = new Set<string>();
    let windups = 0;
    for (let i = 0; i < 120 * 30 && z.phase === "running"; i++) {
      stepSim(z, SIM_STEP);
      for (const e of z.entities) if (e.alive && e.approachSpeed > 0) charging.add(e.type);
      for (const ev of z.events) if (ev.type === "enemyWindup") windups++;
      z.events.length = 0;
    }
    expect(windups).toBe(0);
    expect(charging.size).toBeGreaterThanOrEqual(3);
    for (const k of charging) expect(ENEMY_HINT[k as keyof typeof ENEMY_HINT]).toBeDefined();
  });

  it("E-02: phone text is at least 12 px and reduced motion has its own styles", () => {
    expect(page).not.toMatch(/font-size: (10|11)px/);
    expect(page).toMatch(/\.reduced-motion #hurt\.on/);
    expect(src("main.ts")).toMatch(/prefers-reduced-motion: reduce/);
  });

  it("E-04: model matrices are written in place", () => {
    const out = new Array<number>(16).fill(9);
    expect(modelMatrixInto(out, 1, 2, 3, 0.4, 2)).toBe(out);
    expect(out).toEqual(modelMatrix(1, 2, 3, 0.4, 2));
  });

  it("E-05: every scenery model keeps at least 3 m from the camera path (gate and distant ridges excepted)", () => {
    const sink: ModelSink = {};
    buildScenery(sink);
    let checked = 0;
    for (const [id, list] of Object.entries(sink)) {
      if (id === "gate" || id === "ridge") continue;
      for (const p of list) { checked++; expect(cameraGap(p, MESHY_MANIFEST[id]!.size).gap, `${id} at ${p.position.map((v) => v.toFixed(1))}`).toBeGreaterThanOrEqual(CAMERA_CLEARANCE); }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("E-06: the daily seed is the UTC date and its course is complete", () => {
    expect(dailySeed(new Date(Date.UTC(2026, 9, 29, 23, 0)))).toBe(20261029);
    for (const seed of [dailySeed(new Date(Date.UTC(2026, 0, 1))), dailySeed(new Date(Date.UTC(2026, 11, 31)))]) {
      const list = generateEntities(seed);
      expect(list.filter(isEnemy).length).toBeGreaterThan(60);
      expect(list.filter((e) => e.type === "heavy" && e.path).length).toBe(6);
      expect(Math.max(...list.map((e) => e.s))).toBeLessThan(TUNING.length);
    }
  });
});
