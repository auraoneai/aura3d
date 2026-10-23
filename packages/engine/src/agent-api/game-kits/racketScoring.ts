/**
 * Rally-sport scoring as a pure state machine: points to a game (win by N), games to a match (win by N) and an optional
 * tiebreak. The defaults are tennis as implemented by the Aura Slam port (4 points win by 2, first to 3 games leading by 2,
 * a tiebreak to 7 win by 2 at 3-3), verified point by point against the original simulation. Sides are indices 0 and 1.
 */
export type RacketSide = 0 | 1;

export interface RacketTiebreakRules {
  /** Games each when the tiebreak starts (3 in the Aura Slam match format). */
  readonly atGames: number;
  readonly points: number;
  readonly winBy: number;
}

export interface RacketScoringRules {
  /** Points that win a game once the margin is met (default 4). */
  readonly pointsToGame?: number;
  /** Margin needed to win a game or a tiebreak (default 2). */
  readonly winBy?: number;
  /** Games that can win the match once the margin is met (default 3). */
  readonly gamesToMatch?: number;
  /** Margin needed to win the match on games (default 2). */
  readonly matchWinBy?: number;
  /** Tiebreak rules, or `false` for none (default: at 3-3, first to 7 win by 2). */
  readonly tiebreak?: false | Partial<RacketTiebreakRules>;
}

export interface RacketScoreState {
  readonly points: readonly [number, number];
  readonly games: readonly [number, number];
  readonly tiebreak: boolean;
  /** Who serves the next point. */
  readonly server: RacketSide;
  readonly firstServer: RacketSide;
  readonly tiebreakFirstServer: RacketSide;
  readonly matchWon: boolean;
  readonly winner: RacketSide | null;
}

export interface RacketPointResult {
  readonly state: RacketScoreState;
  readonly gameWon: boolean;
  readonly matchWon: boolean;
  readonly tiebreakStarted: boolean;
}

export interface RacketScoring {
  readonly rules: Readonly<Required<Omit<RacketScoringRules, "tiebreak">> & { tiebreak: false | RacketTiebreakRules }>;
  init(firstServer?: RacketSide): RacketScoreState;
  /** Award one point and resolve game, tiebreak and match. Returns a new state; the input is not modified. */
  awardPoint(state: RacketScoreState, winner: RacketSide): RacketPointResult;
  /** Tennis-style label for one side's points in a game: 0, 15, 30, 40, AD. */
  label(own: number, opponent: number): string;
}

const other = (side: RacketSide): RacketSide => (side === 0 ? 1 : 0);

export function createRacketScoring(rules: RacketScoringRules = {}): RacketScoring {
  const pointsToGame = rules.pointsToGame ?? 4;
  const winBy = rules.winBy ?? 2;
  const gamesToMatch = rules.gamesToMatch ?? 3;
  const matchWinBy = rules.matchWinBy ?? 2;
  const tiebreak: false | RacketTiebreakRules = rules.tiebreak === false ? false : { atGames: 3, points: 7, winBy: 2, ...rules.tiebreak };
  const resolved = Object.freeze({ pointsToGame, winBy, gamesToMatch, matchWinBy, tiebreak });

  return {
    rules: resolved,
    init(firstServer: RacketSide = 0): RacketScoreState {
      return { points: [0, 0], games: [0, 0], tiebreak: false, server: firstServer, firstServer, tiebreakFirstServer: firstServer, matchWon: false, winner: null };
    },
    awardPoint(state: RacketScoreState, winner: RacketSide): RacketPointResult {
      if (state.matchWon) return { state, gameWon: false, matchWon: false, tiebreakStarted: false };
      const points: [number, number] = [state.points[0], state.points[1]];
      const games: [number, number] = [state.games[0], state.games[1]];
      let { server, tiebreak: inTiebreak, tiebreakFirstServer } = state;
      let matchWon: boolean = state.matchWon;
      points[winner] += 1;
      const a = points[winner];
      const b = points[other(winner)];
      let gameWon = false;
      let tiebreakStarted = false;
      if (inTiebreak && tiebreak) {
        if (a >= tiebreak.points && a - b >= tiebreak.winBy) {
          games[winner] += 1;
          matchWon = true;
          gameWon = true;
        } else {
          const turn = Math.floor((a + b + 1) / 2) % 2;
          server = turn === 0 ? tiebreakFirstServer : other(tiebreakFirstServer);
        }
      } else if (a >= pointsToGame && a - b >= winBy) {
        gameWon = true;
        games[winner] += 1;
        points[0] = 0;
        points[1] = 0;
        const totalGames = games[0] + games[1];
        server = totalGames % 2 === 0 ? state.firstServer : other(state.firstServer);
        if ((games[0] >= gamesToMatch || games[1] >= gamesToMatch) && Math.abs(games[0] - games[1]) >= matchWinBy) {
          matchWon = true;
        } else if (tiebreak && games[0] === tiebreak.atGames && games[1] === tiebreak.atGames) {
          inTiebreak = true;
          tiebreakFirstServer = server;
          tiebreakStarted = true;
        }
      }
      const next: RacketScoreState = {
        points, games, tiebreak: inTiebreak, server, firstServer: state.firstServer, tiebreakFirstServer, matchWon,
        winner: matchWon ? (games[0] > games[1] ? 0 : 1) : null,
      };
      return { state: next, gameWon, matchWon, tiebreakStarted };
    },
    label(own: number, opponent: number): string {
      if (own >= pointsToGame - 1 && opponent >= pointsToGame - 1) {
        if (own === opponent) return "40";
        return own > opponent ? "AD" : "40";
      }
      return ["0", "15", "30", "40"][Math.min(own, 3)] ?? "40";
    },
  };
}
