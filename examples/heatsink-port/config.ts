/** Tuning constants of the original game (its `Re` config), transcribed from the captured module. */
export const CFG = {
  track: { laps: 3, lavaStrip: 0 },
  vehicle: { maxSpeed: 115, accelK: 0.85, boostAccelK: 1.7, coastK: 0.25, accelMax: 34, boostAccelMax: 46, brake: 55, steerLow: 1.9, steerHigh: 0.95, steerResponse: 7, driftSteerMul: 1.5, grip: 9, driftGrip: 1.8, assist: 0.8, hover: 5.3, spring: 90, damping: 12, gravity: 28, halfWidth: 2.9, halfLength: 6.2, crashAngle: 0.38, crashMinSpeed: 45, crashBudget: 3, respawnInvuln: 2, crashTime: 1.6 },
  afterburner: { mult: 0.25, drain: 0.45, refill: 0.11 },
  ramjet: { mult: 0.5, heatRate: 0.22, coolRate: 0.3, burningAt: 0.8 },
  lava: { heatRate: 0.9 },
  drift: { burstMult: 0.18, minCharge: 0.5, burstTime: 1.2 },
  landing: { perfectMult: 0.12, time: 1 },
  camera: { dist: 9.5, height: 3.3, lookAhead: 22, fovBase: 68, fovMax: 92, fovRamjet: 14, roll: 0.2 },
  weapons: { speed: 330, life: 0.75, length: 10, startGrace: 3, rate: 0.085, heatPerShot: 0.05, cool: 0.45, lockout: 0.35, assist: 14, playerDmg: 1, aiDmg: 0.6, aiVsAiDmg: 0.4, aiHealth: 11, aiRegen: 0.8, aiRange: 150, shield: 10, shieldRegen: 1.6, shieldDelay: 2.5 },
  roll: { time: 0.5, cd: 2, dash: 7, iframes: 0.45, boostCost: 0.08 },
  tilt: { idle: 0, cruise: 0, perAccel: 0, perBrake: 0.02, forward: 0, back: 0.22 },
  checkpoint: { burst: 1, boost: 0.2, aiKick: 18, sparks: 48 },
  nearMiss: { gap: 1.4, minSpeed: 70, slow: 0.45, cooldown: 3, boost: 0.15 }
} as const;

/** substep size used by `game.step` (`wq` in the captured module is the max sub-step; frame dt 1/60 is one step). */
export const FRAME_DT = 1 / 60;
