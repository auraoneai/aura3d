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
  let eye: [number, number, number] = [0, 30, -20];
  let target: [number, number, number] = [0, 0, 50];
  let fov = 24;
  let mode: "menu" | "intro" | "broadcast" | "celebrate" | "lab" = "menu";
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
    else if (s.phase === "preSnap" && prevPhase === "" && mode !== "broadcast" && mode !== "intro") setMode("intro");
    else if (s.phase !== "gameOver" && (mode === "menu" || mode === "celebrate")) setMode("broadcast");
    if (s.phase !== prevPhase) {
      if (s.phase === "live" && mode === "intro") setMode("broadcast");
      prevPhase = s.phase;
    }

    const ball = s.ball;
    const focusX = clamp(ball.x * 0.55, -16, 16);
    const losBehind = s.los - 24 * s.dir;

    let wantEye: [number, number, number], wantTgt: [number, number, number], wantFov: number;

    switch (mode) {
      case "menu": {
        orbit += dt * 0.11;
        const r = 62;
        wantEye = [Math.sin(orbit) * r, 26 + Math.sin(orbit * 0.6) * 4, 50 + Math.cos(orbit) * r];
        wantTgt = [0, 1.4, 50];
        wantFov = 30;
        break;
      }
      case "intro": {
        const t = smooth(clamp(modeT / 2.2, 0, 1));
        const start: [number, number, number] = [focusX - 46, 34, s.los - 46 * s.dir];
        const end: [number, number, number] = [focusX * 0.6, 21, losBehind];
        wantEye = lerp3(start, end, t);
        wantTgt = lerp3([0, 3, s.los + 14 * s.dir], [s.ballSpotX * 0.5, 0.6, s.los + 9 * s.dir], t);
        wantFov = lerp(30, 22, t);
        if (modeT >= 2.2) setMode("broadcast");
        break;
      }
      case "lab": {
        // tighter tactical view for drills
        const c = s.carrier ? s.athletes.find((a) => a.id === s.carrier) : undefined;
        const cx = c ? c.x : ball.x, cz = c ? c.z : ball.z;
        wantEye = [cx * 0.4, 16, cz - 18];
        wantTgt = [cx * 0.7, 0.8, cz + 7];
        wantFov = 27;
        break;
      }
      case "celebrate": {
        orbit += dt * 0.3;
        const cx = clamp(ball.x, -20, 20), cz = clamp(ball.z, -6, 106);
        wantEye = [cx + Math.sin(orbit) * 14, 5.2, cz + Math.cos(orbit) * 14];
        wantTgt = [cx, 1.3, cz];
        wantFov = 26;
        break;
      }
      case "broadcast":
      default: {
        if (s.phase === "preSnap" || s.phase === "patChoice") {
          // tight on the line — see the whole formation
          wantEye = [s.ballSpotX * 0.45, 21, s.los - 24 * s.dir];
          wantTgt = [s.ballSpotX * 0.55, 0.6, s.los + 9 * s.dir];
          wantFov = 21;
        } else if (s.phase === "kickoff") {
          wantEye = [focusX * 0.4, 30, 50 - 34 * s.dir];
          wantTgt = [focusX * 0.5, 0, 50];
          wantFov = 24;
        } else {
          // live: pull back, track ball + a lookahead downfield
          const ahead = s.dir * 12;
          const bx = ball.x, bz = ball.z;
          const camBehind = s.phase === "live" ? bz - 26 * s.dir : losBehind;
          wantEye = [clamp(bx * 0.5, -14, 14), 23, clamp(camBehind, -60, 170)];
          wantTgt = [clamp(bx * 0.6, -15, 15), 0.7, clamp(bz + ahead * 0.55, -12, 112)];
          wantFov = s.phase === "playOver" ? 20 : 18.5;
          // air balls: widen to keep the flight in frame
          if (ball.kind === "air") wantFov = 23;
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
    kickIntro: () => setMode("intro")
  };
}

export type Director = ReturnType<typeof createDirector>;
