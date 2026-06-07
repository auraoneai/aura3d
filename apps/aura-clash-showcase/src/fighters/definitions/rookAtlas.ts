import {
  fighterAssetReference,
  type AuraClashFighterDefinition
} from "../FighterDefinition";

export const rookAtlas = {
  id: "rook",
  name: "Rook Atlas",
  metadata: {
    slot: 2,
    callsign: "Concrete breaker",
    title: "Heavy grappler",
    slug: "rook-atlas",
    rosterGroup: "Aura Clash Originals",
    role: "original playable fighter",
    archetype: "Armor frames, throws, guard crushes",
    designPillar:
      "Readable heavy fighter with slow commitments, strong guard damage, and high silhouette weight."
  },
  asset: fighterAssetReference("rook", "fighter-rook-atlas"),
  stats: {
    maxHealth: 100,
    maxGuard: 100,
    startingMeter: 28,
    meterCap: 100,
    attack: 92,
    defense: 88,
    speed: 48,
    technique: 58,
    range: 63,
    guardPressure: 94,
    meterBuild: 72,
    weight: 96
  },
  comboTuning: {
    maxPracticalHits: 5,
    hitConfirmWindowMs: 260,
    cancelWindowMs: 120,
    resetWindowMs: 920,
    baseDamageScaling: [1, 0.94, 0.82, 0.68, 0.56],
    hitstunDecayPerHit: 0.05,
    guardPressureDecayPerHit: 0.03,
    meterGainMultiplier: 0.96,
    routes: [
      {
        id: "rook.slab-check",
        label: "Slab Check",
        starter: "light",
        sequence: ["light", "heavy", "special"],
        targetDamage: 39,
        meterSwing: 8,
        difficulty: "starter",
        notes: "Short confirm with large impact text and high guard pressure."
      },
      {
        id: "rook.breaker-wall",
        label: "Breaker Wall",
        starter: "guard",
        sequence: ["guard", "heavy", "special"],
        targetDamage: 42,
        meterSwing: 6,
        difficulty: "standard",
        notes: "Uses armor-style guard to absorb a rival poke before a concrete breaker punish."
      },
      {
        id: "rook.corner-quake",
        label: "Corner Quake",
        starter: "dash",
        sequence: ["dash", "heavy", "heavy", "special"],
        targetDamage: 51,
        meterSwing: 2,
        difficulty: "advanced",
        notes: "Slow route for showcase AI windows; should be powerful but interruptible."
      }
    ]
  },
  visualProfile: {
    palette: {
      displayName: "Amber / cobalt",
      primary: "#2D2418",
      secondary: "#1D4ED8",
      accent: "#F59E0B",
      aura: "#60A5FA",
      hud: "#FFD166"
    },
    silhouette: [
      "Wide shoulders",
      "Braced low stance",
      "Large glove blocks",
      "Heavy boot plant"
    ],
    materials: [
      "dark concrete armor plates",
      "cobalt shoulder enamel",
      "amber fracture lines",
      "dusty contact shadows"
    ],
    motifs: [
      "atlas grid cracks",
      "impact slabs",
      "weight rings",
      "cobalt anchor sparks"
    ],
    idlePose:
      "Plants both boots, rolls the shoulders, and cracks amber lines through the floor.",
    introPose:
      "Raises one fist as a slab-light column locks behind the fighter.",
    victoryPose:
      "Sets a glove down like a pillar while amber cracks settle into a crown shape.",
    portrait: {
      camera: "Wide low-angle grappler frame",
      background: "Cobalt concrete wall with amber fissures",
      expression: "Calm and immovable"
    },
    vfx: {
      aura: "Dense amber glow under the boots",
      trail: "Short cobalt dust puffs on movement",
      impact: "Chunky amber crack decals and ring shockwaves",
      guard: "Cobalt slab shield with visible stress lines",
      signature: "Atlas Breaker floor quake with amber slab uplift"
    }
  },
  moveKit: {
    archetype: "Armor frames, throws, guard crushes",
    combatStyleTags: ["heavy", "grappler", "guard-crush", "armor"],
    baseAttacks: {
      light: {
        id: "rook.stone-check",
        name: "Stone Check",
        input: "light",
        kind: "strike",
        range: "close",
        description: "A compact palm check with enough weight to stop reckless entry.",
        gameplayNote: "Slower than Mara's light but stronger on guard.",
        accessibilityCue: "Clear single impact and guard chip feedback.",
        vfxMotifs: ["amber chip", "cobalt dust"],
        frame: { startupMs: 100, activeMs: 90, recoveryMs: 170, cooldownMs: 50 },
        hit: {
          damage: 9,
          guardDamage: 12,
          meterGain: 6,
          meterCost: 0,
          stunMs: 220,
          pushback: 4.2,
          launch: 0.1,
          hitAdvantageMs: 80,
          blockAdvantageMs: -40,
          cancellableInto: ["heavy", "special"],
          comboTags: ["starter", "armor-check"]
        }
      },
      heavy: {
        id: "rook.foundation-slam",
        name: "Foundation Slam",
        input: "heavy",
        kind: "grapple",
        range: "mid",
        description: "A two-hand overhead slam that chews through guard.",
        gameplayNote: "Rook's core threat; huge guard damage with obvious startup.",
        accessibilityCue: "Long anticipation frame gives players a readable response window.",
        vfxMotifs: ["floor crack", "amber slab"],
        frame: { startupMs: 210, activeMs: 130, recoveryMs: 330, cooldownMs: 80 },
        hit: {
          damage: 17,
          guardDamage: 29,
          meterGain: 8,
          meterCost: 0,
          stunMs: 420,
          pushback: 6.8,
          launch: 1.6,
          hitAdvantageMs: 130,
          blockAdvantageMs: -130,
          cancellableInto: ["special"],
          comboTags: ["heavy", "guard-crush", "knockdown"]
        }
      },
      guard: {
        id: "rook.slab-guard",
        name: "Slab Guard",
        input: "guard",
        kind: "guard",
        range: "close",
        description: "A cobalt slab flashes in front of Rook and absorbs pressure.",
        gameplayNote: "Best guard durability on the launch roster.",
        accessibilityCue: "Guard state uses a large geometry cue and HUD text.",
        vfxMotifs: ["cobalt slab", "amber stress line"],
        frame: { startupMs: 60, activeMs: 320, recoveryMs: 150, cooldownMs: 110 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 5,
          meterCost: 0,
          stunMs: 0,
          pushback: 2.2,
          launch: 0,
          hitAdvantageMs: 50,
          blockAdvantageMs: 120,
          cancellableInto: ["heavy"],
          comboTags: ["guard", "armor", "counter-ready"]
        }
      },
      dash: {
        id: "rook.anchor-step",
        name: "Anchor Step",
        input: "dash",
        kind: "movement",
        range: "mid",
        description: "A short armored step that trades speed for position security.",
        gameplayNote: "Shorter dash distance but stronger post-dash heavy threat.",
        accessibilityCue: "Reduced-motion mode keeps the weight ring but removes shake.",
        vfxMotifs: ["weight ring", "dust puff"],
        frame: { startupMs: 80, activeMs: 130, recoveryMs: 190, cooldownMs: 150 },
        hit: {
          damage: 0,
          guardDamage: 0,
          meterGain: 3,
          meterCost: 0,
          stunMs: 0,
          pushback: 0,
          launch: 0,
          hitAdvantageMs: 0,
          blockAdvantageMs: 0,
          cancellableInto: ["heavy", "guard"],
          comboTags: ["movement", "armor-step"]
        }
      }
    },
    signature: {
      id: "rook.atlas-breaker",
      name: "Atlas Breaker",
      input: "special",
      kind: "areaControl",
      range: "mid",
      description: "A ground-breaking slam that sends an amber crack wave across the lane.",
      gameplayNote: "High damage Aura Burst with the strongest guard break tuning.",
      accessibilityCue: "Combat log and slab-wave silhouette communicate the hit without relying on flash.",
      vfxMotifs: ["amber quake", "cobalt slab uplift", "shock ring"],
      frame: { startupMs: 260, activeMs: 180, recoveryMs: 380, cooldownMs: 220 },
      hit: {
        damage: 28,
        guardDamage: 42,
        meterGain: 0,
        meterCost: 35,
        stunMs: 540,
        pushback: 9.2,
        launch: 2.4,
        hitAdvantageMs: 170,
        blockAdvantageMs: -120,
        cancellableInto: [],
        comboTags: ["special", "guard-break", "finisher"]
      }
    }
  },
  routeTags: ["playable", "evidence", "accessibility", "poster", "home"],
  contentNotes: [
    {
      rule: "original-ip",
      note: "Rook Atlas is an original arcade grappler, not a real-person likeness."
    },
    {
      rule: "typed-asset",
      note: "Use fighter.asset.typedAssetMember, which resolves to a final Aura Clash release rig in the generated typed asset manifest."
    },
    {
      rule: "non-lethal-arcade",
      note: "Concrete impacts are stylized slab-light VFX with no realistic injury detail."
    }
  ]
} as const satisfies AuraClashFighterDefinition;
