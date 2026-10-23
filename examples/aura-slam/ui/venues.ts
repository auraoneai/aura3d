/** HUD and menu labels per venue (game.js `venues` and menu-flow.js `courts`). Scene palettes belong to M-RENDER. */
export interface VenueTheme {
  id: string; name: string; surface: string; short: string; session: string; accent: string; destination?: boolean;
}

const hard: VenueTheme = { id: "hard", name: "New York", surface: "Hard court", short: "NY HARD", session: "NIGHT SESSION", accent: "#d9ff4f" };
export const VENUE_THEMES: Readonly<Record<string, VenueTheme>> = Object.freeze({
  hard,
  grass: { id: "grass", name: "London", surface: "Grass court", short: "LDN GRASS", session: "CENTRE COURT", accent: "#f1dc7a" },
  clay: { id: "clay", name: "Paris", surface: "Clay court", short: "PARIS CLAY", session: "EVENING SESSION", accent: "#8de7f1" },
  desert: { ...hard, id: "desert", name: "Dubai Desert", short: "DUBAI DESERT", session: "DUNE COURT", accent: "#f2c08a", destination: true },
  beach: { ...hard, id: "beach", name: "Tropical Beach", short: "TROPICAL BEACH", session: "OCEANSIDE COURT", accent: "#91e7de", destination: true },
  moon: { ...hard, id: "moon", name: "The Moon", short: "THE MOON", session: "EARTH GRAVITY · APOLLO SUITS", accent: "#cedbff", destination: true }
});
export const themeFor = (venue: string): VenueTheme => VENUE_THEMES[venue] ?? hard;

export interface MenuCourt { venue: string; city: string; surface: string; difficulty?: string; level?: string; destination?: boolean }
export const MENU_COURTS: readonly MenuCourt[] = Object.freeze([
  { venue: "hard", city: "NEW YORK", surface: "HARD COURT / NIGHT SESSION", difficulty: "beginner", level: "EASY" },
  { venue: "grass", city: "LONDON", surface: "GRASS COURT / CENTRE COURT", difficulty: "club", level: "CLUB" },
  { venue: "clay", city: "PARIS", surface: "CLAY COURT / EVENING SESSION", difficulty: "pro", level: "ACE" },
  { venue: "desert", city: "DUBAI DESERT", surface: "HARD COURT / AMONG THE DUNES", destination: true },
  { venue: "beach", city: "TROPICAL BEACH", surface: "HARD COURT / OCEANFRONT", destination: true },
  { venue: "moon", city: "THE MOON", surface: "LUNAR COURT / LUNAR LANDSCAPE", destination: true }
]);
