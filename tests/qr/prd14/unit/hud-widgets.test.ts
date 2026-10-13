// tests/qr/prd14/unit/hud-widgets.test.ts — T0-29 (FLAG-4): every route's
// createGame HUD widget kind must be one the C-24 HudKit can build. An
// unsupported kind ("label", "gauge", "bar", "text", "tray") made
// createWidget() return undefined and mountHud() throw
// `Cannot read properties of undefined (reading 'el')` at boot on every v2
// route with the real game impl (lane run 38087557283: 15/15 routes, all
// three viewports). A "meter" also needs a numeric `max`.
//
// Route shape is derived from the filesystem: dual-path routes declare
// their widgets in `src/v2/boot.ts`; single-path rebuilt routes (no v2
// tree) declare them in `src/main.ts`, the entry that boots every URL.
// Both shapes get the same extractor and the same assertions.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

/** The route's createGame boot source: `src/v2/boot.ts` when the route
 * keeps the dual-path dispatcher, else the single-path `src/main.ts`. */
function routeBoot(appDir: string): { dir: string; file: string; label: string } {
  const v2Dir = join(APPS(), appDir, "src", "v2");
  if (existsSync(join(v2Dir, "boot.ts"))) return { dir: v2Dir, file: join(v2Dir, "boot.ts"), label: "v2/boot.ts" };
  const srcDir = join(APPS(), appDir, "src");
  return { dir: srcDir, file: join(srcDir, "main.ts"), label: "src/main.ts" };
}

/** The `hud: { ... widgets: [ ... ] }` specs in a route boot source. */
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
      const { dir, file, label } = routeBoot(appDir);
      const boot = readFileSync(file, "utf8");
      const widgets = hudWidgets(boot);
      expect(widgets.length, `${appDir}: no hud widgets parsed from ${label}`).toBeGreaterThan(0);
      const bad = widgets.filter((w) => !SUPPORTED.has(w.kind) || (w.kind === "meter" && !(w.max! > 0)));
      expect(bad).toEqual([]);
      expect(readdirSync(dir).length).toBeGreaterThan(0);
    });
  }
});

function APPS(): string {
  return join(ROOT, "apps");
}
