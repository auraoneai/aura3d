import { effects, environments, game, material, model, primitives, scene, type AuraApp, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { stadiumAssets as assets, venueHdriAssets } from "./assets";
import { buildBallNodes } from "./ball";
import { BASELINE_Z, DOUBLES_X, HIDDEN_SCALE, NET_POST_H, NET_POST_X, SERVICE_Z, SINGLES_X } from "./constants";
import { cameraNode } from "./camera";
import { originalPostEffects, originalSceneLights, postEffects, sceneLights } from "./lighting";
import { venueLook } from "./look";
import { createStaticBoxes } from "./statics";
import type { Vec3 } from "../contract/units";
import type { AthleteRigPort } from "./rigPort";
import { buildParticleNodes } from "./particles";
import { buildBleacherNodes, buildSpectatorNodes } from "./spectators";
import { VENUE_PALETTES, venueKey } from "./venues";
import { createWorldTourCrowd, type WorldTourCrowd } from "./crowd";
import { LINE_COLOR, buildGrassStripesNode, feltBallMaterial, surfaceMaterial } from "./surfaces";

export interface TennisSceneOptions {
  /** Boot venue: the authored environment, fog, key and grade are this venue's, so the first frame needs no swap. */
  readonly venue?: string | null;
  /** `"original"` (`?look=original`) keeps the 4.6.1 four-light rig, flat backdrop and post stack. */
  readonly look?: "world-tour" | "original";
  /** TT-AN1: the World Tour crowd whose nodes the scene mounts (the renderer keeps it to drive the head follow). */
  readonly crowd?: WorldTourCrowd;
}

/** GU47 TT-E1: the venue environment node (its HDRI is swapped at runtime with `app.lighting.setEnvironment`). */
export const VENUE_ENVIRONMENT_NAME = "venue-hdri";

/** Every node name the renderer resolves at runtime; kept in one place so the scene and the renderer cannot drift. */
export const SCENE_NODE_IDS = [
  "stadium-outer-ground", "court-apron", "court-doubles-surface", "court-singles-surface",
  "service-box-highlight", "serve-aim-ring", "serve-toss-ring", "landing-indicator-ring",
  "umpire-head", "net-fault-left", "net-fault-right"
] as const;

/** Static box groups that venues recolour at runtime (C7): seats from `seat`, sponsor-board trim from `trim`. */
export const STATIC_RUNTIME_IDS = { bleachers: "stadium-bleachers", sponsorTrim: "stadium-sponsor-trim" } as const;
export const GRANDSTAND_LENGTH = 24;
export const FLOODLIGHT_MAST_H = 9;

export function buildTennisScene(rig: AthleteRigPort, options: TennisSceneOptions = {}): ReturnType<typeof scene> {
  const original = options.look === "original";
  const boot = venueKey(options.venue);
  const look = venueLook(boot);
  // TT-M1: World Tour line paint #fbfbf5 and per-surface court materials; `?look=original` keeps the 4.6.1 flat colours.
  const lineMat = material.pbr({ color: original ? "#f5f4e6" : LINE_COLOR, roughness: original ? 0.58 : 0.5 });
  const courtMat = (part: "court" | "alley" | "apron" | "ground", flat: () => ReturnType<typeof material.pbr>) => (original ? flat() : surfaceMaterial(boot, part));
  const netPostMat = material.pbr({ color: "#1d322c", metalness: 0.42, roughness: 0.48 });
  // C9: the net mesh is see-through (blended, no depth write, no shadow) so it no longer reads as a black slab; the tape stays opaque.
  const netMeshMat = material.pbr({ color: "#1c2a26", roughness: 0.88, opacity: 0.42, alphaMode: "blend", depthWrite: false, doubleSided: true });
  const netTapeMat = material.pbr({ color: "#faf8ee", roughness: 0.46 });

  const s = scene().background(VENUE_PALETTES[original ? "hard" : boot]!.background).camera(cameraNode());
  if (original) {
    for (const light of originalSceneLights()) s.add(light);
    for (const effect of originalPostEffects()) s.add(effect);
  } else {
    // TT-L1 / TT-L2 / TT-P1: one shadowed key + four floodlights (night court), the venue's grade, SMAA and contact shadows.
    for (const light of sceneLights(boot)) s.add(light);
    for (const effect of postEffects(boot)) s.add(effect);
    // TT-E1: the venue HDRI lights the court (fill) and shows where the sky does; it replaces the flat backdrop wall.
    s.add(environments.hdri({
      name: VENUE_ENVIRONMENT_NAME,
      texture: venueHdriAssets[look.hdri],
      intensity: look.environmentIntensity,
      rotation: (look.environmentRotationDeg * Math.PI) / 180,
      background: look.background === "hdri"
    }));
    // TT-E2: the venue's air (none on the Moon); changed at runtime with app.atmosphere.setFog.
    if (look.fog) s.add(effects.fog({ color: look.fog.color, density: look.fog.density }));
  }

  // Outer stadium ground, apron, doubles court, and singles inner court
  s
    .add(
      primitives
        .plane({
          name: "stadium-outer-ground",
          size: [54, 1, 58],
          material: courtMat("ground", () => material.pbr({ color: VENUE_PALETTES.hard.ground, roughness: 0.94 }))
        })
        .position(0, -0.024, 0)
        .runtime(game.runtimeNode("stadium-outer-ground"))
    )
    .add(
      primitives
        .box({
          castShadow: false, name: "court-apron",
          size: [19.8, 0.016, 26.8],
          material: courtMat("apron", () => material.pbr({ color: VENUE_PALETTES.hard.apron, roughness: 0.88 }))
        })
        .position(0, -0.012, 0)
        .runtime(game.runtimeNode("court-apron"))
    )
    .add(
      primitives
        .box({
          castShadow: false, name: "court-doubles-surface",
          size: [DOUBLES_X * 2, 0.016, BASELINE_Z * 2],
          material: courtMat("alley", () => material.pbr({ color: VENUE_PALETTES.hard.alley, roughness: 0.82 }))
        })
        .position(0, -0.004, 0)
        .runtime(game.runtimeNode("court-doubles-surface"))
    )
    .add(
      primitives
        .box({
          castShadow: false, name: "court-singles-surface",
          size: [SINGLES_X * 2, 0.018, BASELINE_Z * 2],
          material: courtMat("court", () => material.pbr({ color: VENUE_PALETTES.hard.court, roughness: 0.78 }))
        })
        .position(0, 0, 0)
        .runtime(game.runtimeNode("court-singles-surface"))
    );

  // Grass mower stripes (visible on grass court). TT-M1: the World Tour look draws them as one vertex-coloured mesh.
  if (!original) s.add(buildGrassStripesNode());
  for (let i = 0; original && i < 8; i++) {
    const stripeZ = -BASELINE_Z + (i + 0.5) * ((BASELINE_Z * 2) / 8);
    s.add(
      primitives
        .box({
          castShadow: false, name: `grass-stripe-${i}`,
          size: [DOUBLES_X * 2 - 0.04, 0.004, (BASELINE_Z * 2) / 8 - 0.02],
          material: material.pbr({
            color: i % 2 === 0 ? "#53945a" : "#46804d",
            roughness: 0.84
          })
        })
        .position(0, 0.009, stripeZ)
        .scale(HIDDEN_SCALE)
        .runtime(game.runtimeNode(`grass-stripe-${i}`))
    );
  }

  // Regulation white court lines (one merged mesh)
  const statics = createStaticBoxes();
  const lineY = 0.012;
  const addLine = (size: Vec3, x: number, z: number): void => statics.box("lines", lineMat, size, [x, lineY, z]);
  addLine([DOUBLES_X * 2 + 0.055, 0.008, 0.075], 0, -BASELINE_Z);
  addLine([DOUBLES_X * 2 + 0.055, 0.008, 0.075], 0, BASELINE_Z);
  addLine([0.055, 0.008, BASELINE_Z * 2 + 0.075], -DOUBLES_X, 0);
  addLine([0.055, 0.008, BASELINE_Z * 2 + 0.075], DOUBLES_X, 0);
  addLine([0.055, 0.008, BASELINE_Z * 2 + 0.075], -SINGLES_X, 0);
  addLine([0.055, 0.008, BASELINE_Z * 2 + 0.075], SINGLES_X, 0);
  addLine([SINGLES_X * 2 + 0.055, 0.008, 0.055], 0, -SERVICE_Z);
  addLine([SINGLES_X * 2 + 0.055, 0.008, 0.055], 0, SERVICE_Z);
  addLine([0.055, 0.008, SERVICE_Z * 2 + 0.055], 0, 0);
  addLine([0.055, 0.008, 0.28], 0, -BASELINE_Z + 0.14);
  addLine([0.055, 0.008, 0.28], 0, BASELINE_Z - 0.14);

  // Net posts + pulsing red fault LED strips + parabolic sagging net & top tape
  s.addMany([
    primitives
      .cylinder({
        name: "net-post-left",
        size: [0.14, NET_POST_H, 0.14],
        material: netPostMat
      })
      .position(-NET_POST_X, NET_POST_H * 0.5, 0),
    primitives
      .cylinder({
        name: "net-post-right",
        size: [0.14, NET_POST_H, 0.14],
        material: netPostMat
      })
      .position(NET_POST_X, NET_POST_H * 0.5, 0),
    primitives
      .box({
        name: "net-fault-left",
        size: [0.032, NET_POST_H * 0.72, 0.088],
        material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 })
      })
      .position(-NET_POST_X, NET_POST_H * 0.54, 0.048)
      .runtime(game.runtimeNode("net-fault-left")),
    primitives
      .box({
        name: "net-fault-right",
        size: [0.032, NET_POST_H * 0.72, 0.088],
        material: material.emissive({ color: "#3d1c1a", emissive: "#3d1c1a", emissiveIntensity: 0.15 })
      })
      .position(NET_POST_X, NET_POST_H * 0.54, 0.048)
      .runtime(game.runtimeNode("net-fault-right"))
  ]);

  statics.box("netTape", netTapeMat, [0.055, 0.914, 0.034], [0, 0.457, 0]);
  const netSegments = 9;
  const netHalfSpan = NET_POST_X;
  for (let i = 0; i < netSegments; i++) {
    const t0 = -1 + (i / netSegments) * 2;
    const t1 = -1 + ((i + 1) / netSegments) * 2;
    const tm = (t0 + t1) * 0.5;
    const segW = (t1 - t0) * netHalfSpan;
    const segX = tm * netHalfSpan;
    const topH = 0.914 + (1.07 - 0.914) * tm * tm;
    statics.box("netMesh", netMeshMat, [segW + 0.01, topH - 0.05, 0.022], [segX, (topH - 0.05) * 0.5 + 0.02, 0], false);
    statics.box("netTape", netTapeMat, [segW + 0.015, 0.062, 0.036], [segX, topH - 0.02, 0]);
  }

  const chairWood = material.pbr({ color: "#8c613c", roughness: 0.78 });
  const chairFrame = material.pbr({ color: "#223b35", roughness: 0.65 });
  const canopyMat = material.pbr({ color: "#ece4cf", roughness: 0.82 });
  statics.box("chairFrame", chairFrame, [0.85, 1.85, 0.92], [-6.76, 0.925, 0]);
  statics.box("wood", chairWood, [0.74, 0.12, 0.72], [-6.76, 1.92, 0]);
  statics.box("wood", chairWood, [0.12, 0.68, 0.72], [-7.08, 2.28, 0]);
  statics.box("canopy", canopyMat, [1.18, 0.08, 1.18], [-6.76, 2.95, 0]);
  s.addMany([
    primitives
      .capsule({
        name: "umpire-torso",
        size: [0.34, 0.68, 0.34],
        material: material.pbr({ color: "#214b3e", roughness: 0.78 })
      })
      .position(-6.72, 2.26, 0),
    primitives
      .sphere({
        name: "umpire-head",
        size: [0.27, 0.27, 0.27],
        material: material.pbr({ color: "#c58e69", roughness: 0.74 })
      })
      .position(-6.68, 2.62, 0)
      .runtime(game.runtimeNode("umpire-head"))
  ]);

  // Sponsor A-frame boards ("FAMILYSHOOT") at z = -10.85, x = ±4.3 & side player benches
  const sponsorBoardMat = material.pbr({ color: "#1d3d33", roughness: 0.72 });
  const sponsorTrimMat = material.pbr({ color: VENUE_PALETTES.hard.trim, roughness: 0.55 });
  for (const bx of [-4.3, 4.3]) {
    statics.box("sponsorBoard", sponsorBoardMat, [3.2, 0.78, 0.34], [bx, 0.39, -10.85]);
    statics.box("sponsorTrim", sponsorTrimMat, [2.85, 0.18, 0.36], [bx, 0.42, -10.85]);
  }
  for (const bz of [-3.4, 3.4]) statics.box("wood", chairWood, [0.58, 0.46, 1.95], [-7.35, 0.23, bz]);

  // Typed Aura3D stadium dressing (view/assets.ts). C10: the seats GLB is 33.7 x 45.8 x 144.1 m with its length along Z, so it is
  // turned 90 degrees to run along the back of the court and fitted by length (24 m wide, about 7.6 m tall). The floodlight GLB
  // is a 1.9 x 1.4 x 1.9 lamp head, so it sits on a 9 m mast instead of standing in for the whole tower.
  const mastMat = material.pbr({ color: "#2b3a40", metalness: 0.55, roughness: 0.42 });
  for (const side of [-1, 1]) {
    s.add(primitives.cylinder({ name: `stadium-floodlight-mast-${side < 0 ? "left" : "right"}`, size: [0.28, FLOODLIGHT_MAST_H, 0.28], material: mastMat, castShadow: false })
      .position(side * 12.5, FLOODLIGHT_MAST_H * 0.5, -13.2));
  }
  s.addMany([
    model(assets.showcaseStadiumSeats, {
      name: "stadium-grandstand-rear",
      role: "setDressing",
      castShadow: false,
      scaleMode: "fit",
      targetLength: GRANDSTAND_LENGTH
    })
      .position(0, 0, -19.5)
      .rotate(0, Math.PI * 0.5, 0)
      .runtime(game.runtimeNode("stadium-grandstand-rear", { tags: ["typed-supporting-asset"] })),
    model(assets.rooftopScoreboardRigMeshy, {
      name: "stadium-scoreboard-gantry",
      role: "setDressing",
      castShadow: false,
      scaleMode: "fit",
      targetMaxDimension: 6.2
    }).position(0, 2.4, -15.6),
    model(assets.rooftopFloodlightTowerMeshy, {
      name: "stadium-floodlight-left",
      role: "setDressing",
      castShadow: false,
      scaleMode: "fit",
      targetMaxDimension: 2.2
    }).position(-12.5, FLOODLIGHT_MAST_H, -13.2),
    model(assets.rooftopFloodlightTowerMeshy, {
      name: "stadium-floodlight-right",
      role: "setDressing",
      castShadow: false,
      scaleMode: "fit",
      targetMaxDimension: 2.2
    }).position(12.5, FLOODLIGHT_MAST_H, -13.2)
  ]);

  // C7: an unlit backdrop wall at the far edge of the outer ground carries the venue `background` colour (the clear colour is fixed
  // at compile time). It only shows on tall canvases, where the aspect-aware FOV sees past the ground. GU47 TT-E1: the World
  // Tour look shows the venue HDRI there instead, so the wall is kept for `?look=original` only.
  if (original) {
    s.add(
      primitives
        .box({ castShadow: false, name: "stadium-backdrop", size: [140, 60, 0.5], material: material.pbr({ color: VENUE_PALETTES.hard.background, roughness: 1, unlit: true }) })
        .position(0, 10, -29.5)
        .runtime(game.runtimeNode("stadium-backdrop"))
    );
  }

  s.addMany(buildBleacherNodes(statics));
  s.addMany(statics.build("static", STATIC_RUNTIME_IDS));
  if (original) {
    s.addMany(buildSpectatorNodes());
  } else {
    // TT-AN1 / TT-A4: 240 seated spectators in two instanced crowds (bodies, heads that follow the rally): 2 draws.
    const crowd = options.crowd ?? createWorldTourCrowd();
    for (const node of [...crowd.bodies.nodes, ...crowd.heads.nodes]) s.add(node);
  }
  s.addMany(buildParticleNodes());

  // Service Box Highlight, Aim Ring, Toss Ring, Beginner Landing Ring
  s.addMany([
    primitives
      .box({
        name: "service-box-highlight",
        size: [SINGLES_X, 0.005, SERVICE_Z],
        material: material.emissive({ color: "#d9f28c", emissive: "#d9f28c", emissiveIntensity: 0.25 })
      })
      .position(-SINGLES_X * 0.5, 0.011, -SERVICE_Z * 0.5)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("service-box-highlight")),
    primitives
      .torus({
        name: "serve-aim-ring",
        size: [0.44, 0.44, 0.05],
        material: material.emissive({ color: "#f4f8df", emissive: "#f4f8df", emissiveIntensity: 0.75 })
      })
      .rotate(Math.PI * 0.5, 0, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("serve-aim-ring")),
    primitives
      .torus({
        name: "serve-toss-ring",
        size: [0.28, 0.28, 0.032],
        material: material.emissive({ color: "#f7e994", emissive: "#f7e994", emissiveIntensity: 0.9 })
      })
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("serve-toss-ring")),
    primitives
      .torus({
        name: "landing-indicator-ring",
        size: [0.36, 0.36, 0.044],
        material: material.emissive({ color: "#edf1d2", emissive: "#edf1d2", emissiveIntensity: 0.65 })
      })
      .rotate(Math.PI * 0.5, 0, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("landing-indicator-ring"))
  ]);

  // TT-V1 / TT-V2: the World Tour look stamps decal marks and draws one trail ribbon instead of 8 cylinders and 8 spheres.
  s.addMany(buildBallNodes({ trail: original, marks: original, ...(original ? {} : { ballMaterial: feltBallMaterial() }) }));
  s.addMany(rig.build("player", true));
  s.addMany(rig.build("rival", false));

  return s;
}

export type SceneApp = AuraApp;
export type SceneHandle = AuraRuntimeNodeHandle;
