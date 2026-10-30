/** Player-facing copy. Original names are replaced with generic ones; the simulation's ids (`base`, `sage`, `beast`, `spiralorb`, ...) are unchanged. */
import type { EnemyKind, Form } from "./sim";

export const TITLE = "SHADOWSTEP GAUNTLET";

export const FORM_LABEL: Readonly<Record<Form, string>> = { base: "Lantern Runner", sage: "Sunfire Form", beast: "Ember Spirit Form" };
export const FORM_SHORT: Readonly<Record<Form, string>> = { base: "Runner", sage: "Sunfire", beast: "Ember" };

export const ABILITY_LABEL = { clones: "Echo clones", spiralorb: "Spiral orb", dash: "Surge dash", spiralstar: "Gale star" } as const;

export const CONTROLS: readonly (readonly [string, string])[] = [
  ["A / D or arrows", "change lane"], ["W / Up", "jump"], ["S / Down", "slide"], ["1", "echo clones"], ["2", "spiral orb"],
  ["3", "gale star"], ["Shift", "surge dash"], ["Space", "cycle form"], ["Esc", "pause"], ["M", "mute"]
];

export function districtLabel(s: number): string {
  return s < 160 ? "Lantern Village" : s < 470 ? "The Backstreets" : s < 1120 ? "Rooftop Run" : s < 1510 ? "River Crossing" : s < 2260 ? "Whispering Forest" : "Valley Gate";
}

export interface Announcement { readonly title: string; readonly small: string; readonly seconds: number }

export function announcement(type: string, form?: string): Announcement | null {
  switch (type) {
    case "unlock": return { title: "NEW FORM UNLOCKED", small: form === "sage" ? FORM_LABEL.sage : FORM_LABEL.beast, seconds: 2.8 };
    case "form": return { title: "FORM SHIFT", small: FORM_LABEL[(form as Form) ?? "base"] ?? "", seconds: 1.5 };
    case "spiralstar": return { title: "GALE STAR", small: ABILITY_LABEL.spiralstar, seconds: 1.2 };
    case "dropWarning": return { title: "LOOK ABOVE", small: "A rival drops in", seconds: 1.4 };
    default: return null;
  }
}

/**
 * How to beat each enemy, shown the first time one of its kind charges. Every rival in this course charges along its lane
 * (`sim.ts` `approach`; the ranged-attack path is never reached because all hostiles approach), and the contact rule in
 * `stepSim` lets the hero pass by changing lane, jumping high or sliding, or strike first with the orb or a surge dash.
 * The guardian has two hit points: the first strike only knocks it back.
 */
export const ENEMY_HINT: Readonly<Record<EnemyKind, Announcement>> = {
  scout: { title: "FOX SCOUT", small: "Change lane, jump or slide past it, or strike first with the spiral orb", seconds: 1.6 },
  swordsman: { title: "HAWK SWORDSMAN", small: "Strike first with the spiral orb or a surge dash, or change lane", seconds: 1.6 },
  caster: { title: "OWL CASTER", small: "Slide or jump past it, or strike first with the spiral orb", seconds: 1.6 },
  heavy: { title: "BOAR GUARDIAN", small: "Takes two hits: strike twice, or change lane", seconds: 1.8 }
};

/** The objective line on the title card. */
export const OBJECTIVE = "Reach the Valley Gate, 2,640 m.";

export function resultCopy(won: boolean, falling: boolean): { label: string; title: string; copy: string } {
  if (won) return { label: "RUN COMPLETE", title: "The village is safe.", copy: "From the lantern gate to the valley falls." };
  return { label: "RUN REPORT", title: "The lanterns flicker.", copy: falling ? "Missed the jump. Jump before the edge to clear rooftop and branch gaps." : "Gather your spirit and go again." };
}

/** GU47 NR-19: one vermilion seal per district on the ink-scroll progress bar (index.html `#progress > em[data-seal]`). */
export const DISTRICT_SEALS: readonly { readonly at: number; readonly letter: string; readonly district: string }[] = [
  { at: 0, letter: "V", district: "Lantern Village" },
  { at: 470, letter: "R", district: "Rooftop Run" },
  { at: 1120, letter: "C", district: "River Crossing" },
  { at: 1510, letter: "F", district: "Whispering Forest" },
  { at: 2260, letter: "G", district: "Valley Gate" }
];
