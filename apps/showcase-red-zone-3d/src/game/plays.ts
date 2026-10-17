/**
 * Red Zone 3D — playbook, route stems, and coverage shells.
 *
 * Routes are authored in attack space: `dx` is lateral yards from the
 * receiver's alignment (positive = offense's right), `dz` is yards
 * downfield of the line of scrimmage. The sim mirrors `dz` by the
 * offense's attack direction.
 *
 * 7v7 personnel: QB, C, RB, WL (wide left), SL (slot left), SR (slot
 * right), WR (wide right). Defense: DL1, DL2, LB1, LB2, CB1, CB2, S.
 */
import type { PlayDef, RouteDef, ReceiverAlign, CoverageShell, Club, PlayType } from "./types";

const rt = (stem: readonly (readonly [number, number])[], stemTime: number, window: readonly [number, number]): RouteDef => ({ stem, stemTime, window });

export const OFFENSE_ALIGN: readonly ReceiverAlign[] = [
  { slot: "qb", dx: 0,     dz: -4.2, stance: "two" },
  { slot: "c",  dx: 0,     dz: -0.55, stance: "three" },
  { slot: "rb", dx: 4.6,   dz: -4.6, stance: "two" },
  { slot: "wl", dx: -21.5, dz: -0.3, stance: "two" },
  { slot: "sl", dx: -10.5, dz: -0.3, stance: "two" },
  { slot: "sr", dx: 10.5,  dz: -0.3, stance: "two" },
  { slot: "wr", dx: 21.5,  dz: -0.3, stance: "two" }
];

/** Defender slots and pre-snap alignment per shell (dx lateral, dz behind→above LOS in attack space). */
export const DEFENSE_ALIGN: Record<CoverageShell, readonly { slot: string; dx: number; dz: number }[]> = {
  cover2: [
    { slot: "dl1", dx: -1.8, dz: 1.0 }, { slot: "dl2", dx: 1.8, dz: 1.0 },
    { slot: "lb1", dx: -6.5, dz: 4.5 }, { slot: "lb2", dx: 6.5, dz: 4.5 },
    { slot: "cb1", dx: -20.5, dz: 3.0 }, { slot: "cb2", dx: 20.5, dz: 3.0 },
    { slot: "s", dx: 0, dz: 13 }
  ],
  cover3: [
    { slot: "dl1", dx: -1.8, dz: 1.0 }, { slot: "dl2", dx: 1.8, dz: 1.0 },
    { slot: "lb1", dx: -7, dz: 4.5 }, { slot: "lb2", dx: 7, dz: 4.5 },
    { slot: "cb1", dx: -20.5, dz: 4.0 }, { slot: "cb2", dx: 20.5, dz: 4.0 },
    { slot: "s", dx: 0, dz: 12 }
  ],
  man: [
    { slot: "dl1", dx: -1.8, dz: 1.0 }, { slot: "dl2", dx: 1.8, dz: 1.0 },
    { slot: "lb1", dx: -5, dz: 3.5 }, { slot: "lb2", dx: 5, dz: 3.5 },
    { slot: "cb1", dx: -20.5, dz: 1.4 }, { slot: "cb2", dx: 20.5, dz: 1.4 },
    { slot: "s", dx: 0, dz: 9 }
  ],
  blitz: [
    { slot: "dl1", dx: -1.8, dz: 1.0 }, { slot: "dl2", dx: 1.8, dz: 1.0 },
    { slot: "lb1", dx: -4, dz: 2.2 }, { slot: "lb2", dx: 4, dz: 2.2 },
    { slot: "cb1", dx: -20.5, dz: 1.4 }, { slot: "cb2", dx: 20.5, dz: 1.4 },
    { slot: "s", dx: -9, dz: 4.5 }
  ]
};

/** Zone landmarks per defender slot for zone shells (attack-space x, depth past LOS). */
export const ZONE_DROPS: Record<CoverageShell, Record<string, readonly [number, number]>> = {
  cover2: {
    lb1: [-11, 8], lb2: [11, 8], cb1: [-22, 7], cb2: [22, 7], s: [-9, 15]
  },
  cover3: {
    lb1: [-9, 7], lb2: [9, 7], cb1: [-23, 10], cb2: [23, 10], s: [0, 15]
  },
  man: {},
  blitz: {}
};

/** Man-coverage matchups: defender slot → receiver slot. */
export const MAN_ASSIGN: Record<string, string> = {
  lb1: "sl", lb2: "rb", cb1: "wl", cb2: "wr", s: "sr"
};

export const PLAYS: readonly PlayDef[] = [
  /* ---------------- RUN ---------------- */
  {
    id: "power-blast", name: "Power Blast", type: "run", timing: 0,
    runPath: [[0.2, -0.6], [-0.9, 1.5], [-1.2, 5], [-0.4, 10]],
    routes: {
      wl: rt([[-1, 4], [-4, 9]], 1.7, [9, 99]),
      sl: rt([[1, 2], [3, 5]], 1.4, [9, 99]),
      sr: rt([[-1, 2], [-3, 5]], 1.4, [9, 99]),
      wr: rt([[1, 4], [4, 9]], 1.7, [9, 99])
    }
  },
  {
    id: "zone-stretch", name: "Zone Stretch", type: "run", timing: 0,
    runPath: [[3, -1.5], [8.5, -0.4], [12, 1.2], [11, 5], [9, 9]],
    routes: {
      wl: rt([[-2, 5], [-5, 10]], 1.8, [9, 99]),
      sl: rt([[0, 3], [-2, 7]], 1.5, [9, 99]),
      sr: rt([[2, 3], [5, 7]], 1.5, [9, 99]),
      wr: rt([[0, 3], [-2, 8]], 1.6, [9, 99])
    }
  },
  {
    id: "jet-sweep", name: "Jet Sweep", type: "run", timing: 0,
    // carrier = slot "sr" coming in motion
    runPath: [[-6, -1.8], [-15, -0.2], [-21, 1.8], [-18, 6], [-13, 10]],
    routes: {
      wl: rt([[-1, 4], [-3, 9]], 1.7, [9, 99]),
      sl: rt([[1, 3], [4, 6]], 1.4, [9, 99]),
      wr: rt([[-2, 5], [-5, 9]], 1.8, [9, 99])
    }
  },
  {
    id: "draw-trap", name: "Draw Trap", type: "run", timing: 0,
    runPath: [[0, -2.2], [0.4, 1.2], [1.4, 5], [2.4, 9]],
    playAction: 0.9,
    routes: {
      wl: rt([[0, 6], [1, 10]], 1.8, [9, 99]),
      sl: rt([[0, 5], [2, 8]], 1.6, [9, 99]),
      sr: rt([[0, 5], [-2, 8]], 1.6, [9, 99]),
      wr: rt([[0, 6], [-1, 10]], 1.8, [9, 99])
    }
  },
  /* ---------------- SHORT ---------------- */
  {
    id: "quick-slants", name: "Quick Slants", type: "short", timing: 1.15,
    routes: {
      wl: rt([[0, 2.6], [4, 5.5], [8, 8.5]], 1.5, [0.9, 2.2]),
      sl: rt([[0, 2.6], [4, 5.5], [7, 8]], 1.5, [0.9, 2.2]),
      sr: rt([[4, 1.2], [8, 2.4]], 1.2, [0.8, 1.9]),
      wr: rt([[-4, 1.2], [-8, 2.4]], 1.2, [0.8, 1.9]),
      rb: rt([[-3, 0.4], [-6, 1.6]], 1.1, [1.0, 2.4]),
      c: rt([[2, 0.5], [4, 1.4]], 1.0, [1.2, 2.6])
    }
  },
  {
    id: "mesh-crossers", name: "Mesh Crossers", type: "short", timing: 1.9,
    routes: {
      sl: rt([[0, 3.2], [9, 6.4], [17, 9.4]], 2.6, [1.6, 3.2]),
      sr: rt([[0, 3.2], [-9, 6.4], [-17, 9.4]], 2.6, [1.6, 3.2]),
      wl: rt([[0, 8.5], [6.5, 12.5]], 2.6, [2.0, 3.4]),
      wr: rt([[0, 7], [0, 16]], 2.4, [2.2, 3.6]),
      rb: rt([[5, 0.6], [8, 2]], 1.1, [1.0, 2.4]),
      c: rt([[1.5, 0.5], [3, 1.2]], 1.0, [1.4, 2.8])
    }
  },
  {
    id: "stick-flat", name: "Stick Flat", type: "short", timing: 1.6,
    routes: {
      sr: rt([[0, 5], [-1.2, 6.4]], 1.7, [1.3, 2.5]),
      wr: rt([[4, 1.2], [8, 2.4]], 1.2, [0.8, 2.0]),
      sl: rt([[0, 5.5], [4.5, 10.5]], 2.2, [1.8, 3.0]),
      wl: rt([[0, 5.5], [-5, 7.8]], 1.9, [1.4, 2.7]),
      rb: rt([[-4, 0.4], [-7, 1.8]], 1.1, [1.0, 2.4]),
      c: rt([[-1.5, 0.5], [-3, 1.2]], 1.0, [1.4, 2.8])
    }
  },
  {
    id: "speed-out", name: "Speed Out", type: "short", timing: 1.4,
    routes: {
      wr: rt([[0, 5.4], [4.4, 7.4]], 1.6, [1.1, 2.3]),
      wl: rt([[0, 5.4], [-4.4, 7.4]], 1.6, [1.1, 2.3]),
      sr: rt([[0, 4.6], [0.6, 6.4]], 1.5, [1.2, 2.4]),
      sl: rt([[0, 6], [0, 14]], 2.0, [1.6, 2.9]),
      rb: rt([[4, 0.4], [7, 1.6]], 1.1, [1.0, 2.4]),
      c: rt([[2, 0.4], [3.5, 1]], 1.0, [1.4, 2.6])
    }
  },
  /* ---------------- DEEP ---------------- */
  {
    id: "four-verts", name: "Four Verts", type: "deep", timing: 2.6,
    routes: {
      wl: rt([[0, 8], [1, 18], [1.5, 30]], 3.4, [2.2, 4.2]),
      sl: rt([[0, 8], [-1, 18], [-2, 30]], 3.4, [2.2, 4.2]),
      sr: rt([[0, 8], [1, 18], [2, 30]], 3.4, [2.2, 4.2]),
      wr: rt([[0, 8], [-1, 18], [-1.5, 30]], 3.4, [2.2, 4.2]),
      rb: rt([[4, 0.5], [7, 1.8]], 1.2, [1.1, 2.5]),
      c: rt([[1.5, 0.5], [3, 1.1]], 1.0, [1.4, 2.8])
    }
  },
  {
    id: "post-wheel", name: "Post Wheel", type: "deep", timing: 2.9,
    routes: {
      sr: rt([[3.5, 2], [6.5, 7], [4.5, 14], [2.5, 22]], 3.4, [2.6, 4.4]),
      sl: rt([[0, 7.5], [4.5, 14], [8, 21]], 3.2, [2.4, 4.0]),
      wl: rt([[0, 9], [0, 20]], 3.2, [2.4, 4.0]),
      wr: rt([[0, 8.5], [-6.5, 13]], 2.7, [2.1, 3.5]),
      rb: rt([[5, 0.5], [8, 1.8]], 1.2, [1.1, 2.5]),
      c: rt([[-1.5, 0.5], [-3, 1.1]], 1.0, [1.4, 2.8])
    }
  },
  {
    id: "flood-sail", name: "Flood Sail", type: "deep", timing: 2.7,
    routes: {
      wr: rt([[0, 8], [5.5, 15.5]], 3.0, [2.3, 3.8]),
      sr: rt([[4, 1.4], [8.5, 4.4]], 1.6, [1.1, 2.4]),
      wl: rt([[0, 9], [6.5, 13.5]], 2.7, [2.1, 3.5]),
      sl: rt([[0, 9], [0, 20]], 3.2, [2.4, 4.0]),
      rb: rt([[-4, 0.4], [-7, 1.7]], 1.2, [1.1, 2.5]),
      c: rt([[1.5, 0.4], [3, 1]], 1.0, [1.4, 2.8])
    }
  },
  {
    id: "pa-bomb", name: "Play-Action Bomb", type: "deep", timing: 3.1,
    playAction: 1.0,
    routes: {
      sl: rt([[0, 7.5], [4, 14], [7, 22]], 3.4, [2.6, 4.4]),
      wl: rt([[0, 9], [0, 21]], 3.3, [2.5, 4.2]),
      sr: rt([[0, 8.5], [3, 14], [2, 18]], 3.0, [2.4, 3.9]),
      wr: rt([[0, 6], [-7, 10], [-13, 14]], 3.0, [2.4, 3.9]),
      rb: rt([[5, 0.4], [7.5, 1.6]], 1.2, [1.2, 2.6]),
      c: rt([[-1.5, 0.4], [-3, 1]], 1.0, [1.5, 2.8])
    }
  }
];

export const playsByType = (t: PlayType): readonly PlayDef[] => PLAYS.filter((p) => p.type === t);

export const playById = (id: string): PlayDef => PLAYS.find((p) => p.id === id) ?? PLAYS[0]!;

/**
 * Draw the 3-card pre-snap sheet for a club: one run, one short, one deep,
 * sampled (deterministic LCG) inside each type bucket, weighted so a
 * club's identity reorders which card sits where.
 */
export function drawPlaySheet(club: Club, rng: () => number): readonly [PlayDef, PlayDef, PlayDef] {
  const pick = (t: PlayType): PlayDef => {
    const bucket = playsByType(t);
    return bucket[Math.floor(rng() * bucket.length) % bucket.length]!;
  };
  const run = pick("run"), short = pick("short"), deep = pick("deep");
  const [wRun, wShort] = club.callWeights;
  if (club.identity === "smashmouth" || club.identity === "option") return [run, short, deep];
  if (club.identity === "air-raid") return wRun < wShort ? [short, deep, run] : [deep, short, run];
  return [short, run, deep];
}

/** CPU coverage call: weighted shell from the club table + situation nudge. */
export function pickCoverage(club: Club, rng: () => number, opts: { longYards: boolean; lateDown: boolean }): CoverageShell {
  let r = rng();
  let shell: CoverageShell = club.defense[club.defense.length - 1]![0];
  for (const [s, w] of club.defense) {
    r -= w;
    if (r <= 0) { shell = s; break; }
  }
  if (opts.longYards && shell === "blitz" && rng() < 0.5) shell = "cover3";
  if (opts.lateDown && club.identity === "blitz-heavy" && rng() < 0.7) shell = "blitz";
  return shell;
}
