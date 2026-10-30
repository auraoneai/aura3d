/**
 * §17 fonts: licensed WOFF2 web cuts (≤ 40 KiB each, provenance in
 * `NOTICE.txt`) loaded through `FontFace` before the title screen shows.
 * `baseUrl` points at the directory the app serves its copies from (a game
 * copies the files it needs into its own app folder, e.g. `/fonts/`).
 * Pass `hudThemeFontFaces(theme)` as `faces` to load only the files of the
 * theme the game uses; the default loads every face in `HUD_FONT_FACES`.
 *
 * No synthetic bold (font library README): HudKit sets values in 700 and
 * banners in 800, heavier than several families ship. The heaviest face of
 * each family in `faces` therefore registers over the weight range
 * `<weight> 900`, so heavier requests render that real cut; browsers only
 * synthesise bold for faces whose declared range stays below 600.
 */
import { HUD_FONT_FACES, type HudFontFace } from "../hud/themes.js";

export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface FontRegistry {
  fonts: { add(face: unknown): void };
  FontFace: new (family: string, source: string, descriptors?: { weight?: string; style?: string; display?: string }) => FontFaceLike;
}

export async function registerGameFonts(
  baseUrl: string,
  registry: FontRegistry,
  faces: readonly HudFontFace[] = HUD_FONT_FACES
): Promise<{ loaded: readonly string[]; failed: readonly string[] }> {
  const loaded: string[] = [];
  const failed: string[] = [];
  const heaviest = new Map<string, number>();
  for (const { family, weight } of faces) heaviest.set(family, Math.max(heaviest.get(family) ?? 0, weight));
  await Promise.all(
    faces.map(async ({ family, file, weight }) => {
      try {
        const face = new registry.FontFace(family, `url(${baseUrl}${file})`, {
          weight: weight === heaviest.get(family) && weight < 900 ? `${weight} 900` : String(weight),
          style: "normal",
          display: "swap"
        });
        await face.load();
        registry.fonts.add(face);
        loaded.push(`${family} ${weight}`);
      } catch {
        failed.push(`${family} ${weight}`);
      }
    })
  );
  return { loaded, failed };
}
