// Aura FC 3D — content catalog: 6 pitches + 8 clubs + circuit fillers.
//
// Look contract (art-direction §sports/table → `interior-industrial`): the
// look preset stays fixed for every venue; venue identity comes from
// re-tinting pitch/ground/hoarding/crowd materials and toggling dressing
// (cage walls, mow stripes, the aurora dome), mirroring how
// VENUE_PALETTES works in showcase-top-tennis.

import type { ClubId, VenueId } from "./types";

export interface VenueSpec {
  readonly id: VenueId;
  readonly label: string;          // venue banner text
  readonly short: string;          // top-bar button label
  readonly tagline: string;
  // surface / palette
  readonly ground: string;         // outer ground plane
  readonly apron: string;          // run-off apron
  readonly pitch: string;          // main playing surface
  readonly pitchAlt: string;       // mow-stripe / panel alternate
  readonly line: string;
  readonly hoarding: string;
  readonly accent: string;
  readonly crowdWarm: boolean;
  readonly night: boolean;
  // dressing flags
  readonly walled: boolean;        // Favela Cage — ball bounces off walls
  readonly wallColor: string;
  readonly stripes: boolean;       // grass mow stripes
  readonly dome: boolean;          // Glacier Arena habitat dome
  readonly standCount: number;     // bleacher tiers (0 = no bowl)
  readonly floodColor: string;
  readonly aurora: boolean;        // aurora ribbons in the sky
}

export const VENUES: Record<VenueId, VenueSpec> = {
  favela: {
    id: "favela",
    label: "FAVELA CAGE",
    short: "Favela",
    tagline: "Walled cage — the ball never goes out",
    ground: "#5c4a38", apron: "#4a3c2e", pitch: "#7d6a4e", pitchAlt: "#756347",
    line: "#f7ead0", hoarding: "#3d2f22", accent: "#ff9a3d",
    crowdWarm: true, night: true,
    walled: true, wallColor: "#4d5661", stripes: false, dome: false,
    standCount: 0, floodColor: "#ffd9a8", aurora: false
  },
  munich: {
    id: "munich",
    label: "MUNICH FLOODLIGHT",
    short: "Munich",
    tagline: "Broadcast night — striped grass under the towers",
    ground: "#1d2b22", apron: "#223428", pitch: "#2f7a3d", pitchAlt: "#2a6f38",
    line: "#f7f5ea", hoarding: "#0e2b46", accent: "#d8ff3e",
    crowdWarm: false, night: true,
    walled: false, wallColor: "#2a3138", stripes: true, dome: false,
    standCount: 4, floodColor: "#cfe8ff", aurora: false
  },
  lagos: {
    id: "lagos",
    label: "LAGOS BEACH",
    short: "Lagos",
    tagline: "Sunset sand — bare feet and ocean light",
    ground: "#8a6f4d", apron: "#b39a63", pitch: "#d9bc82", pitchAlt: "#d0b277",
    line: "#fff6e2", hoarding: "#0f4a5c", accent: "#ff9a3d",
    crowdWarm: true, night: false,
    walled: false, wallColor: "#6b5a3e", stripes: false, dome: false,
    standCount: 2, floodColor: "#ffcf9e", aurora: false
  },
  kyoto: {
    id: "kyoto",
    label: "KYOTO NIGHT",
    short: "Kyoto",
    tagline: "Neon hoardings under lantern light",
    ground: "#141826", apron: "#1b2030", pitch: "#253347", pitchAlt: "#212e40",
    line: "#e8ecff", hoarding: "#141826", accent: "#ff5fa2",
    crowdWarm: false, night: true,
    walled: false, wallColor: "#232c4d", stripes: false, dome: false,
    standCount: 3, floodColor: "#a8b8ff", aurora: false
  },
  uyuni: {
    id: "uyuni",
    label: "UYUNI SALT FLAT",
    short: "Uyuni",
    tagline: "Endless white — the mirror pitch",
    ground: "#cfd6dd", apron: "#dde3e8", pitch: "#eef2f4", pitchAlt: "#e6ebee",
    line: "#39434f", hoarding: "#8fa3b5", accent: "#4dd8ff",
    crowdWarm: false, night: false,
    walled: false, wallColor: "#aeb9c4", stripes: false, dome: false,
    standCount: 0, floodColor: "#f4f8ff", aurora: false
  },
  glacier: {
    id: "glacier",
    label: "GLACIER ARENA",
    short: "Glacier",
    tagline: "Aurora over ice — the exotic final",
    ground: "#14202e", apron: "#1c3040", pitch: "#3d6a8a", pitchAlt: "#376180",
    line: "#eaf6ff", hoarding: "#12202e", accent: "#7fe8c9",
    crowdWarm: false, night: true,
    walled: false, wallColor: "#274050", stripes: false, dome: true,
    standCount: 4, floodColor: "#bfe8ff", aurora: true
  }
};

export const VENUE_ORDER: readonly VenueId[] = ["favela", "munich", "lagos", "kyoto", "uyuni", "glacier"];

export interface ClubSpec {
  readonly id: ClubId;
  readonly name: string;
  readonly short: string;         // 3-letter score tag
  readonly primary: string;       // jersey
  readonly secondary: string;     // shorts
  readonly socks: string;
  readonly keeper: string;        // keeper jersey
  readonly trim: string;          // ring/boot accent default
  readonly style: string;         // identity blurb
  readonly press: number;         // 0..1 base press aggression
}

export const CLUBS: Record<ClubId, ClubSpec> = {
  aurora:  { id: "aurora",  name: "Aurora FC",      short: "AUR", primary: "#d8ff3e", secondary: "#0b1f1c", socks: "#d8ff3e", keeper: "#7dfcff", trim: "#d8ff3e", style: "Tiki-press — short triangles, high press", press: 0.75 },
  kings:   { id: "kings",   name: "Favela Kings",   short: "FVK", primary: "#ff7a2e", secondary: "#123f3a", socks: "#ff7a2e", keeper: "#aef15a", trim: "#ffd76a", style: "Flair first — skill moves and lobs",       press: 0.55 },
  iron:    { id: "iron",    name: "Munich Iron",    short: "MUN", primary: "#d2342e", secondary: "#14161c", socks: "#14161c", keeper: "#f2e63d", trim: "#d2342e", style: "Direct press — fast vertical balls",       press: 0.85 },
  waves:   { id: "waves",   name: "Lagos Waves",    short: "LAG", primary: "#2e9ac4", secondary: "#f2f0e2", socks: "#f2f0e2", keeper: "#ff9a3d", trim: "#7dfcff", style: "Counters — soak then break wide",          press: 0.45 },
  kites:   { id: "kites",   name: "Kyoto Kites",    short: "KYO", primary: "#ff5fa2", secondary: "#1b2030", socks: "#ff5fa2", keeper: "#4de8ff", trim: "#ff5fa2", style: "Possession — patience, late runners",      press: 0.5 },
  stars:   { id: "stars",   name: "Uyuni Stars",    short: "UYU", primary: "#eef2f4", secondary: "#39434f", socks: "#39434f", keeper: "#ff5fa2", trim: "#4dd8ff", style: "Long ball — early switches to the striker",press: 0.4 },
  giants:  { id: "giants",  name: "Glacier Giants", short: "GLA", primary: "#7fe8c9", secondary: "#12202e", socks: "#12202e", keeper: "#ffd76a", trim: "#7fe8c9", style: "Physical — boxes, second balls, muscle",   press: 0.7 },
  storm:   { id: "storm",   name: "Sahara Storm",   short: "SAH", primary: "#ffd76a", secondary: "#5c2430", socks: "#ffd76a", keeper: "#4de8ff", trim: "#ff9a3d", style: "Balanced — mid block, quick release",      press: 0.6 }
};

export const CLUB_ORDER: readonly ClubId[] = ["aurora", "kings", "iron", "waves", "kites", "stars", "giants", "storm"];

interface FillerTeam {
  readonly name: string;
  readonly short: string;
  readonly primary: string;
  readonly secondary: string;
}

// 24 extra circuit entrants so the World Circuit bracket fields 32 teams.
// Colors are deterministic pairs from a muted broadcast palette.
const FILLER_NAMES: readonly [string, string][] = [
  ["Lisbon Mariners", "LIS"], ["Quito Altitude", "QUI"], ["Dakar Drums", "DAK"],
  ["Oslo Fjord", "OSL"], ["Busan Tigers", "BUS"], ["Lima Cordillera", "LIM"],
  ["Rabat Lions", "RAB"], ["Hanoi Lanterns", "HAN"], ["Turin Granite", "TUR"],
  ["Nairobi Acacia", "NAI"], ["Sofia Steel", "SOF"], ["Manila Tide", "MAN"],
  ["Porto Douro", "POR"], ["Cusco Condors", "CUS"], ["Accra Gold", "ACC"],
  ["Bergen Rain", "BER"], ["Daegu Metro", "DAE"], ["Valencia Orange", "VAL"],
  ["Fes Medina", "FES"], ["Danube Rapids", "DAN"], ["Cape Peninsula", "CAP"],
  ["Jakarta Monsoon", "JAK"], ["Thames Royals", "THA"], ["Andes Pumas", "AND"]
];

const FILLER_COLORS: readonly [string, string][] = [
  ["#3d5a80", "#f2f0e2"], ["#8a4b2e", "#ffd76a"], ["#2c6e49", "#f2f0e2"],
  ["#7a8ba8", "#14161c"], ["#c4526a", "#14161c"], ["#4a7a9e", "#f7f5ea"],
  ["#9e4a3d", "#f2f0e2"], ["#5c6e2e", "#ffd76a"], ["#6e5a8a", "#f2f0e2"],
  ["#3d8a7a", "#14161c"], ["#a8563c", "#f7f5ea"], ["#2e5c8a", "#d8ff3e"],
  ["#8a2e4d", "#f2f0e2"], ["#4d6e9e", "#ffd76a"], ["#6e8a3d", "#14161c"],
  ["#54708c", "#f7f5ea"], ["#b05c3d", "#14161c"], ["#3d7a5c", "#f2f0e2"],
  ["#8a6e2e", "#14161c"], ["#4a3d8a", "#f2f0e2"], ["#2e7a8a", "#ffd76a"],
  ["#7a2e3d", "#f7f5ea"], ["#5c8a4d", "#14161c"], ["#8a5c7a", "#f2f0e2"]
];

export const FILLER_TEAMS: readonly FillerTeam[] = FILLER_NAMES.map(([name, short], i) => ({
  name,
  short,
  primary: FILLER_COLORS[i % FILLER_COLORS.length][0],
  secondary: FILLER_COLORS[i % FILLER_COLORS.length][1]
}));

/** A circuit entrant is either a real club or a filler squad (kit colors only). */
export interface CircuitEntrant {
  readonly name: string;
  readonly short: string;
  readonly primary: string;
  readonly secondary: string;
  readonly club: ClubId | null;   // null → filler
}

export function circuitEntrants(userClub: ClubId): CircuitEntrant[] {
  const clubs: CircuitEntrant[] = CLUB_ORDER.map((id) => ({
    name: CLUBS[id].name, short: CLUBS[id].short,
    primary: CLUBS[id].primary, secondary: CLUBS[id].secondary,
    club: id
  }));
  const fillers: CircuitEntrant[] = FILLER_TEAMS.map((f) => ({
    name: f.name, short: f.short, primary: f.primary, secondary: f.secondary, club: null
  }));
  const all = [...clubs, ...fillers];
  // Deterministic order with the user's club pinned to slot 0.
  const user = all.find((e) => e.club === userClub)!;
  const rest = all.filter((e) => e.club !== userClub);
  // stable shuffle
  let seed = 0x9e3779b9;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [user, ...rest];
}
