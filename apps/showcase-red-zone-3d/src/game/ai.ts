/**
 * Red Zone 3D — demo autopilot + helper brains.
 *
 * `createAutopilot` produces a SimCommand per frame that plays the user's
 * side competently: picks plays, drops/aims/throws the QB, runs the carrier
 * to daylight, pursues on defense, and answers PAT prompts. Used for
 * `?demo=1` / `?auto=1` remote captures and idle attract mode.
 */
import type { SimCommand, GameState } from "./types";

export interface Autopilot {
  command(state: GameState, dt: number): SimCommand;
}

export function createAutopilot(rng: () => number): Autopilot {
  let t = 0;
  let cardT = -1;
  let throwPlan: { holdUntil: number; released: boolean } | null = null;
  let jukeCool = 0;

  return {
    command(state: GameState, dt: number): SimCommand {
      t += dt;
      jukeCool = Math.max(0, jukeCool - dt);
      const cmd: SimCommand = {};
      const s = state;

      if (s.phase === "preSnap") {
        if (s.possession === "user") {
          if (cardT < 0) cardT = t + 0.9 + rng() * 0.8;
          if (t >= cardT) {
            cmd.pickCard = Math.floor(rng() * 3);
            cardT = -1;
          }
        }
        return cmd;
      }

      if (s.phase === "patChoice") {
        cmd.patKick = true;
        return cmd;
      }

      if (s.phase !== "live") return cmd;

      const ctlId = s.userControlled;
      const ctl = s.athletes.find((a) => a.id === ctlId);
      const carrier = s.athletes.find((a) => a.id === s.carrier);

      // ----- user on offense -----
      if (ctl && ctl.unit === "offense") {
        if (ctl.slot === "qb" && s.ball.kind === "held" && s.ball.holder === ctl.id && !s.carrier) {
          // QB: settle in the pocket, then throw at the best separation
          if (!throwPlan || throwPlan.released) {
            throwPlan = { holdUntil: s.snapT + 0.9 + rng() * 1.1, released: false };
          }
          // drift toward the pocket
          const dropZ = s.los - 6 * s.dir;
          cmd.moveZ = Math.abs(ctl.z - dropZ) > 0.6 ? Math.sign(dropZ - ctl.z) * s.dir * 0.7 : 0;
          cmd.moveX = ctl.x > 0.5 ? -0.25 : ctl.x < -0.5 ? 0.25 : 0;
          if (s.snapT >= throwPlan.holdUntil) {
            // find most-open receiver ahead
            let best: typeof ctl | undefined;
            let bestSep = 0;
            for (const r of s.athletes) {
              if (r.unit !== "offense" || r.slot === "qb" || r.down || r.slot === "c") continue;
              let dmin = 99;
              for (const d of s.athletes) {
                if (d.unit !== "defense" || d.down) continue;
                dmin = Math.min(dmin, Math.hypot(d.x - r.x, d.z - r.z));
              }
              const ahead = (r.z - s.los) * s.dir;
              const score = dmin + (ahead > 1 ? 1.5 : 0) + (r.route ? 0.5 : 0);
              if (score > bestSep) { bestSep = score; best = r; }
            }
            // steer toward the target's general direction so aim snaps on
            if (best) {
              cmd.moveX = Math.sign(best.x - ctl.x) * 0.9;
              cmd.moveZ = Math.sign(best.z - ctl.z) * s.dir * 0.6;
            }
            if (!throwPlan.released) {
              cmd.throwHeld = true;
              cmd.throwReleased = false;
              if (s.throwCharge > 0.55 || (s.pressure ?? 0) > 0.7) {
                cmd.throwReleased = true;
                cmd.throwHeld = false;
                throwPlan.released = true;
              }
            }
          }
          return cmd;
        }
        if (carrier && carrier.id === ctl.id) {
          // carrier: drive downfield, veer from nearest tackler, juke on close
          cmd.moveZ = 1;
          let near: typeof ctl | undefined;
          let nd = 99;
          for (const d of s.athletes) {
            if (d.unit !== "defense" || d.down) continue;
            const dd = Math.hypot(d.x - ctl.x, d.z - ctl.z);
            if (dd < nd) { nd = dd; near = d; }
          }
          if (near && nd < 5) {
            cmd.moveX = Math.sign(ctl.x - near.x || (rng() - 0.5)) * 0.8;
            if (nd < 2.4 && jukeCool <= 0 && rng() < 0.5) { cmd.juke = true; jukeCool = 1.2; }
            else if (nd < 1.8 && rng() < 0.3) cmd.truck = true;
          }
          // dive at the pylon when close
          const goal = s.dir === 1 ? 100 : 0;
          if (Math.abs(ctl.z - goal) < 4.5 && rng() < dt * 3) cmd.dive = true;
          return cmd;
        }
        return cmd;
      }

      // ----- user on defense (safety) -----
      if (ctl && ctl.unit === "defense") {
        if (s.ball.kind === "air") {
          const dx = s.ball.aimX - ctl.x, dz = s.ball.aimZ - ctl.z;
          const dd = Math.hypot(dx, dz) || 1;
          cmd.moveX = dx / dd;
          cmd.moveZ = (dz / dd) * s.dir;
          if (dd < 8) cmd.ballHawk = true;
          return cmd;
        }
        if (carrier) {
          const dx = carrier.x - ctl.x, dz = carrier.z - ctl.z;
          const dd = Math.hypot(dx, dz) || 1;
          cmd.moveX = dx / dd;
          cmd.moveZ = (dz / dd) * s.dir;
          if (dd < 1.4) cmd.tackle = true;
          else if (dd < 2.2 && rng() < 0.35) cmd.hitStick = true;
          return cmd;
        }
        // roam to midfield depth
        const dz = s.los + 12 * s.dir - ctl.z;
        cmd.moveZ = Math.sign(dz) * Math.min(1, Math.abs(dz) / 4) * s.dir;
        cmd.moveX = ctl.x > 2 ? -0.4 : ctl.x < -2 ? 0.4 : 0;
        return cmd;
      }
      return cmd;
    }
  };
}
