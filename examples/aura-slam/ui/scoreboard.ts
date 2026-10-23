import type { Side } from "../contract";
import { byId } from "./dom";
import { pointLabel } from "./format";
import type { HudState, ScoreboardNames } from "./types";

export interface ScoreboardView {
  format: "first-to-three-games";
  game: number;
  status: string;
  names: ScoreboardNames;
  server: Side | null;
  winner: Side | null;
  complete: boolean;
  pointsHeading: "POINTS";
  gameLabel: string;
  formatLabel: string;
  points: { player: string; ai: string };
}

/** game.js `scoreboardState`, with the online-room branches dropped (Phase 2). */
export function scoreboardState(state: HudState, names: ScoreboardNames): ScoreboardView {
  const s = state.score;
  const ended = state.matchWon || state.mode === "gameover";
  const game = s.playerGames + s.aiGames + (ended ? 0 : 1);
  const winner: Side | null = ended ? (state.winner ?? (state.matchWon ? (s.playerGames > s.aiGames ? "player" : "ai") : null)) : null;
  let status = "IN PLAY";
  if (ended) status = "MATCH COMPLETE";
  else if (state.paused) status = "PAUSED";
  else if (state.phase === "point") status = state.tiebreak ? "TIEBREAK" : state.lastCall.startsWith("GAME") ? "GAME WON" : "POINT";
  else {
    const leader: Side | null = s.playerPoints > s.aiPoints ? "player" : s.aiPoints > s.playerPoints ? "ai" : null;
    const a = Math.max(s.playerPoints, s.aiPoints);
    const b = Math.min(s.playerPoints, s.aiPoints);
    const gamePoint = a >= 3 && a > b;
    const leaderGames = leader === "player" ? s.playerGames : s.aiGames;
    const otherGames = leader === "player" ? s.aiGames : s.playerGames;
    if ((state.tiebreak && a >= 6 && a > b) || (!state.tiebreak && gamePoint && leaderGames + 1 >= 3 && leaderGames + 1 - otherGames >= 2)) {
      status = "MATCH POINT";
    } else if (state.tiebreak) status = "TIEBREAK";
    else if (s.playerPoints >= 3 && s.playerPoints === s.aiPoints) status = "DEUCE";
    else if (gamePoint && leader !== state.server) status = "BREAK POINT";
    else if (s.playerPoints >= 3 && s.aiPoints >= 3 && leader) status = "ADVANTAGE";
    else if (state.phase === "serve" || state.phase === "serveToss") status = state.serveNumber === 2 ? "2ND SERVE" : "1ST SERVE";
  }
  return {
    format: "first-to-three-games", game, status, names: { ...names }, server: ended ? null : state.server, winner,
    complete: Boolean(ended), pointsHeading: "POINTS",
    gameLabel: ended ? status : state.tiebreak ? "TIEBREAK" : `GAME ${game}`,
    formatLabel: ended ? "GAMES WON" : state.tiebreak ? "FIRST TO 7 POINTS · WIN BY 2" : "FIRST TO 3 GAMES · WIN BY 2",
    points: {
      player: ended && !state.tiebreak ? "–" : state.tiebreak ? String(s.playerPoints) : pointLabel(s.playerPoints, s.aiPoints),
      ai: ended && !state.tiebreak ? "–" : state.tiebreak ? String(s.aiPoints) : pointLabel(s.aiPoints, s.playerPoints)
    }
  };
}

/** The screen-reader sentence the original writes into `#hud-score-announcement`. */
export function scoreAnnouncement(state: HudState, board: ScoreboardView): string {
  const names = board.names;
  const serving = board.server ? ` ${names[board.server]} serving.` : "";
  const winner = board.winner ? ` ${names[board.winner]} wins.` : "";
  return `${board.gameLabel}. ${names.player}: ${state.score.playerGames} games, ${board.points.player} points. ` +
    `${names.ai}: ${state.score.aiGames} games, ${board.points.ai} points. ${board.status}.${serving}${winner}`;
}

export function renderScoreboard(state: HudState, names: ScoreboardNames, text: (id: string, v: string | number) => void): ScoreboardView {
  const board = scoreboardState(state, names);
  byId("scoreboard").classList.toggle("complete", board.complete);
  text("hud-game-label", board.gameLabel);
  text("hud-points-heading", board.pointsHeading);
  text("hud-score-status", board.status);
  text("hud-score-format", board.formatLabel);
  for (const [side, id] of [["player", "you"], ["ai", "cpu"]] as const) {
    text(`hud-${id}-label`, names[side]);
    byId(`hud-${id}-label`).title = names[side];
    text(`hud-${id}-games`, state.score[side === "player" ? "playerGames" : "aiGames"]);
    text(`hud-${id}-points`, board.points[side]);
    const row = byId(`hud-${id}-row`);
    row.classList.toggle("serving", board.server === side);
    row.classList.toggle("winner", board.winner === side);
    byId(`hud-${id}-serve`).hidden = board.server !== side;
  }
  text("hud-score-announcement", scoreAnnouncement(state, board));
  return board;
}
