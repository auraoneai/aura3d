/**
 * T4.2 (PRD-06 §7.1) — `characterAnimation` binding: scripted controller
 * speed ramp 0 → 5 m/s through a 1-D blend tree in one sync group; airborne
 * state machine with landing blend; masked-layer actions; weights match the
 * spec and walk/run stay phase-aligned (sync error ≤ 1%).
 */

import { describe, expect, it } from "vitest";
import {
  characterAnimation,
  setCharacterAnimationAppTimeScale,
  type AuraCharacterAnimationSpec
} from "../../../../packages/engine/src/agent-api/GameCharacterAnimation.js";

/** Scripted controller: speed ramps 0 → 5 m/s over `rampSeconds`. */
function makeRampController(opts: { rampSeconds?: number; grounded?: boolean } = {}) {
  let t = 0;
  const ramp = opts.rampSeconds ?? 4;
  return {
    tick: (dt: number) => { t += dt; },
    snapshot: () => {
      const speed = Math.min(5, (t / ramp) * 5);
      return { speed, velocity: [0, 0, speed] as const, grounded: opts.grounded ?? true };
    }
  };
}

function makeNode() {
  const calls: { clipSamples?: readonly { clipName: string; localTime: number; weight: number }[] }[] = [];
  const node = {
    timeScale: 1,
    animation: {
      ik: { add: (spec: unknown) => ikAdds.push(spec), clear: () => { ikClears++; } }
    },
    setAnimationBinding: (binding: unknown) => {
      calls.push(binding as (typeof calls)[number]);
      return node;
    }
  };
  const ikAdds: unknown[] = [];
  let ikClears = 0;
  return { node, calls, ikAdds, ikClears: () => ikClears };
}

const SPEC: AuraCharacterAnimationSpec = {
  locomotion: {
    param: "speed",
    syncGroup: "locomotion",
    clips: [
      { clip: "Idle", at: 0, duration: 2.0 },
      { clip: "Walk", at: 1.5, duration: 0.8 },
      { clip: "Run", at: 5, duration: 0.6 }
    ]
  }
};

function samplesAt(call: { clipSamples?: readonly { clipName: string; localTime: number; weight: number }[] }) {
  return new Map((call.clipSamples ?? []).map((s) => [s.clipName, s]));
}

describe("T4.2 characterAnimation — 1-D blend tree", () => {
  it("weights match the spec across a 0 → 5 m/s ramp", () => {
    const controller = makeRampController({ rampSeconds: 4 });
    const { node, calls } = makeNode();
    const binding = characterAnimation(controller, node, SPEC);
    const dt = 1 / 60;
    for (let f = 0; f < 240; f++) {
      controller.tick(dt);
      binding.update(dt);
    }
    const last = calls[calls.length - 1]!;
    const weights = samplesAt(last);
    // t=4s → speed 5 → pure Run.
    expect(weights.get("Run")?.weight).toBeCloseTo(1, 5);
    expect(weights.get("Walk")).toBeUndefined();
    expect(weights.get("Idle")).toBeUndefined();
  });

  it("mid-ramp blends walk↔run linearly between control points", () => {
    const controller = makeRampController({ rampSeconds: 4 });
    const { node, calls } = makeNode();
    const binding = characterAnimation(controller, node, SPEC);
    const dt = 1 / 60;
    // Advance to t≈2.6s → speed ≈ 3.25 → halfway Walk(1.5)→Run(5): 0.5/0.5.
    for (let f = 0; f < 156; f++) { controller.tick(dt); binding.update(dt); }
    const weights = samplesAt(calls[calls.length - 1]!);
    expect(weights.get("Walk")?.weight).toBeCloseTo(0.5, 2);
    expect(weights.get("Run")?.weight).toBeCloseTo(0.5, 2);
    expect(weights.get("Idle")).toBeUndefined();
  });

  it("walk/run clip times track the shared sync-group phase (sync error ≤ 1%)", () => {
    const controller = makeRampController({ rampSeconds: 4 });
    const { node, calls } = makeNode();
    const binding = characterAnimation(controller, node, SPEC);
    const dt = 1 / 60;
    for (let f = 0; f < 156; f++) { controller.tick(dt); binding.update(dt); }
    const samples = calls[calls.length - 1]!.clipSamples!;
    const walk = samples.find((s) => s.clipName === "Walk")!;
    const run = samples.find((s) => s.clipName === "Run")!;
    // Normalised phases: time/duration — both clips share the group phase.
    const phaseWalk = walk.localTime / 0.8;
    const phaseRun = run.localTime / 0.6;
    const err = Math.abs(phaseWalk - phaseRun);
    expect(err).toBeLessThanOrEqual(0.01);
    // And the phases are not frozen at 0.
    expect(phaseWalk % 1).not.toBe(0);
    expect(binding.snapshot().syncError).toBeLessThanOrEqual(0.01);
  });

  it("per-actor dt composes app.time.scale × handle.timeScale (C-23)", () => {
    setCharacterAnimationAppTimeScale(() => 2);
    const controller = makeRampController({ rampSeconds: 4 });
    const { node, calls } = makeNode();
    node.timeScale = 0.5;
    const binding = characterAnimation(controller, node, SPEC);
    controller.tick(1); // controller's own clock — unscaled input
    binding.update(1);  // dt=1 → eff 1 * 2 * 0.5 = 1s of anim time
    setCharacterAnimationAppTimeScale(undefined);
    const snapshot = binding.snapshot();
    expect(snapshot.sharedPhase).toBeGreaterThan(0);
  });
});

describe("T4.2 characterAnimation — airborne + actions", () => {
  it("jump-start → fall → land blend on a grounded toggle", () => {
    let grounded = true;
    const controller = { snapshot: () => ({ speed: 0.5, grounded, jumpedThisFrame: !grounded }) };
    const { node, calls } = makeNode();
    const binding = characterAnimation(controller, node, {
      ...SPEC,
      airborne: { jumpStart: "JumpStart", fall: "JumpLoop", land: "Land", landBlend: 0.12 }
    });
    const dt = 1 / 60;
    binding.update(dt);
    grounded = false;
    binding.update(dt);
    let names = calls[calls.length - 1]!.clipSamples!.map((s) => s.clipName);
    expect(names).toContain("JumpStart");
    expect(names).toContain("JumpLoop");
    for (let f = 0; f < 30; f++) binding.update(dt);
    grounded = true;
    binding.update(dt);
    names = calls[calls.length - 1]!.clipSamples!.map((s) => s.clipName);
    expect(names).toContain("Land");
    expect(binding.snapshot().airborneState).toBe("land");
    for (let f = 0; f < 12; f++) binding.update(dt);
    expect(binding.snapshot().airborneState).toBe("ground");
    names = calls[calls.length - 1]!.clipSamples!.map((s) => s.clipName);
    expect(names).toContain("Idle");
  });

  it("masked-layer actions fire via trigger() with a blendIn ramp", () => {
    const controller = { snapshot: () => ({ speed: 1, grounded: true }) };
    const { node, calls } = makeNode();
    const binding = characterAnimation(controller, node, {
      ...SPEC,
      actions: {
        wave: { clip: "Wave", layer: "upper", mask: { humanoid: "upper-body" }, duration: 1.2 }
      }
    });
    const dt = 1 / 60;
    binding.update(dt);
    binding.trigger("wave");
    binding.update(dt);
    const sample = calls[calls.length - 1]!.clipSamples!.find((s) => s.clipName === "Wave")! as { weight: number; layer?: string; mask?: unknown };
    expect(sample.weight).toBeGreaterThan(0);
    expect(sample.weight).toBeLessThan(1); // blendIn ramping
    expect(sample.layer).toBe("upper");
    expect(sample.mask).toEqual({ humanoid: "upper-body" });
    expect(binding.snapshot().activeAction).toBe("wave");
  });

  it("state-bag controller carrying a `state: string` label still resolves numeric fields", () => {
    // T4.4 regression: the bag IS the controller and `state: "walk"` is its
    // free-form label — `.state` only counts as a bag when it's an object.
    const bag = { speed: 2.4, grounded: true, jumped: false, turnRate: 0.2, state: "walk" };
    const { node, calls } = makeNode();
    const binding = characterAnimation(bag, node, SPEC);
    binding.update(1 / 60);
    const samples = samplesAt(calls[calls.length - 1]!);
    // 2.4 m/s is between Walk(1.5) and Run(5) — both must carry weight.
    expect(samples.get("Walk")!.weight).toBeGreaterThan(0);
    expect(samples.get("Run")!.weight).toBeGreaterThan(0);
    expect(samples.get("Idle"), "Idle weight 0 — filtered from published samples").toBeUndefined();
    expect(binding.snapshot().speed).toBeCloseTo(2.4, 3);
  });

  it("footIk + lookAt specs register constraints at bind; dispose clears", () => {
    const controller = { snapshot: () => ({ speed: 0, grounded: true }) };
    const { node, ikAdds, ikClears } = makeNode();
    const binding = characterAnimation(controller, node, {
      ...SPEC,
      footIk: { legs: [], ground: { raycast: () => null } as never },
      lookAt: { bones: [{ bone: "Head", weight: 1 }] } as never
    });
    expect(ikAdds.map((s) => (s as { kind: string }).kind)).toEqual(["foot-ik", "look-at"]);
    binding.dispose();
    expect(ikClears()).toBe(1);
  });
});
