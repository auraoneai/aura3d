export interface AuraClashPosterScenario {
  id: string;
  title: string;
  route: string;
  outputFile: string;
  composition: string;
  evidenceRole: "marketing" | "visual-quality" | "developer-proof" | "accessibility";
  captureKind: "poster" | "composition" | "proof";
  requiredElements: string[];
  evidenceRequirements: string[];
  reviewCriteria: string[];
  qaNotes: string[];
  humanApprovalRequired: boolean;
}

export const auraClashPosterScenarios: AuraClashPosterScenario[] = [
  {
    id: "hero-versus",
    title: "Hero versus",
    route: "/poster/?scenario=hero-versus",
    outputFile: "aura-clash-hero-versus.png",
    composition: "Wide launch hero with Mara Volt and Rook Atlas framed against the neon downtown arena.",
    evidenceRole: "marketing",
    captureKind: "poster",
    requiredElements: [
      "Aura Clash title lockup",
      "Two Quaternius-derived fighter GLBs",
      "Neon Downtown Arena typed scene",
      "GitHub and npm links visible in header",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "The two-fighter GLB claim must resolve to typed asset manifest entries for assets.fighterMaraVolt and assets.fighterRookAtlas.",
      "This shot can support marketing review but cannot mark human visual approval automatically.",
    ],
    reviewCriteria: [
      "Mara and Rook silhouettes separate from the arena and each other.",
      "The Quaternius-derived fighter style reads as one coherent art family.",
      "Lighting shows cyan/emerald rim contrast without washing out faces, feet, or the title lockup.",
    ],
    qaNotes: [
      "No cropped fighter heads or hidden feet.",
      "Scene must read as a fighting game within two seconds.",
      "The shot should be suitable for the homepage hero.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "match-start",
    title: "Match start composition",
    route: "/playable/?capture=match-start",
    outputFile: "aura-clash-match-start.png",
    composition: "Opening gameplay frame with both fighters grounded, HUD readable, stage depth visible, and no impact effects hiding silhouette.",
    evidenceRole: "visual-quality",
    captureKind: "composition",
    requiredElements: [
      "Both typed fighter GLBs visible",
      "Health, guard, meter, and timer HUD",
      "Combat lane and stage depth",
      "Lighting/material declaration or visible DOM review evidence",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "compositionEvidence must classify this as arena-establishing or fighter-readability evidence.",
      "visualReviewEvidence must include readable-fighters, HUD, stage-depth, and lighting-materials signals.",
    ],
    reviewCriteria: [
      "Both fighters stand on the same combat plane with readable feet/contact.",
      "HUD does not obscure heads, hands, feet, or the combat lane.",
      "The arena has foreground/midground/background separation, not a flat backdrop.",
    ],
    qaNotes: [
      "Do not accept a static title card as gameplay proof.",
      "Do not accept the frame if one fighter is offscreen or hidden behind UI.",
      "This composition supports review only; user approval remains a separate gate.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "combat-impact",
    title: "Combat impact composition",
    route: "/playable/?capture=combat-impact",
    outputFile: "aura-clash-combat-impact.png",
    composition: "Mid-combat hit frame with hit spark, readable attacker/defender poses, HUD state, and stage depth still visible.",
    evidenceRole: "visual-quality",
    captureKind: "composition",
    requiredElements: [
      "Attacker and defender visible",
      "Hit spark, trail, guard spark, or impact VFX",
      "HUD state reflecting combat",
      "Reduced-flash-compatible effect language",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "compositionEvidence must classify this as effects-hud-debug evidence.",
      "visualReviewEvidence must include effects, readable-fighters, HUD, and lighting-materials signals.",
    ],
    reviewCriteria: [
      "Impact VFX feels energetic without becoming a white rectangle or hiding the fighters.",
      "The defender reaction and attacker pose read as gameplay state, not decorative staging.",
      "Bloom and fog preserve contrast around silhouettes and HUD text.",
    ],
    qaNotes: [
      "Reduced flash mode needs a lower-intensity alternative.",
      "The shot should prove gameplay-driven effects, not only poster art.",
      "Do not mark this visually approved without human review.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "super-impact",
    title: "Super impact",
    route: "/poster/?scenario=super-impact",
    outputFile: "aura-clash-super-impact.png",
    composition: "Player special attack frame with visible meter, hit flash, and opponent hitstun.",
    evidenceRole: "visual-quality",
    captureKind: "composition",
    requiredElements: [
      "Special move state chip",
      "Readable health, guard, and meter bars",
      "Impact flash unless reduced flash is enabled",
      "Combat log line naming the action",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "compositionEvidence must classify this as effects-hud-debug evidence.",
      "visualReviewEvidence must include effects, HUD, readable-fighters, and lighting-materials signals.",
    ],
    reviewCriteria: [
      "The super frame has a clear focal point and readable fighter poses.",
      "Screen treatment feels premium while preserving HUD legibility.",
      "Material and rim-light contrast remain visible through the effect.",
    ],
    qaNotes: [
      "Impact should feel powerful without hiding the fighters.",
      "Reduced flash mode must have a lower-intensity alternative.",
      "The screenshot should prove the game is interactive, not a static render.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "super-result",
    title: "Super result composition",
    route: "/playable/?capture=super-result",
    outputFile: "aura-clash-super-result.png",
    composition: "Post-super/result frame with round result, meter outcome, readable fighters, and the stage still composed for a marketing screenshot.",
    evidenceRole: "visual-quality",
    captureKind: "composition",
    requiredElements: [
      "Round result or super outcome UI",
      "Both fighters or clear winner/defender aftermath",
      "HUD state after the super",
      "Lighting/material contrast visible after screen treatment",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "compositionEvidence must count this toward the three-composition visual review package.",
      "visualReviewEvidence must include HUD, readable-fighters, stage-depth, and lighting-materials signals.",
    ],
    reviewCriteria: [
      "The result state feels like a fighting game payoff, not a plain modal.",
      "The winner/loser relationship is visually obvious.",
      "The composition remains useful for launch review at desktop and mobile crop sizes.",
    ],
    qaNotes: [
      "Do not crop the result UI into the fighters.",
      "Do not let bloom/fog erase the post-super material palette.",
      "Human approval remains required even if machine evidence passes.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "six-fighter-roster",
    title: "Six fighter roster",
    route: "/poster/?scenario=six-fighter-roster",
    outputFile: "aura-clash-six-fighter-roster.png",
    composition: "Character select panel showing all six original fighters and their signature moves.",
    evidenceRole: "marketing",
    captureKind: "poster",
    requiredElements: [
      "Mara Volt",
      "Rook Atlas",
      "Nyx Vale",
      "Kade Ember",
      "Sable Iron",
      "Jin Flux",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "The roster should only claim typed GLB readiness where source manifests expose matching typed asset keys.",
      "This capture cannot approve individual fighter visual validation without runtime/browser evidence.",
    ],
    reviewCriteria: [
      "Every fighter card communicates a distinct silhouette, role, palette, and special.",
      "No real-person parody or public-figure likeness direction remains.",
      "The selected and disabled states are legible without relying only on color.",
    ],
    qaNotes: [
      "Every card needs a distinct silhouette and role.",
      "The selected state must be obvious.",
      "The roster should communicate original IP, not real-person parody.",
    ],
    humanApprovalRequired: true,
  },
  {
    id: "developer-proof",
    title: "Developer proof",
    route: "/evidence/?scenario=developer-proof",
    outputFile: "aura-clash-developer-proof.png",
    composition: "Evidence route showing typed assets, Quaternius provenance, routes, tests, and acceptance gates.",
    evidenceRole: "developer-proof",
    captureKind: "proof",
    requiredElements: [
      "Typed asset list",
      "Provenance references",
      "Route checklist",
      "Acceptance gate statuses",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "Incomplete visual QA and approval gates must remain visible as incomplete.",
      "The evidence route must not substitute source manifests for browser visual approval.",
    ],
    reviewCriteria: [
      "Typed asset and Quaternius provenance proof is readable on a laptop screenshot.",
      "Evidence copy separates source contracts, machine checks, deployment proof, and human visual approval.",
      "No unchecked gate is hidden below the fold in the default viewport.",
    ],
    qaNotes: [
      "This shot should prove Aura3D is doing real typed asset work.",
      "Do not bury incomplete visual QA status.",
      "The layout must be readable on a laptop screenshot.",
    ],
    humanApprovalRequired: false,
  },
  {
    id: "accessibility-proof",
    title: "Accessibility proof",
    route: "/accessibility/?scenario=accessibility-proof",
    outputFile: "aura-clash-accessibility-proof.png",
    composition: "Accessibility route with reduced motion, reduced flash, and high contrast controls visible.",
    evidenceRole: "accessibility",
    captureKind: "proof",
    requiredElements: [
      "Reduced motion control",
      "Reduced flash control",
      "High contrast control",
      "Text-backed combat state",
    ],
    evidenceRequirements: [
      "Capture metadata must include imageEvidence.nonblank=true.",
      "Controls must be visible as source evidence for accessibility review.",
      "Accessibility proof does not replace combat visual quality or screenshot approval.",
    ],
    reviewCriteria: [
      "Reduced motion, reduced flash, and high contrast states are understandable from the capture.",
      "High contrast mode preserves Aura Clash brand identity and HUD readability.",
      "Keyboard-only play guidance remains visible in the proof screenshot.",
    ],
    qaNotes: [
      "Accessibility controls should look integrated, not bolted on.",
      "High contrast mode should remain visually branded.",
      "Controls must be clear enough for documentation screenshots.",
    ],
    humanApprovalRequired: false,
  },
];

export function getAuraClashPosterScenario(id: string | null): AuraClashPosterScenario {
  return auraClashPosterScenarios.find((scenario) => scenario.id === id) ?? auraClashPosterScenarios[0]!;
}
