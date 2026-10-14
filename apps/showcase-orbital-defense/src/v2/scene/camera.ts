// apps/showcase-orbital-defense/src/v2/scene/camera.ts — orbit rig (T2.3).
// Route-local AuraCameraRig (G12 stand-in, direction.standIns[] R-14-10):
// §6.9.4 — 25–35° above the orbital plane, planet ~70% of frame height,
// slow orbit drift 0.5°/s. Distance solves the planet sphere height
// (2·PLANET_RADIUS incl. atmosphere) at 0.7 fraction for the rig fov.
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";
import { PLANET_RADIUS } from "./world";

export interface OrbitalRigOptions {
  readonly subjectHeightFraction?: number;
  readonly fovDeg?: number;
  /** Elevation above the orbital plane in degrees (band 25–35). */
  readonly elevationDeg?: number;
  /** Orbit drift rate in degrees per second (PRD: 0.5). */
  readonly driftDegPerSecond?: number;
}

const UP: AuraVec3 = [0, 1, 0];
const DEG = Math.PI / 180;
const PLANET_FRAME_HEIGHT = PLANET_RADIUS * 2 * 1.08; // + atmosphere shell

export function createOrbitalRig(o: OrbitalRigOptions = {}): AuraCameraRig {
  const fraction = o.subjectHeightFraction ?? 0.7;
  const fovDeg = o.fovDeg ?? 42;
  const elevRad = (o.elevationDeg ?? 30) * DEG;
  const drift = (o.driftDegPerSecond ?? 0.5) * DEG;
  const distance = PLANET_FRAME_HEIGHT / (2 * Math.tan((fovDeg / 2) * DEG) * fraction);
  let azimuth = -90 * DEG;
  let lastTime = 0;
  return {
    id: "orbital-defense.orbit",
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      azimuth += drift * Math.max(0, ctx.time - lastTime);
      lastTime = ctx.time;
      const horizontal = Math.cos(elevRad) * distance;
      const height = Math.sin(elevRad) * distance;
      return {
        position: [
          Math.cos(azimuth) * horizontal,
          Math.sin(azimuth) * horizontal,
          height
        ],
        target: [0, 0, 0.35],
        up: UP,
        roll: 0,
        fov: fovDeg,
        near: 0.05,
        far: 120
      };
    }
  };
}
