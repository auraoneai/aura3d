/**
 * Red Zone 3D — Gridiron Series: a 32-team single-elimination bracket.
 *
 * The 8 clubs repeat 4× to fill 32 seeds. The user plays their game each
 * round; the other 15 matchups are auto-simmed from club ratings + noise.
 * Bracket state persists to localStorage between sessions.
 */
import type { Club } from "./types";
import { CLUBS, clubById } from "./teams";

const STORAGE_KEY = "redzone3d-series-v1";

export interface SeriesGame {
  a: number;   // seed index into teams[]
  b: number;
  aScore?: number;
  bScore?: number;
  winner?: number; // seed index
}

export interface Series {
  teams: { seed: number; clubId: string; user: boolean }[];
  rounds: SeriesGame[][];          // [round][game] — round 0 has 16 games
  userSeed: number;
  champion?: number;
  createdAt: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export function newSeries(userClubId: string, seed = Date.now() & 0xffff): Series {
  const r = rng(seed);
  // 32 entrants: every club 4×; user occupies one slot
  const pool: string[] = [];
  for (let k = 0; k < 4; k++) for (const c of CLUBS) pool.push(c.id);
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const userSeed = Math.floor(r() * 32);
  pool[userSeed] = userClubId;
  const teams = pool.map((clubId, i) => ({ seed: i + 1, clubId, user: i === userSeed }));
  const firstRound: SeriesGame[] = [];
  for (let i = 0; i < 16; i++) firstRound.push({ a: i * 2, b: i * 2 + 1 });
  return { teams, rounds: [firstRound, [], [], [], []], userSeed, createdAt: Date.now() };
}

function simGame(clubA: Club, clubB: Club, r: () => number): { a: number; b: number } {
  const edge = clubA.rating - clubB.rating;
  const baseA = 17 + edge * 18 + r() * 21;
  const baseB = 17 - edge * 18 + r() * 21;
  let a = Math.max(0, Math.round(baseA / 3) * 3 + (r() < 0.4 ? 1 : 0) * (r() < 0.5 ? 3 : 7));
  let b = Math.max(0, Math.round(baseB / 3) * 3 + (r() < 0.4 ? 1 : 0) * (r() < 0.5 ? 3 : 7));
  if (a === b) a += 3;
  return { a, b };
}

/** Resolve all non-user games in a round; returns the user's opponent seed index. */
export function advanceRound(series: Series, userWonLast: boolean | null): { opponentSeedIdx: number; round: number } | null {
  const r = rng(series.createdAt + series.rounds.findIndex((rd) => rd.length === 0));
  const roundIdx = series.rounds.findIndex((rd) => rd.length === 0 || rd.some((g) => g.winner === undefined));
  const targetRound = roundIdx === -1 ? -1 : roundIdx;

  // find the round where user still needs to play
  let current = 0;
  for (let i = 0; i < series.rounds.length; i++) {
    const rd = series.rounds[i]!;
    if (rd.length === 0) break;
    const userGame = rd.find((g) => g.a === series.userSeed || g.b === series.userSeed);
    if (userGame && userGame.winner === undefined) { current = i; break; }
    if (i === series.rounds.length - 1) { current = i; break; }
    current = i;
  }

  if (userWonLast === false) return null; // user eliminated

  // build the next round once the current is fully decided
  const roundGames = series.rounds[current]!;
  // simulate all non-user games in this round
  for (const g of roundGames) {
    if (g.winner !== undefined) continue;
    const aU = series.teams[g.a]!.user, bU = series.teams[g.b]!.user;
    if (aU || bU) continue; // user's game — played for real
    const res = simGame(clubById(series.teams[g.a]!.clubId), clubById(series.teams[g.b]!.clubId), r);
    g.aScore = res.a; g.bScore = res.b;
    g.winner = res.a > res.b ? g.a : g.b;
  }

  // is the user's game still pending?
  const userGame = roundGames.find((g) => (g.a === series.userSeed || g.b === series.userSeed));
  if (userGame && userGame.winner === undefined) {
    return { opponentSeedIdx: userGame.a === series.userSeed ? userGame.b : userGame.a, round: current };
  }

  // round complete → spawn next round or crown champion
  if (current < 4) {
    const winners = roundGames.map((g) => g.winner!);
    if (!winners.includes(series.userSeed)) return null;
    const next: SeriesGame[] = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ a: winners[i]!, b: winners[i + 1]! });
    series.rounds[current + 1] = next;
    return advanceRound(series, userWonLast);
  }
  // round 4 (final) complete
  const final = roundGames[0]!;
  if (final.winner !== undefined) series.champion = final.winner;
  return null;
}

/** Record the user's real game result, then auto-sim the rest. */
export function reportUserResult(series: Series, round: number, userScore: number, oppScore: number): void {
  const game = series.rounds[round]?.find((g) => g.a === series.userSeed || g.b === series.userSeed);
  if (!game) return;
  const userIsA = game.a === series.userSeed;
  game.aScore = userIsA ? userScore : oppScore;
  game.bScore = userIsA ? oppScore : userScore;
  game.winner = userScore > oppScore ? (userIsA ? game.a : game.b) : (userIsA ? game.b : game.a);
  saveSeries(series);
}

export function userGamePending(series: Series): { opponentSeedIdx: number; round: number } | null {
  for (let i = 0; i < series.rounds.length; i++) {
    const rd = series.rounds[i];
    if (!rd.length) break;
    const g = rd.find((x) => (x.a === series.userSeed || x.b === series.userSeed) && x.winner === undefined);
    if (g) return { opponentSeedIdx: g.a === series.userSeed ? g.b : g.a, round: i };
  }
  return null;
}

export function userAlive(series: Series): boolean {
  if (series.champion !== undefined) return series.champion === series.userSeed;
  for (const rd of series.rounds) {
    for (const g of rd) {
      if ((g.a === series.userSeed || g.b === series.userSeed) && g.winner !== undefined && g.winner !== series.userSeed) return false;
    }
  }
  return true;
}

export function clubOfSeed(series: Series, seedIdx: number): Club {
  return clubById(series.teams[seedIdx]!.clubId);
}

export function roundName(round: number): string {
  return ["WILD CARD", "DIVISIONAL", "CONFERENCE", "SEMI-FINAL", "GRIDIRON BOWL"][round] ?? `ROUND ${round + 1}`;
}

export function saveSeries(s: Series) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function loadSeries(): Series | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Series;
    if (!s || !Array.isArray(s.rounds) || !Array.isArray(s.teams)) return null;
    return s;
  } catch { return null; }
}

export function clearSeries() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
