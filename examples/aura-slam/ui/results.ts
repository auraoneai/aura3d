import type { HudState, ScoreboardNames } from "./types";

/** Presentation of match statistics (match-results.js): shared by the results card and `render_game_to_text`. */
export interface MatchResultRow { key: string; label: string; player: string; ai: string }
export interface MatchResultsModel { names: ScoreboardNames; rows: MatchResultRow[]; summary: string }

interface ServeAgg {
  aces?: number; doubleFaults?: number; firstIn?: number; firstAttempts?: number; pointsWon?: number; pointsPlayed?: number;
  fastest?: number; speedCount?: number; speedTotal?: number;
}
interface StatsLike { pointsWon?: number; pointsLost?: number; longestRally?: number; fastestShot?: number; serve?: ServeAgg }

const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: unknown): string => (valid(value) ? String(Math.round(value)) : "—");
const speed = (value: unknown): string => (valid(value) && value > 0 ? `${Math.round(value)} km/h` : "—");
const ratio = (won: unknown, total: unknown): string =>
  valid(won) && valid(total) && total > 0 ? `${Math.round((100 * won) / total)}% (${won}/${total})` : "—";
const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function summarizeMatch(state: Pick<HudState, "player" | "ai"> & { stats?: StatsLike }, names: Partial<ScoreboardNames> = {}): MatchResultsModel {
  const personal: StatsLike = state.stats ?? {};
  const player: StatsLike = (state.player as { stats?: StatsLike } | undefined)?.stats ?? personal;
  const ai: StatsLike = (state.ai as { stats?: StatsLike } | undefined)?.stats ?? { pointsWon: personal.pointsLost };
  const players = [player, ai];
  const serves = players.map((stats) => stats.serve);
  const rows: MatchResultRow[] = [];
  const add = (key: string, label: string, values: string[]): void => { rows.push({ key, label, player: values[0] as string, ai: values[1] as string }); };
  add("pointsWon", "Points won", players.map((stats) => count(stats.pointsWon)));
  if (serves.some(Boolean)) {
    add("aces", "Aces", serves.map((stats) => count(stats?.aces)));
    add("doubleFaults", "Double faults", serves.map((stats) => count(stats?.doubleFaults)));
    add("firstServeIn", "First serves in", serves.map((stats) => ratio(stats?.firstIn, stats?.firstAttempts)));
    add("servePointsWon", "Service points won", serves.map((stats) => ratio(stats?.pointsWon, stats?.pointsPlayed)));
    add("returnPointsWon", "Return points won", [serves[1], serves[0]].map((stats) =>
      stats ? ratio((stats.pointsPlayed ?? 0) - (stats.pointsWon ?? 0), stats.pointsPlayed) : "—"));
    add("fastestServe", "Fastest serve", serves.map((stats) => speed(stats?.fastest)));
    add("averageServe", "Average serve", serves.map((stats) => speed((stats?.speedCount ?? 0) > 0 ? (stats?.speedTotal ?? 0) / (stats?.speedCount ?? 1) : null)));
  }
  add("fastestShot", "Fastest shot", players.map((stats) => speed(stats.fastestShot)));
  const rally = Math.max(...[personal.longestRally, player.longestRally, ai.longestRally].filter(valid), 0);
  return {
    names: { player: names.player || "Player", ai: names.ai || "Opponent" }, rows,
    summary: `Longest rally · ${rally} ${rally === 1 ? "shot" : "shots"}`
  };
}

const presentations = new WeakMap<Element, MatchResultsModel>();

export function renderMatchResults(container: HTMLElement | null, state: HudState, names: ScoreboardNames): MatchResultsModel | null {
  if (!container) return null;
  const model = summarizeMatch(state, names);
  presentations.set(container, model);
  container.innerHTML =
    `<table class="match-stats-table"><caption class="sr-only">Match statistics for both players</caption><thead><tr>` +
    `<th scope="col">${escapeHtml(model.names.player)}</th><th scope="col">Match stats</th><th scope="col">${escapeHtml(model.names.ai)}</th></tr></thead>` +
    `<tbody>${model.rows.map((row) => `<tr data-stat="${row.key}"><td>${escapeHtml(row.player)}</td><th scope="row">${row.label}</th><td>${escapeHtml(row.ai)}</td></tr>`).join("")}</tbody></table>` +
    `<p class="match-result-summary">${model.summary}</p>`;
  container.hidden = false;
  return model;
}

export const readMatchResults = (container: Element | null): MatchResultsModel | null => (container ? presentations.get(container) ?? null : null);
