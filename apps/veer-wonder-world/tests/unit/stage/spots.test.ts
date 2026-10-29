import { describe, expect, it } from "vitest";
import {
  CAMERA_PRESETS,
  CORE_SPOTS,
  HIGH_SPOTS,
  OFF_STAGE_SPOTS,
  ON_STAGE_SPOTS,
  SPOTS,
  SPOT_IDS,
  boxToCssRect,
  cssToNdc,
  defaultEntrySpot,
  frameCamera,
  isInFrame,
  ndcToCss,
  placeAtSpot,
  projectToNdc,
  rayBoxDistance,
  rayThroughNdc,
  requiredHalfWidth,
  resolveLayout,
  standingBox,
  type LayoutEntry
} from "../../../src/scenes/spots.js";
import { WORLDS, WORLD_IDS, worldDressingKeys, type DressingPrimitive } from "../../../src/scenes/worlds.js";
import { LOOK_HDRI_FILES, WORLD_LOOKS, lookHasEnvironment, lookHdriFile, worldLookNodes } from "../../../src/scenes/looks.js";
import { ASSET_TRAITS, STAND_INS, footprintM, primitiveParams, standInPieceMaterial } from "../../../src/scenes/stand-ins.js";
import { MODEL_KEYS } from "../../../src/aura-assets.js";
import { createAuraApp, raycastFirst } from "@aura3d/engine";
import {
  buildStoryScene,
  createStage,
  hitBox,
  pickTargetAt,
  targetRectFor,
  type PickCandidate,
  type StageNodeSnapshot,
  type WonderStage
} from "../../../src/scenes/stage.js";
import { ACTIVITIES, EPISODES } from "../../../src/content/catalog.js";
import type { BeatSpec, CameraPresetId, EpisodeSpec, SpotId, StageAction, StorySpec, WorldId } from "../../../src/types.js";
import type { Vec3 } from "../../../src/scenes/motion.js";

const PRESETS = Object.keys(CAMERA_PRESETS) as CameraPresetId[];
const LANDSCAPE = [4 / 3, 1.6, 16 / 9, 2.17, 2.4];
const PORTRAIT = [0.46, 0.56, 0.75, 1.0];
const ALL_ASPECTS = [...PORTRAIT, ...LANDSCAPE];

/** Points that must be visible for a 1 m character standing on (or floating at) a spot. */
function bodyPoints(spot: SpotId): Vec3[] {
  const [x, y, z] = SPOTS[spot];
  if (HIGH_SPOTS.includes(spot)) return [[x, y - 0.1, z], [x, y + 0.5, z]];
  return [[x, y + 0.05, z], [x, y + 1.0, z]];
}

/** Half the width of a character with its arms out (Momo's wave), at chest height: both sides must be in frame too. */
const BODY_HALF_WIDTH = 0.5;

function bodyAndArmPoints(spot: SpotId): Vec3[] {
  const [x, y, z] = SPOTS[spot];
  const chest = HIGH_SPOTS.includes(spot) ? y + 0.2 : y + 0.5;
  return [...bodyPoints(spot), [x - BODY_HALF_WIDTH, chest, z], [x + BODY_HALF_WIDTH, chest, z]];
}

describe("spots", () => {
  it("defines every SpotId, ground spots on the floor and high spots up in the air", () => {
    expect(SPOT_IDS).toHaveLength(18);
    for (const spot of ON_STAGE_SPOTS) {
      if (HIGH_SPOTS.includes(spot)) expect(SPOTS[spot][1]).toBeGreaterThan(1.5);
      else expect(SPOTS[spot][1]).toBe(0);
    }
    expect(OFF_STAGE_SPOTS).toEqual(["offLeft", "offRight", "offTop", "offBelow"]);
  });

  it("keeps characters about a metre apart on the main row", () => {
    expect(SPOTS.right[0] - SPOTS.center[0]).toBeGreaterThanOrEqual(1.2);
    expect(SPOTS.center[0] - SPOTS.left[0]).toBeGreaterThanOrEqual(1.2);
    expect(SPOTS.farRight[0] - SPOTS.right[0]).toBeGreaterThanOrEqual(1.0);
  });

  it("enters from the nearer side, or from above for floaters and high spots", () => {
    expect(defaultEntrySpot("left", false)).toBe("offLeft");
    expect(defaultEntrySpot("right", false)).toBe("offRight");
    expect(defaultEntrySpot("center", false)).toBe("offLeft");
    expect(defaultEntrySpot("highRight", false)).toBe("offTop");
    expect(defaultEntrySpot("left", true)).toBe("offTop");
  });
});

describe("fixed child camera", () => {
  it("sits about 4.5 m back in the medium framing", () => {
    const pose = frameCamera("medium", 16 / 9);
    const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    expect(d).toBeGreaterThan(4.2);
    expect(d).toBeLessThan(5.2);
    expect(pose.position[2]).toBeGreaterThan(4);
  });

  it("never widens past its maximum field of view and never shows more than its maximum half-width", () => {
    for (const preset of PRESETS) {
      for (const aspect of ALL_ASPECTS) {
        const pose = frameCamera(preset, aspect);
        const spec = CAMERA_PRESETS[preset];
        expect(pose.fov).toBeLessThanOrEqual(spec.maxFov + 1e-9);
        const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
        const halfWidth = d * Math.tan((pose.fov * Math.PI) / 360) * aspect;
        expect(halfWidth).toBeGreaterThanOrEqual(requiredHalfWidth(spec, aspect) - 1e-6);
        expect(halfWidth).toBeLessThanOrEqual(Math.max(spec.maxHalfWidth, requiredHalfWidth(spec, aspect)) + 1e-6);
      }
    }
  });

  it("keeps every on-stage spot in frame for the wide and medium framings on landscape screens", () => {
    for (const preset of ["wide", "medium", "high"] as const) {
      for (const aspect of LANDSCAPE) {
        const pose = frameCamera(preset, aspect);
        for (const spot of ON_STAGE_SPOTS) {
          for (const point of bodyPoints(spot)) {
            expect(isInFrame(point, pose, aspect, 0.02), `${preset} ${aspect.toFixed(2)} ${spot}`).toBe(true);
          }
        }
      }
    }
  });

  it("keeps the core of the stage in frame on portrait phones and tablets, arms included", () => {
    for (const preset of ["wide", "medium"] as const) {
      for (const aspect of PORTRAIT) {
        const pose = frameCamera(preset, aspect);
        for (const spot of CORE_SPOTS) {
          for (const point of bodyAndArmPoints(spot)) {
            expect(isInFrame(point, pose, aspect, 0.01), `${preset} ${aspect.toFixed(2)} ${spot}`).toBe(true);
          }
        }
      }
    }
  });

  it("keeps offBelow fully under the ground", () => {
    expect(SPOTS.offBelow[1] + 1.2).toBeLessThan(0);
  });

  it("keeps the off spots out of every framing, so entrances start unseen", () => {
    for (const preset of PRESETS) {
      for (const aspect of ALL_ASPECTS) {
        const pose = frameCamera(preset, aspect);
        for (const spot of OFF_STAGE_SPOTS) {
          // offBelow is under the opaque ground plane, so the ground hides it in every framing.
          if (spot === "offBelow") continue;
          const [x, y, z] = SPOTS[spot];
          // The whole body (half a metre either side, a metre tall) stays out of view.
          for (const point of [[x - 0.5, y, z], [x + 0.5, y, z], [x, y + 1, z], [x - 0.5, y + 1, z], [x + 0.5, y + 1, z]] as Vec3[]) {
            expect(isInFrame(point, pose, aspect), `${preset} ${aspect.toFixed(2)} ${spot}`).toBe(false);
          }
        }
      }
    }
  });

  it("frames the close and side shots on their subjects", () => {
    expect(isInFrame([0, 0.9, 0], frameCamera("close", 16 / 9), 16 / 9)).toBe(true);
    expect(isInFrame([-1.3, 0.8, 0.1], frameCamera("left", 16 / 9), 16 / 9)).toBe(true);
    expect(isInFrame([1.3, 0.8, 0.1], frameCamera("right", 16 / 9), 16 / 9)).toBe(true);
  });
});

describe("projection and hit math", () => {
  const aspect = 16 / 9;
  const pose = frameCamera("medium", aspect);

  it("projects the camera target to the frame centre", () => {
    const ndc = projectToNdc(pose.target, pose, aspect);
    expect(ndc).not.toBeNull();
    expect(ndc?.[0] ?? 1).toBeCloseTo(0, 6);
    expect(ndc?.[1] ?? 1).toBeCloseTo(0, 6);
    expect(projectToNdc([0, 1, 20], pose, aspect)).toBeNull();
  });

  it("round-trips CSS pixels and NDC", () => {
    const [nx, ny] = cssToNdc(300, 120, 800, 450);
    const [x, y] = ndcToCss(nx, ny, 800, 450);
    expect(x).toBeCloseTo(300, 6);
    expect(y).toBeCloseTo(120, 6);
  });

  it("a ray through a target's projected centre hits its inflated box", () => {
    for (const spot of ON_STAGE_SPOTS) {
      const base = SPOTS[spot];
      const box = standingBox(base, [0.6, 1, 0.6], 1.4, 0.5);
      const centre: Vec3 = [base[0], base[1] + 0.5, base[2]];
      const ndc = projectToNdc(centre, pose, aspect);
      expect(ndc).not.toBeNull();
      if (!ndc) continue;
      const ray = rayThroughNdc(pose, aspect, ndc[0], ndc[1]);
      expect(rayBoxDistance(ray.origin, ray.direction, box), spot).not.toBeNull();
    }
    const miss = rayThroughNdc(pose, aspect, 0.98, 0.98);
    expect(rayBoxDistance(miss.origin, miss.direction, standingBox(SPOTS.center, [0.6, 1, 0.6], 1.4, 0.5))).toBeNull();
  });

  it("inflating by 1.4 makes the hit area at least 1.4x the bounds", () => {
    const box = standingBox([0, 0, 0], [0.5, 1, 0.4], 1.4, 0);
    expect(box.max[0] - box.min[0]).toBeCloseTo(0.7, 6);
    expect(box.max[1] - box.min[1]).toBeCloseTo(1.4, 6);
    const tiny = standingBox([0, 0, 0], [0.1, 0.1, 0.1], 1.4, 0.5);
    expect(tiny.max[0] - tiny.min[0]).toBeCloseTo(0.5, 6);
  });

  it("screen rectangles cover the projected centre and stay inside the canvas", () => {
    const rect = boxToCssRect(standingBox(SPOTS.left, [0.6, 1, 0.6], 1.4, 0.5), pose, aspect, 1280, 720);
    expect(rect).not.toBeNull();
    if (!rect) return;
    const ndc = projectToNdc([SPOTS.left[0], 0.5, SPOTS.left[2]], pose, aspect);
    const [cx, cy] = ndcToCss(ndc?.[0] ?? 0, ndc?.[1] ?? 0, 1280, 720);
    expect(cx).toBeGreaterThanOrEqual(rect.x);
    expect(cx).toBeLessThanOrEqual(rect.x + rect.w);
    expect(cy).toBeGreaterThanOrEqual(rect.y);
    expect(cy).toBeLessThanOrEqual(rect.y + rect.h);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.h).toBeLessThanOrEqual(720);
    // A character-sized target is comfortably larger than a 64 px finger radius on a phone-sized canvas.
    const phone = boxToCssRect(standingBox(SPOTS.center, [0.6, 1, 0.6], 1.4, 0.5), frameCamera("medium", 844 / 390), 844 / 390, 844, 390);
    expect(Math.max(phone?.w ?? 0, phone?.h ?? 0)).toBeGreaterThan(64);
  });
});

describe("picking a touch target (pure, with the engine raycast)", () => {
  const W = 1280;
  const H = 720;
  const cam = frameCamera("medium", W / H);
  const ball: PickCandidate = { id: "ball", base: SPOTS.front, size: [0.3, 0.3, 0.3] };
  const door: PickCandidate = { id: "door", base: SPOTS.right, size: [0.62, 1.6, 0.1] };
  const centreCss = (c: PickCandidate, pose = cam, width = W, height = H): readonly [number, number] => {
    const ndc = projectToNdc([c.base[0], c.base[1] + c.size[1] / 2, c.base[2]], pose, width / height);
    if (!ndc) throw new Error(`${c.id} is behind the camera`);
    return ndcToCss(ndc[0], ndc[1], width, height);
  };

  it("the engine raycast and the stage projection agree on every fixed framing and aspect", () => {
    let checked = 0;
    for (const preset of PRESETS) {
      for (const aspect of ALL_ASPECTS) {
        const pose = frameCamera(preset, aspect);
        const height = 720;
        const width = Math.round(height * aspect);
        for (const spot of CORE_SPOTS) {
          const p: Vec3 = [SPOTS[spot][0], SPOTS[spot][1] + 0.5, SPOTS[spot][2]];
          const ndc = projectToNdc(p, pose, width / height);
          if (!ndc || Math.abs(ndc[0]) > 0.98 || Math.abs(ndc[1]) > 0.98) continue;
          const [x, y] = ndcToCss(ndc[0], ndc[1], width, height);
          // A 4 cm box: any disagreement in fov, aspect or orientation misses it.
          const hit = raycastFirst(
            { camera: { position: pose.position, target: pose.target, fov: pose.fov, aspect: width / height, near: pose.near, far: pose.far, up: [0, 1, 0] }, ndc: cssToNdc(x, y, width, height) },
            { targets: [{ nodeName: spot, bounds: { min: [p[0] - 0.02, p[1] - 0.02, p[2] - 0.02], max: [p[0] + 0.02, p[1] + 0.02, p[2] + 0.02], center: p, size: [0.04, 0.04, 0.04], floorY: p[1] - 0.02 } }] }
          );
          expect(hit?.nodeName, `${preset} ${aspect.toFixed(2)} ${spot}`).toBe(spot);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("picks a target tapped on its centre, within 64 px of it, or anywhere in its 1.4x hit box, and nothing far away", () => {
    const [bx, by] = centreCss(ball);
    expect(pickTargetAt([ball, door], cam, bx, by, W, H)).toBe("ball");
    expect(pickTargetAt([ball, door], cam, bx + 60, by, W, H)).toBe("ball");
    expect(pickTargetAt([ball, door], cam, bx, by - 60, W, H)).toBe("ball");
    const [dx, dy] = centreCss(door);
    expect(pickTargetAt([ball, door], cam, dx, dy, W, H)).toBe("door");
    // The top of the door's hit box (1.4x its 1.6 m height, centred) is still the door.
    const top = projectToNdc([door.base[0], door.base[1] + 0.8 + 0.8 * 1.35, door.base[2]], cam, W / H);
    if (!top) throw new Error("door top behind camera");
    const [tx, ty] = ndcToCss(top[0], top[1], W, H);
    expect(pickTargetAt([ball, door], cam, tx, ty, W, H)).toBe("door");
    expect(pickTargetAt([ball, door], cam, 20, 20, W, H)).toBeNull();
    expect(pickTargetAt([], cam, bx, by, W, H)).toBeNull();
    expect(pickTargetAt([ball], cam, bx, by, 0, H)).toBeNull();
  });

  it("gives every target a rectangle of at least 128 x 128 CSS px inside the canvas, around its centre", () => {
    for (const target of [ball, door, { id: "edge", base: SPOTS.farRight, size: [0.2, 0.2, 0.2] as Vec3 }]) {
      const rect = targetRectFor(target, cam, W, H);
      if (!rect) throw new Error(`${target.id} has no rectangle`);
      expect(rect.w).toBeGreaterThanOrEqual(128);
      expect(rect.h).toBeGreaterThanOrEqual(128);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(W + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(H + 1e-6);
      const [cx, cy] = centreCss(target);
      if (cx >= 0 && cx <= W) {
        expect(cx).toBeGreaterThanOrEqual(rect.x - 1e-6);
        expect(cx).toBeLessThanOrEqual(rect.x + rect.w + 1e-6);
        expect(cy).toBeGreaterThanOrEqual(rect.y - 1e-6);
        expect(cy).toBeLessThanOrEqual(rect.y + rect.h + 1e-6);
      }
    }
    const box = hitBox(ball);
    expect(box.max[0] - box.min[0]).toBeGreaterThanOrEqual(0.5);
    expect(targetRectFor(ball, cam, 0, 0)).toBeNull();
  });
});

describe("layout of shared spots", () => {
  const entry = (id: string, spot: SpotId, role: LayoutEntry["role"], size: Vec3, extra: Partial<LayoutEntry> = {}): LayoutEntry => ({
    id,
    spot,
    role,
    width: size[0],
    height: size[1],
    depth: size[2],
    hidden: false,
    ...extra
  });

  it("puts a node alone on a spot exactly on it", () => {
    const layout = resolveLayout([entry("momo", "left", "actor", [0.8, 0.9, 0.7])]);
    expect(layout.get("momo")).toEqual(SPOTS.left);
  });

  it("hides a hidden friend behind the door that shares its spot (peekaboo)", () => {
    const layout = resolveLayout([
      entry("door-right", "right", "occluder", [1.0, 1.6, 0.16]),
      entry("peeko", "right", "actor", [0.43, 0.45, 0.4], { hidden: true })
    ]);
    expect(layout.get("door-right")).toEqual(SPOTS.right);
    const peeko = layout.get("peeko");
    expect(peeko?.[0]).toBeCloseTo(SPOTS.right[0], 6);
    expect(peeko?.[2] ?? 0).toBeLessThan(SPOTS.right[2] - 0.2);
  });

  it("rests small props on a surface and stacks blocks into a tower", () => {
    const layout = resolveLayout([
      entry("table", "center", "surface", [1.0, 0.6, 1.0], { restHeight: 0.6 }),
      entry("cake", "center", "plain", [0.6, 0.45, 0.6])
    ]);
    expect(layout.get("cake")?.[1]).toBeCloseTo(0.6, 6);
    const tower = resolveLayout([
      entry("block1", "center", "stackable", [0.35, 0.35, 0.35]),
      entry("block2", "center", "stackable", [0.35, 0.35, 0.35]),
      entry("block3", "center", "stackable", [0.35, 0.35, 0.35])
    ]);
    expect(tower.get("block1")?.[1]).toBeCloseTo(0, 6);
    expect(tower.get("block2")?.[1]).toBeCloseTo(0.35, 6);
    expect(tower.get("block3")?.[1]).toBeCloseTo(0.7, 6);
  });

  it("stands friends who share a spot side by side, centred on it", () => {
    const layout = resolveLayout([
      entry("momo", "center", "actor", [0.8, 0.9, 0.7]),
      entry("lulu", "center", "actor", [0.66, 1, 0.62])
    ]);
    const momo = layout.get("momo");
    const lulu = layout.get("lulu");
    expect(momo && lulu).toBeTruthy();
    if (!momo || !lulu) return;
    expect(lulu[0] - momo[0]).toBeGreaterThan(0.7);
    expect((momo[0] - 0.4 + lulu[0] + 0.33) / 2).toBeCloseTo(0, 1);
  });

  it("puts one counted object per place (three cookies stay side by side, never stacked)", () => {
    const layout = resolveLayout([
      entry("plate", "center", "surface", [1.0, 0.05, 1.0], { restHeight: 0.05 }),
      entry("cookie1", "center", "plain", [0.4, 0.18, 0.4]),
      entry("cookie2", "center", "plain", [0.4, 0.18, 0.4]),
      entry("cookie3", "center", "plain", [0.4, 0.18, 0.4])
    ]);
    const xs = ["cookie1", "cookie2", "cookie3"].map((id) => layout.get(id)?.[0] ?? 0);
    expect(new Set(xs.map((x) => x.toFixed(3))).size).toBe(3);
    for (const id of ["cookie1", "cookie2", "cookie3"]) expect(layout.get(id)?.[1]).toBeCloseTo(0.05, 6);
  });

  it("moves to an occupied spot stop beside the occupant, and small props land on surfaces", () => {
    const beside = placeAtSpot("center", { id: "lulu", role: "actor", width: 0.66, height: 1, from: [-6.5, 0, 0] }, [
      { id: "momo", position: SPOTS.center, role: "actor", width: 0.8, height: 0.9 }
    ]);
    expect(beside[0]).toBeLessThan(-0.6);
    const onTable = placeAtSpot("center", { id: "cookie", role: "plain", width: 0.4, height: 0.18, from: [1, 0, 1] }, [
      { id: "table", position: SPOTS.center, role: "surface", width: 1, height: 0.6, restHeight: 0.6 }
    ]);
    expect(onTable[1]).toBeCloseTo(0.6, 6);
    expect(placeAtSpot("left", { id: "x", role: "actor", width: 0.5, height: 1, from: [0, 0, 0] }, [])).toEqual(SPOTS.left);
  });
});

describe("worlds and looks", () => {
  it("every world has dressing, a music bed and a look with an HDRI environment and no vignette", () => {
    expect(WORLD_IDS).toHaveLength(6);
    for (const id of WORLD_IDS) {
      const world = WORLDS[id];
      expect(world.id).toBe(id);
      expect(world.dressing.length).toBeGreaterThan(3);
      expect(lookHasEnvironment(id)).toBe(true);
      expect(lookHdriFile(id)).toMatch(/\.hdr$/);
      const nodes = worldLookNodes(id).map((node) => JSON.stringify(node.toJSON()));
      expect(nodes.join("\n")).not.toMatch(/"effect":"vignette"/);
      expect(nodes.join("\n")).toMatch(/"environment":"hdri"/);
      // Pastel worlds sit about a stop under the presets (look-dev round 1), never so far that frames go murky.
      expect(WORLD_LOOKS[id].overrides.exposureEv ?? 0).toBeGreaterThanOrEqual(-1.5);
      expect(WORLD_LOOKS[id].overrides.exposureEv ?? 0).toBeLessThanOrEqual(0);
    }
    expect(LOOK_HDRI_FILES.length).toBeGreaterThan(0);
  });

  it("dressing never stands in the play area or between the camera and the cast", () => {
    for (const id of WORLD_IDS) {
      for (const item of WORLDS[id].dressing) {
        const items = item.kind === "instances" ? item.items.map((entry) => ({ at: entry.at, size: entry.size })) : [{ at: item.at, size: item.kind === "primitive" ? item.size : [1, item.heightM ?? 1, 1] as Vec3 }];
        for (const { at, size } of items) {
          const flat = size[1] <= 0.08 && at[1] <= 0.1;
          const inSky = at[1] > 2.2;
          const inPlayArea = Math.abs(at[0]) < 2.9 && at[2] > -2.2 && at[2] < 2.2;
          if (flat || inSky) continue;
          expect(inPlayArea, `${id} ${JSON.stringify(at)}`).toBe(false);
        }
      }
    }
  });

  it("draws the cloud rainbow as bands that meet without overlapping, each at its own depth (no z-fighting shimmer)", () => {
    const bands = WORLDS["learning-cloud"].dressing
      .filter((item): item is DressingPrimitive => item.kind === "primitive" && item.shape === "torus")
      .sort((a, b) => b.size[0] - a.size[0]);
    expect(bands).toHaveLength(3);
    for (let i = 1; i < bands.length; i += 1) {
      const outer = bands[i - 1];
      const inner = bands[i];
      if (!outer || !inner) throw new Error("missing band");
      // Unit torus band: radii 0.385..0.475 of the scale.
      expect(inner.size[0] * 0.475, `band ${i} outer edge`).toBeLessThanOrEqual(outer.size[0] * 0.385 + 0.005);
      expect(inner.size[0] * 0.475, `band ${i} gap`).toBeGreaterThan(outer.size[0] * 0.385 - 0.05);
      expect(inner.at[2]).toBeGreaterThan(outer.at[2]);
    }
  });

  it("lists the dressing models the preloader must fetch", () => {
    expect(worldDressingKeys("meadow")).toEqual(expect.arrayContaining(["tree", "bush", "flower", "cloud"]));
    expect(worldDressingKeys("peekaboo-barn")).toContain("barn");
    expect(worldDressingKeys("station")).toEqual(expect.arrayContaining(["station", "tunnel"]));
    expect(worldDressingKeys("music-garden")).toContain("stompStone");
  });
});

describe("stand-ins", () => {
  it("has a stand-in recipe and traits for every model key and the procedural bubble", () => {
    for (const key of [...MODEL_KEYS, "bubble" as const]) {
      expect(STAND_INS[key], key).toBeDefined();
      expect(ASSET_TRAITS[key], key).toBeDefined();
      const [w, h, d] = footprintM(key, 1);
      expect(w).toBeGreaterThan(0);
      expect(h).toBe(1);
      expect(d).toBeGreaterThan(0);
    }
  });

  it("round props roll and floating props float", () => {
    expect(ASSET_TRAITS.ball.round).toBe(true);
    expect(ASSET_TRAITS.bubble.round).toBe(true);
    expect(ASSET_TRAITS.balloon.floats).toBe(true);
    expect(ASSET_TRAITS.lumi.floats).toBe(true);
    expect(ASSET_TRAITS.door.door).toBe(true);
    expect(ASSET_TRAITS.toyBlock.layout).toBe("stackable");
  });

  it("the bubble is a soft translucent sphere", () => {
    expect(STAND_INS.bubble.main.shape).toBe("sphere");
    expect(STAND_INS.bubble.main.opacity ?? 1).toBeLessThan(0.6);
  });

  it("asks the engine for unit cones (its generator defaults to radius 1) and passes torus tubes and cylinder segments", () => {
    expect(primitiveParams("cone")).toEqual({ radius: 0.5 });
    expect(primitiveParams("cylinder", 3)).toEqual({ radialSegments: 3 });
    expect(primitiveParams("torus", undefined, 0.2)).toEqual({ tube: 0.2 });
    expect(primitiveParams("sphere", 3)).toBeUndefined();
    expect(primitiveParams("box")).toBeUndefined();
  });

  it("keeps every upright stand-in piece between the ground and a little above its height", () => {
    // Unit shapes are 1 across; the engine torus is ring 0.43 + tube (0.045 unless set).
    // Soft round shapes (bush lobes, feet) may settle a few centimetres into the ground.
    for (const key of [...MODEL_KEYS, "bubble" as const]) {
      const recipe = STAND_INS[key];
      for (const p of [recipe.main, ...recipe.parts]) {
        if (p.rotation) continue;
        const half = p.shape === "torus" ? p.size[1] * (0.43 + (p.tube ?? 0.045)) : p.size[1] / 2;
        // The tunnel is a half-buried mound by design.
        if (key !== "tunnel") expect(p.center[1] - half, `${key} ${p.shape} bottom`).toBeGreaterThanOrEqual(-0.06);
        expect(p.center[1] + half, `${key} ${p.shape} top`).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it("re-colours exactly the pieces the recipe tints, keeping their material settings", () => {
    const door = STAND_INS.door;
    expect(door.main.tinted).toBe(true);
    expect(door.parts.map((p) => p.tinted ?? false)).toEqual([false, false]);
    const glass = standInPieceMaterial("bubble", 0, "#FFD6E8");
    expect(glass.color).toBe("#FFD6E8");
    expect(glass.opacity).toBeCloseTo(STAND_INS.bubble.main.opacity ?? 1, 6);
  });
});

describe("story scenes (headless engine mount)", () => {
  const story = (world: WorldId): EpisodeSpec => ({
    kind: "episode",
    id: `probe-${world}`,
    version: 1,
    phase: "P1",
    number: 1,
    host: "momo",
    titleKey: "e01.title",
    world,
    cast: [
      { id: "momo", at: "left" },
      { id: "lulu", at: "offRight" },
      { id: "sheru", at: "center" },
      { id: "gogo", at: "back", hidden: true },
      { id: "lumi", at: "highRight" },
      { id: "peeko", at: "right", hidden: true }
    ],
    props: [
      { id: "door-right", asset: "door", at: "right", size: 1.6, tint: "#F2A65A" },
      { id: "ball", asset: "ball", at: "frontRight", tint: "#E4574B" },
      { id: "bubble-1", asset: "bubble", at: "high" },
      { id: "table", asset: "table", at: "backLeft" },
      { id: "cake", asset: "cake", at: "backLeft" },
      { id: "block1", asset: "toyBlock", at: "frontLeft" },
      { id: "block2", asset: "toyBlock", at: "frontLeft" }
    ],
    targetWords: ["ball"],
    supportWords: [],
    offlinePlayKey: "e01.offline",
    caregiverBridgeKey: "e01.bridge",
    review: { language: "approved", rights: "approved", reviewer: "test", date: "2026-10-29" },
    beats: [],
    estimatedDurationSec: 150
  });

  it("builds every world with models and with stand-ins only, and the engine registers every node the stage moves", () => {
    for (const world of WORLD_IDS) {
      for (const withModels of [false, true]) {
        const build = buildStoryScene(story(world), { modelAvailable: () => withModels });
        const snapshot = build.builder.toJSON();
        const app = createAuraApp(undefined, { scene: snapshot, autoStart: false });
        try {
          const ids = app.nodes.ids();
          for (const id of build.runtimeIds) expect(ids, `${world} ${String(withModels)} ${id}`).toContain(id);
          expect(new Set(build.runtimeIds).size).toBe(build.runtimeIds.length);
          const momo = app.nodes.require("momo");
          momo.setPosition(-1.3, 0.1, 0.1).setRotation(0, 0.3, 0.05).setScale([1, 1.04, 1]).setVisible(false);
          expect(momo.visible).toBe(false);
          expect(app.diagnostics().errors).toEqual([]);
          const json = JSON.stringify(snapshot);
          expect(json).not.toMatch(/"effect":"vignette"/);
          if (withModels) {
            expect(build.drawnAs.get("momo")).toBe("model");
            expect(json).toMatch(/"scaleMode":"fit"/);
          } else {
            expect(build.drawnAs.get("momo")).toBe("stand-in");
          }
          // The procedural bubble and the by-design procedural ball never draw from a GLB.
          expect(build.drawnAs.get("bubble-1")).toBe("stand-in");
        } finally {
          app.dispose();
        }
      }
    }
  });

  it("lays out shared spots: the hidden chick waits behind its door, the cake sits on the table, blocks stack", () => {
    const build = buildStoryScene(story("peekaboo-barn"));
    const door = build.positions.get("door-right");
    const peeko = build.positions.get("peeko");
    expect(door).toEqual(SPOTS.right);
    expect(peeko?.[2] ?? 0).toBeLessThan(SPOTS.right[2] - 0.1);
    expect(build.positions.get("cake")?.[1] ?? 0).toBeCloseTo(0.6, 6);
    expect(build.positions.get("block2")?.[1] ?? 0).toBeCloseTo(0.35, 6);
  });
});

// The real StageAdapter on a headless engine app (`target: null`: no canvas, so
// nothing is drawn, picked or framed on screen, but every node, handle write,
// action and tween runs exactly as in the browser).
describe("createStage (headless engine, no canvas)", () => {
  const probe: EpisodeSpec = {
    kind: "episode",
    id: "probe-stage",
    version: 1,
    phase: "P1",
    number: 1,
    host: "momo",
    titleKey: "e01.title",
    world: "meadow",
    cast: [
      { id: "momo", at: "left" },
      { id: "sheru", at: "right" },
      { id: "lulu", at: "offRight" },
      { id: "peeko", at: "back", hidden: true }
    ],
    props: [
      { id: "ball", asset: "ball", at: "front", size: 0.3 },
      { id: "bubble-1", asset: "bubble", at: "high" },
      { id: "door-1", asset: "door", at: "back" },
      { id: "block-1", asset: "toyBlock", at: "frontLeft", tint: "#E4574B", size: 0.3 }
    ],
    targetWords: ["ball"],
    supportWords: [],
    offlinePlayKey: "e01.offline",
    caregiverBridgeKey: "e01.bridge",
    review: { language: "approved", rights: "approved", reviewer: "test", date: "2026-10-29" },
    beats: [],
    estimatedDurationSec: 150
  };

  const open = (reducedMotion = false): Promise<WonderStage> =>
    createStage({ target: null, reducedMotion, models: false, mountTimeoutMs: 50 });

  const run = (stage: WonderStage, seconds: number): void => {
    const steps = Math.round(seconds * 30);
    for (let i = 0; i < steps; i += 1) stage.update(1 / 30);
  };

  const nodeOf = (stage: WonderStage, id: string): StageNodeSnapshot => {
    const node = stage.snapshot().nodes.find((n) => n.id === id);
    if (!node) throw new Error(`no node ${id}`);
    return node;
  };

  const beatsOf = (story: StorySpec): readonly BeatSpec[] =>
    story.kind === "episode" ? story.beats : [...story.intro, ...story.round, ...story.outro];

  it("loads a story and drives every kind of stage action from update(dt) alone", async () => {
    const stage = await open();
    try {
      await stage.load(probe);
      const first = stage.snapshot();
      expect(first.storyId).toBe("probe-stage");
      expect(first.world).toBe("meadow");
      expect(first.camera).toBe("medium");
      expect(nodeOf(stage, "peeko").visible).toBe(false);
      expect(nodeOf(stage, "momo").drawnAs).toBe("stand-in");
      expect(stage.diagnostics().standInNodes).toBe(8);
      expect(stage.diagnostics().warmed).toBe(true);

      // Enter from off stage; exit hides on arrival after a soft shrink.
      stage.apply([{ do: "enter", actor: "lulu", at: "center" }]);
      expect(nodeOf(stage, "lulu").moving).toBe(true);
      run(stage, 4);
      expect(nodeOf(stage, "lulu").visible).toBe(true);
      expect(nodeOf(stage, "lulu").moving).toBe(false);
      expect(nodeOf(stage, "lulu").position[0]).toBeCloseTo(SPOTS.center[0], 2);
      stage.apply([{ do: "exit", actor: "lulu", to: "offLeft" }]);
      run(stage, 4);
      expect(nodeOf(stage, "lulu").visible).toBe(false);

      // Show and hide are soft pops, never a blink.
      stage.apply([{ do: "show", actor: "peeko" }]);
      run(stage, 0.5);
      expect(nodeOf(stage, "peeko").visible).toBe(true);
      stage.apply([{ do: "hide", actor: "peeko" }]);
      expect(nodeOf(stage, "peeko").visible).toBe(true);
      run(stage, 0.5);
      expect(nodeOf(stage, "peeko").visible).toBe(false);

      // A popped bubble is hidden when its pop ends.
      stage.apply([{ do: "object", target: "bubble-1", action: "pop" }]);
      run(stage, 1);
      expect(nodeOf(stage, "bubble-1").visible).toBe(false);

      // A carried item rides with the carrier and is set down in front of it.
      stage.apply([{ do: "carry", actor: "momo", item: "ball" }]);
      run(stage, 0.2);
      const momo = nodeOf(stage, "momo").position;
      expect(nodeOf(stage, "ball").position[1]).toBeGreaterThan(0.1);
      stage.apply([{ do: "carry", actor: "momo", item: null }]);
      run(stage, 1.5);
      const dropped = nodeOf(stage, "ball").position;
      expect(dropped[1]).toBeLessThan(0.05);
      expect(dropped[2]).toBeGreaterThan(momo[2]);

      // Gestures, framings, talking and at most two touch targets.
      stage.apply([{ do: "gesture", actor: "momo", gesture: "wave" }, { do: "camera", preset: "close" }]);
      run(stage, 0.1);
      expect(nodeOf(stage, "momo").gesture).toBe("wave");
      expect(stage.snapshot().camera).toBe("close");
      stage.setTargets(["ball", "door-1", "block-1"]);
      expect(stage.snapshot().targets).toEqual(["ball", "door-1"]);
      expect(stage.diagnostics().warnings.some((w) => w.startsWith("setTargets: 3 targets"))).toBe(true);
      stage.setTalking("momo");
      expect(stage.snapshot().talking).toBe("momo");
      stage.setTalking("narrator");
      expect(stage.snapshot().talking).toBeNull();

      // Headless there is no canvas, so nothing can be picked or framed.
      expect(stage.pick(10, 10)).toBeNull();
      expect(stage.targetRects()).toEqual([]);

      // Unknown ids are reported, never thrown.
      stage.apply([{ do: "move", actor: "nobody", to: "left" }, { do: "face", actor: "momo", toward: "nobody" }]);
      expect(stage.diagnostics().warnings).toEqual(expect.arrayContaining(['move: no node "nobody"', 'face: no node "nobody"']));
    } finally {
      stage.dispose();
    }
  });

  it("is deterministic: the same actions and dt steps give the same frames", async () => {
    const script: readonly (readonly StageAction[])[] = [
      [{ do: "enter", actor: "lulu", at: "center", style: "hop" }, { do: "gesture", actor: "momo", gesture: "happy" }],
      [{ do: "object", target: "ball", action: "roll" }, { do: "face", actor: "sheru", toward: "ball" }],
      [{ do: "move", actor: "sheru", to: "front", style: "run" }, { do: "camera", preset: "wide" }, { do: "object", target: "block-1", action: "topple" }]
    ];
    const play = async (): Promise<string> => {
      const stage = await open();
      try {
        await stage.load(probe);
        const frames: string[] = [];
        for (const actions of script) {
          stage.apply(actions);
          for (let i = 0; i < 45; i += 1) {
            stage.update(1 / 30);
            if (i % 5 === 0) frames.push(JSON.stringify(stage.snapshot()));
          }
        }
        return frames.join("\n");
      } finally {
        stage.dispose();
      }
    };
    expect(await play()).toBe(await play());
  });

  it("lets a second load requested mid-load win, with the two never mounting at once", async () => {
    const [a, b] = EPISODES;
    if (!a || !b) throw new Error("catalog has fewer than two episodes");
    const stage = await open();
    try {
      await Promise.all([stage.load(a), stage.load(b)]);
      expect(stage.snapshot().storyId).toBe(b.id);
      expect(stage.diagnostics().world).toBe(b.world);
    } finally {
      stage.dispose();
    }
  });

  it("plays every catalog story's stage actions with no warnings: content and stage agree on every id", async () => {
    for (const reducedMotion of [false, true]) {
      const stage = await open(reducedMotion);
      try {
        for (const story of [...EPISODES, ...ACTIVITIES]) {
          await stage.load(story);
          expect(stage.snapshot().storyId).toBe(story.id);
          for (const beat of beatsOf(story)) {
            stage.apply(reducedMotion ? beat.reducedMotionStage ?? beat.stage : beat.stage);
            if (beat.input && beat.input.type !== "none") {
              stage.setTargets(beat.input.targets);
              expect(stage.snapshot().targets, `${story.id} ${beat.id}`).toEqual([...new Set(beat.input.targets)]);
            }
            run(stage, 2);
            if (beat.response) {
              stage.apply(beat.response.stage);
              run(stage, 2);
            }
            stage.setTargets(null);
          }
          for (const node of stage.snapshot().nodes) {
            for (const v of node.position) expect(Number.isFinite(v), `${story.id} ${node.id}`).toBe(true);
          }
        }
        // Headless only ever notes that no frame was drawn.
        expect(stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"))).toEqual([]);
      } finally {
        stage.dispose();
      }
    }
  });

  it("still ends hidden when reduced motion is switched on while a node fades out, and a second hide never pops it back", async () => {
    const stage = await open();
    try {
      await stage.load(probe);
      stage.apply([{ do: "hide", actor: "momo" }]);
      run(stage, 0.1);
      stage.apply([{ do: "hide", actor: "momo" }]);
      run(stage, 0.25);
      // The fade began once: 0.35 s after it started it is over, not restarted by the second hide.
      expect(nodeOf(stage, "momo").visible).toBe(false);
      stage.apply([{ do: "show", actor: "momo" }]);
      run(stage, 0.5);
      stage.apply([{ do: "hide", actor: "momo" }]);
      run(stage, 0.1);
      stage.setReducedMotion(true);
      run(stage, 0.1);
      expect(nodeOf(stage, "momo").visible).toBe(false);
    } finally {
      stage.dispose();
    }
  });

  it("sets the first item down in front when a carrier picks up a second (no jump back to where it was found)", async () => {
    const stage = await open();
    try {
      await stage.load(probe);
      stage.apply([{ do: "carry", actor: "momo", item: "block-1" }, { do: "move", actor: "momo", to: "center" }]);
      run(stage, 3);
      const momo = nodeOf(stage, "momo").position;
      stage.apply([{ do: "carry", actor: "momo", item: "ball" }]);
      run(stage, 1.5);
      const block = nodeOf(stage, "block-1").position;
      expect(Math.hypot(block[0] - momo[0], block[2] - momo[2])).toBeLessThan(0.8);
      expect(block[2]).toBeGreaterThan(momo[2]);
      expect(block[1]).toBeLessThan(0.05);
      expect(nodeOf(stage, "ball").position[1]).toBeGreaterThan(0.1);
    } finally {
      stage.dispose();
    }
  });

  it("tumbles a stacked tower down to the floor, side by side, and builds it again on the next round", async () => {
    const tower: EpisodeSpec = {
      ...probe,
      id: "probe-tower",
      world: "learning-cloud",
      cast: [{ id: "lumi", at: "highLeft" }],
      props: [1, 2, 3].map((k) => ({ id: `block-${k}`, asset: "toyBlock" as const, at: "center" as const, hidden: true, size: 0.45 }))
    };
    for (const reducedMotion of [false, true]) {
      const stage = await open(reducedMotion);
      try {
        await stage.load(tower);
        const blocks = ["block-1", "block-2", "block-3"];
        for (let round = 0; round < 2; round += 1) {
          stage.apply([{ do: "hide", actor: "block-2" }, { do: "hide", actor: "block-3" }, { do: "show", actor: "block-1" }, { do: "object", target: "block-1", action: "stack" }]);
          // A block already on show stands up where it is: it never jumps up first.
          let highest = 0;
          for (let i = 0; i < 60; i += 1) {
            stage.update(1 / 30);
            highest = Math.max(highest, nodeOf(stage, "block-1").position[1]);
          }
          if (round > 0) expect(highest, `round ${round}: block-1 jumped`).toBeLessThan(0.1);
          for (const id of ["block-2", "block-3"]) {
            stage.apply([{ do: "show", actor: id }, { do: "object", target: id, action: "stack" }]);
            run(stage, 2);
          }
          // One, two, three: a tower on the spot.
          blocks.forEach((id, k) => {
            const p = nodeOf(stage, id).position;
            expect(p[0], `${id} x`).toBeCloseTo(SPOTS.center[0], 2);
            expect(p[1], `${id} height`).toBeCloseTo(0.45 * k, 2);
          });
          // "Uh-oh! Down!": every block ends on the floor, none overlapping another.
          stage.apply(blocks.map((id) => ({ do: "object" as const, target: id, action: "topple" as const })));
          run(stage, 2);
          const xs = blocks.map((id) => {
            const p = nodeOf(stage, id).position;
            expect(nodeOf(stage, id).visible).toBe(true);
            expect(p[1], `${id} on the floor`).toBeLessThan(0.06);
            return p[0];
          }).sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i += 1) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThan(0.5);
        }
        expect(stage.diagnostics().warnings.filter((w) => !w.startsWith("first frame:"))).toEqual([]);
      } finally {
        stage.dispose();
      }
    }
  });

  it("fades a glow halo out softly when the glow is cut short by the next gesture", async () => {
    const stage = await open();
    try {
      await stage.load({ ...probe, cast: [...probe.cast, { id: "lumi", at: "highRight" }] });
      const halo = stage.game().app.nodes.get("__halo-0");
      if (!halo) throw new Error("no halo node");
      stage.apply([{ do: "gesture", actor: "lumi", gesture: "glow" }]);
      run(stage, 1.2);
      expect(halo.visible).toBe(true);
      const scaleOf = (): number => (typeof halo.scale === "number" ? halo.scale : halo.scale[0]);
      let last = scaleOf();
      stage.apply([{ do: "gesture", actor: "lumi", gesture: "wave" }]);
      let frames = 0;
      while (halo.visible && frames < 60) {
        stage.update(1 / 30);
        frames += 1;
        if (!halo.visible) break;
        // It shrinks a little each frame instead of vanishing at once.
        expect(scaleOf()).toBeLessThanOrEqual(last + 1e-9);
        expect(last - scaleOf()).toBeLessThan(0.1);
        last = scaleOf();
      }
      expect(frames).toBeGreaterThan(10);
      expect(halo.visible).toBe(false);
    } finally {
      stage.dispose();
    }
  });

  it("stops everything on dispose and is safe to call twice", async () => {
    const stage = await open();
    await stage.load(probe);
    stage.dispose();
    stage.dispose();
    stage.apply([{ do: "move", actor: "momo", to: "right" }]);
    stage.update(0.1);
    await stage.load(probe);
    expect(stage.snapshot().nodes).toEqual([]);
    expect(stage.pick(1, 1)).toBeNull();
  });
});
