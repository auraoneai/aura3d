import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { game } from "../../packages/engine/src";

const fixedDt = 1 / 60;
const requiredBrowserEvidenceProofIds = [
  "renderedMovement",
  "controls",
  "physics",
  "collision",
  "animationStateChanges",
  "nonblankVisualOutput",
  "hitboxOverlay",
  "hitSpark",
  "cameraShake",
  "hudUpdate",
  "typedGlbRuntimeNodeMutation"
] as const;
const requiredRuntimeEvidenceSystems = [
  "mutableNodes",
  "frameLoop",
  "input",
  "physics",
  "collision",
  "animation",
  "effectsPlan",
  "cameraPlan",
  "stage"
] as const;

describe("Aura3D 1.0.4 game runtime source-backed gates", () => {
  it("keeps press/release edges and replay action sequences deterministic across frames", () => {
    const createInput = () =>
      game.input({
        actions: {
          moveLeft: ["KeyA"],
          moveRight: ["KeyD"],
          light: ["KeyJ"]
        },
        axes: {
          moveX: { negative: "moveLeft", positive: "moveRight" }
        },
        autoListen: false
      });
    const recorder = createInput();

    recorder.press("KeyD");
    const pressed = recorder.update(fixedDt);
    recorder.release("KeyD");
    const released = recorder.update(fixedDt);
    const settled = recorder.update(fixedDt);

    expect(edgeState(pressed, "moveRight")).toEqual({ pressed: true, held: true, released: false, axis: 1 });
    expect(edgeState(released, "moveRight")).toEqual({ pressed: false, held: false, released: true, axis: 0 });
    expect(edgeState(settled, "moveRight")).toEqual({ pressed: false, held: false, released: false, axis: 0 });

    const plan = game.inputReplay(recorder.recorded(), { fps: 60, label: "edge-sequence" });
    const replay = createInput();
    const driver = game.inputReplayDriver(replay, plan);
    const replayPressed = driver.seek(0, fixedDt);
    const replayReleased = driver.step(fixedDt);
    const replaySettled = driver.step(fixedDt);

    expect([
      edgeState(replayPressed, "moveRight"),
      edgeState(replayReleased, "moveRight"),
      edgeState(replaySettled, "moveRight")
    ]).toEqual([
      edgeState(pressed, "moveRight"),
      edgeState(released, "moveRight"),
      edgeState(settled, "moveRight")
    ]);
    expect(plan.checksum).toBe(game.inputReplay(recorder.recorded(), { fps: 60, label: "edge-sequence" }).checksum);

    recorder.dispose();
    replay.dispose();
  });

  it("keeps landing, fixed-step jump arcs, stage clamps, and debug node alignment source-testable", () => {
    const falling = game.kinematicBody({
      id: "falling-body",
      position: [0, 2.4, 0],
      gravity: -20,
      groundY: 0,
      friction: 0,
      bounds: { minX: -2, maxX: 2, minZ: -0.5, maxZ: 0.5 }
    });

    let landed = falling.snapshot();
    for (let frame = 0; frame < 90; frame += 1) landed = falling.update(fixedDt);

    expect(landed.grounded).toBe(true);
    expect(landed.position[1]).toBe(0);
    expect(landed.velocity[1]).toBeGreaterThanOrEqual(0);

    expect(sampleJumpArc()).toEqual(sampleJumpArc());

    const clamped = game.kinematicBody({
      id: "clamped-body",
      position: [0, 0, 0],
      gravity: 0,
      friction: 10,
      bounds: { minX: -1, maxX: 1, minZ: -0.25, maxZ: 0.25 }
    });
    clamped.dash([1, 0, 0], 80);
    expect(clamped.update(1).position[0]).toBe(1);
    clamped.applyKnockback([-120, 0, 0]);
    expect(clamped.update(1).position[0]).toBe(-1);

    const debug = game.debug.colliders([
      game.collider.box({ id: "clamped-body-debug", center: clamped.position, size: clamped.size })
    ]);

    expect(debug[0]?.position).toEqual(clamped.position);
    expect(debug[0]?.aabb.center).toEqual(clamped.position);
  });

  it("emits hitbox debug boxes, active frames, contact points, and scene nodes from combat snapshots", () => {
    const combat = game.combatWorld();
    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1 });
    combat.addActor({ id: "rival", team: "p2", position: [0.86, 0, 0], facing: -1 });
    combat.beginAttack("player", {
      id: "debug-jab",
      damage: 10,
      activeFrames: [1, 3],
      durationFrames: 8,
      hitboxes: [{ id: "debug-jab-hitbox", offset: [0.62, 0.86, 0], size: [0.52, 0.36, 0.46] }]
    });

    const resolved = combat.update(fixedDt);
    const overlay = game.debug.overlay({ combat: resolved });
    const sceneNodes = game.debug.sceneNodes(overlay, { includeLabels: true });
    const tags = overlay.geometry.flatMap((node) => node.tags);

    expect(resolved.activeAttacks[0]).toMatchObject({
      moveId: "debug-jab",
      active: true,
      activeFrames: [1, 3]
    });
    expect(tags).toEqual(expect.arrayContaining(["attack-hitbox", "active-frame", "contact-point"]));
    expect(overlay.sections.find((section) => section.id === "combat")?.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining(["activeFrames", "contactPoints"])
    );
    expect(sceneNodes.some((node) => node.kind === "primitive" && node.runtime?.tags.includes("active-frame"))).toBe(true);
    expect(sceneNodes.some((node) => node.kind === "label" && node.runtime?.tags.includes("contact-point"))).toBe(true);
  });

  it("drives effects, camera, and HUD snapshots from combat events without query selectors", () => {
    const combat = game.combatWorld();
    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1, meter: 0 });
    combat.addActor({ id: "rival", team: "p2", position: [0.86, 0, 0], facing: -1, health: 100 });
    combat.beginAttack("player", {
      id: "hud-jab",
      damage: 12,
      meterGain: 6,
      activeFrames: [1, 1],
      durationFrames: 4,
      hitboxes: [{ id: "hud-jab-hitbox", offset: [0.62, 0.86, 0], size: [0.52, 0.36, 0.46] }]
    });

    const resolved = combat.update(fixedDt);
    const effects = game.effects();
    const camera = game.cameraDirector();
    const bridge = game.combatEvents(resolved.events, {
      combat: resolved,
      effects,
      camera,
      hudBindings: [
        game.hud.health({ actorId: "rival", label: "Rival health" }),
        game.hud.meter({ actorId: "player", label: "Player meter" })
      ],
      rules: { maxHealth: 100, maxMeter: 100 }
    });

    expect(bridge.effectIds.length).toBeGreaterThan(0);
    expect(bridge.cameraImpacts).toBe(1);
    expect(effects.snapshot().spawned).toBe(1);
    expect(camera.update(fixedDt, [{ id: "player", position: [0, 0, 0] }, { id: "rival", position: [0.86, 0, 0] }]).shake).toBeGreaterThan(0);
    expect(bridge.hud?.changedIds).toEqual(expect.arrayContaining(["hud:rival:health", "hud:player:meter"]));
    expect(bridge.hud?.values.find((value) => value.id === "hud:rival:health")).toMatchObject({
      value: 88,
      formatted: "88%",
      changed: true
    });
  });

  it("maps accessibility settings into camera and effects behavior", () => {
    const settings = game.accessibility.settings([
      game.accessibility.reducedMotion({ enabled: true }),
      game.accessibility.reducedFlash({ enabled: true }),
      game.accessibility.highContrast({ enabled: true })
    ]);
    const camera = game.cameraDirector(settings.camera);
    const effects = game.effects(settings.effects);

    camera.impact(2, 0.4);
    expect(camera.update(fixedDt, [{ id: "player", position: [0, 0, 0] }]).shake).toBe(0);

    expect(effects.superFlash([0, 1, 0], { intensity: 1 }).intensity).toBeLessThanOrEqual(0.35);
    expect(effects.shockwave([0, 0, 0], { duration: 1 }).duration).toBeLessThanOrEqual(0.18);
    expect(settings).toMatchObject({ reducedMotion: true, reducedFlash: true, highContrast: true });
  });

  it("exposes light, heavy, special, guard, dash, and hitstun states without rendering", () => {
    expect(playerStateAfter("KeyJ")).toBe("light");
    expect(playerStateAfter("KeyI")).toBe("heavy");
    expect(playerStateAfter("KeyL")).toBe("special");
    expect(playerStateAfter("KeyK")).toBe("guard");
    expect(playerStateAfter("ShiftLeft")).toBe("dash");

    const kit = game.fighting({ autoListen: false, opponentAi: false });
    kit.bodies.player.position = [0, 0, 0];
    kit.bodies.opponent.position = [0.86, 0, 0];
    kit.input.press("KeyJ");
    let state = kit.update(fixedDt);
    for (let frame = 0; frame < 7; frame += 1) state = kit.update(fixedDt);

    expect(state.states.opponent).toBe("hitstun");
    kit.input.dispose();
  });

  it("declares browser and runtime evidence manifest expectations for PRD evidence-only gates", () => {
    const browserManifest = readEvidenceManifest("tests/reports/game-runtime/browser-evidence.manifest.json");
    const runtimeManifest = readEvidenceManifest("tests/reports/game-runtime/runtime-evidence.manifest.json");
    const commandManifest = readEvidenceManifest("tests/reports/game-runtime/command-gates.manifest.json");
    const browserProofIds = browserManifest.requiredProofs?.map((proof) => proof.proofId) ?? [];

    expect(browserManifest.status).toBe("pending-execution");
    expect(browserProofIds).toEqual(expect.arrayContaining([...requiredBrowserEvidenceProofIds]));
    for (const proofId of requiredBrowserEvidenceProofIds) {
      const proof = browserManifest.requiredProofs?.find((candidate) => candidate.proofId === proofId);
      expect(proof?.status).toBe("pending-execution");
      expect(proof?.requiredArtifacts?.length).toBeGreaterThan(0);
    }

    expect(runtimeManifest.status).toBe("pending-execution");
    expect(runtimeManifest.requiredReports).toEqual(
      expect.arrayContaining(["tests/reports/game-runtime/game-runtime-evidence.json"])
    );
    expect(runtimeManifest.requiredSystems).toEqual(expect.arrayContaining([...requiredRuntimeEvidenceSystems]));
    expect(commandManifest.status).toBe("pending-execution");
    expect(commandManifest.requiredReports).toEqual(
      expect.arrayContaining([
        "tests/reports/aura3d104/typecheck.json",
        "tests/reports/game-runtime/unit.json",
        "tests/reports/game-runtime/browser.json",
        "tests/reports/game-runtime/template.json",
        "tests/reports/game-runtime/docs.json",
        "tests/reports/game-runtime/game-runtime-evidence.json",
        "tests/reports/game-runtime/package-smoke.json",
        "tests/reports/game-runtime/release.json",
        "tests/reports/aura3d104/build.json"
      ])
    );
    expect(commandManifest.requiredLogs).toEqual(
      expect.arrayContaining([
        "tests/reports/game-runtime/typecheck.log",
        "tests/reports/game-runtime/unit.log",
        "tests/reports/game-runtime/browser.log",
        "tests/reports/game-runtime/template.log",
        "tests/reports/game-runtime/docs.log",
        "tests/reports/game-runtime/evidence.log",
        "tests/reports/game-runtime/package.log",
        "tests/reports/game-runtime/release.log",
        "tests/reports/game-runtime/build.log"
      ])
    );
  });
});

type EvidenceManifest = {
  readonly status?: string;
  readonly requiredCommands?: readonly string[];
  readonly requiredReports?: readonly string[];
  readonly requiredLogs?: readonly string[];
  readonly requiredSystems?: readonly string[];
  readonly requiredProofs?: readonly {
    readonly proofId?: string;
    readonly status?: string;
    readonly requiredArtifacts?: readonly string[];
  }[];
};

function sampleJumpArc(): readonly (readonly [number, number, number])[] {
  const body = game.kinematicBody({ position: [0, 0, 0], gravity: -18, jumpVelocity: 7.5, friction: 0 });
  const samples: Array<readonly [number, number, number]> = [];
  body.jump();
  for (let frame = 0; frame < 24; frame += 1) {
    const position = body.update(fixedDt).position;
    samples.push([round(position[0]), round(position[1]), round(position[2])]);
  }
  return samples;
}

function playerStateAfter(binding: string): string {
  const kit = game.fighting({ autoListen: false, opponentAi: false });
  kit.input.press(binding);
  const state = kit.update(fixedDt).states.player;
  kit.input.release(binding);
  kit.input.dispose();
  return state;
}

function edgeState(snapshot: ReturnType<ReturnType<typeof game.input>["snapshot"]>, action: string): {
  readonly pressed: boolean;
  readonly held: boolean;
  readonly released: boolean;
  readonly axis: number;
} {
  const state = snapshot.actions[action];
  return {
    pressed: state?.pressed ?? false,
    held: state?.held ?? false,
    released: state?.released ?? false,
    axis: snapshot.axes?.moveX ?? 0
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function readEvidenceManifest(file: string): EvidenceManifest {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8")) as EvidenceManifest;
}
