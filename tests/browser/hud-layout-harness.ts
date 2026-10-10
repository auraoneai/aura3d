/**
 * hud-layout harness (PRD-09 1767): mounts each fixture's widget list + touch
 * preset on real DOM and exposes a report the layout/touch specs assert.
 * Fixtures are route-independent so the specs never touch route code.
 */
import { mountHud, mountTouchControls, type GameHud, type GameHudMountOptions, type GameTouchControls, type TouchControlsOptions, type HudDocument } from "../../packages/game/src/index";
import { courierHudOptions, courierTouchOptions } from "../../packages/game/fixtures/courier/hud";
import { bankShotHudOptions, bankShotTouchOptions } from "../../packages/game/fixtures/bank-shot/hud";
import { auraClashHudOptions, auraClashTouchOptions } from "../../packages/game/fixtures/aura-clash/hud";

interface RectReport { x: number; y: number; w: number; h: number }
interface FixtureReport {
  name: string;
  widgetCount: number;
  anchors: Record<string, string[]>;
  widgetRects: Record<string, RectReport>;
  screenFraction: number;
  canvasCoverage: number;
  domText: string;
  touch: {
    preset: string;
    elements: string[];
    minTargetPx: number;
    visibleInitially: boolean;
    visibleAfterTouch: boolean;
    keyhintHiddenAfterTouch: boolean;
    actionsReceived: string[];
  };
}

declare global {
  interface Window {
    __AURA3D_HUD__?: { status: "ready" | "error"; error?: string; reports: FixtureReport[] };
    __HUD_FIXTURE_RUN__?: (name: string) => void;
  }
}

const suites: Array<{ name: string; hud: GameHudMountOptions; touch: TouchControlsOptions; sinkCodes?: boolean }> = [
  { name: "courier", hud: courierHudOptions, touch: courierTouchOptions },
  { name: "bank-shot", hud: bankShotHudOptions, touch: bankShotTouchOptions },
  { name: "aura-clash", hud: auraClashHudOptions, touch: auraClashTouchOptions }
];

function rectOf(el: Element): RectReport {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}

function runFixture(suite: (typeof suites)[number]): FixtureReport {
  const app = document.getElementById("app")!;
  const host = document.createElement("div");
  host.className = "a3g-game-hud";
  host.dataset.fixture = suite.name;
  app.appendChild(host);

  const hud: GameHud = mountHud({ root: host, doc: document as unknown as HudDocument }, suite.hud);
  const actionsReceived: string[] = [];
  const sink = {
    press: (b: string) => actionsReceived.push(`+${b}`),
    release: (b: string) => actionsReceived.push(`-${b}`),
    setAction: (a: string, held: boolean) => actionsReceived.push(`${held ? "+" : "-"}${a}`)
  };
  const touch: GameTouchControls = mountTouchControls(sink, suite.touch, {
    doc: document as unknown as HudDocument,
    root: host,
    coarsePointer: () => false
  });

  // Drive some values so every widget renders its content.
  for (const spec of suite.hud.widgets) {
    hud.set(spec.id, spec.kind === "timer" ? 37 : spec.kind === "lives" ? 2 : spec.kind === "meter" ? 0.65 : spec.kind === "combo" ? 3 : "drive");
  }

  const snap = hud.snapshot();
  const anchors: Record<string, string[]> = {};
  const widgetRects: Record<string, RectReport> = {};
  for (const w of snap.widgets) {
    const el = host.querySelector(`[data-widget-id="${w.id}"]`);
    if (!el) continue;
    const slot = el.closest(".a3g-hud-slot");
    const anchor = slot?.getAttribute("data-anchor") ?? "?";
    (anchors[anchor] ??= []).push(w.id);
    widgetRects[w.id] = rectOf(el);
  }

  const touchEls = [...host.querySelectorAll(".a3g-touch [data-control]")] as HTMLElement[];
  const minTargetPx = Math.min(...touchEls.flatMap((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));

  const keyhint = document.querySelector<HTMLElement>("[data-a3g-keyhint]");
  const keyhintBefore = keyhint ? getComputedStyle(keyhint).display !== "none" : true;

  const visibleInitially = touch.visible;
  bodyTouchStart();
  touch.update();
  const visibleAfterTouch = touch.visible;
  const keyhintHiddenAfterTouch = keyhint ? getComputedStyle(keyhint).display === "none" : keyhintBefore === false;

  const hostRect = host.getBoundingClientRect();
  const canvasCoverage = Math.min(1, (hostRect.width * hostRect.height) / (window.innerWidth * window.innerHeight));

  return {
    name: suite.name,
    widgetCount: snap.widgetCount,
    anchors,
    widgetRects,
    screenFraction: snap.screenFraction,
    canvasCoverage,
    domText: document.body.innerText,
    touch: {
      preset: suite.touch.preset,
      elements: touchEls.map((el) => el.getAttribute("data-control") ?? "?"),
      minTargetPx: Math.round(minTargetPx),
      visibleInitially,
      visibleAfterTouch,
      keyhintHiddenAfterTouch,
      actionsReceived
    }
  };
}

function bodyTouchStart(): void {
  document.body.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
}

async function main(): Promise<void> {
  try {
    const reports: FixtureReport[] = [];
    for (const suite of suites) {
      reports.push(runFixture(suite));
      // reset the visibility latch between suites
      document.getElementById("app")!.innerHTML = '<span id="keyhint" data-a3g-keyhint>A/D aim - Space charge</span>';
    }
    window.__AURA3D_HUD__ = { status: "ready", reports };
  } catch (error) {
    window.__AURA3D_HUD__ = { status: "error", error: String(error) };
  }
}

void main();
