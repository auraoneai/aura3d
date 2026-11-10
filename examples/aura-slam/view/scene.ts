import { effects, environments, game, material, model, primitives, scene, type AuraApp, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { stadiumAssets as assets, venueHdriAssets } from "./assets";
import { buildBallNodes } from "./ball";
import { BASELINE_Z, DOUBLES_X, HIDDEN_SCALE, NET_POST_H, NET_POST_X, SERVICE_Z, SINGLES_X } from "./constants";
import { CAMERA_CLASSIC, CAMERA_V2, cameraNode, type BroadcastCameraRig } from "./camera";
import { originalPostEffects, originalSceneLights, postEffects, sceneLights } from "./lighting";
import { EARTH, FLOOD_CONES, venueLook } from "./look";
import { createStaticBoxes } from "./statics";
import type { Vec3 } from "../contract/units";
import type { AthleteRigPort } from "./rigPort";
import { buildParticleNodes } from "./particles";
import { buildBleacherNodes, buildSpectatorNodes } from "./spectators";
import { VENUE_PALETTES, venueKey } from "./venues";
import { createWorldTourCrowd, type WorldTourCrowd } from "./crowd";
import { LINE_COLOR, buildGrassStripesNodes, feltBallMaterial, surfaceMaterial } from "./surfaces";
import { buildBoardNodes, standLineText } from "./boards";
import { buildNetMeshNode, netTapeParts, NET_TAPE_ID } from "./net";

export interface TennisSceneOptions {
  /** Boot venue: the authored environment, fog, key and grade are this venue's, so the first frame needs no swap. */
  readonly venue?: string | null;
  /** `"original"` (`?look=original`) keeps the 4.6.1 four-light rig, flat backdrop and post stack. */
  readonly look?: "world-tour" | "original";
  /** TT-AN1: the World Tour crowd whose nodes the scene mounts (the renderer keeps it to drive the head follow). */
  readonly crowd?: WorldTourCrowd;
  /** TT-C1: the broadcast camera (default: v2 in the World Tour look, classic with `?look=original` or `?cam=classic`). */
  readonly camera?: BroadcastCameraRig;
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
/** The scoreboard gantry's place behind the far stand (the World Tour Moon drops it below the plain: view/renderer.ts). */
export const GANTRY_POSITION: Vec3 = [0, 2.4, -15.6];

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
  // GU47 phase 4 + WP-01: World Tour posts are brushed powder-coated steel; headband & centre strap are woven white canvas.
  const netPostMat = original
    ? material.pbr({ color: "#1d322c", metalness: 0.42, roughness: 0.48 })
    : material.brushedMetal({ color: "#2c4c42", roughness: 0.24, anisotropy: 0.65 });
  // C9: the `?look=original` net mesh is see-through; World Tour mounts the paired GLSL+WGSL custom net shader (`buildNetMeshNode`).
  const netMeshMat = material.pbr({ color: "#1c2a26", roughness: 0.88, opacity: 0.42, alphaMode: "blend", depthWrite: false, doubleSided: true });
  const netTapeMat = original
    ? material.pbr({ color: "#faf8ee", roughness: 0.46 })
    : material.fabric({ color: "#faf8ee", roughness: 0.56, sheen: 0.35, sheenColor: "#ffffff" });

  const camRig = original ? CAMERA_CLASSIC : options.camera ?? CAMERA_V2;
  const s = scene().background(VENUE_PALETTES[original ? "hard" : boot]!.background).camera(cameraNode(camRig));
  if (original) {
    for (const light of originalSceneLights()) s.add(light);
    for (const effect of originalPostEffects()) s.add(effect);
  } else {
    // TT-L1 / TT-L2 / TT-P1: one shadowed key + four floodlights (night court), the venue's grade, SMAA and contact shadows.
    for (const light of sceneLights(boot)) s.add(light);
    for (const effect of postEffects(boot, camRig)) s.add(effect);
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
    // TT-E2: a haze cone under each floodlight, shown on the night court only (venueRuntime.ts toggles them).
    for (const cone of FLOOD_CONES) {
      s.add(effects.lightCone({
        name: cone.id, color: "#dfe8ff", intensity: 0.32, position: [...cone.position], direction: [...cone.direction],
        length: cone.length, coneAngle: 0.5, softness: 0.65, visible: boot === "hard"
      }).runtime(game.runtimeNode(cone.id)));
    }
    // TT-E3: the Earth over the lunar court (planet sphere inside an atmosphere shell), shown on the Moon only.
    const earthShown = boot === "moon" ? ([1, 1, 1] as Vec3) : HIDDEN_SCALE;
    const earthAt = camRig.id === "v2" ? EARTH.position : EARTH.classicPosition;
    s.add(primitives.sphere({ name: EARTH.ids.planet, size: [EARTH.radius * 2, EARTH.radius * 2, EARTH.radius * 2], castShadow: false, receiveShadow: false, material: material.pbr({ color: "#2f6db3", roughness: 0.62, metalness: 0 }) })
      .position(...earthAt).scale(earthShown).runtime(game.runtimeNode(EARTH.ids.planet)));
    const shell = EARTH.radius * 2 * EARTH.atmosphere;
    s.add(primitives.sphere({ name: EARTH.ids.shell, size: [shell, shell, shell], castShadow: false, receiveShadow: false, material: material.atmosphere({ color: "#8cc4ff", opacity: 0.24, emissiveIntensity: 0.45 }) })
      .position(...earthAt).scale(earthShown).runtime(game.runtimeNode(EARTH.ids.shell)));
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

  // Grass mower stripes (visible on grass court). TT-M1: the World Tour look draws them as two meshes (one per colour).
  if (!original) for (const stripes of buildGrassStripesNodes()) s.add(stripes);
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

  for (const part of netTapeParts()) statics.box("netTape", netTapeMat, part.size, part.position);
  const netSegments = 9;
  const netHalfSpan = NET_POST_X;
  for (let i = 0; i < netSegments; i++) {
    const t0 = -1 + (i / netSegments) * 2;
    const t1 = -1 + ((i + 1) / netSegments) * 2;
    const tm = (t0 + t1) * 0.5;
    const segW = (t1 - t0) * netHalfSpan;
    const segX = tm * netHalfSpan;
    const topH = 0.914 + (1.07 - 0.914) * tm * tm;
    // TT-M2: the World Tour net is one textured strip (view/net.ts); `?look=original` keeps the nine 4.6.1 boxes.
    if (original) statics.box("netMesh", netMeshMat, [segW + 0.01, topH - 0.05, 0.022], [segX, (topH - 0.05) * 0.5 + 0.02, 0], false);
  }
  if (!original) s.add(buildNetMeshNode());

  const chairWood = original ? material.pbr({ color: "#8c613c", roughness: 0.78 }) : material.lacquer({ color: "#8f6239", roughness: 0.34, clearcoat: 0.72, clearcoatRoughness: 0.14 });
  const chairFrame = original
    ? material.pbr({ color: "#223b35", roughness: 0.65 })
    : material.brushedMetal({ color: "#2a463f", roughness: 0.28, anisotropy: 0.58 });
  const canopyMat = original
    ? material.pbr({ color: "#ece4cf", roughness: 0.82 })
    : material.fabric({ color: "#f0e9d6", roughness: 0.76, sheen: 0.28, sheenColor: "#ffffff" });
  if (original) {
    statics.box("chairFrame", chairFrame, [0.85, 1.85, 0.92], [-6.76, 0.925, 0]);
    statics.box("wood", chairWood, [0.74, 0.12, 0.72], [-6.76, 1.92, 0]);
    statics.box("wood", chairWood, [0.12, 0.68, 0.72], [-7.08, 2.28, 0]);
    statics.box("canopy", canopyMat, [1.18, 0.08, 1.18], [-6.76, 2.95, 0]);
  } else {
    // WP-01: Centre net-strap anchor buckle + sculpted multi-strut umpire tower (merged into static draws: 0 extra draw calls)
    statics.box("chairFrame", chairFrame, [0.075, 0.09, 0.048], [0, 0.065, 0]);
    for (const lz of [-0.4, 0.4]) {
      statics.box("chairFrame", chairFrame, [0.065, 1.92, 0.065], [-7.1, 0.96, lz]);
      statics.box("chairFrame", chairFrame, [0.065, 1.76, 0.065], [-6.42, 0.88, lz]);
      statics.box("chairFrame", chairFrame, [0.74, 0.045, 0.045], [-6.76, 0.48, lz]);
      statics.box("chairFrame", chairFrame, [0.74, 0.045, 0.045], [-6.76, 1.12, lz]);
      statics.box("chairFrame", chairFrame, [0.74, 0.05, 0.05], [-6.76, 1.82, lz]);
      statics.box("chairFrame", chairFrame, [0.68, 0.045, 0.045], [-6.76, 2.18, lz * 0.95]);
      statics.box("chairFrame", chairFrame, [0.05, 1.08, 0.05], [-7.1, 2.44, lz * 0.95]);
      statics.box("chairFrame", chairFrame, [1.16, 0.04, 0.04], [-6.76, 2.94, lz * 1.1]);
    }
    for (const by of [0.48, 1.12, 1.82]) {
      statics.box("chairFrame", chairFrame, [0.045, 0.045, 0.84], [-7.1, by, 0]);
    }
    for (let step = 0; step < 5; step++) {
      statics.box("chairFrame", chairFrame, [0.11, 0.038, 0.72], [-6.39, 0.34 + step * 0.34, 0]);
    }
    statics.box("chairFrame", chairFrame, [0.32, 0.042, 0.74], [-6.48, 1.54, 0]);
    statics.box("chairFrame", chairFrame, [0.24, 0.026, 0.22], [-6.46, 2.21, 0.36]);
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      statics.box("wood", chairWood, [0.11, 0.055, 0.72], [-6.96 + sIdx * 0.14, 1.92, 0]);
      statics.box("wood", chairWood, [0.055, 0.095, 0.72], [-7.08, 2.06 + sIdx * 0.13, 0]);
    }
    statics.box("canopy", canopyMat, [1.22, 0.055, 1.22], [-6.76, 2.97, 0]);
    statics.box("canopy", canopyMat, [0.04, 0.11, 1.22], [-6.16, 2.92, 0]);
    for (const cz of [-0.6, 0.6]) statics.box("canopy", canopyMat, [1.22, 0.09, 0.04], [-6.76, 2.93, cz]);
  }
  s.addMany([
    primitives
      .capsule({
        name: "umpire-torso",
        size: [0.34, 0.68, 0.34],
        material: original ? material.pbr({ color: "#214b3e", roughness: 0.78 }) : material.fabric({ color: "#214b3e", roughness: 0.82, sheen: 0.42, sheenColor: "#356c5a" })
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

  // Sponsor A-frame boards at z = -10.85, x = ±4.3, slatted side player benches & courtside coolers
  const sponsorBoardMat = material.pbr({ color: "#1d3d33", roughness: 0.68 });
  const sponsorTrimMat = material.pbr({ color: VENUE_PALETTES.hard.trim, roughness: 0.48 });
  for (const bx of [-4.3, 4.3]) {
    statics.box("sponsorBoard", sponsorBoardMat, [3.2, 0.78, 0.34], [bx, 0.39, -10.85]);
    statics.box("sponsorTrim", sponsorTrimMat, [2.85, 0.18, 0.36], [bx, 0.42, -10.85]);
  }
  if (original) {
    for (const bz of [-3.4, 3.4]) statics.box("wood", chairWood, [0.58, 0.46, 1.95], [-7.35, 0.23, bz]);
  } else {
    for (const bz of [-3.4, 3.4]) {
      for (const lz of [bz - 0.82, bz, bz + 0.82]) {
        statics.box("chairFrame", chairFrame, [0.54, 0.42, 0.06], [-7.35, 0.21, lz]);
        statics.box("chairFrame", chairFrame, [0.055, 0.68, 0.06], [-7.6, 0.52, lz]);
      }
      for (const sx of [-7.18, -7.35, -7.52]) statics.box("wood", chairWood, [0.14, 0.045, 1.96], [sx, 0.44, bz]);
      for (const sy of [0.64, 0.81]) statics.box("wood", chairWood, [0.045, 0.125, 1.96], [-7.58, sy, bz]);
    }
    for (const cz of [-1.85, 1.85]) {
      statics.box("sponsorBoard", sponsorBoardMat, [0.46, 0.42, 0.62], [-7.35, 0.21, cz]);
      statics.box("canopy", canopyMat, [0.49, 0.06, 0.65], [-7.35, 0.45, cz]);
    }
    if (boot !== "moon") {
      // Rear grandstand architectural upper fascia & scoreboard gantry support pylons
      statics.box("chairFrame", chairFrame, [24.6, 0.32, 4.4], [0, 5.52, -19.5]);
      statics.box("chairFrame", chairFrame, [24.6, 0.95, 0.26], [0, 6.08, -21.5]);
      for (const gx of [-2.6, 2.6]) statics.box("chairFrame", chairFrame, [0.18, 2.4, 0.22], [gx, 1.2, GANTRY_POSITION[2]]);
    }
  }
  // TT-H2 / TT-A2: "AURA SLAM" / "WORLD TOUR" on the sponsor boards and the live venue + score line on the stand (3 draws).
  if (!original) s.addMany(buildBoardNodes(standLineText(look.city, null)));

  // Owned Aura Slam lattice floodlight towers (`tennisFloodMast`) + procedural stadium grandstand & scoreboard gantry (0 borrowed assets).
  const mastMat = original ? material.pbr({ color: "#2b3a40", metalness: 0.55, roughness: 0.42 }) : material.brushedMetal({ color: "#5d6a70", roughness: 0.22 });
  if (!original) {
    for (const side of [-1, 1]) {
      s.add(
        model(assets.tennisFloodMast, {
          name: `stadium-floodlight-${side < 0 ? "left" : "right"}`,
          role: "setDressing",
          castShadow: false,
          scaleMode: "fit",
          targetHeight: FLOODLIGHT_MAST_H + 0.5
        })
          .position(side * 12.5, 0, -13.2)
          .rotate(0, side * -0.2, 0)
      );
    }
  }
  for (const side of original ? [-1, 1] : []) {
    s.add(primitives.cylinder({ name: `stadium-floodlight-mast-${side < 0 ? "left" : "right"}`, size: [0.28, FLOODLIGHT_MAST_H, 0.28], material: mastMat, castShadow: false })
      .position(side * 12.5, FLOODLIGHT_MAST_H * 0.5, -13.2));
  }
  s.addMany([
    primitives
      .box({
        name: "stadium-grandstand-rear",
        size: [4.2, 5.4, GRANDSTAND_LENGTH],
        castShadow: false,
        material: original ? material.pbr({ color: "#1a2f3a", roughness: 0.82 }) : material.physical({ color: "#1a2f3a", roughness: 0.78, specularIntensity: 0.35 })
      })
      .position(0, 2.7, -19.5)
      .rotate(0, Math.PI * 0.5, 0)
      .runtime(game.runtimeNode("stadium-grandstand-rear")),
    primitives
      .box({
        name: "stadium-scoreboard-gantry",
        size: [6.2, 1.85, 0.42],
        castShadow: false,
        material: original ? material.pbr({ color: "#182832", roughness: 0.55 }) : material.brushedMetal({ color: "#182832", roughness: 0.3, anisotropy: 0.55 })
      })
      .position(...(!original && boot === "moon" ? ([GANTRY_POSITION[0], -60, GANTRY_POSITION[2]] as Vec3) : GANTRY_POSITION))
      .runtime(game.runtimeNode("stadium-scoreboard-gantry")),
    ...(original
      ? [
          primitives
            .box({
              name: "stadium-floodlight-left",
              size: [2.2, 0.9, 1.1],
              castShadow: false,
              material: material.emissive({ color: "#fff4d2", emissive: "#fff4d2", emissiveIntensity: 0.9 })
            })
            .position(-12.5, FLOODLIGHT_MAST_H, -13.2),
          primitives
            .box({
              name: "stadium-floodlight-right",
              size: [2.2, 0.9, 1.1],
              castShadow: false,
              material: material.emissive({ color: "#fff4d2", emissive: "#fff4d2", emissiveIntensity: 0.9 })
            })
            .position(12.5, FLOODLIGHT_MAST_H, -13.2)
        ]
      : [])
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
  s.addMany(statics.build("static", original ? STATIC_RUNTIME_IDS : { ...STATIC_RUNTIME_IDS, netTape: NET_TAPE_ID }));
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
        // Owner feedback 2026-10-31: the pale cream ring vanished on the lime service-box highlight. A thicker hot-red
        // ring reads against the lime box and the blue, green, clay and sand courts alike. The unit torus is radius 0.43,
        // tube 0.045 and lies in XY before the quarter turn, so `size` z only sets its height on the court: the band
        // width comes from `params.tube`. Radius ~0.5 m, band ~0.15 m (the 0.5 / 0.09 size drew a 4.5 cm hairline
        // that the broadcast camera resolved to 1-2 px).
        size: [1.15, 1.15, 0.12],
        params: { tube: 0.13 },
        material: material.emissive({ color: "#ff2a5f", emissive: "#ff2a5f", emissiveIntensity: 0.9 })
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
