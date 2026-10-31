import type { VenueId } from "../contract/venues";

export interface VenuePalette {
  name: string;
  court: string;
  alley: string;
  apron: string;
  ground: string;
  background: string;
  seat: string;
  trim: string;
}

export const VENUE_PALETTES: Record<string, VenuePalette> = {
  hard: {
    name: "NEW YORK HARD",
    court: "#2b678e",
    alley: "#24597a",
    apron: "#3b7d65",
    ground: "#1d3847",
    background: "#0d2230",
    seat: "#1f4e69",
    trim: "#d8ff3e"
  },
  grass: {
    name: "LONDON GRASS",
    court: "#4d8a54",
    alley: "#447b4b",
    apron: "#3c6f43",
    ground: "#2c5433",
    background: "#16301d",
    seat: "#295238",
    trim: "#f3f0dc"
  },
  clay: {
    name: "PARIS CLAY",
    court: "#c4653f",
    alley: "#b35935",
    apron: "#9e4d2d",
    ground: "#6e3823",
    background: "#2e1a12",
    seat: "#675b4c",
    trim: "#e1d4b7"
  },
  desert: {
    name: "DUBAI DESERT",
    court: "#427f82",
    alley: "#397476",
    apron: "#ac8b6b",
    ground: "#c49e78",
    background: "#2b2118",
    seat: "#a88b59",
    trim: "#ede0c5"
  },
  beach: {
    name: "TROPICAL BEACH",
    court: "#367e98",
    alley: "#306f88",
    apron: "#c4b89c",
    ground: "#d4c5a7",
    background: "#123a47",
    seat: "#2b7a8c",
    trim: "#f0e5d3"
  },
  moon: {
    name: "LUNAR COURT",
    court: "#5b6f82",
    alley: "#4e6173",
    apron: "#747a7e",
    ground: "#52575c",
    background: "#050911",
    seat: "#4b5563",
    trim: "#e5e7eb"
  }
};


export function venueKey(venue: string | undefined | null): VenueId {
  return (venue && VENUE_PALETTES[venue] ? venue : "hard") as VenueId;
}

export function isMoonVenue(venue: string | undefined | null): boolean {
  return venue === "moon";
}
