// Pip's Big Leap: runtime diorama presentation (GU47 WP-16).
//
// Everything the diorama look does per frame or per event, behind one small object so
// main.ts only forwards events and frames. Rows: PBL-P1 (post preset after each
// setScene), PBL-E1 (setFog after each setScene), PBL-P2 (DOF focus follows Pip),
// PBL-L2 (practical flicker through `setLight`), PBL-V1 / PBL-V2 (VFX pack, trails,
// pulsing gate ring), PBL-AN1 (squash and stretch), PBL-C1 (rail fly-over, gate cut),
// PBL-C2 (glide/dive FOV kick, pound shake), and the E-I QA crops. Read-only on the sim
// (PRD D8): it reads the player state and never writes it. `?look=original` builds none
// of it.

import { camera, type AuraApp, type AuraCustomPostPass, type AuraCameraSequencePlayback, type AuraVec3 } from "@aura3d/engine";
import { focusDistanceFor, heightFogFor, miniatureFramingFor, presentationScale, type PipLookMode, type PresentationScale } from "./looks.js";
import { heatShimmerPass } from "./diorama.js";
import { createPipVfx, registerPipVfx, type PipEffectsLike, type PipVfxController } from "./vfx.js";
import type { PlayerEvent } from "./player.js";
import type { MoveState, WorldId } from "./types.js";
import type { BuiltWorld } from "./world.js";

/** The node handle slice the presentation drives. */
export interface PresentationNode {
  setScale(scale: number | readonly [number, number, number]): unknown;
  setRotation?(x: number, y: number, z: number): unknown;
  setPosition?(x: number, y: number, z: number): unknown;
  setLight?(patch: { readonly intensity?: number }, opts?: { readonly transitionSeconds?: number }): void;
}

export type PresentationNodeLookup = (name: string) => PresentationNode | null;

export interface PresentationFrame {
  readonly dt: number;
  readonly time: number;
  readonly state: MoveState;
  readonly grounded: boolean;
  readonly position: AuraVec3;
  readonly aspect: number;
  /** Camera boom fraction after obstacle clearance (the focus follows the real lens distance). */
  readonly clearance: number;
  readonly gateUnlocked: boolean;
}

export interface PresentationOptions {
  readonly mode: PipLookMode;
  readonly reducedMotion: boolean;
  readonly heroNode: string;
  readonly gateRingNode: string;
  /** Low quality tier: drops the w4 heat-shimmer pass (PBL-V3). No public tier read yet, so main passes nothing. */
  readonly lowTier?: boolean;
}

export interface QaCrop {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DioramaPresentation {
  readonly mode: PipLookMode;
  readonly scale: PresentationScale;
  /** After a world's scene has mounted (boot and every setScene). */
  worldMounted(built: BuiltWorld): void;
  /** One gameplay event (VFX and camera feedback). */
  event(e: PlayerEvent, built: BuiltWorld, at: AuraVec3): void;
  /** The world was completed through the Sun-Gate. */
  gateOpened(built: BuiltWorld): void;
  /** The Sun-Gate just unlocked: a 1.2 s cut to it (skipped under reduced motion). */
  gateUnlocked(built: BuiltWorld): void;
  /** Per display frame. */
  frame(f: PresentationFrame, built: BuiltWorld, node: PresentationNodeLookup): void;
  /** True while a camera sequence owns the lens: the follow camera skips setPose. */
  cameraBusy(): boolean;
  /** Player input ends a running sequence at once (PBL-C1 "skip within 1 frame"). */
  skipSequence(): void;
  /** Hero scale this frame (squash/stretch), for tests and evidence. */
  readonly heroScaleY: number;
  /** Normalised QA crops for E-I's steady-state capture (`window.__AURA_QA__.crops`). */
  crops(built: BuiltWorld, player: AuraVec3): readonly QaCrop[];
  evidence(): Readonly<Record<string, unknown>>;
}

/** PBL-AN1: squash 0.18 on landing, stretch 0.1 at take-off, recovering over 0.22 s. */
export const SQUASH = { land: -0.18, jump: 0.1, seconds: 0.22 } as const;

/** Squash/stretch at `t` seconds after an impulse of amplitude `amp` (eased back to 1). */
export function squashScaleY(amp: number, t: number): number {
  if (!(t >= 0) || t >= SQUASH.seconds) return 1;
  const k = 1 - t / SQUASH.seconds;
  return 1 + amp * k * k;
}

/** Volume-preserving x/z scale for a y scale. */
export function squashScaleXZ(scaleY: number): number {
  return 1 / Math.sqrt(Math.max(0.05, scaleY));
}

/**
 * PBL-AN1 prop motion (visual only): banners sway up to 0.06 rad about their foot, updraft
 * fans spin at 1.4 rad/s, leaf pads bob 2 cm. Reduced motion scales all three to 30%.
 */
export const PROP_MOTION = { bannerSway: 0.06, bannerHz: 0.35, fanSpin: 1.4, bobMetres: 0.02, bobHz: 0.22 } as const;

export function bannerTilt(time: number, phase: number, motion: number): number {
  return PROP_MOTION.bannerSway * motion * Math.sin(time * Math.PI * 2 * PROP_MOTION.bannerHz + phase);
}

export function fanYaw(yaw: number, time: number, motion: number): number {
  return yaw + PROP_MOTION.fanSpin * motion * time;
}

export function padBob(time: number, motion: number): number {
  return PROP_MOTION.bobMetres * motion * Math.sin(time * Math.PI * 2 * PROP_MOTION.bobHz);
}

/** Smooth flicker in [0, 1]: two incommensurate sines, phase-shifted per light. */
export function flickerNoise(time: number, phase: number): number {
  const v = 0.5 + 0.3 * Math.sin(time * 7.3 + phase * 1.7) + 0.2 * Math.sin(time * 13.1 + phase * 4.1);
  return Math.min(1, Math.max(0, v));
}

/** Project world points through a column-major view-projection; null when all are behind the lens. */
export function projectBox(vp: readonly number[], points: readonly AuraVec3[], pad = 0): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y, z] of points) {
    const cw = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
    if (cw <= 1e-4) continue;
    const u = ((vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / cw + 1) / 2;
    const v = (1 - (vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / cw) / 2;
    minX = Math.min(minX, u); maxX = Math.max(maxX, u);
    minY = Math.min(minY, v); maxY = Math.max(maxY, v);
  }
  if (!Number.isFinite(minX)) return null;
  const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
  const x1 = Math.min(1, maxX + pad), y1 = Math.min(1, maxY + pad);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Static crops (fractions of the main canvas) every world publishes. */
export const STATIC_CROPS: readonly QaCrop[] = [
  { name: "corner-tl", x: 0, y: 0, w: 0.16, h: 0.18 },
  { name: "corner-tr", x: 0.84, y: 0, w: 0.16, h: 0.18 },
  { name: "top-band", x: 0, y: 0, w: 1, h: 0.12 },
  { name: "bottom-band", x: 0, y: 0.86, w: 1, h: 0.14 }
];

/** The 3.5 s fly-over rail: from above the Sun-Gate end down the course to the follow pose behind Pip. */
export function flyoverRail(built: BuiltWorld): { readonly points: readonly AuraVec3[]; readonly lookAt: readonly AuraVec3[] } {
  const [sx, sy, sz] = built.spec.spawn;
  const g = built.spec.gate;
  const top = Math.max(sy, g.y) + 6;
  const midZ = (sz + g.z) / 2;
  return {
    points: [
      [g.x + 5, top + 2, g.z + 8],
      [6.5, top, midZ],
      [sx + 3, sy + 3.5, sz + 7],
      [sx, sy + 1.7, sz + 4.5]
    ],
    lookAt: [
      [g.x, g.y + 1.5, g.z],
      [0, sy + 1, midZ - 6],
      [sx, sy + 0.8, sz - 2],
      [sx, sy + 0.55, sz - 3.2]
    ]
  };
}

interface AppSlice {
  /** The live effects surface; read through the `PipEffectsLike` slice the VFX pack uses. */
  readonly effects?: unknown;
  readonly post?: {
    setEffect?(name: string, patch: Parameters<NonNullable<AuraApp["post"]>["setEffect"]>[1]): void;
    addPostPass?(pass: AuraCustomPostPass): () => void;
  };
  readonly atmosphere?: { setFog(spec: Parameters<NonNullable<AuraApp["atmosphere"]>["setFog"]>[0], opts?: Parameters<NonNullable<AuraApp["atmosphere"]>["setFog"]>[1]): unknown };
  readonly camera?: {
    play?(sequence: CameraSequenceArg): AuraCameraSequencePlayback;
    readonly fovKick?: { set?(channel: string, offsetDeg: number, seconds?: number): unknown };
    readonly shake?: { add?(amount: number): unknown };
    evidence?(): { readonly viewProjection?: readonly number[] };
  };
  setOutput?(options: Parameters<NonNullable<AuraApp["setOutput"]>>[0]): unknown;
}

type CameraSequenceArg = Parameters<NonNullable<AuraApp["camera"]>["play"]>[0];

export function createDioramaPresentation(app: AppSlice, options: PresentationOptions): DioramaPresentation {
  // GU47 phase 3: the look is chosen per world (`worldLookMode`), so the runtime follows the
  // mounted world's mode; it starts on the boot world's mode.
  let diorama = options.mode === "diorama";
  let outputTouched = false;
  const scale = presentationScale(options.reducedMotion);
  const fx = app.effects as PipEffectsLike | undefined;
  let vfx: PipVfxController | null = null;
  let registered = false;
  let playback: AuraCameraSequencePlayback | null = null;
  let focus = -1;
  let flickerClock = 0;
  let squashAmp = 0;
  let squashT: number = SQUASH.seconds;
  let heroScaleY = 1;
  let wasGrounded = true;
  let kick: "glide" | "dive" | null = null;
  let mountedWorld: WorldId | null = null;
  let removeShimmer: (() => void) | null = null;
  const counts = { mounted: 0, flyovers: 0, gateCuts: 0, focusWrites: 0, flickerWrites: 0, shimmerPasses: 0 };

  const ensureVfx = (): PipVfxController | null => {
    if (!diorama || !fx || typeof fx.burst !== "function") return null;
    if (!registered && typeof fx.registerPreset === "function") {
      registerPipVfx(fx);
      registered = true;
    }
    vfx ??= createPipVfx(fx, { reducedMotion: options.reducedMotion, heroNode: options.heroNode });
    return vfx;
  };

  const play = (id: string, shots: CameraSequenceArg["shots"]): void => {
    const cam = app.camera;
    if (!scale.cameraSequences || !cam || typeof cam.play !== "function") return;
    playback?.skip();
    const run = cam.play({ id, shots, onEnd: "return" });
    playback = run;
    void run.done.then(() => {
      if (playback === run) playback = null;
    });
  };

  const setKick = (next: "glide" | "dive" | null): void => {
    if (next === kick) return;
    kick = next;
    const layer = app.camera?.fovKick;
    if (!layer || typeof layer.set !== "function") return;
    layer.set("pbl-move", next === "glide" ? 4 * scale.motion : next === "dive" ? 6 * scale.motion : 0, next ? 0.18 : 0.3);
  };

  return {
    mode: options.mode,
    scale,
    get heroScaleY() {
      return heroScaleY;
    },

    worldMounted(built) {
      diorama = built.presentation.mode === "diorama";
      if (!diorama) {
        // A 4.6.2-look world after a diorama world: undo the diorama's app-level state. The
        // output exposure defaults to 1 (Renderer.executeOutputPass), the app-level fog only
        // applies to node-free scenes and is cleared without touching the new scene's fog
        // nodes, and the w4 shimmer pass and any running trail or FOV kick end here.
        removeShimmer?.();
        removeShimmer = null;
        vfx?.stopTrails();
        setKick(null);
        playback?.skip();
        playback = null;
        if (outputTouched) {
          app.setOutput?.({ exposure: 1 });
          try {
            app.atmosphere?.setFog(null, { overrideSceneFog: false, transitionSeconds: 0 });
          } catch {
            // A stub atmosphere has nothing to clear.
          }
          outputTouched = false;
        }
        return;
      }
      const look = built.presentation.look;
      outputTouched = true;
      counts.mounted += 1;
      // PBL-P1: the look declares its post id, but nothing applies the look's output
      // preset on this build, so the world's preset is set after every setScene. The
      // exposure rides along explicitly (GU47 phase 2: the first capture measured every
      // world 2-3 EV under its band, so the world EV is written as the output multiplier).
      app.setOutput?.({ preset: look.post.preset, exposure: Math.pow(2, look.exposureEv) });
      // PBL-E1: keep the live fog on the base height fog after the swap.
      if (built.presentation.baseTop !== null) {
        try {
          app.atmosphere?.setFog(heightFogFor(look, built.presentation.baseTop), { overrideSceneFog: true, transitionSeconds: 0 });
        } catch {
          // A stub atmosphere (flag off) keeps the authored fog node.
        }
      }
      // PBL-V3: the w4 heat-shimmer pass lives only while w4 is mounted.
      removeShimmer?.();
      removeShimmer = null;
      const shimmer = heatShimmerPass(look, scale, options.lowTier === true);
      if (shimmer && typeof app.post?.addPostPass === "function") {
        removeShimmer = app.post.addPostPass(shimmer);
        counts.shimmerPasses += 1;
      }
      ensureVfx()?.stopTrails();
      focus = -1;
      setKick(null);
      // PBL-C1: a 3.5 s rail fly-over the first time each world mounts.
      if (mountedWorld !== built.spec.id) {
        mountedWorld = built.spec.id;
        const rail = flyoverRail(built);
        play(`pbl-flyover-${built.spec.id}`, [{ rig: camera.rigs.rail({ points: rail.points, lookAt: rail.lookAt, duration: 3.5, ease: "inOutSine", fov: 46 }), duration: 3.5 }]);
        if (playback) counts.flyovers += 1;
      }
    },

    event(e, built, at) {
      const v = ensureVfx();
      if (!v) return;
      const look = built.presentation.look;
      switch (e.kind) {
        case "land":
        case "pound-land":
          v.fire("land", at, look.dust);
          squashAmp = SQUASH.land * scale.motion;
          squashT = 0;
          // PBL-C2 pound shake; off under reduced motion (PRD 6.3), like the pack's camera layers.
          if (e.kind === "pound-land" && !options.reducedMotion) app.camera?.shake?.add?.(0.3);
          break;
        case "jump":
        case "double-jump":
        case "spring":
          v.fire("jump", at, look.dust);
          squashAmp = SQUASH.jump * scale.motion;
          squashT = 0;
          break;
        case "seed": {
          const seed = built.seeds.find((s) => s.id === e.id);
          v.fire("seed", seed ? [seed.x, seed.y, seed.z] : at);
          break;
        }
        case "acorn": {
          const acorn = built.acorns.find((a) => a.id === e.id);
          v.fire("acorn", acorn ? [acorn.x, acorn.y, acorn.z] : at);
          break;
        }
        case "checkpoint": {
          const cp = built.checkpoints.find((c) => c.id === e.id);
          v.fire("checkpoint", cp ? [cp.x, cp.y + 1.2, cp.z] : at);
          break;
        }
        case "hurt":
        case "boss-contact":
          v.fire("hurt", [at[0], at[1] + 0.6, at[2]]);
          break;
        default:
          break;
      }
    },

    gateOpened(built) {
      const g = built.spec.gate;
      ensureVfx()?.fire("gate", [g.x, g.y + 1.5, g.z]);
    },

    gateUnlocked(built) {
      if (!diorama) return;
      const g = built.spec.gate;
      play("pbl-gate-cut", [{ rig: camera.rigs.static({ position: [g.x + 3.2, g.y + 2.6, g.z + 6.5], target: [g.x, g.y + 1.5, g.z], fov: 46 }), duration: 1.2, blendIn: 0.25 }]);
      if (playback) counts.gateCuts += 1;
    },

    frame(f, built, node) {
      if (!diorama) return;
      // PBL-P2: the DOF focus follows the real lens-to-Pip distance (5 cm hysteresis).
      const target = Number(focusDistanceFor(miniatureFramingFor(f.aspect), f.clearance).toFixed(2));
      if (built.presentation.look.lens !== "none" && Math.abs(target - focus) >= 0.05) {
        focus = target;
        try {
          app.post?.setEffect?.("depthOfField", { focusDistance: target });
          counts.focusWrites += 1;
        } catch {
          // Post surface without runtime control: the authored focus stays.
        }
      }
      // PBL-L2: practical flicker at about 20 Hz (steady under reduced motion).
      flickerClock += f.dt;
      if (scale.flicker && flickerClock >= 0.05) {
        flickerClock = 0;
        built.presentation.practicals.forEach((p, i) => {
          if (p.flicker <= 0) return;
          const handle = node(p.name);
          if (handle?.setLight) {
            handle.setLight({ intensity: p.intensity * (1 - p.flicker * flickerNoise(f.time, i)) }, { transitionSeconds: 0.05 });
            counts.flickerWrites += 1;
          }
        });
      }
      // PBL-V2: trails follow the move state and stop the moment Pip lands.
      ensureVfx()?.trailFor(f.state === "glide" ? "glide" : f.state === "dive" ? "dive" : null);
      // PBL-C2: FOV kick while gliding or diving.
      setKick(f.state === "glide" ? "glide" : f.state === "dive" ? "dive" : null);
      // PBL-AN1: squash on landing, stretch on take-off (visual only).
      if (f.grounded && !wasGrounded && squashT >= SQUASH.seconds) {
        squashAmp = SQUASH.land * scale.motion;
        squashT = 0;
      }
      wasGrounded = f.grounded;
      squashT += f.dt;
      heroScaleY = squashScaleY(squashAmp, squashT);
      const xz = squashScaleXZ(heroScaleY);
      node(options.heroNode)?.setScale([xz, heroScaleY, xz]);
      // PBL-AN1: banners sway, updraft fans spin, leaf pads bob (visual only, PRD D8).
      for (const d of built.presentation.animatedDecor) {
        const h = node(d.name);
        if (d.kind === "banner") h?.setRotation?.(0, d.yaw, bannerTilt(f.time, d.phase, scale.motion));
        else h?.setRotation?.(0, fanYaw(d.yaw, f.time, scale.motion), 0);
      }
      const bob = padBob(f.time, scale.motion);
      for (const name of built.presentation.bobNodes) node(name)?.setPosition?.(0, bob, 0);
      // PBL-V2: the unlocked Sun-Gate ring breathes.
      const ring = f.gateUnlocked ? 1 + 0.06 * Math.sin(f.time * 4) * scale.motion : 1;
      node(options.gateRingNode)?.setScale([ring, ring, ring]);
    },

    cameraBusy() {
      return playback !== null;
    },

    skipSequence() {
      playback?.skip();
      playback = null;
    },

    crops(built, player) {
      if (!diorama) return [];
      const vp = app.camera?.evidence?.().viewProjection;
      const out: QaCrop[] = [...STATIC_CROPS];
      if (!vp || vp.length < 16) return out;
      const [x, y, z] = player;
      const pip = projectBox(vp, [[x - 0.35, y, z - 0.35], [x + 0.35, y + 1.25, z + 0.35], [x - 0.35, y + 1.25, z + 0.35], [x + 0.35, y, z - 0.35]], 0.01);
      if (pip) out.push({ name: "pip", ...pip });
      const feet = projectBox(vp, [[x - 0.6, y - 0.05, z - 0.6], [x + 0.6, y + 0.3, z + 0.6]], 0.01);
      if (feet) out.push({ name: "feet", ...feet });
      const glide = projectBox(vp, [[x - 1.2, y - 0.3, z - 1.6], [x + 1.2, y + 1.8, z + 1.6]], 0.01);
      if (glide) out.push({ name: "glide", ...glide });
      if (built.spec.id === "w5") {
        const throne = projectBox(vp, [[-1.5, 1.6, -70], [1.5, 4.4, -68]], 0.01);
        if (throne) out.push({ name: "throne", ...throne });
      }
      for (const w of built.waters.slice(0, 1)) {
        const water = projectBox(vp, [[w.x - w.hx, w.surfaceY, w.z - w.hz], [w.x + w.hx, w.surfaceY, w.z + w.hz]], 0);
        if (water) out.push({ name: "water", ...water });
      }
      return out.slice(0, 16);
    },

    evidence() {
      return {
        mode: diorama ? "diorama" : "original",
        bootMode: options.mode,
        reducedMotion: options.reducedMotion,
        focusDistance: focus,
        heroScaleY: Number(heroScaleY.toFixed(3)),
        trail: vfx?.trail ?? null,
        vfxFired: vfx ? { ...vfx.fired } : null,
        liveCount: fx?.liveCount ?? 0,
        cameraSequence: playback !== null,
        heatShimmer: removeShimmer !== null,
        ...counts
      };
    }
  };
}
