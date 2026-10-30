/**
 * GU47 WP-10 (E-J): HUD theme fonts and the storybook / ink-scroll /
 * sky-expedition presets. Static checks only: stacks, shipped WOFF2 files,
 * provenance rows, CSS mirrors, panel contrast and a fake-DOM mount.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mountHud } from "../../../../packages/game/src/hud/HudKit.js";
import type { HudDocument, HudElement, HudRect } from "../../../../packages/game/src/hud/dom.js";
import { HUD_FONT_FACES, HUD_THEMES, hudThemeFontFaces, type HudThemePreset } from "../../../../packages/game/src/hud/themes.js";
import { registerGameFonts, type FontRegistry } from "../../../../packages/game/src/fonts/register.js";

const FONT_DIR = "packages/game/src/fonts";
const THEME_CSS_DIR = "packages/game/src/styles/themes";
const FACE_BUDGET_BYTES = 40 * 1024;
const PRESETS = Object.keys(HUD_THEMES) as HudThemePreset[];
const NEW_PRESETS: readonly HudThemePreset[] = ["storybook", "ink-scroll", "sky-expedition"];
const FONT_VARS = ["--a3g-font", "--a3g-font-display"] as const;
/** Faces D9 and the machine font policy forbid anywhere in a stack. */
const FORBIDDEN_FACE = /Roboto|Barlow|system-ui|-apple-system|BlinkMacSystemFont|Segoe|\bInter\b|Geist|Open Sans|Orbitron|Russo One|Tektur|IBM Plex|ui-sans-serif|ui-serif|ui-monospace/i;

function stackFamilies(stack: string): string[] {
  return stack.split(",").map((part) => part.trim().replace(/^["']|["']$/g, ""));
}

interface NoticeRow { readonly bytes: number; readonly sha256: string; readonly source: string; readonly family: string }
function noticeRows(): Map<string, NoticeRow> {
  const rows = new Map<string, NoticeRow>();
  for (const line of readFileSync(join(FONT_DIR, "NOTICE.txt"), "utf8").split("\n")) {
    const cells = line.split(" | ");
    if (cells.length !== 6 || !cells[0]!.endsWith(".woff2")) continue;
    rows.set(cells[0]!, { family: cells[1]!, source: cells[3]!, bytes: Number(cells[4]), sha256: cells[5]!.trim() });
  }
  return rows;
}

/** WCAG relative-luminance contrast of `fg` over `bg` (rgba) composited on `backdrop`. */
function contrastOver(fg: string, bg: string, backdrop: readonly [number, number, number]): number {
  const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(bg);
  if (!m) throw new Error(`bg is not rgba(): ${bg}`);
  const a = Number(m[4]);
  const panel = [Number(m[1]), Number(m[2]), Number(m[3])].map((c, i) => c * a + backdrop[i]! * (1 - a));
  const lum = (rgb: number[]): number => {
    const lin = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  const [hi, lo] = [lum(hex(fg)), lum(panel)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("GU47 WP-10 HUD theme fonts (PRD D9)", () => {
  it("themes.ts names no Roboto, Barlow or platform UI stack (WP-10 acceptance rg)", () => {
    const source = readFileSync("packages/game/src/hud/themes.ts", "utf8");
    expect(source.match(/Roboto|Barlow|system-ui|-apple-system/g)).toBeNull();
  });

  it("ships the seven original presets plus storybook, ink-scroll and sky-expedition with one key set", () => {
    expect(PRESETS).toEqual(expect.arrayContaining([
      "arcade-neon", "motorsport", "sports-broadcast", "sci-fi-telemetry", "fighting", "tabletop", "plain",
      "storybook", "ink-scroll", "sky-expedition"
    ]));
    expect(PRESETS).toHaveLength(10);
    const keys = Object.keys(HUD_THEMES.plain).sort();
    expect(keys).toContain("--a3g-font-display");
    for (const preset of PRESETS) expect(Object.keys(HUD_THEMES[preset]).sort(), preset).toEqual(keys);
  });

  it("every font stack leads with a registered licensed face and ends on a generic", () => {
    const registered = new Set(HUD_FONT_FACES.map((face) => face.family));
    for (const preset of PRESETS) {
      for (const key of FONT_VARS) {
        const stack = HUD_THEMES[preset][key]!;
        const families = stackFamilies(stack);
        expect(families[0], `${preset} ${key}`).toMatch(/^A3G /);
        expect(registered.has(families[0]!), `${preset} ${key} lead ${families[0]}`).toBe(true);
        expect(["sans-serif", "serif"], `${preset} ${key}`).toContain(families.at(-1));
        expect(stack, `${preset} ${key}`).not.toMatch(FORBIDDEN_FACE);
      }
    }
  });

  it("every referenced WOFF2 exists, is a WOFF2 file within the 40 KiB face budget and matches its NOTICE row", () => {
    const rows = noticeRows();
    for (const face of HUD_FONT_FACES) {
      const path = join(FONT_DIR, face.file);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString("latin1"), face.file).toBe("wOF2");
      expect(bytes.length, face.file).toBeLessThanOrEqual(FACE_BUDGET_BYTES);
      const row = rows.get(face.file);
      expect(row, `NOTICE row for ${face.file}`).toBeDefined();
      expect(row!.bytes, face.file).toBe(bytes.length);
      expect(row!.sha256, face.file).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(row!.family, face.file).toContain(`(${face.weight})`);
      expect(row!.source, face.file).toMatch(/^(sans|serif|display)\/[^/]+\/[^/]+\.woff2$/);
      expect(face.weight % 100, face.file).toBe(0);
    }
  });

  it("the font folder holds no orphan, duplicate or non-WOFF2 font files", () => {
    const shipped = readdirSync(FONT_DIR).filter((name) => /\.(woff2?|ttf|otf|eot)$/i.test(name)).sort();
    const referenced = HUD_FONT_FACES.map((face) => face.file);
    expect(new Set(referenced).size).toBe(referenced.length);
    expect(shipped).toEqual([...referenced].sort());
    expect([...noticeRows().keys()].sort()).toEqual([...referenced].sort());
    expect(readdirSync(FONT_DIR)).not.toContain("OFL.txt");
  });

  it("every registered family is used by a theme, and hudThemeFontFaces returns exactly a theme's faces", () => {
    const used = new Set(PRESETS.flatMap((preset) => hudThemeFontFaces(preset).map((face) => face.family)));
    for (const face of HUD_FONT_FACES) expect(used.has(face.family), face.family).toBe(true);
    const files = (preset: HudThemePreset) => hudThemeFontFaces(preset).map((face) => `${face.file}@${face.weight}`);
    expect(files("storybook")).toEqual(["gt-walsheim-400.woff2@400", "canela-400.woff2@400"]);
    expect(files("ink-scroll")).toEqual(["suisse-works-italic-400.woff2@400", "domaine-display-700.woff2@700"]);
    expect(files("sky-expedition")).toEqual(["roobert-400.woff2@400", "roobert-700.woff2@700"]);
    expect(files("plain")).toEqual(["graphik-400.woff2@400", "graphik-500.woff2@500"]);
    expect(files("sports-broadcast")).toEqual(["calibre-400.woff2@400", "calibre-600.woff2@600"]);
    expect(files("motorsport")).toEqual(["national-2-narrow-400.woff2@400", "national-2-narrow-700.woff2@700"]);
  });

  it("the CSS mirrors under styles/themes match HUD_THEMES exactly", () => {
    for (const preset of PRESETS) {
      const css = readFileSync(join(THEME_CSS_DIR, `${preset}.css`), "utf8");
      expect(css, preset).toContain(`.a3g-hud.a3g-theme-${preset} {`);
      const declared = Object.fromEntries(
        [...css.matchAll(/^\s*(--a3g-[\w-]+):\s*(.+);\s*$/gm)].map((m) => [m[1]!, m[2]!.trim()])
      );
      const expected = Object.fromEntries(
        Object.entries(HUD_THEMES[preset]).map(([k, v]) => [k, k.startsWith("--a3g-font") ? v.replace(/,\s+/g, ",") : v])
      );
      expect(declared, preset).toEqual(expected);
    }
    const mirrors = readdirSync(THEME_CSS_DIR).filter((name) => name.endsWith(".css")).map((name) => name.replace(/\.css$/, ""));
    expect(mirrors.sort()).toEqual([...PRESETS].sort());
  });

  it("the new paper and sky panels keep text readable over dark and bright scenes", () => {
    const backdrops: readonly (readonly [number, number, number])[] = [[0, 0, 0], [255, 255, 255], [47, 111, 184], [79, 122, 58]];
    for (const preset of NEW_PRESETS) {
      const vars = HUD_THEMES[preset];
      for (const backdrop of backdrops) {
        for (const key of ["--a3g-fg", "--a3g-fg-dim", "--a3g-warn", "--a3g-danger"] as const) {
          expect(contrastOver(vars[key]!, vars["--a3g-bg"]!, backdrop), `${preset} ${key} over ${backdrop.join(",")}`).toBeGreaterThanOrEqual(4.5);
        }
        // Accent fills meters, life pips and minimap markers inside the panel (non-text, WCAG 1.4.11).
        expect(contrastOver(vars["--a3g-accent"]!, vars["--a3g-bg"]!, backdrop), `${preset} accent`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

class FakeEl implements HudElement {
  tagName: string;
  className = "";
  textContent: string | null = "";
  innerHTML = "";
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  private readonly attrs = new Map<string, string>();
  private readonly classes = new Set<string>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get classList() {
    const cs = this.classes;
    return {
      add: (...n: string[]) => n.forEach((c) => cs.add(c)),
      remove: (...n: string[]) => n.forEach((c) => cs.delete(c)),
      toggle: (n: string, force?: boolean) => { if (force ?? !cs.has(n)) cs.add(n); else cs.delete(n); },
      contains: (n: string) => cs.has(n)
    };
  }
  appendChild(c: HudElement): void { const f = c as FakeEl; f.parent?.removeChild(f); f.parent = this; this.children.push(f); }
  removeChild(c: HudElement): void { this.children = this.children.filter((x) => x !== c); (c as FakeEl).parent = null; }
  remove(): void { this.parent?.removeChild(this); }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v); }
  getAttribute(n: string): string | null { return this.attrs.get(n) ?? null; }
  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect(): HudRect { return { left: 0, top: 0, width: 0, height: 0 }; }
}

class FakeDoc implements HudDocument {
  body = new FakeEl("body");
  createElement(tag: string): HudElement { return new FakeEl(tag); }
  createTextNode(text: string): HudElement { const e = new FakeEl("text"); e.textContent = text; return e; }
}

describe("GU47 WP-10 new presets mount and load their faces", () => {
  it.each(NEW_PRESETS)("mountHud applies the %s preset class and every var", (preset) => {
    const doc = new FakeDoc();
    const root = doc.createElement("div") as FakeEl;
    mountHud(
      { root, doc, schedule: () => ({ cancel: () => {} }), now: () => 0, warn: () => {}, devAssertions: false },
      { theme: preset, widgets: [{ id: "score", kind: "score", anchor: "top-left", label: "Score" }] }
    );
    const hudEl = root.children[0]!;
    expect(hudEl.className).toContain(`a3g-theme-${preset}`);
    for (const [key, value] of Object.entries(HUD_THEMES[preset])) expect(hudEl.style[key], key).toBe(value);
  });

  it("registerGameFonts loads only the faces passed in, at their README weights", async () => {
    const created: { family: string; source: string; weight?: string; style?: string }[] = [];
    const added: unknown[] = [];
    const registry: FontRegistry = {
      fonts: { add: (face) => { added.push(face); } },
      FontFace: class {
        constructor(family: string, source: string, descriptors?: { weight?: string; style?: string }) {
          created.push({ family, source, weight: descriptors?.weight, style: descriptors?.style });
        }
        load(): Promise<unknown> { return Promise.resolve(this); }
      }
    };
    const result = await registerGameFonts("/fonts/", registry, hudThemeFontFaces("ink-scroll"));
    expect(created).toEqual([
      { family: "A3G Suisse Works Italic", source: "url(/fonts/suisse-works-italic-400.woff2)", weight: "400", style: "normal" },
      { family: "A3G Domaine Display", source: "url(/fonts/domaine-display-700.woff2)", weight: "700", style: "normal" }
    ]);
    expect(added).toHaveLength(2);
    expect(result.failed).toEqual([]);
    expect([...result.loaded].sort()).toEqual(["A3G Domaine Display 700", "A3G Suisse Works Italic 400"]);
  });

  it("registerGameFonts still loads every face by default", async () => {
    let count = 0;
    const registry: FontRegistry = {
      fonts: { add: () => { count += 1; } },
      FontFace: class { load(): Promise<unknown> { return Promise.resolve(this); } }
    };
    const result = await registerGameFonts("/fonts/", registry);
    expect(count).toBe(HUD_FONT_FACES.length);
    expect(result.loaded).toHaveLength(HUD_FONT_FACES.length);
    expect(statSync(FONT_DIR).isDirectory()).toBe(true);
  });
});
