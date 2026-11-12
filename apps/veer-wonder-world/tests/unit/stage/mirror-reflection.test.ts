// E01's mirror reflection (PRD 05 E01 & PRD 5.5.1 §3.4): each "face" is a body
// pose, a squash/bob and the mirror reflection. The glass geometry is checked
// against the procedural mirror rig, the reflection's size against every Momo
// gesture, and its presence rules on the real stage (headless engine app).

import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { CHARACTERS, GESTURES } from "../../../src/characters/character-registry.js";
import { episode as E01 } from "../../../src/content/episodes/momo-magic-mouth.js";
import { createAnimationDirector } from "../../../src/runtime/animation-director.js";
import { NEUTRAL_POSE, placePiece, pose, type StagePose, type Vec3 } from "../../../src/scenes/motion.js";
import { PROCEDURAL_RIGS } from "../../../src/scenes/procedural-rigs/index.js";
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
import { standInPieceCount } from "../../../src/scenes/stand-ins.js";
import type { EpisodeSpec } from "../../../src/types.js";

const MIRROR_AT_REST: StagePose = { base: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: "base", centerHeight: 0.5 };

function lobeVertices(key: "mirror", suffix: string): Vec3[] {
  const rig = PROCEDURAL_RIGS[key];
  const out: Vec3[] = [];
  for (const part of rig.parts) {
    for (const lobe of part.lobes) {
      if (lobe.suffix !== suffix) continue;
      const pos = lobe.geometry.positions;
      const ox = part.anchor[0];
      const oy = part.anchor[1];
      const oz = part.anchor[2];
      for (let i = 0; i < pos.length; i += 3) {
        out.push([ox + Number(pos[i] ?? 0), oy + Number(pos[i + 1] ?? 0), oz + Number(pos[i + 2] ?? 0)]);
      }
    }
  }
  return out;
}

describe("procedural mirror glass", () => {
  it("matches MODEL_MIRROR_GLASS: a silvered disc inside a scalloped frame whose aperture never overlaps the reflection", () => {
    expect(STAND_IN_MIRROR_GLASS).toEqual(MODEL_MIRROR_GLASS);
    const glass = MODEL_MIRROR_GLASS;
    const discVerts = lobeVertices("mirror", "mirrorDisc");
    const frameVerts = lobeVertices("mirror", "frameStand");
    expect(discVerts.length).toBeGreaterThan(50);
    expect(frameVerts.length).toBeGreaterThan(200);

    const discInside = discVerts.filter((p) => Math.hypot(p[0], p[1] - glass.centerY) <= glass.radius);
    expect(discInside.length).toBeGreaterThan(40);
    expect(Math.max(...discVerts.map((p) => p[2]))).toBeLessThanOrEqual(glass.frontZ + 0.002);

    // Front wood frame ring (z >= 0) leaves a clean open aperture of radius >= MODEL_MIRROR_GLASS.radius.
    const frontFrameInside = frameVerts.filter(
      (p) => p[2] >= 0 && Math.hypot(p[0], p[1] - glass.centerY) < glass.radius
    );
    expect(frontFrameInside).toEqual([]);
  });
});

describe("reflection layout and pose (pure)", () => {
  const momo = CHARACTERS.momo;

  it("stays inside the glass for every Momo gesture, looped or not, talking or not, in full and reduced motion", () => {
    for (const mirrorHeight of [0.6, 1]) {
      const layout = reflectionLayout({ drawnAs: "procedural", heightM: mirrorHeight }, { asset: "momo", heightM: momo.heightM });
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
      expect(worst, `procedural mirror ${mirrorHeight} m`).toBeLessThan(1);
    }
  });

  it("faces out of the mirror, in front of its glass, middle on the middle of the glass", () => {
    const layout = reflectionLayout({ drawnAs: "procedural", heightM: 1 }, { asset: "momo", heightM: momo.heightM });
    const rest = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE);
    expect(rest.rotation).toEqual([0, 0, 0]);
    expect(rest.base[0]).toBeCloseTo(0, 9);
    expect(rest.base[1] + layout.heightM / 2).toBeCloseTo(MODEL_MIRROR_GLASS.centerY, 9);
    expect(rest.base[2] - (layout.size[2] / 2) * rest.scale[2]).toBeGreaterThan(MODEL_MIRROR_GLASS.frontZ);
    expect(rest.scale[2]).toBeLessThan(0.5);
    const turned = reflectionPose({ ...MIRROR_AT_REST, base: [1.3, 0, 0.1], rotation: [0, 0.4, 0.05] }, layout, NEUTRAL_POSE);
    expect(turned.rotation[1]).toBeCloseTo(0.4, 6);
    expect(turned.rotation[2]).toBeCloseTo(0.05, 6);
    expect(turned.base[0]).toBeGreaterThan(1.3);
  });

  it("plays Momo's gesture as a mirror image, scaled to its size", () => {
    const layout = reflectionLayout({ drawnAs: "procedural", heightM: 1 }, { asset: "momo", heightM: momo.heightM });
    const rest = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE);
    const offset = pose({ dx: 0.03, dy: 0.06, rx: 0.1, ry: 0.2, rz: 0.08, sy: 1.05 });
    const moved = reflectionPose(MIRROR_AT_REST, layout, offset);
    expect(moved.base[0] - rest.base[0]).toBeCloseTo(-0.03 * layout.k, 9);
    expect(moved.base[1] - rest.base[1]).toBeCloseTo(0.06 * layout.k, 9);
    expect(moved.rotation[0]).toBeCloseTo(0.1, 6);
    expect(moved.rotation[1]).toBeCloseTo(-0.2, 6);
    expect(moved.rotation[2]).toBeCloseTo(-0.08, 6);
    expect(moved.scale[1]).toBeCloseTo(1.05, 9);
    const far = reflectionPose(MIRROR_AT_REST, layout, pose({ dy: 5 }));
    expect(far.base[1] - rest.base[1]).toBeCloseTo(layout.maxShift, 9);
    const half = reflectionPose(MIRROR_AT_REST, layout, NEUTRAL_POSE, 0.5);
    expect(half.scale[1]).toBeCloseTo(0.5, 9);
    expect(half.base[1] + (layout.heightM / 2) * 0.5).toBeCloseTo(layout.glassCenterY, 9);
  });

  it("is a cooler, dimmer copy of Momo's colours", () => {
    const tint = [1, 3, 5].map((i) => Number.parseInt(REFLECTION_TINT.slice(i, i + 2), 16));
    expect(tint[2] ?? 0).toBeGreaterThan(tint[0] ?? 255);
    const momoColors = PROCEDURAL_RIGS.momo.parts
      .flatMap((p) => p.lobes.map((l) => l.baseColor))
      .filter((c): c is string => typeof c === "string" && c.startsWith("#"));
    expect(momoColors.length).toBeGreaterThan(0);
    for (const color of momoColors) {
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

  it("copies Momo's procedural rig, casts no shadow, and registers every piece in the engine", () => {
    const build = buildStoryScene(E01);
    const reflection = build.reflections[0];
    if (!reflection) throw new Error("no reflection");
    expect(reflection.drawnAs).toBe("procedural");
    expect(reflection.pieceIds).toHaveLength(standInPieceCount("momo"));
    for (const id of reflection.pieceIds) expect(build.runtimeIds).toContain(id);
    const snapshot = build.builder.toJSON();
    const rawFirstColor = PROCEDURAL_RIGS.momo.parts[0]?.lobes[0]?.baseColor;
    const firstMomoColor = typeof rawFirstColor === "string" ? rawFirstColor : "#FFFFFF";
    expect(JSON.stringify(snapshot)).toContain(multiplyColor(firstMomoColor, REFLECTION_TINT));
    const app = createAuraApp(undefined, { scene: snapshot, autoStart: false });
    try {
      const ids = app.nodes.ids();
      for (const id of reflection.pieceIds) expect(ids, id).toContain(id);
      expect(app.diagnostics().errors).toEqual([]);
    } finally {
      app.dispose();
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
    const stage = await createStage({ target: null, reducedMotion, mountTimeoutMs: 50 });
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
      expect(reflectionOf(stage)).toMatchObject({ of: "momo", in: "mirror", visible: false, drawnAs: "procedural" });
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
        const p = reflection.position;
        const glassCenterY = mirror.position[1] + MODEL_MIRROR_GLASS.centerY;
        expect(Math.hypot(p[0] - mirror.position[0], p[1] - glassCenterY)).toBeLessThan(MODEL_MIRROR_GLASS.radius);
      }
      expect(rocked).toBeGreaterThan(5);
      run(stage, 2);
      stage.apply([{ do: "object", target: "mirror", action: "wobble" }]);
      stage.update(0.15);
      expect(mirror.rotation[2]).not.toBe(0);
      expect(reflection.rotation[2]).toBeCloseTo(mirror.rotation[2], 6);
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
