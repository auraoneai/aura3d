import { Geometry } from "../Geometry";
import { UnlitMaterial } from "../UnlitMaterial";
import type { RenderItem } from "../ForwardPass";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicGlowCard {
  readonly id: string;
  readonly targetId: string;
  readonly color: readonly [number, number, number, number];
  readonly radiusMeters: number;
}

export interface CinematicGlowCardSystem {
  readonly id: string;
  readonly cards: readonly CinematicGlowCard[];
  readonly renderItems: readonly RenderItem[];
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createGlowCardSystem(cards: readonly CinematicGlowCard[], id = "cinematic-glow-cards"): CinematicGlowCardSystem {
  return {
    id,
    cards,
    renderItems: cards.map((card) => ({
      label: card.id,
      geometry: Geometry.litCube(card.radiusMeters),
      material: new UnlitMaterial({
        name: `cinematic/glow-card/${card.id}`,
        color: card.color,
        renderState: { blend: true, depthWrite: false, cullMode: "none" }
      }),
      includeInAutoFrame: false
    })),
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `vfx:${id}`,
      feature: "vfx",
      label: "Glow card system",
      source: "renderer-vfx",
      diagnostics: ["Glow cards are renderer transparent geometry; DOM halos do not count."]
    }),
    diagnostics: [`Compiled ${cards.length} renderer glow cards.`]
  };
}
