/**
 * The port's own screens, injected so the page markup stays minimal: a title card with the controls,
 * a journal that keeps each letter's text, story captions, a pause card, the voyage epilogue
 * card, a sound toggle, a reach prompt and touch controls. All text is the port's own writing.
 *
 * Touch layout (phones): the pad and buttons sit above the page's "Built with Aura3D" credit (it is fixed at the
 * bottom-left with a very high z-index, so a thumb on the pad must never land on its link), they only show while
 * walking (not over the title card's Begin button or the epilogue card), there is a Pause button, and a found
 * letter flashes the Journal button instead of opening the panel over the screen.
 */
import { LETTERS } from "./sim";

export const STORY = {
  intro: [
    "A quiet valley, early light, a long way from anywhere.",
    "Three letters were left here for whoever came walking.",
    "Take your time. The wind will tell you where to look."
  ],
  letters: [
    { place: "The Old Oak Grove", text: "Folded small and tucked among the roots: \"The valley keeps its secrets close to whatever stands still. Start where the shade is deepest.\"" },
    { place: "The Sleeping Windmill", text: "Pinned to a sail by a nail: \"The sails turn slowly but never stop listening. Follow the path the wind takes and find the water.\"" },
    { place: "The Glasswater Shore", text: "Weighted with a pebble at the jetty's edge: \"The water here is so clear the sky falls in. Ring the bell when all three of us are together.\"" }
  ],
  locked: "The bell is waiting for three letters.",
  complete: "The bell rings out across the valley, and far over the water something answers.",
  epilogue: [
    "A small boat has been waiting at the jetty all along.",
    "Past the haze there is an island, quiet as a held breath.",
    "Stillwater Isle. Another morning, another set of letters."
  ]
} as const;

const CSS = `
.wwui { position: fixed; inset: 0; pointer-events: none; font: 400 13px/1.45 "Graphik Web", system-ui, sans-serif; color: #2b2a24; z-index: 5; }
.wwui * { box-sizing: border-box; }
.wwui .p { background: rgba(255, 252, 240, 0.86); border: 1px solid rgba(43, 42, 36, 0.16); border-radius: 8px; padding: 8px 12px; backdrop-filter: blur(6px); pointer-events: auto; }
.wwui button { font: inherit; font-weight: 500; color: #2b2a24; background: #f6efd2; border: 1px solid rgba(43, 42, 36, 0.28); border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.wwui button:hover { background: #fff8de; }
.wwui .hide { display: none !important; }
.wwui #wwui-title { position: absolute; inset: 0; display: grid; align-items: end; justify-items: start; padding: 6vh 5vw; background: linear-gradient(180deg, rgba(20, 40, 30, 0) 40%, rgba(20, 40, 30, 0.46) 100%); }
.wwui #wwui-title .card { max-width: 440px; padding: 18px 22px; }
.wwui #wwui-title h1 { margin: 0 0 4px; font-size: 30px; line-height: 1.15; font-weight: 500; letter-spacing: -0.01em; }
.wwui #wwui-title .sub { margin: 0 0 12px; color: #5a584b; }
.wwui #wwui-title table { border-collapse: collapse; margin: 0 0 14px; }
.wwui #wwui-title td { padding: 2px 14px 2px 0; font-size: 12px; color: #4b4a40; }
.wwui #wwui-title td:first-child { color: #2b2a24; font-weight: 500; white-space: nowrap; }
.wwui #wwui-caption { position: absolute; left: 50%; top: 11%; transform: translateX(-50%); max-width: min(620px, 88vw); text-align: center; font-size: 15px; opacity: 0; transition: opacity 0.6s; pointer-events: none; }
.wwui #wwui-caption.on { opacity: 1; }
.wwui #wwui-journal { position: absolute; top: 94px; right: 12px; width: min(330px, 86vw); max-height: 62vh; overflow: auto; }
.wwui #wwui-journal h2 { margin: 0 0 6px; font-size: 13px; font-weight: 500; }
.wwui #wwui-journal .entry { margin: 0 0 8px; padding: 0 0 8px; border-bottom: 1px solid rgba(43, 42, 36, 0.12); }
.wwui #wwui-journal .entry:last-child { border: 0; margin: 0; padding: 0; }
.wwui #wwui-journal .place { font-weight: 500; }
.wwui #wwui-journal .dim { color: #7a7867; }
.wwui #wwui-bar { position: absolute; top: 52px; right: 12px; display: flex; gap: 6px; }
.wwui #wwui-pause { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(20, 40, 30, 0.3); }
.wwui #wwui-epilogue { position: absolute; left: 50%; bottom: 8%; transform: translateX(-50%); width: min(560px, 90vw); text-align: center; }
.wwui #wwui-epilogue .big { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
.wwui #wwui-epilogue .row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.wwui #wwui-prompt { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); font-weight: 500; white-space: nowrap; pointer-events: none; }
.wwui #wwui-fade { position: absolute; inset: 0; background: #c9dfe9; opacity: 0; transition: opacity 0.45s; pointer-events: none; }
.wwui #wwui-fade.on { opacity: 1; }
.wwui #wwui-journal-btn.flash { animation: wwui-flash 0.7s ease-in-out 4; }
.wwui #wwui-act.ready { animation: wwui-pulse 1.1s ease-in-out infinite; }
@keyframes wwui-flash { 50% { background: #ffe9a0; box-shadow: 0 0 0 3px rgba(255, 210, 110, 0.7); } }
@keyframes wwui-pulse { 50% { background: #ffe9a0; box-shadow: 0 0 0 4px rgba(255, 210, 110, 0.55); } }
@media (max-width: 560px) { .wwui #wwui-bar { top: max(8px, env(safe-area-inset-top)); right: 8px; } .wwui #wwui-journal { top: 52px; right: 8px; } .wwui #wwui-caption { top: 18%; } }
.wwui #wwui-touch { position: absolute; inset: auto 0 calc(14px + 48px + env(safe-area-inset-bottom)) 0; display: flex; justify-content: space-between; padding: 0 16px; }
@media (pointer: coarse) { .wwui #wwui-prompt { bottom: calc(14px + 48px + 140px + env(safe-area-inset-bottom)); } .wwui #wwui-pause .p { pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) { .wwui #wwui-caption, .wwui #wwui-fade { transition: none; } .wwui #wwui-journal-btn.flash, .wwui #wwui-act.ready { animation: none; outline: 3px solid #e2b04a; } }
.wwui #wwui-pad { width: 128px; height: 128px; border-radius: 64px; background: rgba(255, 252, 240, 0.42); border: 1px solid rgba(43, 42, 36, 0.2); pointer-events: auto; touch-action: none; position: relative; }
.wwui #wwui-pad i { position: absolute; left: 44px; top: 44px; width: 40px; height: 40px; border-radius: 20px; background: rgba(255, 252, 240, 0.92); border: 1px solid rgba(43, 42, 36, 0.25); }
.wwui #wwui-acts { display: grid; gap: 8px; align-content: end; }
.wwui #wwui-acts button { width: 88px; height: 44px; pointer-events: auto; }
.wwui #wwui-acts #wwui-pause-btn { height: 36px; }
`;

export interface WindUi {
  onBegin(fn: () => void): void;
  onTouch(keys: (k: string) => void, act: (a: "E" | "Space") => void): void;
  onToggleSound(fn: () => void): void;
  onPause(fn: () => void): void;
  onWalkAgain(fn: () => void): void;
  hideTitle(): void;
  showTitle(): void;
  readonly titleVisible: boolean;
  /** Caption text on (null hides it). Timing is the caller's (see captions.ts). */
  showCaption(text: string | null): void;
  /** What the traveller can reach: a letter, the bell (locked or ready), or nothing. */
  setPrompt(kind: "letter" | "bell" | "bell-locked" | null): void;
  /** Cover the view, run `mid` while covered, uncover. Instant under reduced motion. */
  fade(mid: () => void): void;
  addLetter(index: number): void;
  clearLetters(): void;
  toggleJournal(force?: boolean): void;
  setPaused(paused: boolean): void;
  showEpilogue(on: boolean): void;
  onContinue(fn: () => void): void;
  setSound(muted: boolean, started: boolean): void;
}

export function createUi(): WindUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.className = "wwui";
  root.innerHTML = `
    <div id="wwui-title">
      <div class="p card">
        <h1>The Bellkeeper's Walk</h1>
        <p class="sub">A slow walk through a painted valley. Find three letters, ring the bell.</p>
        <table>
          <tr><td>W A S D / arrows</td><td>walk</td></tr>
          <tr><td>Space</td><td>hop</td></tr>
          <tr><td>E</td><td>pick up, ring, look</td></tr>
          <tr><td>J</td><td>journal</td></tr>
          <tr><td>M / P (Esc)</td><td>sound / pause</td></tr>
        </table>
        <p class="sub" id="wwui-touch-help" style="display:none">On a touch screen: the pad walks, Hop and Act are on the right.</p>
        <button id="wwui-begin" type="button">Begin the walk (Enter)</button>
      </div>
    </div>
    <div id="wwui-caption" class="p" role="status" aria-live="polite"></div>
    <div id="wwui-prompt" class="p hide" aria-live="polite"></div>
    <div id="wwui-bar" class="hide"><button id="wwui-journal-btn" type="button" title="Journal (J)">Journal</button><button id="wwui-sound-btn" type="button" title="Sound (M)">Sound on</button></div>
    <div id="wwui-journal" class="p hide"></div>
    <div id="wwui-pause" class="hide"><div class="p"><strong>Paused</strong><br /><span id="wwui-pause-help">Press Esc or P to keep walking.</span></div></div>
    <div id="wwui-epilogue" class="p hide"><p class="big">Stillwater Isle</p><p id="wwui-epi-text" style="margin:0 0 8px"></p><div class="row"><button id="wwui-continue" type="button">Keep wandering the valley</button><button id="wwui-again" type="button">Walk again</button></div></div>
    <div id="wwui-touch" class="hide"><div id="wwui-pad" aria-label="Walk"><i></i></div><div id="wwui-acts"><button id="wwui-pause-btn" type="button">Pause</button><button id="wwui-hop" type="button">Hop</button><button id="wwui-act" type="button">Act</button></div></div>
    <div id="wwui-fade"></div>`;
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const title = $("wwui-title"), cap = $("wwui-caption"), journal = $("wwui-journal"), bar = $("wwui-bar"), pause = $("wwui-pause"), epi = $("wwui-epilogue");
  const found = new Set<number>();
  let beginFn = (): void => {};
  let continueFn = (): void => {};
  let soundFn = (): void => {};
  let pauseFn = (): void => {};
  let againFn = (): void => {};
  const coarse = matchMedia("(pointer: coarse)").matches;
  const narrow = (): boolean => coarse || matchMedia("(max-width: 560px)").matches;
  const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = $("wwui-touch"), prompt = $("wwui-prompt"), fadeEl = $("wwui-fade"), journalBtn = $("wwui-journal-btn"), actBtn = $("wwui-act");
  /** Touch controls only while walking: never over the title card's Begin button or the epilogue card. */
  const syncTouch = (): void => { touch.classList.toggle("hide", !coarse || !title.classList.contains("hide") || !epi.classList.contains("hide")); };
  if (coarse) {
    $("wwui-touch-help").style.display = "";
    $("wwui-pause-help").textContent = "Tap here or Pause to keep walking.";
    $("wwui-begin").textContent = "Begin the walk";
  }

  const renderJournal = (): void => {
    journal.innerHTML = `<h2>Journal: ${found.size} of ${LETTERS.length} letters</h2>` + STORY.letters.map((l, i) => found.has(i)
      ? `<div class="entry"><div class="place">${l.place}</div><div>${l.text}</div></div>`
      : `<div class="entry dim"><div class="place">Somewhere in the valley</div><div>A letter waits here, unread.</div></div>`).join("");
  };
  renderJournal();
  $("wwui-begin").addEventListener("click", () => beginFn());
  journalBtn.addEventListener("click", () => { journalBtn.classList.remove("flash"); journal.classList.toggle("hide"); });
  $("wwui-sound-btn").addEventListener("click", () => soundFn());
  $("wwui-continue").addEventListener("click", () => continueFn());
  $("wwui-again").addEventListener("click", () => againFn());
  $("wwui-pause-btn").addEventListener("click", () => pauseFn());
  pause.querySelector(".p")!.addEventListener("click", () => pauseFn());

  return {
    onBegin(fn) { beginFn = fn; },
    onContinue(fn) { continueFn = fn; },
    onToggleSound(fn) { soundFn = fn; },
    onPause(fn) { pauseFn = fn; },
    onWalkAgain(fn) { againFn = fn; },
    onTouch(keys, act) {
      const pad = $("wwui-pad");
      const knob = pad.querySelector("i") as HTMLElement;
      const set = (e: PointerEvent): void => {
        const r = pad.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const m = Math.hypot(dx, dy);
        let k = "";
        if (m > 14) {
          if (dy < -m * 0.38) k += "W";
          if (dx < -m * 0.38) k += "A";
          if (dy > m * 0.38) k += "S";
          if (dx > m * 0.38) k += "D";
        }
        const s = m > 0 ? Math.min(1, 40 / m) : 0;
        knob.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
        keys(k);
      };
      pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); set(e); });
      pad.addEventListener("pointermove", (e) => { if (pad.hasPointerCapture(e.pointerId)) set(e); });
      const end = (): void => { knob.style.transform = ""; keys(""); };
      pad.addEventListener("pointerup", end);
      pad.addEventListener("pointercancel", end);
      $("wwui-hop").addEventListener("pointerdown", () => act("Space"));
      $("wwui-act").addEventListener("pointerdown", () => act("E"));
    },
    hideTitle() { title.classList.add("hide"); bar.classList.remove("hide"); syncTouch(); },
    showTitle() { title.classList.remove("hide"); bar.classList.add("hide"); journal.classList.add("hide"); prompt.classList.add("hide"); syncTouch(); },
    get titleVisible() { return !title.classList.contains("hide"); },
    showCaption(text) {
      if (text === null) { cap.classList.remove("on"); return; }
      cap.textContent = text;
      cap.classList.add("on");
    },
    setPrompt(kind) {
      const verb = coarse ? "Act" : "E";
      const text = kind === "letter" ? `${verb}: pick up the letter` : kind === "bell" ? `${verb}: ring the bell` : kind === "bell-locked" ? `${verb}: look at the bell` : "";
      if (prompt.textContent !== text) prompt.textContent = text;
      prompt.classList.toggle("hide", kind === null);
      actBtn.classList.toggle("ready", kind !== null);
    },
    fade(mid) {
      if (reducedMotion()) { mid(); return; }
      fadeEl.classList.add("on");
      window.setTimeout(() => { mid(); window.setTimeout(() => fadeEl.classList.remove("on"), 60); }, 460);
    },
    addLetter(index) {
      found.add(index);
      renderJournal();
      if (narrow()) {
        journalBtn.classList.remove("flash");
        void journalBtn.offsetWidth;
        journalBtn.classList.add("flash");
      } else journal.classList.remove("hide");
    },
    clearLetters() { found.clear(); renderJournal(); },
    toggleJournal(force) { journal.classList.toggle("hide", force === undefined ? !journal.classList.contains("hide") : !force); },
    setPaused(paused) { pause.classList.toggle("hide", !paused); },
    showEpilogue(on) {
      epi.classList.toggle("hide", !on);
      if (on) prompt.classList.add("hide");
      syncTouch();
      if (on) $("wwui-epi-text").textContent = STORY.epilogue.join(" ");
    },
    setSound(muted, started) { $("wwui-sound-btn").textContent = muted ? "Sound off" : started ? "Sound on" : "Sound (M)"; }
  };
}
