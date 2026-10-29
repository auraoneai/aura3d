// E01's mirror reflection (PRD 05 E01: each "face" is a body pose, a
// squash/bob and the mirror reflection). The glass geometry is checked
// against the admitted GLB and the stand-in recipe, the reflection's size
// against every Momo gesture, and its presence rules on the real stage
// (headless engine app, no canvas).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { modelRef } from "../../../src/aura-assets.js";
import { CHARACTERS, GESTURES } from "../../../src/characters/character-registry.js";
import { episode as E01 } from "../../../src/content/episodes/momo-magic-mouth.js";
import { createAnimationDirector } from "../../../src/runtime/animation-director.js";
import { NEUTRAL_POSE, placePiece, pose, type StagePose, type Vec3 } from "../../../src/scenes/motion.js";
import {
  MODEL_MIRROR_GLASS,
  REFLECTION_TINT,
  STAND_IN_MIRROR_GLASS,
  buildStoryScene,
  createStage,
  multiplyColor,
  reflectionLayout,
  reflectionPose,
  type WonderStage
} from "../../../src/scenes/stage.js";
import { STAND_INS, standInPieceCount } from "../../../src/scenes/stand-ins.js";
import type { EpisodeSpec } from "../../../src/types.js";

const MIRROR_AT_REST: StagePose = { base: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: "base", centerHeight: 0.5 };

/** Vertex positions of a GLB's first primitive (uncompressed float POSITION accessor). */
function glbPositions(path: string): Vec3[] {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const gltf: unknown = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const doc = gltf as {
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number }[];
    bufferViews: { byteOffset?: number; byteStride?: number }[];
  };
  const accessor = doc.accessors[doc.meshes[0]?.primitives[0]?.attributes.POSITION ?? -1];
  if (!accessor || accessor.componentType !== 5126) throw new Error("expected a float POSITION accessor");
  const view = doc.bufferViews[accessor.bufferView];
  if (!view) throw new Error("missing buffer view");
  const binStart = 20 + jsonLength + 8;
  const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  const out: Vec3[] = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const o = start + i * stride;
    out.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]);
  }
  return out;
}

describe("mirror glass", () => {
  it("matches the admitted mirror GLB: a glass disc inside a frame that never reaches the reflection", () => {
    const url = modelRef("mirror")?.url;
    if (!url) throw new Error("the mirror model is not admitted");
    const raw = glbPositions(url);
    const min = [0, 1, 2].map((a) => Math.min(...raw.map((p) => p[a] ?? 0)));
    const max = [0, 1, 2].map((a) => Math.max(...raw.map((p) => p[a] ?? 0)));
    const height = (max[1] ?? 1) - (min[1] ?? 0);
    // As the engine fits it: centred on X and Z, standing on its lowest point, height 1.
    const fitted = raw.map(([x, y, z]): Vec3 => [
      (x - ((min[0] ?? 0) + (max[0] ?? 0)) / 2) / height,
      (y - (min[1] ?? 0)) / height,
      (z - ((min[2] ?? 0) + (max[2] ?? 0)) / 2) / height
    ]);
    const glass = MODEL_MIRROR_GLASS;
    const radial = fitted.map((p) => ({ r: Math.hypot(p[0], p[1] - glass.centerY), z: p[2] }));
    const inside = radial.filter((v) => v.r < glass.radius);
    const frame = radial.filter((v) => v.r >= glass.radius + 0.02 && v.r < glass.radius + 0.1);
    expect(inside.length, "glass vertices").toBeGreaterThan(50);
    expect(frame.length, "frame vertices").toBeGreaterThan(1000);
    // The glass's front is where the reflection's back starts.
    expect(Math.max(...inside.map((v) => v.z))).toBeLessThanOrEqual(glass.frontZ + 0.002);
    // Nothing between the glass's edge and the frame: the frame starts past radius + 0.01.
    expect(radial.filter((v) => v.r >= glass.radius && v.r < glass.radius + 0.01)).toEqual([]);
  });

  it("matches the stand-in mirror recipe (glass disc and torus frame)", () => {
    const recipe = STAND_INS.mirror;
    const frame = recipe.parts[0];
    if (!frame || frame.shape !== "torus") throw new Error("the stand-in mirror's first part should be its torus frame");
    expect(recipe.main.shape).toBe("cylinder");
    expect(STAND_IN_MIRROR_GLASS.centerY).toBeCloseTo(recipe.main.center[1], 6);
    // The disc lies along Z (rotated a quarter turn about X), so its height is its thickness.
    expect(recipe.main.rotation?.[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(STAND_IN_MIRROR_GLASS.frontZ).toBeCloseTo(recipe.main.size[1] / 2, 6);
    // Unit torus: ring radius 0.43; the frame's inner edge is the ring minus the tube.
    expect(STAND_IN_MIRROR_GLASS.radius).toBeCloseTo(frame.size[0] * (0.43 - (frame.tube ?? 0.045)), 6);
    expect(STAND_IN_MIRROR_GLASS.radius).toBeLessThanOrEqual(recipe.main.size[0] / 2);
  });
});

describe("reflection layout and pose (pure)", () => {
  const momo = CHARACTERS.momo;

  it("stays inside the glass for every Momo gesture, looped or not, talking or not, in full and reduced motion", () => {
    for (const drawnAs of ["model", "stand-in"] as const) {
      for (const mirrorHeight of [0.6, 1]) {
        const layout = reflectionLayout({ drawnAs, heightM: mirrorHeight }, { asset: "momo", heightM: momo.heightM });
        expect(layout.heightM).toBeGreaterThan(0.4 * layout.glassRadius);
        let worst = 0;
        for (const reduced of [false, true]) {
          for (const loop of [false, true]) {
            for (const talking of [false, true]) {
              for (const gesture of GESTURES) {
                const director = createAnimationDirector({ reducedMotion: reduced });
                director.register({ id: "momo", profile: momo, canPlayClips: false });
                if (talking) director.setTalking("momo");
                director.gesture("momo", gesture, loop);
                const duration = momo.procedural(gesture).durationSec;
                for (let i = 0; i <= 40; i += 1) {
                  director.update(i === 0 ? 0 : duration / 40);
                  const drawn = reflectionPose(MIRROR_AT_REST, layout, director.pose("momo"));
                  const [w, h] = layout.size;
                  for (const [x, y] of [[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]] as const) {
                    const corner = placePiece(drawn, [x, y, 0]);
                    worst = Math.max(worst, Math.hypot(corner[0], corner[1] - layout.glassCenterY) / layout.glassRadius);
                  }
                }
              }
            }
          }
        }
        expect(worst, `${drawnAs} mirror ${mirrorHeight} m`).toBeLessThan(1);
      }
    }
  });

  it("faces out of the mirror, in front of its glass, middle on the middle of the glass", () => {
    const layout = reflectionLayout({ drawnAs: "model", heightM: 1 }, { asset: "momo", heightM: momo.heightM });
    const rest = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE);
    expect(rest.rotation).toEqual([0, 0, 0]);
    expect(rest.base[0]).toBeCloseTo(0, 9);
    expect(rest.base[1] + layout.heightM / 2).toBeCloseTo(MODEL_MIRROR_GLASS.centerY, 9);
    // Its back clears the glass.
    expect(rest.base[2] - (layout.size[2] / 2) * rest.scale[2]).toBeGreaterThan(MODEL_MIRROR_GLASS.frontZ);
    // Flattened onto the glass, never standing out of it like a second Momo.
    expect(rest.scale[2]).toBeLessThan(0.5);
    // It rides with the mirror: turned, raised and wobbling with it.
    const turned = reflectionPose({ ...MIRROR_AT_REST, base: [1.3, 0, 0.1], rotation: [0, 0.4, 0.05] }, layout, NEUTRAL_POSE);
    expect(turned.rotation[1]).toBeCloseTo(0.4, 6);
    expect(turned.rotation[2]).toBeCloseTo(0.05, 6);
    expect(turned.base[0]).toBeGreaterThan(1.3);
  });

  it("plays Momo's gesture as a mirror image, scaled to its size", () => {
    const layout = reflectionLayout({ drawnAs: "stand-in", heightM: 1 }, { asset: "momo", heightM: momo.heightM });
    const rest = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE);
    const offset = pose({ dx: 0.03, dy: 0.06, rx: 0.1, ry: 0.2, rz: 0.08, sy: 1.05 });
    const moved = reflectionPose(MIRROR_AT_REST, layout, offset);
    // A step or rock to one side goes to the other; a turn goes the other way; a lean toward the viewer stays.
    expect(moved.base[0] - rest.base[0]).toBeCloseTo(-0.03 * layout.k, 9);
    expect(moved.base[1] - rest.base[1]).toBeCloseTo(0.06 * layout.k, 9);
    expect(moved.rotation[0]).toBeCloseTo(0.1, 6);
    expect(moved.rotation[1]).toBeCloseTo(-0.2, 6);
    expect(moved.rotation[2]).toBeCloseTo(-0.08, 6);
    expect(moved.scale[1]).toBeCloseTo(1.05, 9);
    // A shift too big for the glass is kept inside it.
    const far = reflectionPose(MIRROR_AT_REST, layout, pose({ dy: 5 }));
    expect(far.base[1] - rest.base[1]).toBeCloseTo(layout.maxShift, 9);
    // It shrinks about the middle of the glass with Momo's own soft hide.
    const half = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE, 0.5);
    expect(half.scale[1]).toBeCloseTo(0.5, 9);
    expect(half.base[1] + (layout.heightM / 2) * 0.5).toBeCloseTo(layout.glassCenterY, 9);
  });

  it("is a cooler, dimmer copy of Momo's colours", () => {
    const tint = [1, 3, 5].map((i) => Number.parseInt(REFLECTION_TINT.slice(i, i + 2), 16));
    expect(tint[2] ?? 0).toBeGreaterThan(tint[0] ?? 255);
    for (const color of [STAND_INS.momo.main.color, ...STAND_INS.momo.parts.map((p) => p.color)]) {
      const before = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
      const after = [1, 3, 5].map((i) => Number.parseInt(multiplyColor(color, REFLECTION_TINT).slice(i, i + 2), 16));
      after.forEach((v, i) => expect(v).toBeLessThanOrEqual(before[i] ?? 0));
    }
    expect(multiplyColor("#FFFFFF", REFLECTION_TINT)).toBe(REFLECTION_TINT.toUpperCase());
    expect(multiplyColor("#000000", REFLECTION_TINT)).toBe("#000000");
  });
});

describe("reflection in a story's scene", () => {
  const withCast = (cast: EpisodeSpec["cast"], props: EpisodeSpec["props"]): EpisodeSpec => ({ ...E01, id: "probe-mirror", cast, props });

  it("is built only when the story has a mirror prop and Momo in its cast", () => {
    expect(buildStoryScene(E01).reflections.map((r) => [r.id, r.of, r.in])).toEqual([["mirror~reflection", "momo", "mirror"]]);
    expect(buildStoryScene(withCast([{ id: "lulu", at: "left" }], E01.props)).reflections).toEqual([]);
    expect(buildStoryScene(withCast(E01.cast, [{ id: "cushion", asset: "cushion", at: "backLeft" }])).reflections).toEqual([]);
  });

  it("copies Momo's model (or her stand-in), cast no shadow, and every piece is a node the engine knows", () => {
    for (const withModels of [false, true]) {
      const build = buildStoryScene(E01, { modelAvailable: () => withModels });
      const reflection = build.reflections[0];
      if (!reflection) throw new Error("no reflection");
      expect(reflection.drawnAs).toBe(withModels ? "model" : "stand-in");
      // Draw-call cost: one model node, or the stand-in's own pieces.
      expect(reflection.pieceIds).toHaveLength(withModels ? 1 : standInPieceCount("momo"));
      for (const id of reflection.pieceIds) expect(build.runtimeIds).toContain(id);
      const snapshot = build.builder.toJSON();
      const json = JSON.stringify(snapshot);
      expect(json).toContain(withModels ? `"color":"${REFLECTION_TINT}"` : multiplyColor(STAND_INS.momo.main.color, REFLECTION_TINT));
      const app = createAuraApp(undefined, { scene: snapshot, autoStart: false });
      try {
        const ids = app.nodes.ids();
        for (const id of reflection.pieceIds) expect(ids, id).toContain(id);
        expect(app.diagnostics().errors).toEqual([]);
      } finally {
        app.dispose();
      }
    }
  });
});

describe("reflection on the stage (headless engine, no canvas)", () => {
  const probe: EpisodeSpec = {
    ...E01,
    id: "probe-mirror-stage",
    cast: [{ id: "momo", at: "left" }],
    props: [{ id: "mirror", asset: "mirror", at: "right", hidden: true, size: 1 }],
    beats: []
  };

  const open = async (reducedMotion = false): Promise<WonderStage> => {
    const stage = await createStage({ target: null, reducedMotion, models: false, mountTimeoutMs: 50 });
    await stage.load(probe);
    return stage;
  };
  const run = (stage: WonderStage, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds * 20); i += 1) stage.update(0.05);
  };
  const reflectionOf = (stage: WonderStage) => {
    const r = stage.snapshot().reflections[0];
    if (!r) throw new Error("no reflection");
    return r;
  };

  it("is shown only while both the mirror and Momo are shown", async () => {
    const stage = await open();
    try {
      const node = stage.game().app.nodes.get("mirror~reflection");
      if (!node) throw new Error("no reflection node");
      run(stage, 0.1);
      expect(reflectionOf(stage)).toMatchObject({ of: "momo", in: "mirror", visible: false, drawnAs: "stand-in" });
      expect(node.visible).toBe(false);
      stage.apply([{ do: "show", actor: "mirror" }]);
      run(stage, 0.5);
      expect(reflectionOf(stage).visible).toBe(true);
      expect(node.visible).toBe(true);
      stage.apply([{ do: "hide", actor: "momo" }]);
      run(stage, 0.5);
      expect(reflectionOf(stage).visible).toBe(false);
      expect(node.visible).toBe(false);
      stage.apply([{ do: "show", actor: "momo" }]);
      run(stage, 0.5);
      expect(node.visible).toBe(true);
      // Momo walks off: gone from the mirror once she is.
      stage.apply([{ do: "exit", actor: "momo", to: "offLeft" }]);
      run(stage, 4);
      expect(node.visible).toBe(false);
      stage.apply([{ do: "enter", actor: "momo", at: "center" }]);
      run(stage, 4);
      expect(node.visible).toBe(true);
      stage.apply([{ do: "hide", actor: "mirror" }]);
      run(stage, 0.5);
      expect(node.visible).toBe(false);
      expect(stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"))).toEqual([]);
    } finally {
      stage.dispose();
    }
  });

  it("plays Momo's gestures as a mirror image, inside the glass, and rides with the mirror", async () => {
    const stage = await open();
    try {
      stage.apply([{ do: "show", actor: "mirror" }, { do: "face", actor: "momo", toward: "viewer" }]);
      run(stage, 1);
      const app = stage.game().app;
      const momo = app.nodes.get("momo");
      const reflection = app.nodes.get("mirror~reflection");
      const mirror = app.nodes.get("mirror");
      if (!momo || !reflection || !mirror) throw new Error("missing nodes");
      stage.apply([{ do: "gesture", actor: "momo", gesture: "wave" }]);
      expect(reflectionOf(stage).gesture).toBe("wave");
      let rocked = 0;
      for (let i = 0; i < 30; i += 1) {
        stage.update(0.05);
        const m = momo.rotation[2];
        const r = reflection.rotation[2];
        if (Math.abs(m) > 0.02) {
          rocked += 1;
          expect(Math.sign(r)).toBe(-Math.sign(m));
          expect(Math.abs(r)).toBeCloseTo(Math.abs(m), 6);
        }
        // The middle of its body stays on the glass (the stand-in mirror's main piece is the glass disc).
        const p = reflection.position;
        expect(Math.hypot(p[0] - mirror.position[0], p[1] - mirror.position[1])).toBeLessThan(STAND_IN_MIRROR_GLASS.radius / 2);
      }
      expect(rocked).toBeGreaterThan(5);
      // The mirror wobbles: the reflection wobbles with it.
      run(stage, 2);
      stage.apply([{ do: "object", target: "mirror", action: "wobble" }]);
      stage.update(0.15);
      expect(mirror.rotation[2]).not.toBe(0);
      expect(reflection.rotation[2]).toBeCloseTo(mirror.rotation[2], 6);
      // QA crops ask for it by id like any node; headless there is no canvas to measure, and asking is safe.
      expect(stage.nodeRects(["mirror~reflection"])).toEqual([]);
    } finally {
      stage.dispose();
    }
  });

  it("is deterministic and goes away with its story", async () => {
    const play = async (): Promise<string> => {
      const stage = await open();
      try {
        stage.apply([{ do: "show", actor: "mirror" }, { do: "gesture", actor: "momo", gesture: "mirror" }]);
        const frames: string[] = [];
        for (let i = 0; i < 40; i += 1) {
          stage.update(0.05);
          const r = stage.game().app.nodes.get("mirror~reflection");
          frames.push(JSON.stringify([r?.position, r?.rotation, r?.scale, r?.visible]));
        }
        return frames.join("\n");
      } finally {
        stage.dispose();
      }
    };
    expect(await play()).toBe(await play());
    const stage = await open();
    try {
      await stage.load({ ...probe, id: "probe-no-mirror", props: [] });
      expect(stage.snapshot().reflections).toEqual([]);
    } finally {
      stage.dispose();
    }
  });
});
