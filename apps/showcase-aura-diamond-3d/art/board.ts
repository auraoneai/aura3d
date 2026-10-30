/**
 * Aura Diamond 3D outfield scoreboard (GU47 DIA-V2). Pure model and throttle (no engine, no DOM) for the live linescore
 * board drawn on a 2D canvas behind the centre-field bleachers:
 *
 * - `boardModel` turns the read-only game values into the text the board shows (team rows, innings, runs, hits, count,
 *   outs, park name), so the same state always paints the same board.
 * - `BoardThrottle` decides when the canvas repaints: only when the model changed, at most `BOARD_MAX_UPDATES_PER_S`
 *   times a second, plus the HOME RUN animation frames.
 * - `homeRunPhase` is the HOME RUN animation: a 2 s bright gold card; under reduced flash it holds one steady card at a
 *   lower level, with no blinking.
 *
 * Gameplay is untouched: the board only reads values the HUD already shows.
 */

export const BOARD_MAX_UPDATES_PER_S = 4;
/** Seconds the HOME RUN card stays on the board after a home run. */
export const BOARD_HOME_RUN_SECONDS = 2;
/** Canvas size in texels (the board is 10.5 x 3.4 m). */
export const BOARD_CANVAS = { width: 512, height: 166 } as const;

export interface BoardInput {
  readonly parkName: string;
  readonly teams: { readonly away: string; readonly home: string };
  /** Runs per inning, by team; a missing entry is an unplayed inning. */
  readonly linescore: { readonly away: readonly (number | undefined)[]; readonly home: readonly (number | undefined)[] };
  readonly runs: { readonly away: number; readonly home: number };
  readonly hits: { readonly away: number; readonly home: number };
  readonly inning: number;
  readonly inningsTotal: number;
  readonly half: "top" | "bottom";
  readonly balls: number;
  readonly strikes: number;
  readonly outs: number;
}

export interface BoardRow {
  readonly team: string;
  readonly cells: readonly string[];
  readonly runs: string;
  readonly hits: string;
  readonly batting: boolean;
}

export interface BoardModel {
  readonly title: string;
  readonly header: readonly string[];
  readonly rows: readonly [BoardRow, BoardRow];
  readonly count: string;
  /** Stable key of everything drawn; the board repaints only when it changes. */
  readonly key: string;
}

const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** The board's text for one game state. Shows up to nine innings (the last nine once a game goes long). */
export function boardModel(input: BoardInput): BoardModel {
  const cols = clampInt(Math.max(3, input.inningsTotal, input.inning), 3, 99);
  const first = Math.max(0, cols - 9);
  const shown = Array.from({ length: Math.min(9, cols) }, (_, i) => first + i);
  const row = (side: "away" | "home"): BoardRow => ({
    team: input.teams[side].slice(0, 4).toUpperCase(),
    cells: shown.map((i) => {
      const v = input.linescore[side][i];
      return v === undefined ? "" : String(clampInt(v, 0, 99));
    }),
    runs: String(clampInt(input.runs[side], 0, 99)),
    hits: String(clampInt(input.hits[side], 0, 99)),
    batting: side === "away" ? input.half === "top" : input.half === "bottom"
  });
  const rows: [BoardRow, BoardRow] = [row("away"), row("home")];
  const count = `B ${clampInt(input.balls, 0, 3)}  S ${clampInt(input.strikes, 0, 2)}  O ${clampInt(input.outs, 0, 3)}`;
  const title = input.parkName.toUpperCase();
  const header = shown.map((i) => String(i + 1));
  const key = [title, header.join(","), ...rows.map((r) => `${r.team}|${r.cells.join(",")}|${r.runs}|${r.hits}|${r.batting ? 1 : 0}`), count].join("/");
  return { title, header, rows, count, key };
}

/** HOME RUN card level 0..1 at `t` seconds after the home run (0 outside the 2 s window). */
export function homeRunPhase(t: number, reducedFlash = false): number {
  if (!(t >= 0) || t >= BOARD_HOME_RUN_SECONDS) return 0;
  if (reducedFlash) return 0.6;
  // Two soft pulses over the 2 s, never below 0.55 so the card stays readable: no strobing.
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((t / BOARD_HOME_RUN_SECONDS) * Math.PI * 4));
}

/**
 * Repaint gate: `due(now, key, hrLevel)` is true when the board must repaint, at most `BOARD_MAX_UPDATES_PER_S` times a
 * second; call `painted(now, key, hrLevel)` after drawing.
 */
export class BoardThrottle {
  private lastAt = -Infinity;
  private lastKey = "";
  private lastHr = -1;

  due(now: number, key: string, hrLevel: number): boolean {
    if (now - this.lastAt < 1 / BOARD_MAX_UPDATES_PER_S) return false;
    return key !== this.lastKey || Math.abs(hrLevel - this.lastHr) > 0.02;
  }

  painted(now: number, key: string, hrLevel: number): void {
    this.lastAt = now;
    this.lastKey = key;
    this.lastHr = hrLevel;
  }
}

/** Minimal 2D context surface the painter uses (a real CanvasRenderingContext2D satisfies it). */
export interface BoardPainter {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface BoardColors {
  /** Park accent (title bar and batting marker). */
  readonly accent: string;
  /** Font stack (licensed faces only). */
  readonly font: string;
}

/** Paint one board frame: the linescore, or the HOME RUN card over it while `hrLevel > 0`. */
export function paintBoard(ctx: BoardPainter, model: BoardModel, colors: BoardColors, hrLevel: number): void {
  const { width: W, height: H } = BOARD_CANVAS;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0a1410";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, W, 30);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0a1410";
  ctx.font = `600 20px ${colors.font}`;
  ctx.textAlign = "left";
  ctx.fillText(model.title, 12, 16);
  ctx.textAlign = "right";
  ctx.fillText(model.count, W - 12, 16);

  const x0 = 96;
  const colW = Math.min(30, (W - x0 - 96) / Math.max(1, model.header.length));
  const rTx = W - 76;
  const hTx = W - 30;
  ctx.font = `400 16px ${colors.font}`;
  ctx.fillStyle = "#9fb3a8";
  ctx.textAlign = "center";
  model.header.forEach((h, i) => ctx.fillText(h, x0 + colW * (i + 0.5), 48));
  ctx.fillText("R", rTx, 48);
  ctx.fillText("H", hTx, 48);

  model.rows.forEach((row, r) => {
    const y = 84 + r * 40;
    if (row.batting) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(4, y - 14, 6, 28);
    }
    ctx.font = `600 24px ${colors.font}`;
    ctx.fillStyle = "#f2eedd";
    ctx.textAlign = "left";
    ctx.fillText(row.team, 18, y);
    ctx.textAlign = "center";
    ctx.font = `400 22px ${colors.font}`;
    row.cells.forEach((c, i) => ctx.fillText(c, x0 + colW * (i + 0.5), y));
    ctx.font = `600 24px ${colors.font}`;
    ctx.fillStyle = "#ffd76a";
    ctx.fillText(row.runs, rTx, y);
    ctx.fillStyle = "#f2eedd";
    ctx.fillText(row.hits, hTx, y);
  });

  if (hrLevel > 0) {
    ctx.globalAlpha = Math.min(1, 0.35 + hrLevel * 0.65);
    ctx.fillStyle = "#ffcf4a";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1206";
    ctx.textAlign = "center";
    ctx.font = `600 64px ${colors.font}`;
    ctx.fillText("HOME RUN", W / 2, H / 2 + 4);
  }
}
