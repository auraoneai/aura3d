/**
 * Red Zone 3D — broadcast camera director.
 *
 * High-sideline TV framing: tight on the line of scrimmage pre-snap,
 * pulls back and tracks the ball carrier when the play goes live,
 * orbits scorers in celebration, and slow-orbits the venue in menus.
 */
import type { GameState } from "./types";

export interface CamPose { position: [number, number, number]; target: [number, number, number]; fov: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (t: number) => t * t * (3 - 2 * t);

export function createDirector() {
  let eye: [number, number, number] = [0, 18.5, -6];
  let target: [number, number, number] = [0, 1.4, 45];
  let fov = 42;
  let mode: "menu" | "intro" | "broadcast" | "celebrate" | "lab" = "broadcast";
  let modeT = 0;
  let orbit = 0;
  let prevPhase = "";

  function setMode(m: typeof mode) {
    if (mode !== m) { mode = m; modeT = 0; }
  }

  function update(dt: number, s: GameState, inMenu: boolean): CamPose {
    modeT += dt;
    const damp = (k: number) => 1 - Math.pow(k, dt * 60);

    // --- mode transitions from game phase ---
    if (inMenu || s.phase === "idle") setMode("menu");
    else if (s.mode === "routelab" || s.mode === "tacklelab") setMode("lab");
    else if (s.phase === "gameOver" && mode !== "celebrate") setMode("celebrate");
    else if (s.phase !== "gameOver" && (mode === "menu" || mode === "celebrate" || mode === "intro")) setMode("broadcast");
    if (s.phase !== prevPhase) {
      if (s.phase === "live" && mode === "intro") setMode("broadcast");
      prevPhase = s.phase;
    }

    const ball = s.ball;
    const focusX = clamp(ball.x * 0.55, -14, 14);
    const losBehind = s.los - 26.5 * s.dir;

    let wantEye: [number, number, number], wantTgt: [number, number, number], wantFov: number;

    switch (mode) {
      case "menu": {
        orbit += dt * 0.11;
        const r = 56;
        wantEye = [Math.sin(orbit) * r, 22 + Math.sin(orbit * 0.6) * 3, 50 + Math.cos(orbit) * r];
        wantTgt = [0, 2.0, 50];
        wantFov = 40;
        break;
      }
      case "intro": {
        const t = smooth(clamp(modeT / 2.2, 0, 1));
        const start: [number, number, number] = [focusX * 0.35, 18.5, s.los - 38 * s.dir];
        const end: [number, number, number] = [focusX * 0.45, 18.5, losBehind];
        wantEye = lerp3(start, end, t);
        wantTgt = lerp3([0, 1.5, s.los + 22 * s.dir], [s.ballSpotX * 0.5, 1.4, s.los + 20 * s.dir], t);
        wantFov = lerp(42, 41, t);
        if (modeT >= 2.2) setMode("broadcast");
        break;
      }
      case "lab": {
        // tighter tactical view for drills
        const c = s.carrier ? s.athletes.find((a) => a.id === s.carrier) : undefined;
        const cx = c ? c.x : ball.x, cz = c ? c.z : ball.z;
        wantEye = [cx * 0.4, 14.5, cz - 22];
        wantTgt = [cx * 0.7, 1.8, cz + 12];
        wantFov = 32;
        break;
      }
      case "celebrate": {
        orbit += dt * 0.3;
        const cx = clamp(ball.x, -20, 20), cz = clamp(ball.z, -6, 106);
        wantEye = [cx + Math.sin(orbit) * 14, 5.2, cz + Math.cos(orbit) * 14];
        wantTgt = [cx, 1.3, cz];
        wantFov = 28;
        break;
      }
      case "broadcast":
      default: {
        if (s.phase === "preSnap" || s.phase === "patChoice") {
          // Wide, high behind-the-QB framing: all 14 players plus the far
          // stand roof and a slice of night sky stay in the 16:10 frame.
          wantEye = [s.ballSpotX * 0.45, 18.5, s.los - 32 * s.dir];
          wantTgt = [s.ballSpotX * 0.55, 1.4, s.los + 20 * s.dir];
          wantFov = 41;
        } else if (s.phase === "kickoff") {
          wantEye = [focusX * 0.4, 22, 50 - 50 * s.dir];
          wantTgt = [focusX * 0.5, 1.2, 50 + 4 * s.dir];
          wantFov = 42;
        } else {
          // live: pull back, track ball + a lookahead downfield
          const ahead = s.dir * 20;
          const bx = ball.x, bz = ball.z;
          const camBehind = s.phase === "live" ? bz - 36 * s.dir : losBehind;
          wantEye = [clamp(bx * 0.5, -14, 14), 18.5, clamp(camBehind, -60, 170)];
          wantTgt = [clamp(bx * 0.6, -15, 15), 1.4, clamp(bz + ahead, -12, 118)];
          wantFov = s.phase === "playOver" ? 40 : 41;
          // air balls: widen to keep the flight in frame
          if (ball.kind === "air") wantFov = 44;
        }
      }
    }

    // smooth toward wanted pose — snappier when the play is live
    const k = s.phase === "live" ? damp(0.9) : damp(0.93);
    eye = lerp3(eye, wantEye, 1 - k);
    target = lerp3(target, wantTgt, 1 - k);
    fov = lerp(fov, wantFov, 1 - (1 - Math.pow(0.94, dt * 60)));

    return { position: eye, target, fov };
  }

  return {
    update,
    pose: () => ({ position: eye, target, fov }),
    mode: () => mode,
    setMenu: () => setMode("menu"),
    kickIntro: () => setMode("broadcast")
  };
}

export type Director = ReturnType<typeof createDirector>;
