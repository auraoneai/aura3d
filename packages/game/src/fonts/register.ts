/**
 * §17 fonts: OFL woff2 Latin subsets (≤ 40 KB each) loaded through `FontFace`
 * before the title screen shows. `baseUrl` points at the package's `src/fonts`
 * asset directory as served by the app bundler (e.g.
 * `new URL("./fonts/", import.meta.url)` in the shell).
 */
import { HUD_FONT_FACES } from "../hud/themes.js";

export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface FontRegistry {
  fonts: { add(face: unknown): void };
  FontFace: new (family: string, source: string, descriptors?: { weight?: string; style?: string; display?: string }) => FontFaceLike;
}

export async function registerGameFonts(
  baseUrl: string,
  registry: FontRegistry
): Promise<{ loaded: readonly string[]; failed: readonly string[] }> {
  const loaded: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    HUD_FONT_FACES.map(async ({ family, file, weight }) => {
      try {
        const face = new registry.FontFace(family, `url(${baseUrl}${file})`, {
          weight: String(weight),
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
