import { describe, expect, test } from "vitest";
import {
  type AuraModelNode,
  type AuraGroupNode,
  type AuraInteractionNode,
  type AuraLabelNode,
  type AuraPrimitiveNode,
  type AuraApp,
  type AuraSceneBuilder,
  type AuraSceneSnapshot,
  camera,
  character,
  charts,
  city,
  collectAuraSceneEvidence,
  compilePromptPlan,
  defineAuraAssets,
  definePromptPlan,
  effects,
  environments,
  game,
  group,
  groups,
  games,
  interactions,
  labels,
  lights,
  material,
  model,
  performance,
  physics,
  prefabs,
  primitives,
  promptPlanToScene,
  renderer,
  scene,
  sceneKits,
  shadows,
  timeline,
  ui,
  createAuraApp
} from "../../../packages/engine/src";

const assets = defineAuraAssets({
  robot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/robot.12345678.glb",
    bounds: [1, 2, 1],
    hash: "sha256-test"
  },
  color: {
    type: "texture",
    format: "png",
    url: "/aura-assets/color.12345678.png",
    hash: "sha256-texture"
  }
} as const);

describe("agent API", () => {
  test("builds the five-line typed asset scene", () => {
    const snapshot = scene().add(model(assets.robot)).add(lights.studio()).toJSON();
    expect(snapshot.nodes.map((node) => node.kind)).toEqual(["model", "light"]);
    expect(snapshot.nodes[0]).toMatchObject({ kind: "model", asset: { id: "robot" } });
  });

  test("builds a compact cinematic scene", () => {
    const snapshot = scene()
      .background("#05070d")
      .add(model(assets.robot, { material: material.pbr({ texture: assets.color }) }).position(0, 0, -1).scale(1.1))
      .add(lights.point({ position: [-2, 2.4, 1], color: "#38d6ff", intensity: 2.4 }))
      .add(effects.rain({ intensity: 0.45 }))
      .add(effects.fog({ density: 0.18 }))
      .add(effects.bloom({ intensity: 0.4 }))
      .camera(camera.dolly({ from: [0, 1.4, 6], to: [0, 1.2, 2], seconds: 8 }))
      .timeline(timeline.loop({ seconds: 8 }))
      .toJSON();
    expect(snapshot.camera.mode).toBe("dolly");
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")).toBe(true);
  });

  test("supports primitives and interactions for mini games", () => {
    const snapshot = scene()
      .add(primitives.sphere({ name: "player" }).position(0, 0.5, 0))
      .add(lights.studio())
      .camera(camera.follow({ targetNode: "player" }))
      .toJSON();
    expect(snapshot.nodes[0]).toMatchObject({ kind: "primitive", primitive: "sphere" });
    expect(snapshot.camera.mode).toBe("follow");
  });

  test("marks scene nodes as mutable runtime nodes for game loops", () => {
    const snapshot = scene()
      .add(primitives.box({ name: "runtime player" }).runtime(game.runtimeNode("player", { tags: ["fighter", "local"] })))
      .toJSON();
    const node = snapshot.nodes[0];

    expect(node).toMatchObject({
      kind: "primitive",
      name: "runtime player",
      runtime: {
        id: "player",
        mutable: true,
        tags: ["fighter", "local"]
      }
    });
  });

  test("exposes Aura3D game runtime plans and evidence shape", () => {
    const loop = game.loop({ fixedDt: 1 / 120, maxSubSteps: 8 });
    const input = game.input({
      actions: {
        light: ["KeyJ", "GamepadWest"],
        jump: ["KeyW", "GamepadSouth"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      bufferMs: 160
    });
    const evidence = game.evidence({
      runtime: { paused: false, frame: 3, time: 0.05, fixedDt: 1 / 60, alpha: 0 },
      nodes: {
        get: () => undefined,
        require: () => {
          throw new Error("not needed");
        },
        has: (id: string) => id === "player",
        ids: () => ["player"],
        all: () => []
      }
    });

    expect(loop).toMatchObject({ kind: "aura-game-loop-plan", fixedDt: 1 / 120, maxSubSteps: 8, timeScale: 1 });
    expect(input).toMatchObject({ kind: "aura-game-input-plan", bufferMs: 160, axes: { moveX: { negative: "moveLeft", positive: "moveRight" } } });
    expect(evidence).toMatchObject({
      kind: "aura-game-runtime-evidence",
      loop: { frame: 3, paused: false },
      runtimeNodes: { count: 1, ids: ["player"] },
      systems: { mutableNodes: true, frameLoop: true }
    });
  });

  test("tracks game input pressed held released axis buffer and replay events", () => {
    const input = game.input({
      actions: {
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        light: ["KeyJ"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      bufferMs: 140,
      autoListen: false
    });

    input.press("KeyD");
    input.press("KeyJ");
    let snapshot = input.update(1 / 60);

    expect(snapshot.actions.moveRight).toMatchObject({ pressed: true, held: true, released: false, buffered: true });
    expect(input.axis("moveX")).toBe(1);
    expect(input.pressed("light")).toBe(true);
    expect(input.buffered("light")).toBe(true);

    input.release("KeyJ");
    snapshot = input.update(1 / 60);

    expect(snapshot.actions.light).toMatchObject({ pressed: false, held: false, released: true, buffered: true });
    expect(input.held("moveRight")).toBe(true);
    expect(input.recorded().map((event) => `${event.type}:${event.binding}`)).toEqual([
      "press:KeyD",
      "press:KeyJ",
      "release:KeyJ"
    ]);

    const replay = game.input({
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
    const replaySnapshot = replay.replay(input.recorded());

    expect(replaySnapshot.actions.moveRight).toMatchObject({ pressed: true, held: true });
    expect(replay.axis("moveX")).toBe(1);
    expect(replay.held("light")).toBe(false);
  });

  test("supports hierarchical groups with inherited transforms", () => {
    const rig = group("test rig", [
      primitives.sphere({ name: "local head" }).position(0, 1, 0).scale(0.5),
      group("nested limb", [
        primitives.box({ name: "local forearm" }).position(0.2, -0.1, 0).scale([0.1, 0.4, 0.1])
      ], { position: [0.5, 0.5, 0] })
    ], { position: [1, 2, 3], scale: 2 }).toJSON();
    const snapshot = scene().add(rig).toJSON();
    const flattened = groups.flatten(snapshot.nodes);
    const head = flattened.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "local head");
    const forearm = flattened.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "local forearm");

    expect(snapshot.nodes[0]).toMatchObject({ kind: "group", name: "test rig" });
    expect(head).toMatchObject({ position: [1, 3, 3], scale: [1, 1, 1] });
    expect(forearm).toMatchObject({ position: [1.7, 2.4, 3], scale: [0.2, 0.8, 0.2] });
  });

  test("exposes a hierarchical character rig with skeleton joints and gait clips", () => {
    const nodes = character.primitiveHumanoid({ clip: "wave", pose: "planted-foot", style: "robot" });
    const rig = nodes.find((node): node is AuraGroupNode => node.kind === "group" && node.name === "hierarchical primitive humanoid rig");
    const flattened = groups.flatten(nodes);
    const joints = rig?.character?.skeleton.joints.map((joint) => joint.name) ?? [];
    const clips = rig?.character?.skeleton.clips.map((clip) => clip.name) ?? [];

    expect(rig?.character).toMatchObject({ clip: "wave", pose: "planted-foot" });
    expect(rig?.character?.skeleton.style).toBe("robot");
    expect(rig?.character).toMatchObject({ rootBob: true, limbSwing: "joint-hierarchy" });
    expect(rig?.animation).toMatchObject({ rootBob: true, jointHierarchy: true, joint: "root" });
    expect(clips).toEqual(["idle", "walk", "run", "wave", "turn", "pose", "benchmark-pose"]);
    expect(joints).toEqual(expect.arrayContaining([
      "root",
      "pelvis",
      "spine",
      "neck",
      "head",
      "left-shoulder",
      "left-elbow",
      "left-wrist",
      "right-hip",
      "right-knee",
      "right-ankle"
    ]));
    expect(rig?.children.some((node) => node.kind === "group" && node.name === "left shoulder elbow wrist chain")).toBe(true);
    expect(rig?.children.some((node) => node.kind === "group" && node.name === "right hip knee ankle chain")).toBe(true);
    expect(rig?.children.every((node) => node.kind !== "group" || node.animation?.jointHierarchy === true)).toBe(true);
    expect(flattened.some((node) => node.kind === "primitive" && node.name === "humanoid head")).toBe(true);
    expect(flattened.some((node) => node.kind === "primitive" && node.name === "forward foot planted on path")).toBe(true);
  });

  test("uses a bundled skinned GLB for the benchmark-facing humanoid default", () => {
    const nodes = character.lowPolyHumanoid({ clip: "benchmark-pose", pose: "three-quarter" });
    const modelNode = nodes.find((node): node is AuraModelNode => node.kind === "model" && node.name === "authored skinned humanoid character model");

    expect(modelNode?.asset.id).toBe("humanoid");
    expect(modelNode?.asset.format).toBe("glb");
    expect(modelNode?.asset.metadata?.animations).toContain("Walking");
    expect(modelNode?.asset.metadata?.animations).toContain("Wave");
    expect(modelNode?.animation?.clip).toBe("Walking");
    expect(modelNode?.animation?.captureTime).toBe(0.72);
    expect(modelNode?.castShadow).toBe(true);
    expect(modelNode?.receiveShadow).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "humanoid head")).toBe(false);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "contact-occlusion")).toBe(true);
    const rig = nodes.find((node): node is AuraGroupNode => node.kind === "group" && node.name === "authored skinned humanoid rig metadata");
    expect(rig?.character?.footPlanting).toMatchObject({
      enabled: true,
      groundY: 0,
      plantedFeet: ["left"],
      captureTime: 0.72
    });
    expect(rig?.character?.rootMotion).toMatchObject({
      enabled: true,
      bodyBob: true,
      torsoMovesAsSingleBody: true
    });
    expect(rig?.character?.constraints).toMatchObject({
      enabled: true,
      correctedChains: ["spine", "left-arm", "right-arm", "left-leg", "right-leg"]
    });
    expect(character.visualQA(nodes)).toMatchObject({ connected: true, impossibleProportions: false, score: 5 });
  });

  test("exposes a built-in procedural human mesh descriptor without making it the benchmark default", () => {
    const mesh = character.proceduralHumanMesh({ style: "athletic" });
    const partNames = mesh.parts.map((part) => part.name);

    expect(mesh.kind).toBe("aura-procedural-human-mesh");
    expect(partNames).toEqual(expect.arrayContaining([
      "torso",
      "pelvis",
      "neck",
      "head",
      "left-shoulder",
      "right-shoulder",
      "left-upper-arm",
      "left-lower-arm",
      "right-upper-arm",
      "right-lower-arm",
      "left-hand",
      "right-hand",
      "left-hip",
      "right-hip",
      "left-upper-leg",
      "left-lower-leg",
      "right-upper-leg",
      "right-lower-leg",
      "left-foot",
      "right-foot"
    ]));
    expect(mesh.parts.every((part) => part.vertices.length >= 8 && part.indices.length >= 36)).toBe(true);
    expect(character.lowPolyHumanoid().some((node) => node.kind === "model" && node.name === "authored skinned humanoid character model")).toBe(true);
  });

  test("keeps renderer diagnostics honest until runtime passes initialize", () => {
    const diagnostics = renderer.diagnostics(
      scene()
        .add(primitives.box({ name: "emissive diagnostic cube", material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff" }) }))
        .add(effects.bloom({ intensity: 0.28, threshold: 0.82, radius: 0.22 }))
        .add(effects.ambientOcclusion())
    );

    expect(diagnostics.postprocess).toMatchObject({
      requested: true,
      enabled: false,
      pixelBacked: false,
      runtimeStatus: "not-mounted",
      requestedPasses: ["render", "ssao", "bloom", "output"],
      actualPasses: [],
      fallbackPasses: []
    });
    expect(diagnostics.bloom).toMatchObject({ enabled: true, rendered: false });
    expect(diagnostics.runtime).toMatchObject({ mounted: false, backend: "scene-plan", postprocessVerified: false });
    expect(diagnostics.warnings.join(" ")).toContain("scene plan only");
  });

  test("requests mounted hover runtime for the data-viz scene kit without visual-score acceptance", () => {
    const kit = sceneKits.dataViz();
    const hoverNode = kit.nodes.find((node): node is AuraInteractionNode => node.kind === "interaction" && node.mode === "hover");
    const evidence = collectAuraSceneEvidence(kit.scene().toJSON());

    expect(hoverNode).toMatchObject({ target: "height-colored data bar 4-6", selected: "height-colored data bar 4-6" });
    expect(evidence.interactions.hoverTargets).toContain("height-colored data bar 4-6");
    expect(kit.diagnostics.structuralScore).toBeGreaterThanOrEqual(4);
    expect("visualScore" in kit.diagnostics).toBe(false);
  });

  test("binds city day-night toggles to AuraApp scene replacement", () => {
    const state = city.createState({ blocks: 3, litWindows: true, timeOfDay: "night" });
    const scenes: AuraSceneSnapshot[] = [];
    const buttonDataset: Record<string, string> = {};
    const button = {
      dataset: buttonDataset,
      textContent: "",
      ownerDocument: { defaultView: {} },
      setAttribute(name: string, value: string) {
        buttonDataset[name] = value;
      },
      onclick: undefined as ((event: MouseEvent) => void) | undefined
    } as unknown as HTMLButtonElement;
    const app = {
      setScene(nextScene: AuraSceneBuilder | AuraSceneSnapshot) {
        const value = nextScene as AuraSceneSnapshot | { toJSON(): AuraSceneSnapshot };
        scenes.push(typeof (value as { toJSON?: unknown }).toJSON === "function" ? (value as { toJSON(): AuraSceneSnapshot }).toJSON() : value as AuraSceneSnapshot);
      }
    } as AuraApp;

    city.bindDayNightToggle(button, app, state);
    expect(button.textContent).toBe("Switch to day");
    expect(button.dataset.auraCityTimeOfDay).toBe("night");

    (button.onclick as ((event: Event) => void) | null)?.({} as Event);

    expect(state.timeOfDay).toBe("day");
    expect(button.textContent).toBe("Switch to night");
    expect(button.dataset.auraCityTimeOfDay).toBe("day");
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.background).toBe("#bfe7ff");
  });

  test("exposes repair helpers for particles, city, materials, products, physics, charts, games, and characters", () => {
    const snapshot = scene()
      .addMany(prefabs.particleFountain({ count: 1400 }))
      .addMany(prefabs.cityBlock({ blocks: 4 }))
      .addMany(prefabs.materialSwatches())
      .addMany(prefabs.productStage())
      .addMany(prefabs.physicsRamp())
      .addMany(prefabs.physicsPlayground({ cubes: 50 }))
      .addMany(prefabs.solarSystem())
      .addMany(prefabs.dataBars3D({ grid: 6 }))
      .addMany(prefabs.neonTunnel({ rings: 10 }))
      .addMany(prefabs.miniGolfHole())
      .addMany(prefabs.primitiveHumanoid())
      .add(primitives.cylinder({ name: "typed cylinder plinth", material: material.glass() }).animate({ clip: "float", speed: 0.7 }))
      .add(effects.particles({ emitter: "swirl", particleCount: 1500 }))
      .camera(camera.orbit({ distance: 5.2 }))
      .timeline(timeline.loop({ seconds: 6 }))
      .toJSON();

    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.particleCount === 1400)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.name === "older blue mist particles after ground collision" && node.particleCount === 504)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("city tower"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.primitive === "cylinder")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.material?.transmission)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.material?.clearcoat)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "rigid physics ramp")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("visible rigid body cube 50"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "subtle collision contact patch cluster center")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "glowing labeled sun")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "Earth readable planet label")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "Saturn ringed planet visible ring")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("height-colored data bar 6-6"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name?.includes("receding neon tunnel top segment"))).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "white physics golf ball")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "label" && node.name === "mini golf score and shot HUD")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "humanoid head")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "short humanoid neck connector")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "left humanoid eye")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "forward foot planted on path")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "white softbox reflection strip")).toBe(true);
    expect(snapshot.camera.position?.[0]).toBeGreaterThan(0);
  });

  test("particle fountain prefab exposes control, collision, and lifetime color evidence", () => {
    const nodes = prefabs.particleFountain({ count: 2400 });
    const primitiveNames = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const particleEffects = nodes.filter((node) => node.kind === "effect" && node.effect === "particles");

    expect(primitiveNames).toEqual(expect.arrayContaining([
      "large grid particle collision ground plane",
      "painted particle collision splash ring",
      "literal nozzle particle emitter cone",
      "real emission rate slider track",
      "real emission rate slider knob high",
      "hot young particle color swatch",
      "warm falling particle color swatch",
      "cool old particle color swatch"
    ]));
    expect(particleEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "narrow upward lifetime colored gravity fountain plume", emitter: "fountain", particleCount: 2400, emissionRate: 120, gravity: 9.8, groundCollision: true }),
      expect.objectContaining({ name: "falling collision splash particle band", emitter: "fountain", particleCount: 1152, groundCollision: true }),
      expect.objectContaining({ name: "older blue mist particles after ground collision", emitter: "swirl", particleCount: 864, groundCollision: true })
    ]));
  });

  test("mini golf prefab exposes shot control, contact, score, and follow evidence", () => {
    const nodes = prefabs.miniGolfHole();
    const names = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const ball = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "white physics golf ball");

    expect(names).toEqual(expect.arrayContaining([
      "designed mini golf felt base course boundaries",
      "windmill obstacle base",
      "white physics golf ball",
      "ball contact shadow on felt",
      "ball aim selection ring",
      "cyan aim direction line",
      "shot power meter track",
      "shot power meter fill",
      "cup capture ring",
      "raised beveled cup rim outer lip",
      "flag pole",
      "follow camera target beacon above ball"
    ]));
    expect(ball?.animation?.clip).toBe("roll");
    expect(ball?.interaction?.onClick).toContain("aim and shoot");
  });

  test("keeps primitive humanoid readable as a connected barely animated pose", () => {
    const nodes = prefabs.primitiveHumanoid();
    const names = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const animatedWalkNodes = nodes.filter((node) => node.kind === "primitive" && node.animation?.clip === "walk");
    const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
      nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
    const head = primitiveByName("humanoid head");
    const neck = primitiveByName("short humanoid neck connector");
    const torso = primitiveByName("connected blue humanoid torso");
    const scalarScale = (node: AuraPrimitiveNode | undefined): number => {
      if (typeof node?.scale === "number") return node.scale;
      if (Array.isArray(node?.scale)) return Math.max(...node.scale);
      return 1;
    };

    expect(names).toEqual(expect.arrayContaining([
      "painted walking path",
      "humanoid contact shadow",
      "short humanoid neck connector",
      "left humanoid eye",
      "right humanoid eye",
      "humanoid mouth line",
      "left bent forearm",
      "right bent forearm",
      "forward lower walking shin",
      "back lower walking shin",
      "cyan body motion trail ribbon behind torso",
      "blue shoulder motion streak",
      "cyan walk motion arrow shaft",
      "cyan walk motion arrow head",
      "forward foot planted on path",
      "back foot pushing off path"
    ]));
    expect(animatedWalkNodes.length).toBeGreaterThanOrEqual(14);
    expect(head?.position?.[1]).toBeLessThan(1.6);
    expect(scalarScale(head)).toBeLessThanOrEqual(0.22);
    expect(scalarScale(primitiveByName("left humanoid hand"))).toBeLessThanOrEqual(0.08);
    expect(scalarScale(primitiveByName("right humanoid hand"))).toBeLessThanOrEqual(0.08);
    expect(scalarScale(primitiveByName("shoulder bar connecting arms"))).toBeLessThanOrEqual(0.62);
    expect(neck?.position?.[1]).toBeGreaterThan(torso?.position?.[1] ?? 0);
    expect(head?.position?.[1] ?? 0).toBeGreaterThan(neck?.position?.[1] ?? 999);
    expect(nodes.filter((node) => node.kind === "primitive" && node.name?.includes("joint")).length).toBe(0);
    expect(prefabs.primitiveHumanoid({ showJoints: true }).filter((node) => node.kind === "primitive" && node.name?.includes("joint")).length).toBeGreaterThanOrEqual(4);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cyan body motion trail ribbon behind torso")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name?.includes("ghost"))).toBe(false);
    expect(prefabs.primitiveHumanoid({ showJoints: false, motionTrail: false }).some((node) => node.kind === "primitive" && node.name === "left shoulder ball joint")).toBe(false);
    expect(prefabs.primitiveHumanoid({ showJoints: false, motionTrail: false }).some((node) => node.kind === "primitive" && node.name === "cyan body motion trail ribbon behind torso")).toBe(false);
    expect(character.visualQA(character.primitiveHumanoid())).toMatchObject({ connected: true, impossibleProportions: false, score: 5 });

    const brokenArm = nodes.map((node) =>
      node.kind === "primitive" && node.name === "left attached swinging arm"
        ? { ...node, position: [-1.4, 1.8, 0.65] as [number, number, number] }
        : node
    );
    expect(character.visualQA(brokenArm)).toMatchObject({ connected: false });
    expect(character.visualQA(brokenArm).gaps.map((gap) => gap.id)).toContain("left-shoulder-arm");

    const impossibleHead = nodes.map((node) =>
      node.kind === "primitive" && node.name === "humanoid head"
        ? { ...node, scale: 0.72 }
        : node
    );
    expect(character.visualQA(impossibleHead)).toMatchObject({ impossibleProportions: true });
    expect(character.visualQA(impossibleHead).score).toBeLessThan(5);
  });

  test("builds a six-planet solar-system prefab with orbit paths and attached readable labels", () => {
    const nodes = prefabs.solarSystem();
    const planetNodes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("labeled orbiting planet") === true);
    const orbitSegments = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("orbit path segment") === true);
    const labelPlinths = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("visible label plinth") === true);
    const readableLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.endsWith("readable planet label") === true);
    const leaderLines = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("attached label leader line") === true);
    const collisionLabels = nodes.filter((node): node is AuraLabelNode => node.kind === "label" && node.collisionAvoidance === true && node.occlusionAware === true);
    const bloom = nodes.find((node) => node.kind === "effect" && node.effect === "bloom");
    const pointLight = nodes.find((node) => node.kind === "light" && node.name === "warm solar key light");

    expect(planetNodes.map((node) => node.name)).toEqual([
      "Mercury rocky material labeled orbiting planet",
      "Venus lava-venus material labeled orbiting planet",
      "Earth ice material labeled orbiting planet",
      "Mars rocky material labeled orbiting planet",
      "Jupiter gas-giant material labeled orbiting planet",
      "Saturn ringed material labeled orbiting planet"
    ]);
    expect(orbitSegments).toHaveLength(96);
    expect(nodes.filter((node) => node.kind === "primitive" && node.primitive === "torus" && node.name?.endsWith("smooth depth-faded orbit ring"))).toHaveLength(6);
    expect(labelPlinths).toHaveLength(6);
    expect(readableLabels.map((node) => node.name)).toEqual([
      "Mercury readable planet label",
      "Venus readable planet label",
      "Earth readable planet label",
      "Mars readable planet label",
      "Jupiter readable planet label",
      "Saturn readable planet label"
    ]);
    expect(leaderLines).toHaveLength(6);
    expect(collisionLabels).toHaveLength(6);
    expect(planetNodes.every((node) => node.animation?.clip === "orbit" && (node.animation.orbitRadius ?? 0) > 0)).toBe(true);
    expect(new Set(planetNodes.map((node) => node.animation?.speed)).size).toBe(6);
    expect([...labelPlinths, ...readableLabels, ...leaderLines].every((node) => node.animation?.clip === "orbit")).toBe(true);
    expect(collisionLabels.every((node) => node.animation?.clip === "orbit" && node.animation.orbitRadius !== undefined)).toBe(true);
    expect(bloom).toMatchObject({ kind: "effect", effect: "bloom", intensity: 0.32 });
    expect(pointLight).toMatchObject({ kind: "light", light: "point" });
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "transparent golden sun corona")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "Jupiter visible equator band")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "Earth small moon material companion")).toBe(true);
    expect(prefabs.solarSystem({ labels: "none", orbitSegments: 16, starCount: 18 }).filter((node) => node.kind === "primitive" && node.name?.endsWith("readable planet label")).length).toBe(0);
  });

  test("shows physics playground contact and falling-state evidence", () => {
    const nodes = prefabs.physicsPlayground({ cubes: 50 });
    const fallingCubes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("falling visible rigid body cube") === true);
    const settledCubes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("settled pile visible rigid body cube") === true);
    const contactVectors = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("small red contact normal vector") === true);
    const floor = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "polished physics lab contact floor");

    expect(fallingCubes).toHaveLength(6);
    expect(settledCubes).toHaveLength(44);
    expect(contactVectors).toHaveLength(3);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "gravity direction cue shaft")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "subtle collision contact patch cluster center")).toBe(true);
    expect(floor?.physics).toMatchObject({ type: "static", shape: "plane" });
    expect(fallingCubes[0]?.physics).toMatchObject({ type: "dynamic", shape: "box" });
  });

  test("exposes a public scene-bound physics world with contacts, casts, debug lines, and snapshots", () => {
    const world = physics.world({ gravity: [0, -9.81, 0], enableSleeping: false });
    const floor = world.createBody({ type: "static", shape: physics.plane() });
    const ball = physics.body({ position: [0, 0.18, 0], mass: 1, shape: physics.sphere(0.25), material: { restitution: 0.2, friction: 0.4 } });
    const ballBody = world.createBody(ball);
    const node = {
      position: [0, 0.18, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number]
    };

    physics.bindNode(world, ballBody, physics.sceneBinding(node));
    ballBody.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
    const events = physics.step(world, { steps: 2 });
    const snapshot = scene()
      .physics(world)
      .add(primitives.sphere({ name: "bound ball" }).physics(physics.nodeSpec({ type: "dynamic", shape: "sphere", radius: 0.25 })))
      .toJSON();

    expect(events.some((event) => event.type === "begin" || event.type === "stay")).toBe(true);
    expect(physics.liveContactCount(world)).toBeGreaterThan(0);
    expect(physics.raycast(world, [1, 2, 0], [0, -1, 0])?.bodyId).toBe(floor.id);
    expect(physics.sphereCast(world, [1, 2, 0], 0.1, [0, -1, 0])?.bodyId).toBe(floor.id);
    expect(physics.debug(world).lines.length).toBeGreaterThan(0);
    expect(physics.debug(world).nodes.some((debugNode) => debugNode.kind === "primitive" && debugNode.name?.startsWith("active physics body state indicator"))).toBe(true);
    expect(node.position[1]).toBeLessThanOrEqual(0.25);
    expect(node.rotation[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(node.rotation[3]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(snapshot.physics).toMatchObject({ kind: "aura-physics-world", bodies: 2, colliders: 2 });
    expect(snapshot.nodes[0]).toMatchObject({ kind: "primitive", physics: { type: "dynamic", shape: "sphere" } });
    world.reset();
    expect(world.snapshot()).toMatchObject({ bodies: 2, colliders: 2, resets: 1 });
    expect(node.position[1]).toBeCloseTo(0.18, 3);
    expect(physics.debugNodes(world).some((debugNode) => debugNode.kind === "primitive" && debugNode.name?.startsWith("physics collider debug line"))).toBe(true);
  });

  test("creates a physics world from authored scene-node physics specs", () => {
    const sourceScene = scene()
      .add(primitives.plane({ name: "floor" }).physics({ type: "static", shape: "plane" }))
      .add(primitives.sphere({ name: "ball" }).position(0, 0.18, 0).rotate(0, 0.2, 0).physics({ type: "dynamic", shape: "sphere", radius: 0.2, mass: 1 }))
      .add(primitives.sphere({ name: "cup sensor" }).position(0.4, 0.18, 0).physics({ type: "static", shape: "sphere", radius: 0.25, sensor: true }))
      .toJSON();
    const world = physics.worldFromScene(sourceScene, { gravity: [0, -9.81, 0], enableSleeping: false });
    physics.step(world, { steps: 2 });
    const evidence = collectAuraSceneEvidence(scene().physics(world).addMany(sourceScene.nodes).toJSON());
    const simulatedBallNode = sourceScene.nodes[1] as AuraPrimitiveNode & { physicsRotation?: readonly [number, number, number, number] };

    expect(world.snapshot()).toMatchObject({ bodies: 3, colliders: 3 });
    expect(physics.liveContactCount(world)).toBeGreaterThan(0);
    expect(evidence.physics).toMatchObject({ bodies: 3, colliders: 3, nodesWithPhysics: 3, sensors: 1 });
    expect(simulatedBallNode.position?.[1]).toBeLessThan(0.22);
    expect(simulatedBallNode.physicsRotation).toBeDefined();
  });

  test("collects route evidence for physics, interactions, animation, labels, and typed asset provenance", () => {
    const world = physics.world({ gravity: [0, -9.81, 0] });
    world.createBody({ type: "static", shape: physics.plane() });
    world.createBody({ position: [0, 0.24, 0], shape: physics.sphere(0.18) });
    physics.step(world, { steps: 3 });
    const snapshot = scene()
      .physics(world)
      .add(model(assets.robot).animate({ clip: "turntable", speed: 0.4 }))
      .add(labels.billboard("Robot", { occlusionAware: true, collisionAvoidance: true }))
      .add(primitives.sphere({ name: "physics ball" }).physics({ type: "dynamic", shape: "sphere", sensor: true }))
      .add(interactions.orbit())
      .add(interactions.dragVector({ target: "physics ball" }))
      .add(interactions.clickImpulse({ target: "physics ball" }))
      .camera(camera.follow({ targetNode: "physics ball", captureTime: 0.35 }))
      .toJSON();
    const evidence = collectAuraSceneEvidence(snapshot);

    expect(evidence.physics).toMatchObject({ worldAttached: true, bodies: 2, colliders: 2, steps: 3, nodesWithPhysics: 1, sensors: 1 });
    expect(evidence.interactions.modes).toEqual(["click-impulse", "drag-vector", "orbit"]);
    expect(evidence.interactions.dragTargets).toEqual(["physics ball"]);
    expect(evidence.interactions.impulseTargets).toEqual(["physics ball"]);
    expect(evidence.camera).toMatchObject({ mode: "follow", orbitEnabled: true, followTarget: "physics ball", captureTime: 0.35 });
    expect(evidence.animation).toMatchObject({ animatedNodes: 1, turntableEnabled: true });
    expect(evidence.labels).toMatchObject({ count: 1, kinds: ["billboard"], occlusionAware: 1, collisionAvoidance: 1 });
    expect(evidence.assets[0]).toMatchObject({
      source: "typed-aura-assets-manifest",
      id: "robot",
      hash: "sha256-test",
      bounds: [1, 2, 1]
    });
  });

  test("keeps data visualization rich with axes, labels, caps, and hover evidence", () => {
    const nodes = prefabs.dataBars3D({ grid: 6 });
    const bars = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("height-colored data bar") === true);
    const caps = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("bright data bar top cap") === true);
    const footprints = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("soft data bar footprint") === true);
    const trendRibbon = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("trend ridge") === true);
    const columnLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("readable X") === true);
    const rowLabels = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("readable Z") === true);
    const collisionLabels = nodes.filter((node): node is AuraLabelNode => node.kind === "label" && node.collisionAvoidance === true && node.occlusionAware === true);
    const names = nodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const hoverNodes = prefabs.dataBars3D({ grid: 6, selected: { row: 4, col: 6 } });
    const hoverNames = hoverNodes.flatMap((node) => node.kind === "primitive" ? [node.name ?? ""] : []);
    const selectedBar = hoverNodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "height-colored data bar 4-6");

    expect(bars).toHaveLength(36);
    expect(caps).toHaveLength(36);
    expect(footprints).toHaveLength(36);
    expect(trendRibbon).toHaveLength(0);
    expect(columnLabels).toHaveLength(6);
    expect(rowLabels).toHaveLength(6);
    expect(collisionLabels.map((node) => node.name)).toEqual(expect.arrayContaining([
      "collision-avoiding x axis label",
      "collision-avoiding z axis label",
      "collision-avoiding height axis label"
    ]));
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "dark rear chart wall")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "readable 3D chart title backplate")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "selected metric hover readout panel")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "red high value legend swatch")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "height tick 4 back wall line")).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "bloom")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.primitive === "plane")).toBe(false);
    expect(names.some((name) => name.includes("hotspot value marker"))).toBe(false);
    expect(names.some((name) => name.includes("floating"))).toBe(false);
    expect(hoverNames).toEqual(expect.arrayContaining([
      "selected data bar outline 4-6",
      "hovered data bar readout leader 4-6"
    ]));
    expect(selectedBar?.material?.color).toBe("#f97316");
  });

  test("keeps neon tunnel cinematic with octagonal rings, reflections, and motion cues", () => {
    const nodes = prefabs.neonTunnel({ rings: 10 });
    const topSegments = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("receding neon tunnel top segment") === true);
    const tubeRings = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.primitive === "torus" && node.name?.startsWith("true circular neon tunnel tube ring") === true);
    const diagonalBraces = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("diagonal brace") === true);
    const wallChords = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("curved tube wall") === true);
    const floorReflections = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("floor reflection streak") === true);
    const speedDashes = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.includes("wall speed dash") === true);
    const sparks = nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name?.startsWith("floating tunnel spark") === true);

    expect(topSegments).toHaveLength(10);
    expect(tubeRings).toHaveLength(10);
    expect(diagonalBraces).toHaveLength(40);
    expect(wallChords).toHaveLength(20);
    expect(floorReflections).toHaveLength(10);
    expect(speedDashes).toHaveLength(10);
    expect(sparks).toHaveLength(14);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glossy black neon tunnel floor")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "left vanishing light rail")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "tiny vanishing point glow beyond tunnel")).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "particles" && node.name === "ambient tunnel dust particles" && node.particleCount === 1100)).toBe(true);
    expect(nodes.some((node) => node.kind === "effect" && node.effect === "bloom")).toBe(true);
  });

  test("shows mini-golf scoring, aiming, cup, and follow-camera target cues", () => {
    const nodes = prefabs.miniGolfHole();
    const ball = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "white physics golf ball");
    const cup = nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === "cup capture ring");
    const snapshot = scene()
      .addMany(nodes)
      .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }))
      .toJSON();

    expect(ball?.animation?.clip).toBe("roll");
    expect(ball?.interaction).toMatchObject({ cursor: "crosshair", onClick: "aim and shoot ball" });
    expect(ball?.physics).toMatchObject({ type: "dynamic", shape: "sphere", radius: 0.16 });
    expect(cup?.physics).toMatchObject({ type: "static", shape: "sphere", sensor: true });
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "ball aim selection ring")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cup capture ring")).toBe(true);
    expect(nodes.some((node) => node.kind === "label" && node.name === "mini golf score and shot HUD")).toBe(true);
    expect(nodes.some((node) => node.kind === "interaction" && node.mode === "drag-vector" && node.target === "white physics golf ball")).toBe(true);
    expect(nodes.some((node) => node.kind === "interaction" && node.mode === "click-impulse" && node.target === "white physics golf ball")).toBe(true);
    expect(snapshot.camera).toMatchObject({ mode: "follow", targetNode: "white physics golf ball" });
  });

  test("simulates mini-golf shot, score, collision metrics, and reset state", () => {
    const state = games.createMiniGolfState();
    const initial = state.snapshot();
    const shot = state.shoot({ vector: [3, 0, -1.2], power: 1.45 });
    const afterMotion = state.step(600);
    const collisionState = games.createMiniGolfState();
    collisionState.shoot({ vector: [2.6, 0, -2.2], power: 1.45 });
    const afterCollision = collisionState.step(180);

    expect(initial.ballPosition).toEqual([-1.42, 0.16, 0.58]);
    expect(shot.shots).toBe(1);
    expect(afterMotion.ballPosition[0]).toBeGreaterThan(initial.ballPosition[0]);
    expect(afterMotion.shots).toBe(1);
    expect(afterMotion.followCameraTarget).toBe("white physics golf ball");
    expect(afterMotion.selected).toBe("white physics golf ball");
    expect(afterMotion.score).toBeGreaterThanOrEqual(0);
    expect(typeof afterMotion.cupTriggered).toBe("boolean");
    expect(afterCollision.collisions).toBeGreaterThan(0);
    expect(state.nodes().some((node) => node.kind === "primitive" && node.name === "white physics golf ball" && node.position?.[0] === afterMotion.ballPosition[0])).toBe(true);
    const dragShot = games.miniGolfPointerShot({ x: 240, y: 320 }, { x: 120, y: 372 });
    expect(dragShot.power).toBeGreaterThan(1);
    expect(Math.hypot(...dragShot.vector)).toBeCloseTo(1, 5);
    const reset = state.reset();
    expect(reset).toMatchObject({ shots: 0, score: 0, collisions: 0, resets: 1, ballPosition: [-1.42, 0.16, 0.58] });
  });

  test("keeps material swatches framed in a compact inspection row", () => {
    const nodes = prefabs.materialSwatches();
    const primitiveByName = (name: string): AuraPrimitiveNode | undefined =>
      nodes.find((node): node is AuraPrimitiveNode => node.kind === "primitive" && node.name === name);
    const positions = nodes.flatMap((node) =>
      node.kind === "primitive" && node.name?.includes("swatch") && node.primitive === "sphere"
        ? [node.position?.[0] ?? 0]
        : []
    );
    const primitiveBounds = nodes.flatMap((node) => node.kind === "primitive" ? [node.position ?? [0, 0, 0] as const] : []);
    const glass = primitiveByName("transparent cyan glass swatch");
    const clearcoat = primitiveByName("red automotive clearcoat swatch");
    const clearcoatLayer = primitiveByName("transparent clearcoat outer gloss layer");

    expect(positions).toHaveLength(5);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(-2.8);
    expect(Math.max(...positions)).toBeLessThanOrEqual(2.8);
    expect(Math.min(...primitiveBounds.map((position) => position[0]))).toBeGreaterThanOrEqual(-3.55);
    expect(Math.max(...primitiveBounds.map((position) => position[0]))).toBeLessThanOrEqual(3.55);
    expect(Math.max(...primitiveBounds.map((position) => position[1]))).toBeLessThanOrEqual(2.3);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "black reflection contrast strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "cool blue environment reflection panel")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "chrome bright reflection card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glass dark contrast card")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "glass refracted white stripe")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "rubber roughness sample strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large emissive magenta glow halo")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "emissive glow spill on lab floor")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "red automotive clearcoat swatch")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "clearcoat white topcoat highlight")).toBe(true);
    expect(nodes.filter((node) => node.kind === "label" && node.collisionAvoidance === true && node.occlusionAware === true)).toHaveLength(5);
    expect(glass?.material).toMatchObject({ opacity: 0.22, transmission: 1, thickness: 0.9, ior: 1.5 });
    expect(clearcoat?.material).toMatchObject({ clearcoat: 1, roughness: 0.045, clearcoatRoughness: 0.018 });
    expect(clearcoatLayer?.material).toMatchObject({ opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.01 });
  });

  test("uses city-scale cues without per-floor window node explosions", () => {
    const nodes = prefabs.cityBlock({ blocks: 20, litWindows: true });
    const towers = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("city tower"));
    const windowColumns = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("window column"));
    const oldWindowBands = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("lit window band"));
    const crosswalkStripes = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("zebra crosswalk"));
    const sidewalks = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("sidewalk slab"));
    const storefronts = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("street-level lit storefront"));
    const awnings = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("striped storefront awning"));
    const addressPlaques = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("street address plaque"));
    const rooftopCaps = nodes.filter((node) => node.kind === "primitive" && node.name?.startsWith("rooftop mechanical cap"));
    const streetLamps = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("street lamp"));
    const lampGlowPools = nodes.filter((node) => node.kind === "primitive" && node.name?.includes("night lamp glow pool"));
    const vehicles = nodes.filter((node) => node.kind === "primitive" && node.name?.includes(" car body"));

    expect(towers).toHaveLength(20);
    expect(windowColumns).toHaveLength(80);
    expect(oldWindowBands).toHaveLength(0);
    expect(crosswalkStripes.length).toBeGreaterThanOrEqual(20);
    expect(sidewalks).toHaveLength(4);
    expect(storefronts).toHaveLength(20);
    expect(awnings).toHaveLength(20);
    expect(addressPlaques).toHaveLength(20);
    expect(rooftopCaps).toHaveLength(20);
    expect(streetLamps).toHaveLength(12);
    expect(lampGlowPools).toHaveLength(12);
    expect(vehicles).toHaveLength(4);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "zebra crosswalk near stripe 1")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "front cross street")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "back cross street")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "active night state toggle knob")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground day night state board")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large day sun state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large night moon state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground active night state bar")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "night streetlight glow proof strip")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "red traffic signal over intersection")).toBe(true);
  });

  test("switches city-block scene markers for day state evidence", () => {
    const nodes = prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "day" });

    expect(nodes.some((node) => node.kind === "primitive" && node.name === "active day state toggle knob")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "foreground active day state bar")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large day sun state marker")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "large night moon state marker")).toBe(true);
  });

  test("keeps product stage tight for three-quarter product framing", () => {
    const nodes = prefabs.productStage();
    const inspectionNodes = prefabs.productStage({ style: "inspection" });

    expect(nodes.some((node) => node.kind === "primitive" && node.name === "seamless matte product hero floor")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "low matte hero product plinth")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "soft product contact shadow from footprint")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "subtle turntable orbit cue on product plinth")).toBe(true);
    expect(nodes.some((node) => node.kind === "light" && node.name === "off camera product key softbox sneaker mesh grazing light")).toBe(true);
    expect(nodes.filter((node) => node.kind === "primitive" && node.name?.includes("turntable rotation tick")).length).toBe(0);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "fit to bounds centerline guide")).toBe(false);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "left normalized asset height bracket")).toBe(false);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "right normalized asset height bracket")).toBe(false);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "top normalized asset fit bracket")).toBe(false);
    expect(inspectionNodes.some((node) => node.kind === "primitive" && node.name === "inspection only left softbox card")).toBe(true);
    expect(inspectionNodes.some((node) => node.kind === "primitive" && node.name === "inspection only right softbox card")).toBe(true);
    expect(inspectionNodes.some((node) => node.kind === "primitive" && node.name === "inspection only product bounds tick")).toBe(true);
    expect(nodes.some((node) => node.kind === "primitive" && node.name === "inspection only left softbox card")).toBe(false);
    expect(nodes.some((node) => node.kind === "light" && node.name === "off camera cool reflection card fill softbox lace detail pin highlight")).toBe(true);
    expect(nodes.some((node) => node.kind === "light" && node.name === "rear warm reflection card rim softbox rubber sole edge kicker")).toBe(true);
  });

  test("compiles product viewer plans to normalized plinth placement with turntable evidence", () => {
    const plan = definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.robot, label: "sneaker" },
      style: "premium sneaker product viewer",
      environment: "white turntable plinth and studio sweep",
      camera: { preset: "product-orbit" },
      lighting: { preset: "studio-softbox" },
      effects: ["bloom"],
      interaction: "orbit",
      acceptanceCriteria: [
        "sneaker sits on the plinth",
        "studio softboxes and contact shadow are visible",
        "turntable rotation evidence is visible"
      ]
    } as const);
    const snapshot = promptPlanToScene(plan).toJSON();
    const productModel = snapshot.nodes.find((node): node is AuraModelNode => node.kind === "model" && node.asset.id === "robot");

    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "low matte hero product plinth")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "soft product contact shadow from footprint")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "subtle turntable orbit cue on product plinth")).toBe(true);
	    expect(productModel).toMatchObject({
	      position: [0, 0.54, -0.65],
	      rotation: [0, -0.38, 0],
	      animation: { clip: "turntable", speed: 0.42 }
	    });
		    expect(productModel?.scale).toBe(0.72);
	    expect(snapshot.camera).toMatchObject({
	      mode: "perspective",
	      position: [1.65, 1.18, 4.0],
	      target: [0, 0.72, -0.65],
	      fov: 38
	    });
	  });

	  test("provides a one-call typed product viewer helper", () => {
	    const nodes = prefabs.productViewer(assets.robot);
	    const productModel = nodes.find((node): node is AuraModelNode => node.kind === "model" && node.asset.id === "robot");

		    expect(nodes.some((node) => node.kind === "primitive" && node.name === "low matte hero product plinth")).toBe(true);
	    expect(productModel).toMatchObject({
	      position: [0, 0.54, -0.65],
	      rotation: [0, -0.38, 0],
	      animation: { clip: "turntable", speed: 0.42 }
	    });
	  });

  test("exposes labels, environments, lighting, camera, interaction, and effect helpers as first-class scene nodes", () => {
    const snapshot = scene()
      .add(environments.studio({ intensity: 1.4 }))
      .add(labels.billboard("Revenue", { name: "revenue label" }).position(0, 1.35, -0.2))
      .add(labels.hud("Strokes: 1", { screenAnchor: "top-right" }))
      .add(lights.rect({ width: 2.8, height: 1.4 }))
      .add(lights.softbox())
      .add(effects.cinematicBloom())
      .add(effects.volumetricFog())
      .add(shadows.contact({ footprint: [1.6, 0.8], position: [0, 0.02, 0] }))
      .add(interactions.raycastHover({ target: "height-colored data bar 4-6", selected: "height-colored data bar 4-6" }))
      .camera(camera.flythrough({ captureTime: 1.2 }))
      .toJSON();
    const materialKnobs = material.labParameters();

    expect(snapshot.nodes.some((node) => node.kind === "environment" && node.environment === "studio" && node.intensity === 1.4)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "label" && node.name === "revenue label" && node.text === "Revenue")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "label" && node.label === "hud" && node.screenAnchor === "top-right")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "light" && node.light === "rect" && node.width === 2.8)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "light" && node.light === "softbox")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "bloom" && node.threshold === 0.72)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "fog" && node.intensity === 0.7)).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "interaction" && node.mode === "hover" && node.selected === "height-colored data bar 4-6")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "primitive" && node.name === "soft footprint contact shadow" && Array.isArray(node.scale) && node.scale[0] === 1.6)).toBe(true);
    expect(snapshot.camera).toMatchObject({ mode: "flythrough", captureTime: 1.2 });
    expect(camera.path({ from: [0, 1, 4], to: [0, 1, 1], easing: "linear" })).toMatchObject({ mode: "path", easing: "linear" });
    expect(camera.follow({ targetNode: "hero", smoothing: 0.12, subjectEmphasis: 0.74 })).toMatchObject({ mode: "follow", smoothing: 0.12, subjectEmphasis: 0.74 });
    expect(camera.autoFrame({ bounds: { min: [-2, 0, -1], max: [2, 2, 1] } })).toMatchObject({ mode: "orbit", target: [0, 1, 0] });
    expect(camera.physics()).toMatchObject({ mode: "orbit" });
    expect(camera.charts()).toMatchObject({ mode: "orbit" });
    expect(camera.neon()).toMatchObject({ mode: "flythrough", captureTime: 0.16 });
    expect(materialKnobs.map((entry) => entry.name)).toEqual(["chrome", "glass", "rubber", "emissive", "clearcoat"]);
    expect(material.fromParameters(materialKnobs[1]!)).toMatchObject({ transmission: 1 });
    expect(primitives.capsule({ name: "rounded limb" }).toJSON()).toMatchObject({ primitive: "capsule", castShadow: true, receiveShadow: true });
    expect(primitives.torus({ name: "smooth ring" }).toJSON()).toMatchObject({ primitive: "torus", castShadow: true, receiveShadow: true });
    expect(timeline.loop({ duration: 2.4, startTime: 0.2, captureTime: 1.1, easing: "linear" })).toMatchObject({ mode: "loop", duration: 2.4, startTime: 0.2, loop: true, captureTime: 1.1, easing: "linear" });
  });

  test("attaches performance budgets to large visual helper evidence", () => {
    const helperScene = scene()
      .addMany(prefabs.physicsPlayground({ cubes: 50 }))
      .addMany(prefabs.neonTunnel({ rings: 24 }))
      .addMany(prefabs.dataBars3D({ grid: 6 }))
      .addMany(prefabs.cityBlock({ blocks: 20 }))
      .addMany(character.primitiveHumanoid())
      .addMany(prefabs.productStage());
    const evidence = collectAuraSceneEvidence(helperScene.toJSON());
    const helperIds = evidence.performance.budgets.map((budget) => budget.helper);

    expect(performance.budgetFor("neonTunnel")).toMatchObject({ maxDrawCalls: 380, targetFpsP50: 50 });
    expect(helperIds).toEqual(expect.arrayContaining([
      "physicsPlayground",
      "neonTunnel",
      "dataBars3D",
      "cityBlock",
      "primitiveHumanoid",
      "productStage"
    ]));
    expect(evidence.performance.budgets.every((budget) => budget.maxDrawCalls > 0 && budget.maxNodes > 0 && budget.targetFpsP50 >= 50)).toBe(true);
  });

  test("exposes domain helper namespaces for games, charts, city scenes, and characters", () => {
    expect(games.miniGolf().some((node) => node.kind === "primitive" && node.name === "white physics golf ball")).toBe(true);
    expect(games.miniGolfScene().toJSON().camera).toMatchObject({ mode: "follow", targetNode: "white physics golf ball" });
    expect(charts.barGrid3D({ grid: 3 }).filter((node) => node.kind === "primitive" && node.name?.startsWith("height-colored data bar"))).toHaveLength(9);
    expect(character.primitiveHumanoid({ showJoints: false }).some((node) => node.kind === "primitive" && node.name === "left shoulder ball joint")).toBe(false);
    const cityState = city.createState({ timeOfDay: "night", blocks: 20 });
    expect(cityState.timeOfDay).toBe("night");
    expect(cityState.nodes().some((node) => node.kind === "primitive" && node.name === "active night state toggle knob")).toBe(true);
    const dayNodes = cityState.toggleTimeOfDay();
    expect(cityState.timeOfDay).toBe("day");
    expect(dayNodes.some((node) => node.kind === "primitive" && node.name === "active day state toggle knob")).toBe(true);
  });

  test("exposes typed UI helpers for benchmark HUDs", () => {
    expect(ui).toMatchObject({
	      html: expect.any(Function),
	      setText: expect.any(Function),
	      setPressed: expect.any(Function),
	      onClick: expect.any(Function),
	      range: expect.any(Function),
	      onInput: expect.any(Function),
      slider: expect.any(Function),
      resetButton: expect.any(Function),
      scoreCounter: expect.any(Function),
      powerMeter: expect.any(Function),
      hoverReadout: expect.any(Function),
      toggle: expect.any(Function)
	    });
	  });

  test("mounts UI markup inside the target by default", () => {
    const calls: Array<[InsertPosition, string]> = [];
    const element = {
      insertAdjacentHTML(position: InsertPosition, markup: string) {
        calls.push([position, markup]);
      }
    } as HTMLElement;

    ui.html(element, `<div id="scene"></div>`);

    expect(calls).toEqual([["beforeend", `<div id="scene"></div>`]]);
  });

  test("accepts nullable DOM query targets at the public type boundary for headless runtime", () => {
    const app = createAuraApp(null, { scene: scene() });
    expect(app).toBeDefined();
    expect(typeof app.dispose).toBe("function");
    app.dispose();
  });

  test("compiles prompt plans into approved visual recipes", () => {
    const plan = definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.robot, label: "robot hero" },
      style: "rainy neon alley",
      camera: { preset: "cinematic-dolly" },
      lighting: { preset: "neon-practicals" },
      effects: ["rain", "fog", "bloom", "wet-reflection"],
      interaction: "orbit",
      acceptanceCriteria: ["hero asset visible", "rain visible", "wet floor visible"]
    } as const);
    const compiled = compilePromptPlan(plan);
    const snapshot = promptPlanToScene(plan).toJSON();

    expect(compiled.report).toMatchObject({
      schema: "aura3d-prompt-plan-report/1.0",
      sceneType: "cinematic-scene",
      subjectAssetId: "robot",
      cameraPreset: "cinematic-dolly",
      lightingPreset: "neon-practicals"
    });
    expect(compiled.report.visualSystems).toContain("cinematic-scene recipe");
    expect(compiled.report.repairHints.length).toBeGreaterThan(3);
    expect(compiled.report.repairHints.join(" ")).toContain("cinematic");
    expect(snapshot.camera.mode).toBe("dolly");
    expect(snapshot.nodes.some((node) => node.kind === "model" && node.asset.id === "robot")).toBe(true);
    expect(snapshot.nodes.some((node) => node.kind === "effect" && node.effect === "rain")).toBe(true);
    expect(snapshot.nodes.filter((node) => node.kind === "primitive").length).toBeGreaterThan(4);
  });

  test("warns when prompt plans omit minimum visual information", () => {
    const vaguePlan = definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.robot },
      acceptanceCriteria: []
    } as const);
    const compiled = compilePromptPlan(vaguePlan);

    expect(compiled.report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("subject is missing"),
      expect.stringContaining("style is missing"),
      expect.stringContaining("environment is missing"),
      expect.stringContaining("camera preset is missing"),
      expect.stringContaining("lighting preset is missing"),
      expect.stringContaining("effects are missing"),
      expect.stringContaining("interaction is missing"),
      expect.stringContaining("at least three concrete screenshot acceptance criteria"),
      expect.stringContaining("negative criteria are missing")
    ]));
    expect(compiled.report.cameraPreset).toBe("product-orbit");
    expect(compiled.report.lightingPreset).toBe("studio-softbox");
    expect(compiled.scene.toJSON().nodes.some((node) => node.kind === "model" && node.asset.id === "robot")).toBe(true);
  });
});

if (false) {
  // @ts-expect-error The safe API requires typed AuraAssetRef values.
  model("robot");
  // @ts-expect-error Prompt plans must use typed AuraAssetRef values for subject assets.
  definePromptPlan({ sceneType: "product-viewer", subject: { asset: "robot" }, acceptanceCriteria: [] });
  // @ts-expect-error Unknown generated asset ids fail at compile time.
  assets.madeUpRobot;
  // @ts-expect-error Invalid option shapes fail at compile time.
  camera.orbit({ distance: "near" });
}
