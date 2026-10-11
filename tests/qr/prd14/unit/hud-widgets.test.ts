// tests/qr/prd14/unit/hud-widgets.test.ts — T0-29 (FLAG-4): every route's
// createGame HUD widget kind must be one the C-24 HudKit can build. An
// unsupported kind ("label", "gauge", "bar", "text", "tray") made
// createWidget() return undefined and mountHud() throw
// `Cannot read properties of undefined (reading 'el')` at boot on every v2
// route with the real game impl (lane run 38087557283: 15/15 routes, all
// three viewports). A "meter" also needs a numeric `max`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const widgetsSrc = readFileSync(join(ROOT, "packages/game/src/hud/widgets/index.ts"), "utf8");
const createWidgetBody = widgetsSrc.slice(widgetsSrc.indexOf("export function createWidget("));
const SUPPORTED = new Set([...createWidgetBody.slice(0, createWidgetBody.indexOf("\n}\n")).matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]!));

const games = (JSON.parse(readFileSync(join(ROOT, "tools/quality-rebuild-capture/games.json"), "utf8")) as {
  games: { id: string; appDir?: string }[];
}).games.map((g) => g.appDir ?? g.id);

/** The `hud: { ... widgets: [ ... ] }` specs in a v2 boot. */
function hudWidgets(boot: string): { id: string; kind: string; max?: number }[] {
  const at = boot.indexOf("widgets: [");
  if (at < 0) return [];
  const block = boot.slice(at, boot.indexOf("]", at));
  return [...block.matchAll(/\{ id: "([^"]+)", kind: "([a-z-]+)"(?:, max: ([0-9.]+))?/g)]
    .map((m) => ({ id: m[1]!, kind: m[2]!, ...(m[3] ? { max: Number(m[3]) } : {}) }));
}

describe("route HUD widgets are buildable by the C-24 HudKit (T0-29)", () => {
  it("reads the HudKit kind list", () => {
    expect([...SUPPORTED].sort()).toEqual(
      ["combo", "indicator", "lives", "meter", "minimap", "objective", "prompt", "score", "speedometer", "timer"]
    );
  });

  for (const appDir of games) {
    it(`${appDir}: every hud widget kind is supported; meters carry max`, () => {
      const dir = join(APPS(), appDir, "src", "v2");
      const boot = readFileSync(join(dir, "boot.ts"), "utf8");
      const widgets = hudWidgets(boot);
      expect(widgets.length, `${appDir}: no hud widgets parsed from v2/boot.ts`).toBeGreaterThan(0);
      const bad = widgets.filter((w) => !SUPPORTED.has(w.kind) || (w.kind === "meter" && !(w.max! > 0)));
      expect(bad).toEqual([]);
      expect(readdirSync(dir).length).toBeGreaterThan(0);
    });
  }
});

function APPS(): string {
  return join(ROOT, "apps");
}
