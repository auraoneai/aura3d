/**
 * DOM user interface for Cumulus Dash, created entirely from script (the live wrapper pages duplicate only the
 * canvas and a `#hud` node): title screen, HUD (hearts, distance, sky pearls, cloud gauge, score, combo), danger
 * prompts, toasts, the rock-paper-scissors duel banner, pause, results, finale caption and touch controls.
 * Dense type scale, Regular/Medium weights, one Semibold title.
 */
import type { Chapter } from "./chapter";
import { FINALE_SECONDS, type Difficulty, type Game } from "./game";

export interface UiHandlers {
  play(): void; retry(): void; menu(): void; pause(): void; resume(): void; restart(): void; toggleSound(): boolean;
  /** Flip reduced motion (no camera shake, soft flashes, no hit blink); returns the new state. */
  toggleMotion(): boolean;
  /** Flip Normal / Easy on the title screen; returns the new difficulty. */
  toggleDifficulty(): Difficulty;
  touch(key: "left" | "right" | "jump" | "pole" | "cloud", down: boolean): void;
}

/** Menu and result options the UI shows; `main.ts` owns the values and persists them. */
export interface UiOptions { soundOn: boolean; reducedMotion: boolean; difficulty: Difficulty; best: number; bestTime: number; bestPearls: number; /** CD-19: parchment-and-sandstone HUD in the licensed sky-expedition face (storm-washed look). */ storm?: boolean }

/**
 * Prompt, hint and toast text for the current input mode. The sim and encounter layers write keyboard text; on a touch
 * screen (coarse pointer) the same text names the on-screen buttons instead.
 */
export function forInput(text: string, touch: boolean): string {
  if (!touch || !text) return text;
  return text
    .replace(/← → OR A D TO STEER/g, "TAP ◀ ▶ TO STEER")
    .replace(/\bPRESS E\b/g, "TAP STAFF")
    .replace(/^SPACE$/g, "TAP JUMP")
    .replace(/\bSPACE\b/g, "JUMP")
    .replace(/^Q · /, "TAP CLOUD · ")
    .replace(/\bpress Q\b/g, "tap cloud");
}

/** Phases that show the in-play HUD (hearts, pearls, progress, score, gauge, combo, toast). The finale is a cutscene. */
export function hudVisible(phase: Game["phase"]): boolean { return phase !== "menu" && phase !== "finale"; }

/** Strength of the full-screen flash: capped lower when reduced motion is on. */
export function flashOpacity(k: number | undefined, reducedMotion: boolean): number { return k ? Math.min(reducedMotion ? 0.15 : 0.6, k) : 0; }

/** The result card's main button: a fresh run after a win, the last checkpoint after a loss. */
export function retryLabel(won: boolean): string { return won ? "Run again" : "Continue from checkpoint"; }

const clock = (t: number): string => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
const RING_CIRC = 144.5;

const CSS = `
#cr-ui{position:fixed;inset:0;pointer-events:none;font-family:var(--font-ui,"Whitney","Whitney Fallback","Graphik",sans-serif);font-synthesis:none;font-weight:400;font-variant-numeric:tabular-nums;color:#fffaf0;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;overflow:hidden}
#cr-ui *{box-sizing:border-box}
#cr-ui .scr{position:absolute;inset:0;display:none}
#cr-ui .scr.on{display:block}
#cr-ui .glass{background:rgba(10,16,30,.76);backdrop-filter:blur(10px) saturate(135%);-webkit-backdrop-filter:blur(10px) saturate(135%);border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 26px rgba(2,6,16,.42);border-radius:10px}
#cr-ui button{pointer-events:auto;font:inherit;font-weight:500;font-size:14px;line-height:1;cursor:pointer;border:0;border-radius:10px;padding:0 18px;height:36px;color:#2a1a08;background:#fff1cf;box-shadow:0 2px 0 rgba(0,0,0,.25);transition:transform .08s,filter .12s}
#cr-ui button:hover{filter:brightness(1.06);transform:translateY(-1px)}
#cr-ui button.primary{background:linear-gradient(#ffd75e,#f7a928);height:44px;padding:0 30px;font-size:15px;font-weight:600;letter-spacing:0}
#cr-ui button.ghost{background:rgba(10,16,30,.68);color:#fffaf0;box-shadow:none;border:1px solid rgba(255,255,255,.22)}
#cr-ui .title{position:absolute;left:5vw;top:calc(8vh + var(--a3d-bar-space,0px));max-width:min(520px,88vw)}
#cr-ui .title h1{margin:0;font-weight:600;font-size:clamp(34px,6.2vw,68px);line-height:1.04;letter-spacing:0;color:#fff7e2;text-shadow:0 3px 0 #b9631b,0 6px 18px rgba(0,0,0,.35)}
#cr-ui .title h1 span{display:block;font-size:max(13px,.38em);font-variant-caps:all-small-caps;letter-spacing:.06em;color:#ffd75e;text-shadow:0 2px 6px rgba(0,0,0,.45);font-weight:500}
#cr-ui .title p{margin:10px 0 0;font-size:15px;line-height:1.45;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5);max-width:34ch}
#cr-ui .menu{position:absolute;left:5vw;bottom:13vh;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
#cr-ui .menu .row{display:flex;flex-wrap:wrap;gap:10px;max-width:90vw}
#cr-ui .keys{position:absolute;left:5vw;bottom:4vh;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:#fff;text-shadow:0 1px 5px rgba(0,0,0,.6)}
#cr-ui kbd{display:inline-block;min-width:22px;padding:2px 6px;margin-right:4px;text-align:center;font-family:var(--font-mono,"Monument Grotesk Mono",monospace);font-weight:400;font-size:12px;color:#2a1a08;background:#fff1cf;border-radius:5px;box-shadow:0 1px 0 rgba(0,0,0,.35)}
#cr-ui .best{font-size:13px;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 1px 5px rgba(0,0,0,.6)}
#cr-ui .credit{position:absolute;right:14px;bottom:10px;font-size:12px;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:.04em;color:rgba(255,255,255,.76);text-shadow:0 1px 4px rgba(0,0,0,.5)}
#cr-ui:not(.coarse) .credit{top:var(--a3d-bar-space,12px);bottom:auto}
#cr-ui .hud-top{position:absolute;left:max(14px,env(safe-area-inset-left,0px));right:max(14px,env(safe-area-inset-right,0px));top:var(--a3d-bar-space,calc(12px + env(safe-area-inset-top,0px)));display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#cr-ui .left{display:flex;gap:10px;align-items:flex-start}
#cr-ui .pausebtn{width:44px;height:44px;padding:0;border-radius:12px;font-size:13px;letter-spacing:-2px;color:#3a2410;background:#fff4dc;box-shadow:0 3px 0 rgba(0,0,0,.3);flex:0 0 auto}
#cr-ui .stack{display:flex;flex-direction:column;gap:5px}
#cr-ui .hearts{display:flex;gap:4px;padding:1px 0}
#cr-ui .heart{width:24px;height:22px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.4))}
#cr-ui .heart.off path{fill:rgba(255,255,255,.22)}
#cr-ui .pearl-row{display:flex;align-items:center;gap:7px;padding:3px 8px;border-radius:999px;background:rgba(10,16,30,.72);border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#cr-ui .pcount{font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-weight:500;font-size:13px;line-height:1;font-variant-numeric:tabular-nums;color:#ffe59b}
#cr-ui .prog{flex:1;max-width:480px;margin-top:8px;height:32px;position:relative;padding-right:42px}
#cr-ui .prog .bar{position:absolute;left:0;right:42px;top:13px;height:6px;border-radius:3px;background:rgba(10,16,30,.72);border:1px solid rgba(255,255,255,.24);overflow:hidden}
#cr-ui .prog .fill{height:100%;width:0;background:linear-gradient(90deg,#ffe27a,#f7a928)}
#cr-ui .prog .tick{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.45)}
#cr-ui .prog .tick.hit{background:#ffe27a}
#cr-ui .prog .me{position:absolute;top:9px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff3c0;border:2px solid #f7a928;box-shadow:0 0 8px rgba(255,226,122,.9)}
#cr-ui .prog .dist{position:absolute;right:0;top:7px;font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-weight:500;font-size:13px;line-height:1.2;font-variant-numeric:tabular-nums;color:#eef3fa;text-shadow:0 1px 4px rgba(0,0,0,.65)}
#cr-ui .right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
#cr-ui .score-card{display:flex;flex-direction:column;align-items:flex-end;padding:6px 12px;min-width:96px}
#cr-ui .score-lbl{font-family:var(--font-ui,"Whitney",sans-serif);font-size:12px;font-weight:500;line-height:1;font-variant-caps:all-small-caps;letter-spacing:.04em;color:#a9b8ce}
#cr-ui .score{font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-weight:500;font-style:normal;font-size:clamp(22px,3vw,32px);line-height:1.05;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:#fffaf2}
#cr-ui .orbs{display:flex;gap:4px;padding:0;align-items:center}
#cr-ui .orb{width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-size:10px;font-weight:500;line-height:14px;text-align:center;color:transparent}
#cr-ui .orb.got{background:radial-gradient(circle at 35% 30%,#ffe9a8,#f58a1f 70%);border-color:#ffd27a;color:#7a1c0c;box-shadow:0 0 8px rgba(255,170,60,.8)}
#cr-ui .gauge{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));width:min(320px,68vw);padding:7px 14px;display:flex;align-items:center;gap:10px}
#cr-ui .gauge small{font-family:var(--font-ui,"Whitney",sans-serif);font-size:12px;font-variant-caps:all-small-caps;letter-spacing:.04em;font-weight:500;color:#eef3fa;white-space:nowrap}
#cr-ui .gauge .gb{flex:1}
#cr-ui .gauge .gbar{height:7px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden}
#cr-ui .gauge .gfill{height:100%;width:0;background:linear-gradient(90deg,#fff3c0,#ffd75e)}
#cr-ui .gauge.ready{box-shadow:0 0 0 2px #ffe27a,0 0 18px rgba(255,226,122,.7)}
#cr-ui .combo{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:calc(var(--a3d-bar-space,12px) + 66px);display:flex;align-items:baseline;gap:5px;padding:4px 10px;border-radius:999px;background:rgba(10,16,30,.74);border:1px solid rgba(255,226,122,.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:13px;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:.04em;color:#ffe27a;opacity:0;transition:opacity .2s}
#cr-ui .combo b{font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-size:19px;font-weight:500;font-variant-caps:normal;font-variant-numeric:tabular-nums;color:#fff7d6}
#cr-ui .combo.on{opacity:1}
#cr-ui .prompt{position:absolute;left:50%;top:24%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .12s;pointer-events:none;max-width:min(480px,90vw)}
#cr-ui .prompt.on{opacity:1}
#cr-ui .prompt .tag{display:inline-block;padding:3px 12px;border-radius:6px;background:#d9341f;color:#fff;font-weight:500;font-size:12px;font-variant-caps:all-small-caps;letter-spacing:.05em}
#cr-ui .prompt .ttl{margin-top:6px;font-size:clamp(20px,3.2vw,32px);font-weight:600;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.45),0 0 18px rgba(0,0,0,.35)}
#cr-ui .prompt .help{margin-top:3px;font-size:13px;font-weight:500;color:#ffe27a;text-shadow:0 1px 6px rgba(0,0,0,.6)}
#cr-ui .toast{position:absolute;left:50%;bottom:max(11%,68px);transform:translateX(-50%);padding:8px 16px;font-size:13px;line-height:1.35;opacity:0;transition:opacity .2s;text-align:center;max-width:min(540px,90vw)}
#cr-ui .toast.on{opacity:1}
#cr-ui .danger{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(220,40,20,0);transition:box-shadow .1s}
#cr-ui .flash{position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0}
#cr-ui .duel{position:absolute;left:0;right:0;top:28%;text-align:center;font-weight:600;font-size:clamp(40px,9vw,104px);color:#fff;text-shadow:0 4px 0 #c0391f,0 0 26px rgba(255,170,40,.8);opacity:0;pointer-events:none;letter-spacing:.02em}
#cr-ui .duel.on{opacity:1}
#cr-ui .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:22px 26px;min-width:min(420px,92vw);max-height:calc(100% - 20px);overflow-y:auto;text-align:center}
#cr-ui .panel h2{margin:0 0 4px;font-weight:600;font-size:24px}
#cr-ui .panel .sub{font-size:13px;color:#cbd5e4;margin-bottom:14px}
#cr-ui .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 14px}
#cr-ui .stats div{padding:8px 6px;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}
#cr-ui .stats b{display:block;font-family:var(--font-metric,"DIN Pro","Whitney",sans-serif);font-weight:500;font-size:18px;line-height:1.15;font-variant-numeric:tabular-nums;color:#fffaf2}
#cr-ui .stats small{display:block;margin-top:2px;font-size:12px;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:.03em;color:#a9b8ce}
#cr-ui .panel .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
#cr-ui .panel .orbs{justify-content:center;background:none;border:0;padding:0}
#cr-ui .badge{display:inline-block;margin:4px 2px 0;padding:3px 10px;border-radius:999px;background:#ffd75e;color:#3d2204;font-size:12px;font-weight:500}
#cr-ui .caption{position:absolute;left:0;right:0;bottom:14%;text-align:center;font-size:clamp(18px,2.6vw,26px);font-weight:500;text-shadow:0 2px 12px rgba(0,0,0,.7);opacity:0;transition:opacity .6s}
#cr-ui.storm[data-expedition-font]{font-family:"A3G Roobert","Whitney","Graphik",sans-serif}
#cr-ui.storm .glass{background:rgba(28,18,14,.78);border-color:rgba(255,226,184,.28)}
#cr-ui.storm button.primary{background:linear-gradient(#ffc56e,#ffb347)}
#cr-ui.storm .title h1 span,#cr-ui.storm .combo{color:#ffb347}
#cr-ui.storm .title h1{text-shadow:0 3px 0 #8f4722,0 6px 18px rgba(0,0,0,.4)}
#cr-ui.storm .orb.got{background:radial-gradient(circle at 35% 30%,#ffe2b8,#ffb347 70%);border-color:#ffe2b8;color:#6a3010;box-shadow:0 0 8px rgba(255,179,71,.85)}
#cr-ui.storm .prog .fill,#cr-ui.storm .gauge .gfill{background:linear-gradient(90deg,#ffe2b8,#ffb347)}
#cr-ui.storm .prog .me{border-color:#ffb347}
#cr-ui.storm .touch button .cring circle{stroke:#ffb347}
#cr-ui .caption.on{opacity:1}
#cr-ui .bars{position:absolute;left:0;right:0;height:9vh;background:#000;transition:transform .6s}
#cr-ui .bars.t{top:0;transform:translateY(-100%)}#cr-ui .bars.b{bottom:0;transform:translateY(100%)}
#cr-ui .bars.on.t,#cr-ui .bars.on.b{transform:none}
#cr-ui .touch{position:absolute;inset:auto 0 0 0;height:168px;display:none;pointer-events:none}
#cr-ui.coarse .touch{display:block}
#cr-ui.coarse .keys,#cr-ui.coarse .gauge kbd{display:none}
#cr-ui .touch button{position:absolute;display:flex;align-items:center;justify-content:center;width:58px;height:58px;min-width:48px;min-height:48px;border-radius:50%;padding:0;background:rgba(10,16,30,.74);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fffaf2;border:1.5px solid rgba(255,255,255,.38);box-shadow:0 6px 18px rgba(0,0,0,.36);font-family:var(--font-ui,"Whitney",sans-serif);font-size:12px;font-weight:500;font-variant-caps:all-small-caps;letter-spacing:.03em;touch-action:none}
#cr-ui .touch button.steer{font-size:15px;font-variant-caps:normal}
#cr-ui .touch button:active{transform:scale(.95);background:rgba(255,226,122,.28)}
#cr-ui .touch button[data-t="left"]{left:max(14px,env(safe-area-inset-left,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px))}
#cr-ui .touch button[data-t="right"]{left:calc(max(14px,env(safe-area-inset-left,0px)) + 72px);bottom:calc(20px + env(safe-area-inset-bottom,0px))}
#cr-ui .touch button[data-t="jump"]{right:max(14px,env(safe-area-inset-right,0px));bottom:calc(20px + env(safe-area-inset-bottom,0px));width:68px;height:68px;font-size:13px;font-weight:600;background:linear-gradient(180deg,rgba(255,215,94,.34),rgba(247,169,40,.26));border-color:rgba(255,226,122,.68)}
#cr-ui .touch button[data-t="cloud"]{right:calc(max(14px,env(safe-area-inset-right,0px)) + 82px);bottom:calc(20px + env(safe-area-inset-bottom,0px));width:54px;height:54px}
#cr-ui .touch button[data-t="pole"]{right:calc(max(14px,env(safe-area-inset-right,0px)) + 52px);bottom:calc(92px + env(safe-area-inset-bottom,0px));width:54px;height:54px}
#cr-ui .touch button .cring{position:absolute;inset:-2px;width:calc(100% + 4px);height:calc(100% + 4px);transform:rotate(-90deg);pointer-events:none}
#cr-ui .touch button .cring circle{fill:none;stroke:#ffd75e;stroke-width:3;stroke-linecap:round;stroke-dasharray:144.5;stroke-dashoffset:144.5;transition:stroke-dashoffset .12s linear}
#cr-ui .touch button[data-t="cloud"].ready{border-color:#ffe27a;box-shadow:0 0 0 2px rgba(255,226,122,.65),0 0 18px rgba(255,215,94,.65)}
#cr-ui .hud-top,#cr-ui .gauge,#cr-ui .combo,#cr-ui .toast,#cr-ui .prompt{transition:opacity .4s}
#cr-ui .scr.fin .hud-top,#cr-ui .scr.fin .gauge,#cr-ui .scr.fin .combo,#cr-ui .scr.fin .toast,#cr-ui .scr.fin .prompt,#cr-ui .scr.fin .touch{opacity:0 !important;pointer-events:none}
#cr-ui .loading .fail{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:min(520px,88vw);text-align:center;letter-spacing:0;font-variant-caps:normal}
#cr-ui .loading .fail small{font-size:12px;opacity:.85;word-break:break-word}
#cr-ui .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(#5f95c9,#c6dce9);font-size:14px;font-weight:500;font-variant-caps:all-small-caps;color:#fff;letter-spacing:.06em;transition:opacity .5s}
@media (pointer:coarse),(max-width:760px){
#cr-ui button{min-width:44px;min-height:44px;touch-action:manipulation}
}
@media (pointer:coarse),(max-width:640px){
#cr-ui .hud-top{left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));flex-wrap:wrap;row-gap:8px;column-gap:8px}
#cr-ui .left{gap:8px}
#cr-ui .heart{width:20px;height:18px}
#cr-ui .orb{width:14px;height:14px;font-size:9px;line-height:12px}
#cr-ui .pearl-row{padding:2px 7px;gap:5px}
#cr-ui .score-card{padding:5px 10px;min-width:84px}
#cr-ui .score{font-size:21px}
#cr-ui .prog{order:3;flex:0 0 100%;max-width:none;margin-top:0;height:22px;padding-right:38px}
#cr-ui .prog .bar{right:38px;top:8px}
#cr-ui .prog .me{top:4px}
#cr-ui .prog .dist{top:2px;font-size:12px}
#cr-ui .gauge{top:calc(var(--a3d-bar-space,calc(12px + env(safe-area-inset-top,0px))) + 88px);bottom:auto;width:min(232px,64vw);padding:5px 11px;gap:8px}
#cr-ui .gauge kbd{display:none}
#cr-ui .combo{top:calc(var(--a3d-bar-space,calc(12px + env(safe-area-inset-top,0px))) + 126px);right:max(12px,env(safe-area-inset-right,0px))}
#cr-ui .toast{bottom:calc(162px + env(safe-area-inset-bottom,0px))}
#cr-ui .touch{ display:block }
}
@media (max-height:520px){#cr-ui .title{top:5vh}#cr-ui .menu{bottom:16vh}}
@media (max-height:420px){#cr-ui .panel{padding:10px 18px}#cr-ui .panel h2{font-size:20px;margin:0}#cr-ui .panel .sub{margin-bottom:6px}#cr-ui .stats{gap:4px;margin:6px 0 8px}#cr-ui .stats div{padding:3px 4px}#cr-ui .stats b{font-size:15px}#cr-ui .stats small{font-size:11px}#cr-ui .panel .btns{margin-top:8px}}
`;

const HEART = '<svg class="heart" viewBox="0 0 24 22"><path fill="#ff5a4a" d="M12 21s-9-5.6-9-12.2C3 5.2 5.3 3 8 3c1.8 0 3.4 1 4 2.4C12.6 4 14.2 3 16 3c2.7 0 5 2.2 5 5.8C21 15.4 12 21 12 21z"/></svg>';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class Ui {
  readonly root = el("div");
  private screens: Record<"loading" | "menu" | "hud" | "pause" | "result", HTMLElement>;
  private q: Record<string, HTMLElement> = {};
  private last: Record<string, string | number> = {};
  private soundOn = true;
  private reducedMotion = false;
  private difficulty: Difficulty = "normal";
  private readonly touchMode: boolean;
  private ticks: { el: HTMLElement; at: number }[] = [];
  private failed = false;

  constructor(private readonly ch: Chapter, private readonly handlers: UiHandlers, opts: UiOptions) {
    this.soundOn = opts.soundOn;
    this.reducedMotion = opts.reducedMotion;
    this.difficulty = opts.difficulty;
    this.root.id = "cr-ui";
    if (opts.storm) this.root.classList.add("storm");
    this.touchMode = matchMedia("(pointer: coarse)").matches;
    if (this.touchMode) this.root.classList.add("coarse");
    const style = el("style"); style.textContent = CSS; this.root.appendChild(style);
    const loading = el("div", "scr on"); loading.appendChild(el("div", "loading", "Loading…")); this.q.loading = loading;
    const menu = el("div", "scr");
    menu.innerHTML = `<div class="title"><h1><span>${opts.storm ? "After the squall" : "Sky ridge run"}</span>Cumulus Dash</h1><p>${opts.storm ? "Seven sky pearls. One sandstone ridge home under the rainbow." : "Seven sky pearls. One long run home along the ridge."}</p></div>
      <div class="menu"><button class="primary" data-a="play">Play  ▸</button><div class="row"><button class="ghost" data-a="sound">Sound on</button><button class="ghost" data-a="motion">Motion: full</button><button class="ghost" data-a="difficulty">Normal</button><button class="ghost" data-a="how">How to play</button></div><div class="best" data-q="best"></div></div>
      <div class="keys"><span><kbd>←</kbd><kbd>→</kbd>steer</span><span><kbd>Space</kbd><kbd>W</kbd>jump</span><span><kbd>E</kbd><kbd>K</kbd>staff</span><span><kbd>Q</kbd>sky cloud</span><span><kbd>↓</kbd>brake</span><span><kbd>P</kbd>pause</span><span><kbd>M</kbd>sound</span></div>
      <div class="credit">Built with Aura3D</div><div class="bars t" data-q="mt"></div><div class="bars b" data-q="mb"></div>`;
    const hud = el("div", "scr");
    hud.innerHTML = `<div class="danger" data-q="danger"></div><div class="flash" data-q="flash"></div>
      <div class="hud-top"><div class="left"><button class="pausebtn" data-a="pause" aria-label="Pause">❚❚</button><div class="stack"><div class="hearts" data-q="hearts"></div><div class="pearl-row"><div class="orbs" data-q="orbs"></div><span class="pcount" data-q="pcount">0/7</span></div></div></div>
        <div class="prog"><div class="bar"><div class="fill" data-q="fill"></div></div><div class="me" data-q="me"></div><div class="dist" data-q="dist">0%</div></div>
        <div class="right"><div class="score-card glass"><span class="score-lbl">Score</span><div class="score" data-q="score">0</div></div></div></div>
      <div class="combo" data-q="combo"></div>
      <div class="prompt" data-q="prompt"><span class="tag" data-q="tag"></span><div class="ttl" data-q="ttl"></div><div class="help" data-q="help"></div></div>
      <div class="duel" data-q="duel"></div>
      <div class="toast glass" data-q="toast"></div>
      <div class="gauge glass" data-q="gauge"><small>Sky cloud</small><div class="gb"><div class="gbar"><div class="gfill" data-q="gfill"></div></div></div><kbd>Q</kbd></div>
      <div class="caption" data-q="caption"></div>
      <div class="bars t" data-q="bt"></div><div class="bars b" data-q="bb"></div>
      <div class="touch"><button class="steer" data-t="left" aria-label="Steer left">◀</button><button class="steer" data-t="right" aria-label="Steer right">▶</button>
        <button data-t="cloud" data-q="cloudbtn" aria-label="Call sky cloud"><svg class="cring" viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" data-q="cring"/></svg><span>Cloud</span></button><button data-t="pole" aria-label="Extend staff">Staff</button><button data-t="jump" aria-label="Jump">Jump</button></div>`;
    const pause = el("div", "scr"); pause.innerHTML = `<div class="panel glass"><h2>Paused</h2><div class="sub">Take a breath.</div><div class="btns"><button class="primary" data-a="resume">Resume</button><button data-a="restart">Restart run</button><button class="ghost" data-a="sound">Sound on</button><button class="ghost" data-a="menu">Title</button></div></div>`;
    const result = el("div", "scr"); result.innerHTML = `<div class="panel glass"><h2 data-q="rtitle"></h2><div class="sub" data-q="rsub"></div><div class="orbs" data-q="rorbs"></div><div class="stats" data-q="rstats"></div><div data-q="rbest"></div><div class="btns"><button class="primary" data-a="retry" data-q="retry">Run again</button><button class="ghost" data-a="menu">Title</button></div></div>`;
    for (const s of [menu, hud, pause, result]) this.root.appendChild(s);
    this.root.appendChild(loading);
    this.screens = { loading, menu, hud, pause, result };
    for (const e of Array.from(this.root.querySelectorAll<HTMLElement>("[data-q]"))) this.q[e.dataset.q as string] = e;
    this.bestLine(opts.best, opts.bestTime, opts.bestPearls);
    (this.q.hearts as HTMLElement).innerHTML = HEART.repeat(3);
    (this.q.orbs as HTMLElement).innerHTML = Array.from({ length: 7 }, (_, i) => `<span class="orb">${i + 1}</span>`).join("");
    const bar = this.root.querySelector(".prog .bar") as HTMLElement;
    for (const c of ch.checkpoints) { if (c <= 0) continue; const t = el("div", "tick"); t.style.left = `${(c / ch.length) * 100}%`; t.dataset.c = String(c); bar.appendChild(t); this.ticks.push({ el: t, at: c }); }
    this.root.addEventListener("click", (ev) => {
      const a = (ev.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (!a) return;
      if (a === "play") handlers.play(); else if (a === "retry") handlers.retry(); else if (a === "menu") handlers.menu();
      else if (a === "pause") handlers.pause(); else if (a === "resume") handlers.resume(); else if (a === "restart") handlers.restart();
      else if (a === "sound") { this.soundOn = handlers.toggleSound(); this.sound(); }
      else if (a === "motion") { this.reducedMotion = handlers.toggleMotion(); this.options(); }
      else if (a === "difficulty") { this.difficulty = handlers.toggleDifficulty(); this.options(); }
      else if (a === "reload") location.reload();
      else if (a === "how") this.say("Run, jump gaps, plant the staff over gorges, bonk creatures, ride the sky cloud, find all seven sky pearls.");
    });
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>("[data-t]"))) {
      const key = b.dataset.t as "left" | "right" | "jump" | "pole" | "cloud";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); handlers.touch(key, true); });
      for (const t of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(t, () => handlers.touch(key, false));
    }
    this.sound();
    this.options();
    document.body.appendChild(this.root);
  }

  /** Refresh every sound toggle label (title and pause panel); call after a keyboard toggle too. */
  sound(on = this.soundOn): void { this.soundOn = on; for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-a="sound"]'))) b.textContent = on ? "Sound on" : "Sound off"; }
  private options(): void {
    const m = this.root.querySelector<HTMLElement>('[data-a="motion"]'); if (m) m.textContent = this.reducedMotion ? "Motion: reduced" : "Motion: full";
    const d = this.root.querySelector<HTMLElement>('[data-a="difficulty"]'); if (d) d.textContent = this.difficulty === "easy" ? "Easy" : "Normal";
  }
  private bestLine(best: number, bestTime: number, bestPearls: number): void {
    const parts = [best > 0 ? `Best score ${best.toLocaleString()}` : "", bestTime > 0 ? `best time ${clock(bestTime)}` : "", bestPearls > 0 ? `most pearls ${bestPearls}/7` : ""].filter(Boolean);
    this.q.best!.textContent = parts.join(" · ");
  }
  /** A boot failure: replace the loader text with the error and a Reload button (the loader covers the whole page). */
  fail(message: string): void {
    this.failed = true;
    const box = this.q.loading!.firstElementChild as HTMLElement;
    box.style.opacity = "1";
    this.q.loading!.classList.add("on");
    box.innerHTML = "";
    const inner = el("div", "fail");
    inner.appendChild(el("div", "", "The game could not start."));
    const detail = el("small"); detail.textContent = message; inner.appendChild(detail);
    const reload = el("button", "primary", "Reload"); reload.dataset.a = "reload"; inner.appendChild(reload);
    box.appendChild(inner);
    box.style.pointerEvents = "auto";
  }
  private say(text: string): void { const t = this.q.toast!; t.textContent = text; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 3600); }
  /** A1: shared loading progress (0..1) shown in the loader text until ready(). */
  progress(fraction: number): void { if (this.failed || !this.q.loading) return; const l = this.q.loading.firstElementChild as HTMLElement | null; if (l && l.childElementCount === 0) l.textContent = `Loading… ${Math.round(fraction * 100)}%`; }
  ready(): void { if (this.failed) return; const l = this.q.loading!.firstElementChild as HTMLElement; l.style.opacity = "0"; setTimeout(() => this.q.loading!.classList.remove("on"), 520); }
  private set(key: string, value: string | number, apply: () => void): void { if (this.last[key] !== value) { this.last[key] = value; apply(); } }

  /** CD-18: letterbox bars over the title while the flyover runs (share 0..1 from the world view). */
  titleBars(share: number): void {
    const on = share > 0.5;
    this.set("titlebars", on ? 1 : 0, () => { this.q.mt?.classList.toggle("on", on); this.q.mb?.classList.toggle("on", on); });
  }

  update(g: Game): void {
    const s = g.state, ph = g.phase;
    this.screens.menu.classList.toggle("on", ph === "menu");
    this.screens.hud.classList.toggle("on", ph !== "menu");
    this.screens.hud.classList.toggle("fin", !hudVisible(ph) && ph !== "menu");
    this.screens.hud.style.display = ph === "menu" ? "none" : "";
    this.screens.pause.classList.toggle("on", ph === "paused");
    this.screens.result.classList.toggle("on", ph === "result");
    if (ph === "menu") return;
    const cap = s.maxHearts ?? 3;
    this.set("hearts", s.hearts * 10 + cap, () => { (this.q.hearts as HTMLElement).innerHTML = Array.from({ length: cap }, (_, i) => HEART.replace('class="heart"', `class="heart${i < s.hearts ? "" : " off"}"`)).join(""); });
    this.set("score", Math.round(s.score), () => { this.q.score!.textContent = Math.round(s.score).toLocaleString(); });
    const pct = Math.round(Math.min(1, Math.max(0, s.s / g.chapter.length)) * 1000) / 10;
    this.set("pct", pct, () => { this.q.fill!.style.width = `${pct}%`; this.q.me!.style.left = `${pct}%`; if (this.q.dist) this.q.dist.textContent = `${Math.round(pct)}%`; });
    let passed = 0;
    for (const t of this.ticks) if (s.s >= t.at) passed++;
    this.set("ticks", passed, () => { this.ticks.forEach((t, i) => t.el.classList.toggle("hit", i < passed)); });
    this.set("orbs", s.balls.join(","), () => { Array.from(this.q.orbs!.children).forEach((c, i) => c.classList.toggle("got", s.balls.includes(i + 1))); if (this.q.pcount) this.q.pcount.textContent = `${s.balls.length}/7`; });
    this.set("combo", s.combo, () => { this.q.combo!.innerHTML = s.combo >= 3 ? `<b>${s.combo}×</b>streak` : ""; this.q.combo!.classList.toggle("on", s.combo >= 3); });
    const charge = Math.round(s.glider.charge * 100);
    this.set("gauge", charge + (s.glider.active ? 1000 : 0), () => {
      const share = s.glider.active ? Math.max(0, Math.min(1, s.glider.time / 7)) : Math.max(0, Math.min(1, charge / 100));
      const ready = s.glider.charge >= 1 && !s.glider.active;
      this.q.gfill!.style.width = `${Math.round(share * 100)}%`;
      this.q.gauge!.classList.toggle("ready", ready);
      this.q.cloudbtn?.classList.toggle("ready", ready);
      this.q.cring?.setAttribute("style", `stroke-dashoffset:${(RING_CIRC * (1 - share)).toFixed(1)}`);
    });
    const p = g.prompt ?? g.hint;
    this.set("prompt", p ? p.tag + p.title + p.help : "", () => { this.q.prompt!.classList.toggle("on", !!p); if (p) { this.q.tag!.textContent = p.tag; this.q.ttl!.textContent = p.title; this.q.help!.textContent = forInput(p.help, this.touchMode); } });
    const toast = forInput(g.toast?.text ?? "", this.touchMode);
    this.set("toast", toast, () => { this.q.toast!.textContent = toast; this.q.toast!.classList.toggle("on", !!toast); });
    const danger = Math.round(g.danger * 50) / 50;
    this.set("danger", danger, () => { this.q.danger!.style.boxShadow = `inset 0 0 ${60 + danger * 90}px ${danger * 34}px rgba(220,40,20,${(danger * 0.55).toFixed(2)})`; });
    const j = s.janken;
    const duel = j ? (j.t < 0.36 ? "ROCK…" : j.t < 0.74 ? "PAPER…" : ({ guu: "ROCK!", paa: "PAPER!", choki: "SCISSORS!" } as Record<string, string>)[j.hand ?? ""] ?? "!") : "";
    this.set("duel", duel, () => { this.q.duel!.textContent = duel; this.q.duel!.classList.toggle("on", !!duel); });
    const fl = this.q.flash!, flash = Math.round(flashOpacity(g.flash?.k, g.reducedMotion) * 100) / 100, flashColor = g.flash?.color ?? "#fff";
    this.set("flash", `${flashColor}${flash}`, () => { fl.style.background = flashColor; fl.style.opacity = String(flash); });
    const fin = ph === "finale";
    this.q.bt!.classList.toggle("on", fin); this.q.bb!.classList.toggle("on", fin);
    const ft = g.finale?.t ?? 0;
    this.set("caption", fin ? (ft < 4 ? "…the long way home." : ft < FINALE_SECONDS - 1.5 ? "Fourth sky pearl: home at last." : "") : "", () => { const c = fin ? (ft < 4 ? "…the long way home." : ft < FINALE_SECONDS - 1.5 ? "Fourth sky pearl: home at last." : "") : ""; this.q.caption!.textContent = c; this.q.caption!.classList.toggle("on", !!c); });
    if (ph === "result" && g.result) this.showResult(g);
    else this.last.result = "";
  }

  private showResult(g: Game): void {
    const r = g.result!;
    const key = `${r.won}${r.score}${r.time}`;
    if (this.last.result === key) return;
    this.last.result = key;
    this.q.rtitle!.textContent = r.won ? "Run complete!" : "Out of hearts";
    this.q.rsub!.textContent = r.won ? "You made it home along the ridge." : "The ridge is long. Try again from the last checkpoint.";
    this.q.retry!.textContent = retryLabel(r.won);
    this.q.rorbs!.innerHTML = Array.from({ length: 7 }, (_, i) => `<span class="orb${r.stars.includes(i + 1) ? " got" : ""}">${i + 1}</span>`).join("");
    this.q.rstats!.innerHTML = [["Score", r.score.toLocaleString()], ["Time", clock(r.time)], ["Sky pearls", `${r.balls}/7`], ["Spirit orbs", String(r.orbs)], ["Hits taken", String(r.hits)], ["Best combo", `${r.maxCombo}×`],
      ["Best time", r.bestTime > 0 ? clock(r.bestTime) : "–"], ["Most pearls", `${r.bestPearls}/7`], ["Mode", g.difficulty === "easy" ? "Easy" : "Normal"]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join("");
    const badges = [r.best ? "New best score" : "", r.newBestTime ? "New best time" : "", r.newBestPearls ? "Most pearls yet" : ""].filter(Boolean);
    this.q.rbest!.innerHTML = badges.map((b) => `<span class="badge">${b}</span>`).join(" ");
    this.bestLine(g.best, g.bestTime, g.bestPearls);
  }

}
