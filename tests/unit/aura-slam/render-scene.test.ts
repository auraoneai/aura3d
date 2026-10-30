import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stadiumAssets } from "../../../examples/aura-slam/view/assets";
import { buildTennisScene, SCENE_NODE_IDS } from "../../../examples/aura-slam/view/scene";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { QUALITY_REBUILD, originalPostEffects, originalSceneLights, postEffects, sceneLights } from "../../../examples/aura-slam/view/lighting";
import { MARK_COUNT, TRAIL_COUNT } from "../../../examples/aura-slam/view/constants";
import { CAMERA_CLASSIC } from "../../../examples/aura-slam/view/camera";

type Doc = { nodes?: Array<{ name?: string; id?: string; kind?: string; children?: unknown[] }>; camera?: { fov?: number; position?: number[]; target?: number[] }; background?: unknown };

function flatten(nodes: Doc["nodes"] = []): string[] {
  const out: string[] = [];
  for (const n of nodes) { if (n.name) out.push(n.name); else if (n.id) out.push(n.id); if (Array.isArray(n.children)) out.push(...flatten(n.children as Doc["nodes"])); }
  return out;
}

describe("aura-slam view: scene composition", () => {
  const doc = buildTennisScene(createPoseRig()).toJSON() as unknown as Doc;
  const names = new Set(flatten(doc.nodes));

  it("declares the court camera: TT-C1 v2 in the World Tour look, the 4.6.1 camera with ?look=original or ?cam=classic", () => {
    // GU47 TT-C1: broadcast camera v2.
    expect(doc.camera?.fov).toBe(26);
    expect(doc.camera?.position).toEqual([0, 15.5, 33.5]);
    expect(doc.camera?.target).toEqual([0, 0, -1.5]);
    for (const classic of [buildTennisScene(createPoseRig(), { look: "original" }), buildTennisScene(createPoseRig(), { camera: CAMERA_CLASSIC })]) {
      const cam = (classic.toJSON() as unknown as Doc).camera;
      expect(cam?.fov).toBe(15);
      expect(cam?.position).toEqual([0, 25.5, 37.1]);
      expect(cam?.target).toEqual([0, 0, 0.7]);
    }
  });

  it("contains every node the renderer resolves at runtime", () => {
    for (const id of SCENE_NODE_IDS) expect(names.has(id), id).toBe(true);
    // GU47 TT-M1: one vertex-coloured stripe mesh in the World Tour look; the 8 boxes in ?look=original.
    expect(names.has("grass-stripes")).toBe(true);
    for (let i = 0; i < 8; i++) expect(names.has(`grass-stripe-${i}`)).toBe(false);
    // GU47 TT-AN1: the World Tour crowd (bodies + heads) replaces the 24 capsules, which stay in ?look=original.
    expect(names.has("crowd-bodies-pose-0")).toBe(true);
    expect(names.has("crowd-heads-pose-0")).toBe(true);
    expect(names.has("spectators")).toBe(false);
    for (const n of ["tennis-ball", "tennis-ball-shadow", "retiring-ball"]) expect(names.has(n)).toBe(true);
    // GU47 TT-V1 / TT-V2: marks are decals and the trail is one ribbon; the 8 + 8 primitives stay in ?look=original only.
    for (let i = 0; i < MARK_COUNT; i++) expect(names.has(`court-mark-${i}`)).toBe(false);
    for (let i = 0; i < TRAIL_COUNT; i++) expect(names.has(`ball-trail-${i}`)).toBe(false);
    const original = new Set(flatten((buildTennisScene(createPoseRig(), { look: "original" }).toJSON() as unknown as Doc).nodes));
    for (let i = 0; i < MARK_COUNT; i++) expect(original.has(`court-mark-${i}`)).toBe(true);
    for (let i = 0; i < TRAIL_COUNT; i++) expect(original.has(`ball-trail-${i}`)).toBe(true);
    expect(original.has("spectators")).toBe(true);
    for (let i = 0; i < 8; i++) expect(original.has(`grass-stripe-${i}`)).toBe(true);
  });

  it("builds both athletes with the full rig", () => {
    for (const prefix of ["player", "rival"]) {
      for (const part of ["torso", "head", "left-upper-leg", "right-lower-arm", "racket-hoop", "racket-strings", "shadow"]) expect(names.has(`${prefix}-${part}`), `${prefix}-${part}`).toBe(true);
    }
  });

  it("static court furniture is merged: one node per material, no per-box line, net or bleacher nodes", () => {
    // GU47 TT-M2: the World Tour net is one textured strip (`net-mesh`); ?look=original keeps the merged 4.6.1 boxes.
    for (const n of ["static-lines", "net-mesh", "static-netTape", "static-bleachers", "static-wood", "static-chairFrame", "static-canopy", "static-sponsorBoard", "static-sponsorTrim"]) expect(names.has(n), n).toBe(true);
    expect(names.has("static-netMesh")).toBe(false);
    for (const n of names) expect(/^(line-|net-mesh-seg-|net-tape-seg-|bleacher-tier|sponsor-board|sponsor-trim|players-bench|umpire-chair|umpire-canopy)/.test(n), n).toBe(false);
    const original = new Set(flatten((buildTennisScene(createPoseRig(), { look: "original" }).toJSON() as unknown as Doc).nodes));
    expect(original.has("static-netMesh")).toBe(true);
    expect(original.has("net-mesh")).toBe(false);
  });

  it("node names are unique so runtime handles resolve unambiguously", () => {
    const all = flatten(doc.nodes);
    expect(new Set(all).size).toBe(all.length);
  });

  it("?look=original keeps the four-light rig and three post effects; the live quality flags are unchanged", () => {
    expect(originalSceneLights()).toHaveLength(4);
    expect(originalPostEffects()).toHaveLength(3);
    expect(QUALITY_REBUILD.flags).toEqual(["game"]);
  });

  it("GU47 TT-L1: the World Tour rig has no ambient, hemisphere or point light (one key + four floodlights)", () => {
    const kinds = sceneLights().map((l) => (l.toJSON() as { light?: string }).light);
    expect(kinds).toEqual(["directional", "spot", "spot", "spot", "spot"]);
    expect(postEffects().length).toBeGreaterThanOrEqual(3);
  });
});

describe("aura-slam view: stadium assets", () => {
  it("each definition points at a committed file whose sha256 and size match", () => {
    for (const [key, a] of Object.entries(stadiumAssets)) {
      const bytes = readFileSync(`public${a.url}`);
      expect(a.hash, key).toBe(`sha256-${createHash("sha256").update(bytes).digest("hex")}`);
      expect((a as { sizeBytes?: number }).sizeBytes, key).toBe(bytes.length);
    }
  });
});
