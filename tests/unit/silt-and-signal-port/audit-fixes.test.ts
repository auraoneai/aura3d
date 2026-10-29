import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";
import { mergeInput, objectiveHint, pageFlags } from "../../../examples/silt-and-signal-port/controls";
import { JOURNEY_KEY, clearJourney, journeyTotals, ratingOf, readJourney, writeChapter, type StorageLike } from "../../../examples/silt-and-signal-port/journey";
import { IDLE, STEP, createSim, stepSim, targetOf, type Input, type Sim } from "../../../examples/silt-and-signal-port/sim";
import { createTerrain } from "../../../examples/silt-and-signal-port/terrain";
import { chaseEyeBlocked, clearChaseEye, createChaseClearance } from "../../../examples/silt-and-signal-port/camera";
import { buildWorld, MAX_RINGS } from "../../../examples/silt-and-signal-port/world";
import { mapBloomOptionsV2, validatePostEffectNode } from "../../../packages/engine/src/agent-api/postBridge";

/** Regression tests for the live-games audit rows of Duneglide (docs/audits/sections/game-24-silt-and-signal-port.md). */

const FLY: Input = { ...IDLE, throttle: 1 };
const run = (sim: Sim, input: Input, steps: number, each?: (sim: Sim) => void): void => {
  for (let i = 0; i < steps; i++) { stepSim(sim, input, STEP); each?.(sim); }
};

describe("C1 touch players can complete hold objectives", () => {
  it("the Hold button sends interact and brake together, and cancels boost", () => {
    const input = mergeInput({ pointer: { throttle: 1, steer: 0.3, boost: true }, touch: { hold: true } });
    expect(input).toMatchObject({ throttle: 1, steer: 0.3, interact: true, brake: true, boost: false });
    expect(mergeInput({ touch: { boost: true }, pointer: { throttle: 1 } })).toMatchObject({ boost: true, interact: false, brake: false });
  });

  it("keyboard, pad and pointer merge as before (largest axis, buttons OR)", () => {
    const input = mergeInput({ keys: { throttle: 0, steer: -1, interact: true }, pad: { throttle: 0.4, steer: 0.2 }, pointer: { lift: 0.5 } });
    expect(input).toEqual({ throttle: 0.4, steer: -1, lift: 0.5, brake: false, boost: false, interact: true });
  });

  for (const [label, objective, scene] of [["chapter 0 care (board)", 1, "boarding"], ["chapter 0 portal", 3, "departure"]] as const) {
    it(`${label}: a rider arriving at speed with a finger on the canvas completes it by holding the touch button`, () => {
      const sim = createSim(0, objective);
      const p = targetOf(sim.state);
      Object.assign(sim.state, { x: p.x, y: p.y, z: p.z });
      sim.flight.speed = 30;
      const touchHold = mergeInput({ pointer: { throttle: 1 }, touch: { hold: true } });
      let steps = 0;
      while (!sim.state.scene && steps < 900) { stepSim(sim, touchHold, STEP); steps++; }
      expect(sim.state.scene).toBe(scene);
      // the same press without the touch button (canvas finger only) never completes it
      const noButton = createSim(0, objective);
      Object.assign(noButton.state, { x: p.x, y: p.y, z: p.z });
      run(noButton, mergeInput({ pointer: { throttle: 1 } }), 900);
      expect(noButton.state.scene).toBeNull();
    });
  }
});

describe("C2 start=1 is player mode", () => {
  const flags = (q: string) => pageFlags(new URLSearchParams(q));
  it("chapter reloads (`?chapter=N&start=1`) skip the title but keep pause and audio (not QA)", () => {
    expect(flags("?chapter=3&start=1")).toEqual({ qa: false, skipTitle: true });
    expect(flags("")).toEqual({ qa: false, skipTitle: false });
  });
  it("objective, autopilot and manual stay QA modes", () => {
    for (const q of ["?objective=2", "?autopilot=1", "?manual=1&start=1"]) expect(flags(q).qa).toBe(true);
  });
});

describe("C3 chapters 1-6 floor follows the rendered terrain", () => {
  for (let chapter = 1; chapter <= 6; chapter++) {
    it(`chapter ${chapter}: a rider flying off the ring corridor stays 2.4 m above the hills, and the chase eye stays above them`, () => {
      const terrain = createTerrain(chapter);
      const start = CHAPTERS[chapter]!.objectives[0]!.points[0]!;
      // fly west off the corridor, nose down, for 25 s
      const sim = createSim(chapter, 0, undefined, { x: start.x, y: 6, z: start.z, yaw: Math.PI / 2 });
      const clearance = createChaseClearance();
      let worst = Infinity, maxGround = -Infinity, eyeWorst = Infinity;
      run(sim, { ...FLY, lift: -1 }, 1500, (s) => {
        const ground = terrain.heightAt(s.state.x, s.state.z);
        maxGround = Math.max(maxGround, ground);
        worst = Math.min(worst, s.state.y - Math.max(0.6, ground));
        const eye = clearChaseEye(s, clearance, STEP);
        eyeWorst = Math.min(eyeWorst, eye[1] - terrain.heightAt(eye[0], eye[2]));
      });
      expect(worst).toBeGreaterThanOrEqual(2.4 - 1e-9);
      if (chapter !== 6) expect(maxGround).toBeGreaterThan(20);
      // the chase camera eases in when the wanted eye would be inside the hill; it may graze the slope for a frame, never sink into it
      expect(eyeWorst).toBeGreaterThan(-1);
    });
  }

  it("the camera clearance sees the chapter terrain as solid (an eye under a hill counts as blocked)", () => {
    const terrain = createTerrain(1);
    const sim = createSim(1, 0);
    const blocked = chaseEyeBlocked(sim.world);
    expect(blocked(-200, terrain.heightAt(-200, -120) - 2, -120)).toBe(true);
    expect(blocked(-200, terrain.heightAt(-200, -120) + 30, -120)).toBe(false);
  });
});

describe("C6 and C7 chapter props are solid and impacts are reported", () => {
  it("a rider flying into a chapter-1 house is stopped outside it, registers an impact and emits an impact event", () => {
    const house = createTerrain(1).props().houses[0]!;
    const sim = createSim(1, 0, undefined, { x: house.x, y: house.y + 4, z: house.z + 40, yaw: 0 });
    const events: string[] = [];
    let minDistance = Infinity;
    for (let i = 0; i < 600; i++) {
      for (const e of stepSim(sim, FLY, STEP)) events.push(e.type);
      minDistance = Math.min(minDistance, Math.abs(sim.state.z - house.z));
    }
    expect(sim.flight.impacts).toBeGreaterThanOrEqual(1);
    expect(events).toContain("impact");
    // the box half depth is at least 0.49 x scale; the rider never gets to the middle of the house
    expect(minDistance).toBeGreaterThan(0.49 * house.scale);
  });

  it("every chapter's ring path is clear: the reference autopilot line (straight between points) touches no collider at cruise", () => {
    for (let chapter = 1; chapter <= 6; chapter++) {
      const sim = createSim(chapter, 0);
      const colliders = sim.world.colliders ?? [];
      for (const o of CHAPTERS[chapter]!.objectives) {
        for (const p of o.points) {
          const y = Math.max(p.y, 9);
          const inside = colliders.filter((c) => y >= c.bottom && y <= c.top && Math.hypot(p.x - c.x, p.z - c.z) < (c.halfX !== undefined ? Math.hypot(c.halfX, c.halfZ ?? 0) : c.r) + 1.85);
          expect(inside, `chapter ${chapter} ${o.id}`).toEqual([]);
        }
      }
    }
  });
});

describe("C5 journey results sum every chapter", () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };
  it("stores each chapter at its portal and sums them with the final chapter", () => {
    const store = memory();
    writeChapter(store, 0, { elapsed: 300, restored: 4, impacts: 2 });
    writeChapter(store, 1, { elapsed: 250, restored: 4, impacts: 0 });
    writeChapter(store, 1, { elapsed: 200, restored: 4, impacts: 1 }); // a replayed chapter replaces its record
    const totals = journeyTotals(readJourney(store), 6, { elapsed: 100, restored: 5, impacts: 0 });
    expect(totals).toEqual({ elapsed: 600, restored: 13, impacts: 3, chapters: 3 });
    expect(ratingOf(totals.impacts)).toBe("Steady hand");
    clearJourney(store);
    expect(store.data.has(JOURNEY_KEY)).toBe(false);
  });
  it("ignores corrupt or foreign storage", () => {
    const store = memory();
    store.setItem(JOURNEY_KEY, "{not json");
    expect(readJourney(store)).toEqual({});
    store.setItem(JOURNEY_KEY, JSON.stringify({ 9: { elapsed: 1 }, 2: { elapsed: -4, restored: "x", impacts: 3 } }));
    expect(readJourney(store)).toEqual({ 2: { elapsed: 0, restored: 0, impacts: 3 } });
    expect(readJourney(undefined)).toEqual({});
  });
  it("the sim no longer carries field notes (no pickups exist, so the results card does not show them)", () => {
    expect("fieldNotes" in createSim(0, 0).state).toBe(false);
  });
});

describe("C9 and C14 the objective hint", () => {
  it("names the control to hold for each device", () => {
    const sim = createSim(0, 1);
    expect(objectiveHint(sim, "keys")?.text).toMatch(/hold F for 2\.5 s/);
    expect(objectiveHint(sim, "touch")?.text).toMatch(/the Hold button/);
    expect(objectiveHint(sim, "pad")?.text).toMatch(/hold X/);
  });
  it("shows a timed gate as open or shut with a countdown", () => {
    const sim = createSim(2, 3);
    sim.time = 1;
    expect(objectiveHint(sim, "keys")).toEqual({ text: "Gate open: 6 s left", warn: false });
    sim.time = 8.5;
    expect(objectiveHint(sim, "keys")).toEqual({ text: "Gate shut (red): opens in 3 s", warn: true });
  });
  it("warns when a stealth rider is too high and a wake rider is too slow", () => {
    const stealth = createSim(1, 2);
    stealth.state.y = 25;
    expect(objectiveHint(stealth, "keys")).toMatchObject({ warn: true, text: expect.stringMatching(/Too high/) });
    const wake = createSim(3, 1);
    const p = targetOf(wake.state);
    Object.assign(wake.state, { x: p.x, z: p.z, y: 4 });
    wake.flight.speed = 3;
    expect(objectiveHint(wake, "keys")).toMatchObject({ warn: true, text: expect.stringMatching(/Too slow/) });
  });
});

describe("rendered world (C8, C10, C12, PROBE-2)", () => {
  const nodes = (chapter: number, size?: 2048 | 4096) => (buildWorld(chapter, size ? { shadowMapSize: size } : {}).scene as unknown as { toJSON(): { nodes: Record<string, any>[] } }).toJSON().nodes;
  it("draws every chapter-0 lamp the sim collides with (55, was 18)", () => {
    expect(nodes(0).find((n) => n.name === "lamps")?.instances.length).toBe(55);
    const ch1 = createTerrain(1).props().lamps.length;
    expect(nodes(1).find((n) => n.name === "lamps")?.instances.length).toBe(ch1);
  });
  it("plaster walls carry a base colour, normal and roughness texture", () => {
    const plaster = nodes(0).filter((n) => /^plaster-/.test(n.name ?? ""));
    expect(plaster.length).toBeGreaterThan(0);
    for (const n of plaster) {
      expect(n.material.texture?.url).toMatch(/plaster_Color\.jpg$/);
      expect(n.material.normal?.url ?? n.material.normalMap?.url).toMatch(/plaster_NormalGL\.jpg$/);
    }
  });
  it("waiting rings are one instanced pool, and the shadow map size follows the build option", () => {
    const list = nodes(0, 2048);
    expect(list.find((n) => n.name === "rings")?.instances.length).toBe(MAX_RINGS);
    expect(list.filter((n) => /^ring-\d$/.test(n.name ?? ""))).toEqual([]);
    expect(list.find((n) => n.light === "directional")?.shadow.mapSize).toBe(2048);
    expect(nodes(0).find((n) => n.light === "directional")?.shadow.mapSize).toBe(4096);
  });
  it("bloom raises none of the PROBE-2 warnings in any chapter (deprecated radius, threshold below HDR white, noise risk)", () => {
    for (let chapter = 0; chapter <= 6; chapter++) {
      const bloom = nodes(chapter).find((n) => n.effect === "bloom")!;
      expect(bloom.postAuthored).not.toContain("radius");
      const codes = [...(validatePostEffectNode(bloom) ?? []), ...mapBloomOptionsV2(bloom, 5).diagnostics].map((d) => d.code);
      expect(codes, `chapter ${chapter}`).toEqual([]);
      // RendererPostprocessPlan's bloom-noise-risk rule: threshold < 0.48 or intensity > 0.62
      expect(bloom.threshold).toBeGreaterThanOrEqual(0.48);
      expect(bloom.intensity).toBeLessThanOrEqual(0.62);
    }
  });
});

describe("C4 the live app page matches the example page", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const example = read("examples/silt-and-signal-port/index.html");
  const app = read("apps/showcase-silt-and-signal-port/index.html");
  const block = (html: string) => {
    const style = /<style>\n([\s\S]*?)\n\s*<\/style>/.exec(html)?.[1];
    const body = /<body>([\s\S]*?)<script/.exec(html)?.[1];
    return { style, body };
  };
  it("has the same game stylesheet (results grid, 390x844 layout, touch buttons) and the same body markup", () => {
    const a = block(example), b = block(app);
    expect(a.style).toBeTruthy();
    expect(b.style).toBe(a.style);
    expect(b.body).toBe(a.body);
    expect(b.style).toContain("@media (max-width: 560px)");
    expect(b.body).toContain('id="done-stats" class="stats"');
    expect(b.body).toContain('id="touch-hold"');
  });
  it("lifts the bottom HUD clear of the credit badge (C13)", () => {
    expect(app).toMatch(/html:root\{--credit-gap:36px\}/);
    expect(example).toMatch(/#flight \{[^}]*bottom: calc\(12px \+ var\(--credit-gap\)\)/);
  });
});
