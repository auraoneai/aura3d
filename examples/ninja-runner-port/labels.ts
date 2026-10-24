/** Player-facing copy. Original names are replaced with generic ones; the simulation's ids (`base`, `sage`, `kurama`, `rasengan`, ...) are unchanged. */
import type { Form } from "./sim";

export const TITLE = "SHADOWSTEP GAUNTLET";

export const FORM_LABEL: Readonly<Record<Form, string>> = { base: "Lantern Runner", sage: "Sunfire Form", kurama: "Ember Spirit Form" };
export const FORM_SHORT: Readonly<Record<Form, string>> = { base: "Runner", sage: "Sunfire", kurama: "Ember" };

export const ABILITY_LABEL = { clones: "Echo clones", rasengan: "Spiral orb", dash: "Surge dash", rasenshuriken: "Gale star" } as const;

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
    case "unlock": return { title: "NEW FORM UNLOCKED", small: form === "sage" ? FORM_LABEL.sage : FORM_LABEL.kurama, seconds: 2.8 };
    case "form": return { title: "FORM SHIFT", small: FORM_LABEL[(form as Form) ?? "base"] ?? "", seconds: 1.5 };
    case "rasenshuriken": return { title: "GALE STAR", small: ABILITY_LABEL.rasenshuriken, seconds: 1.2 };
    case "dropWarning": return { title: "LOOK ABOVE", small: "A rival drops in", seconds: 1.4 };
    default: return null;
  }
}

export function resultCopy(won: boolean, falling: boolean): { label: string; title: string; copy: string } {
  if (won) return { label: "RUN COMPLETE", title: "The village is safe.", copy: "From the lantern gate to the valley falls." };
  return { label: "RUN REPORT", title: "The lanterns flicker.", copy: falling ? "Missed the jump. Jump before the edge to clear rooftop and branch gaps." : "Gather your spirit and go again." };
}
